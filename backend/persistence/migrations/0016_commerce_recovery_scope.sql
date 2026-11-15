ALTER TABLE commerce_orders
  ADD COLUMN order_confirmation_required_at timestamptz,
  ADD COLUMN invoice_required_at timestamptz;

CREATE INDEX commerce_orders_confirmation_recovery_idx
  ON commerce_orders(order_confirmation_required_at, id)
  WHERE order_confirmation_required_at IS NOT NULL;

CREATE INDEX commerce_orders_invoice_recovery_idx
  ON commerce_orders(invoice_required_at, id)
  WHERE invoice_required_at IS NOT NULL AND payment_status = 'PAID';
