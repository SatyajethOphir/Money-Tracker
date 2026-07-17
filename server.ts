import express from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';

import {
  readLoans,
  writeLoans,
  recalculateLoan,
  readUsers,
  writeUsers,
  readNotifications,
  writeNotifications,
  Loan,
  Payment,
  BackendUser,
  UserNotification
} from './server-db';

import {
  vapidKeys,
  sendNotificationToUser,
  checkAndSendEMIReminders
} from './server-notifications';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json({ limit: '10mb' })); // support profile picture uploads

const JWT_SECRET = process.env.JWT_SECRET || 'emi_tracker_super_secret_jwt_key_2026';

// Helper to parse cookie manually (keeps code simple and avoids extra library)
const getCookie = (req: express.Request, name: string): string => {
  const cookieStr = req.headers.cookie || '';
  const cookies = cookieStr.split(';').reduce((acc, c) => {
    const [k, v] = c.trim().split('=');
    if (k && v) acc[k] = decodeURIComponent(v);
    return acc;
  }, {} as Record<string, string>);
  return cookies[name] || '';
};

// Apply privacy filtering before sending shared loan data to a visitor
function applyPrivacyFilter(loan: Loan, privacy: any, currency: string = 'USD'): Loan {
  const filtered = JSON.parse(JSON.stringify(loan)) as Loan;

  filtered.id = 'shared-loan';
  (filtered as any).currency = currency;
  delete filtered.userId;
  if ((filtered as any)._id) delete (filtered as any)._id;
  if ((filtered as any)._v) delete (filtered as any)._v;

  if (filtered.sharing) {
    filtered.sharing = {
      enabled: true,
      token: filtered.sharing.token,
      privacy: filtered.sharing.privacy,
      expirationType: filtered.sharing.expirationType,
      expirationDate: filtered.sharing.expirationDate,
      passwordProtected: filtered.sharing.passwordProtected,
      passwordHash: null,
      logs: [] // never expose access logs to public view
    };
  }

  const p = privacy || {
    showLoanAmount: true,
    showInterestRate: true,
    showEmi: true,
    showPaymentHistory: true,
    showCharts: true,
    showNotes: true,
    showRemainingBalance: true,
    showNextEmiDate: true
  };

  if (!p.showLoanAmount) {
    filtered.principal = 0;
    filtered.totalRepayment = 0;
    filtered.totalPaid = 0;
    filtered.principalPaid = 0;
  }
  if (!p.showInterestRate) {
    filtered.rate = 0;
    filtered.totalInterest = 0;
    filtered.interestPaid = 0;
    filtered.remainingInterest = 0;
  }
  if (!p.showEmi) {
    filtered.emi = 0;
  }
  if (!p.showRemainingBalance) {
    filtered.remainingPrincipal = 0;
    filtered.remainingInterest = 0;
    filtered.completionPercentage = 0;
  }
  if (!p.showNextEmiDate) {
    filtered.nextEmiDate = 'Hidden';
  }
  if (!p.showPaymentHistory) {
    filtered.payments = [];
  } else {
    filtered.payments = filtered.payments.map(pmt => ({
      ...pmt,
      notes: p.showNotes ? pmt.notes : ''
    }));
  }

  if (!p.showCharts) {
    filtered.amortizationSchedule = [];
  }

  return filtered;
}

// ---------------------------------------------------------
// AUTHENTICATION MIDDLEWARE
// ---------------------------------------------------------
export interface AuthenticatedRequest extends express.Request {
  user?: BackendUser;
}

const authMiddleware = (req: AuthenticatedRequest, res: express.Response, next: express.NextFunction) => {
  try {
    let token = getCookie(req, 'token');

    // Fallback to Authorization Header
    if (!token && req.headers.authorization && req.headers.authorization.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }

    if (!token) {
      return res.status(401).json({ error: 'Unauthenticated. Please log in.' });
    }

    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; email: string };
    const users = readUsers();
    const user = users.find(u => u.id === decoded.id);

    if (!user) {
      return res.status(401).json({ error: 'Session expired or user not found. Please log in again.' });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error('Authentication Error:', error);
    return res.status(401).json({ error: 'Session invalid or expired. Please log in again.' });
  }
};

