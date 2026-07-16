import { useState, useEffect, useMemo, useCallback, FormEvent } from 'react';
import {
  Plus,
  Trash2,
  Edit2,
  LineChart as ChartIcon,
  Calendar,
  DollarSign,
  TrendingUp,
  Wallet,
  Users,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowLeft,
  Search,
  SlidersHorizontal,
  Sparkles,
  RefreshCw,
  Wifi,
  WifiOff,
  Menu,
  X,
  ChevronRight,
  Info,
  FileText,
  Moon,
  Sun,
  Activity,
  Check,
  Percent,
  Settings as SettingsIcon,
  LogOut,
  Bell,
  Lock,
  User
} from 'lucide-react';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import AuthPages from './components/AuthPages';
import NotificationCenter, { AchievementCelebration } from './components/NotificationCenter';
import SettingsTab from './components/SettingsTab';
import { UserNotification } from './types';
import { getTranslation } from './lib/translations';

// Custom Local Fetch wrapper to inject JWT authentication tokens and capture 401 Unauthorized errors
const customFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const token = localStorage.getItem('emi_tracker_token');
  let headers: HeadersInit = { ...(init?.headers || {}) };
  
  if (token) {
    if (headers instanceof Headers) {
      headers.set('Authorization', `Bearer ${token}`);
    } else if (Array.isArray(headers)) {
      const hasAuth = headers.some(h => h[0].toLowerCase() === 'authorization');
      if (!hasAuth) {
        headers.push(['Authorization', `Bearer ${token}`]);
      }
    } else {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  try {
    const response = await window.fetch(input, { ...init, headers });
    if (response.status === 401) {
      window.dispatchEvent(new CustomEvent('session-expired'));
    }
    return response;
  } catch (error) {
    throw error;
  }
};

// Shadow global fetch within this module to ensure all calls in App.tsx use the customized fetch
const apiFetch = customFetch;

// Client-side Web Push subscription helper
const subscribeToPushNotifications = async (userId: string, userToken: string) => {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.warn('Web Push is not fully supported on this device/browser.');
    return;
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    
    // Fetch system VAPID public key
    const response = await apiFetch('/api/vapid-public-key', {
      headers: { 'Authorization': `Bearer ${userToken}` }
    });
    if (!response.ok) return;
    const { publicKey } = await response.json();
    if (!publicKey) return;

    // Convert base64 public key to suitable format
    const padding = '='.repeat((4 - (publicKey.length % 4)) % 4);
    const base64 = (publicKey + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    // Subscribe user to Push service
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: outputArray
    });

    // Upload subscription coordinates to backend
    await apiFetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify(subscription)
    });

    console.log('[Push] Registration with system Web Push completed successfully.');
  } catch (err) {
    console.warn('[Push] Error subscribing to push notifications:', err);
  }
};

// Matching backend interfaces
interface Payment {
  id: string;
  paymentDate: string;
  amountPaid: number;
  principalPortion: number;
  interestPortion: number;
  remainingBalance: number;
  status: 'Paid' | 'Partial' | 'Extra' | 'Missed';
  notes: string;
}

interface AmortizationSlot {
  month: number;
  dueDate: string;
  emi: number;
  principalPortion: number;
  interestPortion: number;
  remainingBalance: number;
}

interface Loan {
  id: string;
  loanName: string;
  lenderName: string;
  principal: number;
  rate: number;
  type: 'Flat' | 'Reducing';
  duration: number;
  durationUnit: 'Months' | 'Years';
  startDate: string;
  createdAt: string;
  updatedAt: string;
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

interface DashboardStats {
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

interface OfflineAction {
  id: string;
  type: 'CREATE_LOAN' | 'UPDATE_LOAN' | 'DELETE_LOAN' | 'ADD_PAYMENT' | 'UPDATE_PAYMENT' | 'DELETE_PAYMENT';
  loanId?: string;
  paymentId?: string;
  data?: any;
  timestamp: number;
}

export default function App() {
  // Navigation & General State
  const [currentTab, setCurrentTab] = useState<'dashboard' | 'analytics' | 'loan-details' | 'settings'>('dashboard');
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  
  // Auth states
  const [user, setUser] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const lang = user?.preferences?.language || 'en';
  const t = (key: string) => getTranslation(key, lang);

  // Notification states
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [isNotificationCenterOpen, setIsNotificationCenterOpen] = useState(false);

  // Data State
  const [loans, setLoans] = useState<Loan[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  
  // Filtering & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'completed'>('all');
  const [sortBy, setSortBy] = useState<'newest' | 'oldest' | 'amount' | 'name'>('newest');

  // Modal / Form States
  const [isLoanModalOpen, setIsLoanModalOpen] = useState<boolean>(false);
  const [editingLoan, setEditingLoan] = useState<Loan | null>(null);
  const [loanFormData, setLoanFormData] = useState({
    loanName: '',
    lenderName: '',
    principal: '',
    rate: '',
    type: 'Reducing' as 'Flat' | 'Reducing',
    duration: '',
    durationUnit: 'Months' as 'Months' | 'Years',
    startDate: new Date().toISOString().split('T')[0]
  });

  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState<boolean>(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentFormData, setPaymentFormData] = useState({
    paymentDate: new Date().toISOString().split('T')[0],
    amountPaid: '',
    notes: ''
  });

  // UI Theme / Responsive States
  const [themeMode, setThemeMode] = useState<'dark' | 'light'>('dark');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  
  // PWA Offline Sync States
  const [isOffline, setIsOffline] = useState<boolean>(!navigator.onLine);
  const [offlineActions, setOfflineActions] = useState<OfflineAction[]>([]);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'syncing' | 'success' | 'failed'>('idle');

  // Fetch all user notifications from API
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.warn('Failed to fetch user notifications');
    }
  }, [token]);

  // Handle successful sign in/up
  const handleLoginSuccess = (profile: any, userToken: string) => {
    localStorage.setItem('emi_tracker_token', userToken);
    localStorage.setItem('emi_tracker_user', JSON.stringify(profile));
    setToken(userToken);
    setUser(profile);
    setCurrentTab('dashboard');

    setTimeout(() => {
      subscribeToPushNotifications(profile.id, userToken);
    }, 500);
  };

  // Clean log out
  const handleLogout = useCallback(() => {
    localStorage.removeItem('emi_tracker_token');
    localStorage.removeItem('emi_tracker_user');
    setToken(null);
    setUser(null);
    setLoans([]);
    setStats(null);
    setNotifications([]);
    setCurrentTab('dashboard');
    setSelectedLoanId(null);
  }, []);

  // 1. Auth & Theme Restorer
  useEffect(() => {
    const savedToken = localStorage.getItem('emi_tracker_token');
    const savedProfile = localStorage.getItem('emi_tracker_user');
    
    if (savedToken && savedProfile) {
      try {
        setToken(savedToken);
        setUser(JSON.parse(savedProfile));
      } catch (e) {
        handleLogout();
      }
    } else {
      setIsLoading(false);
    }

    // Custom Event Listener for session expiration
    const handleExpired = () => {
      handleLogout();
    };
    window.addEventListener('session-expired', handleExpired);
    return () => window.removeEventListener('session-expired', handleExpired);
  }, [handleLogout]);

