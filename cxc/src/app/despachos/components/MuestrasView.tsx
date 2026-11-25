"use client";

// Despachos › «Muestras» (24-nov-2026, `MUESTRAS_2026_11`). La pregunta de la
// pantalla: «¿qué muestras me faltan por mandar?». La ve el vendedor que las
// manda (Vistana → edwin; las otras 5 → rey) y Daniel. Agrupada por pedido,
// de la más vieja a la más nueva; «Enviada» por referencia y «Enviar todas»
// por pedido. Al tocar, la referencia sale de la lista. El servidor decide
// quién puede (`/api/guias/muestras`).

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { Aviso } from "@/components/ui/Aviso";
import VentanaCentrada from "@/components/ui/VentanaCentrada";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import {
  MAX_GUIA,
  MUESTRAS_2026_11,
  edadEnDias,
  lineaPorMandar,
  lineaReclamada,
  muestraVieja,
  type PedidoDeMuestras,
} from "@/lib/guias/muestras";

/** Lo que el vendedor tiene por mandar; `null` = esta persona no manda muestras. */
export function useMuestrasPorMandar(activo: boolean) {
  const [pedidos, setPedidos] = useState<PedidoDeMuestras[] | null>(null);
  const [error, setError] = useState(false);
  const recargar = useCallback(async () => {
    if (!MUESTRAS_2026_11 || !activo) return;
    try {
      const r = await fetch("/api/guias/muestras", { cache: "no-store" });
      if (r.status === 403 || r.status === 404) return setPedidos(null);
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as { pedidos: PedidoDeMuestras[] };
      setPedidos(d.pedidos ?? []);
      setError(false);
    } catch {
      setError(true);
    }
  }, [activo]);
  useEffect(() => { void recargar(); }, [recargar]);
  const total = (pedidos ?? []).reduce((s, p) => s + p.muestras.length, 0);
  return { pedidos, setPedidos, error, recargar, total, visible: pedidos !== null };
}

export default function MuestrasView({ control }: { control: ReturnType<typeof useMuestrasPorMandar> }) {
  const { toast } = useToast();
  const { pedidos, setPedidos, error, recargar, total } = control;
  const ahora = new Date().toISOString();
  // «Enviada» / «Enviar todas» abren «N.° de guía» (opcional, UNA por caja):
  // la guía queda en todas las referencias de esa misma acción (25-nov-2026).
  const [porEnviar, setPorEnviar] = useState<number[] | null>(null);
  const [guia, setGuia] = useState("");
  const abrir = (ids: number[]) => { setGuia(""); setPorEnviar(ids); };

  async function enviar(ids: number[], guiaEnvio: string) {
    setPorEnviar(null);
    const antes = pedidos;
    // Optimista: sale de la lista al tocar; si falla, vuelve.
    setPedidos((ps) =>
      (ps ?? []).map((p) => ({ ...p, muestras: p.muestras.filter((m) => !ids.includes(m.id)) })).filter((p) => p.muestras.length > 0),
    );
    try {
      const r = await fetch("/api/guias/muestras", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "enviada", ids, guia: guiaEnvio.trim() || null }),
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

  if (error && !pedidos) return <div className="mx-auto max-w-3xl px-4 py-6"><Aviso tono="error">No se pudieron leer las muestras. Intenta de nuevo.</Aviso></div>;
  if (!pedidos) return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;

  const empresas = [...new Set(pedidos.map((p) => nombreCortoEmpresa(p.empresa_key)))].join(" · ");
  return (
    <div className="mx-auto max-w-3xl pb-6 sm:px-6 sm:pt-4">
      <div className="flex items-baseline justify-between gap-3 px-4 py-2 sm:px-0">
        <p className="text-[15px] font-semibold text-gray-900">{total === 0 ? "Sin muestras por mandar" : lineaPorMandar(total)}</p>
        {empresas && <p className="truncate text-sm text-gray-500">{empresas}</p>}
      </div>
      {pedidos.length > 0 && (
        <div className="border-y border-gray-200 bg-white sm:rounded-lg sm:border-x">
          {pedidos.map((p) => (
            <section key={`${p.empresa_key}:${p.pedido_switch_id}`} aria-label={`Pedido ${p.secuencial}`}>
              <header className="flex items-center justify-between gap-3 border-b border-gray-200 bg-gray-50 px-4 py-2">
                <div className="min-w-0">
                  <p className="text-[15px] font-medium tabular-nums text-gray-900">{p.secuencial}</p>
                  <p className="truncate text-sm text-gray-500">{p.cliente_nombre}</p>
                </div>
                {p.muestras.length > 1 && (
                  <button
                    type="button"
                    onClick={() => abrir(p.muestras.map((m) => m.id))}
                    className="min-h-[44px] shrink-0 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 transition active:scale-[0.97]"
                  >
                    Enviar todas
                  </button>
                )}
              </header>
              <ul className="divide-y divide-gray-100">
                {p.muestras.map((m) => {
                  const edad = edadEnDias(m.pedida_en, ahora);
                  const reclamada = lineaReclamada(m, ahora);
                  return (
                    <li key={m.id} className="flex items-center justify-between gap-3 border-b border-gray-100 px-4 py-2.5 last:border-b-0">
                      <div className="min-w-0">
                        <p className="text-[15px] font-semibold tabular-nums text-gray-900">{m.codigo}</p>
                        <p className="text-sm text-gray-500">
                          {m.descripcion ? `${m.descripcion} · ` : ""}
                          <span className={muestraVieja(edad.dias) ? "font-semibold text-red-700" : undefined}>{edad.texto}</span>
                        </p>
                        {reclamada && (
                          <span className="mt-1 inline-block rounded bg-red-50 px-1.5 py-0.5 text-xs font-semibold text-red-700">{reclamada}</span>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => abrir([m.id])}
                        className="min-h-[44px] shrink-0 rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]"
                      >
                        Enviada
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
      <VentanaCentrada
        open={porEnviar !== null}
        onClose={() => setPorEnviar(null)}
        title={porEnviar && porEnviar.length > 1 ? `Enviar ${porEnviar.length} muestras` : "Enviar muestra"}
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setPorEnviar(null)} className="min-h-[44px] rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 active:scale-[0.97]">
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => porEnviar && void enviar(porEnviar, guia)}
              className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white active:scale-[0.97]"
            >
              {porEnviar && porEnviar.length > 1 ? "Marcar enviadas" : "Marcar enviada"}
            </button>
          </div>
        }
      >
        <form
          className="px-5 py-4"
          onSubmit={(e) => { e.preventDefault(); if (porEnviar) void enviar(porEnviar, guia); }}
        >
          <label htmlFor="guia-envio" className="block text-sm font-medium text-gray-900">N.° de guía <span className="font-normal text-gray-500">(opcional)</span></label>
          <input
            id="guia-envio"
            value={guia}
            onChange={(e) => setGuia(e.target.value)}
            maxLength={MAX_GUIA}
            autoComplete="off"
            inputMode="text"
            className="mt-1.5 w-full rounded-md border border-gray-300 px-3 py-2.5 text-[16px] tabular-nums focus:border-black focus:outline-none"
          />
          <p className="mt-1.5 text-sm text-gray-500">Puedes dejarlo vacío.</p>
        </form>
      </VentanaCentrada>
    </div>
  );
}
