"use client";

// Tarjeta de producto AGRUPADO por modelo (marcas con features.agrupacionPorModelo
// — hoy Joybees): un card por modelo con botón Agregar por variante de género.
// Parametrizada por MARCA_THEME (generalización de JoybeesGroupedCard).

import { useState, useEffect, useRef } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { type JoybeesProduct, type GroupedProduct } from "./groupByModel";
import CatalogoStockLine from "./CatalogoStockLine";
import { supabaseThumb } from "@/lib/image-thumb";

/** Suma un campo de stock del grupo; null si NINGUNA variante lo trae (pre-sync
 *  → la línea muestra "—" en vez de un 0 que se leería como agotado). */
function sumaStock(group: GroupedProduct, campo: "existencia" | "disponibilidad"): number | null {
  let total = 0;
  let hay = false;
  for (const v of group.variants) {
    const n = v.product[campo];
    if (n != null) { total += n; hay = true; }
  }
  return hay ? total : null;
}

interface CatalogoGroupedCardProps {
  marca: MarcaUiKey;
  group: GroupedProduct;
  cartMap: Map<string, number>;
  onQtyChange: (productId: string, qty: number, product: JoybeesProduct) => void;
  disabled?: boolean;
  showBultos?: boolean; // vendor mode: cantidad tecleable (tap sobre el número)
  showStock?: boolean;  // catálogo interno: Disponibilidad + Existencia (NO en público)
}

export default function CatalogoGroupedCard({
  marca, group, cartMap, onQtyChange, disabled, showBultos, showStock,
}: CatalogoGroupedCardProps) {
  const theme = getMarcaTheme(marca)!;
  const t = theme.card;
  const BULTO_SIZE = theme.bulto();
  const groupDisponibilidad = sumaStock(group, "disponibilidad");
  const groupExistencia = sumaStock(group, "existencia");
  const [imageStatus, setImageStatus] = useState<"loading" | "loaded" | "error">("loading");
  // Thumbnail (render transform); si falla, cae a la URL original una vez.
  const [useThumb, setUseThumb] = useState(true);
  const [showLightbox, setShowLightbox] = useState(false);
  // Cantidad tecleable (espejo de CatalogoProductCard): tap sobre el número.
  const [qtyInputFor, setQtyInputFor] = useState<{ product: JoybeesProduct } | null>(null);
  const [qtyInputVal, setQtyInputVal] = useState("");

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
  const isSingleVariant = group.variants.length === 1;

  function setQty(productId: string, product: JoybeesProduct, n: number) {
    onQtyChange(productId, Math.max(0, n), product);
  }

  function openQtyInput(product: JoybeesProduct, qty: number) {
    setQtyInputVal(String(qty));
    setQtyInputFor({ product });
  }
  function submitQtyInput() {
    const n = parseInt(qtyInputVal);
    if (qtyInputFor && !isNaN(n) && n >= 0) setQty(qtyInputFor.product.id, qtyInputFor.product, n);
    setQtyInputFor(null);
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

        {/* Product info — ESQUELETO CANÓNICO (idéntico a CatalogoProductCard):
            foto · nombre · código (píldora) · precio · bulto · stock · Agregar.
            Los chips de categoría y de género se quitaron (Daniel, 25-jul-2026):
            la sección del grid ya dice el género y el tipo ya vive en el nombre
            del producto. */}
        <div className="p-3">
          <h3 className={t.name}>{group.name}</h3>

          {/* Código (píldora) — mismo componente visual que la card plana. */}
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className={t.skuPill}>{group.baseSku}</span>
          </div>

          {/* Price — Regalia fluye como producto normal (precio + Agregar).
              Sin "/unidad" (Daniel, 25-jul-2026). */}
          <div className="mt-2">
            <div className="flex items-baseline gap-2">
              <span className={t.priceNormal}>${group.price.toFixed(2)}</span>
            </div>
            {/* Solo "Bulto de N" — el precio del bulto y el indicador "● N" se
                quitaron en las 3 marcas (Daniel, 25-jul-2026). Espejo exacto de
                CatalogoProductCard. */}
            <div className="flex items-baseline gap-1.5 mt-0.5">
              <span className={`${t.bultoMeta} font-medium`}>Bulto de {BULTO_SIZE}</span>
            </div>
          </div>

          {/* Stock interno (Switch) — componente COMPARTIDO con la card plana.
              El grupo agrega sus variantes (una card = un modelo). Solo
              catálogo interno (showStock); NUNCA en el público. */}
          {showStock && (
            <CatalogoStockLine
              marca={marca}
              disponibilidad={groupDisponibilidad}
              existencia={groupExistencia}
            />
          )}

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
                      <button
                        onClick={showBultos ? () => openQtyInput(v.product, qty) : undefined}
                        className="text-center min-w-[48px] py-1"
                      >
                        <span className={t.qtyNum}>{qty}</span>
                        <span className={t.qtyUnit}>{qty === 1 ? "bulto" : "bultos"}</span>
                      </button>
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
                    className={`w-full py-3 rounded-lg text-sm font-semibold transition min-h-[44px] ${
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

      {/* Qty input modal — espejo exacto de CatalogoProductCard. */}
      {qtyInputFor && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[100]" onClick={() => setQtyInputFor(null)}>
          <div className="bg-white rounded-xl p-5 w-56 shadow-2xl" onClick={e => e.stopPropagation()}>
            <p className="text-sm text-gray-600 mb-3">Cantidad de bultos</p>
            <input
              type="number" min={0} autoFocus value={qtyInputVal}
              onChange={e => setQtyInputVal(e.target.value)}
              onKeyDown={e => { if (e.key === "Enter") submitQtyInput(); }}
              className="w-full border-b-2 border-[#1A2656] text-2xl text-center font-semibold py-2 outline-none tabular-nums"
            />
            <div className="flex gap-2 mt-4">
              <button onClick={() => setQtyInputFor(null)} className="flex-1 py-2 text-sm text-gray-500 hover:text-black transition">Cancelar</button>
              <button onClick={submitQtyInput} className="flex-1 py-2 text-sm bg-[#1A2656] text-white rounded-lg hover:bg-[#0f1a3d] transition">Listo</button>
            </div>
          </div>
        </div>
      )}

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
