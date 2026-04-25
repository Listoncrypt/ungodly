import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of, combineLatest } from 'rxjs';
import { map, switchMap, catchError, filter } from 'rxjs/operators';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';

export interface User {
  id: string;
  email: string;
  twitterHandle?: string;
  twitterId?: string;
  verified?: boolean;
  boost?: number;
  balance?: number;
  role?: string;
  is_approved?: boolean;
  followersCount?: number;
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private currentUserSubject = new BehaviorSubject<User | null>(null);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(private supabaseService: SupabaseService, private router: Router) {
    // Merge currentUser and currentProfile to create the app's User object
    combineLatest([
      this.supabaseService.currentUser$,
      this.supabaseService.currentProfile$
    ]).subscribe(([supabaseUser, profile]) => {
      if (supabaseUser) {
        // Extract Twitter info if it exists
        const twitterIdentity = supabaseUser.identities?.find(id => id.provider === 'twitter' || id.provider === 'x');
        const twitterHandle = twitterIdentity?.identity_data?.['preferred_username'] || supabaseUser.user_metadata?.['user_name'];
        const twitterId = twitterIdentity?.id || supabaseUser.user_metadata?.['provider_id'];

        const user: User = {
          id: supabaseUser.id,
          email: supabaseUser.email || '',
          role: profile?.role || 'user',
          is_approved: profile?.is_approved || false,
          verified: profile?.is_approved || false,
          twitterHandle: twitterHandle,
          twitterId: twitterId
        };
        this.currentUserSubject.next(user);
        localStorage.setItem('currentUser', JSON.stringify(user));
      } else {
        this.currentUserSubject.next(null);
        localStorage.removeItem('currentUser');
      }
    });
  }

  isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  getCurrentUser(): User | null {
    return this.currentUserSubject.value;
  }

  login(email: string, password: string): Observable<User> {
    return from(this.supabaseService.client.auth.signInWithPassword({ email, password })).pipe(
      map(response => {
        if (response.error) throw response.error;
        // Wait for currentProfile$ to update the subject
        return this.currentUserSubject.value as User;
      })
    );
  }

  signup(email: string, password: string): Observable<User> {
    const hasSession = !!this.currentUserSubject.value;
    const request = hasSession 
      ? this.supabaseService.client.auth.updateUser({ email, password })
      : this.supabaseService.client.auth.signUp({ email, password });

    return from(request).pipe(
      map(response => {
        if (response.error) throw response.error;
        return { id: response.data.user?.id || '', email: response.data.user?.email || '' } as User;
      })
    );
  }

  resetPassword(email: string): Observable<void> {
    return from(this.supabaseService.client.auth.resetPasswordForEmail(email)).pipe(
      map(response => {
        if (response.error) throw response.error;
      })
    );
  }

  async initiateTwitterAuth(): Promise<void> {
    const { error } = await this.supabaseService.client.auth.signInWithOAuth({
      provider: 'twitter',
      options: {
        redirectTo: `${window.location.origin}/auth/twitter/callback`,
        scopes: 'users.read tweet.read',
        queryParams: {
          prompt: 'consent'
        }
      }
    });
    if (error) console.error('Error with Twitter Auth', error);
  }

  exchangeCodeForToken(code: string): Observable<User> {
    // Supabase handles the callback automatically on the client side when redirecting to a page.
    // We just need to check the session.
    return from(this.supabaseService.client.auth.getSession()).pipe(
      map(response => {
        if (response.error) throw response.error;
        if (!response.data.session) throw new Error('No session');
        return this.currentUserSubject.value as User;
      })
    );
  }

  signupWithTwitter(): Observable<User> {
    return this.exchangeCodeForToken('');
  }

  updateUser(user: User): void {
    this.currentUserSubject.next(user);
  }

  logout(redirect: boolean = true): Promise<void> {
    return this.supabaseService.client.auth.signOut().then(() => {
      this.currentUserSubject.next(null);
      localStorage.removeItem('currentUser');
      if (redirect) {
        this.router.navigate(['/login']);
      }
    });
  }

