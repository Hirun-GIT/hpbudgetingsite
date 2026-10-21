import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  SlidersHorizontal,
  Save,
  Radio,
  CheckCircle2,
  Bell,
  RefreshCw,
  Info,
  Power,
  ShieldCheck,
  AlertTriangle,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { ActiveAlertConfig, MaintenanceModeConfig } from '../../types';

export function PlatformSettings() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [, setSettingIds] = useState<Record<string, string>>({});

  // Maintenance Mode config
  const [maintenanceMode, setMaintenanceMode] = useState<boolean>(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>(
    'The system is currently undergoing scheduled maintenance. Please check back shortly.'
  );

  // Active Alerts broadcast configuration
  const [alertConfig, setAlertConfig] = useState<ActiveAlertConfig>({
    enabled: false,
    active: false,
    message: '',
    level: 'info',
  });

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('platform_settings').select('*');

      if (error) throw error;

      const ids: Record<string, string> = {};
      (data || []).forEach((row) => {
        if (row.key) {
          ids[row.key] = row.id;
        }

        if (row.key === 'maintenance_mode') {
          const val = row.value || {};
          setMaintenanceMode(Boolean(val.enabled));
          if (val.message) setMaintenanceMessage(val.message);
        } else if (row.key === 'active_alert') {
          const val = row.value || {};
          const isEnabled = Boolean(val.enabled ?? val.active);
          setAlertConfig({
            enabled: isEnabled,
            active: isEnabled,
            message: val.message || '',
            level: val.level || 'info',
          });
        }
      });
      setSettingIds(ids);
    } catch (err: any) {
      console.error('Error fetching platform settings:', err);
      showNotification('error', `Failed to load settings: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const logAudit = async (action: string, details: any) => {
    try {
      await supabase.from('admin_audit_logs').insert({
        admin_id: user?.id,
        admin_email: user?.email,
        action,
        details,
      });
    } catch (err) {
      console.warn('Failed to insert audit log:', err);
    }
  };

  // Safe setting update helper avoiding duplicate key constraint violation on 'key'
  const persistSetting = async (key: string, payload: any, description: string) => {
    // 1. Attempt update first (avoids duplicate key constraint on existing rows)
    const { data: updatedRows, error: updateError } = await supabase
      .from('platform_settings')
      .update({
        value: payload,
        description,
        updated_at: new Date().toISOString(),
        updated_by: user?.id,
      })
      .eq('key', key)
      .select();

    if (updateError) {
      throw updateError;
    }

    // 2. If row did not exist yet, insert with explicit onConflict: 'key'
    if (!updatedRows || updatedRows.length === 0) {
      const { error: upsertError } = await supabase
        .from('platform_settings')
        .upsert(
          {
            key,
            value: payload,
            description,
            updated_at: new Date().toISOString(),
            updated_by: user?.id,
          },
          { onConflict: 'key' }
        );

      if (upsertError) throw upsertError;
    }
  };

  // Save Maintenance Mode
  const handleSaveMaintenance = async (newEnabledState: boolean) => {
    setSavingKey('maintenance_mode');
    try {
      const payload: MaintenanceModeConfig = {
        enabled: newEnabledState,
        message:
          maintenanceMessage.trim() ||
          'The system is currently undergoing scheduled maintenance. Please check back shortly.',
      };

      await persistSetting('maintenance_mode', payload, 'Global application maintenance mode gating');

      setMaintenanceMode(newEnabledState);
      await logAudit('SET_MAINTENANCE', payload);
      showNotification(
        'success',
        `Maintenance mode ${newEnabledState ? 'ENGAGED (User dashboard locked)' : 'DISABLED (Operational)'}.`
      );
    } catch (err: any) {
      console.error('Error saving maintenance mode:', err);
      showNotification('error', `Failed to save: ${err.message}`);
    } finally {
      setSavingKey(null);
    }
  };

  // Broadcast Active Alert Banner
  const handleSaveBroadcastAlert = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSavingKey('active_alert');
    try {
      const isEnabled = Boolean(alertConfig.enabled || alertConfig.active);
      const payload = {
        enabled: isEnabled,
        active: isEnabled,
        message: alertConfig.message.trim(),
        level: alertConfig.level,
      };

      await persistSetting(
        'active_alert',
        payload,
        'Broadcast banner alert displayed to all application users'
      );

      await logAudit('BROADCAST_ALERT', payload);
      showNotification(
        'success',
        payload.enabled
          ? 'Active Alert successfully broadcast to all user dashboards!'
          : 'Broadcast banner turned OFF.'
      );
    } catch (err: any) {
      console.error('Error saving alert banner:', err);
      showNotification('error', `Failed to broadcast alert: ${err.message}`);
    } finally {
      setSavingKey(null);
    }
  };

  const isAlertActive = Boolean(alertConfig.enabled || alertConfig.active);

  return (
    <div className="space-y-6 w-full">
      {/* Toast Notification */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={`p-3.5 rounded-xl border text-xs font-medium flex items-center justify-between ${
              notification.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800 text-emerald-200'
                : 'bg-rose-950/40 border-rose-800 text-rose-200'
            }`}
          >
            <span>{notification.message}</span>
            <button onClick={() => setNotification(null)} className="text-zinc-400 hover:text-white ml-2">
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-violet-400" />
            Platform Settings & Governance
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Configure emergency maintenance gating, live system announcements, and real-time banner broadcasts.
          </p>
        </div>

        <button
          onClick={fetchSettings}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#14171A] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Reload Settings</span>
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        {/* Left Column: Maintenance Mode Switch */}
        <div className="space-y-6">
          <div className="bg-[#121417] border border-zinc-800/80 rounded-xl p-5 shadow-xl space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-2.5 rounded-xl border ${
                    maintenanceMode
                      ? 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                      : 'bg-zinc-800/40 text-zinc-400 border-zinc-700/40'
                  }`}
                >
                  <Power className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    Maintenance Mode
                    {maintenanceMode && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-rose-950/70 text-rose-300 border border-rose-800/60 uppercase">
                        ACTIVE
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                    Instantly gate all non-admin user routes while retaining full admin console availability.
                  </p>
                </div>
              </div>

              {/* Modern Switch button */}
              <button
                type="button"
                disabled={savingKey === 'maintenance_mode'}
                onClick={() => handleSaveMaintenance(!maintenanceMode)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  maintenanceMode ? 'bg-rose-600' : 'bg-zinc-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    maintenanceMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Custom Maintenance Message */}
            <div className="space-y-2 pt-3 border-t border-zinc-800/80">
              <label className="text-[11px] font-medium text-zinc-400 uppercase tracking-wider">
                Maintenance Display Notice
              </label>
              <textarea
                rows={3}
                value={maintenanceMessage}
                onChange={(e) => setMaintenanceMessage(e.target.value)}
                placeholder="Message displayed to users on the maintenance lockdown screen..."
                className="w-full bg-[#16191E] border border-zinc-800 rounded-lg p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/60 leading-relaxed"
              />

              <div className="flex items-center justify-between pt-1">
                <span className="text-[11px] text-zinc-400">
                  Status:{' '}
                  <strong className={maintenanceMode ? 'text-rose-400' : 'text-emerald-400'}>
                    {maintenanceMode ? 'Users Redirected to Maintenance Gate' : 'System Fully Operational'}
                  </strong>
                </span>

                <button
                  type="button"
                  onClick={() => handleSaveMaintenance(maintenanceMode)}
                  disabled={savingKey === 'maintenance_mode'}
                  className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-xs font-medium text-white transition-colors cursor-pointer disabled:opacity-50"
                >
                  Save Notice Text
                </button>
              </div>
            </div>

            {/* Admin Bypass Guarantee */}
            <div className="p-3 rounded-lg bg-violet-950/20 border border-violet-800/30 flex items-start gap-2.5">
              <ShieldCheck className="w-4 h-4 text-violet-400 mt-0.5 shrink-0" />
              <div className="text-[11px] text-violet-300/90 leading-relaxed">
                <strong>Admin Bypass Guarantee:</strong> Administrators retain unrestricted access to all{' '}
                <code className="text-violet-200 bg-violet-950/80 px-1 py-0.5 rounded font-mono">/admin/*</code>{' '}
                routes even when maintenance mode is engaged.
              </div>
            </div>
          </div>
        </div>

        {/* Right Column: Active Alert Broadcast Banner */}
        <div className="bg-[#121417] border border-zinc-800/80 rounded-xl p-5 shadow-xl flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-zinc-800/80 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  <Bell className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-white">Active Alert Broadcast Banner</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">
                    Real-time broadcast banner displayed across the client dashboard.
                  </p>
                </div>
              </div>

              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                  isAlertActive
                    ? 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30'
                    : 'bg-zinc-800 text-zinc-400 border-zinc-700'
                }`}
              >
                {isAlertActive ? 'BROADCASTING' : 'OFF AIR'}
              </span>
            </div>

            <form onSubmit={handleSaveBroadcastAlert} className="space-y-4">
              {/* Alert Toggle */}
              <div className="flex items-center justify-between p-3 rounded-lg bg-[#16191E] border border-zinc-800/60">
                <div className="flex items-center gap-2">
                  <Radio
                    className={`w-4 h-4 ${
                      isAlertActive ? 'text-indigo-400 animate-pulse' : 'text-zinc-500'
                    }`}
                  />
                  <span className="text-xs font-medium text-white">Broadcast Banner Active</span>
                </div>
                <input
                  type="checkbox"
                  checked={isAlertActive}
                  onChange={(e) =>
                    setAlertConfig((prev) => ({
                      ...prev,
                      enabled: e.target.checked,
                      active: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 text-violet-600 rounded bg-zinc-800 border-zinc-700 cursor-pointer"
                />
              </div>

              {/* Alert Level Select */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Alert Level / Severity</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['info', 'warning', 'critical'] as const).map((level) => (
                    <button
                      type="button"
                      key={level}
                      onClick={() => setAlertConfig((prev) => ({ ...prev, level }))}
                      className={`py-2 px-3 rounded-lg border text-xs font-semibold capitalize transition-all cursor-pointer ${
                        alertConfig.level === level
                          ? level === 'info'
                            ? 'bg-sky-500/20 border-sky-500/50 text-sky-300'
                            : level === 'warning'
                            ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
                            : 'bg-rose-500/20 border-rose-500/50 text-rose-300'
                          : 'bg-[#16191E] border-zinc-800 text-zinc-400 hover:text-zinc-200'
                      }`}
                    >
                      {level}
                    </button>
                  ))}
                </div>
              </div>

              {/* Alert Message Textarea */}
              <div className="space-y-1.5">
                <label className="text-xs text-zinc-400 font-medium">Alert Banner Message</label>
                <textarea
                  rows={3}
                  value={alertConfig.message}
                  onChange={(e) => setAlertConfig((prev) => ({ ...prev, message: e.target.value }))}
                  placeholder="e.g. Scheduled maintenance this Saturday at 03:00 UTC. Your data is secure."
                  className="w-full bg-[#16191E] border border-zinc-800 rounded-lg p-3 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/60 leading-relaxed"
                />
              </div>

              {/* Live Preview Box */}
              {alertConfig.message && (
                <div className="space-y-1">
                  <div className="text-[10px] uppercase font-mono text-zinc-500">Live Client Preview</div>
                  <div
                    className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2.5 ${
                      alertConfig.level === 'critical'
                        ? 'bg-rose-950/40 border-rose-800 text-rose-200'
                        : alertConfig.level === 'warning'
                        ? 'bg-amber-950/40 border-amber-800 text-amber-200'
                        : 'bg-sky-950/40 border-sky-800 text-sky-200'
                    }`}
                  >
                    {alertConfig.level === 'critical' ? (
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
                    ) : alertConfig.level === 'warning' ? (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400" />
                    ) : (
                      <Info className="w-4 h-4 shrink-0 text-sky-400" />
                    )}
                    <span>{alertConfig.message}</span>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={savingKey === 'active_alert'}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-medium text-xs shadow-lg shadow-violet-500/10 cursor-pointer transition-all disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>
                  {savingKey === 'active_alert' ? 'Updating Database...' : 'Save & Propagate Broadcast Alert'}
                </span>
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
