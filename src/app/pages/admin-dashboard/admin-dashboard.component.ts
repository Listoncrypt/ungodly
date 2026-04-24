import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Profile } from '../../services/supabase.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-[#0F172A] text-white p-8">
      <h1 class="text-3xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-500 bg-clip-text text-transparent">
        Admin Dashboard
      </h1>
      
      <div class="bg-[#1E293B] rounded-xl p-6 shadow-xl border border-gray-800">
        <h2 class="text-xl font-semibold mb-4 text-gray-200">Pending User Approvals</h2>
        
        <div *ngIf="loading" class="text-gray-400">Loading users...</div>
        
        <div *ngIf="!loading && unapprovedUsers.length === 0" class="text-green-400 p-4 bg-green-400/10 rounded-lg">
          No users pending approval. You're all caught up!
        </div>
        
        <div *ngIf="!loading && unapprovedUsers.length > 0" class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-gray-700 text-gray-400">
                <th class="p-3">Email</th>
                <th class="p-3">Role</th>
                <th class="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let user of unapprovedUsers" class="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td class="p-3">{{ user.email }}</td>
                <td class="p-3">
                  <span class="px-2 py-1 bg-blue-500/20 text-blue-400 rounded text-sm">
                    {{ user.role }}
                  </span>
                </td>
                <td class="p-3">
                  <button 
                    (click)="approve(user.id)"
                    class="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all transform hover:scale-105"
                  >
                    Approve Access
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Task Creation Section -->
      <div class="mt-8 bg-[#1E293B] rounded-xl p-6 shadow-xl border border-gray-800">
        <h2 class="text-xl font-semibold mb-4 text-gray-200">Create Engagement Task</h2>
        
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Task Title</label>
            <input type="text" [(ngModel)]="newTask.title" placeholder="e.g. like & retweet @user_x post" 
                   class="w-full bg-[#0F172A] border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Required Actions</label>
            <input type="text" [(ngModel)]="newTask.actions" placeholder="e.g. like + comment + retweet" 
                   class="w-full bg-[#0F172A] border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">X Post Link (URL)</label>
            <input type="text" [(ngModel)]="newTask.postLink" placeholder="e.g. https://x.com/user/status/123" 
                   class="w-full bg-[#0F172A] border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Custom Image URL (Optional)</label>
            <input type="text" [(ngModel)]="newTask.image" placeholder="Leave blank for auto-preview" 
                   class="w-full bg-[#0F172A] border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Reward ($)</label>
            <input type="number" [(ngModel)]="newTask.reward" step="0.1" 
                   class="w-full bg-[#0F172A] border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-400 mb-1">Verified Boost ($)</label>
            <input type="number" [(ngModel)]="newTask.boost" step="0.01" 
                   class="w-full bg-[#0F172A] border border-gray-700 rounded-lg p-2 text-white focus:outline-none focus:border-blue-500">
          </div>
        </div>
        
        <button 
          (click)="createTask()"
          class="mt-4 bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-all"
        >
          Publish Task to Agents
        </button>
      </div>

      <!-- Withdrawal Requests Section -->
      <div class="mt-8 bg-[#1E293B] rounded-xl p-6 shadow-xl border border-gray-800">
        <h2 class="text-xl font-semibold mb-4 text-gray-200">Pending Withdrawal Requests</h2>
        
        <div *ngIf="loadingWithdrawals" class="text-gray-400">Loading withdrawals...</div>
        
        <div *ngIf="!loadingWithdrawals && pendingWithdrawals.length === 0" class="text-green-400 p-4 bg-green-400/10 rounded-lg">
          No pending withdrawal requests.
        </div>
        
        <div *ngIf="!loadingWithdrawals && pendingWithdrawals.length > 0" class="overflow-x-auto">
          <table class="w-full text-left border-collapse">
            <thead>
              <tr class="border-b border-gray-700 text-gray-400">
                <th class="p-3">Email</th>
                <th class="p-3">Amount</th>
                <th class="p-3">Solana Address</th>
                <th class="p-3">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr *ngFor="let withdrawal of pendingWithdrawals" class="border-b border-gray-800 hover:bg-gray-800/50 transition-colors">
                <td class="p-3">{{ withdrawal.email }}</td>
                <td class="p-3 font-bold text-green-400">${{ withdrawal.amount }}</td>
                <td class="p-3 text-xs font-mono text-gray-300 break-all max-w-[200px]">{{ withdrawal.solana_address }}</td>
                <td class="p-3">
                  <button 
                    (click)="markAsPaid(withdrawal.id)"
                    class="bg-green-600 hover:bg-green-500 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-all"
                  >
                    Mark as Paid
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  unapprovedUsers: Profile[] = [];
  pendingWithdrawals: any[] = [];
  loading = true;
  loadingWithdrawals = true;
  
  // Task Creation Form
  newTask = {
    title: '',
    image: '',
    postLink: '',
    reward: 0.5,
    boost: 0.05,
    actions: ''
  };

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.loadUsers();
    this.loadWithdrawals();
  }

  async loadUsers() {
    this.loading = true;
    try {
      this.unapprovedUsers = await this.supabase.getUnapprovedUsers();
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      this.loading = false;
    }
  }

  async loadWithdrawals() {
    this.loadingWithdrawals = true;
    try {
      this.pendingWithdrawals = await this.supabase.getPendingWithdrawals();
    } catch (error) {
      console.error('Error loading withdrawals:', error);
    } finally {
      this.loadingWithdrawals = false;
    }
  }

  async approve(userId: string) {
    try {
      await this.supabase.approveUser(userId);
      this.unapprovedUsers = this.unapprovedUsers.filter(u => u.id !== userId);
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user');
    }
  }

  async markAsPaid(id: string) {
    try {
      await this.supabase.processWithdrawal(id);
      this.pendingWithdrawals = this.pendingWithdrawals.filter(w => w.id !== id);
      alert('Withdrawal marked as completed!');
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      alert('Failed to process withdrawal');
    }
  }

  createTask() {
    if (!this.newTask.title || !this.newTask.actions) {
      alert('Please fill out task title and actions.');
      return;
    }

    let finalImage = this.newTask.image;
    // If no image is provided but there is a postLink, use microlink to get a screenshot
    if (!finalImage && this.newTask.postLink) {
      finalImage = `https://api.microlink.io/?url=${encodeURIComponent(this.newTask.postLink)}&screenshot=true&meta=false&embed=screenshot.url`;
    } else if (!finalImage) {
      finalImage = 'image_0.png'; // Fallback
    }

    const task = {
      id: Math.random().toString(36).substr(2, 9),
      ...this.newTask,
      image: finalImage
    };

    const saved = localStorage.getItem('admin_tasks');
    let tasks = [];
    if (saved) {
      tasks = JSON.parse(saved);
    } else {
      // Load default tasks if starting fresh
      tasks = [
        { id: '1', title: 'like & retweet @user_x post', image: 'image_0.png', reward: 0.5, boost: 0.05, actions: 'like + comment + retweet' }
      ];
    }

    tasks.unshift(task);
    localStorage.setItem('admin_tasks', JSON.stringify(tasks));
    
    alert('Task successfully uploaded to the dashboard!');
    this.newTask.title = '';
    this.newTask.actions = '';
  }
}
