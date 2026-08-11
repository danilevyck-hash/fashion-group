// Medición de anchos de Marketing › Mobiliario tras dejar UNA SOLA TABLA:
// la columna de foto en Productos y el "?" con los precios del proveedor.
//
// QUÉ MIDE, por pantalla y por ancho:
//   · arrastre  — px que hay que arrastrar para ver el resto (overflow auto/scroll)
//   · RECORTADO — px de datos que quedan fuera y NO se alcanzan ni arrastrando
//   · cuerpoPx  — arrastre de la PÁGINA entera (esto es lo que no puede pasar)
//   · tap<44    — blancos táctiles por debajo de 44 px
//
// 🩸 Esta página YA TUVO un recorte grave (jul-2026, documentado en su
// encabezado): dos tablas dentro de un contenedor con `overflow-hidden` y sin
// scroller adentro. Se perdían ENTREGADO, DISPONIBLE, VALOR y ACCIONES sin
// aviso. Por eso una columna de foto se MIDE, no se supone.
//
// 🔑 SE MIDEN CUATRO ANCHOS, no tres. A 1024 la barra lateral deja 766 px
// útiles y es donde la tabla reaparece (el corte de layout es `lg`): es el
// ancho más apretado en el que la tabla se dibuja.
//
// GOTCHAS heredados (no tocar sin leer):
//   · Sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   · Sembrar sessionStorage (`cxc_role`, `fg_modules`): useAuth lee de AHÍ.
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: ningún escenario guarda, borra ni envía nada.
//
//   BASE=http://localhost:3193 node scripts/_medir-mobiliario-una-tabla.mjs

// 🩸 CON LAS FOTOS PUESTAS, aunque el backfill todavía no se haya corrido.
// `FOTOS_JSON` (mapa nombre → URL firmada real, lo genera el verificador)
// intercepta la respuesta de la API y le pone a cada producto la foto que la
// migración le va a escribir. Medir la columna de foto VACÍA no probaría nada
// sobre la columna de foto: el ancho hay que medirlo con la foto adentro. NO
// escribe en producción; solo cambia lo que el navegador recibe.

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync, existsSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3193";
const SALIDA = process.env.SALIDA ?? "/tmp/medir-mobiliario-una-tabla";
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const FOTOS_JSON = process.env.FOTOS_JSON ?? "/tmp/fotos-mobiliario.json";
const FOTOS =
  existsSync(FOTOS_JSON) && process.env.SIN_FOTOS !== "1"
    ? JSON.parse(readFileSync(FOTOS_JSON, "utf8"))
    : null;

