-- ═════════════════════════════════════════════════════════════════════════════
-- Despachos › Pedidos › «Muestras» (24-nov-2026, Daniel aprobó el mockup
-- «Muestras - paso a paso»). Interruptor `MUESTRAS_2026_11`.
-- ═════════════════════════════════════════════════════════════════════════════
-- Bodega abre un pedido, toca las referencias que no tiene y pide la muestra.
-- El vendedor (Vistana → edwin; las otras 5 → rey, escrito a mano en
-- `lib/guias/muestras.ts`, sin tabla) la marca «Enviada». Si no llegó, bodega
-- la reclama («No llegó») y vuelve a la lista del vendedor.
--
-- UNA FILA POR (empresa, pedido, referencia). La muestra es la referencia:
-- sin talla, color ni nota. `pedidos_lineas` trae una línea por referencia
-- (medido 24-nov-2026: 10.023 líneas, 10.018 referencias, ninguna con talla).
--
-- 🔑 SOLO AGREGA: tabla nueva; ninguna fila de otra tabla se toca.
-- Nada se borra: «Quitar muestra» = `deleted` firmado. Una sola viva por
-- referencia (índice único parcial). RLS: solo service_role.
-- ═════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS pedidos_muestras (
  id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  empresa_key       text NOT NULL,
  pedido_switch_id  integer NOT NULL,
  -- La referencia (`pedidos_lineas.codigo`) y su descripción al pedirla.
  codigo            text NOT NULL,
  descripcion       text,
  -- falta = bodega la pidió · enviada = el vendedor la mandó · no_llego = bodega la reclamó
  estado            text NOT NULL DEFAULT 'falta',
  pedida_por        text NOT NULL,
  pedida_en         timestamptz NOT NULL DEFAULT now(),
  enviada_por       text,
  enviada_en        timestamptz,
  reclamada_por     text,
  reclamada_en      timestamptz,
  deleted           boolean NOT NULL DEFAULT false,
  deleted_por       text,
  deleted_en        timestamptz,
  CONSTRAINT pedidos_muestras_estado_valido
    CHECK (estado IN ('falta', 'enviada', 'no_llego')),
  CONSTRAINT pedidos_muestras_codigo_no_vacio
    CHECK (btrim(codigo) <> ''),
  CONSTRAINT pedidos_muestras_enviada_firmada
    CHECK (estado <> 'enviada' OR (enviada_por IS NOT NULL AND enviada_en IS NOT NULL)),
  CONSTRAINT pedidos_muestras_reclamada_firmada
    CHECK (estado <> 'no_llego' OR (reclamada_por IS NOT NULL AND reclamada_en IS NOT NULL)),
  CONSTRAINT pedidos_muestras_borrado_firmado
    CHECK (NOT deleted OR (deleted_por IS NOT NULL AND deleted_en IS NOT NULL))
);

-- Una sola muestra viva por referencia del pedido.
CREATE UNIQUE INDEX IF NOT EXISTS pedidos_muestras_viva_unica
  ON pedidos_muestras (empresa_key, pedido_switch_id, codigo)
  WHERE NOT deleted;

-- La lista del vendedor: lo que falta mandar, por empresa.
CREATE INDEX IF NOT EXISTS pedidos_muestras_por_mandar
  ON pedidos_muestras (empresa_key, estado)
  WHERE NOT deleted AND estado <> 'enviada';

ALTER TABLE pedidos_muestras ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'pedidos_muestras' AND policyname = 'service_role_all'
  ) THEN
    CREATE POLICY service_role_all ON pedidos_muestras
      FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- Sin DELETE a propósito: quitar = deleted firmado.
GRANT SELECT, INSERT, UPDATE ON pedidos_muestras TO service_role;

COMMENT ON TABLE pedidos_muestras IS
  'Despachos > Pedidos > Muestras: bodega pide la muestra de una referencia y el vendedor la marca Enviada. '
  'Una fila viva por (empresa, pedido, referencia). Soft delete firmado. Ver lib/guias/muestras.ts.';

NOTIFY pgrst, 'reload schema';
