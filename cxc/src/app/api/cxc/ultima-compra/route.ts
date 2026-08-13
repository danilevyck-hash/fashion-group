import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { empresasConCxc } from "@/lib/switch-api/empresas";
import { esTablaAusente } from "@/lib/contable/tabla-ausente";

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
const COLS = "empresa_key,cliente_codigo,ultima_compra_fecha,ultima_compra_monto";

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
      // La DDL 20260813180000 la corre Daniel A MANO, así que la vista puede no
      // existir por días — y eso NO es un error: es el estado normal hasta que
      // corra. Se responde [] y el CXC se dibuja EXACTAMENTE como antes, sin la
      // columna. El reconocimiento es ESTRECHO: un timeout o un permiso denegado
      // siguen siendo 500, porque esconderlos sería agrandarlos.
      if (esTablaAusente(error)) {
        console.warn("[cxc/ultima-compra] falta la vista (DDL 20260813180000 sin correr)");
        return NextResponse.json([]);
      }
      console.error(`[cxc/ultima-compra] ${error.message}`);
      return NextResponse.json({ error: "Error al leer últimas compras" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break; // última página
  }
  return NextResponse.json(all);
}
