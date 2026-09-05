// ─────────────────────────────────────────────────────────────────────────────
// LO QUE LA FICHA DEL CLIENTE LEE DE LA BASE.
//
// Separado de `ficha.ts` a propósito, con el mismo criterio que ya separa
// `clientes-ytd.ts` de `clientes-ytd-consulta.ts`: allá la DEFINICIÓN (pura,
// testeable sin credenciales) y acá el acceso a datos.
//
// 🔴 LA IDENTIDAD DEL CLIENTE ES EL CÓDIGO. El puente es SIEMPRE
// `switch_facturas (empresa_key, cliente_switch_id)` → `switch_clientes` →
// `codigo`. **Nunca por nombre**: un LEFT JOIN por nombre contra una tabla con
// homónimos multiplica la factura y el SUM la cuenta dos veces.
//
// 🔴 SOLO LAS 6 DEL GRUPO, por INCLUSIÓN (`B2B_EMPRESA_KEYS`). Boston no entra
// —ni una fila, ni un total— y american_classic tampoco. El filtro va en la
// MISMA cadena de la consulta, no en una proyección posterior.
//
// 🔴 LA COMPARACIÓN «vs el año pasado» SE CORTA EN LOS MISMOS DÍAS. La regla no
// se reimplementa: sale de `corteVsAnioAnterior` /`unAnioAntes`, la definición
// única del sistema. El corte se calcula con el ÚLTIMO DÍA CARGADO de las
// facturas de ESE cliente, que es la misma tabla que se suma — nunca con «hoy»
// a secas, que le regalaría días al año pasado.
//
// ⚠️ `db-max-rows` = 1000 y corta EN SILENCIO. Todas las lecturas de acá van
// por `leerTodoPaginado`. Medido el 5-sep-2026: el cliente con más documentos
// del grupo (D-25) tiene **921 facturas en dos años** — a un pelo del corte, y
// el año que viene lo pasa.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import {
  anioEnCursoPanama,
  montoFirmado,
  aEnteroEscalado,
  escaladoACentavos,
} from "@/lib/clientes-ytd";
import { corteVsAnioAnterior } from "@/lib/ventas/clientes-corte-comparativo";
import { agruparPagosPorFecha, type PagoDeEmpresa, type PagoDelDia } from "@/lib/cxc/pagos-por-fecha";

interface Par {
  codigo: string;
  empresa_key: string;
  cliente_switch_id: number | null;
}

interface FilaFactura {
  empresa_key: string;
  cliente_switch_id: number;
  fecha: string;
  tipo_comprobante: string;
  subtotal_descuento: number | string;
}

export interface ComprasDeEmpresa {
  empresa: string;
  /** Neto del año en curso (notas de crédito restan). */
  compras: number;
  /** Lo FACTURADO sin restar las notas de crédito. Es lo que distingue «nunca
   *  compró» de «compró y se le acreditó todo» — ver la 🩸 de `ficha.ts`. */
  comprasBrutas: number;
  /** Neto del año anterior HASTA EL MISMO DÍA. `null` = no hay con qué comparar. */
  comprasAnterior: number | null;
  /** Última factura de venta (las notas de crédito no son compras). */
  ultimaCompra: string | null;
}

export interface ComprasDelCliente {
  anio: number;
  /** Hasta qué día se sumó el año anterior (`YYYY-MM-DD`). */
  cortePrev: string;
  porEmpresa: ComprasDeEmpresa[];
}

/** Los tipos que son una COMPRA de verdad para «última compra». Una nota de
 *  crédito y una nota de débito mueven plata pero no son una compra nueva. */
const TIPOS_DE_COMPRA = new Set(["Factura", "Tiquete", "Transacción"]);

/**
 * Compras del año y del año anterior (mismos días) de UN cliente, por empresa.
 *
 * Se lee UNA vez la ventana de dos años y se reparte en TypeScript: dos
 * consultas separadas contra la misma tabla costarían el doble de viajes y
 * podrían leerse en momentos distintos, con lo que el corte de una no
 * correspondería a los datos de la otra.
 */
