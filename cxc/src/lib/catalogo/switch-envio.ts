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
//
// ⏱️ POR QUÉ LA RESOLUCIÓN VA EN PARALELO (12-ago-2026). Daniel, con el TOM-015
// en "Revisando el pedido contra Switch…": *"este proceso demora mas que al
// hacer el pedido desde 0, porque?"*. Cada línea cuesta DOS llamadas a Switch
// (`/apiarticulos/lista?filtro=SKU` + `/apiarticulos/tallacolor`) y salían de a
// una, en fila india: medido contra producción, 30 líneas = **49,5 s**, y el
// camino del detalle las pedía DOS VECES (dry-run y POST real) → ~95 s. Ahora
// se resuelven de a `SKU_CONCURRENCIA` con `enParalelo`, el MISMO helper y la
// MISMA concurrencia que el sync de catálogos (que bajó de 471 s a 114 s con
// 478 llamadas), y el camino del detalle hace UN solo viaje (ver `auto`).
//
// Medido de punta a punta con el código real (`scripts/_medir-envio-switch.ts`,
// dry-run contra producción, medianas):
//
//   líneas │ en serie │ en paralelo ×4 │ camino del detalle (antes → ahora)
//   ───────┼──────────┼────────────────┼───────────────────────────────────
//      3   │  3,7 s   │     1,8 s      │  ~7 s  →  ~2 s
//     10   │ 13,6 s   │     2,8 s      │ ~27 s  →  ~3 s
//     30   │ 49,5 s   │     7,8 s      │ ~99 s  →  ~8 s
//
// ⚠️ **NO se puede bajar el NÚMERO de llamadas, y está probado contra la API
// real** (`scripts/_probe-envio-alternativas.ts`): `/apiarticulos/lista` NO
// acepta varios códigos en un `filtro` —se probaron `,` `, ` ` ` `|` `;` y los
// cinco devuelven CERO artículos—, y bajarse el catálogo entero cuesta más que
// las 2 llamadas por línea. Lo que se bajó es el tiempo de pared.
// ─────────────────────────────────────────────────────────────────────────────

import type { SupabaseClient } from "@supabase/supabase-js";
import { resolverLineas, resumirPedido } from "./lineas-pedido";
import { avisoPedidoEnviado } from "./telegram-pedido";
import { shortError } from "@/lib/telegram";
import { enviarNegocio, enviarSistema } from "@/lib/alertas/canal";
import {
  createSwitchClient,
  SwitchApiError,
  type SwitchPedidoLineaInput,
} from "@/lib/switch-api/client";
import { enParalelo } from "@/lib/switch-api/en-paralelo";
import { type AvisoEnvio, hayQueDetenerse, textosDeAvisos } from "./switch-prevalidacion";
import {
  DOCUMENTO_POR_DEFECTO,
  type DocumentoSwitch,
  esCotizacion,
  etiquetaDocumento,
} from "./documento-switch";
import {
  PROCESO_CAMBIO_PRECIO,
  TEXTO_PERMISO_NO_VERIFICADO,
  TEXTO_SIN_PERMISO_PRECIO,
  permisoCambiarPrecio,
} from "./permiso-precio";

const DESCUENTO_LINEA = "0.00";

/**
 * Cuántas líneas se resuelven contra Switch a la vez.
 *
 * 🔴 4 es el número YA PROBADO en este repo (`STOCK_CONCURRENCIA` del sync de
 * catálogos, medido: 471 s → 114 s con 478 llamadas). **No subirlo sin medir.**
 * La concurrencia solo es segura porque `client.ts` deduplica los logins en
 * vuelo (`loginEnVuelo`): Switch admite UN solo token válido por USUARIO (PDF
 * del API, p. 6; «una sesión por empresa» en la práctica, porque cada empresa
 * entra con un único usuario de API) y N logins simultáneos se matarían el
 * token entre sí (code 0006).
 */
const SKU_CONCURRENCIA = 4;

/**
 * Switch se cayó resolviendo una línea. Se lanza para que `enParalelo` aborte
 * la tanda entera (su primer error se propaga) y el motor devuelva
 * `switch_caido`, igual que hacía el `return` temprano del bucle serial.
 */