// ---------------------------------------------------------
// ACHIEVEMENT CHECKER HELPER
// ---------------------------------------------------------
async function checkAndTriggerAchievements(userId: string, loanId: string) {
  try {
    const loans = readLoans().filter(l => l.userId === userId);
    const loan = loans.find(l => l.id === loanId);
    if (!loan) return;

    const users = readUsers();
    const userIdx = users.findIndex(u => u.id === userId);
    if (userIdx === -1) return;
    const user = users[userIdx];

    const currentAchievements = user.achievements || [];
    const earnedNew: string[] = [];

    const award = (id: string, title: string, desc: string) => {
      if (!currentAchievements.includes(id) && !earnedNew.includes(id)) {
        earnedNew.push(id);
        sendNotificationToUser(
          userId,
          `🏆 Achievement Unlocked: ${title}`,
          `🎉 Great job! You unlocked an achievement: ${desc}`,
          'Achievement'
        );
      }
    };

    // 1. First EMI Paid
    const paidPayments = loan.payments.filter(p => p.status === 'Paid' || p.status === 'Extra');
    if (paidPayments.length >= 1) {
      award('first-emi', 'First EMI Paid', 'You recorded your first on-time payment!');
    }

    // 2. Repayment milestones: 25%, 50%, 75%, 100%
    const completion = loan.completionPercentage;
    if (completion >= 25) {
      award('repaid-25', 'Quarterly Progress', `You have repaid 25% of your "${loan.loanName}" loan!`);
    }
    if (completion >= 50) {
      award('repaid-50', 'Halfway There', `You have repaid 50% of your "${loan.loanName}" loan! Excellent!`);
    }
    if (completion >= 75) {
      award('repaid-75', 'Financial Freedom In Sight', `You have repaid 75% of your "${loan.loanName}" loan! Keep going!`);
    }
    if (loan.status === 'Completed' || completion >= 99.9) {
      award('repaid-100', 'Debt-Free Champion', `You have completely repaid your "${loan.loanName}" loan! Congratulations! 🏁`);
    }

    // 3. Consecutive on-time payments
    const sortedPayments = [...loan.payments].sort((a, b) => new Date(a.paymentDate).getTime() - new Date(b.paymentDate).getTime());
    let consecutiveCount = 0;
    let maxConsecutive = 0;
    for (const p of sortedPayments) {
      if (p.status === 'Paid' || p.status === 'Extra') {
        consecutiveCount++;
        if (consecutiveCount > maxConsecutive) maxConsecutive = consecutiveCount;
      } else {
        consecutiveCount = 0;
      }
    }

    if (maxConsecutive >= 3) {
      award('consecutive-3', 'Habit Builder', 'Three consecutive on-time payments! Consistency builds a strong financial future. 💪');
    }
    if (maxConsecutive >= 6) {
      award('consecutive-6', 'On-Time Master', 'Six consecutive on-time payments! Incredible dedication. 🌟');
    }
    if (maxConsecutive >= 12) {
      award('consecutive-12', 'Unstoppable Financial Discipline', 'Twelve consecutive on-time payments! Remarkable persistence. 🏆');
    }

    // 4. Extra Payment / Smart Saver
    const hasExtraPayment = loan.payments.some(p => p.status === 'Extra');
    if (hasExtraPayment) {
      award('extra-payment', 'Smart Saver', `You made an extra payment on "${loan.loanName}". This reduces your remaining interest! 🎯`);
      award('interest-saved', 'Interest Saver', 'Saved interest through prepayments! Every extra payment saves money on interest.');
    }

    if (earnedNew.length > 0) {
      const allUsers = readUsers();
      const uIdx = allUsers.findIndex(u => u.id === userId);
      if (uIdx !== -1) {
        allUsers[uIdx].achievements = [...(allUsers[uIdx].achievements || []), ...earnedNew];
        writeUsers(allUsers);
      }
    }
  } catch (err) {
    console.error('Error in checkAndTriggerAchievements:', err);
  }
}

// ---------------------------------------------------------
// PUBLIC ENDPOINTS
// ---------------------------------------------------------

