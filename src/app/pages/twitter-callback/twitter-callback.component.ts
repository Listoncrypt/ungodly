import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-twitter-callback',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="min-h-screen flex items-center justify-center bg-gray-50">
      <div class="max-w-md w-full space-y-8 text-center">
        <div class="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div class="flex justify-center">
            <svg class="animate-spin h-8 w-8 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
              <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          </div>
          <h2 class="mt-6 text-center text-2xl font-extrabold text-gray-900">Connecting to Twitter...</h2>
          <p class="mt-2 text-center text-sm text-gray-600">Please wait while we complete your authentication.</p>
        </div>
      </div>
    </div>
  `,
  styles: [],
})
export class TwitterCallbackComponent implements OnInit {
  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit() {
    this.processTwitterCallback();
  }

  private processTwitterCallback(retryCount = 0): void {
    const params = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const error = params.get('error') || hashParams.get('error');
    
    if (error) {
      console.error('Twitter OAuth error:', error);
      this.router.navigate(['/signup'], { queryParams: { error: 'twitter_auth_failed' } });
      return;
    }

    // Supabase stores the session in localStorage after redirect.
    // We wait for it to be ready.
    setTimeout(async () => {
      const { data: { session } } = await this.authService.supabaseService.client.auth.getSession();
      
      if (session) {
        console.log('Twitter session found, redirecting to signup...');
        this.router.navigate(['/signup'], { queryParams: { twitter_success: 'true' } });
      } else if (retryCount < 5) {
        console.log(`Session not found yet, retrying... (${retryCount + 1}/5)`);
        this.processTwitterCallback(retryCount + 1);
      } else {
        console.error('Twitter authentication timed out - no session found');
        this.router.navigate(['/signup'], { queryParams: { error: 'auth_timeout' } });
      }
    }, retryCount === 0 ? 1000 : 1500); // Wait 1s first, then 1.5s between retries
  }
}
