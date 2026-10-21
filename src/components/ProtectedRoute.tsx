import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

type ProtectedRouteProps = {
  children: React.ReactNode;
  onRedirectToLogin?: () => void;
  onNavigatePrivacy?: () => void;
  onNavigateTerms?: () => void;
  onNavigateCookies?: () => void;
};

export function ProtectedRoute({
  children,
  onRedirectToLogin,
}: ProtectedRouteProps) {
  const { session, loading } = useAuth();

  useEffect(() => {
    if (!loading && !session && onRedirectToLogin) {
      onRedirectToLogin();
    }
  }, [loading, session, onRedirectToLogin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <>{children}</>;
}
