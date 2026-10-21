-- ==============================================================================
-- HP Budgeting - Complete Production Database Schema & Security Governance
-- Target Engine: PostgreSQL 15+ (Supabase)
-- Full Site Setup & Migration (Idempotent: safe to run on fresh or existing DB)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS & CUSTOM TYPES
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Application Role ENUM
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('user', 'admin');
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. REUSABLE TRIGGER FUNCTION: updated_at TIMESTAMPS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 3. TABLE: public.profiles
-- User identity, role-based credentials, status states, and metadata
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  role public.app_role NOT NULL DEFAULT 'user'::public.app_role,
  status TEXT NOT NULL DEFAULT 'active',
  is_suspended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure all columns exist even if the table already existed from an older migration
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS email TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS full_name TEXT;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role public.app_role DEFAULT 'user'::public.app_role;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;

-- Add check constraint for status values safely
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
    ADD CONSTRAINT profiles_status_check CHECK (status IN ('active', 'suspended', 'banned'));
  END IF;
END $$;

-- Backfill and normalize any existing rows where status is NULL
UPDATE public.profiles
SET status = CASE 
  WHEN is_suspended = true THEN 'suspended'
  ELSE 'active'
END
WHERE status IS NULL;

-- Trigger to maintain updated_at on public.profiles
DROP TRIGGER IF EXISTS set_profiles_updated_at ON public.profiles;
CREATE TRIGGER set_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Indexes for public.profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

-- ------------------------------------------------------------------------------
-- 4. TABLE: public.budgets
-- User spending caps, budget limits, and tracked expenditures
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  spending_limit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  budget_limit NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  used_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Ensure columns exist if table was pre-existing
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS spending_limit NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS budget_limit NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.budgets ADD COLUMN IF NOT EXISTS used_amount NUMERIC(12, 2) DEFAULT 0.00;

DROP TRIGGER IF EXISTS set_budgets_updated_at ON public.budgets;
CREATE TRIGGER set_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON public.budgets(user_id);

-- ------------------------------------------------------------------------------
-- 5. TABLE: public.transactions
-- Detailed financial entries (income and expenses)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  merchant TEXT NOT NULL DEFAULT 'General',
  description TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'General',
  type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('income', 'expense', 'credit', 'debit')),
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS merchant TEXT DEFAULT 'General';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'General';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'expense';
ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT 0.00;

DROP TRIGGER IF EXISTS set_transactions_updated_at ON public.transactions;
CREATE TRIGGER set_transactions_updated_at
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(user_id, category);

-- ------------------------------------------------------------------------------
-- 6. TABLE: public.lending
-- Peer-to-peer loans, counterparty records, and repayment tracking
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.lending (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  person_name TEXT NOT NULL,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
  lent_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  due_date TIMESTAMPTZ NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.lending ADD COLUMN IF NOT EXISTS person_name TEXT;
ALTER TABLE public.lending ADD COLUMN IF NOT EXISTS amount NUMERIC(12, 2) DEFAULT 0.00;
ALTER TABLE public.lending ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE public.lending ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '';

DROP TRIGGER IF EXISTS set_lending_updated_at ON public.lending;
CREATE TRIGGER set_lending_updated_at
  BEFORE UPDATE ON public.lending
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_lending_user_id ON public.lending(user_id);
CREATE INDEX IF NOT EXISTS idx_lending_due_date ON public.lending(due_date ASC);
CREATE INDEX IF NOT EXISTS idx_lending_user_status ON public.lending(user_id, status);

-- ------------------------------------------------------------------------------
-- 7. TABLE: public.user_sessions
-- Live presence heartbeats, device signatures, and active login telemetry
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- If user_sessions exists but is invalid (lacks user_id), drop to recreate cleanly
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'user_sessions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'user_sessions' AND column_name = 'user_id'
  ) THEN
    DROP TABLE public.user_sessions CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  last_seen_at TIMESTAMPTZ DEFAULT NOW(),
  logged_in_at TIMESTAMPTZ DEFAULT NOW(),
  is_online BOOLEAN DEFAULT TRUE
);

ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS user_agent TEXT;
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS logged_in_at TIMESTAMPTZ DEFAULT NOW();
ALTER TABLE public.user_sessions ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_online ON public.user_sessions(is_online);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen_at ON public.user_sessions(last_seen_at DESC);

