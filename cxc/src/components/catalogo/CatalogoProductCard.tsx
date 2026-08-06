"use client";

// Tarjeta de producto del grid PLANO (marcas sin agrupación por modelo — hoy
// Reebok; una marca agrupada usa CatalogoGroupedCard). Parametrizada por
// MARCA_THEME: colores/clases del tema, badges y pre-orden por feature flag.
// La tarjeta plana muerta de Joybees (JoybeesProductCard, sin uso en JSX) se
// eliminó en PR-2; su tipo vive en groupByModel.ts.

import { useState, useEffect, useRef } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import type { CatalogoProducto } from "./types";
import CatalogoProductName from "./CatalogoProductName";
import CatalogoStockLine from "./CatalogoStockLine";
import { supabaseThumb } from "@/lib/image-thumb";
import { fmtPrecio } from "@/lib/catalogo/precio";
import VisorFoto from "./VisorFoto";

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
  /** Cards del primer viewport: la foto se pide YA y con prioridad alta (LCP).
   *  El resto va lazy — es lo que evita bajar cientos de fotos al abrir. */
  priority?: boolean;
}

export default function CatalogoProductCard({
  marca, product, qty, onQtyChange, disabled, showBultos, showStock, priority,
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

  // Escape cierra igual que el clic fuera (que ya existe en los dos overlays):
  // en la cantidad equivale a Cancelar — nunca guarda lo tecleado.
  useEscapeClose(showQtyInput, () => setShowQtyInput(false));
  useEscapeClose(showLightbox, () => setShowLightbox(false));

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
  const bultoSize = theme.bulto(product.category, product.bulto_pzas);

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
                  width={400}
                  height={300}
                  loading={priority ? "eager" : "lazy"}
                  fetchPriority={priority ? "high" : "auto"}
                  decoding="async"
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

        {/* Product info — ESQUELETO CANÓNICO (idéntico en CatalogoGroupedCard):
            foto · nombre · código (píldora) · precio · bulto · stock · Agregar.
            COMPACTA (Daniel, 25-jul-2026): p-2.5 y los márgenes entre bloques
            bajados un escalón — misma medida EXACTA en las 3 marcas. */}
        <div className="p-2.5">
          {/* Name — SIEMPRE una línea (alto fijo): ver CatalogoProductName. */}
          <CatalogoProductName nombre={product.name} className={t.name} />

          {/* Código (píldora) — mt-1: nombre y código van juntos (Daniel,
              25-jul-2026; antes mt-2). El color, cuando existe, viaja como un
              chip MÁS de esta misma fila para no abrir otra línea. */}
          {(product.sku || product.color) && (
            <div className="flex flex-wrap items-center gap-1 mt-1">
              {product.sku && <span className={t.skuPill}>{product.sku}</span>}
              {product.color && (
                <span className="inline-flex items-center gap-1">
                  <span
                    className="w-3 h-3 rounded-full border border-black/10 shrink-0"
                    style={{ backgroundColor: getColorDot(product.color) }}
                  />
                  <span className={t.priceMeta}>{product.color}</span>
                </span>
              )}
            </div>
          )}

          {/* Precio + stock en el MISMO renglón (Daniel, 25-jul-2026): a la
              izquierda el precio con "Bulto de N" debajo, a la derecha el stock
              interno. Sin línea divisoria entre ellos — el stock dejó de ser
              una franja aparte. Debajo de xl la card mide ~173px y el stock no
              cabe al lado de ningún tamaño legible, así que baja bajo el precio
              (ver la medición en CatalogoStockLine). */}
          <div className="mt-1.5 flex flex-col gap-y-1 xl:flex-row xl:items-start xl:justify-between xl:gap-x-2 xl:gap-y-0">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                <span className={product.badge === "oferta" ? "text-xl font-bold tabular-nums text-[#E4002B]" : t.priceNormal}>
                  {product.price ? fmtPrecio(product.price) : "Consultar"}
                </span>
                {product.badge === "oferta" && (
                  <span className="text-xs font-bold text-[#E4002B] bg-red-50 px-1.5 py-0.5 rounded uppercase tracking-wide">
                    Oferta
                  </span>
                )}
              </div>
              {product.price != null && (
                /* Solo "Bulto de N": el precio del bulto se quitó (Daniel,
                   25-jul-2026) — competía con el precio unitario, que es el que
                   el vendedor cotiza. El indicador "● N" (bultos en stock) también
                   se quitó: la línea de Disponibilidad/Existencia ya da el dato.
                   DISCRETA (Daniel, 25-jul-2026): 10px gris — es un dato de apoyo,
                   no puede competir con el precio. Clase LITERAL e idéntica en las
                   dos cards (no sale del tema: aquí no hay color de marca). */
                <div className="flex items-baseline gap-1.5 mt-0.5">
                  <span className="text-[10px] leading-[14px] text-gray-500">Bulto de {bultoSize}</span>
                </div>
              )}
            </div>

            {/* Stock interno (Switch) — componente COMPARTIDO con la card
                agrupada (CatalogoStockLine). Solo catálogo interno (showStock);
                NUNCA en el catálogo público. */}
            {showStock && (
              <CatalogoStockLine
                marca={marca}
                disponibilidad={product.disponibilidad}
                existencia={product.existencia}
              />
            )}
          </div>

          {/* Add/Qty button — 38px de alto y márgenes apretados (Daniel,
              25-jul-2026). El control de cantidad mide lo MISMO (h-9 + 1px de
              borde arriba y abajo = 38) para que la fila del grid no crezca
              cuando un producto entra al pedido. */}
          {inOrder ? (
            <div className="mt-1.5">
              <div className={t.qtyWrap}>
                <button
                  onClick={() => setQty(qty - 1)}
                  className={`h-9 shrink-0 flex items-center justify-center ${t.qtyBtn} text-lg font-medium rounded-lg transition ${
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
                {/* `shrink-0`: sin esto el flex del qtyWrap achicaba el "+" de los
                    44 px que pide `w-11` a 23 px reales en el iPhone — el "−" no
                    se encoge porque su contenido lo sostiene, y el "+" (un solo
                    carácter) se comía todo el ajuste. La altura h-9 se respeta a
                    propósito: subirla cambiaría el alto fijo de la card. */}
                <button
                  onClick={() => setQty(qty + 1)}
                  className={`w-11 h-9 shrink-0 flex items-center justify-center ${t.qtyBtn} text-xl font-medium rounded-lg transition`}
                >
                  +
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => { if (!disabled) setQty(1); }}
              disabled={disabled}
              className={`w-full mt-1.5 py-[9px] rounded-lg text-sm leading-5 font-semibold transition min-h-[44px] xl:min-h-[38px] ${
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
        <VisorFoto src={product.image_url} alt={product.name} onClose={() => setShowLightbox(false)} />
      )}
    </>
  );
}
