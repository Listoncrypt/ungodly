import { Component, OnInit, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { SupabaseService, Profile } from '../../services/supabase.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  styleUrls: ['./admin-dashboard.component.css'],
  templateUrl: './admin-dashboard.component.html'
})
export class AdminDashboardComponent implements OnInit, AfterViewInit, OnDestroy {
  private _observer: IntersectionObserver | null = null;
  unapprovedUsers: Profile[] = [];
  registeredUsers: Profile[] = [];
  pendingWithdrawals: any[] = [];
  completedWithdrawals: any[] = [];
  existingTasks: any[] = [];
  loading = true;
  loadingRegistered = true;
  loadingWithdrawals = true;
  loadingHistory = true;
  activeTab = 'requests';
  totalPendingAmount = 0;

  tabs = [
    { id: 'requests', label: 'Requests', count: 0 },
    { id: 'registered', label: 'Users', count: 0 },
    { id: 'tasks', label: 'Tasks', count: 0 },
    { id: 'withdrawals', label: 'Withdrawals', count: 0 },
  ];

  newTask = {
    title: '',
    image: '',
    postLink: '',
    reward: 0.5,
    boost: 0.05,
    actions: ''
  };

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit() {
    this.loadUnapprovedUsers();
    this.loadRegisteredUsers();
    this.loadWithdrawals();
    this.loadWithdrawalHistory();
    this.loadTasks();
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

  private updateTabCounts() {
    this.tabs[0].count = this.unapprovedUsers.length;
    this.tabs[1].count = this.registeredUsers.length;
    this.tabs[2].count = this.existingTasks.length;
    this.tabs[3].count = this.pendingWithdrawals.length;
    this.totalPendingAmount = this.pendingWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  }

  async loadTasks() {
    try {
      this.existingTasks = await this.supabase.getTasks();
      this.updateTabCounts();
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
  }

  async loadUnapprovedUsers() {
    this.loading = true;
    try {
      this.unapprovedUsers = await this.supabase.getUnapprovedUsers();
      this.updateTabCounts();
    } catch (error) {
      console.error('Error loading requests:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadRegisteredUsers() {
    this.loadingRegistered = true;
    try {
      this.registeredUsers = await this.supabase.getAllRegisteredUsers();
      this.updateTabCounts();
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      this.loadingRegistered = false;
    }
  }

  async clearLegacyBonuses() {
    if (confirm('Are you sure you want to deduct $5 from all user balances? This will reconcile legacy bonuses.')) {
      try {
        await this.supabase.fixLegacyBalances();
        alert('Legacy bonuses cleared successfully!');
        this.loadRegisteredUsers();
      } catch (error) {
        console.error('Failed to clear legacy bonuses:', error);
        alert('Failed to clear legacy bonuses.');
      }
    }
  }

  async approve(userId: string) {
    try {
      await this.supabase.approveUser(userId);
      this.unapprovedUsers = this.unapprovedUsers.filter(u => u.id !== userId);
      this.loadRegisteredUsers();
      this.updateTabCounts();
      alert('User approved successfully.');
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user');
    }
  }

  async decline(userId: string) {
    if (confirm('Are you sure you want to decline this user? This will remove their request.')) {
      try {
        await this.supabase.declineUser(userId);
        this.unapprovedUsers = this.unapprovedUsers.filter(u => u.id !== userId);
        this.updateTabCounts();
        alert('User request declined and removed.');
      } catch (error) {
        console.error('Error declining user:', error);
        alert('Failed to decline user');
      }
    }
  }

  async removeUser(userId: string) {
    if (confirm('CRITICAL: Are you sure you want to BAN and remove this user? This will delete their account and profile forever.')) {
      try {
        await this.supabase.deleteUserAccount(userId);
        this.registeredUsers = this.registeredUsers.filter(u => u.id !== userId);
        this.updateTabCounts();
        alert('User has been banned and removed from the platform.');
      } catch (error) {
        console.error('Error removing user:', error);
        alert('Failed to remove user account.');
      }
    }
  }

  async createTask() {
    if (!this.newTask.title || !this.newTask.actions) {
      alert('Please fill out task title and actions.');
      return;
    }

    let finalImage = this.newTask.image;
    if (!finalImage && this.newTask.postLink) {
      finalImage = `https://api.microlink.io/?url=${encodeURIComponent(this.newTask.postLink)}&screenshot=true&meta=false&embed=screenshot.url`;
    } else if (!finalImage) {
      finalImage = 'image_0.png';
    }

    const taskData = {
      title: this.newTask.title,
      post_link: this.newTask.postLink,
      actions: this.newTask.actions,
      reward: this.newTask.reward,
      boost: this.newTask.boost,
      image: finalImage
    };

    try {
      const newTask = await this.supabase.createPlatformTask(taskData);
      this.existingTasks.unshift(newTask);
      this.updateTabCounts();

      alert('Task successfully uploaded to the dashboard!');
      this.newTask.title = '';
      this.newTask.actions = '';
      this.newTask.postLink = '';
      this.newTask.image = '';
    } catch (error) {
      console.error('Failed to create task:', error);
      alert('Failed to publish task.');
    }
  }

  async deleteTask(id: string) {
    if (confirm('Are you sure you want to delete this task?')) {
      try {
        await this.supabase.deletePlatformTask(id);
        this.existingTasks = this.existingTasks.filter((t: any) => t.id !== id);
        this.updateTabCounts();
      } catch (error) {
        console.error('Failed to delete task:', error);
        alert('Failed to delete task');
      }
    }
  }

  goToDashboard() {
    this.router.navigate(['/dashboard']);
  }

  async loadWithdrawals() {
    this.loadingWithdrawals = true;
    try {
      this.pendingWithdrawals = await this.supabase.getPendingWithdrawals();
      this.updateTabCounts();
    } catch (error) {
      console.error('Error loading withdrawals:', error);
    } finally {
      this.loadingWithdrawals = false;
    }
  }

  async loadWithdrawalHistory() {
    this.loadingHistory = true;
    try {
      this.completedWithdrawals = await this.supabase.getCompletedWithdrawals();
    } catch (error) {
      console.error('Error loading withdrawal history:', error);
    } finally {
      this.loadingHistory = false;
    }
  }

  async markAsPaid(id: string) {
    try {
      await this.supabase.processWithdrawal(id);
      this.pendingWithdrawals = this.pendingWithdrawals.filter(w => w.id !== id);
      this.loadWithdrawalHistory();
      this.updateTabCounts();
      alert('Withdrawal marked as completed!');
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      alert('Failed to process withdrawal');
    }
  }

  copyAddress(address: string) {
    navigator.clipboard.writeText(address).then(() => {
      alert('Solana address copied!');
    });
  }
}