-- ------------------------------------------------------------------------------
-- 8. TABLE: public.platform_settings
-- System-wide configuration flags, maintenance modes, and active alerts
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- If platform_settings exists but lacks the required 'key' column, recreate it cleanly
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'platform_settings'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'platform_settings' AND column_name = 'key'
  ) THEN
    DROP TABLE public.platform_settings CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  description TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Ensure columns exist in case it was pre-existing
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS key TEXT;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS value JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();
ALTER TABLE public.platform_settings ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Ensure unique constraint on 'key'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conrelid = 'public.platform_settings'::regclass 
      AND (conname = 'platform_settings_key_key' OR contype = 'u')
  ) THEN
    ALTER TABLE public.platform_settings ADD CONSTRAINT platform_settings_key_key UNIQUE (key);
  END IF;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

DROP TRIGGER IF EXISTS set_platform_settings_updated_at ON public.platform_settings;
CREATE TRIGGER set_platform_settings_updated_at
  BEFORE UPDATE ON public.platform_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- ------------------------------------------------------------------------------
-- 9. TABLE: public.admin_audit_logs
-- Immutable administrative audit trail recording security and governance actions
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  -- If admin_audit_logs exists but lacks 'action', recreate cleanly
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'admin_audit_logs'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'admin_audit_logs' AND column_name = 'action'
  ) THEN
    DROP TABLE public.admin_audit_logs CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  admin_email TEXT,
  action TEXT NOT NULL,
  target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  target_user_email TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  ip_address TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS admin_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS admin_email TEXT;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS action TEXT;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS target_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS target_user_email TEXT;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS details JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS ip_address TEXT;
ALTER TABLE public.admin_audit_logs ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.admin_audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON public.admin_audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_admin_id ON public.admin_audit_logs(admin_id);

-- ------------------------------------------------------------------------------
-- 10. SECURITY DEFINER FUNCTIONS & TRIGGERS
-- ------------------------------------------------------------------------------

-- Function 1: Check if the authenticated caller is an active administrator
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role = 'admin'::public.app_role
      AND status = 'active'
      AND is_suspended = false
  );
END;
$$;

-- Function 2: Check if the authenticated caller is an active user (not suspended or banned)
CREATE OR REPLACE FUNCTION public.is_active_user()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND status = 'active'
      AND is_suspended = false
  );
END;
$$;

-- Function 3: Automatically provision user profile when Google OAuth creates auth.users record
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (
    id,
    email,
    full_name,
    role,
    status,
    is_suspended,
    created_at,
    updated_at
  )
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    'user'::public.app_role,
    'active',
    false,
    now(),
    now()
  )
  ON CONFLICT (id) DO UPDATE
  SET
    email = EXCLUDED.email,
    full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name),
    updated_at = now();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Function 4: Safeguard sensitive profile fields (role, status, is_suspended)
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access Denied: Only administrators can modify role, status, or account suspension status.';
    END IF;
  END IF;

  -- Synchronize status and is_suspended
  IF NEW.status IN ('suspended', 'banned') THEN
    NEW.is_suspended = true;
  ELSIF NEW.status = 'active' THEN
    NEW.is_suspended = false;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_admin_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_admin_fields
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_admin_fields();

