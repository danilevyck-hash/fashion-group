// ─────────────────────────────────────────────────────────────────────────────
// Guías › «Pedidos» para bodega (5-oct-2026). Lo PURO: interruptor, roles,
// los dos estados, la regla de exclusión y la línea de arriba.
//
// 🔑 Medido contra Switch el 5-oct-2026: `/apipedido/lista` sin `estatus`
// devuelve solo los «Activo», y un pedido facturado pasa a «Inactivo» (Fashion
// Wear: pedido 2732 $21.490,95 → factura 11-000003220 $21.490,95 el mismo día).
// O sea: Activo = falta facturar. Eso es lo que se lista.
//
// Decisiones de Daniel (5-oct-2026): SOLO 2 estados; NO se vincula a Etiquetas
// ni a Guías; fuera VENTAS/Contado (TCKCTA), ACTIVE SHOES, S.A. (12188) y todo
// cliente sin ficha en el directorio.
// ─────────────────────────────────────────────────────────────────────────────

import { fechaPanamaDe } from "@/lib/fecha-panama";
import { DEFAULT_VENDEDOR } from "@/lib/comisiones/vendedor-default";
import { nombreVendedorEnPantalla } from "@/lib/comisiones/alias";
import { AJUSTES_APPLE_6_2026_10 } from "@/lib/ajustes-apple-6-2026-10";
import { PEDIDOS_BULTOS_2026_10, ROLES_PREPARADO, ROLES_VERIFICADO } from "./pedidos-bultos";
import { PEDIDOS_FLUJO_SIMPLE_2026_10, ROLES_PREPARA_FLUJO_SIMPLE, ROLES_RECIBE_FLUJO_SIMPLE } from "./pedidos-flujo-simple";

/** `false` = la pestaña no existe, la ruta contesta 404 y el cron no hace nada. */
export const PEDIDOS_BODEGA_2026_10 = true;

/**
 * v2 (5-oct-2026, Daniel al ver el mockup): una tabla compacta también en el
 * celular, SIN monto (la ve bodega), la antigüedad («hace 3 días») en vez de
 * la fecha, chip «Empresa» simple (abre en Todas, sin acotar por persona), y la ven todos los
 * que tienen Guías — menos contabilidad, que no tiene Guías. `false` = como
 * antes. Se prende con el «sí» de Daniel.
 */
// 5-oct-2026: PRENDIDO. Daniel vio el mockup v2: «sí, me gustó».
export const PEDIDOS_TABLA_2026_10 = true;

/**
 * v3 (6-oct-2026): la lista AGRUPADA por empresa («Compañía debe tener más
 * protagonismo»), Vendedor solo con el nombre, la antigüedad en «43 d» en el
 * celular, y el botón «Imprimir» para bodega. `false` = la tabla v2 de hoy.
 * Se prende con el «sí» de Daniel al mockup.
 */
// 6-oct-2026: PRENDIDO. Daniel vio el mockup v3: «sí» (sin la línea de firmas al pie de cada bloque).
export const PEDIDOS_POR_EMPRESA_2026_10 = true;

/** Los que entran a Guías (`modules.ts`); contabilidad no. */
const ROLES_DE_GUIAS = ["admin", "secretaria", "bodega", "vendedor"] as const;

/**
 * Quién MARCA Pendiente ↔ Preparado y dispara «Actualizar» (admin pasa siempre
 * por `requireRole`). 6-oct-2026, Daniel al aprobar los seis ajustes: «los
 * permisos de Pedidos son iguales a los de Guías» → con `AJUSTES_APPLE_6_2026_10`
 * marcan todos los que ven Guías; apagado, solo admin y bodega.
 */
export const PEDIDOS_BODEGA_ROLES: readonly string[] = AJUSTES_APPLE_6_2026_10 ? ROLES_DE_GUIAS : ["admin", "bodega"];

/** Quién VE la pestaña: con v2, los mismos que entran a Guías (`modules.ts`); contabilidad no. */
export const PEDIDOS_VER_ROLES: readonly string[] = PEDIDOS_TABLA_2026_10
  ? ROLES_DE_GUIAS
  : PEDIDOS_BODEGA_ROLES;

