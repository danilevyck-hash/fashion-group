-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: cxc_emails_enviados — se anota TAMBIÉN el WhatsApp y el copiar.
--
-- 🩸 QUÉ PASABA (medido el 5-sep-2026): la tabla se llama «emails enviados» y
-- eso es literal — solo el correo dejaba rastro. Tiene **19 filas en toda su
-- historia, todas entre el 9 y el 14 de julio de 2026**. WhatsApp y «copiar el
-- mensaje», que es como se cobra de verdad, no dejaban ninguna, así que la
-- pantalla no podía decirle a nadie «a este cliente ya le escribiste ayer» y
-- dos personas podían mandarle el mismo estado de cuenta el mismo día.
--
-- LA COLUMNA: `canal` ∈ correo · whatsapp · copia. Las 19 filas viejas son
-- todas de correo (es lo único que existía), así que el backfill es exacto y
-- el DEFAULT es 'correo' para que una escritura vieja siga cuadrando.
--
-- ⚠️ `destinatario` es NOT NULL en la tabla; un «copiar» no tiene destinatario,
-- así que la ruta escribe cadena vacía ahí. No se relaja el NOT NULL: cambiar
-- una restricción para acomodar un caso nuevo es cómo se pierden los datos del
-- caso viejo.
--
-- El código ya deployado es TOLERANTE a la ausencia de esta columna (si no
-- existe, se registra sin `canal` y la marca de la fila no se dibuja) — correr
-- esta DDL cuando se pueda, sin coordinar con el deploy.
--
-- Aplicar con: npm run migrar supabase/migrations/20260927120000_cxc_envios_canal.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE cxc_emails_enviados
  ADD COLUMN IF NOT EXISTS canal text NOT NULL DEFAULT 'correo';

ALTER TABLE cxc_emails_enviados
  DROP CONSTRAINT IF EXISTS cxc_emails_enviados_canal_check;

ALTER TABLE cxc_emails_enviados
  ADD CONSTRAINT cxc_emails_enviados_canal_check
  CHECK (canal IN ('correo', 'whatsapp', 'copia'));

COMMENT ON COLUMN cxc_emails_enviados.canal IS
  'Por dónde salió el estado de cuenta: correo · whatsapp · copia. Las 19 filas anteriores al 5-sep-2026 son todas de correo.';

-- La pantalla pregunta «¿cuál fue el último envío de ESTE cliente?» por cada
-- fila visible. Sin índice eso es un seq scan por cliente sobre una tabla que
-- va a crecer con cada cobro.
CREATE INDEX IF NOT EXISTS cxc_emails_enviados_cliente_fecha_idx
  ON cxc_emails_enviados (cliente_codigo, created_at DESC);
