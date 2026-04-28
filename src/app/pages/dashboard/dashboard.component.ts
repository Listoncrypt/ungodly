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
    this.loadTasks();
    this.authService.currentUser$.subscribe(currentUser => {
      this.hasTwitterSession = !!localStorage.getItem('twitter_access_token');
      if (currentUser) {
        this.username = currentUser.email.split('@')[0];
        // Check for verified status from profile
        this.isVerifiedAccount = (currentUser as any).is_verified || false;
        this.verified = this.isVerifiedAccount;
        this.boost = currentUser.boost || 0;
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

    const result = await this.verifyEngagement(tweetId);

    if (result === 'missing_auth') {
      alert('Your Twitter session has expired. Please log out and log back in with Twitter to continue earning.');
      this.verifyingTaskId = null;
      return;
    }

    if (!result) {
      alert('Engagement verification failed. Please make sure you liked or retweeted the post to earn rewards.');
      this.verifyingTaskId = null;
      return;
    }

    this.tasksComplete++;

    let finalReward = task.reward;
    // Apply task boost ONLY if user is twitter verified
    if (this.isVerifiedAccount) {
      finalReward += task.boost;
    }

    // Apply follower-based percentage boost if applicable
    if (this.boost > 0) {
      finalReward += finalReward * (this.boost / 100);
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

  private async verifyEngagement(tweetId: string): Promise<boolean | string> {
    const accessToken = localStorage.getItem('twitter_access_token');
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
          tweetId,
          userId: twitterUserId
        })
      });

      if (!response.ok) {
        return false;
      }

      const result = await response.json();
      return result.verified;
    } catch (error) {
      console.error('Verification failed:', error);
      return false;
    }
  }
}
