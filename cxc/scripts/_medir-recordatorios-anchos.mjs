// Medición de RECORDATORIOS en los tres anchos: 390 · 834 · 1440, más 1024 —
// el iPad ACOSTADO, que es donde este repo ya se quemó dos veces.
//
// Qué mide, en /cheques (el módulo que ahora se llama "Recordatorios"):
//   1. La lista de cheques de siempre, con el aviso azul de "N para hoy".
//   2. La pestaña Recordatorios, con sus filas.
//   3. El CALENDARIO, con la píldora del recordatorio al lado de los cheques.
//   4. La ventana de "Nuevo recordatorio" (cerrada y con el botón apagado).
//
// Y en las cuatro: ARRASTRE de página · RECORTES · blancos táctiles <44 px ·
// textos <12 px.
//
// 🔑 EL ANCHO QUE DECIDE ES EL ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// 🩸 LA TABLA `recordatorios` TODAVÍA NO EXISTE EN PRODUCCIÓN (la DDL la corre
// Daniel a mano), así que sin ayuda no habría NADA que medir y el script pasaría
// en verde sin haber mirado nada. Se INTERCEPTA el HTML de la página y se
// reemplaza, en el payload que el servidor ya manda, `"recordatorios":[]` +
// `"faltaMigracionRecordatorios":true` por TRES recordatorios con la forma
// EXACTA que van a tener.
//
// 🔑 Los CHEQUES del payload NO se tocan: siguen siendo los 19 REALES de
// producción, y el componente que se mide es el REAL. **La base no se toca**:
// además se ABORTA todo pedido que no sea GET, así que ni un POST puede escapar
// del navegador.
//
// 🩸 Y la interceptación va sobre el HTML y no sobre `/api/recordatorios`
// porque la pantalla los recibe del SERVIDOR en el primer render: el `fetch`
// del cliente solo corre en los mounts siguientes, así que interceptar la API
// habría dejado la pantalla vacía y el script habría medido una pantalla que
// nadie ve.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`,
// `delete Navigator.prototype.serviceWorker` antes de navegar, y esta app NO
// tiene <main> (el primer `div[class*="transition-"]` es un overlay VACÍO:
// mediría 0 en todo).
//
//   npm run build && npx next start -p 3467
//   BASE=http://localhost:3467 node scripts/_medir-recordatorios-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, mkdirSync } from "fs";
import crypto from "crypto";

const BASE = process.env.BASE ?? "http://localhost:3467";
const OUT = process.env.OUT ?? "/tmp/recordatorios-anchos";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPadAcostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

const hoy = new Date().toISOString().slice(0, 10);
const TEXTO_HOY = "Recordar cobrar";
const TEXTO_MENSUAL = "Pagar el alquiler del local";
const CLIENTE = "City Mall Paso Canoa";

