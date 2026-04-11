"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { Product } from "@/components/reebok/supabase";
import { getBultoSize } from "@/lib/reebok-bulto";

const COLOR_DOT_MAP: Record<string, string> = {
  black: "#000", negro: "#000", white: "#fff", blanco: "#fff",
  red: "#E4002B", rojo: "#E4002B", blue: "#1A2656", azul: "#1A2656",
  green: "#16a34a", verde: "#16a34a", yellow: "#eab308", amarillo: "#eab308",
  pink: "#ec4899", rosado: "#ec4899", gray: "#9ca3af", gris: "#9ca3af",
  brown: "#92400e", cafe: "#92400e", orange: "#f97316", naranja: "#f97316",
  purple: "#9333ea", morado: "#9333ea", navy: "#1e3a5f", beige: "#d4c5a9",
};

function getColorDot(color: string): string {
  const lower = color.toLowerCase().trim();
  for (const [key, hex] of Object.entries(COLOR_DOT_MAP)) {
    if (lower.includes(key)) return hex;
  }
  return "#94a3b8";
}

interface CatalogProductCardProps {
  product: Product & { _stock: number; _sizes: string[] };
  qty: number;
  onQtyChange: (productId: string, qty: number, product: Product) => void;
  disabled?: boolean;
  showBultos?: boolean; // vendor mode shows "bultos"
}

