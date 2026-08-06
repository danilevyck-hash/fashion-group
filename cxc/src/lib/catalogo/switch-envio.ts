// ─────────────────────────────────────────────────────────────────────────────
// Motor COMPARTIDO de envío de pedidos de catálogo al ERP Switch (POST
// /apipedido/terminar). Port fiel del piloto Reebok (enviar-switch, verificado
// en vivo 4-jul-2026), parametrizado por marca: lo usan Reebok (active_shoes /
// reebok_switch_envios) y Joybees (joystep / joybees_switch_envios), tanto el
// checkout nuevo como el botón Reintentar.
//
// Diseño at-most-once (sin cambios vs el piloto): se registra el intento en la
// tabla de envíos ANTES del POST; el índice parcial (order_id WHERE estado <>
// 'error') bloquea un segundo envío no-fallido. Timeout/respuesta ambigua queda
// 'enviado' con error_detalle (bloquea reintentos → revisión humana); solo un
// rechazo claro del API marca 'error' y permite reintentar.
//
// NO hace logout — el route caller cierra la sesión en su finally
// (logoutAllSwitchSessions), para no cortar la sesión entre pre-validación y
// envío.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverLineas } from "./lineas-pedido";
import { shortError } from "@/lib/telegram";
import { enviarNegocio, enviarSistema } from "@/lib/alertas/canal";
import {
  createSwitchClient,
  SwitchApiError,
  type SwitchPedidoLineaInput,
} from "@/lib/switch-api/client";

const DESCUENTO_LINEA = "0.00";

export interface EnvioItem {
  product_id: string;
  sku: string | null;
  name: string | null;
  quantity: number; // BULTOS
  unit_price: number;
  is_preorder?: boolean | null;
}

export interface EnvioParams {
  /** Instancia Switch de la marca (Reebok=active_shoes, Joybees=joystep). */
  empresaKey: string;
  /** Tabla de envíos de la marca (reebok_switch_envios / joybees_switch_envios). */
  enviosTable: string;
  /** Cliente supabase de la marca (reebokServer / joybeesServer). */
  db: SupabaseClient;
  orderId: string;
  orderNumber: string;
  marcaLabel: string; // para la alerta Telegram
  items: EnvioItem[];
  /** Piezas por bulto según categoría del producto. */
  bultoSize: (category: string | null | undefined, bultoPzas?: number | null) => number;
  categoryByProduct: Map<string, string>;
  /**
   * Tommy: piezas por bulto POR PRODUCTO (`tommy_products.bulto_pzas`).
   *
   * 🩸 OBLIGATORIO A PROPÓSITO, aunque un mapa vacío se comporte igual que no
   * pasarlo. Cuando era opcional, dos de los tres llamadores no lo pasaban y el
   * pedido TOM-003 salió a Switch con 12 piezas de un estilo de 8. Que sea
   * obligatorio hace que el compilador encuentre al que falte. Se arma con
   * `leerCategoriaYBulto`, que devuelve este mapa junto con el de categorías.
   */
  bultoPzasByProduct: Map<string, number | null>;
  clienteId: number;
  clienteNombre?: string | null;
  vendedorId: number;
  vendedorNombre?: string | null;
  dry?: boolean;
}

export interface EnvioLinea {
  sku: string;
  descripcionSwitch: string;
  bultos: number;
  piezas: number;
  precioCatalogo: number;
  precioSwitch: number;
  codigoBarraId: number;
}

export type EnvioResult =
  | { kind: "preorders"; count: number }
  | { kind: "ya_enviado"; detalle: string }
  | { kind: "switch_caido"; error: string }
  | { kind: "prevalidacion"; errores: string[]; warnings: string[] }
  | { kind: "preview"; preview: { cliente: string; vendedor: string; lineas: EnvioLinea[]; warnings: string[]; totalPiezas: number; totalEstimado: number } }
  | { kind: "carrera" }
  | { kind: "rechazado"; error: string; warnings: string[] }
  | { kind: "ambiguo"; error: string }
  | { kind: "ok"; numeroInterno: string; pedidoSwitchId: number; verificado: boolean; warnings: string[] };

