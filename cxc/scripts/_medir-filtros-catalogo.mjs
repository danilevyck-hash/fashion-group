// Medición REAL en navegador del SCROLL HORIZONTAL de la fila de filtros del
// catálogo, en las 3 marcas y en las 2 vistas (interna del vendedor y pública
// del cliente), build de producción y datos de producción.
//
// 🩸 POR QUÉ EXISTE. Daniel, textual (30-jul-2026): *"en todo lo del iphone
// donde haya data como los filtros en los catalogos y hay que hacer scroll,
// mejor arreglarlo de otra manera, un drop down"*. La fila de píldoras de
// género/categoría/oferta es un `overflow-x-auto`: en un iPhone de 390 px hay
// que ARRASTRARLA de lado para ver las opciones del final, y un filtro que no
// se ve no existe. Esto mide cuántos píxeles hay que arrastrar. Objetivo: 0.
//
// Qué se mide, por marca / vista / ancho:
//   · `arrastreFila`  = scrollWidth - clientWidth de la fila de filtros. Los px
//                       que el dedo tiene que recorrer. ESTE es el número.
//   · `arrastreCuerpo`= lo mismo en la página entera (nunca debe haber).
//   · `ocultos`       = opciones de filtro que arrancan FUERA de la fila visible.
//   · `chicos`        = controles de filtro con menos de 44 px de alto.
//
// GOTCHAS heredados (no tocar sin leer):
//   * Sembrar la cookie firmada (`cxc_session`) o la vista interna redirige al login.
//   * Sembrar sessionStorage (`cxc_role`): useAuth lo lee de AHÍ.
//   * `delete Navigator.prototype.serviceWorker` ANTES de navegar: bloquear el
//     SW de otra forma mata la hidratación y se mide una página sin hidratar.
//
// Solo lectura: no guarda, no borra, no envía nada.
//
//   ETAPA=antes node scripts/_medir-filtros-catalogo.mjs
//   ETAPA=despues SOLO=tommy node scripts/_medir-filtros-catalogo.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3166";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp";
const ETAPA = process.env.ETAPA ?? "antes";
const SOLO = process.env.SOLO ?? "";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// 1024 y 1180 están acá por el BORDE DE ARRIBA (30-jul-2026): al correr el
// corte de `md` a `lg`, 1023 es el último ancho con desplegables y 1024 el
// primero donde vuelven las píldoras. Medir solo 834 y 1440 habría dejado sin
// mirar justo el ancho donde el arreglo se puede romper. 1180 = iPad Pro 11"
// horizontal, el aparato real más ancho que cae del lado de las píldoras.
const TAMANOS = [
  { nombre: "390", width: 390, height: 844, movil: true },
  { nombre: "834", width: 834, height: 1194, movil: true },
  { nombre: "1024", width: 1024, height: 768, movil: true },
  { nombre: "1180", width: 1180, height: 820, movil: true },
  { nombre: "1440", width: 1440, height: 900, movil: false },
];

const MARCAS = ["reebok", "joybees", "tommy"];
const VISTAS = [
  { id: "interno", url: (m) => `/catalogo/${m}`, sesion: true },
  { id: "publico", url: (m) => `/catalogo-publico/${m}`, sesion: false },
];

// La sonda busca la fila de filtros por su ROL en la página, no por una clase:
// así el mismo script sirve para el "antes" (fila `overflow-x-auto`) y para el
// "después" (fila de desplegables), aunque el arreglo cambie el marcado.
const MEDIR = `(() => {
  const visible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    return cs.visibility !== "hidden" && cs.display !== "none";
  };
  // Zona de filtros = el bloque que contiene el buscador del catálogo.
  const buscador = [...document.querySelectorAll("input[placeholder]")]
    .find((i) => /buscar/i.test(i.placeholder) && visible(i));
  const zona = buscador ? buscador.closest("div.space-y-3") : null;
  if (!zona) return { encontrada: false };

  // Todo contenedor de la zona que pueda arrastrarse de lado.
  const arrastrables = [...zona.querySelectorAll("*")]
    .filter((el) => visible(el) && el.scrollWidth - el.clientWidth > 0)
    .map((el) => ({
      etiqueta: el.tagName + "." + String(el.className || "").slice(0, 60),
      arrastre: el.scrollWidth - el.clientWidth,
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
    }));

  // Controles de filtro visibles (píldoras, disparadores, selects).
  const controles = [...zona.querySelectorAll("button, select")].filter(visible);
  const cajaZona = zona.getBoundingClientRect();
  const ocultos = controles
    .filter((c) => {
      const r = c.getBoundingClientRect();
      return r.right > cajaZona.right + 1 || r.left < cajaZona.left - 1;
    })
    .map((c) => (c.textContent || c.tagName).replace(/\\s+/g, " ").trim().slice(0, 24));
  const chicos = controles
    .map((c) => ({
      txt: (c.textContent || c.tagName).replace(/\\s+/g, " ").trim().slice(0, 24),
      h: Math.round(c.getBoundingClientRect().height),
    }))
    .filter((x) => x.h < 44);

  return {
    encontrada: true,
    arrastreFila: arrastrables.reduce((m, a) => Math.max(m, a.arrastre), 0),
    arrastrables,
    arrastreCuerpo:
      document.documentElement.scrollWidth - document.documentElement.clientWidth,
    controles: controles.length,
    ocultos,
    chicos,
    altoZona: Math.round(cajaZona.height),
  };
})()`;

