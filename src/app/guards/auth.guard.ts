import { Injectable, inject } from '@angular/core';
import { Observable, from, of } from 'rxjs';
import { filter, take, map, switchMap } from 'rxjs/operators';
import {
  CanActivate,
  ActivatedRouteSnapshot,
  RouterStateSnapshot,
  Router,
} from '@angular/router';
import { AuthService, User } from '../services/auth.service';
import { SupabaseService } from '../services/supabase.service';

@Injectable({
  providedIn: 'root',
})
export class AuthGuard implements CanActivate {
  private authService = inject(AuthService);
  private router = inject(Router);
  private supabaseService = inject(SupabaseService);

  canActivate(
    route: ActivatedRouteSnapshot,
    state: RouterStateSnapshot
  ): Observable<boolean> {
    return this.authService.currentUser$.pipe(
      // Wait until the session is initialized (currentUser is not undefined)
      filter((user): user is User | null => user !== undefined),
      take(1),
      switchMap(async (user: User | null) => {
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

        // Authenticated but not approved - check if profile exists in database
        const profileExists = await this.supabaseService.profileExists(user.id);
        if (!profileExists) {
          // Profile doesn't exist - user was deleted, redirect to signup
          await this.authService.logout(false);
          this.router.navigate(['/signup'], { queryParams: { message: 'profile_removed' } });
          return false;
        }

        // Profile exists but not approved - redirect to waiting-approval
        this.router.navigate(['/waiting-approval']);
        return false;
      })
    );
  }
}
