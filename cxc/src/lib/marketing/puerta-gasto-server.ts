// ============================================================================
// Marketing — LA PUERTA «＋ Gasto», lo que se pregunta a la base (servidor).
//
// Dos cosas, y las dos las usan las TRES puertas de escritura (factura ·
// entrega · pago de impulsadora) para no repetirlas tres veces:
//
//   1. 🔴 EL FRENO DE DUPLICADOS. Daniel (22-sep-2026): mismo proveedor
//      normalizado + mismo monto + misma fecha → NO deja guardar. La regla es
//      `duplicado.ts` (puro); acá se le traen las facturas VIVAS de esa fecha
//      y, si una es la misma, se lanza `ErrorGastoDuplicado` ANTES de escribir
//      nada. Medido el 22-sep-2026: 6 grupos vivos (12 facturas) y 14 grupos
//      contando anuladas; los existentes NO se tocan (Daniel: *«no elimines
//      ni modifiques nada»*).
//      ⚠️ En un pago de impulsadora la FECHA es `periodo_desde` (Ana Trejos:
//      7 pagos cargados el mismo día, uno por mes atrasado — con
//      `fecha_factura` habría frenado 13 pagos legítimos).
//      ⚠️ Un mueble no tiene proveedor y por eso no tiene freno: sin los tres
//      datos `claveDeDuplicado` no afirma nada.
//   2. LA TIENDA ES DEL DIRECTORIO. La pantalla solo ofrece códigos de
//      `clientes_master` (el `ClientePicker` sin salida a mano); el servidor lo
//      vuelve a mirar para que ningún otro llamador cuele un código inventado.
//      Falla ABIERTA si la lectura se cae: un directorio que no contesta no
//      puede frenar un gasto real.
//
// Todo cuelga de `MARKETING_PUERTA_GASTO`: apagado, ninguna de las dos corre.
// ============================================================================

import { supabaseServer } from "@/lib/supabase-server";
import { conRespaldoSinColumnas } from "./columnas-opcionales";
import { buscarDuplicado, type HuellaDeGasto } from "./duplicado";
import {
  ErrorGastoDuplicado,
  MARKETING_PUERTA_GASTO,
  mensajeTiendaDesconocida,
} from "./puerta-gasto";

interface FilaFactura {
  id: string;
  numero_factura: string | null;
  proveedor: string | null;
  total: number | string | null;
  fecha_factura: string | null;
  periodo_desde?: string | null;
  impulsadora_mes?: string | null;
}

function huellaDeFila(r: FilaFactura, fecha: string | null | undefined) {
  return {
    id: String(r.id),
    numero: r.numero_factura,
    proveedor: r.proveedor,
    monto: r.total,
    fecha: fecha ?? null,
  };
}

/**
 * Frena una FACTURA de proveedor (no un pago de impulsadora) igual a otra
 * viva. Se le pasa `id` al EDITAR para que no se acuse a sí misma.
 */
export async function frenarFacturaDuplicada(
  nuevo: HuellaDeGasto & { id?: string },
): Promise<void> {
  if (!MARKETING_PUERTA_GASTO) return;
  const fecha = String(nuevo.fecha ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return;
  const { data, error } = await supabaseServer
    .from("mk_facturas")
    .select("id, numero_factura, proveedor, total, fecha_factura")
    .is("anulado_en", null)
    .is("impulsadora_id", null)
    .eq("fecha_factura", fecha);
  if (error) throw new Error(`duplicado[lookup]: ${error.message}`);
  const existentes = ((data ?? []) as FilaFactura[]).map((r) =>
    huellaDeFila(r, r.fecha_factura),
  );
  const igual = buscarDuplicado(nuevo, existentes);
  if (igual) throw new ErrorGastoDuplicado(igual);
}

/**
 * Frena un PAGO de impulsadora igual a otro vivo de la MISMA impulsadora. La
 * fecha del pago es el inicio del período trabajado (`periodo_desde`; en los
 * pagos viejos sin rango, `impulsadora_mes`).
 */
export async function frenarPagoDuplicado(
  impulsadoraId: string,
  nuevo: HuellaDeGasto,
): Promise<void> {
  if (!MARKETING_PUERTA_GASTO) return;
  // `periodo_desde` llegó con la migración 20260727140000; si la base no la
  // tuviera, se relee sin ella y la fecha del pago es `impulsadora_mes`
  // (falla abierta, como `hayColumnasPeriodo` en `impulsadoras.ts`).
  const pedir = (columnas: string) =>
    supabaseServer
      .from("mk_facturas")
      .select(columnas)
      .is("anulado_en", null)
      .eq("impulsadora_id", impulsadoraId);
  const { resultado } = await conRespaldoSinColumnas<unknown[]>(
    () => pedir("id, numero_factura, proveedor, total, fecha_factura, periodo_desde, impulsadora_mes"),
    () => pedir("id, numero_factura, proveedor, total, fecha_factura, impulsadora_mes"),
  );
  const { data, error } = resultado;
  if (error) throw new Error(`duplicado[lookup]: ${error.message}`);
  const existentes = ((data ?? []) as FilaFactura[]).map((r) =>
    huellaDeFila(r, r.periodo_desde ?? r.impulsadora_mes ?? null),
  );
  const igual = buscarDuplicado(nuevo, existentes);
  if (igual) throw new ErrorGastoDuplicado(igual);
}

/**
 * La tienda tiene que estar en el directorio (`clientes_master`, por CÓDIGO,
 * nunca por nombre). `null` = General y no se pregunta nada. Si la lectura se
 * cae, se deja pasar: falla ABIERTA.
 */
export async function exigirTiendaDelDirectorio(
  tiendaCodigo: string | null | undefined,
): Promise<void> {
  if (!MARKETING_PUERTA_GASTO) return;
  const codigo = String(tiendaCodigo ?? "").trim().toUpperCase();
  if (codigo.length === 0) return;
  const { data, error } = await supabaseServer
    .from("clientes_master")
    .select("codigo")
    .eq("codigo", codigo)
    .limit(1)
    .maybeSingle();
  if (error) return;
  if (!data) throw new Error(mensajeTiendaDesconocida(codigo));
}
