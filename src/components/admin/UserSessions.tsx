import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Activity,
  Radio,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Laptop,
  Smartphone,
  Globe,
  Loader2,
  Mail,
  ShieldCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { UserSession } from '../../types';

function parseBrowserAndOS(userAgent?: string | null): { browser: string; os: string; isMobile: boolean } {
  if (!userAgent) return { browser: 'Unknown Browser', os: 'Unknown OS', isMobile: false };

  let os = 'Unknown OS';
  if (/windows/i.test(userAgent)) os = 'Windows';
  else if (/macintosh|mac os x/i.test(userAgent)) os = 'macOS';
  else if (/android/i.test(userAgent)) os = 'Android';
  else if (/iphone|ipad|ipod/i.test(userAgent)) os = 'iOS';
  else if (/linux/i.test(userAgent)) os = 'Linux';

  let browser = 'Browser';
  if (/edg/i.test(userAgent)) browser = 'Edge';
  else if (/chrome|crios/i.test(userAgent)) browser = 'Chrome';
  else if (/firefox|fxios/i.test(userAgent)) browser = 'Firefox';
  else if (/safari/i.test(userAgent)) browser = 'Safari';
  else if (/opera|opr/i.test(userAgent)) browser = 'Opera';

  const isMobile = /mobile|iphone|android/i.test(userAgent);
  return { browser, os, isMobile };
}

function formatRelativeTime(dateString?: string | null): string {
  if (!dateString) return 'Never';
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 45) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} min${diffMin > 1 ? 's' : ''} ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

