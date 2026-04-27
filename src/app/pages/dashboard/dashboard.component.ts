import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService, User } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { take } from 'rxjs/operators';

export interface EngagementTask {
  id: string;
  title: string;
  image: string;
  reward: number;
  boost: number;
  actions: string;
  post_link?: string;
}

interface SidebarMenu {
  icon: string;
  label: string;
  href: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css'],
})
export class DashboardComponent implements OnInit {
  username = 'user123';
  balance = 0.0;
  verified = false;
  boost = 0;
  tasksComplete = 0;
  earnings = 0.0;
  withdrawals = 0.0;

  totalCreators = 0;
  totalPlatformEarnings = 0.0;

  sidebarMenus: SidebarMenu[] = [
    { icon: '📊', label: 'Dashboard', href: '#' },
    { icon: '🛡️', label: 'Admin', href: '/admin-dashboard' },
  ];

  engagementTasks: EngagementTask[] = [];

  showWithdrawal = false;
  withdrawalForm = {
    amount: 40,
    solanaAddress: '',
  };

  activeMenu = 'dashboard';
  userInitial = 'X';

  constructor(
    private authService: AuthService, 
    private supabase: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    this.loadTasks();
    this.authService.currentUser$.subscribe(currentUser => {
      if (currentUser) {
        this.username = currentUser.email.split('@')[0];
        this.verified = currentUser.twitterId ? true : (currentUser.verified || false);
        this.boost = currentUser.boost || 0;
        
        // Only override if the user has a stored balance, otherwise start at 0
        if (currentUser.balance !== undefined) {
          this.balance = currentUser.balance;
        }
        
        this.userInitial = this.username.charAt(0).toUpperCase();
        
        // Hide Admin menu if not admin
        if (currentUser.role !== 'admin') {
          this.sidebarMenus = this.sidebarMenus.filter(m => m.label !== 'Admin');
        }
      }
    });

    this.supabase.getPlatformStats().then(stats => {
      this.totalCreators = stats.totalCreators;
      this.totalPlatformEarnings = stats.totalEarnings;
    });
  }

  async loadTasks() {
    try {
      this.engagementTasks = await this.supabase.getTasks();
    } catch (error) {
      console.error('Failed to load tasks', error);
    }
  }

  engageOnX(task: EngagementTask) {
    console.log('Opening X (Twitter)...', task.post_link);
    window.open(task.post_link || 'https://x.com', '_blank');

    // Extract tweet ID for verification
    const tweetId = this.extractTweetId(task.post_link || '');

    if (!tweetId) {
      alert('Invalid task link. Cannot verify engagement.');
      return;
    }

    // Wait for user to engage, then verify
    setTimeout(async () => {
      console.log('Verifying engagement for tweet:', tweetId);

      const isVerified = await this.verifyEngagement(tweetId);

      if (!isVerified) {
        alert('Engagement verification failed. Please make sure you liked or retweeted the post to earn rewards.');
        return;
      }

      this.tasksComplete++;

      let finalReward = task.reward;
      if (this.verified) {
        // 10% boost for verified twitter account
        finalReward += finalReward * 0.10;
      }

      this.earnings += finalReward;
      this.balance += finalReward;

      // Save balance to database
      this.authService.currentUser$.pipe(take(1)).subscribe(async (currentUser: User | null) => {
        if (currentUser) {
          try {
            await this.supabase.updateProfile(currentUser.id, { balance: this.balance });
          } catch (error) {
            console.error('Failed to update balance:', error);
          }
        }
      });

      // Mark task as done (remove from list)
      this.engagementTasks = this.engagementTasks.filter(t => t.id !== task.id);

      alert(`Task validated! You earned $${finalReward.toFixed(2)}`);
    }, 5000); // Increased to 5 seconds to give user time to engage
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

      // Save balance to database
      this.authService.currentUser$.pipe(take(1)).subscribe(async (currentUser: User | null) => {
        if (currentUser) {
          try {
            await this.supabase.updateProfile(currentUser.id, { balance: this.balance });
          } catch (error) {
            console.error('Failed to update balance:', error);
          }
        }
      });

      alert(`Withdrawal of $${this.withdrawalForm.amount} to ${this.withdrawalForm.solanaAddress} submitted successfully!`);

      this.withdrawalForm.amount = 40;
      this.withdrawalForm.solanaAddress = '';
    } catch (error) {
      console.error('Withdrawal failed', error);
      alert('Failed to submit withdrawal request. Please check if your account is fully verified.');
    }
  }

  logout() {
    this.authService.logout();
  }

  private extractTweetId(url: string): string | null {
    const match = url.match(/twitter\.com\/\w+\/status\/(\d+)/) || url.match(/x\.com\/\w+\/status\/(\d+)/);
    return match ? match[1] : null;
  }

  private async verifyEngagement(tweetId: string): Promise<boolean> {
    const accessToken = localStorage.getItem('twitter_access_token');
    const twitterUserId = localStorage.getItem('twitter_user_id');

    if (!accessToken || !twitterUserId) {
      console.error('Missing Twitter credentials for verification');
      return false;
    }

    try {
      const response = await fetch('https://ungodly-backend.onrender.com/api/verify-engagement', {
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

      const result = await response.json();
      return result.verified;
    } catch (error) {
      console.error('Verification failed:', error);
      return false;
    }
  }

  setActiveMenu(menu: string) {
    if (menu === 'Admin') {
      this.router.navigate(['/admin-dashboard']);
    }
    this.activeMenu = menu;
  }
}


