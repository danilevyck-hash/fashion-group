"use client";

// Tarjeta de producto AGRUPADO por modelo (marcas con features.agrupacionPorModelo
// — hoy Joybees): un card por modelo con botón Agregar por variante de género.
// Parametrizada por MARCA_THEME (generalización de JoybeesGroupedCard).

import { useState, useEffect, useRef } from "react";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";
import { useEscapeClose } from "@/lib/hooks/useModalDismiss";
import { type JoybeesProduct, type GroupedProduct, tienePreciosDistintos } from "./groupByModel";
import CatalogoProductName from "./CatalogoProductName";
import CatalogoStockLine from "./CatalogoStockLine";
import { supabaseThumb } from "@/lib/image-thumb";
import { disponibleVendible } from "@/lib/catalogos/disponible";
import { fmtPrecio } from "@/lib/catalogo/precio";
import VisorFoto from "./VisorFoto";

// ─────────────────────────────────────────────────────────────────────────────
// SELECTOR DE TALLA — solo esta card (30-jul-2026)
//
// 🩸 Un modelo con dos tallas mostraba la SUMA de los dos stocks y ni uno de los
// dos números reales aparecía en ninguna parte. Medido en producción:
// `UKVCG.MTC` decía "Disponibilidad 335", que eran 168 Junior + 167 Kids. Un
// vendedor que vendía 200 Junior contra ese 335 quedaba corto por 32 bultos.
//
// Lo aprobado por Daniel (opción A del mockup): DOS BOTONES DE TALLA dentro de la
// tarjeta, cada uno con SU stock a la vista sin tocar nada — *"tiene q ser medio
// obvio para el cliente y vendedor al ver el catálogo que hay dos tallas
// disponibles"* — el activo con fondo oscuro, la línea de disponibilidad
// siguiendo a la talla elegida, y **la suma nunca más en pantalla** (por eso la
// función que sumaba se BORRÓ, no se dejó sin llamar).
//
// **SOLO Joybees**, textual: *"opcion a sin rehacer el diseño en las 3 marcas
// para que sigan iguales, solo ahi en joybees"*. Esta card es la única con
// `features.agrupacionPorModelo`, así que Reebok y Tommy —que usan
// CatalogoProductCard— no cambian ni un pixel. El esqueleto canónico
// (foto · nombre · código · precio · bulto · stock · Agregar) se respeta: el
// selector se INTERCALA entre el stock y el botón, no reordena nada.
//
// Un modelo de UNA sola talla se ve EXACTAMENTE como antes: sin selector, con su
// stock a la derecha del precio. Es el 90% del catálogo.
// ─────────────────────────────────────────────────────────────────────────────

interface CatalogoGroupedCardProps {
  marca: MarcaUiKey;
  group: GroupedProduct;
  cartMap: Map<string, number>;
  onQtyChange: (productId: string, qty: number, product: JoybeesProduct) => void;
  disabled?: boolean;
  showBultos?: boolean; // vendor mode: cantidad tecleable (tap sobre el número)
  showStock?: boolean;  // catálogo interno: Disponibilidad + Existencia (NO en público)
  /** Cards del primer viewport: foto eager + prioridad alta (LCP). Ver
   *  CatalogoProductCard — misma regla en las dos cards. */
  priority?: boolean;
}

