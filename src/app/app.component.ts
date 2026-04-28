import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, RouterOutlet, Router, NavigationEnd } from '@angular/router';
import { filter } from 'rxjs/operators';
import { AuthService } from './services/auth.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  template: `
    <div class="min-h-screen bg-gray-50">
      <header
        *ngIf="!isLandingPage"
        class="sticky top-0 z-30 bg-white/95 backdrop-blur border-b border-slate-200"
      >
        <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div class="flex items-center justify-between">
            <a routerLink="/" class="inline-flex items-center gap-2 sm:gap-3 flex-shrink-0">
              <span class="text-xs sm:text-sm font-semibold tracking-[0.35em] uppercase text-slate-700">UNGODLY</span>
              <span class="text-xl sm:text-2xl font-black text-black">ACHV</span>
            </a>

            <nav class="hidden md:flex items-center gap-6 text-sm text-slate-600">
              <a *ngIf="isAdmin" routerLink="/admin-dashboard" class="text-gray-900 font-bold hover:text-blue-600 transition-colors">Admin Portal</a>
              <a routerLink="/login" class="hover:text-slate-900 transition-colors">Login</a>
              <a routerLink="/signup" class="hover:text-slate-900 transition-colors">Sign up</a>
            </nav>

            <button
              (click)="toggleMobileMenu()"
              class="md:hidden p-2 rounded-md text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              aria-label="Toggle menu"
            >
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path *ngIf="!isMobileMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"></path>
                <path *ngIf="isMobileMenuOpen" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
              </svg>
            </button>
          </div>

          <nav
            *ngIf="isMobileMenuOpen"
            class="md:hidden mt-4 pt-4 border-t border-slate-200 space-y-2"
          >
            <a
              *ngIf="isAdmin"
              routerLink="/admin-dashboard"
              (click)="closeMobileMenu()"
              class="block px-3 py-2 text-gray-900 font-bold hover:bg-gray-50 rounded-md transition-colors"
            >
              Admin Portal
            </a>
            <a
              routerLink="/login"
              (click)="closeMobileMenu()"
              class="block px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
            >
              Login
            </a>
            <a
              routerLink="/signup"
              (click)="closeMobileMenu()"
              class="block px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
            >
              Sign up
            </a>
            <a
              routerLink="/dashboard"
              (click)="closeMobileMenu()"
              class="block px-3 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-50 rounded-md transition-colors"
            >
              Dashboard
            </a>
          </nav>
        </div>
      </header>
      <main [class.pt-6]="!isLandingPage">
        <router-outlet></router-outlet>
      </main>
    </div>
  `,
  styles: [],
})
export class AppComponent implements OnInit {
  title = 'Engagement Platform';
  isMobileMenuOpen = false;
  isLandingPage = true;
  isAdmin = false;

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit() {
    this.router.events
      .pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd))
      .subscribe((event: NavigationEnd) => {
        this.isLandingPage = event.url === '/';
      });

    this.authService.currentUser$.subscribe(user => {
      this.isAdmin = user?.role === 'admin';
    });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }
}
