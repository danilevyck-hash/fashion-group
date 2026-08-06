"use client";

// Barra sticky del carrito (catálogo vendedor y público), parametrizada por
// MARCA_THEME. Las secciones Pedido/Pre-orden del mini-carrito son feature
// (preorder, hoy solo Reebok).

import { useState } from "react";
import { resolverLineas } from "@/lib/catalogo/lineas-pedido";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { validarNombreCliente } from "@/lib/catalogo/nombre-cliente";
import type { CatalogoCartItem, CatalogoProducto } from "./types";
import { fmtPrecio } from "@/lib/catalogo/precio";

interface CatalogoStickyCartBarProps {
  marca: MarcaUiKey;
  cart: CatalogoCartItem[];
  cartCount: number;
  cartTotal: number;
  onQtyChange: (productId: string, qty: number, product: CatalogoProducto) => void;
  onClearCart: () => void;
  variant: "public" | "vendor";
  // Public variant: crea + confirma el pedido (WhatsApp ya no es el paso final;
  // queda como aviso opcional en la página del pedido).
  onSubmitOrder?: () => void;
  clientName?: string;
  onClientNameChange?: (v: string) => void;
  // Vendor variant
  onCreateOrder?: () => void;
  saving?: boolean;
  actionLabel?: string;
  actionColor?: string;
  // Mini cart link (vendor)
  miniCartLink?: React.ReactNode;
  // Format function
  formatTotal: (n: number) => string;
}

