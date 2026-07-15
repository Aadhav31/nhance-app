-- ─────────────────────────────────────────────────────────────────────────────
-- add_project_timeline_fields.sql
-- Adds commencement hour and document attachment URL columns to the projects
-- table, so that mobilization and commencement documentary evidence can be
-- saved alongside the corresponding date fields.
--
-- HOW TO RUN:
--   Supabase Dashboard → SQL Editor → paste & run this file.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS start_time          TIME,
  ADD COLUMN IF NOT EXISTS mob_attachment_url  TEXT,
  ADD COLUMN IF NOT EXISTS comm_attachment_url TEXT;
