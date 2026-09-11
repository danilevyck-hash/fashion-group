-- ─────────────────────────────────────────────────────────────────────────────
-- RECLAMOS — LOS VIEJOS SIN FECHA DE RECLAMO SE MARCAN CON LA DE SU CREACIÓN
-- (aprobado por Daniel el 11-sep-2026).
--
-- Daniel, textual: «todas las hemos reclamado ya que se descarga y se envía…
-- los 9 como reclamados con la fecha en que se crearon. Va».
--
-- 🔑 POR QUÉ HACÍA FALTA. `reclamos.reclamado_en` nació el 10-sep-2026 y se
-- rellenó con la única huella que había: la primera nota «Correo con … adjunto
-- enviado a …» que el sistema escribió en `reclamo_seguimiento`. Esa huella
-- solo existe desde que el correo se manda DESDE la app. Los reclamos de antes
-- —que Andrea bajó y mandó desde su propio correo— quedaron en NULL, o sea
-- «sin reclamar», y en la portada aparecen en rojo como si nunca se le hubieran
-- cobrado al proveedor. No es cierto: se reclamaron todos.
--
-- 🔴 POR LISTA DE IDS, NUNCA UN UPDATE ABIERTO. La condición del negocio
-- (vivo, no Pagado, sin `reclamado_en`) se midió contra producción el
-- 11-sep-2026 y su resultado quedó CONGELADO acá abajo, con el N° de reclamo al
-- lado. Un `UPDATE … WHERE reclamado_en IS NULL` a secas también marcaría los
-- reclamos que Andrea cargue entre hoy y el día en que esta migración corra —
-- y esos sí están de verdad sin reclamar.
--
-- 🔴 Y NUNCA SE PISA LO QUE YA TIENE FECHA: el `WHERE` exige `IS NULL` otra
-- vez, la misma condición que cumple `marcarReclamados` en el código. Si entre
-- la medición y la corrida alguien manda uno de estos seis por correo, gana la
-- fecha real y esta migración lo deja en paz.
--
-- ⚠️ MEDIDO, Y NO SON 9 SINO 6. El encargo hablaba de los 9 sin reclamar del
-- 10-sep. Remedido el 11-sep-2026 antes de escribir esta lista: por cobrar
-- bajó de 29 ($14.939,64) a 27 ($10.674,19) y sin reclamar de 9 a 6
-- ($3.167,96). Los tres que faltan no se perdieron: FW-2026-0001 pasó a
-- Pagado ese mismo día a las 14:32 UTC, y FW-2026-0006 y FW-2026-0007 salieron
-- de la casa a las 14:33 y 14:28 y ya tienen su `reclamado_en` de verdad. La
-- lista es la de HOY, no la de ayer.
--   Medición: scripts/_medir-reclamos-adjuntos.mjs (solo lectura).
--
-- La fecha que se escribe es `created_at`: es lo que Daniel pidió y es el único
-- dato real que hay de cuándo ese reclamo existió por primera vez. No se
-- inventa una fecha de envío que nadie anotó.
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE reclamos
SET reclamado_en = created_at
WHERE deleted = false
  AND estado <> 'Pagado'
  AND reclamado_en IS NULL
  AND id IN (
    '27c0e999-12de-4bec-8694-a369bab5a6bb', -- REC-2026-0012 · Fashion Shoes         · creado 2026-05-04
    '43322771-d75f-496c-906b-257af811ea12', -- REC-2026-0034 · Vistana International · creado 2026-06-24
    'fc4eec5c-5081-4392-a2e9-494831b1cd72', -- AS-2026-0001  · Active Shoes          · creado 2026-07-03
    'a405a5cb-77e9-40eb-a251-dcdbf61febfd', -- FW-2026-0002  · Fashion Wear          · creado 2026-07-21
    '0ba1ab3c-dfd3-44ae-b1b6-b00522e470c7', -- VI-2026-0001  · Vistana International · creado 2026-07-23
    'b63bf282-6d0a-4746-b49d-2d6cfcae3aed'  -- FW-2026-0005  · Fashion Wear          · creado 2026-08-14
  );
