// ─────────────────────────────────────────────────────────────────────────────
// Guías › Pedidos — el detalle del pedido y sus BULTOS, contra la base
// (6-oct-2026, `PEDIDOS_BULTOS_2026_10`)
//
// Lo que hace cada función:
//   · `leerLineas`      — las líneas de `pedidos_lineas` con su bulto.
//   · `bajarLineas`     — trae el detalle de Switch (`/apipedido/info`) y lo
//     guarda. Se llama SOLO si no hay líneas o están viejas.
//   · `ponerEnBulto`    — lo que hace «Poner en bulto…» con las líneas marcadas.
//   · `quitarDelBulto`  — deshacer ese toque.
//   · `crearEnvioDelPedido` — el envío de Etiquetas que nace con «Verificado».
//
// 🔴 EL DETALLE SE BAJA CUANDO ALGUIEN ABRE EL PEDIDO, no en el cron. El cron
// de `sync-pedidos` baja la LISTA (una llamada por empresa); bajar el detalle
// de cada pedido sería una llamada MÁS por pedido y por pasada, y Switch admite
// un solo token por usuario — el camino que ya desbordó los 800 s en el caso
// Boston. Abrir un pedido es UNA llamada, y queda guardada.
//
// 🔴 TODO FALLA ABIERTO. Sin la migración `20261231120000` el detalle dice que
// todavía no hay líneas; si Etiquetas no se puede crear, «Verificado» se marca
// igual y se dice. Nada de esto puede tumbar la pantalla de hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { esTablaAusente } from "@/lib/contable/tabla-ausente";
import { createSwitchClient } from "@/lib/switch-api/client";
import { anularEnvio, crearEnvio } from "./etiquetas-server";
import { validarEnvioNuevo } from "./etiquetas-por-envio";
import { TEXTO_TRASLADO } from "./atajos-facturas";
import { destinosDefinidosPara } from "./destinos-clientes";
import { leerDefinidosOVacio } from "./destinos-config-server";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import {
  cuantosBultos,
  cuantosSinBulto,
  faltaParaVerificar,
  notaDelPedido,
  todoAsignado,
  type LineaPedido,
} from "./pedidos-bultos";

/** Cada cuánto se vuelve a preguntar a Switch por el mismo pedido. */
export const HORAS_DETALLE_FRESCO = 6;

export interface DetalleDelPedido {
  lineas: LineaPedido[];
  /** De cuándo es el detalle; `null` = nunca se bajó. */
  bajado: string | null;
  /** `true` = la migración no corrió todavía. La pantalla lo dice y no se cae. */
  sinTabla: boolean;
}

interface FilaLinea {
  codigo_barra_id: number;
  orden: number;
  codigo: string;
  descripcion: string;
  talla: string | null;
  color: string | null;
  cantidad: number | string;
  precio: number | string;
  total: number | string;
  synced_at: string;
}

const num = (v: unknown): number => {
  const n = Number(String(v ?? "").replace(/,/g, ""));
  return Number.isFinite(n) ? n : 0;
};

// ─── Leer ────────────────────────────────────────────────────────────────────

/**
 * Las líneas del pedido con el bulto de cada una. Falla ABIERTO.
 *
 * 🔴 `conPlata = false` deja `precio` y `total` en `null` ANTES de que salgan de
 * aquí: a bodega esos números no le viajan (Daniel, 6-oct-2026). Esconder la
 * columna en el navegador no alcanza — escondida igual viaja.
 */
