-- Packing Lists: agregar columna parser_metadata jsonb al header.
--
-- Motivación: trazar versión del parser, flags de ajuste manual, y
-- uso del fallback Claude por PL guardado. Permite auditoría posterior
-- sin reparsear. Ver parse-packing-list.ts → PARSER_VERSION.
--
-- Schema esperado del jsonb:
--   {
--     "parser_version": "2.0.0",
--     "ajustado_manualmente": false,
--     "bultos_ajustados": ["547982", ...],
--     "fallback_claude_usado": false,
--     "bultos_fallback": [],
--     "bultos_resueltos_nivel_1": 20,
--     "bultos_resueltos_nivel_3": 0,
--     "bultos_requirieron_manual": 0
--   }
--
-- No destructivo: ADD COLUMN con DEFAULT, existing rows reciben '{}'.
-- Idempotente: IF NOT EXISTS evita error si se corre dos veces.

ALTER TABLE packing_lists
  ADD COLUMN IF NOT EXISTS parser_metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Índice GIN para consultas futuras tipo "bultos_ajustados ?| array[...]"
-- o "parser_version = '2.0.0'". Bajo costo, alto valor analítico.
CREATE INDEX IF NOT EXISTS packing_lists_parser_metadata_idx
  ON packing_lists USING gin (parser_metadata);
