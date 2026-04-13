"use client";

import { useState, useEffect, useRef } from "react";

export interface JoybeesProduct {
  id: string;
  sku: string;
  name: string;
  category: string;
  gender: string;
  price: number;
  stock: number;
  image_url: string | null;
  active: boolean;
  popular: boolean;
  is_regalia: boolean;
  created_at: string;
}

const BULTO_SIZE = 12;

interface JoybeesProductCardProps {
  product: JoybeesProduct;
  qty: number;
  onQtyChange: (productId: string, qty: number, product: JoybeesProduct) => void;
  disabled?: boolean;
}

export default function JoybeesProductCard({
  product, qty, onQtyChange, disabled,
}: JoybeesProductCardProps) {
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  const [justAdded, setJustAdded] = useState(false);
  const [showLightbox, setShowLightbox] = useState(false);
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

  const inOrder = qty > 0;
  const bultoTotal = product.price * BULTO_SIZE;
  const isRegalia = product.is_regalia || product.price === 0;

  const GENDER_LABELS: Record<string, string> = {
    adults_m: "Adults",
    women: "Women",
    kids: "Kids",
    junior: "Junior",
  };

  const CATEGORY_LABELS: Record<string, string> = {
    active_clog: "Active Clog",
    casual_flip: "Casual Flip",
    varsity_clog: "Varsity Clog",
    trekking_slide: "Trekking Slide",
    trekking_shoe: "Trekking Shoe",
    work_clog: "Work Clog",
    friday_flat: "Friday Flat",
    garden_grove_clog: "Garden Grove",
    lakeshore_sandal: "Lakeshore",
    riviera_sandal: "Riviera",
    everyday_sandal: "Everyday Sandal",
    varsity_flip: "Varsity Flip",
    studio_clog: "Studio Clog",
    popinz: "Popinz",
  };

  return (
    <>
      <div
        className={`bg-white overflow-hidden rounded-xl relative transition-all duration-300 shadow-sm hover:shadow-md ${
          justAdded ? "ring-2 ring-[#FFE443] scale-[1.02]" : ""
        }`}
      >
        {justAdded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none" style={{ animation: "checkFade 0.6s ease-out forwards" }}>
            <div className="w-10 h-10 rounded-full bg-[#FFE443] flex items-center justify-center shadow-lg">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#404041" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        )}

        {/* Image */}
        <div
          className="aspect-square bg-[#FFFEF5] relative overflow-hidden cursor-pointer"
          onClick={() => { if (product.image_url) setShowLightbox(true); }}
        >
          {isRegalia && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#FFE443] text-[#404041] text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-md">
                Regalia
              </span>
            </div>
          )}

          {product.popular && !isRegalia && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#404041] text-white text-[9px] font-bold uppercase tracking-wider px-2 py-[3px] rounded-md">
                Popular
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
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  key={imageStatus}
                  src={product.image_url}
                  alt={product.name}
                  className="w-full h-full object-cover"
                  onLoad={() => setImageStatus("loaded")}
                  onError={() => setImageStatus("error")}
                />
              )}
            </>
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <div className="text-4xl">🐝</div>
            </div>
          )}
        </div>

        {/* Product info */}
        <div className="p-3">
          <h3 className="text-sm font-semibold text-[#404041] line-clamp-2 leading-snug min-h-[2.5em]">
            {product.name}
          </h3>

          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-[10px] text-[#404041]/40 bg-[#FFE443]/20 px-1.5 py-0.5 rounded font-medium">
              {CATEGORY_LABELS[product.category] || product.category}
            </span>
            <span className="text-[10px] text-[#404041]/40">
              {GENDER_LABELS[product.gender] || product.gender}
            </span>
          </div>

          <div className="text-[10px] text-[#404041]/35 mt-1 font-mono">{product.sku}</div>

          {/* Price / Regalia */}
          <div className="mt-2">
            {isRegalia ? (
              <div>
                <span className="text-sm font-bold text-[#404041]/60">Consultar disponibilidad</span>
              </div>
            ) : (
              <>
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold tabular-nums text-[#404041]">
                    ${product.price.toFixed(2)}
                  </span>
                  <span className="text-[10px] text-[#404041]/40">/unidad</span>
                </div>
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-[11px] text-[#404041]/50 font-medium">Bulto de {BULTO_SIZE}</span>
                  <span className="text-[11px] text-[#404041]/30">&middot;</span>
                  <span className="text-[11px] text-[#404041]/50 font-semibold tabular-nums">${bultoTotal.toFixed(2)}/bulto</span>
                </div>
              </>
            )}
          </div>

          {/* Add/Qty button */}
          {isRegalia ? (
            <a
              href="https://wa.me/50766745522?text=Hola%2C%20quiero%20consultar%20disponibilidad%20de%20Joybees%20Popinz"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full mt-2.5 py-3 rounded-lg text-sm font-semibold transition min-h-[44px] bg-[#25D366] text-white hover:bg-[#1fb855] active:scale-[0.97] flex items-center justify-center gap-2"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
              </svg>
              Consultar
            </a>
          ) : inOrder ? (
            <div className="mt-2.5">
              <div className="flex items-center justify-between bg-[#FFE443]/20 rounded-lg px-1 border border-[#FFE443]/40">
                <button
                  onClick={() => setQty(qty - 1)}
                  className={`h-11 flex items-center justify-center text-[#404041] text-lg font-medium hover:bg-[#FFE443]/30 rounded-lg transition ${
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
                <div className="text-center min-w-[48px] py-1">
                  <span className="text-base font-bold text-[#404041] tabular-nums">{qty}</span>
                  <span className="text-[10px] text-[#404041]/60 ml-1">{qty === 1 ? "bulto" : "bultos"}</span>
                </div>
                <button
                  onClick={() => setQty(qty + 1)}
                  className="w-11 h-11 flex items-center justify-center text-[#404041] text-xl font-medium hover:bg-[#FFE443]/30 rounded-lg transition"
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { if (!disabled) setQty(1); }}
              disabled={disabled || product.stock === 0}
              className={`w-full mt-2.5 py-3 rounded-lg text-sm font-semibold transition min-h-[44px] ${
                disabled || product.stock === 0
                  ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                  : "bg-[#404041] text-white hover:bg-[#2a2a2b] active:scale-[0.97]"
              }`}
            >
              {product.stock === 0 ? "Agotado" : "Agregar"}
            </button>
          )}
        </div>
      </div>

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
