HP Budgeting

A privacy-first personal finance and peer-lending ledger engineered with React, TypeScript, and database-level Row Level Security (RLS).

🌐 hpcorp.click

📖 About the Project

HP Budgeting was born out of frustration with conventional personal finance apps. Most existing consumer budgeting tools are bloated with ads, hidden behind paywalls, or require dozens of clicks just to record a quick coffee. At the same time, tracking informal debts—like splitting group dinners or lending money to friends—usually gets scattered across chat histories and forgotten notes. HP Budgeting solves this by providing a distraction-free, AMOLED dark-mode interface built for speed, transparency, and effortless ledger balancing.

Beyond daily utility, this project served as a deep dive into practical Application Security (AppSec) and modern cloud architecture. While security concepts are often studied in isolated labs, building an end-to-end multi-tenant platform from the ground up provided hands-on experience in closing real-world vulnerabilities. The entire platform was designed around defense-in-depth: eliminating client-side secrets, preventing IDOR/BOLA attacks at the database kernel, and establishing an isolated serverless perimeter for third-party integrations.

Features

AMOLED Financial Command Center: High-contrast dashboard with responsive visual progress rings, cash flow tracking, spending cap alerts, and transaction categorization.

Dedicated Peer Lending Hub: Built-in receivables ledger to track loans given to friends and colleagues, manage settlement statuses, and monitor overdue repayments.

Database-Enforced Tenant Isolation (AppSec): Powered by PostgreSQL Row Level Security (RLS). Every query is cryptographically bound to the user's JWT sub claim (auth.uid()), neutralizing Insecure Direct Object References (IDOR) by default.

Delegated Authentication via Google OAuth 2.0: Eliminates password storage, hashing overhead, and credential stuffing vectors by leveraging secure, modern identity federation.

🛠️ Built With

Frontend & UI: React, TypeScript, Tailwind CSS, Framer Motion, Lucide Icons

Backend & Database: Supabase, PostgreSQL 15, PostgREST API

Security & Identity: PostgreSQL Row-Level Security (RLS), Google OAuth 2.0, JSON Web Tokens (JWT)

Edge Compute & Serverless: Vercel Serverless Edge Functions
