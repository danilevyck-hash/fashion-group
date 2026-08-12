// Vendedor de Switch del pedido de la marca (empresa cfg.empresaKey).
//
//   GET   ?orderId= → vendedor asignado al pedido (nombre resuelto)
//   PATCH           → cambia el vendedor del pedido (<orders>.vendedor_switch_id)
//
// ⚠️ ACÁ NO SE LISTA. La lista de vendedores sale de UN solo lugar —
// `GET /api/admin/switch-vendedores?empresa=`, la misma que alimenta
// Sistema → Usuarios— porque es una llamada EN VIVO contra una API que admite
// un login por empresa. Ver la cabecera de `lib/catalogo/vendedor-switch.ts`.
//
// ROLES: los que ARMAN pedidos de la marca (`cfg.createRoles` sin el 'cliente'
// legacy), exactamente los mismos del selector de cliente. Ver `clienteSwitchRoles`.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { clienteSwitchRoles } from "@/lib/catalogo/roles";
import {
  buscarVendedor,
  errorVendedorNoExiste,
  guardarVendedorSwitchEnPedido,
  listarVendedores,
  parsearVendedorSwitchId,
} from "@/lib/catalogo/vendedor-switch";
import { supabaseServer } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

function esColumnaAusente(err: { message?: string | null } | null): boolean {
  return /vendedor_switch_id|column/i.test(err?.message ?? "");
}

/** Nombre del vendedor, best-effort y SIN abrir sesión de Switch si se puede:
 *  primero el mapeo ya guardado (tabla local), después la lista cacheada. */
async function nombreDeId(empresaKey: string, id: number): Promise<string | null> {
  const { data } = await supabaseServer
    .from("fg_user_switch_vendedor")
    .select("vendedor_nombre")
    .eq("empresa_key", empresaKey)
    .eq("vendedor_id", id)
    .limit(1)
    .maybeSingle();
  const guardado = (data as { vendedor_nombre: string | null } | null)?.vendedor_nombre ?? null;
  if (guardado) return guardado;
  try {
    const lista = await listarVendedores(empresaKey);
    return buscarVendedor(lista.vendedores, id)?.nombre ?? null;
  } catch {
    return null;
  }
}

// ─── GET: vendedor asignado a un pedido ──────────────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, clienteSwitchRoles(cfg.createRoles));
  if (auth instanceof NextResponse) return auth;

  const orderId = req.nextUrl.searchParams.get("orderId");
  if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

  const db = await cfg.db();
  const { data, error } = await db
    .from(cfg.ordersTable)
    .select("vendedor_switch_id")
    .eq("id", orderId)
    .single();
  if (error) {
    // Columna ausente (DDL pendiente) → sin vendedor asignado, modo legacy.
    if (esColumnaAusente(error)) {
      return NextResponse.json({ vendedorSwitchId: null, nombre: null, esFallback: false, ddlPendiente: true });
    }
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }

  const vid = (data?.vendedor_switch_id as number | null) ?? null;
  if (vid != null) {
    return NextResponse.json({
      vendedorSwitchId: vid,
      nombre: await nombreDeId(cfg.empresaKey, vid),
      esFallback: false,
    });
  }

  // Sin vendedor propio, el envío usa el default del piloto (Reebok legacy).
  // Se DICE, en vez de mostrar "sin vendedor": el pedido va a salir a nombre de
  // alguien y esconderlo es justo lo que este selector vino a evitar.
  if (cfg.fallback?.vendedorId != null) {
    return NextResponse.json({
      vendedorSwitchId: cfg.fallback.vendedorId,
      nombre: cfg.fallback.vendedorNombre ?? null,
      esFallback: true,
    });
  }
  return NextResponse.json({ vendedorSwitchId: null, nombre: null, esFallback: false });
}

// ─── PATCH: cambiar el vendedor del pedido ───────────────────────────────────

export async function PATCH(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, clienteSwitchRoles(cfg.createRoles));
  if (auth instanceof NextResponse) return auth;

  let body: { orderId?: unknown; vendedorSwitchId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

  const parsed = parsearVendedorSwitchId(body.vendedorSwitchId);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // El vendedor tiene que existir EN SWITCH de esta empresa: el id viaja en el
  // payload del pedido y los ids son POR EMPRESA — uno de otra empresa se
  // guardaría sin error y le atribuiría la venta (y la comisión) a otra persona.
  let nombre: string;
  try {
    const lista = await listarVendedores(cfg.empresaKey);
    const v = buscarVendedor(lista.vendedores, parsed.id);
    if (!v) return NextResponse.json({ error: errorVendedorNoExiste(cfg) }, { status: 404 });
    nombre = v.nombre;
  } catch {
    return NextResponse.json(
      { error: "No se pudo leer la lista de vendedores de Switch. Intenta de nuevo en unos segundos." },
      { status: 502 },
    );
  }

  const db = await cfg.db();

  // No cambiar el vendedor de un pedido con envío no-fallido: el pedido YA vive
  // en Switch a nombre del vendedor con que se envió — cambiarlo aquí solo
  // mentiría (y la comisión ya quedó donde quedó). Mismo criterio que el cliente.
  const { data: envio } = await db
    .from(cfg.enviosTable)
    .select("id")
    .eq("order_id", orderId)
    .neq("estado", "error")
    .limit(1)
    .maybeSingle();
  if (envio) {
    return NextResponse.json(
      { error: "Este pedido ya fue enviado a Switch — el vendedor no se puede cambiar" },
      { status: 409 },
    );
  }

  let guardado: boolean;
  try {
    guardado = await guardarVendedorSwitchEnPedido(db, cfg.ordersTable, orderId, parsed.id, nombre);
  } catch {
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  if (!guardado) {
    return NextResponse.json(
      { error: `Falta correr la migración de vendedor_switch_id en ${cfg.ordersTable}` },
      { status: 503 },
    );
  }
  return NextResponse.json({ ok: true, vendedorSwitchId: parsed.id, nombre });
}
