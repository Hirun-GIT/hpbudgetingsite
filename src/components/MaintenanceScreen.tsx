import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Wrench, RefreshCw, ShieldCheck, Clock, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type MaintenanceScreenProps = {
  customMessage?: string;
  onRefresh?: () => void;
};

export function MaintenanceScreen({ customMessage, onRefresh }: MaintenanceScreenProps) {
  const { session, signOut } = useAuth();
  const [countdown, setCountdown] = useState<number>(30);
  const [checking, setChecking] = useState<boolean>(false);

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          if (onRefresh) onRefresh();
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [onRefresh]);

  const handleManualCheck = async () => {
    setChecking(true);
    if (onRefresh) {
      await onRefresh();
    } else {
      window.location.reload();
    }
    setTimeout(() => {
      setChecking(false);
      setCountdown(30);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#0B0D0E] text-white flex items-center justify-center p-6 selection:bg-violet-500/20 selection:text-violet-300">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-lg bg-[#121417] border border-zinc-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden"
      >
        {/* Glow ambient accent */}
        <div className="absolute -top-24 -left-24 w-48 h-48 bg-violet-600/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-24 -right-24 w-48 h-48 bg-rose-600/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Top Wrench Icon */}
          <div className="w-16 h-16 rounded-2xl bg-violet-950/40 border border-violet-800/50 flex items-center justify-center mb-6 text-violet-300 shadow-inner">
            <Wrench className="w-8 h-8 animate-pulse" />
          </div>

          {/* Status Badge */}
          <span className="text-[11px] font-semibold tracking-wider uppercase px-3.5 py-1 rounded-full bg-violet-950/50 border border-violet-800/40 text-violet-300 mb-4 inline-flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-violet-400 animate-ping" />
            <span>Scheduled Maintenance</span>
          </span>

          {/* Title */}
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white mb-3">
            System Under Maintenance
          </h1>

          {/* Subtitle */}
          <p className="text-zinc-400 text-sm leading-relaxed mb-6 max-w-md">
            {customMessage ||
              'We are currently performing essential infrastructure upgrades. All financial ledgers remain secure. Please check back shortly.'}
          </p>

          {/* Security Guarantee Box */}
          <div className="w-full p-4 rounded-xl bg-[#16181C] border border-zinc-800 mb-6 text-left flex items-start gap-3">
            <ShieldCheck className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-zinc-200">Zero Data Exposure</div>
              <div className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                All ledger databases, encryption keys, and cryptographic integrity verifications remain fully protected.
              </div>
            </div>
          </div>

          {/* Live countdown & refresh action */}
          <div className="w-full flex flex-col sm:flex-row items-center gap-3">
            <button
              onClick={handleManualCheck}
              disabled={checking}
              className="w-full flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-violet-400 cursor-pointer shadow-lg shadow-violet-900/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${checking ? 'animate-spin' : ''}`} />
              <span>{checking ? 'Checking Status...' : 'Check System Status'}</span>
            </button>

            {session && (
              <button
                onClick={() => signOut()}
                className="w-full sm:w-auto px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white text-sm font-medium transition-all flex items-center justify-center gap-2 cursor-pointer"
                title="Sign out of your session"
              >
                <LogOut className="w-4 h-4 text-zinc-400" />
                <span>Sign Out</span>
              </button>
            )}
          </div>

          {/* Auto refresh timer indicator */}
          <div className="mt-4 flex items-center gap-1.5 text-xs text-zinc-500 font-mono">
            <Clock className="w-3.5 h-3.5 text-zinc-500" />
            <span>Auto-refreshing in {countdown}s</span>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
