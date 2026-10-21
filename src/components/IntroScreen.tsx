import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

interface IntroScreenProps {
  onComplete: () => void;
}

export function IntroScreen({ onComplete }: IntroScreenProps) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const duration = 2600; // 2.6 seconds animation
    const startTime = Date.now();
    const interval = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const pct = Math.min((elapsed / duration) * 100, 100);
      setProgress(pct);

      if (elapsed >= duration) {
        clearInterval(interval);
        onComplete();
      }
    }, 25);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
        clearInterval(interval);
        onComplete();
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearInterval(interval);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [onComplete]);

  return (
    <motion.div
      initial={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.98, filter: 'blur(6px)' }}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black text-white px-6 select-none"
    >
      {/* Background ambient glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-zinc-800/20 blur-[120px] rounded-full pointer-events-none" />

      {/* Skip button */}
      <motion.button
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.6, duration: 0.3 }}
        onClick={onComplete}
        className="absolute top-6 right-6 flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-white bg-zinc-900/60 hover:bg-zinc-800 border border-zinc-800 rounded-full cursor-pointer transition-colors backdrop-blur-sm"
      >
        <span>Skip</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </motion.button>

      {/* Brand Monogram Badge */}
      <motion.div
        initial={{ scale: 0.7, opacity: 0, y: 12 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="w-14 h-14 rounded-2xl bg-white text-black flex items-center justify-center font-bold text-xl tracking-wider mb-6 shadow-2xl relative overflow-hidden"
      >
        <span className="relative z-10">HP</span>
      </motion.div>

      {/* Brand Title */}
      <motion.h1
        initial={{ opacity: 0, filter: 'blur(8px)', y: 15 }}
        animate={{ opacity: 1, filter: 'blur(0px)', y: 0 }}
        transition={{ duration: 0.7, delay: 0.25, ease: 'easeOut' }}
        className="text-3xl sm:text-4xl font-semibold tracking-tight text-white mb-2"
      >
        HP Budgeting
      </motion.h1>

      {/* Subtitle */}
      <motion.p
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.45, ease: 'easeOut' }}
        className="text-zinc-400 text-xs sm:text-sm tracking-wide font-normal mb-8 max-w-xs text-center"
      >
        Personal Finance &amp; Lending Ledger
      </motion.p>

      {/* Progress Bar */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="w-48 sm:w-56 h-1 bg-zinc-900 rounded-full overflow-hidden border border-zinc-800"
      >
        <div
          className="h-full bg-white transition-all duration-75 ease-out rounded-full shadow-[0_0_8px_rgba(255,255,255,0.7)]"
          style={{ width: `${progress}%` }}
        />
      </motion.div>
    </motion.div>
  );
}