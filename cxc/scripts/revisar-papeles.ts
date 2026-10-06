// ─────────────────────────────────────────────────────────────────────────────
// REVISAR TODOS LOS PAPELES DE UN VISTAZO (6-oct-2026).
//
//   npx tsx scripts/revisar-papeles.ts [carpeta]
//
// Genera TODOS los PDF y Excel del sistema con datos de ejemplo
// (`src/lib/papeles-qa/catalogo.ts`; no toca la base), y:
//   a) acusa textos encimados o fuera de la hoja, y Excel con totales fijos o «#»;
//   b) arma una galería: la hoja 1 de cada PDF en PNG, en `index.html`.
// Sale con código 1 si encontró algo. La parte (a) también corre en CI
// (`src/__tests__/lib/papeles-sin-encimar.test.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

// 🔴 Sin base: algún módulo arma el cliente de Supabase al importarse. Se le da
// una dirección que no existe para que nada pueda llegar a producción.
process.env.SUPABASE_URL = "http://127.0.0.1:9";
process.env.SUPABASE_SERVICE_ROLE_KEY = "sin-base";
process.env.NEXT_PUBLIC_SUPABASE_URL = "http://127.0.0.1:9";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sin-base";
process.env.SESSION_SECRET ??= "revisar-papeles";

const carpeta = path.resolve(process.argv[2] ?? "papeles-revision");
mkdirSync(carpeta, { recursive: true });

const archivo = (nombre: string) => nombre.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^\w]+/g, "-").replace(/^-|-$/g, "").toLowerCase();
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function hojaUnoEnPng(bytes: Uint8Array): Promise<Buffer> {
  const { abrirPdf } = await import("../src/lib/papeles-qa/revisar");
  const doc = await abrirPdf(bytes);
  const page = await doc.getPage(1);
  const vista = page.getViewport({ scale: 2 });
  const { canvas, context } = doc.canvasFactory.create(Math.ceil(vista.width), Math.ceil(vista.height));
  context.fillStyle = "#fff";
  context.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: context, viewport: vista, canvas }).promise;
  return canvas.toBuffer("image/png");
}

async function main() {
  const { PAPELES } = await import("../src/lib/papeles-qa/catalogo");
  const { revisarExcel, revisarPdf } = await import("../src/lib/papeles-qa/revisar");
  const tarjetas: string[] = [];
  let malos = 0;
  for (const p of PAPELES) {
    const base = archivo(p.nombre);
    const bytes = await p.generar();
    writeFileSync(path.join(carpeta, `${base}.${p.tipo}`), bytes);
    const problemas = p.tipo === "pdf"
      ? (await revisarPdf(bytes.slice())).map((x) => `hoja ${x.pagina} · ${x.tipo}: ${x.detalle}`)
      : revisarExcel(bytes);
    if (problemas.length) malos++;
    console.log(`${problemas.length ? "✗" : "✓"} ${p.nombre}${problemas.length ? `\n    ${problemas.join("\n    ")}` : ""}`);
    let img = "";
    if (p.tipo === "pdf") {
      writeFileSync(path.join(carpeta, `${base}.png`), await hojaUnoEnPng(bytes.slice()));
      img = `<a href="${base}.pdf"><img src="${base}.png" alt="${esc(p.nombre)}"></a>`;
    } else {
      img = `<a class="xlsx" href="${base}.xlsx">Abrir Excel</a>`;
    }
    const estado = problemas.length
      ? `<ul class="mal">${problemas.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>`
      : `<p class="bien">Sin problemas</p>`;
    tarjetas.push(`<figure>${img}<figcaption><b>${esc(p.nombre)}</b>${estado}</figcaption></figure>`);
  }
  writeFileSync(
    path.join(carpeta, "index.html"),
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Papeles del sistema</title>
<style>body{font:14px -apple-system,system-ui,sans-serif;background:#f9fafb;color:#111827;margin:0;padding:24px}
h1{font-size:20px;margin:0 0 16px}main{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:16px}
figure{margin:0;background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:12px}img{width:100%;border:1px solid #e5e7eb;display:block}
.xlsx{display:block;padding:40px 0;text-align:center;background:#f3f4f6;border-radius:8px;color:#2563eb;text-decoration:none}
figcaption{margin-top:8px}.bien{color:#047857;margin:4px 0 0}.mal{color:#b91c1c;margin:4px 0 0;padding-left:18px}</style>
<h1>Papeles del sistema · ${PAPELES.length} archivos · ${malos ? `${malos} con problemas` : "todos bien"}</h1><main>${tarjetas.join("\n")}</main>`,
  );
  console.log(`\nGalería: ${path.join(carpeta, "index.html")}`);
  process.exit(malos ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
