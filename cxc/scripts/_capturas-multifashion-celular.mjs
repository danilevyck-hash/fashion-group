// Capturas de Multifashion en el celular (402×874 @3x). SOLO LECTURA: se aborta
// todo lo que no sea GET/HEAD y la sesión prestada no se toca (`cxc_ultimo_toque`
// fresco = el middleware no escribe `last_seen`). Mismo patrón que
// scripts/_capturas-resumen-celular.mjs. Una sola carga de página.
//   BASE=http://127.0.0.1:3111 SESSION_SECRET=… OUT=… PREFIJO=recomendacion ROL=admin node …
import { chromium } from "playwright";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";

const { BASE, SESSION_SECRET: S, OUT, PREFIJO = "recomendacion", ROL = "admin" } = process.env;
const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
const K = process.env.SUPABASE_SERVICE_ROLE_KEY;
const sb = async (q) => (await fetch(`${U}/rest/v1/${q}`, { headers: { apikey: K, Authorization: `Bearer ${K}` } })).json();
const firmar = (p) => {
  const b = Buffer.from(JSON.stringify(p)).toString("base64url");
  return `${b}.${crypto.createHmac("sha256", S).update(b).digest("base64url")}`;
};

mkdirSync(OUT, { recursive: true });
const [ses] = await sb("user_sessions?select=session_token&revoked=eq.false&order=last_seen.desc&limit=1");
const perms = await sb("role_permissions?select=role,modulos");
const modulos = perms.find((p) => p.role === ROL).modulos;
const cookie = firmar({ authenticated: true, role: ROL, userId: "cap", userName: "daniel", modules: modulos, sessionToken: ses.session_token });

const br = await chromium.launch({ channel: "chromium" });
const ctx = await br.newContext({
  viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
await ctx.addCookies([
  { name: "cxc_session", value: cookie, domain: "127.0.0.1", path: "/" },
  { name: "cxc_ultimo_toque", value: String(Date.now()), domain: "127.0.0.1", path: "/" },
]);
await ctx.addInitScript(([rol, mods]) => {
  sessionStorage.setItem("cxc_role", rol);
  sessionStorage.setItem("fg_user_id", "cap");
  sessionStorage.setItem("fg_user_name", "daniel");
  sessionStorage.setItem("fg_modules", JSON.stringify(mods));
  sessionStorage.setItem("fg_orden_pestanas", JSON.stringify(["asistencia", "multifashion", "comisiones"]));
}, [ROL, modulos]);
const pg = await ctx.newPage();
let bloqueadas = 0;
await pg.route("**/*", (r) => {
  const m = r.request().method();
  if (m !== "GET" && m !== "HEAD") { bloqueadas++; return r.abort(); }
  r.continue();
});
await pg.goto(BASE + "/multifashion", { waitUntil: "networkidle", timeout: 180000 }).catch((e) => console.log("goto:", e.message));
await pg.waitForSelector('[data-celular="numero-del-mes"]', { timeout: 90000 }).catch(() => console.log("SIN número del mes"));
await pg.waitForFunction(() => document.querySelectorAll('[data-celular="renglones"] li').length === 4
  && !!document.querySelector('[data-renglon="clientes"]')?.textContent?.includes("frecuentes"), null, { timeout: 60000 }).catch(() => console.log("renglones sin dato"));
await pg.waitForTimeout(1500);

const medir = () => pg.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right) }; };
  const t = (s) => document.querySelector(s)?.textContent?.replace(/\s+/g, " ").trim() ?? null;
  return {
    url: location.pathname + location.search, ancho: innerWidth, scrollWidth: document.documentElement.scrollWidth,
    barra: !!document.querySelector("[data-barra-celular]"),
    titulo: t('[data-renglon="titulo"] p'), tituloCaja: r(document.querySelector('[data-renglon="titulo"]')),
    opciones: [...document.querySelectorAll('[data-renglon="titulo"] select option')].map((o) => o.textContent),
    periodo: t('[data-renglon="periodo"]'), periodoCaja: r(document.querySelector('[data-renglon="periodo"]')),
    controlesPeriodo: [...document.querySelectorAll('[data-renglon="periodo"] button')].filter((b) => b.getBoundingClientRect().width > 0).map((b) => ({ t: (b.innerText || b.getAttribute("aria-label") || "").trim(), ...r(b) })),
    hoy: t('[data-celular="hoy"]'), hoyCaja: r(document.querySelector('[data-celular="hoy"]')),
    frescura: t('[data-celular="subtitulo"]'), frescuraCaja: r(document.querySelector('[data-celular="subtitulo"]')),
    encabezadoViejo: !!document.querySelector('[data-celular="encabezado"]'),
    numero: t('[data-celular="numero-del-mes"]'), numeroCaja: r(document.querySelector('[data-celular="numero-del-mes"]')),
    avatar: r(document.querySelector("[data-avatar-usuario], [data-avatar]")),
    renglones: [...document.querySelectorAll("[data-renglon][data-renglon]")].filter((e) => e.tagName === "BUTTON").map((e) => e.textContent.replace(/\s+/g, " ").trim()),
  };
});

