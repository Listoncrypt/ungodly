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
  twitterConnected = false;
  isVerified = false;
  twitterUser: any = null;
  manualHandle = '';

  constructor(
    private fb: FormBuilder,
    private authService: AuthService,
    private supabase: SupabaseService,
    private router: Router
  ) {
    this.signupForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  private userSubscribed = false;

  ngOnInit() {
    this.authService.currentUser$.subscribe((user) => {
      // Guard against infinite loops after logout/disconnect
      if (!user) {
        this.userSubscribed = false;
        this.twitterConnected = false;
        this.twitterUser = null;
        return;
      }

      if (!this.userSubscribed) {
        console.log('User detected in subscription, verifying followers...');
        this.userSubscribed = true;
        this.verifyTwitterFollowers(user);
      }
    });

    // Handle the twitter_success flag specifically once
    const params = new URLSearchParams(window.location.search);
    if (params.get('twitter_success') === 'true') {
      console.log('Twitter success flag detected in URL');
      // Clear the query param so it doesn't trigger again on refresh
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async verifyTwitterFollowers(user: any) {
    this.loading = true;
    this.error = 'Verifying Twitter followers...';
    
    const twitterData = await this.authService.getTwitterFollowers();
    
    if (twitterData === null) {
      console.error('DEBUG: Twitter verification returned null. Showing manual fallback.');
      this.error = 'We connected your X account but couldn\'t automatically find your follower count.';
      this.twitterConnected = true; 
      this.isVerified = true; // Allow them to see the form
      this.loading = false;
      return;
    }

    const { followersCount, isVerified } = twitterData;

    if (followersCount < 1000) {
      this.error = `Note: You have ${followersCount} followers. You can sign up, but your account will only be visible to admins for approval once you reach 1,000 followers.`;
    } else {
      this.error = '';
    }

    this.twitterConnected = true;
    this.isVerified = true;
    this.twitterUser = { ...user, followersCount, isVerified };
    this.loading = false;
  }

  async verifyManualHandle() {
    if (!this.manualHandle) {
      this.error = 'Please enter your Twitter handle.';
      return;
    }
    
    this.loading = true;
    this.error = 'Verifying handle...';
    
    try {
      const result = await this.authService.verifyFollowersByHandle(this.manualHandle);
      if (result) {
        if (result.followersCount >= 1000) {
          this.error = '';
        } else {
          this.error = `Note: @${this.manualHandle} has ${result.followersCount} followers. You can sign up, but admins only approve accounts with 1,000+ followers.`;
        }
        
        this.isVerified = true;
        this.twitterUser = { 
          ...(this.twitterUser || {}), 
          followersCount: result.followersCount,
          twitterHandle: this.manualHandle,
          isVerified: result.isVerified 
        };
      } else {
        this.error = 'Could not find followers for this handle. Please check the spelling and ensure your profile is public.';
      }
    } catch (err) {
      this.error = 'Verification failed. Please try again later.';
    } finally {
      this.loading = false;
    }
  }

  async connectTwitter() {
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

  async disconnectTwitter() {
    this.loading = true;
    try {
      await this.authService.logout(false);
      this.twitterConnected = false;
      this.twitterUser = null;
      this.loading = false;
    } catch (err) {
      this.loading = false;
      this.error = 'Failed to disconnect Twitter account.';
    }
  }

    } finally {
      this.loading = false;
    }
  }

  skipVerification() {
    this.isVerified = true;
    this.error = 'Note: You can proceed, but admins will only approve your account if they can verify you have 1,000+ followers.';
  }

  onSubmit() {
    if (this.signupForm.valid && this.twitterConnected) {
      this.loading = true;
      this.error = '';
      const { email, password } = this.signupForm.value;

      this.authService.signup(email, password).subscribe({
        next: (user) => {
          this.loading = false;
          const hasVerifiedBoost = this.twitterUser?.isVerified ? 10 : 0;
          const combinedUser = {
            ...user,
            ...this.twitterUser,
            verified: this.twitterUser?.isVerified || false,
            boost: (user.boost || 0) + hasVerifiedBoost,
            balance: (user.balance || 0) + 5,
            followersCount: this.twitterUser?.followersCount || 0
          };
          this.authService.updateUser(combinedUser);
          
          // Wait for the auth trigger to create the profile row, then update it
          setTimeout(async () => {
            try {
              await this.supabase.updateProfile(user.id, {
                twitter_handle: this.twitterUser?.twitterHandle,
                twitter_followers: this.twitterUser?.followersCount,
                balance: combinedUser.balance
              });
              this.router.navigate(['/onboarding']);
            } catch (updateErr) {
              console.error('Failed to update profile data', updateErr);
              this.router.navigate(['/onboarding']); // proceed anyway
            }
          }, 1000);
        },
        error: (err) => {
          this.loading = false;
          this.error = 'Account creation failed: ' + (err.message || 'Unknown error');
        },
      });
    } else if (!this.twitterConnected) {
      this.error = 'Please connect your Twitter account first';
    }
  }

  togglePasswordVisibility() {
    this.showPassword = !this.showPassword;
  }
}