export function UserSessions() {
  const [sessions, setSessions] = useState<UserSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all');

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('user_sessions')
        .select('*')
        .order('last_seen_at', { ascending: false });

      if (error) throw error;
      setSessions(data || []);
    } catch (err) {
      console.error('Error fetching user sessions:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // Filter sessions
  const filteredSessions = useMemo(() => {
    const threeMinutesAgo = Date.now() - 3 * 60 * 1000;

    return sessions.filter((s) => {
      const matchesSearch =
        (s.email?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (s.ip_address || '').includes(searchQuery) ||
        (s.user_agent?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      const isActuallyOnline =
        s.is_online && new Date(s.last_seen_at).getTime() >= threeMinutesAgo;

      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'online' && isActuallyOnline) ||
        (statusFilter === 'offline' && !isActuallyOnline);

      return matchesSearch && matchesStatus;
    });
  }, [sessions, searchQuery, statusFilter]);

  const onlineCount = useMemo(() => {
    const threeMinutesAgo = Date.now() - 3 * 60 * 1000;
    return sessions.filter(
      (s) => s.is_online && new Date(s.last_seen_at).getTime() >= threeMinutesAgo
    ).length;
  }, [sessions]);

  return (
    <div className="space-y-6 w-full">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Radio className="w-5 h-5 text-emerald-400" />
            User Activity & Session Telemetry
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Monitor real-time presence heartbeats, device signatures, and active login governance.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={fetchSessions}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#14171A] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Sessions</span>
          </button>
        </div>
      </div>

      {/* Quick Session Counter Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-[#121417] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-400 font-medium">Online Right Now</div>
            <div className="text-2xl font-bold text-white mt-1 flex items-center gap-2">
              <span>{loading ? '—' : onlineCount}</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            </div>
          </div>
          <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Radio className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121417] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-400 font-medium">Logged Sessions</div>
            <div className="text-2xl font-bold text-white mt-1">{loading ? '—' : sessions.length}</div>
          </div>
          <div className="p-2.5 rounded-lg bg-violet-500/10 border border-violet-500/20 text-violet-400">
            <Activity className="w-5 h-5" />
          </div>
        </div>

        <div className="bg-[#121417] border border-zinc-800 rounded-xl p-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-zinc-400 font-medium">Heartbeat Interval</div>
            <div className="text-xl font-bold text-white mt-1">60 Seconds</div>
          </div>
          <div className="p-2.5 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Clock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="relative sm:col-span-2">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search session by email, IP address, or client platform..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121417] border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/60 transition-colors"
          />
        </div>

        <div className="flex items-center gap-2 bg-[#121417] border border-zinc-800 rounded-xl px-3 py-1.5">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-400">State:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-transparent text-xs text-white focus:outline-none cursor-pointer flex-1"
          >
            <option value="all" className="bg-[#121417] text-white">All Sessions</option>
            <option value="online" className="bg-[#121417] text-emerald-300">Active / Online</option>
            <option value="offline" className="bg-[#121417] text-zinc-400">Inactive / Offline</option>
          </select>
        </div>
      </div>

      {/* Sessions Data Table */}
      <div className="bg-[#121417] border border-zinc-800/80 rounded-xl overflow-hidden shadow-xl w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs text-zinc-300 border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-[#16191E]/60 text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
                <th className="py-3.5 px-4">User Identifier</th>
                <th className="py-3.5 px-4">Presence Status</th>
                <th className="py-3.5 px-4">Last Active</th>
                <th className="py-3.5 px-4">Session Login Time</th>
                <th className="py-3.5 px-4">Client Platform / Metadata</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-violet-500" />
                    <span>Streaming session telemetry...</span>
                  </td>
                </tr>
              ) : filteredSessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-zinc-500">
                    No active sessions matched current filters.
                  </td>
                </tr>
              ) : (
                filteredSessions.map((s) => {
                  const threeMinutesAgo = Date.now() - 3 * 60 * 1000;
                  const isOnline =
                    s.is_online && new Date(s.last_seen_at).getTime() >= threeMinutesAgo;
                  const device = parseBrowserAndOS(s.user_agent);

                  return (
                    <tr key={s.id} className="hover:bg-zinc-800/30 transition-colors">
                      {/* User Identifier */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-300 font-semibold text-xs shrink-0">
                            {(s.email || 'U')[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-white flex items-center gap-1.5 font-mono">
                              <Mail className="w-3 h-3 text-zinc-500" />
                              {s.email}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              ID: {s.user_id.slice(0, 8)}...
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Online Status */}
                      <td className="py-3.5 px-4">
                        {isOnline ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                            <span>Online Now</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-800 text-zinc-400 border border-zinc-700/60">
                            <span className="w-1.5 h-1.5 rounded-full bg-zinc-500" />
                            <span>Offline</span>
                          </span>
                        )}
                      </td>

                      {/* Last Active Timestamp */}
                      <td className="py-3.5 px-4">
                        <div className="flex flex-col font-mono text-[11px]">
                          <span className="text-zinc-200 font-medium">
                            {formatRelativeTime(s.last_seen_at)}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {new Date(s.last_seen_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </td>

                      {/* Session Login Time */}
                      <td className="py-3.5 px-4 text-zinc-400 text-[11px] font-mono">
                        <div>{new Date(s.logged_in_at).toLocaleDateString()}</div>
                        <div className="text-[10px] text-zinc-500">
                          {new Date(s.logged_in_at).toLocaleTimeString()}
                        </div>
                      </td>

                      {/* Client Platform / Browser Metadata */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-2">
                          <div className="p-1.5 rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700/60">
                            {device.isMobile ? (
                              <Smartphone className="w-3.5 h-3.5" />
                            ) : (
                              <Laptop className="w-3.5 h-3.5" />
                            )}
                          </div>
                          <div className="flex flex-col">
                            <span className="text-xs text-white font-medium">
                              {device.browser} on {device.os}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {s.ip_address ? `IP: ${s.ip_address}` : 'Client Web App'}
                            </span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-3 bg-[#101215] border-t border-zinc-800/80 text-[11px] text-zinc-400 flex items-center justify-between">
          <span>Displaying {filteredSessions.length} session logs</span>
          <span>Automatic 3-minute idle expiration</span>
        </div>
      </div>
    </div>
  );
}
