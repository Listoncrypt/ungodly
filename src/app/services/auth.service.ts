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
      provider: 'x',
      options: {
        redirectTo: `${window.location.origin}/auth/twitter/callback`,
        scopes: 'users.read tweet.read'
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
    const { data: { session } } = await this.supabaseService.client.auth.getSession();
    const providerToken = session?.provider_token;
    const userMetadata = session?.user?.user_metadata;

    console.log('Session metadata:', userMetadata);
    
    // Check various possible metadata paths for follower count
    const getFollowersFromMetadata = () => {
      // Check standard Supabase/Twitter metadata paths
      const paths = [
        userMetadata?.['followers_count'],
        userMetadata?.['public_metrics']?.['followers_count'],
        userMetadata?.['data']?.['public_metrics']?.['followers_count'],
        userMetadata?.['user_metadata']?.['followers_count']
      ];
      return paths.find(p => p !== undefined);
    };

    const getVerifiedFromMetadata = () => {
      const paths = [
        userMetadata?.['verified'],
        userMetadata?.['data']?.['verified'],
        userMetadata?.['user_metadata']?.['verified']
      ];
      return paths.find(p => p !== undefined) || false;
    };

    const metadataFollowers = getFollowersFromMetadata();
    
    // If we already have the data in metadata, use it immediately! 
    // This avoids CORS/Proxy issues entirely.
    if (metadataFollowers !== undefined && metadataFollowers >= 1000) {
      console.log('Using follower count from metadata:', metadataFollowers);
      return {
        followersCount: metadataFollowers,
        isVerified: getVerifiedFromMetadata()
      };
    }

    if (!providerToken) {
      console.warn('No Twitter provider token found in session.');
      if (metadataFollowers !== undefined) {
        return {
          followersCount: metadataFollowers,
          isVerified: getVerifiedFromMetadata()
        };
      }
      return null;
    }

    try {
      const targetUrl = 'https://api.twitter.com/2/users/me?user.fields=public_metrics,verified';
      
      // Try fetching with a different proxy if the first one fails
      const proxies = [
        (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
        (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`
      ];

      for (const getProxyUrl of proxies) {
        try {
          const proxyUrl = getProxyUrl(targetUrl);
          console.log(`Attempting fetch via proxy: ${proxyUrl}`);
          
          const response = await fetch(proxyUrl, {
            headers: {
              'Authorization': `Bearer ${providerToken}`
            }
          });
          
          if (!response.ok) continue;

          let data;
          const text = await response.text();
          try {
            const json = JSON.parse(text);
            // AllOrigins wraps the response in a "contents" field
            data = json.contents ? JSON.parse(json.contents) : json;
          } catch (e) {
            continue;
          }

          if (data?.data?.public_metrics?.followers_count !== undefined) {
            return {
              followersCount: data.data.public_metrics.followers_count,
              isVerified: data.data.verified || false
            };
          }
        } catch (e) {
          console.error('Proxy attempt failed:', e);
        }
      }
      
      // Final fallback to metadata if all proxies fail
      if (metadataFollowers !== undefined) {
        return {
          followersCount: metadataFollowers,
          isVerified: getVerifiedFromMetadata()
        };
      }
      return null;
    } catch (error) {
      console.error('Final error in getTwitterFollowers:', error);
      if (metadataFollowers !== undefined) {
        return {
          followersCount: metadataFollowers,
          isVerified: getVerifiedFromMetadata()
        };
      }
      return null;
    }
  }
}