export function puedeVerPedidosBodega(role: string | null | undefined): boolean {
  return PEDIDOS_BODEGA_2026_10 && !!role && PEDIDOS_VER_ROLES.includes(role);
}

/**
 * 🔴 EL VENDEDOR SOLO MIRA (Daniel, 7-oct-2026). 🩸 Con bultos veía el círculo y
 * la casilla del bulto PRENDIDOS y el servidor le contestaba 403: la pantalla
 * ofrecía lo que la ruta ya rechazaba. La lista de quién marca es la MISMA del
 * servidor, así que no puede haber dos respuestas.
 *
 * 🔴 Y con el flujo simplificado (7-oct-2026, segunda vuelta) «Preparado» lo
 * marca SOLO bodega: este botón usaba `ROLES_PREPARADO` del otro flujo (que
 * sí deja entrar a la secretaria) sin fijarse en qué flujo está prendido de
 * verdad — por eso la secretaria veía el botón. Ahora mira
 * `PEDIDOS_FLUJO_SIMPLE_2026_10` primero.
 */
export function puedeMarcarPedidos(role: string | null | undefined): boolean {
  const lista = PEDIDOS_FLUJO_SIMPLE_2026_10
    ? ROLES_PREPARA_FLUJO_SIMPLE
    : PEDIDOS_BULTOS_2026_10
      ? ROLES_PREPARADO
      : PEDIDOS_BODEGA_ROLES;
  return !!role && lista.includes(role);
}

/**
 * ¿Puede esta persona marcar el paso de CIERRE («Verificado» con bultos,
 * «Recibido» con el flujo simplificado)? Las dos listas de hoy son
 * admin+secretaria, pero cada flujo lee la SUYA para no quedar atado si una
 * de las dos cambia sin la otra.
 */
export function puedeRecibirPedidos(role: string | null | undefined): boolean {
  const lista = PEDIDOS_FLUJO_SIMPLE_2026_10 ? ROLES_RECIBE_FLUJO_SIMPLE : ROLES_VERIFICADO;
  return !!role && lista.includes(role);
}

/** Los DOS estados. Sin fila en `pedidos_bodega_estado` = «pendiente». */
export const ESTADOS_PEDIDO = ["pendiente", "preparado"] as const;
export type EstadoPedido = (typeof ESTADOS_PEDIDO)[number];
export const ROTULO_ESTADO: Record<EstadoPedido, string> = {
  pendiente: "Pendiente",
  preparado: "Preparado",
};

export function esEstadoPedido(v: unknown): v is EstadoPedido {
  return typeof v === "string" && (ESTADOS_PEDIDO as readonly string[]).includes(v);
}

/** Clientes que NUNCA entran, por CÓDIGO (nunca por nombre). */
export const CODIGOS_EXCLUIDOS = ["TCKCTA", "12188"] as const;

/** ¿Entra el pedido? Fuera: sin código, los excluidos y quien no tiene ficha. */
export function pedidoEntra(codigo: string | null | undefined, codigosConFicha: ReadonlySet<string>): boolean {
  const c = (codigo ?? "").trim().toUpperCase();
  if (!c) return false;
  if ((CODIGOS_EXCLUIDOS as readonly string[]).includes(c)) return false;
  return codigosConFicha.has(c);
}

/**
 * 🔴 Con `PEDIDOS_BULTOS_2026_10` los estados son TRES y ésta es la lista de
 * los TRES valores que la pantalla puede recibir: los dos de hoy —`pendiente` y
 * `preparado`, que NO cambian de nombre— más `verificado`. Así el tipo no miente durante la transición (los `estado` viejos
 * siguen llegando mientras la migración no corra, y se LEEN con `estadoLeido`).
 *
 * 🔴 Y con `PEDIDOS_FLUJO_SIMPLE_2026_10` (7-oct-2026) se suma `recibido` —
 * ver `pedidos-flujo-simple.ts`. Ningún valor viejo se renombra.
 */
