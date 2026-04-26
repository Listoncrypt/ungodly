import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

serve(async (req) => {
  const { handle } = await req.json()
  
  if (!handle) {
    return new Response(JSON.stringify({ error: 'Handle is required' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    })
  }

  const cleanHandle = handle.startsWith('@') ? handle.substring(1) : handle
  
  try {
    // Try multiple methods to get follower count
    let followersCount = 0
    let isVerified = false
    
    // Method 1: Try Twitter syndication API directly (server-side, no CORS)
    try {
      const syndicationUrl = `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_name=${cleanHandle}`
      const response = await fetch(syndicationUrl)
      
      if (response.ok) {
        const data = await response.json()
        const userData = Array.isArray(data) ? data[0] : data
        
        if (userData && userData.followers_count !== undefined) {
          followersCount = Number(userData.followers_count)
          isVerified = !!userData.verified
        }
      }
    } catch (e) {
      console.log('Syndication API failed:', e)
    }
    
    // Method 2: Try Nitter instances if syndication fails
    if (followersCount === 0) {
      const nitterInstances = [
        `https://nitter.net/${cleanHandle}`,
        `https://nitter.poast.org/${cleanHandle}`,
        `https://nitter.fdn.fr/${cleanHandle}`
      ]
      
      for (const instance of nitterInstances) {
        try {
          const response = await fetch(instance)
          if (response.ok) {
            const html = await response.text()
            const followersMatch = html.match(/followers["\s:]+([0-9,]+)/i)
            const verifiedMatch = html.match(/verified/i)
            
            if (followersMatch) {
              followersCount = parseInt(followersMatch[1].replace(/,/g, ''))
              isVerified = !!verifiedMatch
              break
            }
          }
        } catch (e) {
          console.log(`Nitter instance failed: ${instance}`)
        }
      }
    }
    
    if (followersCount === 0) {
      return new Response(JSON.stringify({ 
        error: 'Could not verify Twitter account. Please ensure your profile is public.' 
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      })
    }
    
    return new Response(JSON.stringify({
      followersCount,
      isVerified,
      handle: cleanHandle
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
    
  } catch (error) {
    return new Response(JSON.stringify({ 
      error: 'Verification failed. Please try again.' 
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
})
