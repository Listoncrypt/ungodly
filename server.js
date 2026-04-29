const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');
const cors = require('cors');

// Debug: Check environment variables at the very start
console.log('=== ENVIRONMENT CHECK ===');
console.log('TWITTER_CLIENT_ID:', process.env.TWITTER_CLIENT_ID ? 'Set' : 'Not set');
console.log('TWITTER_CLIENT_SECRET:', process.env.TWITTER_CLIENT_SECRET ? 'Set' : 'Not set');
console.log('TWITTER_REDIRECT_URI:', process.env.TWITTER_REDIRECT_URI);
console.log('========================');

// Read .env.server file manually (for local development only)
// Only read from file if environment variables are not already set (i.e., local development)
const envPath = path.join(__dirname, '.env.server');
if (fs.existsSync(envPath) && !process.env.TWITTER_CLIENT_ID) {
  console.log('Loading environment variables from .env.server file...');
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
  console.log('Environment variables loaded from .env.server');
}

const app = express();
const port = 3001;

// CORS: Allow requests from your Vercel frontend
app.use(cors({
  origin: ['https://ungodly.vercel.app', 'http://localhost:4200', 'http://localhost:4300'],
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Twitter OAuth credentials from environment variables
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI;

console.log('=== FINAL CONFIGURATION ===');
console.log('Twitter Client ID:', TWITTER_CLIENT_ID ? 'Set' : 'Not set');
console.log('Twitter Client Secret:', TWITTER_CLIENT_SECRET ? 'Set' : 'Not set');
console.log('Twitter Redirect URI:', TWITTER_REDIRECT_URI);
console.log('===========================');

if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
  console.error('ERROR: TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be set');
  process.exit(1);
}

if (!TWITTER_REDIRECT_URI) {
  console.error('ERROR: TWITTER_REDIRECT_URI must be set');
  process.exit(1);
}

// Store for OAuth state and code verifier (in production, use Redis or database)
const oauthStates = new Map();
const codeVerifiers = new Map();

// Generate random state for OAuth security
function generateState() {
  return crypto.randomBytes(16).toString('hex');
}

// Generate code verifier and code challenge for PKCE
function generatePKCE() {
  const verifier = crypto.randomBytes(32).toString('base64url');
  const challenge = crypto.createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

// Step 1: Initiate Twitter OAuth
app.get('/api/auth/twitter', (req, res) => {
  const callbackURL = req.query.callbackURL || 'http://localhost:4200/auth/twitter/callback';
  const userId = req.query.userId; // Capture Supabase userId if provided
  const state = generateState();
  const { verifier, challenge } = generatePKCE();

  // Store the callback URL, code verifier, and userId with the state
  oauthStates.set(state, { callbackURL, userId });
  codeVerifiers.set(state, verifier);

  console.log('Generated state:', state);
  console.log('Stored callback URL:', callbackURL);
  console.log('Associated userId:', userId || 'none');

  // Redirect to Twitter OAuth 2.0 authorization URL with PKCE
  // Added 'like.read' scope to verify likes
  const twitterAuthUrl = `https://twitter.com/i/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${TWITTER_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(TWITTER_REDIRECT_URI)}&` +
    `scope=users.read%20tweet.read%20like.read%20offline.access&` +
    `state=${state}&` +
    `code_challenge=${challenge}&` +
    `code_challenge_method=S256`;

  console.log('Redirecting to Twitter OAuth with scopes: users.read tweet.read like.read offline.access');
  res.redirect(twitterAuthUrl);
});

// Step 2: Token exchange endpoint
app.get('/api/auth/callback/twitter', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  console.log('Twitter callback received:', { code: !!code, state: !!state, error, error_description });
  
  const stateData = oauthStates.get(state);
  const codeVerifier = codeVerifiers.get(state);
  
  if (error) {
    console.error('Twitter OAuth error:', error, error_description);
    const callbackURL = stateData?.callbackURL || 'http://localhost:4200/auth/twitter/callback';
    const redirectUrl = new URL(callbackURL);
    redirectUrl.searchParams.set('error', error_description || error);
    redirectUrl.searchParams.set('success', 'false');
    redirectUrl.searchParams.set('twitter_success', 'false');
    oauthStates.delete(state);
    codeVerifiers.delete(state);
    return res.redirect(redirectUrl.toString());
  }
  
  if (!code || !state) {
    console.error('Missing code or state');
    return res.status(400).json({ error: 'Missing code or state' });
  }
  
  if (!stateData) {
    console.error('Invalid state');
    return res.status(400).json({ error: 'Invalid state' });
  }
  
  const { callbackURL, userId } = stateData;

  if (!codeVerifier) {
    console.error('Missing code verifier');
    return res.status(400).json({ error: 'Missing code verifier' });
  }
  
  try {
    // Exchange authorization code for access token using PKCE
    console.log('Exchanging authorization code for access token...');
    const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: code,
        redirect_uri: TWITTER_REDIRECT_URI,
        code_verifier: codeVerifier
      })
    });
    
    const tokenData = await tokenResponse.json();
    
    if (tokenData.error) {
      console.error('Token exchange error:', tokenData);
      throw new Error(tokenData.error_description || tokenData.error);
    }
    
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = tokenData.expires_in;

    console.log('Access token obtained successfully. Expires in:', expiresIn);
    
    // Fetch user data with public_metrics
    console.log('Fetching user data with public_metrics...');
    const userResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics,verified', {
      headers: {
        'Authorization': `Bearer ${accessToken}`
      }
    });
    
    const userData = await userResponse.json();
    
    if (userData.error) {
      console.error('User data fetch error:', userData);
      throw new Error(userData.error?.message || 'Failed to get user data');
    }
    
    const followersCount = userData.data?.public_metrics?.followers_count || 0;
    const isVerified = userData.data?.verified || false;
    const twitterHandle = userData.data?.username || '';
    const twitterUserId = userData.data?.id;

    console.log('User data:', { twitterHandle, followersCount, isVerified, twitterUserId });

    // Success: Redirect back to frontend
    const redirectUrl = new URL(callbackURL);
    redirectUrl.searchParams.set('twitter_handle', twitterHandle);
    redirectUrl.searchParams.set('followers_count', followersCount.toString());
    redirectUrl.searchParams.set('is_verified', isVerified.toString());
    redirectUrl.searchParams.set('success', 'true');
    redirectUrl.searchParams.set('twitter_success', 'true'); // For SignupComponent compatibility
    redirectUrl.searchParams.set('access_token', accessToken);
    if (refreshToken) redirectUrl.searchParams.set('refresh_token', refreshToken);
    redirectUrl.searchParams.set('twitter_user_id', twitterUserId);
    if (userId) redirectUrl.searchParams.set('supabase_user_id', userId);

    console.log('Redirecting back with successful connection');
    res.redirect(redirectUrl.toString());
    
  } catch (error) {
    console.error('OAuth flow error:', error);
    const redirectUrl = new URL(callbackURL);
    redirectUrl.searchParams.set('error', error.message);
    redirectUrl.searchParams.set('success', 'false');
    redirectUrl.searchParams.set('twitter_success', 'false');
    res.redirect(redirectUrl.toString());
  } finally {
    oauthStates.delete(state);
    codeVerifiers.delete(state);
  }
});

