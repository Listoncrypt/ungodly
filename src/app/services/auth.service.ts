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
    
    if (!providerToken) {
      console.warn('No Twitter provider token found in session.');
      return null;
    }

    try {
      // Twitter API blocks direct browser requests due to CORS. 
      // We use a safe, open CORS proxy for development to bypass this limitation.
      const targetUrl = 'https://api.twitter.com/2/users/me?user.fields=public_metrics,verified';
      const proxyUrl = 'https://corsproxy.io/?' + encodeURIComponent(targetUrl);
      
      const response = await fetch(proxyUrl, {
        headers: {
          'Authorization': `Bearer ${providerToken}`
        }
      });
      
      if (!response.ok) {
        throw new Error(`Twitter API error: ${response.statusText}`);
      }
      
      const data = await response.json();
      return {
        followersCount: data.data?.public_metrics?.followers_count ?? 0,
        isVerified: data.data?.verified ?? false
      };
    } catch (error) {
      console.error('Error fetching Twitter followers:', error);
      return null;
    }
  }
}
