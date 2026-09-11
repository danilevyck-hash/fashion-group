-- ─────────────────────────────────────────────────────────────────────────────
-- RECLAMOS — LOS VIEJOS SIN PDF SE QUEDAN CON LA FECHA DEL RECLAMO
-- (aprobado por Daniel el 11-sep-2026).
--
-- Daniel, textual: «sobre la fecha de la factura de lo viejo que no tiene pdf,
-- ponle fecha tú».
--
-- 🔑 POR QUÉ HACÍA FALTA. `reclamos.fecha_factura` nació el 10-sep-2026 y es la
-- fecha que MIDE LOS DÍAS de todo el módulo: la portada dice «el más viejo
-- lleva N días» desde ahí, y la lista ordena por ahí. Se iba a rellenar
-- releyendo los PDF de las facturas — pero la `ANTHROPIC_API_KEY` de producción
-- estaba inválida y el backfill nunca corrió, y de todos modos **ninguno de
-- estos reclamos tiene PDF**: no hay nada que releer. Hasta hoy los 29 decían
-- «Falta la fecha de la factura» en rojo y no entraban en ninguna cuenta de
-- días.
--
-- ⚠️ LA FECHA QUE SE ESCRIBE NO ES LA DE LA FACTURA: es la del RECLAMO, la
-- fecha en que Andrea lo cargó. Es la mejor aproximación que existe —la
-- factura siempre es ANTERIOR, así que los días quedan SUBESTIMADOS, nunca
-- inflados— y queda anotado en CLAUDE.md para que nadie la lea como un dato de
-- Switch. Un reclamo cuya factura se sepa de verdad se corrige desde «Editar»,
-- que pide ese campo.
--
-- 🔴 POR LISTA DE IDS, NUNCA UN UPDATE ABIERTO, y con el `WHERE` repitiendo las
-- dos condiciones: sin fecha y sin PDF. Un `UPDATE … WHERE fecha_factura IS
-- NULL` a secas también pisaría los reclamos que Andrea cargue entre hoy y el
-- día en que esta migración corra — y esos sí tienen que pedir su fecha de
-- verdad. Y si entre la medición y la corrida alguien la teclea, gana la suya.
--
-- ⚠️ MEDIDO, Y NO SON 30 SINO 29. Contra producción el 11-sep-2026
-- (scripts/_medir-reclamos-fecha-factura.mjs, solo lectura): 33 reclamos vivos,
-- 4 con fecha de factura —los MISMOS 4 que tienen PDF— y 29 sin ella, los 29
-- sin PDF. Ninguno se queda sin poder rellenarse: los 29 traen `fecha_reclamo`.
-- Van desde el 16-ago-2024 (REC-2026-0014) hasta el 26-ago-2026 (FW-2026-0007).
-- ─────────────────────────────────────────────────────────────────────────────

