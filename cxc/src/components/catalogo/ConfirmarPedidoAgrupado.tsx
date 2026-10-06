"use client";

// «Confirmar pedido» como una lista agrupada de Ajustes de iOS (2-oct-2026).
// Daniel, mirándolo en el celular: «se puede optimizar». Lo dibuja el checkout
// cuando su página se lo pide (`listaAgrupada`, que sale de
// `CATALOGOS_APPLE_2026_10_B.subpaginasInternas`). Este archivo NO decide nada
// del pedido: recibe las líneas, los selectores y las dos salidas del checkout,
// y solo cambia dónde se ve cada cosa.
//
//   · Producto: una tarjeta con foto, nombre, código y subtotal; debajo, en UNA
//     línea, el precio (el mismo control de siempre), el stepper y la 🗑.
//   · Datos del pedido: «Cliente — Seleccionar ›» y «Vendedor — Nombre ›».
//   · Barra fija abajo, de vidrio: «$408.00 · 12 u», «Cotización» como texto y
//     «Enviar pedido». Lo que falta se dice UNA vez y al tocar enviar.
//
// 🔴 Las dos salidas siguen siendo `onElegir("pedido" | "cotizacion")`: el
// checkout, el 422 sin cliente, el precio y el payload no cambian.

import { useRef, useState, type ReactNode } from "react";
import { supabaseThumb } from "@/lib/image-thumb";
import { fmt } from "@/lib/format";
import { VIDRIO } from "@/lib/ui/vidrio";
import { usePublicarAltoBarraFija } from "@/lib/navegacion/useBarraFijaAbajo";
import { NOTA_COTIZACION, type DocumentoSwitch } from "@/lib/catalogo/documento-switch";
import type { LineaEnPantalla } from "./LineasPedidoEditables";

interface Props {
  lineas: LineaEnPantalla[];
  onQty: (productId: string, qty: number) => void;
  renderPrecio: (linea: LineaEnPantalla) => ReactNode;
  /** Nombre del cliente elegido, o `null` si todavía no se eligió. */
  cliente: string | null;
  clienteAbierto: boolean;
  onCliente: () => void;
  selectorCliente: ReactNode;
  /** Nombre del vendedor ya en pantalla («Reinaldo Espinosa»). */
  vendedor: string;
  vendedorAbierto: boolean;
  onVendedor: () => void;
  selectorVendedor: ReactNode;
  /** Avisos que no dependen de tocar (preventa, error del servidor). */
  avisos?: ReactNode;
  total: number;
  totalPiezas: number;
  /** Lo que falta, ya en palabras («Falta: seleccionar el cliente»), o null. */
  faltaTexto: string | null;
  enviando: boolean;
  onElegir: (documento: DocumentoSwitch) => void;
  /** Interruptor V2 de Catálogos (lo decide la página): «Datos del pedido»
   *  arriba de los productos y «3 productos · 36 u» bajo el total. */
  v2?: boolean;
}

/** Plural correcto: «1 producto» · «2 productos». */
export function textoProductos(n: number): string {
  return `${n} ${n === 1 ? "producto" : "productos"}`;
}

function Fila({ etiqueta, valor, vacio, abierto, onClick }: { etiqueta: string; valor: string; vacio?: boolean; abierto: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-expanded={abierto}
      className="flex w-full min-h-[48px] items-center justify-between gap-3 px-4 text-left text-[15px] active:bg-gray-50">
      <span className="text-gray-900">{etiqueta}</span>
      <span className={`flex min-w-0 items-center gap-1 ${vacio ? "text-blue-600" : "text-gray-500"}`}>
        <span className="truncate">{valor}</span>
        <span aria-hidden="true" className={`text-gray-300 transition ${abierto ? "rotate-90" : ""}`}>›</span>
      </span>
    </button>
  );
}

