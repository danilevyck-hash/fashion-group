/**
 * Guías › Pedidos — el DETALLE de un pedido con sus bultos
 * (6-oct-2026, `PEDIDOS_BULTOS_2026_10`).
 *
 *   GET   ?empresa_key=&pedido_switch_id=  → { lineas, bajado, sinTabla }
 *   PATCH { empresa_key, pedido_switch_id, codigo_barra_ids[], bulto|null }
 *                                          → { ok, lineas, resumen }
 *
 * 🔴 La EMPRESA la decide el servidor (`veLaEmpresa`): un pedido de una empresa
 * que esta persona no ve contesta **404**, nunca 403 — el mismo trato que
 * `/api/clientes/[codigo]` le da a un código ajeno (no se confirma que exista).
 *
 * 🔴 El quién sale de la cookie FIRMADA, nunca del cuerpo.
 * 🔴 El GET abre Switch como mucho una vez cada 6 h por pedido; el PATCH no lo
 * abre nunca.
 */
import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import {
  PEDIDOS_BULTOS_2026_10,
  ROLES_TERMINADO,
  resumenAsignacion,
  validarBulto,
  veLaEmpresa,
} from "@/lib/guias/pedidos-bultos";
import { PEDIDOS_VER_ROLES } from "@/lib/guias/pedidos-bodega";
import { bajarLineas, hayQueBajar, leerLineas, ponerEnBulto, quitarDelBulto } from "@/lib/guias/pedido-detalle-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const apagado = () => NextResponse.json({ error: "No disponible" }, { status: 404 });
const noEsTuyo = () => NextResponse.json({ error: "Ese pedido no existe" }, { status: 404 });

/**
 * Quién firma el toque. El CHECK de la tabla exige que NO vaya vacío, y una
 * firma inventada es peor que ninguna: sin nombre ni id, la sesión no sirve.
 */
const quienFirma = (a: { userName?: string; userId?: string }) => a.userName || a.userId || null;

/** El pedido, solo si es de una empresa que esta persona ve. */
async function pedidoVisible(
  empresa: string,
  id: number,
  userName: string | null | undefined,
  role: string | null | undefined,
) {
  if (!veLaEmpresa(empresa, userName, role)) return null;
  const { data } = await supabaseServer
    .from("switch_pedidos")
    .select("empresa_key, pedido_switch_id, secuencial, cliente_codigo, cliente_nombre")
    .eq("empresa_key", empresa)
    .eq("pedido_switch_id", id)
    .maybeSingle();
  return data ?? null;
}

function pedirClaves(req: NextRequest): { empresa: string; id: number } | null {
  const q = req.nextUrl.searchParams;
  const empresa = (q.get("empresa_key") ?? "").trim();
  const id = Number(q.get("pedido_switch_id"));
  return empresa && Number.isInteger(id) ? { empresa, id } : null;
}

export async function GET(req: NextRequest) {
  if (!PEDIDOS_BULTOS_2026_10) return apagado();
  const auth = requireRole(req, [...PEDIDOS_VER_ROLES]);
  if (auth instanceof NextResponse) return auth;

  const claves = pedirClaves(req);
  if (!claves) return NextResponse.json({ error: "Datos incompletos" }, { status: 400 });
  const pedido = await pedidoVisible(claves.empresa, claves.id, auth.userName, auth.role);
  if (!pedido) return noEsTuyo();

  try {
    let detalle = await leerLineas(claves.empresa, claves.id);
    if (!detalle.sinTabla && hayQueBajar(detalle)) {
      // Si Switch no contesta, se muestra lo que ya había: falla ABIERTA.
      try {
        await bajarLineas(claves.empresa, claves.id);
        detalle = await leerLineas(claves.empresa, claves.id);
      } catch {
        /* se sigue con lo guardado */
      }
    }
    return NextResponse.json({
      ...detalle,
      pedido,
      resumen: resumenAsignacion(detalle.lineas),
    });
  } catch {
    return NextResponse.json({ error: "No se pudo leer el detalle del pedido" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!PEDIDOS_BULTOS_2026_10) return apagado();
  // Poner en bulto lo hace BODEGA: los mismos que marcan «Terminado».
  const auth = requireRole(req, [...ROLES_TERMINADO]);
  if (auth instanceof NextResponse) return auth;

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const empresa = String(body?.empresa_key ?? "").trim();
  const id = Number(body?.pedido_switch_id);
  const ids = Array.isArray(body?.codigo_barra_ids)
    ? [...new Set((body!.codigo_barra_ids as unknown[]).map(Number).filter(Number.isInteger))]
    : [];
  if (!empresa || !Number.isInteger(id) || ids.length === 0) {
    return NextResponse.json({ error: "Marca al menos un artículo" }, { status: 400 });
  }
  const pedido = await pedidoVisible(empresa, id, auth.userName, auth.role);
  if (!pedido) return noEsTuyo();
  const firma = quienFirma(auth);
  if (!firma) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // `bulto: null` = «Quitar del bulto»; cualquier otra cosa tiene que ser un número.
  const quitar = body?.bulto === null;
  const v = quitar ? null : validarBulto(body?.bulto);
  if (v && !v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  try {
    if (quitar) await quitarDelBulto(empresa, id, ids);
    else await ponerEnBulto(empresa, id, ids, v!.valor!, firma);
    const detalle = await leerLineas(empresa, id);
    return NextResponse.json({ ok: true, ...detalle, resumen: resumenAsignacion(detalle.lineas) });
  } catch {
    return NextResponse.json({ error: "No se pudo guardar el bulto" }, { status: 500 });
  }
}
