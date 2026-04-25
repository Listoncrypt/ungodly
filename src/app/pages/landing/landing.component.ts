import { Component, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-landing',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './landing.component.html',
  styleUrls: ['./landing.component.css'],
})
export class LandingComponent implements AfterViewInit, OnDestroy {
  isMobileMenuOpen = false;
  isBookMeetModalOpen = false;
  
  bookMeetForm = {
    name: '',
    email: '',
    project: '',
    details: ''
  };

  private _observer: IntersectionObserver | null = null;

  constructor(private router: Router) {}

  toggleMobileMenu() {
    this.isMobileMenuOpen = !this.isMobileMenuOpen;
  }

  closeMobileMenu() {
    this.isMobileMenuOpen = false;
  }

  openBookMeetModal() {
    this.isBookMeetModalOpen = true;
    this.closeMobileMenu();
  }

  closeBookMeetModal() {
    this.isBookMeetModalOpen = false;
  }

  submitBookMeet() {
    console.log('Booking request submitted', this.bookMeetForm);
    alert('Your meeting request has been received! Our team will contact you soon.');
    this.closeBookMeetModal();
    this.bookMeetForm = { name: '', email: '', project: '', details: '' };
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
    window.open('https://t.me/Ungodlyachvportfolio', '_blank');
  }

  ngAfterViewInit(): void {
    const options = { root: null, rootMargin: '0px', threshold: 0.12 };
    this._observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        const el = entry.target as HTMLElement;
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
        }
      });
    }, options);

    document.querySelectorAll('.reveal').forEach((el) => {
      this._observer?.observe(el);
    });
  }

  ngOnDestroy(): void {
    if (this._observer) {
      this._observer.disconnect();
      this._observer = null;
    }
  }
}