-- Add is_preorder flag to reebok_order_items so we can separate pre-orders from regular items
-- in the order PDF, email, and warehouse view. Pre-order items do not have stock yet.
-- Idempotent: safe to run multiple times.

ALTER TABLE reebok_order_items
  ADD COLUMN IF NOT EXISTS is_preorder boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS reebok_order_items_is_preorder_idx
  ON reebok_order_items (is_preorder)
  WHERE is_preorder = true;
