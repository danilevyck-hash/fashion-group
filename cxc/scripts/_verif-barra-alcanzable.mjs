// ¿SE PUEDE LLEGAR A TODOS LOS MÓDULOS? La pregunta que importa después de
// agrandar las filas de la barra lateral.
//
// 🩸 POR QUÉ NO ALCANZA CON MIRAR SI "ENTRA". Cuando el nav scrollea, los
// módulos de abajo quedan fuera del recuadro visible — y eso está BIEN si se
// llega scrolleando. Un chequeo que solo mire el estado inicial no distingue
// "está más abajo" de "no se puede alcanzar", que es justo el bug que se barrió
// hoy en 12 pantallas. Acá se scrollea el nav hasta el fondo y se exige que
// CADA módulo del grupo abierto llegue a ser visible y tocable en ALGUNA
// posición: se compara contra la lista REAL de módulos del grupo, no contra los
// que se ven.
//
// La visibilidad se decide con `elementFromPoint` sobre el centro del enlace
// (no con su rect): un enlace recortado por el acordeón conserva su rect y
// pasaría un chequeo ingenuo.
//
// Solo lectura: abrir un grupo del acordeón es un toggle de UI. No se hace
// click en ningún módulo.
//
//   node scripts/_verif-barra-alcanzable.mjs

import { chromium } from "playwright";
import { readFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3178";
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();

// alto además de ancho: el alto es lo único que decide si el nav scrollea
const CASOS = [
  { w: 834, h: 1194, nota: "iPad vertical" },
  { w: 1024, h: 1194, nota: "iPad horizontal" },
  { w: 1440, h: 900, nota: "escritorio" },
  { w: 1440, h: 700, nota: "escritorio, ventana baja" },
  { w: 1440, h: 560, nota: "ventana MUY baja (peor caso)" },
];

const VISIBLES = `(() => {
  const seVe = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const cs = getComputedStyle(el);
    if (cs.visibility === "hidden" || cs.display === "none") return false;
    const x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > innerWidth || y > innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return Boolean(hit && (el === hit || el.contains(hit)));
  };
  const nav = document.querySelector("aside nav");
  return [...nav.querySelectorAll("a[href]")]
    .filter((a) => seVe(a) && a.getBoundingClientRect().height >= 44)
    .map((a) => (a.textContent || "").trim());
})()`;

const navegador = await chromium.launch();
let fallas = 0;

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

  const grupos = await page.locator("aside nav > div > button[aria-expanded]").all();
  for (let i = 0; i < grupos.length; i++) {
    if ((await grupos[i].getAttribute("aria-expanded")) !== "true") await grupos[i].click();
    await page.waitForTimeout(700);
    const etiqueta = (await grupos[i].textContent())?.trim().slice(0, 20) ?? `grupo ${i}`;

    // Lista ESPERADA: los módulos que el grupo abierto declara en el DOM,
    // se vean o no. Comparar contra "los que se ven" sería circular.
    const esperados = await page.evaluate(() => {
      const nav = document.querySelector("aside nav");
      const abierto = [...nav.querySelectorAll("div.grid")].find(
        (d) => getComputedStyle(d).gridTemplateRows !== "0px",
      );
      const propios = abierto ? [...abierto.querySelectorAll("a[href]")].map((a) => (a.textContent || "").trim()) : [];
      return ["Inicio", ...propios];
    });

    // Barrido: arriba del todo, y bajando de a media pantalla hasta el fondo.
    const alcanzados = new Set();
    const alto = await page.evaluate(() => document.querySelector("aside nav").clientHeight);
    const total = await page.evaluate(() => document.querySelector("aside nav").scrollHeight);
    for (let y = 0; y <= Math.max(0, total - alto) + alto; y += Math.floor(alto / 2)) {
      await page.evaluate((v) => { document.querySelector("aside nav").scrollTop = v; }, y);
      await page.waitForTimeout(150);
      for (const n of await page.evaluate(VISIBLES)) alcanzados.add(n);
    }

    const faltan = esperados.filter((e) => !alcanzados.has(e));
    // CONTROL DE VACÍO: sin módulos esperados no se comparó nada.
    const vacio = esperados.length <= 1;
    if (faltan.length || vacio) fallas++;
    console.error(
      `${faltan.length || vacio ? "❌" : "✅"} ${String(c.w).padStart(4)}×${String(c.h).padStart(4)} ` +
      `${c.nota.padEnd(28)} ${etiqueta.padEnd(20)} ` +
      `${String(esperados.length).padStart(2)} módulos · alcanzables con 44 px: ${String(esperados.length - faltan.length).padStart(2)}` +
      (vacio ? "  ⚠️ SIN MÓDULOS — no se comparó nada" : "") +
      (faltan.length ? `  ❌ NO SE ALCANZAN: ${faltan.join(", ")}` : ""),
    );
  }
  await ctx.close();
}

await navegador.close();
console.error(fallas === 0
  ? "\nTODOS LOS MÓDULOS SE ALCANZAN, y todos con 44 px de alto."
  : `\n${fallas} caso(s) con módulos fuera de alcance.`);
process.exit(fallas === 0 ? 0 : 1);
