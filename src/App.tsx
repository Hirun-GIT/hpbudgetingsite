import React, { useState, useEffect, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import { supabase } from './lib/supabase';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import { AdminRoute } from './components/AdminRoute';
import { SuspendedScreen } from './components/SuspendedScreen';
import { MaintenanceScreen } from './components/MaintenanceScreen';
import { AdminConsole } from './components/admin/AdminConsole';
import { Dashboard } from './components/Dashboard';
import { LoginPage } from './components/LoginPage';
import { IntroScreen } from './components/IntroScreen';
import { PrivacyPolicy } from './pages/privacy';
import { TermsAndConditions } from './pages/terms';
import { CookiesPolicy } from './pages/cookies';
import { CookieBanner } from './components/CookieBanner';
import { ActiveAlertBanner } from './components/ActiveAlertBanner';

type RouteKey =
  | 'user_dashboard'
  | 'admin_dashboard'
  | 'login'
  | 'privacy'
  | 'terms'
  | 'cookies';

function getRouteFromLocation(): RouteKey {
  if (typeof window === 'undefined') return 'login';
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();

  if (
    path.startsWith('/privacy') ||
    path.startsWith('/privacy-policy') ||
    hash.includes('privacy')
  ) {
    return 'privacy';
  }

  if (
    path.startsWith('/terms') ||
    path.startsWith('/terms-and-conditions') ||
    hash.includes('terms')
  ) {
    return 'terms';
  }

  if (
    path.startsWith('/cookies') ||
    path.startsWith('/cookie-policy') ||
    path.startsWith('/cookies-policy') ||
    hash.includes('cookies')
  ) {
    return 'cookies';
  }

  if (path.startsWith('/admin')) {
    return 'admin_dashboard';
  }

  if (
    path.startsWith('/user/dashboard') ||
    path.startsWith('/dashboard') ||
    hash.includes('dashboard')
  ) {
    return 'user_dashboard';
  }

  if (path.startsWith('/login') || hash.includes('login')) {
    return 'login';
  }

  // If OAuth token is present in URL hash, default towards login while token extracts
  if (hash.includes('access_token')) {
    return 'login';
  }

  return 'login';
}

function AppContent() {
  const { session, role, isAdmin, isSuspended, isBanned, blockedStatus, loading } = useAuth();
  const [currentRoute, setCurrentRoute] = useState<RouteKey>(getRouteFromLocation);

  // Global Maintenance Mode State
  const [maintenanceEnabled, setMaintenanceEnabled] = useState<boolean>(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState<string>('');

  const checkMaintenance = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('platform_settings')
        .select('value')
        .eq('key', 'maintenance_mode')
        .maybeSingle();

      if (!error && data?.value) {
        const val = data.value as any;
        setMaintenanceEnabled(Boolean(val.enabled));
        if (val.message) setMaintenanceMessage(val.message);
      }
    } catch {
      // Non-blocking
    }
  }, []);

  useEffect(() => {
    checkMaintenance();

    // Subscribe to maintenance_mode real-time updates
    const channel = supabase
      .channel('public:platform_settings:maintenance_mode')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'platform_settings',
          filter: 'key=eq.maintenance_mode',
        },
        (payload) => {
          if (payload.new && (payload.new as any).value) {
            const val = (payload.new as any).value as any;
            setMaintenanceEnabled(Boolean(val.enabled));
            if (val.message) setMaintenanceMessage(val.message);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [checkMaintenance]);

  const [showIntro, setShowIntro] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return sessionStorage.getItem('hpcorp_intro_seen') !== 'true';
    }
    return false;
  });

  const handleIntroComplete = () => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('hpcorp_intro_seen', 'true');
    }
    setShowIntro(false);
  };

  const navigateTo = (route: RouteKey) => {
    let targetPath = `/${route}`;
    if (route === 'user_dashboard') targetPath = '/user/dashboard';
    else if (route === 'admin_dashboard') targetPath = '/admin/overview';

    window.history.pushState({}, '', targetPath);
    setCurrentRoute(route);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Synchronize route and handle strict role-based redirects
  useEffect(() => {
    if (loading) return;

    const path = window.location.pathname.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    // If OAuth token is currently in hash, let Supabase auth client finish processing
    if (hash.includes('access_token')) return;

    // 1. If user account is suspended or banned, halt access
    if (isSuspended || isBanned || blockedStatus) {
      return;
    }

    // 2. Unauthenticated user trying to access private routes
    if (!session) {
      if (
        path.startsWith('/admin') ||
        path.startsWith('/dashboard') ||
        path.startsWith('/user/dashboard') ||
        path === '/' ||
        path === ''
      ) {
        window.history.replaceState(null, '', '/login');
        setCurrentRoute('login');
      }
      return;
    }

    // 3. Authenticated user handling:
    // When landing on root '/', '/login', or right after OAuth sign-in:
    if (path === '/' || path === '' || path.startsWith('/login')) {
      if (role === 'admin') {
        window.history.replaceState(null, '', '/admin/overview');
        setCurrentRoute('admin_dashboard');
      } else {
        window.history.replaceState(null, '', '/user/dashboard');
        setCurrentRoute('user_dashboard');
      }
      return;
    }

    // 4. If non-admin attempts to access /admin/*, force-redirect to /user/dashboard
    if (path.startsWith('/admin') && role !== 'admin') {
      window.history.replaceState(null, '', '/user/dashboard');
      setCurrentRoute('user_dashboard');
      return;
    }

    // 5. If navigating to generic /dashboard or /admin, resolve cleanly
    if (path === '/dashboard') {
      const target = role === 'admin' ? '/admin/overview' : '/user/dashboard';
      window.history.replaceState(null, '', target);
      setCurrentRoute(role === 'admin' ? 'admin_dashboard' : 'user_dashboard');
    } else if (path === '/admin' || path === '/admin/dashboard') {
      window.history.replaceState(null, '', '/admin/overview');
      setCurrentRoute('admin_dashboard');
    }
  }, [session, role, loading, isSuspended, isBanned, blockedStatus]);

  // Clean OAuth tokens and listen for history / auth state events
  useEffect(() => {
    const cleanUrl = () => {
      if (typeof window === 'undefined') return;
      const { pathname, hash } = window.location;

      if (hash.includes('access_token')) {
        return;
      }

      if (hash) {
        const targetPath = pathname === '/' ? '/login' : pathname;
        window.history.replaceState(null, '', targetPath);
      }
    };

    cleanUrl();

    const tokenCheckInterval = setInterval(() => {
      if (!window.location.hash.includes('access_token')) {
        cleanUrl();
        setCurrentRoute(getRouteFromLocation());
        clearInterval(tokenCheckInterval);
      }
    }, 80);

    const safetyTimeout = setTimeout(() => {
      clearInterval(tokenCheckInterval);
    }, 4000);

    const { data: authListener } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        setTimeout(cleanUrl, 50);
        if (newSession) {
          const currentPath = window.location.pathname.toLowerCase();
          if (currentPath === '/login' || currentPath === '/' || currentPath === '') {
            const target = role === 'admin' ? '/admin/overview' : '/user/dashboard';
            window.history.replaceState(null, '', target);
            setCurrentRoute(role === 'admin' ? 'admin_dashboard' : 'user_dashboard');
          }
        }
      } else if (event === 'SIGNED_OUT') {
        window.history.replaceState(null, '', '/login');
        setCurrentRoute('login');
      }
    });

    const handleLocationChange = () => {
      cleanUrl();
      setCurrentRoute(getRouteFromLocation());
    };

    window.addEventListener('popstate', handleLocationChange);
    window.addEventListener('hashchange', handleLocationChange);

    return () => {
      clearInterval(tokenCheckInterval);
      clearTimeout(safetyTimeout);
      authListener?.subscription?.unsubscribe();
      window.removeEventListener('popstate', handleLocationChange);
      window.removeEventListener('hashchange', handleLocationChange);
    };
  }, [role]);

  // 1. Account Suspension & Ban Gate: Full lockdown view
  if (isSuspended || isBanned || blockedStatus) {
    const effectiveBlocked = blockedStatus || (isBanned ? 'banned' : 'suspended');
    return (
      <SuspendedScreen
        status={effectiveBlocked}
        onBackToLogin={() => navigateTo('login')}
      />
    );
  }

  // 2. Global Maintenance Mode Gate:
  // Non-admins attempting to access user views receive the dedicated maintenance screen.
  // Admins retain full access across /admin/* routes.
  const isNonAdminUserView =
    currentRoute === 'user_dashboard' || currentRoute === 'login';

  if (maintenanceEnabled && role !== 'admin' && isNonAdminUserView) {
    return (
      <MaintenanceScreen
        customMessage={maintenanceMessage}
        onRefresh={checkMaintenance}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0D0E] text-white relative w-full overflow-x-hidden">
      <AnimatePresence mode="wait">
        {showIntro && (
          <IntroScreen key="intro-screen" onComplete={handleIntroComplete} />
        )}
      </AnimatePresence>

      {/* Broadcast Alert Banner for non-admin user views */}
      {currentRoute !== 'admin_dashboard' && <ActiveAlertBanner />}

      {/* 1. Login View */}
      {currentRoute === 'login' && (
        <LoginPage
          onNavigatePrivacy={() => navigateTo('privacy')}
          onNavigateTerms={() => navigateTo('terms')}
          onNavigateCookies={() => navigateTo('cookies')}
        />
      )}

      {/* 2. Admin Console (Strictly Protected by AdminRoute & Sub-Route Gated) */}
      {currentRoute === 'admin_dashboard' && (
        <AdminRoute
          onRedirectToUserDashboard={() => navigateTo('user_dashboard')}
          onRedirectToLogin={() => navigateTo('login')}
        >
          <AdminConsole
            onExitToUserApp={() => navigateTo('user_dashboard')}
          />
        </AdminRoute>
      )}

      {/* 3. User Dashboard (Protected by ProtectedRoute) */}
      {currentRoute === 'user_dashboard' && (
        <ProtectedRoute
          onRedirectToLogin={() => navigateTo('login')}
          onNavigatePrivacy={() => navigateTo('privacy')}
          onNavigateTerms={() => navigateTo('terms')}
          onNavigateCookies={() => navigateTo('cookies')}
        >
          <Dashboard
            onNavigatePrivacy={() => navigateTo('privacy')}
            onNavigateTerms={() => navigateTo('terms')}
            onNavigateCookies={() => navigateTo('cookies')}
            onNavigateAdmin={() => navigateTo('admin_dashboard')}
          />
        </ProtectedRoute>
      )}

      {/* 4. Policy Pages */}
      {currentRoute === 'privacy' && (
        <PrivacyPolicy
          onNavigateHome={() =>
            navigateTo(
              session
                ? role === 'admin'
                  ? 'admin_dashboard'
                  : 'user_dashboard'
                : 'login'
            )
          }
          onNavigateTerms={() => navigateTo('terms')}
        />
      )}

      {/* 5. Terms Page */}
      {currentRoute === 'terms' && (
        <TermsAndConditions
          onNavigateHome={() =>
            navigateTo(
              session
                ? role === 'admin'
                  ? 'admin_dashboard'
                  : 'user_dashboard'
                : 'login'
            )
          }
          onNavigatePrivacy={() => navigateTo('privacy')}
        />
      )}

      {/* 6. Cookies Page */}
      {currentRoute === 'cookies' && (
        <CookiesPolicy
          onNavigateHome={() =>
            navigateTo(
              session
                ? role === 'admin'
                  ? 'admin_dashboard'
                  : 'user_dashboard'
                : 'login'
            )
          }
          onNavigatePrivacy={() => navigateTo('privacy')}
          onNavigateTerms={() => navigateTo('terms')}
        />
      )}

      <CookieBanner onNavigateCookies={() => navigateTo('cookies')} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}