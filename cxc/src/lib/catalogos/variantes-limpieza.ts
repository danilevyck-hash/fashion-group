// ─────────────────────────────────────────────────────────────────────────────
// Housekeeping de variantes — ejecución (el criterio puro está en
// variantes-housekeeping.ts, con la justificación completa).
//
// Corre pegado al resumen SEMANAL de fotos (cron catalogos-fotos-resumen).
// TOLERANTE A FALLOS por diseño: cualquier problema leyendo o borrando se
// cuenta y se sigue — un borrado fallido NUNCA debe tumbar el resumen, que es
// la función principal de ese cron. Idempotente: si no hay nada retirado, no
// hace nada y no ensucia el mensaje.
// ─────────────────────────────────────────────────────────────────────────────

import { MARCAS_CONFIG, type MarcaKey } from "@/lib/catalogo/marcas";
import { variantesRoot, type StorageMarcaKey } from "./variantes-paths";
import {
  medirCarpetasVariantes,
  borrarCarpetaVariantes,
  storageDbDe,
} from "./variantes-server";
import { planHousekeeping, type ResumenHousekeeping } from "./variantes-housekeeping";

const MARCAS: MarcaKey[] = ["reebok", "joybees", "tommy", "calvin"];

/** Borra las carpetas `_v/{sku}/` de SKUs que ya no existen en la tabla. */
export async function limpiarVariantesRetiradas(): Promise<ResumenHousekeeping> {
  const total: ResumenHousekeeping = { productos: 0, bytes: 0, fallos: 0 };

  for (const marca of MARCAS) {
    const cfg = MARCAS_CONFIG[marca];
    try {
      const carpetas = await medirCarpetasVariantes(cfg);
      if (carpetas.length === 0) continue;

      // TODAS las filas de la marca (activas e inactivas): un producto agotado
      // u oculto sigue vivo y sus fotos NO se tocan.
      const db = await cfg.products.writeDb();
      const { data, error } = await db.from(cfg.productsTable).select("sku");
      if (error) {
        total.fallos++;
        continue;
      }
      const skusVivos = (data ?? [])
        .map((r) => String((r as { sku: string | null }).sku ?? ""))
        .filter(Boolean);

      const plan = planHousekeeping(carpetas, skusVivos);
      if (plan.abortado || plan.aBorrar.length === 0) continue;

      const storage = await storageDbDe(cfg);
      const root = variantesRoot(marca as StorageMarcaKey);
      for (const carpeta of plan.aBorrar) {
        try {
          const bytes = await borrarCarpetaVariantes(storage, `${root}/${carpeta.skuStorage}`);
          total.productos++;
          total.bytes += bytes || carpeta.bytes;
        } catch {
          total.fallos++;
        }
      }
    } catch {
      // Marca ilegible (DDL pendiente, Storage caído) → se cuenta y se sigue.
      total.fallos++;
    }
  }

  return total;
}
