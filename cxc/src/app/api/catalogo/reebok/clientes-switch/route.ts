// Clientes Switch para el pedido Reebok (empresa active_shoes).
//
//   GET   ?q=       → busca en la tabla LOCAL switch_clientes (selector)
//   GET   ?orderId= → cliente Switch asignado a un pedido (nombre resuelto)
//   POST            → ALTA de cliente en el ERP (POST /apicliente/crear),
//                     patrón at-most-once espejo de los envíos de pedidos:
//                     registro previo en reebok_switch_altas_cliente + candado
//                     por índice parcial (un alta no-fallida por código).
//   PATCH           → asigna/quita el cliente Switch de un pedido
//                     (reebok_orders.cliente_switch_id; null = Contado).
//
// ESCRITURA REAL al ERP gated por rol admin/secretaria. El piloto del primer
// cliente real espera aprobación explícita de Daniel — el código queda listo,
// igual que se hizo con el botón de envíos.

import { NextRequest, NextResponse } from "next/server";
import { requireRole } from "@/lib/requireRole";
import { supabaseServer } from "@/lib/supabase-server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { sendTelegramAlert, shortError } from "@/lib/telegram";
import {
  createSwitchClient,
  logoutAllSwitchSessions,
  SwitchApiError,
  type SwitchClient,
  type SwitchClienteCrearParams,
} from "@/lib/switch-api/client";
import { validarAltaCliente } from "@/lib/catalogo/alta-cliente-validate";
import { MARCAS_CONFIG } from "@/lib/catalogo/marcas";

export const dynamic = "force-dynamic";
// Varias llamadas secuenciales a Switch (lista + impuestos + crear + verificación).
export const maxDuration = 300;

const ROLES = ["admin", "secretaria"];
const EMPRESA_KEY = MARCAS_CONFIG.reebok.empresaKey; // active_shoes
const ALTAS_TABLE = "reebok_switch_altas_cliente";
// Vendedor por defecto del alta: Reinaldo (id 2), consistente con los envíos.
const VENDEDOR_ID_DEFAULT = MARCAS_CONFIG.reebok.fallback?.vendedorId ?? 2;

function esTablaAusente(err: { code?: string | null; message?: string | null } | null): boolean {
  return /PGRST205|does not exist|could not find the table/i.test(
    `${err?.code ?? ""} ${err?.message ?? ""}`,
  );
}

function esColumnaAusente(err: { message?: string | null } | null): boolean {
  return /cliente_switch_id|column/i.test(err?.message ?? "");
}

// ─── Defaults resueltos EN VIVO (cache por proceso) ──────────────────────────
// impuestoId del impuesto "Regular" y tipoCliente "Consumidor Final": nunca
// hardcodear los ids — se resuelven por nombre contra Switch y se cachean.

let impuestoRegularCache: number | null = null;
// undefined = todavía no consultado; null = consultado y no existe (se omite).
let tipoConsumidorFinalCache: string | null | undefined = undefined;

async function resolverImpuestoRegular(client: SwitchClient): Promise<number> {
  if (impuestoRegularCache != null) return impuestoRegularCache;
  const data = await client.apiclienteImpuestos();
  const regular = (data.impuestos || []).find(
    (i) =>
      (i.nombre || "").toLowerCase().includes("regular") ||
      (i.codigo || "").trim().toUpperCase() === "R",
  );
  if (!regular || typeof regular.id !== "number") {
    throw new Error(
      `Switch no devolvió el impuesto "Regular" en /apicliente/impuestos (recibidos: ${(data.impuestos || [])
        .map((i) => i.nombre || i.codigo || "?")
        .join(", ") || "ninguno"})`,
    );
  }
  impuestoRegularCache = regular.id;
  return regular.id;
}

async function resolverTipoConsumidorFinal(client: SwitchClient): Promise<string | null> {
  if (tipoConsumidorFinalCache !== undefined) return tipoConsumidorFinalCache;
  try {
    const data = await client.apiclienteTiposCliente();
    const tipo = (data.tipos || []).find((t) =>
      (t.nombre || "").toLowerCase().replace(/\s+/g, " ").includes("consumidor final"),
    );
    tipoConsumidorFinalCache = tipo?.codigo ?? null;
  } catch {
    // Opcional según la doc — si el endpoint falla, se crea sin tipoCliente.
    return null;
  }
  return tipoConsumidorFinalCache;
}

// ─── GET: selector + cliente asignado a un pedido ────────────────────────────

