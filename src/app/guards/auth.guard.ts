import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { AuthService, User } from '../services/auth.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private authService = inject(AuthService);
  private router = inject(Router);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.authService.currentUser$.pipe(
      // Wait until we have a user or we are sure there is no session
      // For now, we take the first value emitted by combineLatest in AuthService
      map((user: User | null) => {
        if (!user) {
          this.router.navigate(['/login'], { queryParams: { returnUrl: state.url } });
          return false;
        }

        // Admins are always allowed
        if (user.role === 'admin') {
          return true;
        }

        // Allow unapproved users to access the onboarding page
        if (state.url.includes('/onboarding')) {
          return true;
        }

        // Check if user is approved
        if (user.is_approved) {
          return true;
        }

        // Authenticated but not approved
        this.router.navigate(['/waiting-approval']);
        return false;
      })
    );
  }
}
