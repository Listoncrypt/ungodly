import { Component, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-waiting-approval',
  standalone: true,
  imports: [CommonModule, RouterModule],
  template: `
    <div class="min-h-screen bg-gray-50 flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div class="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 shadow-[0_20px_50px_rgba(0,0,0,0.05)] border border-gray-100 text-center relative overflow-hidden">
        <!-- Top decoration -->
        <div class="absolute top-0 left-0 w-full h-1.5 bg-gray-900"></div>
        
        <div class="w-20 h-20 bg-gray-50 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-sm">
          <svg class="w-10 h-10 text-gray-900 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
        </div>

        <h1 class="text-3xl font-black text-gray-900 mb-4 tracking-tight">Reviewing Profile</h1>

        <p class="text-gray-500 text-sm leading-relaxed mb-10">
          Your account has been created. To maintain quality, an admin must verify your profile before you can access the dashboard.
        </p>

        <div class="space-y-4">
          <a
            href="https://t.me/+3rl2v5b7H-9mNDFk"
            target="_blank"
            class="group flex items-center justify-center gap-3 w-full bg-gray-900 hover:bg-gray-800 text-white font-bold py-4 px-6 rounded-2xl transition-all shadow-lg hover:shadow-gray-200 active:scale-[0.98]"
          >
            <svg class="w-5 h-5 text-white/80 group-hover:scale-110 transition-transform" fill="currentColor" viewBox="0 0 24 24">
              <path d="M11.944 0C5.352 0 0 5.352 0 12s5.352 12 12 12 12-5.352 12-12S18.648 0 11.944 0zM17.5 7.5l-2.5 11.5c-.1.5-.6.8-1.1.8-.1 0-.3 0-.4-.1l-4.5-2.5-2.5 2.5c-.2.2-.5.3-.8.3-.1 0-.2 0-.3-.1-.3-.1-.5-.5-.5-.8v-3.5l8.5-8.5-10.5 7.5-3.5-1.5c-.5-.2-.7-.7-.6-1.2.1-.5.6-.8 1.1-.9l16.5-6.5c.5-.2 1.1 0 1.3.5.2.5 0 1.1-.5 1.3z"/>
            </svg>
            Join Telegram
          </a>
          <p class="text-[12px] text-gray-500 font-bold mt-4 px-2">Join to complete your signup and get notified when your application is accepted.</p>

          <div class="grid grid-cols-2 gap-3 mt-8">
            <button
              (click)="refreshStatus()"
              class="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-900 font-bold py-3.5 px-4 rounded-xl border border-gray-200 transition-all active:scale-[0.98]"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Status
            </button>
            <a
              href="https://t.me/Iamhimtrueraver"
              target="_blank"
              class="flex items-center justify-center gap-2 bg-gray-50 hover:bg-gray-100 text-gray-900 font-bold py-3.5 px-4 rounded-xl border border-gray-200 transition-all active:scale-[0.98]"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
              </svg>
              Contact
            </a>
          </div>

          <button
            (click)="logout()"
            class="block w-full text-gray-400 hover:text-gray-900 font-bold py-3 text-xs uppercase tracking-widest transition-all mt-4"
          >
            Sign out
          </button>
        </div>

        <div class="mt-10 pt-8 border-t border-gray-50">
          <p class="text-[11px] text-gray-400 font-medium italic">
            "Quality over quantity. Approvals usually process within 24 hours."
          </p>
        </div>
      </div>
    </div>
  `
})
export class WaitingApprovalComponent implements OnInit, OnDestroy {
  private authSubscription: Subscription | null = null;
  private refreshInterval: any = null;

  constructor(
    private authService: AuthService,
    private supabaseService: SupabaseService,
    private router: Router
  ) {}

  ngOnInit() {
    // Subscribe to auth changes to automatically redirect when approved
    this.authSubscription = this.authService.currentUser$.subscribe(user => {
      if (user?.is_approved || user?.role === 'admin') {
        console.log('User approved, redirecting to dashboard...');
        this.router.navigate(['/dashboard']);
      }
    });

    // Periodically refresh profile to pick up manual approvals
    this.refreshInterval = setInterval(() => {
      this.refreshStatus();
    }, 10000); // Check every 10 seconds
  }

  async refreshStatus() {
    try {
      await this.supabaseService.refreshProfile();
    } catch (error) {
      console.error('Failed to refresh profile:', error);
    }
  }

  ngOnDestroy() {
    if (this.authSubscription) {
      this.authSubscription.unsubscribe();
    }
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
    }
  }

  logout() {
    this.authService.logout();
  }
}
