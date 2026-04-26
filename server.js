const fs = require('fs');
const path = require('path');
const express = require('express');
const crypto = require('crypto');

// Read .env.server file manually
const envPath = path.join(__dirname, '.env.server');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  envContent.split('\n').forEach(line => {
    const [key, ...valueParts] = line.split('=');
    if (key && valueParts.length > 0) {
      process.env[key.trim()] = valueParts.join('=').trim();
    }
  });
}

const app = express();
const port = 3001;

app.use(express.json());

// Twitter OAuth credentials from environment variables
const TWITTER_CLIENT_ID = process.env.TWITTER_CLIENT_ID;
const TWITTER_CLIENT_SECRET = process.env.TWITTER_CLIENT_SECRET;
const TWITTER_REDIRECT_URI = process.env.TWITTER_REDIRECT_URI || 'http://localhost:3001/api/auth/callback/twitter';

if (!TWITTER_CLIENT_ID || !TWITTER_CLIENT_SECRET) {
  console.error('ERROR: TWITTER_CLIENT_ID and TWITTER_CLIENT_SECRET must be set in .env.server');
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
  const state = generateState();
  const { verifier, challenge } = generatePKCE();
  
  // Store the callback URL and code verifier with the state
  oauthStates.set(state, callbackURL);
  codeVerifiers.set(state, verifier);
  
  // Redirect to Twitter OAuth 2.0 authorization URL with PKCE
  const twitterAuthUrl = `https://twitter.com/i/oauth2/authorize?` +
    `response_type=code&` +
    `client_id=${TWITTER_CLIENT_ID}&` +
    `redirect_uri=${encodeURIComponent(TWITTER_REDIRECT_URI)}&` +
    `scope=users.read%20tweet.read&` +
    `state=${state}&` +
    `code_challenge=${challenge}&` +
    `code_challenge_method=S256`;
  
  console.log('Redirecting to Twitter OAuth with PKCE');
  res.redirect(twitterAuthUrl);
});

// Step 2: Token exchange endpoint
app.get('/api/auth/callback/twitter', async (req, res) => {
  const { code, state, error, error_description } = req.query;
  
  console.log('Twitter callback received:', { code: !!code, state: !!state, error, error_description });
  
  if (error) {
    console.error('Twitter OAuth error:', error, error_description);
    const callbackURL = oauthStates.get(state) || 'http://localhost:4200/auth/twitter/callback';
    const redirectUrl = new URL(callbackURL);
    redirectUrl.searchParams.set('error', error_description || error);
    redirectUrl.searchParams.set('success', 'false');
    oauthStates.delete(state);
    codeVerifiers.delete(state);
    return res.redirect(redirectUrl.toString());
  }
  
  if (!code || !state) {
    console.error('Missing code or state');
    return res.status(400).json({ error: 'Missing code or state' });
  }
  
  const callbackURL = oauthStates.get(state);
  const codeVerifier = codeVerifiers.get(state);
  
  if (!callbackURL) {
    console.error('Invalid state');
    return res.status(400).json({ error: 'Invalid state' });
  }
  
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
    console.log('Access token obtained successfully');
    
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
    
    console.log('User data:', { twitterHandle, followersCount, isVerified });
    
    // Verify follower count >= 1000
    if (followersCount < 1000) {
      console.log('Verification failed: User has less than 1000 followers');
      const redirectUrl = new URL(callbackURL);
      redirectUrl.searchParams.set('error', 'Verification failed: Minimum 1,000 followers required');
      redirectUrl.searchParams.set('followers_count', followersCount);
      redirectUrl.searchParams.set('success', 'false');
      oauthStates.delete(state);
      codeVerifiers.delete(state);
      return res.redirect(redirectUrl.toString());
    }
    
    // Success: Redirect back to frontend with user data
    console.log('Verification successful: User has 1000+ followers');
    const redirectUrl = new URL(callbackURL);
    redirectUrl.searchParams.set('twitter_handle', twitterHandle);
    redirectUrl.searchParams.set('followers_count', followersCount);
    redirectUrl.searchParams.set('is_verified', isVerified);
    redirectUrl.searchParams.set('success', 'true');
    
    res.redirect(redirectUrl.toString());
    
  } catch (error) {
    console.error('OAuth flow error:', error);
    const redirectUrl = new URL(callbackURL);
    redirectUrl.searchParams.set('error', error.message);
    redirectUrl.searchParams.set('success', 'false');
    res.redirect(redirectUrl.toString());
  } finally {
    oauthStates.delete(state);
    codeVerifiers.delete(state);
  }
});

app.listen(port, () => {
  console.log(`Twitter OAuth server running at http://localhost:${port}`);
  console.log(`Callback URL: ${TWITTER_REDIRECT_URI}`);
});
