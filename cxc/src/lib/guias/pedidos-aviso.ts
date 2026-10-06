// ─────────────────────────────────────────────────────────────────────────────
// Aviso de la mañana: pedidos «Pendiente» de Guías › Pedidos con más de
// DIAS_PEDIDO_VIEJO días (6-oct-2026, aprobado por Daniel). Módulo PURO; el
// I/O vive en `app/api/cron/pedidos-pendientes/route.ts`.
//
// Mismos datos que la pestaña: `switch_pedidos` (la exclusión de clientes ya
// la hace el sync con `pedidoEntra`) + el estado de bodega; solo «pendiente».
// Sin ninguno viejo devuelve `null`: nunca un «todo al día».
// ─────────────────────────────────────────────────────────────────────────────

import { diasDesde, type PedidoBodega } from "@/lib/guias/pedidos-bodega";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";

/** Más de estos días = viejo (estrictamente mayor). */
export const DIAS_PEDIDO_VIEJO = 7;
/** Pedidos listados como mucho; el resto va como «y N más». */
export const MAX_PEDIDOS_EN_AVISO = 10;
/** Desde cuántos pedidos se agrupan por empresa. */
export const AGRUPAR_DESDE = 5;
export const URL_GUIAS_PEDIDOS = "https://www.fashiongr.com/guias?vista=pedidos";

type Fila = Pick<PedidoBodega, "empresa_key" | "secuencial" | "fecha" | "cliente_nombre" | "estado">;

export function mensajePedidosViejos(pedidos: readonly Fila[], hoy: string): string | null {
  const viejos = pedidos
    .filter((p) => p.estado === "pendiente")
    .map((p) => ({ ...p, dias: diasDesde(p.fecha, hoy) }))
    .filter((p) => p.dias > DIAS_PEDIDO_VIEJO)
    .sort((a, b) => b.dias - a.dias || a.secuencial.localeCompare(b.secuencial));
  if (viejos.length === 0) return null;

  const n = viejos.length;
  const titulo = `📦 ${n} ${n === 1 ? "pedido pendiente" : "pedidos pendientes"} de más de ${DIAS_PEDIDO_VIEJO} días`;
  const visibles = viejos.slice(0, MAX_PEDIDOS_EN_AVISO);
  const linea = (p: (typeof viejos)[number], conEmpresa: boolean) =>
    `• ${conEmpresa ? `${nombreCortoEmpresa(p.empresa_key)} · ` : ""}${p.cliente_nombre} · ${p.secuencial} · hace ${p.dias} d`;

  let cuerpo: string[];
  if (n >= AGRUPAR_DESDE) {
    // Grupos en el orden de su pedido más viejo (Map conserva la inserción).
    const grupos = new Map<string, typeof visibles>();
    for (const p of visibles) grupos.set(p.empresa_key, [...(grupos.get(p.empresa_key) ?? []), p]);
    cuerpo = [...grupos].flatMap(([k, ps]) => ["", nombreCortoEmpresa(k), ...ps.map((p) => linea(p, false))]);
  } else {
    cuerpo = visibles.map((p) => linea(p, true));
  }
  const extra = n > MAX_PEDIDOS_EN_AVISO ? [`…y ${n - MAX_PEDIDOS_EN_AVISO} más`] : [];
  return [titulo, ...cuerpo, ...extra, "", `Ver: ${URL_GUIAS_PEDIDOS}`].join("\n");
}
