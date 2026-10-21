import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Search,
  Filter,
  RefreshCw,
  Terminal,
  Calendar,
  User,
  ChevronDown,
  ChevronRight,
  Clock,
  Code,
  Loader2,
  FileText,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { AdminAuditLog } from '../../types';

export function SecurityLogs() {
  const [logs, setLogs] = useState<AdminAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedAction, setSelectedAction] = useState<string>('all');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  const fetchLogs = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('admin_audit_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;
      setLogs(data || []);
    } catch (err) {
      console.error('Error fetching admin audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((log) => {
      if (log.action) set.add(log.action);
    });
    return Array.from(set);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      const matchesSearch =
        (log.action?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (log.admin_email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (log.target_user_email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        JSON.stringify(log.details || {}).toLowerCase().includes(searchQuery.toLowerCase());

      const matchesAction = selectedAction === 'all' || log.action === selectedAction;

      return matchesSearch && matchesAction;
    });
  }, [logs, searchQuery, selectedAction]);

  const getActionBadge = (action: string) => {
    if (action.includes('BAN') || action.includes('REVOKE')) {
      return 'bg-rose-500/15 text-rose-400 border-rose-500/30';
    }
    if (action.includes('SUSPEND')) {
      return 'bg-amber-500/15 text-amber-400 border-amber-500/30';
    }
    if (action.includes('PROMOT') || action.includes('ADMIN') || action.includes('ROLE')) {
      return 'bg-violet-500/15 text-violet-300 border-violet-500/30';
    }
    if (action.includes('ALERT') || action.includes('MAINTENANCE')) {
      return 'bg-indigo-500/15 text-indigo-300 border-indigo-500/30';
    }
    if (action.includes('ACTIVE') || action.includes('ACTIVATE')) {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30';
    }
    return 'bg-zinc-800 text-zinc-300 border-zinc-700';
  };

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Shield className="w-5 h-5 text-violet-400" />
            Security & Audit Trail Stream
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Immutable, read-only event stream tracking all administrative actions, permission shifts, and security overrides.
          </p>
        </div>

        <button
          onClick={fetchLogs}
          disabled={loading}
          className="self-start sm:self-auto flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#14171A] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer shadow-sm disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Stream</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search audit trail by actor, target, action or payload..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121417] border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/60"
          />
        </div>

        <div className="flex items-center gap-2 bg-[#121417] border border-zinc-800 rounded-xl px-3 py-1.5">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-400">Action:</span>
          <select
            value={selectedAction}
            onChange={(e) => setSelectedAction(e.target.value)}
            className="bg-transparent text-xs text-white focus:outline-none cursor-pointer flex-1"
          >
            <option value="all" className="bg-[#121417] text-white">All Operations</option>
            {uniqueActions.map((act) => (
              <option key={act} value={act} className="bg-[#121417] text-zinc-300">
                {act}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Audit Log Stream Table */}
      <div className="bg-[#121417] border border-zinc-800/80 rounded-xl overflow-hidden shadow-2xl w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs text-zinc-300 border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-[#16191E]/60 text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
                <th className="py-3.5 px-4 w-10"></th>
                <th className="py-3.5 px-4">Timestamp (UTC)</th>
                <th className="py-3.5 px-4">Actor</th>
                <th className="py-3.5 px-4">Operation</th>
                <th className="py-3.5 px-4">Target User / Resource</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60 font-mono">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500 font-sans">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-violet-500" />
                    <span>Streaming audit ledger...</span>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500 font-sans">
                    <Terminal className="w-8 h-8 mx-auto mb-2 text-zinc-600" />
                    No security audit records match your query.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => {
                  const isExpanded = expandedLogId === log.id;
                  const dateStr = new Date(log.created_at).toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    timeZone: 'UTC',
                  });

                  return (
                    <React.Fragment key={log.id}>
                      <tr
                        onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                        className="hover:bg-zinc-800/30 transition-colors cursor-pointer group"
                      >
                        {/* Expand Icon */}
                        <td className="py-3.5 px-4 text-zinc-500 group-hover:text-zinc-300">
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 text-violet-400" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5" />
                          )}
                        </td>

                        {/* Timestamp */}
                        <td className="py-3.5 px-4 text-[11px] text-zinc-400 whitespace-nowrap">
                          {dateStr}
                        </td>

                        {/* Actor Email */}
                        <td className="py-3.5 px-4 text-white font-medium text-[11px]">
                          {log.admin_email || 'System / Auto Trigger'}
                        </td>

                        {/* Operation Tag */}
                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-semibold border ${getActionBadge(
                              log.action
                            )}`}
                          >
                            {log.action}
                          </span>
                        </td>

                        {/* Target User */}
                        <td className="py-3.5 px-4 text-zinc-300 text-[11px]">
                          {log.target_user_email ||
                            log.target_user_id ||
                            (log.details?.setting_key ? `Setting: ${log.details.setting_key}` : '—')}
                        </td>
                      </tr>

                      {/* Expandable JSON Detail Viewer */}
                      {isExpanded && (
                        <tr className="bg-[#0e1012] border-t border-zinc-800/40">
                          <td colSpan={5} className="p-4 pl-12 text-left">
                            <div className="bg-[#14161a] border border-zinc-800 rounded-lg p-3 text-[11px] font-mono text-zinc-300 space-y-2">
                              <div className="flex items-center justify-between text-zinc-500 pb-1 border-b border-zinc-800/60 font-sans text-[10px] uppercase tracking-wider">
                                <span>Audit Record Details</span>
                                <span>ID: {log.id}</span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                                <div>
                                  <span className="text-zinc-500">Admin ID:</span>{' '}
                                  <span className="text-zinc-300">{log.admin_id || 'null'}</span>
                                </div>
                                <div>
                                  <span className="text-zinc-500">Target ID:</span>{' '}
                                  <span className="text-zinc-300">{log.target_user_id || 'null'}</span>
                                </div>
                              </div>

                              <div className="pt-1">
                                <span className="text-zinc-500 block mb-1">Payload / State Diff:</span>
                                <pre className="bg-[#0B0D0E] p-2.5 rounded border border-zinc-800/80 text-violet-300 overflow-x-auto text-[10px]">
                                  {JSON.stringify(log.details || {}, null, 2)}
                                </pre>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Stream Summary Footer */}
        <div className="px-4 py-3 bg-[#101215] border-t border-zinc-800/80 text-[11px] text-zinc-400 flex items-center justify-between font-sans">
          <span>Showing {filteredLogs.length} audit trail records</span>
          <span>Cryptographically signed • Read-only append pipeline</span>
        </div>
      </div>
    </div>
  );
}
