-- ==============================================================================
-- HP Budgeting - Admin Console Modernization, Security Hardening & Session Governance
-- Migration: 02_admin_modernization.sql
-- ==============================================================================

-- 1. USER STATUS ENUM EXPANSION & SYNCHRONIZATION
DO $$
BEGIN
  -- Add status column to profiles if it doesn't already exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
      AND table_name = 'profiles' 
      AND column_name = 'status'
  ) THEN
    ALTER TABLE public.profiles 
    ADD COLUMN status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'banned'));
  END IF;
END $$;

-- Backfill status based on existing is_suspended flag
UPDATE public.profiles
SET status = CASE 
  WHEN is_suspended = true THEN 'suspended'
  ELSE 'active'
END
WHERE status IS NULL;

-- Ensure indexes exist
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles(status);
CREATE INDEX IF NOT EXISTS idx_profiles_is_suspended ON public.profiles(is_suspended);

-- Function to check if a user is currently active (not suspended or banned)
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

-- Refined is_admin() checking active status
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

-- Protect profile sensitive fields trigger
CREATE OR REPLACE FUNCTION public.protect_profile_admin_fields()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.role IS DISTINCT FROM OLD.role OR NEW.is_suspended IS DISTINCT FROM OLD.is_suspended OR NEW.status IS DISTINCT FROM OLD.status) THEN
    IF NOT public.is_admin() THEN
      RAISE EXCEPTION 'Access Denied: Only administrators can modify role, status, or account suspension status.';
    END IF;
  END IF;

  -- Maintain backward compatibility synchronization
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

-- Update handle_new_user trigger to include status
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

-- 2. USER ACTIVITY & SESSION TRACKING TABLE
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

CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON public.user_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_sessions_is_online ON public.user_sessions(is_online);
CREATE INDEX IF NOT EXISTS idx_user_sessions_last_seen_at ON public.user_sessions(last_seen_at DESC);

ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_sessions_select_policy" ON public.user_sessions;
DROP POLICY IF EXISTS "user_sessions_insert_policy" ON public.user_sessions;
DROP POLICY IF EXISTS "user_sessions_update_policy" ON public.user_sessions;
DROP POLICY IF EXISTS "user_sessions_delete_policy" ON public.user_sessions;

-- Admins can view all sessions; users can view their own
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

-- Lightweight presence ping RPC
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

  -- 1. Mark stale users inactive if last_seen_at < NOW() - INTERVAL '3 minutes'
  UPDATE public.user_sessions
  SET is_online = false
  WHERE is_online = true
    AND last_seen_at < (NOW() - INTERVAL '3 minutes');

  -- 2. Lookup email
  SELECT email INTO v_email FROM auth.users WHERE id = v_user_id;
  IF v_email IS NULL THEN
    SELECT email INTO v_email FROM public.profiles WHERE id = v_user_id;
  END IF;

  -- 3. Upsert presence for current user
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
      COALESCE(v_email, 'unknown@user.com'),
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

-- 3. PLATFORM SETTINGS CLEANUP
DELETE FROM public.platform_settings WHERE key = 'disable_ai_parsing';

INSERT INTO public.platform_settings (key, value, description)
VALUES 
  ('maintenance_mode', '{"enabled": false, "message": "The system is currently undergoing scheduled maintenance. Please check back shortly."}'::jsonb, 'Global application maintenance mode gating'),
  ('active_alert', '{"enabled": false, "active": false, "message": "", "level": "info"}'::jsonb, 'Real-time broadcast banner alert propagated to application users')
ON CONFLICT (key) DO UPDATE
SET description = EXCLUDED.description;

-- 4. PRIVACY & DATA PROTECTION HARDENING (RLS ENFORCEMENT)
-- Remove admin backdoor from transactions, lending, budgets.
-- Zero administrative snooping on private financial items.
-- Block queries if status IN ('suspended', 'banned').

-- Transactions RLS
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

-- Lending RLS
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

-- Budgets RLS
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

NOTIFY pgrst, 'reload schema';