-- Function 5: Lightweight Supabase Presence Ping RPC
CREATE OR REPLACE FUNCTION public.ping_user_presence(
  p_user_agent TEXT DEFAULT NULL,
  p_ip_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_session_id UUID;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Unauthenticated');
  END IF;

  -- 1. Mark stale user sessions offline if last_seen_at < NOW() - INTERVAL '3 minutes'
  UPDATE public.user_sessions
  SET is_online = false
  WHERE is_online = true
    AND last_seen_at < (NOW() - INTERVAL '3 minutes');

  -- 2. Lookup user email
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_user_id;
  END IF;

  -- 3. Upsert presence for the active user
  SELECT id INTO v_session_id
  FROM public.user_sessions
  WHERE user_id = v_user_id
  ORDER BY last_seen_at DESC
  LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    UPDATE public.user_sessions
    SET
      last_seen_at = NOW(),
      is_online = true,
      user_agent = COALESCE(p_user_agent, user_agent),
      ip_address = COALESCE(p_ip_address, ip_address)
    WHERE id = v_session_id;
  ELSE
    INSERT INTO public.user_sessions (
      user_id,
      email,
      ip_address,
      user_agent,
      last_seen_at,
      logged_in_at,
      is_online
    ) VALUES (
      v_user_id,
      COALESCE(v_email, 'user@hpbudgeting.com'),
      p_ip_address,
      p_user_agent,
      NOW(),
      NOW(),
      true
    )
    RETURNING id INTO v_session_id;
  END IF;

  RETURN jsonb_build_object('success', true, 'session_id', v_session_id);
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict cryptographic isolation:
-- - Zero financial snooping: Admins CANNOT inspect itemized user ledgers.
-- - Block queries if status IN ('suspended', 'banned').
-- ------------------------------------------------------------------------------

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lending ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- 1. PROFILES RLS POLICIES
DROP POLICY IF EXISTS "profiles_select_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_update_policy" ON public.profiles;
DROP POLICY IF EXISTS "profiles_user_update_policy" ON public.profiles;

CREATE POLICY "profiles_select_policy"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id OR public.is_admin());

CREATE POLICY "profiles_insert_policy"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "profiles_admin_update_policy"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "profiles_user_update_policy"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id AND NOT public.is_admin())
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND status = (SELECT p.status FROM public.profiles p WHERE p.id = auth.uid())
    AND is_suspended = (SELECT p.is_suspended FROM public.profiles p WHERE p.id = auth.uid())
  );

-- 2. BUDGETS RLS POLICIES (Zero Admin Snooping)
DROP POLICY IF EXISTS "Allow authenticated users full access to own budgets" ON public.budgets;
DROP POLICY IF EXISTS "budgets_select_policy" ON public.budgets;
DROP POLICY IF EXISTS "budgets_insert_policy" ON public.budgets;
DROP POLICY IF EXISTS "budgets_update_policy" ON public.budgets;
DROP POLICY IF EXISTS "budgets_delete_policy" ON public.budgets;

CREATE POLICY "budgets_select_policy"
  ON public.budgets
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "budgets_insert_policy"
  ON public.budgets
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "budgets_update_policy"
  ON public.budgets
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user())
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "budgets_delete_policy"
  ON public.budgets
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user());

-- 3. TRANSACTIONS RLS POLICIES (Zero Admin Snooping)
DROP POLICY IF EXISTS "Allow authenticated users full access to own transactions" ON public.transactions;
DROP POLICY IF EXISTS "transactions_select_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_insert_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_update_policy" ON public.transactions;
DROP POLICY IF EXISTS "transactions_delete_policy" ON public.transactions;

CREATE POLICY "transactions_select_policy"
  ON public.transactions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "transactions_insert_policy"
  ON public.transactions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "transactions_update_policy"
  ON public.transactions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user())
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "transactions_delete_policy"
  ON public.transactions
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user());

-- 4. LENDING RLS POLICIES (Zero Admin Snooping)
DROP POLICY IF EXISTS "Allow authenticated users full access to own lending" ON public.lending;
DROP POLICY IF EXISTS "lending_select_policy" ON public.lending;
DROP POLICY IF EXISTS "lending_insert_policy" ON public.lending;
DROP POLICY IF EXISTS "lending_update_policy" ON public.lending;
DROP POLICY IF EXISTS "lending_delete_policy" ON public.lending;

