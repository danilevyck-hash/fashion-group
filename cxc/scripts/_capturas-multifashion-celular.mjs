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
pg.on("pageerror", (e) => console.log("PAGEERROR", String(e).slice(0, 600)));
pg.on("console", (m) => { if (m.type() === "error") console.log("CONSOLE", m.text().slice(0, 400)); });
let bloqueadas = 0;
await pg.route("**/*", (r) => {
  const m = r.request().method();
  if (m !== "GET" && m !== "HEAD") { bloqueadas++; return r.abort(); }
  r.continue();
});
await pg.goto(BASE + "/multifashion", { waitUntil: "networkidle", timeout: 180000 }).catch((e) => console.log("goto:", e.message));
await pg.waitForSelector('[data-celular="numero-del-mes"]', { timeout: 90000 }).catch(() => console.log("SIN número del mes"));
await pg.waitForSelector('[data-celular="historico"], [data-celular="renglones"]', { timeout: 60000 }).catch(() => console.log("SIN tarjeta bajo la gráfica"));
await pg.waitForTimeout(1500);
console.log("HISTORICO", JSON.stringify(await pg.evaluate(() => document.querySelector('[data-celular="historico"]')?.innerText ?? null)));

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

// Anchos del renglón de hoy con otros montos (solo se mide; el texto vuelve a su lugar).
if (process.env.MEDIR_HOY) {
  console.log("RENGLON-HOY", JSON.stringify(await pg.evaluate(() => {
    const p = document.querySelector('[data-celular="hoy"]'), f = document.querySelector('[data-celular="subtitulo"]'), h = document.querySelector('[data-celular="historico"]');
    if (!p || !f) return null;
    const original = p.innerHTML, out = {};
    const caso = (n, html) => { if (html) p.innerHTML = html; const a = p.getBoundingClientRect(), b = f.getBoundingClientRect(), c = p.parentElement.getBoundingClientRect(); out[n] = { hoy: Math.round(a.width), frescura: Math.round(b.width), fila: Math.round(c.width), altoFila: Math.round(c.height), mismaFila: Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2) < 6, toque: Math.round(f.querySelector("button, [role=button]")?.getBoundingClientRect().height ?? b.height) }; };
    caso("real");
    caso("4 dígitos", 'Hoy <span class="font-medium">$9,888</span><span class="text-gray-500"> · ayer $8,888</span>');
    caso("5 dígitos", 'Hoy <span class="font-medium">$12,340</span><span class="text-gray-500"> · ayer $11,795</span>');
    caso("sin ventas", 'Hoy <span class="font-medium">sin ventas todavía</span><span class="text-gray-500"> · ayer $1,795</span>');
    p.innerHTML = original;
    const lh = h ? parseFloat(getComputedStyle(h).lineHeight) : 0;
    out.historico = h ? { texto: h.textContent, lineas: Math.round(h.getBoundingClientRect().height / lh) } : null;
    return out;
  }), null, 1));
}
console.log("ARRIBA", JSON.stringify(await medir(), null, 1));
console.log("TEXTO", JSON.stringify(await pg.evaluate(() => document.body.innerText.slice(0, 700))));
await pg.screenshot({ path: `${OUT}/${PREFIJO}-arriba.png` });
// La gráfica: su alto, el promedio y, con TOCAR=1, un día tocado (captura aparte).
console.log("GRAFICA", JSON.stringify(await pg.evaluate(() => {
  const g = document.querySelector('[data-celular="inicio"] [data-elemento="grafica-dias"] [role="group"]'); if (!g) return null;
  const c = g.getBoundingClientRect(), barras = [...g.querySelectorAll("[data-dia]")].map((b) => Math.round(b.getBoundingClientRect().height));
  const p = g.querySelector('[data-elemento="grafica-promedio"]')?.getBoundingClientRect();
  const l = document.querySelector('[data-celular="inicio"] [data-elemento="grafica-linea"]').getBoundingClientRect();
  return { alto: Math.round(c.height), arriba: Math.round(c.top), abajo: Math.round(c.bottom), barraMasAlta: Math.max(...barras), promedioDesdeAbajo: p ? Math.round(c.bottom - p.top) : null, lineaDeArribaTermina: Math.round(l.bottom) };
})));
if (process.env.TOCAR) {
  const b = pg.locator('[data-celular="inicio"] [data-dia="3"]');
  await b.tap();
  await pg.waitForTimeout(500);
  console.log("TOCADO", JSON.stringify(await pg.evaluate(() => document.querySelector('[data-celular="inicio"] [data-elemento="grafica-linea"]').textContent)));
  await pg.screenshot({ path: `${OUT}/_extra-${PREFIJO}-dia-tocado.png` });
  await b.tap();
  await pg.waitForTimeout(300);
}
console.log("LINEA-GRAFICA", JSON.stringify(await pg.evaluate(() => {
  const l = document.querySelector('[data-celular="inicio"] [data-elemento="grafica-linea"]'); if (!l) return null;
  const s = document.createElement("span"); s.className = l.className; s.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap;min-height:0"; l.parentElement.appendChild(s);
  const w = (t) => { s.textContent = t; return Math.round(s.getBoundingClientRect().width); };
  const out = { texto: l.textContent, ancho: Math.round(l.getBoundingClientRect().width), real: w(l.textContent), peor: w("Venta promedio diaria $12,345 · 1–30 sep"), lineas: Math.round(l.getBoundingClientRect().height / parseFloat(getComputedStyle(l).lineHeight)) };
  s.remove(); return out;
})));
if (process.env.VER_HISTORICO) console.log("HISTORICO-JSON", JSON.stringify(await pg.evaluate(() => fetch("/api/multifashion/historico").then((r) => r.json()))));
// VER_COMPARATIVO=1: las dos sumas detrás del % (solo lecturas).
if (process.env.VER_COMPARATIVO) console.log("COMPARATIVO-JSON", JSON.stringify(await pg.evaluate(async () => {
  const j = (u) => fetch(u).then((r) => r.json());
  const [hoy, comp, det] = await Promise.all([j("/api/multifashion/venta-hoy"), j("/api/multifashion/comparativo-hoy"), j(`/api/multifashion/detalle-mensual?year=${new Date().getFullYear()}&mes=${new Date().getMonth() + 1}`)]);
  return { hoy: { fecha: hoy.fecha, ventas: hoy.ventas, documentos: hoy.documentos, sync: hoy.sync }, comp, mes: { ventas: det.totales?.ventas, dia_actual: det.dia_actual, yoy: det.yoy } };
})));
if (process.env.MEDIR_LINEAS) console.log("LINEAS-12M", JSON.stringify(await pg.evaluate(() => {
  const h = document.querySelector('[data-celular="historico"]'); if (!h) return null;
  const s = document.createElement("span"); s.className = h.className; s.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap"; h.parentElement.appendChild(s);
  const out = { ancho: Math.round(h.getBoundingClientRect().width), real: [...h.querySelectorAll("span")].map((x) => ({ t: x.textContent, w: Math.round((() => { s.textContent = x.textContent; return s.getBoundingClientRect().width; })()) })), altoReal: Math.round(h.getBoundingClientRect().height) };
  for (const t of ["Últimos 12 meses · día de mayor venta: miércoles (22 %)", "12 meses · día de mayor venta: miércoles (22 %)", "Últimos 12 meses · día de mayor venta: sábado (22 %)", "Horario de mayor venta: 11 am–2 pm (38 %)", "Últimos 12 meses · horario de mayor venta: 11 am–2 pm (38 %)"]) { s.textContent = t; out[t] = Math.round(s.getBoundingClientRect().width); }
  s.remove(); return out;
})));
// MEDIR_LINEA=1: cuánto miden, en una línea, las redacciones candidatas de «12 meses» (ancho útil 370).
if (process.env.MEDIR_LINEA) {
  console.log("LINEA-12M", JSON.stringify(await pg.evaluate(() => {
    const h = document.querySelector('[data-celular="historico"]'); if (!h) return null;
    const s = document.createElement("span"); s.className = h.className; s.style.cssText = "position:absolute;visibility:hidden;white-space:nowrap";
    h.parentElement.appendChild(s);
    const casos = { normal: ["domingo", "$5,412", "5–6 pm"], peor: ["miércoles", "$12,345", "5–6 pm"], peorHora: ["miércoles", "$12,345", "11 am–12 pm"] };
    const formas = {
      "Últimos 12 meses · mayor venta: D (promedio M) y H": (d, m, x) => `Últimos 12 meses · mayor venta: ${d} (promedio ${m}) y ${x}`,
      "12 meses · mayor venta: D (promedio M) y H": (d, m, x) => `12 meses · mayor venta: ${d} (promedio ${m}) y ${x}`,
      "Últimos 12 meses · mayor venta: D (M) y H": (d, m, x) => `Últimos 12 meses · mayor venta: ${d} (${m}) y ${x}`,
      "12 meses · mayor venta: D (M) y H": (d, m, x) => `12 meses · mayor venta: ${d} (${m}) y ${x}`,
      "Últimos 12 meses · mayor venta: D y H": (d, m, x) => `Últimos 12 meses · mayor venta: ${d} y ${x}`,
    };
    const out = { ancho: Math.round(h.getBoundingClientRect().width), real: h.textContent, lineasReal: Math.round(h.getBoundingClientRect().height / parseFloat(getComputedStyle(h).lineHeight)) };
    for (const [n, f] of Object.entries(formas)) { out[n] = {}; for (const [c, v] of Object.entries(casos)) { s.textContent = f(...v); out[n][c] = Math.round(s.getBoundingClientRect().width); } }
    s.remove();
    return out;
  }), null, 1));
}
// MES_ANTERIOR=1: un toque en ‹ para medir «Septiembre 2026» con ‹ y › a la vista.
if (process.env.MES_ANTERIOR) {
  await pg.locator('[data-renglon="periodo"] [data-flecha="anterior"]').tap();
  await pg.waitForTimeout(3500);
  await pg.waitForSelector('[data-renglon="periodo"] [aria-expanded]', { timeout: 15000 }).catch(() => console.log("SIN período tras ‹", pg.url()));
  await pg.screenshot({ path: `${OUT}/_extra-${PREFIJO}-mes-anterior.png` });
  console.log("TRAS-TOQUE", JSON.stringify(await pg.evaluate(() => ({ barra: !!document.querySelector("[data-barra-celular]"), fila: document.querySelector('[data-renglon="periodo"]')?.innerHTML.slice(0, 700) ?? null, texto: document.body.innerText.slice(0, 300) }))));
  console.log("MES-ANTERIOR", JSON.stringify(await pg.evaluate(() => {
    const fila = document.querySelector('[data-renglon="periodo"]'); const b = fila.querySelector("[aria-expanded]"); const t = b.querySelector("span");
    const r = (e) => { const x = e.getBoundingClientRect(); return { x: Math.round(x.left), w: Math.round(x.width), right: Math.round(x.right) }; };
    return { texto: b.innerText, boton: r(b), textoPx: r(t), desborda: b.scrollWidth > b.clientWidth, controles: [...fila.querySelectorAll("button")].filter((e) => e.getBoundingClientRect().width > 0).map((e) => ({ t: (e.innerText || e.getAttribute("aria-label")).trim(), ...r(e) })), scrollWidth: document.documentElement.scrollWidth, numero: document.querySelector('[data-celular="numero-del-mes"]')?.textContent, linea: document.querySelector('[data-celular="linea-del-mes"]')?.textContent, sub: document.querySelector('[data-celular="hoy-y-frescura"]')?.innerText };
  })));
  await pg.screenshot({ path: `${OUT}/_extra-${PREFIJO}-mes-anterior.png` });
}
// «abajo» solo si la página todavía se desliza.
const fin = await pg.evaluate(() => { const r = (s) => document.querySelector(s)?.getBoundingClientRect(); return { alto: document.documentElement.scrollHeight, vista: innerHeight, grafica: Math.round(r('[data-celular="inicio"]')?.bottom ?? 0), tabBar: Math.round(r("[data-tab-bar]")?.top ?? 0) }; });
console.log("FIN", JSON.stringify(fin));
if (fin.alto > fin.vista + 4) {
  await pg.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await pg.waitForTimeout(800);
  await pg.screenshot({ path: `${OUT}/${PREFIJO}-abajo.png` });
}
if (process.env.SIN_LISTA) { console.log(`escrituras bloqueadas por el navegador: ${bloqueadas}`); await br.close(); process.exit(0); }

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
