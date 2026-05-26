-- Sprint 2 Guías: la columna `transportista` TEXT pasa a NULLABLE.
-- Sprint 1 normalizó los nombres y movió la fuente de verdad a
-- (modo_entrega, transportista_id). A partir de Sprint 2 los INSERT/UPDATE
-- nuevos dejan esta columna en NULL; la columna se mantiene como respaldo
-- de las 94 filas históricas hasta que Sprint 3 la elimine.

ALTER TABLE public.guia_transporte
  ALTER COLUMN transportista DROP NOT NULL;