// VAPID Public Key Fetch
app.get('/api/vapid-public-key', (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// ---------------------------------------------------------
// AUTHENTICATION ENDPOINTS
// ---------------------------------------------------------

// User Registration
app.post('/api/auth/register', async (req, res) => {
  try {
    const { fullName, email, password } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ error: 'Full Name, Email and Password are required.' });
    }

    const users = readUsers();
    const existingUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (existingUser) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const newUser: BackendUser & { achievements?: string[] } = {
      id: Math.random().toString(36).substring(2, 11),
      fullName,
      email: email.toLowerCase(),
      passwordHash,
      createdAt: new Date().toISOString(),
      preferences: {
        language: 'en',
        currency: 'USD',
        theme: 'light',
        notifications: {
          pushEnabled: true,
          achievementEnabled: true,
          reminderDays: [7, 3, 1, 0],
          quietHoursStart: '22:00',
          quietHoursEnd: '08:00',
          sound: 'default',
          vibration: true,
          maxDaily: 5
        }
      },
      pushSubscriptions: [],
      achievements: []
    };

    users.push(newUser);
    writeUsers(users);

    // Seed a welcome loan so they can see the features immediately
    const loans = readLoans();
    const welcomeLoan: Loan = {
      id: `welcome-${newUser.id}`,
      userId: newUser.id,
      loanName: 'Personal Welcome Loan',
      lenderName: 'Apex Capital',
      principal: 5000,
      rate: 8.5,
      type: 'Reducing',
      duration: 12,
      durationUnit: 'Months',
      startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 month ago
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      emi: 0,
      totalInterest: 0,
      totalRepayment: 0,
      remainingPrincipal: 5000,
      remainingInterest: 0,
      totalPaid: 0,
      interestPaid: 0,
      principalPaid: 0,
      completionPercentage: 0,
      paymentsMadeCount: 0,
      paymentsRemainingCount: 12,
      nextEmiDate: new Date().toISOString().split('T')[0],
      status: 'Active',
      amortizationSchedule: [],
      payments: [
        {
          id: `welcome-pay-1`,
          paymentDate: new Date(Date.now() - 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 15 days ago
          amountPaid: 436.14,
          principalPortion: 0,
          interestPortion: 0,
          remainingBalance: 0,
          status: 'Paid',
          notes: 'Welcome installment'
        }
      ]
    };

    const calculatedLoan = recalculateLoan(welcomeLoan);
    loans.push(calculatedLoan);
    writeLoans(loans);

    // Send a welcome notification
    sendNotificationToUser(
      newUser.id,
      '👋 Welcome to EMI Loan Tracker!',
      `Hi ${fullName}! Your private debt-free dashboard has been set up successfully. We seeded a welcome loan to help you learn.`,
      'System'
    );

    // Create session token
    const token = jwt.sign({ id: newUser.id, email: newUser.email }, JWT_SECRET, { expiresIn: '30d' });

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 30 * 24 * 60 * 60 * 1000 // 30 days
    });

    const { passwordHash: _, ...profile } = newUser;
    res.status(201).json({ profile, token });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password, rememberMe } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and Password are required.' });
    }

    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const expiresIn = rememberMe ? '30d' : '1d';
    const token = jwt.sign({ id: user.id, email: user.email }, JWT_SECRET, { expiresIn });

    const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;

    res.cookie('token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge
    });

    const { passwordHash: _, ...profile } = user;
    res.json({ profile, token });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// User Logout
app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true, message: 'Logged out successfully' });
});

// Session Verification / Get Current Profile
app.get('/api/auth/me', authMiddleware, (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthenticated.' });
  const { passwordHash: _, ...profile } = req.user;
  res.json(profile);
});

