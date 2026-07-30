// Verificación REAL en navegador del campo CLIENTE de una guía nueva.
//
// Mide los DOS defectos que reportó Daniel, contra la app de verdad:
//   A. "cuando coloco el nombre del cliente se borra" — se teclea, se toca otro
//      campo de la fila, y se mira si el texto sobrevivió.
//   B. el desplegable "empuja y tapa las demás columnas" — se anotan las cajas
//      de TODAS las celdas de la fila antes y después de abrirlo.
//
// GOTCHAS (de auditorías anteriores, no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que sembrar sessionStorage (`cxc_role`): useAuth lo lee de AHÍ.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: nunca toca "Guardar Guía".

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3131";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

/** Caja de cada celda/campo de la PRIMERA fila de envío, en el layout visible. */
const MEDIR_FILA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const cont = [...document.querySelectorAll('[data-layout]')].find(visible);
  if (!cont) return { error: "ningún layout visible" };
  const campos = {};
  for (const campo of ["cliente", "direccion", "empresa", "facturas", "bultos"]) {
    const el = [...document.querySelectorAll('[id^="' + campo + '-"]')].find(visible);
    if (!el) { campos[campo] = null; continue; }
    const r = el.getBoundingClientRect();
    campos[campo] = { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
  }
  return {
    layout: cont.getAttribute("data-layout"),
    campos,
    // Alto del contenedor de la fila/tarjeta: si el desplegable EMPUJA, crece.
    altoContenedor: Math.round(cont.getBoundingClientRect().height),
    arrastreCuerpo: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
})()`;

/**
 * El desplegable. Desde el arreglo vive en un PORTAL a <body>, así que ya no se
 * busca entre los hermanos del input: se busca por su marca.
 * Se deja el camino viejo de respaldo para poder medir "antes" y "después" con
 * el MISMO script.
 */
const BUSCAR_LISTA = `
  const _visible = (el) => el.getBoundingClientRect().height > 0;
  const _input = [...document.querySelectorAll('[id^="cliente-"]')].find((el) => el.getBoundingClientRect().width > 0);
  let lista = document.querySelector("[data-desplegable-cliente]");
  if (!lista && _input) {
    lista = [..._input.parentElement.children].find((el) => el !== _input && el.tagName === "DIV" && _visible(el)) ?? null;
  }
