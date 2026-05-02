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

  pendingSubmissions: any[] = [];
  loadingSubmissions = true;

  tabs = [
    { id: 'requests', label: 'Requests', count: 0 },
    { id: 'registered', label: 'Users', count: 0 },
    { id: 'tasks', label: 'Tasks', count: 0 },
    { id: 'withdrawals', label: 'Withdrawals', count: 0 },
    { id: 'reviews', label: 'Reviews', count: 0 },
  ];

  newTask = {
    title: '',
    image: '',
    postLink: '',
    reward: 0.05,
    boost: 0.05,
    actions: '',
    required_like: true,
    required_comment: false,
    required_repost: false
  };

  constructor(private supabase: SupabaseService, private router: Router) {}

  ngOnInit() {
    this.loadUnapprovedUsers();
    this.loadRegisteredUsers();
    this.loadWithdrawals();
    this.loadWithdrawalHistory();
    this.loadTasks();
    this.loadPendingSubmissions();
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
    this.tabs[4].count = this.pendingSubmissions.length;
    this.totalPendingAmount = this.pendingWithdrawals.reduce((sum, w) => sum + (w.amount || 0), 0);
  }

  async loadPendingSubmissions() {
    this.loadingSubmissions = true;
    try {
      const { data, error } = await this.supabase.client
        .from('task_submissions')
        .select('*, profile:user_id(email, twitter_handle), task:task_id(title, reward)')
        .eq('status', 'pending')
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      this.pendingSubmissions = data || [];
      this.updateTabCounts();
    } catch (err) {
      console.error('Error loading submissions:', err);
    } finally {
      this.loadingSubmissions = false;
    }
  }

  async approveSubmission(submission: any) {
    if (!confirm(`Approve this submission and pay $${submission.reward_amount} to ${submission.profile?.email}?`)) return;
    try {
      // 1. Mark submission as approved
      const { error: subError } = await this.supabase.client
        .from('task_submissions')
        .update({ status: 'approved', reviewed_at: new Date().toISOString() })
        .eq('id', submission.id);
      if (subError) throw subError;

      // 2. Fetch fresh user balance
      const { data: profile } = await this.supabase.client
        .from('profiles')
        .select('balance, total_earned, tasks_completed')
        .eq('id', submission.user_id)
        .single();

      const newBalance = (profile?.balance || 0) + submission.reward_amount;
      const newEarned = (profile?.total_earned || 0) + submission.reward_amount;
      const newTasks = (profile?.tasks_completed || 0) + 1;

      // 3. Update user balance
      const { error: profError } = await this.supabase.client
        .from('profiles')
        .update({ balance: newBalance, total_earned: newEarned, tasks_completed: newTasks })
        .eq('id', submission.user_id);
      if (profError) throw profError;

      // 4. Record in user_tasks to mark as completed
      await this.supabase.client
        .from('user_tasks')
        .insert({ user_id: submission.user_id, task_id: submission.task_id, reward_amount: submission.reward_amount })
        .on('conflict', 'do nothing' as any);

      this.pendingSubmissions = this.pendingSubmissions.filter(s => s.id !== submission.id);
      this.updateTabCounts();
      alert(`Approved! $${submission.reward_amount} added to user balance.`);
    } catch (err: any) {
      console.error('Error approving submission:', err);
      alert('Failed to approve: ' + err.message);
    }
  }

  async rejectSubmission(submission: any) {
    if (!confirm(`Reject this submission from ${submission.profile?.email}?`)) return;
    try {
      const { error } = await this.supabase.client
        .from('task_submissions')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString() })
        .eq('id', submission.id);
      if (error) throw error;
      this.pendingSubmissions = this.pendingSubmissions.filter(s => s.id !== submission.id);
      this.updateTabCounts();
      alert('Submission rejected.');
    } catch (err: any) {
      console.error('Error rejecting submission:', err);
      alert('Failed to reject: ' + err.message);
    }
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
    if (!this.newTask.title) {
      alert('Please fill out the task title.');
      return;
    }

    if (!this.newTask.required_like && !this.newTask.required_comment && !this.newTask.required_repost) {
      alert('Please select at least one required action (Like, Comment, or Repost).');
      return;
    }

    // Auto-generate actions text from checkboxes
    const actionParts: string[] = [];
    if (this.newTask.required_like) actionParts.push('Like');
    if (this.newTask.required_comment) actionParts.push('Comment');
    if (this.newTask.required_repost) actionParts.push('Repost');
    const actionsText = actionParts.join(', ');

    let finalImage = this.newTask.image;
    if (!finalImage && this.newTask.postLink) {
      finalImage = `https://api.microlink.io/?url=${encodeURIComponent(this.newTask.postLink)}&screenshot=true&meta=false&embed=screenshot.url`;
    } else if (!finalImage) {
      finalImage = 'image_0.png';
    }

    const taskData = {
      title: this.newTask.title,
      post_link: this.newTask.postLink,
      actions: actionsText,
      reward: this.newTask.reward,
      boost: this.newTask.boost,
      image: finalImage,
      required_like: this.newTask.required_like,
      required_comment: this.newTask.required_comment,
      required_repost: this.newTask.required_repost
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
      this.newTask.required_like = true;
      this.newTask.required_comment = false;
      this.newTask.required_repost = false;
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
