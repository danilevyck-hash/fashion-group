"use client";

// Despachos › Muestras del VENDEDOR (Edwin: Vistana; Angel y Rey: las otras 5),
// 25-nov-2026, Daniel aprobó el mockup con 4 cambios. Una lista sin bandas, a
// todo el ancho: el pedido como renglón con su casilla (cliente · pedido,
// empresa y antigüedad en gris) y sus referencias debajo, sin estado: todo
// está por mandar, salvo «No llegó · reenviar» (rojo), que va ARRIBA de todo.
// Después, del pedido más viejo al más nuevo. Todo viene marcado; UN
// «Enviar N muestras» pide una sola guía o comentario.

import { useMemo, useState } from "react";
import VentanaCentrada from "@/components/ui/VentanaCentrada";
import { EnLaBarra, useHayBarraCelular } from "@/components/celular/BarraDeControles";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { haceDiasCorto } from "@/lib/guias/pedidos-bodega";
import { MAX_GUIA, esPorMandar, type PedidoDeMuestras } from "@/lib/guias/muestras";

const enviarN = (n: number) => (n === 1 ? "Enviar 1 muestra" : `Enviar ${n} muestras`);
const masVieja = (p: PedidoDeMuestras) => p.muestras.reduce((a, m) => (m.pedida_en < a ? m.pedida_en : a), p.muestras[0]?.pedida_en ?? "");
const noLlego = (m: { estado: string }) => m.estado === "no_llego";

/** «No llegó» arriba (pedido y referencia); después, del pedido más viejo al más nuevo. */
export function ordenDelVendedor(pedidos: readonly PedidoDeMuestras[]): PedidoDeMuestras[] {
  return pedidos
    .map((p) => ({ ...p, muestras: [...p.muestras].sort((a, b) => Number(noLlego(b)) - Number(noLlego(a))) }))
    .sort((a, b) => Number(b.muestras.some(noLlego)) - Number(a.muestras.some(noLlego)) || masVieja(a).localeCompare(masVieja(b)));
}

export default function MuestrasDelVendedor({ pedidos: tal, onEnviar }: {
  pedidos: readonly PedidoDeMuestras[];
  onEnviar: (ids: number[], guia: string) => void;
}) {
  const hoy = hoyPanama();
  const pedidos = useMemo(() => ordenDelVendedor(tal), [tal]);
  const barra = useHayBarraCelular();
  const porMandar = useMemo(() => pedidos.flatMap((p) => p.muestras.filter((m) => esPorMandar(m.estado)).map((m) => m.id)), [pedidos]);
  const [desmarcadas, setDesmarcadas] = useState<ReadonlySet<number>>(new Set());
  const marcadas = porMandar.filter((id) => !desmarcadas.has(id));
  const alternar = (ids: number[], marcar: boolean) =>
    setDesmarcadas((s) => {
      const n = new Set(s);
      for (const id of ids) (marcar ? n.delete(id) : n.add(id));
      return n;
    });
  const [abierto, setAbierto] = useState(false);
  const [guia, setGuia] = useState("");
  const nPedidos = pedidos.filter((p) => p.muestras.some((m) => marcadas.includes(m.id))).length;
  const abrir = () => { setGuia(""); setAbierto(true); };
  const enviar = () => { if (!guia.trim()) return; setAbierto(false); onEnviar(marcadas, guia.trim()); setDesmarcadas(new Set()); };

  const boton = porMandar.length > 0 && (
    <button type="button" disabled={marcadas.length === 0} onClick={abrir}
      className="min-h-[44px] rounded-md bg-black px-6 text-sm font-medium text-white active:scale-[0.97] disabled:opacity-40">
      {enviarN(marcadas.length)}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-3 sm:px-6 sm:py-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <p className="text-base font-semibold text-gray-900">{porMandar.length === 0 ? "Sin muestras por mandar" : `${porMandar.length} por mandar`}</p>
          {porMandar.length > 0 && <p className="text-xs text-gray-500">{marcadas.length} marcadas de {nPedidos} {nPedidos === 1 ? "pedido" : "pedidos"}</p>}
        </div>
        <span className="hidden sm:block">{boton}</span>
      </div>
      {pedidos.length > 0 && (
        <ul className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
          {pedidos.map((p) => {
            const ids = p.muestras.filter((m) => esPorMandar(m.estado)).map((m) => m.id);
            const mias = ids.filter((id) => !desmarcadas.has(id));
            const todas = ids.length > 0 && mias.length === ids.length;
            return (
              <li key={`${p.empresa_key}:${p.pedido_switch_id}`} className="border-b border-gray-200 last:border-b-0">
                <label className="flex items-center gap-3 px-4 pb-1 pt-3">
                  <input type="checkbox" checked={todas} ref={(el) => { if (el) el.indeterminate = mias.length > 0 && !todas; }}
                    onChange={(e) => alternar(ids, e.target.checked)} className="h-5 w-5 shrink-0 accent-black" aria-label={`Enviar las muestras del pedido ${p.pedido_switch_id}`} />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-gray-900">
                    {p.cliente_nombre} <span className="font-normal text-gray-500">· {p.pedido_switch_id}</span>
                  </span>
                  <span className="shrink-0 text-xs text-gray-500">{nombreCortoEmpresa(p.empresa_key)} · {haceDiasCorto(masVieja(p), hoy)}</span>
                </label>
                <ul className="pb-2">
                  {p.muestras.map((m) => (
                    <li key={m.id}>
                      <label className="flex items-start gap-3 py-1.5 pl-12 pr-4">
                        <input type="checkbox" checked={!desmarcadas.has(m.id)} onChange={(e) => alternar([m.id], e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-black" aria-label={`Enviar ${m.codigo}`} />
                        <span className="min-w-0 flex-1 text-sm text-gray-700">
                          <span className="tabular-nums">{m.codigo}</span>{m.descripcion ? ` · ${m.descripcion}` : ""}
                        </span>
                        {noLlego(m) && <span className="shrink-0 text-sm font-medium text-red-700">No llegó · reenviar</span>}
                      </label>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
      {boton && barra && <EnLaBarra accion={{ rotulo: enviarN(marcadas.length), onClick: abrir, disabled: marcadas.length === 0, sobreLaBarra: true }} />}
      <VentanaCentrada open={abierto} onClose={() => setAbierto(false)} title={enviarN(marcadas.length)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900">Cancelar</button>
            <button type="button" disabled={!guia.trim()} onClick={enviar} className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white disabled:opacity-40">Marcar enviadas</button>
          </div>
        }>
        <form className="px-5 py-4" onSubmit={(e) => { e.preventDefault(); enviar(); }}>
          <p className="mb-3 text-sm text-gray-600">{marcadas.length} {marcadas.length === 1 ? "muestra" : "muestras"} de {nPedidos} {nPedidos === 1 ? "pedido" : "pedidos"}, en un mismo envío.</p>
          <label htmlFor="guia-envio-v" className="block text-sm font-medium text-gray-900">Guía o comentario</label>
          <input id="guia-envio-v" value={guia} onChange={(e) => setGuia(e.target.value)} maxLength={MAX_GUIA} autoComplete="off"
            className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2.5 text-[16px] focus:border-black focus:outline-none" />
          <p className="mt-1 text-xs text-gray-500">Obligatorio. Queda en cada muestra enviada.</p>
        </form>
      </VentanaCentrada>
    </div>
  );
}
