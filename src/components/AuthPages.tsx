import { useState, FormEvent } from 'react';
import { Mail, Lock, User, Eye, EyeOff, Key, Compass, ArrowLeft, ArrowRight, ShieldCheck, Check } from 'lucide-react';
import { motion } from 'motion/react';
import { translations, LanguageType } from '../lib/translations';

interface AuthPagesProps {
  onLoginSuccess: (profile: any, token: string) => void;
}

export default function AuthPages({ onLoginSuccess }: AuthPagesProps) {
  const [view, setView] = useState<'login' | 'register' | 'forgot' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [resetCode, setResetCode] = useState('');
  const [newPassword, setNewPassword] = useState('');

  // Status & Error indicators
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Localization State
  const [lang, setLang] = useState<LanguageType>(() => {
    return (localStorage.getItem('emi_tracker_lang') as LanguageType) || 'en';
  });

  const localTranslations: Record<LanguageType, Record<string, string>> = {
    en: {
      password: "Password",
      forgot_password_link: "Forgot Password?",
      or: "OR",
      email_placeholder: "name@example.com",
      fullname_placeholder: "John Doe",
      password_placeholder: "Min. 6 characters",
      reset_code_placeholder: "123456",
      demo_workspace_err: "Failed to load demo workspace. Please register a free account instead."
    },
    te: {
      password: "పాస్‌వర్డ్",
      forgot_password_link: "పాస్‌వర్డ్ మర్చిపోయారా?",
      or: "లేదా",
      email_placeholder: "పేరు@example.com",
      fullname_placeholder: "జాన్ డో",
      password_placeholder: "కనీసం 6 అక్షరాలు",
      reset_code_placeholder: "123456",
      demo_workspace_err: "డెమో వర్క్‌స్పేస్‌ను లోడ్ చేయడం విఫలమైంది. దయచేసి ఉచిత ఖాతాను నమోదు చేసుకోండి."
    },
    in: {
      password: "पासवर्ड",
      forgot_password_link: "पासवर्ड भूल गए?",
      or: "अथवा",
      email_placeholder: "नाम@example.com",
      fullname_placeholder: "जॉन डो",
      password_placeholder: "न्यूनतम 6 अक्षर",
      reset_code_placeholder: "123456",
      demo_workspace_err: "डेमो कार्यक्षेत्र लोड करने में विफल। कृपया एक निःशुल्क खाता पंजीकृत करें।"
    },
    es: {
      password: "Contraseña",
      forgot_password_link: "¿Olvidó su contraseña?",
      or: "O",
      email_placeholder: "nombre@ejemplo.com",
      fullname_placeholder: "John Doe",
      password_placeholder: "Mín. 6 caracteres",
      reset_code_placeholder: "123456",
      demo_workspace_err: "Error al cargar el espacio de de demostración. Regístrese gratis."
    },
    fr: {
      password: "Mot de passe",
      forgot_password_link: "Mot de passe oublié ?",
      or: "OU",
      email_placeholder: "nom@exemple.com",
      fullname_placeholder: "Jean Dupont",
      password_placeholder: "Min. 6 caractères",
      reset_code_placeholder: "123456",
      demo_workspace_err: "Échec du chargement de la démo. Veuillez vous inscrire gratuitement."
    },
    de: {
      password: "Passwort",
      forgot_password_link: "Passwort vergessen?",
      or: "ODER",
      email_placeholder: "name@beispiel.de",
      fullname_placeholder: "Max Mustermann",
      password_placeholder: "Min. 6 Zeichen",
      reset_code_placeholder: "123456",
      demo_workspace_err: "Demo-Arbeitsbereich konnte nicht geladen werden. Bitte registrieren Sie sich kostenlos."
    }
  };

  const t = (key: string) => {
    return localTranslations[lang]?.[key] || translations[lang]?.[key] || translations['en']?.[key] || localTranslations['en']?.[key] || key;
  };

  const handleLanguageChange = (newLang: LanguageType) => {
    setLang(newLang);
    localStorage.setItem('emi_tracker_lang', newLang);
    // Dispatch custom event to notify main app window of language change if needed
    window.dispatchEvent(new CustomEvent('languageChanged', { detail: newLang }));
  };

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Login failed. Please check credentials.');
      }
      onLoginSuccess(data.profile, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegister = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName, email, password })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Registration failed.');
      }
      onLoginSuccess(data.profile, data.token);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Request failed.');
      }
      setInfo(`A reset code has been sent! For sandbox demonstration, please use Code: ${data.demoResetCode || '123456'}`);
      setView('reset');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleResetPassword = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, resetCode, newPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Resetting password failed.');
      }
      setInfo('Password reset successfully! Please log in with your new password.');
      setView('login');
      setPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const loginDemoAccount = async () => {
    setError(null);
    setInfo(null);
    setIsLoading(true);

    try {
      // Register or login test demo account automatically
      const loginRes = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'demo@example.com', password: 'password123', rememberMe: true })
      });

      if (loginRes.ok) {
        const loginData = await loginRes.json();
        onLoginSuccess(loginData.profile, loginData.token);
        return;
      }

      // If doesn't exist, register it first!
      const regRes = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName: 'Demo User', email: 'demo@example.com', password: 'password123' })
      });

      const regData = await regRes.json();
      if (!regRes.ok) {
        throw new Error(regData.error || 'Failed to initialize demo account.');
      }
      onLoginSuccess(regData.profile, regData.token);
    } catch (err: any) {
      setError(t('demo_workspace_err'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div id="auth_container" className="min-h-screen bg-zinc-950 flex flex-col justify-center items-center p-6 relative overflow-hidden font-sans">
      
      {/* Decorative ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-[120px] pointer-events-none"></div>
      <div className="absolute bottom-1/4 left-1/3 w-80 h-80 bg-fuchsia-500/5 rounded-full blur-[100px] pointer-events-none"></div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl p-8 shadow-xl relative z-10"
      >
        {/* Floating Language Selector */}
        <div className="absolute top-6 right-6 z-20">
          <select
            value={lang}
            onChange={(e) => handleLanguageChange(e.target.value as LanguageType)}
            className="bg-zinc-950 border border-zinc-800 text-[10px] font-bold text-zinc-400 rounded-lg px-2 py-1 outline-none focus:border-cyan-500 cursor-pointer hover:border-zinc-700 transition-colors"
          >
            <option value="en">EN</option>
            <option value="te">తెలుగు</option>
            <option value="in">हिंदी</option>
            <option value="es">ES</option>
            <option value="fr">FR</option>
            <option value="de">DE</option>
          </select>
        </div>

        {/* BRAND HEADER */}
        <div className="text-center space-y-2 mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 shadow-inner mb-2">
            <Compass className="w-6 h-6 animate-pulse" />
          </div>
          <h2 className="text-2xl font-black text-zinc-100 tracking-tight leading-none">{t('auth_title')}</h2>
          <p className="text-xs text-zinc-400">{t('auth_subtitle')}</p>
        </div>

        {/* FEEDBACK LABELS */}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs font-semibold">
            {error}
          </div>
        )}

        {info && (
          <div className="mb-6 p-4 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-xs font-semibold leading-relaxed">
            {info}
          </div>
        )}

        {/* VIEW: LOGIN */}
        {view === 'login' && (
          <form onSubmit={handleLogin} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_email')}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  placeholder={t('email_placeholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('password')}</label>
                <button
                  type="button"
                  onClick={() => setView('forgot')}
                  className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 transition-colors"
                >
                  {t('forgot_password_link')}
                </button>
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-10 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  placeholder="••••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between py-1">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="rounded border-zinc-800 bg-zinc-950 text-cyan-500 focus:ring-cyan-500/20"
                />
                <span className="text-xs text-zinc-400 font-medium">{t('auth_remember_session')}</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? t('auth_authenticating') : t('auth_sign_in')}
              {!isLoading && <ArrowRight className="w-4 h-4" />}
            </button>

            <div className="relative flex py-2 items-center">
              <div className="flex-grow border-t border-zinc-800/80"></div>
              <span className="flex-shrink mx-4 text-[10px] font-bold text-zinc-500 uppercase tracking-widest">{t('or')}</span>
              <div className="flex-grow border-t border-zinc-800/80"></div>
            </div>

            <button
              type="button"
              onClick={loginDemoAccount}
              disabled={isLoading}
              className="w-full bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 py-2.5 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <ShieldCheck className="w-4.5 h-4.5 text-cyan-400" />
              {t('auth_quick_demo')}
            </button>

            <p className="text-center text-xs text-zinc-500 pt-2 font-medium">
              {t('auth_dont_have_account')}{' '}
              <button
                type="button"
                onClick={() => setView('register')}
                className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors"
              >
                {t('auth_sign_up_free')}
              </button>
            </p>
          </form>
        )}

        {/* VIEW: REGISTER */}
        {view === 'register' && (
          <form onSubmit={handleRegister} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_full_name')}</label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  placeholder={t('fullname_placeholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_email')}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  placeholder={t('email_placeholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('password')}</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-10 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  placeholder={t('password_placeholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-cyan-500 hover:bg-cyan-400 text-zinc-950 py-2.5 rounded-xl font-bold text-sm transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 mt-2"
            >
              {isLoading ? t('auth_creating_workspace') : t('auth_register_account')}
              {!isLoading && <Check className="w-4.5 h-4.5" />}
            </button>

            <p className="text-center text-xs text-zinc-500 pt-2 font-medium">
              {t('auth_already_have_account')}{' '}
              <button
                type="button"
                onClick={() => setView('login')}
                className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors"
              >
                {t('auth_sign_in')}
              </button>
            </p>
          </form>
        )}

        {/* VIEW: FORGOT PASSWORD */}
        {view === 'forgot' && (
          <form onSubmit={handleForgotPassword} className="space-y-5">
            <p className="text-xs text-zinc-400 leading-relaxed">
              {t('auth_forgot_desc')}
            </p>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('settings_email')}</label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  placeholder={t('email_placeholder')}
                />
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="button"
                onClick={() => setView('login')}
                className="flex-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('auth_back')}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-grow bg-cyan-500 hover:bg-cyan-400 text-zinc-950 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Requesting...' : t('auth_request_code')}
                {!isLoading && <Key className="w-3.5 h-3.5" />}
              </button>
            </div>
          </form>
        )}

        {/* VIEW: RESET PASSWORD */}
        {view === 'reset' && (
          <form onSubmit={handleResetPassword} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('auth_reset_pin')}</label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type="text"
                  required
                  value={resetCode}
                  onChange={(e) => setResetCode(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-4 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600 font-mono tracking-widest text-center"
                  placeholder={t('reset_code_placeholder')}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">{t('auth_new_secure_pass')}</label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 focus:border-cyan-500/40 rounded-xl py-2.5 pl-10 pr-10 text-sm text-zinc-200 outline-none transition-all placeholder:text-zinc-600"
                  placeholder={t('password_placeholder')}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex gap-4 pt-2">
              <button
                type="button"
                onClick={() => setView('forgot')}
                className="flex-1 bg-zinc-950 hover:bg-zinc-800 border border-zinc-800 text-zinc-400 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                {t('auth_back')}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="flex-grow bg-cyan-500 hover:bg-cyan-400 text-zinc-950 py-2.5 rounded-xl font-bold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isLoading ? 'Resetting...' : t('auth_reset_password_btn')}
                {!isLoading && <Check className="w-3.5 h-3.5" />}
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}
