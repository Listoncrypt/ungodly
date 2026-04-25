import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { AuthService } from '../../services/auth.service';
import { SupabaseService } from '../../services/supabase.service';

@Component({
  selector: 'app-signup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterModule],
  templateUrl: './signup.component.html',
  styleUrls: ['./signup.component.css'],
})
export class SignupComponent implements OnInit {
  signupForm: FormGroup;
  showPassword = false;
  loading = false;
  error = '';
  twitterConnected = false;
  twitterUser: any = null;

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

  ngOnInit() {
    this.authService.currentUser$.subscribe((user) => {
      if (user && !this.twitterConnected) {
        this.verifyTwitterFollowers(user);
      }
    });

    const currentUser = this.authService.getCurrentUser();
    if (currentUser && !this.twitterConnected) {
      this.verifyTwitterFollowers(currentUser);
    }
  }

  async verifyTwitterFollowers(user: any) {
    this.loading = true;
    this.error = 'Verifying Twitter followers...';
    
    const twitterData = await this.authService.getTwitterFollowers();
    
    if (twitterData === null) {
      this.error = 'Unable to verify your X/Twitter followers. Please ensure your account has public metrics visible or try reconnecting. Note: We require OAuth 2.0 with "users.read" permissions.';
      this.loading = false;
      this.disconnectTwitter();
      return;
    }

    const { followersCount, isVerified } = twitterData;

    if (followersCount < 1000) {
      this.error = `X/Twitter account must have at least 1,000 followers to register. You currently have ${followersCount}.`;
      this.loading = false;
      this.disconnectTwitter();
      return;
    }

    this.error = '';
    this.twitterConnected = true;
    this.twitterUser = { ...user, followersCount, isVerified };
    this.loading = false;
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
