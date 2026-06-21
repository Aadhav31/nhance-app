-- ═══════════════════════════════════════════════════════════════════
-- STEP 1 — Run this FIRST, alone, then commit (click Run)
-- Adds 'sales' and 'purchase' to the module_key enum.
-- PostgreSQL requires enum values to be committed before use.
-- ═══════════════════════════════════════════════════════════════════

ALTER TYPE module_key ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE module_key ADD VALUE IF NOT EXISTS 'purchase';
