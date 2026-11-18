import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { empresasConCxc } from "@/lib/switch-api/empresas";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import {
  ULTIMA_COMPRA_JUNTA_2026_11,
  TIPOS_DE_LA_COMPRA,
  inicioDeVentana,
  rangoDeDias,
  ultimaCompraPositiva,
  type CompraJunta,
  type DocumentoLeido,
} from "@/lib/cxc/ultima-compra-junta";
import { fechaPanamaDe } from "@/lib/fecha-panama";
import { ultimasComprasPositivas } from "@/lib/cxc/ultima-compra-junta-server";

// Última COMPRA por empresa+cliente — el espejo de /api/cxc/ultimo-pago.
//
// Daniel, 13-ago-2026: "asi como esta ultimo pago x dias, tambien quiero ver
// ultima compra (q seria la factura)".
//
// Lee la vista agregada `switch_ultima_compra_cliente_v1` (una fila por empresa
// y cliente), NO `switch_facturas` directo: una consulta por cliente serían ~200
// consultas por apertura del panel contra una base en compute Micro que se cayó
// varias veces esta semana. Es la misma forma que ya tiene el último pago, a
// propósito — el CXC no estrena un patrón de lectura por esto.
//
// Última compra = la última **Factura**. Las notas de crédito NO son compras y
// en este repo llegan POSITIVAS: el filtro por `tipo_comprobante` vive en la
// vista. Solo lectura. Gate = los mismos roles del CXC.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

// Solo lo que consume el frontend: el join va por empresa_key|cliente_codigo,
// igual que el último pago. `cliente_switch_id` no viaja (nadie lo usa).
const COLS = ULTIMA_COMPRA_JUNTA_2026_11
  ? "empresa_key,cliente_switch_id,cliente_codigo,ultima_compra_fecha,ultima_compra_monto"
  : "empresa_key,cliente_codigo,ultima_compra_fecha,ultima_compra_monto";

// `db-max-rows` = 1000 y corta EN SILENCIO: un select sin paginar devuelve 1.000
// filas sin error y sin señal. La vista tiene ~466 filas del grupo hoy, pero el
// paginado no se pone por el tamaño de hoy — un truncado acá se vería como
// "este cliente nunca compró", que es exactamente el tipo de mentira callada que
// este módulo ya pagó dos veces.
const PAGE = 1000;