export async function GET(req: NextRequest) {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  const sp = req.nextUrl.searchParams;
  const orderId = sp.get("orderId");

  if (orderId) {
    const { data, error } = await reebokServer
      .from("reebok_orders")
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

  // Selector: lista desde la tabla LOCAL (la llena el sync + las altas de aquí).
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
        { error: "Ese cliente no existe en el directorio Switch de Active Shoes" },
        { status: 404 },
      );
    }
    nombre = cli.nombre ?? null;
    codigo = cli.codigo ?? null;
  }

  // No cambiar el cliente de un pedido con envío no-fallido: el pedido YA vive
  // en Switch con el cliente con que se envió — cambiarlo aquí solo mentiría.
  const { data: envio } = await reebokServer
    .from("reebok_switch_envios")
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

  const { error } = await reebokServer
    .from("reebok_orders")
    .update({ cliente_switch_id: clienteSwitchId, updated_at: new Date().toISOString() })
    .eq("id", orderId);
  if (error) {
    if (esColumnaAusente(error)) {
      return NextResponse.json(
        { error: "Falta correr la migración de cliente_switch_id en reebok_orders" },
        { status: 503 },
      );
    }
    return NextResponse.json({ error: "Error interno" }, { status: 500 });
  }
  return NextResponse.json({ ok: true, clienteSwitchId, nombre, codigo });
}

// ─── POST: alta de cliente en el ERP ─────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    return await handleAlta(req);
  } finally {
    // Higiene de sesión única de Switch (mismo patrón que enviar-switch).
    await logoutAllSwitchSessions();
  }
}

