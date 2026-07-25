"use client";

// Tarjeta de producto AGRUPADO por modelo (marcas con features.agrupacionPorModelo
// — hoy Joybees): un card por modelo con botón Agregar por variante de género.
// Parametrizada por MARCA_THEME (generalización de JoybeesGroupedCard).

import { useState, useEffect, useRef } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { type JoybeesProduct, type GroupedProduct } from "./groupByModel";
import BultosBadge from "@/components/shared/BultosBadge";
import { supabaseThumb } from "@/lib/image-thumb";

interface CatalogoGroupedCardProps {
  marca: MarcaUiKey;
  group: GroupedProduct;
  cartMap: Map<string, number>;
  onQtyChange: (productId: string, qty: number, product: JoybeesProduct) => void;
  disabled?: boolean;
  showBultos?: boolean;
}

export default function CatalogoGroupedCard({
  marca, group, cartMap, onQtyChange, disabled, showBultos,
}: CatalogoGroupedCardProps) {
  const theme = getMarcaTheme(marca)!;
  const t = theme.card;
  const BULTO_SIZE = theme.bulto();
  const groupStock = group.variants.reduce((s, v) => s + (v.product.stock || 0), 0);
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Thumbnail (render transform); si falla, cae a la URL original una vez.
  const [useThumb, setUseThumb] = useState(true);
  const [showLightbox, setShowLightbox] = useState(false);

  // Track "just added" per variant
  const [justAddedId, setJustAddedId] = useState<string | null>(null);
  const prevQtyMapRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    for (const v of group.variants) {
      const prevQty = prevQtyMapRef.current.get(v.product.id) || 0;
      const curQty = cartMap.get(v.product.id) || 0;
      if (prevQty === 0 && curQty === 1) {
        setJustAddedId(v.product.id);
        const t = setTimeout(() => setJustAddedId(null), 600);
        return () => clearTimeout(t);
      }
    }
    // Update ref
    const newMap = new Map<string, number>();
    for (const v of group.variants) {
      newMap.set(v.product.id, cartMap.get(v.product.id) || 0);
    }
    prevQtyMapRef.current = newMap;
  }, [cartMap, group.variants]);

  const isRegalia = group.is_regalia || group.price === 0;
  const bultoTotal = group.price * BULTO_SIZE;
  const isSingleVariant = group.variants.length === 1;

  function setQty(productId: string, product: JoybeesProduct, n: number) {
    onQtyChange(productId, Math.max(0, n), product);
  }

  return (
    <>
      <div
        className={`bg-white overflow-hidden rounded-xl relative transition-all duration-300 shadow-sm hover:shadow-md ${
          justAddedId ? t.ring : ""
        }`}
      >
        {justAddedId && (
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
          onClick={() => { if (group.image_url) setShowLightbox(true); }}
        >
          {isRegalia && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#FFE443] text-[#404041] text-xs font-bold uppercase tracking-wide px-2 py-[3px] rounded-md">
                Regalia
              </span>
            </div>
          )}

          {group.popular && !isRegalia && (
            <div className="absolute top-2 left-2 z-[5]">
              <span className="inline-block bg-[#404041] text-white text-xs font-bold uppercase tracking-wide px-2 py-[3px] rounded-md">
                Popular
              </span>
            </div>
          )}

          {group.image_url ? (
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
                  key={`${imageStatus}-${useThumb}`}
                  src={useThumb ? (supabaseThumb(group.image_url, 600) ?? group.image_url) : group.image_url}
                  alt={group.name}
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
          <h3 className={t.name}>{group.name}</h3>

          <div className="flex items-center gap-1.5 mt-1">
            <span className="text-xs text-[#404041]/40 bg-[#FFE443]/20 px-1.5 py-0.5 rounded font-medium">
              {theme.groupedCategoryLabels[group.category] || group.category}
            </span>
            {isSingleVariant && (
              <span className="text-xs text-[#404041]/40">
                {group.variants[0].genderLabel}
              </span>
            )}
          </div>

          <div className="text-xs text-[#404041]/35 mt-1 font-mono">{group.baseSku}</div>

          {/* Gender badges for multi-variant */}
          {!isSingleVariant && (
            <div className="flex items-center gap-1 mt-1.5 flex-wrap">
              <span className="text-xs text-[#404041]/40">Disponible en:</span>
              {group.variants.map(v => (
                <span key={v.product.id} className="text-xs font-semibold text-[#404041]/70 bg-[#404041]/5 px-1.5 py-0.5 rounded">
                  {v.genderLabel}
                </span>
              ))}
            </div>
          )}

          {/* Price — Regalia fluye como producto normal (precio + Agregar) */}
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className={t.priceNormal}>${group.price.toFixed(2)}</span>
              <span className={t.priceMeta}>/unidad</span>
            </div>
            <div className="flex items-baseline justify-between gap-1.5 mt-0.5">
              <div className="flex items-baseline gap-1.5">
                <span className={`${t.bultoMeta} font-medium`}>Bulto de {BULTO_SIZE}</span>
                <span className="text-xs text-[#404041]/30">&middot;</span>
                <span className={`${t.bultoMeta} font-semibold tabular-nums`}>${bultoTotal.toFixed(2)}/bulto</span>
              </div>
              {showBultos && <BultosBadge stock={groupStock} bultoSize={BULTO_SIZE} />}
            </div>
          </div>

          {/* Action buttons — Regalia usa Agregar como cualquier producto normal */}
          <div className={`mt-2.5 ${!isSingleVariant ? "space-y-1.5" : ""}`}>
              {group.variants.map(v => {
                const qty = cartMap.get(v.product.id) || 0;
                const inOrder = qty > 0;
                const buttonLabel = isSingleVariant
                  ? (v.product.stock === 0 ? "Agotado" : "Agregar")
                  : (v.product.stock === 0 ? `${v.genderLabel} — Agotado` : `Agregar ${v.genderLabel}`);

                return inOrder ? (
                  <div key={v.product.id}>
                    {!isSingleVariant && (
                      <div className={`${t.bultoMeta} font-medium mb-0.5`}>{v.genderLabel}</div>
                    )}
                    <div className={t.qtyWrap}>
                      <button
                        onClick={() => setQty(v.product.id, v.product, qty - 1)}
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
                      <div className="text-center min-w-[48px] py-1">
                        <span className={t.qtyNum}>{qty}</span>
                        <span className={t.qtyUnit}>{qty === 1 ? "bulto" : "bultos"}</span>
                      </div>
                      <button
                        onClick={() => setQty(v.product.id, v.product, qty + 1)}
                        className={`w-11 h-11 flex items-center justify-center ${t.qtyBtn} text-xl font-medium rounded-lg transition`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={v.product.id}
                    onClick={() => { if (!disabled) setQty(v.product.id, v.product, 1); }}
                    disabled={disabled || v.product.stock === 0}
                    className={`w-full py-2.5 rounded-lg text-sm font-semibold transition min-h-[40px] ${
                      disabled || v.product.stock === 0
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : t.addBtn
                    }`}
                  >
                    {buttonLabel}
                  </button>
                );
              })}
            </div>
        </div>
      </div>

      {/* Lightbox */}
      {showLightbox && group.image_url && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[100] p-8"
          onClick={() => setShowLightbox(false)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={group.image_url} alt={group.name} className="max-w-full max-h-full object-contain rounded-lg" />
          <button onClick={() => setShowLightbox(false)} className="absolute top-4 right-4 text-white/70 hover:text-white text-2xl">&times;</button>
        </div>
      )}
    </>
  );
}
