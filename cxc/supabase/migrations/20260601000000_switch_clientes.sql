-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: switch_clientes (directorio de clientes Switch — PUENTE id→codigo)
--
-- PROBLEMA QUE RESUELVE (sprint Clientes fase 2):
-- El tab Clientes leía de ventas_raw (CSV manual, incompleto: omite facturas
-- mayoristas B2B que la API sí captura). Para migrarlo a switch_facturas hace
-- falta puentear switch_facturas.(empresa_key, cliente_switch_id) → codigo D-XXX
-- → clientes_master.codigo.
--
-- switch_estadocuenta NO sirve de puente: es un snapshot de cuentas por cobrar y
-- solo contiene clientes con documentos abiertos/cerrados. Los clientes de
-- CONTADO (duty-free, distribuidoras) tienen facturas pero ningún documento de
-- CXC → no aparecen → su venta se perdería. Verificado: 29 clientes reales /
-- $118,766 net 2026 quedaban sin puente vía estadocuenta.
--
-- SOLUCIÓN (Opción A, validada contra API en vivo): persistir el directorio
-- completo /apicliente/lista (que SÍ incluye clientes de contado) en esta tabla.
-- Cobertura validada: 178/187 pares (empresa,cid) de facturas 2026 resuelven a
-- codigo; el residual (~9 pares, ~$5.7K) es POS genérico ("Ventas Locales") +
-- 2 clientes huérfanos sin registro en el directorio → caen al bucket "Otros
-- clientes" (cliente_id null), comportamiento ya existente, sin pérdida silente.
--
-- IDENTIDAD: cada instancia de Switch tiene su propio espacio de IDs de cliente
-- (cid=15 = Quality Shoes en vistana/fashion_wear pero Dollar Mall en joystep),
-- por eso la unicidad y el puente son SIEMPRE (empresa_key, cliente_switch_id),
-- nunca el id solo.
--
-- POBLADO: el sync de estadocuenta (syncEmpresaEstadoCuenta) ya descarga el
-- directorio completo para iterar; ahora también lo persiste acá (upsert). Crons
-- estadocuenta corren 5:45–5:59 UTC para las 6 B2B. Para poblar de inmediato sin
-- esperar el cron: scripts/backfill-switch-clientes.mjs.
--
-- Empresas: las 6 B2B con codigo D-XXX (= B2B_EMPRESA_KEYS / empresasConCxc()).
-- Boston y Multifashion no tienen codigo D-XXX y no se puentean.
--
-- Aplicar manual en Supabase Dashboard → SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS switch_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  empresa_key text NOT NULL,

  -- Identidad en Switch (por empresa)
  cliente_switch_id int NOT NULL,

  -- Mapeo al esquema D-XXX (clientes_master.codigo)
  codigo text,
  nombre text,
  razonsocial text,
  email text,
  telefono text,
  celular text,
  identificacion text,

  raw_data jsonb,

  synced_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (empresa_key, cliente_switch_id)
);

-- Puente principal: (empresa_key, cliente_switch_id) ya cubierto por el UNIQUE.
-- Índice por codigo para el JOIN a clientes_master en las vistas de clientes.
CREATE INDEX IF NOT EXISTS idx_switch_clientes_codigo
  ON switch_clientes (codigo);

ALTER TABLE switch_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY service_role_all ON switch_clientes
  FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
