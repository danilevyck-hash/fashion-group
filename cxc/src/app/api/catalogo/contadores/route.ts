// ─────────────────────────────────────────────────────────────────────────────
// LOS OCHO NÚMEROS DEL HUB, EN UNA SOLA RESPUESTA DE MENOS DE 1 KB (14-sep-2026)
//
// 🩸 Para escribir «182 productos a la venta · 12 sin foto» en cuatro tarjetas,
// `/catalogos/marcas` bajaba el CATÁLOGO ENTERO de las cuatro marcas más el
// inventario por talla de Reebok: **462,8 KB medidos** contra producción, y
// **24.384 ms de p95** en Sentry. Nombre, precio, color, descripción y fechas
// viajaban para tirarse después de contar.
//
// Daniel, textual (14-sep-2026): *«5. ok va»*.
//
// 🔴 DOS CAMINOS, UNA SOLA REGLA.
//
//   «base»  — la función `catalogos_contadores_hub()`, cuyo SQL se GENERA desde
//             `lib/catalogo/contadores.ts` cláusula por cláusula de
//             `estaALaVenta`. Es el camino normal.
//   «filas» — lee las filas y cuenta con `contarDeFilas`, que ES
//             `productosALaVenta`. Es el respaldo.
//
// 🔴 FALLA ABIERTA: mientras la migración `20261214120000` no se aplique, la
// función no existe y se toma el camino «filas». El hub se ve EXACTAMENTE igual
// y el navegador igual recibe menos de 1 KB. Ninguna pantalla en blanco.
//
// ⚠️ ESTA RUTA NO REEMPLAZA A NINGUNA. `/api/catalogo/[marca]/products` y
// `/api/catalogo/reebok/inventory` no cambiaron ni de forma ni de permisos: los
// usan el catálogo del vendedor y la pantalla de administrar.
//
// `fuente` viaja en la respuesta para que `scripts/_verif-contadores-hub.ts`
// pueda comprobar que los dos caminos dicen lo mismo contra producción.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 DOS COSAS EN UNA SOLA RESPUESTA (22-sep-2026): los contadores y el PULSO
// de cada marca (cuántos comprobantes van, cuánto suman, hace cuánto el
// último). Son dos funciones de la base —la de contar está pegada byte a byte a
// `estaALaVenta`, y mezclarle una pregunta de negocio ensuciaría esa unión— y
// se piden en PARALELO. La respuesta sigue pesando menos de 1 KB.
//
// 🔴 EL PULSO FALLA ABIERTO POR SEPARADO: si no se puede leer, la tarjeta se
// dibuja sin esa línea. Nunca deja al hub sin contadores.
//
// ⚠️ EL «HOY» ES EL DE PANAMÁ (`hoyPanama`), nunca el del servidor —que corre
// en UTC— ni el del navegador. Los días se cuentan acá, una sola vez, con la
// misma función para los dos caminos.
// ─────────────────────────────────────────────────────────────────────────────

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { catalogoRoles } from "@/lib/catalogo/roles";
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { RPC_CONTADORES, RPC_PULSO } from "@/lib/catalogo/contadores-migracion";
import {
  MARCAS_DEL_HUB,
  columnasParaContar,
  contarDeFilas,
  tablaDePedidos,
  type ContadoresDelHub,
  type FilaContada,
  type MarcaContada,
} from "@/lib/catalogo/contadores";
import {
  DIAS_PULSO,
  diasEntre,
  resumirPulso,
  type FilaDeComprobante,
  type PulsoDelHub,
  type PulsoMarca,
} from "@/lib/catalogo/pulso-pedidos";
import { hoyPanama } from "@/lib/fecha-panama";

export const dynamic = "force-dynamic";
// Igual que el resto del módulo: el contador tiene que reflejar al instante el
// sync y el toggle «Ocultar del catálogo».
export const fetchCache = "force-no-store";

interface FilaRpc {
  marca: string;
  a_la_venta: number | string;
  sin_foto: number | string;
  tarjetas: number | string | null;
  tarjetas_sin_foto: number | string | null;
}

interface FilaPulsoRpc {
  marca: string;
  comprobantes: number | string;
  monto: number | string;
  ultimo: string | null;
}