export default function ConfirmarPedidoAgrupado(p: Props) {
  // La falta se dice una sola vez y solo al intentar enviar (docs/diseno.md, regla 7).
  const [intento, setIntento] = useState(false);
  const barraRef = useRef<HTMLDivElement>(null);
  usePublicarAltoBarraFija(barraRef);
  const enviar = (d: DocumentoSwitch) => {
    if (p.faltaTexto) { setIntento(true); return; }
    p.onElegir(d);
  };
  const faltaCliente = intento && p.cliente === null;

  const datos = (
      <section data-medir="datos-del-pedido">
        <h2 className="mb-1.5 px-4 text-[13px] text-gray-500">Datos del pedido</h2>
        <div className={`divide-y divide-gray-100 rounded-lg bg-white border ${faltaCliente ? "border-amber-400" : "border-gray-200"}`}>
          <div data-medir="cliente-checkout">
            <Fila etiqueta="Cliente" valor={p.cliente ?? "Seleccionar"} vacio={p.cliente === null} abierto={p.clienteAbierto} onClick={p.onCliente} />
            {p.clienteAbierto && <div className="border-t border-gray-100 p-3">{p.selectorCliente}</div>}
          </div>
          <div data-medir="vendedor-checkout">
            <Fila etiqueta="Vendedor" valor={p.vendedor} abierto={p.vendedorAbierto} onClick={p.onVendedor} />
            {p.vendedorAbierto && <div className="border-t border-gray-100 p-3">{p.selectorVendedor}</div>}
          </div>
        </div>
      </section>
  );

  return (
    <div data-medir="confirmar-agrupado" className="space-y-6 pb-32">
      {p.v2 && datos}
      <section>
        <h2 className="mb-1.5 px-4 text-[13px] text-gray-500">{p.v2 ? "Productos" : textoProductos(p.lineas.length)}</h2>
        <div data-medir="lineas-pedido" className="divide-y divide-gray-100 rounded-lg bg-white border border-gray-200">
          {p.lineas.map((l) => (
            <div key={l.product_id} className="p-3">
              <div className="flex gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md bg-gray-50">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {l.image_url ? <img src={supabaseThumb(l.image_url, 160) ?? l.image_url} alt="" className="h-full w-full object-contain" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="min-w-0 break-words text-[15px] font-medium leading-snug">{l.name}</p>
                    <span className="shrink-0 text-[15px] font-semibold tabular-nums">${fmt(l.subtotal)}</span>
                  </div>
                  <p className="text-xs text-gray-400 tabular-nums">
                    {l.sku} · bulto de {l.bulto}
                    {l.is_preorder && <span className="ml-2 font-medium text-amber-700">Preventa</span>}
                  </p>
                </div>
              </div>
              {/* UNA línea: precio · stepper · 🗑 */}
              <div className="mt-2 flex items-center gap-2">
                <div className="shrink-0">{p.renderPrecio(l)}</div>
                <div className="ml-auto flex items-center rounded-lg bg-gray-100">
                  <button type="button" onClick={() => p.onQty(l.product_id, l.quantity - 1)} aria-label="Menos" className="h-11 w-11 text-lg leading-none">−</button>
                  <span className="min-w-[4.5rem] text-center text-sm tabular-nums">{l.quantity} {l.quantity === 1 ? "bulto" : "bultos"}</span>
                  <button type="button" onClick={() => p.onQty(l.product_id, l.quantity + 1)} aria-label="Más" className="h-11 w-11 text-lg leading-none">+</button>
                </div>
                <button type="button" onClick={() => p.onQty(l.product_id, 0)} aria-label="Quitar" title="Quitar"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center text-gray-400 hover:text-red-600 transition">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" /></svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {!p.v2 && datos}

      {p.avisos}

      {/* Barra fija abajo, de vidrio. */}
      <div ref={barraRef} data-medir="barra-confirmar"
        className={`fixed inset-x-0 bottom-0 z-40 ${VIDRIO} rounded-none border-x-0 border-b-0 pb-[env(safe-area-inset-bottom)]`}>
        <div className="mx-auto w-full max-w-3xl px-4 py-3">
          {intento && p.faltaTexto && (
            <p role="status" data-medir="falta-enviar" className="mb-2 text-center text-xs font-medium text-amber-800">{p.faltaTexto}</p>
          )}
          <div className="flex items-center gap-3">
            <div className="min-w-0">
              {p.v2 ? (
                <>
                  {/* v3.3: el número sin negrita y UNA línea gris. */}
                  <div className="text-lg font-medium tabular-nums leading-tight text-gray-900">${fmt(p.total)}</div>
                  <div className="truncate text-xs text-gray-500 tabular-nums">{textoProductos(p.lineas.length)} · {p.totalPiezas} u</div>
                </>
              ) : (
                <>
                  <div className="text-lg font-semibold tabular-nums leading-tight">${fmt(p.total)}</div>
                  <div className="text-xs text-gray-500 tabular-nums">{p.totalPiezas} u</div>
                </>
              )}
            </div>
            {p.enviando ? (
              <div data-medir="enviando-switch" className="ml-auto flex min-h-[48px] items-center rounded-lg bg-black px-5 text-sm font-medium text-white opacity-60">Enviando…</div>
            ) : (
              <>
                <button type="button" data-medir="documento-cotizacion" onClick={() => enviar("cotizacion")}
                  className="ml-auto flex min-h-[44px] flex-col items-end justify-center px-2 text-right leading-tight text-blue-600 hover:text-blue-800">
                  <span className="text-sm font-medium">Cotización</span>
                  {/* 🔴 La etiqueta de siempre: la cotización no aparta mercancía. */}
                  <span className="whitespace-nowrap text-[11px] text-gray-500">{NOTA_COTIZACION}</span>
                </button>
                <button type="button" data-medir="documento-pedido" onClick={() => enviar("pedido")}
                  className="min-h-[48px] shrink-0 whitespace-nowrap rounded-lg bg-black px-4 text-sm font-medium text-white hover:bg-gray-800 active:scale-[0.97] transition">
                  Enviar pedido
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
