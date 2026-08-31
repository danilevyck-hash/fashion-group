// ─────────────────────────────────────────────────────────────────────────────
// ¿QUÉ RUTA DE /api/asistencia/* le contesta 200 y cuál 403 a CADA usuario real?
//
// 🔴 SOLO LECTURA sobre producción. Las dos rutas que solo tienen POST se
// llaman con el cuerpo VACÍO a propósito: las dos validan el cuerpo ANTES de
// escribir, así que un 400 prueba que la petición pasó el candado sin haber
// tocado una fila. Cualquier otro método (PUT/PATCH/DELETE) no se toca.
//
// Los módulos efectivos se calculan con la MISMA precedencia del login
// (modulos_override > role_permissions > default por rol), leyendo las tablas
// reales — no se inventan.
//
//   SESSION_SECRET=<el del server> BASE=http://127.0.0.1:3478 \
//     DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/_medir-asistencia-acceso.mjs
// ─────────────────────────────────────────────────────────────────────────────
import crypto from "node:crypto";

const BASE = process.env.BASE || "http://127.0.0.1:3478";
const SECRET = process.env.SESSION_SECRET;
const URL_SB = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SECRET) throw new Error("falta SESSION_SECRET (el MISMO con el que corre el server)");
if (!URL_SB || !KEY) throw new Error("faltan credenciales de Supabase");

const H = { apikey: KEY, Authorization: `Bearer ${KEY}` };
const sb = async (q) => {
  const r = await fetch(`${URL_SB}/rest/v1/${q}`, { headers: H });
  if (!r.ok) throw new Error(`${q} -> ${r.status} ${await r.text()}`);
  return r.json();
};

function firmar(payload) {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// Las rutas, con el método que NO escribe.
const RUTAS = [
  ["GET",  "/api/asistencia/reporte?desde=2026-08-01&hasta=2026-08-15"],
  ["GET",  "/api/asistencia/planilla?quincena=2026-08-1"],
  ["GET",  "/api/asistencia/planilla?quincena=2026-08-1&aprobaciones=1"],
  ["GET",  "/api/asistencia/configuracion"],
  ["GET",  "/api/asistencia/configuracion/reglas"],
  ["GET",  "/api/asistencia/horarios"],
  ["GET",  "/api/asistencia/feriados"],
  ["GET",  "/api/asistencia/justificaciones"],
  ["GET",  "/api/asistencia/correcciones?desde=2026-08-01&hasta=2026-08-15"],
  ["GET",  "/api/asistencia/vacaciones"],
  ["GET",  "/api/asistencia/reloj"],
  ["POST", "/api/asistencia/aprobaciones"],   // cuerpo vacío -> 400 sin escribir
  ["POST", "/api/asistencia/prestamos"],      // cuerpo vacío -> 400 sin escribir
];

const DEFAULTS = {}; // se llena desde la app si hiciera falta; hoy todos tienen fila

async function modulosEfectivos(u, rolePerms) {
  if (Array.isArray(u.modulos_override) && u.modulos_override.length > 0) return u.modulos_override;
  const fila = rolePerms.find((r) => r.role === u.role);
  if (fila?.modulos?.length) return fila.modulos;
  return DEFAULTS[u.role] ?? [];
}

const main = async () => {
  const usuarios = await sb("fg_users?select=name,role,active,modulos_override&active=eq.true&order=role");
  const rolePerms = await sb("role_permissions?select=role,modulos");
  // Un sessionToken VIVO prestado (solo lectura): el middleware lo valida contra
  // user_sessions, así que una sesión inventada moriría ahí y mediríamos el login.
  const [sesion] = await sb("user_sessions?select=session_token&revoked=eq.false&order=last_seen.desc&limit=1");
  if (!sesion) throw new Error("no hay sesión viva para tomar prestado el token");

  const filas = [];
  for (const u of usuarios) {
    const modules = await modulosEfectivos(u, rolePerms);
    const cookie = `cxc_session=${firmar({
      authenticated: true, role: u.role, userId: "medicion", userName: u.name,
      modules, sessionToken: sesion.session_token,
    })}`;
    for (const [metodo, ruta] of RUTAS) {
      const r = await fetch(BASE + ruta, {
        method: metodo,
        headers: { cookie, ...(metodo === "POST" ? { "content-type": "application/json" } : {}) },
        ...(metodo === "POST" ? { body: "{}" } : {}),
        redirect: "manual",
      });
      filas.push({ usuario: u.name, rol: u.role, tieneAsistencia: modules.includes("asistencia"), ruta, status: r.status });
    }
  }

  const rutas = RUTAS.map(([, r]) => r);
  const corta = (r) => r.replace("/api/asistencia/", "").split("?")[0] + (r.includes("aprobaciones=1") ? " (aprob)" : "");
  console.log(`\nBASE=${BASE}\n`);
  console.log(`${"usuario".padEnd(13)}${"rol".padEnd(16)}${"mod?".padEnd(6)}` + rutas.map((r) => corta(r).slice(0, 11).padEnd(12)).join(""));
  for (const u of usuarios) {
    const mias = filas.filter((f) => f.usuario === u.name);
    const mods = mias[0]?.tieneAsistencia ? "SI" : "no";
    console.log(u.name.padEnd(13) + u.role.padEnd(16) + mods.padEnd(6) +
      rutas.map((r) => String(mias.find((f) => f.ruta === r)?.status ?? "?").padEnd(12)).join(""));
  }
  const abiertas = filas.filter((f) => !f.tieneAsistencia && f.rol !== "admin" && f.status !== 403 && f.status !== 401);
  console.log(`\n🔴 respuestas NO-403 a usuarios SIN el módulo asistencia: ${abiertas.length}`);
  for (const a of abiertas) console.log(`   ${a.usuario} (${a.rol})  ${a.status}  ${a.ruta}`);
};
main().catch((e) => { console.error(e); process.exit(1); });
