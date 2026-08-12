// Medición REAL en navegador de la LISTA DE PROYECTOS DE UNA MARCA y su menú
// "···" (11-ago-2026, retiro de "Cerrar proyecto").
//
// SOLO LECTURA. Se abre el menú de la primera fila (no escribe nada) y el
// modal de "Registrado por error — eliminar" se abre y se cierra con Cancelar
// — el POST de anular recién sale al escribir un motivo y apretar Eliminar,
// cosa que este script NUNCA hace.
//
// Qué mide, en 390 · 834 · 1024 · 1440, contra el build de producción:
//   A. ARRASTRE DE PÁGINA — documentElement.scrollWidth − clientWidth.
//   B. RECORTADOS — contenido que se sale de su caja SIN scroller. ⚠️ La tabla
//      de proyectos vive dentro de un overflow-x-auto declarado: ese scroller
//      es el mecanismo, no un defecto, y no cuenta.
//   C. BLANCOS TÁCTILES < 44 px.
//   D. TEXTOS < 12 px.
//   E. El TEXTO del menú abierto — para leer las 3 acciones sin abrir el
//      navegador, y para FALLAR si "Cerrar proyecto" reaparece.
//
// GOTCHAS medidos de este repo: cookie firmada + sessionStorage.cxc_role +
// `delete Navigator.prototype.serviceWorker` antes de navegar.
//
//   PORT=3175 SALIDA=/tmp/mk-menu BLOQUE=CK node scripts/_medir-marketing-menu-fila.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const PORT = process.env.PORT ?? "3175";
const BASE = process.env.BASE ?? `http://localhost:${PORT}`;
const SALIDA = process.env.SALIDA ?? "/tmp/mk-menu";
const BLOQUE = process.env.BLOQUE ?? "CK";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true, captura: true },
  { nombre: "834", width: 834, height: 1194, movil: true, captura: true },
  { nombre: "1024", width: 1024, height: 768, movil: false, captura: false },
  { nombre: "1440", width: 1440, height: 900, movil: false, captura: true },
];

const MEDIR = (raiz) => `(() => {
  const doc = document.documentElement;
  const arrastrePagina = doc.scrollWidth - doc.clientWidth;
  const root = document.querySelector(${JSON.stringify(raiz)});
  if (!root) return { falta: ${JSON.stringify(raiz)} };
  const cs0 = getComputedStyle(root);
  const anchoUtil = Math.round(
    root.getBoundingClientRect().width -
      parseFloat(cs0.paddingLeft) - parseFloat(cs0.paddingRight),
  );
  const recortados = [], chicos = [], textosChicos = [];
  for (const el of root.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) continue;
    const cs = getComputedStyle(el);
    const desborde = el.scrollWidth - el.clientWidth;
    if (desborde > 1 && cs.overflowX === "hidden") {
      recortados.push({
        tag: el.tagName.toLowerCase(),
        clase: (el.className || "").toString().slice(0, 60),
        px: desborde,
        texto: (el.textContent || "").trim().slice(0, 40),
      });
    }
    if (["BUTTON","A","INPUT","SELECT","TEXTAREA"].includes(el.tagName)) {
      const srOnly = (el.className || "").toString().includes("sr-only");
      if (cs.display !== "none" && !srOnly && r.height > 0 && r.height < 44) {
        chicos.push({
          tag: el.tagName.toLowerCase(),
          alto: Math.round(r.height * 10) / 10,
          texto: (el.textContent || el.getAttribute("placeholder") || "").trim().slice(0, 40),
        });
      }
    }
    const propio = [...el.childNodes]
      .filter((n) => n.nodeType === 3 && n.textContent.trim())
      .map((n) => n.textContent.trim()).join(" ");
    if (propio) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ px: fs, texto: propio.slice(0, 40) });
    }
  }
  return { arrastrePagina, anchoUtil, recortados, chicos, textosChicos };
})()`;

const MODAL = "div.fixed.inset-0.z-\\[60\\]";

const ok = (m) =>
  m.falta
    ? `FALTA ${m.falta}`
    : `arrastre ${m.arrastrePagina} · recortados ${m.recortados.length} · táctiles<44 ${m.chicos.length} · texto<12 ${m.textosChicos.length}`;