// Helper to refresh Twitter access token
async function refreshTwitterToken(refreshToken) {
  try {
    const response = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': 'Basic ' + Buffer.from(`${TWITTER_CLIENT_ID}:${TWITTER_CLIENT_SECRET}`).toString('base64')
      },
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: TWITTER_CLIENT_ID
      })
    });

    const data = await response.json();
    if (data.error) throw new Error(data.error_description || data.error);
    return data;
  } catch (error) {
    console.error('Token refresh failed:', error);
    return null;
  }
}

// Store engagement timestamps: when a user clicks "Engage on X"
const engagementTimestamps = new Map();

// Record that a user started engaging with a tweet
app.post('/api/record-engagement', (req, res) => {
  const { tweetId, userId } = req.body;
  if (!tweetId || !userId) {
    return res.status(400).json({ error: 'Missing tweetId or userId' });
  }
  const key = `${userId}:${tweetId}`;
  engagementTimestamps.set(key, Date.now());
  console.log(`Recorded engagement start for ${key}`);
  return res.json({ recorded: true });
});

// Endpoint to verify if user actually engaged with a tweet
app.post('/api/verify-engagement', async (req, res) => {
  try {
    let { accessToken, refreshToken, tweetId, userId } = req.body;

    if (!accessToken || !tweetId || !userId) {
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    console.log('Verifying engagement for tweet:', tweetId, 'by user:', userId);

    // Method 1: Try Twitter API v2 (requires Basic tier)
    const verifyViaAPI = async (token) => {
      try {
        // Check if user liked the tweet
        const likedResponse = await fetch(`https://api.twitter.com/2/users/${userId}/liked_tweets?max_results=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('Liked tweets API status:', likedResponse.status);

        if (likedResponse.status === 401 && refreshToken) {
          return { retry: true };
        }

        // 403 means Free tier - fall through to fallback
        if (likedResponse.status === 403) {
          console.log('Twitter API returned 403 - Free tier detected, using fallback');
          return { fallback: true };
        }

        if (likedResponse.ok) {
          const likedData = await likedResponse.json();
          const liked = likedData.data?.some(tweet => tweet.id === tweetId);
          if (liked) return { verified: true, method: 'like' };
        }

        // Check if user retweeted
        const tweetsResponse = await fetch(`https://api.twitter.com/2/users/${userId}/tweets?max_results=100&tweet.fields=referenced_tweets`, {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('User tweets API status:', tweetsResponse.status);

        if (tweetsResponse.status === 403) {
          return { fallback: true };
        }

        if (tweetsResponse.ok) {
          const tweetsData = await tweetsResponse.json();
          const retweeted = tweetsData.data?.some(tweet =>
            tweet.referenced_tweets?.some(ref => ref.type === 'retweeted' && ref.id === tweetId)
          );
          if (retweeted) return { verified: true, method: 'retweet' };
        }

        return { verified: false };
      } catch (apiError) {
        console.error('Twitter API error:', apiError.message);
        return { fallback: true };
      }
    };

    // Method 2: Fallback - verify user has valid session + clicked engage
    // This works on Free tier by confirming the user:
    //   1. Has a valid Twitter OAuth session (proves they own an X account)
    //   2. Clicked "Engage on X" (proves they were sent to the tweet)
    //   3. Waited enough time to actually perform the action
    const verifyViaFallback = async (token) => {
      try {
        // Step 1: Confirm the access token is still valid by calling /2/users/me
        const meResponse = await fetch('https://api.twitter.com/2/users/me', {
          headers: { 'Authorization': `Bearer ${token}` }
        });

        console.log('User /me API status:', meResponse.status);

        if (meResponse.status === 401 && refreshToken) {
          return { retry: true };
        }

        if (!meResponse.ok) {
          console.log('Failed to verify user identity');
          return { verified: false, reason: 'invalid_token' };
        }

        const meData = await meResponse.json();
        console.log('Verified user identity:', meData.data?.username);

        // Step 2: Check they clicked "Engage on X" (timestamp recorded)
        const key = `${userId}:${tweetId}`;
        const engageTime = engagementTimestamps.get(key);

        if (!engageTime) {
          console.log('No engagement timestamp found - user did not click Engage on X');
          return { verified: false, reason: 'no_engagement_click' };
        }

        // Step 3: Ensure at least 10 seconds passed (time to actually like/retweet)
        const elapsed = Date.now() - engageTime;
        const MIN_ENGAGE_TIME = 10000; // 10 seconds

        if (elapsed < MIN_ENGAGE_TIME) {
          console.log(`Only ${elapsed}ms elapsed. Need at least ${MIN_ENGAGE_TIME}ms`);
          return { verified: false, reason: 'too_fast' };
        }

        console.log(`Fallback verification passed: valid session + ${elapsed}ms elapsed`);
        // Clean up the timestamp
        engagementTimestamps.delete(key);
        return { verified: true, method: 'session_verified' };
      } catch (fallbackError) {
        console.error('Fallback verification error:', fallbackError.message);
        return { verified: false };
      }
    };

    // Try API method first
    let result = await verifyViaAPI(accessToken);

    // Handle token refresh
    if (result.retry) {
      console.log('Access token expired, attempting refresh...');
      const newTokenData = await refreshTwitterToken(refreshToken);
      if (newTokenData) {
        console.log('Token refreshed successfully');
        accessToken = newTokenData.access_token;
        refreshToken = newTokenData.refresh_token;
        result = await verifyViaAPI(accessToken);
        if (!result.fallback && !result.retry) {
          result.newTokens = { accessToken, refreshToken };
        }
      } else {
        return res.status(401).json({ error: 'Session expired and refresh failed' });
      }
    }

    // If API method requires paid tier, use fallback
    if (result.fallback) {
      console.log('Using fallback verification method...');
      result = await verifyViaFallback(accessToken);

      // Handle refresh in fallback too
      if (result.retry) {
        const newTokenData = await refreshTwitterToken(refreshToken);
        if (newTokenData) {
          accessToken = newTokenData.access_token;
          refreshToken = newTokenData.refresh_token;
          result = await verifyViaFallback(accessToken);
          result.newTokens = { accessToken, refreshToken };
        } else {
          return res.status(401).json({ error: 'Session expired and refresh failed' });
        }
      }
    }

    console.log('Verification result:', JSON.stringify(result));
    return res.json(result);

  } catch (error) {
    console.error('Verification error:', error);
    return res.status(500).json({ error: 'Verification failed', details: error.message });
  }
});

app.listen(port, () => {
  console.log(`Twitter OAuth server running at http://localhost:${port}`);
  console.log(`Callback URL: ${TWITTER_REDIRECT_URI}`);
});
