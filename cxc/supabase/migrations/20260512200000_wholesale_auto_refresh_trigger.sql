-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: trigger auto-refresh de is_wholesale en ventas_raw
--
-- Regla actualizada (12 may 2026): is_wholesale = TRUE solo cuando se
-- cumplen AMBAS condiciones:
--   1. empresa = 'american_classic'
--   2. TRIM(UPPER(vendedor)) = 'DEFAULT'
--   3. cliente existe en clientes_master con deleted = false
--
-- Antes la regla solo chequeaba (1) + (2), lo que marcaba como wholesale
-- los tickets DEFAULT con cliente='CONTADO' (retail mostrador anónimo).
--
-- Este trigger mantiene is_wholesale consistente cuando un cliente se
-- agrega/edita/borra en clientes_master DESPUÉS de que sus tickets
-- ya están en ventas_raw. Sin esto, Daniel tendría que correr SQL
-- manual cada vez que da de alta un cliente.
--
-- Pareja con el parser de upload (src/app/api/ventas/upload/route.ts)
-- que ya aplica la misma regla al insertar tickets nuevos.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION refresh_wholesale_flag_on_master_change()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR TG_OP = 'UPDATE') THEN
    UPDATE ventas_raw
    SET is_wholesale = (
      TRIM(UPPER(vendedor)) = 'DEFAULT'
      AND NEW.deleted = false
    )
    WHERE empresa = 'american_classic'
      AND TRIM(UPPER(cliente)) = TRIM(UPPER(NEW.nombre));
  END IF;

  IF (TG_OP = 'DELETE') THEN
    UPDATE ventas_raw
    SET is_wholesale = false
    WHERE empresa = 'american_classic'
      AND TRIM(UPPER(cliente)) = TRIM(UPPER(OLD.nombre))
      AND TRIM(UPPER(vendedor)) = 'DEFAULT';
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_refresh_wholesale_on_clientes_master ON clientes_master;
CREATE TRIGGER trg_refresh_wholesale_on_clientes_master
AFTER INSERT OR UPDATE OR DELETE ON clientes_master
FOR EACH ROW
EXECUTE FUNCTION refresh_wholesale_flag_on_master_change();
