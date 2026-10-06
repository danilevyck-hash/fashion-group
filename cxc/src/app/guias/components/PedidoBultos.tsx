"use client";

// ─────────────────────────────────────────────────────────────────────────────
// EL DETALLE DE UN PEDIDO, CON SUS BULTOS (6-oct-2026, `PEDIDOS_BULTOS_2026_10`)
//
// La pregunta de la pantalla: «¿en qué bulto va cada cosa de este pedido?».
//
// Se ve como el PDF de pedido de Switch, SIN la columna «Código barra»:
//   Código · Referencia · Descripción · Cantidad · Precio · Total · Bulto
//
// Bodega marca varias líneas con casillas y toca «Poner en bulto…», escribe el
// número y esas líneas quedan ahí. Repite hasta terminar. Arriba se lee
// «18 de 24 artículos asignados · 6 bultos».
//
// 🔑 Lo medido: 416 bultos y 56 líneas en un envío real. Por eso el bulto se
// ESCRIBE en un campo angosto (regla 9 de `docs/diseno.md`) y no se elige de una
// lista de 416; y por eso la barra de abajo es UNA sola acción, con el resultado
// en vivo (regla 3).
//
// 🔑 Talla y color van DENTRO de la descripción: Switch no los manda aparte y
// así se muestran.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { useToast } from "@/components/ToastSystem";
import { Aviso } from "@/components/ui/Aviso";
import { usePublicarAltoBarraFija } from "@/lib/navegacion/useBarraFijaAbajo";
import { descargarArchivo } from "@/lib/compartir-archivo";
import { fmt } from "@/lib/format";
import { nombreCortoEmpresa } from "@/lib/empresa-mapping";
import {
  COLUMNAS_DETALLE,
  MAX_BULTO,
  MIN_BULTO,
  descripcionCompleta,
  resumenAsignacion,
  validarBulto,
  type LineaPedido,
} from "@/lib/guias/pedidos-bultos";

export interface PedidoDelDetalle {
  empresa_key: string;
  pedido_switch_id: number;
  secuencial: string;
  cliente_codigo: string;
  cliente_nombre: string;
}

interface Respuesta {
  lineas: LineaPedido[];
  resumen: string;
  sinTabla: boolean;
  error?: string;
}

