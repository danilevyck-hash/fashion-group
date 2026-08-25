// Mide, EN EL NAVEGADOR contra el build de PRODUCCIÓN y con DATOS DE PRODUCCIÓN,
// la línea «lo que el guard dejó afuera» en los CUATRO anchos de la casa:
// 390 (iPhone) · 834 (iPad) · 1024 (iPad ACOSTADO) · 1440 (escritorio).
//
// Se mide CON la línea a la vista y SIN ella, en las 5 superficies donde vive:
//   · CXC › pestaña de Confecciones Boston
//   · CXC › panel del grupo (escritorio y celular)
//   · Proveedores
//   · Ventas (las 4 familias del módulo, una sola línea arriba de las pestañas)
//   · Comisiones
//
// 🩸 CÓMO SE CONSIGUE «CON LA LÍNEA», y se dice de frente: HOY producción no
// tiene ni un rechazo registrado — el detalle del descarte se empezó a guardar
// con este mismo cambio, así que aparecerá recién en la próxima corrida buena de
// Boston. Para poder medirla igual:
//   · en las pantallas que piden su dato por HTTP (CXC y Proveedores) se
//     INTERCEPTA la respuesta y se le agrega `avisoMontos` con el texto REAL;
//   · en las que lo reciben del SERVIDOR (Ventas y Comisiones) el nodo se INSERTA
//     en el DOM, en la posición exacta donde lo pone React.
// En los dos casos el componente medido es el mismo y las clases son las mismas.
//
// 🔴 Y SE MIDE QUE NINGÚN NÚMERO SE MUEVA: los montos se leen EN ORDEN y se
// comparan posición por posición contra la misma pantalla sin la línea.
//
// SOLO LECTURA: el navegador ABORTA todo pedido que no sea GET.
//
//   npx next build && npx next start -p 3491
//   BASE=http://localhost:3491 ETAPA=despues node scripts/_medir-rechazos-visibles.mjs
//
// Con ETAPA=antes (corriendo contra un build de `origin/main`) la línea no se
// inyecta: sirve de línea base de recortes y tocables pre-existentes.

import { chromium } from "playwright";
import { existsSync, readFileSync } from "fs";

// 🩸 127.0.0.1 y no "localhost": `route.fetch()` de Playwright resuelve
// localhost a ::1 (IPv6) y `next start` escucha en IPv4 → ECONNREFUSED, con la
// página cargando bien y la interceptación reventando.
const BASE = process.env.BASE ?? "http://127.0.0.1:3491";
const DOMINIO = new URL(BASE).hostname;
const ETAPA = process.env.ETAPA ?? "despues";
const TODOS = [
  { nombre: "iPhone", w: 390, h: 844 },
  { nombre: "iPad", w: 834, h: 1112 },
  { nombre: "iPad acostado", w: 1024, h: 768 },
  { nombre: "Escritorio", w: 1440, h: 900 },
];
// `SOLO=390,834` mide un subconjunto: la corrida entera son 40 cargas de página
// y no siempre entra en una sola sesión.
const ANCHOS = process.env.SOLO
  ? TODOS.filter((a) => process.env.SOLO.split(",").includes(String(a.w)))
  : TODOS;

/** El texto REAL que arma el módulo para el documento real de Boston. */
const LINEA =
  "1 documento fuera de la cuenta: el 155-000000129 llega con $266,541,352.00. Está mal en Switch.";

const COOKIE = (() => {
  for (const f of [process.env.COOKIE_FILE, "/tmp/fg-cookie-t400.txt", "/tmp/fg-cookie.txt"]) {
    if (f && existsSync(f)) return readFileSync(f, "utf8").trim();
  }
  console.error("❌ No hay cookie. Guardá `cxc_session` en /tmp/fg-cookie-t400.txt.");
  process.exit(1);
})();

const fallos = [];
const salida = { base: BASE, etapa: ETAPA, casos: {} };

