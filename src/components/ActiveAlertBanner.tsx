import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Info, AlertTriangle, AlertCircle, X, Bell } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { ActiveAlertConfig } from '../types';

export function ActiveAlertBanner() {
  const [alert, setAlert] = useState<ActiveAlertConfig | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchAlert = async () => {
      try {
        const { data, error } = await supabase
          .from('platform_settings')
          .select('value')
          .eq('key', 'active_alert')
          .maybeSingle();

        if (error) return;

        if (isMounted && data?.value) {
          const val = data.value as any;
          const isEnabled = Boolean(val.enabled ?? val.active);
          if (isEnabled && val.message) {
            setAlert({
              enabled: true,
              active: true,
              message: val.message,
              level: val.level || 'info',
            });
          } else {
            setAlert(null);
          }
        }
      } catch {
        // Silent catch
      }
    };

    fetchAlert();

    // Listen to live changes on platform_settings via Supabase Realtime
    const channel = supabase
      .channel('public:platform_settings:active_alert')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'platform_settings',
          filter: 'key=eq.active_alert',
        },
        (payload) => {
          if (payload.new && (payload.new as any).value) {
            const val = (payload.new as any).value as any;
            const isEnabled = Boolean(val.enabled ?? val.active);
            if (isEnabled && val.message) {
              setAlert({
                enabled: true,
                active: true,
                message: val.message,
                level: val.level || 'info',
              });
              setDismissed(false);
            } else {
              setAlert(null);
            }
          }
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, []);

  const isEnabled = Boolean(alert?.enabled || alert?.active);
  if (!alert || !isEnabled || !alert.message || dismissed) {
    return null;
  }

  const isCritical = alert.level === 'critical';
  const isWarning = alert.level === 'warning';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className={`w-full py-2.5 px-6 lg:px-12 text-xs font-medium border-b flex items-center justify-between z-50 transition-colors ${
          isCritical
            ? 'bg-rose-950/80 border-rose-800 text-rose-200'
            : isWarning
            ? 'bg-amber-950/80 border-amber-800 text-amber-200'
            : 'bg-sky-950/80 border-sky-800 text-sky-200'
        }`}
      >
        <div className="w-full flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {isCritical ? (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : isWarning ? (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span className="font-semibold uppercase tracking-wider text-[10px] px-1.5 py-0.5 rounded bg-black/25">
              {alert.level || 'ANNOUNCEMENT'}
            </span>
            <span className="leading-snug">{alert.message}</span>
          </div>

          <button
            onClick={() => setDismissed(true)}
            className="p-1 rounded-md hover:bg-white/10 transition-colors text-current shrink-0 cursor-pointer"
            title="Dismiss notice"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
