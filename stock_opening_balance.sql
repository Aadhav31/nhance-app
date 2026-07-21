-- Opening balance backfill
-- Creates stock_in transaction records for stock already in inventory_stock
-- (stock that was seeded directly without going through the Stock In form)
-- Run ONCE in Supabase SQL Editor

INSERT INTO stock_transactions (
  company_id, txn_number, txn_type, txn_date,
  item_id, store_id,
  quantity, unit, unit_cost, total_cost,
  notes, requires_bill, action_taken
)
SELECT
  s.company_id,
  'OPN-' || LPAD(ROW_NUMBER() OVER (ORDER BY s.id)::text, 4, '0'),
  'in',
  CURRENT_DATE,
  s.item_id,
  s.store_id,
  s.quantity_on_hand,
  i.unit,
  COALESCE(s.avg_unit_cost, 0),
  s.quantity_on_hand * COALESCE(s.avg_unit_cost, 0),
  'Opening balance (imported)',
  false,
  false
FROM inventory_stock s
JOIN inventory_items i ON i.id = s.item_id
WHERE s.quantity_on_hand > 0
  AND NOT EXISTS (
    -- Skip items that already have a stock_in transaction
    SELECT 1 FROM stock_transactions t
    WHERE t.item_id = s.item_id
      AND t.store_id = s.store_id
      AND t.company_id = s.company_id
      AND t.txn_type = 'in'
  );
