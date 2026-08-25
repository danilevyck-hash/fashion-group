// ─────────────────────────────────────────────────────────────────────────────
// MEDICIÓN — LA PANTALLA ÚNICA DE COMPROBANTES: 4 anchos × 4 marcas × 3 roles,
// contra el BUILD DE PRODUCCIÓN y con DATOS DE PRODUCCIÓN.
//
//   npx next build && npx next start -p 3911
//   BASE=http://localhost:3911 node scripts/_medir-una-pantalla-anchos.mjs
//
// 🔴 NADA SE MANDA A SWITCH NI SE BORRA NADA. El navegador ABORTA cualquier
// petición que no sea GET/HEAD: esta medición pasa por una pantalla con botones
// de borrar, de borrado MASIVO y de exportar, y desde el 25-ago tocar una
// salida MANDA sin ventana en el medio. El script no las toca, pero medir no
// puede depender de que nadie se equivoque.
//
// 🩸 Gotchas ya pagados y vigentes:
//   · El service worker rompe la hidratación: se borra en el init script.
//   · Por defecto solo se abre el mes ACTUAL. Primero se despliegan los meses,
//     DESPUÉS se esperan las filas (los de Reebok son de julio).
//   · El panel abre en «Pedidos» y NO hay «Todos»: lo que se ve al llegar NO es
//     el universo. El total se pide a la API y la suma de los tres chips se
//     compara contra ÉSE.
// ─────────────────────────────────────────────────────────────────────────────
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3911";
const COOKIES = JSON.parse(readFileSync("/tmp/t910-cookies.json", "utf8"));
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
const ROLES = ["admin", "secretaria", "vendedor"];
const ADMINISTRA = new Set(["admin", "secretaria"]);

const fallos = [];
const heredados = [];
let escriturasBloqueadas = 0;

/** El universo VIVO, leído de la API que alimenta la pantalla. */
async function universo(marca) {
  const r = await fetch(`${BASE}/api/catalogo/${marca}/orders`, {
    headers: { Cookie: `cxc_session=${COOKIES.admin}` },
  });
  const filas = r.ok ? await r.json() : [];
  return {
    total: filas.length,
    borradores: filas.filter((f) => String(f.status ?? "").trim().toLowerCase() === "borrador").length,
    cotizaciones: filas.filter((f) => f.switch_documento === "cotizacion").length,
  };
}

const browser = await chromium.launch();

async function contexto(rol) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: COOKIES[rol], url: BASE }]);
  await ctx.addInitScript((r) => {
    try { sessionStorage.setItem("cxc_role", r); } catch {}
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos", "guias", "cxc", "directorio"])); } catch {}
    try { sessionStorage.setItem("fg_user_name", "medicion"); } catch {}
    try { delete Navigator.prototype.serviceWorker; } catch {}
  }, rol);
  await ctx.route("**/*", (route) => {
    const m = route.request().method();
    if (m === "GET" || m === "HEAD") return route.continue();
    escriturasBloqueadas++;
    return route.abort();
  });
  return ctx;
}

const UNIVERSO = {};
for (const m of MARCAS) UNIVERSO[m] = await universo(m);
console.log("Universo VIVO por marca (de la API):");
for (const m of MARCAS) console.log(`  ${m.padEnd(8)} ${UNIVERSO[m].total} filas · ${UNIVERSO[m].borradores} borradores · ${UNIVERSO[m].cotizaciones} cotizaciones`);

const resumen = [];

