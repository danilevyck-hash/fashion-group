"use client";

import { useState } from "react";
import { JoybeesProduct } from "./JoybeesProductCard";

const BULTO_SIZE = 12;

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
  onSendWhatsApp?: () => void;
  saving?: boolean;
  actionLabel?: string;
  formatTotal: (n: number) => string;
}

export default function JoybeesStickyCartBar({
  cart, cartCount, cartTotal,
  onQtyChange, onClearCart,
  variant, onSendWhatsApp,
  saving, actionLabel, formatTotal,
}: JoybeesStickyCartBarProps) {
  const [miniCartOpen, setMiniCartOpen] = useState(false);

  if (cartCount === 0) return null;

  const defaultActionLabel = variant === "public" ? "Enviar por WhatsApp" : "Crear pedido";
  const btnLabel = actionLabel || defaultActionLabel;

  function handleAction() {
    if (onSendWhatsApp) onSendWhatsApp();
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
              <span className="text-xs font-semibold text-[#404041]/50 uppercase tracking-wider">
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
                    <span className="text-[10px] text-[#404041]/40">x{item.quantity} bulto{item.quantity !== 1 ? "s" : ""} ({item.quantity * BULTO_SIZE} pzas)</span>
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
            <span className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-[#FFE443] text-[#404041] text-[9px] font-bold flex items-center justify-center">
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
          disabled={saving}
          className="flex-1 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition min-h-[56px] disabled:opacity-50 text-white bg-[#25D366] hover:bg-[#1fb855] active:scale-[0.98]"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
          </svg>
          <span className="truncate">{saving ? "Enviando..." : btnLabel}</span>
        </button>
      </div>
    </div>
  );
}
