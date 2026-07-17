import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, 'data');
const LOANS_FILE = path.join(DATA_DIR, 'loans.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const NOTIFICATIONS_FILE = path.join(DATA_DIR, 'notifications.json');

// MONGODB CONNECTION & SCHEMAS
const MONGODB_URI = process.env.MONGODB_URI;
let isMongoConnected = false;

// We define Mongoose Schemas & Models
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  fullName: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  avatarUrl: { type: String },
  createdAt: { type: String, required: true },
  preferences: { type: mongoose.Schema.Types.Mixed, required: true },
  pushSubscriptions: { type: Array, default: [] },
  achievements: { type: [String], default: [] }
}, { minimize: false, timestamps: true });

const UserModel = mongoose.models.User || mongoose.model('User', userSchema);

const loanSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String },
  loanName: { type: String, required: true },
  lenderName: { type: String, required: true },
  principal: { type: Number, required: true },
  rate: { type: Number, required: true },
  type: { type: String, required: true },
  duration: { type: Number, required: true },
  durationUnit: { type: String, required: true },
  startDate: { type: String, required: true },
  createdAt: { type: String, required: true },
  updatedAt: { type: String, required: true },
  emi: { type: Number, required: true },
  totalInterest: { type: Number, required: true },
  totalRepayment: { type: Number, required: true },
  remainingPrincipal: { type: Number, required: true },
  remainingInterest: { type: Number, required: true },
  totalPaid: { type: Number, required: true },
  interestPaid: { type: Number, required: true },
  principalPaid: { type: Number, required: true },
  completionPercentage: { type: Number, required: true },
  paymentsMadeCount: { type: Number, required: true },
  paymentsRemainingCount: { type: Number, required: true },
  nextEmiDate: { type: String, required: true },
  status: { type: String, required: true },
  amortizationSchedule: { type: Array, default: [] },
  payments: { type: Array, default: [] },
  sharing: { type: mongoose.Schema.Types.Mixed, default: null }
}, { minimize: false, timestamps: true });

const LoanModel = mongoose.models.Loan || mongoose.model('Loan', loanSchema);

const notificationSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  userId: { type: String, required: true },
  title: { type: String, required: true },
  body: { type: String, required: true },
  category: { type: String, required: true },
  isRead: { type: Boolean, required: true },
  createdAt: { type: String, required: true }
}, { minimize: false, timestamps: true });

const NotificationModel = mongoose.models.Notification || mongoose.model('Notification', notificationSchema);

if (MONGODB_URI) {
  console.log('Connecting to MongoDB via MONGODB_URI...');
  mongoose.connect(MONGODB_URI)
    .then(() => {
      console.log('Successfully connected to MongoDB!');
      isMongoConnected = true;
      syncFromMongo();
    })
    .catch((err) => {
      console.error('Failed to connect to MongoDB:', err);
    });
} else {
  console.log('No MONGODB_URI found in environment. Running in offline JSON fallback mode.');
}

// Interface declarations
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