export async function leerLineas(
  empresaKey: string,
  pedidoId: number,
  conPlata = true,
): Promise<DetalleDelPedido> {
  const [lin, bul] = await Promise.all([
    supabaseServer
      .from("pedidos_lineas")
      .select("codigo_barra_id, orden, codigo, descripcion, talla, color, cantidad, precio, total, synced_at")
      .eq("empresa_key", empresaKey)
      .eq("pedido_switch_id", pedidoId)
      .order("orden"),
    supabaseServer
      .from("pedidos_linea_bulto")
      .select("codigo_barra_id, bulto")
      .eq("empresa_key", empresaKey)
      .eq("pedido_switch_id", pedidoId),
  ]);
  if (lin.error) {
    if (esTablaAusente(lin.error)) return { lineas: [], bajado: null, sinTabla: true };
    throw new Error(`pedidos_lineas: ${lin.error.message}`);
  }
  // El bulto es lo que marcó una persona: si no se puede leer, se dice «sin
  // asignar» antes que inventar una asignación.
  const deBulto = new Map<number, number>();
  if (!bul.error) for (const b of bul.data ?? []) deBulto.set(Number(b.codigo_barra_id), Number(b.bulto));

  let bajado: string | null = null;
  const lineas: LineaPedido[] = ((lin.data ?? []) as FilaLinea[]).map((f) => {
    if (!bajado || f.synced_at > bajado) bajado = f.synced_at;
    return {
      codigo_barra_id: Number(f.codigo_barra_id),
      codigo: f.codigo,
      descripcion: f.descripcion,
      talla: f.talla,
      color: f.color,
      cantidad: num(f.cantidad),
      precio: conPlata ? num(f.precio) : null,
      total: conPlata ? num(f.total) : null,
      bulto: deBulto.get(Number(f.codigo_barra_id)) ?? null,
    };
  });
  return { lineas, bajado, sinTabla: false };
}

/** ¿Hay que volver a preguntarle a Switch? Sin líneas, o pasadas las 6 h. */
export function hayQueBajar(d: Pick<DetalleDelPedido, "lineas" | "bajado">, ahora = Date.now()): boolean {
  if (d.lineas.length === 0 || !d.bajado) return true;
  return ahora - Date.parse(d.bajado) > HORAS_DETALLE_FRESCO * 3_600_000;
}

// ─── Bajar de Switch ─────────────────────────────────────────────────────────

/**
 * `/apipedido/info?pedidoId=` (doc §5.37) → `pedidos_lineas`. Devuelve cuántas
 * líneas quedaron. 🔴 Nunca borra: una línea que Switch ya no manda deja de
 * salir sola porque el upsert no la trae, y su bulto queda huérfano sin molestar
 * (la lectura une por `codigo_barra_id`, así que no aparece).
 */
export async function bajarLineas(empresaKey: string, pedidoId: number): Promise<number> {
  const client = createSwitchClient(empresaKey);
  const d = await client.apipedidoInfo(pedidoId);
  const detalle = Array.isArray(d?.detalle) ? d.detalle : [];
  const now = new Date().toISOString();
  const todas = detalle
    .map((l, i) => ({
      empresa_key: empresaKey,
      pedido_switch_id: pedidoId,
      codigo_barra_id: Number(l.codigoBarraId),
      orden: i + 1,
      articulo_id: Number.isFinite(Number(l.articuloId)) ? Number(l.articuloId) : null,
      codigo: String(l.codigoArticulo ?? "").trim() || "—",
      // La CATEGORÍA de Switch, tal cual.
      descripcion: String(l.descripcion ?? "").trim() || "—",
      // 🔑 Talla y color SÍ vienen separados. Se guardan como vienen —«-»
      // incluido—: ése es el «sin dato» de Switch y la pantalla ya lo entiende.
      talla: typeof l.talla === "string" ? l.talla.trim() || null : null,
      color: typeof l.color === "string" ? l.color.trim() || null : null,
      cantidad: num(l.cantidad),
      precio: num(l.precio),
      // 🔑 El total lo calcula Switch, con sus descuentos: no se recalcula.
      total: num(l.total ?? l.subTotalConDescuento),
      descuento: num(l.descuento),
      descuento_global: num(l.descuentoGlobal),
      synced_at: now,
    }))
    .filter((f) => Number.isFinite(f.codigo_barra_id));
  // Switch puede repetir un `codigoBarraId`; la PK no lo aguanta dos veces en
  // el MISMO upsert y PostgREST contesta con un error que no dice nada. Se
  // queda la PRIMERA aparición, que es el orden del pedido.
  const vistas = new Set<number>();
  const filas: typeof todas = [];
  for (const f of todas) {
    if (vistas.has(f.codigo_barra_id)) continue;
    vistas.add(f.codigo_barra_id);
    filas.push(f);
  }
  if (filas.length === 0) return 0;
  const { error } = await supabaseServer
    .from("pedidos_lineas")
    .upsert(filas, { onConflict: "empresa_key,pedido_switch_id,codigo_barra_id" });
  if (error) throw new Error(`upsert pedidos_lineas: ${error.message}`);
  return filas.length;
}

