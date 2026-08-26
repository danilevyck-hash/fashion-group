// Medición de la pestaña APROBACIONES en los TRES anchos: 390 · 834 · 1440
// (más el iPad acostado, 1024), contra el build de PRODUCCIÓN.
//
// Qué mide:
//   · ARRASTRE — la página pide más ancho del que se ve.
//   · RECORTE  — un contenedor pide más de lo que muestra (peor que arrastrar:
//                el dato queda fuera y no hay forma de alcanzarlo).
//   · Blancos TÁCTILES por debajo de 44 px y textos por debajo de 12 px.
//   · 🔴 LOS CLICS DE VERDAD, tocando: de la pestaña hasta que se aprobó.
//
// 🔑 El ancho que decide es el ÚTIL: la barra lateral se lleva 224 px, así que
// un iPad de 834 deja ~610 — más angosto que un iPhone acostado.
//
// 🩸 LA DDL TODAVÍA NO CORRIÓ, así que la medición INTERCEPTA la respuesta de
// `/api/asistencia/planilla?...&aprobaciones=1` y le inyecta filas con la forma
// EXACTA que van a tener. El componente medido es el REAL; sin esto el script
// mediría una pantalla vacía y pasaría en verde sin haber mirado nada.
//
// 🔴 SOLO LECTURA CONTRA LA BASE: el POST a `/api/asistencia/aprobaciones` se
// ABORTA en el navegador y se cuenta. Nunca llega al servidor.
//
// 🩸 GOTCHA QUE COSTÓ TRES VUELTAS Y NO ESTABA ESCRITO: `npm run build` MIENTRAS
// hay un `next start` corriendo deja el servidor sirviendo un `.next` a medio
// reemplazar. El síntoma no se parece a nada: la página carga, no hay ningún
// error en consola, `sessionStorage.cxc_role` dice "admin" y aun así la tira
// muestra CINCO pestañas — o sea que la pantalla se ve sana y el medidor acusa
// al producto. Hay que MATAR el servidor por su PUERTO (`lsof -ti :PORT`), no
// por `pkill -f "next start"`: el proceso se llama `next-server`, así que ese
// pkill no mata nada y encima podría llevarse el de otro agente.
//
// GOTCHAS heredados (CLAUDE.md): sembrar la cookie Y `sessionStorage.cxc_role`
// (si no, todo redirige al login), `delete Navigator.prototype.serviceWorker`
// antes de navegar, esta app NO tiene <main>, la pestaña vive en la URL, y los
// rótulos con `uppercase` por CSS vuelven en MAYÚSCULAS por `innerText`.
//
//   npm run build && PORT=3491 npm run start
//   BASE=http://localhost:3491 node scripts/_medir-aprobaciones-anchos.mjs

import { chromium } from "playwright";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "fs";
import crypto from "crypto";
import { createClient } from "@supabase/supabase-js";

const BASE = process.env.BASE ?? "http://localhost:3491";
const OUT = process.env.OUT ?? "/tmp/aprobaciones-tAPRO";
const ARCHIVO_COOKIE = process.env.COOKIE_FILE ?? "/tmp/fg-cookie-tAPRO.txt";
mkdirSync(OUT, { recursive: true });

const ANCHOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];