(async () => {
  mkdirSync(SALIDA, { recursive: true });
  const browser = await chromium.launch();
  const informe = {};
  let fallas = 0;

  for (const t of TAMANOS) {
    const ctx = await browser.newContext({
      viewport: { width: t.width, height: t.height },
      isMobile: t.movil,
      hasTouch: t.movil,
      deviceScaleFactor: 2,
    });
    await ctx.addCookies([
      { name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" },
    ]);
    await ctx.addInitScript(() => {
      try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
      try { delete Navigator.prototype.serviceWorker; } catch {}
    });
    const page = await ctx.newPage();
    const caso = {};

    // ---------------- 1. LA LISTA DE LA MARCA ----------------
    await page.goto(`${BASE}/marketing?bloque=${BLOQUE}`, { waitUntil: "networkidle" });
    await page.waitForTimeout(900);
    caso.lista = await page.evaluate(MEDIR("main"));
    if (t.captura) {
      await page.screenshot({
        path: path.join(SALIDA, `lista-${BLOQUE}-${t.nombre}.png`),
        fullPage: true,
      });
    }

    // ---------------- 2. EL MENÚ ··· DE LA PRIMERA FILA ----------------
    const menuBtn = page.locator("main table button[aria-haspopup], main table button:has-text('···'), main table td button").last();
    // El botón del OverflowMenu es el único button dentro de la celda Acciones.
    const overflow = page.locator("main tbody tr").first().locator("td:last-child button").first();
    if (await overflow.count()) {
      await overflow.click();
      await page.waitForTimeout(400);
      caso.menuTexto = await page.evaluate(`(() => {
        // El menú del OverflowMenu se dibuja en un portal (z-[200]).
        const m = document.querySelector('div.bg-white.border.border-gray-200.rounded-lg.shadow-lg');
        return (m?.innerText || "").split(String.fromCharCode(10)).map(s => s.trim()).filter(Boolean);
      })()`);
      if (t.captura) {
        await page.screenshot({
          path: path.join(SALIDA, `menu-${BLOQUE}-${t.nombre}.png`),
          fullPage: false,
        });
      }
      // ---------------- 3. EL MODAL DE "REGISTRADO POR ERROR" ----------------
      // getByRole no ve los items del portal del OverflowMenu (medido):
      // se localiza por texto.
      const eliminar = page.locator("button", { hasText: "Registrado por error" });
      if (await eliminar.count()) {
        await eliminar.first().click();
        await page.waitForTimeout(450);
        caso.modalEliminar = await page.evaluate(MEDIR(MODAL));
        if (t.captura) {
          await page.screenshot({
            path: path.join(SALIDA, `modal-eliminar-${BLOQUE}-${t.nombre}.png`),
            fullPage: false,
          });
        }
        // Cerrar SIN escribir nada.
        await page.getByRole("button", { name: "Cancelar" }).first().click();
        await page.waitForTimeout(300);
      } else {
        caso.modalEliminar = { falta: "no se dibujó 'Registrado por error'" };
      }
    } else {
      caso.menuTexto = ["(sin filas con menú)"];
      caso.modalEliminar = { falta: "sin filas" };
    }
    void menuBtn;

    informe[t.nombre] = caso;
    await ctx.close();

    console.log(`\n=== ${t.nombre} px ===`);
    for (const [k, m] of Object.entries(caso)) {
      if (k === "menuTexto") continue;
      console.log(`  ${k.padEnd(14)} ${ok(m)}${m.anchoUtil ? ` (útil ${m.anchoUtil})` : ""}`);
      if (m.recortados?.length) console.log("     recortados:", JSON.stringify(m.recortados));
      if (m.chicos?.length) console.log("     táctiles:", JSON.stringify(m.chicos));
      if (m.textosChicos?.length) console.log("     textos:", JSON.stringify(m.textosChicos));
      if (!m.falta) {
        fallas +=
          (m.arrastrePagina > 0 ? 1 : 0) + m.recortados.length +
          m.chicos.length + m.textosChicos.length;
      }
    }
    console.log("  MENÚ ··· :", JSON.stringify(caso.menuTexto));
    // El candado del script: si el menú dice "Cerrar proyecto", es falla.
    const menuStr = (caso.menuTexto ?? []).join(" | ");
    if (/Cerrar proyecto|Reabrir/.test(menuStr)) {
      fallas += 1;
      console.log("  🔴 el menú volvió a ofrecer Cerrar/Reabrir");
    }
  }

  writeFileSync(path.join(SALIDA, "informe.json"), JSON.stringify(informe, null, 2));
  await browser.close();
  console.log(`\nCapturas e informe en ${SALIDA}`);
  console.log(fallas === 0 ? "\n🟢 0 en los cuatro anchos." : `\n🔴 ${fallas} hallazgos.`);
})();
