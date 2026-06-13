-- ============================================================================
-- Marketing: convertir cobranza → registro de gastos
-- ============================================================================
-- Contexto: el módulo Marketing se construyó como sistema de cobranza
-- (reparto marca↔empresa, %, estados Abierto/Enviado/Cobrado del proyecto).
-- Nunca se usó la cobranza; en la práctica solo registra GASTOS de mercadeo.
-- Esta migración habilita el shape nuevo SIN tocar la data existente.
--
-- REGLA DURA — DATA INTACTA:
--   - CERO DELETE, CERO DROP COLUMN, CERO DROP TABLE.
--   - Las columnas de cobranza (porcentaje, empresa_pagadora_codigo, estado del
--     proyecto, fecha_enviado/cobrado, mk_proyecto_marcas) SE QUEDAN con su data.
--     Solo se ocultan en UI y se dejan de pedir/validar.
--   - No se borra ni modifica ninguna fila de mk_proyectos / mk_facturas /
--     mk_factura_marcas / mk_marcas.
--
-- Esta migración es ADITIVA e IDEMPOTENTE. Correr UNA vez en Supabase SQL Editor.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Estado de pago POR FACTURA (Pendiente / Pagado)
-- ----------------------------------------------------------------------------
-- Hoy el único "estado" vive en mk_proyectos (abierto/enviado/cobrado), que es
-- el workflow de cobranza que se retira. El registro de gastos necesita un
-- estado a nivel FACTURA. Lo agregamos con default 'pendiente': las 72 facturas
-- existentes quedan 'pendiente' automáticamente (no se reescribe ninguna fila).
ALTER TABLE mk_facturas
  ADD COLUMN IF NOT EXISTS estado_pago TEXT NOT NULL DEFAULT 'pendiente'
  CHECK (estado_pago IN ('pendiente', 'pagado'));

-- ----------------------------------------------------------------------------
-- 2. Permitir empresa_codigo NULL en mk_marcas (para la marca "Otros")
-- ----------------------------------------------------------------------------
-- "Otros" no pertenece a ninguna empresa del grupo. La columna era NOT NULL;
-- la relajamos. El CHECK `empresa_codigo IN (...)` sigue intacto y acepta NULL
-- (en SQL, `NULL IN (...)` es NULL → el CHECK se satisface). Las filas
-- existentes no cambian: todas ya tienen un empresa_codigo válido.
ALTER TABLE mk_marcas
  ALTER COLUMN empresa_codigo DROP NOT NULL;

-- ----------------------------------------------------------------------------
-- 3. Marcas nuevas: French Connection y Otros
-- ----------------------------------------------------------------------------
-- - French Connection → empresa active_wear (ya está en el CHECK de empresa_codigo).
-- - Otros → empresa_codigo NULL (sin empresa).
-- `tipo` ya no importa en el flujo de gastos; se fija 'externa' (valor válido del
-- CHECK) solo para no romper la columna NOT NULL.
-- ON CONFLICT (nombre) DO NOTHING → re-correr la migración no duplica.
INSERT INTO mk_marcas (nombre, codigo, empresa_codigo, tipo, activo)
VALUES
  ('French Connection', 'FC',  'active_wear', 'externa', TRUE),
  ('Otros',             'OTR', NULL,          'externa', TRUE)
ON CONFLICT (nombre) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 4. Validación (no modifica nada) — revisar el output en el SQL Editor
-- ----------------------------------------------------------------------------
-- 4a. La columna estado_pago existe y todas las facturas quedaron 'pendiente'.
SELECT estado_pago, COUNT(*) AS facturas
FROM mk_facturas
GROUP BY estado_pago;

-- 4b. El catálogo de marcas ahora tiene las 6 esperadas.
SELECT nombre, codigo, empresa_codigo, tipo, activo
FROM mk_marcas
ORDER BY nombre;

-- 4c. Conteos intactos (esperado: proyectos=18, facturas=72, factura_marcas=81).
SELECT
  (SELECT COUNT(*) FROM mk_proyectos)       AS proyectos,
  (SELECT COUNT(*) FROM mk_facturas)        AS facturas,
  (SELECT COUNT(*) FROM mk_factura_marcas)  AS factura_marcas,
  (SELECT COUNT(*) FROM mk_proyecto_marcas) AS proyecto_marcas;
