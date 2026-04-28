import { Component, AfterViewInit, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css'],
})
export class LandingComponent implements AfterViewInit, OnDestroy, OnInit {
  isMobileMenuOpen = false;
  isAdmin = false;
  isLoggedIn = false;
  isBookMeetModalOpen = false;

  bookMeetForm = {
    name: '',
    email: '',
    project: '',
    details: ''
  };

  private _observer: IntersectionObserver | null = null;

  constructor(private router: Router, private authService: AuthService) {}

  ngOnInit() {
    this.authService.currentUser$.subscribe(user => {
      this.isLoggedIn = !!user;
      this.isAdmin = user?.role === 'admin';
    });
  }

  ngAfterViewInit() {
    setTimeout(() => this.initScrollObserver(), 100);
  }

  ngOnDestroy() {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }

  private initScrollObserver() {
    const options = {
      root: null,
      rootMargin: '0px',
      threshold: 0.1,
    };

    this._observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          (entry.target as HTMLElement).classList.add('is-visible');
        }
      });
    }, options);

    document.querySelectorAll('.reveal-section').forEach((el) => {
      this._observer?.observe(el);
    });
  }

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }

  scrollToSection(sectionId: string) {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }

  onBecomeAgent() {
    this.router.navigate(['/signup']);
  }

  joinTelegram() {
    window.open('https://t.me/+3rl2v5b7H-9mNDFk', '_blank');
  }

  openBookMeetModal() {
    this.isBookMeetModalOpen = true;
  }

  closeBookMeetModal() {
    this.isBookMeetModalOpen = false;
  }

  async submitBookMeet() {
    console.log('Meeting request submitted:', this.bookMeetForm);
    alert('Thank you! Your meeting request has been submitted. Our team will contact you soon.');
    this.closeBookMeetModal();
    this.bookMeetForm = { name: '', email: '', project: '', details: '' };
  }
}