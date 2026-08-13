import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase-server";
import { requireRole } from "@/lib/requireRole";
import { empresasConCxc } from "@/lib/switch-api/empresas";

// Último pago por empresa+cliente (vista switch_ultimo_pago_cliente_v2, lee de
// switch_recibos). Antes anon client-side; ahora service_role tras revocar el
// SELECT de anon sobre la vista. Solo lectura. Gate = roles de CXC.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const CXC_ROLES = ["admin", "secretaria", "vendedor"];

// Solo las columnas que consume el frontend (join por empresa_key|cliente_codigo
// + fecha/monto). Antes era select("*") → arrastraba cliente_switch_id sin uso.
const COLS = "empresa_key,cliente_codigo,ultimo_pago_fecha,ultimo_pago_monto";

// El proyecto Supabase tiene un tope duro `db-max-rows=1000`: un select() sin
// paginar trunca a 1000 filas EN SILENCIO (la vista ya tiene ~1082 → se perdían
// ~26 clientes vistana con pago, que salían como "sin último pago" en CXC). Un
// .limit() alto NO ayuda (el server igual corta en 1000): hay que paginar por
// Range con orden explícito y estable para no repetir ni saltar filas.
const PAGE = 1000;

// La vista NO filtra empresa: devuelve el último pago de TODA empresa que tenga
// filas en switch_recibos. Este endpoint alimenta UN solo consumidor —el CXC
// consolidado (useAdminData)— que cruza contra switch_estadocuenta_aging, o sea
// exactamente las empresas con `cxc: true`. Filtrar acá lo hace EXPLÍCITO en vez
// de depender de que el join no encuentre pareja.
//
// Hoy es un no-op medible (las filas de american_classic, que sincroniza recibos
// con cxc:false, ya se caían solas en el join). Se pone porque el día que otra
// empresa sin CXC en este sistema entre a switch_recibos —confecciones_boston es
// la candidata: su cartera se lleva por fuera— sus cobros viajarían al módulo CXC
// sin que nada lo impida. La regla del negocio es que la plata de esa empresa no
// se mezcla NUNCA con la del grupo, ni siquiera para un cliente que exista en los
// dos lados (hay 10 clientes así, medidos el 27-jul-2026).
const EMPRESAS_CXC = empresasConCxc();

// UN RECIBO DE $0,00 NO ES UN PAGO — red de seguridad hasta que corra la DDL.
//
// La regla vive en la VISTA (20260813170000: `COALESCE(r.total,0) <> 0`), que es
// donde tiene que vivir para que TODA superficie la herede. Pero las migraciones
// las corre Daniel A MANO y hasta entonces la vista sigue devolviendo el recibo
// de $0,00 como "último pago" — que es el bug que Daniel cazó: D-25/fashion_wear
// mostraba "$0.00 hace 15 días" en vez de los $187.651,51 del 22-jul.
//
// Descartar acá la fila de $0 no puede recuperar el pago bueno (la vista ya
// colapsó a una fila por cliente), pero convierte una MENTIRA en un "Sin pagos
// registrados" honesto. Cuando la DDL corra, este filtro es un no-op medible.
//
// Un recibo de $0 es una aplicación/cruce (NC o saldo a favor aplicado contra
// facturas) o un recibo anulado: `switch_estadocuenta` no tiene UNA sola fila de
// tipo 'Recibo' con total 0 — el estado de cuenta de Switch nunca los muestra.
const esPagoDeVerdad = (fila: unknown): boolean =>
  Number((fila as { ultimo_pago_monto?: unknown }).ultimo_pago_monto) !== 0;

export async function GET(req: NextRequest) {
  const auth = requireRole(req, CXC_ROLES);
  if (auth instanceof NextResponse) return auth;

  const all: unknown[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabaseServer
      .from("switch_ultimo_pago_cliente_v2")
      .select(COLS)
      .in("empresa_key", EMPRESAS_CXC)
      .order("empresa_key", { ascending: true })
      .order("cliente_codigo", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) {
      console.error(`[cxc/ultimo-pago] ${error.message}`);
      return NextResponse.json({ error: "Error al leer últimos pagos" }, { status: 500 });
    }
    if (!data || data.length === 0) break;
    all.push(...data.filter(esPagoDeVerdad));
    if (data.length < PAGE) break; // última página
  }
  return NextResponse.json(all);
}