UPDATE reclamos
SET fecha_factura = fecha_reclamo
WHERE deleted = false
  AND fecha_factura IS NULL
  AND factura_pdf_path IS NULL
  AND fecha_reclamo IS NOT NULL
  AND id IN (
    'ce527a21-6821-4f4e-8584-33b85427fee3', -- REC-2026-0014  · Fashion Shoes          · fecha_reclamo 2024-08-16
    'f0171aa8-270c-4c80-b110-8108eaa1a11b', -- REC-2026-0011  · Fashion Shoes          · fecha_reclamo 2025-01-08
    '7901c54f-2322-45fc-9e0d-803f1cd5beed', -- REC-2026-0001  · Fashion Wear           · fecha_reclamo 2025-02-02
    '27c0e999-12de-4bec-8694-a369bab5a6bb', -- REC-2026-0012  · Fashion Shoes          · fecha_reclamo 2025-10-06
    '177f3252-f925-4a5c-8b9e-3b0bb9c215c5', -- REC-2026-0003  · Fashion Wear           · fecha_reclamo 2025-10-09
    'eb651854-0bb0-4b14-83c3-d74c642ff01c', -- REC-2026-0002  · Fashion Wear           · fecha_reclamo 2025-12-30
    '1f8e9fef-165e-461c-8dd7-cea8f5390268', -- REC-2026-0004  · Fashion Wear           · fecha_reclamo 2025-12-30
    'c3278945-bd3e-42b3-b639-f7dc67346008', -- REC-2026-0013  · Fashion Shoes          · fecha_reclamo 2026-01-05
    'c4a8b5fe-3e64-491c-ac5f-32fdf798c3e6', -- REC-2026-0005  · Fashion Wear           · fecha_reclamo 2026-02-02
    '54cabad2-cea2-418d-8759-3b4bf64eaa36', -- REC-2026-0019  · Vistana International  · fecha_reclamo 2026-02-06
    'b7ce2539-97bd-4ea3-9838-79eea549c66c', -- REC-2026-0020  · Vistana International  · fecha_reclamo 2026-03-16
    '5cd233eb-0cbf-4ee9-8c48-2a94313e997f', -- REC-2026-0006  · Fashion Wear           · fecha_reclamo 2026-04-01
    'ab4533c6-1949-4c39-8b5b-92af13392963', -- REC-2026-0010  · Fashion Shoes          · fecha_reclamo 2026-05-04
    '0f5e26c8-144f-43ed-91f6-f627611eac05', -- REC-2026-0017  · Fashion Wear           · fecha_reclamo 2026-05-11
    'e28745b0-1318-43a2-b285-83cf4407a87d', -- REC-2026-0015  · Fashion Wear           · fecha_reclamo 2026-05-11
    '7b637e4a-6525-44ec-a559-d9dbd09941b5', -- REC-2026-0016  · Fashion Wear           · fecha_reclamo 2026-05-11
    'f4423632-451e-435c-8484-d49abec3569a', -- REC-2026-0018  · Fashion Wear           · fecha_reclamo 2026-05-12
    '15a6c529-829b-4123-a171-841843c2e00c', -- REC-2026-0022  · Fashion Wear           · fecha_reclamo 2026-06-16
    '3080ef62-67b6-4a94-9f38-ebdf7870557e', -- REC-2026-0021  · Fashion Wear           · fecha_reclamo 2026-06-16
    'e755e05b-5afb-4443-83a8-2575d18ecfe3', -- REC-2026-0027  · Fashion Wear           · fecha_reclamo 2026-06-19
    'ec433d37-dae2-4c88-907b-43c2faacd6e7', -- REC-2026-0029  · Fashion Wear           · fecha_reclamo 2026-06-19
    '63842630-b58d-4b2b-815c-168a2fb84dbd', -- REC-2026-0025  · Vistana International  · fecha_reclamo 2026-06-19
    '717e41fc-22a3-4670-94b9-9ebb93c82032', -- REC-2026-0026  · Vistana International  · fecha_reclamo 2026-06-19
    '9796feb4-2ce6-4099-bb5a-cc8c42af289f', -- REC-2026-0030  · Fashion Wear           · fecha_reclamo 2026-06-19
    '60bd8c0e-6199-4081-9727-6d1748e456c4', -- REC-2026-0028  · Fashion Wear           · fecha_reclamo 2026-06-19
    'fc4eec5c-5081-4392-a2e9-494831b1cd72', -- AS-2026-0001   · Active Shoes           · fecha_reclamo 2026-07-03
    'a405a5cb-77e9-40eb-a251-dcdbf61febfd', -- FW-2026-0002   · Fashion Wear           · fecha_reclamo 2026-07-21
    '0ba1ab3c-dfd3-44ae-b1b6-b00522e470c7', -- VI-2026-0001   · Vistana International  · fecha_reclamo 2026-07-23
    '63d744e0-d324-46b2-991d-f60251263433' -- FW-2026-0007   · Fashion Wear           · fecha_reclamo 2026-08-26
  );
