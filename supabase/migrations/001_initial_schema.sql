-- ============================================================
-- NHANCE — Initial Database Schema
-- Phase 1: Construction Equipment Rental
-- Run this in Supabase SQL Editor (Project → SQL Editor → New query)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================

CREATE TYPE industry_type AS ENUM ('equipment_rental', 'transport', 'construction');

CREATE TYPE module_key AS ENUM (
  'core', 'fleet_management', 'daily_operations', 'maintenance',
  'inventory', 'clients_projects', 'accounts', 'reports_analytics', 'hr_payroll'
);

CREATE TYPE user_role AS ENUM ('operator', 'supervisor', 'manager', 'accounts', 'admin');

CREATE TYPE equipment_status AS ENUM ('active', 'idle', 'breakdown', 'maintenance', 'disposed');

CREATE TYPE fuel_type AS ENUM ('diesel', 'petrol', 'electric', 'cng');

CREATE TYPE meter_type AS ENUM ('hours', 'kilometers', 'both');

CREATE TYPE doc_type AS ENUM ('rc_book', 'insurance', 'pollution', 'permit', 'fitness', 'other');

CREATE TYPE meter_source AS ENUM ('shift_entry', 'manual', 'maintenance');

CREATE TYPE shift_type AS ENUM ('day', 'night', 'double');

CREATE TYPE shift_status AS ENUM ('open', 'closed', 'approved', 'disputed');

CREATE TYPE incident_type AS ENUM ('breakdown', 'accident', 'near_miss', 'damage', 'theft', 'other');

CREATE TYPE incident_severity AS ENUM ('low', 'medium', 'high', 'critical');

CREATE TYPE maintenance_type AS ENUM ('preventive', 'breakdown', 'accidental', 'overhaul');

CREATE TYPE maintenance_status AS ENUM ('open', 'in_progress', 'completed');

CREATE TYPE interval_type AS ENUM ('hours', 'kilometers', 'calendar_days');

CREATE TYPE lifecycle_component AS ENUM ('tyre', 'battery', 'belt', 'filter', 'other');

CREATE TYPE component_condition AS ENUM ('good', 'fair', 'worn', 'critical', 'replaced');

CREATE TYPE vendor_type AS ENUM ('parts', 'fuel', 'service', 'tyres', 'other');

CREATE TYPE inventory_txn_type AS ENUM ('purchase', 'issue', 'return', 'adjustment', 'scrap');

CREATE TYPE client_status AS ENUM ('active', 'inactive', 'blacklisted');

CREATE TYPE project_status AS ENUM ('active', 'completed', 'on_hold', 'cancelled');

CREATE TYPE billing_type AS ENUM ('hourly', 'daily', 'monthly', 'fixed');

CREATE TYPE deployment_status AS ENUM ('active', 'completed', 'withdrawn');

CREATE TYPE rate_unit AS ENUM ('per_hour', 'per_day', 'per_month');

CREATE TYPE expense_category AS ENUM ('fuel', 'maintenance', 'salary', 'rent', 'insurance', 'toll', 'misc');

CREATE TYPE payment_mode AS ENUM ('cash', 'bank_transfer', 'cheque', 'upi', 'credit');

CREATE TYPE invoice_status AS ENUM ('draft', 'sent', 'partial', 'paid', 'overdue', 'cancelled');

CREATE TYPE record_status AS ENUM ('draft', 'approved', 'rejected', 'paid');

CREATE TYPE attendance_status AS ENUM ('present', 'absent', 'half_day', 'leave', 'holiday');

CREATE TYPE notification_type AS ENUM (
  'document_expiry', 'pm_due', 'low_stock', 'invoice_due', 'license_expiry', 'breakdown'
);

CREATE TYPE subscription_type AS ENUM ('upfront', 'monthly', 'annual');

CREATE TYPE subscription_status AS ENUM ('pending', 'paid', 'overdue');

-- ============================================================
-- PLATFORM LEVEL (Nhance internal)
-- ============================================================

