-- ============================================================
-- H10: Auto-update updated_at on row modification
-- Run this in Supabase SQL Editor
-- ============================================================

-- Reusable trigger function
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables that have updated_at but no trigger

CREATE TRIGGER trg_reclamos_updated_at
  BEFORE UPDATE ON reclamos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_ventas_mensuales_updated_at
  BEFORE UPDATE ON ventas_mensuales
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_vendor_assignments_updated_at
  BEFORE UPDATE ON vendor_assignments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_cxc_client_overrides_updated_at
  BEFORE UPDATE ON cxc_client_overrides
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_role_permissions_updated_at
  BEFORE UPDATE ON role_permissions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_role_passwords_updated_at
  BEFORE UPDATE ON role_passwords
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_reebok_orders_updated_at
  BEFORE UPDATE ON reebok_orders
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_fg_users_updated_at
  BEFORE UPDATE ON fg_users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