/** ¿La base contestó un número de verdad? (`null`/`undefined` = no lo trajo.) */
function numero(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Camino rápido: los ocho números ya sumados por la base. */
async function porLaBase(): Promise<ContadoresDelHub | null> {
  const { data, error } = await supabaseServer.rpc(RPC_CONTADORES);
  // Sin la migración aplicada esto es un 404 de PostgREST. No se distingue del
  // resto de errores a propósito: ante CUALQUIER problema se cuenta por filas,
  // que es la regla de siempre.
  if (error || !Array.isArray(data)) return null;
  const out: ContadoresDelHub = {};
  for (const f of data as FilaRpc[]) {
    if (!(MARCAS_DEL_HUB as readonly string[]).includes(f.marca)) continue;
    // 🔴 SIN `tarjetas` NO SIRVE. La versión vieja de la función devolvía solo
    // dos números; si quedara en la base, tomarla como buena haría que el hub
    // volviera a decir 81. Ante la duda se cuenta por filas, que sí agrupa.
    const tarjetas = numero(f.tarjetas);
    const tarjetasSinFoto = numero(f.tarjetas_sin_foto);
    if (tarjetas === null || tarjetasSinFoto === null) return null;
    out[f.marca as MarcaContada] = {
      aLaVenta: Number(f.a_la_venta),
      sinFoto: Number(f.sin_foto),
      tarjetas,
      tarjetasSinFoto,
    };
  }
  return out;
}

/** Camino rápido del pulso: los tres números por marca, sumados por la base. */
async function pulsoPorLaBase(hoy: string): Promise<PulsoDelHub | null> {
  const { data, error } = await supabaseServer.rpc(RPC_PULSO, { dias: DIAS_PULSO });
  if (error || !Array.isArray(data)) return null;
  const out: PulsoDelHub = {};
  for (const f of data as FilaPulsoRpc[]) {
    if (!(MARCAS_DEL_HUB as readonly string[]).includes(f.marca)) continue;
    out[f.marca] = {
      comprobantes: Number(f.comprobantes),
      monto: Number(f.monto),
      // La base devuelve la FECHA del último (día de Panamá) y los días se
      // cuentan acá, con la misma función que el respaldo: una sola definición
      // de «hace cuántos días».
      diasDesdeElUltimo: f.ultimo ? diasEntre(f.ultimo, hoy) : null,
    };
  }
  return out;
}

/** Respaldo del pulso: las fechas y los montos, y la cuenta con `resumirPulso`. */
async function pulsoPorLasFilas(marca: MarcaContada, hoy: string): Promise<PulsoMarca> {
  const filas = await leerTodoPaginado<FilaDeComprobante>(
    `${tablaDePedidos(marca)} (pulso del hub)`,
    (pedirCount, desde, hasta) =>
      supabaseServer
        .from(tablaDePedidos(marca))
        .select("created_at,total", pedirCount ? { count: "exact" } : {})
        // `deleted` es NULLABLE en estas tablas: un `.eq(false)` perdería filas
        // vivas. Es la misma trampa que ya muerde en préstamos.
        .or("deleted.is.null,deleted.eq.false")
        .order("created_at", { ascending: true })
        .range(desde, hasta),
  );
  return resumirPulso(filas, hoy);
}

/** Reebok: su existencia por talla vive en `inventory`, no en la fila. */
async function stockDeReebok(): Promise<Record<string, number>> {
  const { supabase } = await import("@/components/reebok/supabase");
  const filas = await leerTodoPaginado<{ product_id: string; quantity: number }>(
    "inventory (contadores del hub)",
    (pedirCount, desde, hasta) =>
      supabase
        .from("inventory")
        .select("product_id,quantity", pedirCount ? { count: "exact" } : {})
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  const mapa: Record<string, number> = {};
  for (const i of filas) mapa[i.product_id] = (mapa[i.product_id] || 0) + i.quantity;
  return mapa;
}

/** Respaldo: leer las filas y contar con la regla de siempre. */
async function porLasFilas(marca: MarcaContada) {
  const cfg = getMarcaConfig(marca)!;
  const db = await cfg.products.readDb();
  const filas = await leerTodoPaginado<FilaContada>(
    `${cfg.productsTable} (contadores del hub)`,
    (pedirCount, desde, hasta) =>
      db
        .from(cfg.productsTable)
        .select(columnasParaContar(marca), pedirCount ? { count: "exact" } : {})
        .eq("active", true)
        .order("id", { ascending: true })
        .range(desde, hasta),
  );
  const stock = marca === "reebok" ? await stockDeReebok() : undefined;
  return contarDeFilas(marca, filas, stock);
}

export async function GET(req: NextRequest) {
  // Los MISMOS roles que la pantalla del hub y que `/api/catalogo/[marca]/products`.
  const auth = requireRole(req, catalogoRoles());
  if (auth instanceof NextResponse) return auth;

  // 🔴 El día de negocio se fija UNA vez para toda la respuesta, en Panamá.
  const hoy = hoyPanama();

  const [deLaBase, pulsoBase] = await Promise.all([porLaBase(), pulsoPorLaBase(hoy)]);

  const pulso = pulsoBase ?? (await pulsoPorLasFilasTodas(hoy));

  if (deLaBase && Object.keys(deLaBase).length === MARCAS_DEL_HUB.length) {
    return NextResponse.json({ contadores: deLaBase, pulso, fuente: "base" });
  }

  const contadores: ContadoresDelHub = {};
  // Las cuatro marcas en paralelo: una que falle no deja a las otras sin número
  // (la tarjeta de esa marca dirá «Contadores no disponibles», como hoy).
  const resultados = await Promise.allSettled(MARCAS_DEL_HUB.map((m) => porLasFilas(m)));
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") contadores[MARCAS_DEL_HUB[i]] = r.value;
    else console.error(`contadores del hub · ${MARCAS_DEL_HUB[i]}`, r.reason);
  });
  return NextResponse.json({ contadores, pulso, fuente: "filas" });
}

/** El pulso de las cuatro marcas por filas. Una que falle no tumba a las otras. */
async function pulsoPorLasFilasTodas(hoy: string): Promise<PulsoDelHub> {
  const out: PulsoDelHub = {};
  const rs = await Promise.allSettled(MARCAS_DEL_HUB.map((m) => pulsoPorLasFilas(m, hoy)));
  rs.forEach((r, i) => {
    if (r.status === "fulfilled") out[MARCAS_DEL_HUB[i]] = r.value;
    else console.error(`pulso del hub · ${MARCAS_DEL_HUB[i]}`, r.reason);
  });
  return out;
}
