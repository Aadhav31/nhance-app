-- ── Step 1: Check if clients table exists ────────────────────────────────────
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'clients'
) AS clients_table_exists;

-- ── Step 2: Check if companies table exists ───────────────────────────────────
SELECT EXISTS (
  SELECT FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'companies'
) AS companies_table_exists;

-- ── Step 3: Check auth_company_id function exists ─────────────────────────────
SELECT EXISTS (
  SELECT FROM pg_proc WHERE proname = 'auth_company_id'
) AS auth_company_id_exists;
