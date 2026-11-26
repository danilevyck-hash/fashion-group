// Prueba LOCAL del paso 1 + lectura del paso 2 para UN cliente, sin mandar nada
// al cliente: Switch manda sus PDF al buzón intermedio (info@) y se verifica que
// se encuentran, se bajan y que el código impreso es el del cliente.
// Uso: npx tsx -r dotenv/config scripts/_prueba-pdf-switch-d24.ts D-24   (DOTENV_CONFIG_PATH=.env.local)
import { CXC_GRUPO_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { leerPdfSwitch, pdfEsDelCliente } from "@/lib/cxc/estado-cuenta-pdf-switch";
import { asegurarPdfs, bajarPdf, clientesDelLunes, idsDeSwitch, llavePar, tokenDelBuzon } from "@/lib/cxc/estado-cuenta-pdf-switch-io";

async function main() {
const codigo = process.argv[2] ?? "D-24";
const t0 = Date.now();
const [c] = await clientesDelLunes([codigo]);
if (!c) throw new Error(`${codigo} no está en el envío`);
const ids = await idsDeSwitch([codigo], CXC_GRUPO_EMPRESA_KEYS);
const pares = c.empresas.map((e) => ({ empresa: e, id: ids.get(`${e}:${codigo}`)! }));
console.log(codigo, c.nombre, "correos:", c.correos, "pares:", pares);
const token = await tokenDelBuzon();
const r = await asegurarPdfs({
  token,
  pares,
  desde: new Date(Date.now() - 10_000).toISOString().replace(/\.\d+Z$/, "Z"),
  hasta: Date.now() + 300_000,
  esperaMs: 120_000,
});
console.log("pedidos", r.pedidos, "faltan", r.faltan, "fallos", r.fallos, `${((Date.now() - t0) / 1000).toFixed(0)} s`);
for (const p of pares) {
  const pdf = r.indice.get(llavePar(p.empresa, p.id));
  if (!pdf) continue;
  const l = leerPdfSwitch(await bajarPdf(token, pdf));
  console.log(p.empresa, l, pdfEsDelCliente(l, codigo) ? "ES DEL CLIENTE" : "NO ES DEL CLIENTE");
}
}
main().catch((e) => { console.error(e); process.exit(1); });
