import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, from, of, combineLatest } from 'rxjs';
import { map, switchMap, catchError, filter } from 'rxjs/operators';
import { Router } from '@angular/router';
import { SupabaseService } from './supabase.service';
import { environment } from '../../environments/environment';

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
  private currentUserSubject = new BehaviorSubject<User | null | undefined>(undefined);
  public currentUser$ = this.currentUserSubject.asObservable();

  constructor(public supabaseService: SupabaseService, private router: Router) {
    // Merge currentUser and currentProfile to create the app's User object
    combineLatest([
      this.supabaseService.currentUser$,
      this.supabaseService.currentProfile$
    ]).subscribe(([supabaseUser, profile]) => {
      // 1. Still loading initial session
      if (supabaseUser === undefined) {
        return;
      }

      // 2. Definitely unauthenticated
      if (supabaseUser === null) {
        this.currentUserSubject.next(null);
        localStorage.removeItem('currentUser');
        return;
      }

      // 3. Authenticated - Wait for profile to avoid role-flicker or premature guard rejection
      if (profile === undefined) {
        return;
      }

      // 4. Authenticated & Profile Loaded
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
    });
  }

  isAuthenticated(): boolean {
    return !!this.currentUserSubject.value;
  }

  getCurrentUser(): User | null | undefined {
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
    return from(this.supabaseService.adminSignup(email, password)).pipe(
      switchMap(response => {
        // After admin creation, sign them in normally
        return from(this.supabaseService.client.auth.signInWithPassword({ email, password }));
      }),
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
    // Redirect to backend Twitter OAuth endpoint
    const callbackURL = `${window.location.origin}/auth/twitter/callback`;
    window.location.href = `${environment.backendUrl}/api/auth/twitter?callbackURL=${encodeURIComponent(callbackURL)}`;
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
    // Since backend is Supabase, try to get Twitter handle from user metadata
    const user = this.getCurrentUser();
    const handle = user?.twitterHandle;
    
    if (handle) {
      return await this.verifyFollowersByHandle(handle);
    }

    return null;
  }

  /**
   * 100% Reliable verification method using public Twitter syndication.
   * Works without OAuth permissions if we have a handle.
   */
  async verifyFollowersByHandle(handle: string): Promise<{ followersCount: number, isVerified: boolean } | null> {
    const cleanHandle = handle.startsWith('@') ? handle.substring(1) : handle;
    
    try {
      // Call Supabase Edge Function for server-side verification
      const { data, error } = await this.supabaseService.client.functions.invoke('verify-twitter', {
        body: { handle: cleanHandle }
      });
      
      if (error) {
        console.error('Edge function error:', error);
        return null;
      }
      
      if (data && data.followersCount !== undefined) {
        return {
          followersCount: data.followersCount,
          isVerified: data.isVerified || false
        };
      }
      
      return null;
    } catch (e) {
      console.error('Verification failed:', e);
      return null;
    }
  }
}