async function handleAlta(req: NextRequest): Promise<NextResponse> {
  const auth = requireRole(req, ROLES);
  if (auth instanceof NextResponse) return auth;

  let body: { nombre?: unknown; telefono?: unknown; codigo?: unknown; orderId?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const valid = validarAltaCliente(body);
  if (!valid.ok) return NextResponse.json({ error: valid.error }, { status: 400 });
  const { nombre, codigo, telefono } = valid.value;
  const orderId = typeof body.orderId === "string" && body.orderId ? body.orderId : null;

  // (1) Candado local: ¿ya hay un alta no-fallida con este código?
  const { data: existing, error: existErr } = await reebokServer
    .from(ALTAS_TABLE)
    .select("id, estado, cliente_switch_id")
    .eq("codigo", codigo)
    .neq("estado", "error")
    .limit(1)
    .maybeSingle();
  if (existErr && esTablaAusente(existErr)) {
    return NextResponse.json(
      { error: "Falta correr la migración de reebok_switch_altas_cliente" },
      { status: 503 },
    );
  }
  if (existing) {
    return NextResponse.json(
      {
        error: `Ya hay un alta con el código ${codigo} (${existing.estado}) — usa otro código o revisa el panel de Switch`,
      },
      { status: 409 },
    );
  }

  const client = createSwitchClient(EMPRESA_KEY);

  // (2) Verificación EN VIVO: ¿el código ya existe en Switch?
  try {
    const res = await client.listClientes({ porPagina: 50, paginaActual: 1, filtro: codigo });
    const dup = (res.clientes || []).find(
      (c) => (c.codigo || "").trim().toLowerCase() === codigo.toLowerCase(),
    );
    if (dup) {
      return NextResponse.json(
        {
          error: `El código ${codigo} ya existe en Switch (${dup.nombre}) — selecciónalo de la lista en vez de crearlo`,
          clienteSwitchId: dup.id,
        },
        { status: 409 },
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      { error: `No se pudo consultar Switch (${msg}). Intenta de nuevo en unos minutos.` },
      { status: 502 },
    );
  }

  // Defaults resueltos en vivo ANTES de registrar el intento (son GETs: si
  // fallan aquí, no se quema el candado ni se toca el ERP).
  let impuestoId: number;
  try {
    impuestoId = await resolverImpuestoRegular(client);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
  const tipoCliente = await resolverTipoConsumidorFinal(client);

  const crearParams: SwitchClienteCrearParams = {
    codigo,
    nombre,
    impuestoId,
    vendedorId: VENDEDOR_ID_DEFAULT,
    ...(tipoCliente ? { tipoCliente } : {}),
    ...(telefono ? { telefono } : {}),
  };

  // (3) Registro del intento ANTES del POST (at-most-once).
  const { data: alta, error: altaErr } = await reebokServer
    .from(ALTAS_TABLE)
    .insert({ nombre, telefono, codigo, estado: "pendiente", payload: crearParams })
    .select("id")
    .single();
  if (altaErr || !alta) {
    // 23505 = otra alta ganó la carrera (índice parcial por código).
    if (altaErr?.code === "23505") {
      return NextResponse.json({ error: "Ya hay un alta en curso con ese código" }, { status: 409 });
    }
    if (esTablaAusente(altaErr)) {
      return NextResponse.json(
        { error: "Falta correr la migración de reebok_switch_altas_cliente" },
        { status: 503 },
      );
    }
    return NextResponse.json(
      { error: `Error interno registrando el alta: ${altaErr?.message || "?"}` },
      { status: 500 },
    );
  }

  // (4) POST real al ERP.
  let clienteSwitchId: number | null = null;
  try {
    const result = await client.apiclienteCrear(crearParams);
    const idNum = Number(result.clienteId);
    clienteSwitchId = Number.isFinite(idNum) && idNum > 0 ? idNum : null;
    await reebokServer
      .from(ALTAS_TABLE)
      .update({ estado: "enviado", cliente_switch_id: clienteSwitchId, updated_at: new Date().toISOString() })
      .eq("id", alta.id);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (e instanceof SwitchApiError && e.httpCode !== null) {
      // Rechazo CLARO del API: Switch no creó nada → liberar candado (error).
      await reebokServer
        .from(ALTAS_TABLE)
        .update({ estado: "error", error_detalle: msg, updated_at: new Date().toISOString() })
        .eq("id", alta.id);
      await sendTelegramAlert(
        `🚨 Alta de cliente en Switch FALLÓ — Reebok "${nombre}" (${codigo}): ${shortError(msg)} (se puede reintentar)`,
      );
      return NextResponse.json({ error: `Switch rechazó el alta: ${msg}` }, { status: 502 });
    }
    // Timeout / fallo de red: NO sabemos si el cliente se creó. Queda 'enviado'
    // sin id → bloquea reintentos; resolver a mano contra el panel de Switch.
    await reebokServer
      .from(ALTAS_TABLE)
      .update({
        estado: "enviado",
        error_detalle: `AMBIGUO (sin respuesta de Switch): ${msg}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", alta.id);
    await sendTelegramAlert(
      `🚨 Alta de cliente en Switch AMBIGUA — Reebok "${nombre}" (${codigo}): Switch no respondió (${shortError(msg)}). REVISAR EL PANEL antes de reintentar.`,
    );
    return NextResponse.json(
      {
        error: "Switch no respondió — el cliente pudo o no haberse creado. Revisa el panel de Switch antes de reintentar.",
        ambiguo: true,
      },
      { status: 502 },
    );
  }

  // (5) Verificación post-escritura: el código debe aparecer en /apicliente/lista.
  let verificado = false;
  try {
    const res = await client.listClientes({ porPagina: 50, paginaActual: 1, filtro: codigo });
    const creado = (res.clientes || []).find(
      (c) => (c.codigo || "").trim().toLowerCase() === codigo.toLowerCase(),
    );
    if (creado) {
      verificado = true;
      // Si crear no devolvió un clienteId usable, la lista es la verdad.
      if (clienteSwitchId == null && typeof creado.id === "number") clienteSwitchId = creado.id;
      await reebokServer
        .from(ALTAS_TABLE)
        .update({ estado: "verificado", cliente_switch_id: clienteSwitchId, updated_at: new Date().toISOString() })
        .eq("id", alta.id);
    } else {
      await reebokServer
        .from(ALTAS_TABLE)
        .update({
          error_detalle: `Verificación: el código ${codigo} no aparece en /apicliente/lista`,
          updated_at: new Date().toISOString(),
        })
        .eq("id", alta.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reebokServer
      .from(ALTAS_TABLE)
      .update({ error_detalle: `Creado pero sin verificar: ${msg}`, updated_at: new Date().toISOString() })
      .eq("id", alta.id);
  }

  // (6) Upsert a la tabla local switch_clientes (mismo shape que el sync,
  // persistClientesDirectorio) para que el selector lo vea SIN esperar al cron.
  if (clienteSwitchId != null) {
    const stamp = new Date().toISOString();
    const { error: upsertErr } = await supabaseServer.from("switch_clientes").upsert(
      {
        empresa_key: EMPRESA_KEY,
        cliente_switch_id: clienteSwitchId,
        codigo,
        nombre,
        razonsocial: null,
        email: null,
        telefono,
        celular: null,
        identificacion: null,
        raw_data: { id: clienteSwitchId, codigo, nombre, telefono, origen: "alta_catalogo_reebok" },
        synced_at: stamp,
        updated_at: stamp,
      },
      { onConflict: "empresa_key,cliente_switch_id", ignoreDuplicates: false },
    );
    if (upsertErr) console.error(`[clientes-switch] upsert local falló: ${upsertErr.message}`);
  }

  // (7) Guardar el cliente en el pedido que originó el alta (best-effort).
  if (orderId && clienteSwitchId != null) {
    const { error: ordErr } = await reebokServer
      .from("reebok_orders")
      .update({ cliente_switch_id: clienteSwitchId, updated_at: new Date().toISOString() })
      .eq("id", orderId);
    if (ordErr) console.error(`[clientes-switch] no se pudo asignar al pedido ${orderId}: ${ordErr.message}`);
  }

  await sendTelegramAlert(
    `👤 Cliente nuevo en Switch (Active Shoes): ${nombre} · código ${codigo} · id ${clienteSwitchId ?? "?"}${verificado ? " ✓ verificado" : " ⚠️ sin verificar"}`,
  );

  return NextResponse.json({ ok: true, clienteSwitchId, codigo, verificado });
}
