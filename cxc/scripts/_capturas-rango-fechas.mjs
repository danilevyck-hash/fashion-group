// Capturas de las 6 pantallas que estrenan el selector de rango.
// SOLO LECTURA: bloquea todo método que no sea GET/HEAD antes de navegar.
//
//   SESSION_SECRET=… BASE=http://127.0.0.1:3478 \
//     DOTENV_CONFIG_PATH=.env.local node -r dotenv/config scripts/_capturas-rango-fechas.mjs
import { chromium } from "playwright";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE, S = process.env.SESSION_SECRET;
const OUT = process.env.OUT || "/tmp/caps";
const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: K, Authorization: `Bearer ${K}` };
const sb = async (q) => (await fetch(`${U}/rest/v1/${q}`, { headers: H })).json();
const firmar = (p) => {
  const b = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${b}.${crypto.createHmac("sha256", S).update(b).digest("base64url")}`;
};

mkdirSync(OUT, { recursive: true });
const [ses] = await sb("user_sessions?select=session_token&revoked=eq.false&order=last_seen.desc&limit=1");
const perms = await sb("role_permissions?select=role,modulos");
const cookie = (rol, user) => firmar({
  authenticated: true, role: rol, userId: "cap", userName: user,
  modules: perms.find((p) => p.role === rol).modulos, sessionToken: ses.session_token,
});

const PANTALLAS = [
  ["01-reporte",        "admin", "daniel", "/asistencia?tab=reporte"],
  ["02-aprobaciones",   "admin", "daniel", "/asistencia?tab=aprobaciones"],
  ["03-planilla",       "admin", "daniel", "/asistencia?tab=planilla"],
  ["04-justificaciones","admin", "daniel", "/asistencia?tab=justificaciones"],
  ["05-vacaciones",     "admin", "daniel", "/asistencia?tab=vacaciones"],
  ["06-boston-planilla","gerente_boston", "david", "/boston?tab=planilla"],
];

const br = await chromium.launch();
let bloqueadas = 0;

async function capturar(nombre, rol, user, ruta, ancho, alto, abrir) {
  const ctx = await br.newContext({ viewport: { width: ancho, height: alto }, deviceScaleFactor: 2 });
  await ctx.addCookies([{ name: "cxc_session", value: cookie(rol, user), domain: "127.0.0.1", path: "/" }]);
  const pg = await ctx.newPage();
  await pg.route("**/*", (r) => {
    const m = r.request().method();
    if (m !== "GET" && m !== "HEAD") { bloqueadas++; return r.abort(); }
    r.continue();
  });
  await pg.goto(BASE + ruta, { waitUntil: "networkidle", timeout: 60000 }).catch(() => {});
  await pg.waitForTimeout(1800);
  if (abrir) {
    const b = pg.locator('button:has-text("días"), button:has-text("día")').first();
    if (await b.count()) { await b.click().catch(() => {}); await pg.waitForTimeout(1400); }
  }
  const suf = `${ancho === 390 ? "movil" : "desktop"}${abrir ? "-abierto" : ""}`;
  await pg.screenshot({ path: `${OUT}/${nombre}-${suf}.png`, fullPage: !abrir });
  console.log(`  ✓ ${nombre}-${suf}.png`);
  await ctx.close();
}

for (const [n, rol, user, ruta] of PANTALLAS) {
  await capturar(n, rol, user, ruta, 1440, 900, false);
}
// El calendario abierto: desktop (dos meses) y móvil (uno, con scroll).
await capturar("01-reporte", "admin", "daniel", "/asistencia?tab=reporte", 1440, 900, true);
await capturar("01-reporte", "admin", "daniel", "/asistencia?tab=reporte", 390, 844, true);
await capturar("06-boston-planilla", "gerente_boston", "david", "/boston?tab=planilla", 390, 844, false);

console.log(`\nescrituras bloqueadas por el navegador: ${bloqueadas}`);
await br.close();