// Mismo razonamiento que en /api/cxc/ultimo-pago: la vista NO filtra empresa
// (trae toda empresa con facturas), y este endpoint alimenta UN solo consumidor
// —el CXC consolidado del GRUPO—. Acotar acá lo hace explícito en vez de confiar
// en que el join no encuentre pareja. La cartera de Boston va aparte y su
// pestaña no muestra esta columna: no se mezcla ni por descuido.
const EMPRESAS_CXC = empresasConCxc();

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("switch_ultima_compra_cliente_v1")
      .select(COLS)
      .in("empresa_key", EMPRESAS_CXC)
      .order("empresa_key", { ascending: true })
      .order("cliente_codigo", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      // Histórico: la DDL 20260813180000 la corría Daniel A MANO, así que la
      // vista podía no existir por días y eso NO era un error — se respondía []
      // y el CXC se dibujaba sin la columna.
      // Tolerancia retirada el 3-sep-2026: la vista existe desde la migración
      // 20260813180000_ultima_compra_cliente.sql. Ahora CUALQUIER error es 500:
      // un "no existe la tabla" que hoy llegue es un permiso, un cambio de
      // esquema o un timeout, y leído como "este cliente nunca compró" sería
      // exactamente la mentira callada que este módulo ya pagó dos veces.
      console.error(`[cxc/ultima-compra] ${error.message}`);
      return NextResponse.json({ error: "Error al leer últimas compras" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break; // última página
  }
  if (!ULTIMA_COMPRA_JUNTA_2026_11) return NextResponse.json(all);
  return NextResponse.json(await juntarLaCompraDelDia(all as FilaVista[]));
}

interface FilaVista {
  empresa_key: string;
  cliente_switch_id: number;
  cliente_codigo: string | null;
  ultima_compra_fecha: string;
  ultima_compra_monto: number;
}

/** Ventanas por tanda en el `.or()` (cada una son ~70 caracteres de URL). */
const VENTANAS_POR_TANDA = 25;

type FilaLeida = {
  empresa_key: string; cliente_switch_id: number; fecha: string;
  tipo_comprobante: string; secuencial: string; total: number;
};

/**
 * La «última compra» deja de ser la última factura y pasa a ser TODO lo
 * facturado en los 7 días que terminan en ella (facturas − NC), con la lista de
 * documentos. Se leen solo esas VENTANAS (no la historia entera); si alguna da
 * cero o negativo, se lee la historia de ESOS clientes y se toma la ventana
 * anterior positiva.
 * 🔴 Falla ABIERTA: si esta lectura falla, sale lo de antes (la factura sola).
 */
async function juntarLaCompraDelDia(filas: FilaVista[]) {
  const sinId = (f: FilaVista) => ({
    empresa_key: f.empresa_key,
    cliente_codigo: f.cliente_codigo,
    ultima_compra_fecha: f.ultima_compra_fecha,
    ultima_compra_monto: f.ultima_compra_monto,
  });
  const conCompra = (f: FilaVista, c: CompraJunta) => ({
    ...sinId(f),
    ultima_compra_fecha: c.dia,
    ultima_compra_monto: c.monto,
    ultima_compra_documentos: c.documentos,
  });
  try {
    const diasPorEmpresa = new Map<string, Set<string>>();
    for (const f of filas) {
      const set = diasPorEmpresa.get(f.empresa_key) ?? new Set<string>();
      set.add(String(f.ultima_compra_fecha).slice(0, 10));
      diasPorEmpresa.set(f.empresa_key, set);
    }
    // empresa|cliente → documentos leídos de sus ventanas
    const porCliente = new Map<string, DocumentoLeido[]>();
    for (const [empresa, set] of diasPorEmpresa) {
      const dias = [...set].sort();
      for (let i = 0; i < dias.length; i += VENTANAS_POR_TANDA) {
        const or = dias
          .slice(i, i + VENTANAS_POR_TANDA)
          .map((d) => {
            const [ini, fin] = rangoDeDias(inicioDeVentana(d), d);
            return `and(fecha.gte.${ini},fecha.lt.${fin})`;
          })
          .join(",");
        const tanda = await leerTodoPaginado<FilaLeida>("switch_facturas (última compra junta)", (pedirCount, from, to) =>
          supabaseServer
            .from("switch_facturas")
            .select(
              "empresa_key,cliente_switch_id,fecha,tipo_comprobante,secuencial,total",
              pedirCount ? { count: "exact" } : {},
            )
            .eq("empresa_key", empresa)
            .in("tipo_comprobante", [...TIPOS_DE_LA_COMPRA])
            .or(or)
            .order("id", { ascending: true })
            .range(from, to),
        );
        for (const t of tanda) {
          const k = `${t.empresa_key}|${t.cliente_switch_id}`;
          porCliente.set(k, [...(porCliente.get(k) ?? []), { ...t, tipo: t.tipo_comprobante }]);
        }
      }
    }
    const juntas = filas.map((f) => {
      const dia = String(f.ultima_compra_fecha).slice(0, 10);
      const desde = inicioDeVentana(dia);
      // Las tandas de OTROS clientes pueden traer días de más: solo su ventana.
      const docs = (porCliente.get(`${f.empresa_key}|${f.cliente_switch_id}`) ?? []).filter((d) => {
        const dd = fechaPanamaDe(d.fecha);
        return dd >= desde && dd <= dia;
      });
      return { f, docs, compra: docs.length > 0 ? ultimaCompraPositiva(docs) : null };
    });
    // 🔴 La ventana dio cero o negativo: la anterior positiva, de la historia de esos pocos clientes.
    const sinPositivo = new Map<string, number[]>();
    for (const { f, docs, compra } of juntas) {
      if (docs.length > 0 && !compra) {
        sinPositivo.set(f.empresa_key, [...(sinPositivo.get(f.empresa_key) ?? []), f.cliente_switch_id]);
      }
    }
    const anteriores = new Map<string, Map<number, CompraJunta>>();
    for (const [empresa, ids] of sinPositivo) anteriores.set(empresa, await ultimasComprasPositivas(empresa, ids));
    return juntas.map(({ f, docs, compra }) => {
      if (compra) return conCompra(f, compra);
      if (docs.length === 0) return sinId(f);
      const previa = anteriores.get(f.empresa_key)?.get(f.cliente_switch_id);
      return previa ? conCompra(f, previa) : sinId(f); // ninguna positiva: la factura sola, como antes
    });
  } catch (e) {
    console.error(`[cxc/ultima-compra] juntar la compra: ${e instanceof Error ? e.message : e}`);
    return filas.map(sinId);
  }
}
