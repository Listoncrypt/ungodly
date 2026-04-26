import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

/**
 * Vercel Serverless Function: GET /api/twitter-followers
 *
 * Called by the Angular frontend after a user authenticates with X/Twitter via Supabase OAuth.
 * This runs server-side to avoid CORS restrictions when calling the Twitter API.
 *
 * Required Vercel environment variables:
 *   SUPABASE_URL              — Your Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY — Your Supabase service role key (NOT the anon key)
 *
 * The client must send the user's Supabase access token in the Authorization header:
 *   Authorization: Bearer <supabase_access_token>
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers — allow the Angular app origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // 1. Extract Supabase access token from request
  const authHeader = req.headers['authorization'];
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid Authorization header' });
  }
  const accessToken = authHeader.replace('Bearer ', '').trim();

  // 2. Validate environment variables
  const supabaseUrl = process.env['SUPABASE_URL'];
  const serviceRoleKey = process.env['SUPABASE_SERVICE_ROLE_KEY'];

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  // 3. Create Supabase admin client and look up the user's session to get the provider_token
  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  // Get user from the access token
  const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);
  if (userError || !user) {
    console.error('Failed to get user from token:', userError);
    return res.status(401).json({ error: 'Invalid or expired session' });
  }

  // 4. Retrieve the provider_token from the active session
  //    The service role can read sessions via the admin API
  const { data: sessionData, error: sessionError } = await (supabaseAdmin.auth as any).admin.getUserById(user.id);

  // provider_token lives on the session object returned to the client, not the admin user object.
  // We can't directly read it via admin API — but we CAN get the Twitter username from user_metadata
  // and then use the Twitter API v2 with the user's own token passed from the frontend.
  //
  // The frontend will pass `provider_token` as a query parameter (encrypted in transit via HTTPS).
  const providerToken = req.query['provider_token'] as string | undefined;
  
  // Also get screen name from user metadata as fallback identifier
  const userMetadata = user.user_metadata || {};
  const screenName: string | undefined =
    userMetadata['preferred_username'] ||
    userMetadata['user_name'] ||
    userMetadata['screen_name'] ||
    userMetadata['username'];

  if (!providerToken) {
    // No provider token — we cannot call Twitter API on the user's behalf
    // Return what we know from user_metadata (may have been set during OAuth)
    const metaFollowers =
      userMetadata['public_metrics']?.['followers_count'] ??
      userMetadata['followers_count'];

    if (metaFollowers !== undefined) {
      return res.status(200).json({
        followersCount: Number(metaFollowers),
        isVerified: userMetadata['verified'] === true || userMetadata['verified'] === 'true',
        source: 'user_metadata'
      });
    }

    return res.status(400).json({
      error: 'provider_token is required to fetch live follower count',
      screenName
    });
  }

  // 5. Call Twitter API v2 server-side — no CORS issues here
  try {
    const twitterRes = await fetch(
      'https://api.twitter.com/2/users/me?user.fields=public_metrics,verified,name,username',
      {
        headers: {
          Authorization: `Bearer ${providerToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    if (!twitterRes.ok) {
      const errorBody = await twitterRes.text();
      console.error('Twitter API error:', twitterRes.status, errorBody);

      // Token might be expired — tell the client to re-authenticate
      if (twitterRes.status === 401) {
        return res.status(401).json({ error: 'Twitter token expired. Please reconnect your X account.' });
      }

      return res.status(502).json({
        error: 'Twitter API request failed',
        twitterStatus: twitterRes.status
      });
    }

    const twitterData = await twitterRes.json();
    const twitterUser = twitterData?.data;

    if (!twitterUser) {
      return res.status(502).json({ error: 'Unexpected Twitter API response structure' });
    }

    const followersCount: number = twitterUser.public_metrics?.followers_count ?? 0;
    const isVerified: boolean = twitterUser.verified === true;

    return res.status(200).json({
      followersCount,
      isVerified,
      username: twitterUser.username,
      name: twitterUser.name,
      source: 'twitter_api_v2'
    });

  } catch (fetchError) {
    console.error('Unexpected error calling Twitter API:', fetchError);
    return res.status(500).json({ error: 'Internal server error while contacting Twitter API' });
  }
}
