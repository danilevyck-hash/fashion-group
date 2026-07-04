import { NextRequest, NextResponse } from "next/server";
import { reebokServer } from "@/lib/reebok-supabase-server";
import { requireRole } from "@/lib/requireRole";
import { getBultoSize } from "@/lib/reebok-bulto";
import { sendTelegramAlert } from "@/lib/telegram";
import {
  createSwitchClient,
  logoutAllSwitchSessions,
  SwitchApiError,
  type SwitchPedidoLineaInput,
} from "@/lib/switch-api/client";

/**
 * Envía un pedido Reebok confirmado al ERP Switch como PEDIDO real
 * (POST /apipedido/terminar, empresa active_shoes). Escritura NO fiscal:
 * un pedido en Switch se puede borrar desde el panel, a diferencia de una
 * factura.
 *
 * Diseño at-most-once: se registra el intento en reebok_switch_envios ANTES
 * del POST. El índice parcial (order_id WHERE estado <> 'error') bloquea un
 * segundo envío no-fallido. Un timeout/respuesta ambigua queda en 'enviado'
 * con error_detalle (bloquea reintentos → revisión humana contra el panel);
 * solo un rechazo claro del API (SwitchApiError, Switch no creó nada) marca
 * 'error' y permite reintentar. NO existe endpoint para anular pedidos.
 *
 * POST body { dry: true } → solo pre-validación (resuelve sku→codigoBarraId
 * y precio VIVOS contra Switch, junta advertencias), cero escrituras.
 */

export const dynamic = "force-dynamic";
// Varias llamadas secuenciales a Switch (lista + tallacolor por línea + terminar
// + info de verificación) no caben en el default de 10s.
export const maxDuration = 300;

const SEND_ROLES = ["admin", "secretaria"];

// Decisiones de Daniel para el piloto (4-jul-2026): todos los envíos van al
// cliente Contado con vendedor Reinaldo y sin descuento. Cliente/vendedor
// reales quedan para una fase posterior.
const SWITCH_EMPRESA = "active_shoes";
const CLIENTE_CONTADO_ID = 1; // "Contado" (codigo TCKCTA) en active_shoes
const VENDEDOR_REINALDO_ID = 2; // REINALDO ESPINOSA
const DESCUENTO_LINEA = "0.00";

const FALLBACK_CATEGORY = "apparel";

interface OrderItemRow {
  product_id: string;
  sku: string | null;
  name: string | null;
  quantity: number;
  unit_price: number;
  is_preorder: boolean | null;
}

interface PreviewLinea {
  sku: string;
  descripcionSwitch: string;
  bultos: number;
  piezas: number;
  precioCatalogo: number;
  precioSwitch: number;
  codigoBarraId: number;
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, SEND_ROLES);
  if (auth instanceof NextResponse) return auth;

  const { data, error } = await reebokServer
    .from("reebok_switch_envios")
    .select("estado, pedido_switch_id, numero_interno, error_detalle, created_at, updated_at")
    .eq("order_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Error interno" }, { status: 500 });
  return NextResponse.json({ envio: data ?? null });
}

