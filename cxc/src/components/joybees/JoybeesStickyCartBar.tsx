"use client";

import { useState } from "react";
import { JoybeesProduct } from "./JoybeesProductCard";
import { getBultoSize } from "@/lib/joybees-bulto";

const BULTO_SIZE = getBultoSize();

interface CartItem {
  product_id: string;
  sku: string;
  name: string;
  image_url: string;
  quantity: number;
  unit_price: number;
}

interface JoybeesStickyCartBarProps {
  cart: CartItem[];
  cartCount: number;
  cartTotal: number;
  onQtyChange: (productId: string, qty: number, product: JoybeesProduct) => void;
  onClearCart: () => void;
  variant: "public" | "vendor";
  // Public variant: crea + confirma el pedido (WhatsApp ya no es el paso final;
  // queda como aviso opcional en la página del pedido). Espejo de Reebok.
  onSubmitOrder?: () => void;
  clientName?: string;
  onClientNameChange?: (v: string) => void;
  saving?: boolean;
  actionLabel?: string;
  formatTotal: (n: number) => string;
}

export default function JoybeesStickyCartBar({
  cart, cartCount, cartTotal,
  onQtyChange, onClearCart,
  variant, onSubmitOrder, clientName, onClientNameChange,
  saving, actionLabel, formatTotal,
}: JoybeesStickyCartBarProps) {
  const [miniCartOpen, setMiniCartOpen] = useState(false);

  if (cartCount === 0) return null;

  const defaultActionLabel = variant === "public" ? "Confirmar pedido" : "Crear pedido";
  const btnLabel = actionLabel || defaultActionLabel;

  function handleAction() {
    if (onSubmitOrder) onSubmitOrder();
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{ animation: "slideUp 0.25s ease-out" }}
    >
      {miniCartOpen && (
        <div className="fixed inset-0 bg-black/20 z-[-1]" onClick={() => setMiniCartOpen(false)} />
      )}

      {/* Mini cart panel */}
      <div
        className="bg-white border-t border-gray-200 overflow-hidden"
        style={{ maxHeight: miniCartOpen ? "320px" : "0px", transition: "max-height 250ms ease-out" }}
      >
        <div className="overflow-y-auto" style={{ maxHeight: "260px" }}>
          <div className="px-4 pt-3 pb-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-[#404041]/50 uppercase tracking-wide">
                Tu pedido
              </span>
              <button
                onClick={() => setMiniCartOpen(false)}
                className="text-gray-400 hover:text-black transition p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {cart.map(item => {
              const lineTotal = item.quantity * BULTO_SIZE * item.unit_price;
              return (
                <div key={item.product_id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
                  <div className="flex-1 min-w-0 mr-3">
                    <span className="text-sm text-[#404041] truncate block font-medium">{item.name}</span>
                    <span className="text-xs text-[#404041]/40">x{item.quantity} bulto{item.quantity !== 1 ? "s" : ""} ({item.quantity * BULTO_SIZE} pzas)</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="flex items-center gap-0.5">
                      <button
                        onClick={() => onQtyChange(item.product_id, item.quantity - 1, { id: item.product_id, name: item.name, sku: item.sku, price: item.unit_price, image_url: item.image_url } as JoybeesProduct)}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#404041] hover:bg-gray-100 rounded-lg transition text-sm min-w-[44px] min-h-[44px]"
                      >
                        &minus;
                      </button>
                      <span className="text-sm tabular-nums text-[#404041] w-6 text-center font-semibold">
                        {item.quantity}
                      </span>
                      <button
                        onClick={() => onQtyChange(item.product_id, item.quantity + 1, { id: item.product_id, name: item.name, sku: item.sku, price: item.unit_price, image_url: item.image_url } as JoybeesProduct)}
                        className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-[#404041] hover:bg-gray-100 rounded-lg transition text-sm min-w-[44px] min-h-[44px]"
                      >
                        +
                      </button>
                    </div>
                    <span className="text-sm tabular-nums text-[#404041]/60 w-20 text-right font-medium">
                      ${lineTotal.toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
          <span className="text-sm font-bold text-[#404041]">
            Total: ${formatTotal(cartTotal)}
          </span>
          <button
            onClick={() => { onClearCart(); setMiniCartOpen(false); }}
            className="text-xs text-gray-400 hover:text-red-500 transition"
          >
            Vaciar
          </button>
        </div>
      </div>

      {/* Client name input (public variant) */}
      {variant === "public" && onClientNameChange && (
        <div className="px-3 pt-2 pb-1 bg-white border-t border-gray-100">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[#404041]/50 mb-1">
            Tu nombre
          </label>
          <input
            type="text"
            value={clientName || ""}
            onChange={(e) => onClientNameChange(e.target.value)}
            placeholder="Escribe tu nombre"
            autoComplete="name"
            className="w-full rounded-lg border border-gray-200 bg-[#FFFEF5] px-3 py-2 text-sm text-[#404041] placeholder:text-[#404041]/30 focus:border-[#404041] focus:bg-white focus:outline-none transition"
          />
        </div>
      )}

      {/* Bottom bar */}
      <div className="p-3 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex items-center gap-2" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        <button
          onClick={() => setMiniCartOpen(prev => !prev)}
          className="flex items-center gap-2 px-3 py-3.5 rounded-xl bg-[#FFE443]/20 text-[#404041] text-sm tabular-nums shrink-0 hover:bg-[#FFE443]/30 transition min-h-[56px]"
        >
          <div className="relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#FFE443] text-[#404041] text-xs font-bold flex items-center justify-center">
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className="text-xs text-[#404041]/50">{cartCount} bulto{cartCount !== 1 ? "s" : ""}</span>
            <span className="font-bold text-sm">${formatTotal(cartTotal)}</span>
          </div>
          <svg
            xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none"
            stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            className="transition-transform duration-200 ml-0.5"
            style={{ transform: miniCartOpen ? "rotate(180deg)" : "rotate(0deg)" }}
          >
            <polyline points="18 15 12 9 6 15" />
          </svg>
        </button>

        <button
          onClick={handleAction}
          disabled={saving || (variant === "public" && onClientNameChange !== undefined && !(clientName || "").trim())}
          className="flex-1 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition min-h-[56px] disabled:opacity-50 text-white bg-[#404041] hover:bg-[#2d2d2e] active:scale-[0.98]"
        >
          <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
          <span className="truncate">{saving ? "Guardando..." : btnLabel}</span>
        </button>
      </div>
    </div>
  );
}
