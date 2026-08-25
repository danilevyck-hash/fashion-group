// Mide, EN EL NAVEGADOR contra el build de producción y con datos de producción,
// la pestaña de Confecciones Boston del CXC en los CUATRO anchos, en los TRES
// estados que puede tener el aviso de frescura:
//
//   sin-aviso  — /api/sync-status falla ⇒ <SyncStatus> devuelve null.
//                Es EXACTAMENTE lo que se ve hoy en origin/main: la línea de base.
//   fecha      — dato fresco: se lee "Actualizado: …" y NO hay ámbar.
//   ambar      — dato viejo (el estado REAL de hoy): "⚠️ … sin actualizar desde …".
//
// Lo que se exige: el aviso no puede ensanchar nada. La caja crece HACIA ABAJO.
//
// SOLO LECTURA: intercepta respuestas en el navegador, nunca escribe. Aborta
// cualquier pedido que no sea GET.
//
//   BASE=http://localhost:3251 node scripts/_medir-boston-fecha-anchos.mjs
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const BASE = process.env.BASE || "http://localhost:3251";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ANCHOS = [390, 834, 1024, 1440];

const ISO_VIEJO = "2026-08-19T03:10:00.000Z"; // el último sync bueno, el real
const ISO_FRESCO = new Date(Date.now() - 30 * 60 * 1000).toISOString();

const MEDIR = `(() => {
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - doc.clientWidth);

  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && el.offsetParent !== null;
  };

  // Recortados: el contenido no entra y el contenedor NO declara un scroller.
  const recortados = [];
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const s = getComputedStyle(el);
    if (s.overflowX === "auto" || s.overflowX === "scroll") continue;
    const de = el.scrollWidth - el.clientWidth;
    if (de > 1) recortados.push({ sel: el.tagName + "." + (el.className || "").toString().split(" ").slice(0, 3).join("."), de });
  }

  // Blancos táctiles por debajo de 44 px.
  const tactiles = [];
  for (const el of document.querySelectorAll("button, a, input, select, textarea, [role=button]")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height < 44 || r.width < 44) tactiles.push({ t: (el.innerText || el.getAttribute("aria-label") || el.tagName).slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) });
  }

  // Textos por debajo de 12 px.
  const chicos = [];
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const propio = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!propio) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 12) chicos.push({ t: el.textContent.trim().slice(0, 30), px });
  }

  const aviso = document.querySelector('[role="status"]');
  const bloque = aviso ? aviso.parentElement : null;
  return {
    arrastre,
    recortados,
    tactiles,
    chicos,
    texto: document.body.innerText,
    altoAviso: bloque ? Math.round(bloque.getBoundingClientRect().height) : 0,
  };
})()`;

function respuestaSyncStatus(iso, vieja) {
  return {
    ok: true,
    tabla: "estadocuenta",
    last_global: iso,
    por_empresa: { confecciones_boston: iso },
    stale: vieja ? [{ empresa: "confecciones_boston", last_synced_at: iso }] : [],
  };
}

async function medir(ctx, ancho, estado) {
  const page = await ctx.newPage();
  await page.setViewportSize({ width: ancho, height: 900 });
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "medicion");
    sessionStorage.setItem("fg_modules", JSON.stringify(["cxc"]));
  });

  let escrituras = 0;
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") { escrituras++; return route.abort(); }
    if (req.url().includes("/api/sync-status")) {
      if (estado === "sin-aviso") return route.fulfill({ status: 500, body: "no" });
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(respuestaSyncStatus(estado === "ambar" ? ISO_VIEJO : ISO_FRESCO, estado === "ambar")),
      });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/admin?tab=boston`, { waitUntil: "networkidle" });
  await page.waitForFunction(
    () => /Total pendiente/i.test(document.body.innerText),
    null,
    { timeout: 60000 },
  );
  await page.waitForTimeout(2500);

  const r = await page.evaluate(MEDIR);
  await page.close();
  return { ...r, escrituras };
}

async function main() {
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);

  const base = {};
  let fallos = 0;

  for (const estado of ["sin-aviso", "fecha", "ambar"]) {
    console.log(`\n═══ estado: ${estado} ═══`);
    for (const ancho of ANCHOS) {
      const m = await medir(ctx, ancho, estado);

      if (!/Total pendiente/i.test(m.texto)) { console.log(`  ${ancho}  ❌ la pestaña no cargó`); fallos++; continue; }

      // El script tiene que FALLAR si no encuentra lo que dice medir.
      if (estado === "ambar") {
        if (!/sin actualizar desde/i.test(m.texto)) { console.log(`  ${ancho}  ❌ falta el ámbar`); fallos++; }
        if (!/Confecciones Boston/.test(m.texto)) { console.log(`  ${ancho}  ❌ el ámbar no nombra a Boston`); fallos++; }
      }
      if (estado === "fecha") {
        if (!/Actualizado:/.test(m.texto)) { console.log(`  ${ancho}  ❌ falta la fecha`); fallos++; }
        if (/sin actualizar desde/i.test(m.texto)) { console.log(`  ${ancho}  ❌ ámbar con dato fresco`); fallos++; }
      }
      if (estado === "sin-aviso" && /Actualizado:/.test(m.texto)) { console.log(`  ${ancho}  ❌ hay aviso donde no debía`); fallos++; }

      if (estado === "sin-aviso") base[ancho] = m;
      const nuevoArrastre = m.arrastre - (base[ancho]?.arrastre ?? 0);
      const nuevosRecortes = m.recortados.length - (base[ancho]?.recortados.length ?? 0);
      const nuevosTactiles = m.tactiles.length - (base[ancho]?.tactiles.length ?? 0);
      const nuevosChicos = m.chicos.length - (base[ancho]?.chicos.length ?? 0);

      console.log(
        `  ${String(ancho).padStart(4)}  arrastre ${m.arrastre} px (nuevo ${nuevoArrastre}) · ` +
        `recortados ${m.recortados.length} (nuevos ${nuevosRecortes}) · ` +
        `táctiles<44 ${m.tactiles.length} (nuevos ${nuevosTactiles}) · ` +
        `textos<12 ${m.chicos.length} (nuevos ${nuevosChicos}) · ` +
        `alto del aviso ${m.altoAviso} px · escrituras bloqueadas ${m.escrituras}`,
      );
      if (nuevoArrastre > 0 || nuevosRecortes > 0 || nuevosTactiles > 0 || nuevosChicos > 0) {
        fallos++;
        for (const r of m.recortados) console.log(`        recortado ${r.sel} +${r.de}px`);
        for (const t of m.tactiles) console.log(`        táctil ${t.w}x${t.h} "${t.t}"`);
        for (const c of m.chicos) console.log(`        texto ${c.px}px "${c.t}"`);
      }
    }
  }

  await browser.close();
  console.log(fallos === 0 ? "\n🟢 0 arrastre NUEVO, 0 recorte nuevo, 0 táctil nuevo, 0 texto chico nuevo" : `\n🔴 ${fallos} problemas`);
  process.exit(fallos === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