CREATE POLICY "lending_select_policy"
  ON public.lending
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "lending_insert_policy"
  ON public.lending
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "lending_update_policy"
  ON public.lending
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user())
  WITH CHECK (auth.uid() = user_id AND public.is_active_user());

CREATE POLICY "lending_delete_policy"
  ON public.lending
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id AND public.is_active_user());

-- 5. USER SESSIONS RLS POLICIES
DROP POLICY IF EXISTS "user_sessions_select_policy" ON public.user_sessions;
DROP POLICY IF EXISTS "user_sessions_insert_policy" ON public.user_sessions;
DROP POLICY IF EXISTS "user_sessions_update_policy" ON public.user_sessions;
DROP POLICY IF EXISTS "user_sessions_delete_policy" ON public.user_sessions;

CREATE POLICY "user_sessions_select_policy"
  ON public.user_sessions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_sessions_insert_policy"
  ON public.user_sessions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_sessions_update_policy"
  ON public.user_sessions
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

CREATE POLICY "user_sessions_delete_policy"
  ON public.user_sessions
  FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 6. PLATFORM SETTINGS RLS POLICIES
DROP POLICY IF EXISTS "platform_settings_select_policy" ON public.platform_settings;
DROP POLICY IF EXISTS "platform_settings_admin_all_policy" ON public.platform_settings;

-- Readable by both authenticated and anon so maintenance screen can be viewed without login
CREATE POLICY "platform_settings_select_policy"
  ON public.platform_settings
  FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "platform_settings_admin_all_policy"
  ON public.platform_settings
  FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 7. ADMIN AUDIT LOGS RLS POLICIES
DROP POLICY IF EXISTS "admin_audit_logs_select_policy" ON public.admin_audit_logs;
DROP POLICY IF EXISTS "admin_audit_logs_insert_policy" ON public.admin_audit_logs;

CREATE POLICY "admin_audit_logs_select_policy"
  ON public.admin_audit_logs
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin_audit_logs_insert_policy"
  ON public.admin_audit_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_admin());

-- ------------------------------------------------------------------------------
-- 12. SEEDS & DEFAULT CONFIGURATIONS
-- ------------------------------------------------------------------------------

INSERT INTO public.platform_settings (key, value, description)
VALUES 
  ('maintenance_mode', '{"enabled": false, "message": "The system is currently undergoing scheduled maintenance. Please check back shortly."}'::jsonb, 'Global application maintenance mode gating'),
  ('active_alert', '{"enabled": false, "active": false, "message": "", "level": "info"}'::jsonb, 'Real-time broadcast banner alert displayed across application dashboards')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

-- Backfill pre-existing auth users into public.profiles
INSERT INTO public.profiles (id, email, full_name, role, status, is_suspended)
SELECT
  id,
  email,
  COALESCE(
    raw_user_meta_data->>'full_name',
    raw_user_meta_data->>'name',
    split_part(email, '@', 1)
  ),
  'user'::public.app_role,
  'active',
  false
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET
  email = EXCLUDED.email,
  full_name = COALESCE(public.profiles.full_name, EXCLUDED.full_name);

-- ------------------------------------------------------------------------------
-- 13. REALTIME PUBLICATION SUBSCRIPTION
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'platform_settings'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.platform_settings;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'user_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.user_sessions;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'admin_audit_logs'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.admin_audit_logs;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
      AND schemaname = 'public' 
      AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles;
  END IF;
EXCEPTION
  WHEN undefined_object THEN
    NULL;
END $$;

-- Enable REPLICA IDENTITY FULL for real-time broadcasts with updated record data
DO $$
BEGIN
  ALTER TABLE public.profiles REPLICA IDENTITY FULL;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- ------------------------------------------------------------------------------
-- 14. SCHEMA CACHE REFRESH
-- ------------------------------------------------------------------------------
NOTIFY pgrst, 'reload schema';
