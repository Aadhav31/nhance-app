-- Enable Supabase Realtime on all Nhance tables
-- Run this once in your Supabase SQL Editor (Dashboard → SQL Editor → New Query)

ALTER PUBLICATION supabase_realtime ADD TABLE account_transactions;
ALTER PUBLICATION supabase_realtime ADD TABLE expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE field_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE fixed_expenses;
ALTER PUBLICATION supabase_realtime ADD TABLE fixed_expense_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE client_invoices;
ALTER PUBLICATION supabase_realtime ADD TABLE invoice_line_items;
ALTER PUBLICATION supabase_realtime ADD TABLE invoice_payments;
ALTER PUBLICATION supabase_realtime ADD TABLE equipment;
ALTER PUBLICATION supabase_realtime ADD TABLE daily_operations;
ALTER PUBLICATION supabase_realtime ADD TABLE hr_employees;
ALTER PUBLICATION supabase_realtime ADD TABLE maintenance_logs;
ALTER PUBLICATION supabase_realtime ADD TABLE inventory_items;
ALTER PUBLICATION supabase_realtime ADD TABLE projects;
