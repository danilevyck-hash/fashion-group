// Blancos táctiles por debajo de 44 px en el ENCABEZADO GLOBAL (AppHeader,
// SearchBar, NotificationCenter) y en la BARRA LATERAL, a los 4 anchos.
//
// 🩸 POR QUÉ EXISTE. Cada censo de módulo termina con los mismos 2 hallazgos
// que NO son del módulo: salen en las 54 pantallas del sistema porque viven en
// el encabezado. Arreglarlos en un solo archivo los arregla en todas.
//
// ⚠️ EL ARGUMENTO NO ES "escritorio con mouse". Estos controles se esconden
// por debajo de `sm` (640) y aparecen de 640 para arriba — o sea que **el iPad
// los muestra y se tocan con el dedo**, a 834 y a 1024. Ahí la regla de 44 px
// rige igual que en el iPhone. Por eso se mide en los 4 anchos y no solo en
// 1440.
//
// QUÉ MIDE: todo control visible con menos de 44 px de lado, ATRIBUIDO a la
// región donde vive (encabezado / migas / barra lateral / página), para no
// confundir lo global con lo del módulo.
//
// GOTCHAS heredados: cookie de sesión firmada, sessionStorage (`cxc_role`) y
// `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: no se hace click en nada.
//
//   ETAPA=antes node scripts/_medir-encabezado-global.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3173";
const SALIDA = process.env.SALIDA ?? "/tmp/t73-medicion";
const ETAPA = process.env.ETAPA ?? "antes";
const ANCHOS = (process.env.ANCHOS ?? "390,834,1024,1440").split(",").map(Number);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Las regiones se identifican por su ROL/estructura, no por clase de
// breakpoint: un selector `.sm\:flex` devuelve vacío en cuanto el corte se
// mueve y el chequeo pasaría sin haber mirado nada.
const SONDA = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none" && Number(cs.opacity) > 0.05;
  };
  const barra = document.querySelector("aside");
  // El encabezado es la barra pegajosa de arriba; las migas son su fila de abajo.
  const cabecera = document.querySelector("div.sticky.top-0");
  const migas = cabecera ? [...cabecera.querySelectorAll("div")].find(
    (d) => d.textContent.trim().startsWith("Inicio") && d.querySelectorAll("button").length > 0
  ) : null;

  const region = (el) => {
    if (barra && barra.contains(el)) return "barra-lateral";
    if (migas && migas.contains(el)) return "migas";
    if (cabecera && cabecera.contains(el)) return "encabezado";
    return "pagina";
  };

  const sel = "button, a[href], [role=button], [role=menuitem], input:not([type=hidden]), select, textarea";
  const chicos = [];
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({
      region: region(el),
      etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 30),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  const porRegion = {};
  for (const c of chicos) porRegion[c.region] = (porRegion[c.region] ?? 0) + 1;
  return {
    total: chicos.length,
    porRegion,
    // control de vacío: si no se encontró el encabezado, el 0 no prueba nada
    hayCabecera: Boolean(cabecera),
    hayBarra: Boolean(barra),
    hayMigas: Boolean(migas),
    globales: chicos.filter((c) => c.region !== "pagina"),
  };
})()`;

const PANTALLAS = [
  { id: "caja", url: "/caja" },
  { id: "cheques", url: "/cheques" },
  { id: "prestamos", url: "/prestamos" },
];

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const ANCHO of ANCHOS) {
  for (const p of PANTALLAS) {
    const ALTO = ANCHO >= 1200 ? 900 : ANCHO >= 700 ? 1194 : 844;
    const ctx = await navegador.newContext({
      viewport: { width: ANCHO, height: ALTO },
      deviceScaleFactor: 1,
      hasTouch: ANCHO < 1200,
      isMobile: false,
    });
    await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
    await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
    await ctx.addInitScript(() => {
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_user_name", "Daniel Levy");
      sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
      sessionStorage.setItem("fg_is_owner", "1");
      sessionStorage.setItem("fg_modules", JSON.stringify(["caja", "cheques", "prestamos", "cxc", "ventas", "admin"]));
    });
    const page = await ctx.newPage();
    await page.goto(BASE + p.url, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(8000);
    const r = await page.evaluate(SONDA);
    await ctx.close();

    if (!r.hayCabecera) {
      console.error(`[${ETAPA}@${ANCHO}] ${p.id.padEnd(10)} ❌ SIN ENCABEZADO — no se midió nada`);
      continue;
    }
    resultados.push({ etapa: ETAPA, ancho: ANCHO, pantalla: p.id, ...r });
    const g = r.porRegion;
    console.error(
      `[${ETAPA}@${ANCHO}] ${p.id.padEnd(10)} total=${String(r.total).padStart(3)} · ` +
      `encabezado=${String(g["encabezado"] ?? 0).padStart(2)} migas=${String(g["migas"] ?? 0).padStart(2)} ` +
      `barra=${String(g["barra-lateral"] ?? 0).padStart(2)} pagina=${String(g["pagina"] ?? 0).padStart(2)}`,
    );
  }
}

await navegador.close();
const dest = path.join(SALIDA, `encabezado-${ETAPA}.json`);
writeFileSync(dest, JSON.stringify(resultados, null, 2));
console.error(`\nJSON → ${dest}`);
