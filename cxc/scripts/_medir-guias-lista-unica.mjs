// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA — mide el ALTO de la pantalla de despacho con 7 envíos y saca las
// capturas del antes / después.
//
// 🔴 NO TOCA PRODUCCIÓN NI LA BASE. Hoy no hay ninguna guía pendiente (las 187
// están Completadas), así que la guía de 7 envíos es un DOBLE: se intercepta
// `GET /api/guias/<id>` y se contesta con ella. Además se ABORTA cualquier
// pedido que no sea GET contra `/api/`, así que ninguna escritura sale del
// navegador ni por accidente.
//
//   BASE=http://localhost:3213 ETAPA=despues SALIDA=/tmp/x node scripts/_medir-guias-lista-unica.mjs
//
// Gotchas de la casa: sembrar `sessionStorage.cxc_role` (si no, `useAuth`
// redirige al login) y `delete Navigator.prototype.serviceWorker` ANTES de
// navegar. El script FALLA si no encuentra los 7 envíos.
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3213";
const ETAPA = process.env.ETAPA ?? "despues";
const SALIDA = process.env.SALIDA ?? "/tmp/guias-lista-unica";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const ESCALA = Number(process.env.ESCALA ?? 1);

const GUIA_ID = "3f0b6a2e-1c4d-4b8a-9f21-7d5e6c8a1b90";

/** 7 destinos, como la GT-204 real: varios clientes en el mismo viaje. */
const CLIENTES = [
  ["CITY MALL PASO CANOA", "Paso Canoas", "Fashion Wear", "F-10041", 6],
  ["CITY MALL DAVID", "David", "Fashion Shoes", "F-10042", 4],
  ["JERUSALEM PANAMA", "Panamá", "Vistana International", "F-10043", 3],
  ["SPORTING SHOES N 4", "Santiago", "Active Shoes", "F-10044", 5],
  ["GRUPO HANNA", "Changuinola", "Active Wear", "F-10045", 2],
  ["WOLF MALL CENTER INT", "Guabito", "Joystep", "F-10046", 7],
  ["DOLLAR MALL", "Paso Canoas", "Fashion Wear", "F-10047", 1],
];

