import webpush from 'web-push';
import path from 'path';
import fs from 'fs';
import { 
  readUsers, 
  writeUsers, 
  readNotifications, 
  writeNotifications, 
  readLoans,
  BackendUser, 
  UserNotification 
} from './server-db';

const DATA_DIR = path.join(process.cwd(), 'data');
const VAPID_FILE = path.join(DATA_DIR, 'vapid.json');

let vapidKeys: { publicKey: string; privateKey: string };
if (fs.existsSync(VAPID_FILE)) {
  vapidKeys = JSON.parse(fs.readFileSync(VAPID_FILE, 'utf-8'));
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(VAPID_FILE, JSON.stringify(vapidKeys, null, 2), 'utf-8');
}

webpush.setVapidDetails(
  'mailto:satyajeeth.ophir@gmail.com',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

export { vapidKeys };

// Core Push Sender helper
export async function sendNotificationToUser(
  userId: string,
  title: string,
  body: string,
  category: 'EMI Reminder' | 'Payment' | 'Achievement' | 'System'
) {
  try {
    // 1. Save in-app notification
    const notifications = readNotifications();
    const newNotif: UserNotification = {
      id: Math.random().toString(36).substring(2, 11),
      userId,
      title,
      body,
      category,
      isRead: false,
      createdAt: new Date().toISOString()
    };
    notifications.unshift(newNotif); // Latest first
    writeNotifications(notifications);

    // 2. Fetch user's subscriptions
    const users = readUsers();
    const user = users.find(u => u.id === userId);
    if (!user) {
      return newNotif;
    }

    // Check general notification preferences
    if (!user.preferences?.notifications?.pushEnabled) {
      return newNotif;
    }

    if (category === 'Achievement' && !user.preferences.notifications.achievementEnabled) {
      return newNotif;
    }

    // Check quiet hours
    const now = new Date();
    const curTimeStr = now.toTimeString().split(' ')[0].substring(0, 5); // HH:MM
    const qStart = user.preferences.notifications.quietHoursStart;
    const qEnd = user.preferences.notifications.quietHoursEnd;

    if (qStart && qEnd) {
      const isQuiet = (time: string, start: string, end: string) => {
        if (start < end) {
          return time >= start && time <= end;
        } else {
          return time >= start || time <= end;
        }
      };
      if (isQuiet(curTimeStr, qStart, qEnd)) {
        console.log(`Notification suppressed during quiet hours for user ${userId}`);
        return newNotif; // Save in-app, skip push delivery
      }
    }

    // Check max daily notifications limit
    const maxDaily = user.preferences.notifications.maxDaily || 5;
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const todayNotifs = notifications.filter(
      n => n.userId === userId && new Date(n.createdAt) >= startOfToday
    );

    if (todayNotifs.length > maxDaily) {
      console.log(`Daily notification limit of ${maxDaily} reached for user ${userId}`);
      return newNotif; // Save in-app, skip push delivery
    }

    // Prepare push payload
    const payload = JSON.stringify({
      title,
      body,
      category,
      notificationId: newNotif.id,
      sound: user.preferences.notifications.sound || 'default',
      vibrate: user.preferences.notifications.vibration ? [100, 50, 100] : []
    });

    const activeSubscriptions = [...(user.pushSubscriptions || [])];
    let subscriptionsChanged = false;

    for (let i = 0; i < activeSubscriptions.length; i++) {
      const sub = activeSubscriptions[i];
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.keys.p256dh,
              auth: sub.keys.auth
            }
          },
          payload
        );
      } catch (err: any) {
        console.error(`Error sending push notification to endpoint ${sub.endpoint}:`, err);
        // If subscription has expired or is invalid, remove it
        if (err.statusCode === 410 || err.statusCode === 404) {
          activeSubscriptions.splice(i, 1);
          i--;
          subscriptionsChanged = true;
        }
      }
    }

    if (subscriptionsChanged) {
      const allUsers = readUsers();
      const userIdx = allUsers.findIndex(u => u.id === userId);
      if (userIdx !== -1) {
        allUsers[userIdx].pushSubscriptions = activeSubscriptions;
        writeUsers(allUsers);
      }
    }

    return newNotif;
  } catch (error) {
    console.error('Error in sendNotificationToUser:', error);
  }
}

// Check and trigger EMI reminders
export function checkAndSendEMIReminders() {
  try {
    const loans = readLoans();
    const users = readUsers();
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

    const getDaysDiff = (dateStr1: string, dateStr2: string) => {
      const d1 = new Date(dateStr1);
      const d2 = new Date(dateStr2);
      d1.setHours(0, 0, 0, 0);
      d2.setHours(0, 0, 0, 0);
      return Math.round((d1.getTime() - d2.getTime()) / (1000 * 60 * 60 * 24));
    };

    const notifications = readNotifications();

    const isReminderAlreadySent = (userId: string, loanId: string, dueDate: string, daysBefore: number) => {
      const marker = `loan:${loanId}:due:${dueDate}:days:${daysBefore}`;
      return notifications.some(n => n.userId === userId && n.body.includes(`(ref: ${marker})`));
    };

    loans.forEach(loan => {
      if (loan.status !== 'Active' || !loan.userId) return;

      const user = users.find(u => u.id === loan.userId);
      if (!user) return;

      const nextEmiDateStr = loan.nextEmiDate;
      if (!nextEmiDateStr || nextEmiDateStr === 'Completed') return;

      const daysDiff = getDaysDiff(nextEmiDateStr, todayStr);
      const reminderDays = user.preferences?.notifications?.reminderDays || [7, 3, 1, 0];

      const currency = user.preferences?.currency || 'USD';

      if (reminderDays.includes(daysDiff)) {
        if (!isReminderAlreadySent(user.id, loan.id, nextEmiDateStr, daysDiff)) {
          let message = '';
          if (daysDiff === 0) {
            message = `Your EMI of ${currency} ${loan.emi} for "${loan.loanName}" is due today!`;
          } else {
            message = `Your EMI of ${currency} ${loan.emi} for "${loan.loanName}" is due in ${daysDiff} day${daysDiff > 1 ? 's' : ''} (${nextEmiDateStr}).`;
          }
          const refMarker = `\n(ref: loan:${loan.id}:due:${nextEmiDateStr}:days:${daysDiff})`;

          sendNotificationToUser(
            user.id,
            '📅 EMI Due Reminder',
            `${message}${refMarker}`,
            'EMI Reminder'
          );
        }
      } else if (daysDiff < 0) {
        // Overdue
        const overdueDays = Math.abs(daysDiff);
        // Only notify every 3 days for overdue to keep them informed without being aggressive
        if (overdueDays % 3 === 0 && !isReminderAlreadySent(user.id, loan.id, nextEmiDateStr, -overdueDays)) {
          const message = `Your EMI of ${currency} ${loan.emi} for "${loan.loanName}" is overdue by ${overdueDays} days! Please record your payment.`;
          const refMarker = `\n(ref: loan:${loan.id}:due:${nextEmiDateStr}:days:${-overdueDays})`;

          sendNotificationToUser(
            user.id,
            '🚨 EMI Overdue Warning',
            `${message}${refMarker}`,
            'EMI Reminder'
          );
        }
      }
    });
  } catch (error) {
    console.error('Error in checkAndSendEMIReminders:', error);
  }
}
