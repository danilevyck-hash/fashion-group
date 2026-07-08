// Clientes Switch para el pedido Joybees (empresa joystep). Espejo fiel de la
// ruta homónima de Reebok — misma semántica, cambia la empresa y las tablas.
//
//   GET   ?q=       → busca en la tabla LOCAL switch_clientes (selector)
//   GET   ?orderId= → cliente Switch asignado a un pedido (nombre resuelto)
//   PATCH           → asigna/quita el cliente Switch de un pedido
//                     (joybees_orders.cliente_switch_id; null = Contado).
//
// Los clientes se crean SOLO desde el panel de Switch — aquí no hay alta.
// Gated por rol admin/secretaria.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { joybeesServer } from "@/lib/joybees-supabase-server";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";

const ROLES = ["admin", "secretaria"];
const EMPRESA_KEY = MARCAS_CONFIG.joybees.empresaKey; // joystep

function esColumnaAusente(err: { message?: string | null } | null): boolean {
  return /cliente_switch_id|column/i.test(err?.message ?? "");
}

// ─── GET: selector + cliente asignado a un pedido ────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const orderId = sp.get("orderId");

  if (orderId) {
    const { data, error } = await joybeesServer
      .from("joybees_orders")
      .select("cliente_switch_id")
      .eq("id", orderId)
      .single();
    if (error) {
      // Columna ausente (DDL pendiente) → sin cliente asignado, modo legacy.
      if (esColumnaAusente(error)) {
        return NextResponse.json({ clienteSwitchId: null, ddlPendiente: true });
      }
      return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
    }
    const cid = (data?.cliente_switch_id as number | null) ?? null;
    if (cid == null) return NextResponse.json({ clienteSwitchId: null });
    const { data: cli } = await supabaseServer
      .from("switch_clientes")
      .select("codigo, nombre")
      .eq("empresa_key", EMPRESA_KEY)
      .eq("cliente_switch_id", cid)
      .maybeSingle();
    return NextResponse.json({
      clienteSwitchId: cid,
      codigo: cli?.codigo ?? null,
      nombre: cli?.nombre ?? null,
    });
  }

  // Selector: lista desde la tabla LOCAL (la llena el sync).
  // Sanitizar q: coma/paréntesis rompen la sintaxis de .or() de PostgREST.
  const q = (sp.get("q") || "").trim().replace(/[,()%]/g, " ").trim();
  let query = supabaseServer
    .from("switch_clientes")
    .select("cliente_switch_id, codigo, nombre")
    .eq("empresa_key", EMPRESA_KEY)
    .order("nombre", { ascending: true })
    .limit(20);
  if (q.length > 0) {
    query = query.or(`nombre.ilike.%${q}%,codigo.ilike.%${q}%`);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ clientes: data ?? [] });
}

// ─── PATCH: asignar/quitar cliente Switch de un pedido ───────────────────────

export async function PATCH(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: { orderId?: unknown; clienteSwitchId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

  // clienteSwitchId: number = cliente real, null = volver a Contado (default).
  let clienteSwitchId: number | null = null;
  let nombre: string | null = null;
  let codigo: string | null = null;
  if (body.clienteSwitchId != null) {
    clienteSwitchId = Number(body.clienteSwitchId);
    if (!Number.isFinite(clienteSwitchId) || clienteSwitchId <= 0) {
      return NextResponse.json({ error: "clienteSwitchId inválido" }, { status: 400 });
    }
    const { data: cli } = await supabaseServer
      .from("switch_clientes")
      .select("codigo, nombre")
      .eq("empresa_key", EMPRESA_KEY)
      .eq("cliente_switch_id", clienteSwitchId)
      .maybeSingle();
    if (!cli) {
      return NextResponse.json(
        { error: "Ese cliente no existe en el directorio Switch de Joystep" },
        { status: 404 },
      );
    }
    nombre = cli.nombre ?? null;
    codigo = cli.codigo ?? null;
  }

  // No cambiar el cliente de un pedido con envío no-fallido: el pedido YA vive
  // en Switch con el cliente con que se envió — cambiarlo aquí solo mentiría.
  const { data: envio } = await joybeesServer
    .from("joybees_switch_envios")
    .select("id")
    .eq("order_id", orderId)
    .neq("estado", "error")
    .limit(1)
    .maybeSingle();
  if (envio) {
    return NextResponse.json(
      { error: "Este pedido ya fue enviado a Switch — el cliente no se puede cambiar" },
      { status: 409 },
    );
  }

  const { error } = await joybeesServer
    .from("joybees_orders")
    .update({ cliente_switch_id: clienteSwitchId, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    if (esColumnaAusente(error)) {
      return NextResponse.json(
        { error: "Falta correr la migración de cliente_switch_id en joybees_orders" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, clienteSwitchId, nombre, codigo });
}