export interface UserPushSubscription {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

export interface UserPreferences {
  language: string;
  currency: string;
  theme: 'light' | 'dark' | 'system';
  notifications: {
    pushEnabled: boolean;
    achievementEnabled: boolean;
    reminderDays: number[];
    quietHoursStart: string;
    quietHoursEnd: string;
    sound: string;
    vibration: boolean;
    maxDaily: number;
  };
}

export interface BackendUser {
  id: string;
  fullName: string;
  email: string;
  passwordHash: string;
  avatarUrl?: string;
  createdAt: string;
  preferences: UserPreferences;
  pushSubscriptions: UserPushSubscription[];
  achievements?: string[];
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

export interface LoanSharingLog {
  action: 'created' | 'revoked' | 'regenerated' | 'accessed';
  timestamp: string;
  ip?: string;
}

export interface LoanSharing {
  enabled: boolean;
  token: string;
  privacy: {
    showLoanAmount: boolean;
    showInterestRate: boolean;
    showEmi: boolean;
    showPaymentHistory: boolean;
    showCharts: boolean;
    showNotes: boolean;
    showRemainingBalance: boolean;
    showNextEmiDate: boolean;
  };
  expirationType: 'never' | '24h' | '7d' | '30d' | 'custom';
  expirationDate: string | null;
  passwordHash: string | null;
  passwordProtected: boolean;
  logs: LoanSharingLog[];
}

export interface Loan {
  id: string;
  userId?: string; // Optional to support unassigned or legacy seed loans
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
  sharing?: LoanSharing | null;

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

// Seed data generator for first-time use
function getSeedData(): Loan[] {
  const carLoanRaw: Loan = {
    id: 'seed-car-loan',
    loanName: 'Car Loan',
    lenderName: 'Chase Finance',
    principal: 12000,
    rate: 6.0,
    type: 'Reducing',
    duration: 36,
    durationUnit: 'Months',
    startDate: '2026-01-15',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    emi: 0,
    totalInterest: 0,
    totalRepayment: 0,
    remainingPrincipal: 12000,
    remainingInterest: 0,
    totalPaid: 0,
    interestPaid: 0,
    principalPaid: 0,
    completionPercentage: 0,
    paymentsMadeCount: 0,
    paymentsRemainingCount: 36,
    nextEmiDate: '2026-01-15',
    status: 'Active',
    amortizationSchedule: [],
    payments: [
      {
        id: 'seed-pay-1',
        paymentDate: '2026-02-15',
        amountPaid: 365.06,
        principalPortion: 0,
        interestPortion: 0,
        remainingBalance: 0,
        status: 'Paid',
        notes: 'First monthly installment'
      },
      {
        id: 'seed-pay-2',
        paymentDate: '2026-03-15',
        amountPaid: 365.06,
        principalPortion: 0,
        interestPortion: 0,
        remainingBalance: 0,
        status: 'Paid',
        notes: 'On-time monthly payment'
      },
      {
        id: 'seed-pay-3',
        paymentDate: '2026-04-15',
        amountPaid: 500.00,
        principalPortion: 0,
        interestPortion: 0,
        remainingBalance: 0,
        status: 'Paid',
        notes: 'Extra payment applied to principal'
      }
    ]
  };

  const personalLoanRaw: Loan = {
    id: 'seed-personal-loan',
    loanName: 'Laptop Purchase',
    lenderName: 'BestBuy Card',
    principal: 1800,
    rate: 10.0,
    type: 'Flat',
    duration: 12,
    durationUnit: 'Months',
    startDate: '2026-04-01',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    emi: 0,
    totalInterest: 0,
    totalRepayment: 0,
    remainingPrincipal: 1800,
    remainingInterest: 0,
    totalPaid: 0,
    interestPaid: 0,
    principalPaid: 0,
    completionPercentage: 0,
    paymentsMadeCount: 0,
    paymentsRemainingCount: 12,
    nextEmiDate: '2026-04-01',
    status: 'Active',
    amortizationSchedule: [],
    payments: [
      {
        id: 'seed-pay-4',
        paymentDate: '2026-05-01',
        amountPaid: 165.00,
        principalPortion: 0,
        interestPortion: 0,
        remainingBalance: 0,
        status: 'Paid',
        notes: 'May installment'
      }
    ]
  };

  const carLoanCalculated = recalculateLoan(carLoanRaw);
  const personalLoanCalculated = recalculateLoan(personalLoanRaw);

  return [carLoanCalculated, personalLoanCalculated];
}

// Ensure database files exist
function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOANS_FILE)) {
    fs.writeFileSync(LOANS_FILE, JSON.stringify(getSeedData(), null, 2), 'utf-8');
  }
  if (!fs.existsSync(USERS_FILE)) {
    fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
  if (!fs.existsSync(NOTIFICATIONS_FILE)) {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify([], null, 2), 'utf-8');
  }
}