export default function CatalogoStickyCartBar({
  marca, cart, cartCount, cartTotal,
  onQtyChange, onClearCart,
  variant, onSubmitOrder, clientName, onClientNameChange, onCreateOrder,
  saving, actionLabel, actionColor,
  miniCartLink, formatTotal,
}: CatalogoStickyCartBarProps) {
  const theme = getMarcaTheme(marca)!;
  const c = theme.cart;
  const [miniCartOpen, setMiniCartOpen] = useState(false);

  // Escape cierra el mini-carrito igual que el clic en el backdrop. El hook va
  // ANTES del early return de cartCount (reglas de hooks).
  useEscapeClose(miniCartOpen, () => setMiniCartOpen(false));

  if (cartCount === 0) return null;

  // ── Nombre del cliente (variante pública) ──
  // El campo es OBLIGATORIO y tiene que LEERSE como obligatorio: antes solo se
  // apagaba el botón (opacity-50) sin decir por qué y entraban pedidos con
  // nombres basura ("ff"). Regla única de las 3 marcas en lib/catalogo/
  // nombre-cliente; los colores del estado de error son semánticos (rojo), no
  // de marca, así que van literales igual que el ámbar de "Pre-orden".
  const pideNombre = variant === "public" && onClientNameChange !== undefined;
  const nombreCheck = validarNombreCliente(clientName || "");
  const nombreInvalido = pideNombre && !nombreCheck.ok;
  const motivoBloqueo = nombreInvalido && !nombreCheck.ok ? nombreCheck.error : null;

  const defaultActionColor = variant === "public" ? c.actionPublic : c.actionVendor;
  const defaultActionLabel = variant === "public" ? "Confirmar pedido" : "Crear pedido";
  const btnColor = actionColor || defaultActionColor;
  const btnLabel = actionLabel || defaultActionLabel;
  const showCheck = c.checkIconAlways || variant === "public";
  const showArrow = c.vendorArrow && variant === "vendor";

  function handleAction() {
    if (variant === "public" && onSubmitOrder) {
      onSubmitOrder();
    } else if (onCreateOrder) {
      onCreateOrder();
    } else if (onSubmitOrder) {
      onSubmitOrder();
    }
  }

  const renderItem = (item: CatalogoCartItem) => {
    // Fallback "footwear" heredado del StickyCartBar original de Reebok (solo
    // aplica a items viejos sin category en storage; Joybees ignora el arg).
    const l = resolverLineas([item], { bultoSize: theme.bulto, fallbackCategory: "footwear" })[0];
    const bs = l.bulto_pzas;
    const lineTotal = l.subtotal;
    const asProduct = (i: CatalogoCartItem): CatalogoProducto =>
      ({ id: i.product_id, name: i.name, sku: i.sku, price: i.unit_price, image_url: i.image_url });
    return (
      <div key={item.product_id} className="flex items-center justify-between py-2.5 border-b border-gray-50 last:border-0">
        <div className="flex-1 min-w-0 mr-3">
          <span className={c.itemName}>{item.name}</span>
          <span className={c.itemMeta}>x{item.quantity} bulto{item.quantity !== 1 ? "s" : ""} ({l.piezas} pzas)</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-0.5">
            <button
              onClick={() => onQtyChange(item.product_id, item.quantity - 1, asProduct(item))}
              className={c.qtyBtn}
            >
              &minus;
            </button>
            <span className={c.qtyNum}>{item.quantity}</span>
            <button
              onClick={() => onQtyChange(item.product_id, item.quantity + 1, asProduct(item))}
              className={c.qtyBtn}
            >
              +
            </button>
          </div>
          <span className={c.lineTotal}>{fmtPrecio(lineTotal)}</span>
        </div>
      </div>
    );
  };

  const regular = theme.features.preorder ? cart.filter(i => !i.is_preorder) : cart;
  const preorders = theme.features.preorder ? cart.filter(i => i.is_preorder) : [];
  const hasPreorders = preorders.length > 0;

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{ animation: "slideUp 0.25s ease-out" }}
    >
      {/* Backdrop */}
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
              <span className={c.tituloMini}>Tu pedido</span>
              <button
                onClick={() => setMiniCartOpen(false)}
                className="text-gray-400 hover:text-black transition p-1 min-w-[44px] min-h-[44px] flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
            </div>
            {hasPreorders && regular.length > 0 && (
              <div className="px-1 pt-1 pb-0.5 text-xs font-bold uppercase tracking-wide text-[#1A2656]/40">Pedido</div>
            )}
            {regular.map(renderItem)}
            {hasPreorders && (
              <>
                <div className="px-1 pt-3 pb-0.5 text-xs font-bold uppercase tracking-wide text-amber-600">Pre-orden</div>
                {preorders.map(renderItem)}
              </>
            )}
          </div>
        </div>
        <div className="px-4 py-2.5 border-t border-gray-100 flex items-center justify-between">
          <span className={c.totalText}>Total: ${formatTotal(cartTotal)}</span>
          <div className="flex items-center gap-3">
            {miniCartLink}
            <button
              onClick={() => { onClearCart(); setMiniCartOpen(false); }}
              className={c.vaciarBtn}
            >
              Vaciar
            </button>
          </div>
        </div>
      </div>

      {/* Nombre del cliente (variante pública) — OBLIGATORIO y visible ANTES
          del botón de confirmar, con el motivo del bloqueo escrito. */}
      {pideNombre && onClientNameChange && (
        <div
          className={`px-3 pt-3 pb-2 border-t ${
            nombreInvalido ? "bg-red-50 border-red-200" : "bg-white border-gray-100"
          }`}
        >
          <label htmlFor="catalogo-cliente-nombre" className={c.nameLabel}>
            Tu nombre <span className="text-red-600">*</span>
            <span className="ml-1 font-normal normal-case tracking-normal text-red-600">
              obligatorio
            </span>
          </label>
          <input
            id="catalogo-cliente-nombre"
            type="text"
            value={clientName || ""}
            onChange={(e) => onClientNameChange(e.target.value)}
            placeholder="Ej: María Pérez"
            autoComplete="name"
            required
            aria-required="true"
            aria-invalid={nombreInvalido}
            aria-describedby={nombreInvalido ? "catalogo-cliente-nombre-error" : undefined}
            className={
              nombreInvalido
                ? "w-full rounded-lg border-2 border-red-400 bg-white px-3 py-2 min-h-[44px] text-base sm:text-sm text-gray-900 placeholder:text-gray-400 focus:border-red-500 focus:outline-none transition"
                : c.nameInput
            }
          />
          {motivoBloqueo && (
            <p
              id="catalogo-cliente-nombre-error"
              role="alert"
              className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-red-700"
            >
              <svg className="w-3.5 h-3.5 mt-px shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v3m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {motivoBloqueo}
            </p>
          )}
        </div>
      )}

      {/* Guardando: el cliente tiene que saber que NO cierre la pantalla.
          Confirmar desde el catálogo crea el pedido Y lo manda a Switch (~5 s);
          el aviso vivía solo en la página del pedido, que casi nadie ve porque
          este es el paso donde todo el mundo confirma. */}
      {saving && variant === "public" && (
        <div
          className="px-4 py-2.5 bg-emerald-50 border-t border-emerald-200"
          role="status"
          aria-live="assertive"
        >
          <p className="text-sm font-bold text-emerald-800">
            Guardando tu pedido, no cierres esta pantalla
          </p>
          <p className="text-xs text-emerald-700/80 mt-0.5">Puede tardar unos segundos.</p>
        </div>
      )}

      {/* Bottom bar */}
      <div className="p-3 bg-white border-t border-gray-100 shadow-[0_-4px_20px_rgba(0,0,0,0.08)] flex items-center gap-2" style={{ paddingBottom: "max(12px, env(safe-area-inset-bottom))" }}>
        {/* Cart summary button */}
        <button
          onClick={() => setMiniCartOpen(prev => !prev)}
          className={c.summaryBtn}
        >
          {/* Cart icon */}
          <div className="relative">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" />
              <path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6" />
            </svg>
            <span className={c.badge}>
              {cartCount > 9 ? "9+" : cartCount}
            </span>
          </div>
          <div className="flex flex-col items-start leading-tight">
            <span className={c.summaryMeta}>{cartCount} bulto{cartCount !== 1 ? "s" : ""}</span>
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

        {/* Main action button */}
        <button
          onClick={handleAction}
          disabled={saving || nombreInvalido}
          title={motivoBloqueo || undefined}
          className={`flex-1 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition min-h-[56px] disabled:opacity-50 text-white ${btnColor} active:scale-[0.98]`}
        >
          {showCheck && !nombreInvalido && (
            <svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {/* El botón nunca queda "muerto" sin explicación: si falta el nombre
              lo dice el propio botón (y el detalle está arriba, en rojo). */}
          <span className="truncate">
            {saving ? "Guardando..." : nombreInvalido ? "Falta tu nombre" : btnLabel}
          </span>
          {showArrow && <span>&rarr;</span>}
        </button>
      </div>
    </div>
  );
}
