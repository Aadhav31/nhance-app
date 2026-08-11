-- Migration: add missing columns to expenses table
-- Run in Supabase SQL Editor

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS vendor_gstin    text,
  ADD COLUMN IF NOT EXISTS payment_mode    text    NOT NULL DEFAULT 'cash',
  ADD COLUMN IF NOT EXISTS bank_reference  text,
  ADD COLUMN IF NOT EXISTS expense_scope   text,
  ADD COLUMN IF NOT EXISTS equipment_id    uuid    REFERENCES public.equipment(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS gst_amount      numeric(12,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source          text    DEFAULT 'manual';