// Background sync helpers
async function syncFromMongo() {
  if (!isMongoConnected) return;
  try {
    console.log('Syncing data from MongoDB to local JSON cache...');
    ensureDataDir();

    // Sync Users
    const dbUsers = await (UserModel as any).find({});
    if (dbUsers.length > 0) {
      const usersData: BackendUser[] = dbUsers.map((doc: any) => {
        const obj = doc.toObject();
        delete obj._id;
        delete obj.__v;
        delete obj.createdAt;
        delete obj.updatedAt;
        return obj as BackendUser;
      });
      fs.writeFileSync(USERS_FILE, JSON.stringify(usersData, null, 2), 'utf-8');
      console.log(`Synced ${usersData.length} users from MongoDB.`);
    } else {
      const localUsers = JSON.parse(fs.readFileSync(USERS_FILE, 'utf-8')) as BackendUser[];
      if (localUsers.length > 0) {
        console.log(`Seeding ${localUsers.length} users to MongoDB...`);
        await (UserModel as any).insertMany(localUsers);
      }
    }

    // Sync Loans
    const dbLoans = await (LoanModel as any).find({});
    if (dbLoans.length > 0) {
      const loansData: Loan[] = dbLoans.map((doc: any) => {
        const obj = doc.toObject();
        delete obj._id;
        delete obj.__v;
        delete obj.createdAt;
        delete obj.updatedAt;
        return obj as Loan;
      });
      fs.writeFileSync(LOANS_FILE, JSON.stringify(loansData, null, 2), 'utf-8');
      console.log(`Synced ${loansData.length} loans from MongoDB.`);
    } else {
      const localLoans = JSON.parse(fs.readFileSync(LOANS_FILE, 'utf-8')) as Loan[];
      if (localLoans.length > 0) {
        console.log(`Seeding ${localLoans.length} loans to MongoDB...`);
        await (LoanModel as any).insertMany(localLoans);
      }
    }

    // Sync Notifications
    const dbNotifs = await (NotificationModel as any).find({});
    if (dbNotifs.length > 0) {
      const notifsData: UserNotification[] = dbNotifs.map((doc: any) => {
        const obj = doc.toObject();
        delete obj._id;
        delete obj.__v;
        delete obj.createdAt;
        delete obj.updatedAt;
        return obj as UserNotification;
      });
      fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifsData, null, 2), 'utf-8');
      console.log(`Synced ${notifsData.length} notifications from MongoDB.`);
    } else {
      const localNotifs = JSON.parse(fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8')) as UserNotification[];
      if (localNotifs.length > 0) {
        console.log(`Seeding ${localNotifs.length} notifications to MongoDB...`);
        await (NotificationModel as any).insertMany(localNotifs);
      }
    }

    console.log('MongoDB Synchronization complete!');
  } catch (error) {
    console.error('Error syncing from MongoDB:', error);
  }
}

async function syncUsersToMongo(users: BackendUser[]) {
  if (!isMongoConnected) return;
  try {
    const bulkOps = users.map(user => ({
      updateOne: {
        filter: { id: user.id },
        update: { $set: user },
        upsert: true
      }
    }));
    
    const userIds = users.map(u => u.id);
    await (UserModel as any).deleteMany({ id: { $nin: userIds } });
    
    if (bulkOps.length > 0) {
      await (UserModel as any).bulkWrite(bulkOps);
    }
  } catch (error) {
    console.error('Error syncing users to MongoDB:', error);
  }
}

async function syncLoansToMongo(loans: Loan[]) {
  if (!isMongoConnected) return;
  try {
    const bulkOps = loans.map(loan => ({
      updateOne: {
        filter: { id: loan.id },
        update: { $set: loan },
        upsert: true
      }
    }));
    
    const loanIds = loans.map(l => l.id);
    await (LoanModel as any).deleteMany({ id: { $nin: loanIds } });
    
    if (bulkOps.length > 0) {
      await (LoanModel as any).bulkWrite(bulkOps);
    }
  } catch (error) {
    console.error('Error syncing loans to MongoDB:', error);
  }
}

async function syncNotificationsToMongo(notifications: UserNotification[]) {
  if (!isMongoConnected) return;
  try {
    const bulkOps = notifications.map(notif => ({
      updateOne: {
        filter: { id: notif.id },
        update: { $set: notif },
        upsert: true
      }
    }));
    
    const notifIds = notifications.map(n => n.id);
    await (NotificationModel as any).deleteMany({ id: { $nin: notifIds } });
    
    if (bulkOps.length > 0) {
      await (NotificationModel as any).bulkWrite(bulkOps);
    }
  } catch (error) {
    console.error('Error syncing notifications to MongoDB:', error);
  }
}

