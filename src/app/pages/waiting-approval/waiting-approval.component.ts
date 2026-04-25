import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-waiting-approval',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-[#0F172A] flex items-center justify-center p-4">
      <div class="max-w-md w-full bg-[#1E293B] rounded-2xl p-8 shadow-2xl border border-gray-800 text-center">
        <div class="w-20 h-20 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-6">
          <svg class="w-10 h-10 text-blue-400 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>
        
        <h1 class="text-2xl font-bold text-white mb-4">Waiting for Approval</h1>
        
        <p class="text-gray-400 mb-8">
          Your account has been created successfully. To prevent spam, an admin must verify your profile before you can access the dashboard.
        </p>

        <div class="space-y-4">
          <a 
            href="https://t.me/+3rl2v5b7H-9mNDFk" 
            target="_blank"
            class="block w-full bg-[#229ED9] hover:bg-[#229ED9]/90 text-white font-semibold py-3 px-6 rounded-xl transition-all transform hover:scale-[1.02]"
          >
            Join agent channel for task reminders
          </a>

          <a 
            href="https://t.me/Iamhimtrueraver" 
            target="_blank"
            class="block w-full bg-white/5 hover:bg-white/10 text-white font-medium py-3 px-6 rounded-xl border border-white/10 transition-all"
          >
            Contact Team
          </a>
          
          <button 
            (click)="logout()"
            class="block w-full bg-transparent border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 font-medium py-3 px-6 rounded-xl transition-all"
          >
            Logout
          </button>
        </div>
        
        <p class="mt-8 text-xs text-gray-500">
          Tip: Approvals usually take less than 24 hours.
        </p>
      </div>
    </div>
  `
})
export class WaitingApprovalComponent implements OnInit, OnDestroy {
  private authSubscription: Subscription | null = null;

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    // Subscribe to auth changes to automatically redirect when approved
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      if (user?.is_approved || user?.role === 'admin') {
        console.log('User approved, redirecting to dashboard...');
        this.router.navigate(['/dashboard']);
      }
    });
  }

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
  }

  logout() {
    this.authService.logout();
  }
}
