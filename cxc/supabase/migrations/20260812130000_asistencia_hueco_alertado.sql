-- ─────────────────────────────────────────────────────────────────────────────
-- ASISTENCIA — el candado del aviso "hay un hueco que el programa ya no alcanza".
--
-- ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
-- El agente de la PC de la oficina recupera solo hasta 15 días hacia atrás
-- (VENTANA_RECUPERACION_DIAS del programa v1.1.0). Si lo último traído del
-- reloj quedó MÁS viejo que eso, esas marcaciones ya no entran solas: hay que
-- ampliar la ventana en el .env de la PC, a mano. Daniel lo pidió textual el
-- 12-ago-2026: "ok lo corro pero si pasa mas de 15 dias que me llegue
-- notificacion a telegram alertas para saber q hay q arreglarlo".
--
-- El aviso lo manda el cron vigía (/api/cron/asistencia-vigia), que corre 3
-- veces al día. Esta columna es el candado que hace que el episodio suene UNA
-- vez y no en cada pasada — el mismo diseño que `alertado_en` para el
-- silencio de la PC, con marca propia porque son episodios independientes
-- (la PC puede estar prendida y reportando, y el hueco viejo seguir ahí).
--
-- ── SEGURIDAD DE LA MIGRACIÓN ────────────────────────────────────────────────
-- Un solo `ADD COLUMN IF NOT EXISTS`: aditiva, idempotente, corre en
-- milisegundos y no toca ni una fila. Y el código de la app aguanta que ESTO
-- NO SE HAYA CORRIDO: sin la columna, el vigía degrada limpio (no manda el
-- aviso del hueco, deja un warning en el log) y todo lo demás sigue igual.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE asistencia_dispositivos
  -- Cuándo se avisó por Telegram del hueco fuera de alcance. NULL = no hay
  -- episodio abierto. Se limpia cuando el hueco se cierra (y ahí sale el
  -- "ya se arregló", una sola vez).
  ADD COLUMN IF NOT EXISTS hueco_alertado_en timestamptz;

COMMENT ON COLUMN asistencia_dispositivos.hueco_alertado_en IS
  'Candado del aviso "marcaciones de hace +15 días sin traer" (4ª alerta de sistema, pedida por Daniel el 12-ago-2026). NULL = sin episodio abierto.';
