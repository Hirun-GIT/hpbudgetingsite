import React from 'react';
import { motion } from 'framer-motion';
import { ShieldAlert, LogOut, Ban, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

type SuspendedScreenProps = {
  status?: 'suspended' | 'banned';
  onBackToLogin: () => void;
};

export function SuspendedScreen({ status = 'suspended', onBackToLogin }: SuspendedScreenProps) {
  const { clearBlockedState, signOut, blockedStatus } = useAuth();
  const effectiveStatus = blockedStatus || status;
  const isBanned = effectiveStatus === 'banned';

  const handleSignOut = async () => {
    await signOut();
    clearBlockedState();
    onBackToLogin();
  };

  return (
    <div className="min-h-screen bg-[#0B0D0E] text-white flex items-center justify-center p-6 selection:bg-rose-500/20 selection:text-rose-300">
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.35, ease: 'easeOut' }}
        className="w-full max-w-md bg-[#121417] border border-zinc-800 rounded-2xl p-8 shadow-2xl relative overflow-hidden"
      >
        {/* Glow ambient accent */}
        <div
          className={`absolute -top-24 -left-24 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
            isBanned ? 'bg-rose-600/15' : 'bg-amber-600/15'
          }`}
        />
        <div
          className={`absolute -bottom-24 -right-24 w-48 h-48 rounded-full blur-3xl pointer-events-none ${
            isBanned ? 'bg-red-800/15' : 'bg-amber-800/15'
          }`}
        />

        <div className="relative z-10 flex flex-col items-center text-center">
          {/* Icon badge */}
          <div
            className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-inner border ${
              isBanned
                ? 'bg-rose-500/10 border-rose-500/25 text-rose-400'
                : 'bg-amber-500/10 border-amber-500/25 text-amber-400'
            }`}
          >
            {isBanned ? <Ban className="w-8 h-8" /> : <ShieldAlert className="w-8 h-8" />}
          </div>

          {/* Status Pill */}
          <span
            className={`text-[11px] font-semibold tracking-wider uppercase px-3 py-1 rounded-full mb-3 border ${
              isBanned
                ? 'bg-rose-950/60 border-rose-800/50 text-rose-300'
                : 'bg-amber-950/60 border-amber-800/50 text-amber-300'
            }`}
          >
            {isBanned ? 'Permanent Access Revocation' : 'Temporary Suspension'}
          </span>

          {/* Heading */}
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            {isBanned ? 'Access Revoked' : 'Account Suspended'}
          </h1>

          {/* Exact required notice copy */}
          <p className="text-zinc-300 text-sm leading-relaxed mb-6">
            {isBanned
              ? 'Dear User, your access to HP Budgeting has been permanently revoked due to a violation of platform policies.'
              : 'Dear User, your account has been temporarily suspended by an administrator. For inquiries or appeals, please contact security support.'}
          </p>

          {/* Support / security contact block */}
          <div className="w-full p-4 rounded-xl bg-[#16181C] border border-zinc-800/80 mb-6 text-left flex items-start gap-3">
            <Mail className="w-4 h-4 text-zinc-400 mt-0.5 shrink-0" />
            <div className="text-xs text-zinc-400 leading-relaxed">
              For verification questions or official appeals:{' '}
              <a
                href="mailto:security@hpbudgeting.com"
                className="text-violet-400 hover:text-violet-300 underline font-medium"
              >
                security@hpbudgeting.com
              </a>
            </div>
          </div>

          {/* Single clean Sign Out action button */}
          <button
            onClick={handleSignOut}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium text-sm transition-all focus:outline-none focus:ring-2 focus:ring-zinc-600 cursor-pointer shadow-lg"
          >
            <LogOut className="w-4 h-4 text-zinc-400" />
            <span>Sign Out</span>
          </button>
        </div>
      </motion.div>
    </div>
  );
}