// Read and write utilities
export function readLoans(): Loan[] {
  ensureDataDir();
  try {
    const data = fs.readFileSync(LOANS_FILE, 'utf-8');
    return JSON.parse(data) as Loan[];
  } catch (error) {
    console.error('Error reading loans file:', error);
    return [];
  }
}

export function writeLoans(loans: Loan[]): void {
  ensureDataDir();
  try {
    fs.writeFileSync(LOANS_FILE, JSON.stringify(loans, null, 2), 'utf-8');
    syncLoansToMongo(loans);
  } catch (error) {
    console.error('Error writing loans file:', error);
  }
}

export function readUsers(): BackendUser[] {
  ensureDataDir();
  try {
    const data = fs.readFileSync(USERS_FILE, 'utf-8');
    return JSON.parse(data) as BackendUser[];
  } catch (error) {
    console.error('Error reading users file:', error);
    return [];
  }
}

export function writeUsers(users: BackendUser[]): void {
  ensureDataDir();
  try {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2), 'utf-8');
    syncUsersToMongo(users);
  } catch (error) {
    console.error('Error writing users file:', error);
  }
}

export function readNotifications(): UserNotification[] {
  ensureDataDir();
  try {
    const data = fs.readFileSync(NOTIFICATIONS_FILE, 'utf-8');
    return JSON.parse(data) as UserNotification[];
  } catch (error) {
    console.error('Error reading notifications file:', error);
    return [];
  }
}

export function writeNotifications(notifications: UserNotification[]): void {
  ensureDataDir();
  try {
    fs.writeFileSync(NOTIFICATIONS_FILE, JSON.stringify(notifications, null, 2), 'utf-8');
    syncNotificationsToMongo(notifications);
  } catch (error) {
    console.error('Error writing notifications file:', error);
  }
}

// Date helper: adds months to YYYY-MM-DD string
function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

