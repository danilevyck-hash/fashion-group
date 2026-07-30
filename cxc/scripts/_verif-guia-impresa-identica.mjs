// EL PAPEL TIENE QUE SALIR IDÉNTICO. Este script lo prueba con el PDF de verdad.
//
// ── 🩸 POR QUÉ EXISTE ────────────────────────────────────────────────────────
//
// La vista previa de la guía se achica en celular (`transform: scale`) para que
// la hoja entre entera. La escala es SOLO de pantalla, pero hay una trampa que
// puede filtrarla al papel y no se ve mirando:
//
//   `globals.css` deja `#print-document { position: absolute; left:0; top:0 }`
//   dentro de `@media print`. **Un ancestro con `transform` distinto de `none`
//   crea un bloque contenedor para los descendientes `position: absolute`.** Si
//   la escala sobrevive al print, el documento se posiciona y se dimensiona
//   contra el marco escalado y la guía sale chica o cortada en el papel.
//
// La regla de la casa es no dar por buena una impresión sin ABRIR el archivo
// (el print de Comisiones pasó dos rondas de "verificado" sobre un harness y en
// la app real salía mal). Así que esto no mira la vista previa: genera el PDF
// con el Chrome real y lo mide con `pdfinfo` y `pdftotext`.
//
// Qué compara, antes contra después:
//   · páginas, ancho y alto de página (pdfinfo)
//   · el TEXTO completo del PDF (pdftotext) — si la tabla se cortara o algo se
//     saliera de la hoja, el texto cambiaría
//
// GOTCHAS de medición (heredados): sembrar la cookie firmada + sessionStorage
// (`cxc_role`) o todo redirige al login, y `delete Navigator.prototype
// .serviceWorker` antes de navegar.
//
// Solo lectura: abre la guía y genera un PDF. No guarda ni imprime nada real.
//
//   ETAPA=antes   node scripts/_verif-guia-impresa-identica.mjs
//   ETAPA=despues node scripts/_verif-guia-impresa-identica.mjs
//   node scripts/_verif-guia-impresa-identica.mjs --comparar

import { chromium } from "playwright";
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { execSync } from "child_process";
import path from "path";

const BASE = process.env.BASE ?? "http://localhost:3180";
const SALIDA = process.env.SALIDA ?? "/Users/daniellevy/.claude/jobs/5b66fe8c/tmp/guia80";
const ETAPA = process.env.ETAPA ?? "antes";
const ID_GUIA = process.env.ID_GUIA ?? "4048a77f-c1b3-4cf8-853d-e27323f096cd";

const norm = (s) => s.replace(/\r/g, "").replace(/[ \t]+/g, " ").replace(/\n{2,}/g, "\n").trim();

if (process.argv.includes("--comparar")) {
  const a = JSON.parse(readFileSync(path.join(SALIDA, "pdf-antes.json"), "utf8"));
  const d = JSON.parse(readFileSync(path.join(SALIDA, "pdf-despues.json"), "utf8"));
  let fallas = 0;
  const cmp = (campo, x, y) => {
    const ok = String(x) === String(y);
    if (!ok) fallas++;
    console.log(`  ${ok ? "✅" : "⛔"} ${campo.padEnd(22)} ${x}${ok ? "" : `   →   ${y}  ⛔ CAMBIÓ`}`);
  };
  console.log("EL PAPEL, antes vs después");
  for (const k of ["paginas", "anchoPt", "altoPt", "tamanoPagina"]) cmp(k, a[k], d[k]);
  const igualTexto = norm(a.texto) === norm(d.texto);
  if (!igualTexto) fallas++;
  console.log(`  ${igualTexto ? "✅" : "⛔"} ${"texto del PDF".padEnd(22)} ${a.texto.length} car.${igualTexto ? " idéntico" : ` vs ${d.texto.length} ⛔ CAMBIÓ`}`);
  if (!igualTexto) {
    const la = norm(a.texto).split("\n"), ld = norm(d.texto).split("\n");
    for (let i = 0; i < Math.max(la.length, ld.length); i++) {
      if (la[i] !== ld[i]) { console.log(`     línea ${i + 1}:\n       antes:   ${JSON.stringify(la[i])}\n       después: ${JSON.stringify(ld[i])}`); break; }
    }
  }
  console.log(fallas ? `\n⛔ EL PAPEL CAMBIÓ (${fallas})` : "\n✅ EL PAPEL SALE IDÉNTICO");
  process.exit(fallas ? 1 : 0);
}

mkdirSync(SALIDA, { recursive: true });
const COOKIE = readFileSync("/tmp/fg-cookie.txt", "utf8").trim();
const navegador = await chromium.launch();
const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
await ctx.addCookies([{ name: "cxc_session", value: COOKIE, url: BASE }]);
await ctx.addInitScript(() => { delete Navigator.prototype.serviceWorker; });
await ctx.addInitScript(() => {
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_id", "10948974-05bb-4e58-b708-a450cfd45d6c");
  sessionStorage.setItem("fg_is_owner", "1");
});
const page = await ctx.newPage();
await page.goto(`${BASE}/guias/${ID_GUIA}/imprimir`, { waitUntil: "domcontentloaded", timeout: 90000 });
await page.waitForSelector("#print-document", { timeout: 60000 });
await page.waitForTimeout(2500);

// 🩸 A PROPÓSITO desde un viewport de 390: es el ancho donde la vista previa
// está ESCALADA. Si la escala se filtrara al papel, se vería justo acá.
const pdf = path.join(SALIDA, `guia-${ETAPA}.pdf`);
await page.pdf({ path: pdf, preferCSSPageSize: true, printBackground: true });
await navegador.close();

const info = execSync(`pdfinfo ${JSON.stringify(pdf)}`, { encoding: "utf8" });
const texto = execSync(`pdftotext ${JSON.stringify(pdf)} -`, { encoding: "utf8" });
const campo = (re) => (info.match(re)?.[1] ?? "").trim();
const medidas = campo(/Page size:\s*(.+)/);
const [, ancho, alto] = medidas.match(/([\d.]+)\s*x\s*([\d.]+)/) ?? [];

const r = {
  etapa: ETAPA,
  paginas: campo(/Pages:\s*(\d+)/),
  anchoPt: ancho, altoPt: alto,
  tamanoPagina: medidas,
  texto,
};
writeFileSync(path.join(SALIDA, `pdf-${ETAPA}.json`), JSON.stringify(r, null, 2));
console.log(`[${ETAPA}] páginas=${r.paginas}  hoja=${r.tamanoPagina}  texto=${texto.length} car.`);
console.log(`   → ${pdf}`);
