// Medición de los 3 anchos (390 · 834 · 1440) del rediseño de Marketing por
// PROVEEDOR, y — lo que más importa — la verificación de que los números que se
// VEN en pantalla son los de producción.
//
// QUÉ MIDE, por pantalla y por ancho:
//   · arrastre  — px que hay que arrastrar para ver el resto (overflow auto/scroll)
//   · RECORTADO — px de datos que quedan fuera y NO se alcanzan ni arrastrando
//   · tap<44    — blancos táctiles por debajo de 44 px
//   · texto<12  — textos por debajo de 12 px
//
// Y ADEMÁS lee los montos del inicio y los compara contra los medidos contra la
// base el 11-ago-2026. Un 0 px de arrastre sobre una pantalla que perdió plata
// no sirve de nada.
//
// GOTCHAS heredados (no tocar sin leer):
//   · Sembrar la COOKIE de sesión firmada o TODO redirige al login.
//   · Sembrar sessionStorage (`cxc_role`, `fg_modules`): useAuth lee de AHÍ.
//   · `delete Navigator.prototype.serviceWorker` ANTES de navegar.
//
// Solo lectura: ningún escenario guarda, cierra un período ni envía nada.
//
//   BASE=http://localhost:3193 node scripts/_medir-marketing-proveedores.mjs