// ─── Poner y quitar del bulto ────────────────────────────────────────────────

/**
 * Las líneas marcadas quedan en ese bulto. Una línea está en UN bulto a la vez:
 * se borra lo que tenía y se escribe el nuevo, en ese orden.
 *
 * `cantidad` = la cantidad COMPLETA de la línea, porque hoy la pantalla no
 * parte líneas (Daniel, 6-oct-2026: «si complica, dejalo para después»). La
 * tabla ya aguanta la partición.
 */
export async function ponerEnBulto(
  empresaKey: string,
  pedidoId: number,
  codigoBarraIds: readonly number[],
  bulto: number,
  puestoPor: string,
): Promise<void> {
  if (codigoBarraIds.length === 0) return;
  const { lineas } = await leerLineas(empresaKey, pedidoId);
  const cantidadDe = new Map(lineas.map((l) => [l.codigo_barra_id, l.cantidad]));
  await quitarDelBulto(empresaKey, pedidoId, codigoBarraIds);
  const filas = codigoBarraIds
    .filter((id) => cantidadDe.has(id))
    .map((id) => ({
      empresa_key: empresaKey,
      pedido_switch_id: pedidoId,
      codigo_barra_id: id,
      bulto,
      cantidad: cantidadDe.get(id)!,
      puesto_por: puestoPor,
      puesto_en: new Date().toISOString(),
    }));
  if (filas.length === 0) return;
  const { error } = await supabaseServer
    .from("pedidos_linea_bulto")
    .upsert(filas, { onConflict: "empresa_key,pedido_switch_id,codigo_barra_id,bulto" });
  if (error) throw new Error(`pedidos_linea_bulto: ${error.message}`);
}

/** Saca esas líneas de cualquier bulto donde estuvieran. */
export async function quitarDelBulto(
  empresaKey: string,
  pedidoId: number,
  codigoBarraIds: readonly number[],
): Promise<void> {
  if (codigoBarraIds.length === 0) return;
  const { error } = await supabaseServer
    .from("pedidos_linea_bulto")
    .delete()
    .eq("empresa_key", empresaKey)
    .eq("pedido_switch_id", pedidoId)
    .in("codigo_barra_id", [...codigoBarraIds]);
  if (error && !esTablaAusente(error)) throw new Error(`pedidos_linea_bulto: ${error.message}`);
}

// ─── El envío de Etiquetas que nace con «Verificado» ─────────────────────────

export type ResultadoEnvioDelPedido =
  | { ok: true; envio_id: string; bultos: number }
  | { ok: false; motivo: string };

/**
 * Regla 6 (Daniel, 6-oct-2026): «al marcar Verificado, desde el pedido se crea el
 * envío de Etiquetas con el cliente, los bultos y el contenido ya puestos».
 *
 * 🔑 Un pedido NO TIENE FACTURA: «Activo» en Switch significa justamente que
 * falta facturar. Así que el envío entra por el camino de **traslado** de
 * Etiquetas (`secuencial = «Traslado»`, con su contenido en la nota), que es el
 * único que acepta un envío sin factura. Al facturarse, la etiqueta de la
 * factura se hace como siempre desde Etiquetas.
 *
 * 🔴 FALLA ABIERTA Y DEVUELVE EL MOTIVO: «Verificado» se marca igual. Sin destino
 * definido para ese cliente no se inventa uno — el destino es una decisión de
 * una persona (regla 4 de `docs/diseno.md`).
 */
