import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { filter, take, map } from 'rxjs/operators';
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
      // Wait until the session is initialized (currentUser is not undefined)
      filter((user) => user !== undefined),
      take(1),
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

        // Authenticated but not approved - redirect to signup to register again
        // This handles the case where a user was removed from profiles
        this.authService.logout(false).then(() => {
          this.router.navigate(['/signup'], { queryParams: { message: 'profile_removed' } });
        });
        return false;
      })
    );
  }
}
