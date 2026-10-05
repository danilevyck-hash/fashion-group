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

/** `false` = la pestaña no existe, la ruta contesta 404 y el cron no hace nada. */
export const PEDIDOS_BODEGA_2026_10 = true;

/** Quién ve la pestaña y marca (admin pasa siempre por `requireRole`). */
export const PEDIDOS_BODEGA_ROLES = ["admin", "bodega"] as const;

export function puedeVerPedidosBodega(role: string | null | undefined): boolean {
  return PEDIDOS_BODEGA_2026_10 && !!role && (PEDIDOS_BODEGA_ROLES as readonly string[]).includes(role);
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

export interface PedidoBodega {
  empresa_key: string;
  pedido_switch_id: number;
  secuencial: string;
  fecha: string;
  cliente_codigo: string;
  cliente_nombre: string;
  vendedor_nombre: string | null;
  estado: EstadoPedido;
  cambiado_por: string | null;
  cambiado_en: string | null;
}

/** Del más viejo al más nuevo; empate por número. */
export function ordenarPedidos<T extends Pick<PedidoBodega, "fecha" | "secuencial">>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.secuencial.localeCompare(b.secuencial));
}

const MS_DIA = 86_400_000;

/** Días enteros entre la fecha del pedido (día de Panamá) y hoy (YYYY-MM-DD de Panamá). */
export function diasDesde(fechaIso: string, hoy: string): number {
  const dia = fechaPanamaDe(fechaIso);
  return Math.max(0, Math.round((Date.parse(hoy) - Date.parse(dia)) / MS_DIA));
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

/** Switch da «2026-10-05 12:03:11», hora de Panamá (UTC−5 fijo). */
export function fechaSwitchAIso(f: string): string {
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})/.exec(f.trim());
  return m ? `${m[1]}T${m[2]}-05:00` : f;
}