export async function crearEnvioDelPedido(
  pedido: { empresa_key: string; pedido_switch_id: number; secuencial: string; cliente_codigo: string; cliente_nombre: string },
  creadoPor: string,
): Promise<ResultadoEnvioDelPedido> {
  const { lineas } = await leerLineas(pedido.empresa_key, pedido.pedido_switch_id);
  const bultos = cuantosBultos(lineas);
  if (bultos === 0) return { ok: false, motivo: "El pedido no tiene bultos todavía" };
  if (!todoAsignado(lineas)) return { ok: false, motivo: "Falta poner artículos en su bulto" };

  // «El de siempre» del cliente; sin él, no se inventa un destino.
  const definidos = destinosDefinidosPara(pedido.cliente_codigo, await leerDefinidosOVacio());
  const destino = definidos?.find((d) => d.elDeSiempre)?.destino ?? (definidos?.length === 1 ? definidos[0].destino : null);
  if (!destino) {
    // El aviso manda a la pantalla EXACTA: los destinos se administran en
    // Guías › Configuración (`guias_destino_cliente`), no en Etiquetas.
    return { ok: false, motivo: `${pedido.cliente_nombre} no tiene destino definido — ponlo en Guías › Configuración` };
  }

  const cuerpo = {
    empresa_key: pedido.empresa_key,
    cliente_codigo: pedido.cliente_codigo,
    cliente_nombre: pedido.cliente_nombre,
    destino,
    facturas: [
      {
        switch_factura_id: null,
        secuencial: TEXTO_TRASLADO,
        fecha_factura: new Date().toISOString().slice(0, 10),
        cajas: bultos,
        nota: notaDelPedido(pedido.secuencial),
      },
    ],
  };
  const v = validarEnvioNuevo(cuerpo);
  if (!v.ok) return { ok: false, motivo: v.error };
  const r = await crearEnvio(v.valor, creadoPor);
  if (!r.ok) return { ok: false, motivo: r.error };
  const envio_id = (r.etiquetas[0] as { envio_id?: string } | undefined)?.envio_id;
  return envio_id ? { ok: true, envio_id, bultos } : { ok: false, motivo: "El envío se creó sin número" };
}

/**
 * 🔴 QUÉ LE FALTA AL PEDIDO PARA PODER VERIFICARSE (Daniel, 7-oct-2026). Es el
 * CANDADO del servidor: antes esto solo impedía crear el envío de Etiquetas y
 * el pedido quedaba «Verificado» igual.
 *
 * `null` = no le falta nada. 🔴 FALLA ABIERTA: si la tabla del detalle todavía
 * no existe, no se puede saber y no se bloquea —el mismo trato que le da toda
 * la pantalla a la migración que no corrió—.
 */
export async function faltaParaVerificarPedido(
  empresaKey: string,
  pedidoId: number,
): Promise<string | null> {
  const d = await leerLineas(empresaKey, pedidoId);
  if (d.sinTabla) return null;
  return faltaParaVerificar(cuantosSinBulto(d.lineas), d.lineas.length);
}

/**
 * Cuántos artículos tiene el pedido, cuántos siguen sin bulto, y cuántas
 * PIEZAS (la suma de `cantidad` de sus líneas — Daniel, 7-oct-2026: «¿puedes
 * poner la cantidad de pieza?»), por pedido.
 */
export interface AsignacionDelPedido {
  articulos: number;
  sinBulto: number;
  /** Suma de `cantidad` de las líneas que ya se bajaron. `0` = sin líneas. */
  piezas: number;
}

/**
 * Para TODA la lista en DOS lecturas, no una por pedido: los artículos (con su
 * cantidad) de `pedidos_lineas` y los que ya tienen bulto en
 * `pedidos_linea_bulto`.
 * 🔴 FALLA ABIERTA: sin tabla devuelve un mapa vacío y la pantalla no apaga
 * nada (`sin_bulto` viaja en `null`) ni inventa piezas.
 */
