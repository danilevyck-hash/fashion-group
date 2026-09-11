-- ─────────────────────────────────────────────────────────────────────────────
-- RECLAMOS — EL REDISEÑO (aprobado por Daniel el 10/11-sep-2026)
--
-- Daniel, textual: «el uso es poner el reclamo y guardar para saber que nos
-- deben… solo se crea, se descarga y se manda… lo más importante es tener el
-- dato y saber si se pagó o no».
--
-- Cuatro cosas, todas ADITIVAS y ACOTADAS:
--
-- 1. `reclamos.reclamado_en` — cuándo salió el reclamo hacia el proveedor por
--    primera vez (correo o descarga). Medido el 10-sep-2026: de 29 por cobrar,
--    20 ya se mandaron ($5.347,61) y 9 NUNCA ($9.592,03, el 64% de la plata) —
--    y en pantalla los 29 se veían iguales. Se rellena con la PRIMERA nota
--    «Correo con … adjunto enviado a …» que el sistema escribió en
--    `reclamo_seguimiento` (autor 'Sistema'): es la única huella que había.
--
-- 2. `reclamos.fecha_factura` — la fecha de la factura del proveedor. Daniel:
--    «viejo es factura, no creado». El lector de PDF YA la sacaba y se
--    descartaba. Se rellena releyendo los PDF que existen
--    (`scripts/_backfill-reclamos-fecha-factura.mjs`); el resto lo teclea
--    Andrea — Daniel: «releo los PDF que existan y el resto lo teclea Andrea».
--
-- 3. Dos reclamos con facturas PEGADAS sin separador, corregidos POR ID:
--      REC-2026-0019: «30000132323000011913» son 3000013232 y 3000011913
--      REC-2026-0020: «30000136603000013658» son 3000013660 y 3000013658
--    Se compara con el valor EXACTO de hoy: si alguien ya lo corrigió a mano,
--    no se toca. Nada de LIKE.
--
-- 4. El bucket `reclamo-fotos` pasa a PRIVADO (Daniel, 11-sep-2026: «Link
--    público ciérralo»): las fotos y los 5 comprobantes de pago dejaban de
--    abrirse sin sesión. El código firma las URL desde el servidor.
--
-- Nada se borra, nada cambia de tipo. `estado` conserva su CHECK con
-- 'En proceso' (0 filas; se retiró de la PANTALLA, no de la base).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS reclamado_en timestamptz;
COMMENT ON COLUMN reclamos.reclamado_en IS
  'Primera vez que el reclamo salio hacia el proveedor (correo enviado o Excel/PDF descargado). Se escribe una sola vez y nunca se pisa. NULL = todavia sin reclamar.';

ALTER TABLE reclamos ADD COLUMN IF NOT EXISTS fecha_factura date;
COMMENT ON COLUMN reclamos.fecha_factura IS
  'Fecha de la factura del proveedor (la que dice el PDF). Es la que mide los dias del reclamo. NULL = falta: la pantalla lo dice y Editar la pide.';

-- 1. Relleno de reclamado_en desde la primera nota de correo enviado del sistema.
UPDATE reclamos r
SET reclamado_en = s.primera
FROM (
  SELECT reclamo_id, min(created_at) AS primera
  FROM reclamo_seguimiento
  WHERE autor = 'Sistema'
    AND nota LIKE 'Correo con % adjunto enviado a %'
  GROUP BY reclamo_id
) s
WHERE s.reclamo_id = r.id
  AND r.reclamado_en IS NULL;

-- 3. Las dos facturas pegadas, por id y con el valor exacto de hoy.
UPDATE reclamos
SET nro_factura = '3000012777 - 3000010397 - 3000013232 - 3000011913 - 3000011361',
    updated_at = now()
WHERE id = '54cabad2-cea2-418d-8759-3b4bf64eaa36'
  AND nro_factura = '3000012777 - 3000010397 -30000132323000011913 - 3000011361 -   ';

UPDATE reclamos
SET nro_factura = '3000013662 - 3000013657 - 3000013660 - 3000013658',
    updated_at = now()
WHERE id = 'b7ce2539-97bd-4ea3-9838-79eea549c66c'
  AND nro_factura = '3000013662 - 3000013657 - 30000136603000013658 - 3000013662 -  ';

-- 4. El bucket de fotos y comprobantes deja de ser publico.
UPDATE storage.buckets SET public = false WHERE id = 'reclamo-fotos';

NOTIFY pgrst, 'reload schema';

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICACION (correr a mano despues de aplicar):
--   SELECT count(*) FILTER (WHERE reclamado_en IS NOT NULL) AS reclamados,
--          count(*) FILTER (WHERE reclamado_en IS NULL)     AS sin_reclamar
--     FROM reclamos WHERE deleted = false AND estado <> 'Pagado';
--   Esperado: 20 y 9.
--   SELECT nro_reclamo, nro_factura FROM reclamos
--    WHERE id IN ('54cabad2-cea2-418d-8759-3b4bf64eaa36','b7ce2539-97bd-4ea3-9838-79eea549c66c');
--   SELECT public FROM storage.buckets WHERE id = 'reclamo-fotos';  -- false
-- ─────────────────────────────────────────────────────────────────────────────
