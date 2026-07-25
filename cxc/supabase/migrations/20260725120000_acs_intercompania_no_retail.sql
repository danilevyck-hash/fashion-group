-- ─────────────────────────────────────────────────────────────────────────────
-- ACS (american_classic): la venta INTERCOMPANIA no cuenta como retail
--
-- REGLA DE NEGOCIO (Daniel, 25-jul-2026): en american_classic (tienda
-- Multifashion) el pulso de retail son las ventas de mostrador. NO son retail:
--   a) La Frontera Duty Free (regla previa de jun-2026, se conserva), y
--   b) las ventas a EMPRESAS DEL PROPIO GRUPO (traslados/ventas intercompania
--      facturados por la caja de la tienda).
--
-- HALLAZGO que motiva el cambio (audit 25-jul, historico completo de 28,178
-- facturas de ACS): solo existen DOS casos intercompania en toda la historia.
--   * ACTIVE WEAR, S.A. — 11-000026432, 9-jul-2026, subtotal 2,208.90,
--     vendedor DEFAULT, descuento 0%, condicion CREDITO sin pagar. Es el unico
--     con monto vivo: vale 6.44% del mes de julio y ~9 puntos porcentuales del
--     crecimiento YoY reportado (+38.9% -> +29.9%).
--   * JOYSTEP — 5 y 6-mar-2026, factura +1,800.00 y nota de credito -1,800.00
--     que netean a cero (el monto del mes no cambia; solo salen del conteo).
-- Anos anteriores: cero casos. La base 2025 ya estaba limpia (Frontera excluida),
-- por eso hoy la comparacion YoY es asimetrica y sobreestima el crecimiento.
--
-- POR QUE UN TRIGGER Y NO UN UPDATE: is_wholesale dejo de ser GENERATED en
-- 20260606180000 y su valor lo fija el trigger switch_facturas_set_is_wholesale
-- en cada INSERT/UPDATE. Un UPDATE suelto lo revierte el proximo sync.
--
-- ALCANCE: solo american_classic. Las 6 B2B siguen wholesale siempre y
-- confecciones_boston conserva su regla retail-mixto, ambas intactas.
--
-- Aplicar manual en Supabase Dashboard, SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. Predicado unico (misma logica para el reflag y para el trigger).
--    Se usa LIKE sobre el nombre normalizado a mayusculas y sin espacios extremos.
CREATE OR REPLACE FUNCTION acs_cliente_no_retail(p_cliente_nombre text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%FRONTERA%'      -- duty free (regla jun-2026)
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%VISTANA%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%FASHION WEAR%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%FASHION SHOES%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%ACTIVE WEAR%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%ACTIVE SHOES%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%JOYSTEP%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%JOYBEES%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%CONFECCIONES BOSTON%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%MULTIFASHION%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%MULTI FASHION%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%AMERICAN CLASSIC%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%AMERICAN FASHION%'
      OR UPPER(TRIM(COALESCE(p_cliente_nombre, ''))) LIKE '%AMERICAN DESIGNER%';
$$;

COMMENT ON FUNCTION acs_cliente_no_retail(text) IS
  'ACS: TRUE si el cliente NO es mostrador (duty free o empresa del grupo). Al abrir una empresa nueva del grupo, agregar su patron aqui.';

-- 2. Reflag de las filas EXISTENTES de american_classic.
--    Verificado contra produccion: afecta 3 filas (1 Active Wear + 2 Joystep);
--    las de Frontera ya estaban en true y siguen igual.
UPDATE switch_facturas
SET is_wholesale = acs_cliente_no_retail(cliente_nombre)
WHERE empresa_key = 'american_classic'
  AND is_wholesale IS DISTINCT FROM acs_cliente_no_retail(cliente_nombre);

-- 3. Filas FUTURAS: mismo trigger, la rama de american_classic ahora delega
--    en el predicado. Las otras ramas quedan EXACTAMENTE como estaban.
CREATE OR REPLACE FUNCTION switch_facturas_set_is_wholesale()
RETURNS TRIGGER AS $$
BEGIN
  NEW.is_wholesale := CASE
    -- 6 empresas B2B: wholesale siempre.
    WHEN NEW.empresa_key IN (
      'vistana', 'fashion_wear', 'fashion_shoes',
      'active_shoes', 'active_wear', 'joystep'
    ) THEN true
    -- american_classic: NO retail si es duty free o empresa del grupo.
    WHEN NEW.empresa_key = 'american_classic' THEN
      acs_cliente_no_retail(NEW.cliente_nombre)
    -- confecciones_boston: regla retail-mixto previa (sin cambios).
    WHEN NEW.empresa_key = 'confecciones_boston' THEN (
      UPPER(TRIM(COALESCE(NEW.vendedor_nombre, ''))) = 'DEFAULT'
      AND UPPER(TRIM(COALESCE(NEW.cliente_nombre, ''))) NOT IN ('CONTADO', 'CONSUMIDOR FINAL', '')
    )
    ELSE COALESCE(NEW.is_wholesale, false)
  END;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Verificacion post-aplicacion (correr y comparar):
--    Debe devolver 3 filas: ACTIVE WEAR (2,208.90) y las 2 de JOYSTEP.
-- SELECT fecha, secuencial, cliente_nombre, subtotal, tipo_comprobante, is_wholesale
--   FROM switch_facturas
--  WHERE empresa_key = 'american_classic' AND is_wholesale = true
--    AND UPPER(cliente_nombre) NOT LIKE '%FRONTERA%'
--  ORDER BY fecha;
