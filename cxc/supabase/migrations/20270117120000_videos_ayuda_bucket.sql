-- ─────────────────────────────────────────────────────────────────────────────
-- VIDEOS DE AYUDA — el bucket (15-nov-2026)
--
-- «Cómo se usa» en el «···» de un módulo (mockups videos-01 y videos-02,
-- aprobados por Daniel). Los videos viven DENTRO del sistema, no en YouTube:
-- cambiar un video es volver a subir el archivo a la misma ruta.
--
-- 🔴 PRIVADO, como los demás de la casa: sin policies para `anon` ni
-- `authenticated`. La única puerta es `/api/videos-ayuda`, que exige el rol del
-- módulo y firma cada URL por una hora. Solo esto: ni una tabla, ni una fila.
-- Tope por archivo: 50 MB (el más grande, el video completo, pesa 30 MB).
-- ─────────────────────────────────────────────────────────────────────────────

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('videos-ayuda', 'videos-ayuda', false, 52428800, array['video/mp4', 'image/jpeg'])
on conflict (id) do nothing;
