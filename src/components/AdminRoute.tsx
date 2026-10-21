import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Loader2 } from 'lucide-react';

type AdminRouteProps = {
  children: React.ReactNode;
  onRedirectToUserDashboard: () => void;
  onRedirectToLogin: () => void;
};

export function AdminRoute({
  children,
  onRedirectToUserDashboard,
  onRedirectToLogin,
}: AdminRouteProps) {
  const { session, role, loading, isSuspended } = useAuth();

  useEffect(() => {
    if (loading) return;

    if (!session) {
      onRedirectToLogin();
      return;
    }

    // If authenticated user is not an admin, force redirect to user dashboard
    if (role !== 'admin') {
      onRedirectToUserDashboard();
    }
  }, [loading, session, role, onRedirectToLogin, onRedirectToUserDashboard]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0B0D0E] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        <span className="text-xs uppercase tracking-wider font-medium text-zinc-500">
          Verifying Admin Credentials...
        </span>
      </div>
    );
  }

  // Not logged in or non-admin or suspended
  if (!session || role !== 'admin' || isSuspended) {
    return null;
  }

  return <>{children}</>;
}
