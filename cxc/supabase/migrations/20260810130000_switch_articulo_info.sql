-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_articulo_info + sync_type 'articulo_info' en switch_sync_log
--
-- Fase 2 (reducida) del tab Ventas › Referencia. Snapshot del catálogo de
-- Switch por empresa: descripción REAL (nombre comercial — switch_articulo_diario
-- solo trae categoría+género), existencia disponible y precio de etiqueta.
--
-- ⚠️ `costo_api` guarda el campo `costo` crudo de /apiarticulos/lista, PERO NO
-- SE MUESTRA EN PANTALLA. Medido el 10-ago-2026 con 3 códigos donde la ficha
-- de Switch muestra FOB ≠ CIF (scripts/_diag-fob-3-codigos.ts): la API manda
-- EL CIF (3.19/10.01/39.60 contra FOB 2.90/9.10/36.00). Decisión de Daniel:
-- CIF no se muestra y el FOB jamás se deriva. La columna queda almacenada por
-- si Switch expone el FOB algún día.
--
-- Sin cron: lo dispara el botón "Actualizar datos de Switch" del tab
-- (POST /api/ventas/referencia/actualizar), por empresa, con el lock existente
-- de switch_sync_log (sesión única de Switch).
--
-- ── PARTE 2: el CHECK de sync_type ──────────────────────────────────────────
-- La lección de 'articulo_marca' (migración 20260807200000): crear la tabla sin
-- tocar el CHECK deja al logger degradable tragándose el INSERT → corridas
-- INVISIBLES (ni running, ni success, ni error) y sin lock anti-solape. La
-- lista de abajo tiene que quedar IDÉNTICA a SYNC_LOG_TYPES
-- (src/lib/switch-api/sync-log-tipos.ts); el candado
-- src/__tests__/lib/sync-log-tipos-check.test.ts compara las dos.
--
-- Seguro de correr en caliente: tablas chicas, ALTER con lock brevísimo.
-- Evitar igual las ventanas de sync: 05:30-07:35 y 23:50-00:20 UTC.
--
-- Aplicar manual en Supabase Dashboard -> SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_articulo_info (
  empresa_key      text NOT NULL,
  articulo_id      int,
  codigo           text NOT NULL,
  -- Nombre comercial del catálogo (p.ej. "KAHLO PASSCASE"), no la categoría.
  descripcion      text,
  -- `disponible` de /apiarticulos/lista = existencia física − comprometido.
  -- Puede ser negativa (sobreventa registrada en Switch).
  existencia       numeric(18,4),
  -- `precio` de /apiarticulos/lista: el precio de etiqueta vigente.
  precio_etiqueta  numeric(14,4),
  -- `costo` crudo del endpoint. NO SE MUESTRA (ver encabezado): FOB/CIF sin
  -- confirmar. Solo se almacena.
  costo_api        numeric(14,4),
  synced_at        timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (empresa_key, codigo)
);

ALTER TABLE switch_articulo_info ENABLE ROW LEVEL SECURITY;
CREATE POLICY service_role_all ON switch_articulo_info FOR ALL TO service_role USING (true) WITH CHECK (true);
GRANT ALL ON switch_articulo_info TO service_role;

-- ── sync_type 'articulo_info' (un CHECK no se extiende: se reescribe entero) ─

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'articulo_marca',
    'articulo_info',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy'
  ));

-- ── Verificacion (correr despues; debe listar articulo_info) ────────────────
--   SELECT pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname = 'switch_sync_log_sync_type_check';