`;

/**
 * El contenedor que recortaba. LA medición que define el bug: si abrir la lista
 * lo vuelve scrolleable, la fila se puede ir de la vista y aparece la foto de
 * Daniel. `puedeScrollear` tiene que ser 0 con la lista abierta.
 */
const MEDIR_RECORTADOR = `(() => {
  const inp = [...document.querySelectorAll('[id^="cliente-"]')].find((el) => el.getBoundingClientRect().width > 0);
  if (!inp) return null;
  let n = inp.parentElement;
  while (n && n !== document.body) {
    const cs = getComputedStyle(n);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      return {
        cls: String(n.className).slice(0, 40),
        scrollHeight: n.scrollHeight,
        clientHeight: n.clientHeight,
        puedeScrollear: n.scrollHeight - n.clientHeight,
      };
    }
    n = n.parentElement;
  }
  return { cls: "(ninguno)", puedeScrollear: 0 };
})()`;

/** ¿El desplegable está visible ENTERO o lo recorta un ancestro con overflow? */
const MEDIR_DESPLEGABLE = `(() => {
  ${BUSCAR_LISTA}
  if (!lista) return { presente: false };
  const r = lista.getBoundingClientRect();
  // Recorte real: se compara la caja de la lista contra la de cada ancestro con
  // overflow distinto de visible.
  let recorte = null;
  let p = lista.parentElement;
  while (p && p !== document.body) {
    const cs = getComputedStyle(p);
    if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
      const pr = p.getBoundingClientRect();
      const perdidoAbajo = Math.round(Math.max(0, r.bottom - pr.bottom));
      const perdidoDer = Math.round(Math.max(0, r.right - pr.right));
      if (perdidoAbajo > 0 || perdidoDer > 0) {
        recorte = { por: p.tagName + "." + String(p.className).slice(0, 40), perdidoAbajo, perdidoDer };
        break;
      }
    }
    p = p.parentElement;
  }
  // ¿Flota por ENCIMA? El punto medio del desplegable debe devolver la lista.
  const cx = r.x + r.width / 2;
  const cy = r.y + Math.min(30, r.height / 2);
  const arriba = document.elementFromPoint(cx, cy);
  return {
    presente: true,
    caja: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
    recorte,
    flotaEncima: Boolean(arriba && (arriba === lista || lista.contains(arriba))),
    opciones: lista.querySelectorAll("button").length,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const t of TAMANOS) {
  const ctx = await navegador.newContext({
    viewport: { width: t.width, height: t.height },
    deviceScaleFactor: 2,
    ...(t.movil ? { hasTouch: true, isMobile: false } : {}),
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });

  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e.message)));

  await page.goto(`${BASE}/guias/nueva`, { waitUntil: "networkidle" });
  // Un borrador guardado de una corrida anterior ensucia la medición.
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector('[id^="cliente-"]', { state: "attached", timeout: 20000 })
    .catch(async () => { console.error(`[${t.nombre}] sin campo cliente. URL=${page.url()}\n` + (await page.locator("body").innerText()).slice(0, 400)); });
  await page.waitForTimeout(500);

  const r = { etapa: ETAPA, tamano: t.nombre, viewport: `${t.width}x${t.height}` };

  const idCliente = await page.evaluate(() => {
    const visible = (el) => el.getBoundingClientRect().width > 0;
    const el = [...document.querySelectorAll('[id^="cliente-"]')].find(visible);
    return el ? el.id : null;
  });
  const idDireccion = await page.evaluate(() => {
    const visible = (el) => el.getBoundingClientRect().width > 0;
    const el = [...document.querySelectorAll('[id^="direccion-"]')].find(visible);
    return el ? el.id : null;
  });
  r.idCliente = idCliente;
  if (!idCliente) { r.error = "no encontré el campo cliente"; resultados.push(r); await ctx.close(); continue; }

  const cliente = page.locator(`#${idCliente}`);
  const direccion = page.locator(`#${idDireccion}`);

  // ── Estado de la fila CERRADA (línea base de posiciones) ──
  r.filaCerrada = await page.evaluate(MEDIR_FILA);
  r.recortadorCerrado = await page.evaluate(MEDIR_RECORTADOR);

  // ── A. Se teclea "CI" y se mide el desplegable abierto ──
  await cliente.click();
  await page.waitForTimeout(120);
  for (const c of "CI") { await page.keyboard.type(c); await page.waitForTimeout(120); }
  // La base está lenta: /api/clientes midió 5,6 s. Se espera de verdad a que
  // aparezcan resultados, o se mediría el estado "Buscando…".
  await page.waitForFunction(
    `(() => { ${BUSCAR_LISTA} return lista && lista.querySelectorAll("button").length > 1; })()`,
    null, { timeout: 20000 },
  ).catch(() => {});
  r.textoTrasEscribir = await cliente.inputValue();
  r.recortadorAbierto = await page.evaluate(MEDIR_RECORTADOR);
  r.desplegable = await page.evaluate(MEDIR_DESPLEGABLE);
  r.filaAbierta = await page.evaluate(MEDIR_FILA);
  await page.screenshot({ path: path.join(SALIDA, `guia-cliente-fix-${ETAPA}-${t.nombre}-desplegable.png`), fullPage: false });

  // ── ¿Se desplazó algo? ──
  r.desplazamiento = {};
  for (const k of ["direccion", "empresa", "facturas", "bultos"]) {
    const a = r.filaCerrada?.campos?.[k], b = r.filaAbierta?.campos?.[k];
    r.desplazamiento[k] = a && b ? { dx: b.x - a.x, dy: b.y - a.y } : "n/d";
  }
  r.creceContenedor = (r.filaAbierta?.altoContenedor ?? 0) - (r.filaCerrada?.altoContenedor ?? 0);

  // ── B. EL BUG: el desplegable TAPA el campo siguiente. ¿Se puede tocar?
  // Playwright reproduce lo del dedo de Daniel: si la lista intercepta el
  // puntero, el primer toque NO llega a Dirección — se lo come la lista.
  r.desplegableTapaDireccion = await direccion.click({ timeout: 2500 })
    .then(() => false)
    .catch((e) => /intercepts pointer events/.test(String(e)));

  // ── Y el otro bug: al cerrar sin elegir, ¿sobrevive "Cl"? ──
  await page.locator("h1").click();
  await page.waitForTimeout(400);
  r.textoTrasCerrarSinElegir = await cliente.inputValue();
  await direccion.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  r.textoTrasTocarOtroCampo = await cliente.inputValue();
  r.clienteVisibleTrasTocarOtro = await page.evaluate((id) => {
    const el = document.getElementById(id);
    return { valor: el.value, placeholder: el.placeholder };
  }, idCliente);
  await page.screenshot({ path: path.join(SALIDA, `guia-cliente-fix-${ETAPA}-${t.nombre}-tras-tocar-otro.png`) });

  // ── C. Elegir de la lista deja el código ──
  await cliente.click();
  await page.waitForTimeout(120);
  await page.keyboard.type("CI");
  await page.waitForFunction(
    `(() => { ${BUSCAR_LISTA} return lista && lista.querySelectorAll("button").length > 1; })()`,
    null, { timeout: 20000 },
  ).catch(() => {});
  r.opcionesVisibles = await page.evaluate(`(() => { ${BUSCAR_LISTA} return lista ? lista.querySelectorAll("button").length : 0; })()`);
  if (r.opcionesVisibles > 0) {
    r.primeraOpcion = await page.evaluate(`(() => { ${BUSCAR_LISTA} return lista.querySelector("button").innerText.replace(/\\s+/g, " ").trim(); })()`);
    // mousedown, que es lo que escucha Opcion (para ganarle al onBlur).
    await page.evaluate(`(() => { ${BUSCAR_LISTA} const b = lista.querySelector("button");
      b.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true }));
    })()`);
    await page.waitForTimeout(400);
    r.trasElegir = await page.evaluate((id) => {
      const el = document.getElementById(id);
      const chip = el.closest("div").querySelector("span[title]");
      return { valor: el.value, placeholder: el.placeholder, chip: chip ? chip.textContent.trim() : null, chipTitle: chip ? chip.getAttribute("title") : null };
    }, idCliente);
    await page.screenshot({ path: path.join(SALIDA, `guia-cliente-fix-${ETAPA}-${t.nombre}-elegido.png`) });
  }

  // ── D. Un cliente ya elegido NO se borra al tocar otro campo ──
  await direccion.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(300);
  r.trasElegirYTocarOtro = await page.evaluate((id) => {
    const el = document.getElementById(id);
    return { valor: el.value, placeholder: el.placeholder };
  }, idCliente);

  r.erroresJs = errores;
  resultados.push(r);
  await ctx.close();
}

await navegador.close();
console.log(JSON.stringify(resultados, null, 2));