export type EstadoPedidoCualquiera = EstadoPedido | "verificado" | "recibido" | "en_preparacion";

export interface PedidoBodega {
  empresa_key: string;
  pedido_switch_id: number;
  secuencial: string;
  fecha: string;
  cliente_codigo: string;
  cliente_nombre: string;
  vendedor_nombre: string | null;
  estado: EstadoPedidoCualquiera;
  cambiado_por: string | null;
  cambiado_en: string | null;
  /**
   * 🔴 CUÁNTOS BULTOS lleva armados (números de bulto distintos). `null` =
   * ninguno todavía, o la migración no corrió. Es la columna que quedó libre
   * al bajar el vendedor debajo del cliente (Daniel, 6-oct-2026).
   */
  bultos?: number | null;
  /**
   * 🔴 Las dos firmas, una por paso (6-oct-2026, `PEDIDOS_BULTOS_2026_10`):
   * «Preparado por Julio · 10:42 a. m.» · «Verificado por Angela · 11:15 a. m.».
   * Opcionales: sin la migración no llegan y la pantalla no las dibuja.
   */
  preparado_por?: string | null;
  preparado_en?: string | null;
  verificado_por?: string | null;
  verificado_en?: string | null;
  /** 🔴 Flujo simplificado (7-oct-2026): la firma de Recibido, el último paso. */
  recibido_por?: string | null;
  recibido_en?: string | null;
  /** 🔴 9-oct-2026: la firma de «En preparación» y la marca «En espera de muestra». */
  en_preparacion_por?: string | null;
  en_preparacion_en?: string | null;
  espera_muestra_desde?: string | null;
  espera_muestra_por?: string | null;
  espera_muestra_nota?: string | null;
  /**
   * 🔴 Cuántos artículos le faltan por poner en un bulto, y cuántos tiene en
   * total (7-oct-2026): es lo que apaga «Verificar» y dice QUÉ falta. Los cuenta
   * el SERVIDOR con la misma función que usa para rechazar el toque
   * (`faltaParaVerificar`). `null` = todavía no se sabe (la tabla del detalle no
   * contestó): ahí la pantalla no apaga nada y manda el servidor, como siempre.
   */
  articulos?: number | null;
  sin_bulto?: number | null;
  /**
   * 🔴 LAS PIEZAS DEL PEDIDO (7-oct-2026, Daniel: «¿puedes poner la cantidad
   * de pieza?»): la suma de `cantidad` de sus líneas, en los DOS flujos.
   * `null` = nadie abrió todavía el detalle de este pedido (no hay líneas
   * bajadas): la fila dice «—», nunca un 0 inventado.
   */
  piezas?: number | null;
}

/** Del más viejo al más nuevo; empate por número. */
export function ordenarPedidos<T extends Pick<PedidoBodega, "fecha" | "secuencial">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.secuencial.localeCompare(b.secuencial));
}

/**
 * La empresa manda (Daniel, 6-oct-2026: «Compañía debe tener más protagonismo»):
 * un grupo por empresa, cada uno del más viejo al más nuevo, y los grupos por su
 * pedido más viejo. Lo usan la pantalla y el papel.
 */
export function agruparPorEmpresa<T extends Pick<PedidoBodega, "fecha" | "secuencial" | "empresa_key">>(
  rows: readonly T[],
): { empresa_key: string; pedidos: T[] }[] {
  const grupos = new Map<string, T[]>();
  for (const r of ordenarPedidos(rows)) {
    const g = grupos.get(r.empresa_key);
    if (g) g.push(r);
    else grupos.set(r.empresa_key, [r]);
  }
  // `ordenarPedidos` ya dejó el más viejo primero: el orden de entrada al Map es el de los grupos.
  return [...grupos].map(([empresa_key, pedidos]) => ({ empresa_key, pedidos }));
}

const MS_DIA = 86_400_000;

/** Días enteros entre la fecha del pedido (día de Panamá) y hoy (YYYY-MM-DD de Panamá). */
export function diasDesde(fechaIso: string, hoy: string): number {
  const dia = fechaPanamaDe(fechaIso);
  return Math.max(0, Math.round((Date.parse(hoy) - Date.parse(dia)) / MS_DIA));
}