export default function CatalogoGroupedCard({
  marca, group, cartMap, onQtyChange, disabled, showBultos, showStock, priority,
}: CatalogoGroupedCardProps) {
  const theme = getMarcaTheme(marca)!;
  const t = theme.card;
  const BULTO_SIZE = theme.bulto();
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

  // ── Talla elegida ──
  // El orden de las variantes es el que trae el catálogo (no se reordena: es el
  // mismo en que hoy salen los botones "Agregar Junior" / "Agregar Kids").
  // `Math.min` acota el índice si el grupo se queda con menos variantes tras un
  // refresco de datos: sin eso, `sel` quedaría undefined y la card no renderiza.
  const [tallaIdx, setTallaIdx] = useState(0);
  const idx = Math.min(tallaIdx, group.variants.length - 1);
  const sel = group.variants[idx];
  const preciosDistintos = tienePreciosDistintos(group);

  /* Colores del selector: SALEN DEL TEMA, no hardcodeados. El activo reusa el
     mismo fondo oscuro del botón Agregar (t.addBtn) — es lo que Daniel aprobó
     como "seleccionado" — y el inactivo el color de texto del stock sobre
     blanco, con borde gris neutro. Así una marca futura con agrupación por
     modelo hereda sus colores sin tocar este archivo. */
  const tallaOn = `border-transparent ${t.addBtn}`;
  const tallaOff = `border-gray-300 bg-white hover:border-gray-400 hover:bg-gray-50 ${t.stock.strong}`;

  // Escape cierra igual que el clic fuera (que ya existe en los dos overlays):
  // en la cantidad equivale a Cancelar — nunca guarda lo tecleado.
  // Espejo exacto de CatalogoProductCard.
  useEscapeClose(!!qtyInputFor, () => setQtyInputFor(null));
  useEscapeClose(showLightbox, () => setShowLightbox(false));

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

        {/* Product info — ESQUELETO CANÓNICO (idéntico a CatalogoProductCard):
            foto · nombre · código (píldora) · precio · bulto · stock · Agregar.
            Los chips de categoría y de género se quitaron (Daniel, 25-jul-2026):
            la sección del grid ya dice el género y el tipo ya vive en el nombre
            del producto.
            COMPACTA (Daniel, 25-jul-2026): p-2.5 y márgenes bajados un escalón,
            EXACTAMENTE los mismos valores que CatalogoProductCard. */}
        <div className="p-2.5">
          {/* Name — SIEMPRE una línea (alto fijo): ver CatalogoProductName. */}
          <CatalogoProductName nombre={group.name} className={t.name} />

          {/* Código (píldora) — mismo componente visual que la card plana. */}
          <div className="flex flex-wrap items-center gap-1 mt-1">
            <span className={t.skuPill}>{group.baseSku}</span>
          </div>

          {/* Precio + stock en el MISMO renglón (Daniel, 25-jul-2026): espejo
              EXACTO de CatalogoProductCard — izquierda precio con "Bulto de N"
              debajo, derecha el stock, sin línea divisoria. Regalia fluye como
              producto normal (precio + Agregar). Sin "/unidad". */}
          <div className="mt-1.5 flex flex-col gap-y-1 xl:flex-row xl:items-start xl:justify-between xl:gap-x-2 xl:gap-y-0">
            <div className="min-w-0">
              <div className="flex items-baseline gap-2">
                {/* El precio es el de la TALLA ELEGIDA, nunca un precio de
                    grupo: `UKTRK.BLK` es KIDS $13 y JUNIOR $15, y el número
                    grande tiene que ser el del bulto que se va a pedir. Con una
                    sola talla es el mismo de siempre. */}
                <span className={t.priceNormal}>{fmtPrecio(sel.product.price)}</span>
              </div>
              {/* Solo "Bulto de N" — el precio del bulto y el indicador "● N" se
                  quitaron en las 3 marcas (Daniel, 25-jul-2026). Espejo exacto de
                  CatalogoProductCard, incluida la línea DISCRETA de 10px gris. */}
              <div className="flex items-baseline gap-1.5 mt-0.5">
                <span className="text-[10px] leading-[14px] text-gray-500">Bulto de {BULTO_SIZE}</span>
              </div>
            </div>

            {/* Stock interno (Switch) — componente COMPARTIDO con la card plana.
                Solo catálogo interno (showStock); NUNCA en el público.
                Con VARIAS tallas el bloque baja al pie del selector, porque ahí
                tiene que decir de qué talla es el número (ver más abajo): al
                lado del precio "Disponibilidad 168 · Junior" no cabe. */}
            {showStock && isSingleVariant && (
              <CatalogoStockLine
                marca={marca}
                disponibilidad={sel.product.disponibilidad}
                existencia={sel.product.existencia}
              />
            )}
          </div>

          {/* ── Selector de talla (solo modelos con 2+ tallas) ──
              Cada botón trae SU stock: el vendedor ve los dos números sin tocar
              nada. 44px de alto (mínimo táctil de iOS/Android) y `flex-1` +
              `min-w-0` + `truncate`: los botones se reparten el ancho de la card
              y NUNCA la desbordan, ni en 390px de iPhone. En el catálogo público
              no se muestra stock interno — ahí el botón es solo la talla. */}
          {!isSingleVariant && (
            <div className="mt-1.5 flex gap-1.5" role="group" aria-label="Talla">
              {group.variants.map((v, i) => {
                const activa = i === idx;
                const enPedido = cartMap.get(v.product.id) || 0;
                const sinStock = disponibleVendible(v.product) === 0;
                return (
                  <button
                    key={v.product.id}
                    type="button"
                    onClick={() => setTallaIdx(i)}
                    aria-pressed={activa}
                    className={`relative flex-1 min-w-0 min-h-[44px] px-1 py-1 rounded-lg border transition flex flex-col items-center justify-center ${activa ? tallaOn : tallaOff}`}
                  >
                    <span className="max-w-full truncate text-[10px] leading-[13px] font-bold uppercase tracking-wide">
                      {v.genderLabel}{preciosDistintos ? ` · ${fmtPrecio(v.product.price)}` : ""}
                    </span>
                    {showStock && (
                      <span className={`max-w-full truncate text-[10px] leading-[13px] tabular-nums ${activa ? "opacity-80" : "opacity-60"}`}>
                        {sinStock ? "Agotado" : (v.product.disponibilidad ?? "—")}
                      </span>
                    )}
                    {/* Insignia: bultos de ESTA talla ya en el pedido. Sin ella,
                        el control de cantidad de la talla no elegida quedaría
                        escondido y se perdería de vista lo ya pedido. */}
                    {enPedido > 0 && (
                      <span className="absolute -top-1.5 -right-1.5 min-w-[17px] h-[17px] px-1 rounded-full bg-emerald-600 text-white text-[9px] font-bold leading-[17px] tabular-nums">
                        {enPedido}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Disponibilidad de la TALLA ELEGIDA — nunca la suma de las dos.
              Mismo componente compartido de arriba, con el nombre de la talla
              pegado al número para que se lea "Disponibilidad 168 · Junior". */}
          {showStock && !isSingleVariant && (
            <div className="mt-1.5">
              <CatalogoStockLine
                marca={marca}
                disponibilidad={sel.product.disponibilidad}
                existencia={sel.product.existencia}
                talla={sel.genderLabel}
              />
            </div>
          )}

          {/* Action buttons — Regalia usa Agregar como cualquier producto normal.
              38px de alto y márgenes apretados (Daniel, 25-jul-2026); el control
              de cantidad mide lo MISMO (h-9 + 1px de borde arriba y abajo = 38). */}
          <div className="mt-1.5">
              {(() => {
                const v = sel;
                const qty = cartMap.get(v.product.id) || 0;
                const inOrder = qty > 0;
                // "Agotado" se decide por DISPONIBILIDAD (vendible), no por
                // existencia: si todo el saldo está apartado no hay nada que
                // vender aunque la bodega tenga cajas. Antes leía
                // `v.product.stock`, que es el espejo de existencia.
                const agotado = disponibleVendible(v.product) === 0;
                const buttonLabel = isSingleVariant
                  ? (agotado ? "Agotado" : "Agregar")
                  : (agotado ? `${v.genderLabel} — Agotado` : `Agregar ${v.genderLabel}`);

                return inOrder ? (
                  <div key={v.product.id}>
                    <div className={t.qtyWrap}>
                      <button
                        onClick={() => setQty(v.product.id, v.product, qty - 1)}
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
                      <button
                        onClick={showBultos ? () => openQtyInput(v.product, qty) : undefined}
                        className="text-center min-w-[48px] py-1"
                      >
                        <span className={t.qtyNum}>{qty}</span>
                        <span className={t.qtyUnit}>{qty === 1 ? "bulto" : "bultos"}</span>
                      </button>
                      <button
                        onClick={() => setQty(v.product.id, v.product, qty + 1)}
                        className={`w-11 h-9 shrink-0 flex items-center justify-center ${t.qtyBtn} text-xl font-medium rounded-lg transition`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    key={v.product.id}
                    onClick={() => { if (!disabled) setQty(v.product.id, v.product, 1); }}
                    disabled={disabled || agotado}
                    className={`w-full py-[9px] rounded-lg text-sm leading-5 font-semibold transition min-h-[44px] xl:min-h-[38px] ${
                      disabled || agotado
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : t.addBtn
                    }`}
                  >
                    {buttonLabel}
                  </button>
                );
              })()}
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
        <VisorFoto src={group.image_url} alt={group.name} onClose={() => setShowLightbox(false)} />
      )}
    </>
  );
}