function cargarEnv() {
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

/**
 * La cookie de la medición.
 *
 * 🩸 No alcanza con FIRMARLA: la página valida el `sessionToken` contra
 * `user_sessions` y una sesión inventada redirige al login — o sea que el
 * script mediría la pantalla de entrar y pasaría en verde sin haber mirado
 * nada. Se toma prestada, **SOLO LEYENDO**, una sesión de admin que ya está
 * viva; no se crea ni se revoca ninguna.
 */
async function cookieDeSesion() {
  if (existsSync("/tmp/fg-cookie.txt")) return readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
  cargarEnv();
  const { createClient } = await import("@supabase/supabase-js");
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data, error } = await db
    .from("user_sessions")
    .select("session_token")
    .eq("revoked", false)
    .eq("user_role", "admin")
    .order("last_seen", { ascending: false })
    .limit(1);
  if (error || !data?.length) {
    throw new Error("no hay ninguna sesión de admin viva para tomar prestada (entrá a la app y reintentá)");
  }
  const body = Buffer.from(
    JSON.stringify({ role: "admin", userId: "medicion", userName: "Daniel", sessionToken: data[0].session_token }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  return `${body}.${sig}`;
}
const COOKIE = await cookieDeSesion();

const MEDIR = () => {
  // 🩸 Esta app NO tiene <main>, y el primer `div[class*="transition-"]` es un
  // overlay VACÍO del menú: mediría 0 en todo y pasaría en verde sin mirar nada.
  const raiz = [...document.querySelectorAll('div[class*="transition-"]')]
    .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0] ?? document.body;
  const arrastre = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
  const recortados = [];
  const tactiles = [];
  const textosChicos = [];
  // 🩸 La ventana NO va en un portal a <body>: `ModalOverlay` se dibuja donde
  // está en el árbol, así que buscarla como hija directa de <body> devolvía
  // SIEMPRE vacío — la ventana no se medía y "no abrió" era del medidor, no del
  // producto. Se busca por su `role=dialog`, que es lo que la define.
  const zonas = [raiz, ...document.querySelectorAll('[role="dialog"]')];
  for (const zona of zonas) {
    for (const el of zona.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      const ox = cs.overflowX;
      // `auto`/`scroll` es un scroller DECLARADO: se arrastra, no es un recorte.
      if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
        recortados.push({ el: `${el.tagName}.${String(el.className).slice(0, 60)}`, px: el.scrollWidth - el.clientWidth });
      }
      if (el.matches("button, a[href], input, select, textarea, [role=button]") && r.height < 43.5) {
        tactiles.push({
          el: `${el.tagName}[${el.getAttribute("type") ?? ""}]`,
          alto: Math.round(r.height * 10) / 10,
          txt: (el.textContent ?? "").trim().slice(0, 28),
        });
      }
      if (el.children.length === 0 && (el.textContent ?? "").trim()) {
        const fs = parseFloat(cs.fontSize);
        if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
      }
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
};

/** Lo que este PR cambió, leído del DOM (no del archivo). */
const LEER = (datos) => {
  const txt = (document.body.textContent ?? "").replace(/\s+/g, " ");
  const modal = document.querySelector('[role="dialog"][aria-label*="ecordatorio"]');
  return {
    // 🩸 El rótulo del módulo va en la barra sticky y en el breadcrumb.
    diceRecordatorios: txt.includes("Recordatorios"),
    // Los CHEQUES siguen ahí: el rename no se llevó nada.
    hayCheques: document.querySelectorAll("[data-cheque-fila]").length,
    avisoHoy: /recordatorio(s)? para hoy/.test(txt),
    pestanaRecordatorios: [...document.querySelectorAll("button")]
      .some((b) => /^Recordatorios\s/.test((b.textContent ?? "").trim())),
    filas: document.querySelectorAll("[data-recordatorio-fila]").length,
    pills: document.querySelectorAll("[data-recordatorio-pill]").length,
    diceTextoHoy: txt.includes(datos.textoHoy),
    diceCliente: txt.includes(datos.cliente),
    diceCadaMes: txt.includes("Cada mes"),
    ventanaAbierta: !!modal,
    ventanaPideTexto: /Qué hay que recordar/i.test(txt),
    // 🩸 El rótulo del cliente lleva `uppercase` POR CSS: `innerText` lo
    // devuelve en MAYÚSCULAS y compararlo tal cual daría SIEMPRE false. Se mira
    // el textContent, que conserva lo escrito.
    ventanaDiceOpcional: /no es obligatorio/i.test(txt),
    ventanaTieneRepeticion: modal
      ? [...modal.querySelectorAll("button")].filter((b) => /Una sola vez|Cada semana|Cada mes/.test(b.textContent ?? "")).length
      : 0,
    botonGuardarApagado: [...document.querySelectorAll("button")]
      .some((b) => /Guardar recordatorio/.test(b.textContent ?? "") && b.disabled),
    diceQueFalta: /Falta: /.test(txt),
    // Nada de esto puede aparecer: el módulo se llama Recordatorios.
    quedoTituloViejo: /<h1[^>]*>Cheques</.test(document.body.innerHTML),
  };
};

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { sessionStorage.setItem("fg_modules", JSON.stringify(["cheques"])); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

// 🔴 NADA que no sea GET sale de este navegador. Aunque el script tocara
// "Guardar" por error, la base no se entera.
await ctx.route("**/api/**", async (route) => {
  if (route.request().method() !== "GET") return route.abort();
  return route.fallback();
});

// Los tres recordatorios inyectados, con la forma EXACTA de la tabla.
const RECORDATORIOS = [
  { id: "m1", fecha: hoy, texto: TEXTO_HOY, cliente: CLIENTE, clienteCodigo: "D-25", repeticion: "una_vez", creadoPor: "Daniel", createdAt: "" },
  { id: "m2", fecha: "2026-01-31", texto: TEXTO_MENSUAL, cliente: "", clienteCodigo: null, repeticion: "mensual", creadoPor: "Daniel", createdAt: "" },
  { id: "m3", fecha: hoy, texto: "Revisar los cheques de la semana", cliente: "", clienteCodigo: null, repeticion: "semanal", creadoPor: "Daniel", createdAt: "" },
];

// El payload del servidor viaja DENTRO de un string de JavaScript, así que las
// comillas van escapadas. Se reemplaza exactamente el trozo de recordatorios y
// NADA más: los 19 cheques del mismo payload quedan intactos.
const VACIO = '\\"recordatorios\\":[],\\"faltaMigracionRecordatorios\\":true';

/**
 * 🩸 Escapar a mano (`replace(/"/g, ...)`) fue el primer intento y salió MAL:
 * dejaba DOS barras por comilla, el string de JavaScript quedaba roto y la
 * página no hidrataba — o sea, se medía una pantalla en blanco. `JSON.stringify`
 * de un string produce exactamente el escapado que un string de JS necesita; se
 * le quitan las comillas de los extremos y listo.
 */
const escaparDentroDeStringJs = (t) => JSON.stringify(t).slice(1, -1);
const LLENO =
  `\\"recordatorios\\":${escaparDentroDeStringJs(JSON.stringify(RECORDATORIOS))}` +
  `,\\"faltaMigracionRecordatorios\\":false`;

// 🩸 El HTML se pide desde NODE y no con `route.fetch()`: la página va en
// streaming y `route.fetch` se queda esperando el cierre de la conexión hasta
// que vence su tiempo. Se pide UNA vez —el HTML del servidor no depende del
// ancho— y con eso se contestan las cuatro navegaciones.
const htmlOriginal = await (await fetch(`${BASE}/cheques`, { headers: { cookie: `cxc_session=${COOKIE}` } })).text();
if (!htmlOriginal.includes(VACIO)) {
  // 🩸 Si el payload cambia de forma, el script tiene que GRITAR: seguir sin
  // inyectar mediría una pantalla sin recordatorios y daría verde por nada.
  console.error("🔴 no se encontró el hueco de recordatorios en el HTML del servidor");
  process.exit(1);
}
if (!htmlOriginal.includes("cliente_codigo")) {
  console.error("🔴 el HTML no trae los cheques REALES (¿la sesión no sirve?)");
  process.exit(1);
}
const htmlConRecordatorios = htmlOriginal.replace(VACIO, LLENO);

let inyecciones = 0;
await ctx.route(`${BASE}/cheques`, async (route) => {
  inyecciones += 1;
  return route.fulfill({
    status: 200,
    contentType: "text/html; charset=utf-8",
    body: htmlConRecordatorios,
  });
});

const page = await ctx.newPage();
const resultados = {};
const problemas = [];
const datos = { textoHoy: TEXTO_HOY, cliente: CLIENTE };

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  const paso = {};

  await page.goto(`${BASE}/cheques`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(2500);

  // 1 ── La lista de cheques de siempre + el aviso azul de arriba.
  paso.listaCheques = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER, datos)) };
  await page.screenshot({ path: `${OUT}/lista-cheques-${a.w}.png`, fullPage: true });

  // 2 ── La pestaña de recordatorios.
  await page.getByRole("button", { name: /^Recordatorios\s/ }).first().click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  paso.listaRecordatorios = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER, datos)) };
  await page.screenshot({ path: `${OUT}/lista-recordatorios-${a.w}.png`, fullPage: true });

  // 3 ── El calendario, con las píldoras al lado de los cheques.
  await page.getByRole("button", { name: /^Calendario$/ }).first().click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  paso.calendario = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER, datos)) };
  await page.screenshot({ path: `${OUT}/calendario-${a.w}.png`, fullPage: true });

  // 4 ── La ventana de "Nuevo recordatorio", recién abierta (botón apagado).
  await page.getByRole("button", { name: /\+ Recordatorio/ }).first().click({ timeout: 30_000 }).catch(() => {});
  await page.waitForTimeout(900);
  paso.ventana = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER, datos)) };
  await page.screenshot({ path: `${OUT}/ventana-${a.w}.png`, fullPage: false });
  await page.keyboard.press("Escape").catch(() => {});

  resultados[a.nombre] = paso;

  // 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN MIRAR NADA.
  const P = (m) => problemas.push(`${a.nombre} (${a.w}): ${m}`);
  if (!paso.listaCheques.hayCheques) P("la lista salió SIN cheques (¿sesión o datos?)");
  if (!paso.listaCheques.diceRecordatorios) P("la pantalla no se llama Recordatorios");
  if (paso.listaCheques.quedoTituloViejo) P("quedó el encabezado viejo «Cheques»");
  if (!paso.listaCheques.avisoHoy) P("no avisa que hay recordatorios para HOY");
  if (!paso.listaCheques.pestanaRecordatorios) P("no está la pestaña Recordatorios");
  if (paso.listaRecordatorios.filas < 3) P(`la pestaña muestra ${paso.listaRecordatorios.filas} de 3 recordatorios`);
  if (!paso.listaRecordatorios.diceTextoHoy) P("la fila no dice el texto del recordatorio");
  if (!paso.listaRecordatorios.diceCliente) P("la fila no dice el cliente atado");
  if (!paso.listaRecordatorios.diceCadaMes) P("la fila no dice que se repite cada mes");
  if (paso.listaRecordatorios.hayCheques) P("🔴 se coló un cheque en la pestaña de recordatorios");
  if (!paso.calendario.pills) P("🔴 el recordatorio NO aparece en el calendario");
  if (!paso.ventana.ventanaAbierta) P("la ventana de nuevo recordatorio no abrió");
  if (!paso.ventana.ventanaPideTexto) P("la ventana no pide qué hay que recordar");
  if (!paso.ventana.ventanaDiceOpcional) P("la ventana no dice que el cliente es opcional");
  if (paso.ventana.ventanaTieneRepeticion !== 3) P(`la ventana ofrece ${paso.ventana.ventanaTieneRepeticion} repeticiones, no 3`);
  if (!paso.ventana.botonGuardarApagado) P("🔴 el botón de guardar NO está apagado con el texto vacío");
  if (!paso.ventana.diceQueFalta) P("el botón apagado no dice qué falta");
}

