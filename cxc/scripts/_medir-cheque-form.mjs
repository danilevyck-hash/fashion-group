// Verificación REAL en navegador del formulario de cheques (build de producción).
//
// Mide lo que el gate pide, contra la app de verdad y no contra un arnés:
//   1. Teclear 6 dígitos de corrido en N° de Cheque deja los 6 (el bug de Daniel).
//   2. El foco arranca en el campo Cliente y NO en el botón ✕.
//   3. Ningún control del formulario mide menos de 44 px en móvil, ni con el
//      selector de cliente ABIERTO.
//   4. El cuerpo no scrollea de lado en ninguno de los 4 tamaños.
//   5. Capturas de los 4 tamaños, con el formulario abierto y con el selector
//      abierto.
//
// GOTCHAS (aprendidos a golpes en auditorías anteriores, no tocar sin leer):
//   * Hay que sembrar la COOKIE de sesión firmada o todo redirige al login.
//   * Hay que `delete Navigator.prototype.serviceWorker` ANTES de navegar:
//     bloquear el SW por ruteo mata la hidratación y se mide una página muerta.
//
// Solo lectura: no crea ni modifica ningún cheque (nunca toca "Guardar").

import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3131";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";

// La cookie se firma aparte (con el signSession del repo y el userId REAL del
// usuario): con un userId inventado la app carga y el cliente redirige al home.
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

const TAMANOS = [
  { nombre: "iphone-390", width: 390, height: 844, movil: true },
  { nombre: "ipad-vertical-768", width: 768, height: 1024, movil: true },
  { nombre: "ipad-horizontal-1024", width: 1024, height: 768, movil: true },
  { nombre: "escritorio-1440", width: 1440, height: 900, movil: false },
];

/** Alto/ancho de cada control DENTRO del formulario. */
const MEDIR_TARGETS = `(() => {
  const panel = document.querySelector('[aria-label="Nuevo cheque"], [aria-label="Editar cheque"]');
  if (!panel) return { error: "panel no encontrado" };
  const sel = 'button, input, select, textarea, a[href], [role="button"]';
  const chicos = [];
  for (const el of panel.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;            // oculto
    if (getComputedStyle(el).visibility === "hidden") continue;
    if (r.height < 44 || r.width < 44) {
      chicos.push({
        etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).trim().slice(0, 40),
        alto: +r.height.toFixed(1),
        ancho: +r.width.toFixed(1),
      });
    }
  }
  return { total: panel.querySelectorAll(sel).length, chicos };
})()`;

const MEDIR_SCROLL = `({
  arrastreCuerpo: document.documentElement.scrollWidth - document.documentElement.clientWidth,
})`;

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
  // El SW tiene que estar AUSENTE, no bloqueado: si se bloquea el fetch de
  // /sw.js la hidratación se cae y se mide una página que no reacciona.
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  // 🩸 Y hay que sembrar sessionStorage: `useAuth` lee `cxc_role` de AHÍ (no de
  // la cookie) y sin él redirige al login DESPUÉS de hidratar — el SSR devuelve
  // 200 y uno cree que entró, pero termina midiendo la pantalla de ingreso.
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
  });

  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e.message)));

  await page.goto(`${BASE}/cheques`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Nuevo Cheque" }).click();
  await page.waitForSelector('[aria-label="Nuevo cheque"]');
  await page.waitForTimeout(400); // deja correr el autofocus diferido

  const r = { tamano: t.nombre, viewport: `${t.width}x${t.height}` };

  // ── 1. ¿Dónde arrancó el foco? ──
  r.focoInicial = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.id || a.getAttribute("aria-label") || a.tagName) : "(ninguno)";
  });

  // ── 2. Seis dígitos de corrido, tecla por tecla, con pausa entre teclas ──
  const numero = page.getByLabel("N° Cheque");
  await numero.click();
  for (const d of "246001") {
    await page.keyboard.type(d);
    await page.waitForTimeout(90); // la ventana donde el bug viejo robaba el foco
  }
  r.numeroEscrito = await numero.inputValue();
  r.focoTrasEscribir = await page.evaluate(() => {
    const a = document.activeElement;
    return a ? (a.id || a.getAttribute("aria-label") || a.tagName) : "(ninguno)";
  });

  // ── 3. Nombre del cliente de corrido ──
  await page.locator("#cheque-cliente").click();
  await page.waitForTimeout(150);
  for (const c of "XTREME") {
    await page.keyboard.type(c);
    await page.waitForTimeout(90);
  }
  r.clienteEscrito = await page.locator("#cheque-cliente").inputValue();

  // ── 4. Targets y scroll con el selector de cliente ABIERTO ──
  r.targetsSelectorAbierto = await page.evaluate(MEDIR_TARGETS);
  r.scroll = await page.evaluate(MEDIR_SCROLL);
  await page.screenshot({ path: path.join(SALIDA, `cheque-${t.nombre}-cliente-abierto.png`) });

  // ── 5. Cerrar el selector y medir/capturar el formulario limpio ──
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  r.targetsFormulario = await page.evaluate(MEDIR_TARGETS);
  await page.screenshot({ path: path.join(SALIDA, `cheque-${t.nombre}-formulario.png`) });

  // ── 6. ¿Sigue abierto? Escape con el formulario escrito NO debe cerrarlo ──
  r.sigueAbiertoTrasEscape = await page.locator('[aria-label="Nuevo cheque"]').count() > 0;
  r.numeroTrasEscape = await page.getByLabel("N° Cheque").inputValue();

  // ── 7. Columnas reales: el máximo de etiquetas que comparten renglón ──
  r.columnas = await page.evaluate(() => {
    const porFila = new Map();
    for (const l of document.querySelectorAll('[aria-label="Nuevo cheque"] label')) {
      const top = Math.round(l.getBoundingClientRect().top);
      porFila.set(top, (porFila.get(top) ?? 0) + 1);
    }
    return Math.max(...porFila.values());
  });

  // ── 8. ¿La ventana está CENTRADA (y no pegada a la derecha)? ──
  r.posicion = await page.evaluate(() => {
    const p = document.querySelector('[aria-label="Nuevo cheque"]').getBoundingClientRect();
    const w = document.documentElement.clientWidth;
    return {
      margenIzq: Math.round(p.left),
      margenDer: Math.round(w - p.right),
      anchoPanel: Math.round(p.width),
      pctPantalla: Math.round((p.width / w) * 100),
    };
  });

  r.erroresJs = errores;
  resultados.push(r);
  await ctx.close();
}

await navegador.close();
console.log(JSON.stringify(resultados, null, 2));