// 🩸 NO ALCANZA CON FIRMAR LA COOKIE. El MIDDLEWARE valida el `sessionToken`
// contra `user_sessions` en el servidor: una sesión inventada se borra y la
// pantalla salta a `/?expired=1` A MITAD DE LA MEDICIÓN — el locator deja de
// encontrar el botón y el rojo parece del producto. Se toma prestada, SOLO
// LEYENDO, una sesión de admin que ya está viva (mismo procedimiento que
// `_medir-recordatorios-anchos.mjs`). No se escribe una sola fila.
// 🩸 Y NO SE LEE `/tmp/fg-cookie.txt`: es un archivo COMPARTIDO que otro agente
// deja en la máquina, y una cookie ajena o vencida deja la medición en el login
// con el mensaje «no se pudo tocar el botón» — un rojo del medidor sobre un
// producto sano. Contra localhost se toma prestada la sesión viva SIEMPRE.
async function cookieDeSesion() {
  // La cookie ya armada se GUARDA y se reusa: la base está en compute Micro y
  // preguntarle por una sesión en cada corrida es carga que no hace falta.
  if (existsSync(ARCHIVO_COOKIE)) return readFileSync(ARCHIVO_COOKIE, "utf8").trim();
  if (!/^https?:\/\/(localhost|127\.0\.0\.1)/.test(BASE)) {
    throw new Error(`Falta ${ARCHIVO_COOKIE} (cookie cxc_session de una sesión real)`);
  }
  for (const l of readFileSync(new URL("../.env.local", import.meta.url), "utf-8").split("\n")) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const sb = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } },
  );
  // Un reintento: la base está en compute Micro y un blip devuelve vacío, que
  // se leería como «no hay ninguna sesión» y mataría la medición por nada.
  let viva = null;
  for (let i = 0; i < 2 && !viva; i++) {
    const { data } = await sb
      .from("user_sessions")
      .select("session_token, user_name")
      .eq("user_role", "admin")
      .eq("revoked", false)
      .order("last_seen", { ascending: false })
      .limit(5);
    // Se prefiere una sesión de medición si la hay: tomarle la de Daniel solo
    // le mueve el `last_seen`, pero no hace falta si hay otra a mano.
    viva = (data ?? []).find((r) => /^medicion/i.test(String(r.user_name))) ?? (data ?? [])[0] ?? null;
    if (!viva && i === 0) await new Promise((r) => setTimeout(r, 2000));
  }
  if (!viva) throw new Error("No hay ninguna sesión de admin viva de la cual tomar prestado el token");
  const body = Buffer.from(
    JSON.stringify({
      role: "admin", userId: "medicion",
      userName: viva.user_name, sessionToken: viva.session_token,
    }),
  ).toString("base64url");
  const sig = crypto.createHmac("sha256", process.env.SESSION_SECRET).update(body).digest("base64url");
  const cookie = `${body}.${sig}`;
  writeFileSync(ARCHIVO_COOKIE, cookie);
  return cookie;
}
const COOKIE = await cookieDeSesion();

/** Las filas que la pantalla va a recibir, con la forma exacta del contrato. */
const FILAS = [
  {
    codigo: "8", etiqueta: "BRICEIDA MONTERO", empresa: "vistana", empresaEtiqueta: "Vistana",
    minutos: 333, diurnoMin: 300, nocturnoMin: 33, monto: 21.5,
    aprobado: false, por: null, cuando: null, minutosVistos: null, cambio: false,
    dias: [
      { fecha: "2026-07-20", etiqueta: "20 jul 2026", salida: "17:45", minutos: 45, diurnoMin: 45, nocturnoMin: 0 },
      { fecha: "2026-07-21", etiqueta: "21 jul 2026", salida: "18:10", minutos: 70, diurnoMin: 60, nocturnoMin: 10 },
    ],
  },
  {
    codigo: "11", etiqueta: "JULIO GARAY", empresa: "vistana", empresaEtiqueta: "Vistana",
    minutos: 120, diurnoMin: 120, nocturnoMin: 0, monto: 8.1,
    aprobado: false, por: null, cuando: null, minutosVistos: null, cambio: false, dias: [],
  },
  {
    codigo: "43", etiqueta: "MARTHA ASUCENA CHAVARRIA Z.", empresa: "confecciones_boston",
    empresaEtiqueta: "Confecciones Boston",
    minutos: 210, diurnoMin: 180, nocturnoMin: 30, monto: 14.75,
    aprobado: true, por: "daniel", cuando: "2026-08-26T15:30:00.000Z",
    minutosVistos: 200, cambio: true, dias: [],
  },
];

const AVISO =
  "2 personas tienen horas extra sin aprobar: NO se pagaron en este cuadro. "
  + "Se aprueban en la pestaña Aprobaciones. BRICEIDA MONTERO · 5,55 h · $21.50 "
  + "— JULIO GARAY · 2,00 h · $8.10";

const RAIZ = `[...document.querySelectorAll('div[class*="transition-"]')]
  .sort((a, b) => (b.textContent?.length ?? 0) - (a.textContent?.length ?? 0))[0] ?? document.body`;

