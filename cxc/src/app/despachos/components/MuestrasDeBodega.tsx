"use client";

// Despachos › Muestras para BODEGA (julio: todas; rodrigo y jorman: Vistana),
// 25-nov-2026, Daniel aprobó el mockup («Sí»). UNA lista: lo por mandar arriba y lo que viene en
// camino abajo. Un renglón por referencia: cliente · pedido, la referencia y
// su estado en una palabra. El único toque: «No llegó» en lo que viene.

import { esPorMandar, nombreDelVendedor, vendedorDeMuestra, type PedidoDeMuestras } from "@/lib/guias/muestras";

type Renglon = PedidoDeMuestras["muestras"][number] & { cliente: string; pedido: string };

export default function MuestrasDeBodega({ pedidos, onNoLlego }: {
  pedidos: readonly PedidoDeMuestras[];
  onNoLlego: (id: number) => void;
}) {
  const renglones: Renglon[] = pedidos.flatMap((p) =>
    p.muestras.map((m) => ({ ...m, cliente: p.cliente_nombre, pedido: String(p.pedido_switch_id) })),
  );
  const porMandar = renglones.filter((r) => esPorMandar(r.estado)).sort((a, b) => a.pedida_en.localeCompare(b.pedida_en));
  const enCamino = renglones.filter((r) => r.estado === "enviada").sort((a, b) => (a.enviada_en ?? "").localeCompare(b.enviada_en ?? ""));
  const lista = [...porMandar, ...enCamino];

  return (
    <div className="mx-auto max-w-3xl px-4 pb-28 pt-3 sm:px-6 sm:py-6">
      <p className="mb-3 text-base font-semibold text-gray-900">
        {porMandar.length} por mandar · {enCamino.length} en camino
      </p>
      {lista.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">Sin muestras pendientes</p>
      ) : (
        <ul className="-mx-4 divide-y divide-gray-100 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
          {lista.map((r) => {
            const viene = r.estado === "enviada";
            return (
              <li key={r.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900">
                    {r.cliente} <span className="font-normal text-gray-500">· {r.pedido}</span>
                  </p>
                  <p className="truncate text-sm text-gray-600">
                    <span className="tabular-nums">{r.codigo}</span>
                    {r.descripcion ? ` · ${r.descripcion}` : ""}
                  </p>
                </div>
                <div className="shrink-0 text-right text-sm">
                  {viene ? (
                    <>
                      <p className="text-gray-700">En camino{r.guia_envio?.trim() ? ` · ${r.guia_envio.trim()}` : ""}</p>
                      <button type="button" onClick={() => onNoLlego(r.id)} className="min-h-[32px] font-medium text-blue-600 active:opacity-60">
                        No llegó
                      </button>
                    </>
                  ) : (
                    <p className={r.estado === "no_llego" ? "font-medium text-red-700" : "text-amber-700"}>
                      {r.estado === "no_llego" ? "Reclamada" : "Por mandar"}
                      <span className="block text-xs text-gray-500">{nombreDelVendedor(vendedorDeMuestra(r.empresa_key))}</span>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
