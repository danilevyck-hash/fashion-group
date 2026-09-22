# Sesiones y autenticación — el porqué

> Post-mortem de cómo vive una sesión en fashiongr.com: la cookie, la reanudación sin contraseña (3-sep-2026) y la expiración, que vive SOLO en el cron (26-jul-2026).
> Nació el 19-sep-2026 al mover aquí, verbatim, lo que CLAUDE.md decía: entró la regla del conector de Supabase y el archivo estaba a 24 caracteres del tope del harness.
> La REGLA vigente (sin la historia) vive en «Auth» de `cxc/CLAUDE.md`. El mapa operativo completo —los cuatro pasos del cron, el clasificador, qué pasa si no corre— está en `docs/modulos/06-recordatorios-usuarios-infra.md`.

---

## Lo que decía CLAUDE.md hasta el 19-sep-2026 (movido aquí, verbatim)

- **Reanudar sesión (3-sep-2026):** con la cookie de 7 días viva ya NO se pide contraseña al abrir la app — la pantalla de login pregunta `GET /api/auth/sesion` (fail-closed: firma HMAC + token vivo y del MISMO usuario en `user_sessions` + usuario activo en `fg_users`; rol y módulos salen FRESCOS de la base, payload compartido con el login en `src/lib/sesion-payload.ts`) y manda a la casa del rol; pase vencido, revocado o logout → contraseña como siempre. **NO cambió**: el `maxAge` de 7 días, la validación del middleware, el rate limit, bcrypt ni la retención de sesiones. Colateral: los 3 botones de salir ahora revocan y ESPERAN el DELETE antes de navegar (el del home solo borraba `sessionStorage`). Candado: `sesion-vigente-no-pide-contrasena.test.tsx`.
- **Expiración de sesión — vive SOLO en el cron (26-jul-2026).** `user_sessions` **no tiene `expires_at`** (columnas reales: id, user_name, user_role, session_token, ip_address, last_seen, created_at, revoked) y la cookie firmada tampoco lleva claim de expiración: del lado del servidor una sesión no vencía nunca. Lo único que la mataba era el `maxAge` de 7 días de la cookie en el navegador — un control del CLIENTE, que quien se quede con el valor de la cookie ignora. Medido antes del fix: 1.190 filas, 259 sin revocar para 9 usuarios (daniel 73, Angela 66), y solo 3 usadas en 24h. Ahora `/api/cron/cleanup-sessions` (02:30 UTC) revoca a los **14 días** sin `last_seen` (el doble de los 7 del `maxAge` → no desloguea a nadie que todavía pudiera estar usando la app), pone un **tope duro de 90 días** de vida por sesión aunque se la mantenga viva a pings, y **borra** las revocadas con `last_seen` > 90 días. Constantes en `src/lib/session-retention.ts`. Si se agrega un `expires_at` algún día, el middleware tiene que respetarlo — hoy no existe nada que respetar.

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

## Auth
- Passwords: bcrypt hashed (migración de plaintext completada — todos los usuarios en bcrypt; el login exige bcrypt y rechaza cualquier password no-hasheada)
- Session: httpOnly cookie `cxc_session`, base64url-encoded JSON `{role, userId, userName, sessionToken}`
- **Reanudar sesión (3-sep-2026):** con la cookie de 7 días viva **no se pide contraseña**: el login pregunta `GET /api/auth/sesion` (**fail-closed**: firma HMAC + token vivo y del MISMO usuario en `user_sessions` + usuario activo en `fg_users`; rol y módulos salen FRESCOS de la base, payload compartido en `src/lib/sesion-payload.ts`) y manda a la casa del rol; pase vencido, revocado o logout → contraseña como siempre. Los 3 botones de salir revocan y **esperan** el DELETE antes de navegar. Candado: `sesion-vigente-no-pide-contrasena.test.tsx`.
- Middleware: `src/middleware.ts` valida sesión contra `user_sessions` table
- 🔴 **`last_seen` se escribe como mucho UNA VEZ CADA 5 MINUTOS por sesión** (19-sep-2026): era un PATCH fire-and-forget en CADA petición de CADA persona — el renglón más caro de Sentry (p95 de 2 min; 2,3 días en promesas abandonadas en el borde). Sigue SIN `await` a propósito (esperar costaría ~200 ms por navegación): lo que se recortó es CUÁNTAS veces ocurre. La marca viaja en su cookie (`cxc_ultimo_toque`) porque el borde no tiene memoria, y **ante la duda se escribe**; cabe de sobra en los 14 días de `session-retention.ts`. ⚠️ Admin › Usuarios muestra la «última actividad» hasta 5 min atrasada. Candado: `last-seen-cada-cinco-minutos`.
- 🔴 **Una sesión no vence sola: la mata el cron (26-jul-2026).** `user_sessions` **no tiene `expires_at`** y la cookie firmada tampoco lleva claim de expiración — el `maxAge` de 7 días es un control del CLIENTE. `/api/cron/cleanup-sessions` (02:30 UTC) revoca a los **14 días** sin `last_seen`, pone un tope duro de **90 días** de vida aunque se la mantenga a pings, y **borra** las revocadas con `last_seen` > 90 días (`src/lib/session-retention.ts`). Si algún día se agrega un `expires_at`, el middleware tiene que respetarlo. Detalle y mediciones en [el postmortem](docs/postmortems/auth-sesiones.md).
- ⚠️ **No hay chequeo de sesión periódico**: `/api/auth/check` existe pero NADIE lo llama — `useSessionCheck` no tiene importadores desde el 11-abr-2026 y `SessionWarning` nunca se montó (ver *Hooks*). No corre ningún ping cada 2 min ni sale el aviso de «tu sesión está por vencer».
- API auth: `src/lib/requireRole.ts` — admin siempre pasa, verifica rol contra array
- Rate limiting: login en Supabase (tabla `login_attempts` + RPC `register_login_failure`/`clear_login_attempts`), por IP — 5 fallos en ventana de 15 min → lockout 15 min (`src/lib/login-rate-limit.ts`, fail-open). Reemplazó el Map en-memoria (inefectivo en serverless)
- Login case-insensitive: contraseñas no distinguen mayúsculas/minúsculas (autocapitalizar iPhone)
- Input login: autoCapitalize=none, autoCorrect=off
- User indicator: nombre + rol visible en header desktop y drawer mobile
- Forgot password: link en login → "Contacta al administrador"
