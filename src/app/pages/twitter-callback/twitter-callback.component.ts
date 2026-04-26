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

  private async processTwitterCallback(retryCount = 0): Promise<void> {
    const params = new URLSearchParams(window.location.search);
    const success = params.get('success');
    const error = params.get('error');
    const twitterHandle = params.get('twitter_handle');
    const followersCount = params.get('followers_count');
    const isVerified = params.get('is_verified');

    if (error) {
      console.error('Twitter OAuth error:', error);
      this.router.navigate(['/signup'], { queryParams: { error: 'twitter_auth_failed', details: error } });
      return;
    }

    if (success === 'true' && twitterHandle && followersCount) {
      // Store Twitter data in session storage for the signup page
      sessionStorage.setItem('twitter_auth_data', JSON.stringify({
        twitterHandle,
        followersCount: parseInt(followersCount),
        isVerified: isVerified === 'true'
      }));
      
      console.log('Twitter OAuth successful, redirecting to signup...');
      this.router.navigate(['/signup'], { 
        queryParams: { 
          twitter_success: 'true',
          twitter_handle: twitterHandle,
          followers_count: followersCount
        } 
      });
      return;
    }

    // If no success data, redirect to signup with error
    this.router.navigate(['/signup'], { queryParams: { error: 'auth_timeout' } });
  }
}