export default function CatalogProductCard({
  product, qty, onQtyChange, disabled, showBultos,
}: CatalogProductCardProps) {
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [justAdded, setJustAdded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
  const [showQtyInput, setShowQtyInput] = useState(false);
  const [qtyInputVal, setQtyInputVal] = useState("");
  const prevQtyRef = useRef(qty);

  useEffect(() => {
    if (prevQtyRef.current === 0 && qty === 1) {
      setJustAdded(true);
      const t = setTimeout(() => setJustAdded(false), 600);
      return () => clearTimeout(t);
    }
    prevQtyRef.current = qty;
  }, [qty]);

  function setQty(n: number) {
    onQtyChange(product.id, Math.max(0, n), product);
  }

  function openQtyInput() { setQtyInputVal(String(qty)); setShowQtyInput(true); }
  function submitQtyInput() {
    const n = parseInt(qtyInputVal);
    if (!isNaN(n) && n >= 0) setQty(n);
    setShowQtyInput(false);
  }

  const inOrder = qty > 0;
  const bultoSize = getBultoSize(product.category);
  const qtyLabel = showBultos ? "bultos" : "";
  const bultoTotal = (product.price || 0) * bultoSize;

  return (
    <>
      <div
        className={`bg-white overflow-hidden rounded-xl relative transition-all duration-300 shadow-sm hover:shadow-md ${
          justAdded ? "ring-2 ring-emerald-400 scale-[1.02]" : ""
        }`}
      >
        {/* Add checkmark animation */}
        {justAdded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none" style={{ animation: "checkFade 0.6s ease-out forwards" }}>
            <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        )}

        {/* Image */}
        <div
          className="aspect-square bg-[#F5F0E8] relative overflow-hidden cursor-pointer"
          onClick={() => { if (product.image_url) setShowLightbox(true); }}
        >
          {/* Sale badge */}
          {product.on_sale && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#E4002B] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-md">
                Oferta
              </span>
            </div>
          )}
          {/* New badge */}
          {!product.on_sale && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#1A2656] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-md">
                Nuevo
              </span>
            </div>
          )}

          {product.image_url ? (
            <>
              {imageStatus === "loading" && <div className="absolute inset-0 shimmer" />}
              {imageStatus === "error" ? (
                <div className="w-full h-full flex flex-col items-center justify-center text-gray-400 gap-2">
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <button
                    onClick={(e) => { e.stopPropagation(); setImageStatus("loading"); }}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium"
                  >
                    Reintentar
                  </button>
                </div>
              ) : (
                <Image
                  key={imageStatus}
                  src={product.image_url}
                  alt={product.name}
                  width={300}
                  height={300}
                  sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                  className="object-contain p-3"
                  onLoad={() => setImageStatus("loaded")}
                  onError={() => setImageStatus("error")}
                />
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-300">
              <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="p-3">
          {/* Name */}
          <h3 className="text-sm font-semibold text-[#1A2656] line-clamp-2 leading-snug min-h-[2.5em]">
            {product.name}
          </h3>

          {/* Color dot + name */}
          {product.color && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                style={{ backgroundColor: getColorDot(product.color) }}
              />
              <span className="text-[11px] text-[#1A2656]/40">{product.color}</span>
            </div>
          )}

          {/* Available sizes */}
          {product._sizes.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {product._sizes.slice(0, 8).map(s => (
                <span key={s} className="text-[10px] bg-[#F5F0E8] text-[#1A2656]/50 px-1.5 py-0.5 rounded font-medium">
                  {s}
                </span>
              ))}
              {product._sizes.length > 8 && (
                <span className="text-[10px] text-[#1A2656]/30 px-1 py-0.5">+{product._sizes.length - 8}</span>
              )}
            </div>
          )}

          {/* Price */}
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold tabular-nums ${product.on_sale ? "text-[#E4002B]" : "text-[#1A2656]"}`}>
                {product.price ? `$${product.price.toFixed(2)}` : "Consultar"}
              </span>
              {product.price && <span className="text-[10px] text-[#1A2656]/40">/unidad</span>}
              {product.on_sale && (
                <span className="text-[10px] font-bold text-[#E4002B] bg-red-50 px-1.5 py-0.5 rounded uppercase tracking-wider">
                  Oferta
                </span>
              )}
            </div>
            {product.price != null && (
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[11px] text-[#1A2656]/50 font-medium">Bulto de {bultoSize}</span>
                <span className="text-[11px] text-[#1A2656]/30">&middot;</span>
                <span className="text-[11px] text-[#1A2656]/50 font-semibold tabular-nums">${bultoTotal.toFixed(2)}/bulto</span>
              </div>
            )}
          </div>

          {/* Add/Qty button */}
          {inOrder ? (
            <div className="mt-2.5">
              <div className="flex items-center justify-between bg-emerald-50 rounded-lg px-1 border border-emerald-100">
                <button
                  onClick={() => setQty(qty - 1)}
                  className={`h-11 flex items-center justify-center text-emerald-700 text-lg font-medium hover:bg-emerald-100 rounded-lg transition ${
                    qty === 1 ? "px-2 gap-1" : "w-11"
                  }`}
                >
                  {qty === 1 ? (
                    <>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                      <span className="text-xs font-medium">Quitar</span>
                    </>
                  ) : (
                    <span className="text-xl leading-none">&minus;</span>
                  )}
                </button>
                <button onClick={showBultos ? openQtyInput : undefined} className="text-center min-w-[48px] py-1">
                  <span className="text-base font-bold text-emerald-700 tabular-nums">{qty}</span>
                  <span className="text-[10px] text-emerald-600 ml-1">{qty === 1 ? "bulto" : "bultos"}</span>
                </button>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="w-11 h-11 flex items-center justify-center text-emerald-700 text-xl font-medium hover:bg-emerald-100 rounded-lg transition"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { if (!disabled) setQty(1); }}
              disabled={disabled}
              className={`w-full mt-2.5 py-3 rounded-lg text-sm font-semibold transition min-h-[44px] ${
                disabled
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-[#1A2656] text-white hover:bg-[#0f1a3d] active:scale-[0.97]"
              }`}
            >
              Agregar
            </button>
          )}
        </div>
      </div>

      {/* Qty input modal */}
      {showQtyInput && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setShowQtyInput(false)}>
          <div className="bg-white rounded-xl p-5 w-56 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-600 mb-3">Cantidad de bultos</p>
            <input
              type="number" min={0} autoFocus value={qtyInputVal}
              onChange={e => setQtyInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitQtyInput(); }}
              className="w-full border-b-2 border-[#1A2656] text-2xl text-center font-semibold py-2 outline-none tabular-nums"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setShowQtyInput(false)} className="flex-1 py-2 text-sm text-gray-500 hover:text-black transition">Cancelar</button>
              <button onClick={submitQtyInput} className="flex-1 py-2 text-sm bg-[#1A2656] text-white rounded-lg hover:bg-[#0f1a3d] transition">Listo</button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {showLightbox && product.image_url && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8"
          onClick={() => setShowLightbox(false)}
        >
          <img src={product.image_url} alt={product.name} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setShowLightbox(false)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">&times;</button>
        </div>
      )}
    </>
  );
}
