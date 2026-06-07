-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: is_wholesale en american_classic = SOLO La Frontera Duty Free
--
-- REGLA DE NEGOCIO (confirmada por Daniel, jun 2026): en american_classic
-- (Multifashion) el unico cliente wholesale es La Frontera Duty Free (todas sus
-- variantes de nombre). Cualquier otro cliente es retail.
--
-- BUG previo: la regla retail-mixto (vendedor='DEFAULT' AND cliente identificado,
-- ver 20260529000000) marcaba como wholesale a ~35 clientes de mostrador (incl.
-- VENTAS MAHER y un par Factura+Nota de Credito de Joystep que netea a cero). Eso
-- inflaba Mayoreo y hacia que MAHER apareciera en wholesale Y como #1 retail.
--
-- POR QUE NO ES UN UPDATE SIMPLE: switch_facturas.is_wholesale era una columna
-- GENERATED ALWAYS (no admite UPDATE) y la vista _multifashion_sf_vw depende de
-- ella (un DROP COLUMN haria CASCADE de la vista). Solucion: convertir la columna
-- de generada a normal con DROP EXPRESSION (conserva valores, NO toca la vista),
-- reflagear las filas existentes, y mantener las filas futuras con un trigger
-- BEFORE INSERT/UPDATE que computa la misma regla.
--
-- ALCANCE: solo cambia american_classic. Las 6 B2B siguen siempre wholesale;
-- confecciones_boston conserva su regla retail-mixto.
--
-- NOTA legacy: el trigger refresh_wholesale_flag_on_master_change opera sobre
-- ventas_raw (tabla CONGELADA tras Fuente Unica API; Multifashion ya no la lee).
-- Se deja intacto a proposito: tocarlo dispararia en cada cambio de
-- clientes_master (cron diario) sin beneficio para el modulo vivo.
--
-- Aplicar manual en Supabase Dashboard, SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Convertir is_wholesale de GENERATED ALWAYS a columna normal.
--    Conserva los valores actuales; la vista _multifashion_sf_vw sigue valida.
ALTER TABLE switch_facturas ALTER COLUMN is_wholesale DROP EXPRESSION IF EXISTS;

-- 2. Reflag de filas EXISTENTES de american_classic a la regla Frontera.
--    Frontera (cualquier variante) -> true; todo lo demas -> false.
--    Tolerante a espacios/mayusculas. Las B2B y boston conservan sus valores.
UPDATE switch_facturas
SET is_wholesale = (UPPER(TRIM(COALESCE(cliente_nombre, ''))) LIKE '%FRONTERA%')
WHERE empresa_key = 'american_classic';

-- 3. Filas FUTURAS: trigger que computa is_wholesale en cada INSERT/UPDATE,
--    replicando la regla por empresa (la columna ya no es generada).
CREATE OR REPLACE FUNCTION switch_facturas_set_is_wholesale()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_wholesale := CASE
    -- 6 empresas B2B: wholesale siempre.
    WHEN NEW.empresa_key IN (
      'vistana', 'fashion_wear', 'fashion_shoes',
      'active_shoes', 'active_wear', 'joystep'
    ) THEN true
    -- american_classic: wholesale SOLO si el cliente es La Frontera Duty Free.
    WHEN NEW.empresa_key = 'american_classic' THEN (
      UPPER(TRIM(COALESCE(NEW.cliente_nombre, ''))) LIKE '%FRONTERA%'
    )
    -- confecciones_boston: regla retail-mixto previa (sin cambios).
    WHEN NEW.empresa_key = 'confecciones_boston' THEN (
      UPPER(TRIM(COALESCE(NEW.vendedor_nombre, ''))) = 'DEFAULT'
      AND UPPER(TRIM(COALESCE(NEW.cliente_nombre, ''))) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
    )
    ELSE false
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_switch_facturas_is_wholesale ON switch_facturas;
CREATE TRIGGER trg_switch_facturas_is_wholesale
BEFORE INSERT OR UPDATE ON switch_facturas
FOR EACH ROW
EXECUTE FUNCTION switch_facturas_set_is_wholesale();

COMMENT ON COLUMN switch_facturas.is_wholesale IS
  'Columna normal mantenida por el trigger trg_switch_facturas_is_wholesale. '
  '6 B2B = true siempre; american_classic = true solo si cliente_nombre matchea '
  'FRONTERA (La Frontera Duty Free); confecciones_boston = vendedor DEFAULT con '
  'cliente identificado; resto = false. Mantener la lista B2B sincronizada con '
  'B2B_EMPRESA_KEYS en src/lib/empresa-mapping.ts (no se puede importar TS en SQL).';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VALIDACION POST-APLICACION (correr aparte; deben dar lo esperado):
--
-- A) wholesale=true en american_classic debe ser SOLO La Frontera Duty Free:
--    SELECT cliente_nombre, COUNT(*) AS filas, SUM(subtotal_descuento) AS venta
--    FROM switch_facturas
--    WHERE empresa_key = 'american_classic' AND is_wholesale = true
--    GROUP BY cliente_nombre;
--    -> esperado: una sola fila, LA FRONTERA DUTY FREE.
--
-- B) VENTAS MAHER debe quedar SOLO en retail (is_wholesale=false):
--    SELECT is_wholesale, COUNT(*) FROM switch_facturas
--    WHERE empresa_key = 'american_classic' AND cliente_nombre ILIKE '%MAHER%'
--    GROUP BY is_wholesale;
--    -> esperado: solo false.
-- ─────────────────────────────────────────────────────────────────────────────