mkdirSync(SALIDA, { recursive: true });
const navegador = await chromium.launch();
const resultados = [];

for (const vista of VISTAS) {
  for (const marca of MARCAS) {
    const id = `${marca}-${vista.id}`;
    if (SOLO && !SOLO.split(",").some((s) => id.includes(s))) continue;
    for (const t of TAMANOS) {
      const ctx = await navegador.newContext({
        viewport: { width: t.width, height: t.height },
        deviceScaleFactor: 1,
        ...(t.movil ? { hasTouch: true, isMobile: false } : {}),
      });
      if (vista.sesion) {
        await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
      }
      await ctx.addInitScript(() => {
        delete Navigator.prototype.serviceWorker;
      });
      await ctx.addInitScript(() => {
        sessionStorage.setItem("cxc_role", "admin");
        sessionStorage.setItem("cxc_user", "daniel");
        sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
        sessionStorage.setItem("fg_is_owner", "1");
        // 🩸 `CatalogoAuthGuard` NO mira la cookie: exige "catalogos" dentro de
        // `fg_modules` en sessionStorage y si no está hace `router.push("/")`.
        // Sin esta línea las 3 marcas de la vista interna miden la pantalla de
        // login (pasó en la primera corrida del 30-jul-2026).
        sessionStorage.setItem("fg_modules", JSON.stringify(["catalogos"]));
      });

      const page = await ctx.newPage();
      const erroresJs = [];
      page.on("pageerror", (x) => erroresJs.push(String(x.message)));

      const r = { etapa: ETAPA, id, marca, vista: vista.id, tamano: t.nombre };
      try {
        await page.goto(`${BASE}${vista.url(marca)}`, {
          waitUntil: "networkidle",
          timeout: 90000,
        });
        // Esperar a que el catálogo haya cargado los productos (la fila de
        // filtros se dibuja recién con datos).
        await page
          .waitForSelector('input[placeholder*="uscar"]:visible', { timeout: 60000 })
          .catch(() => {});
        await page.waitForTimeout(3500);
        r.url = page.url();
        Object.assign(r, await page.evaluate(MEDIR));
        await page.screenshot({
          path: path.join(SALIDA, `filtros-${id}-${ETAPA}-${t.nombre}.png`),
        });
      } catch (err) {
        r.error = String(err.message ?? err).slice(0, 160);
      }
      r.erroresJs = erroresJs.slice(0, 3);
      resultados.push(r);
      console.error(
        `[${ETAPA}] ${id.padEnd(18)} @${t.nombre.padEnd(5)} → ` +
          (r.encontrada
            ? `arrastre fila ${String(r.arrastreFila).padStart(4)}px · cuerpo ${r.arrastreCuerpo}px · ` +
              `${r.controles} controles · ocultos ${r.ocultos.length} · <44px ${r.chicos.length} · alto ${r.altoZona}px`
            : `SIN MEDIR ${r.error ?? "no encontré la zona de filtros"}`),
      );
      await ctx.close();
    }
  }
}

await navegador.close();
writeFileSync(
  path.join(SALIDA, `filtros-catalogo-${ETAPA}.json`),
  JSON.stringify(resultados, null, 2),
);
console.error(`\nJSON en ${SALIDA}/filtros-catalogo-${ETAPA}.json`);
