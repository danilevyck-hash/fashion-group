/**
 * SOLO LECTURA — ¿cuántas entregas de muebles de producción llevan paneles?
 *
 * 🔴 Lee POR LA MISMA PUERTA QUE LA PANTALLA: `listAllEntregas()` de
 * `src/lib/marketing/inventario.ts` (el mismo que sirve
 * GET /api/marketing/inventario/entregas) y `listProductos()`. Nada de
 * `select` crudo: si mañana esa lectura gana un filtro, esta medición lo
 * hereda sola.
 *
 * La categoría "paneles" se decide con la MISMA regla del formulario
 * (nombre del producto que contiene "panel"), no con una lista escrita a mano.
 *
 * Uso:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config \
 *     scripts/_medir-entregas-sin-paneles.ts
 */
import { listAllEntregas, listProductos } from "../src/lib/marketing/inventario";
import { piezasParaStock } from "../src/lib/marketing/piezas-bultos";

function esPanel(nombre: string): boolean {
  return nombre.toLowerCase().includes("panel");
}

async function main() {
  const [entregas, productos] = await Promise.all([
    listAllEntregas(),
    listProductos(),
  ]);
  const nombreDe = new Map(productos.map((p) => [p.id, p.nombre]));

  let conPaneles = 0;
  let sinPaneles = 0;
  let enCero = 0;
  const detalleSinPaneles: string[] = [];
  const detalleCero: string[] = [];

  for (const e of entregas) {
    let piezasTotales = 0;
    let piezasPaneles = 0;
    for (const it of e.items ?? []) {
      // Piezas del renglón por la MISMA función que descuenta el stock.
      const piezas = piezasParaStock({
        piezas: (it.reparto ?? []).reduce(
          (s, r) => s + Number(r.cantidad ?? 0),
          0,
        ),
        bultos: it.bultos,
      });
      piezasTotales += piezas;
      const nombre = nombreDe.get(it.producto_id) ?? "(producto borrado)";
      if (esPanel(nombre)) piezasPaneles += piezas;
    }
    if (piezasTotales === 0) {
      enCero++;
      detalleCero.push(`${e.id} · ${e.created_at?.slice(0, 10)}`);
    }
    if (piezasPaneles > 0) conPaneles++;
    else {
      sinPaneles++;
      detalleSinPaneles.push(
        `${e.id.slice(0, 8)} · ${e.created_at?.slice(0, 10)} · ${piezasTotales} piezas · ${(e.items ?? []).length} renglones`,
      );
    }
  }

  console.log(`Entregas totales (por listAllEntregas): ${entregas.length}`);
  console.log(`  CON paneles (>0 piezas de panel): ${conPaneles}`);
  console.log(`  SIN paneles:                      ${sinPaneles}`);
  console.log(`  En CERO piezas totales:           ${enCero}`);
  if (detalleSinPaneles.length) {
    console.log("\nSIN paneles, una por línea:");
    for (const d of detalleSinPaneles) console.log("  " + d);
  }
  if (detalleCero.length) {
    console.log("\nEn CERO piezas:");
    for (const d of detalleCero) console.log("  " + d);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
