"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LAS LÍNEAS DE UN PEDIDO QUE TODAVÍA SE PUEDE CAMBIAR — una sola lista, dos
// pantallas (7-sep-2026).
//
// La usa el checkout del VENDEDOR (`CheckoutClient`) y la pantalla de revisar
// del CLIENTE (`RevisarPedidoPublico`). Es la misma foto y los mismos gestos:
// foto, nombre, código, piezas por bulto, subtotal, «−  N bultos  +» y
// «Quitar».
//
// 🔑 No se escribió una segunda pantalla que hiciera lo mismo: estas ~70 líneas
// SALIERON del checkout y las dos las llaman. Daniel: *«quiero que el cliente
// cuando abra el catálogo por el link se sienta como si fuese el mismo
// catálogo»* — y sentirse igual empieza por que sea lo mismo.
//
// 🔴 EL PRECIO NO SE TOCA DEL LADO DEL CLIENTE, y no por esconder un botón: el
// servidor REESCRIBE los precios desde la base al recibir el pedido del link
// (un carrito adulterado no pasa). Eso no cambió. Acá el precio es un
// `renderPrecio` OPCIONAL: el checkout le pasa su campo editable; el cliente no
// pasa nada y el precio se lee, no se edita.
//
// ⚠️ Esta lista NO multiplica nada: recibe las líneas YA resueltas por
// `lib/catalogo/lineas-pedido` (piezas y subtotal incluidos). Es la regla de
// TOM-003 y no se afloja acá.
// ─────────────────────────────────────────────────────────────────────────────

import type { ReactNode } from "react";
import { supabaseThumb } from "@/lib/image-thumb";
import { fmt } from "@/lib/format";

/** Una línea ya resuelta: piezas y subtotal vienen calculados de afuera. */
export interface LineaEnPantalla {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  /** Siempre en BULTOS. */
  quantity: number;
  unit_price: number;
  /** Piezas por bulto que se usaron. */
  bulto: number;
  piezas: number;
  subtotal: number;
  is_preorder?: boolean;
}

interface LineasPedidoEditablesProps {
  lineas: LineaEnPantalla[];
  /** `qty <= 0` quita la línea — lo decide quien llama, igual en las dos. */
  onQty: (productId: string, qty: number) => void;
  /** Cómo se dibuja el precio por pieza. Sin esto, se muestra y no se toca. */
  renderPrecio?: (linea: LineaEnPantalla) => ReactNode;
}

export default function LineasPedidoEditables({
  lineas, onQty, renderPrecio,
}: LineasPedidoEditablesProps) {
  return (
    <section data-medir="lineas-pedido" className="rounded-lg border border-gray-200 bg-white divide-y divide-gray-100">
      {lineas.map((l) => (
        <div key={l.product_id} className="flex gap-3 p-3">
          <div className="h-16 w-16 shrink-0 rounded-md bg-gray-50 overflow-hidden">
            {l.image_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={supabaseThumb(l.image_url, 160) ?? l.image_url} alt="" className="h-full w-full object-contain" />
            ) : null}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{l.name}</p>
                <p className="text-xs text-gray-400 tabular-nums">{l.sku} · bulto de {l.bulto}</p>
                <div className="mt-1">
                  {renderPrecio ? renderPrecio(l) : (
                    /* Solo lectura: mismo dato, sin borde ni lápiz — nada que
                       insinúe que se puede cambiar. */
                    <span className="text-sm font-medium tabular-nums text-gray-800">
                      ${fmt(l.unit_price)}<span className="text-xs font-normal text-gray-400">/pza</span>
                    </span>
                  )}
                </div>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums">${fmt(l.subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <button onClick={() => onQty(l.product_id, l.quantity - 1)} aria-label="Menos" className="min-h-[44px] min-w-[44px] rounded-md border border-gray-200 text-lg leading-none hover:border-gray-300 transition">−</button>
                <span className="w-14 text-center text-sm tabular-nums">{l.quantity} {l.quantity === 1 ? "bulto" : "bultos"}</span>
                <button onClick={() => onQty(l.product_id, l.quantity + 1)} aria-label="Más" className="min-h-[44px] min-w-[44px] rounded-md border border-gray-200 text-lg leading-none hover:border-gray-300 transition">+</button>
                <button onClick={() => onQty(l.product_id, 0)} className="ml-2 min-h-[44px] px-2 text-xs text-gray-400 hover:text-red-600 transition">Quitar</button>
              </div>
              <div className="text-right text-xs tabular-nums">
                <span className="text-gray-400">{l.piezas} pzas</span>
                {l.is_preorder && <span className="ml-2 text-amber-700 font-medium">preventa</span>}
              </div>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}
