import express from 'express';
import { createServer as createViteServer } from 'vite';
import { createClient, SupabaseClient, User } from '@supabase/supabase-js';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

// Disable information disclosure headers
app.disable('x-powered-by');

// Enforce modern HTTP security headers
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
});

// Limit JSON payload size to prevent DoS attacks
app.use(express.json({ limit: '100kb' }));

const rawUrl = process.env.SUPABASE_URL || '';
const supabaseUrl = rawUrl.replace(/\/rest\/v1\/?$/, '');
const anonKey = process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !anonKey) {
  console.warn('⚠️ Supabase environment variables (SUPABASE_URL, SUPABASE_ANON_KEY) are missing or incomplete.');
}

// Custom request interface with authenticated user and scoped Supabase client
export interface AuthenticatedRequest extends express.Request {
  user: User;
  supabase: SupabaseClient;
}

// Strict JWT Authentication Middleware
async function requireAuth(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authentication required. Missing Bearer token.' });
    }

    const token = authHeader.substring(7).trim();
    if (!token) {
      return res.status(401).json({ error: 'Authentication required. Invalid Bearer token format.' });
    }

    // Initialize user-scoped Supabase client with anon key and user's JWT
    const userClient = createClient(supabaseUrl, anonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
      },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });

    // Cryptographically verify token validity with Supabase Auth
    const {
      data: { user },
      error,
    } = await userClient.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired authentication session.' });
    }

    (req as AuthenticatedRequest).user = user;
    (req as AuthenticatedRequest).supabase = userClient;
    next();
  } catch (err: any) {
    console.error('Auth verification error:', err);
    return res.status(401).json({ error: 'Authentication verification failed.' });
  }
}

// Input validation and sanitization helpers
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUUID(val: string): boolean {
  return typeof val === 'string' && UUID_REGEX.test(val);
}

function parseSafeAmount(val: any): number | null {
  const num = typeof val === 'number' ? val : parseFloat(val);
  if (!Number.isFinite(num) || num < 0 || num > 100_000_000) {
    return null;
  }
  return Math.round(num * 100) / 100;
}

function sanitizeText(val: any, maxLength = 255): string {
  if (typeof val !== 'string') return '';
  return val.trim().slice(0, maxLength);
}

// 1. Health endpoint (Safe: does not leak internal counts or database configuration)
app.get('/api/status', (_req, res) => {
  res.json({
    status: 'healthy',
    configured: Boolean(supabaseUrl && anonKey),
    timestamp: new Date().toISOString(),
  });
});

// 2. GET /api/transactions (Strictly scoped to authenticated user)
app.get('/api/transactions', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { data, error } = await authReq.supabase
      .from('transactions')
      .select('*')
      .eq('user_id', authReq.user.id)
      .order('transaction_date', { ascending: false });

    if (error) throw error;

    const mapped = (data || []).map((t) => ({
      id: t.id,
      amount: Number(t.amount),
      type: t.type === 'credit' || t.type === 'income' ? 'income' : 'expense',
      merchant: t.merchant || t.description || 'General',
      transaction_date: t.transaction_date || t.created_at,
      date: t.transaction_date || t.created_at,
      category: t.category,
      user_id: t.user_id,
    }));

    res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching transactions:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch transactions' });
  }
});

// 3. POST /api/transactions (Strictly scoped to authenticated user, validated)
app.post('/api/transactions', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { amount, type, merchant, description, category, transaction_date, date } = req.body;

    const safeAmount = parseSafeAmount(amount);
    if (safeAmount === null) {
      return res.status(400).json({ error: 'Invalid amount. Must be a finite number between 0 and 100,000,000.' });
    }

    const safeType = type === 'income' || type === 'credit' ? 'credit' : 'debit';
    const safeMerchant = sanitizeText(merchant || description || 'General', 150);
    const safeDescription = sanitizeText(description || merchant || '', 255);
    const safeCategory = sanitizeText(category || 'General', 50);

    const inputDate = transaction_date || date;
    const safeDate = inputDate && !isNaN(Date.parse(inputDate))
      ? new Date(inputDate).toISOString()
      : new Date().toISOString();

    const { data, error } = await authReq.supabase
      .from('transactions')
      .insert([
        {
          user_id: authReq.user.id,
          amount: safeAmount,
          type: safeType,
          merchant: safeMerchant,
          description: safeDescription,
          category: safeCategory,
          transaction_date: safeDate,
        },
      ])
      .select();

    if (error) throw error;

    const created = data?.[0];
    res.status(201).json({
      id: created.id,
      amount: Number(created.amount),
      type: created.type === 'credit' ? 'income' : 'expense',
      merchant: created.merchant,
      transaction_date: created.transaction_date,
      date: created.transaction_date,
      category: created.category,
      user_id: created.user_id,
    });
  } catch (err: any) {
    console.error('Error adding transaction:', err);
    res.status(400).json({ error: err.message || 'Failed to create transaction' });
  }
});