export async function comprasDelCliente(
  codigo: string,
  ahora: Date = new Date(),
): Promise<ComprasDelCliente> {
  const anio = anioEnCursoPanama(ahora);

  const pares = await leerTodoPaginado<Par>(
    "switch_clientes (ficha del cliente)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("switch_clientes")
        .select("codigo, empresa_key, cliente_switch_id", pedirCount ? { count: "exact" } : {})
        .eq("codigo", codigo)
        .in("empresa_key", [...B2B_EMPRESA_KEYS])
        .order("id", { ascending: true })
        .range(from, to),
  );

  const idsPorEmpresa = new Map<string, number>();
  const ids = new Set<number>();
  for (const p of pares) {
    if (typeof p.cliente_switch_id !== "number") continue;
    idsPorEmpresa.set(`${p.empresa_key}|${p.cliente_switch_id}`, p.cliente_switch_id);
    ids.add(p.cliente_switch_id);
  }

  const vacio: ComprasDelCliente = {
    anio,
    cortePrev: `${anio - 1}-12-31`,
    porEmpresa: B2B_EMPRESA_KEYS.map((e) => ({
      empresa: e,
      compras: 0,
      comprasBrutas: 0,
      comprasAnterior: null,
      ultimaCompra: null,
    })),
  };
  if (ids.size === 0) return vacio;

  // Ventana de DOS años, en instantes UTC. El 1-ene 00:00 de Panamá es 05:00
  // UTC del mismo día; semiabierta arriba para que el 31-dic 19:00 de Panamá
  // (= 1-ene 00:00 UTC) siga siendo del año viejo.
  const desde = `${anio - 1}-01-01T05:00:00.000Z`;
  const hasta = `${anio + 1}-01-01T05:00:00.000Z`;

  const facturas = await leerTodoPaginado<FilaFactura>(
    "switch_facturas (ficha del cliente)",
    (pedirCount, from, to) =>
      supabaseServer
        .from("switch_facturas")
        .select(
          "empresa_key, cliente_switch_id, fecha, tipo_comprobante, subtotal_descuento",
          pedirCount ? { count: "exact" } : {},
        )
        .in("cliente_switch_id", [...ids])
        .in("empresa_key", [...B2B_EMPRESA_KEYS])
        .gte("fecha", desde)
        .lt("fecha", hasta)
        .order("id", { ascending: true })
        .range(from, to),
  );

  // 🔴 EL CORTE SALE DE LOS DATOS QUE SE COMPARAN. `ultimoDiaCargado` es el día
  // más reciente del AÑO EN CURSO de este mismo cliente; `corteVsAnioAnterior`
  // le pone el tope de HOY (una factura con fecha futura no corre el corte) y
  // devuelve la misma fecha un año antes (29-feb → 28-feb).
  let ultimoDiaCargado: string | null = null;
  const relevantes = facturas.filter((f) =>
    idsPorEmpresa.has(`${f.empresa_key}|${f.cliente_switch_id}`),
  );
  for (const f of relevantes) {
    const dia = fechaPanamaDe(f.fecha);
    if (dia.slice(0, 4) !== String(anio)) continue;
    if (!ultimoDiaCargado || dia > ultimoDiaCargado) ultimoDiaCargado = dia;
  }
  const { cortePrev } = corteVsAnioAnterior(ultimoDiaCargado, ahora);

  // Acumular en ENTEROS escalados: sumar decimales depende del ORDEN en que
  // lleguen las filas, y así se separaron por un centavo el listado y la ficha.
  const netoActual = new Map<string, number>();
  const brutoActual = new Map<string, number>();
  const netoPrevio = new Map<string, number>();
  const hayPrevio = new Set<string>();
  const ultima = new Map<string, string>();

  for (const f of relevantes) {
    const dia = fechaPanamaDe(f.fecha);
    const anioDeLaFila = Number(dia.slice(0, 4));
    const firmado = aEnteroEscalado(montoFirmado(f.tipo_comprobante, f.subtotal_descuento));
    if (anioDeLaFila === anio) {
      netoActual.set(f.empresa_key, (netoActual.get(f.empresa_key) ?? 0) + firmado);
      if (firmado > 0) {
        brutoActual.set(f.empresa_key, (brutoActual.get(f.empresa_key) ?? 0) + firmado);
      }
      if (TIPOS_DE_COMPRA.has(f.tipo_comprobante)) {
        const previa = ultima.get(f.empresa_key);
        if (!previa || dia > previa) ultima.set(f.empresa_key, dia);
      }
    } else if (anioDeLaFila === anio - 1 && dia <= cortePrev) {
      // 🔴 `<= cortePrev`: los MISMOS DÍAS, ni uno más.
      netoPrevio.set(f.empresa_key, (netoPrevio.get(f.empresa_key) ?? 0) + firmado);
      hayPrevio.add(f.empresa_key);
    }
  }

  return {
    anio,
    cortePrev,
    porEmpresa: B2B_EMPRESA_KEYS.map((e) => ({
      empresa: e,
      compras: escaladoACentavos(netoActual.get(e) ?? 0),
      comprasBrutas: escaladoACentavos(brutoActual.get(e) ?? 0),
      // `null` (y no 0) cuando ese cliente no tuvo NINGUNA fila el año pasado en
      // esa empresa: «no hay con qué comparar» no es «vendió cero».
      comprasAnterior: hayPrevio.has(e) ? escaladoACentavos(netoPrevio.get(e) ?? 0) : null,
      ultimaCompra: ultima.get(e) ?? null,
    })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGOS
// ─────────────────────────────────────────────────────────────────────────────

export interface PagosDelCliente {
  /** Las 3 últimas FECHAS en que pagó, con el total del día y las empresas. */
  porFecha: PagoDelDia[];
  /** El último pago: fecha y monto del día más reciente. `null` si nunca pagó. */
  ultimoPago: { fecha: string; monto: number } | null;
}

/**
 * Cuántos recibos se leen POR EMPRESA. Es el MISMO número que usa la ruta del
 * CXC (`/api/cxc/ultimos-pagos`) y por la misma razón: con 3 por empresa, un
 * cliente con 3 recibos del mismo día en Vistana taparía con esa única fecha
 * las otras dos que sí existen. 30 × 6 = 180 filas, muy por debajo del tope de
 * 1.000 que corta en silencio.
 */
const RECIBOS_POR_EMPRESA = 30;

/**
 * Los últimos pagos de un cliente, POR FECHA.
 *
 * 🔴 SE REUSA `agruparPagosPorFecha` del CXC, no se escribe otro. El bloque
 * «Últimos pagos» de la ficha y el del panel de Cuentas por Cobrar tienen que
 * decir lo MISMO: dos agrupadores son dos que un día se separan.
 *
 * 🔴 EL FILTRO ES EL DE SIEMPRE: sin retenciones (`es_retencion = false`) y sin
 * recibos en cero. Es el bug que Daniel cazó en el CXC — sin él, City Mall
 * parece que pagó ayer por $19,60 cuando su último cobro real fue de $234.189,21.
 *
 * 🔴 BOSTON NO ENTRA: la consulta va EMPRESA POR EMPRESA, con la empresa en la
 * misma cadena. Un código de cliente NO es único entre empresas.
 */
export async function pagosDelCliente(codigo: string): Promise<PagosDelCliente> {
  const porEmpresa = await Promise.all(
    B2B_EMPRESA_KEYS.map(async (empresa) => {
      const { data, error } = await supabaseServer
        .from("switch_recibos")
        .select("fecha,total")
        .eq("empresa_key", empresa)
        .eq("cliente_codigo", codigo)
        .eq("es_retencion", false)
        .neq("total", 0)
        .not("fecha", "is", null)
        .order("fecha_creacion", { ascending: false, nullsFirst: false })
        .limit(RECIBOS_POR_EMPRESA);
      if (error) {
        console.error(`[clientes/ficha] pagos ${empresa}/${codigo}: ${error.message}`);
        return [] as PagoDeEmpresa[];
      }
      return (data ?? []).map((r) => ({
        fecha: String((r as { fecha: string }).fecha).slice(0, 10),
        monto: Number((r as { total: unknown }).total) || 0,
        empresa,
      }));
    }),
  );

  const porFecha = agruparPagosPorFecha(porEmpresa.flat());
  return {
    porFecha,
    ultimoPago: porFecha.length > 0 ? { fecha: porFecha[0].fecha, monto: porFecha[0].monto } : null,
  };
}
