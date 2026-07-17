import React, { useState, useEffect } from 'react';
import { 
  Lock, Unlock, FileText, Printer, Download, AlertTriangle, 
  Calendar, DollarSign, Clock, TrendingUp, Sparkles, ShieldAlert, CheckCircle2
} from 'lucide-react';
import { 
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend 
} from 'recharts';

interface SharedLoanViewProps {
  token: string;
}

export default function SharedLoanView({ token }: SharedLoanViewProps) {
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  
  // Security lock screen states
  const [passwordRequired, setPasswordRequired] = useState(false);
  const [password, setPassword] = useState('');
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [unlockLoading, setUnlockLoading] = useState(false);

  // Loan state (fetched)
  const [loan, setLoan] = useState<any | null>(null);

  // Validate on mount
  useEffect(() => {
    validateToken();
  }, [token]);

  const validateToken = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`/api/shared/validate/${token}`);
      const data = await res.json();
      
      if (!res.ok) {
        if (res.status === 410) {
          setErrorMsg('This shared financial statement has expired.');
        } else if (res.status === 404) {
          setErrorMsg('This shared link is invalid or has been revoked by the owner.');
        } else {
          setErrorMsg(data.error || 'Failed to access shared loan.');
        }
        return;
      }

      if (data.passwordRequired) {
        setPasswordRequired(true);
        setLoan({ loanName: data.loanName });
      } else {
        setLoan(data);
      }
    } catch (err) {
      setErrorMsg('Failed to establish a connection with the security server.');
    } finally {
      setLoading(false);
    }
  };

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockLoading(true);
    setUnlockError(null);

    try {
      const res = await fetch(`/api/shared/unlock/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
      });
      const data = await res.json();

      if (!res.ok) {
        setUnlockError(data.error || 'Invalid security password.');
        return;
      }

      setLoan(data);
      setPasswordRequired(false);
    } catch (err) {
      setUnlockError('Connection error while unlocking.');
    } finally {
      setUnlockLoading(false);
    }
  };

  // Helper currency formatter
  const formatCurrency = (val: number) => {
    const symbol = loan?.currency === 'EUR' ? '€' : loan?.currency === 'GBP' ? '£' : loan?.currency === 'INR' ? '₹' : '$';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: loan?.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(val).replace(/^[A-Z]{3}/, symbol);
  };

  // Formats date
  const formatDate = (dateStr: string) => {
    if (!dateStr || dateStr === 'Hidden') return 'Hidden';
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Browser print action
  const handlePrint = () => {
    window.print();
  };

  // Loading indicator
  if (loading) {
    return (
      <div id="shared_loader" className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-12 h-12 rounded-full border-4 border-cyan-500/10 border-t-cyan-500 animate-spin"></div>
        <p className="text-sm font-semibold text-zinc-400">Verifying secure credentials...</p>
      </div>
    );
  }

  // Error screen
  if (errorMsg) {
    return (
      <div id="shared_error_view" className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 text-center space-y-5 shadow-xl">
          <div className="mx-auto w-14 h-14 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-zinc-100">Access Restricted</h3>
            <p className="text-sm text-zinc-400 mt-2">{errorMsg}</p>
          </div>
          <div className="border-t border-zinc-800/50 pt-4 text-xs text-zinc-500">
            Secure statement token verification failed
          </div>
        </div>
      </div>
    );
  }

  // Password Protection screen
  if (passwordRequired) {
    return (
      <div id="shared_unlock_view" className="min-h-screen bg-zinc-950 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-5 shadow-xl">
          <div className="text-center space-y-3">
            <div className="mx-auto w-12 h-12 rounded-full bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
              <Lock className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-zinc-100">Decryption Key Required</h3>
              <p className="text-xs text-zinc-400 mt-1">
                The financial report for <strong>"{loan?.loanName}"</strong> is password-protected.
              </p>
            </div>
          </div>

          {unlockError && (
            <div id="unlock_error_alert" className="bg-rose-500/10 border border-rose-500/20 text-rose-400 p-3 rounded-lg text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{unlockError}</span>
            </div>
          )}

          <form onSubmit={handleUnlock} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-zinc-400 uppercase">Enter Decryption Key</label>
              <input
                id="unlock_password_input"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Security Password"
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-3 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-cyan-500"
              />
            </div>
            <button
              id="unlock_submit_btn"
              type="submit"
              disabled={unlockLoading}
              className="w-full py-2.5 rounded-xl text-xs font-bold bg-cyan-500 hover:bg-cyan-600 text-zinc-950 flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {unlockLoading ? 'Validating...' : 'Unlock Statement'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // Active / Loaded report view
  const showAmount = loan?.principal > 0;
  const showRate = loan?.rate > 0;
  const showEmi = loan?.emi > 0;
  const showCharts = loan?.amortizationSchedule && loan.amortizationSchedule.length > 0;
  const showHistory = loan?.payments && loan.payments.length > 0;

  // Render variables
  const completionPercent = loan.completionPercentage || 0;

  // Pie chart data
  const pieData = [
    { name: 'Paid Principal', value: loan.principalPaid || 0, color: '#06b6d4' },
    { name: 'Outstanding Principal', value: loan.remainingPrincipal || 0, color: '#f43f5e' }
  ];

  return (
    <div id="shared_statement_layout" className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans print:bg-white print:text-zinc-900">
      
      {/* SECURE READ-ONLY HEADER BANNER */}
      <div id="readonly_top_banner" className="bg-zinc-900 border-b border-zinc-800 py-3 px-4 flex items-center justify-between text-xs font-medium text-cyan-400 tracking-wide print:hidden">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-cyan-400" />
          <span>SECURE SECURED SHARE READ-ONLY FINANCIAL STATEMENT</span>
        </div>
        <div className="text-[10px] bg-zinc-800 text-zinc-400 px-2 py-0.5 rounded border border-zinc-700">
          Encrypted Payload
        </div>
      </div>

      {/* CORE WRAPPER */}
      <div className="flex-1 max-w-6xl w-full mx-auto p-4 md:p-8 space-y-8 print:p-0 print:max-w-full">
        
        {/* STATEMENT HEADER BAR */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-zinc-800/60 pb-6 print:border-zinc-300">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold tracking-wider text-cyan-400 uppercase print:text-zinc-500">{loan.lenderName}</span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full border border-emerald-500/20 font-bold uppercase tracking-wider print:border-zinc-400 print:text-zinc-700">
                {loan.status}
              </span>
            </div>
            <h1 className="text-3xl font-extrabold text-zinc-100 tracking-tight mt-1 print:text-zinc-900">{loan.loanName}</h1>
            <p className="text-xs text-zinc-400 mt-1 print:text-zinc-500">
              Verified Financial Repayment Report • Generated on {new Date().toLocaleDateString()}
            </p>
          </div>

          <button
            id="print_statement_btn"
            onClick={handlePrint}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-200 transition-all cursor-pointer shadow-sm hover:shadow-cyan-500/5 print:hidden"
          >
            <Printer className="w-4 h-4" />
            Print / Export PDF Statement
          </button>
        </div>

        {/* FINANCIAL SUMMARY BENTO CARDS */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 print:border-zinc-300 print:bg-zinc-50">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Outstanding Debt</span>
            <h3 className="text-2xl font-black text-zinc-100 mt-2 print:text-zinc-900">
              {showAmount ? formatCurrency(loan.remainingPrincipal + loan.remainingInterest) : 'Protected'}
            </h3>
            <div className="flex flex-col text-[10px] text-zinc-500 mt-2 space-y-0.5">
              <span>Principal: {showAmount ? formatCurrency(loan.remainingPrincipal) : 'Protected'}</span>
              <span>Interest: {showRate ? formatCurrency(loan.remainingInterest) : 'Protected'}</span>
            </div>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 print:border-zinc-300 print:bg-zinc-50">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Original Principal</span>
            <h3 className="text-2xl font-black text-zinc-100 mt-2 print:text-zinc-900">
              {showAmount ? formatCurrency(loan.principal) : 'Protected'}
            </h3>
            <span className="text-[10px] text-zinc-500 mt-2 block">
              Interest Rate: {showRate ? `${loan.rate}% (${loan.type})` : 'Protected'}
            </span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 print:border-zinc-300 print:bg-zinc-50">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Equated Monthly Installment</span>
            <h3 className="text-2xl font-black text-zinc-100 mt-2 print:text-zinc-900">
              {showEmi ? formatCurrency(loan.emi) : 'Protected'}
            </h3>
            <span className="text-[10px] text-zinc-500 mt-2 block">
              Duration: {loan.duration} {loan.durationUnit}
            </span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 print:border-zinc-300 print:bg-zinc-50">
            <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider block">Total Repayment Amount</span>
            <h3 className="text-2xl font-black text-zinc-100 mt-2 print:text-zinc-900">
              {showAmount ? formatCurrency(loan.totalRepayment) : 'Protected'}
            </h3>
            <span className="text-[10px] text-zinc-500 mt-2 block">
              Total Interest: {showRate ? formatCurrency(loan.totalInterest) : 'Protected'}
            </span>
          </div>

        </div>

        {/* PROGRESS BLOCK */}
        <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 md:p-6 space-y-3 print:border-zinc-300 print:bg-zinc-50">
          <div className="flex justify-between items-center text-xs font-bold uppercase tracking-wider">
            <span className="text-zinc-400">Repayment Progress Indicator</span>
            <span className="text-cyan-400">{completionPercent.toFixed(1)}% Completed</span>
          </div>
          <div className="w-full bg-zinc-950 rounded-full h-3 overflow-hidden border border-zinc-800 print:border-zinc-300">
            <div 
              className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full transition-all duration-500 print:bg-cyan-600" 
              style={{ width: `${completionPercent}%` }}
            ></div>
          </div>
          <div className="flex justify-between text-[10px] text-zinc-500 font-semibold uppercase">
            <span>Total Repaid: {showAmount ? formatCurrency(loan.totalPaid) : 'Protected'}</span>
            <span>Outstanding Balance: {showAmount ? formatCurrency(loan.remainingPrincipal) : 'Protected'}</span>
          </div>
        </div>

        {/* CORE ANALYTICS (CHARTS) */}
        {showCharts && (
          <div id="shared_analytics_grid" className="grid grid-cols-1 md:grid-cols-12 gap-6 print:grid-cols-1">
            
            {/* PIE CHART VISUAL (4 cols) */}
            <div className="md:col-span-4 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 flex flex-col justify-between print:border-zinc-300">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-4 block">Equity Split</span>
              <div className="h-56 flex items-center justify-center">
                {showAmount ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={75}
                        paddingAngle={4}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: any) => formatCurrency(Number(value))} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-zinc-600 text-xs italic">Principal details hidden by owner.</div>
                )}
              </div>
              {showAmount && (
                <div className="space-y-1.5 mt-4">
                  {pieData.map((entry, i) => (
                    <div key={i} className="flex justify-between items-center text-xs">
                      <div className="flex items-center gap-2 text-zinc-300">
                        <span className="w-2.5 h-2.5 rounded" style={{ backgroundColor: entry.color }}></span>
                        <span>{entry.name}</span>
                      </div>
                      <span className="font-bold text-zinc-100">{formatCurrency(entry.value)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* REPAYMENT CURVE LINE (8 cols) */}
            <div className="md:col-span-8 bg-zinc-900 border border-zinc-800 rounded-2xl p-5 print:border-zinc-300">
              <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider mb-4 block">Amortization rep curve</span>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={loan.amortizationSchedule}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                    <XAxis dataKey="paymentNumber" stroke="#71717a" fontSize={10} label={{ value: 'Installment #', position: 'insideBottom', offset: -5 }} />
                    <YAxis stroke="#71717a" fontSize={10} tickFormatter={(v) => showAmount ? `$${v}` : 'Protected'} />
                    <Tooltip formatter={(v: any) => showAmount ? formatCurrency(Number(v)) : 'Protected'} labelFormatter={(label) => `Installment #${label}`} />
                    <Legend />
                    <Line type="monotone" dataKey="remainingBalance" stroke="#f43f5e" name="Remaining Balance" strokeWidth={2} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

          </div>
        )}

        {/* PAYMENT HISTORY TABLE (LEDGER) */}
        <div id="shared_payments_ledger" className="space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="text-xs font-extrabold text-zinc-400 uppercase tracking-widest">Repayment History Ledger</h4>
            <span className="text-[10px] text-zinc-500">Showing verified direct ledger records</span>
          </div>

          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden print:border-zinc-300">
            {showHistory ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-950 text-[10px] text-zinc-400 font-extrabold uppercase tracking-wider border-b border-zinc-800 print:bg-zinc-50 print:border-zinc-300 print:text-zinc-700">
                    <tr>
                      <th className="px-6 py-4">Receipt Date</th>
                      <th className="px-6 py-4">Amount Recieved</th>
                      <th className="px-6 py-4">Principal Component</th>
                      <th className="px-6 py-4">Interest Component</th>
                      <th className="px-6 py-4">Remaining Balance</th>
                      <th className="px-6 py-4">Audit Status</th>
                      <th className="px-6 py-4">Payment Memo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-850 print:divide-zinc-200">
                    {loan.payments.map((pmt: any, index: number) => (
                      <tr key={index} className="hover:bg-zinc-850/30 transition-colors">
                        <td className="px-6 py-4 font-semibold text-zinc-300">{formatDate(pmt.paymentDate)}</td>
                        <td className="px-6 py-4 font-bold text-cyan-400">{formatCurrency(pmt.amountPaid)}</td>
                        <td className="px-6 py-4 text-zinc-400">{showAmount ? formatCurrency(pmt.principalPaid || 0) : 'Protected'}</td>
                        <td className="px-6 py-4 text-zinc-400">{showRate ? formatCurrency(pmt.interestPaid || 0) : 'Protected'}</td>
                        <td className="px-6 py-4 font-semibold text-zinc-300">{showAmount ? formatCurrency(pmt.remainingPrincipal || 0) : 'Protected'}</td>
                        <td className="px-6 py-4">
                          <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            <CheckCircle2 className="w-3 h-3" /> Confirmed
                          </span>
                        </td>
                        <td className="px-6 py-4 text-zinc-500 italic max-w-xs truncate" title={pmt.notes}>
                          {pmt.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-12 text-center text-zinc-500 italic">
                {loan?.payments?.length === 0 ? 'No payment ledger receipts recorded.' : 'Payment ledger protected by owner.'}
              </div>
            )}
          </div>
        </div>

        {/* METADATA BANNER FOOTER */}
        <div className="border-t border-zinc-850/80 pt-6 flex flex-col sm:flex-row justify-between text-[10px] text-zinc-500 gap-2 font-medium tracking-wide">
          <span>SECURED LOAN STATEMENT REPORT BY EMI PROGRESS TRACKER</span>
          <span className="sm:text-right">DO NOT REPLICATE • VALID STATEMENT</span>
        </div>

      </div>

      {/* CUSTOM PRINT STYLES */}
      <style>{`
        @media print {
          body {
            background-color: white !important;
            color: #111827 !important;
          }
          #readonly_top_banner, #print_statement_btn, footer {
            display: none !important;
          }
          .bg-zinc-900, .bg-zinc-950, .bg-zinc-950\\/50 {
            background-color: #f9fafb !important;
            border-color: #e5e7eb !important;
          }
          .border-zinc-800, .border-zinc-850, .border-zinc-800\\/60 {
            border-color: #d1d5db !important;
          }
          .text-zinc-100, .text-zinc-300, .text-zinc-200 {
            color: #111827 !important;
          }
          .text-cyan-400, .text-cyan-500 {
            color: #0369a1 !important;
          }
          .text-emerald-400, .text-emerald-500 {
            color: #15803d !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
          }
          th, td {
            border-bottom: 1px solid #d1d5db !important;
            padding: 8px 12px !important;
          }
          .recharts-cartesian-grid-horizontal line,
          .recharts-cartesian-grid-vertical line {
            stroke: #e5e7eb !important;
          }
        }
      `}</style>

    </div>
  );
}
