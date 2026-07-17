import React, { useState, useEffect } from 'react';
import { 
  X, Copy, Check, QrCode, Download, Printer, Lock, Unlock, 
  Shield, ShieldAlert, Clock, RefreshCw, Trash2, History, Share2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface LoanSharingPrivacy {
  showLoanAmount: boolean;
  showInterestRate: boolean;
  showEmi: boolean;
  showPaymentHistory: boolean;
  showCharts: boolean;
  showNotes: boolean;
  showRemainingBalance: boolean;
  showNextEmiDate: boolean;
}

interface LoanSharingLog {
  action: 'created' | 'revoked' | 'regenerated' | 'accessed';
  timestamp: string;
  ip?: string;
}

interface LoanSharing {
  enabled: boolean;
  token: string;
  privacy: LoanSharingPrivacy;
  expirationType: 'never' | '24h' | '7d' | '30d' | 'custom';
  expirationDate: string | null;
  passwordProtected: boolean;
  logs: LoanSharingLog[];
}

interface Loan {
  id: string;
  loanName: string;
  lenderName: string;
  principal: number;
  sharing?: LoanSharing | null;
}

interface ShareLoanModalProps {
  isOpen: boolean;
  onClose: () => void;
  loan: Loan;
  token: string; // Auth token for owner API requests
  onUpdateLoan: (updatedLoan: any) => void;
}

export default function ShareLoanModal({
  isOpen,
  onClose,
  loan,
  token,
  onUpdateLoan
}: ShareLoanModalProps) {
  // Sharing Core States
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Form configurations
  const [privacy, setPrivacy] = useState<LoanSharingPrivacy>({
    showLoanAmount: true,
    showInterestRate: true,
    showEmi: true,
    showPaymentHistory: true,
    showCharts: true,
    showNotes: true,
    showRemainingBalance: true,
    showNextEmiDate: true
  });

  const [expirationType, setExpirationType] = useState<'never' | '24h' | '7d' | '30d' | 'custom'>('never');
  const [expirationDate, setExpirationDate] = useState('');
  
  const [password, setPassword] = useState('');
  const [enablePassword, setEnablePassword] = useState(false);

  // Sync state with loan when modal opens or loan changes
  useEffect(() => {
    if (loan?.sharing) {
      setPrivacy(loan.sharing.privacy);
      setExpirationType(loan.sharing.expirationType);
      setExpirationDate(loan.sharing.expirationDate ? loan.sharing.expirationDate.split('T')[0] : '');
      setEnablePassword(loan.sharing.passwordProtected);
    } else {
      // Default privacy settings
      setPrivacy({
        showLoanAmount: true,
        showInterestRate: true,
        showEmi: true,
        showPaymentHistory: true,
        showCharts: true,
        showNotes: true,
        showRemainingBalance: true,
        showNextEmiDate: true
      });
      setExpirationType('never');
      setExpirationDate('');
      setEnablePassword(false);
      setPassword('');
    }
    setSuccessMsg(null);
    setErrorMsg(null);
  }, [loan, isOpen]);

  if (!isOpen) return null;

  const origin = window.location.origin;
  const shareUrl = loan?.sharing?.enabled ? `${origin}/shared/${loan.sharing.token}` : '';

  // 1. Enable Sharing or Save settings
  const handleSaveSettings = async (regenerate = false) => {
    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/loans/${loan.id}/share`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          privacy,
          expirationType,
          expirationDate: expirationType === 'custom' ? expirationDate : undefined,
          password: enablePassword ? (password || undefined) : '', // send blank to disable password if unchecked
          regenerate
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to update sharing settings.');
      }

      onUpdateLoan(data);
      setSuccessMsg(regenerate ? 'New unguessable link generated!' : 'Sharing preferences updated successfully.');
      setPassword(''); // clear password field after save
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // 2. Revoke / Disable Sharing
  const handleRevokeSharing = async () => {
    if (!window.confirm('Are you absolutely sure you want to disable sharing for this loan? All existing links will immediately stop working.')) {
      return;
    }

    setLoading(true);
    setSuccessMsg(null);
    setErrorMsg(null);

    try {
      const res = await fetch(`/api/loans/${loan.id}/share`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to revoke loan sharing.');
      }

      onUpdateLoan(data);
      setSuccessMsg('Sharing has been successfully disabled and old links revoked.');
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Copy URL to Clipboard
  const handleCopyLink = () => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // QR Code Image URL
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(shareUrl)}`;

  // Print QR Code
  const handlePrintQR = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR Code - ${loan.loanName}</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; margin: 0; }
            img { width: 300px; height: 300px; }
            h2 { margin-top: 20px; color: #111; }
            p { color: #666; font-size: 14px; margin-top: 5px; }
          </style>
        </head>
        <body onload="window.print(); window.close();">
          <h2>QR Code for ${loan.loanName}</h2>
          <img src="${qrCodeUrl}" />
          <p>${shareUrl}</p>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Download QR Code
  const handleDownloadQR = async () => {
    try {
      const response = await fetch(qrCodeUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `qr_${loan.loanName.toLowerCase().replace(/\s+/g, '_')}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      console.error('Failed to download QR code:', err);
      // Fallback: open in new tab
      window.open(qrCodeUrl, '_blank');
    }
  };

  // Share QR Code (Native Web Share if available)
  const handleShareQR = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `Shared Loan: ${loan.loanName}`,
          text: `View the progress and details of my loan with ${loan.lenderName}:`,
          url: shareUrl,
        });
      } catch (err) {
        console.error('Error sharing:', err);
      }
    } else {
      handleCopyLink();
    }
  };

  // Format expiry dates
  const formatExpiryBadge = (expDate: string | null) => {
    if (!expDate) return 'Never Expire';
    const diff = new Date(expDate).getTime() - new Date().getTime();
    if (diff <= 0) return 'Expired';
    const hours = Math.ceil(diff / (1000 * 60 * 60));
    if (hours <= 24) return `Expires in ${hours} hr${hours > 1 ? 's' : ''}`;
    const days = Math.ceil(hours / 24);
    return `Expires in ${days} day${days > 1 ? 's' : ''}`;
  };

  return (
    <div id="share_loan_backdrop" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-950/80 backdrop-blur-sm overflow-y-auto">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        id="share_loan_modal_content" 
        className="relative w-full max-w-3xl bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden max-h-[90vh] flex flex-col"
      >
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-zinc-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Share2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-100">Share Loan Access</h3>
              <p className="text-xs text-zinc-400">Generate public secure views for "{loan.loanName}"</p>
            </div>
          </div>
          <button 
            id="close_share_modal_btn"
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200 flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Messages */}
          {successMsg && (
            <div id="share_success_banner" className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <Shield className="w-4 h-4 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div id="share_error_banner" className="bg-rose-500/10 border border-rose-500/20 text-rose-400 px-4 py-3 rounded-xl text-sm flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* NOT SHARED SCREEN */}
          {!loan?.sharing?.enabled ? (
            <div className="text-center py-8 space-y-6">
              <div className="mx-auto w-16 h-16 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400">
                <Lock className="w-8 h-8" />
              </div>
              <div className="max-w-md mx-auto">
                <h4 className="text-base font-bold text-zinc-100">Private Loan Progress</h4>
                <p className="text-sm text-zinc-400 mt-2">
                  This loan is currently 100% private. Generating a public link allows you to share its repayment progress, 
                  charts, and payment history securely with third parties (like financial partners, accountants, or family) 
                  without exposing your account credentials, email, or other loans.
                </p>
              </div>
              <div className="flex justify-center">
                <button
                  id="enable_sharing_btn"
                  onClick={() => handleSaveSettings(false)}
                  disabled={loading}
                  className="flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-bold bg-cyan-500 hover:bg-cyan-600 text-zinc-950 transition-all cursor-pointer disabled:opacity-50"
                >
                  {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Unlock className="w-4 h-4" />}
                  Generate Public Shared Link
                </button>
              </div>
            </div>
          ) : (
            /* SHARED / ACTIVE CONFIG SCREEN */
            <div className="space-y-6">
              
              {/* LIVE LINK & QUICK ACTIONS */}
              <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider">Share Link Active</span>
                  </div>
                  <span className="text-[10px] bg-zinc-800 px-2 py-0.5 rounded text-zinc-400 font-semibold border border-zinc-700">
                    {formatExpiryBadge(loan.sharing.expirationDate)}
                  </span>
                </div>

                <div className="flex gap-2">
                  <input
                    id="public_share_url_input"
                    type="text"
                    readOnly
                    value={shareUrl}
                    className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs font-mono text-cyan-400 focus:outline-none"
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                  />
                  <button
                    id="copy_share_url_btn"
                    onClick={handleCopyLink}
                    className="px-4 py-2 bg-zinc-800 border border-zinc-700 hover:bg-zinc-700 text-zinc-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* TWO COLUMN QR & CONTROL PANEL */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
                
                {/* QR CODE (4 Cols) */}
                <div className="md:col-span-5 bg-zinc-950 border border-zinc-800 rounded-xl p-4 flex flex-col items-center justify-center text-center space-y-4">
                  <div className="bg-white p-2.5 rounded-lg">
                    <img 
                      id="share_qr_preview_img"
                      src={qrCodeUrl} 
                      alt="Loan QR Code" 
                      className="w-36 h-36 border border-zinc-100" 
                    />
                  </div>
                  <div className="space-y-1">
                    <span className="text-xs font-bold text-zinc-300 block">QR Code Preview</span>
                    <span className="text-[10px] text-zinc-500">Scan to open shared report directly</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5 w-full">
                    <button
                      id="download_qr_btn"
                      onClick={handleDownloadQR}
                      className="flex flex-col items-center justify-center py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                      title="Download QR"
                    >
                      <Download className="w-4 h-4 mb-1" />
                      Save
                    </button>
                    <button
                      id="print_qr_btn"
                      onClick={handlePrintQR}
                      className="flex flex-col items-center justify-center py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                      title="Print QR"
                    >
                      <Printer className="w-4 h-4 mb-1" />
                      Print
                    </button>
                    <button
                      id="native_share_qr_btn"
                      onClick={handleShareQR}
                      className="flex flex-col items-center justify-center py-2 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 rounded-lg text-[10px] text-zinc-400 hover:text-zinc-200 cursor-pointer transition-colors"
                      title="Share QR"
                    >
                      <Share2 className="w-4 h-4 mb-1" />
                      Share
                    </button>
                  </div>
                </div>

                {/* PRIVACY CONTROLS & EXPIRY (7 Cols) */}
                <div className="md:col-span-7 space-y-5">
                  <div>
                    <h4 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest mb-3">Privacy Controls</h4>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_loan_amount_checkbox"
                          type="checkbox"
                          checked={privacy.showLoanAmount}
                          onChange={(e) => setPrivacy({ ...privacy, showLoanAmount: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>Loan Amount</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_rate_checkbox"
                          type="checkbox"
                          checked={privacy.showInterestRate}
                          onChange={(e) => setPrivacy({ ...privacy, showInterestRate: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>Interest Rate</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_emi_checkbox"
                          type="checkbox"
                          checked={privacy.showEmi}
                          onChange={(e) => setPrivacy({ ...privacy, showEmi: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>EMI Amount</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_payments_checkbox"
                          type="checkbox"
                          checked={privacy.showPaymentHistory}
                          onChange={(e) => setPrivacy({ ...privacy, showPaymentHistory: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>Payment History</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_charts_checkbox"
                          type="checkbox"
                          checked={privacy.showCharts}
                          onChange={(e) => setPrivacy({ ...privacy, showCharts: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>Analytics Charts</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_notes_checkbox"
                          type="checkbox"
                          checked={privacy.showNotes}
                          onChange={(e) => setPrivacy({ ...privacy, showNotes: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>Payment Notes</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_remaining_checkbox"
                          type="checkbox"
                          checked={privacy.showRemainingBalance}
                          onChange={(e) => setPrivacy({ ...privacy, showRemainingBalance: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>Remaining Balance</span>
                      </label>
                      <label className="flex items-center gap-2 text-xs text-zinc-300 hover:text-zinc-100 cursor-pointer py-1">
                        <input
                          id="privacy_next_emi_checkbox"
                          type="checkbox"
                          checked={privacy.showNextEmiDate}
                          onChange={(e) => setPrivacy({ ...privacy, showNextEmiDate: e.target.checked })}
                          className="rounded border-zinc-800 text-cyan-500 focus:ring-cyan-500 bg-zinc-950 w-4 h-4"
                        />
                        <span>Next EMI Date</span>
                      </label>
                    </div>
                  </div>

                  {/* EXPIRATION TIMING */}
                  <div className="space-y-2">
                    <h4 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Link Expiration
                    </h4>
                    <div className="grid grid-cols-3 gap-2">
                      {(['never', '24h', '7d', '30d', 'custom'] as const).map((type) => (
                        <button
                          key={type}
                          id={`expiry_${type}_tab_btn`}
                          onClick={() => setExpirationType(type)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer capitalize ${
                            expirationType === type
                              ? 'bg-cyan-500/10 border-cyan-500/40 text-cyan-400 shadow-sm'
                              : 'bg-zinc-950/40 border-zinc-850 text-zinc-400 hover:border-zinc-750'
                          }`}
                        >
                          {type === '24h' ? '24 Hours' : type === '7d' ? '7 Days' : type === '30d' ? '30 Days' : type}
                        </button>
                      ))}
                    </div>
                    {expirationType === 'custom' && (
                      <input
                        id="custom_expiration_date_input"
                        type="date"
                        value={expirationDate}
                        onChange={(e) => setExpirationDate(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50 mt-2"
                        min={new Date().toISOString().split('T')[0]}
                      />
                    )}
                  </div>
                </div>

              </div>

              {/* PASSWORD PROTECTION & REVOCATION OPTIONS */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-zinc-850 pt-5">
                
                {/* PASSWORD CARD */}
                <div className="bg-zinc-950/50 border border-zinc-850 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <div className="text-zinc-400">
                      {enablePassword ? <Lock className="w-4 h-4 text-cyan-400" /> : <Unlock className="w-4 h-4" />}
                    </div>
                    <span className="text-xs font-bold text-zinc-200">Password Protection</span>
                  </div>

                  <label className="flex items-center gap-2 text-xs text-zinc-400 cursor-pointer">
                    <input
                      id="enable_password_checkbox"
                      type="checkbox"
                      checked={enablePassword}
                      onChange={(e) => {
                        setEnablePassword(e.target.checked);
                        if (!e.target.checked) setPassword('');
                      }}
                      className="rounded border-zinc-850 text-cyan-500 bg-zinc-950"
                    />
                    <span>Protect shared page with password</span>
                  </label>

                  {enablePassword && (
                    <div className="space-y-2 animate-in slide-in-from-top-1 duration-150">
                      <input
                        id="share_password_input"
                        type="password"
                        placeholder="Enter custom share password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="w-full bg-zinc-950 border border-zinc-850 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-cyan-500/50"
                      />
                      <p className="text-[10px] text-zinc-500">
                        {loan.sharing?.passwordProtected 
                          ? 'Leave password blank to keep current password, or enter a new one to update.' 
                          : 'Set password. Visitors must enter this before viewing the loan.'}
                      </p>
                    </div>
                  )}
                </div>

                {/* LOGS / SECURITY AUDIT TRAIL */}
                <div className="bg-zinc-950/50 border border-zinc-850 rounded-xl p-4 flex flex-col justify-between">
                  <div className="space-y-2 flex-1">
                    <div className="flex items-center gap-2 text-zinc-200">
                      <History className="w-4 h-4 text-cyan-500" />
                      <span className="text-xs font-bold">Security Audit Trail</span>
                    </div>
                    
                    <div className="max-h-24 overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                      {loan.sharing.logs && loan.sharing.logs.length > 0 ? (
                        loan.sharing.logs.map((log, i) => (
                          <div key={i} className="flex justify-between items-center text-[10px] text-zinc-500 border-b border-zinc-900 pb-1">
                            <span className="capitalize text-zinc-400 font-medium">{log.action}</span>
                            <span>{new Date(log.timestamp).toLocaleString()}</span>
                          </div>
                        ))
                      ) : (
                        <span className="text-[10px] text-zinc-500 italic">No access logs available yet.</span>
                      )}
                    </div>
                  </div>
                </div>

              </div>

              {/* SAVE / UPDATE ACTIONS AND REVOKE ACCESS BAR */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-zinc-850 pt-5">
                <button
                  id="revoke_sharing_access_btn"
                  onClick={handleRevokeSharing}
                  disabled={loading}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-rose-950/40 hover:bg-rose-900/50 border border-rose-900/30 text-rose-400 transition-all cursor-pointer disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Disable Sharing & Revoke
                </button>

                <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
                  <button
                    id="regenerate_share_link_btn"
                    onClick={() => handleSaveSettings(true)}
                    disabled={loading}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold bg-zinc-850 border border-zinc-800 hover:bg-zinc-800 text-zinc-300 cursor-pointer transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Regenerate Token
                  </button>
                  <button
                    id="save_share_settings_btn"
                    onClick={() => handleSaveSettings(false)}
                    disabled={loading}
                    className="flex-1 sm:flex-initial flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-600 text-zinc-950 transition-all cursor-pointer disabled:opacity-50"
                  >
                    Save Shared Settings
                  </button>
                </div>
              </div>

            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
