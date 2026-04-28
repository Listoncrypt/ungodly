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
    const twitterSuccess = params.get('twitter_success');
    const error = params.get('error');
    const details = params.get('details');
    const followersCount = params.get('followers_count');
    
    if (error) {
      this.error = decodeURIComponent(details || error);
      this.twitterVerified = false;
      // Clear the query params
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }
    
    if (twitterSuccess === 'true') {
      const authData = sessionStorage.getItem('twitter_auth_data');
      if (authData) {
        const data = JSON.parse(authData);
        this.twitterHandle = data.twitterHandle || params.get('twitter_handle') || '';
        this.followersCount = data.followersCount || parseInt(params.get('followers_count') || '0');
        this.isTwitterVerified = data.isVerified || params.get('is_verified') === 'true';

        console.log('Twitter data loaded:', {
          handle: this.twitterHandle,
          followers: this.followersCount,
          verified: this.isTwitterVerified
        });

        if (data.accessToken) {
          localStorage.setItem('twitter_access_token', data.accessToken);
          console.log('Twitter access token saved to localStorage');
        }
        if (data.twitterUserId) {
          localStorage.setItem('twitter_user_id', data.twitterUserId);
          console.log('Twitter user ID saved to localStorage');
        }
      } else {
        // Fallback to query params if sessionStorage is empty
        this.twitterHandle = params.get('twitter_handle') || '';
        this.followersCount = parseInt(params.get('followers_count') || '0');
        this.isTwitterVerified = params.get('is_verified') === 'true';
        console.log('Using query params fallback:', {
          handle: this.twitterHandle,
          followers: this.followersCount
        });

        const accessToken = params.get('access_token');
        const twitterUserId = params.get('twitter_user_id');
        if (accessToken) {
          localStorage.setItem('twitter_access_token', accessToken);
        }
        if (twitterUserId) {
          localStorage.setItem('twitter_user_id', twitterUserId);
        }
      }

      // Update form with Twitter handle
      this.signupForm.patchValue({ twitterHandle: this.twitterHandle });

      // Twitter connected successfully — admin approval handles access control
      this.twitterVerified = true;
      this.error = '';

      // Clear the query params
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
          boost: this.isTwitterVerified ? 10 : 0,
          balance: 5
        };
        this.authService.updateUser(combinedUser);

        setTimeout(async () => {
          try {
            console.log('Updating profile with twitter_followers:', this.followersCount);
            await this.supabase.updateProfile(user.id, {
              twitter_handle: this.twitterHandle,
              twitter_followers: this.followersCount,
              balance: combinedUser.balance
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
