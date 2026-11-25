-- ═════════════════════════════════════════════════════════════════════════════
-- Sacar a todos para que entren con su clave (25-nov-2026, Daniel: «sacar a
-- los usuarios para que tengan que entrar con su clave»), y así al entrar les
-- salga «Activa los avisos» (`AVISOS_AL_ENTRAR_2026_11`).
--
-- 🔴 Se corre DESPUÉS de que el despliegue esté en Ready, nunca antes.
-- Mismo mecanismo que el logout y el cron `cleanup-sessions`: `revoked = true`.
-- SIN DELETE: las filas quedan como rastro y el cron las borra a los 90 días
-- sin `last_seen`, como a cualquier revocada.
-- Medido 25-nov-2026: 41 sesiones vivas de 19 usuarios (Daniel incluido).
-- ═════════════════════════════════════════════════════════════════════════════

UPDATE user_sessions
   SET revoked = true
 WHERE revoked = false;