-- Companies (tenants)
CREATE TABLE companies (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name                TEXT NOT NULL,
  industry            industry_type NOT NULL DEFAULT 'equipment_rental',
  logo_url            TEXT,
  primary_color       TEXT DEFAULT '#2563eb',
  gstin               TEXT,
  address             TEXT,
  contact_name        TEXT,
  contact_email       TEXT,
  contact_phone       TEXT,
  max_users           INTEGER NOT NULL DEFAULT 10,
  is_active           BOOLEAN NOT NULL DEFAULT true,
  trial_ends_at       TIMESTAMPTZ,
  subscription_start  DATE,
  subscription_end    DATE,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Module licensing per company
CREATE TABLE company_modules (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_key  module_key NOT NULL,
  is_enabled  BOOLEAN NOT NULL DEFAULT false,
  enabled_at  TIMESTAMPTZ,
  enabled_by  UUID,  -- Nhance admin user id
  UNIQUE (company_id, module_key)
);

-- Nhance subscription invoices
CREATE TABLE subscription_invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,
  amount          NUMERIC(12,2) NOT NULL,
  type            subscription_type NOT NULL,
  status          subscription_status NOT NULL DEFAULT 'pending',
  due_date        DATE,
  paid_date       DATE,
  modules_billed  JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- AUTH & USERS
-- ============================================================

-- User profiles (extends auth.users)
CREATE TABLE user_profiles (
  id                      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  employee_id             TEXT,
  full_name               TEXT NOT NULL,
  phone                   TEXT,
  photo_url               TEXT,
  designation             TEXT,
  department              TEXT,
  date_of_joining         DATE,
  date_of_birth           DATE,
  blood_group             TEXT,
  emergency_contact_name  TEXT,
  emergency_contact_phone TEXT,
  address                 TEXT,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  last_login_at           TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- User roles
CREATE TABLE user_roles (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  role        user_role NOT NULL,
  site_ids    UUID[],  -- null = access to all sites
  assigned_by UUID REFERENCES user_profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, company_id)
);

-- Sites (operational locations)
CREATE TABLE sites (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  location      TEXT,
  address       TEXT,
  contact_name  TEXT,
  contact_phone TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE: FLEET MANAGEMENT
-- ============================================================

CREATE TABLE equipment (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id              UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_number        TEXT NOT NULL,
  name                    TEXT NOT NULL,
  category                TEXT NOT NULL,
  make                    TEXT,
  model                   TEXT,
  year_of_manufacture     INTEGER,
  registration_number     TEXT,
  chassis_number          TEXT,
  engine_number           TEXT,
  capacity                TEXT,
  fuel_type               fuel_type NOT NULL DEFAULT 'diesel',
  meter_type              meter_type NOT NULL DEFAULT 'hours',
  current_meter_reading   NUMERIC(12,2) DEFAULT 0,
  purchase_date           DATE,
  purchase_cost           NUMERIC(12,2),
  current_value           NUMERIC(12,2),
  status                  equipment_status NOT NULL DEFAULT 'active',
  site_id                 UUID REFERENCES sites(id),
  photo_url               TEXT,
  notes                   TEXT,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, equipment_number)
);

CREATE TABLE equipment_documents (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id  UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  doc_type      doc_type NOT NULL,
  doc_name      TEXT NOT NULL,
  file_url      TEXT,
  issue_date    DATE,
  expiry_date   DATE,
  uploaded_by   UUID REFERENCES user_profiles(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE equipment_meter_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  reading_type    TEXT NOT NULL,  -- 'hours' or 'kilometers'
  reading_value   NUMERIC(12,2) NOT NULL,
  reading_date    DATE NOT NULL,
  source          meter_source NOT NULL DEFAULT 'manual',
  reference_id    UUID,
  recorded_by     UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE: DAILY OPERATIONS
-- ============================================================

CREATE TABLE shifts (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id      UUID NOT NULL REFERENCES equipment(id),
  operator_id       UUID NOT NULL REFERENCES user_profiles(id),
  supervisor_id     UUID REFERENCES user_profiles(id),
  site_id           UUID REFERENCES sites(id),
  project_id        UUID,  -- FK added after projects table
  client_id         UUID,  -- FK added after clients table
  shift_date        DATE NOT NULL,
  shift_type        shift_type NOT NULL DEFAULT 'day',
  start_time        TIME,
  end_time          TIME,
  start_meter       NUMERIC(12,2),
  end_meter         NUMERIC(12,2),
  working_hours     NUMERIC(6,2) DEFAULT 0,
  idle_hours        NUMERIC(6,2) DEFAULT 0,
  breakdown_hours   NUMERIC(6,2) DEFAULT 0,
  status            shift_status NOT NULL DEFAULT 'open',
  approved_by       UUID REFERENCES user_profiles(id),
  approved_at       TIMESTAMPTZ,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shift_fuel_entries (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id          UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  equipment_id      UUID NOT NULL REFERENCES equipment(id),
  entry_time        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  quantity_liters   NUMERIC(8,2) NOT NULL,
  rate_per_liter    NUMERIC(8,2),
  total_amount      NUMERIC(10,2),
  fuel_source       TEXT DEFAULT 'tank',
  meter_at_filling  NUMERIC(12,2),
  issued_by         UUID REFERENCES user_profiles(id),
  receipt_url       TEXT,
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shift_incidents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id        UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  equipment_id    UUID NOT NULL REFERENCES equipment(id),
  incident_type   incident_type NOT NULL,
  severity        incident_severity NOT NULL DEFAULT 'low',
  description     TEXT NOT NULL,
  action_taken    TEXT,
  reported_by     UUID REFERENCES user_profiles(id),
  incident_time   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved        BOOLEAN NOT NULL DEFAULT false,
  resolved_at     TIMESTAMPTZ,
  resolved_by     UUID REFERENCES user_profiles(id),
  photo_urls      TEXT[],
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shift_work_details (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id           UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  shift_id             UUID NOT NULL REFERENCES shifts(id) ON DELETE CASCADE,
  work_type            TEXT NOT NULL,
  quantity             NUMERIC(12,2),
  unit                 TEXT,
  location_description TEXT,
  notes                TEXT
);

-- ============================================================
-- MODULE: CLIENTS & PROJECTS (needed for FK references above)
-- ============================================================

CREATE TABLE clients (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  client_code     TEXT,
  name            TEXT NOT NULL,
  contact_name    TEXT,
  contact_phone   TEXT,
  contact_email   TEXT,
  address         TEXT,
  gstin           TEXT,
  credit_limit    NUMERIC(12,2) DEFAULT 0,
  payment_terms   TEXT,
  status          client_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE projects (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  project_code      TEXT,
  name              TEXT NOT NULL,
  client_id         UUID REFERENCES clients(id),
  site_location     TEXT,
  start_date        DATE,
  end_date          DATE,
  actual_end_date   DATE,
  status            project_status NOT NULL DEFAULT 'active',
  contract_value    NUMERIC(14,2),
  billing_type      billing_type DEFAULT 'hourly',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Wire up shifts FKs now that clients and projects exist
ALTER TABLE shifts
  ADD CONSTRAINT fk_shifts_project FOREIGN KEY (project_id) REFERENCES projects(id),
  ADD CONSTRAINT fk_shifts_client  FOREIGN KEY (client_id)  REFERENCES clients(id);

CREATE TABLE equipment_deployments (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id    UUID NOT NULL REFERENCES equipment(id),
  project_id      UUID NOT NULL REFERENCES projects(id),
  client_id       UUID NOT NULL REFERENCES clients(id),
  deployed_date   DATE NOT NULL,
  withdrawn_date  DATE,
  rental_rate     NUMERIC(12,2) NOT NULL,
  rate_unit       rate_unit NOT NULL DEFAULT 'per_hour',
  minimum_hours   NUMERIC(6,2),
  operator_id     UUID REFERENCES user_profiles(id),
  status          deployment_status NOT NULL DEFAULT 'active',
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE: MAINTENANCE
-- ============================================================

CREATE TABLE maintenance_schedules (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id    UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  task_name       TEXT NOT NULL,
  interval_type   interval_type NOT NULL,
  interval_value  NUMERIC(10,2) NOT NULL,
  last_done_at    NUMERIC(12,2),
  last_done_date  DATE,
  next_due_at     NUMERIC(12,2),
  next_due_date   DATE,
  alert_before    NUMERIC(10,2) DEFAULT 25,
  is_active       BOOLEAN NOT NULL DEFAULT true,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE vendors (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  vendor_type   vendor_type NOT NULL DEFAULT 'parts',
  contact_name  TEXT,
  contact_phone TEXT,
  contact_email TEXT,
  address       TEXT,
  gstin         TEXT,
  payment_terms TEXT,
  rating        INTEGER CHECK (rating BETWEEN 1 AND 5),
  notes         TEXT,
  is_active     BOOLEAN NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE maintenance_records (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id      UUID NOT NULL REFERENCES equipment(id),
  schedule_id       UUID REFERENCES maintenance_schedules(id),
  maintenance_type  maintenance_type NOT NULL DEFAULT 'preventive',
  description       TEXT NOT NULL,
  meter_at_service  NUMERIC(12,2),
  service_date      DATE NOT NULL,
  completed_date    DATE,
  vendor_id         UUID REFERENCES vendors(id),
  done_by           TEXT DEFAULT 'inhouse',
  technician_name   TEXT,
  parts_used        JSONB,
  labour_cost       NUMERIC(10,2) DEFAULT 0,
  total_cost        NUMERIC(10,2) DEFAULT 0,
  downtime_hours    NUMERIC(8,2) DEFAULT 0,
  status            maintenance_status NOT NULL DEFAULT 'open',
  photos            TEXT[],
  created_by        UUID REFERENCES user_profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE lifecycle_tracking (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_id      UUID NOT NULL REFERENCES equipment(id) ON DELETE CASCADE,
  component_type    lifecycle_component NOT NULL,
  position          TEXT,
  brand             TEXT,
  serial_number     TEXT,
  installed_date    DATE,
  installed_meter   NUMERIC(12,2),
  expected_life     NUMERIC(10,2),
  current_condition component_condition NOT NULL DEFAULT 'good',
  replaced_date     DATE,
  replaced_meter    NUMERIC(12,2),
  cost              NUMERIC(10,2),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE: INVENTORY
-- ============================================================

CREATE TABLE inventory_items (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id               UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  site_id                  UUID REFERENCES sites(id),
  item_code                TEXT NOT NULL,
  name                     TEXT NOT NULL,
  category                 TEXT,
  unit                     TEXT NOT NULL DEFAULT 'Nos',
  current_stock            NUMERIC(12,2) NOT NULL DEFAULT 0,
  minimum_stock            NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_cost                NUMERIC(10,2) DEFAULT 0,
  location                 TEXT,
  equipment_compatibility  TEXT[],
  preferred_vendor_id      UUID REFERENCES vendors(id),
  is_active                BOOLEAN NOT NULL DEFAULT true,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, item_code)
);

CREATE TABLE inventory_transactions (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id           UUID NOT NULL REFERENCES inventory_items(id),
  transaction_type  inventory_txn_type NOT NULL,
  quantity          NUMERIC(12,2) NOT NULL,
  unit_cost         NUMERIC(10,2),
  total_cost        NUMERIC(12,2),
  reference_type    TEXT,
  reference_id      UUID,
  equipment_id      UUID REFERENCES equipment(id),
  vendor_id         UUID REFERENCES vendors(id),
  invoice_number    TEXT,
  transaction_date  DATE NOT NULL DEFAULT CURRENT_DATE,
  done_by           UUID REFERENCES user_profiles(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE: ACCOUNTS
-- ============================================================

CREATE TABLE expenses (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  expense_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  category         expense_category NOT NULL DEFAULT 'misc',
  description      TEXT NOT NULL,
  amount           NUMERIC(12,2) NOT NULL,
  tax_amount       NUMERIC(10,2) DEFAULT 0,
  total_amount     NUMERIC(12,2) NOT NULL,
  payment_mode     payment_mode NOT NULL DEFAULT 'cash',
  equipment_id     UUID REFERENCES equipment(id),
  project_id       UUID REFERENCES projects(id),
  vendor_id        UUID REFERENCES vendors(id),
  reference_number TEXT,
  receipt_url      TEXT,
  approved_by      UUID REFERENCES user_profiles(id),
  status           record_status NOT NULL DEFAULT 'draft',
  created_by       UUID REFERENCES user_profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE invoices (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_number  TEXT NOT NULL,
  client_id       UUID NOT NULL REFERENCES clients(id),
  project_id      UUID REFERENCES projects(id),
  invoice_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  period_from     DATE,
  period_to       DATE,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_rate        NUMERIC(5,2)  DEFAULT 18,
  tax_amount      NUMERIC(12,2) DEFAULT 0,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount     NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_amount  NUMERIC(14,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
  due_date        DATE,
  status          invoice_status NOT NULL DEFAULT 'draft',
  notes           TEXT,
  created_by      UUID REFERENCES user_profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, invoice_number)
);

CREATE TABLE invoice_line_items (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id    UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  equipment_id  UUID REFERENCES equipment(id),
  description   TEXT NOT NULL,
  quantity      NUMERIC(10,2) NOT NULL,
  unit          TEXT DEFAULT 'hours',
  rate          NUMERIC(12,2) NOT NULL,
  amount        NUMERIC(14,2) NOT NULL,
  sort_order    INTEGER DEFAULT 0
);

CREATE TABLE payments (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  invoice_id        UUID NOT NULL REFERENCES invoices(id),
  client_id         UUID NOT NULL REFERENCES clients(id),
  payment_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  amount            NUMERIC(14,2) NOT NULL,
  payment_mode      payment_mode NOT NULL DEFAULT 'bank_transfer',
  reference_number  TEXT,
  notes             TEXT,
  recorded_by       UUID REFERENCES user_profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- MODULE: HR & PAYROLL
-- ============================================================

CREATE TABLE operator_profiles (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES user_profiles(id) ON DELETE CASCADE,
  license_number  TEXT,
  license_type    TEXT,
  license_expiry  DATE,
  skills          TEXT[],
  base_salary     NUMERIC(10,2) DEFAULT 0,
  allowances      NUMERIC(10,2) DEFAULT 0,
  pf_number       TEXT,
  esi_number      TEXT,
  bank_account    TEXT,
  bank_ifsc       TEXT,
  bank_name       TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id)
);

CREATE TABLE attendance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES user_profiles(id),
  attendance_date DATE NOT NULL,
  status          attendance_status NOT NULL DEFAULT 'present',
  check_in        TIME,
  check_out       TIME,
  overtime_hours  NUMERIC(5,2) DEFAULT 0,
  site_id         UUID REFERENCES sites(id),
  marked_by       UUID REFERENCES user_profiles(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id, attendance_date)
);

CREATE TABLE salary_records (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL REFERENCES user_profiles(id),
  month             INTEGER NOT NULL CHECK (month BETWEEN 1 AND 12),
  year              INTEGER NOT NULL,
  working_days      INTEGER DEFAULT 26,
  days_present      INTEGER DEFAULT 0,
  days_absent       INTEGER DEFAULT 0,
  base_salary       NUMERIC(10,2) DEFAULT 0,
  allowances        NUMERIC(10,2) DEFAULT 0,
  overtime_amount   NUMERIC(10,2) DEFAULT 0,
  deductions        NUMERIC(10,2) DEFAULT 0,
  gross_salary      NUMERIC(10,2) DEFAULT 0,
  net_salary        NUMERIC(10,2) DEFAULT 0,
  payment_date      DATE,
  payment_mode      payment_mode DEFAULT 'bank_transfer',
  payment_reference TEXT,
  status            record_status NOT NULL DEFAULT 'draft',
  approved_by       UUID REFERENCES user_profiles(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, user_id, month, year)
);

-- ============================================================
-- NOTIFICATIONS & AUDIT
-- ============================================================

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id      UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id         UUID REFERENCES user_profiles(id),
  type            notification_type NOT NULL,
  title           TEXT NOT NULL,
  body            TEXT,
  reference_type  TEXT,
  reference_id    UUID,
  is_read         BOOLEAN NOT NULL DEFAULT false,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id  UUID REFERENCES companies(id),
  user_id     UUID REFERENCES user_profiles(id),
  action      TEXT NOT NULL,
  table_name  TEXT,
  record_id   UUID,
  old_values  JSONB,
  new_values  JSONB,
  ip_address  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES (for query performance)
-- ============================================================

CREATE INDEX idx_user_profiles_company    ON user_profiles(company_id);
CREATE INDEX idx_user_roles_user          ON user_roles(user_id);
CREATE INDEX idx_user_roles_company       ON user_roles(company_id);
CREATE INDEX idx_equipment_company        ON equipment(company_id);
CREATE INDEX idx_equipment_status         ON equipment(company_id, status);
CREATE INDEX idx_shifts_company_date      ON shifts(company_id, shift_date);
CREATE INDEX idx_shifts_operator          ON shifts(operator_id);
CREATE INDEX idx_shifts_equipment         ON shifts(equipment_id);
CREATE INDEX idx_fuel_entries_shift       ON shift_fuel_entries(shift_id);
CREATE INDEX idx_incidents_shift          ON shift_incidents(shift_id);
CREATE INDEX idx_maintenance_equipment    ON maintenance_records(equipment_id);
CREATE INDEX idx_inventory_company        ON inventory_items(company_id);
CREATE INDEX idx_invoices_client          ON invoices(client_id);
CREATE INDEX idx_invoices_status          ON invoices(company_id, status);
CREATE INDEX idx_payments_invoice         ON payments(invoice_id);
CREATE INDEX idx_attendance_user_date     ON attendance(user_id, attendance_date);
CREATE INDEX idx_notifications_user       ON notifications(user_id, is_read);
CREATE INDEX idx_audit_log_company        ON audit_log(company_id, created_at);
CREATE INDEX idx_eq_documents_expiry      ON equipment_documents(company_id, expiry_date);
CREATE INDEX idx_pm_schedule_due          ON maintenance_schedules(company_id, next_due_date);

-- ============================================================
-- ROW LEVEL SECURITY (data isolation between tenants)
-- ============================================================

ALTER TABLE companies              ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_modules        ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_profiles          ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles             ENABLE ROW LEVEL SECURITY;
ALTER TABLE sites                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment              ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_documents    ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_meter_log    ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_fuel_entries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_incidents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_work_details     ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients                ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects               ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipment_deployments  ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules  ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE lifecycle_tracking     ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors                ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses               ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices               ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_line_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments               ENABLE ROW LEVEL SECURITY;
ALTER TABLE operator_profiles      ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance             ENABLE ROW LEVEL SECURITY;
ALTER TABLE salary_records         ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications          ENABLE ROW LEVEL SECURITY;

-- Helper function: get caller's company_id from their profile
CREATE OR REPLACE FUNCTION auth_company_id()
RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT company_id FROM user_profiles WHERE id = auth.uid()
$$;

-- Helper function: get caller's role
CREATE OR REPLACE FUNCTION auth_role()
RETURNS TEXT LANGUAGE sql STABLE AS $$
  SELECT role::TEXT FROM user_roles WHERE user_id = auth.uid()
$$;

-- Apply the same isolation policy to all tenant tables
-- Users can only see rows from their own company
DO $$
DECLARE
  tbl TEXT;
  tbls TEXT[] := ARRAY[
    'company_modules','user_profiles','user_roles','sites',
    'equipment','equipment_documents','equipment_meter_log',
    'shifts','shift_fuel_entries','shift_incidents','shift_work_details',
    'clients','projects','equipment_deployments',
    'maintenance_schedules','maintenance_records','lifecycle_tracking',
    'vendors','inventory_items','inventory_transactions',
    'expenses','invoices','invoice_line_items','payments',
    'operator_profiles','attendance','salary_records','notifications'
  ];
BEGIN
  FOREACH tbl IN ARRAY tbls LOOP
    EXECUTE format(
      'CREATE POLICY %I ON %I FOR ALL TO authenticated USING (company_id = auth_company_id())',
      'tenant_isolation_' || tbl, tbl
    );
  END LOOP;
END $$;

-- Companies: a user can read their own company only
CREATE POLICY company_read ON companies
  FOR SELECT TO authenticated
  USING (id = auth_company_id());

-- ============================================================
-- SEED: Core module always enabled (example — run after adding a company)
-- This is handled programmatically when you onboard a new company.
-- ============================================================

-- ============================================================
-- UPDATED_AT triggers for equipment and shifts
-- ============================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_equipment_updated_at
  BEFORE UPDATE ON equipment
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_shifts_updated_at
  BEFORE UPDATE ON shifts
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Done!
SELECT 'Nhance schema created successfully' AS status;