console.log("ARRIBA", JSON.stringify(await medir(), null, 1));
console.log("TEXTO", JSON.stringify(await pg.evaluate(() => document.body.innerText.slice(0, 700))));
await pg.screenshot({ path: `${OUT}/${PREFIJO}-arriba.png` });
await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await pg.waitForTimeout(800);
await pg.screenshot({ path: `${OUT}/${PREFIJO}-abajo.png` });

// La lista del título, abierta. Es la lista NATIVA del teléfono (`<select>`).
await pg.evaluate(() => window.scrollTo(0, 0));
await pg.waitForTimeout(400);
// ⚠️ Chromium no dibuja la lista nativa en una captura: se ILUSTRA con las
// opciones reales del `<select>` y se rotula como ilustración. En el iPhone es
// el menú del sistema.
await pg.evaluate(() => {
  const sel = document.querySelector('[data-renglon="titulo"] select');
  const caja = document.createElement("div");
  caja.id = "ilustracion-lista";
  caja.style.cssText = "position:fixed;left:16px;top:52px;width:250px;z-index:99;background:#fff;border-radius:14px;box-shadow:0 8px 40px rgba(0,0,0,.25);font:17px -apple-system,system-ui,sans-serif;overflow:hidden";
  caja.innerHTML = [...sel.options].map((o) => `<div style="display:flex;gap:10px;padding:11px 16px;border-top:1px solid #eee"><span style="width:16px">${o.selected ? "✓" : ""}</span>${o.textContent}</div>`).join("")
    + '<div style="padding:8px 16px;border-top:1px solid #eee;font-size:12px;color:#6b7280">Ilustración: en el iPhone es la lista del sistema</div>';
  document.body.appendChild(caja);
});
await pg.screenshot({ path: `${OUT}/${PREFIJO}-pestanas-abiertas.png` });
await pg.evaluate(() => document.getElementById("ilustracion-lista")?.remove());

// Sin recargar: cada sección desde el título (navegación del lado del navegador).
if (process.env.SECCIONES) {
  for (const v of ["anio", "vendedoras", "productos", "clientes", "resumen"]) {
    await pg.locator('[data-renglon="titulo"] select').selectOption(v);
    await pg.waitForTimeout(3500);
    const m = await medir();
    console.log("SECCION", v, JSON.stringify({ url: m.url, titulo: m.titulo, periodo: m.periodo, controles: m.controlesPeriodo, hoy: m.hoy, frescura: m.frescura, scrollWidth: m.scrollWidth }));
    await pg.screenshot({ path: `${OUT}/_extra-${PREFIJO}-${v}.png` });
  }
}
console.log(`escrituras bloqueadas por el navegador: ${bloqueadas}`);
await br.close();
