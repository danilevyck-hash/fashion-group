-- Sprint 1 Guías: agregar a guia_transporte el modo_entrega y la FK
-- transportista_id, con un CHECK que mantiene coherencia entre ambos.
--
-- Default 'entrega_directa' + transportista_id NULL permite agregar las
-- columnas sin violar el CHECK en las filas existentes. El backfill
-- (siguiente migration) reasigna las filas que sí corresponden a un
-- transportista canónico.
--
-- La columna transportista TEXT se conserva como respaldo hasta Sprint 3.

ALTER TABLE public.guia_transporte
  ADD COLUMN IF NOT EXISTS modo_entrega text NOT NULL DEFAULT 'entrega_directa',
  ADD COLUMN IF NOT EXISTS transportista_id uuid REFERENCES public.transportistas(id);

ALTER TABLE public.guia_transporte
  DROP CONSTRAINT IF EXISTS guia_transporte_modo_entrega_valido;

ALTER TABLE public.guia_transporte
  ADD CONSTRAINT guia_transporte_modo_entrega_valido
    CHECK (modo_entrega IN ('transportista', 'entrega_directa'));

ALTER TABLE public.guia_transporte
  DROP CONSTRAINT IF EXISTS guia_transporte_modo_coherente;

ALTER TABLE public.guia_transporte
  ADD CONSTRAINT guia_transporte_modo_coherente CHECK (
    (modo_entrega = 'transportista' AND transportista_id IS NOT NULL)
    OR
    (modo_entrega = 'entrega_directa' AND transportista_id IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_guia_transporte_transportista_id
  ON public.guia_transporte(transportista_id);
