-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: trigger wholesale defensivo (4 jul 2026)
--
-- QUÉ ARREGLA: el cron sync-clientes-master moría con statement timeout.
-- Cada fila upserteada en clientes_master disparaba
-- trg_refresh_wholesale_on_clientes_master, cuya función hace
-- UPDATE ventas_raw WHERE TRIM(UPPER(cliente)) = ... — sin índice de
-- expresión eso es un scan de ~25K filas POR CADA fila del upsert (O(N por M)).
--
-- Tres defensas (la semántica de negocio queda EXACTA a la migración
-- 20260512200000_wholesale_auto_refresh_trigger.sql):
--   1. Índice de expresión parcial sobre ventas_raw para que el UPDATE del
--      trigger sea un index lookup en vez de scan.
--   2. El trigger de UPDATE solo dispara cuando cambia nombre o deleted
--      (el upsert diario del cron reescribe filas sin cambiar nada relevante).
--      Postgres no permite un WHEN con OLD y NEW en un trigger combinado
--      INSERT OR UPDATE OR DELETE, así que se divide en 3 triggers (ins/upd/del)
--      que comparten la misma función. INSERT y DELETE disparan igual que hoy.
--   3. La función solo escribe filas cuyo is_wholesale realmente cambia
--      (IS DISTINCT FROM el valor calculado) — cero WAL/bloat en no-ops.
--
-- IDEMPOTENTE: IF NOT EXISTS / OR REPLACE / DROP IF EXISTS — se puede correr
-- varias veces sin efectos secundarios.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Índice de expresión parcial: doble paréntesis obligatorio para expresión.
CREATE INDEX IF NOT EXISTS idx_ventas_raw_ac_cliente_norm
  ON ventas_raw ((TRIM(UPPER(cliente))))
  WHERE empresa = 'american_classic';

-- 2. Función: misma regla de negocio que 20260512200000 (vendedor DEFAULT +
--    fila viene de clientes_master + NEW.deleted), con guarda anti-reescritura.
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
      AND TRIM(UPPER(cliente)) = TRIM(UPPER(NEW.nombre))
      -- Solo tocar filas cuyo flag realmente cambia (evita WAL/bloat en no-ops).
      AND is_wholesale IS DISTINCT FROM (
        TRIM(UPPER(vendedor)) = 'DEFAULT'
        AND NEW.deleted = false
      );
  END IF;

  IF (TG_OP = 'DELETE') THEN
    UPDATE ventas_raw
    SET is_wholesale = false
    WHERE empresa = 'american_classic'
      AND TRIM(UPPER(cliente)) = TRIM(UPPER(OLD.nombre))
      AND TRIM(UPPER(vendedor)) = 'DEFAULT'
      AND is_wholesale IS DISTINCT FROM false;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- 3. Reemplazar el trigger combinado por 3 triggers con la misma función.
--    UPDATE solo dispara cuando cambia nombre o deleted.
DROP TRIGGER IF EXISTS trg_refresh_wholesale_on_clientes_master ON clientes_master;
DROP TRIGGER IF EXISTS trg_refresh_wholesale_master_ins ON clientes_master;
DROP TRIGGER IF EXISTS trg_refresh_wholesale_master_upd ON clientes_master;
DROP TRIGGER IF EXISTS trg_refresh_wholesale_master_del ON clientes_master;

CREATE TRIGGER trg_refresh_wholesale_master_ins
AFTER INSERT ON clientes_master
FOR EACH ROW
EXECUTE FUNCTION refresh_wholesale_flag_on_master_change();

CREATE TRIGGER trg_refresh_wholesale_master_upd
AFTER UPDATE ON clientes_master
FOR EACH ROW
WHEN (OLD.nombre IS DISTINCT FROM NEW.nombre OR OLD.deleted IS DISTINCT FROM NEW.deleted)
EXECUTE FUNCTION refresh_wholesale_flag_on_master_change();

CREATE TRIGGER trg_refresh_wholesale_master_del
AFTER DELETE ON clientes_master
FOR EACH ROW
EXECUTE FUNCTION refresh_wholesale_flag_on_master_change();