class SwitchCaidoError extends Error {}

/** Lo que produce UNA línea: su error o su línea resuelta, más sus avisos. */
interface ResolucionLinea {
  avisos: AvisoEnvio[];
  error?: string;
  linea?: EnvioLinea;
}

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
  /** Solo pre-validar: devuelve el `preview` y NO escribe nada. */
  dry?: boolean;
  /**
   * TOQUE ÚNICO (#509, un viaje solo desde 12-ago-2026): pre-valida y, si NO
   * hay nada que decidir (`hayQueDetenerse`), CREA el pedido en la misma
   * llamada. Si hay algo que decidir se detiene y devuelve `preview` /
   * `prevalidacion`, sin tocar Switch ni la tabla de envíos.
   *
   * 🔴 La regla de "¿hay algo que decidir?" es la MISMA función pura que usaba
   * la pantalla (`switch-prevalidacion`), no una copia: mover la decisión al
   * servidor evita el segundo viaje —que volvía a resolver TODOS los SKU
   * contra Switch— sin cambiar qué detiene el envío.
   */
  auto?: boolean;
  /**
   * QUÉ se crea en Switch: un PEDIDO (`/apipedido/terminar`, lo de siempre) o
   * una COTIZACIÓN (`/apicotizacion/terminar`). Ausente = pedido, que es lo que
   * este motor hacía antes de que existiera la elección.
   *
   * 🔴 Lo ÚNICO que cambia entre las dos es a qué ruta sale el POST y con qué
   * ruta se verifica después: el contrato del body es el MISMO (medido contra
   * producción, ver `documento-switch.ts`). Toda la pre-validación —SKU,
   * códigos de barra, precio 0, permiso 0001, tallas— es idéntica, y el candado
   * at-most-once tampoco distingue: un pedido sigue admitiendo UN envío
   * no-fallido, salga como pedido o como cotización.
   */
  documento?: DocumentoSwitch;
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
  // `lineas` viaja también acá: la pantalla de problema muestra los errores
  // ARRIBA y debajo las líneas que sí cruzaron, para poder ver el pedido entero
  // sin volver a consultar Switch.
  | { kind: "prevalidacion"; errores: string[]; warnings: string[]; avisos: AvisoEnvio[]; lineas: EnvioLinea[] }
  | { kind: "preview"; preview: { cliente: string; vendedor: string; lineas: EnvioLinea[]; warnings: string[]; avisos: AvisoEnvio[]; totalPiezas: number; totalEstimado: number } }
  | { kind: "carrera" }
  | { kind: "rechazado"; error: string; warnings: string[] }
  | { kind: "ambiguo"; error: string }
  // `pedidoSwitchId` puede venir null en una COTIZACIÓN: el nombre del id en la
  // respuesta de `/apicotizacion/terminar` no está medido (no se manda una
  // cotización de prueba a producción). Sin id no hay verificación, pero la
  // cotización quedó creada y su `numeroInterno` la identifica igual.
  | { kind: "ok"; numeroInterno: string; pedidoSwitchId: number | null; verificado: boolean; warnings: string[]; documento: DocumentoSwitch };