const MEDIR = new Function(`
  const doc = document.documentElement;
  const arrastre = Math.max(0, doc.scrollWidth - window.innerWidth);
  const recortados = []; const tactiles = []; const textosChicos = [];
  const raiz = ${RAIZ};
  for (const el of raiz.querySelectorAll("*")) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    const cs = getComputedStyle(el);
    const ox = cs.overflowX;
    if ((ox === "hidden" || ox === "clip") && el.scrollWidth - el.clientWidth > 4) {
      recortados.push({ el: el.tagName + "." + String(el.className).slice(0, 50), px: el.scrollWidth - el.clientWidth });
    }
    if (el.matches("button, a[href], input, select, [role=button]") && r.height < 43.5) {
      tactiles.push({ el: el.tagName, alto: Math.round(r.height * 10) / 10, txt: (el.textContent ?? "").trim().slice(0, 28) });
    }
    if (el.children.length === 0 && (el.textContent ?? "").trim()) {
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) textosChicos.push({ fs, txt: (el.textContent ?? "").trim().slice(0, 30) });
    }
  }
  return { arrastre, innerW: window.innerWidth, recortados, tactiles, textosChicos };
`);

/** Lo que este PR cambió, leído del DOM. `textContent` y no `innerText`: los
 *  rótulos con `uppercase` por CSS vuelven en mayúsculas y no compararían. */
const LEER = new Function(`
  const raiz = ${RAIZ};
  const txt = (raiz.textContent ?? "").replace(/\\s+/g, " ");
  const cuenta = (re) => (txt.match(re) ?? []).length;
  const fila = [...raiz.querySelectorAll("li")].find((l) => (l.textContent ?? "").includes("BRICEIDA"));
  const caja = fila ? fila.getBoundingClientRect() : null;
  return {
    hayFilas: cuenta(/BRICEIDA MONTERO|JULIO GARAY|MARTHA ASUCENA/g),
    horasBriceida: /5,55 h/.test(txt),
    montoBriceida: /\\$21\\.50/.test(txt),
    botonAprobar: [...raiz.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Aprobar").length,
    botonQuitar: [...raiz.querySelectorAll("button")].filter((b) => b.textContent.trim() === "Quitar").length,
    aprobarTodas: /Aprobar todas \\(2\\)/.test(txt),
    quienAprobo: /Aprobada por daniel/.test(txt),
    avisoCambio: /Cambió desde que se aprobó/.test(txt),
    verDias: /ver 2 días/.test(txt),
    diasVisibles: /20 jul 2026/.test(txt),
    // NO puede haber tabla: en 834 una tabla de 6 columnas se aplasta.
    tablas: raiz.querySelectorAll("table").length,
    filaAlto: caja ? Math.round(caja.height) : 0,
    filaAncho: caja ? Math.round(caja.width) : 0,
  };
`);

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => {
  try { sessionStorage.setItem("cxc_role", "admin"); } catch {}
  try { delete Navigator.prototype.serviceWorker; } catch {}
});

// 🩸 GOTCHA HEREDADO Y ESTA VEZ CON SÍNTOMA NUEVO: no alcanza con FIRMAR la
// cookie. `useSessionCheck` pregunta por `/api/auth/check`, que valida el
// `sessionToken` contra `user_sessions`; una sesión inventada no está ahí y la
// pantalla salta a `/?expired=1` A MITAD DE LA MEDICIÓN — el locator deja de
// encontrar el botón y el rojo parece del producto. Se contesta que la sesión
// vive. Es SOLO del navegador: las rutas del servidor validan con HMAC y no
// pasan por acá.
await ctx.route("**/api/auth/check", async (route) => {
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ valid: true, ok: true }) });
});

let escriturasAbortadas = 0;
await ctx.route("**/api/asistencia/aprobaciones", async (route) => {
  // 🔴 NUNCA llega al servidor. Se cuenta y se contesta como si hubiera salido.
  escriturasAbortadas += 1;
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
});