const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const etiqueta = (el) =>
    el.tagName.toLowerCase() + (el.className ? "." + String(el.className).trim().replace(/\\s+/g, ".").slice(0, 70) : "");

  const arrastres = [], cortes = [];
  for (const el of document.querySelectorAll("*")) {
    const sobra = el.scrollWidth - el.clientWidth;
    if (sobra <= 1 || !visible(el)) continue;
    const cs = getComputedStyle(el);
    if (cs.overflowX === "visible") continue;
    const item = { etiqueta: etiqueta(el), sobraPx: Math.round(sobra), anchoContenido: el.scrollWidth, anchoVisible: el.clientWidth };
    if (cs.overflowX === "auto" || cs.overflowX === "scroll") { arrastres.push(item); continue; }
    if (el.children.length > 0 && (el.querySelector("table") || sobra >= 100)) cortes.push(item);
  }
  arrastres.sort((a,b)=>b.sobraPx-a.sobraPx); cortes.sort((a,b)=>b.sobraPx-a.sobraPx);

  const chicos = [];
  const sel = "button, a[href], [role=button], input:not([type=hidden]), select, textarea";
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({ etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g," ").trim().slice(0,30), w: Math.round(r.width), h: Math.round(r.height) });
  }
  chicos.sort((a,b)=>Math.min(a.w,a.h)-Math.min(b.w,b.h));

  // Fotos que de verdad se pintaron (no <img> rotos).
  const fotos = Array.from(document.querySelectorAll("table img, [data-fg-tarjeta] img"));
  const fotosOk = fotos.filter((i) => i.naturalWidth > 0).length;

  return {
    arrastrePx: arrastres.length ? arrastres[0].sobraPx : 0,
    peorArrastre: arrastres[0] ?? null,
    cortadoPx: cortes.length ? cortes[0].sobraPx : 0,
    peorCorte: cortes[0] ?? null,
    // Lo que no puede pasar: que se arrastre la PÁGINA.
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    tapChicos: chicos.length,
    ejemplosTap: chicos.slice(0, 4),
    // Control de vacío: un 0 px sin contenido no prueba nada.
    filas: document.querySelectorAll("tbody tr").length,
    tarjetas: document.querySelectorAll("[data-fg-tarjeta]").length,
    textoLargo: document.body.innerText.replace(/\\s+/g," ").trim().length,
    // Señales de que lo NUEVO está en pantalla.
    fotosPintadas: fotosOk,
    fotosTotal: fotos.length,
    tieneBotonAyuda: !!document.querySelector('[aria-haspopup="dialog"]'),
    diceNotasProveedor: /Notas del proveedor/i.test(document.body.innerText),
    dicePreciosProveedor: /Precios del proveedor/i.test(document.body.innerText),
    diceNoSeSuma: /No se suma ni entra en ningún cálculo/.test(document.body.innerText),
    // Los precios del proveedor NO pueden aparecer en la tabla de Productos.
    preciosEnCuadro: Array.from(document.querySelectorAll("[data-fg-precio-proveedor]")).map((e)=>e.textContent.trim()),
    // Disponible negativo: tiene que SEGUIR viéndose, no esconderse.
    disponibles: Array.from(document.querySelectorAll('[data-fg-campo="disponible"]')).map((e)=>e.textContent.trim()),
    valores: Array.from(document.querySelectorAll('[data-fg-campo="valor"]')).map((e)=>e.textContent.trim()),
  };
})()`;

const P = [
  {
    id: "mobiliario",
    titulo: "Mobiliario — Productos con foto (el ? cerrado)",
    url: "/marketing/mobiliario",
    espera: 9000,
  },
  {
    id: "mobiliario-ayuda",
    titulo: 'Mobiliario — el "?" abierto',
    url: "/marketing/mobiliario",
    espera: 9000,
    async preparar(page) {
      const b = page.locator('[aria-haspopup="dialog"]').first();
      if (!(await b.count())) return false;
      await b.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(2500);
      return (await page.getByRole("dialog").count()) > 0;
    },
  },
];

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const ANCHO of ANCHOS) {
  for (const p of P) {
    const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
    const ctx = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 1,
      hasTouch: ANCHO < 1200,
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_is_owner", "1");
      sessionStorage.setItem("fg_modules", JSON.stringify(["marketing", "clientes", "admin"]));
    });

    const page = await ctx.newPage();
    if (FOTOS) {
      await page.route("**/api/marketing/inventario/productos", async (route) => {
        const res = await route.fetch();
        let cuerpo;
        try {
          cuerpo = await res.json();
        } catch {
          return route.fulfill({ response: res });
        }
        if (Array.isArray(cuerpo)) {
          for (const p of cuerpo) {
            if (FOTOS[p.nombre]) {
              p.foto_path = `simulado/${p.nombre}.jpg`;
              p.foto_url = FOTOS[p.nombre];
            }
          }
        }
        await route.fulfill({ response: res, json: cuerpo });
      });
    }
    const erroresJs = [];
    page.on("pageerror", (x) => erroresJs.push(String(x.message)));

    const r = { id: p.id, titulo: p.titulo, ancho: ANCHO };
    try {
      await page.goto(BASE + p.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(p.espera ?? 8000);
      if (/\/login/.test(page.url())) throw new Error("me echó al login");
      if (p.preparar && !(await p.preparar(page))) throw new Error("no pude preparar la pantalla");
      Object.assign(r, await page.evaluate(SONDA));
      r.conDatos = r.arrastrePx > 0 || r.cortadoPx > 0 || r.filas > 0 || r.tarjetas > 0 || r.textoLargo > 250;
      r.veredicto = !r.conDatos ? "SIN-DATOS"
        : r.cortadoPx > 0 ? "RECORTADO"
        : r.cuerpoPx > 0 ? "ARRASTRE-DE-PAGINA"
        : r.arrastrePx > 0 ? "ARRASTRE-INTERNO"
        : "SANO";
      await page.screenshot({ path: path.join(SALIDA, `${p.id}-${ANCHO}.png`), fullPage: true });
    } catch (err) {
      r.error = String(err.message ?? err).slice(0, 200);
      r.veredicto = "NO-MEDIDO";
      await page.screenshot({ path: path.join(SALIDA, `${p.id}-${ANCHO}-ERROR.png`), fullPage: true }).catch(() => {});
    }
    r.erroresJs = erroresJs.slice(0, 3);
    resultados.push(r);
    console.error(
      `@${String(ANCHO).padStart(4)} ${p.id.padEnd(20)} pagina=${String(r.cuerpoPx ?? "?").padStart(3)} ` +
      `arrastre=${String(r.arrastrePx ?? "?").padStart(4)} RECORTADO=${String(r.cortadoPx ?? "?").padStart(4)} ` +
      `tap<44=${String(r.tapChicos ?? "?").padStart(2)} fotos=${r.fotosPintadas ?? "?"}/${r.fotosTotal ?? "?"} ` +
      `${r.veredicto}` +
      (r.peorArrastre ? `  ← ${r.peorArrastre.etiqueta.slice(0, 36)}` : "") +
      (r.peorCorte ? `  ✂ ${r.peorCorte.etiqueta.slice(0, 36)}` : "") +
      (r.error ? `  ⚠️ ${r.error}` : ""),
    );
    await ctx.close();
  }
}

await navegador.close();
writeFileSync(path.join(SALIDA, "medicion.json"), JSON.stringify(resultados, null, 2));
console.error(`\n→ ${path.join(SALIDA, "medicion.json")}`);
