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
import { leerTodoPaginado } from "@/lib/supabase-paginado";
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
 *
 * PAGINADO (12-ago-2026). Esta lectura no paginaba: hoy la marca más grande es
 * Tommy con 453 activos, pero a partir de la fila 1.001 PostgREST cortaría en
 * seco —sin error y sin señal— y el aviso semanal diría "faltan N fotos"
 * quedándose corto. Un aviso que subestima es peor que no tenerlo. Es el mismo
 * bug de `db-max-rows` que este repo ya pagó en recibos y en CXC.
 *
 * EL ORDEN DE NEGOCIO SE CONSERVA: sigue mandando `disponibilidad` desc (lo más
 * vendible primero, que es lo que se lee en el Telegram). Sólo se le agrega
 * `sku` como DESEMPATE — es `text UNIQUE NOT NULL` en las cuatro tablas, así
 * que el orden queda total y la paginación no puede repetir ni saltear filas
 * entre páginas.
 */
async function codigosSinFotoDe(marca: MarcaKey): Promise<string[]> {
  const cfg = MARCAS_CONFIG[marca];
  // Client canónico de ESCRITURA de products por marca (service-role del
  // proyecto donde vive la tabla) — el de lectura de Reebok es anon y podría
  // quedar corto por RLS en un cron sin sesión.
  const db = await cfg.products.writeDb();
  const filas = await leerTodoPaginado<{ sku: string | null; image_url: string | null }>(
    `leer ${cfg.productsTable}`,
    (pedirCount, desde, hasta) =>
      db
        .from(cfg.productsTable)
        .select("sku, image_url", pedirCount ? { count: "exact" } : {})
        .eq("active", true)
        .order("disponibilidad", { ascending: false, nullsFirst: false })
        .order("sku", { ascending: true })
        .range(desde, hasta),
  );
  return filas
    .filter((p) => !tieneFotoProducto(p))
    .map((p) => String(p.sku ?? ""))
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
