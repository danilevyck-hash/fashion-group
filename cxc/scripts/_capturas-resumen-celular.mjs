// Capturas del Resumen de Ventas en el celular. SOLO LECTURA: se aborta todo
// lo que no sea GET/HEAD. Mismo patrón que scripts/_capturas-rango-fechas.mjs.
import { chromium } from "playwright";
import crypto from "node:crypto";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE, S = process.env.SESSION_SECRET;
const OUT = process.env.OUT;
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
const cookie = firmar({
  authenticated: true, role: "admin", userId: "cap", userName: "daniel",
  modules: perms.find((p) => p.role === "admin").modulos, sessionToken: ses.session_token,
});

const br = await chromium.launch({ channel: "chromium" });
let bloqueadas = 0;
const ctx = await br.newContext({
  viewport: { width: 402, height: 874 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true,
  userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
});
await ctx.addCookies([{ name: "cxc_session", value: cookie, domain: "127.0.0.1", path: "/" }]);
// Lo que el login deja en el navegador (el encabezado y la barra de pestañas
// lo leen de ahí). El orden de pestañas es el del teléfono de Daniel.
const modulosAdmin = perms.find((p) => p.role === "admin").modulos;
await ctx.addInitScript(([mods]) => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_id", "cap");
  sessionStorage.setItem("fg_user_name", "daniel");
  sessionStorage.setItem("fg_modules", JSON.stringify(mods));
  sessionStorage.setItem("fg_orden_pestanas", JSON.stringify(["asistencia", "multifashion", "comisiones"]));
}, [modulosAdmin]);
const pg = await ctx.newPage();
await pg.route("**/*", (r) => {
  const m = r.request().method();
  if (m !== "GET" && m !== "HEAD") { bloqueadas++; return r.abort(); }
  r.continue();
});
await pg.goto(BASE + "/ventas", { waitUntil: "networkidle", timeout: 120000 }).catch((e) => console.log("goto:", e.message));
await pg.waitForSelector("[data-total-grupo]", { timeout: 60000 }).catch(() => console.log("SIN [data-total-grupo]"));
await pg.waitForTimeout(1500);

const medir = () => pg.evaluate(() => {
  const r = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
  const botones = [...document.querySelectorAll("button")].filter((b) => /Rango|Todo|20\d\d/.test(b.textContent || "") && b.getBoundingClientRect().top < 200);
  return {
    url: location.pathname + location.search,
    ancho: innerWidth, scrollWidth: document.documentElement.scrollWidth, scrollY: Math.round(scrollY),
    altoDoc: document.documentElement.scrollHeight,
    botonesArriba: botones.map((b) => ({ t: (b.textContent || "").trim().slice(0, 30), ...r(b) })),
    comentario: document.body.innerText.includes("// El selector"),
    total: r(document.querySelector("[data-total-grupo]")),
    nota: r(document.querySelector("[data-nota-mayoreo]")),
    notaTexto: document.querySelector("[data-nota-mayoreo]")?.textContent ?? null,
    tabBar: r(document.querySelector("[data-tab-bar]")),
    colchon: r(document.querySelector("[data-colchon-abajo]")),
    main: r(document.querySelector("main")),
    padBody: getComputedStyle(document.body).paddingBottom,
  };
});

console.log("ARRIBA", JSON.stringify(await medir(), null, 1));
await pg.screenshot({ path: `${OUT}/${process.env.PREFIJO}-arriba.png` });
await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
await pg.waitForTimeout(800);
console.log("ABAJO", JSON.stringify(await medir(), null, 1));
await pg.screenshot({ path: `${OUT}/${process.env.PREFIJO}-abajo.png` });
// ── El selector abierto y un mes elegido (sin recargar la página) ──
if (process.env.MES) {
  await pg.evaluate(() => window.scrollTo(0, 0));
  await pg.waitForTimeout(400);
  await pg.locator('button[aria-label^="Período"]:visible, button[aria-haspopup]:visible').filter({ hasText: /20\d\d/ }).first().click();
  await pg.waitForTimeout(900);
  const menu = await pg.evaluate(() => {
    const r = (el) => { const b = el.getBoundingClientRect(); return { x: Math.round(b.left), y: Math.round(b.top), right: Math.round(b.right), bottom: Math.round(b.bottom) }; };
    const d = [...document.querySelectorAll('[role="dialog"]')].filter((e) => e.getBoundingClientRect().width > 0);
    return d.map((e) => ({ label: e.getAttribute("aria-label"), caja: r(e), texto: e.innerText,
      botones: [...e.querySelectorAll("button")].map((b) => ({ t: (b.innerText || b.getAttribute("aria-label") || "").trim(), aria: b.getAttribute("aria-label"), off: b.disabled, ...r(b) })) }));
  });
  console.log("MENU", JSON.stringify(menu));
  await pg.screenshot({ path: `${OUT}/${process.env.PREFIJO}-selector-abierto.png` });
  await pg.locator('[role="dialog"] button:visible').filter({ hasText: new RegExp(`^${process.env.MES}`, "i") }).first().click();
  await pg.waitForTimeout(2500);
  console.log("MES-ARRIBA", JSON.stringify(await medir()));
  console.log("MES-TEXTO", JSON.stringify(await pg.evaluate(() => document.body.innerText.slice(0, 900))));
  await pg.screenshot({ path: `${OUT}/${process.env.PREFIJO}-mes.png` });
  await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pg.waitForTimeout(600);
  console.log("MES-ABAJO", JSON.stringify(await medir()));
  await pg.screenshot({ path: `${OUT}/${process.env.PREFIJO}-mes-abajo.png` });
}
console.log(`escrituras bloqueadas por el navegador: ${bloqueadas}`);
await br.close();
