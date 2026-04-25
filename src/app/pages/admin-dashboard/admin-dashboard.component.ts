import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { SupabaseService, Profile } from '../../services/supabase.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="min-h-screen bg-[#0B0F1A] text-gray-100 p-4 sm:p-8">
      <div class="max-w-6xl mx-auto space-y-8">
        
        <!-- Header -->
        <div class="flex items-center justify-between">
          <h1 class="text-3xl font-bold bg-gradient-to-r from-blue-400 to-indigo-500 bg-clip-text text-transparent">
            Admin Management Portal
          </h1>
          <div class="px-4 py-1 bg-blue-500/10 border border-blue-500/20 rounded-full text-blue-400 text-sm font-medium">
            System Admin
          </div>
        </div>

        <!-- 1. User Approvals -->
        <section class="bg-[#161B2B] rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
          <div class="p-6 border-b border-gray-800 bg-[#1C2237]">
            <h2 class="text-xl font-bold">Pending Access Requests</h2>
          </div>
          <div class="p-6">
            <div *ngIf="loading" class="flex items-center justify-center py-8">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
            </div>
            
            <div *ngIf="!loading && unapprovedUsers.length === 0" class="text-center py-12 text-gray-500 italic">
              All user requests have been processed.
            </div>

            <div *ngIf="!loading && unapprovedUsers.length > 0" class="overflow-x-auto">
              <table class="w-full text-left">
                <thead>
                  <tr class="text-gray-400 text-sm uppercase tracking-wider">
                    <th class="pb-4 px-2">User Email</th>
                    <th class="pb-4 px-2">Role</th>
                    <th class="pb-4 px-2">Followers</th>
                    <th class="pb-4 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-800">
                  <tr *ngFor="let user of unapprovedUsers" class="group hover:bg-white/5 transition-colors">
                    <td class="py-4 px-2">{{ user.email }}</td>
                    <td class="py-4 px-2">
                      <span class="text-xs font-mono bg-blue-900/30 text-blue-300 px-2 py-1 rounded">User</span>
                    </td>
                    <td class="py-4 px-2 font-bold text-gray-300">
                      {{ user.twitter_followers || 0 | number }}
                    </td>
                    <td class="py-4 px-2 text-right space-x-2">
                      <button (click)="approve(user.id)" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold transition">
                        Allow
                      </button>
                      <button (click)="decline(user.id)" class="bg-red-600/20 hover:bg-red-600 text-red-500 hover:text-white px-4 py-2 rounded-lg text-sm font-semibold transition border border-red-600/30">
                        Decline
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <!-- 2. Task Management -->
        <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          <!-- Create Task Form -->
          <div class="lg:col-span-1 space-y-6">
            <section class="bg-[#161B2B] rounded-2xl border border-gray-800 p-6 shadow-xl">
              <h2 class="text-xl font-bold mb-6">Create New Task</h2>
              <div class="space-y-4">
                <div>
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Title</label>
                  <input type="text" [(ngModel)]="newTask.title" class="w-full bg-[#0B0F1A] border border-gray-800 rounded-xl p-3 focus:border-blue-500 outline-none transition" placeholder="Like & Retweet...">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-1">X.com Link</label>
                  <input type="text" [(ngModel)]="newTask.postLink" class="w-full bg-[#0B0F1A] border border-gray-800 rounded-xl p-3 focus:border-blue-500 outline-none transition" placeholder="https://x.com/...">
                </div>
                <div>
                  <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Actions Required</label>
                  <input type="text" [(ngModel)]="newTask.actions" class="w-full bg-[#0B0F1A] border border-gray-800 rounded-xl p-3 focus:border-blue-500 outline-none transition" placeholder="Like + Comment...">
                </div>
                <div class="grid grid-cols-2 gap-4">
                  <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Reward ($)</label>
                    <input type="number" [(ngModel)]="newTask.reward" class="w-full bg-[#0B0F1A] border border-gray-800 rounded-xl p-3 focus:border-blue-500 outline-none transition">
                  </div>
                  <div>
                    <label class="block text-xs font-bold text-gray-500 uppercase mb-1">Boost ($)</label>
                    <input type="number" [(ngModel)]="newTask.boost" class="w-full bg-[#0B0F1A] border border-gray-800 rounded-xl p-3 focus:border-blue-500 outline-none transition">
                  </div>
                </div>
                <button (click)="createTask()" class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-blue-900/20 transition">
                  Publish Task
                </button>
              </div>
            </section>
          </div>

          <!-- Existing Tasks List -->
          <div class="lg:col-span-2">
            <section class="bg-[#161B2B] rounded-2xl border border-gray-800 overflow-hidden shadow-xl h-full">
              <div class="p-6 border-b border-gray-800 bg-[#1C2237] flex justify-between items-center">
                <h2 class="text-xl font-bold">Active Tasks</h2>
                <span class="text-xs bg-gray-800 text-gray-400 px-2 py-1 rounded-full">{{ existingTasks.length }} Total</span>
              </div>
              <div class="p-6">
                <div *ngIf="existingTasks.length === 0" class="text-center py-12 text-gray-500 italic">
                  No tasks have been published yet.
                </div>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div *ngFor="let task of existingTasks" class="bg-[#0B0F1A] p-4 rounded-2xl border border-gray-800 group relative">
                    <button (click)="deleteTask(task.id)" class="absolute top-2 right-2 text-gray-600 hover:text-red-500 transition-colors p-2">
                      <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                    <div class="pr-8">
                      <h3 class="font-bold text-sm mb-1 truncate">{{ task.title }}</h3>
                      <p class="text-xs text-gray-500 mb-2 truncate">{{ task.actions }}</p>
                      <div class="flex items-center gap-3">
                        <span class="text-xs font-bold text-blue-400">Reward: \${{ task.reward }}</span>
                        <span class="text-xs font-bold text-green-500">Boost: \${{ task.boost }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>

        <!-- 3. Withdrawal Requests -->
        <section class="bg-[#161B2B] rounded-2xl border border-gray-800 overflow-hidden shadow-xl">
          <div class="p-6 border-b border-gray-800 bg-[#1C2237]">
            <h2 class="text-xl font-bold">Withdrawal Queue</h2>
          </div>
          <div class="p-6">
            <div *ngIf="loadingWithdrawals" class="flex items-center justify-center py-8">
              <div class="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
            </div>
            
            <div *ngIf="!loadingWithdrawals && pendingWithdrawals.length === 0" class="text-center py-12 text-gray-500 italic">
              No pending withdrawals.
            </div>

            <div *ngIf="!loadingWithdrawals && pendingWithdrawals.length > 0" class="overflow-x-auto">
              <table class="w-full text-left">
                <thead>
                  <tr class="text-gray-400 text-sm uppercase tracking-wider">
                    <th class="pb-4 px-2">User Email</th>
                    <th class="pb-4 px-2">Twitter</th>
                    <th class="pb-4 px-2">Amount</th>
                    <th class="pb-4 px-2">Solana Wallet</th>
                    <th class="pb-4 px-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-gray-800">
                  <tr *ngFor="let w of pendingWithdrawals" class="hover:bg-white/5 transition-colors">
                    <td class="py-4 px-2 text-sm">{{ w.email }}</td>
                    <td class="py-4 px-2 text-sm text-blue-400">{{ w.twitter_handle || 'N/A' }}</td>
                    <td class="py-4 px-2 font-bold text-green-400">\${{ w.amount }}</td>
                    <td class="py-4 px-2 text-xs font-mono text-gray-400 break-all max-w-[180px]">{{ w.solana_address }}</td>
                    <td class="py-4 px-2 text-right">
                      <button (click)="markAsPaid(w.id)" class="bg-green-600 hover:bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-semibold shadow-lg shadow-green-900/20 transition">
                        Mark Paid
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </section>

      </div>
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  unapprovedUsers: Profile[] = [];
  pendingWithdrawals: any[] = [];
  existingTasks: any[] = [];
  loading = true;
  loadingWithdrawals = true;
  
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
    this.loadTasks();
  }

  async loadTasks() {
    try {
      this.existingTasks = await this.supabase.getTasks();
    } catch (error) {
      console.error('Error loading tasks:', error);
    }
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
      alert('User access granted!');
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
        alert('User request declined and removed.');
      } catch (error) {
        console.error('Error declining user:', error);
        alert('Failed to decline user');
      }
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
      } catch (error) {
        console.error('Failed to delete task:', error);
        alert('Failed to delete task');
      }
    }
  }
}