// ─── Lo que se lee de cada pantalla ─────────────────────────────────────────
const LEER = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  };
  const texto = document.body.innerText;
  // Los montos VISIBLES, EN ORDEN del DOM. Solo lo que lleva "$": las etiquetas
  // de tramo ("91-120 días") no son cifras.
  const montos = texto.match(/-?\\\$[\\d,]+(?:\\.\\d{1,2})?/g) ?? [];

  let arrastre = 0, culpable = null;
  for (const el of document.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const d = el.scrollWidth - el.clientWidth;
    if (d > arrastre) { arrastre = d; culpable = el.tagName + "." + String(el.className).slice(0, 70); }
  }
  const docOverflow = document.documentElement.scrollWidth - document.documentElement.clientWidth;

  const chicos = [...document.querySelectorAll("button, a, [role=button], input, select")]
    .filter(visible)
    .map((el) => ({
      t: (el.innerText || el.getAttribute("aria-label") || el.tagName).slice(0, 40),
      w: Math.round(el.getBoundingClientRect().width),
      h: Math.round(el.getBoundingClientRect().height),
    }))
    .filter((x) => x.h < 44 || x.w < 44);

  // Textos por debajo de 12 px, con el texto a la vista.
  const chicaLetra = [...document.querySelectorAll("*")]
    .filter((el) => visible(el) && el.children.length === 0 && (el.textContent ?? "").trim())
    .map((el) => ({ t: (el.textContent ?? "").trim().slice(0, 40), px: parseFloat(getComputedStyle(el).fontSize) }))
    .filter((x) => x.px < 12);

  // La línea, medida por su marca fija (no por su clase de breakpoint: buscar por
  // la clase compara CERO en cuanto el corte se mueve, y da verde sin mirar nada).
  //
  // 🩸 Y se toma la VISIBLE, no la primera: el CXC dibuja los DOS layouts
  // (celular y escritorio) y esconde uno con CSS, así que un querySelector a
  // secas devuelve la caja de 0x0 y la medición diría "no desborda" sin haber
  // mirado la que se ve.
  const avisos = [...document.querySelectorAll('[data-aviso="rechazos-switch"]')];
  const aviso = avisos.find(visible) ?? null;
  let linea = null;
  if (aviso) {
    const r = aviso.getBoundingClientRect();
    const cs = getComputedStyle(aviso);
    linea = {
      texto: (aviso.textContent ?? "").replace("⚠️", "").trim(),
      w: Math.round(r.width), h: Math.round(r.height),
      desborde: aviso.scrollWidth - aviso.clientWidth,
      color: cs.color,
      px: parseFloat(cs.fontSize),
    };
  }

  return { montos, arrastre, culpable, docOverflow, chicos, chicaLetra, linea };
})()`;

/** Inserta el nodo donde React lo pone: primer hijo del contenedor indicado. */
const INSERTAR = (selector) => `(() => {
  if (document.querySelector('[data-aviso="rechazos-switch"]')) return "ya estaba";
  const ancla = document.querySelector(${JSON.stringify(selector)});
  if (!ancla) return "no encontré el ancla";
  const p = document.createElement("p");
  p.setAttribute("data-aviso", "rechazos-switch");
  p.className = "flex items-start gap-1.5 text-sm text-amber-700 mb-4";
  p.innerHTML = '<span aria-hidden="true">⚠️</span><span>' + ${JSON.stringify(LINEA)} + "</span>";
  ancla.insertAdjacentElement("afterend", p);
  return "insertado";
})()`;

async function contexto(browser, { w, h }, conLinea) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: DOMINIO, path: "/" }]);
  const page = await ctx.newPage();

  // 🩸 GOTCHAS medidos: sin sembrar sessionStorage, `useAuth` manda todo al login;
  // y hay que borrar la API del service worker ANTES de navegar o se mide una
  // página sin hidratar.
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "daniel");
  });

  // SOLO LECTURA.
  await page.route("**/*", async (route) => {
    const req = route.request();
    if (req.method() !== "GET") return route.abort();
    if (!conLinea || ETAPA === "antes") return route.continue();
    const url = req.url();
    if (!/\/api\/(cxc\/(boston|aging)|proveedores)(\?|$)/.test(url)) return route.continue();
    const res = await route.fetch();
    let cuerpo;
    try {
      cuerpo = await res.json();
    } catch {
      return route.fulfill({ response: res });
    }
    return route.fulfill({ response: res, body: JSON.stringify({ ...cuerpo, avisoMontos: LINEA }) });
  });

  return { ctx, page };
}

function revisar(caso, datos, conLinea) {
  salida.casos[caso] = datos;
  if (datos.docOverflow > 0) fallos.push(`${caso}: la página arrastra ${datos.docOverflow} px`);
  if (conLinea && ETAPA === "despues") {
    if (!datos.linea) {
      fallos.push(`${caso}: NO se dibujó la línea`);
      return;
    }
    if (datos.linea.texto !== LINEA) fallos.push(`${caso}: el texto de la línea cambió → ${datos.linea.texto}`);
    if (datos.linea.desborde > 0) fallos.push(`${caso}: la línea desborda ${datos.linea.desborde} px`);
    if (datos.linea.px < 12) fallos.push(`${caso}: la línea va a ${datos.linea.px} px`);
    if (!/rgb\(180, 83, 9\)|rgb\(146, 64, 14\)|amber/i.test(datos.linea.color)) {
      // El ámbar de Tailwind: text-amber-700 = rgb(180,83,9). Rojo sería rgb(220,38,38).
      if (/rgb\(220, 38, 38\)|rgb\(185, 28, 28\)/.test(datos.linea.color)) {
        fallos.push(`${caso}: la línea salió en ROJO (${datos.linea.color})`);
      }
    }
  }
  if (!conLinea && datos.linea) fallos.push(`${caso}: se dibujó la línea SIN haber rechazos`);
}

async function main() {
  const browser = await chromium.launch();

  for (const ancho of ANCHOS) {
    for (const conLinea of [false, true]) {
      const sufijo = conLinea ? "con-linea" : "sin-linea";
      const { ctx, page } = await contexto(browser, ancho, conLinea);

      // ── CXC: grupo (escritorio o celular según el ancho) ─────────────────
      await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => /total pendiente/i.test(document.body.innerText), null, { timeout: 90000 });
      await page.waitForTimeout(2500);
      revisar(`cxc-grupo/${ancho.w}/${sufijo}`, await page.evaluate(LEER), conLinea);

      // ── CXC: pestaña de Boston ───────────────────────────────────────────
      const tab = page.locator("button", { hasText: /Confecciones Boston/ }).first();
      if (!(await tab.count())) {
        fallos.push(`cxc-boston/${ancho.w}: no encontré la pestaña`);
      } else {
        await tab.click();
        await page.waitForFunction(
          () => /198,296\.55/.test(document.body.innerText) && !/Cargando/i.test(document.body.innerText),
          null,
          { timeout: 90000 },
        );
        await page.waitForTimeout(2000);
        revisar(`cxc-boston/${ancho.w}/${sufijo}`, await page.evaluate(LEER), conLinea);
      }

      // ── Proveedores ──────────────────────────────────────────────────────
      await page.goto(`${BASE}/proveedores`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => /Por pagar/i.test(document.body.innerText), null, { timeout: 90000 });
      await page.waitForTimeout(2000);
      revisar(`proveedores/${ancho.w}/${sufijo}`, await page.evaluate(LEER), conLinea);

      // ── Ventas (SSR: el nodo se inserta) ─────────────────────────────────
      await page.goto(`${BASE}/ventas`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => /Resumen/.test(document.body.innerText), null, { timeout: 120000 });
      await page.waitForTimeout(3000);
      if (conLinea && ETAPA === "despues") {
        const r = await page.evaluate(INSERTAR("main > header"));
        if (r !== "insertado") fallos.push(`ventas/${ancho.w}: no pude insertar la línea (${r})`);
      }
      revisar(`ventas/${ancho.w}/${sufijo}`, await page.evaluate(LEER), conLinea);

      // ── Comisiones (SSR: el nodo se inserta) ─────────────────────────────
      await page.goto(`${BASE}/comisiones`, { waitUntil: "networkidle" });
      await page.waitForFunction(() => /Excel/.test(document.body.innerText), null, { timeout: 120000 });
      await page.waitForTimeout(3000);
      if (conLinea && ETAPA === "despues") {
        const r = await page.evaluate(INSERTAR("main > div > div:first-child"));
        if (r !== "insertado") fallos.push(`comisiones/${ancho.w}: no pude insertar la línea (${r})`);
      }
      revisar(`comisiones/${ancho.w}/${sufijo}`, await page.evaluate(LEER), conLinea);

      await ctx.close();
    }
  }

  await browser.close();

  // ── 🔴 Ningún número se movió: posición por posición ────────────────────
  for (const clave of Object.keys(salida.casos)) {
    if (!clave.endsWith("/con-linea")) continue;
    const base = salida.casos[clave.replace("/con-linea", "/sin-linea")];
    const con = salida.casos[clave];
    if (!base) continue;
    // La línea agrega SU propio monto ($266,541,352.00): se descuenta antes de
    // comparar, si no la comparación acusaría al cambio de mover una cifra.
    const conSinElAviso = con.montos.filter((m) => m !== "$266,541,352.00");
    if (conSinElAviso.length !== base.montos.length) {
      fallos.push(`${clave}: cambió la CANTIDAD de montos (${base.montos.length} → ${conSinElAviso.length})`);
      continue;
    }
    const distintos = conSinElAviso.filter((m, i) => m !== base.montos[i]);
    if (distintos.length) fallos.push(`${clave}: ${distintos.length} montos MOVIDOS`);
  }

  console.log(JSON.stringify(salida, null, 1));
  console.error("\n═══ RESUMEN ═══");
  for (const [k, v] of Object.entries(salida.casos)) {
    console.error(
      `${k.padEnd(38)} arrastre ${String(v.docOverflow).padStart(4)} · interno ${String(v.arrastre).padStart(4)} · ` +
        `<44px ${String(v.chicos.length).padStart(3)} · <12px ${String(v.chicaLetra.length).padStart(3)} · ` +
        `línea ${v.linea ? `${v.linea.w}x${v.linea.h}` : "—"}`,
    );
  }
  if (fallos.length) {
    console.error("\n🔴 FALLOS:");
    for (const f of fallos) console.error("  · " + f);
    process.exit(1);
  }
  console.error("\n✅ sin fallos");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
