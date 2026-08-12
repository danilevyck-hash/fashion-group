// Clientes Switch para el pedido de la marca (empresa cfg.empresaKey).
//
//   GET   ?q=       → busca en la tabla LOCAL switch_clientes (selector)
//   GET   ?orderId= → cliente Switch asignado a un pedido (nombre resuelto)
//   PATCH           → asigna/quita el cliente Switch de un pedido
//                     (<orders>.cliente_switch_id; null = Contado).
//
// Los clientes se crean SOLO desde el panel de Switch — aquí no hay alta.
//
// ROLES (12-ago-2026): los que ARMAN pedidos de la marca (`cfg.createRoles` sin
// el 'cliente' legacy), no solo admin+secretaria. Con el selector cerrado al
// vendedor, todo lo que él armaba se iba a Contado. Ver `clienteSwitchRoles`.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { getMarcaConfig } from "@/lib/catalogo/marcas";
import { clienteSwitchRoles } from "@/lib/catalogo/roles";
import { errorClienteNoExiste, parsearClienteSwitchId, resolverClienteSwitch } from "@/lib/catalogo/cliente-switch";

function esColumnaAusente(err: { message?: string | null } | null): boolean {
  return /cliente_switch_id|column/i.test(err?.message ?? "");
}

// ─── GET: selector + cliente asignado a un pedido ────────────────────────────

export async function GET(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, clienteSwitchRoles(cfg.createRoles));
  if (auth instanceof NextResponse) return auth;

  const supabaseServer = await cfg.mainDb();
  const sp = req.nextUrl.searchParams;
  const orderId = sp.get("orderId");

  if (orderId) {
    const db = await cfg.db();
    const { data, error } = await db
      .from(cfg.ordersTable)
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
      .eq("empresa_key", cfg.empresaKey)
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
    .eq("empresa_key", cfg.empresaKey)
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

export async function PATCH(req: NextRequest, { params }: { params: { marca: string } }) {
  const cfg = getMarcaConfig(params.marca);
  if (!cfg) return NextResponse.json({ error: "Marca desconocida" }, { status: 404 });

  const auth = requireRole(req, clienteSwitchRoles(cfg.createRoles));
  if (auth instanceof NextResponse) return auth;

  let body: { orderId?: unknown; clienteSwitchId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }
  const orderId = typeof body.orderId === "string" ? body.orderId : "";
  if (!orderId) return NextResponse.json({ error: "Falta orderId" }, { status: 400 });

  const db = await cfg.db();

  // clienteSwitchId: number = cliente real, null = Contado (mostrador).
  const parsed = parsearClienteSwitchId(body.clienteSwitchId);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });
  const clienteSwitchId = parsed.id;
  let nombre: string | null = null;
  let codigo: string | null = null;
  if (clienteSwitchId != null) {
    const cli = await resolverClienteSwitch(cfg, clienteSwitchId);
    if (!cli) return NextResponse.json({ error: errorClienteNoExiste(cfg) }, { status: 404 });
    nombre = cli.nombre;
    codigo = cli.codigo;
  }

  // No cambiar el cliente de un pedido con envío no-fallido: el pedido YA vive
  // en Switch con el cliente con que se envió — cambiarlo aquí solo mentiría.
  const { data: envio } = await db
    .from(cfg.enviosTable)
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

  const { error } = await db
    .from(cfg.ordersTable)
    .update({ cliente_switch_id: clienteSwitchId, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    if (esColumnaAusente(error)) {
      return NextResponse.json(
        { error: `Falta correr la migración de cliente_switch_id en ${cfg.ordersTable}` },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, clienteSwitchId, nombre, codigo });
}