  async getTwitterFollowers(): Promise<{ followersCount: number, isVerified: boolean } | null> {
    const { data: { session }, error: sessionError } = await this.supabaseService.client.auth.getSession();
    if (sessionError || !session) {
      console.warn('DEBUG: No active session found.');
      return null;
    }

    // DEBUG: Log everything for inspection
    console.log('DEBUG: Full session object:', JSON.stringify(session));

    // RECURSIVE DEEP SEARCH FUNCTION
    const findValueDeep = (obj: any, targetKeys: string[]): any => {
      if (!obj || typeof obj !== 'object') return undefined;
      
      for (const key of targetKeys) {
        if (obj[key] !== undefined) return obj[key];
      }

      for (const key in obj) {
        if (typeof obj[key] === 'object' && obj[key] !== null) {
          const result = findValueDeep(obj[key], targetKeys);
          if (result !== undefined) return result;
        }
      }
      return undefined;
    };

    // 1. GET SCREEN NAME (Username)
    const screenName = findValueDeep(session, ['preferred_username', 'user_name', 'screen_name', 'username']);
    console.log('DEBUG: Found screen name:', screenName);

    // 2. TRY DEEP SEARCH FOR FOLLOWERS
    const followersKeys = ['followers_count', 'followers', 'follower_count'];
    let followers = findValueDeep(session, followersKeys);
    
    // Check public_metrics specifically
    if (followers === undefined && session.user?.user_metadata?.public_metrics?.followers_count !== undefined) {
      followers = session.user.user_metadata.public_metrics.followers_count;
    }

    const verified = findValueDeep(session, ['verified']) === true || findValueDeep(session, ['verified']) === 'true';

    if (followers !== undefined) {
      console.log('DEBUG: Found followers via session deep search:', followers);
      return { followersCount: Number(followers), isVerified: verified };
    }

    // 3. TRY FRESH USER FETCH + DEEP SEARCH
    const { data: { user: freshUser } } = await this.supabaseService.client.auth.getUser();
    const freshFollowers = findValueDeep(freshUser, followersKeys);
    if (freshFollowers !== undefined) {
      console.log('DEBUG: Found followers via fresh user deep search:', freshFollowers);
      return { followersCount: Number(freshFollowers), isVerified: verified };
    }

    // 4. THE "100% WORK" ALTERNATIVE: Public Syndication API (No Auth Required)
    if (screenName) {
      console.log('DEBUG: Attempting Public Syndication fallback for:', screenName);
      try {
        // This is a public Twitter endpoint for their follow buttons
        const syndicationUrl = `https://cdn.syndication.twimg.com/widgets/followbutton/info.json?screen_name=${screenName}`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(syndicationUrl)}`;
        
        const response = await fetch(proxyUrl);
        if (response.ok) {
          const json = await response.json();
          if (json.contents) {
            const data = JSON.parse(json.contents);
            // This API returns an array of objects
            const userData = Array.isArray(data) ? data[0] : data;
            if (userData && userData.followers_count !== undefined) {
              console.log('DEBUG: Found followers via Public Syndication:', userData.followers_count);
              return { 
                followersCount: Number(userData.followers_count), 
                isVerified: userData.verified || false 
              };
            }
          }
        }
      } catch (e) {
        console.error('DEBUG: Public Syndication fallback failed', e);
      }
    }

    // 5. API FALLBACK WITH TOKEN
    const providerToken = session?.provider_token;
    if (providerToken) {
      console.log('DEBUG: Attempting direct API fallback...');
      const targetUrl = 'https://api.twitter.com/2/users/me?user.fields=public_metrics,verified';
      try {
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(targetUrl)}`;
        const response = await fetch(proxyUrl, {
          headers: { 'Authorization': `Bearer ${providerToken}` }
        });
        if (response.ok) {
          const json = await response.json();
          if (json.contents) {
            const data = JSON.parse(json.contents);
            const apiFollowers = data?.data?.public_metrics?.followers_count;
            if (apiFollowers !== undefined) {
              return { followersCount: Number(apiFollowers), isVerified: data?.data?.verified || false };
            }
          }
        }
      } catch (e) {
        console.error('DEBUG: API Token fallback failed', e);
      }
    }

    // 6. LAST RESORT: Check for ANY number > 100 in metadata
    const metadata = freshUser?.user_metadata || session.user?.user_metadata || {};
    for (const key in metadata) {
      const val = metadata[key];
      const num = Number(val);
      if (!isNaN(num) && num > 100 && (key.toLowerCase().includes('count') || key.toLowerCase().includes('followers'))) {
        return { followersCount: num, isVerified: false };
      }
    }

    return null;
  }
}
