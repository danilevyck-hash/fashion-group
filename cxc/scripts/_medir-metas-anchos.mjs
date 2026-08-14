// Medición de la pestaña Multifashion › METAS en los anchos de la casa:
// 390 (iPhone) · 834 (iPad) · 1024 (iPad acostado) · 1440 (escritorio).
//
// Qué mide, en CUATRO estados:
//   1. La tarjeta de avance de una meta grupal en curso.
//   2. La misma con la meta ya cumplida (textos más largos).
//   3. La ventana de "Nueva meta" (el formulario con la lista de participantes).
//   4. La pestaña Vendedoras con el bloque de aporte por meta.
//
// 🩸 LA DDL TODAVÍA NO CORRIÓ EN PRODUCCIÓN, así que no hay ninguna meta que
// mirar. Por eso la medición INTERCEPTA `/api/multifashion/metas` y le inyecta
// una respuesta con la FORMA EXACTA que va a tener y los números REALES
// medidos (la meta del viaje: 420.000 de sep a dic, las 4 vendedoras que
// venden hoy). El componente medido es el REAL; no se toca la base ni se
// aprieta ningún botón que guarde.
//
// El script FALLA si no encuentra la tarjeta, la barra, la línea de la
// proyección, el formulario o el bloque de Vendedoras: medir cero y dar verde
// sin haber mirado nada es el peor resultado posible.
//
//   npx next start -p 3466
//   BASE=http://localhost:3466 node scripts/_medir-metas-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3466";
const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "medicion", sessionToken: "medicion%local" }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}

// ── La respuesta inyectada: forma exacta + números REALES medidos ────────────
const VENDEDORAS = [
  { clave: "JAILINE", nombre: "JAILINE", formas: ["JAILINE"], ventas: 90777.3, documentos: 1901, ultimaVenta: "2026-08-13" },
  { clave: "MILAGROS TORRES", nombre: "MILAGROS TORRES", formas: ["MILAGROS TORRES"], ventas: 83537.61, documentos: 1865, ultimaVenta: "2026-08-13" },
  { clave: "SHEYNEE BATISTA", nombre: "SHEYNEE BATISTA", formas: ["SHEYNEE BATISTA"], ventas: 62112.09, documentos: 1444, ultimaVenta: "2026-08-13" },
  { clave: "JENNIFER MIRANDA", nombre: "JENNIFER MIRANDA", formas: ["JENNIFER MIRANDA"], ventas: 42669.12, documentos: 801, ultimaVenta: "2026-08-13" },
  { clave: "WITNEY MIRANDA", nombre: "WITNEY MIRANDA", formas: ["WITNEY MIRANDA"], ventas: 27018.2, documentos: 618, ultimaVenta: "2026-03-28" },
  // La partida en dos, para ver el renglón más largo de la lista.
  { clave: "YEISIBETH MUNOZ", nombre: "Yeisibeth Muñoz", formas: ["YEISIBETH MUÑOZ", "Yeisibeth Muñoz"], ventas: 7269.1, documentos: 163, ultimaVenta: "2026-06-29" },
];

const PARTICIPANTES = VENDEDORAS.slice(0, 4).map((v) => ({
  clave: v.clave, nombre: v.nombre, objetivoIndividual: null,
}));

function meta({ vendido, cumplida }) {
  const objetivo = 420000;
  // Las proporciones REALES medidas (may-jul 2026): suman 95,9%, no 100%.
  // El 4,1% que falta son códigos viejos que siguen abiertos en Switch.
  const aportes = [0.324, 0.28, 0.239, 0.116];
  return {
    id: cumplida ? "meta-cumplida" : "meta-viva",
    nombre: "Meta del viaje",
    desde: "2026-09-01",
    hasta: "2026-12-31",
    objetivo,
    tipo: "grupal",
    premio: "Un viaje para todas",
    premioMonto: 2000,
    activa: true,
    participantes: PARTICIPANTES,
    fuente: "rpc",
    temporadaDisponible: true,
    aporteNoAsignado: 0.041,
    avance: {
      vendido, objetivo,
      falta: Math.max(0, objetivo - vendido),
      pctVendido: vendido / objetivo,
      diasTotales: 122, diasTranscurridos: 61, diasQueFaltan: 61,
      fraccionTranscurrida: 0.2432,
      base: "temporada",
      proyeccion: Math.round((vendido / 0.2432) * 100) / 100,
      motivoSinProyeccion: null,
      alcanza: vendido / 0.2432 >= objetivo,
      brechaProyectada: Math.round((vendido / 0.2432 - objetivo) * 100) / 100,
      estado: "en-curso",
      cumplida,
    },
    porVendedora: PARTICIPANTES.map((p, i) => ({
      clave: p.clave, nombre: p.nombre,
      vendido: Math.round(vendido * aportes[i] * 100) / 100,
      aporte: aportes[i], objetivo: null, avance: null,
    })),
  };
}