// CORE RECALCULATION ENGINE
export function recalculateLoan(loan: Loan): Loan {
  const principal = Number(loan.principal);
  const rate = Number(loan.rate);
  const duration = Number(loan.duration);
  const durationUnit = loan.durationUnit;
  const startDate = loan.startDate;

  const durationMonths = durationUnit === 'Years' ? duration * 12 : duration;

  let emi = 0;
  let totalInterest = 0;
  let totalRepayment = 0;
  const amortizationSchedule: AmortizationSlot[] = [];

  if (loan.type === 'Flat') {
    // FLAT INTEREST RATE CALCULATIONS
    totalInterest = principal * (rate / 100) * (durationMonths / 12);
    totalRepayment = principal + totalInterest;
    emi = totalRepayment / durationMonths;

    const monthlyPrincipal = principal / durationMonths;
    const monthlyInterest = totalInterest / durationMonths;

    let runningPrincipalBal = principal;
    for (let m = 1; m <= durationMonths; m++) {
      runningPrincipalBal -= monthlyPrincipal;
      amortizationSchedule.push({
        month: m,
        dueDate: addMonths(startDate, m),
        emi,
        principalPortion: Number(monthlyPrincipal.toFixed(2)),
        interestPortion: Number(monthlyInterest.toFixed(2)),
        remainingBalance: Number(Math.max(0, runningPrincipalBal).toFixed(2)),
      });
    }
  } else {
    // REDUCING BALANCE CALCULATIONS
    const r = (rate / 100) / 12; // Monthly rate
    if (r === 0) {
      emi = principal / durationMonths;
    } else {
      emi = (principal * r * Math.pow(1 + r, durationMonths)) / (Math.pow(1 + r, durationMonths) - 1);
    }

    let runningBal = principal;
    for (let m = 1; m <= durationMonths; m++) {
      const interestPortion = runningBal * r;
      let principalPortion = emi - interestPortion;
      
      if (principalPortion > runningBal) {
        principalPortion = runningBal;
      }
      
      runningBal -= principalPortion;
      totalInterest += interestPortion;

      amortizationSchedule.push({
        month: m,
        dueDate: addMonths(startDate, m),
        emi,
        principalPortion: Number(principalPortion.toFixed(2)),
        interestPortion: Number(interestPortion.toFixed(2)),
        remainingBalance: Number(Math.max(0, runningBal).toFixed(2)),
      });
    }
    totalRepayment = principal + totalInterest;
  }

  // Sort actual payments chronologically for allocation
  const sortedPayments = [...(loan.payments || [])].sort(
    (a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime()
  );

  let remainingPrincipal = principal;
  let remainingInterest = totalInterest;
  let totalPaid = 0;
  let principalPaid = 0;
  let interestPaid = 0;

  // Recalculate payments using chronological schedule allocation
  const updatedPayments = sortedPayments.map((p, idx) => {
    const amountPaid = Number(p.amountPaid);
    
    // Determine theoretical scheduled values for this installment slot
    const slotIndex = idx < amortizationSchedule.length ? idx : amortizationSchedule.length - 1;
    const slot = amortizationSchedule[slotIndex];
    const schedInterest = slot ? slot.interestPortion : (totalInterest / durationMonths);
    const schedPrincipal = slot ? slot.principalPortion : (principal / durationMonths);

    let pInterest = 0;
    let pPrincipal = 0;

    if (amountPaid > 0) {
      // Allocate to interest outstanding, then principal
      pInterest = Math.min(amountPaid, schedInterest, remainingInterest);
      pPrincipal = Math.min(amountPaid - pInterest, remainingPrincipal);

      // If there is excess (e.g. prepayments/extra payments), apply it to principal
      const remainingAfterSlot = amountPaid - pInterest - pPrincipal;
      if (remainingAfterSlot > 0 && remainingPrincipal > pPrincipal) {
        pPrincipal = Math.min(pPrincipal + remainingAfterSlot, remainingPrincipal);
      }
    }

    remainingPrincipal = Math.max(0, remainingPrincipal - pPrincipal);
    remainingInterest = Math.max(0, remainingInterest - pInterest);
    
    totalPaid += amountPaid;
    principalPaid += pPrincipal;
    interestPaid += pInterest;

    // Determine Status
    let status: 'Paid' | 'Partial' | 'Extra' | 'Missed' = 'Paid';
    if (amountPaid === 0) {
      status = 'Missed';
    } else if (amountPaid < emi * 0.98) {
      status = 'Partial';
    } else if (amountPaid > emi * 1.02) {
      status = 'Extra';
    }

    return {
      ...p,
      amountPaid,
      principalPortion: Number(pPrincipal.toFixed(2)),
      interestPortion: Number(pInterest.toFixed(2)),
      remainingBalance: Number((remainingPrincipal + remainingInterest).toFixed(2)),
      status,
    };
  });

  // Calculate completion percentage
  const completionPercentage = Number(((principal - remainingPrincipal) / principal * 100).toFixed(2));
  const paymentsMadeCount = updatedPayments.filter((p) => p.status !== 'Missed').length;
  const paymentsRemainingCount = Math.max(0, durationMonths - paymentsMadeCount);

  // Calculate next EMI Date
  // If completed, no EMI due. Otherwise, count months from start based on payments made.
  let nextEmiDate = 'Completed';
  if (remainingPrincipal > 0.05) {
    const monthsToSkip = updatedPayments.length;
    nextEmiDate = addMonths(startDate, monthsToSkip + 1);
  }

  const status = remainingPrincipal <= 0.05 ? 'Completed' : 'Active';

  return {
    ...loan,
    emi: Number(emi.toFixed(2)),
    totalInterest: Number(totalInterest.toFixed(2)),
    totalRepayment: Number(totalRepayment.toFixed(2)),
    remainingPrincipal: Number(remainingPrincipal.toFixed(2)),
    remainingInterest: Number(remainingInterest.toFixed(2)),
    totalPaid: Number(totalPaid.toFixed(2)),
    principalPaid: Number(principalPaid.toFixed(2)),
    interestPaid: Number(interestPaid.toFixed(2)),
    completionPercentage,
    paymentsMadeCount,
    paymentsRemainingCount,
    nextEmiDate,
    status,
    amortizationSchedule,
    payments: updatedPayments,
  };
}