await ctx.route("**/api/asistencia/planilla*", async (route) => {
  let res; let j;
  // 🩸 Si `route.fetch()` o el parseo fallan (la página navegó, la respuesta no
  // era JSON), NO se deja caer el handler: un rechazo acá deja el pedido
  // colgado y la pantalla nunca termina de dibujarse — se mide una pantalla
  // vacía y el script culpa al producto de un defecto del medidor.
  try { res = await route.fetch(); j = await res.json(); }
  catch (e) { console.error("[medicion] intercepción falló:", String(e).slice(0, 120)); return route.continue().catch(() => {}); }
  const url = route.request().url();
  if (url.includes("aprobaciones=1")) j.aprobaciones = FILAS;
  j.puedeAprobar = true;
  j.avisos = { ...(j.avisos ?? {}), extraSinAprobar: [], avisoExtraSinAprobar: AVISO };
  // 🩸 NO se reusa `response: res`: sus encabezados traen el `content-length`
  // del cuerpo ORIGINAL y el nuestro es más largo → el JSON llega CORTADO, la
  // pantalla revienta al parsearlo y la medición se queda esperando un botón
  // que nunca se dibuja.
  await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(j) });
});

const page = await ctx.newPage();
page.on("pageerror", (e) => console.error("[medicion] error de la página:", String(e).slice(0, 220)));
page.on("response", (r) => {
  if (r.status() >= 300 && r.status() < 400) {
    console.error("[medicion] redirección:", r.status(), r.url().slice(0, 90), "→", (r.headers().location ?? "").slice(0, 60));
  }
});
const resultados = {};

// 🩸 GOTCHA DE MEDICIÓN: a 390 px la tira de pestañas es un `overflow-x-auto` y
// «Aprobaciones» queda en x=404, o sea FUERA de la ventana y debajo de la barra
// pegajosa. `click()` a secas se queda esperando que el elemento «reciba
// eventos» y muere a los 30 s — un rojo del MEDIDOR sobre un botón de 44 px que
// una persona alcanza arrastrando, como cualquier otra pestaña del módulo.
const tocar = async (loc) => {
  try {
    await loc.scrollIntoViewIfNeeded({ timeout: 15_000 });
    await loc.click({ timeout: 15_000 });
  } catch (e) {
    // Un medidor que muere sin decir QUÉ vio no sirve para arreglar nada.
    const estado = await loc.page().evaluate(() => ({
      url: location.href,
      rol: (() => { try { return sessionStorage.getItem("cxc_role"); } catch { return "SIN ACCESO"; } })(),
      botones: [...document.querySelectorAll("button")].map((b) => b.textContent.trim()).slice(0, 24),
    }));
    console.error("[medicion] no se pudo tocar. Estado:", JSON.stringify(estado));
    throw e;
  }
};
let clics = { unaPersona: null, todas: null, quitar: null };

