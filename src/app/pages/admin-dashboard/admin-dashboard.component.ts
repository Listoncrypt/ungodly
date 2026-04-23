import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SupabaseService, Profile } from '../../services/supabase.service';

@Component({
  selector: 'app-admin-dashboard',
  standalone: true,
  imports: [CommonModule],
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
    </div>
  `
})
export class AdminDashboardComponent implements OnInit {
  unapprovedUsers: Profile[] = [];
  loading = true;

  constructor(private supabase: SupabaseService) {}

  ngOnInit() {
    this.loadUsers();
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

  async approve(userId: string) {
    try {
      await this.supabase.approveUser(userId);
      // Remove the user from the list locally
      this.unapprovedUsers = this.unapprovedUsers.filter(u => u.id !== userId);
    } catch (error) {
      console.error('Error approving user:', error);
      alert('Failed to approve user');
    }
  }
}
