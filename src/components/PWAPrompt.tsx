import React, { useState, useEffect } from 'react';
import { 
  Download, X, Share, PlusSquare, Smartphone, Laptop, 
  CheckCircle2, ArrowRight, Star, CloudLightning, ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface PWAPromptProps {
  deferredPrompt: any;
  onInstallApp: () => Promise<void>;
  isInstalled: boolean;
}

export default function PWAPrompt({
  deferredPrompt,
  onInstallApp,
  isInstalled
}: PWAPromptProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [activeTab, setActiveTab] = useState<'ios' | 'android' | 'desktop'>('android');
  const [dismissed, setDismissed] = useState(false);

  const isInIframe = typeof window !== 'undefined' && window.self !== window.top;

  // Auto-detect OS on mount
  useEffect(() => {
    // Check local storage if user dismissed the prompt for this week
    const lastDismissed = localStorage.getItem('pwa_prompt_dismissed_time');
    const isPromptDismissed = localStorage.getItem('pwa_prompt_dismissed') === 'true';
    
    // If dismissed permanently or dismissed less than 3 days ago, don't show
    if (isPromptDismissed) {
      setDismissed(true);
      return;
    }

    if (lastDismissed) {
      const diff = Date.now() - parseInt(lastDismissed, 10);
      const threeDays = 3 * 24 * 60 * 60 * 1000;
      if (diff < threeDays) {
        setDismissed(true);
        return;
      }
    }

    // If already installed, don't show
    if (isInstalled) {
      return;
    }

    // Auto-detect browser/OS to pre-set instructions tab
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSUser = /iphone|ipad|ipod/.test(userAgent);
    const isAndroidUser = /android/.test(userAgent);

    if (isIOSUser) {
      setActiveTab('ios');
    } else if (isAndroidUser) {
      setActiveTab('android');
    } else {
      setActiveTab('desktop');
    }

    // Show after a short delay (e.g., 2.5 seconds after load so it doesn't block critical rendering)
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, 2500);

    return () => clearTimeout(timer);
  }, [isInstalled]);

  // Handle manual dismiss
  const handleDismiss = (permanently = false) => {
    setIsVisible(false);
    if (permanently) {
      localStorage.setItem('pwa_prompt_dismissed', 'true');
    } else {
      localStorage.setItem('pwa_prompt_dismissed_time', Date.now().toString());
    }
    setTimeout(() => setDismissed(true), 300);
  };

  if (dismissed || isInstalled) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          id="pwa_install_prompt_container"
          initial={{ opacity: 0, y: 50, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed bottom-4 right-4 left-4 md:left-auto md:w-[420px] bg-zinc-900 border border-zinc-800 rounded-2xl shadow-2xl z-50 overflow-hidden"
        >
          {/* TOP BAR / GRADIENT HEADER */}
          <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-b border-zinc-800/80 p-4 relative">
            <button
              id="pwa_dismiss_btn"
              onClick={() => handleDismiss(false)}
              className="absolute top-3 right-3 text-zinc-400 hover:text-zinc-200 transition-colors bg-zinc-800/40 hover:bg-zinc-800 p-1 rounded-lg cursor-pointer"
              title="Close for now"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500 to-blue-500 flex items-center justify-center text-zinc-950 shadow-lg shadow-cyan-500/20">
                <Download className="w-5.5 h-5.5 font-bold" />
              </div>
              <div>
                <h3 className="text-sm font-black text-zinc-100 tracking-tight">Download App</h3>
                <p className="text-[10px] text-cyan-400 font-bold tracking-wide uppercase flex items-center gap-1 mt-0.5">
                  <CloudLightning className="w-3 h-3 text-cyan-400" /> Standalone PWA Experience
                </p>
              </div>
            </div>
          </div>

          {/* MAIN PROMPT CONTENT */}
          <div className="p-4 space-y-4">
            <p className="text-xs text-zinc-400 leading-relaxed">
              Install the **EMI Progress Tracker** on your device to enjoy offline calculation access, zero loading times, and full fullscreen utility views.
            </p>

            {/* TAB SELECTOR OR IFRAME NOTICE */}
            {isInIframe ? (
              <div className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 space-y-2">
                  <h4 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    Preview Container Detected
                  </h4>
                  <p className="text-[11px] text-zinc-300 leading-normal">
                    Browser security policies strictly disable native PWA standalone installation inside nested iframes (such as the AI Studio preview window).
                  </p>
                  <p className="text-[11px] text-zinc-400 leading-normal">
                    To install this app on your phone, tablet, or desktop as a standalone application, you must launch it in a normal, independent browser tab.
                  </p>
                </div>
                
                <a
                  href={window.location.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-600 text-zinc-950 transition-all cursor-pointer shadow-md shadow-cyan-500/20 text-center"
                >
                  <Download className="w-4 h-4" />
                  Open App in New Tab to Install
                </a>

                <div className="border-t border-zinc-900/60 pt-2.5 mt-2 flex items-center justify-center gap-1.5 text-[9px] text-zinc-500 font-bold uppercase">
                  <ShieldCheck className="w-3.5 h-3.5 text-cyan-500/80" /> Safe, Secure & fully offline enabled
                </div>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-3 gap-1 bg-zinc-950 p-1 rounded-lg border border-zinc-850">
                  <button
                    id="pwa_tab_android"
                    onClick={() => setActiveTab('android')}
                    className={`py-1.5 rounded-md text-[10px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeTab === 'android'
                        ? 'bg-zinc-800 text-cyan-400 border border-zinc-700/50'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    Android
                  </button>
                  <button
                    id="pwa_tab_ios"
                    onClick={() => setActiveTab('ios')}
                    className={`py-1.5 rounded-md text-[10px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeTab === 'ios'
                        ? 'bg-zinc-800 text-cyan-400 border border-zinc-700/50'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Smartphone className="w-3.5 h-3.5" />
                    iOS (Apple)
                  </button>
                  <button
                    id="pwa_tab_desktop"
                    onClick={() => setActiveTab('desktop')}
                    className={`py-1.5 rounded-md text-[10px] font-black tracking-wider uppercase transition-all cursor-pointer flex items-center justify-center gap-1 ${
                      activeTab === 'desktop'
                        ? 'bg-zinc-800 text-cyan-400 border border-zinc-700/50'
                        : 'text-zinc-500 hover:text-zinc-300'
                    }`}
                  >
                    <Laptop className="w-3.5 h-3.5" />
                    Desktop
                  </button>
                </div>

                {/* DEVICE SPECIFIC INSTRUCTIONS */}
                <div className="bg-zinc-950 border border-zinc-850/70 rounded-xl p-3.5 min-h-[140px] flex flex-col justify-between">
                  
                  {/* ANDROID TAB */}
                  {activeTab === 'android' && (
                    <div className="space-y-3">
                      {deferredPrompt ? (
                        <div className="text-center py-2 space-y-3">
                          <p className="text-xs text-zinc-300 font-semibold">Your browser is fully compatible!</p>
                          <button
                            id="pwa_install_prompt_btn_android"
                            onClick={onInstallApp}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-600 text-zinc-950 transition-all cursor-pointer shadow-md shadow-cyan-500/20"
                          >
                            <Download className="w-4 h-4" />
                            Install App Instantly
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Manual Android Instructions</span>
                          <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside pl-1">
                            <li>Tap Chrome's menu button <span className="text-zinc-200 font-bold">⋮</span> in the top-right.</li>
                            <li>Select <span className="text-cyan-400 font-bold">"Install app"</span> or <span className="text-zinc-200 font-bold">"Add to Home screen"</span>.</li>
                            <li>Follow the screen confirmation to launch standalone.</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  )}

                  {/* IOS TAB */}
                  {activeTab === 'ios' && (
                    <div className="space-y-2">
                      <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Apple Safari Instructions</span>
                      <ul className="text-xs text-zinc-400 space-y-2">
                        <li className="flex items-start gap-2">
                          <span className="bg-zinc-800 text-zinc-300 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black mt-0.5">1</span>
                          <span>Tap the browser <span className="text-cyan-400 font-semibold">Share</span> button <Share className="w-3.5 h-3.5 inline mx-1 text-cyan-400" /> at the bottom of the Safari screen.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="bg-zinc-800 text-zinc-300 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black mt-0.5">2</span>
                          <span>Scroll down and select <span className="text-cyan-400 font-semibold">Add to Home Screen</span> <PlusSquare className="w-3.5 h-3.5 inline mx-1 text-cyan-400" />.</span>
                        </li>
                        <li className="flex items-start gap-2">
                          <span className="bg-zinc-800 text-zinc-300 w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-black mt-0.5">3</span>
                          <span>Click <span className="text-zinc-200 font-semibold">Add</span> in the top-right corner to complete!</span>
                        </li>
                      </ul>
                    </div>
                  )}

                  {/* DESKTOP TAB */}
                  {activeTab === 'desktop' && (
                    <div className="space-y-3">
                      {deferredPrompt ? (
                        <div className="text-center py-2 space-y-3">
                          <p className="text-xs text-zinc-300 font-semibold">Ready to install on this computer!</p>
                          <button
                            id="pwa_install_prompt_btn_desktop"
                            onClick={onInstallApp}
                            className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-black bg-cyan-500 hover:bg-cyan-600 text-zinc-950 transition-all cursor-pointer shadow-md shadow-cyan-500/20"
                          >
                            <Download className="w-4 h-4" />
                            Install Standalone Desktop App
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <span className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider block">Chrome / Edge Instructions</span>
                          <ol className="text-xs text-zinc-400 space-y-2 list-decimal list-inside pl-1">
                            <li>Look at the right-side of your <span className="text-zinc-200 font-semibold">Chrome address bar</span>.</li>
                            <li>Click the <span className="text-cyan-400 font-bold">Install</span> icon (a screen with down-arrow) or menu <span className="text-zinc-200 font-bold">⋮</span>.</li>
                            <li>Select <span className="text-cyan-400 font-semibold">"Install EMI Tracker"</span> for desktop view.</li>
                          </ol>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="border-t border-zinc-900/60 pt-2.5 mt-2 flex items-center gap-1.5 text-[9px] text-zinc-500 font-bold uppercase">
                    <ShieldCheck className="w-3.5 h-3.5 text-cyan-500/80" /> Safe, Secure & fully offline enabled
                  </div>
                </div>
              </>
            )}

            {/* BUTTON BAR */}
            <div className="flex items-center justify-between pt-1">
              <button
                id="pwa_never_show_btn"
                onClick={() => handleDismiss(true)}
                className="text-[10px] text-zinc-500 hover:text-zinc-400 transition-colors font-bold tracking-wide uppercase cursor-pointer"
              >
                Don't ask again
              </button>
              
              <button
                id="pwa_remind_later_btn"
                onClick={() => handleDismiss(false)}
                className="text-[10px] text-cyan-400 hover:text-cyan-300 transition-colors font-bold tracking-wide uppercase flex items-center gap-1 cursor-pointer"
              >
                Remind me later <ArrowRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