const ESTADOS = {
  "en-curso": { instalado: true, hoy: "2026-10-31", puedeEditar: true, metas: [meta({ vendido: 102148.26, cumplida: false })], vendedoras: VENDEDORAS },
  cumplida: { instalado: true, hoy: "2026-10-31", puedeEditar: true, metas: [meta({ vendido: 431500.75, cumplida: true })], vendedoras: VENDEDORAS },
};

const browser = await chromium.launch();
const fallos = [];

async function medir(page, sel, etiqueta, ancho) {
  const m = await page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const desbordes = [];
    const chicos = [];
    const tactilesChicos = [];
    for (const n of el.querySelectorAll("*")) {
      const b = n.getBoundingClientRect();
      if (b.width === 0 && b.height === 0) continue;
      if (b.right > r.right + 1 || b.left < r.left - 1) {
        desbordes.push(`${n.tagName}.${String(n.className).slice(0, 40)}`);
      }
      const cs = getComputedStyle(n);
      const fs = parseFloat(cs.fontSize);
      if (n.children.length === 0 && n.textContent.trim() && fs < 12) {
        chicos.push(`${Math.round(fs * 10) / 10}px "${n.textContent.trim().slice(0, 28)}"`);
      }
      if (
        (n.tagName === "BUTTON" || n.tagName === "INPUT" || n.tagName === "A") &&
        (b.height < 44 || b.width < 44)
      ) {
        // ⚠️ Un checkbox de 16 px DENTRO de una etiqueta de 44 px cumple la
        // regla: lo que se toca es la etiqueta entera, no el cuadradito. Es el
        // patrón de la casa; contarlo sería un falso hallazgo.
        const lbl = n.closest("label");
        const lr = lbl ? lbl.getBoundingClientRect() : null;
        const cubierto = lr != null && lr.height >= 44 && lr.width >= 44;
        if (!cubierto) tactilesChicos.push(`${n.tagName} ${Math.round(b.width)}×${Math.round(b.height)}`);
      }
    }
    return {
      docScrollW: document.documentElement.scrollWidth,
      innerW: window.innerWidth,
      w: Math.round(r.width), h: Math.round(r.height),
      scrollW: el.scrollWidth, clientW: el.clientWidth,
      desbordes, chicos, tactilesChicos,
    };
  }, sel);

  if (!m) {
    fallos.push(`${etiqueta} @${ancho}: NO SE ENCONTRÓ ${sel}`);
    console.log(`  ❌ ${etiqueta}: no se encontró ${sel}`);
    return;
  }
  const arrastre = m.docScrollW - m.innerW;
  const recorte = m.scrollW - m.clientW;
  if (arrastre > 0) fallos.push(`${etiqueta} @${ancho}: arrastre ${arrastre}px`);
  if (recorte > 0) fallos.push(`${etiqueta} @${ancho}: recorte ${recorte}px`);
  if (m.desbordes.length) fallos.push(`${etiqueta} @${ancho}: hijos fuera → ${m.desbordes.join(" | ")}`);
  if (m.tactilesChicos.length) fallos.push(`${etiqueta} @${ancho}: táctil <44 → ${m.tactilesChicos.join(" | ")}`);
  if (m.chicos.length) fallos.push(`${etiqueta} @${ancho}: texto <12px → ${m.chicos.join(" | ")}`);

  console.log(
    `  ${etiqueta}: ${m.w}×${m.h}px · arrastre ${arrastre <= 0 ? "✅ 0" : `❌ ${arrastre}`} · ` +
      `recorte ${recorte <= 0 ? "✅ 0" : `❌ ${recorte}`} · ` +
      `táctil<44 ${m.tactilesChicos.length === 0 ? "✅ 0" : `❌ ${m.tactilesChicos.length}`} · ` +
      `texto<12px ${m.chicos.length === 0 ? "✅ 0" : `❌ ${m.chicos.length}`}`,
  );
}

