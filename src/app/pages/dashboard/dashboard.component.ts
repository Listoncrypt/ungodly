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
  
  // Tab tracking
  activeTab: 'available' | 'performed' = 'available';
  performedTasks: any[] = [];
  completedTaskIds: Set<string> = new Set();

  // Timer tracking
  taskTimers: { [taskId: string]: number } = {};
  private timerIntervals: { [taskId: string]: any } = {};

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

      // 1. Store everything in localStorage
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
          } catch (err: any) {
            console.error('[Dashboard] DB update failed:', err.message);
          }
          
          alert('Twitter connected successfully!');
          window.history.replaceState({}, document.title, window.location.pathname);
          window.location.reload();
        }
      });
      return;
    }

    if (error === 'insufficient_followers') {
      const count = params.get('count') || '0';
      alert(`Account Rejected: Your X account only has ${count} followers. You must have at least 1,000 followers to use this platform.`);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (error) {
      alert('Twitter connection failed: ' + error);
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    this.authService.currentUser$.subscribe(async (user: any) => {
      this.hasTwitterSession = !!localStorage.getItem('twitter_access_token');
      if (user) {
        this.username = user.username || user.email.split('@')[0];
        this.balance = user.balance || 0.0;
        this.verified = user.is_verified || false;
        this.isVerifiedAccount = user.is_verified || false;
        this.tasksComplete = user.tasks_completed || 0;
        this.earnings = user.total_earned || 0.0;
        this.withdrawals = user.total_withdrawn || 0.0;
        this.isAdmin = user.role === 'admin';
        this.userInitial = this.username.charAt(0).toUpperCase();

        // Load tasks and filter them
        try {
          // 1. Get completed task IDs (Gracefully handle missing table)
          let completedIds: string[] = [];
          try {
            completedIds = await this.supabase.getCompletedTasks(user.id);
          } catch (e) {
            console.warn('[Dashboard] user_tasks table might be missing. Skipping filter.', e);
          }
          this.completedTaskIds = new Set(completedIds);

          // 2. Load all tasks
          const tasks = await this.supabase.getTasks();
          
          // 3. Filter: Only show tasks the user HAS NOT done yet
          this.engagementTasks = tasks.filter(t => !this.completedTaskIds.has(t.id));

          // 4. Load full details for performed tasks tab (Gracefully handle missing table)
          try {
            this.performedTasks = await this.supabase.getFullCompletedTasks(user.id);
          } catch (e) {
            console.warn('[Dashboard] Could not load performed tasks details.', e);
            this.performedTasks = [];
          }

          console.log(`Loaded ${this.engagementTasks.length} available and ${this.performedTasks.length} performed tasks`);
        } catch (err) {
          console.error('Critical error loading tasks:', err);
        }

        // Load user withdrawals
        try {
          this.userWithdrawals = await this.supabase.getUserWithdrawals(user.id);
        } catch (err) {
          console.error('Error loading withdrawals:', err);
        }

        // Subscribe to real-time withdrawal status updates
        this.supabase.client
          .channel(`withdrawals:user_id=eq.${user.id}`)
          .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'withdrawals',
            filter: `user_id=eq.${user.id}`
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
    // Clear all active timers
    Object.values(this.timerIntervals).forEach(interval => clearInterval(interval));
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
    if (!this.hasTwitterSession) {
      alert('Please connect your X account first!');
      return;
    }

    console.log('Opening X (Twitter)...', task.post_link);
    window.open(task.post_link || 'https://x.com', '_blank');
    
    this.verifyingTaskId = task.id;
    this.taskTimers[task.id] = 25; // 25 second timer

    // Start countdown
    if (this.timerIntervals[task.id]) clearInterval(this.timerIntervals[task.id]);
    
    this.timerIntervals[task.id] = setInterval(() => {
      if (this.taskTimers[task.id] > 0) {
        this.taskTimers[task.id]--;
      } else {
        clearInterval(this.timerIntervals[task.id]);
      }
    }, 1000);

    // Record engagement start time on the backend
    const tweetId = this.extractTweetId(task.post_link || '');
    const twitterUserId = localStorage.getItem('twitter_user_id');
    if (tweetId && twitterUserId) {
      fetch(`${environment.backendUrl}/api/record-engagement`, {
        // ... (rest same as before)
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
    // Check if timer is still running
    if (this.taskTimers[task.id] > 0) {
      alert(`Please wait ${this.taskTimers[task.id]} more seconds to claim your reward. Make sure you liked/reposted the post!`);
      return;
    }

    const tweetId = this.extractTweetId(task.post_link || '');
    if (!tweetId) {
      alert('Unable to extract Tweet ID from the link. Please contact support.');
      return;
    }

    this.verifyingTaskId = task.id;
    console.log('Claiming reward for tweet:', tweetId);

    const result = await this.verifyEngagement(tweetId, {});

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

    // Doubled reward logic for verified users (X Blue badge)
    let totalReward = task.reward;
    if (this.isVerifiedAccount) {
      totalReward *= 2;
      console.log(`Verified user bonus applied: Reward doubled from $${task.reward} to $${totalReward}`);
    }

    // 2. Update user profile statistics
    try {
      const currentUser = await this.authService.currentUser$.pipe(take(1)).toPromise();
      if (!currentUser) throw new Error('User not authenticated');

      console.log(`[Verify] Recording completion for user ${currentUser.id} and task ${task.id}`);

      // Record completion in user_tasks table to prevent duplicate claims
      const recordResult = await this.supabase.recordTaskCompletion(currentUser.id, task.id, totalReward);
      
      if (recordResult && recordResult.alreadyDone) {
        alert('You have already completed this task!');
        this.verifyingTaskId = null;
        return;
      }

      console.log('[Verify] Completion recorded. Updating profile balance...');

      const newBalance = (currentUser.balance || 0) + totalReward;
      const newTotalEarned = (currentUser.total_earned || 0) + totalReward;
      const newTasksCount = (currentUser.tasks_completed || 0) + 1;

      await this.supabase.updateProfile(currentUser.id, {
        balance: newBalance,
        total_earned: newTotalEarned,
        tasks_completed: newTasksCount
      });

      console.log(`[Verify] Profile updated: New Balance $${newBalance}`);

      this.engagementTasks = this.engagementTasks.filter(t => t.id !== task.id);
      this.completedTaskIds.add(task.id);
      this.verifyingTaskId = null;

      alert(`Task validated! You earned $${totalReward.toFixed(2)}`);
    } catch (err: any) {
      console.error('[Verify] Critical Error during reward awarding:', err);
      alert(`Payment Error: Could not add reward to your balance. Error: ${err.message || 'Database connection error'}. Make sure the admin has run the latest SQL update!`);
      this.verifyingTaskId = null;
    }
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
