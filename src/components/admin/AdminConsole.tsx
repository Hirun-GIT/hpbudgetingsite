import React, { useState, useEffect } from 'react';
import { AdminLayout } from './AdminLayout';
import { AdminDashboard } from './AdminDashboard';
import { UserManagement } from './UserManagement';
import { UserSessions } from './UserSessions';
import { PlatformSettings } from './PlatformSettings';
import { SecurityLogs } from './SecurityLogs';
import { AdminTab } from '../../types';

type AdminConsoleProps = {
  onExitToUserApp: () => void;
};

function getTabFromPath(): AdminTab {
  if (typeof window === 'undefined') return 'overview';
  const path = window.location.pathname.toLowerCase();

  if (path.includes('/admin/user-management') || path.includes('/admin/users')) {
    return 'user-management';
  }
  if (path.includes('/admin/sessions')) {
    return 'sessions';
  }
  if (path.includes('/admin/platform-settings') || path.includes('/admin/settings')) {
    return 'platform-settings';
  }
  if (path.includes('/admin/security-logs') || path.includes('/admin/logs')) {
    return 'security-logs';
  }

  return 'overview';
}

export function AdminConsole({ onExitToUserApp }: AdminConsoleProps) {
  const [activeTab, setActiveTab] = useState<AdminTab>(getTabFromPath);

  // Synchronize URL on initial mount and ensure canonical path
  useEffect(() => {
    const currentTab = getTabFromPath();
    setActiveTab(currentTab);

    const canonicalPath = `/admin/${currentTab}`;
    if (window.location.pathname.toLowerCase() !== canonicalPath) {
      window.history.replaceState(null, '', canonicalPath);
    }

    const handlePopState = () => {
      setActiveTab(getTabFromPath());
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (tab: AdminTab) => {
    setActiveTab(tab);
    const targetPath = `/admin/${tab}`;
    if (window.location.pathname !== targetPath) {
      window.history.pushState(null, '', targetPath);
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <AdminLayout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      onExitToUserApp={onExitToUserApp}
    >
      {activeTab === 'overview' && (
        <AdminDashboard onNavigateTab={handleTabChange} />
      )}
      {activeTab === 'user-management' && <UserManagement />}
      {activeTab === 'sessions' && <UserSessions />}
      {activeTab === 'platform-settings' && <PlatformSettings />}
      {activeTab === 'security-logs' && <SecurityLogs />}
    </AdminLayout>
  );
}
