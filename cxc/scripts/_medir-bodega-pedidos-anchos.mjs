// Medición de LA LISTA DE PEDIDOS rol por rol (25-ago-2026), en los anchos de la
// casa: 390 (iPhone) · 834 (iPad) · 1024 (iPad ACOSTADO) · 1440.
//
// Daniel: *"Dale acceso a bodega a la lista de pedidos."* Lo que hay que probar
// son DOS cosas a la vez, y por eso el script recorre ROLES y no solo anchos:
//   · **bodega ve filas** en las 4 marcas (antes: 403 → pantalla en ceros);
//   · **no se le ofrece nada que no pueda**: 0 «Eliminar», 0 «Duplicar»,
//     0 «Exportar Excel», 0 casillas, y el botón de la fila dice «Ver».
// Y que **nadie perdió nada**: admin/secretaria/vendedor quedan como en main.
//
// Se mide contra el BUILD DE PRODUCCIÓN, con DATOS DE PRODUCCIÓN.
//
// 🩸 La cookie de cada rol REUSA el token de una sesión de admin viva y solo
// cambia el `role` del payload (`_cookie-medicion-rol.ts`): el middleware valida
// el token contra `user_sessions`, así que una cookie inventada mediría el
// LOGIN. No se crea ni se toca ninguna fila.
//
// 🩸 El navegador ABORTA todo pedido que no sea GET: esta pantalla tiene borrar
// y exportar, y una medición no puede escribir en producción.
//
// 🩸 Por defecto solo se abre el mes ACTUAL y los pedidos de Reebok son de
// julio: PRIMERO se despliegan los meses, DESPUÉS se esperan las filas. Al revés
// da «no apareció la tabla» por nada.
//
//   npx next build && npx next start -p 3493
//   BASE=http://localhost:3493 ETAPA=despues node scripts/_medir-bodega-pedidos-anchos.mjs
//
// Con ETAPA=antes (sobre `origin/main`) bodega NO ve la lista: el script lo
// espera y lo informa en vez de fallar, para que el ANTES sea comparable.

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3493";
const ETAPA = process.env.ETAPA ?? "despues";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];
const MARCAS = ["reebok", "joybees", "tommy", "calvin"];
const ROLES = ["admin", "secretaria", "vendedor", "bodega"];

/** Lo que CADA rol debe poder hacer desde la lista. `null` = da igual. */
const ESPERADO = {
  admin:      { verFilas: true, eliminar: true,  duplicar: true,  exportar: true,  casillas: true,  accion: "Editar" },
  secretaria: { verFilas: true, eliminar: true,  duplicar: true,  exportar: true,  casillas: true,  accion: "Editar" },
  vendedor:   { verFilas: true, eliminar: false, duplicar: true,  exportar: false, casillas: false, accion: "Editar" },
  bodega:     { verFilas: ETAPA === "despues", eliminar: false, duplicar: false, exportar: false, casillas: false, accion: "Ver" },
};

function cookieDe(rol) {
  const f = `/tmp/fg-cookie-${rol}.txt`;
  if (!existsSync(f)) {
    console.error(`❌ falta ${f}. Generalo con:`);
    console.error(`   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_cookie-medicion-rol.ts ${rol} > ${f}`);
    process.exit(1);
  }
  return readFileSync(f, "utf8").trim();
}

const browser = await chromium.launch();
const fallos = [];
const heredados = [];
const resumen = [];
let escriturasBloqueadas = 0;

