import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { SupabaseService, PlatformTask } from '../../services/supabase.service';
import { environment } from '../../../environments/environment';
import { take } from 'rxjs/operators';



@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  username = 'user123';
  balance = 0.0;
  verified = false;
  isVerifiedAccount = false;
  hasTwitterSession = false;
  boost = 0;
  tasksComplete = 0;
  earnings = 0.0;
  withdrawals = 0.0;
  userWithdrawals: any[] = [];
  isAdmin = false;

  totalCreators = 0;
  totalPlatformEarnings = 0.0;

  engagementTasks: PlatformTask[] = [];

  withdrawalForm = {
    amount: 40,
    solanaAddress: '',
  };

  userInitial = 'X';
  private _observer: IntersectionObserver | null = null;

  constructor(
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    // Check if user returned from Twitter OAuth (reconnect flow)
    const params = new URLSearchParams(window.location.search);
    const twitterSuccess = params.get('success') === 'true';
    const error = params.get('error');

    console.log('[Dashboard] Checking OAuth callback params:', { twitterSuccess, error, params: Object.fromEntries(params) });

    if (twitterSuccess) {
      const accessToken = params.get('access_token');
      const refreshToken = params.get('refresh_token');
      const twitterUserId = params.get('twitter_user_id');
      const twitterHandle = params.get('twitter_handle');
      const followersCount = params.get('followers_count');
      const isVerified = params.get('is_verified') === 'true';

      console.log('[Dashboard] OAuth callback received:', { 
        accessToken: !!accessToken, 
        twitterUserId, 
        twitterHandle 
      });

      // 1. Store everything in localStorage (primary storage since DB columns are missing)
      if (accessToken) localStorage.setItem('twitter_access_token', accessToken);
      if (refreshToken) localStorage.setItem('twitter_refresh_token', refreshToken);
      if (twitterUserId) localStorage.setItem('twitter_user_id', twitterUserId);
      localStorage.setItem('is_twitter_verified', isVerified.toString());

      this.hasTwitterSession = !!accessToken;

      // 2. Update existing DB columns
      this.authService.currentUser$.pipe(take(1)).subscribe(async (currentUser: any) => {
        if (currentUser) {
          try {
            await this.supabase.updateProfile(currentUser.id, {
              twitter_handle: twitterHandle || undefined,
              twitter_followers: parseInt(followersCount || '0')
            });
            console.log('[Dashboard] Basic profile info updated in DB');
          } catch (err: any) {
            console.error('[Dashboard] DB update failed (expected if columns missing):', err.message);
          }
          
          alert('Twitter connected successfully!');
          // Clear query params and reload to clean up URL and properly initialize
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        }
      });
      return;
    }

    if (error) {
      alert('Twitter connection failed: ' + error);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    this.loadTasks();
    this.authService.currentUser$.subscribe(currentUser => {
      this.hasTwitterSession = !!localStorage.getItem('twitter_access_token');
      console.log('[Dashboard] hasTwitterSession:', this.hasTwitterSession);
      if (currentUser) {
        this.username = currentUser.email.split('@')[0];
        // Check for verified status from profile
        this.isVerifiedAccount = (currentUser as any).is_verified || false;
        this.verified = this.isVerifiedAccount;
        this.isAdmin = currentUser.role === 'admin';

        if (currentUser.balance !== undefined) {
          this.balance = currentUser.balance;
        }

        this.userInitial = this.username.charAt(0).toUpperCase();

        // Load withdrawal history
        this.loadUserWithdrawals(currentUser.id);

        // Subscribe to real-time withdrawal status updates
        this.supabase.client
          .channel(`withdrawals:user_id=eq.${currentUser.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'withdrawals',
            filter: `user_id=eq.${currentUser.id}`
          }, (payload: any) => {
            const updated = payload.new;
            const idx = this.userWithdrawals.findIndex((w: any) => w.id === updated.id);
            if (idx !== -1) {
              this.userWithdrawals[idx] = updated;
            }
          })
          .subscribe();
      }
    });

    this.supabase.getPlatformStats().then(stats => {
      this.totalCreators = stats.totalCreators;
      this.totalPlatformEarnings = stats.totalEarnings;
    });
  }

  ngAfterViewInit(): void {
    setTimeout(() => this.initScrollObserver(), 100);
  }

  ngOnDestroy(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  private initScrollObserver() {
    const options = { root: null, rootMargin: '0px', threshold: 0.1 };
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add('is-visible');
        }
      });
    }, options);

    document.querySelectorAll('.reveal-section').forEach((el) => {
      this._observer?.observe(el);
    });
  }

  async loadUserWithdrawals(userId: string) {
    try {
      this.userWithdrawals = await this.supabase.getUserWithdrawals(userId);
      this.withdrawals = this.userWithdrawals.reduce((sum: number, w: any) => sum + (w.amount || 0), 0);
    } catch (error) {
      console.error('Failed to load withdrawals:', error);
    }
  }

  verifyingTaskId: string | null = null;

  async loadTasks() {
    try {
      this.engagementTasks = await this.supabase.getTasks();
    } catch (error) {
      console.error('Failed to load tasks', error);
    }
  }

  engageOnX(task: PlatformTask) {
    console.log('Opening X (Twitter)...', task.post_link);
    window.open(task.post_link || 'https://x.com', '_blank');
    this.verifyingTaskId = task.id;

    // Record engagement start time on the backend for verification
    const tweetId = this.extractTweetId(task.post_link || '');
    const twitterUserId = localStorage.getItem('twitter_user_id');
    if (tweetId && twitterUserId) {
      fetch(`${environment.backendUrl}/api/record-engagement`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tweetId, userId: twitterUserId })
      }).catch(err => console.error('Failed to record engagement:', err));
    }
  }

  async reconnectTwitter() {
    try {
      await this.authService.initiateTwitterAuth(window.location.origin + '/dashboard');
    } catch (error) {
      console.error('Failed to reconnect Twitter:', error);
      alert('Failed to connect to Twitter. Please try again.');
    }
  }

  async verifyTask(task: PlatformTask) {
    const tweetId = this.extractTweetId(task.post_link || '');
    if (!tweetId) {
      alert('Unable to extract Tweet ID from the link. Please contact support.');
      return;
    }

    this.verifyingTaskId = task.id;
    console.log('Verifying engagement for tweet:', tweetId);

    const required = {
      like: task.required_like || false,
      repost: task.required_repost || false,
      comment: task.required_comment || false
    };

    const result = await this.verifyEngagement(tweetId, required);

    if (result === 'missing_auth') {
      alert('Your Twitter session has expired. Please tap "Connect Account" to reconnect your X account.');
      this.verifyingTaskId = null;
      return;
    }

    if (result === 'too_fast') {
      alert('Please wait a moment after engaging with the post before verifying. Make sure you liked, retweeted, or commented on the tweet first!');
      this.verifyingTaskId = null;
      return;
    }

    if (typeof result === 'string' && result.startsWith('missing:')) {
      const missing = result.replace('missing:', '');
      alert(`Engagement incomplete! You still need to: ${missing}. Please complete all required actions and try again.`);
      this.verifyingTaskId = null;
      return;
    }

    if (!result) {
      alert('Engagement verification failed. Please click "Engage on X" first, complete the required actions, then come back and click "Verify".');
      this.verifyingTaskId = null;
      return;
    }

    this.tasksComplete++;

    // Doubled reward logic for verified users (X Blue badge)
    let finalReward = task.reward;
    if (this.isVerifiedAccount) {
      finalReward *= 2;
      console.log(`Verified user bonus applied: Reward doubled from $${task.reward} to $${finalReward}`);
    }

    this.earnings += finalReward;
    this.balance += finalReward;

    this.authService.currentUser$.pipe(take(1)).subscribe(async (currentUser: any) => {
      if (currentUser) {
        try {
          await this.supabase.updateProfile(currentUser.id, { balance: this.balance });
        } catch (error) {
          console.error('Failed to update balance:', error);
        }
      }
    });

    this.engagementTasks = this.engagementTasks.filter(t => t.id !== task.id);
    this.verifyingTaskId = null;

    alert(`Task validated! You earned $${finalReward.toFixed(2)}`);
  }

  async submitWithdrawal() {
    if (this.withdrawalForm.amount < 40) {
      alert('Minimum withdrawal is $40.');
      return;
    }
    if (!this.withdrawalForm.solanaAddress) {
      alert('Please provide a Solana address.');
      return;
    }
    if (this.balance < this.withdrawalForm.amount) {
      alert('Insufficient balance.');
      return;
    }

    try {
      await this.supabase.createWithdrawal(this.withdrawalForm.amount, this.withdrawalForm.solanaAddress);

      this.balance -= this.withdrawalForm.amount;
      this.withdrawals += this.withdrawalForm.amount;

      this.authService.currentUser$.pipe(take(1)).subscribe(async (currentUser: User | null | undefined) => {
        if (currentUser) {
          try {
            await this.supabase.updateProfile(currentUser.id, { balance: this.balance });
            await this.loadUserWithdrawals(currentUser.id);
          } catch (error) {
            console.error('Failed to update balance:', error);
          }
        }
      });

      alert(`Withdrawal of $${this.withdrawalForm.amount} submitted! It will appear as pending until the admin processes it.`);

      this.withdrawalForm.amount = 40;
      this.withdrawalForm.solanaAddress = '';
    } catch (error) {
      console.error('Withdrawal failed', error);
      alert('Failed to submit withdrawal request.');
    }
  }

  goToAdmin() {
    this.router.navigate(['/admin-dashboard']);
  }

  logout() {
    this.authService.logout();
  }

  private extractTweetId(url: string): string | null {
    const match = url.match(/twitter\.com\/\w+\/status\/(\d+)/) || url.match(/x\.com\/\w+\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  private async verifyEngagement(tweetId: string, required: any): Promise<boolean | string> {
    const accessToken = localStorage.getItem('twitter_access_token');
    const refreshToken = localStorage.getItem('twitter_refresh_token');
    const twitterUserId = localStorage.getItem('twitter_user_id');

    if (!accessToken || !twitterUserId) {
      console.error('Missing Twitter credentials for verification');
      return 'missing_auth';
    }

    try {
      const response = await fetch(`${environment.backendUrl}/api/verify-engagement`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          accessToken,
          refreshToken, 
          tweetId,
          userId: twitterUserId,
          required
        })
      });

      if (!response.ok) {
        if (response.status === 401) return 'missing_auth';
        return false;
      }

      const result = await response.json();
      
      // If backend refreshed tokens, update them in localStorage and database
      if (result.newTokens) {
        console.log('Updating local tokens with refreshed versions');
        localStorage.setItem('twitter_access_token', result.newTokens.accessToken);
        if (result.newTokens.refreshToken) {
          localStorage.setItem('twitter_refresh_token', result.newTokens.refreshToken);
        }
        
        // Background update of profile (only existing columns)
        this.authService.currentUser$.pipe(take(1)).subscribe(async (currentUser: any) => {
          if (currentUser) {
            try {
              // Only attempt update if we're sure the columns exist or handle error gracefully
              await this.supabase.updateProfile(currentUser.id, {
                // @ts-ignore
                twitter_access_token: result.newTokens.accessToken,
                // @ts-ignore
                twitter_refresh_token: result.newTokens.refreshToken
              });
            } catch (e: any) {
              // Silently fail DB update of tokens if columns don't exist
              console.log('[Dashboard] Token sync to DB skipped (missing columns)');
            }
          }
        });
      }

      // Return specific reasons for better user feedback
      if (result.reason === 'too_fast') return 'too_fast';
      if (result.reason === 'no_engagement_click') return false;
      if (result.verified === false && result.missing && result.missing.length > 0) {
        return 'missing:' + result.missing.join(', ');
      }
      
      return result.verified;
    } catch (error) {
      console.error('Verification failed:', error);
      return false;
    }
  }
}