// 4. GET /api/lending (Strictly scoped to authenticated user)
app.get('/api/lending', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { data, error } = await authReq.supabase
      .from('lending')
      .select('*')
      .eq('user_id', authReq.user.id)
      .order('due_date', { ascending: true });

    if (error) throw error;

    const mapped = (data || []).map((l) => ({
      id: l.id,
      person_name: l.person_name,
      amount: Number(l.amount),
      lent_date: l.lent_date,
      due_date: l.due_date,
      notes: l.notes,
      status: l.status,
      user_id: l.user_id,
    }));

    res.json(mapped);
  } catch (err: any) {
    console.error('Error fetching lending records:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch lending records' });
  }
});

// 5. POST /api/lending (Strictly scoped to authenticated user, validated)
app.post('/api/lending', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { person_name, amount, due_date, lent_date, notes = '', status = 'pending' } = req.body;

    const safeAmount = parseSafeAmount(amount);
    if (safeAmount === null) {
      return res.status(400).json({ error: 'Invalid amount. Must be a finite number between 0 and 100,000,000.' });
    }

    const safePerson = sanitizeText(person_name, 100);
    if (!safePerson) {
      return res.status(400).json({ error: 'Person name is required.' });
    }

    const safeNotes = sanitizeText(notes, 500);
    const safeStatus = status === 'paid' ? 'paid' : 'pending';

    const safeDueDate = due_date && !isNaN(Date.parse(due_date))
      ? new Date(due_date).toISOString()
      : new Date().toISOString();
    const safeLentDate = lent_date && !isNaN(Date.parse(lent_date))
      ? new Date(lent_date).toISOString()
      : new Date().toISOString();

    const { data, error } = await authReq.supabase
      .from('lending')
      .insert([
        {
          user_id: authReq.user.id,
          person_name: safePerson,
          amount: safeAmount,
          lent_date: safeLentDate,
          due_date: safeDueDate,
          notes: safeNotes,
          status: safeStatus,
        },
      ])
      .select();

    if (error) throw error;

    const created = data?.[0];
    res.status(201).json({
      id: created.id,
      person_name: created.person_name,
      amount: Number(created.amount),
      lent_date: created.lent_date,
      due_date: created.due_date,
      notes: created.notes,
      status: created.status,
      user_id: created.user_id,
    });
  } catch (err: any) {
    console.error('Error adding lending record:', err);
    res.status(400).json({ error: err.message || 'Failed to create lending record' });
  }
});

// 6. PATCH /api/lending/:id (Guards against IDOR: validates UUID and ensures user ownership)
app.patch('/api/lending/:id', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidUUID(id)) {
      return res.status(400).json({ error: 'Invalid lending record identifier format.' });
    }

    if (status !== 'paid' && status !== 'pending') {
      return res.status(400).json({ error: 'Invalid status. Permitted values: "pending" | "paid".' });
    }

    const { data, error } = await authReq.supabase
      .from('lending')
      .update({ status })
      .eq('id', id)
      .eq('user_id', authReq.user.id)
      .select();

    if (error) throw error;

    if (!data || data.length === 0) {
      return res.status(404).json({ error: 'Lending record not found or access denied.' });
    }

    res.json(data[0]);
  } catch (err: any) {
    console.error('Error updating lending record:', err);
    res.status(400).json({ error: err.message || 'Failed to update lending record' });
  }
});

// 7. GET /api/budgets (Strictly scoped to authenticated user)
app.get('/api/budgets', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { data, error } = await authReq.supabase
      .from('budgets')
      .select('spending_limit, budget_limit, used_amount')
      .eq('user_id', authReq.user.id)
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    res.json(data || { spending_limit: 0, budget_limit: 0, used_amount: 0 });
  } catch (err: any) {
    console.error('Error fetching budgets:', err);
    res.status(500).json({ error: err.message || 'Failed to fetch budget' });
  }
});

// 8. POST /api/budgets (Upsert strictly scoped to authenticated user, validated)
app.post('/api/budgets', requireAuth, async (req, res) => {
  try {
    const authReq = req as AuthenticatedRequest;
    const { spending_limit, budget_limit, used_amount } = req.body;

    const safeSpending = parseSafeAmount(spending_limit ?? 0) ?? 0;
    const safeBudget = parseSafeAmount(budget_limit ?? spending_limit ?? 0) ?? safeSpending;
    const safeUsed = parseSafeAmount(used_amount ?? 0) ?? 0;

    const { data, error } = await authReq.supabase
      .from('budgets')
      .upsert(
        {
          user_id: authReq.user.id,
          spending_limit: safeSpending,
          budget_limit: safeBudget,
          used_amount: safeUsed,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' }
      )
      .select();

    if (error) throw error;
    res.json(data?.[0]);
  } catch (err: any) {
    console.error('Error upserting budget record:', err);
    res.status(400).json({ error: err.message || 'Failed to update budget' });
  }
});

// Server initialization with safe host binding
async function startServer() {
  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static('dist'));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve('dist', 'index.html'));
    });
  }

  const PORT = parseInt(process.env.PORT || '3000', 10);
  // Default to localhost in development to prevent unauthorized LAN exposure
  const HOST = process.env.HOST || (isProd ? '0.0.0.0' : '127.0.0.1');

  app.listen(PORT, HOST, () => {
    console.log(`HP Budgeting server running securely on http://${HOST}:${PORT}`);
  });
}

startServer();