const GUIA = {
  id: GUIA_ID,
  numero: 204,
  fecha: "2026-08-16",
  transportista: "Transporte Sol",
  modo_entrega: "transportista",
  transportista_id: "9c1f0f2a-2222-4444-8888-aaaaaaaaaaaa",
  placa: "",
  observaciones: "",
  monto_total: 0,
  estado: "Pendiente Bodega",
  receptor_nombre: "",
  cedula: "",
  numero_guia_transp: "",
  tipo_despacho: "externo",
  nombre_chofer: "",
  guia_items: CLIENTES.map(([cliente, direccion, empresa, facturas, bultos], i) => ({
    id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${i}`,
    orden: i + 1,
    cliente,
    cliente_codigo: "",
    direccion,
    empresa,
    facturas,
    bultos,
    numero_guia_transp: "",
  })),
};

const JUEGOS = {
  juegos: [
    { receptor: "Nicolás guillen", cedula: "1-727-44", placa: "961885", veces: 7 },
    { receptor: "Walter arauz", cedula: "4-803-1102", placa: "Dg7738", veces: 2 },
  ],
};

mkdirSync(SALIDA, { recursive: true });

const MEDIR = () => {
  const de = document.documentElement;
  const cajas = [...document.querySelectorAll('input[id^="transp-"]')];
  const rotulos = [...document.querySelectorAll("span")]
    .map((s) => (s.textContent || "").trim().toUpperCase())
    .filter((t) => t === "ENVÍOS" || t.includes("UNO POR LÍNEA"));
  return {
    altoPagina: Math.max(de.scrollHeight, document.body.scrollHeight),
    arrastrePagina: Math.max(0, de.scrollWidth - de.clientWidth),
    cajasTransp: cajas.length,
    rotulos,
    // ¿Cuántas veces aparece cada cliente en el texto de la pantalla?
    repeticiones: Object.fromEntries(
      [
        "CITY MALL PASO CANOA",
        "JERUSALEM PANAMA",
        "GRUPO HANNA",
        "DOLLAR MALL",
      ].map((c) => [
        c,
        [...document.querySelectorAll("*")].filter(
          (e) => e.children.length === 0 && (e.textContent || "").trim() === c,
        ).length,
      ]),
    ),
    tactilesChicos: [...document.querySelectorAll("button, a, input, select, textarea")].filter(
      (e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (r.height < 44 || r.width < 44);
      },
    ).length,
    textoChico: [...document.querySelectorAll("*")]
      .filter((e) => e.children.length === 0 && (e.textContent || "").trim())
      .map((e) => parseFloat(getComputedStyle(e).fontSize))
      .filter((n) => n && n < 12).length,
  };
};

/** Caja de la lista de envíos (por su rótulo — ⚠️ `uppercase` va por CSS). */
const RECT_ENVIOS = () => {
  // 🩸 "ENVÍOS" aparece DOS veces: también es el rótulo del contador en la
  // tarjeta de arriba. La que se busca es la que tiene la LISTA adentro.
  const rot = [...document.querySelectorAll("span")].find(
    (s) =>
      (s.textContent || "").trim().toUpperCase() === "ENVÍOS" &&
      s.className.includes("uppercase") &&
      s.closest("div.rounded-lg")?.querySelector("ul"),
  );
  const caja = rot?.closest("div.rounded-lg");
  if (!caja) return null;
  const r = caja.getBoundingClientRect();
  return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
};

/** El bloque duplicado del ANTES: "N° de guía del transportista · uno por línea". */
const RECT_SEGUNDA_LISTA = () => {
  const rot = [...document.querySelectorAll("span")].find((s) =>
    (s.textContent || "").trim().toUpperCase().includes("UNO POR LÍNEA"),
  );
  const caja = rot?.closest("div.rounded-lg");
  if (!caja) return null;
  const r = caja.getBoundingClientRect();
  return { x: r.x + window.scrollX, y: r.y + window.scrollY, w: r.width, h: r.height };
};

const informe = {};
const problemas = [];
const nav = await chromium.launch();

for (const ancho of [390, 1440]) {
  const alto = ancho >= 1200 ? 900 : 844;
  const ctx = await nav.newContext({
    viewport: { width: ancho, height: alto },
    hasTouch: ancho < 1200,
    deviceScaleFactor: ESCALA,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_is_owner", "1");
  });

  const page = await ctx.newPage();

  // 🔴 NINGUNA ESCRITURA SALE DEL NAVEGADOR.
  await page.route("**/api/**", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    const url = req.url();
    if (url.includes(`/api/guias/${GUIA_ID}`)) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(GUIA) });
    }
    if (url.includes("despachos-frecuentes")) {
      return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(JUEGOS) });
    }
    return route.continue();
  });

  await page.goto(`${BASE}/guias/${GUIA_ID}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(6000);

  const m = await page.evaluate(MEDIR);
  informe[`${ancho}`] = m;

  if (m.cajasTransp !== 7) problemas.push(`🔴 ${ancho}: ${m.cajasTransp} cajas de N° (se esperaban 7)`);
  for (const [c, n] of Object.entries(m.repeticiones)) {
    const esperado = ETAPA === "antes" ? 2 : 1;
    if (n !== esperado) problemas.push(`🔴 ${ancho}: "${c}" aparece ${n} veces (se esperaban ${esperado})`);
  }

  await page.screenshot({ path: `${SALIDA}/guia-despacho-${ETAPA}-${ancho}.png`, fullPage: true });

  if (ancho === 390) {
    const envios = await page.evaluate(RECT_ENVIOS);
    const segunda = await page.evaluate(RECT_SEGUNDA_LISTA);
    if (!envios) problemas.push("🔴 no se encontró la caja de envíos para el recorte");
    else {
      // En el ANTES el recorte llega hasta el arranque de la SEGUNDA lista: es
      // lo que hay que ver —el mismo renglón, dos veces—. En el DESPUÉS la caja
      // sola ya lo dice todo.
      const hasta = segunda ? segunda.y + 420 : envios.y + envios.h;
      const clip = {
        x: Math.max(0, envios.x - 8),
        y: Math.max(0, envios.y - 8),
        width: Math.min(ancho, envios.w + 16),
        height: Math.max(120, hasta - envios.y + 16),
      };
      await page.screenshot({ path: `${SALIDA}/guia-lista-${ETAPA}-cerca.png`, clip, fullPage: true });
      informe.recorte = clip;
    }

    // Extra del DESPUÉS: el renglón abierto para corregir, sin salir de acá.
    const corregir = page.getByRole("button", { name: "Corregir" }).first();
    if (await corregir.count()) {
      await corregir.click();
      await page.waitForTimeout(1500);
      const r2 = await page.evaluate(RECT_ENVIOS);
      if (r2) {
        await page.screenshot({
          path: `${SALIDA}/guia-corregir-renglon-390.png`,
          clip: { x: Math.max(0, r2.x - 8), y: Math.max(0, r2.y - 8), width: Math.min(ancho, r2.w + 16), height: Math.min(1400, r2.h + 16) },
          fullPage: true,
        });
      }
    }
  }

  await ctx.close();
}
await nav.close();

writeFileSync(`${SALIDA}/informe-${ETAPA}.json`, JSON.stringify(informe, null, 2));

console.log(`\n═══ ${ETAPA.toUpperCase()} — guía de 7 envíos ═══`);
for (const ancho of ["390", "1440"]) {
  const v = informe[ancho];
  console.log(
    `${ancho.padStart(4)} px → alto ${String(v.altoPagina).padStart(5)} px · arrastre ${v.arrastrePagina} · cajas N° ${v.cajasTransp} · táctiles<44 ${v.tactilesChicos} · texto<12 ${v.textoChico}`,
  );
  console.log(`      rótulos: ${v.rotulos.join(" | ")}`);
  console.log(`      repeticiones: ${JSON.stringify(v.repeticiones)}`);
}
console.log(`\ncapturas en ${SALIDA}`);
if (problemas.length) {
  console.log("\n🔴 PROBLEMAS:");
  for (const p of problemas) console.log("  -", p);
  process.exit(1);
}
console.log("\n🟢 sin problemas");
