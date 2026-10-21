export type Transaction = {
  id: string;
  amount: number;
  type: 'income' | 'expense';
  merchant: string;
  transaction_date: string;
  category?: string;
  user_id?: string;
};

export type Lending = {
  id: string;
  person_name: string;
  amount: number;
  lent_date?: string;
  due_date: string;
  notes?: string;
  status: 'pending' | 'paid';
  user_id?: string;
};

export type NotificationItem = {
  id: string;
  title: string;
  message: string;
  type: 'warning' | 'alert' | 'info' | 'success';
  date: string;
  read?: boolean;
  actionType?: 'view_lending' | 'budget';
  lendingId?: string;
};

export type Budget = {
  user_id: string;
  spending_limit: number;
  budget_limit: number;
  used_amount: number;
  updated_at?: string;
};

export type BudgetSettings = {
  spending_limit: number;
  budget_limit: number;
  used_amount: number;
};

// ============================================================================
// RBAC, Session Governance & Admin Types
// ============================================================================

export type AppRole = 'user' | 'admin';
export type UserStatus = 'active' | 'suspended' | 'banned';

export interface UserProfile {
  id: string;
  email: string | null;
  full_name: string | null;
  role: AppRole;
  status: UserStatus;
  is_suspended: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface UserSession {
  id: string;
  user_id: string;
  email: string;
  ip_address?: string | null;
  user_agent?: string | null;
  last_seen_at: string;
  logged_in_at: string;
  is_online: boolean;
}

export interface AdminAuditLog {
  id: string;
  admin_id: string | null;
  admin_email: string | null;
  action: string;
  target_user_id?: string | null;
  target_user_email?: string | null;
  details?: Record<string, any>;
  ip_address?: string | null;
  created_at: string;
}

export interface MaintenanceModeConfig {
  enabled: boolean;
  message: string;
}

export interface ActiveAlertConfig {
  enabled?: boolean;
  active?: boolean;
  message: string;
  level: 'info' | 'warning' | 'critical';
}

export interface PlatformSetting {
  id: string;
  key: string;
  value: any;
  description?: string;
  updated_at: string;
  updated_by?: string | null;
}

export interface SystemHealthMetrics {
  dbPool: {
    active: number;
    idle: number;
    max: number;
    usagePercent: number;
  };
  apiLatency: {
    currentMs: number;
    p95Ms: number;
    p99Ms: number;
    status: 'optimal' | 'degraded' | 'critical';
  };
  storage: {
    usedMb: number;
    totalMb: number;
    usagePercent: number;
  };
}

export type AdminTab =
  | 'overview'
  | 'user-management'
  | 'sessions'
  | 'platform-settings'
  | 'security-logs';