for (const estado of ["en-curso", "cumplida"]) {
  console.log(`\n${"═".repeat(70)}\nESTADO: meta ${estado}\n${"═".repeat(70)}`);
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "cxc_session", value: cookieDeSesion(), url: BASE }]);
  await ctx.addInitScript(() => {
    try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
    try { delete Navigator.prototype.serviceWorker; } catch {}
  });
  await ctx.route("**/api/multifashion/metas", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(ESTADOS[estado]) }),
  );

  const page = await ctx.newPage();
  for (const a of ANCHOS) {
    await page.setViewportSize({ width: a.w, height: a.h });
    await page.goto(`${BASE}/multifashion?subtab=metas`, { waitUntil: "networkidle", timeout: 120_000 });
    await page.waitForSelector('section[aria-label="Meta Meta del viaje"]', { timeout: 60_000 });
    await page.waitForTimeout(400);
    console.log(`\n${a.nombre} (${a.w}px)`);

    const texto = await page.evaluate(
      () => document.querySelector('section[aria-label="Meta Meta del viaje"]').innerText.replace(/\n+/g, " · "),
    );
    // ⚠️ Sin distinguir mayúsculas: los encabezados llevan `uppercase` por CSS y
    //    `innerText` los devuelve YA en mayúsculas. Comparar tal cual daba un
    //    falso hallazgo — el texto estaba, con otra caja.
    const textoLower = texto.toLowerCase();
    for (const exigido of [
      "de $420,000.00",
      "premio",
      "aportó cada una",
      // 🔴 Lo nuevo: que se mide la tienda entera y por qué los aportes dan 96%.
      "la meta cuenta toda la venta de la tienda",
      "el 4% que falta son ventas hechas con el código",
    ]) {
      if (!textoLower.includes(exigido)) fallos.push(`@${a.w}: falta "${exigido}" en la tarjeta`);
    }
    if (estado === "en-curso" && !textoLower.includes("así como van, cierran en")) {
      fallos.push(`@${a.w}: falta la línea de la proyección`);
    }
    if (!/diciembre es el mes fuerte/.test(texto)) {
      fallos.push(`@${a.w}: la tarjeta no explica de dónde sale la proyección`);
    }

    await medir(page, 'section[aria-label="Meta Meta del viaje"]', "tarjeta", a.w);
    if (a.w === 390) console.log(`    texto: ${texto.slice(0, 200)}…`);
    await page.screenshot({ path: `/tmp/metas-${estado}-${a.w}.png`, fullPage: false });

    // Estado 3: la ventana de nueva meta.
    if (estado === "en-curso") {
      await page.click('button:has-text("Nueva meta")');
      await page.waitForSelector("#meta-nombre", { timeout: 20_000 });
      await page.waitForTimeout(300);
      const tf = await page.evaluate(() => document.body.innerText);
      if (!tf.includes("Última venta: 28 mar 2026")) {
        fallos.push(`@${a.w}: el formulario no dice desde cuándo no vende Witney`);
      }
      if (!tf.includes("En Switch está escrita de 2 formas")) {
        fallos.push(`@${a.w}: el formulario no avisa del nombre partido en dos`);
      }
      if (!tf.includes("Cuenta toda la venta de la tienda.")) {
        fallos.push(`@${a.w}: la opción grupal no dice que se mide la tienda entera`);
      }
      if (!tf.includes("marques a quien marques")) {
        fallos.push(`@${a.w}: el formulario no aclara que marcar no recorta la meta`);
      }
      for (const viejo of [
        "Se suma lo que venden todas juntas",
        "Si no marcas a nadie, la meta cuenta toda la venta",
        "usa el monto de arriba",
      ]) {
        if (tf.includes(viejo)) fallos.push(`@${a.w}: sigue el texto viejo "${viejo}"`);
      }
      await medir(page, '[data-medir="meta-form"]', "formulario", a.w);
      await page.screenshot({ path: `/tmp/metas-form-${a.w}.png` });
      await page.keyboard.press("Escape");
      await page.waitForTimeout(200);
    }

    // Estado 4: el bloque dentro de Vendedoras.
    if (estado === "en-curso") {
      await page.goto(`${BASE}/multifashion?subtab=vendedoras`, { waitUntil: "networkidle", timeout: 120_000 });
      await page.waitForTimeout(1200);
      const tv = await page.evaluate(() => document.body.innerText);
      if (!tv.includes("del avance")) fallos.push(`@${a.w}: Vendedoras no muestra el aporte`);
      if (!tv.includes("Esta meta cuenta toda la venta de la tienda")) {
        fallos.push(`@${a.w}: Vendedoras no dice que la meta mide la tienda entera`);
      }
      if (!tv.includes("El 4% que falta son ventas hechas con el código")) {
        fallos.push(`@${a.w}: Vendedoras no explica por qué los aportes no suman 100%`);
      }
      for (const prohibido of ["🥇", "🥈", "🥉"]) {
        if (tv.includes(prohibido)) fallos.push(`@${a.w}: apareció un podio (${prohibido}) en Vendedoras`);
      }
      const arr = await page.evaluate(() => ({
        d: document.documentElement.scrollWidth, i: window.innerWidth,
      }));
      console.log(
        `  vendedoras+metas: arrastre ${arr.d - arr.i <= 0 ? "✅ 0" : `❌ ${arr.d - arr.i}`}`,
      );
      if (arr.d - arr.i > 0) fallos.push(`Vendedoras @${a.w}: arrastre ${arr.d - arr.i}px`);
      await page.screenshot({ path: `/tmp/metas-vendedoras-${a.w}.png` });
    }
  }
  await ctx.close();
}

await browser.close();

console.log(`\n${"═".repeat(70)}`);
if (fallos.length === 0) {
  console.log("🟢 TODO LIMPIO — 0 arrastre, 0 recorte, 0 táctil <44px, 0 texto <12px");
} else {
  console.log(`🔴 ${fallos.length} HALLAZGOS:`);
  for (const f of fallos) console.log(`   · ${f}`);
}
process.exit(fallos.length === 0 ? 0 : 1);
