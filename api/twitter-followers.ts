import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  console.log('--- DEBUG START: Twitter Follower Check ---');

  // 1. Check Auth Header
  const authHeader = req.headers['authorization'];
  const accessToken = authHeader?.replace('Bearer ', '').trim();
  
  if (!accessToken) {
    console.error('ERROR: No access token provided in header');
    return res.status(401).json({ error: 'Missing token' });
  }

  // 2. Setup Supabase Admin
  const supabase = createClient(
    process.env['SUPABASE_URL'] || '',
    process.env['SUPABASE_SERVICE_ROLE_KEY'] || ''
  );

  try {
    // 3. Extract the Session / User
    const { data: { user }, error: userError } = await supabase.auth.getUser(accessToken);
    
    // TASK 3: Extract and Log the Token
    // Note: In Supabase, the provider_token is passed via the query param from the frontend 
    // because it's not stored in the user object itself on the server side easily.
    const providerToken = req.query['provider_token'] as string;

    console.log('ACTIVE USER ID:', user?.id);
    console.log('TWITTER PROVIDER TOKEN:', providerToken ? 'PRESENT (First 10 chars: ' + providerToken.substring(0, 10) + '...)' : 'MISSING');

    if (!providerToken) {
      return res.status(400).json({ error: 'provider_token is missing' });
    }

    // TASK 4: Log the Fetch Error
    console.log('Initiating Twitter API Fetch...');
    const twitterRes = await fetch('https://api.twitter.com/2/users/me?user.fields=public_metrics,verified', {
      headers: { 'Authorization': `Bearer ${providerToken}` }
    });

    if (!twitterRes.ok) {
      const errorBody = await twitterRes.json().catch(() => ({}));
      console.error('TWITTER API ERROR STATUS:', twitterRes.status);
      console.error('TWITTER API ERROR BODY:', JSON.stringify(errorBody));
      return res.status(twitterRes.status).json({ 
        error: 'Twitter API failed', 
        status: twitterRes.status,
        details: errorBody 
      });
    }

    const data = await twitterRes.json();
    console.log('TWITTER SUCCESS RESPONSE:', JSON.stringify(data));

    return res.status(200).json({
      followersCount: data.data?.public_metrics?.followers_count || 0,
      isVerified: data.data?.verified || false
    });

  } catch (err: any) {
    console.error('FATAL SERVER ERROR:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
