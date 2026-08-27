// ¿Los blancos táctiles y los textos chicos de la pestaña CXC son NUEVOS o
// PRE-EXISTENTES? Se mide el MISMO `<BostonTab />` donde ya vive hoy —el panel
// del CXC, `/admin?tab=boston`, con una sesión de admin— y se compara contra lo
// que da dentro de `/boston`.
//
// 🩸 Es la única forma honesta de decir "es pre-existente": afirmarlo sin medir
// es exactamente el error que este repo ya pagó (acusar a un cambio de lo que
// ya estaba, o al revés, taparse con un "ya estaba" sin comprobarlo).
//
//   BASE=… TOKEN=<session_token vivo> node scripts/_medir-boston-baseline-cxc.mjs

import crypto from "crypto";
import { chromium } from "playwright";

const BASE = process.env.BASE ?? "http://127.0.0.1:3499";
const TOKEN = process.env.TOKEN;
const SECRET = process.env.SESSION_SECRET;
if (!TOKEN || !SECRET) { console.error("Faltan TOKEN o SESSION_SECRET."); process.exit(1); }

const ANCHOS = [390, 834, 1024, 1440];

function firmar(p) {
  const body = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${body}.${crypto.createHmac("sha256", SECRET).update(body).digest("base64url")}`;
}

function medir() {
  const tactiles = [], chicos = [];
  for (const el of document.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden") continue;
    const tocable = el.tagName === "BUTTON" || el.tagName === "A" ||
      (el.tagName === "INPUT" && el.type !== "hidden") || el.tagName === "SELECT" ||
      el.getAttribute("role") === "button";
    if (tocable && (r.height < 44 || r.width < 44) && r.height > 0) tactiles.push(1);
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (propio) { const fs = parseFloat(cs.fontSize); if (fs && fs < 12) chicos.push(1); }
  }
  // El asidero FIJO de las tarjetas/tabla de la pestaña, para probar que se
  // midió la pestaña de Boston y no otra cosa.
  const vistas = [...document.querySelectorAll("[data-vista]")].map((e) => e.dataset.vista);
  return { tactiles: tactiles.length, chicos: chicos.length, vistas, filas: document.querySelectorAll("tbody tr").length };
}

async function medirEn(nav, url, rol, modulos, ancho) {
  const ctx = await nav.newContext({ viewport: { width: ancho, height: 900 } });
  await ctx.route("**/*", (r) => (["GET", "HEAD"].includes(r.request().method()) ? r.continue() : r.abort()));
  await ctx.addCookies([{
    name: "cxc_session",
    value: firmar({ role: rol, userId: "medicion", userName: "medicion", sessionToken: TOKEN }),
    url: BASE,
  }]);
  await ctx.addInitScript(([r, m]) => {
    try {
      sessionStorage.setItem("cxc_role", r);
      sessionStorage.setItem("fg_modules", JSON.stringify(m));
      sessionStorage.setItem("fg_user_name", "medicion");
    } catch {}
    try { delete Navigator.prototype.serviceWorker; } catch {}
  }, [rol, modulos]);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "networkidle", timeout: 90_000 });
  await page.waitForTimeout(1200);
  const m = await page.evaluate(medir);
  await ctx.close();
  return m;
}

const nav = await chromium.launch();
console.log("ancho | DONDE VIVE HOY (/admin?tab=boston, admin) | EN /boston (gerente_boston)");
let ok = true;
for (const w of ANCHOS) {
  const base = await medirEn(nav, `${BASE}/admin?tab=boston`, "admin", ["cxc"], w);
  const nuevo = await medirEn(nav, `${BASE}/boston?tab=cxc`, "gerente_boston", ["boston"], w);
  const igualT = base.tactiles === nuevo.tactiles;
  const igualC = base.chicos === nuevo.chicos;
  if (base.filas === 0 || nuevo.filas === 0) {
    // Un cero medido sobre una pestaña vacía no prueba nada.
    console.log(`⚠️  ${w}: alguna de las dos no cargó filas (base ${base.filas} · nuevo ${nuevo.filas})`);
    ok = false;
  }
  console.log(
    `${String(w).padStart(5)} | táctil<44 ${String(base.tactiles).padStart(4)} · texto<12 ${String(base.chicos).padStart(3)} · filas ${String(base.filas).padStart(4)} ` +
    `| táctil<44 ${String(nuevo.tactiles).padStart(4)} · texto<12 ${String(nuevo.chicos).padStart(3)} · filas ${String(nuevo.filas).padStart(4)} ` +
    `${igualT && igualC ? "✅ IDÉNTICO" : "🔴 DIFIERE"}`,
  );
  if (!igualT || !igualC) ok = false;
}
await nav.close();
console.log(ok ? "\n✅ Los blancos táctiles y los textos chicos de la pestaña CXC son PRE-EXISTENTES." : "\n🔴 Hay diferencias: no se puede decir que sea pre-existente.");
process.exit(ok ? 0 : 1);