/** «hoy» · «ayer» · «hace N días», contra el día de Panamá. */
export function haceDias(fechaIso: string, hoy: string): string {
  const d = diasDesde(fechaIso, hoy);
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `hace ${d} días`;
}

/** Celular: «hoy» · «ayer» · «43 d», para que la Antigüedad no se parta en dos renglones. */
export function haceDiasCorto(fechaIso: string, hoy: string): string {
  const d = diasDesde(fechaIso, hoy);
  return d === 0 ? "hoy" : d === 1 ? "ayer" : `${d} d`;
}

/** «Pedidos pendientes · Joystep · impreso 6 oct 2026, 3:15 p. m.» — el encabezado del papel. */
export function tituloPedidosImpresos(estado: EstadoPedido, empresa: string | null, ahora: Date): string {
  const cuando = ahora
    .toLocaleString("es-PA", { timeZone: "America/Panama", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" })
    .replace(".", "");
  return `Pedidos ${estado === "pendiente" ? "pendientes" : "preparados"} · ${empresa ?? "Todas las empresas"} · impreso ${cuando}`;
}

/** «N pedidos pendientes · el más viejo, hace X días». */
export function lineaDePendientes(rows: readonly Pick<PedidoBodega, "fecha" | "estado">[], hoy: string): string {
  const pend = rows.filter((r) => r.estado === "pendiente");
  if (pend.length === 0) return "Sin pedidos pendientes";
  const n = `${pend.length} ${pend.length === 1 ? "pedido pendiente" : "pedidos pendientes"}`;
  const masViejo = pend.reduce((m, r) => (r.fecha < m ? r.fecha : m), pend[0].fecha);
  const d = diasDesde(masViejo, hoy);
  const hace = d === 0 ? "de hoy" : d === 1 ? "hace 1 día" : `hace ${d} días`;
  return `${n} · el más viejo, ${hace}`;
}

/** `AJUSTES_APPLE_6_2026_10`: «8 pendientes · el más viejo, 43 d», para que el título entre en una línea. */
export function lineaDePendientesCorta(rows: readonly Pick<PedidoBodega, "fecha" | "estado">[], hoy: string): string {
  const pend = rows.filter((r) => r.estado === "pendiente");
  if (pend.length === 0) return "Sin pedidos pendientes";
  const masViejo = pend.reduce((m, r) => (r.fecha < m ? r.fecha : m), pend[0].fecha);
  const n = `${pend.length} ${pend.length === 1 ? "pendiente" : "pendientes"}`;
  return pend.length === 1 ? `${n} · ${haceDiasCorto(masViejo, hoy)}` : `${n} · el más viejo, ${haceDiasCorto(masViejo, hoy)}`;
}

/** Switch da «2026-10-05 12:03:11», hora de Panamá (UTC−5 fijo). */
export function fechaSwitchAIso(f: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(f.trim());
  return m ? `${m[1]}T${m[2]}-05:00` : f;
}

/**
 * El vendedor como en el resto del sistema: DEFAULT es «Oficina» y el resto
 * pasa por `nombreVendedorEnPantalla` de Comisiones («REYNALDO ESPINOSA» →
 * «Reynaldo Espinosa»). La grafía de Switch ya viene colapsada por
 * `comision_vendedor_alias` desde la ruta (REINALDO → REYNALDO).
 */
export function vendedorEnPantalla(v: string | null | undefined): string {
  const n = (v ?? "").trim();
  if (!n) return "—";
  return n.toUpperCase() === DEFAULT_VENDEDOR ? "Oficina" : nombreVendedorEnPantalla(n);
}

/** «Fashion Shoes» → «F. Shoes»; una sola palabra queda igual. Para la columna angosta del celular (v2). */
export function abreviarEmpresa(nombre: string): string {
  const [a, ...resto] = nombre.trim().split(/\s+/);
  return resto.length ? `${a[0]}. ${resto.join(" ")}` : a;
}
