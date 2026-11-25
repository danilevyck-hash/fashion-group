"use client";

// Despachos › «Muestras» (25-nov-2026, `MUESTRAS_COMO_PEDIDOS_2026_11`, Daniel aprobó). La MISMA forma de
// Pedidos: banda por empresa con su cuenta y una fila por pedido (antigüedad,
// cliente, N.° de pedido · vendedor) con sus referencias adentro. Todo lo que
// está por mandar viene MARCADO; se desmarca por referencia o por pedido, y UNA
// acción, «Enviar N muestras», pide una sola «Guía o comentario» para todo lo
// marcado, de varios pedidos a la vez (Daniel: «la mayoría de las veces se
// envía en una guía de varios pedidos»). Bodega (Angel) mira en solo lectura y
// reclama «No llegó».

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { Aviso } from "@/components/ui/Aviso";
import VentanaCentrada from "@/components/ui/VentanaCentrada";
import { EnLaBarra, useHayBarraCelular } from "@/components/celular/BarraDeControles";
import MuestrasDeBodega from "./MuestrasDeBodega";
import MuestrasViewAnterior from "./MuestrasViewAnterior";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import { hoyPanama } from "@/lib/fecha-panama";
import { haceDias, haceDiasCorto, vendedorEnPantalla } from "@/lib/guias/pedidos-bodega";
import {
  MAX_GUIA,
  MUESTRAS_2026_11,
  MUESTRAS_COMO_PEDIDOS_2026_11,
  esPorMandar,
  lineaReclamada,
  nombreDelVendedor,
  vendedorDeMuestra,
  type MuestraLeida,
  type PedidoDeMuestras,
} from "@/lib/guias/muestras";

type Pedido = PedidoDeMuestras;

/** Lo que el vendedor tiene por mandar; `null` = esta persona no manda muestras. */
export function useMuestrasPorMandar(activo: boolean) {
  const [pedidos, setPedidos] = useState<Pedido[] | null>(null);
  const [error, setError] = useState(false);
  /** Lo dice el SERVIDOR: quien solo mira (Angel) no envía. */
  const [soloLectura, setSoloLectura] = useState(false);
  const recargar = useCallback(async () => {
    if (!MUESTRAS_2026_11 || !activo) return;
    try {
      const r = await fetch("/api/guias/muestras", { cache: "no-store" });
      if (r.status === 403 || r.status === 404) return setPedidos(null);
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { pedidos: Pedido[]; soloLectura?: boolean };
      setPedidos(d.pedidos ?? []);
      setSoloLectura(d.soloLectura === true);
      setError(false);
    } catch {
      setError(true);
    }
  }, [activo]);
  useEffect(() => { void recargar(); }, [recargar]);
  const total = (pedidos ?? []).reduce((s, p) => s + p.muestras.filter((m) => esPorMandar(m.estado)).length, 0);
  return { pedidos, setPedidos, error, recargar, total, soloLectura, visible: pedidos !== null };
}

const enviarN = (n: number) => (n === 1 ? "Enviar 1 muestra" : `Enviar ${n} muestras`);

function porEmpresa(pedidos: readonly Pedido[]): Array<{ empresa_key: string; pedidos: Pedido[] }> {
  const m = new Map<string, Pedido[]>();
  for (const p of pedidos) m.set(p.empresa_key, [...(m.get(p.empresa_key) ?? []), p]);
  return [...m.entries()].map(([empresa_key, ps]) => ({ empresa_key, pedidos: ps }));
}

/** La pedida más vieja del pedido: de ahí sale su antigüedad. */
const masVieja = (p: Pedido) => p.muestras.reduce((a, m) => (m.pedida_en < a ? m.pedida_en : a), p.muestras[0]?.pedida_en ?? "");

export default function MuestrasView({ control }: { control: ReturnType<typeof useMuestrasPorMandar> }) {
  if (!MUESTRAS_COMO_PEDIDOS_2026_11) return <MuestrasViewAnterior control={control} />;
  // 🔴 25-nov-2026: bodega (julio, rodrigo, jorman) ve UNA lista sin enviar nada.
  if (control.soloLectura) return <MuestrasParaBodega control={control} />;
  return <MuestrasPorPedido control={control} />;
}

