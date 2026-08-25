// Compara, en el NAVEGADOR contra un build real y con datos de producción, la
// pestaña de Confecciones Boston dibujada como TARJETAS (iPad, 834) contra la
// misma dibujada como TABLA (escritorio, 1440), **cliente por cliente y monto
// por monto, POR POSICIÓN**.
//
// Por qué por posición y no por nombre: los dos layouts recorren el MISMO
// arreglo ya ordenado. Parear por nombre da falsos "sin par" (nombres partidos
// en dos líneas, el chip "también en el grupo").
//
// 🩸 El asidero es `data-vista`, FIJO. Buscar el layout por su clase de
// breakpoint (`.sm\:hidden`) devuelve VACÍO en cuanto el corte se mueve: se
// compararía CERO y el script pasaría en verde sin haber mirado nada. Por eso
// FALLA si encuentra cero filas.
//
// De paso mide el desbordamiento de la píldora de tramo, para poder decir si es
// NUEVO o venía de antes.
//
// SOLO LECTURA.
//
//   BASE=http://localhost:3177 node scripts/_verif-boston-tarjetas-vs-tabla.mjs
import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE || "http://localhost:3177";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

/** Todos los números con formato de plata de un texto, en orden. */
const cifras = (t) => (t.match(/-?[\d,]+\.\d{2}/g) ?? []);

// 🔑 SE COMPARA POR ROL, NO POR EL ORDEN EN QUE SE LEE. Los dos layouts dicen
// las MISMAS cifras en distinto orden a propósito: la tarjeta pone el TOTAL
// arriba, pegado al nombre (es lo primero que se mira en un celular), y la tabla
// lo pone al final de la fila. Comparar el texto crudo marcaría como "distinta"
// una fila que dice exactamente lo mismo.
const LEER_FILAS = `(() => {
  const tarj = document.querySelector('[data-vista="tarjetas"]');
  const tabla = document.querySelector('[data-vista="tabla"]');
  const visible = (el) => el && el.getBoundingClientRect().height > 0;
  const cual = visible(tarj) ? "tarjetas" : visible(tabla) ? "tabla" : null;
  if (!cual) return { vista: null, filas: [] };
  const txt = (el) => (el ? el.textContent.trim() : "");
  const plata = (t) => { const m = t.match(/-?[\\d,]+\\.\\d{2}/); return m ? m[0] : "—"; };

  if (cual === "tarjetas") {
    const filas = [...tarj.children].map((c) => {
      const cuerpo = c.querySelector("div");
      const total = plata(txt(c.querySelector("span.font-semibold.tabular-nums")));
      const tramosDiv = [...cuerpo.querySelectorAll("div")].find((d) => /flex gap-3/.test(d.className));
      const tramos = tramosDiv ? [...tramosDiv.children].map((s) => plata(txt(s))) : [];
      const pagoP = [...cuerpo.querySelectorAll("p")].find((p) => /Últ\\. pago/.test(p.textContent));
      const nombre = txt(c.querySelector("span.font-medium"));
      return { nombre, tramos, total, pago: pagoP ? plata(txt(pagoP)) : "—" };
    });
    return { vista: cual, filas };
  }

  const filas = [...tabla.querySelectorAll("tbody tr")].map((tr) => {
    const td = [...tr.children];
    return {
      nombre: txt(td[0].querySelector("span.text-gray-900")),
      tramos: [plata(txt(td[1])), plata(txt(td[2])), plata(txt(td[3]))],
      pago: plata(txt(td[4])),
      total: plata(txt(td[5])),
    };
  });
  return { vista: cual, filas };
})()`;

/** El peor desbordamiento de una PÍLDORA de tramo (para separarlo de la tabla). */
const LEER_PILDORAS = `(() => {
  const grid = [...document.querySelectorAll("div")].find((d) => /grid-cols-2/.test(d.className) && d.querySelectorAll("button").length === 4);
  if (!grid) return null;
  let peor = 0;
  for (const el of grid.querySelectorAll("*")) {
    const d = el.scrollWidth - el.clientWidth;
    if (d > peor) peor = d;
  }
  return peor;
})()`;

async function abrirBoston(browser, ancho) {
  const ctx = await browser.newContext({ viewport: { width: ancho, height: 950 } });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" }]);
  const page = await ctx.newPage();
  await page.addInitScript(() => {
    delete Navigator.prototype.serviceWorker;
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("cxc_user", "daniel");
  });
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => /total pendiente/i.test(document.body.innerText), null, { timeout: 90000 });
  await page.locator("button", { hasText: /Confecciones Boston/ }).first().click();
  await page.waitForFunction(
    () => /\d+ clientes?/.test(document.body.innerText) && !/Cargando/i.test(document.body.innerText),
    null, { timeout: 90000 },
  );
  await page.waitForTimeout(3000);
  return { ctx, page };
}

async function main() {
  const browser = await chromium.launch();

  const a = await abrirBoston(browser, 834);
  const tarjetas = await a.page.evaluate(LEER_FILAS);
  const pildora834 = await a.page.evaluate(LEER_PILDORAS);
  await a.ctx.close();

  const b = await abrirBoston(browser, 1440);
  const tabla = await b.page.evaluate(LEER_FILAS);
  await b.ctx.close();
  await browser.close();

  console.log(`BASE ${BASE}`);
  console.log(`834  → vista "${tarjetas.vista}" · ${tarjetas.filas.length} filas`);
  console.log(`1440 → vista "${tabla.vista}" · ${tabla.filas.length} filas`);
  console.log(`píldoras a 834: desbordan ${pildora834} px`);

  let malo = false;
  if (tarjetas.vista !== "tarjetas") { console.log("🔴 a 834 NO se dibujaron las tarjetas"); malo = true; }
  if (tabla.vista !== "tabla") { console.log("🔴 a 1440 NO se dibujó la tabla"); malo = true; }
  if (tarjetas.filas.length === 0 || tabla.filas.length === 0) {
    console.log("🔴 alguna vista quedó en CERO filas — no se comparó nada");
    process.exit(1);
  }
  if (tarjetas.filas.length !== tabla.filas.length) {
    console.log(`🔴 distinta cantidad de clientes: ${tarjetas.filas.length} vs ${tabla.filas.length}`);
    malo = true;
  }

  let comparados = 0, distintos = 0;
  const n = Math.min(tarjetas.filas.length, tabla.filas.length);
  for (let i = 0; i < n; i++) {
    const t = tarjetas.filas[i], b = tabla.filas[i];
    const campos = ["tramos.0", "tramos.1", "tramos.2", "total", "pago"];
    const vt = [...t.tramos, t.total, t.pago];
    const vb = [...b.tramos, b.total, b.pago];
    comparados += vt.length;
    const malos = campos.filter((_, k) => vt[k] !== vb[k]);
    const mismoNombre = t.nombre === b.nombre;
    if (malos.length || !mismoNombre) {
      distintos++;
      if (distintos <= 5) {
        console.log(`  #${i} ${t.nombre} / ${b.nombre}`);
        console.log(`     tarjeta [${vt.join(" · ")}]`);
        console.log(`     tabla   [${vb.join(" · ")}]`);
      }
    }
  }

  console.log(`\n${comparados} montos comparados (cliente por cliente, por POSICIÓN) · ${distintos} filas distintas`);
  if (distintos > 0) malo = true;
  console.log(malo ? "🔴 HAY DIFERENCIAS" : "🟢 las tarjetas dicen EXACTAMENTE lo mismo que la tabla");
  process.exit(malo ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