export async function enviarPedidoSwitch(p: EnvioParams): Promise<EnvioResult> {
  const preorders = p.items.filter((i) => i.is_preorder === true);
  if (preorders.length) return { kind: "preorders", count: preorders.length };

  // ── Idempotencia: un envío no-fallido bloquea otro intento ──
  const { data: existing } = await p.db
    .from(p.enviosTable)
    .select("id, estado, numero_interno")
    .eq("order_id", p.orderId)
    .neq("estado", "error")
    .limit(1)
    .maybeSingle();
  if (existing) {
    return { kind: "ya_enviado", detalle: String(existing.numero_interno || existing.estado) };
  }

  // ── Pre-validación VIVA contra Switch: sku → artículo (precio + codigoBarraId) ──
  const client = createSwitchClient(p.empresaKey);
  const lineas: EnvioLinea[] = [];
  const warnings: string[] = [];
  const errores: string[] = [];

  // Una sola resolución para todo el pedido — categoría, piezas por bulto,
  // piezas y subtotal. Todo lo de abajo LEE de acá.
  const lineasResueltas = new Map(
    resolverLineas(p.items, {
      bultoSize: p.bultoSize,
      categoryByProduct: p.categoryByProduct,
      bultoPzasByProduct: p.bultoPzasByProduct,
    }).map((l) => [l.product_id, l]),
  );

  for (const item of p.items) {
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
      return { kind: "switch_caido", error: `No se pudo consultar Switch (${msg}). Intenta de nuevo en unos minutos.` };
    }
    if (!articulo) {
      errores.push(`SKU ${sku} no existe en Switch (${p.empresaKey})`);
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
      // Precio editable (5-jul): se envía el del PEDIDO, no el de lista.
      warnings.push(
        `SKU ${sku}: precio del pedido $${precioCatalogo.toFixed(2)} ≠ lista Switch $${precioSwitch.toFixed(2)} — se enviará el del pedido`,
      );
    }

    // Advertir si el artículo tiene varias variantes talla/color en Switch: el
    // codigoBarraId de la lista es UNO de ellos (los catálogos no manejan tallas).
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

    // Las piezas YA vienen calculadas: acá no se multiplica nada (ver
    // `lineas-pedido.ts` — la multiplicación vive en un solo lugar del sistema).
    const resuelta = lineasResueltas.get(item.product_id);
    const piezas = resuelta?.piezas ?? 0;
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

  if (errores.length) return { kind: "prevalidacion", errores, warnings };

  // ¿Hay precios editados (≠ lista)? La doc exige verificar el permiso 0001
  // antes de un cambio de precio (pág 11). Si el usuario API no lo tiene →
  // error claro ANTES de intentar; si la verificación misma falla, seguimos
  // (terminar decide) con warning.
  const hayPrecioEditado = lineas.some((l) => Math.abs(l.precioSwitch - l.precioCatalogo) >= 0.01);
  if (hayPrecioEditado) {
    try {
      const permiso = await client.verificarPermiso("0001");
      if (!permiso) {
        return {
          kind: "prevalidacion",
          errores: ["El usuario de Switch no tiene permiso para cambiar precios (proceso 0001) — pedirlo al administrador de Switch o usar el precio de lista"],
          warnings,
        };
      }
    } catch {
      warnings.push("No se pudo verificar el permiso de cambio de precio (0001) — se intenta el envío igual");
    }
  }

  // Precio editable (5-jul, verificado en vivo 16-000000492: Switch respeta el
  // precio enviado, $30 sobre lista $35): va el precio del PEDIDO.
  const articulos: SwitchPedidoLineaInput[] = lineas.map((l) => ({
    codigoBarraId: String(l.codigoBarraId),
    cantidad: l.piezas.toFixed(4),
    precio: l.precioCatalogo.toFixed(2),
    descuento: DESCUENTO_LINEA,
  }));
  const totalEstimado = lineas.reduce((s, l) => s + l.piezas * l.precioCatalogo, 0);

  if (p.dry) {
    return {
      kind: "preview",
      preview: {
        cliente: `${p.clienteNombre || "Cliente"} (id ${p.clienteId})`,
        vendedor: `${p.vendedorNombre || "Vendedor"} (id ${p.vendedorId})`,
        lineas,
        warnings,
        totalPiezas: lineas.reduce((s, l) => s + l.piezas, 0),
        totalEstimado,
      },
    };
  }

  // ── Registro del intento ANTES del POST (at-most-once) ──
  const payload = { vendedorId: p.vendedorId, clienteId: p.clienteId, articulos };
  const { data: envio, error: envioErr } = await p.db
    .from(p.enviosTable)
    .insert({ order_id: p.orderId, estado: "pendiente", payload })
    .select("id")
    .single();
  if (envioErr || !envio) {
    // 23505 = otro envío ganó la carrera (índice parcial)
    if (envioErr?.code === "23505") return { kind: "carrera" };
    return { kind: "switch_caido", error: `Error interno registrando el envío: ${envioErr?.message || "?"}` };
  }

  // ── POST real al ERP ──
  let pedidoSwitchId: number;
  let numeroInterno: string;
  try {
    const result = await client.apipedidoTerminar(payload);
    pedidoSwitchId = Number(result.pedidoId);
    numeroInterno = String(result.numeroInterno);
    await p.db
      .from(p.enviosTable)
      .update({ estado: "enviado", pedido_switch_id: pedidoSwitchId, numero_interno: numeroInterno, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
  } catch (e) {
    if (e instanceof SwitchApiError) {
      // Rechazo claro del API: Switch no creó nada → liberar candado (estado error).
      await p.db
        .from(p.enviosTable)
        .update({ estado: "error", error_detalle: e.message, updated_at: new Date().toISOString() })
        .eq("id", envio.id);
      await enviarSistema(`🚨 Envío a Switch FALLÓ — ${p.marcaLabel} ${p.orderNumber}: ${shortError(e.message)} (se puede reintentar desde la confirmación)`);
      const detalle = hayPrecioEditado
        ? `Switch rechazó el cambio de precio: ${e.message}`
        : `Switch rechazó el pedido: ${e.message}`;
      return { kind: "rechazado", error: detalle, warnings };
    }
    // Timeout / fallo de red: NO sabemos si el pedido se creó. Queda 'enviado'
    // sin número → bloquea reintentos; resolver a mano contra el panel Switch.
    const msg = e instanceof Error ? e.message : String(e);
    await p.db
      .from(p.enviosTable)
      .update({ estado: "enviado", error_detalle: `AMBIGUO (sin respuesta de Switch): ${msg}`, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
    await enviarSistema(`🚨 Envío a Switch AMBIGUO — ${p.marcaLabel} ${p.orderNumber}: Switch no respondió (${shortError(msg)}). REVISAR EL PANEL antes de reintentar.`);
    return { kind: "ambiguo", error: "Switch no respondió — el pedido pudo o no haberse creado. Revisa el panel de Switch antes de reintentar." };
  }

  // ── Verificación post-escritura (GET /apipedido/info) ──
  let verificado = false;
  try {
    const info = await client.apipedidoInfo(pedidoSwitchId);
    if ((info.detalle || []).length === lineas.length) {
      verificado = true;
      await p.db
        .from(p.enviosTable)
        .update({ estado: "verificado", updated_at: new Date().toISOString() })
        .eq("id", envio.id);
    } else {
      await p.db
        .from(p.enviosTable)
        .update({ error_detalle: `Verificación: Switch reporta ${(info.detalle || []).length} líneas, se enviaron ${lineas.length}`, updated_at: new Date().toISOString() })
        .eq("id", envio.id);
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await p.db
      .from(p.enviosTable)
      .update({ error_detalle: `Creado pero sin verificar: ${msg}`, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
  }

  await enviarNegocio(
    `📦 Pedido ${p.marcaLabel} ${p.orderNumber} enviado a Switch → ${numeroInterno}${verificado ? " ✓ verificado" : " ⚠️ sin verificar"} · ${p.clienteNombre || `cliente ${p.clienteId}`} / ${p.vendedorNombre || `vendedor ${p.vendedorId}`}`,
  );

  return { kind: "ok", numeroInterno, pedidoSwitchId, verificado, warnings };
}
