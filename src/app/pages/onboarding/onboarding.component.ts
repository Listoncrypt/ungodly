import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../services/auth.service';

interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

@Component({
  selector: 'app-onboarding',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './onboarding.component.html',
  styleUrls: ['./onboarding.component.css'],
})
export class OnboardingComponent implements OnInit {
  joined = false;
  allCompleted = false;

  checklist: ChecklistItem[] = [
    { id: 'signup', label: 'Sign up for account', completed: false },
    { id: 'telegram', label: 'Join Telegram channel', completed: false },
    { id: 'dashboard', label: 'Start earning on dashboard', completed: false },
  ];

  constructor(private authService: AuthService, private router: Router) {}

  ngOnInit() {
    // Mark signup as completed since user is authenticated
    this.checklist[0].completed = true;
    this.updateAllCompleted();
  }

  joinTelegramChannel() {
    this.joined = true;
    // Mark Telegram task as completed
    this.checklist[1].completed = true;
    this.updateAllCompleted();
    console.log('Joining Telegram channel...');
    // Open Telegram in a new window
    window.open('https://t.me/+3rl2v5b7H-9mNDFk', '_blank');
  }

  updateAllCompleted() {
    // All tasks completed when signup and telegram are done
    this.allCompleted = this.checklist[0].completed && this.checklist[1].completed;
  }

  proceedToDashboard() {
    // Mark dashboard task as completed
    this.checklist[2].completed = true;
    console.log('Proceeding to dashboard...');
    this.router.navigate(['/dashboard']);
  }
}