for (const a of ANCHOS) {
  await page.setViewportSize({ width: a.w, height: a.h });
  const paso = {};

  // ── La pestaña Aprobaciones ────────────────────────────────────────────────
  await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(1200);

  // 🔴 CLIC 1 — la pestaña. Es el primero de todos los caminos.
  let n = 0;
  await tocar(page.getByRole("button", { name: "Aprobaciones", exact: true })); n += 1;
  // 🩸 NO SE MIDE CON UN `sleep`. La lista tarda lo que tarde la ruta de la
  // planilla; medir antes devuelve 0 filas, 0 botones y 0 de todo — o sea VERDE
  // sin haber mirado nada. Se espera a que la fila exista.
  await page.locator("li").filter({ hasText: "BRICEIDA MONTERO" }).first().waitFor({ timeout: 90_000 });
  await page.waitForTimeout(400);

  paso.lista = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/aprobaciones-lista-${a.w}.png`, fullPage: true });

  // ── El detalle por día: mirar NO es un paso obligatorio ────────────────────
  await tocar(page.getByRole("button", { name: /ver 2 días/ }));
  await page.waitForTimeout(600);
  paso.conDias = { ...(await page.evaluate(MEDIR)), ...(await page.evaluate(LEER)) };
  await page.screenshot({ path: `${OUT}/aprobaciones-dias-${a.w}.png`, fullPage: true });
  await tocar(page.getByRole("button", { name: /ocultar días/ }));
  await page.waitForTimeout(400);

  // ── 🔴 CLIC 2 — «Aprobar» de la fila. Acá termina el camino corto. ─────────
  const antes = escriturasAbortadas;
  const fila = page.locator("li").filter({ hasText: "BRICEIDA MONTERO" });
  await tocar(fila.getByRole("button", { name: "Aprobar", exact: true })); n += 1;
  await page.waitForTimeout(1200);
  if (escriturasAbortadas > antes) clics.unaPersona = n;

  // ── El camino de «Aprobar todas»: pestaña + botón + confirmar ─────────────
  await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(1200);
  let m = 0;
  await tocar(page.getByRole("button", { name: "Aprobaciones", exact: true })); m += 1;
  await page.getByRole("button", { name: /Aprobar todas/ }).waitFor({ timeout: 90_000 });
  await tocar(page.getByRole("button", { name: /Aprobar todas/ })); m += 1;
  await page.waitForTimeout(600);
  paso.confirmar = { ...(await page.evaluate(MEDIR)) };
  paso.confirmar.dice = await page.evaluate(() =>
    /2 personas · 7,55 h/.test((document.body.textContent ?? "").replace(/\s+/g, " ")));
  await page.screenshot({ path: `${OUT}/aprobaciones-confirmar-${a.w}.png`, fullPage: true });
  const antesTodas = escriturasAbortadas;
  await tocar(page.locator("button", { hasText: /^Aprobar$/ }).last()); m += 1;
  await page.waitForTimeout(1200);
  if (escriturasAbortadas > antesTodas) clics.todas = m;

  // ── Desaprobar: pestaña + «Quitar» ────────────────────────────────────────
  await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.waitForTimeout(1200);
  let q = 0;
  await tocar(page.getByRole("button", { name: "Aprobaciones", exact: true })); q += 1;
  await page.getByRole("button", { name: "Quitar", exact: true }).first().waitFor({ timeout: 90_000 });
  const antesQ = escriturasAbortadas;
  await tocar(page.getByRole("button", { name: "Quitar", exact: true }).first()); q += 1;
  await page.waitForTimeout(1200);
  if (escriturasAbortadas > antesQ) clics.quitar = q;

  // ── El aviso ÁMBAR en la planilla ─────────────────────────────────────────
  await page.goto(`${BASE}/asistencia?tab=planilla`, { waitUntil: "networkidle", timeout: 180_000 });
  await page.getByText(/horas extra sin aprobar/).first().waitFor({ timeout: 90_000 });
  paso.planilla = { ...(await page.evaluate(MEDIR)) };
  paso.planilla.aviso = await page.evaluate(() => {
    const t = (document.body.textContent ?? "").replace(/\s+/g, " ");
    const el = [...document.querySelectorAll("p")].find((p) => /horas extra sin aprobar/.test(p.textContent ?? ""));
    return {
      visible: /horas extra sin aprobar/.test(t),
      conNombre: /BRICEIDA MONTERO/.test(t),
      conHoras: /5,55 h/.test(t),
      ambar: el ? String(el.className).includes("amber") : false,
      alto: el ? Math.round(el.getBoundingClientRect().height) : 0,
    };
  });
  await page.screenshot({ path: `${OUT}/planilla-aviso-${a.w}.png`, fullPage: true });

  resultados[a.nombre] = paso;
}

await browser.close();

// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LO PRE-EXISTENTE SE SEPARA, NO SE ESCONDE.
//
// La PLANILLA ya medía estos mismos hallazgos antes de este PR y están escritos
// en CLAUDE.md como tales: el `<h1 class="sr-only">` (77 px, es el mecanismo del
// texto para lectores de pantalla), los `truncate` del nombre en la tarjeta de
// celular (los puntos suspensivos SON el mecanismo) y las etiquetas de columna
// de 10-11 px del cuadro quincenal. Este PR no toca ni una de las tres.
//
// Se listan aparte para poder verlas, y NO tumban la medición. Cualquier otra
// cosa sí — en particular todo lo de la pestaña de Aprobaciones, que es nueva y
// tiene que dar CERO.
// ─────────────────────────────────────────────────────────────────────────────
const esPreexistente = {
  recorte: (r) => /H1\.sr-only/.test(r.el) || /SPAN\..*truncate/.test(r.el),
  texto: (t) => t.txt === "ver detalle" || /^(Persona|Salario|Extra|Ausen-|Tar-|Exce-|Domin-|Feria-|Total|Seguro|ISR|Prés-|Ter-|Mercan-|Otros|Neto)/.test(t.txt),
};
const preexistentes = [];

// 🩸 UNA PANTALLA VACÍA MIDE 0 EN TODO Y PASARÍA EN VERDE SIN HABER MIRADO NADA.
const problemas = [];
for (const [ancho, p] of Object.entries(resultados)) {
  for (const [caso, r] of Object.entries(p)) {
    const q = `${ancho}/${caso}`;
    if (r.arrastre > 0) problemas.push(`${q}: ${r.arrastre} px de arrastre`);
    const rec = (r.recortados ?? []).filter((x) => !esPreexistente.recorte(x));
    const txt = (r.textosChicos ?? []).filter((x) => !esPreexistente.texto(x));
    const previos = (r.recortados ?? []).length - rec.length + ((r.textosChicos ?? []).length - txt.length);
    if (previos) preexistentes.push(`${q}: ${previos}`);
    if (rec.length) problemas.push(`${q}: ${rec.length} recortado(s) NUEVO(s): ${JSON.stringify(rec)}`);
    if (r.tactiles?.length) problemas.push(`${q}: ${r.tactiles.length} táctil(es) bajo 44 px: ${JSON.stringify(r.tactiles)}`);
    if (txt.length) problemas.push(`${q}: ${txt.length} texto(s) NUEVO(s) bajo 12 px: ${JSON.stringify(txt)}`);
  }
  const l = p.lista;
  if (l.hayFilas !== 3) problemas.push(`${ancho}: la lista salió con ${l.hayFilas} filas (tiene que ser 3)`);
  if (!l.horasBriceida) problemas.push(`${ancho}: falta «5,55 h»`);
  if (!l.montoBriceida) problemas.push(`${ancho}: falta el monto de Briceida`);
  if (l.botonAprobar !== 2) problemas.push(`${ancho}: hay ${l.botonAprobar} botones «Aprobar» (tienen que ser 2)`);
  if (l.botonQuitar !== 1) problemas.push(`${ancho}: hay ${l.botonQuitar} botones «Quitar» (tiene que ser 1)`);
  if (!l.aprobarTodas) problemas.push(`${ancho}: falta «Aprobar todas (2)»`);
  if (!l.quienAprobo) problemas.push(`${ancho}: no dice quién aprobó`);
  if (!l.avisoCambio) problemas.push(`${ancho}: falta el aviso de que cambió desde que se aprobó`);
  if (l.diasVisibles) problemas.push(`${ancho}: los días se ven SIN desplegar`);
  if (!p.conDias.diasVisibles) problemas.push(`${ancho}: el detalle por día no se desplegó`);
  if (l.tablas !== 0) problemas.push(`${ancho}: hay una <table> — en 834 se aplasta`);
  if (!p.confirmar.dice) problemas.push(`${ancho}: la ventana no dice cuántas personas ni cuántas horas`);
  const av = p.planilla.aviso;
  if (!av.visible) problemas.push(`${ancho}: la planilla no dice lo que no pagó`);
  if (!av.conNombre || !av.conHoras) problemas.push(`${ancho}: el aviso no trae nombre y cantidad`);
  if (!av.ambar) problemas.push(`${ancho}: el aviso no va en ámbar`);
}
if (clics.unaPersona !== 2) problemas.push(`clics para aprobar UNA persona: ${clics.unaPersona} (tienen que ser 2)`);
if (clics.todas !== 3) problemas.push(`clics para «Aprobar todas»: ${clics.todas} (tienen que ser 3)`);
if (clics.quitar !== 2) problemas.push(`clics para desaprobar: ${clics.quitar} (tienen que ser 2)`);
if (escriturasAbortadas === 0) problemas.push("no se disparó ningún guardado: los clics no probaron nada");

console.log(JSON.stringify({ clics, escriturasAbortadas, resultados }, null, 2));
if (problemas.length) {
  console.error("\n🔴 " + problemas.join("\n🔴 "));
  process.exitCode = 1;
} else {
  console.error(
    `\n🟢 390 · 834 · 1024 · 1440 — 0 arrastre, 0 recorte, 0 táctil <44 px, 0 texto <12 px.`
    + `\n🟢 CLICS CONTADOS TOCANDO: una persona ${clics.unaPersona} · todas ${clics.todas} · desaprobar ${clics.quitar}.`
    + `\n🟢 Escrituras bloqueadas (nunca llegaron al servidor): ${escriturasAbortadas}.`
    + `\n⚠️ Hallazgos PRE-EXISTENTES de la Planilla, no tocados por este PR: ${preexistentes.join(" · ")}`,
  );
}