import { chromium } from "playwright";
import { readFileSync, mkdirSync, writeFileSync } from "fs";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3193";
const SALIDA = process.env.SALIDA ?? "/tmp/medir-marketing-proveedores";
const ANCHOS = (process.env.ANCHOS ?? "390,834,1440").split(",").map(Number);
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// Los números MEDIDOS contra producción el 11-ago-2026.
const ESPERADO = [
  "102,426.63", // titular
  "22,600.00",  // PVH facturas
  "70,225.00",  // PVH mobiliario
  "92,825.00",  // PVH total a reportar
  "1,540.00",   // Joybees
  "8,061.63",   // Multifashion
  "62,381.57",  // período cerrado "Gastos Tommy y Calvin"
  "71,765.00",  // mobiliario del módulo
];

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
    const item = { etiqueta: etiqueta(el), sobraPx: Math.round(sobra) };
    if (cs.overflowX === "auto" || cs.overflowX === "scroll") { arrastres.push(item); continue; }
    if (el.children.length > 0 && (el.querySelector("table") || sobra >= 100)) cortes.push(item);
  }
  arrastres.sort((a,b)=>b.sobraPx-a.sobraPx); cortes.sort((a,b)=>b.sobraPx-a.sobraPx);

  const chicos = [], chicosTexto = [];
  const sel = "button, a[href], [role=button], input:not([type=hidden]), select, textarea";
  for (const el of document.querySelectorAll(sel)) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.height >= 44 && r.width >= 44) continue;
    chicos.push({ etiqueta: (el.getAttribute("aria-label") || el.textContent || el.tagName).replace(/\\s+/g," ").trim().slice(0,34), w: Math.round(r.width), h: Math.round(r.height) });
  }
  for (const el of document.querySelectorAll("body *")) {
    if (el.children.length > 0 || !el.textContent?.trim() || !visible(el)) continue;
    const px = parseFloat(getComputedStyle(el).fontSize);
    if (px < 12) chicosTexto.push({ txt: el.textContent.trim().slice(0,28), px: Math.round(px*10)/10 });
  }
  chicos.sort((a,b)=>Math.min(a.w,a.h)-Math.min(b.w,b.h));

  const texto = document.body.innerText.replace(/\\s+/g, " ");
  return {
    arrastrePx: arrastres.length ? arrastres[0].sobraPx : 0,
    peorArrastre: arrastres[0] ?? null,
    cortadoPx: cortes.length ? cortes[0].sobraPx : 0,
    peorCorte: cortes[0] ?? null,
    cuerpoPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
    tapChicos: chicos.length,
    ejemplosTap: chicos.slice(0, 4),
    textoChico: chicosTexto.length,
    ejemplosTexto: chicosTexto.slice(0, 4),
    // Control de vacío: 0 px sobre una pantalla en blanco no prueba nada.
    textoLargo: texto.trim().length,
    // Señales de que lo NUEVO está en pantalla.
    diceMarketing: /Marketing/.test(texto),
    dicePVH: /PVH/.test(texto),
    diceReebok: /Reebok/.test(texto),
    diceJoybees: /Joybees/.test(texto),
    diceMultifashion: /Multifashion/.test(texto),
    dicePorCliente: /Por cliente/.test(texto),
    dicePorMarca: /Por marca/.test(texto),
    diceMobiliario: /Mobiliario/.test(texto),
    diceImpulsadoras: /Impulsadoras/.test(texto),
    diceCerrados: /Períodos cerrados|Periodos cerrados/.test(texto),
    diceTommyCalvin: /Gastos Tommy y Calvin/.test(texto),
    // Lo que YA NO puede estar.
    diceExportar: /Exportar/.test(texto),
    diceAnulados: /\\bAnulados\\b/.test(texto),
    // Los montos.
    montos: (texto.match(/\\$[\\d,]+\\.\\d{2}/g) || []),
  };
})()`;

const P = [
  { id: "inicio", titulo: "Marketing — inicio por proveedor", url: "/marketing", espera: 9000 },
  {
    id: "por-cliente",
    titulo: "Marketing — Por cliente",
    url: "/marketing",
    espera: 9000,
    async preparar(page) {
      const b = page.getByRole("button", { name: /Por cliente/i }).first();
      if (!(await b.count())) return false;
      await b.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return (await page.getByText(/Total/i).count()) > 0;
    },
  },
  {
    id: "por-marca",
    titulo: "Marketing — Por marca",
    url: "/marketing",
    espera: 9000,
    async preparar(page) {
      const b = page.getByRole("button", { name: /Por marca/i }).first();
      if (!(await b.count())) return false;
      await b.click({ timeout: 8000 }).catch(() => {});
      await page.waitForTimeout(1200);
      return true;
    },
  },
  {
    id: "proyectos-pvh",
    titulo: "Marketing — Ver proyectos de PVH",
    url: "/marketing?proveedor=pvh",
    espera: 9000,
  },
];

const run = async () => {
  mkdirSync(SALIDA, { recursive: true });
  const nav = await chromium.launch();
  const resultados = [];
  let fallos = 0;

  for (const ancho of ANCHOS) {
    const ctx = await nav.newContext({
      viewport: { width: ancho, height: 900 },
      deviceScaleFactor: 2,
    });
    await ctx.addCookies([
      { name: "cxc_session", value: COOKIE, domain: "localhost", path: "/" },
    ]);
    await ctx.addInitScript(() => {
      try { delete Navigator.prototype.serviceWorker; } catch {}
      sessionStorage.setItem("cxc_role", "admin");
      sessionStorage.setItem("fg_modules", JSON.stringify(["marketing"]));
    });

    for (const p of P) {
      const page = await ctx.newPage();
      await page.goto(BASE + p.url, { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(p.espera);
      let listo = true;
      if (p.preparar) listo = await p.preparar(page);
      await page.waitForTimeout(600);

      const m = await page.evaluate(SONDA);
      const archivo = path.join(SALIDA, `${p.id}-${ancho}.png`);
      await page.screenshot({ path: archivo, fullPage: true });
      await page.close();

      const fila = { ancho, ...p, ...m, listo, captura: archivo };
      delete fila.preparar;
      resultados.push(fila);

      const mal = [];
      if (m.cuerpoPx > 0) mal.push(`cuerpo ${m.cuerpoPx}px`);
      if (m.cortadoPx > 0) mal.push(`RECORTADO ${m.cortadoPx}px`);
      if (m.tapChicos > 0) mal.push(`${m.tapChicos} tap<44`);
      if (m.textoChico > 0) mal.push(`${m.textoChico} texto<12`);
      if (m.textoLargo < 200) mal.push("PANTALLA VACÍA");
      if (!listo) mal.push("no se pudo preparar");
      if (mal.length) fallos++;

      console.log(
        `  ${ancho.toString().padStart(4)}  ${p.id.padEnd(15)} arrastre ${String(m.arrastrePx).padStart(4)}px · recortado ${String(m.cortadoPx).padStart(4)}px · tap<44 ${String(m.tapChicos).padStart(2)} · texto<12 ${String(m.textoChico).padStart(2)}  ${mal.length ? "⚠️  " + mal.join(", ") : "✅"}`,
      );
      if (m.peorArrastre) console.log(`         peor arrastre: ${m.peorArrastre.etiqueta} (${m.peorArrastre.sobraPx}px)`);
      if (m.peorCorte) console.log(`         PEOR CORTE:    ${m.peorCorte.etiqueta} (${m.peorCorte.sobraPx}px)`);
      if (m.ejemplosTap?.length) console.log(`         tap chicos: ${m.ejemplosTap.map((x) => `${x.etiqueta} ${x.w}×${x.h}`).join(" | ")}`);
      if (m.ejemplosTexto?.length) console.log(`         texto chico: ${m.ejemplosTexto.map((x) => `"${x.txt}" ${x.px}px`).join(" | ")}`);
    }
    await ctx.close();
  }
  await nav.close();

  // ------------------------------------------------ los números en pantalla
  console.log("\n═══ LOS NÚMEROS QUE SE VEN, contra producción ═══");
  const inicios = resultados.filter((r) => r.id === "inicio");
  for (const r of inicios) {
    const faltan = ESPERADO.filter((e) => !r.montos.some((m) => m.includes(e)));
    const ok = faltan.length === 0;
    if (!ok) fallos++;
    console.log(`  ${ok ? "✅" : "❌"} ${r.ancho}px — ${ESPERADO.length - faltan.length}/${ESPERADO.length} montos${faltan.length ? " · FALTAN: " + faltan.join(", ") : ""}`);
  }

  console.log("\n═══ QUÉ SE VE Y QUÉ YA NO ═══");
  for (const r of inicios) {
    const debe = ["dicePVH", "diceReebok", "diceJoybees", "diceMultifashion", "dicePorCliente", "dicePorMarca", "diceMobiliario", "diceImpulsadoras", "diceCerrados", "diceTommyCalvin"];
    const noDebe = ["diceExportar", "diceAnulados"];
    const faltan = debe.filter((k) => !r[k]);
    const sobran = noDebe.filter((k) => r[k]);
    if (faltan.length || sobran.length) fallos++;
    console.log(`  ${faltan.length || sobran.length ? "❌" : "✅"} ${r.ancho}px${faltan.length ? " · FALTA " + faltan.join(",") : ""}${sobran.length ? " · TODAVÍA APARECE " + sobran.join(",") : ""}`);
  }

  writeFileSync(path.join(SALIDA, "medicion.json"), JSON.stringify(resultados, null, 2));
  console.log(`\n  Capturas y JSON en ${SALIDA}`);
  console.log(fallos === 0 ? "\n🟢 3 ANCHOS LIMPIOS Y LOS NÚMEROS SON LOS DE PRODUCCIÓN" : `\n🔴 ${fallos} hallazgos`);
  process.exit(fallos === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
