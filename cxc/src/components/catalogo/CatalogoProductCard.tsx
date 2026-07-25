"use client";

// Tarjeta de producto del grid PLANO (marcas sin agrupación por modelo — hoy
// Reebok; una marca agrupada usa CatalogoGroupedCard). Parametrizada por
// MARCA_THEME: colores/clases del tema, badges y pre-orden por feature flag.
// La tarjeta plana muerta de Joybees (JoybeesProductCard, sin uso en JSX) se
// eliminó en PR-2; su tipo vive en groupByModel.ts.

import { useState, useEffect, useRef } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import type { CatalogoProducto } from "./types";
import BultosBadge from "@/components/shared/BultosBadge";
import { supabaseThumb } from "@/lib/image-thumb";

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

interface CatalogoProductCardProps {
  marca: MarcaUiKey;
  product: CatalogoProducto;
  qty: number;
  onQtyChange: (productId: string, qty: number, product: CatalogoProducto) => void;
  disabled?: boolean;
  showBultos?: boolean; // vendor mode shows "bultos"
  showStock?: boolean;  // catálogo interno: muestra disponibilidad + existencia (NO en público)
}

export default function CatalogoProductCard({
  marca, product, qty, onQtyChange, disabled, showBultos, showStock,
}: CatalogoProductCardProps) {
  const theme = getMarcaTheme(marca)!;
  const t = theme.card;
  const isPreOrder = theme.features.preorder && product.badge === "proximamente";
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Thumbnail (render transform); si falla, cae a la URL original una vez.
  const [useThumb, setUseThumb] = useState(true);
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
  const bultoSize = theme.bulto(product.category);

  return (
    <>
      <div
        className={`bg-white overflow-hidden rounded-xl relative transition-all duration-300 shadow-sm hover:shadow-md ${
          justAdded ? t.ring : ""
        }`}
      >
        {/* Add checkmark animation */}
        {justAdded && (
          <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none" style={{ animation: "checkFade 0.6s ease-out forwards" }}>
            <div className={t.checkBubble}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.checkStroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
          </div>
        )}

        {/* Image */}
        <div
          className={t.imageBg}
          onClick={() => { if (product.image_url) setShowLightbox(true); }}
        >
          {/* Badge */}
          {product.badge === "oferta" && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#E4002B] text-white text-xs font-bold uppercase tracking-wide px-2 py-[3px] rounded-md">
                Oferta
              </span>
            </div>
          )}
          {product.badge === "nuevo" && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#1A2656] text-white text-xs font-bold uppercase tracking-wide px-2 py-[3px] rounded-md">
                Nuevo
              </span>
            </div>
          )}
          {product.badge === "proximamente" && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-amber-500 text-white text-xs font-bold uppercase tracking-wide px-2 py-[3px] rounded-md">
                Próximamente
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
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${imageStatus}-${useThumb}`}
                  src={useThumb ? (supabaseThumb(product.image_url, 600) ?? product.image_url) : product.image_url}
                  alt={product.name}
                  width={300}
                  height={300}
                  loading="lazy"
                  className={t.imageFit}
                  onLoad={() => setImageStatus("loaded")}
                  onError={() => {
                    // 1er fallo: reintenta con la URL original (por si el
                    // transform no soporta ese archivo); 2do fallo: error real.
                    if (useThumb) { setUseThumb(false); setImageStatus("loading"); }
                    else setImageStatus("error");
                  }}
                />
              )}
            </>
          ) : (
            t.placeholder
          )}
        </div>

        {/* Product info */}
        <div className="p-3">
          {/* Name */}
          <h3 className={t.name}>{product.name}</h3>

          {/* Color dot + name */}
          {product.color && (
            <div className="flex items-center gap-1.5 mt-1.5">
              <span
                className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                style={{ backgroundColor: getColorDot(product.color) }}
              />
              <span className={t.priceMeta}>{product.color}</span>
            </div>
          )}

          {/* SKU / código */}
          {product.sku && (
            <div className="flex flex-wrap gap-1 mt-2">
              <span className="text-xs bg-[#F5F0E8] text-[#1A2656]/50 px-1.5 py-0.5 rounded font-medium tabular-nums">
                {product.sku}
              </span>
            </div>
          )}

          {/* Price */}
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className={`text-xl font-bold tabular-nums ${product.badge === "oferta" ? "text-[#E4002B]" : "text-[#1A2656]"}`}>
                {product.price ? `$${product.price.toFixed(2)}` : "Consultar"}
              </span>
              {product.price && <span className={t.priceMeta}>/unidad</span>}
              {product.badge === "oferta" && (
                <span className="text-xs font-bold text-[#E4002B] bg-red-50 px-1.5 py-0.5 rounded uppercase tracking-wide">
                  Oferta
                </span>
              )}
            </div>
            {product.price != null && (
              /* Solo "Bulto de N": el precio del bulto se quitó (Daniel,
                 25-jul-2026) — competía con el precio unitario, que es el que
                 el vendedor cotiza. */
              <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
                <span className={`${t.bultoMeta} font-medium`}>Bulto de {bultoSize}</span>
                {showBultos && <BultosBadge stock={product._stock ?? 0} bultoSize={bultoSize} />}
              </div>
            )}
          </div>

          {/* Stock interno (Switch) en UNA línea con el vocabulario del
              sistema: "Disponibilidad 48 · Existencia 48" (Daniel, 25-jul-2026
              — antes eran dos bloques con otro vocabulario).
              Solo catálogo interno (showStock); NUNCA en el catálogo público. */}
          {showStock && (() => {
            const disp = product.disponibilidad;
            const exist = product.existencia;
            const agotado = disp == null || disp <= 0;
            return (
              <div className="mt-2 pt-2 border-t border-[#1A2656]/10">
                {/* 11px + nowrap en xl: a 5 columnas la línea completa mide
                    ~182px contra 200px de card — entra justa en UNA línea
                    (medido en la app real). En iPad/móvil la card es de
                    ~150px y NINGÚN tamaño legible cabe, así que ahí se deja
                    fluir a dos líneas en vez de recortar el número. */}
                <div className="flex items-baseline gap-1.5 text-[11px] tabular-nums xl:flex-nowrap xl:whitespace-nowrap">
                  <span className={`font-semibold whitespace-nowrap ${agotado ? "text-[#1A2656]/40" : "text-[#1A2656]"}`}>
                    Disponibilidad {disp ?? "—"}
                  </span>
                  <span className="text-[#1A2656]/30">&middot;</span>
                  <span className="text-[#1A2656]/45 whitespace-nowrap">
                    Existencia {exist ?? "—"}
                  </span>
                </div>
              </div>
            );
          })()}

          {/* Add/Qty button */}
          {inOrder ? (
            <div className="mt-2.5">
              <div className={t.qtyWrap}>
                <button
                  onClick={() => setQty(qty - 1)}
                  className={`h-11 flex items-center justify-center ${t.qtyBtn} text-lg font-medium rounded-lg transition ${
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
                  <span className={t.qtyNum}>{qty}</span>
                  <span className={t.qtyUnit}>{qty === 1 ? "bulto" : "bultos"}</span>
                </button>
                <button
                  onClick={() => setQty(qty + 1)}
                  className={`w-11 h-11 flex items-center justify-center ${t.qtyBtn} text-xl font-medium rounded-lg transition`}
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
                  : isPreOrder
                    ? "bg-amber-500 text-white hover:bg-amber-600 active:scale-[0.97]"
                    : t.addBtn
              }`}
            >
              {isPreOrder ? "Pre-ordenar" : "Agregar"}
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
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={product.image_url} alt={product.name} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setShowLightbox(false)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">&times;</button>
        </div>
      )}
    </>
  );
}