export async function enviarPedidoSwitch(p: EnvioParams): Promise<EnvioResult> {
  const documento: DocumentoSwitch = p.documento ?? DOCUMENTO_POR_DEFECTO;
  const cotizacion = esCotizacion(documento);
  // "Pedido" / "Cotización" — lo que dicen las alertas. Sale de la MISMA
  // función que rotula la pantalla: si un día cambia la palabra, cambia en los
  // dos lados o en ninguno.
  const queEs = etiquetaDocumento(documento);
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
  // Los avisos llevan CÓDIGO: la severidad la decide `switch-prevalidacion`, no
  // el texto (ver la cabecera de ese módulo). `warnings` se deriva de acá para
  // no tener dos listas que se puedan separar.
  const avisos: AvisoEnvio[] = [];
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

  // Una línea a la vez, sin tocar nada de afuera: devuelve lo suyo y el bucle
  // de abajo lo vuelca EN ORDEN. Los errores por línea siguen ACUMULÁNDOSE —
  // un SKU que no cruza no tumba a los demás.
  const resolverItem = async (item: EnvioItem): Promise<ResolucionLinea> => {
    const avisosItem: AvisoEnvio[] = [];
    const sku = (item.sku || "").trim();
    if (!sku) {
      return { avisos: avisosItem, error: `"${item.name || item.product_id}" no tiene SKU — no se puede cruzar con Switch` };
    }
    let articulo;
    try {
      const res = await client.getArticulos({ porPagina: 50, paginaActual: 1, filtro: sku });
      articulo = (res.articulos || []).find((a) => a.codigo === sku);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Aborta la tanda entera (enParalelo propaga el primer error), igual que
      // el `return` temprano del bucle serial.
      throw new SwitchCaidoError(`No se pudo consultar Switch (${msg}). Intenta de nuevo en unos minutos.`);
    }
    if (!articulo) {
      return { avisos: avisosItem, error: `SKU ${sku} no existe en Switch (${p.empresaKey})` };
    }
    if (articulo.codigoBarraId == null) {
      return { avisos: avisosItem, error: `SKU ${sku} no tiene código de barra en Switch — agregarlo en el panel antes de enviar` };
    }

    const precioSwitch = parseFloat(articulo.precio || "0");
    if (!(precioSwitch > 0)) {
      return { avisos: avisosItem, error: `SKU ${sku} tiene precio 0 en Switch — corregirlo en el panel antes de enviar` };
    }
    const precioCatalogo = Number(item.unit_price) || 0;
    if (Math.abs(precioSwitch - precioCatalogo) >= 0.01) {
      // Precio editable (5-jul): se envía el del PEDIDO, no el de lista.
      avisosItem.push({
        codigo: "precio_distinto",
        texto: `SKU ${sku}: precio del pedido $${precioCatalogo.toFixed(2)} ≠ lista Switch $${precioSwitch.toFixed(2)} — se enviará el del pedido`,
      });
    }

    // Advertir si el artículo tiene varias variantes talla/color en Switch: el
    // codigoBarraId de la lista es UNO de ellos (los catálogos no manejan tallas).
    try {
      const tc = await client.apiarticulosTallaColor({ articuloId: articulo.id });
      const variantes = new Set((tc.tallacolor || []).map((v) => v.codigoBarraId));
      if (variantes.size > 1) {
        avisosItem.push({
          codigo: "variantes_talla_color",
          texto: `SKU ${sku}: tiene ${variantes.size} variantes talla/color en Switch — se enviará el código de barra principal (id ${articulo.codigoBarraId})`,
        });
      }
    } catch {
      avisosItem.push({ codigo: "tallas_no_verificadas", texto: `SKU ${sku}: no se pudo verificar tallas/colores en Switch` });
    }

    // Las piezas YA vienen calculadas: acá no se multiplica nada (ver
    // `lineas-pedido.ts` — la multiplicación vive en un solo lugar del sistema).
    const resuelta = lineasResueltas.get(item.product_id);
    const piezas = resuelta?.piezas ?? 0;
    return {
      avisos: avisosItem,
      linea: {
        sku,
        descripcionSwitch: articulo.descripcion || item.name || sku,
        bultos: item.quantity || 0,
        piezas,
        precioCatalogo,
        precioSwitch,
        codigoBarraId: articulo.codigoBarraId,
      },
    };
  };

  let resoluciones: ResolucionLinea[];
  try {
    // `enParalelo` devuelve EN EL ORDEN DE ENTRADA (es su primer candado), así
    // que el pedido conserva el orden de sus líneas.
    resoluciones = await enParalelo(p.items, SKU_CONCURRENCIA, resolverItem);
  } catch (e) {
    if (e instanceof SwitchCaidoError) return { kind: "switch_caido", error: e.message };
    throw e;
  }
  for (const r of resoluciones) {
    avisos.push(...r.avisos);
    if (r.error) errores.push(r.error);
    else if (r.linea) lineas.push(r.linea);
  }

  if (errores.length) {
    return { kind: "prevalidacion", errores, warnings: textosDeAvisos(avisos), avisos, lineas };
  }

  // ¿Hay precios editados (≠ lista)? La doc exige verificar el permiso 0001
  // antes de un cambio de precio (pág 11). Si el usuario API no lo tiene →
  // error claro ANTES de intentar; si la verificación misma falla, seguimos
  // (terminar decide) con warning.
  //
  // La consulta pasa por `permisoCambiarPrecio`, el MISMO caché que usa la
  // pantalla al editar: preguntarlo mientras se edita y otra vez al enviar
  // cuesta UNA sola sesión de Switch dentro de la ventana (sesión única por
  // empresa). El "no" nunca se cachea — ver la cabecera de permiso-precio.ts.
  const hayPrecioEditado = lineas.some((l) => Math.abs(l.precioSwitch - l.precioCatalogo) >= 0.01);
  if (hayPrecioEditado) {
    const permiso = await permisoCambiarPrecio(p.empresaKey, () =>
      client.verificarPermiso(PROCESO_CAMBIO_PRECIO),
    );
    if (!permiso.permiso) {
      return {
        kind: "prevalidacion",
        errores: [TEXTO_SIN_PERMISO_PRECIO],
        warnings: textosDeAvisos(avisos),
        avisos,
        lineas,
      };
    }
    if (!permiso.verificado) {
      avisos.push({ codigo: "permiso_no_verificado", texto: TEXTO_PERMISO_NO_VERIFICADO });
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

  // `dry` = solo mirar. `auto` = seguir de largo SALVO que haya algo que
  // decidir; la regla es la MISMA función pura que usaba la pantalla, así que
  // qué detiene el envío no cambió — solo dejó de costar un viaje extra.
  if (p.dry || (p.auto && hayQueDetenerse({ errores: [], avisos }))) {
    return {
      kind: "preview",
      preview: {
        cliente: `${p.clienteNombre || "Cliente"} (id ${p.clienteId})`,
        vendedor: `${p.vendedorNombre || "Vendedor"} (id ${p.vendedorId})`,
        lineas,
        warnings: textosDeAvisos(avisos),
        avisos,
        totalPiezas: lineas.reduce((s, l) => s + l.piezas, 0),
        totalEstimado,
      },
    };
  }

  // ── Registro del intento ANTES del POST (at-most-once) ──
  //
  // ⚠️ `documento` se guarda para poder DECIR después qué se mandó, y va en su
  // propia columna (no adentro de `payload`): `payload` es el cuerpo EXACTO que
  // recibió Switch y ese cuerpo no lleva el campo. La escritura tolera que la
  // columna todavía no exista —el DDL puede estar pendiente— y en ese caso
  // guarda la fila igual: quedarse sin poder enviar por una etiqueta sería
  // peor que no tener la etiqueta.
  const payload = { vendedorId: p.vendedorId, clienteId: p.clienteId, articulos };
  const fila = { order_id: p.orderId, estado: "pendiente", payload };
  let insercion = await p.db.from(p.enviosTable).insert({ ...fila, documento }).select("id").single();
  if (insercion.error && /documento|column/i.test(insercion.error.message || "")) {
    insercion = await p.db.from(p.enviosTable).insert(fila).select("id").single();
  }
  const { data: envio, error: envioErr } = insercion;
  if (envioErr || !envio) {
    // 23505 = otro envío ganó la carrera (índice parcial)
    if (envioErr?.code === "23505") return { kind: "carrera" };
    return { kind: "switch_caido", error: `Error interno registrando el envío: ${envioErr?.message || "?"}` };
  }

  // ── POST real al ERP ──
  //
  // 🔴 La ÚNICA diferencia entre las dos salidas está en estas dos líneas: el
  // body es el mismo objeto `payload`, sin tocar. Lo demás —qué se valida, qué
  // se escribe y cuándo— es el mismo camino.
  let pedidoSwitchId: number | null;
  let numeroInterno: string;
  try {
    if (cotizacion) {
      const result = await client.apicotizacionTerminar(payload);
      // El nombre del id no está medido (no se manda una cotización de prueba a
      // producción): se prueban los tres y, si ninguno sirve, queda null.
      pedidoSwitchId = primerIdNumerico(result.cotizacionId, result.pedidoId, result.id);
      numeroInterno = String(result.numeroInterno);
    } else {
      const result = await client.apipedidoTerminar(payload);
      pedidoSwitchId = primerIdNumerico(result.pedidoId);
      numeroInterno = String(result.numeroInterno);
    }
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
      await enviarSistema(`🚨 Envío a Switch FALLÓ — ${p.marcaLabel} ${p.orderNumber} (${queEs}): ${shortError(e.message)} (se puede reintentar desde la confirmación)`);
      const detalle = hayPrecioEditado
        ? `Switch rechazó el cambio de precio: ${e.message}`
        : `Switch rechazó ${cotizacion ? "la cotización" : "el pedido"}: ${e.message}`;
      return { kind: "rechazado", error: detalle, warnings: textosDeAvisos(avisos) };
    }
    // Timeout / fallo de red: NO sabemos si el pedido se creó. Queda 'enviado'
    // sin número → bloquea reintentos; resolver a mano contra el panel Switch.
    const msg = e instanceof Error ? e.message : String(e);
    await p.db
      .from(p.enviosTable)
      .update({ estado: "enviado", error_detalle: `AMBIGUO (sin respuesta de Switch): ${msg}`, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
    await enviarSistema(`🚨 Envío a Switch AMBIGUO — ${p.marcaLabel} ${p.orderNumber} (${queEs}): Switch no respondió (${shortError(msg)}). REVISAR EL PANEL antes de reintentar.`);
    return {
      kind: "ambiguo",
      error: `Switch no respondió — ${cotizacion ? "la cotización" : "el pedido"} pudo o no haberse creado. Revisa el panel de Switch antes de reintentar.`,
    };
  }

  // ── Verificación post-escritura (GET /apipedido/info | /apicotizacion/info) ──
  //
  // Las dos rutas devuelven `detalle[]` con las mismas columnas (doc págs 50-51
  // y 45), así que se cuentan igual. Sin id no se puede verificar y se dice tal
  // cual: "sin verificar" nunca se disfraza de verificado.
  let verificado = false;
  if (pedidoSwitchId == null) {
    await p.db
      .from(p.enviosTable)
      .update({ error_detalle: `Creado pero sin verificar: Switch no devolvió el id de la ${queEs.toLowerCase()}`, updated_at: new Date().toISOString() })
      .eq("id", envio.id);
  } else {
    try {
      const info = cotizacion
        ? await client.apicotizacionInfo(pedidoSwitchId)
        : await client.apipedidoInfo(pedidoSwitchId);
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
  }

  // Mismo cuerpo que el aviso de creación (armador único en telegram-pedido.ts):
  // referencias · bultos · piezas · monto salen de las MISMAS líneas resueltas
  // que se acaban de enviar — no se recalcula nada.
  const resumen = resumirPedido([...lineasResueltas.values()]);
  await enviarNegocio(
    avisoPedidoEnviado({
      label: p.marcaLabel,
      numero: p.orderNumber,
      cliente: p.clienteNombre || `cliente ${p.clienteId}`,
      total: resumen.total,
      piezas: resumen.piezas,
      numeroSwitch: numeroInterno,
      verificado,
      documento,
    }),
  );

  return { kind: "ok", numeroInterno, pedidoSwitchId, verificado, warnings: textosDeAvisos(avisos), documento };
}

/**
 * El primer candidato que sea un id de verdad (entero > 0), o `null`.
 *
 * 🩸 `Number(undefined)` es `NaN` y `Number(null)` es `0`: cualquiera de los dos
 * escrito en `pedido_switch_id` sería un id que no existe, y después se
 * verificaría contra él. Un id inventado es peor que ningún id.
 */
function primerIdNumerico(...candidatos: Array<number | string | null | undefined>): number | null {
  for (const c of candidatos) {
    if (c === null || c === undefined || c === "") continue;
    const n = Number(c);
    if (Number.isFinite(n) && Number.isInteger(n) && n > 0) return n;
  }
  return null;
}