// Edit Profile
app.put('/api/auth/profile', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const { fullName, email, avatarUrl } = req.body;
    const users = readUsers();
    const uIdx = users.findIndex(u => u.id === user.id);

    if (uIdx === -1) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (email && email.toLowerCase() !== user.email.toLowerCase()) {
      const emailExists = users.some(u => u.id !== user.id && u.email.toLowerCase() === email.toLowerCase());
      if (emailExists) {
        return res.status(400).json({ error: 'Email address is already in use by another account.' });
      }
      users[uIdx].email = email.toLowerCase();
    }

    if (fullName) users[uIdx].fullName = fullName;
    if (avatarUrl !== undefined) users[uIdx].avatarUrl = avatarUrl;

    writeUsers(users);

    const { passwordHash: _, ...profile } = users[uIdx];
    res.json(profile);
  } catch (error) {
    console.error('Edit Profile Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Change Password
app.post('/api/auth/change-password', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Current password and new password are required.' });
    }

    const users = readUsers();
    const uIdx = users.findIndex(u => u.id === user.id);
    if (uIdx === -1) return res.status(404).json({ error: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, users[uIdx].passwordHash);
    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    const salt = await bcrypt.genSalt(10);
    users[uIdx].passwordHash = await bcrypt.hash(newPassword, salt);
    writeUsers(users);

    sendNotificationToUser(user.id, '🔑 Password Changed', 'Your account password has been changed successfully.', 'System');

    res.json({ success: true, message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change Password Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update Preferences
app.put('/api/auth/preferences', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const { language, currency, theme, notifications } = req.body;
    const users = readUsers();
    const uIdx = users.findIndex(u => u.id === user.id);

    if (uIdx === -1) return res.status(404).json({ error: 'User not found' });

    if (language) users[uIdx].preferences.language = language;
    if (currency) users[uIdx].preferences.currency = currency;
    if (theme) users[uIdx].preferences.theme = theme;
    if (notifications) {
      users[uIdx].preferences.notifications = {
        ...users[uIdx].preferences.notifications,
        ...notifications
      };
    }

    writeUsers(users);

    const { passwordHash: _, ...profile } = users[uIdx];
    res.json(profile);
  } catch (error) {
    console.error('Update Preferences Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Forgot Password Flow (Mock Reset Token)
app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email address is required.' });
  }

  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
  
  if (!user) {
    // Return standard message to prevent user enumeration attacks
    return res.json({ success: true, message: 'If that email exists, a password reset link/code has been generated.' });
  }

  // Generates a mock pin '123456' for demonstration / sandbox environments
  res.json({ 
    success: true, 
    message: 'If that email exists, a password reset code has been generated.',
    demoResetCode: '123456' // Send to frontend for sandbox ease of use!
  });
});

// Reset Password
app.post('/api/auth/reset-password', async (req, res) => {
  try {
    const { email, resetCode, newPassword } = req.body;
    if (!email || !resetCode || !newPassword) {
      return res.status(400).json({ error: 'Email, Reset Code, and New Password are required.' });
    }

    if (resetCode !== '123456') {
      return res.status(400).json({ error: 'Invalid reset code. Use "123456" for sandbox testing.' });
    }

    const users = readUsers();
    const uIdx = users.findIndex(u => u.email.toLowerCase() === email.toLowerCase());

    if (uIdx === -1) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const salt = await bcrypt.genSalt(10);
    users[uIdx].passwordHash = await bcrypt.hash(newPassword, salt);
    writeUsers(users);

    sendNotificationToUser(users[uIdx].id, '🔑 Password Reset Success', 'Your password was successfully reset using a sandbox reset code.', 'System');

    res.json({ success: true, message: 'Password has been reset successfully.' });
  } catch (error) {
    console.error('Reset Password Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete Account (With Confirmation)
app.delete('/api/auth/profile', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    // 1. Delete User
    const users = readUsers();
    const remainingUsers = users.filter(u => u.id !== user.id);
    writeUsers(remainingUsers);

    // 2. Delete Loans
    const loans = readLoans();
    const remainingLoans = loans.filter(l => l.userId !== user.id);
    writeLoans(remainingLoans);

    // 3. Delete Notifications
    const notifications = readNotifications();
    const remainingNotifs = notifications.filter(n => n.userId !== user.id);
    writeNotifications(remainingNotifs);

    res.clearCookie('token');
    res.json({ success: true, message: 'Account and all associated loans and notifications deleted successfully.' });
  } catch (error) {
    console.error('Delete Account Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// NOTIFICATION PREFERENCES & CENTER ENDPOINTS
// ---------------------------------------------------------

// Subscribe user device to Web Push
app.post('/api/notifications/subscribe', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const subscription = req.body;
    if (!subscription || !subscription.endpoint || !subscription.keys) {
      return res.status(400).json({ error: 'Invalid push subscription details' });
    }

    const users = readUsers();
    const uIdx = users.findIndex(u => u.id === user.id);
    if (uIdx === -1) return res.status(404).json({ error: 'User not found' });

    users[uIdx].pushSubscriptions = users[uIdx].pushSubscriptions || [];

    // Avoid duplicates
    const exists = users[uIdx].pushSubscriptions.some(sub => sub.endpoint === subscription.endpoint);
    if (!exists) {
      users[uIdx].pushSubscriptions.push(subscription);
      writeUsers(users);
    }

    res.status(201).json({ success: true, message: 'Subscribed to push notifications successfully' });
  } catch (error) {
    console.error('Subscribe Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Fetch all notifications for current user
app.get('/api/notifications', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const notifs = readNotifications().filter(n => n.userId === user.id);
    res.json(notifs);
  } catch (error) {
    console.error('Fetch Notifications Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark single notification as read
app.put('/api/notifications/:id/read', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const notifs = readNotifications();
    const notifIdx = notifs.findIndex(n => n.id === req.params.id && n.userId === user.id);

    if (notifIdx === -1) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    notifs[notifIdx].isRead = true;
    writeNotifications(notifs);

    res.json({ success: true, notification: notifs[notifIdx] });
  } catch (error) {
    console.error('Mark notification read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Mark all notifications as read
app.put('/api/notifications/read', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const notifs = readNotifications();
    notifs.forEach(n => {
      if (n.userId === user.id) {
        n.isRead = true;
      }
    });
    writeNotifications(notifs);

    res.json({ success: true, message: 'All notifications marked as read' });
  } catch (error) {
    console.error('Mark all notifications read error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete single notification
app.delete('/api/notifications/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const notifs = readNotifications();
    const remaining = notifs.filter(n => !(n.id === req.params.id && n.userId === user.id));

    if (notifs.length === remaining.length) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    writeNotifications(remaining);
    res.json({ success: true, message: 'Notification deleted successfully' });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Clear all notifications
app.delete('/api/notifications', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user;
    if (!user) return res.status(401).json({ error: 'Unauthenticated' });

    const notifs = readNotifications();
    const remaining = notifs.filter(n => n.userId !== user.id);
    writeNotifications(remaining);

    res.json({ success: true, message: 'All notifications cleared successfully' });
  } catch (error) {
    console.error('Clear notifications error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// SECURED LOANS & EMIS ENDPOINTS
// ---------------------------------------------------------

// GET Stats
app.get('/api/stats', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans().filter(l => l.userId === user.id);

    let totalLoanAmount = 0;
    let totalPaid = 0;
    let totalRemainingPrincipal = 0;
    let totalInterest = 0;
    let interestPaid = 0;
    let remainingInterest = 0;
    let currentEmiSum = 0;
    let paymentsMade = 0;
    let paymentsRemaining = 0;

    let nextEmiDate: string | null = null;

    loans.forEach(loan => {
      totalLoanAmount += Number(loan.principal || 0);
      totalPaid += Number(loan.totalPaid || 0);
      totalRemainingPrincipal += Number(loan.remainingPrincipal || 0);
      totalInterest += Number(loan.totalInterest || 0);
      interestPaid += Number(loan.interestPaid || 0);
      remainingInterest += Number(loan.remainingInterest || 0);

      if (loan.status === 'Active') {
        currentEmiSum += Number(loan.emi || 0);

        if (loan.nextEmiDate && loan.nextEmiDate !== 'Completed') {
          if (!nextEmiDate || new Date(loan.nextEmiDate) < new Date(nextEmiDate)) {
            nextEmiDate = loan.nextEmiDate;
          }
        }
      }

      paymentsMade += (loan.payments || []).filter(p => p.status !== 'Missed').length;
      paymentsRemaining += Number(loan.paymentsRemainingCount || 0);
    });

    const remainingBalance = totalRemainingPrincipal + remainingInterest;
    const totalRepaymentSum = totalLoanAmount + totalInterest;
    const completionPercentage = totalRepaymentSum > 0
      ? Number((totalPaid / totalRepaymentSum * 100).toFixed(2))
      : 0;

    res.json({
      totalLoanAmount: Number(totalLoanAmount.toFixed(2)),
      totalPaid: Number(totalPaid.toFixed(2)),
      remainingBalance: Number(remainingBalance.toFixed(2)),
      totalInterest: Number(totalInterest.toFixed(2)),
      interestPaid: Number(interestPaid.toFixed(2)),
      remainingInterest: Number(remainingInterest.toFixed(2)),
      currentEmi: Number(currentEmiSum.toFixed(2)),
      nextEmiDate: nextEmiDate || 'N/A',
      completionPercentage,
      paymentsMade,
      paymentsRemaining,
      totalActiveLoans: loans.filter(l => l.status === 'Active').length,
      totalCompletedLoans: loans.filter(l => l.status === 'Completed').length,
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET all loans with filters
app.get('/api/loans', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    let loans = readLoans().filter(l => l.userId === user.id);
    const { search, filter, sortBy, sortOrder } = req.query;

    if (search) {
      const q = String(search).toLowerCase();
      loans = loans.filter(l =>
        l.loanName.toLowerCase().includes(q) ||
        l.lenderName.toLowerCase().includes(q)
      );
    }

    if (filter === 'active') {
      loans = loans.filter(l => l.status === 'Active');
    } else if (filter === 'completed') {
      loans = loans.filter(l => l.status === 'Completed');
    }

    const isDesc = sortOrder === 'desc';
    loans.sort((a, b) => {
      if (sortBy === 'amount') {
        return isDesc ? b.principal - a.principal : a.principal - b.principal;
      } else if (sortBy === 'name') {
        return isDesc
          ? b.loanName.localeCompare(a.loanName)
          : a.loanName.localeCompare(b.loanName);
      } else if (sortBy === 'oldest') {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } else {
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      }
    });

    res.json(loans);
  } catch (error) {
    console.error('Error listing loans:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET specific loan
app.get('/api/loans/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans().filter(l => l.userId === user.id);
    const loan = loans.find(l => l.id === req.params.id);
    if (!loan) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    res.json(loan);
  } catch (error) {
    console.error('Error fetching loan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST create loan
app.post('/api/loans', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { loanName, lenderName, principal, rate, type, duration, durationUnit, startDate } = req.body;

    if (!loanName || !lenderName || !principal || rate === undefined || !type || !duration || !startDate) {
      return res.status(400).json({ error: 'Missing required loan parameters' });
    }

    const loans = readLoans();
    const durationMonths = durationUnit === 'Years' ? Number(duration) * 12 : Number(duration);

    const rawLoan: Loan = {
      id: Math.random().toString(36).substring(2, 11),
      userId: user.id,
      loanName,
      lenderName,
      principal: Number(principal),
      rate: Number(rate),
      type,
      duration: Number(duration),
      durationUnit: durationUnit || 'Months',
      startDate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      emi: 0,
      totalInterest: 0,
      totalRepayment: 0,
      remainingPrincipal: Number(principal),
      remainingInterest: 0,
      totalPaid: 0,
      interestPaid: 0,
      principalPaid: 0,
      completionPercentage: 0,
      paymentsMadeCount: 0,
      paymentsRemainingCount: durationMonths,
      nextEmiDate: startDate,
      status: 'Active',
      amortizationSchedule: [],
      payments: []
    };

    const calculatedLoan = recalculateLoan(rawLoan);
    loans.push(calculatedLoan);
    writeLoans(loans);

    // Notification
    sendNotificationToUser(
      user.id,
      '📈 New Loan Tracker Added',
      `Your loan of ${user.preferences.currency} ${principal} for "${loanName}" has been successfully added.`,
      'System'
    );

    res.status(201).json(calculatedLoan);
  } catch (error) {
    console.error('Error creating loan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update loan
app.put('/api/loans/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans();
    const idx = loans.findIndex(l => l.id === req.params.id && l.userId === user.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const { loanName, lenderName, principal, rate, type, duration, durationUnit, startDate } = req.body;

    if (!loanName || !lenderName || !principal || rate === undefined || !type || !duration || !startDate) {
      return res.status(400).json({ error: 'Missing required loan parameters' });
    }

    const updatedRaw: Loan = {
      ...loans[idx],
      loanName,
      lenderName,
      principal: Number(principal),
      rate: Number(rate),
      type,
      duration: Number(duration),
      durationUnit: durationUnit || 'Months',
      startDate,
      updatedAt: new Date().toISOString()
    };

    const recalculated = recalculateLoan(updatedRaw);
    loans[idx] = recalculated;
    writeLoans(loans);

    res.json(recalculated);
  } catch (error) {
    console.error('Error updating loan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE loan
app.delete('/api/loans/:id', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans();
    const filtered = loans.filter(l => !(l.id === req.params.id && l.userId === user.id));
    if (loans.length === filtered.length) {
      return res.status(404).json({ error: 'Loan not found' });
    }
    writeLoans(filtered);
    res.json({ success: true, message: 'Loan deleted successfully' });
  } catch (error) {
    console.error('Error deleting loan:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// LOAN SHARING ENDPOINTS
// ---------------------------------------------------------

// Enable or update loan sharing settings
app.post('/api/loans/:id/share', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const { privacy, expirationType, expirationDate, password, regenerate } = req.body;
    const loans = readLoans();
    const idx = loans.findIndex(l => l.id === req.params.id && l.userId === user.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const loan = loans[idx];
    let currentSharing = loan.sharing;

    let token = currentSharing?.token;
    if (!token || regenerate) {
      token = crypto.randomBytes(8).toString('hex');
    }

    let passwordHash = currentSharing?.passwordHash || null;
    let passwordProtected = currentSharing?.passwordProtected || false;

    if (password !== undefined) {
      if (password) {
        const salt = await bcrypt.genSalt(10);
        passwordHash = await bcrypt.hash(password, salt);
        passwordProtected = true;
      } else {
        passwordHash = null;
        passwordProtected = false;
      }
    }

    // Expiration calculation
    let calculatedExpDate: string | null = null;
    const now = new Date();
    if (expirationType === '24h') {
      calculatedExpDate = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();
    } else if (expirationType === '7d') {
      calculatedExpDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expirationType === '30d') {
      calculatedExpDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
    } else if (expirationType === 'custom' && expirationDate) {
      calculatedExpDate = new Date(expirationDate).toISOString();
    }

    const logs = currentSharing?.logs || [];
    logs.push({
      action: regenerate ? 'regenerated' : 'created',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });

    loan.sharing = {
      enabled: true,
      token,
      privacy: privacy || {
        showLoanAmount: true,
        showInterestRate: true,
        showEmi: true,
        showPaymentHistory: true,
        showCharts: true,
        showNotes: true,
        showRemainingBalance: true,
        showNextEmiDate: true
      },
      expirationType: expirationType || 'never',
      expirationDate: calculatedExpDate,
      passwordHash,
      passwordProtected,
      logs
    };

    loans[idx] = loan;
    writeLoans(loans);

    // Write a security notification
    sendNotificationToUser(
      user.id,
      '🔒 Loan Shared Successfully',
      `Sharing has been ${regenerate ? 'regenerated' : 'enabled'} for "${loan.loanName}". You can manage privacy and password controls anytime.`,
      'System'
    );

    res.json(loan);
  } catch (error) {
    console.error('Error enabling loan sharing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Revoke sharing for a loan
app.delete('/api/loans/:id/share', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans();
    const idx = loans.findIndex(l => l.id === req.params.id && l.userId === user.id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const loan = loans[idx];
    if (loan.sharing) {
      loan.sharing.enabled = false;
      loan.sharing.logs.push({
        action: 'revoked',
        timestamp: new Date().toISOString(),
        ip: req.ip
      });
    }

    loans[idx] = loan;
    writeLoans(loans);

    // Notification
    sendNotificationToUser(
      user.id,
      '🔒 Loan Sharing Revoked',
      `Shared access link for "${loan.loanName}" has been successfully disabled and revoked.`,
      'System'
    );

    res.json(loan);
  } catch (error) {
    console.error('Error revoking loan sharing:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public endpoint to validate shared token
app.get('/api/shared/validate/:token', (req, res) => {
  try {
    const { token } = req.params;
    const loans = readLoans();
    const loan = loans.find(l => l.sharing && l.sharing.token === token && l.sharing.enabled);

    if (!loan) {
      return res.status(404).json({ error: 'Shared loan not found, or sharing has been disabled.' });
    }

    const sharing = loan.sharing!;

    // Check expiration
    if (sharing.expirationDate && new Date(sharing.expirationDate) < new Date()) {
      return res.status(410).json({ error: 'This shared link has expired.' });
    }

    if (sharing.passwordProtected) {
      return res.json({ passwordRequired: true, loanName: loan.loanName });
    }

    // Access logging
    sharing.logs.push({
      action: 'accessed',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    writeLoans(loans);

    // Fetch owner currency preference
    const users = readUsers();
    const owner = users.find(u => u.id === loan.userId);
    const currency = owner?.preferences?.currency || 'USD';

    // Apply privacy controls
    const filteredLoan = applyPrivacyFilter(loan, sharing.privacy, currency);
    res.json(filteredLoan);
  } catch (error) {
    console.error('Error validating shared token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Public endpoint to unlock password-protected shared page
app.post('/api/shared/unlock/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    const loans = readLoans();
    const loan = loans.find(l => l.sharing && l.sharing.token === token && l.sharing.enabled);

    if (!loan) {
      return res.status(404).json({ error: 'Shared loan not found, or sharing has been disabled.' });
    }

    const sharing = loan.sharing!;

    // Check expiration
    if (sharing.expirationDate && new Date(sharing.expirationDate) < new Date()) {
      return res.status(410).json({ error: 'This shared link has expired.' });
    }

    if (sharing.passwordProtected) {
      if (!password) {
        return res.status(400).json({ error: 'Password is required to unlock this shared loan.' });
      }
      const isMatch = await bcrypt.compare(password, sharing.passwordHash || '');
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect password. Access denied.' });
      }
    }

    // Access logging
    sharing.logs.push({
      action: 'accessed',
      timestamp: new Date().toISOString(),
      ip: req.ip
    });
    writeLoans(loans);

    // Fetch owner currency preference
    const users = readUsers();
    const owner = users.find(u => u.id === loan.userId);
    const currency = owner?.preferences?.currency || 'USD';

    // Apply privacy controls
    const filteredLoan = applyPrivacyFilter(loan, sharing.privacy, currency);
    res.json(filteredLoan);
  } catch (error) {
    console.error('Error unlocking shared token:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST add payment
app.post('/api/loans/:id/payments', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans();
    const loanIdx = loans.findIndex(l => l.id === req.params.id && l.userId === user.id);
    if (loanIdx === -1) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const { paymentDate, amountPaid, notes } = req.body;
    if (!paymentDate || amountPaid === undefined) {
      return res.status(400).json({ error: 'Payment date and amount are required' });
    }

    const targetLoan = loans[loanIdx];
    const previousStatus = targetLoan.status;

    const newPayment: Payment = {
      id: Math.random().toString(36).substring(2, 11),
      paymentDate,
      amountPaid: Number(amountPaid),
      principalPortion: 0,
      interestPortion: 0,
      remainingBalance: 0,
      status: 'Paid',
      notes: notes || '',
    };

    targetLoan.payments = targetLoan.payments || [];
    targetLoan.payments.push(newPayment);

    const recalculated = recalculateLoan(targetLoan);
    loans[loanIdx] = recalculated;
    writeLoans(loans);

    // Motivational / Encouraging notification trigger
    let msg = `🎉 Great job! Your EMI payment of ${user.preferences.currency} ${amountPaid} has been recorded successfully.`;
    if (recalculated.status === 'Completed' && previousStatus === 'Active') {
      msg = `🏁 Congratulations! You have completely repaid your loan "${targetLoan.loanName}". You are officially debt-free on this loan! 🏆`;
    } else if (newPayment.amountPaid > targetLoan.emi * 1.05) {
      msg = `🎯 Your extra payment of ${user.preferences.currency} ${amountPaid} has reduced your remaining principal and saved you future interest!`;
    } else {
      const messages = [
        `🎉 Great job! Your EMI of ${user.preferences.currency} ${amountPaid} has been recorded successfully.`,
        `👏 You're making steady progress toward becoming debt-free on "${targetLoan.loanName}".`,
        `🌟 Every payment brings you closer to financial freedom!`,
        `💪 Keep going! Consistency builds a stronger financial future.`
      ];
      msg = messages[Math.floor(Math.random() * messages.length)];
    }

    sendNotificationToUser(
      user.id,
      'EMI Payment Recorded',
      msg,
      'Payment'
    );

    // Check Achievements
    await checkAndTriggerAchievements(user.id, targetLoan.id);

    res.status(201).json(recalculated);
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT update payment
app.put('/api/loans/:id/payments/:paymentId', authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans();
    const loanIdx = loans.findIndex(l => l.id === req.params.id && l.userId === user.id);
    if (loanIdx === -1) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const targetLoan = loans[loanIdx];
    const payIdx = (targetLoan.payments || []).findIndex(p => p.id === req.params.paymentId);
    if (payIdx === -1) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const { paymentDate, amountPaid, notes } = req.body;
    if (!paymentDate || amountPaid === undefined) {
      return res.status(400).json({ error: 'Payment date and amount are required' });
    }

    targetLoan.payments[payIdx] = {
      ...targetLoan.payments[payIdx],
      paymentDate,
      amountPaid: Number(amountPaid),
      notes: notes || ''
    };

    const recalculated = recalculateLoan(targetLoan);
    loans[loanIdx] = recalculated;
    writeLoans(loans);

    // Recalculate Achievements
    await checkAndTriggerAchievements(user.id, targetLoan.id);

    res.json(recalculated);
  } catch (error) {
    console.error('Error updating payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE payment
app.delete('/api/loans/:id/payments/:paymentId', authMiddleware, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.user!;
    const loans = readLoans();
    const loanIdx = loans.findIndex(l => l.id === req.params.id && l.userId === user.id);
    if (loanIdx === -1) {
      return res.status(404).json({ error: 'Loan not found' });
    }

    const targetLoan = loans[loanIdx];
    const originalLength = (targetLoan.payments || []).length;
    targetLoan.payments = (targetLoan.payments || []).filter(p => p.id !== req.params.paymentId);

    if (originalLength === targetLoan.payments.length) {
      return res.status(404).json({ error: 'Payment not found' });
    }

    const recalculated = recalculateLoan(targetLoan);
    loans[loanIdx] = recalculated;
    writeLoans(loans);

    res.json(recalculated);
  } catch (error) {
    console.error('Error deleting payment:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// WEB APP INTEGRATION (VITE / STATIC ROUTING)
// ---------------------------------------------------------
const startServer = async () => {
  const PORT = 3000;

  // Run the EMI reminder scheduler check on startup, and every 6 hours
  checkAndSendEMIReminders();
  setInterval(() => {
    console.log('[Scheduler] Running automated EMI reminders check...');
    checkAndSendEMIReminders();
  }, 6 * 60 * 60 * 1000); // every 6 hours

  if (process.env.NODE_ENV === 'production' || process.env.DISABLE_HMR === 'true') {
    const distPath = path.join(__dirname, 'dist');
    if (fs.existsSync(distPath)) {
      // Explicit route for service worker with cache control
      app.get('/sw.js', (req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Content-Type', 'application/javascript');
        res.sendFile(path.join(distPath, 'sw.js'));
      });

      // Explicit route for manifest.json with cache control
      app.get('/manifest.json', (req, res) => {
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Content-Type', 'application/json');
        res.sendFile(path.join(distPath, 'manifest.json'));
      });

      app.use(express.static(distPath));
      app.get('*', (req, res) => {
        res.sendFile(path.join(distPath, 'index.html'));
      });
    } else {
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: 'spa'
      });
      app.use(vite.middlewares);
    }
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`EMI Loan Tracker server running on http://localhost:${PORT}`);
  });
};

startServer().catch(console.error);