async function nuevoContexto(rol) {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: cookieDe(rol), url: BASE }]);
  await ctx.addInitScript((r) => {
    try { sessionStorage.setItem("cxc_role", r); } catch {}
    try { sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"])); } catch {}
    // Sin esto el service worker rompe la hidratación de la medición.
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

/** Arrastre de página, recorte propio, táctiles <44 px y textos <12 px. */
async function medir(page, sel, etiqueta, idx = 0) {
  const m = await page.evaluate(([s, i]) => {
    const el = document.querySelectorAll(s)[i];
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const chicos = [], tactilesChicos = [];
    for (const n of el.querySelectorAll("*")) {
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      const cs = getComputedStyle(n);
      const fs = parseFloat(cs.fontSize);
      if (n.children.length === 0 && n.textContent.trim() && fs < 12) {
        chicos.push(`${Math.round(fs * 10) / 10}px "${n.textContent.trim().slice(0, 24)}"`);
      }
      if ((n.tagName === "BUTTON" || n.tagName === "INPUT" || n.tagName === "A") && (b.height < 44 || b.width < 44)) {
        const lbl = n.closest("label");
        const lr = lbl ? lbl.getBoundingClientRect() : null;
        if (!(lr && lr.height >= 44 && lr.width >= 44)) {
          const txt = (n.textContent || n.getAttribute("aria-label") || n.type || "").trim().slice(0, 20);
          tactilesChicos.push(`${n.tagName}[${txt}] ${Math.round(b.width)}×${Math.round(b.height)}`);
        }
      }
    }
    return {
      docScrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
      w: Math.round(r.width), h: Math.round(r.height),
      scrollW: el.scrollWidth, clientW: el.clientWidth, chicos, tactilesChicos,
    };
  }, [sel, idx]);
  if (!m) { fallos.push(`${etiqueta}: NO SE ENCONTRÓ ${sel}`); return null; }
  const arrastre = m.docScrollW - m.innerW;
  const recorte = m.scrollW - m.clientW;
  if (arrastre > 0) fallos.push(`${etiqueta}: arrastre de página ${arrastre}px`);
  // El contenedor declara `overflow-x-auto`: arrastrar la tabla ES el mecanismo
  // y ya existía en main. Se informa y se compara contra ETAPA=antes.
  if (recorte > 0) heredados.push(`${etiqueta}: recorte ${recorte}px`);
  return { arrastre, recorte, tactiles: m.tactilesChicos.length, textos: m.chicos.length, alto: m.h };
}

/** Qué se le OFRECE al rol en esta pantalla, leído del DOM. */
async function ofrecido(page) {
  return page.evaluate(() => {
    const btns = [...document.querySelectorAll("button")].map((b) => (b.textContent || "").trim());
    const filas = [...document.querySelectorAll("tbody tr")];
    // El botón de acción de la fila = el primero de su última celda.
    const acciones = filas.map((tr) => {
      const td = tr.querySelectorAll("td");
      const b = td[td.length - 1]?.querySelector("button");
      return b ? (b.textContent || "").trim() : "";
    });
    return {
      filas: filas.length,
      eliminar: btns.filter((t) => t === "Eliminar").length,
      duplicar: btns.filter((t) => t === "Duplicar").length,
      exportar: btns.filter((t) => /Exportar Excel/.test(t)).length,
      casillas: document.querySelectorAll('input[type="checkbox"]').length,
      acciones: [...new Set(acciones)],
    };
  });
}

for (const rol of ROLES) {
  const esp = ESPERADO[rol];
  console.log(`\n${"█".repeat(76)}\nROL: ${rol.toUpperCase()}  (ETAPA=${ETAPA})\n${"█".repeat(76)}`);
  const ctx = await nuevoContexto(rol);
  const page = await ctx.newPage();

  for (const marca of MARCAS) {
    console.log(`\n── ${marca} ──────────────────────────────────────────────`);
    for (const a of ANCHOS) {
      await page.setViewportSize({ width: a.w, height: a.h });
      await page.goto(`${BASE}/catalogo/${marca}/pedidos`, { waitUntil: "domcontentloaded", timeout: 120_000 });
      // Los meses primero (el peor caso: TODOS desplegados), las filas después.
      await page.waitForTimeout(1200);
      await page.evaluate(() => {
        for (const b of document.querySelectorAll("button")) {
          if (/\(\d+\s/.test(b.textContent || "") && !b.querySelector("svg.rotate-90")) b.click();
        }
      });
      await page.waitForTimeout(600);

      const o = await ofrecido(page);

      if (esp.verFilas && o.filas === 0) {
        fallos.push(`${rol}/${marca} @${a.w}: 0 filas — la pantalla quedó en ceros`);
        console.log(`  ${a.nombre.padEnd(14)} ❌ 0 filas`);
        continue;
      }
      if (!esp.verFilas) {
        console.log(`  ${a.nombre.padEnd(14)} (sin acceso, esperado en ETAPA=antes) filas=${o.filas}`);
        continue;
      }

      // 🔴 Lo que se OFRECE tiene que coincidir con lo que el rol PUEDE.
      const chequear = (nombre, hay, debe) => {
        if (hay !== debe) fallos.push(`${rol}/${marca} @${a.w}: ${nombre} ofrecido=${hay} esperado=${debe}`);
      };
      chequear("«Eliminar»", o.eliminar > 0, esp.eliminar);
      chequear("«Duplicar»", o.duplicar > 0, esp.duplicar);
      chequear("«Exportar Excel»", o.exportar > 0, esp.exportar);
      chequear("casillas de borrado masivo", o.casillas > 0, esp.casillas);
      if (o.acciones.length && !o.acciones.every((t) => t === esp.accion || t === "Abriendo...")) {
        fallos.push(`${rol}/${marca} @${a.w}: la fila dice ${JSON.stringify(o.acciones)}, esperado «${esp.accion}»`);
      }

      const cuantos = await page.evaluate(() =>
        document.querySelectorAll("div.bg-white.border.border-gray-200.rounded-lg.overflow-x-auto").length);
      let peor = null;
      for (let i = 0; i < cuantos; i++) {
        const m = await medir(page, "div.bg-white.border.border-gray-200.rounded-lg.overflow-x-auto", `${rol}/${marca}/${a.w} (mes ${i + 1}/${cuantos})`, i);
        if (m && (!peor || m.recorte > peor.recorte)) peor = m;
      }
      if (peor) resumen.push({ rol, marca, ancho: a.w, ...peor });
      console.log(
        `  ${a.nombre.padEnd(14)} filas ${String(o.filas).padStart(3)} · acción ${JSON.stringify(o.acciones)} · ` +
        `elim ${o.eliminar} · dup ${o.duplicar} · export ${o.exportar} · casillas ${o.casillas} · ` +
        (peor ? `arrastre ${peor.arrastre <= 0 ? "✅0" : `❌${peor.arrastre}`} · recorte ${peor.recorte} · táctil<44 ${peor.tactiles} · texto<12 ${peor.textos}` : "sin tabla"),
      );
    }
  }
  await ctx.close();
}

console.log(`\n${"═".repeat(84)}\nRESUMEN (ETAPA=${ETAPA})\n${"═".repeat(84)}`);
console.log("rol         marca      ancho  arrastre  recorte  táctil<44  texto<12");
for (const r of resumen) {
  console.log(
    `${r.rol.padEnd(11)} ${r.marca.padEnd(10)} ${String(r.ancho).padStart(5)}  ${String(r.arrastre).padStart(8)}  ` +
    `${String(r.recorte).padStart(7)}  ${String(r.tactiles).padStart(9)}  ${String(r.textos).padStart(8)}`,
  );
}
console.log(`\nEscrituras bloqueadas por el navegador: ${escriturasBloqueadas}`);
if (heredados.length) {
  console.log(`\n⚠️  ${heredados.length} recortes de tabla (overflow-x-auto declarado; comparar contra ETAPA=antes).`);
}
await browser.close();
if (fallos.length) {
  console.log(`\n🔴 ${fallos.length} FALLOS:`);
  for (const f of fallos) console.log(`   · ${f}`);
  process.exit(1);
}
console.log("\n🟢 sin fallos");