async function handlePost(req: NextRequest, { params }: { params: { id: string } }) {
  const auth = requireRole(req, SEND_ROLES);
  if (auth instanceof NextResponse) return auth;

  let dry = false;
  try {
    const body = await req.json();
    dry = body?.dry === true;
  } catch {
    /* body vacío = envío real */
  }

  // ── Pedido + items ──
  const { data: order, error: orderErr } = await reebokServer
    .from("reebok_orders")
    .select("id, order_number, client_name, status, reebok_order_items(product_id, sku, name, quantity, unit_price, is_preorder)")
    .eq("id", params.id)
    .single();
  if (orderErr || !order) {
    return NextResponse.json({ error: "Pedido no encontrado" }, { status: 404 });
  }
  if (order.status !== "confirmado") {
    return NextResponse.json(
      { error: "Solo se pueden enviar a Switch pedidos confirmados" },
      { status: 400 },
    );
  }
  const items = (order.reebok_order_items || []) as OrderItemRow[];
  if (!items.length) {
    return NextResponse.json({ error: "El pedido no tiene productos" }, { status: 400 });
  }
  const preorders = items.filter((i) => i.is_preorder === true);
  if (preorders.length) {
    return NextResponse.json(
      { error: `El pedido tiene ${preorders.length} producto(s) en preventa — no se pueden enviar a Switch (sin inventario todavía)` },
      { status: 400 },
    );
  }

  // ── Idempotencia: un envío no-fallido bloquea otro intento ──
  const { data: existing } = await reebokServer
    .from("reebok_switch_envios")
    .select("id, estado, numero_interno")
    .eq("order_id", params.id)
    .neq("estado", "error")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return NextResponse.json(
      { error: `Este pedido ya fue enviado a Switch (${existing.numero_interno || existing.estado})` },
      { status: 409 },
    );
  }

  // ── Categorías para el bulto (Switch trabaja en PIEZAS, el pedido en bultos) ──
  const { data: prods } = await reebokServer
    .from("products")
    .select("id, category")
    .in("id", items.map((i) => i.product_id));
  const categoryMap = new Map((prods || []).map((p) => [p.id, p.category as string]));

  // ── Pre-validación VIVA contra Switch: sku → artículo (precio + codigoBarraId) ──
  const client = createSwitchClient(SWITCH_EMPRESA);
  const lineas: PreviewLinea[] = [];
  const warnings: string[] = [];
  const errores: string[] = [];

  for (const item of items) {
    const sku = (item.sku || "").trim();
    if (!sku) {
      errores.push(`"${item.name || item.product_id}" no tiene SKU — no se puede cruzar con Switch`);
      continue;
    }
    let articulo;
    try {
      const res = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: sku });
      articulo = (res.articulos || []).find((a) => a.codigo === sku);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return NextResponse.json(
        { error: `No se pudo consultar Switch (${msg}). Intenta de nuevo en unos minutos.` },
        { status: 502 },
      );
    }
    if (!articulo) {
      errores.push(`SKU ${sku} no existe en Switch (active_shoes)`);
      continue;
    }
    if (articulo.codigoBarraId == null) {
      errores.push(`SKU ${sku} no tiene código de barra en Switch — agregarlo en el panel antes de enviar`);
      continue;
    }

    const precioSwitch = parseFloat(articulo.precio || "0");
    if (!(precioSwitch > 0)) {
      errores.push(`SKU ${sku} tiene precio 0 en Switch — corregirlo en el panel antes de enviar`);
      continue;
    }
    const precioCatalogo = Number(item.unit_price) || 0;
    if (Math.abs(precioSwitch - precioCatalogo) >= 0.01) {
      warnings.push(
        `SKU ${sku}: precio del pedido $${precioCatalogo.toFixed(2)} ≠ precio Switch $${precioSwitch.toFixed(2)} — se enviará el de Switch`,
      );
    }

    // Advertir si el artículo tiene varias variantes talla/color en Switch:
    // el codigoBarraId de la lista es UNO de ellos y podría no ser la talla
    // correcta (el catálogo Reebok no maneja tallas).
    try {
      const tc = await client.apiarticulosTallaColor({ articuloId: articulo.id });
      const variantes = new Set((tc.tallacolor || []).map((v) => v.codigoBarraId));
      if (variantes.size > 1) {
        warnings.push(
          `SKU ${sku}: tiene ${variantes.size} variantes talla/color en Switch — se enviará el código de barra principal (id ${articulo.codigoBarraId})`,
        );
      }
    } catch {
      warnings.push(`SKU ${sku}: no se pudo verificar tallas/colores en Switch`);
    }

    const bultoSize = getBultoSize(categoryMap.get(item.product_id) || FALLBACK_CATEGORY);
    const piezas = (item.quantity || 0) * bultoSize;
    lineas.push({
      sku,
      descripcionSwitch: articulo.descripcion || item.name || sku,
      bultos: item.quantity || 0,
      piezas,
      precioCatalogo,
      precioSwitch,
      codigoBarraId: articulo.codigoBarraId,
    });
  }

  if (errores.length) {
    return NextResponse.json({ error: "El pedido no pasa la pre-validación", errores, warnings }, { status: 422 });
  }

  const articulos: SwitchPedidoLineaInput[] = lineas.map((l) => ({
    codigoBarraId: String(l.codigoBarraId),
    cantidad: l.piezas.toFixed(4),
    precio: l.precioSwitch.toFixed(2),
    descuento: DESCUENTO_LINEA,
  }));
  const totalEstimado = lineas.reduce((s, l) => s + l.piezas * l.precioSwitch, 0);

  if (dry) {
    return NextResponse.json({
      preview: {
        cliente: "Contado (id 1)",
        vendedor: "Reinaldo Espinosa (id 2)",
        lineas,
        warnings,
        totalPiezas: lineas.reduce((s, l) => s + l.piezas, 0),
        totalEstimado,
      },
    });
  }

  // ── Registro del intento ANTES del POST (at-most-once) ──
  const payload = {
    vendedorId: VENDEDOR_REINALDO_ID,
    clienteId: CLIENTE_CONTADO_ID,
    articulos,
  };
  const { data: envio, error: envioErr } = await reebokServer
    .from("reebok_switch_envios")
    .insert({ order_id: params.id, estado: "pendiente", payload })
    .select("id")
    .single();
  if (envioErr || !envio) {
    // 23505 = otro envío ganó la carrera (índice parcial)
    const status = envioErr?.code === "23505" ? 409 : 500;
    return NextResponse.json(
      { error: status === 409 ? "Este pedido ya tiene un envío en curso" : "Error interno" },
      { status },
    );
  }

  // ── POST real al ERP ──
  let pedidoSwitchId: number;
  let numeroInterno: string;
  try {
    const result = await client.apipedidoTerminar(payload);
    pedidoSwitchId = Number(result.pedidoId);
    numeroInterno = String(result.numeroInterno);
    await reebokServer
      .from("reebok_switch_envios")
      .update({ estado: "enviado", pedido_switch_id: pedidoSwitchId, numero_interno: numeroInterno, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
  } catch (e) {
    if (e instanceof SwitchApiError) {
      // Rechazo claro del API: Switch respondió con error → no creó el pedido.
      // Único caso que libera el candado (estado 'error' permite reintentar).
      await reebokServer
        .from("reebok_switch_envios")
        .update({ estado: "error", error_detalle: e.message, updated_at: new Date().toISOString() })
        .eq("id", envio.id);
      return NextResponse.json(
        { error: `Switch rechazó el pedido: ${e.message}`, warnings },
        { status: 502 },
      );
    }
    // Timeout / fallo de red: NO sabemos si el pedido se creó. Queda 'enviado'
    // sin número → bloquea reintentos; resolver a mano contra el panel Switch.
    const msg = e instanceof Error ? e.message : String(e);
    await reebokServer
      .from("reebok_switch_envios")
      .update({ estado: "enviado", error_detalle: `AMBIGUO (sin respuesta de Switch): ${msg}`, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
    return NextResponse.json(
      { error: "Switch no respondió — el pedido pudo o no haberse creado. Revisa el panel de Switch antes de reintentar.", ambiguo: true },
      { status: 502 },
    );
  }

  // ── Verificación post-escritura (GET /apipedido/info) ──
  let verificado = false;
  try {
    const info = await client.apipedidoInfo(pedidoSwitchId);
    if ((info.detalle || []).length === lineas.length) {
      verificado = true;
      await reebokServer
        .from("reebok_switch_envios")
        .update({ estado: "verificado", updated_at: new Date().toISOString() })
        .eq("id", envio.id);
    } else {
      await reebokServer
        .from("reebok_switch_envios")
        .update({ error_detalle: `Verificación: Switch reporta ${(info.detalle || []).length} líneas, se enviaron ${lineas.length}`, updated_at: new Date().toISOString() })
        .eq("id", envio.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await reebokServer
      .from("reebok_switch_envios")
      .update({ error_detalle: `Creado pero sin verificar: ${msg}`, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
  }

  await sendTelegramAlert(
    `📦 Pedido Reebok ${order.order_number} enviado a Switch → ${numeroInterno}${verificado ? " ✓ verificado" : " ⚠️ sin verificar"}`,
  );

  return NextResponse.json({ ok: true, numeroInterno, pedidoSwitchId, verificado, warnings });
}

// Higiene de sesión única: al terminar el envío —éxito o fallo— se cierra la
// sesión de Switch abierta por este proceso (POST /cierresesion, best-effort)
// para no matar el login del próximo cron de la misma empresa (code 0006).
export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  try {
    return await handlePost(req, ctx);
  } finally {
    await logoutAllSwitchSessions();
  }
}