await browser.close();

if (inyecciones !== ANCHOS.length) {
  problemas.push(`se inyectaron los recordatorios ${inyecciones} de ${ANCHOS.length} veces`);
}

// Resumen corto, que es lo que se lee.
console.log("═".repeat(80));
console.log("RECORDATORIOS — arrastre · recortes · táctiles <44 · texto <12");
console.log("═".repeat(80));
for (const [ancho, p] of Object.entries(resultados)) {
  console.log(`\n${ancho}`);
  for (const [pantalla, m] of Object.entries(p)) {
    console.log(
      `  ${pantalla.padEnd(20)} útil ${String(m.innerW).padStart(4)} · ` +
      `arrastre ${String(m.arrastre).padStart(3)} · recortes ${String(m.recortados.length).padStart(2)} · ` +
      `táctil<44 ${String(m.tactiles.length).padStart(2)} · texto<12 ${String(m.textosChicos.length).padStart(2)}` +
      ` · filas ${m.filas} · pills ${m.pills}`,
    );
    for (const r of m.recortados) console.log(`      recorte: ${r.px}px ${r.el}`);
    for (const t of m.tactiles) console.log(`      táctil: ${t.alto}px «${t.txt}»`);
    for (const t of m.textosChicos.slice(0, 6)) console.log(`      texto: ${t.fs}px «${t.txt}»`);
  }
}
console.log("\n" + "═".repeat(80));
if (problemas.length) {
  console.error("🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
} else {
  console.log("🟢 sin problemas de contenido en los cuatro anchos");
}
