import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';

export interface EngagementTask {
  id: string;
  title: string;
  image: string;
  reward: number;
  boost: number;
  actions: string;
  postLink?: string;
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
  uploading = false;
  uploadSuccessUrl = '';

  sidebarMenus: SidebarMenu[] = [
    { icon: '📊', label: 'Dashboard', href: '#' },
    { icon: '💰', label: 'My Earnings', href: '#' },
    { icon: '💸', label: 'Withdraw Funds', href: '#' },
    { icon: '⚙️', label: 'Settings', href: '#' },
    { icon: '🛡️', label: 'Admin', href: '/admin-dashboard' },
  ];

  engagementTasks: EngagementTask[] = [
    {
      id: '1',
      title: 'like & retweet @user_x post',
      image: 'image_0.png',
      reward: 0.5,
      boost: 0.05,
      actions: 'like + comment + retweet + bookmark @user_x',
    },
    {
      id: '2',
      title: 'like & retweet @user_x post',
      image: 'image_0.png',
      reward: 0.5,
      boost: 0.05,
      actions: 'like + comment + retweet + bookmark @user_x',
    },
    {
      id: '3',
      title: 'like & retweet @user_x post',
      image: 'image_0.png',
      reward: 0.5,
      boost: 0.05,
      actions: 'like + comment + retweet + bookmark @user_x',
    },
  ];

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
  }

  loadTasks() {
    const saved = localStorage.getItem('admin_tasks');
    if (saved) {
      this.engagementTasks = JSON.parse(saved);
    }
  }

  engageOnX(task: EngagementTask) {
    console.log('Opening X (Twitter)...', task.postLink);
    window.open(task.postLink || 'https://x.com', '_blank');
    
    // Simulate validation and task completion
    setTimeout(() => {
      this.tasksComplete++;
      
      let finalReward = task.reward;
      if (this.verified) {
        // 10% boost for verified twitter account
        finalReward += finalReward * 0.10; 
      }
      
      this.earnings += finalReward;
      this.balance += finalReward;
      
      // Mark task as done (remove from list)
      this.engagementTasks = this.engagementTasks.filter(t => t.id !== task.id);
      
      alert(`Task validated! You earned $${finalReward.toFixed(2)}`);
    }, 2000);
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
      
      alert(`Withdrawal of $${this.withdrawalForm.amount} to ${this.withdrawalForm.solanaAddress} submitted successfully!`);
      
      this.withdrawalForm.amount = 40;
      this.withdrawalForm.solanaAddress = '';
    } catch (error) {
      console.error('Withdrawal failed', error);
      alert('Failed to submit withdrawal request. Please check if your account is fully verified.');
    }
  }

  async uploadFile(event: any, type: 'images'|'videos') {
    const file = event.target.files[0];
    if (!file) return;

    this.uploading = true;
    this.uploadSuccessUrl = '';
    try {
      const url = await this.supabase.uploadMedia(type, file);
      this.uploadSuccessUrl = url;
    } catch (error) {
      console.error('Upload failed', error);
      alert('Upload failed. Check if you are approved.');
    } finally {
      this.uploading = false;
    }
  }

  logout() {
    this.authService.logout();
    this.router.navigate(['/login']);
  }

  setActiveMenu(menu: string) {
    if (menu === 'Admin') {
      this.router.navigate(['/admin-dashboard']);
      return;
    }
    this.activeMenu = menu;
  }
}


