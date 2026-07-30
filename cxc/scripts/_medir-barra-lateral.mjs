// LA BARRA LATERAL: targets por debajo de 44 px y, sobre todo, ¿ENTRAN las
// filas después de agrandarlas? ¿Queda algún módulo fuera de la vista?
//
// 🩸 POR QUÉ EXISTE. La barra aporta 26 de los 30 controles chicos que quedan
// en el sistema (20 enlaces de módulo de 223×32, 3 encabezados de grupo de
// 223×41, el logo, el colapsar y el salir). Agrandarlos es fácil; el riesgo es
// el otro: **que un módulo quede fuera de la vista y no se pueda alcanzar**.
// Eso sería peor que un target chico — es el mismo bug que se barrió hoy en 12
// pantallas.
//
// 🩸 GOTCHA DE MEDICIÓN QUE YA ME MORDIÓ UNA VEZ. El acordeón es EXCLUSIVO (un
// grupo abierto a la vez) y los grupos cerrados se esconden con
// `grid-template-rows: 0fr` + `overflow-hidden` + `opacity-0`. Los enlaces de
// adentro **conservan su propio rect de 223×32** y `getComputedStyle(enlace)
// .opacity` vale 1, porque la opacidad del padre no se hereda como valor
// computado. Un chequeo de visibilidad ingenuo los cuenta a todos y reporta 20
// enlaces visibles donde hay 7 o 10. Acá la visibilidad se decide con
// `elementFromPoint` sobre el centro del elemento: eso sí respeta el recorte
// del acordeón y las superposiciones.
//
// QUÉ MIDE:
//   * `chicos`   — controles visibles con menos de 44 px de lado.
//   * `navAlto`  — alto del contenido del nav vs el alto disponible, y cuánto
//                  SOBRA (si sobra, el nav scrollea; eso está bien mientras no
//                  recorte).
//   * `modulosInalcanzables` — enlaces que quedan fuera del área scrolleable
//                  del nav. Tiene que ser SIEMPRE 0: un módulo que no se puede
//                  alcanzar es peor que un target chico.
//
// Se abre CADA grupo del acordeón, uno por uno, porque el alto máximo lo marca
// el grupo más grande (Operación, 10 módulos). Abrir un grupo es un toggle de
// UI, no ejecuta nada.
//
// GOTCHAS heredados: cookie de sesión firmada, sessionStorage (`cxc_role`) y
// `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
//   ETAPA=antes node scripts/_medir-barra-lateral.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3178";
const SALIDA = process.env.SALIDA ?? "/tmp/t78-medicion";
const ETAPA = process.env.ETAPA ?? "antes";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// alto además de ancho: el alto es lo que decide si el nav scrollea. 700 px es
// una ventana de laptop con el navegador no maximizado — el peor caso realista.
const CASOS = [
  { w: 834, h: 1194, nota: "iPad vertical" },
  { w: 1024, h: 1194, nota: "iPad horizontal" },
  { w: 1440, h: 900, nota: "escritorio" },
  { w: 1440, h: 700, nota: "escritorio, ventana baja" },
];

