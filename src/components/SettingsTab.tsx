import React, { useState, FormEvent, useRef } from 'react';
import { 
  User, Mail, Camera, Save, Lock, LogOut, Trash2, Bell, Settings, Languages, DollarSign, Eye, EyeOff, ShieldAlert, BadgeInfo 
} from 'lucide-react';
import { motion } from 'motion/react';

interface SettingsTabProps {
  user: any;
  token: string;
  onProfileUpdate: (updatedUser: any) => void;
  onPreferencesUpdate: (updatedPreferences: any) => void;
  onLogout: () => void;
  triggerNotificationPermission: () => Promise<void>;
  t: (key: string) => string;
  deferredPrompt?: any;
  onInstallApp?: () => void;
}

export default function SettingsTab({
  user,
  token,
  onProfileUpdate,
  onPreferencesUpdate,
  onLogout,
  triggerNotificationPermission,
  t,
  deferredPrompt,
  onInstallApp
}: SettingsTabProps) {
  // Profile Form States
  const [fullName, setFullName] = useState(user.fullName || '');
  const [email, setEmail] = useState(user.email || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl || '');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Password Form States
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  // Preferences Form States
  const [language, setLanguage] = useState(user.preferences?.language || 'en');
  const [currency, setCurrency] = useState(user.preferences?.currency || 'USD');
  const [theme, setTheme] = useState(user.preferences?.theme || 'system');

  // Notification Preferences States
  const [pushEnabled, setPushEnabled] = useState(user.preferences?.notifications?.pushEnabled ?? true);
  const [achievementEnabled, setAchievementEnabled] = useState(user.preferences?.notifications?.achievementEnabled ?? true);
  const [reminderDays, setReminderDays] = useState<number[]>(user.preferences?.notifications?.reminderDays || [7, 3, 1, 0]);
  const [quietHoursStart, setQuietHoursStart] = useState(user.preferences?.notifications?.quietHoursStart || '22:00');
  const [quietHoursEnd, setQuietHoursEnd] = useState(user.preferences?.notifications?.quietHoursEnd || '08:00');
  const [sound, setSound] = useState(user.preferences?.notifications?.sound || 'default');
  const [vibration, setVibration] = useState(user.preferences?.notifications?.vibration ?? true);
  const [maxDaily, setMaxDaily] = useState(user.preferences?.notifications?.maxDaily || 5);

  // Status indicators
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState(false);
  
  const [passLoading, setPassLoading] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);
  const [passSuccess, setPassSuccess] = useState(false);

  const [prefLoading, setPrefLoading] = useState(false);
  const [prefSuccess, setPrefSuccess] = useState(false);

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Built-in cool avatar presets
  const avatarPresets = [
    'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=150&q=80', // Female chic
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&q=80', // Male professional
    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=150&q=80', // Female tech
    'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=150&q=80', // Male tech
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?auto=format&fit=crop&w=150&q=80', // Female casual
  ];

  // Profile update handler
  const handleProfileSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setProfileLoading(true);
    setProfileSuccess(false);

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ fullName, email, avatarUrl })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update profile');
      onProfileUpdate(data);
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Image Upload handler (Convert local file to base64)
  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onloadend = () => {
      setAvatarUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  // Change Password Handler
  const handlePasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPassLoading(true);
    setPassError(null);
    setPassSuccess(false);

    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ currentPassword, newPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to change password');
      setPassSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPassSuccess(false), 3000);
    } catch (err: any) {
      setPassError(err.message);
    } finally {
      setPassLoading(false);
    }
  };

  // Update Preferences Handler
  const handlePreferencesSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setPrefLoading(true);
    setPrefSuccess(false);

    const updatedPrefs = {
      language,
      currency,
      theme,
      notifications: {
        pushEnabled,
        achievementEnabled,
        reminderDays,
        quietHoursStart,
        quietHoursEnd,
        sound,
        vibration,
        maxDaily
      }
    };

    try {
      const res = await fetch('/api/auth/preferences', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedPrefs)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save preferences');
      onPreferencesUpdate(data);
      setPrefSuccess(true);
      setTimeout(() => setPrefSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setPrefLoading(false);
    }
  };

  // Toggle EMI reminder day checkbox
  const handleReminderDayToggle = (day: number) => {
    if (reminderDays.includes(day)) {
      setReminderDays(reminderDays.filter(d => d !== day));
    } else {
      setReminderDays([...reminderDays, day].sort((a, b) => b - a));
    }
  };

  // Delete account action
  const handleDeleteAccount = async () => {
    if (deleteConfirmText.toLowerCase() !== 'delete') return;

    try {
      const res = await fetch('/api/auth/profile', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        onLogout();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Test Push notification
  const sendTestPush = async () => {
    await triggerNotificationPermission();
  };

  return (
    <div id="settings_container" className="max-w-4xl mx-auto space-y-8 p-6 pb-24 overflow-y-auto h-full no-scrollbar">
      
      {/* Tab Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-zinc-800/80 pb-6">
        <div>
          <h2 className="text-2xl font-black text-zinc-100 tracking-tight flex items-center gap-2">
            <Settings className="w-6 h-6 text-cyan-400" />
            {t('nav_settings')}
          </h2>
          <p className="text-xs text-zinc-500 font-medium">{t('settings_localization')}</p>
        </div>
        <button
          onClick={onLogout}
          className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 transition-all flex items-center justify-center gap-2 cursor-pointer self-start sm:self-center"
        >
          <LogOut className="w-4 h-4" />
          {t('logout_session')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* LEFT COLUMN: PROFILE CARD */}
        <div className="space-y-6 lg:col-span-1">
          <form onSubmit={handleProfileSubmit} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <h3 className="font-bold text-sm text-zinc-200 border-b border-zinc-800 pb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-cyan-400" />
              {t('settings_profile_security')}
            </h3>

            {/* Profile image picker */}
            <div className="flex flex-col items-center space-y-3">
              <div className="relative group">
                <div className="w-24 h-24 rounded-full overflow-hidden border-2 border-cyan-500/30 bg-zinc-950 flex items-center justify-center">
                  {avatarUrl ? (
                    <img src={avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <User className="w-10 h-10 text-zinc-600" />
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute bottom-0 right-0 w-8 h-8 rounded-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 flex items-center justify-center border-2 border-zinc-900 shadow-lg cursor-pointer transition-colors"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
              </div>

              {/* Avatar Preset List */}
              <div className="space-y-1.5 w-full">
                <span className="text-[9px] text-zinc-500 font-bold uppercase text-center block">Pick preset profile</span>
                <div className="flex justify-center gap-1.5">
                  {avatarPresets.map((preset, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setAvatarUrl(preset)}
                      className={`w-7 h-7 rounded-full overflow-hidden border transition-all hover:scale-110 cursor-pointer ${
                        avatarUrl === preset ? 'border-cyan-400 scale-105 shadow-md shadow-cyan-950/20' : 'border-zinc-800 hover:border-zinc-600'
                      }`}
                    >
                      <img src={preset} alt={`preset-${i}`} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_full_name')}</label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 px-3.5 text-xs text-zinc-200 outline-none transition-all"
                  placeholder="Your full name"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_email')}</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-600" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 pl-9 pr-3 text-xs text-zinc-200 outline-none transition-all"
                    placeholder="name@example.com"
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={profileLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 py-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {profileLoading ? 'Saving...' : profileSuccess ? 'Saved successfully!' : t('settings_update_profile')}
            </button>
          </form>

          {/* PASSWORD CHANGE FORM */}
          <form onSubmit={handlePasswordSubmit} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-5">
            <h3 className="font-bold text-sm text-zinc-200 border-b border-zinc-800 pb-3 flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400" />
              {t('settings_change_password')}
            </h3>

            {passError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-[10px] font-semibold text-rose-400">
                {passError}
              </div>
            )}

            <div className="space-y-3.5">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_current_password')}</label>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 px-3.5 text-xs text-zinc-200 outline-none transition-all"
                  placeholder="••••••••••••"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex justify-between items-center">
                  <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_new_password')}</label>
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="text-[10px] font-bold text-zinc-500 hover:text-zinc-300 transition-colors"
                  >
                    {showPass ? 'Hide' : 'Show'}
                  </button>
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 px-3.5 text-xs text-zinc-200 outline-none transition-all"
                  placeholder="Min. 6 characters"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={passLoading}
              className="w-full bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 py-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              {passLoading ? 'Verifying...' : passSuccess ? 'Password Changed!' : t('settings_update_password')}
            </button>
          </form>
        </div>

        {/* RIGHT COLUMN: PREFERENCES & NOTIFICATION SETTINGS */}
        <div className="lg:col-span-2 space-y-6">
          <form onSubmit={handlePreferencesSubmit} className="bg-zinc-900 border border-zinc-800 rounded-3xl p-6 space-y-6">
            <h3 className="font-bold text-sm text-zinc-200 border-b border-zinc-800 pb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-cyan-400" />
              {t('settings_localization')}
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <Languages className="w-3 h-3 text-cyan-400" />
                  {t('settings_language')}
                </label>
                <select
                  value={language}
                  onChange={(e) => setLanguage(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 px-3 text-xs text-zinc-200 outline-none"
                >
                  <option value="en">English (US)</option>
                  <option value="te">తెలుగు (Telugu)</option>
                  <option value="in">Hindi (IN)</option>
                  <option value="es">Español (ES)</option>
                  <option value="fr">Français (FR)</option>
                  <option value="de">Deutsch (DE)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-cyan-400" />
                  {t('settings_currency')}
                </label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 px-3 text-xs text-zinc-200 outline-none"
                >
                  <option value="USD">USD ($)</option>
                  <option value="EUR">EUR (€)</option>
                  <option value="GBP">GBP (£)</option>
                  <option value="INR">INR (₹)</option>
                  <option value="CAD">CAD ($)</option>
                  <option value="AUD">AUD ($)</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_theme')}</label>
                <select
                  value={theme}
                  onChange={(e) => setTheme(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2 px-3 text-xs text-zinc-200 outline-none"
                >
                  <option value="light">Light Mode</option>
                  <option value="dark">Dark Slate Mode</option>
                  <option value="system">Follow System</option>
                </select>
              </div>
            </div>

            {/* PWA INSTALLATION SECTION */}
            <div className="space-y-4 border-t border-zinc-800 pt-6">
              <h4 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
                <Settings className="w-4 h-4 text-cyan-400" />
                Application Installation (PWA)
              </h4>
              <p className="text-[10px] text-zinc-500 font-medium">Enjoy a standalone native app experience, offline tracking, and reduced loading times</p>
              
              <div className="bg-zinc-950 border border-zinc-800/60 rounded-2xl p-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div>
                  <span className="text-xs font-bold text-zinc-300 block">Installation Status</span>
                  {window.matchMedia('(display-mode: standalone)').matches ? (
                    <span className="text-[10px] text-emerald-400 font-bold flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping"></span>
                      ✓ Installed & Running Standalone
                    </span>
                  ) : deferredPrompt ? (
                    <span className="text-[10px] text-cyan-400 font-bold flex items-center gap-1 mt-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse"></span>
                      Ready to Install
                    </span>
                  ) : (
                    <span className="text-[10px] text-zinc-500 flex items-center gap-1 mt-1">
                      Running in Web Browser
                    </span>
                  )}
                </div>
                
                {deferredPrompt && onInstallApp && (
                  <button
                    type="button"
                    onClick={onInstallApp}
                    className="w-full md:w-auto px-4 py-2 rounded-xl text-xs font-black bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-400 hover:to-blue-400 text-zinc-950 transition-all shadow-md shadow-cyan-500/10 cursor-pointer text-center"
                  >
                    Install App Now
                  </button>
                )}
              </div>
            </div>

            {/* NOTIFICATION PREFERENCES SECTION */}
            <div className="space-y-5 border-t border-zinc-800 pt-6">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-sm text-zinc-200 flex items-center gap-2">
                    <Bell className="w-4 h-4 text-cyan-400" />
                    {t('settings_pwa')}
                  </h4>
                  <p className="text-[10px] text-zinc-500 font-medium">Configure browser push alerts, vibration, and quiet timings</p>
                </div>
                <button
                  type="button"
                  onClick={sendTestPush}
                  className="px-3 py-1.5 rounded-lg text-[10px] font-black bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/20 text-cyan-400 cursor-pointer"
                >
                  {t('settings_test_push')}
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                {/* Notification Toggles */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-zinc-300 block">Enable Push Alerts</span>
                      <span className="text-[10px] text-zinc-500">Allow reminders on your device drawer</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={pushEnabled}
                        onChange={(e) => setPushEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-zinc-950 peer-checked:after:border-cyan-500"></div>
                    </label>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-zinc-300 block">{t('settings_achievement_trophies')}</span>
                      <span className="text-[10px] text-zinc-500">{t('settings_achievement_desc')}</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={achievementEnabled}
                        onChange={(e) => setAchievementEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-zinc-950 peer-checked:after:border-cyan-500"></div>
                    </label>
                  </div>

                  {/* Reminder days picker checkboxes */}
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-zinc-300 block">EMI Due Warnings (Days Before)</span>
                    <div className="flex gap-2">
                      {[7, 3, 1, 0].map((day) => (
                        <button
                          type="button"
                          key={day}
                          onClick={() => handleReminderDayToggle(day)}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            reminderDays.includes(day)
                              ? 'bg-cyan-500/10 border-cyan-500/25 text-cyan-400'
                              : 'bg-zinc-950 border-zinc-850 text-zinc-500 hover:border-zinc-700'
                          }`}
                        >
                          {day === 0 ? 'Due Date' : `${day}d`}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Quiet Hours & System preferences */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">Quiet Hours Start</span>
                      <input
                        type="time"
                        value={quietHoursStart}
                        onChange={(e) => setQuietHoursStart(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-1.5 px-3 text-xs text-zinc-300 outline-none"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">Quiet Hours End</span>
                      <input
                        type="time"
                        value={quietHoursEnd}
                        onChange={(e) => setQuietHoursEnd(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-1.5 px-3 text-xs text-zinc-300 outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">Notification Sound</span>
                      <select
                        value={sound}
                        onChange={(e) => setSound(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-1.5 px-2.5 text-xs text-zinc-300 outline-none"
                      >
                        <option value="default">Default Tone</option>
                        <option value="none">Muted / Silent</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <span className="text-[10px] text-zinc-500 font-bold uppercase">Max Daily Alerts</span>
                      <input
                        type="number"
                        min="1"
                        max="20"
                        value={maxDaily}
                        onChange={(e) => setMaxDaily(Number(e.target.value))}
                        className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-1.5 px-3 text-xs text-zinc-300 outline-none"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <div>
                      <span className="text-xs font-bold text-zinc-300 block">Vibration Pattern</span>
                      <span className="text-[10px] text-zinc-500">Vibrate supported mobile browsers</span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={vibration}
                        onChange={(e) => setVibration(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-9 h-5 bg-zinc-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-zinc-400 after:border-zinc-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-cyan-500 peer-checked:after:bg-zinc-950 peer-checked:after:border-cyan-500"></div>
                    </label>
                  </div>

                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={prefLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 py-2 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {prefLoading ? 'Saving Settings...' : prefSuccess ? 'Settings Updated!' : t('settings_save')}
            </button>
          </form>

          {/* DANGEROUS ZONE: DELETE ACCOUNT */}
          <div className="bg-zinc-900 border border-rose-500/10 rounded-3xl p-6 space-y-4">
            <div>
              <h3 className="font-bold text-sm text-rose-400 flex items-center gap-2">
                <ShieldAlert className="w-4 h-4" />
                Dangerous Area
              </h3>
              <p className="text-[10px] text-zinc-500 font-medium">Irreversible workspace cleanup actions</p>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-zinc-950/40 p-4 rounded-2xl border border-zinc-800/60">
              <div className="space-y-0.5">
                <span className="text-xs font-bold text-zinc-300 block">Permanently Delete Account</span>
                <span className="text-[10px] text-zinc-500">Completely erase profile, and all active loan & payment databases.</span>
              </div>
              <button
                type="button"
                onClick={() => setShowDeleteModal(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 hover:border-rose-500/30 transition-all shrink-0 cursor-pointer text-center"
              >
                Delete My Account
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* MODAL: DELETE ACCOUNT CONFIRMATION */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-zinc-950/80 backdrop-blur-sm z-[110] flex items-center justify-center p-4">
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="w-full max-w-md bg-zinc-900 border border-zinc-850 rounded-2xl p-6 space-y-5 shadow-2xl relative"
          >
            <div className="space-y-2">
              <h4 className="text-lg font-black text-zinc-100 flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-400" />
                Confirm Account Deletion?
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed font-medium">
                Are you absolutely sure? This will permanently wipe your account profile and all recorded loan portfolios. This action cannot be undone.
              </p>
            </div>

            <div className="space-y-2 bg-zinc-950/60 p-4 rounded-xl border border-zinc-800/80">
              <span className="text-[10px] text-rose-400 font-bold uppercase tracking-wider block">Verification Required</span>
              <p className="text-[11px] text-zinc-500">
                Please type <strong className="text-zinc-300 font-bold select-all">delete</strong> in the box below to authorize deletion:
              </p>
              <input
                type="text"
                value={deleteConfirmText}
                onChange={(e) => setDeleteConfirmText(e.target.value)}
                placeholder="Type 'delete'"
                className="w-full bg-zinc-950 border border-rose-500/15 focus:border-rose-500/40 rounded-xl py-2 px-3 text-xs text-zinc-200 outline-none font-bold"
              />
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => { setShowDeleteModal(false); setDeleteConfirmText(''); }}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-zinc-950 border border-zinc-800 text-zinc-400 hover:border-zinc-700 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText.toLowerCase() !== 'delete'}
                className="flex-1 py-2 rounded-xl text-xs font-bold bg-rose-600 hover:bg-rose-500 text-white transition-all disabled:opacity-40 cursor-pointer"
              >
                Verify & Wipe Account
              </button>
            </div>
          </motion.div>
        </div>
      )}

    </div>
  );
}
