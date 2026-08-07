-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — el buzón del botón "Traer ahora" y el contador de fallas.
--
-- ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
-- El botón vive en internet (Vercel) y el reloj vive en `192.168.10.10`, una IP
-- privada de la oficina. Vercel NO puede llamar al reloj: no hay ruta, y no la
-- va a haber. Así que el botón no puede "traer" nada por sí mismo.
--
-- Entonces el botón DEJA UN PEDIDO y el agente que corre en la PC de la oficina
-- lo recoge en su vuelta siguiente (cada ~3 minutos). Es un buzón, no una
-- llamada. Estas columnas son ese buzón.
--
-- ⚠️ POR QUÉ TRES COLUMNAS Y NO UN BOOLEAN. Con un `pedido_pendiente boolean`,
-- un pedido hecho MIENTRAS el agente estaba trabajando quedaría borrado por la
-- vuelta que ya había arrancado — el usuario aprieta, no pasa nada, y no hay
-- forma de distinguirlo de "la PC está apagada". Guardando los dos INSTANTES,
-- `pedido_atendido_en < pedido_en` dice sin ambigüedad que falta una vuelta.
--
-- ── EL CONTADOR DE FALLAS ────────────────────────────────────────────────────
-- `fallos_seguidos` + `alertado_en` implementan la regla de las tres alertas de
-- CLAUDE.md: un tropiezo que se arregla solo NO se avisa. El estado tiene que
-- vivir en la base porque el servidor es serverless — entre dos llamadas no
-- queda nada en memoria, así que un contador en una variable siempre valdría 1
-- y avisaría en cada falla.
--
-- ── SEGURIDAD DE LA MIGRACIÓN ────────────────────────────────────────────────
-- Todo `ADD COLUMN IF NOT EXISTS` sobre una tabla que ya existe: aditiva,
-- idempotente, corre en milisegundos y no toca ni una fila de datos. Y el
-- código de la app aguanta que ESTO NO SE HAYA CORRIDO: sin estas columnas, las
-- marcaciones siguen entrando igual y lo único que no funciona es el botón,
-- que se muestra deshabilitado diciendo qué archivo falta correr.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_dispositivos
  -- Cuándo se apretó "Traer ahora". NULL = no hay pedido.
  ADD COLUMN IF NOT EXISTS pedido_en          timestamptz,
  -- Quién lo apretó. Para que un pedido raro tenga dueño.
  ADD COLUMN IF NOT EXISTS pedido_por         text,
  -- Cuándo lo recogió el agente. Se compara CONTRA `pedido_en`, ver arriba.
  ADD COLUMN IF NOT EXISTS pedido_atendido_en timestamptz,
  -- Fallas seguidas del agente. Se pone en 0 con cada éxito.
  ADD COLUMN IF NOT EXISTS fallos_seguidos    integer NOT NULL DEFAULT 0,
  -- Cuándo se avisó por Telegram de ESTE episodio. NULL = no hay episodio
  -- abierto. Es el candado que evita repetir el mismo aviso cada 3 minutos.
  ADD COLUMN IF NOT EXISTS alertado_en        timestamptz,
  -- Versión del programita instalado en la PC. Sirve para saber si la oficina
  -- quedó con una versión vieja después de un cambio.
  ADD COLUMN IF NOT EXISTS agente_version     text;

COMMENT ON COLUMN asistencia_dispositivos.pedido_en IS
  'Buzón del botón "Traer ahora": el agente de la oficina lo recoge en su vuelta siguiente. Vercel no puede llamar al reloj (IP privada).';
COMMENT ON COLUMN asistencia_dispositivos.fallos_seguidos IS
  'Fallas seguidas del agente. Con 3 se avisa por Telegram UNA vez (alertado_en); un tropiezo que se arregla solo no se avisa.';

-- ─────────────────────────────────────────────────────────────────────────────
-- Limpieza de una fila fantasma.
--
-- 🩸 `asistencia_dispositivos` tiene un renglón `RELOJ_FG` que dejó una prueba
-- de la pantalla de "Cargar Excel" el 5-ago-2026: `visto_en` con fecha, cero
-- marcaciones asociadas y `leido_hasta` vacío. Las 3.287 marcaciones REALES
-- están todas bajo `reloj cboston` (verificado contra producción el 6-ago).
--
-- Ese renglón huérfano haría que la pantalla mostrara DOS relojes, uno de ellos
-- eternamente "sin responder" — y un cartel rojo permanente que no significa
-- nada es exactamente lo que hace que se ignoren los carteles rojos de verdad.
--
-- Se borra SOLO si sigue sin marcaciones: si alguien llegó a cargar un Excel
-- bajo ese nombre, el renglón se queda y la pantalla mostrará los dos, que es
-- lo correcto.
-- ─────────────────────────────────────────────────────────────────────────────
DELETE FROM asistencia_dispositivos d
WHERE d.dispositivo = 'RELOJ_FG'
  AND NOT EXISTS (
    SELECT 1 FROM asistencia_marcaciones m WHERE m.dispositivo = d.dispositivo
  );
