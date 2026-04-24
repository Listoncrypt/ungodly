import { Routes } from '@angular/router';
import { AuthGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () =>
      import('./pages/landing/landing.component').then((m) => m.LandingComponent),
  },
  {
    path: 'signup',
    loadComponent: () =>
      import('./pages/signup/signup.component').then((m) => m.SignupComponent),
  },
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'waiting-approval',
    loadComponent: () =>
      import('./pages/waiting-approval/waiting-approval.component').then((m) => m.WaitingApprovalComponent),
  },
  {
    path: 'auth/twitter/callback',
    loadComponent: () =>
      import('./pages/twitter-callback/twitter-callback.component').then(
        (m) => m.TwitterCallbackComponent
      ),
  },
  {
    path: 'onboarding',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/onboarding/onboarding.component').then(
        (m) => m.OnboardingComponent
      ),
  },
  {
    path: 'dashboard',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/dashboard/dashboard.component').then(
        (m) => m.DashboardComponent
      ),
  },
  {
    path: 'admin-dashboard',
    canActivate: [AuthGuard],
    loadComponent: () =>
      import('./pages/admin-dashboard/admin-dashboard.component').then(
        (m) => m.AdminDashboardComponent
      ),
  },
  {
    path: '**',
    redirectTo: '',
  },
];