export async function leerAsignacion(empresas: readonly string[]): Promise<Map<string, AsignacionDelPedido>> {
  const clave = (f: { empresa_key: string; pedido_switch_id: number | string }) => `${f.empresa_key}:${f.pedido_switch_id}`;
  const [lin, bul] = await Promise.all([
    supabaseServer
      .from("pedidos_lineas")
      .select("empresa_key, pedido_switch_id, cantidad")
      .in("empresa_key", [...empresas])
      .limit(50000),
    supabaseServer
      .from("pedidos_linea_bulto")
      .select("empresa_key, pedido_switch_id, codigo_barra_id")
      .in("empresa_key", [...empresas])
      .limit(50000),
  ]);
  const salida = new Map<string, AsignacionDelPedido>();
  if (lin.error || !lin.data) return salida;
  for (const f of lin.data) {
    const k = clave(f);
    const a = salida.get(k) ?? { articulos: 0, sinBulto: 0, piezas: 0 };
    salida.set(k, { ...a, articulos: a.articulos + 1, piezas: a.piezas + num(f.cantidad) });
  }
  // Una línea está en UN bulto a la vez, pero se cuentan las DISTINTAS por si
  // algún día se parte: lo asignado nunca puede pasar de los artículos.
  const conBulto = new Map<string, Set<number>>();
  if (!bul.error) {
    for (const f of bul.data ?? []) {
      const k = clave(f);
      (conBulto.get(k) ?? conBulto.set(k, new Set()).get(k)!).add(Number(f.codigo_barra_id));
    }
  }
  for (const [k, a] of salida) {
    salida.set(k, { ...a, sinBulto: Math.max(0, a.articulos - (conBulto.get(k)?.size ?? 0)) });
  }
  return salida;
}

/**
 * 🔴 EL DETALLE SE CONGELA AL VERIFICAR (Daniel, 7-oct-2026). 🩸 `PATCH
 * /api/guias/pedidos/detalle` no miraba el estado, así que bodega podía quitarle
 * bultos a un pedido ya verificado —y el envío de Etiquetas seguía diciendo el
 * número viejo—. Esta es la lectura que usa la ruta para rechazarlo.
 *
 * Devuelve `"pendiente"` cuando no hay fila, que es lo que significa no tenerla,
 * y falla ABIERTA: sin la tabla, el detalle se comporta como siempre.
 */
export async function estadoDelPedido(empresaKey: string, pedidoId: number): Promise<string> {
  const { data } = await supabaseServer
    .from("pedidos_bodega_estado")
    .select("estado")
    .eq("empresa_key", empresaKey)
    .eq("pedido_switch_id", pedidoId)
    .maybeSingle();
  return (data as { estado?: string | null } | null)?.estado ?? "pendiente";
}

export type ResultadoDeshacer = { ok: true } | { ok: false; error: string };

/**
 * 🔴 VOLVER A «PREPARADO» DESHACE EL ENVÍO DE ETIQUETAS QUE NACIÓ AL VERIFICAR
 * (Daniel, 7-oct-2026: «actualizar el envío… en vez de dejarlo huérfano con el
 * conteo viejo»).
 *
 * 🔑 El envío NO se corrige: la casa ya decidió el 1-oct-2026 que lo impreso no
 * se cambia —`corregirCajas` lo rechaza a propósito— y que un envío con un
 * número equivocado SE ANULA Y SE HACE DE NUEVO. Así que volver atrás anula el
 * envío (soft delete FIRMADO) y al verificar otra vez nace uno nuevo con los
 * bultos de ese momento, sin conteos viejos dando vueltas.
 *
 * 🔴 Y SI NO SE PUEDE ANULAR, SE DICE Y NO SE MUEVE NADA: un envío que ya salió
 * en una guía significa que esos bultos ya van rotulados y en un camión;
 * devolver el pedido a «Preparado» dejaría a bodega cambiando bultos que ya
 * viajaron. El motivo es el de Etiquetas, con su número de guía.
 * El envío que ya no está (404) no frena nada: no hay qué deshacer.
 */
export async function deshacerEnvioDelPedido(envioId: string, quien: string): Promise<ResultadoDeshacer> {
  const r = await anularEnvio(envioId, quien);
  if (r.ok || r.status === 404) return { ok: true };
  return { ok: false, error: r.error };
}

/** «Fashion Wear» para la pantalla y el papel. */
export const empresaCorta = nombreCortoEmpresa;