for (const { nombre, w, h } of ANCHOS) {
  console.log(`\n══════ ${nombre} (${w}px) ══════`);
  for (const rol of ROLES) {
    const ctx = await contexto(rol);
    const page = await ctx.newPage();
    await page.setViewportSize({ width: w, height: h });
    for (const marca of MARCAS) {
      await page.goto(`${BASE}/catalogo/${marca}/pedidos`, { waitUntil: "networkidle" });
      await page.waitForSelector('[data-medir="filtro-tipo-comprobante"]', { timeout: 15000 }).catch(() => {});

      // Desplegar todos los meses ANTES de mirar filas.
      await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          if (/\(\d+ comprobantes?\)/.test(b.textContent || "") && !b.querySelector("svg.rotate-90")) b.click();
        }
      });
      await page.waitForTimeout(250);

      const m = await page.evaluate(() => {
        const chips = Array.from(
          document.querySelectorAll('[data-medir="filtro-tipo-comprobante"] button'),
        ).map((b) => (b.textContent || "").replace(/\s+/g, " ").trim());
        const conteo = chips.map((t) => Number(t.match(/(\d+)$/)?.[1] ?? 0));
        const textos = Array.from(document.querySelectorAll("button, a")).map((b) => (b.textContent || "").trim());
        const chicos = [], tactiles = [];
        for (const n of document.querySelectorAll("button, a, input")) {
          const b = n.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          if (b.height < 44 || b.width < 44) {
            const lbl = n.closest("label");
            const lr = lbl ? lbl.getBoundingClientRect() : null;
            if (!(lr && lr.height >= 44 && lr.width >= 44)) {
              tactiles.push(`${n.tagName}[${(n.textContent || n.getAttribute("aria-label") || "").trim().slice(0, 16)}]`);
            }
          }
        }
        for (const n of document.querySelectorAll("*")) {
          const b = n.getBoundingClientRect();
          if (b.width === 0 && b.height === 0) continue;
          const fs = parseFloat(getComputedStyle(n).fontSize);
          if (n.children.length === 0 && (n.textContent || "").trim() && fs < 12) chicos.push(`${fs}px`);
        }
        const tabla = document.querySelector("div.overflow-x-auto");
        return {
          h1: (document.querySelector("h1")?.textContent || "").trim(),
          chips, conteo,
          filas: document.querySelectorAll("tr[data-pedido]").length,
          arrastre: document.documentElement.scrollWidth - window.innerWidth,
          recorteTabla: tabla ? tabla.scrollWidth - tabla.clientWidth : 0,
          exportar: textos.includes("Exportar Excel"),
          masivo: (document.body.textContent || "").includes("Seleccionar todos"),
          casillas: document.querySelectorAll('input[type="checkbox"]').length,
          eliminar: textos.includes("Eliminar"),
          duplicar: textos.includes("Duplicar"),
          editar: textos.includes("Editar"),
          alAdmin: Array.from(document.querySelectorAll("a")).some((a) => (a.getAttribute("href") || "").includes("/catalogos/admin/")),
          tactiles: tactiles.length, chicos: chicos.length,
        };
      });

      const u = UNIVERSO[marca];
      const suma = m.conteo.reduce((a, b) => a + b, 0);
      const debeAdministrar = ADMINISTRA.has(rol);
      const et = `${nombre}/${marca}/${rol}`;

      if (m.h1 !== "Comprobantes") fallos.push(`${et}: el título dice "${m.h1}"`);
      if (m.chips.length !== 3) fallos.push(`${et}: ${m.chips.length} chips (deben ser 3)`);
      if (suma !== u.total) fallos.push(`${et}: los chips suman ${suma} y el universo es ${u.total}`);
      if (m.conteo[2] !== u.borradores) fallos.push(`${et}: chip Borradores ${m.conteo[2]} ≠ ${u.borradores}`);
      if (m.conteo[1] !== u.cotizaciones) fallos.push(`${et}: chip Cotizaciones ${m.conteo[1]} ≠ ${u.cotizaciones}`);
      if (m.arrastre > 0) fallos.push(`${et}: arrastre de página ${m.arrastre}px`);
      if (m.exportar !== debeAdministrar) fallos.push(`${et}: «Exportar Excel» ${m.exportar ? "VISIBLE" : "ausente"} para ${rol}`);
      if (m.masivo !== debeAdministrar) fallos.push(`${et}: borrado masivo ${m.masivo ? "VISIBLE" : "ausente"} para ${rol}`);
      if (!debeAdministrar && m.casillas > 0) fallos.push(`${et}: el vendedor ve ${m.casillas} casillas de selección`);
      if (!debeAdministrar && m.eliminar) fallos.push(`${et}: el vendedor ve «Eliminar»`);
      if (u.total > 0 && !m.editar) fallos.push(`${et}: nadie ve «Editar»`);
      if (m.alAdmin) fallos.push(`${et}: hay un enlace a /catalogos/admin/`);
      // ⚠️ HEREDADOS, no fallos — misma convención que
      // `_medir-comprobantes-anchos.mjs`: arrastre y recorte son fallo; los
      // tocables chicos y la letra chica se cuentan y se miran. Verificado
      // contra origin/main: las clases de los botones de fila
      // (`px-2.5 py-1 ... text-xs`), los filtros por origen y las cabeceras de
      // mes vienen VERBATIM del panel viejo. Este cambio no achicó nada.
      if (m.tactiles > 0) heredados.push(`${et}: ${m.tactiles} tocables <44px`);
      if (m.chicos > 0) heredados.push(`${et}: ${m.chicos} textos <12px`);

      console.log(
        `  ${marca.padEnd(8)} ${rol.padEnd(11)} «${m.h1}» · chips ${m.chips.join(" ")} = ${suma}/${u.total}` +
        ` · filas ${m.filas} · arrastre ${m.arrastre <= 0 ? "✅" : `❌${m.arrastre}`}` +
        ` · recorte-tabla ${m.recorteTabla > 0 ? `${m.recorteTabla} (scrollea)` : "0"}` +
        ` · exportar ${m.exportar ? "sí" : "no"} · masivo ${m.masivo ? "sí" : "no"} · eliminar ${m.eliminar ? "sí" : "no"} · duplicar ${m.duplicar ? "sí" : "no"}`,
      );
      resumen.push({ nombre, marca, rol, ...m });
    }
    await ctx.close();
  }
}

await browser.close();
console.log(`\n🔒 escrituras BLOQUEADAS por el medidor: ${escriturasBloqueadas} (nada salió a Switch ni se borró)`);
console.log(`\n═══ VEREDICTO: ${fallos.length} fallos sobre ${resumen.length} pantallas medidas ═══`);
for (const f of fallos) console.log(`  ❌ ${f}`);
const maxT = Math.max(0, ...resumen.map((r) => r.tactiles));
const maxC = Math.max(0, ...resumen.map((r) => r.chicos));
console.log(`\n⚠️ heredados (no los introduce este cambio): ${heredados.length} pantallas con tocables<44 o letra<12 · peor caso ${maxT} tocables · ${maxC} textos`);