function MuestrasParaBodega({ control }: { control: ReturnType<typeof useMuestrasPorMandar> }) {
  const { toast } = useToast();
  const { pedidos, error, recargar } = control;
  if (error && !pedidos) return <div className="mx-auto max-w-3xl px-4 py-6"><Aviso tono="error">No se pudieron leer las muestras. Intenta de nuevo.</Aviso></div>;
  if (!pedidos) return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;
  async function noLlego(id: number) {
    try {
      const r = await fetch("/api/guias/muestras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "no_llego", ids: [id] }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(d?.error ?? "No se pudo guardar. Intenta de nuevo.");
      toast("Muestra reclamada", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar.", "error");
    }
    void recargar();
  }
  return <MuestrasDeBodega pedidos={pedidos} onNoLlego={(id) => void noLlego(id)} />;
}

function MuestrasPorPedido({ control }: { control: ReturnType<typeof useMuestrasPorMandar> }) {
  const { toast } = useToast();
  const { pedidos, setPedidos, error, recargar, soloLectura } = control;
  const ahora = new Date().toISOString();
  const hoy = hoyPanama();
  const barra = useHayBarraCelular();

  const porMandar = useMemo(() => (pedidos ?? []).flatMap((p) => p.muestras.filter((m) => esPorMandar(m.estado)).map((m) => m.id)), [pedidos]);
  // 🔴 Todo lo por mandar viene MARCADO: lo normal es mandarlo todo junto.
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

  async function enviar(ids: number[], guiaEnvio: string) {
    setAbierto(false);
    const antes = pedidos;
    setPedidos((ps) => (ps ?? []).map((p) => ({ ...p, muestras: p.muestras.filter((m) => !ids.includes(m.id)) })).filter((p) => p.muestras.length > 0));
    try {
      const r = await fetch("/api/guias/muestras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "enviada", ids, guia: guiaEnvio.trim() }),
      });
      const d = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(d?.error ?? "No se pudo guardar. Intenta de nuevo.");
      toast(ids.length === 1 ? "Muestra enviada" : `${ids.length} muestras enviadas`, "success");
    } catch (e) {
      setPedidos(antes);
      toast(e instanceof Error ? e.message : "No se pudo guardar.", "error");
      void recargar();
    }
  }

  if (error && !pedidos) return <div className="mx-auto max-w-6xl px-4 py-6"><Aviso tono="error">No se pudieron leer las muestras. Intenta de nuevo.</Aviso></div>;
  if (!pedidos) return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;

  const pedidosMarcados = new Set((pedidos ?? []).filter((p) => p.muestras.some((m) => marcadas.includes(m.id))).map((p) => p.pedido_switch_id)).size;
  const linea = porMandar.length === 0 ? "Sin muestras por mandar" : `${porMandar.length} por mandar`;
  const sub = soloLectura
    ? "Solo lectura · las envía el vendedor"
    : `${marcadas.length} marcadas de ${pedidosMarcados} ${pedidosMarcados === 1 ? "pedido" : "pedidos"}`;

  const boton = !soloLectura && porMandar.length > 0 && (
    <button
      type="button"
      disabled={marcadas.length === 0}
      onClick={() => { setGuia(""); setAbierto(true); }}
      className="min-h-[44px] rounded-md bg-black px-6 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
    >
      {enviarN(marcadas.length)}
    </button>
  );

  return (
    <div className="mx-auto max-w-6xl px-4 pb-28 pt-3 sm:px-6 sm:py-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-gray-900">{linea}</p>
          <p className="text-xs text-gray-500">{sub}</p>
        </div>
        <span className="hidden sm:block">{boton}</span>
      </div>

      {pedidos.length > 0 && (
        <div className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
              <tr>
                {!soloLectura && <th className="w-10 py-2 pl-3"><span className="sr-only">Enviar</span></th>}
                <th className={`py-2 pr-1 sm:px-3 ${soloLectura ? "pl-3" : "pl-1"}`}><span className="sm:hidden">Antig.</span><span className="hidden sm:inline">Antigüedad</span></th>
                <th className="px-1 py-2 sm:px-3">Cliente</th>
                <th className="hidden py-2 sm:table-cell sm:px-3">Referencias</th>
              </tr>
            </thead>
            {porEmpresa(pedidos).map((g) => (
              <tbody key={g.empresa_key} className="divide-y divide-gray-100 align-top">
                <tr className="bg-gray-50">
                  <th colSpan={soloLectura ? 3 : 4} scope="colgroup" className="px-3 py-2 text-left text-sm font-semibold text-gray-900">
                    {nombreCortoEmpresa(g.empresa_key)} · {g.pedidos.length}
                    <span className="ml-2 font-normal text-gray-500">las envía {nombreDelVendedor(vendedorDeMuestra(g.empresa_key))}</span>
                  </th>
                </tr>
                {g.pedidos.map((p) => {
                  const abiertas = p.muestras.filter((m) => esPorMandar(m.estado)).map((m) => m.id);
                  const marcadasDelPedido = abiertas.filter((id) => !desmarcadas.has(id));
                  const todas = abiertas.length > 0 && marcadasDelPedido.length === abiertas.length;
                  const refs = (
                    <ul className="space-y-1.5">
                      {p.muestras.map((m) => (
                        <Referencia
                          key={m.id}
                          m={m}
                          ahora={ahora}
                          soloLectura={soloLectura}
                          marcada={!desmarcadas.has(m.id)}
                          onMarcar={(v) => alternar([m.id], v)}
                        />
                      ))}
                    </ul>
                  );
                  return (
                    <tr key={`${p.empresa_key}:${p.pedido_switch_id}`}>
                      {!soloLectura && (
                        <td className="py-2.5 pl-3">
                          <input
                            type="checkbox"
                            aria-label={`Enviar las muestras del pedido ${p.secuencial}`}
                            checked={todas}
                            ref={(el) => { if (el) el.indeterminate = marcadasDelPedido.length > 0 && !todas; }}
                            disabled={abiertas.length === 0}
                            onChange={(e) => alternar(abiertas, e.target.checked)}
                            className="h-5 w-5 accent-black"
                          />
                        </td>
                      )}
                      <td className={`whitespace-nowrap py-2.5 pr-1 text-gray-700 sm:px-3 ${soloLectura ? "pl-3" : "pl-1"}`}>
                        <span className="sm:hidden">{haceDiasCorto(masVieja(p), hoy)}</span>
                        <span className="hidden sm:inline">{haceDias(masVieja(p), hoy)}</span>
                      </td>
                      <td className="px-1 py-2.5 sm:w-[30%] sm:px-3">
                        <span className="font-medium text-blue-600">{p.cliente_nombre}</span>
                        <span className="block text-xs text-gray-500">
                          {p.secuencial}
                          {p.vendedor_nombre ? ` · ${vendedorEnPantalla(p.vendedor_nombre)}` : ""}
                        </span>
                        <div className="mt-2 sm:hidden">{refs}</div>
                      </td>
                      <td className="hidden py-2.5 sm:table-cell sm:px-3">{refs}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      )}

      {boton && barra && (
        <EnLaBarra accion={{ rotulo: enviarN(marcadas.length), onClick: () => { setGuia(""); setAbierto(true); }, disabled: marcadas.length === 0, sobreLaBarra: true }} />
      )}

      <VentanaCentrada
        open={abierto}
        onClose={() => setAbierto(false)}
        title={enviarN(marcadas.length)}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAbierto(false)} className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 active:scale-[0.97]">
              Cancelar
            </button>
            <button
              type="button"
              disabled={!guia.trim()}
              onClick={() => guia.trim() && void enviar(marcadas, guia)}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white active:scale-[0.97] disabled:opacity-40"
            >
              Marcar enviadas
            </button>
          </div>
        }
      >
        <form className="px-5 py-4" onSubmit={(e) => { e.preventDefault(); if (guia.trim()) void enviar(marcadas, guia); }}>
          <p className="mb-3 text-sm text-gray-600">
            {marcadas.length} {marcadas.length === 1 ? "muestra" : "muestras"} de {pedidosMarcados} {pedidosMarcados === 1 ? "pedido" : "pedidos"}, en un mismo envío.
          </p>
          <label htmlFor="guia-envio" className="block text-sm font-medium text-gray-900">Guía o comentario</label>
          <input
            id="guia-envio"
            value={guia}
            onChange={(e) => setGuia(e.target.value)}
            maxLength={MAX_GUIA}
            autoComplete="off"
            className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2.5 text-[16px] tabular-nums focus:border-black focus:outline-none"
          />
          <p className="mt-1 text-xs text-gray-500">Obligatorio. Queda en cada muestra enviada.</p>
        </form>
      </VentanaCentrada>
    </div>
  );
}

function Referencia({ m, ahora, soloLectura, marcada, onMarcar }: {
  m: MuestraLeida; ahora: string; soloLectura: boolean; marcada: boolean;
  onMarcar: (v: boolean) => void;
}) {
  const abierta = esPorMandar(m.estado);
  const reclamada = lineaReclamada(m, ahora);
  const estado = reclamada
      ? <span className="font-medium text-red-700">{reclamada}</span>
      : <span className="text-amber-700">{soloLectura ? `Por mandar · ${nombreDelVendedor(vendedorDeMuestra(m.empresa_key))}` : "Por mandar"}</span>;
  return (
    <li className="flex items-start gap-2.5">
      {!soloLectura && (
        <input
          type="checkbox"
          aria-label={`Enviar ${m.codigo}`}
          checked={abierta && marcada}
          disabled={!abierta}
          onChange={(e) => onMarcar(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-black"
        />
      )}
      <div className="min-w-0 flex-1 sm:flex sm:items-baseline sm:justify-between sm:gap-4">
        <p className="min-w-0">
          <span className="font-semibold tabular-nums text-gray-900">{m.codigo}</span>
          {m.descripcion && <span className="text-gray-500"> · {m.descripcion}</span>}
        </p>
        <p className="shrink-0 text-xs sm:text-sm">
          {estado}
        </p>
      </div>
    </li>
  );
}
