/**
 * SOLO LECTURA — la NOTA DE ENTREGA de una entrega SIN PANELES.
 *
 * Paneles dejó de ser obligatorio (23-ago-2026), así que ahora existe un papel
 * que antes era imposible: el de una entrega de puras barras y colgadores.
 * ⚠️ **En producción no hay ninguna todavía** (las 23 que hay traen paneles —
 * la huella del kit auto-rellenable que se eliminó el 12-ago), así que el caso
 * se verifica igual que se verificó el banco de fotos: sirviéndole al
 * generador la forma EXACTA que tendría, sacada de una entrega REAL por la
 * puerta real (`cargarComprobante`) y quitándole el renglón de paneles.
 * No se inventan datos: se quita uno.
 *
 * NO ESCRIBE NADA. El PDF se guarda en /tmp para leerlo con pdftotext.
 *
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_verif-nota-entrega-sin-paneles.ts
 */
import { writeFileSync } from "fs";
import { listAllEntregas } from "@/lib/marketing/inventario";
import { cargarComprobante } from "@/lib/marketing/entrega-comprobante";
import { buildComprobanteEntregaPdf } from "@/lib/marketing/pdf-entrega-mueble";

const esPanel = (s: string) => s.toLowerCase().includes("panel");

async function main() {
  // Una entrega real con paneles Y accesorios (para que al sacar los paneles
  // quede algo). Se elige la primera que cumpla, sin escribirle nada.
  const entregas = await listAllEntregas();
  let datos = null;
  for (const e of entregas) {
    const d = await cargarComprobante(e.id);
    if (!d) continue;
    if (d.items.some((i) => esPanel(i.articulo)) &&
        d.items.some((i) => !esPanel(i.articulo))) {
      datos = d;
      break;
    }
  }
  if (!datos) throw new Error("no hay entrega con paneles + accesorios");

  const sinPaneles = datos.items.filter((i) => !esPanel(i.articulo));
  const total = sinPaneles.reduce((s, i) => s + i.cantidad * i.precioUnitario, 0);

  // Caso A: sin paneles, con bultos anotados. Caso B: sin paneles y sin bultos
  // (la celda tiene que quedar VACÍA, nunca 0).
  const conBultos = buildComprobanteEntregaPdf({
    ...datos,
    items: sinPaneles.map((i, n) => ({ ...i, bultos: n + 1 })),
    total: Math.round(total * 100) / 100,
    porMarca: datos.porMarca.map((m, i) =>
      i === 0 ? { ...m, monto: Math.round(total * 100) / 100 } : { ...m, monto: 0 },
    ),
  });
  const sinBultos = buildComprobanteEntregaPdf({
    ...datos,
    items: sinPaneles.map((i) => ({ ...i, bultos: null })),
    total: Math.round(total * 100) / 100,
  });

  writeFileSync("/tmp/nota-sin-paneles.pdf", conBultos);
  writeFileSync("/tmp/nota-sin-paneles-sin-bultos.pdf", sinBultos);

  console.log(`entrega base      ${datos.entregaId}`);
  console.log(`cliente           ${datos.cliente}`);
  console.log(`renglones ORIG    ${datos.items.map((i) => `${i.articulo}=${i.cantidad}`).join(", ")}`);
  console.log(`renglones SIN PAN ${sinPaneles.map((i) => `${i.articulo}=${i.cantidad}`).join(", ")}`);
  console.log(`total recalculado ${total.toFixed(2)}`);
  console.log(`PDF con bultos    /tmp/nota-sin-paneles.pdf (${(conBultos.byteLength / 1024).toFixed(1)} KB)`);
  console.log(`PDF sin bultos    /tmp/nota-sin-paneles-sin-bultos.pdf (${(sinBultos.byteLength / 1024).toFixed(1)} KB)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
