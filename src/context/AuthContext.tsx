import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { AppRole, UserProfile, UserStatus } from '../types';
import { USER_GOVERNANCE_CHANNEL } from '../lib/realtimeGovernance';

type AuthContextType = {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  role: AppRole | null;
  status: UserStatus | null;
  isAdmin: boolean;
  isSuspended: boolean;
  isBanned: boolean;
  blockedStatus: 'suspended' | 'banned' | null;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<UserProfile | null>;
  clearBlockedState: () => void;
};

const AuthContext = createContext<AuthContextType>({
  session: null,
  user: null,
  profile: null,
  role: null,
  status: null,
  isAdmin: false,
  isSuspended: false,
  isBanned: false,
  blockedStatus: null,
  loading: true,
  signOut: async () => {},
  refreshProfile: async () => null,
  clearBlockedState: () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [role, setRole] = useState<AppRole | null>(null);
  const [status, setStatus] = useState<UserStatus | null>(null);
  const [blockedStatus, setBlockedStatus] = useState<'suspended' | 'banned' | null>(null);
  const [loading, setLoading] = useState(true);
  const presenceIntervalRef = useRef<any>(null);

  // Synchronously enforce and normalize user status state in memory
  const applyUserStatus = useCallback(
    (newStatus: UserStatus, isSuspendedFlag?: boolean, updatedData?: Partial<UserProfile>) => {
      const isSuspended = isSuspendedFlag ?? (newStatus === 'suspended' || newStatus === 'banned');

      if (newStatus === 'banned') {
        setBlockedStatus('banned');
        setStatus('banned');
        setProfile((prev) => (prev ? { ...prev, ...updatedData, status: 'banned', is_suspended: true } : null));
        return;
      }

      if (newStatus === 'suspended' || isSuspended) {
        setBlockedStatus('suspended');
        setStatus('suspended');
        setProfile((prev) => (prev ? { ...prev, ...updatedData, status: 'suspended', is_suspended: true } : null));
        return;
      }

      // Restored active status
      setBlockedStatus(null);
      setStatus('active');
      if (updatedData?.role) {
        setRole(updatedData.role);
      }
      setProfile((prev) => (prev ? { ...prev, ...updatedData, status: 'active', is_suspended: false } : null));
    },
    []
  );

  // Send lightweight presence heartbeat
  const sendPresencePing = useCallback(async (userId: string, email?: string) => {
    try {
      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null;
      const { error } = await supabase.rpc('ping_user_presence', {
        p_user_agent: userAgent,
        p_ip_address: null,
      });

      if (error) {
        // Graceful fallback to direct upsert if RPC is pending migration in DB
        await supabase.from('user_sessions').upsert(
          {
            user_id: userId,
            email: email || 'user@example.com',
            user_agent: userAgent,
            last_seen_at: new Date().toISOString(),
            is_online: true,
          },
          { onConflict: 'user_id' }
        );
      }
    } catch {
      // Non-blocking telemetry catch
    }
  }, []);

  // Fetch or upsert user profile from database
  const fetchUserProfile = useCallback(
    async (userId: string, currentUser?: User | null): Promise<UserProfile | null> => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .maybeSingle();

        if (error) {
          console.warn('Error fetching profile from database:', error.message);
        }

        if (data) {
          // Normalize status
          const effectiveStatus: UserStatus =
            data.status || (data.is_suspended ? 'suspended' : 'active');

          // Enforce account lockdown if suspended or banned
          if (effectiveStatus === 'banned') {
            setBlockedStatus('banned');
            setStatus('banned');
            setProfile({ ...data, status: 'banned', is_suspended: true });
            return null;
          }

          if (effectiveStatus === 'suspended' || data.is_suspended) {
            setBlockedStatus('suspended');
            setStatus('suspended');
            setProfile({ ...data, status: 'suspended', is_suspended: true });
            return null;
          }

          setBlockedStatus(null);
          setStatus(effectiveStatus);
          setProfile({ ...data, status: effectiveStatus });
          setRole(data.role);

          // Ping presence on active profile resolution
          sendPresencePing(userId, data.email || currentUser?.email);

          return data;
        }

        // If profile does not exist yet (e.g. trigger delay), fallback gracefully and attempt upsert
        if (currentUser) {
          const fallbackProfile: Partial<UserProfile> = {
            id: userId,
            email: currentUser.email || null,
            full_name:
              currentUser.user_metadata?.full_name ||
              currentUser.user_metadata?.name ||
              currentUser.email?.split('@')[0] ||
              'User',
            role: 'user',
            status: 'active',
            is_suspended: false,
          };

          const { data: createdProfile } = await supabase
            .from('profiles')
            .insert(fallbackProfile)
            .select()
            .maybeSingle();

          const resolved = (createdProfile || fallbackProfile) as UserProfile;
          setBlockedStatus(null);
          setStatus(resolved.status || 'active');
          setProfile(resolved);
          setRole(resolved.role);

          sendPresencePing(userId, resolved.email || currentUser.email);
          return resolved;
        }

        return null;
      } catch (err) {
        console.error('Unexpected error fetching profile:', err);
        return null;
      }
    },
    [sendPresencePing]
  );

  const refreshProfile = useCallback(async (): Promise<UserProfile | null> => {
    if (!session?.user?.id) return null;
    return await fetchUserProfile(session.user.id, session.user);
  }, [session, fetchUserProfile]);

  const clearBlockedState = () => {
    setBlockedStatus(null);
  };

  // ---------------------------------------------------------------------------
  // INSTANT REAL-TIME GOVERNANCE SUBSCRIPTION (<100ms Suspension/Ban Lockdown)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!session?.user?.id) return;
    const currentUserId = session.user.id;

    // 1. WebSocket Broadcast Channel: Instant sub-second delivery from Admin Console
    const broadcastChannel = supabase
      .channel(USER_GOVERNANCE_CHANNEL)
      .on(
        'broadcast',
        { event: 'USER_STATUS_CHANGED' },
        (payload: any) => {
          const { userIds, status: newStatus } = payload.payload || {};
          if (Array.isArray(userIds) && userIds.includes(currentUserId)) {
            const effStatus: UserStatus = newStatus || 'active';
            applyUserStatus(effStatus);
          }
        }
      )
      .subscribe();

    // 2. PostgreSQL WAL Realtime Subscription: Triggered whenever profiles table updates
    const dbProfileChannel = supabase
      .channel(`profile-db-sync:${currentUserId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${currentUserId}`,
        },
        (payload: any) => {
          const row = payload.new as any;
          if (!row) return;
          const effStatus: UserStatus = row.status || (row.is_suspended ? 'suspended' : 'active');
          applyUserStatus(effStatus, Boolean(row.is_suspended), row);
        }
      )
      .subscribe();

    // 3. Tab Visibility & Window Focus verification
    const handleVisibilityOrFocus = async () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        try {
          const { data } = await supabase
            .from('profiles')
            .select('status, is_suspended, role')
            .eq('id', currentUserId)
            .maybeSingle();

          if (data) {
            const effStatus: UserStatus = data.status || (data.is_suspended ? 'suspended' : 'active');
            applyUserStatus(effStatus, Boolean(data.is_suspended), data);
          }
        } catch {
          // Silent catch
        }
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityOrFocus);
    window.addEventListener('focus', handleVisibilityOrFocus);

    // 4. Periodic polling fail-safe (15-second heartbeat poll)
    const statusPollInterval = setInterval(async () => {
      try {
        const { data } = await supabase
          .from('profiles')
          .select('status, is_suspended, role')
          .eq('id', currentUserId)
          .maybeSingle();

        if (data) {
          const effStatus: UserStatus = data.status || (data.is_suspended ? 'suspended' : 'active');
          applyUserStatus(effStatus, Boolean(data.is_suspended), data);
        }
      } catch {
        // Silent catch
      }
    }, 15000);

    return () => {
      supabase.removeChannel(broadcastChannel);
      supabase.removeChannel(dbProfileChannel);
      window.removeEventListener('visibilitychange', handleVisibilityOrFocus);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      clearInterval(statusPollInterval);
    };
  }, [session?.user?.id, applyUserStatus]);

  // Heartbeat presence effect - 60s loop
  useEffect(() => {
    if (presenceIntervalRef.current) {
      clearInterval(presenceIntervalRef.current);
    }

    if (session?.user && !blockedStatus) {
      // Send immediately
      sendPresencePing(session.user.id, session.user.email);

      // Repeat every 60 seconds
      presenceIntervalRef.current = setInterval(() => {
        sendPresencePing(session.user.id, session.user.email);
      }, 60000);
    }

    return () => {
      if (presenceIntervalRef.current) {
        clearInterval(presenceIntervalRef.current);
      }
    };
  }, [session, blockedStatus, sendPresencePing]);

  useEffect(() => {
    let isMounted = true;

    // 1. Fetch initial session from Supabase client
    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!isMounted) return;

        if (session?.user) {
          setSession(session);
          await fetchUserProfile(session.user.id, session.user);
        } else {
          setSession(null);
          setProfile(null);
          setRole(null);
          setStatus(null);
          setBlockedStatus(null);
        }
        if (isMounted) setLoading(false);
      })
      .catch((err) => {
        console.error('Error retrieving session:', err);
        if (isMounted) setLoading(false);
      });

    // 2. Listen for auth state transitions (SIGN_IN, SIGN_OUT, TOKEN_REFRESHED)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      if (!isMounted) return;

      if (newSession?.user) {
        setSession(newSession);
        await fetchUserProfile(newSession.user.id, newSession.user);
      } else {
        setSession(null);
        setProfile(null);
        setRole(null);
        setStatus(null);
        setBlockedStatus(null);
      }
      if (isMounted) setLoading(false);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [fetchUserProfile]);

  const signOut = async () => {
    try {
      if (session?.user?.id) {
        // Mark session offline
        await supabase
          .from('user_sessions')
          .update({ is_online: false, last_seen_at: new Date().toISOString() })
          .eq('user_id', session.user.id);
      }
      await supabase.auth.signOut();
    } catch (err) {
      console.error('Error signing out:', err);
    } finally {
      setSession(null);
      setProfile(null);
      setRole(null);
      setStatus(null);
      setBlockedStatus(null);
    }
  };

  const isAdmin = role === 'admin';
  const isSuspended = blockedStatus === 'suspended' || status === 'suspended';
  const isBanned = blockedStatus === 'banned' || status === 'banned';

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        role,
        status,
        isAdmin,
        isSuspended,
        isBanned,
        blockedStatus,
        loading,
        signOut,
        refreshProfile,
        clearBlockedState,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
