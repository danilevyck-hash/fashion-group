// ─────────────────────────────────────────────────────────────────────────────
// Resumen SEMANAL de fotos faltantes — cálculo server-side.
//
// Cuenta por marca (Reebok / Joybees / Tommy) los productos VISIBLES
// (active=true) sin foto (image_url null o vacío) y arma el mensaje de Telegram
// (buildResumenSemanalMsg). Solo lee las DBs de los catálogos — CERO Switch,
// sin lock. Lo usan el cron /api/cron/catalogos-fotos-resumen y su colateral
// de recuperación en switch-reconciliacion (guard "solo lunes").
//
// Tommy tolerante a DDL pendiente (migración 20260724150000): si tommy_products
// no existe aún, la marca se reporta "pendiente de activación" sin fallar
// (reúsa el probe tommyDdlPendiente de sync-catalogo-tommy, #260).
// ─────────────────────────────────────────────────────────────────────────────

import { MARCAS_CONFIG, type MarcaKey } from "@/lib/catalogo/marcas";
import { tommyDdlPendiente } from "@/lib/switch-api/sync-catalogo-tommy";
import { calvinDdlPendiente } from "@/lib/switch-api/sync-catalogo-calvin";
import {
  buildResumenSemanalMsg,
  tieneFotoProducto,
  type ResumenFotosMarca,
} from "@/lib/catalogos/fotos-faltantes";

/** Orden fijo del resumen (el mismo del hub de catálogos). */
const MARCAS_RESUMEN: MarcaKey[] = ["reebok", "joybees", "tommy", "calvin"];

export interface FotosResumenResult {
  marcas: ResumenFotosMarca[];
  /** `null` = no hay nada que avisar. Ver `buildResumenSemanalMsg`: no existe
   *  un mensaje de "todos los catálogos están al día". */
  mensaje: string | null;
  totalSinFoto: number;
}

/**
 * Códigos visibles sin foto de una marca, ordenados por disponibilidad desc
 * (lo más vendible primero — las 3 tablas tienen la columna, la escribe el
 * motor de sync). Lanza si la query falla (el caller decide alertar).
 */
async function codigosSinFotoDe(marca: MarcaKey): Promise<string[]> {
  const cfg = MARCAS_CONFIG[marca];
  // Client canónico de ESCRITURA de products por marca (service-role del
  // proyecto donde vive la tabla) — el de lectura de Reebok es anon y podría
  // quedar corto por RLS en un cron sin sesión.
  const db = await cfg.products.writeDb();
  const { data, error } = await db
    .from(cfg.productsTable)
    .select("sku, image_url")
    .eq("active", true)
    .order("disponibilidad", { ascending: false, nullsFirst: false });
  if (error) throw new Error(`leer ${cfg.productsTable}: ${error.message}`);
  return (data ?? [])
    .filter((p) => !tieneFotoProducto(p as { image_url: string | null }))
    .map((p) => String((p as { sku: string | null }).sku ?? ""))
    .filter(Boolean);
}

/** Calcula el resumen semanal de fotos de las 3 marcas. Lanza si una query
 *  falla (salvo Tommy pendiente de DDL, que se reporta sin fallar). */
export async function calcularFotosResumen(): Promise<FotosResumenResult> {
  const marcas: ResumenFotosMarca[] = [];
  for (const marca of MARCAS_RESUMEN) {
    const l = MARCAS_CONFIG[marca].label;
    const label = l === "Tommy Hilfiger" ? "Tommy" : l === "Calvin Klein" ? "Calvin" : l;
    if (marca === "tommy" && (await tommyDdlPendiente())) {
      marcas.push({ label, codigos: [], pendiente: true });
      continue;
    }
    if (marca === "calvin" && (await calvinDdlPendiente())) {
      marcas.push({ label, codigos: [], pendiente: true });
      continue;
    }
    marcas.push({ label, codigos: await codigosSinFotoDe(marca) });
  }
  return {
    marcas,
    mensaje: buildResumenSemanalMsg(marcas),
    totalSinFoto: marcas.reduce((s, m) => s + m.codigos.length, 0),
  };
}
