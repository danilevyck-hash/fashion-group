-- ─────────────────────────────────────────────────────────────────────────────
-- Candado de espacios en el catálogo de descripciones del Depurador.
--
-- Regla de Daniel (25-ago-2026), textual: «Lo del espacio si me da miedo. Debe
-- de ser con uno». Nunca puede entrar al catálogo una descripción con espacio
-- doble ni con espacio al principio o al final: "Men-Shirts  L/S" y
-- "Men-Shirts L/S" tienen que ser la MISMA fila, no dos gemelas.
--
-- El código ya lo garantiza: todos los caminos de escritura pasan por
-- normalizarEspacios() (src/lib/depurador/veredicto.ts). Este CHECK es el
-- refuerzo en la base, para que ningún camino futuro (script, SQL a mano, otro
-- endpoint) pueda meter una fila sucia.
--
-- Estado al 25-ago-2026 (medido contra producción): 240 filas, 0 con espacio
-- doble o al borde. El catálogo YA está limpio → la restricción entra sin
-- migrar un solo dato.
--
-- Migración ADITIVA e idempotente (drop constraint if exists + add).
-- ─────────────────────────────────────────────────────────────────────────────

alter table depurador_descripciones
  drop constraint if exists depurador_descripciones_espacios_limpios;

alter table depurador_descripciones
  add constraint depurador_descripciones_espacios_limpios
  check (
    descripcion <> ''
    and descripcion = btrim(regexp_replace(descripcion, '\s+', ' ', 'g'))
  );
