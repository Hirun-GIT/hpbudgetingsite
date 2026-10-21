import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users,
  Search,
  Filter,
  MoreVertical,
  Shield,
  Ban,
  CheckCircle,
  RefreshCw,
  AlertTriangle,
  UserCheck,
  Loader2,
  Mail,
  UserX,
  X,
  ShieldAlert,
  CheckSquare,
  Square,
  MinusSquare,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { UserProfile, AppRole, UserStatus } from '../../types';
import { emitUserStatusChange } from '../../lib/realtimeGovernance';

export function UserManagement() {
  const { user: currentAdminUser } = useAuth();
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended' | 'banned'>('all');
  const [activeDropdownId, setActiveDropdownId] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Batch Multi-Select state
  const [selectedUserIds, setSelectedUserIds] = useState<Set<string>>(new Set());
  const [batchActionInProgress, setBatchActionInProgress] = useState<boolean>(false);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setNotification({ type, message });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 4500);
  };

  const fetchProfiles = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }
      
      const mapped: UserProfile[] = (data || []).map((p: any) => ({
        ...p,
        status: p.status || (p.is_suspended ? 'suspended' : 'active'),
      }));
      setProfiles(mapped);
    } catch (err: any) {
      console.error('Error fetching profiles:', err);
      showNotification('error', `Failed to load users: ${err.message || 'Database error'}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProfiles();
  }, []);

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    return profiles.filter((p) => {
      const matchesSearch =
        (p.full_name?.toLowerCase() || '').includes(searchQuery.toLowerCase()) ||
        (p.email?.toLowerCase() || '').includes(searchQuery.toLowerCase());

      const matchesRole = roleFilter === 'all' || p.role === roleFilter;

      const pStatus: UserStatus = p.status || (p.is_suspended ? 'suspended' : 'active');
      const matchesStatus =
        statusFilter === 'all' || pStatus === statusFilter;

      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [profiles, searchQuery, roleFilter, statusFilter]);

  // Master Checkbox calculations
  const allFilteredSelected =
    filteredProfiles.length > 0 &&
    filteredProfiles.every((p) => selectedUserIds.has(p.id));

  const someFilteredSelected =
    filteredProfiles.some((p) => selectedUserIds.has(p.id)) && !allFilteredSelected;

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedUserIds(new Set());
    } else {
      const newSet = new Set(selectedUserIds);
      filteredProfiles.forEach((p) => newSet.add(p.id));
      setSelectedUserIds(newSet);
    }
  };

  const toggleSelectRow = (userId: string) => {
    const next = new Set(selectedUserIds);
    if (next.has(userId)) {
      next.delete(userId);
    } else {
      next.add(userId);
    }
    setSelectedUserIds(next);
  };

  const clearSelection = () => {
    setSelectedUserIds(new Set());
  };

  // Log action into admin_audit_logs
  const logAudit = async (action: string, targetUserId?: string | null, targetEmail?: string | null, details: any = {}) => {
    try {
      await supabase.from('admin_audit_logs').insert({
        admin_id: currentAdminUser?.id,
        admin_email: currentAdminUser?.email,
        action,
        target_user_id: targetUserId,
        target_user_email: targetEmail,
        details,
      });
    } catch (err) {
      console.warn('Failed to record audit log:', err);
    }
  };

  // Set user status (active | suspended | banned)
  const handleSetUserStatus = async (targetUser: UserProfile, newStatus: UserStatus) => {
    if (targetUser.id === currentAdminUser?.id && (newStatus === 'suspended' || newStatus === 'banned')) {
      showNotification('error', 'You cannot suspend or ban your own administrative account.');
      return;
    }

    setActionInProgress(targetUser.id);
    setActiveDropdownId(null);

    const isSuspendedFlag = newStatus === 'suspended' || newStatus === 'banned';

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          status: newStatus,
          is_suspended: isSuspendedFlag,
          updated_at: new Date().toISOString(),
        })
        .eq('id', targetUser.id);

      if (error) throw error;

      // Broadcast instant sub-second event so target user's active session locks immediately
      emitUserStatusChange([targetUser.id], newStatus);

      await logAudit(`USER_STATUS_${newStatus.toUpperCase()}`, targetUser.id, targetUser.email, {
        previous_status: targetUser.status,
        new_status: newStatus,
      });

      setProfiles((prev) =>
        prev.map((p) =>
          p.id === targetUser.id
            ? { ...p, status: newStatus, is_suspended: isSuspendedFlag }
            : p
        )
      );

      showNotification('success', `User ${targetUser.email} status set to ${newStatus.toUpperCase()}.`);
    } catch (err: any) {
      console.error('Failed to update status:', err);
      showNotification('error', `Failed to update user status: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // Toggle admin promotion / demotion
  const handleToggleRole = async (targetUser: UserProfile) => {
    const newRole: AppRole = targetUser.role === 'admin' ? 'user' : 'admin';

    if (targetUser.id === currentAdminUser?.id && newRole === 'user') {
      showNotification('error', 'You cannot revoke your own administrator privileges.');
      return;
    }

    setActionInProgress(targetUser.id);
    setActiveDropdownId(null);

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', targetUser.id);

      if (error) throw error;

      await logAudit(
        newRole === 'admin' ? 'USER_PROMOTED_ADMIN' : 'USER_DEMOTED_USER',
        targetUser.id,
        targetUser.email,
        { previous_role: targetUser.role, new_role: newRole }
      );

      setProfiles((prev) =>
        prev.map((p) => (p.id === targetUser.id ? { ...p, role: newRole } : p))
      );

      showNotification('success', `User ${targetUser.email} is now an ${newRole.toUpperCase()}.`);
    } catch (err: any) {
      console.error('Failed to change user role:', err);
      showNotification('error', `Failed to change role: ${err.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  // --------------------------------------------------------------------------
  // Batch Operations
  // --------------------------------------------------------------------------
  const handleBatchStatusChange = async (newStatus: UserStatus) => {
    if (selectedUserIds.size === 0) return;
    setBatchActionInProgress(true);

    try {
      // Exclude self from batch suspend/ban
      const targetIds = Array.from(selectedUserIds).filter((id) => {
        if (id === currentAdminUser?.id && (newStatus === 'suspended' || newStatus === 'banned')) {
          return false;
        }
        return true;
      });

      if (targetIds.length === 0) {
        showNotification('error', 'Cannot apply suspension or ban to your own account.');
        setBatchActionInProgress(false);
        return;
      }

      const isSuspendedFlag = newStatus === 'suspended' || newStatus === 'banned';

      const { error } = await supabase
        .from('profiles')
        .update({
          status: newStatus,
          is_suspended: isSuspendedFlag,
          updated_at: new Date().toISOString(),
        })
        .in('id', targetIds);

      if (error) throw error;

      // Broadcast instant sub-second event so target users' active sessions lock immediately
      emitUserStatusChange(targetIds, newStatus);

      await logAudit(`BATCH_STATUS_${newStatus.toUpperCase()}`, null, null, {
        target_count: targetIds.length,
        new_status: newStatus,
      });

      setProfiles((prev) =>
        prev.map((p) =>
          targetIds.includes(p.id)
            ? { ...p, status: newStatus, is_suspended: isSuspendedFlag }
            : p
        )
      );

      showNotification('success', `Successfully updated status to ${newStatus.toUpperCase()} for ${targetIds.length} users.`);
      clearSelection();
    } catch (err: any) {
      console.error('Batch status update failed:', err);
      showNotification('error', `Batch update failed: ${err.message}`);
    } finally {
      setBatchActionInProgress(false);
    }
  };

  const handleBatchRoleChange = async (newRole: AppRole) => {
    if (selectedUserIds.size === 0) return;
    setBatchActionInProgress(true);

    try {
      const targetIds = Array.from(selectedUserIds).filter((id) => {
        if (id === currentAdminUser?.id && newRole === 'user') {
          return false;
        }
        return true;
      });

      if (targetIds.length === 0) {
        showNotification('error', 'Cannot demote your own account.');
        setBatchActionInProgress(false);
        return;
      }

      const { error } = await supabase
        .from('profiles')
        .update({
          role: newRole,
          updated_at: new Date().toISOString(),
        })
        .in('id', targetIds);

      if (error) throw error;

      await logAudit(`BATCH_ROLE_${newRole.toUpperCase()}`, null, null, {
        target_count: targetIds.length,
        new_role: newRole,
      });

      setProfiles((prev) =>
        prev.map((p) =>
          targetIds.includes(p.id) ? { ...p, role: newRole } : p
        )
      );

      showNotification('success', `Successfully set role to ${newRole.toUpperCase()} for ${targetIds.length} users.`);
      clearSelection();
    } catch (err: any) {
      console.error('Batch role elevation failed:', err);
      showNotification('error', `Batch role update failed: ${err.message}`);
    } finally {
      setBatchActionInProgress(false);
    }
  };

  return (
    <div className="space-y-6 w-full relative pb-20">
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

      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-zinc-800/80">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-violet-400" />
            User Directory & Access Governance
          </h1>
          <p className="text-xs sm:text-sm text-zinc-400 mt-0.5">
            Manage account privileges, enforce security suspensions or permanent bans, and execute batch governance.
          </p>
        </div>

        <button
          onClick={fetchProfiles}
          disabled={loading}
          className="self-start md:self-auto flex items-center gap-2 px-3.5 py-1.5 rounded-lg bg-[#14171A] hover:bg-zinc-800 border border-zinc-800 hover:border-zinc-700 text-zinc-300 hover:text-white text-xs font-medium transition-all cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Directory</span>
        </button>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Search Input */}
        <div className="relative sm:col-span-1">
          <Search className="w-4 h-4 text-zinc-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name or email..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-[#121417] border border-zinc-800 rounded-xl pl-9 pr-3.5 py-2 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-violet-500/60 transition-colors"
          />
        </div>

        {/* Role Filter */}
        <div className="flex items-center gap-2 bg-[#121417] border border-zinc-800 rounded-xl px-3 py-1.5">
          <Shield className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-400">Role:</span>
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value as any)}
            className="bg-transparent text-xs text-white focus:outline-none cursor-pointer flex-1"
          >
            <option value="all" className="bg-[#121417] text-white">All Roles</option>
            <option value="admin" className="bg-[#121417] text-violet-300">Admins</option>
            <option value="user" className="bg-[#121417] text-zinc-300">Standard Users</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2 bg-[#121417] border border-zinc-800 rounded-xl px-3 py-1.5">
          <Filter className="w-3.5 h-3.5 text-zinc-500" />
          <span className="text-xs text-zinc-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="bg-transparent text-xs text-white focus:outline-none cursor-pointer flex-1"
          >
            <option value="all" className="bg-[#121417] text-white">All Accounts</option>
            <option value="active" className="bg-[#121417] text-emerald-300">Active</option>
            <option value="suspended" className="bg-[#121417] text-amber-300">Suspended</option>
            <option value="banned" className="bg-[#121417] text-rose-300">Banned</option>
          </select>
        </div>
      </div>

      {/* Users Data Table */}
      <div className="bg-[#121417] border border-zinc-800/80 rounded-xl overflow-hidden shadow-xl w-full">
        <div className="overflow-x-auto w-full">
          <table className="w-full text-left text-xs text-zinc-300 border-collapse">
            <thead>
              <tr className="border-b border-zinc-800/80 bg-[#16191E]/60 text-zinc-400 font-semibold tracking-wider uppercase text-[10px]">
                {/* Master checkbox */}
                <th className="py-3.5 px-4 w-10 text-center">
                  <button
                    onClick={toggleSelectAll}
                    className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    title={allFilteredSelected ? 'Deselect All' : 'Select All'}
                  >
                    {allFilteredSelected ? (
                      <CheckSquare className="w-4 h-4 text-violet-400" />
                    ) : someFilteredSelected ? (
                      <MinusSquare className="w-4 h-4 text-violet-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="py-3.5 px-4">User</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Account Status</th>
                <th className="py-3.5 px-4">Registered Date</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/60">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-violet-500" />
                    <span>Loading directory records...</span>
                  </td>
                </tr>
              ) : filteredProfiles.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-zinc-500">
                    No users match the active criteria.
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => {
                  const isCurrentAdmin = p.id === currentAdminUser?.id;
                  const isBusy = actionInProgress === p.id;
                  const isDropdownOpen = activeDropdownId === p.id;
                  const isSelected = selectedUserIds.has(p.id);
                  const effectiveStatus: UserStatus = p.status || (p.is_suspended ? 'suspended' : 'active');

                  return (
                    <tr
                      key={p.id}
                      className={`hover:bg-zinc-800/30 transition-colors group ${
                        isSelected ? 'bg-violet-950/20' : ''
                      }`}
                    >
                      {/* Row Checkbox */}
                      <td className="py-3.5 px-4 text-center">
                        <button
                          onClick={() => toggleSelectRow(p.id)}
                          className="text-zinc-400 hover:text-white transition-colors cursor-pointer"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-4 h-4 text-violet-400" />
                          ) : (
                            <Square className="w-4 h-4" />
                          )}
                        </button>
                      </td>

                      {/* User Info */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-violet-700 to-indigo-600 flex items-center justify-center text-white font-semibold text-xs shrink-0 shadow">
                            {(p.full_name || p.email || 'U')[0].toUpperCase()}
                          </div>
                          <div className="flex flex-col">
                            <span className="font-medium text-white flex items-center gap-1.5">
                              {p.full_name || 'Anonymous User'}
                              {isCurrentAdmin && (
                                <span className="text-[10px] text-violet-300 font-mono bg-violet-950/60 px-1.5 py-0.2 rounded border border-violet-800/40">
                                  YOU
                                </span>
                              )}
                            </span>
                            <span className="text-[11px] text-zinc-400 flex items-center gap-1 font-mono">
                              <Mail className="w-3 h-3 text-zinc-500" />
                              {p.email || 'No email associated'}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Role Pill */}
                      <td className="py-3.5 px-4">
                        {p.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-violet-500/15 text-violet-300 border border-violet-500/30">
                            <Shield className="w-3 h-3 text-violet-400" />
                            Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-zinc-800/80 text-zinc-300 border border-zinc-700/60">
                            User
                          </span>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        {effectiveStatus === 'banned' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            <Ban className="w-3 h-3" />
                            Banned
                          </span>
                        ) : effectiveStatus === 'suspended' ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
                            <ShieldAlert className="w-3 h-3" />
                            Suspended
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                            <CheckCircle className="w-3 h-3" />
                            Active
                          </span>
                        )}
                      </td>

                      {/* Registered Date */}
                      <td className="py-3.5 px-4 text-zinc-400 text-[11px] font-mono">
                        {p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}
                      </td>

                      {/* Actions Dropdown */}
                      <td className="py-3.5 px-4 text-right relative">
                        <div className="inline-block text-left">
                          <button
                            onClick={() => setActiveDropdownId(isDropdownOpen ? null : p.id)}
                            disabled={isBusy}
                            className="p-1.5 rounded-lg bg-[#181B1F] hover:bg-zinc-800 border border-zinc-800 text-zinc-300 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                          >
                            {isBusy ? (
                              <Loader2 className="w-4 h-4 animate-spin text-violet-400" />
                            ) : (
                              <MoreVertical className="w-4 h-4" />
                            )}
                          </button>

                          {/* Action Menu Popover */}
                          {isDropdownOpen && (
                            <div
                              className="absolute right-4 mt-2 w-52 rounded-xl bg-[#181B20] border border-zinc-700/80 shadow-2xl z-50 py-1.5 focus:outline-none"
                              onMouseLeave={() => setActiveDropdownId(null)}
                            >
                              {/* Status: Set Active */}
                              {effectiveStatus !== 'active' && (
                                <button
                                  onClick={() => handleSetUserStatus(p, 'active')}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-emerald-400 hover:bg-emerald-950/30 transition-colors text-left cursor-pointer"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  <span>Set Active</span>
                                </button>
                              )}

                              {/* Status: Suspend */}
                              {effectiveStatus !== 'suspended' && (
                                <button
                                  onClick={() => handleSetUserStatus(p, 'suspended')}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-amber-400 hover:bg-amber-950/30 transition-colors text-left cursor-pointer"
                                >
                                  <ShieldAlert className="w-3.5 h-3.5" />
                                  <span>Suspend Account</span>
                                </button>
                              )}

                              {/* Status: Ban */}
                              {effectiveStatus !== 'banned' && (
                                <button
                                  onClick={() => handleSetUserStatus(p, 'banned')}
                                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-950/30 transition-colors text-left cursor-pointer"
                                >
                                  <Ban className="w-3.5 h-3.5" />
                                  <span>Ban Account</span>
                                </button>
                              )}

                              <div className="h-px bg-zinc-800 my-1" />

                              {/* Toggle Admin Role */}
                              <button
                                onClick={() => handleToggleRole(p)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-violet-300 hover:bg-violet-950/30 font-medium transition-colors text-left cursor-pointer"
                              >
                                <Shield className="w-3.5 h-3.5 text-violet-400" />
                                <span>{p.role === 'admin' ? 'Demote to User' : 'Promote to Admin'}</span>
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Table summary footer */}
        <div className="px-4 py-3 bg-[#101215] border-t border-zinc-800/80 text-[11px] text-zinc-400 flex items-center justify-between">
          <span>Showing {filteredProfiles.length} of {profiles.length} users</span>
          <span>Zero ledger snooping enforced • Cryptographic RBAC</span>
        </div>
      </div>

      {/* Floating Batch Action Toolbar */}
      <AnimatePresence>
        {selectedUserIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 30 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-[#14171C]/95 backdrop-blur-md border border-violet-800/60 rounded-2xl px-5 py-3 shadow-2xl flex flex-wrap items-center gap-3 text-xs"
          >
            <div className="flex items-center gap-2 pr-3 border-r border-zinc-800">
              <span className="w-2 h-2 rounded-full bg-violet-400 animate-pulse" />
              <span className="text-white font-semibold">
                {selectedUserIds.size} user{selectedUserIds.size > 1 ? 's' : ''} selected
              </span>
            </div>

            {/* Batch Activate */}
            <button
              onClick={() => handleBatchStatusChange('active')}
              disabled={batchActionInProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-950/60 hover:bg-emerald-900/80 text-emerald-300 border border-emerald-800/60 font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Batch Activate</span>
            </button>

            {/* Batch Suspend */}
            <button
              onClick={() => handleBatchStatusChange('suspended')}
              disabled={batchActionInProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-950/60 hover:bg-amber-900/80 text-amber-300 border border-amber-800/60 font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              <span>Batch Suspend</span>
            </button>

            {/* Batch Ban */}
            <button
              onClick={() => handleBatchStatusChange('banned')}
              disabled={batchActionInProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Ban className="w-3.5 h-3.5" />
              <span>Batch Ban</span>
            </button>

            {/* Batch Role Elevation */}
            <button
              onClick={() => handleBatchRoleChange('admin')}
              disabled={batchActionInProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-950/60 hover:bg-violet-900/80 text-violet-300 border border-violet-800/60 font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <Shield className="w-3.5 h-3.5" />
              <span>Elevate to Admin</span>
            </button>

            <button
              onClick={() => handleBatchRoleChange('user')}
              disabled={batchActionInProgress}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 border border-zinc-700 font-medium transition-colors cursor-pointer disabled:opacity-50"
            >
              <UserX className="w-3.5 h-3.5" />
              <span>Demote to User</span>
            </button>

            {/* Clear selection */}
            <button
              onClick={clearSelection}
              disabled={batchActionInProgress}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors cursor-pointer"
              title="Deselect all"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