  // Apply user interface theme choices
  useEffect(() => {
    const activeTheme = user?.preferences?.theme || localStorage.getItem('emi_tracker_theme') || 'dark';
    
    if (activeTheme === 'light') {
      setThemeMode('light');
      document.documentElement.classList.remove('dark');
    } else if (activeTheme === 'dark') {
      setThemeMode('dark');
      document.documentElement.classList.add('dark');
    } else {
      const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      setThemeMode(systemPrefersDark ? 'dark' : 'light');
      if (systemPrefersDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [user]);

  const toggleTheme = () => {
    const nextTheme = themeMode === 'dark' ? 'light' : 'dark';
    setThemeMode(nextTheme);
    localStorage.setItem('emi_tracker_theme', nextTheme);
    if (nextTheme === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
  };

  // 2. Load Offline actions queue
  useEffect(() => {
    const saved = localStorage.getItem('offline_actions');
    if (saved) {
      setOfflineActions(JSON.parse(saved));
    }
  }, []);

  const saveOfflineActions = (actions: OfflineAction[]) => {
    setOfflineActions(actions);
    localStorage.setItem('offline_actions', JSON.stringify(actions));
  };

  // 3. Network connection listeners
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      triggerOfflineSync();
    };
    const handleOffline = () => {
      setIsOffline(true);
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [offlineActions]);

  // 4. Data Fetcher (from API with Offline Caching Fallback)
  const fetchData = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      // Fetch stats
      const statsRes = await apiFetch('/api/stats');
      const statsData = await statsRes.json();
      
      // Fetch loans
      const loansRes = await apiFetch('/api/loans');
      const loansData = await loansRes.json();

      if (statsData.isOfflineFallback || loansData.isOfflineFallback) {
        setIsOffline(true);
      }

      setStats(statsData.isOfflineFallback ? null : statsData);
      setLoans(Array.isArray(loansData) ? loansData : []);
    } catch (error) {
      console.warn('Network request failed, working in offline fallback mode.');
      setIsOffline(true);
      // Load offline cache from local storage if available, or allow Service worker to handle it
      const cachedLoans = localStorage.getItem('cached_loans');
      const cachedStats = localStorage.getItem('cached_stats');
      if (cachedLoans) setLoans(JSON.parse(cachedLoans));
      if (cachedStats) setStats(JSON.parse(cachedStats));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Sync cache with local storage for offline reading
  useEffect(() => {
    if (loans.length > 0 && !isOffline) {
      localStorage.setItem('cached_loans', JSON.stringify(loans));
    }
    if (stats && !isOffline) {
      localStorage.setItem('cached_stats', JSON.stringify(stats));
    }
  }, [loans, stats, isOffline]);

  // Load everything when token is initialized
  useEffect(() => {
    if (token) {
      fetchData();
      fetchNotifications();
    }
  }, [token, fetchData, fetchNotifications]);

  // 5. Offline Sync Action Processor
  const triggerOfflineSync = async () => {
    if (offlineActions.length === 0) return;
    setSyncStatus('syncing');

    const actionsToSync = [...offlineActions].sort((a, b) => a.timestamp - b.timestamp);
    let successCount = 0;

    for (const action of actionsToSync) {
      try {
        let res;
        if (action.type === 'CREATE_LOAN') {
          res = await apiFetch('/api/loans', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.data)
          });
        } else if (action.type === 'UPDATE_LOAN') {
          res = await apiFetch(`/api/loans/${action.loanId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.data)
          });
        } else if (action.type === 'DELETE_LOAN') {
          res = await apiFetch(`/api/loans/${action.loanId}`, { method: 'DELETE' });
        } else if (action.type === 'ADD_PAYMENT') {
          res = await apiFetch(`/api/loans/${action.loanId}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.data)
          });
        } else if (action.type === 'UPDATE_PAYMENT') {
          res = await apiFetch(`/api/loans/${action.loanId}/payments/${action.paymentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(action.data)
          });
        } else if (action.type === 'DELETE_PAYMENT') {
          res = await apiFetch(`/api/loans/${action.loanId}/payments/${action.paymentId}`, {
            method: 'DELETE'
          });
        }

        if (res && res.ok) {
          successCount++;
        }
      } catch (error) {
        console.error('Failed to sync action:', action, error);
        break; // Stop syncing upon error to preserve order
      }
    }

    if (successCount === actionsToSync.length) {
      setSyncStatus('success');
      saveOfflineActions([]);
      setTimeout(() => setSyncStatus('idle'), 3000);
      fetchData(); // Reload absolute truth from database
    } else {
      setSyncStatus('failed');
      // Remove successfully synced actions from queue
      const remainingActions = actionsToSync.slice(successCount);
      saveOfflineActions(remainingActions);
    }
  };

  // 6. Optimistic Client State Updator (Ensures responsive instant local state)
  const applyOptimisticAction = (action: OfflineAction) => {
    // Save to sync queue
    const updatedActions = [...offlineActions, action];
    saveOfflineActions(updatedActions);

    if (action.type === 'CREATE_LOAN') {
      const durationMonths = action.data.durationUnit === 'Years' ? Number(action.data.duration) * 12 : Number(action.data.duration);
      const tempLoan: Loan = {
        id: action.id,
        loanName: action.data.loanName,
        lenderName: action.data.lenderName,
        principal: Number(action.data.principal),
        rate: Number(action.data.rate),
        type: action.data.type,
        duration: Number(action.data.duration),
        durationUnit: action.data.durationUnit || 'Months',
        startDate: action.data.startDate,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        emi: Number((action.data.principal * (1 + (action.data.rate / 100)) / durationMonths).toFixed(2)),
        totalInterest: Number((action.data.principal * (action.data.rate / 100)).toFixed(2)),
        totalRepayment: Number((action.data.principal * (1 + (action.data.rate / 100))).toFixed(2)),
        remainingPrincipal: Number(action.data.principal),
        remainingInterest: Number((action.data.principal * (action.data.rate / 100)).toFixed(2)),
        totalPaid: 0,
        interestPaid: 0,
        principalPaid: 0,
        completionPercentage: 0,
        paymentsMadeCount: 0,
        paymentsRemainingCount: durationMonths,
        nextEmiDate: action.data.startDate,
        status: 'Active',
        amortizationSchedule: [],
        payments: []
      };
      setLoans(prev => [...prev, tempLoan]);
    } else if (action.type === 'UPDATE_LOAN') {
      setLoans(prev => prev.map(l => l.id === action.loanId ? { ...l, ...action.data, updatedAt: new Date().toISOString() } : l));
    } else if (action.type === 'DELETE_LOAN') {
      setLoans(prev => prev.filter(l => l.id !== action.loanId));
      if (selectedLoanId === action.loanId) {
        setSelectedLoanId(null);
        setCurrentTab('dashboard');
      }
    } else if (action.type === 'ADD_PAYMENT') {
      setLoans(prev => prev.map(l => {
        if (l.id === action.loanId) {
          const payments = [...(l.payments || [])];
          const newPay: Payment = {
            id: action.id,
            paymentDate: action.data.paymentDate,
            amountPaid: Number(action.data.amountPaid),
            principalPortion: Number(action.data.amountPaid) * 0.8, // Estimate for instant UI
            interestPortion: Number(action.data.amountPaid) * 0.2, // Estimate for instant UI
            remainingBalance: Math.max(0, l.remainingPrincipal + l.remainingInterest - Number(action.data.amountPaid)),
            status: Number(action.data.amountPaid) >= l.emi ? 'Paid' : 'Partial',
            notes: action.data.notes || ''
          };
          payments.push(newPay);
          return {
            ...l,
            payments,
            totalPaid: Number((l.totalPaid + newPay.amountPaid).toFixed(2)),
            remainingPrincipal: Number(Math.max(0, l.remainingPrincipal - newPay.principalPortion).toFixed(2)),
            remainingInterest: Number(Math.max(0, l.remainingInterest - newPay.interestPortion).toFixed(2))
          };
        }
        return l;
      }));
    } else if (action.type === 'DELETE_PAYMENT') {
      setLoans(prev => prev.map(l => {
        if (l.id === action.loanId) {
          const originalPay = l.payments.find(p => p.id === action.paymentId);
          const amt = originalPay ? originalPay.amountPaid : 0;
          return {
            ...l,
            payments: l.payments.filter(p => p.id !== action.paymentId),
            totalPaid: Number(Math.max(0, l.totalPaid - amt).toFixed(2))
          };
        }
        return l;
      }));
    }
  };

  // 7. Mutate API Actions
  const handleSaveLoan = async (e: FormEvent) => {
    e.preventDefault();
    const parsedData = {
      loanName: loanFormData.loanName,
      lenderName: loanFormData.lenderName,
      principal: Number(loanFormData.principal),
      rate: Number(loanFormData.rate),
      type: loanFormData.type,
      duration: Number(loanFormData.duration),
      durationUnit: loanFormData.durationUnit,
      startDate: loanFormData.startDate,
    };

    const actionId = Math.random().toString(36).substring(2, 11);

    if (isOffline) {
      if (editingLoan) {
        applyOptimisticAction({
          id: actionId,
          type: 'UPDATE_LOAN',
          loanId: editingLoan.id,
          data: parsedData,
          timestamp: Date.now()
        });
      } else {
        applyOptimisticAction({
          id: actionId,
          type: 'CREATE_LOAN',
          data: parsedData,
          timestamp: Date.now()
        });
      }
      setIsLoanModalOpen(false);
      return;
    }

    try {
      let response;
      if (editingLoan) {
        response = await apiFetch(`/api/loans/${editingLoan.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
      } else {
        response = await apiFetch('/api/loans', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
      }

      if (response.ok) {
        setIsLoanModalOpen(false);
        fetchData();
      }
    } catch (err) {
      console.error('Failed to save loan, adding to offline queue.');
      applyOptimisticAction({
        id: actionId,
        type: editingLoan ? 'UPDATE_LOAN' : 'CREATE_LOAN',
        loanId: editingLoan?.id,
        data: parsedData,
        timestamp: Date.now()
      });
      setIsLoanModalOpen(false);
    }
  };

  const handleDeleteLoan = async (loanId: string) => {
    if (!window.confirm('Are you absolutely sure you want to delete this loan? This will delete all payment records associated with it.')) {
      return;
    }

    const actionId = Math.random().toString(36).substring(2, 11);

    if (isOffline) {
      applyOptimisticAction({
        id: actionId,
        type: 'DELETE_LOAN',
        loanId,
        timestamp: Date.now()
      });
      return;
    }

    try {
      const response = await apiFetch(`/api/loans/${loanId}`, { method: 'DELETE' });
      if (response.ok) {
        if (selectedLoanId === loanId) {
          setSelectedLoanId(null);
          setCurrentTab('dashboard');
        }
        fetchData();
      }
    } catch (error) {
      applyOptimisticAction({
        id: actionId,
        type: 'DELETE_LOAN',
        loanId,
        timestamp: Date.now()
      });
    }
  };

  const handleSavePayment = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedLoanId) return;

    const parsedData = {
      paymentDate: paymentFormData.paymentDate,
      amountPaid: Number(paymentFormData.amountPaid),
      notes: paymentFormData.notes
    };

    const actionId = Math.random().toString(36).substring(2, 11);

    if (isOffline) {
      if (editingPayment) {
        applyOptimisticAction({
          id: actionId,
          type: 'UPDATE_PAYMENT',
          loanId: selectedLoanId,
          paymentId: editingPayment.id,
          data: parsedData,
          timestamp: Date.now()
        });
      } else {
        applyOptimisticAction({
          id: actionId,
          type: 'ADD_PAYMENT',
          loanId: selectedLoanId,
          data: parsedData,
          timestamp: Date.now()
        });
      }
      setIsPaymentModalOpen(false);
      return;
    }

    try {
      let response;
      if (editingPayment) {
        response = await apiFetch(`/api/loans/${selectedLoanId}/payments/${editingPayment.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
      } else {
        response = await apiFetch(`/api/loans/${selectedLoanId}/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(parsedData)
        });
      }

      if (response.ok) {
        setIsPaymentModalOpen(false);
        fetchData();
      }
    } catch (err) {
      applyOptimisticAction({
        id: actionId,
        type: editingPayment ? 'UPDATE_PAYMENT' : 'ADD_PAYMENT',
        loanId: selectedLoanId,
        paymentId: editingPayment?.id,
        data: parsedData,
        timestamp: Date.now()
      });
      setIsPaymentModalOpen(false);
    }
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!selectedLoanId || !window.confirm('Delete this payment record?')) return;