export default function PedidoBultos({
  pedido,
  puedePoner,
  onVolver,
}: {
  pedido: PedidoDelDetalle;
  /** Bodega pone bultos; quien solo mira ve la columna, quieta. */
  puedePoner: boolean;
  onVolver: () => void;
}) {
  const { toast } = useToast();
  const [lineas, setLineas] = useState<LineaPedido[] | null>(null);
  const [sinTabla, setSinTabla] = useState(false);
  const [error, setError] = useState(false);
  const [marcadas, setMarcadas] = useState<ReadonlySet<number>>(new Set());
  const [pidiendoBulto, setPidiendoBulto] = useState(false);
  const [numero, setNumero] = useState("");
  const [guardando, setGuardando] = useState(false);
  // La barra de abajo publica su alto para que el ☰ redondo del celular se le
  // suba encima (`useBarraFijaAbajo`), como las otras cinco barras negras.
  const barraRef = useRef<HTMLDivElement | null>(null);
  usePublicarAltoBarraFija(barraRef, puedePoner && marcadas.size > 0);

  const clave = `empresa_key=${encodeURIComponent(pedido.empresa_key)}&pedido_switch_id=${pedido.pedido_switch_id}`;

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const r = await fetch(`/api/guias/pedidos/detalle?${clave}`, { cache: "no-store" });
        if (!r.ok) throw new Error(String(r.status));
        const d = (await r.json()) as Respuesta;
        if (!vivo) return;
        setLineas(d.lineas);
        setSinTabla(d.sinTabla);
        setError(false);
      } catch {
        if (vivo) setError(true);
      }
    })();
    return () => {
      vivo = false;
    };
  }, [clave]);

  const resumen = useMemo(() => (lineas ? resumenAsignacion(lineas) : ""), [lineas]);

  function alternar(id: number) {
    setMarcadas((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function marcarTodas(todas: boolean) {
    setMarcadas(todas ? new Set((lineas ?? []).map((l) => l.codigo_barra_id)) : new Set());
  }

  /** `bulto: null` = quitar del bulto. */
  async function guardar(bulto: number | null) {
    setGuardando(true);
    try {
      const r = await fetch("/api/guias/pedidos/detalle", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_key: pedido.empresa_key,
          pedido_switch_id: pedido.pedido_switch_id,
          codigo_barra_ids: [...marcadas],
          bulto,
        }),
      });
      const d = (await r.json().catch(() => null)) as Respuesta | null;
      if (!r.ok) throw new Error(d?.error ?? String(r.status));
      setLineas(d?.lineas ?? []);
      setMarcadas(new Set());
      setPidiendoBulto(false);
      setNumero("");
      toast(bulto == null ? "Artículos sin bulto" : `Artículos en el bulto ${bulto}`, "success");
    } catch (e) {
      toast(e instanceof Error && e.message.length < 90 ? e.message : "No se pudo guardar el bulto. Intenta de nuevo.", "error");
    } finally {
      setGuardando(false);
    }
  }

  function confirmarBulto() {
    const v = validarBulto(numero);
    if (!v.ok) return toast(v.error, "warning");
    void guardar(v.valor!);
  }

  async function imprimir() {
    try {
      const { construirPdfPedidoBultos } = await import("@/lib/guias/pdf-pedido-bultos");
      const doc = construirPdfPedidoBultos({
        secuencial: pedido.secuencial,
        empresa: nombreCortoEmpresa(pedido.empresa_key),
        cliente: pedido.cliente_nombre,
        lineas: lineas ?? [],
      });
      doc.autoPrint();
      if (!window.open(doc.output("bloburl") as unknown as string, "_blank")) {
        descargarArchivo(new File([doc.output("blob")], `bultos-${pedido.secuencial}.pdf`, { type: "application/pdf" }));
        toast("Papel descargado — ábrelo para imprimir", "success");
      }
    } catch {
      toast("No se pudo preparar el papel. Intenta de nuevo.", "error");
    }
  }

  const todasMarcadas = !!lineas && lineas.length > 0 && marcadas.size === lineas.length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* El título va en la misma línea que «← Volver» (docs/diseno.md). */}
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
          <button
            type="button"
            onClick={onVolver}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
          >
            <ArrowLeft size={15} strokeWidth={1.8} aria-hidden /> Pedidos
          </button>
          <p className="text-base font-semibold text-gray-900">
            Pedido {pedido.secuencial} · {pedido.cliente_nombre}
          </p>
          {resumen && <p className="text-xs text-gray-500">{resumen}</p>}
        </div>
        <button
          type="button"
          onClick={() => void imprimir()}
          disabled={!lineas || lineas.length === 0}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-gray-300 px-3 text-[13px] font-medium text-gray-700 transition active:scale-[0.97] disabled:opacity-40"
        >
          <Printer size={15} strokeWidth={1.8} aria-hidden /> Imprimir
        </button>
      </div>

      {error ? (
        <Aviso tono="error">No se pudo leer el detalle del pedido. Intenta de nuevo.</Aviso>
      ) : sinTabla ? (
        <Aviso tono="info">El detalle de los pedidos todavía no está instalado.</Aviso>
      ) : !lineas ? (
        <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>
      ) : lineas.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-500">Este pedido no tiene artículos</p>
      ) : (
        <div className="-mx-4 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-lg sm:border-x">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead className="border-b border-gray-200 text-xs font-medium text-gray-400 sm:uppercase sm:tracking-wide">
              <tr>
                {puedePoner && (
                  <th className="w-11 py-2 pl-1.5 sm:pl-2">
                    <input
                      type="checkbox"
                      aria-label="Marcar todos los artículos"
                      checked={todasMarcadas}
                      onChange={(e) => marcarTodas(e.target.checked)}
                      className="h-[18px] w-[18px] rounded border-gray-300"
                    />
                  </th>
                )}
                {/* 🩸 En el celular, Código y Referencia NO tienen columna propia: con
                    las 7 columnas a 390 px el chip del Bulto quedaba CORTADO
                    («41» en vez de 416). El código va bajo la descripción, como
                    el n.º de pedido va bajo el cliente en la lista. */}
                <th className="hidden px-3 py-2 sm:table-cell">{COLUMNAS_DETALLE[0]}</th>
                <th className="hidden px-3 py-2 sm:table-cell">{COLUMNAS_DETALLE[1]}</th>
                <th className="py-2 pl-1 pr-1 sm:px-3">{COLUMNAS_DETALLE[2]}</th>
                <th className="px-1 py-2 text-right sm:px-3">{COLUMNAS_DETALLE[3]}</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">{COLUMNAS_DETALLE[4]}</th>
                <th className="hidden px-3 py-2 text-right sm:table-cell">{COLUMNAS_DETALLE[5]}</th>
                <th className="py-2 pl-1 pr-3 text-right sm:px-3">{COLUMNAS_DETALLE[6]}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 align-top">
              {lineas.map((l) => (
                <tr key={l.codigo_barra_id} className={marcadas.has(l.codigo_barra_id) ? "bg-gray-50" : undefined}>
                  {puedePoner && (
                    <td className="py-2 pl-1.5 sm:pl-2">
                      <label className="flex h-11 w-9 items-center justify-center">
                        <span className="sr-only">{l.descripcion}</span>
                        <input
                          type="checkbox"
                          checked={marcadas.has(l.codigo_barra_id)}
                          onChange={() => alternar(l.codigo_barra_id)}
                          className="h-[18px] w-[18px] rounded border-gray-300"
                        />
                      </label>
                    </td>
                  )}
                  <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums text-gray-700 sm:table-cell">{l.codigo}</td>
                  {/* ⚠️ El API de Switch NO manda la referencia (medido): la
                      celda va vacía antes que repetir el código y hacerla pasar
                      por otro dato. */}
                  <td className="hidden whitespace-nowrap px-3 py-2 tabular-nums text-gray-500 sm:table-cell">
                    {l.referencia ?? <span className="text-gray-300">—</span>}
                  </td>
                  {/* La categoría de Switch, con su talla y su color si los manda. */}
                  <td className="break-words py-2 pl-1 pr-1 font-medium text-gray-900 sm:px-3">
                    {descripcionCompleta(l)}
                    <span className="block tabular-nums text-xs font-normal text-gray-500 sm:hidden">{l.codigo}</span>
                  </td>
                  <td className="whitespace-nowrap px-1 py-2 text-right tabular-nums text-gray-700 sm:px-3">{l.cantidad}</td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-700 sm:table-cell">
                    ${fmt(l.precio)}
                  </td>
                  <td className="hidden whitespace-nowrap px-3 py-2 text-right tabular-nums text-gray-900 sm:table-cell">
                    ${fmt(l.total)}
                  </td>
                  <td className="whitespace-nowrap py-2 pl-1 pr-3 text-right tabular-nums sm:px-3">
                    {l.bulto == null ? (
                      <span className="text-gray-400">—</span>
                    ) : (
                      <span className="inline-flex h-7 items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 text-xs font-medium text-emerald-700">
                        {l.bulto}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* UNA sola acción principal, abajo, con el resultado en vivo y apagada
          hasta que haya algo que guardar (docs/diseno.md, regla 3). */}
      {puedePoner && marcadas.size > 0 && (
        <div
          ref={barraRef}
          className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
        >
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {marcadas.size} {marcadas.size === 1 ? "artículo marcado" : "artículos marcados"}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => void guardar(null)}
                disabled={guardando}
                className="h-11 rounded-md px-3 text-sm font-medium text-blue-600 hover:text-blue-800 disabled:opacity-40"
              >
                Quitar del bulto
              </button>
              {pidiendoBulto ? (
                <>
                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <span>Bulto</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={MIN_BULTO}
                      max={MAX_BULTO}
                      value={numero}
                      autoFocus
                      onChange={(e) => setNumero(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && confirmarBulto()}
                      // Un dato de 1 a 4 caracteres usa un campo angosto (regla 9).
                      className="h-11 w-20 rounded-md border border-gray-300 px-2 text-right tabular-nums"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={confirmarBulto}
                    disabled={guardando || !numero.trim()}
                    className="h-11 rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97] disabled:opacity-40"
                  >
                    Poner en el bulto
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setPidiendoBulto(true)}
                  className="h-11 rounded-md bg-black px-4 text-sm font-medium text-white transition hover:bg-gray-800 active:scale-[0.97]"
                >
                  Poner en bulto…
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
