import { useState, useEffect, useMemo } from 'react';
import { 
  Bell, Check, Trash2, Search, Filter, X, Award, ShieldAlert, BadgeInfo, CreditCard, Sparkles 
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { UserNotification } from '../types';

interface NotificationCenterProps {
  notifications: UserNotification[];
  onMarkRead: (id: string) => void;
  onMarkAllRead: () => void;
  onDeleteNotif: (id: string) => void;
  onClearAll: () => void;
  isOpen: boolean;
  onClose: () => void;
}

export default function NotificationCenter({
  notifications,
  onMarkRead,
  onMarkAllRead,
  onDeleteNotif,
  onClearAll,
  isOpen,
  onClose
}: NotificationCenterProps) {
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'EMI Reminder' | 'Payment' | 'Achievement' | 'System'>('all');

  // Filtered and searched list
  const filteredList = useMemo(() => {
    return notifications.filter(n => {
      const matchesSearch = n.title.toLowerCase().includes(search.toLowerCase()) || 
                            n.body.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = filterCategory === 'all' || n.category === filterCategory;
      return matchesSearch && matchesCategory;
    });
  }, [notifications, search, filterCategory]);

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case 'Achievement':
        return <Award className="w-4 h-4 text-amber-400" />;
      case 'EMI Reminder':
        return <ShieldAlert className="w-4 h-4 text-rose-400" />;
      case 'Payment':
        return <CreditCard className="w-4 h-4 text-emerald-400" />;
      default:
        return <BadgeInfo className="w-4 h-4 text-cyan-400" />;
    }
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'Achievement':
        return 'bg-amber-500/10 border-amber-500/20 text-amber-400';
      case 'EMI Reminder':
        return 'bg-rose-500/10 border-rose-500/20 text-rose-400';
      case 'Payment':
        return 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400';
      default:
        return 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400';
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            onClick={onClose}
            className="fixed inset-0 bg-zinc-950/60 backdrop-blur-sm z-50 transition-opacity"
          />

          {/* Drawer Panel */}
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            id="notification_center_drawer"
            className="fixed top-0 right-0 h-full w-full sm:w-96 bg-zinc-900 border-l border-zinc-800 z-50 flex flex-col shadow-2xl"
          >
            {/* Drawer Header */}
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-cyan-400" />
                <h3 className="font-bold text-zinc-100 text-lg">Notification Center</h3>
              </div>
              <button 
                onClick={onClose}
                className="w-8 h-8 rounded-lg bg-zinc-950 border border-zinc-800 hover:border-zinc-700 text-zinc-400 hover:text-zinc-200 transition-all flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Controls Bar */}
            <div className="p-4 border-b border-zinc-800 bg-zinc-950/40 space-y-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search notifications..."
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 pl-9 pr-4 text-xs text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                />
              </div>

              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5 max-w-[240px]">
                  {(['all', 'EMI Reminder', 'Payment', 'Achievement', 'System'] as const).map((cat) => (
                    <button
                      key={cat}
                      onClick={() => setFilterCategory(cat)}
                      className={`text-[10px] font-bold px-2.5 py-1 rounded-full border shrink-0 transition-all cursor-pointer ${
                        filterCategory === cat
                          ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                          : 'bg-zinc-950 text-zinc-500 border-zinc-800 hover:border-zinc-700'
                      }`}
                    >
                      {cat === 'all' ? 'All' : cat}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button 
                    onClick={onMarkAllRead}
                    disabled={notifications.length === 0}
                    className="text-[10px] font-bold text-zinc-400 hover:text-cyan-400 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Mark All Read
                  </button>
                  <span className="text-zinc-700 text-xs">|</span>
                  <button 
                    onClick={onClearAll}
                    disabled={notifications.length === 0}
                    className="text-[10px] font-bold text-zinc-400 hover:text-rose-400 transition-colors disabled:opacity-40 cursor-pointer"
                  >
                    Clear All
                  </button>
                </div>
              </div>
            </div>

            {/* Notifications Scroll */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {filteredList.map((notif) => (
                <div
                  key={notif.id}
                  className={`p-4 rounded-xl border transition-all flex items-start gap-3.5 relative group ${
                    notif.isRead 
                      ? 'bg-zinc-900 border-zinc-800/60 opacity-80' 
                      : 'bg-zinc-950 border-cyan-500/20 hover:border-cyan-500/40 shadow-sm shadow-cyan-950/5'
                  }`}
                >
                  {/* Category icon */}
                  <div className={`w-8 h-8 rounded-lg border shrink-0 flex items-center justify-center ${getCategoryColor(notif.category)}`}>
                    {getCategoryIcon(notif.category)}
                  </div>

                  {/* Body Content */}
                  <div className="flex-1 min-w-0 pr-6 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-zinc-500 font-bold">
                        {new Date(notif.createdAt).toLocaleDateString(undefined, { 
                          month: 'short', 
                          day: 'numeric',
                          hour: 'numeric',
                          minute: '2-digit'
                        })}
                      </span>
                      {!notif.isRead && (
                        <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse shrink-0 ml-2" />
                      )}
                    </div>
                    <h4 className={`text-xs font-bold leading-tight ${notif.isRead ? 'text-zinc-300' : 'text-zinc-100'}`}>
                      {notif.title}
                    </h4>
                    {/* Filter out VAPID / hidden references for clean readable logs */}
                    <p className="text-xs text-zinc-500 leading-relaxed font-medium">
                      {notif.body.split('\n(ref:')[0]}
                    </p>
                  </div>

                  {/* Action buttons (Absolute overlay on hover or desktop) */}
                  <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-100 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                    {!notif.isRead && (
                      <button
                        onClick={() => onMarkRead(notif.id)}
                        title="Mark as read"
                        className="w-6 h-6 rounded-md bg-zinc-900 hover:bg-cyan-500/10 text-zinc-400 hover:text-cyan-400 border border-zinc-800 transition-all flex items-center justify-center cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => onDeleteNotif(notif.id)}
                      title="Delete"
                      className="w-6 h-6 rounded-md bg-zinc-900 hover:bg-rose-500/10 text-zinc-400 hover:text-rose-400 border border-zinc-800 transition-all flex items-center justify-center cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}

              {/* EMPTY STATE */}
              {filteredList.length === 0 && (
                <div className="h-64 flex flex-col items-center justify-center text-center space-y-3 px-6">
                  <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center text-zinc-600">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-zinc-300">No Notifications</h4>
                    <p className="text-xs text-zinc-500 mt-1 max-w-xs leading-relaxed">
                      All caught up! Notifications regarding EMI reminders, payments, and achievements will appear here.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------
// ACHIEVEMENT CELEBRATION COMPONENT
// ---------------------------------------------------------
interface AchievementCelebrationProps {
  notifications: UserNotification[];
}

export function AchievementCelebration({ notifications }: AchievementCelebrationProps) {
  const [activeCelebration, setActiveCelebration] = useState<UserNotification | null>(null);

  useEffect(() => {
    if (notifications.length === 0) return;
    
    // Find if we earned an achievement in the last 4 seconds
    const latest = notifications[0];
    if (latest && latest.category === 'Achievement' && !latest.isRead) {
      const createdTime = new Date(latest.createdAt).getTime();
      const now = Date.now();
      
      // If triggered within last 6 seconds, show a celebration toast
      if (now - createdTime < 6000) {
        setActiveCelebration(latest);
        const timer = setTimeout(() => {
          setActiveCelebration(null);
        }, 5000);
        return () => clearTimeout(timer);
      }
    }
  }, [notifications]);

  return (
    <AnimatePresence>
      {activeCelebration && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="fixed bottom-6 left-6 right-6 sm:left-auto sm:right-6 sm:w-96 bg-zinc-900 border-2 border-amber-500/40 rounded-2xl p-5 shadow-2xl z-[100] flex items-start gap-4 overflow-hidden"
        >
          {/* Confetti golden ambient effect */}
          <div className="absolute inset-0 bg-gradient-to-r from-amber-500/5 to-yellow-500/10 pointer-events-none" />
          
          <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 shrink-0 flex items-center justify-center text-amber-400 relative">
            <Award className="w-5 h-5 animate-bounce" />
            <Sparkles className="w-3.5 h-3.5 text-yellow-300 absolute -top-1 -right-1" />
          </div>

          <div className="flex-1 min-w-0 space-y-1 relative z-10">
            <span className="text-[9px] font-black tracking-widest text-amber-400 uppercase block">CHAMPION ACHIEVEMENT</span>
            <h4 className="text-sm font-bold text-zinc-100">{activeCelebration.title}</h4>
            <p className="text-xs text-zinc-400 font-medium leading-relaxed">
              {activeCelebration.body}
            </p>
          </div>

          <button 
            onClick={() => setActiveCelebration(null)}
            className="text-zinc-500 hover:text-zinc-300 transition-colors shrink-0 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