    const actionId = Math.random().toString(36).substring(2, 11);

    if (isOffline) {
      applyOptimisticAction({
        id: actionId,
        type: 'DELETE_PAYMENT',
        loanId: selectedLoanId,
        paymentId,
        timestamp: Date.now()
      });
      return;
    }

    try {
      const response = await apiFetch(`/api/loans/${selectedLoanId}/payments/${paymentId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        fetchData();
      }
    } catch (error) {
      applyOptimisticAction({
        id: actionId,
        type: 'DELETE_PAYMENT',
        loanId: selectedLoanId,
        paymentId,
        timestamp: Date.now()
      });
    }
  };

  // Helper to open Edit Loan
  const openEditLoan = (loan: Loan) => {
    setEditingLoan(loan);
    setLoanFormData({
      loanName: loan.loanName,
      lenderName: loan.lenderName,
      principal: String(loan.principal),
      rate: String(loan.rate),
      type: loan.type,
      duration: String(loan.duration),
      durationUnit: loan.durationUnit,
      startDate: loan.startDate
    });
    setIsLoanModalOpen(true);
  };

  // Helper to open Add Loan
  const openAddLoan = () => {
    setEditingLoan(null);
    setLoanFormData({
      loanName: '',
      lenderName: '',
      principal: '',
      rate: '',
      type: 'Reducing',
      duration: '',
      durationUnit: 'Months',
      startDate: new Date().toISOString().split('T')[0]
    });
    setIsLoanModalOpen(true);
  };

  // Helper to open Edit Payment
  const openEditPayment = (payment: Payment) => {
    setEditingPayment(payment);
    setPaymentFormData({
      paymentDate: payment.paymentDate,
      amountPaid: String(payment.amountPaid),
      notes: payment.notes
    });
    setIsPaymentModalOpen(true);
  };

  // Helper to open Add Payment
  const openAddPayment = (suggestedAmount: number) => {
    setEditingPayment(null);
    setPaymentFormData({
      paymentDate: new Date().toISOString().split('T')[0],
      amountPaid: suggestedAmount > 0 ? String(suggestedAmount) : '',
      notes: ''
    });
    setIsPaymentModalOpen(true);
  };

  // 8. Filters & Search computation on client-side
  const filteredLoans = useMemo(() => {
    let result = [...loans];

    // Search query
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        l => l.loanName.toLowerCase().includes(q) || l.lenderName.toLowerCase().includes(q)
      );
    }

    // Filter status
    if (filterStatus === 'active') {
      result = result.filter(l => l.status === 'Active');
    } else if (filterStatus === 'completed') {
      result = result.filter(l => l.status === 'Completed');
    }

    // Sort
    result.sort((a, b) => {
      if (sortBy === 'amount') {
        return b.principal - a.principal;
      } else if (sortBy === 'name') {
        return a.loanName.localeCompare(b.loanName);
      } else if (sortBy === 'oldest') {
        return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      } else {
        // default 'newest'
        return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      }
    });

    return result;
  }, [loans, searchQuery, filterStatus, sortBy]);

  // Selected Loan for Detail View
  const selectedLoan = useMemo(() => {
    if (!selectedLoanId) return null;
    return loans.find(l => l.id === selectedLoanId) || null;
  }, [loans, selectedLoanId]);

  // Calculate global summary stats locally to guarantee synchronization during offline states
  const computedStats = useMemo(() => {
    if (!isOffline && stats) return stats;

    // Offline calculations
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

    return {
      totalLoanAmount,
      totalPaid,
      remainingBalance,
      totalInterest,
      interestPaid,
      remainingInterest,
      currentEmi: currentEmiSum,
      nextEmiDate: nextEmiDate || 'N/A',
      completionPercentage,
      paymentsMade,
      paymentsRemaining,
      totalActiveLoans: loans.filter(l => l.status === 'Active').length,
      totalCompletedLoans: loans.filter(l => l.status === 'Completed').length,
    };
  }, [loans, stats, isOffline]);

  // ANALYTICS GRAPH CALCULATIONS
  // A. Remaining Balance over time (Combining all ongoing amortizations by chronological month)
  const balanceTrendData = useMemo(() => {
    const monthsMap: { [key: string]: number } = {};

    loans.forEach(loan => {
      if (loan.status === 'Completed') return;
      (loan.amortizationSchedule || []).forEach(slot => {
        // extract YYYY-MM
        const monthKey = slot.dueDate.substring(0, 7);
        monthsMap[monthKey] = (monthsMap[monthKey] || 0) + slot.remainingBalance;
      });
    });

    return Object.keys(monthsMap)
      .sort()
      .slice(0, 12) // Show next 12 months
      .map(key => {
        const [year, month] = key.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        const label = date.toLocaleString('default', { month: 'short', year: '2-digit' });
        return {
          month: label,
          'Remaining Liabilities': Number(monthsMap[key].toFixed(2))
        };
      });
  }, [loans]);

  // B. Principal vs Interest scheduled split (upcoming 12 months expense barchart)
  const costDistributionData = useMemo(() => {
    const expenseMap: { [key: string]: { principal: number, interest: number } } = {};

    loans.forEach(loan => {
      if (loan.status === 'Completed') return;
      (loan.amortizationSchedule || []).forEach(slot => {
        const monthKey = slot.dueDate.substring(0, 7);
        if (!expenseMap[monthKey]) {
          expenseMap[monthKey] = { principal: 0, interest: 0 };
        }
        expenseMap[monthKey].principal += slot.principalPortion;
        expenseMap[monthKey].interest += slot.interestPortion;
      });
    });

    return Object.keys(expenseMap)
      .sort()
      .slice(0, 12)
      .map(key => {
        const [year, month] = key.split('-');
        const date = new Date(Number(year), Number(month) - 1, 1);
        const label = date.toLocaleString('default', { month: 'short' });
        return {
          month: label,
          'Principal Portion': Number(expenseMap[key].principal.toFixed(2)),
          'Interest Portion': Number(expenseMap[key].interest.toFixed(2))
        };
      });
  }, [loans]);

  // C. actual Monthly payment trend group
  const paymentTrendData = useMemo(() => {
    const trendMap: { [key: string]: number } = {};

    loans.forEach(loan => {
      (loan.payments || []).forEach(p => {
        if (p.status === 'Missed') return;
        const monthKey = p.paymentDate.substring(0, 7);
        trendMap[monthKey] = (trendMap[monthKey] || 0) + p.amountPaid;
      });
    });

    const sortedKeys = Object.keys(trendMap).sort();
    const fillKeys = sortedKeys.length > 6 ? sortedKeys.slice(-6) : sortedKeys;

    return fillKeys.map(key => {
      const [year, month] = key.split('-');
      const date = new Date(Number(year), Number(month) - 1, 1);
      const label = date.toLocaleString('default', { month: 'short', year: '2-digit' });
      return {
        month: label,
        'Amount Paid': Number(trendMap[key].toFixed(2))
      };
    });
  }, [loans]);

  // D. Paid vs Outstanding Pie data
  const pieChartData = useMemo(() => {
    return [
      { name: 'Total Repaid', value: Number(computedStats.totalPaid.toFixed(2)), color: '#06b6d4' },
      { name: 'Remaining Debt', value: Number(computedStats.remainingBalance.toFixed(2)), color: '#f43f5e' }
    ];
  }, [computedStats]);

  const currencyFormatter = (value: number) => {
    const prefCurrency = user?.preferences?.currency || 'USD';
    const locale = prefCurrency === 'INR' ? 'en-IN' : 'en-US';
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: prefCurrency,
      maximumFractionDigits: 0
    }).format(value);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center space-y-4 font-sans">
        <div className="w-10 h-10 border-2 border-cyan-500/10 border-t-cyan-400 rounded-full animate-spin" />
        <span className="text-xs text-zinc-500 font-bold tracking-wider uppercase">Loading Workspace...</span>
      </div>
    );
  }

  if (!user) {
    return <AuthPages onLoginSuccess={handleLoginSuccess} />;
  }

  return (
    <div id="app_root" className="flex h-screen bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      
      {/* DESKTOP SIDEBAR */}
      <aside id="desktop_sidebar" className="hidden md:flex flex-col w-64 bg-zinc-900 border-r border-zinc-800 shrink-0">
        <div className="flex items-center gap-3 p-6 border-b border-zinc-800">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner">
            <TrendingUp className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-semibold text-zinc-100 tracking-tight leading-tight">{t('app_title')}</h1>
            <span className="text-xs text-zinc-500 font-medium">{t('app_subtitle')}</span>
          </div>
        </div>

        {/* Navigation links */}
        <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
          <button
            id="nav_dashboard"
            onClick={() => { setCurrentTab('dashboard'); setSelectedLoanId(null); }}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              currentTab === 'dashboard'
                ? 'bg-zinc-800 text-cyan-400 border border-zinc-700/50 shadow-sm'
                : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100'
            }`}
          >
            <Wallet className="w-4 h-4" />
            {t('nav_dashboard')}
          </button>

          <button
            id="nav_analytics"
            onClick={() => { setCurrentTab('analytics'); setSelectedLoanId(null); }}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              currentTab === 'analytics'
                ? 'bg-zinc-800 text-cyan-400 border border-zinc-700/50 shadow-sm'
                : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100'
            }`}
          >
            <ChartIcon className="w-4 h-4" />
            {t('nav_analytics')}
          </button>

          <button
            id="nav_settings"
            onClick={() => { setCurrentTab('settings'); setSelectedLoanId(null); }}
            className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl text-sm font-medium transition-all ${
              currentTab === 'settings'
                ? 'bg-zinc-800 text-cyan-400 border border-zinc-700/50 shadow-sm'
                : 'text-zinc-400 hover:bg-zinc-800/40 hover:text-zinc-100'
            }`}
          >
            <SettingsIcon className="w-4 h-4" />
            {t('nav_settings')}
          </button>

          <div className="pt-6 pb-2 px-4">
            <span className="text-[10px] font-bold text-zinc-500 tracking-wider uppercase">{t('nav_active_profiles')}</span>
          </div>

          <div className="space-y-1">
            {loans.map(loan => (
              <button
                key={loan.id}
                onClick={() => { setSelectedLoanId(loan.id); setCurrentTab('loan-details'); }}
                className={`flex items-center justify-between w-full px-4 py-2 text-xs font-medium rounded-lg transition-all ${
                  selectedLoanId === loan.id
                    ? 'bg-cyan-500/10 text-cyan-400 border-l-2 border-cyan-500 pl-3'
                    : 'text-zinc-400 hover:bg-zinc-800/30 hover:text-zinc-200'
                }`}
              >
                <span className="truncate">{loan.loanName}</span>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" />
              </button>
            ))}
            {loans.length === 0 && (
              <div className="px-4 py-2 text-xs text-zinc-600 italic">{t('nav_no_profiles')}</div>
            )}
          </div>
        </nav>

        {/* Offline sync status and actions */}
        <div className="p-4 border-t border-zinc-800 bg-zinc-900/50 space-y-3">
          {/* Offline/Online indicators */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800">
            <div className="flex items-center gap-2">
              {isOffline ? (
                <>
                  <WifiOff className="w-4 h-4 text-rose-400 animate-pulse" />
                  <span className="text-xs font-semibold text-rose-400">Offline Mode</span>
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-semibold text-emerald-400">Connected</span>
                </>
              )}
            </div>
            {offlineActions.length > 0 && (
              <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-bold animate-pulse">
                {offlineActions.length} Pending
              </span>
            )}
          </div>

          {/* Sync Trigger button */}
          {offlineActions.length > 0 && !isOffline && (
            <button
              id="sync_now_btn"
              onClick={triggerOfflineSync}
              disabled={syncStatus === 'syncing'}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-zinc-950 transition-all disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
              {syncStatus === 'syncing' ? 'Syncing...' : 'Sync Pending Changes'}
            </button>
          )}

          {/* Theme switcher */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-zinc-500 font-medium">Dark Mode Interface</span>
            <button
              id="theme_toggle_sidebar"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 transition-colors"
            >
              {themeMode === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-indigo-400" />}
            </button>
          </div>
        </div>
      </aside>

      {/* MOBILE HEADER & ACTION WRAPPER */}
      <div id="content_canvas" className="flex-1 flex flex-col h-full overflow-hidden bg-zinc-950">
        
        {/* MOBILE TOP BAR */}
        <header id="mobile_header" className="flex items-center justify-between md:hidden px-6 py-4 bg-zinc-900 border-b border-zinc-800">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <TrendingUp className="w-4 h-4" />
            </div>
            <h1 className="font-semibold text-sm text-zinc-100 tracking-tight">EMI Tracker</h1>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              id="mobile_notif_trigger"
              onClick={() => setIsNotificationCenterOpen(true)}
              className="relative p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300"
            >
              <Bell className="w-3.5 h-3.5" />
              {notifications.filter(n => !n.isRead).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-cyan-500 text-zinc-950 text-[9px] font-black w-4 h-4 rounded-full flex items-center justify-center border-2 border-zinc-900">
                  {notifications.filter(n => !n.isRead).length}
                </span>
              )}
            </button>
            <button
              id="mobile_theme_toggle"
              onClick={toggleTheme}
              className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-300"
            >
              {themeMode === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
            </button>
            <button
              id="mobile_menu_trigger"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="p-1.5 rounded-lg bg-zinc-800 border border-zinc-700 text-zinc-100"
            >
              {isMobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
          </div>
        </header>

        {/* MOBILE DROPDOWN MENU */}
        {isMobileMenuOpen && (
          <div id="mobile_menu_drawer" className="md:hidden flex flex-col bg-zinc-900 border-b border-zinc-800 absolute top-16 left-0 right-0 z-50 p-6 space-y-4 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="grid grid-cols-2 gap-3">
              <button
                id="mob_nav_dashboard"
                onClick={() => { setCurrentTab('dashboard'); setSelectedLoanId(null); setIsMobileMenuOpen(false); }}
                className={`flex flex-col items-center justify-center p-4 rounded-xl text-sm font-semibold border transition-all ${
                  currentTab === 'dashboard'
                    ? 'bg-zinc-800 text-cyan-400 border-cyan-500/30'
                    : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:text-zinc-100'
                }`}
              >
                <Wallet className="w-5 h-5 mb-2" />
                {t('nav_dashboard')}
              </button>
              <button
                id="mob_nav_analytics"
                onClick={() => { setCurrentTab('analytics'); setSelectedLoanId(null); setIsMobileMenuOpen(false); }}
                className={`flex flex-col items-center justify-center p-4 rounded-xl text-sm font-semibold border transition-all ${
                  currentTab === 'analytics'
                    ? 'bg-zinc-800 text-cyan-400 border-cyan-500/30'
                    : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:text-zinc-100'
                }`}
              >
                <ChartIcon className="w-5 h-5 mb-2" />
                {t('nav_analytics')}
              </button>
              <button
                id="mob_nav_settings"
                onClick={() => { setCurrentTab('settings'); setSelectedLoanId(null); setIsMobileMenuOpen(false); }}
                className={`flex flex-col items-center justify-center p-4 rounded-xl text-sm font-semibold border transition-all ${
                  currentTab === 'settings'
                    ? 'bg-zinc-800 text-cyan-400 border-cyan-500/30'
                    : 'bg-zinc-950/50 text-zinc-400 border-zinc-800 hover:text-zinc-100'
                }`}
              >
                <SettingsIcon className="w-5 h-5 mb-2" />
                {t('nav_settings')}
              </button>
              <button
                id="mob_nav_logout"
                onClick={() => { handleLogout(); setIsMobileMenuOpen(false); }}
                className="flex flex-col items-center justify-center p-4 rounded-xl text-sm font-semibold border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 text-rose-400 transition-all"
              >
                <LogOut className="w-5 h-5 mb-2" />
                {t('logout_session')}
              </button>
            </div>

            <div className="border-t border-zinc-800 pt-3">
              <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest block mb-2">Loan Profiles</span>
              <div className="grid grid-cols-1 gap-1.5 max-h-40 overflow-y-auto">
                {loans.map(loan => (
                  <button
                    key={loan.id}
                    onClick={() => { setSelectedLoanId(loan.id); setCurrentTab('loan-details'); setIsMobileMenuOpen(false); }}
                    className={`flex items-center justify-between p-2.5 rounded-lg text-xs font-semibold border transition-all ${
                      selectedLoanId === loan.id
                        ? 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                        : 'bg-zinc-950/30 text-zinc-300 border-zinc-800/50'
                    }`}
                  >
                    <span>{loan.loanName}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ))}
              </div>
            </div>

            {/* Connection status inside drawer */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-zinc-950 border border-zinc-800/80">
              <span className="text-xs text-zinc-400 font-medium">Connectivity Status</span>
              <div className="flex items-center gap-1.5">
                {isOffline ? (
                  <span className="text-xs font-bold text-rose-400">Offline Mode</span>
                ) : (
                  <span className="text-xs font-bold text-emerald-400">Connected</span>
                )}
              </div>
            </div>
          </div>
        )}

        {/* OFFLINE BANNER AT TOP OF VIEW */}
        {isOffline && (
          <div id="offline_banner" className="bg-rose-950/80 text-rose-200 border-b border-rose-800/50 px-6 py-2.5 flex items-center gap-2 justify-center text-xs font-semibold animate-pulse">
            <WifiOff className="w-4 h-4 shrink-0" />
            <span>Currently browsing in offline mode. Changes will be saved locally and auto-synced when connection returns.</span>
          </div>
        )}

        {/* DESKTOP TOP BAR */}
        <header id="desktop_header" className="hidden md:flex items-center justify-between px-10 py-4 bg-zinc-900/40 border-b border-zinc-800 shrink-0">
          <div className="flex items-center gap-3">
            <span className="text-xs font-semibold text-zinc-400">Logged in as: <span className="text-zinc-200 font-bold">{user?.name}</span></span>
          </div>
          <div className="flex items-center gap-4">
            <button
              id="desktop_notif_trigger"
              onClick={() => setIsNotificationCenterOpen(true)}
              className="relative p-2 rounded-xl bg-zinc-800/40 border border-zinc-800/80 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800 transition-all cursor-pointer"
            >
              <Bell className="w-4 h-4" />
              {notifications.filter(n => !n.isRead).length > 0 && (
                <span className="absolute -top-1 -right-1 bg-cyan-500 text-zinc-950 text-[10px] font-black w-5 h-5 rounded-full flex items-center justify-center border-2 border-zinc-900">
                  {notifications.filter(n => !n.isRead).length}
                </span>
              )}
            </button>
            
            <div className="h-4 w-px bg-zinc-800" />

            <button
              id="desktop_logout_btn"
              onClick={handleLogout}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold text-rose-400 hover:text-rose-300 hover:bg-rose-500/5 transition-all cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </header>

        {/* MAIN BODY SCROLLABLE CANVAS */}
        <main className="flex-1 overflow-y-auto p-6 md:p-10 space-y-8">
          
          {/* ========================================================== */}
          {/* A. DASHBOARD VIEW */}
          {/* ========================================================== */}
          {currentTab === 'dashboard' && !selectedLoanId && (
            <div id="dashboard_tab_content" className="space-y-8 max-w-7xl mx-auto">
              
              {/* HEADER WELCOME BOARD */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-zinc-100 tracking-tight">{t('header_title')}</h2>
                  <p className="text-sm text-zinc-400 mt-1 font-medium">{t('header_subtitle')}</p>
                </div>
                <button
                  id="add_loan_btn"
                  onClick={openAddLoan}
                  className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 shadow-md shadow-cyan-500/10 transition-all font-medium self-start sm:self-auto cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  {t('btn_add_loan')}
                </button>
              </div>

              {/* BENTO STATS GRID */}
              <div id="bento_metrics_grid" className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                
                {/* CARD 1: TOTAL OUTSTANDING */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-sm hover:border-zinc-700 transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs md:text-sm font-semibold tracking-tight">{t('stat_remaining_balance')}</span>
                    <Wallet className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-100">{currencyFormatter(computedStats.remainingBalance)}</h3>
                    <div className="flex items-center gap-1.5 mt-1">
                      <span className="text-[10px] md:text-xs text-zinc-500 font-medium">{t('form_principal_amount')}: {currencyFormatter(computedStats.totalLoanAmount)}</span>
                    </div>
                  </div>
                </div>

                {/* CARD 2: TOTAL REPAID */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-sm hover:border-zinc-700 transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs md:text-sm font-semibold tracking-tight">{t('stat_total_paid')}</span>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-100">{currencyFormatter(computedStats.totalPaid)}</h3>
                    <div className="flex items-center gap-1.5 mt-1.5 w-full bg-zinc-950 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${computedStats.completionPercentage}%` }}></div>
                    </div>
                    <span className="text-[10px] text-zinc-500 font-bold block mt-1">{computedStats.completionPercentage}% {t('card_progress')}</span>
                  </div>
                </div>

                {/* CARD 3: SCHEDULED MONTHLY EMI */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-sm hover:border-zinc-700 transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs md:text-sm font-semibold tracking-tight">{t('stat_current_emi')}</span>
                    <Clock className="w-4 h-4 text-indigo-400" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-100">{currencyFormatter(computedStats.currentEmi)}</h3>
                    <span className="text-[10px] md:text-xs text-zinc-500 font-medium block mt-1">{t('stat_next_emi_date')}: {computedStats.nextEmiDate}</span>
                  </div>
                </div>

                {/* CARD 4: PAYMENT PROGRESS COUNTERS */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 shadow-sm hover:border-zinc-700 transition-all flex flex-col justify-between">
                  <div className="flex items-center justify-between text-zinc-400">
                    <span className="text-xs md:text-sm font-semibold tracking-tight">{t('stat_payments_made')}</span>
                    <Activity className="w-4 h-4 text-amber-400" />
                  </div>
                  <div className="mt-4">
                    <h3 className="text-xl md:text-2xl font-bold tracking-tight text-zinc-100">{computedStats.paymentsMade} {t('status_connected')}</h3>
                    <span className="text-[10px] md:text-xs text-zinc-500 font-medium block mt-1">{computedStats.paymentsRemaining} {t('stat_payments_remaining')}</span>
                  </div>
                </div>

              </div>

              {/* SEARCH, SORT AND FILTER CONTROL PANEL */}
              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 space-y-4">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                  
                  {/* Search text input */}
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3.5 top-3.5 w-4 h-4 text-zinc-500" />
                    <input
                      id="search_loans"
                      type="text"
                      placeholder={t('search_placeholder')}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-cyan-500 transition-colors"
                    />
                  </div>

                  {/* Filter and Sort togglers */}
                  <div className="flex flex-wrap items-center gap-4">
                    {/* Status filter pills */}
                    <div className="flex items-center p-1 bg-zinc-950 border border-zinc-800 rounded-xl shrink-0">
                      <button
                        id="filter_all"
                        onClick={() => setFilterStatus('all')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          filterStatus === 'all' ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        {t('filter_all')}
                      </button>
                      <button
                        id="filter_active"
                        onClick={() => setFilterStatus('active')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          filterStatus === 'active' ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        {t('filter_active')} ({computedStats.totalActiveLoans})
                      </button>
                      <button
                        id="filter_completed"
                        onClick={() => setFilterStatus('completed')}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                          filterStatus === 'completed' ? 'bg-zinc-800 text-cyan-400 font-bold' : 'text-zinc-500 hover:text-zinc-200'
                        }`}
                      >
                        {t('filter_completed')} ({computedStats.totalCompletedLoans})
                      </button>
                    </div>

                    {/* Sorting dropdown */}
                    <div className="flex items-center gap-2 bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-1.5">
                      <SlidersHorizontal className="w-3.5 h-3.5 text-zinc-500" />
                      <select
                        id="sort_selector"
                        value={sortBy}
                        onChange={(e: any) => setSortBy(e.target.value)}
                        className="bg-transparent text-xs font-semibold text-zinc-300 focus:outline-none pr-1 border-none cursor-pointer"
                      >
                        <option value="newest" className="bg-zinc-950 text-zinc-200">{t('sort_newest')}</option>
                        <option value="oldest" className="bg-zinc-950 text-zinc-200">{t('sort_oldest')}</option>
                        <option value="amount" className="bg-zinc-950 text-zinc-200">{t('sort_amount')}</option>
                        <option value="name" className="bg-zinc-950 text-zinc-200">{t('sort_name')}</option>
                      </select>
                    </div>

                  </div>
                </div>
              </div>

              {/* LOANS LIST CARDS GRID */}
              <div id="loans_card_grid" className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                
                {filteredLoans.map(loan => {
                  const percent = Number(loan.completionPercentage || 0);
                  return (
                    <div
                      key={loan.id}
                      onClick={() => { setSelectedLoanId(loan.id); setCurrentTab('loan-details'); }}
                      className="group bg-zinc-900 border border-zinc-800 hover:border-cyan-500/30 rounded-2xl p-6 shadow-sm hover:shadow-cyan-950/10 transition-all duration-200 flex flex-col justify-between cursor-pointer"
                    >
                      <div className="space-y-4">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase">{loan.lenderName}</span>
                            <h4 className="text-lg font-bold text-zinc-100 group-hover:text-cyan-400 transition-colors mt-0.5">{loan.loanName}</h4>
                          </div>
                          <span className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${
                            loan.status === 'Completed'
                              ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                              : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                          }`}>
                            {loan.status}
                          </span>
                        </div>

                        {/* Principal & interest stats */}
                        <div className="grid grid-cols-2 gap-4 bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/60">
                          <div>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase block">{t('form_principal_amount')}</span>
                            <span className="text-sm font-bold text-zinc-200">{currencyFormatter(loan.principal)}</span>
                          </div>
                          <div>
                            <span className="text-[10px] text-zinc-500 font-bold uppercase block">{t('card_emi')}</span>
                            <span className="text-sm font-bold text-zinc-200">{currencyFormatter(loan.emi)}</span>
                          </div>
                        </div>

                        {/* Completion bar */}
                        <div>
                          <div className="flex justify-between items-center text-xs text-zinc-400 font-semibold mb-1.5">
                            <span>{t('card_progress')}</span>
                            <span>{percent}%</span>
                          </div>
                          <div className="w-full bg-zinc-950 h-2 rounded-full overflow-hidden border border-zinc-800/30">
                            <div
                              className={`h-full rounded-full transition-all ${
                                loan.status === 'Completed' ? 'bg-emerald-500' : 'bg-cyan-500'
                              }`}
                              style={{ width: `${percent}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      {/* Card actions */}
                      <div className="border-t border-zinc-800/50 pt-4 mt-6 flex items-center justify-between text-xs text-zinc-500 font-medium group-hover:text-zinc-300 transition-all">
                        <div className="flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{t('card_started')}: {loan.startDate}</span>
                        </div>
                        <div className="flex items-center gap-1 text-cyan-400 font-semibold">
                          <span>{t('card_view_details')}</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    </div>
                  );
                })}

                {/* EMPTY STATE */}
                {filteredLoans.length === 0 && !isLoading && (
                  <div className="col-span-full bg-zinc-900 border border-zinc-800 rounded-2xl py-16 px-6 text-center space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-zinc-950 border border-zinc-800 flex items-center justify-center mx-auto text-zinc-500">
                      <Wallet className="w-6 h-6" />
                    </div>
                    <div>
                      <h4 className="text-base font-bold text-zinc-200">No Loan Portfolios Found</h4>
                      <p className="text-xs text-zinc-500 mt-1 max-w-sm mx-auto">Get started by creating your first loan profile. Track EMIs, interest rates, payments, and amortization schedules instantly.</p>
                    </div>
                    <button
                      onClick={openAddLoan}
                      className="px-4 py-2 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 transition-colors cursor-pointer"
                    >
                      Create Loan Profile
                    </button>
                  </div>
                )}

                {/* SKELETON LOADERS */}
                {isLoading && loans.length === 0 && (
                  <>
                    {[1, 2, 3].map(i => (
                      <div key={i} className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4 animate-pulse">
                        <div className="flex items-center justify-between">
                          <div className="space-y-2 w-1/2">
                            <div className="h-2 w-16 bg-zinc-800 rounded"></div>
                            <div className="h-4 w-32 bg-zinc-800 rounded"></div>
                          </div>
                          <div className="h-6 w-12 bg-zinc-800 rounded-full"></div>
                        </div>
                        <div className="h-14 bg-zinc-950/50 rounded-xl"></div>
                        <div className="space-y-2">
                          <div className="h-2 w-20 bg-zinc-800 rounded"></div>
                          <div className="h-2 bg-zinc-800 rounded"></div>
                        </div>
                      </div>
                    ))}
                  </>
                )}

              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* B. ANALYTICS CHARTS TAB */}
          {/* ========================================================== */}
          {currentTab === 'analytics' && !selectedLoanId && (
            <div id="analytics_tab_content" className="space-y-8 max-w-7xl mx-auto">
              
              {/* HEADER WELCOME BOARD */}
              <div className="flex items-center justify-between border-b border-zinc-800/50 pb-6">
                <div>
                  <h2 className="text-2xl md:text-3xl font-bold text-zinc-100 tracking-tight">{t('analytics_title')}</h2>
                  <p className="text-sm text-zinc-400 mt-1 font-medium">{t('analytics_subtitle')}</p>
                </div>
              </div>

              {/* OVERALL CIRCULAR GAUGE ROW */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* GAUGE BOX */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col items-center justify-center text-center shadow-sm lg:col-span-1">
                  <h4 className="text-sm font-bold text-zinc-400 uppercase tracking-wider mb-6">{t('stat_completion_percentage')}</h4>
                  
                  {/* Gauge SVG */}
                  <div className="relative w-44 h-44 flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                      {/* background rail */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        className="stroke-zinc-800 fill-none"
                        strokeWidth="8"
                      />
                      {/* color indicator */}
                      <circle
                        cx="50"
                        cy="50"
                        r="40"
                        className="stroke-cyan-500 fill-none transition-all duration-1000"
                        strokeWidth="8"
                        strokeDasharray={2 * Math.PI * 40}
                        strokeDashoffset={2 * Math.PI * 40 * (1 - computedStats.completionPercentage / 100)}
                        strokeLinecap="round"
                      />
                    </svg>
                    <div className="absolute text-center">
                      <span className="text-3xl font-extrabold tracking-tight text-zinc-100">{computedStats.completionPercentage}%</span>
                      <span className="text-[10px] text-zinc-500 font-bold block uppercase mt-0.5">{t('card_paid')}</span>
                    </div>
                  </div>

                  <div className="mt-6 grid grid-cols-2 gap-4 w-full border-t border-zinc-800/60 pt-4">
                    <div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase block">{t('stat_total_paid')}</span>
                      <span className="text-sm font-bold text-zinc-200">{currencyFormatter(computedStats.totalPaid)}</span>
                    </div>
                    <div>
                      <span className="text-[10px] text-zinc-500 font-bold uppercase block">{t('stat_remaining_balance')}</span>
                      <span className="text-sm font-bold text-rose-400">{currencyFormatter(computedStats.remainingBalance)}</span>
                    </div>
                  </div>
                </div>

                {/* PIE CHART OF ASSET EQUITY vs LIABILITY */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm lg:col-span-2 flex flex-col justify-between">
                  <h4 className="text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-wider mb-4">{t('analytics_principal_interest')}</h4>
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieChartData}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={90}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {pieChartData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(v: number) => currencyFormatter(v)} contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#f4f4f5' }} />
                        <Legend verticalAlign="bottom" height={36} formatter={(value) => <span className="text-xs font-semibold text-zinc-400">{value}</span>} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>

              {/* BAR & LINE CHARTS */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                
                {/* CHART A: EXPENSE SCHEDULE SPLIT */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                  <div className="mb-4">
                    <h4 className="text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-wider">{t('analytics_monthly_repayment')}</h4>
                    <span className="text-xs text-zinc-500">{t('card_repayment_desc')}</span>
                  </div>
                  <div className="h-72 w-full">
                    {costDistributionData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={costDistributionData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => `$${v}`} />
                          <Tooltip formatter={(v: number) => currencyFormatter(v)} contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#f4f4f5' }} />
                          <Legend formatter={(value) => <span className="text-xs font-semibold text-zinc-400">{value}</span>} />
                          <Bar dataKey="Principal Portion" stackId="a" fill="#06b6d4" />
                          <Bar dataKey="Interest Portion" stackId="a" fill="#3b82f6" />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-zinc-600 italic">No schedules available</div>
                    )}
                  </div>
                </div>

                {/* CHART B: OUTSTANDING LIABILITIES OVER TIME */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between">
                  <div className="mb-4">
                    <h4 className="text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-wider">Liability Run-off Curve</h4>
                    <span className="text-xs text-zinc-500">Combined remaining balance trajectory over the next 12 installments.</span>
                  </div>
                  <div className="h-72 w-full">
                    {balanceTrendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={balanceTrendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => `$${v}`} />
                          <Tooltip formatter={(v: number) => currencyFormatter(v)} contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#f4f4f5' }} />
                          <Legend formatter={(value) => <span className="text-xs font-semibold text-zinc-400">{value}</span>} />
                          <Line type="monotone" dataKey="Remaining Liabilities" stroke="#f43f5e" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-zinc-600 italic">No liabilities to track</div>
                    )}
                  </div>
                </div>

                {/* CHART C: PAYMENT TRENDS HISTORY */}
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 shadow-sm flex flex-col justify-between lg:col-span-2">
                  <div className="mb-4">
                    <h4 className="text-xs md:text-sm font-bold text-zinc-400 uppercase tracking-wider">Historical Capital Deployment Trend</h4>
                    <span className="text-xs text-zinc-500">Chronological summation of actual payment installments processed over time.</span>
                  </div>
                  <div className="h-72 w-full">
                    {paymentTrendData.length > 0 ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={paymentTrendData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                          <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                          <YAxis stroke="#71717a" fontSize={11} tickFormatter={(v) => `$${v}`} />
                          <Tooltip formatter={(v: number) => currencyFormatter(v)} contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '12px', color: '#f4f4f5' }} />
                          <Legend formatter={(value) => <span className="text-xs font-semibold text-zinc-400">{value}</span>} />
                          <Line type="monotone" dataKey="Amount Paid" stroke="#10b981" strokeWidth={3} activeDot={{ r: 6 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-full flex items-center justify-center text-xs text-zinc-600 italic py-16">No payments processed yet to form a trend chart.</div>
                    )}
                  </div>
                </div>

              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* C. LOAN DETAIL VIEW */}
          {/* ========================================================== */}
          {currentTab === 'loan-details' && selectedLoan && (
            <div id="loan_details_tab_content" className="space-y-8 max-w-7xl mx-auto animate-in fade-in duration-200">
              
              {/* HEADER ROW WITH NAVIGATION BACK */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/50 pb-6">
                <div className="flex items-center gap-4">
                  <button
                    id="back_to_dash"
                    onClick={() => { setSelectedLoanId(null); setCurrentTab('dashboard'); }}
                    className="flex items-center justify-center w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase">{selectedLoan.lenderName}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        selectedLoan.status === 'Completed'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20'
                      }`}>
                        {selectedLoan.status}
                      </span>
                    </div>
                    <h2 className="text-2xl md:text-3xl font-extrabold text-zinc-100 tracking-tight mt-1">{selectedLoan.loanName}</h2>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    id="edit_loan_btn"
                    onClick={() => openEditLoan(selectedLoan)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-all cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    Edit Account
                  </button>
                  <button
                    id="delete_loan_btn"
                    onClick={() => handleDeleteLoan(selectedLoan.id)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/50 border border-rose-900/30 text-rose-400 transition-all cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete Profile
                  </button>
                </div>
              </div>

              {/* LOAN BENTO HIGHLIGHT CARDS */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
                
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">Outstanding Debt</span>
                  <h3 className="text-xl font-bold text-zinc-100 mt-2">{currencyFormatter(selectedLoan.remainingPrincipal + selectedLoan.remainingInterest)}</h3>
                  <div className="flex items-center justify-between text-[10px] text-zinc-500 mt-2">
                    <span>Principal: {currencyFormatter(selectedLoan.remainingPrincipal)}</span>
                    <span>Interest: {currencyFormatter(selectedLoan.remainingInterest)}</span>
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">Monthly EMI</span>
                  <h3 className="text-xl font-bold text-zinc-100 mt-2">{currencyFormatter(selectedLoan.emi)}</h3>
                  <span className="text-[10px] text-zinc-500 font-medium block mt-2">Rate: {selectedLoan.rate}% / {selectedLoan.type}</span>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm">
                  <span className="text-[10px] text-zinc-500 font-bold uppercase block">Total Repaid Capital</span>
                  <h3 className="text-xl font-bold text-zinc-100 mt-2">{currencyFormatter(selectedLoan.totalPaid)}</h3>
                  <div className="w-full bg-zinc-950 h-1 rounded-full mt-3 overflow-hidden">
                    <div className="bg-cyan-500 h-full rounded-full" style={{ width: `${selectedLoan.completionPercentage}%` }}></div>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-bold block mt-1.5">{selectedLoan.completionPercentage}% Done</span>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 shadow-sm flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase block">Next Payment Due</span>
                    <h3 className="text-base font-bold text-zinc-200 mt-2">{selectedLoan.nextEmiDate}</h3>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-medium block mt-1">{selectedLoan.paymentsRemainingCount} installments remaining</span>
                </div>

              </div>

              {/* PAYMENT REGISTRATION PANEL & HISTORY CONTAINER */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* COLUMN LEFT: PAYMENT LOGGER + HISTORY (8 COLS) */}
                <div className="lg:col-span-7 space-y-6">
                  
                  {/* LOG PAYMENT BUTTON CRADLE */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold text-zinc-200">Register Installment Payment</h4>
                      <p className="text-xs text-zinc-500">Instantly record full EMI, partial, or extra payments to the balance sheet.</p>
                    </div>
                    {selectedLoan.status !== 'Completed' && (
                      <button
                        id="log_installment_btn"
                        onClick={() => openAddPayment(selectedLoan.emi)}
                        className="flex items-center gap-2 px-5 py-3 rounded-xl text-xs font-semibold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 transition-colors font-semibold shadow-md shadow-cyan-500/5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        Log Payment Record
                      </button>
                    )}
                  </div>

                  {/* PAYMENT HISTORY CARDS LIST */}
                  <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm">
                    <div className="p-5 border-b border-zinc-800">
                      <h4 className="text-xs md:text-sm font-bold text-zinc-300 uppercase tracking-wider">Transaction Settlement Records</h4>
                    </div>

                    <div className="divide-y divide-zinc-800/80 max-h-[420px] overflow-y-auto">
                      {selectedLoan.payments && selectedLoan.payments.map(payment => (
                        <div key={payment.id} className="p-5 flex items-center justify-between hover:bg-zinc-800/20 transition-all">
                          <div className="flex items-start gap-4">
                            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-zinc-950 border border-zinc-800 shrink-0 mt-0.5">
                              <DollarSign className="w-4 h-4 text-zinc-400" />
                            </div>
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-extrabold text-zinc-200">{currencyFormatter(payment.amountPaid)}</span>
                                <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full border ${
                                  payment.status === 'Extra'
                                    ? 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                                    : payment.status === 'Partial'
                                    ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                                    : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                }`}>
                                  {payment.status}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs text-zinc-500 mt-1">
                                <span>Date: {payment.paymentDate}</span>
                                <span>•</span>
                                <span>Principal Portion: {currencyFormatter(payment.principalPortion)}</span>
                              </div>
                              {payment.notes && (
                                <p className="text-[11px] text-zinc-500 italic mt-1.5 bg-zinc-950/60 py-1 px-2.5 rounded-md border border-zinc-800/50 max-w-sm">{payment.notes}</p>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              onClick={() => openEditPayment(payment)}
                              className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-200 transition-colors"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeletePayment(payment.id)}
                              className="p-1.5 rounded-lg bg-zinc-950 border border-zinc-800 hover:bg-rose-950/60 text-zinc-400 hover:text-rose-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}

                      {(!selectedLoan.payments || selectedLoan.payments.length === 0) && (
                        <div className="p-12 text-center text-zinc-500 text-xs italic">
                          No transactions recorded. Fill your amortization schedule by submitting payment entries.
                        </div>
                      )}
                    </div>
                  </div>

                </div>

                {/* COLUMN RIGHT: CHRONOLOGICAL AMORTIZATION SCHEDULE (5 COLS) */}
                <div className="lg:col-span-5 bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[560px]">
                  
                  <div className="p-5 border-b border-zinc-800 shrink-0">
                    <h4 className="text-xs md:text-sm font-bold text-zinc-300 uppercase tracking-wider">Scheduled Amortization Map</h4>
                    <p className="text-[11px] text-zinc-500 mt-1">Full chronological mapping of payments over loan lifecycle.</p>
                  </div>

                  <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80">
                    {selectedLoan.amortizationSchedule && selectedLoan.amortizationSchedule.map(slot => {
                      const isPaid = selectedLoan.payments && selectedLoan.payments.length >= slot.month;
                      return (
                        <div
                          key={slot.month}
                          className={`p-4 flex items-center justify-between text-xs transition-all ${
                            isPaid ? 'bg-emerald-500/5 text-zinc-300' : 'text-zinc-400 hover:bg-zinc-800/20'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <span className={`w-6 h-6 flex items-center justify-center rounded-lg border text-[10px] font-bold ${
                              isPaid
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-zinc-950 text-zinc-500 border-zinc-800'
                            }`}>
                              {slot.month}
                            </span>
                            <div>
                              <span className="font-bold text-zinc-300">Due: {slot.dueDate}</span>
                              <div className="flex items-center gap-2 text-[10px] text-zinc-500 mt-0.5">
                                <span>P: {currencyFormatter(slot.principalPortion)}</span>
                                <span>•</span>
                                <span>I: {currencyFormatter(slot.interestPortion)}</span>
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <span className="font-extrabold text-zinc-200 block">{currencyFormatter(slot.emi)}</span>
                            {isPaid ? (
                              <span className="text-[9px] font-bold text-emerald-400 block mt-0.5">✔ Installment Paid</span>
                            ) : (
                              <span className="text-[9px] text-zinc-500 block mt-0.5">Bal: {currencyFormatter(slot.remainingBalance)}</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                </div>

              </div>

            </div>
          )}

          {currentTab === 'settings' && (
            <SettingsTab
              user={user}
              token={token || ''}
              onProfileUpdate={(updatedUser) => {
                setUser(updatedUser);
                localStorage.setItem('emi_tracker_user', JSON.stringify(updatedUser));
              }}
              onPreferencesUpdate={(updatedPrefs) => {
                const updatedUser = { ...user, preferences: updatedPrefs };
                setUser(updatedUser);
                localStorage.setItem('emi_tracker_user', JSON.stringify(updatedUser));
              }}
              onLogout={handleLogout}
              triggerNotificationPermission={async () => {
                if ('Notification' in window) {
                  const permission = await Notification.requestPermission();
                  if (permission === 'granted' && token) {
                    await subscribeToPushNotifications(user.id, token);
                  }
                }
              }}
              t={t}
            />
          )}

        </main>
      </div>

      {/* ========================================================== */}
      {/* 1. EDIT / ADD LOAN MODAL DIALOG */}
      {/* ========================================================== */}
      {isLoanModalOpen && (
        <div id="loan_modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-cyan-400" />
                {editingLoan ? t('modal_edit_title') : t('modal_create_title')}
              </h3>
              <button
                onClick={() => setIsLoanModalOpen(false)}
                className="p-1 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveLoan} className="p-6 space-y-4">
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_loan_name')}</label>
                  <input
                    id="input_loan_name"
                    type="text"
                    required
                    placeholder="e.g. Home Improvement"
                    value={loanFormData.loanName}
                    onChange={(e) => setLoanFormData({ ...loanFormData, loanName: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_lender_name')}</label>
                  <input
                    id="input_lender_name"
                    type="text"
                    required
                    placeholder="e.g. Chase Bank"
                    value={loanFormData.lenderName}
                    onChange={(e) => setLoanFormData({ ...loanFormData, lenderName: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_principal_amount')} ($)</label>
                  <input
                    id="input_principal"
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 10000"
                    value={loanFormData.principal}
                    onChange={(e) => setLoanFormData({ ...loanFormData, principal: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_interest_rate')}</label>
                  <input
                    id="input_rate"
                    type="number"
                    step="0.01"
                    required
                    min="0"
                    placeholder="e.g. 5.5"
                    value={loanFormData.rate}
                    onChange={(e) => setLoanFormData({ ...loanFormData, rate: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-1.5 col-span-2">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_duration')}</label>
                  <input
                    id="input_duration"
                    type="number"
                    required
                    min="1"
                    placeholder="e.g. 36"
                    value={loanFormData.duration}
                    onChange={(e) => setLoanFormData({ ...loanFormData, duration: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_duration_unit')}</label>
                  <select
                    id="input_duration_unit"
                    value={loanFormData.durationUnit}
                    onChange={(e: any) => setLoanFormData({ ...loanFormData, durationUnit: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="Months" className="bg-zinc-950">{t('form_unit_months')}</option>
                    <option value="Years" className="bg-zinc-950">{t('form_unit_years')}</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_interest_type')}</label>
                  <select
                    id="input_interest_type"
                    value={loanFormData.type}
                    onChange={(e: any) => setLoanFormData({ ...loanFormData, type: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    <option value="Reducing" className="bg-zinc-950">{t('form_reducing')}</option>
                    <option value="Flat" className="bg-zinc-950">{t('form_flat')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('form_start_date')}</label>
                  <input
                    id="input_start_date"
                    type="date"
                    required
                    value={loanFormData.startDate}
                    onChange={(e) => setLoanFormData({ ...loanFormData, startDate: e.target.value })}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  />
                </div>
              </div>

              <div className="border-t border-zinc-800 pt-5 mt-6 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsLoanModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-950 border border-zinc-800 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {t('form_cancel')}
                </button>
                <button
                  id="submit_loan_btn"
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 transition-colors shadow-md shadow-cyan-500/10 cursor-pointer"
                >
                  {editingLoan ? t('form_save') : t('btn_add_loan')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      {/* ========================================================== */}
      {/* 2. ADD / EDIT PAYMENT RECORD MODAL */}
      {/* ========================================================== */}
      {isPaymentModalOpen && (
        <div id="payment_modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl animate-in zoom-in-95 duration-200">
            
            <div className="p-6 border-b border-zinc-800 flex items-center justify-between">
              <h3 className="text-base font-bold text-zinc-100 flex items-center gap-2">
                <FileText className="w-4 h-4 text-cyan-400" />
                {editingPayment ? t('payment_modal_edit_title') : t('payment_modal_add_title')}
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 rounded-lg bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-6 space-y-4">
              
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 block uppercase">{t('payment_date')}</label>
                <input
                  id="input_payment_date"
                  type="date"
                  required
                  value={paymentFormData.paymentDate}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, paymentDate: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-zinc-400 block uppercase">{t('payment_amount_paid')} ($)</label>
                  {selectedLoan && (
                    <button
                      type="button"
                      onClick={() => setPaymentFormData({ ...paymentFormData, amountPaid: String(selectedLoan.emi) })}
                      className="text-[10px] text-cyan-400 hover:underline font-bold"
                    >
                      {t('payment_fill_emi')} ({currencyFormatter(selectedLoan.emi)})
                    </button>
                  )}
                </div>
                <input
                  id="input_payment_amount"
                  type="number"
                  step="0.01"
                  required
                  min="0.01"
                  placeholder="e.g. 500"
                  value={paymentFormData.amountPaid}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, amountPaid: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-400 block uppercase">{t('payment_memo')}</label>
                <textarea
                  id="input_payment_notes"
                  placeholder="e.g. Standard monthly check payment, bank draft #1209"
                  rows={3}
                  value={paymentFormData.notes}
                  onChange={(e) => setPaymentFormData({ ...paymentFormData, notes: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-2 px-3 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500 resize-none"
                />
              </div>

              <div className="border-t border-zinc-800 pt-5 mt-6 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-bold bg-zinc-950 border border-zinc-800 text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200 transition-colors cursor-pointer"
                >
                  {t('form_cancel')}
                </button>
                <button
                  id="submit_payment_btn"
                  type="submit"
                  className="px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-400 text-zinc-950 transition-colors shadow-md shadow-cyan-500/10 cursor-pointer"
                >
                  {editingPayment ? t('payment_submit_edit') : t('payment_submit_add')}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}

      <NotificationCenter
        isOpen={isNotificationCenterOpen}
        onClose={() => setIsNotificationCenterOpen(false)}
        notifications={notifications}
        onMarkRead={async (id) => {
          try {
            const res = await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
            if (res.ok) fetchNotifications();
          } catch (err) {
            console.warn(err);
          }
        }}
        onMarkAllRead={async () => {
          try {
            const res = await apiFetch('/api/notifications/read-all', { method: 'PUT' });
            if (res.ok) fetchNotifications();
          } catch (err) {
            console.warn(err);
          }
        }}
        onDeleteNotif={async (id) => {
          try {
            const res = await apiFetch(`/api/notifications/${id}`, { method: 'DELETE' });
            if (res.ok) fetchNotifications();
          } catch (err) {
            console.warn(err);
          }
        }}
        onClearAll={async () => {
          try {
            const res = await apiFetch('/api/notifications', { method: 'DELETE' });
            if (res.ok) fetchNotifications();
          } catch (err) {
            console.warn(err);
          }
        }}
      />
      <AchievementCelebration notifications={notifications} />

    </div>
  );
}