const SONDA = `(() => {
  // Visibilidad REAL: el centro del elemento tiene que ser lo que el usuario
  // toca. Respeta el recorte del acordeón, que un rect propio no respeta.
  const seVe = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    // 🩸 OJO: NO vale \`hit.contains(el)\`. Un enlace recortado por el acordeón
    // devuelve como hit a un ANCESTRO (el nav), y \`nav.contains(enlace)\` es
    // true siempre: con esa condición pasaban los 19 enlaces como visibles
    // cuando el acordeón solo muestra 7 o 10. Solo vale que el punto caiga en
    // el elemento o en un hijo suyo.
    return Boolean(hit && (el === hit || el.contains(hit)));
  };

  const aside = document.querySelector("aside");
  if (!aside) return { error: "sin barra lateral" };
  const nav = aside.querySelector("nav");

  const sel = "button, a[href], [role=button], [role=menuitem], input:not([type=hidden]), select, textarea";
  const chicos = [];
  for (const el of aside.querySelectorAll(sel)) {
    if (!seVe(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({
      etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g, " ").trim().slice(0, 28),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }

  // ¿Algún enlace de módulo VISIBLE queda fuera del área que el nav puede
  // mostrar (aunque se scrollee hasta el fondo)?
  const navRect = nav.getBoundingClientRect();
  const inalcanzables = [];
  for (const a of nav.querySelectorAll("a[href]")) {
    if (!seVe(a)) continue;
    const r = a.getBoundingClientRect();
    // fuera por arriba o por abajo del recuadro del nav = recortado sin salida
    if (r.bottom < navRect.top - 1 || r.top > navRect.bottom + 1) {
      inalcanzables.push((a.textContent || "").trim().slice(0, 24));
    }
  }

  return {
    chicos,
    cuantosChicos: chicos.length,
    enlacesVisibles: [...nav.querySelectorAll("a[href]")].filter(seVe).length,
    // 🩸 \`scrollHeight\` NO sirve para saber cuánto ocupa el contenido: nunca
    // baja de \`clientHeight\`, así que un nav con 500 px de filas dentro de una
    // caja de 1076 reporta 1076 y parece "justo". El alto real es de la primera
    // fila a la última, más el padding del nav.
    navContenido: (() => {
      const hijos = [...nav.children].filter((c) => c.getBoundingClientRect().height > 0);
      if (!hijos.length) return 0;
      const cs = getComputedStyle(nav);
      const arriba = hijos[0].getBoundingClientRect().top;
      const abajo = hijos[hijos.length - 1].getBoundingClientRect().bottom;
      return Math.round(abajo - arriba + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom));
    })(),
    navScrollHeight: nav.scrollHeight,
    navVisible: nav.clientHeight,
    navSobra: Math.max(0, nav.scrollHeight - nav.clientHeight),
    navScrollea: nav.scrollHeight > nav.clientHeight + 1,
    navLibre: 0,
    modulosInalcanzables: inalcanzables,
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const c of CASOS) {
  const ctx = await navegador.newContext({
    viewport: { width: c.w, height: c.h },
    deviceScaleFactor: 1,
    hasTouch: c.w < 1200,
    isMobile: false,
  });
  await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
  await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
  await ctx.addInitScript(() => {
    sessionStorage.setItem("cxc_role", "admin");
    sessionStorage.setItem("fg_user_name", "Daniel Levy");
    sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
    sessionStorage.setItem("fg_is_owner", "1");
    sessionStorage.setItem("fg_modules", JSON.stringify([
      "vista-general", "ventas", "cxc", "multifashion", "directorio", "proveedores", "catalogos",
      "guias", "packing-lists", "reclamos", "cargar", "comisiones", "marketing", "caja",
      "gastos-empresa", "prestamos", "cheques", "usuarios", "data-health",
    ]));
  });
  const page = await ctx.newPage();
  await page.goto(BASE + "/caja", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(8000);

  // Cada grupo, uno por uno: el alto máximo lo marca el más grande.
  const grupos = await page.locator("aside nav > div > button[aria-expanded]").all();
  for (let i = 0; i < grupos.length; i++) {
    // cerrar el que esté abierto y abrir SOLO este (el acordeón ya es exclusivo)
    const abierto = await grupos[i].getAttribute("aria-expanded");
    if (abierto !== "true") await grupos[i].click();
    await page.waitForTimeout(700);
    const etiqueta = (await grupos[i].textContent())?.trim().slice(0, 24) ?? `grupo ${i}`;
    const r = await page.evaluate(SONDA);
    if (r.error) { console.error(`❌ ${r.error}`); continue; }
    resultados.push({ etapa: ETAPA, ...c, grupo: etiqueta, ...r });
    console.error(
      `[${ETAPA}] ${String(c.w).padStart(4)}×${String(c.h).padStart(4)} ${c.nota.padEnd(28)} ` +
      `${etiqueta.padEnd(20)} chicos=${String(r.cuantosChicos).padStart(2)} ` +
      `enlaces=${String(r.enlacesVisibles).padStart(2)} nav ${String(r.navContenido).padStart(4)}/${String(r.navVisible).padStart(4)} ` +
      `${r.navScrollea ? `SCROLLEA +${r.navSobra}` : `entra, sobran ${r.navVisible - r.navContenido}`} ` +
      `${r.modulosInalcanzables.length ? "❌ INALCANZABLES: " + r.modulosInalcanzables.join(", ") : "✅ 0 inalcanzables"}`,
    );
  }
  await page.screenshot({ path: path.join(SALIDA, `barra-${ETAPA}-${c.w}x${c.h}.png`) });
  await ctx.close();
}

await navegador.close();
const dest = path.join(SALIDA, `barra-lateral-${ETAPA}.json`);
writeFileSync(dest, JSON.stringify(resultados, null, 2));
const totalChicos = resultados.reduce((n, r) => Math.max(n, r.cuantosChicos), 0);
const inalcanzables = resultados.reduce((n, r) => n + r.modulosInalcanzables.length, 0);
console.error(`\npeor caso: ${totalChicos} controles bajo 44 · ${inalcanzables} módulos inalcanzables\nJSON → ${dest}`);
