// Shared types for the application

export interface UserPreferences {
  language: string; // 'en' | 'es' | 'fr' etc.
  currency: string; // 'USD' | 'EUR' | 'INR' etc.
  theme: 'light' | 'dark' | 'system';
  notifications: {
    pushEnabled: boolean;
    achievementEnabled: boolean;
    reminderDays: number[]; // e.g. [7, 3, 1, 0] (days before due date to notify)
    quietHoursStart: string; // 'HH:MM'
    quietHoursEnd: string; // 'HH:MM'
    sound: string; // 'default' | 'none'
    vibration: boolean;
    maxDaily: number;
  };
}

export interface UserProfile {
  id: string;
  fullName: string;
  email: string;
  avatarUrl?: string;
  preferences: UserPreferences;
  createdAt: string;
}

export interface UserNotification {
  id: string;
  userId: string;
  title: string;
  body: string;
  category: 'EMI Reminder' | 'Payment' | 'Achievement' | 'System';
  isRead: boolean;
  createdAt: string;
}

export interface Payment {
  id: string;
  paymentDate: string; // YYYY-MM-DD
  amountPaid: number;
  principalPortion: number;
  interestPortion: number;
  remainingBalance: number;
  status: 'Paid' | 'Partial' | 'Extra' | 'Missed';
  notes: string;
}

export interface AmortizationSlot {
  month: number;
  dueDate: string;
  emi: number;
  principalPortion: number;
  interestPortion: number;
  remainingBalance: number;
}

export interface Loan {
  id: string;
  userId?: string;
  loanName: string;
  lenderName: string;
  principal: number;
  rate: number;
  type: 'Flat' | 'Reducing';
  duration: number; // Duration amount
  durationUnit: 'Months' | 'Years';
  startDate: string; // YYYY-MM-DD
  createdAt: string;
  updatedAt: string;

  // Recalculated values (backend source of truth)
  emi: number;
  totalInterest: number;
  totalRepayment: number;
  remainingPrincipal: number;
  remainingInterest: number;
  totalPaid: number;
  interestPaid: number;
  principalPaid: number;
  completionPercentage: number;
  paymentsMadeCount: number;
  paymentsRemainingCount: number;
  nextEmiDate: string;
  status: 'Active' | 'Completed';

  amortizationSchedule: AmortizationSlot[];
  payments: Payment[];
}

export interface DashboardStats {
  totalLoanAmount: number;
  totalPaid: number;
  remainingBalance: number;
  totalInterest: number;
  interestPaid: number;
  remainingInterest: number;
  currentEmi: number;
  nextEmiDate: string;
  completionPercentage: number;
  paymentsMade: number;
  paymentsRemaining: number;
  totalActiveLoans: number;
  totalCompletedLoans: number;
}
