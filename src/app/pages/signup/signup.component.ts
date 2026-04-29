import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators, FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, FormsModule, RouterModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css'],
})
export class SignupComponent implements OnInit {
  signupForm: FormGroup;
  showPassword = false;
  loading = false;
  error = '';
  twitterVerified = false;
  twitterHandle = '';
  followersCount = 0;
  isTwitterVerified = false;

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router
  ) {
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      twitterHandle: ['', [Validators.required]]
    });
  }

  ngOnInit() {
    // Check if user returned from Twitter OAuth
    const params = new URLSearchParams(window.location.search);
    const twitterSuccess = params.get('twitter_success') === 'true' || params.get('success') === 'true';
    const error = params.get('error');
    const details = params.get('details');
    
    if (error) {
      this.error = decodeURIComponent(details || error);
      this.twitterVerified = false;
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (twitterSuccess) {
      const authData = sessionStorage.getItem('twitter_auth_data');
      if (authData) {
        const data = JSON.parse(authData);
        this.twitterHandle = data.twitterHandle || params.get('twitter_handle') || '';
        this.followersCount = data.followersCount || parseInt(params.get('followers_count') || '0');
        this.isTwitterVerified = data.isVerified || params.get('is_verified') === 'true';

        if (data.accessToken) localStorage.setItem('twitter_access_token', data.accessToken);
        if (data.refreshToken) localStorage.setItem('twitter_refresh_token', data.refreshToken);
        if (data.twitterUserId) localStorage.setItem('twitter_user_id', data.twitterUserId);
      } else {
        // Fallback to query params
        this.twitterHandle = params.get('twitter_handle') || '';
        this.followersCount = parseInt(params.get('followers_count') || '0');
        this.isTwitterVerified = params.get('is_verified') === 'true';
        
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const twitterUserId = params.get('twitter_user_id');
        
        if (accessToken) localStorage.setItem('twitter_access_token', accessToken);
        if (refreshToken) localStorage.setItem('twitter_refresh_token', refreshToken);
        if (twitterUserId) localStorage.setItem('twitter_user_id', twitterUserId);
      }

      this.signupForm.patchValue({ twitterHandle: this.twitterHandle });
      this.twitterVerified = true;
      this.error = '';
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async connectWithTwitter() {
    this.loading = true;
    this.error = '';
    try {
      await this.authService.initiateTwitterAuth();
    } catch (err) {
      this.loading = false;
      this.error = 'Unable to start Twitter authentication. Please try again.';
      console.error('Twitter auth start failed', err);
    }
  }

  onSubmit() {
    if (this.signupForm.invalid) {
      this.error = 'Please fill in all fields correctly.';
      return;
    }

    if (!this.twitterVerified) {
      this.error = 'Please verify your Twitter account has 1,000+ followers first.';
      return;
    }

    console.log('Submitting signup with followers:', this.followersCount);

    this.loading = true;
    this.error = '';
    const { email, password } = this.signupForm.value;

    this.authService.signup(email, password).subscribe({
      next: (user) => {
        this.loading = false;

        const combinedUser = {
          ...user,
          twitterHandle: this.twitterHandle,
          twitterId: this.twitterHandle,
          verified: this.isTwitterVerified,
          followersCount: this.followersCount,
          boost: this.followersCount >= 1000 ? 10 : 0,
          balance: 0
        };
        this.authService.updateUser(combinedUser);

        setTimeout(async () => {
          try {
            console.log('Updating profile with twitter_followers:', this.followersCount);
            await this.supabase.updateProfile(user.id, {
              twitter_handle: this.twitterHandle,
              twitter_followers: this.followersCount,
              balance: combinedUser.balance,
              is_verified: this.isTwitterVerified
            });
            console.log('Profile updated successfully');
            this.router.navigate(['/onboarding']);
          } catch (updateErr) {
            console.error('Failed to update profile data', updateErr);
            this.router.navigate(['/onboarding']);
          }
        }, 1000);
      },
      error: (err) => {
        this.loading = false;
        this.error = 'Account creation failed: ' + (err.message || 'Unknown error');
      },
    });
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
