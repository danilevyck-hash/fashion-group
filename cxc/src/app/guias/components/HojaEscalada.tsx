"use client";

// ─────────────────────────────────────────────────────────────────────────────
// La guía de despacho en pantalla: LA HOJA ENTERA, ACHICADA.
//
// ── 🩸 POR QUÉ EXISTE (30-jul-2026) ─────────────────────────────────────────
//
// La guía impresa mide ~548px de contenido (7 columnas: cliente, dirección,
// empresa, facturas, bultos, guía de transporte). En un iPhone de 390 quedan
// ~358px útiles, así que se arrastraba 158px.
//
// Se le ofrecieron tres salidas a Daniel y eligió esta: **verla completa,
// achicada**, como la vista previa de un PDF, y tocarla para agrandarla.
//
// El razonamiento que compró: el problema real NO es que la guía sea ancha —
// es que en el celular **no se sabe que hay algo más a la derecha**. Achicarla
// resuelve eso sin tocar el papel. La otra opción (tarjetas en pantalla, tabla
// en papel) se lee mejor, pero **parte el documento en dos versiones**, y ese
// papel es el respaldo de la entrega: que la pantalla y la hoja digan lo mismo
// vale más que la comodidad.
//
// ── EL CORTE NO ES UN BREAKPOINT: ES ARITMÉTICA ──────────────────────────────
//
// No hay `sm:`/`lg:` acá. La hoja se achica **solo si no entra**, comparando su
// ancho natural real contra el hueco disponible. Eso importa porque el ancho
// natural depende de los DATOS (un cliente con nombre largo ensancha la tabla),
// así que un breakpoint fijo acertaría a veces y fallaría a veces. Medido:
//
//   390  → 358 útiles vs 532 de hoja → escala 0.673, se achica
//   834  → 562 útiles vs 532 de hoja → **entra sola, NO se toca** (ya daba 0px)
//   1024 → 752 útiles → no se toca
//   1440 → 1104 útiles → no se toca
//
// El ancho natural se lee con `scrollWidth` en flujo normal (= el piso real del
// contenido, 548). ⚠️ **NO con `width: max-content`**, que fue el primer intento
// y estaba mal: max-content estira la tabla hasta no cortar una sola línea
// —1.616px medidos— y eso achicaba la hoja en los CUATRO anchos, escritorio
// incluido. Cuando la hoja entra no se le fija ancho ninguno, así que iPad, 1024
// y escritorio quedan EXACTAMENTE como estaban.
//
// ── 🔴 EL PAPEL NO SE PUEDE ENTERAR DE NADA DE ESTO ──────────────────────────
//
// `globals.css` deja, dentro de `@media print`:
//     #print-document { position: absolute; left: 0; top: 0; width: 100%; }
//
// **Un ancestro con `transform` distinto de `none` crea un bloque contenedor
// para los descendientes `position: absolute`.** Si la escala sobreviviera al
// print, el documento se posicionaría y se dimensionaría contra este marco
// escalado, y la guía saldría chica o cortada EN EL PAPEL. Por eso el bloque
// `@media print` de abajo anula transform, ancho, alto y overflow con
// `!important`: el transform es un estilo INLINE (es dinámico) y una clase de
// Tailwind no le gana.
//
// No se verifica mirando: `scripts/_verif-guia-impresa-identica.mjs` genera el
// PDF con el Chrome real desde un viewport de 390 —donde la escala está
// activa— y compara páginas, tamaño de hoja y el texto completo contra el
// original. La regla de la casa es no dar por buena una impresión sin abrir el
// archivo.
//
// **Y NO es un riesgo teórico: se probó quitando estas dos líneas.** Con el
// guard: 106 palabras, desplazamiento máximo 0,0000 pts, borde derecho 542,72.
// Sin el guard: la guía sale impresa al **73,3 %** —exactamente la escala de
// pantalla— y el borde derecho cae a 447,33 pts. O sea que estas dos líneas son
// lo único que separa el papel correcto de una guía chica.
//
// ── Y SE TIENE QUE VER CÓMO VOLVER ──────────────────────────────────────────
//
// Ampliar sin salida visible cambia un problema por otro. En modo ampliado hay
// un botón fijo "Ver hoja completa" (44px) además de tocar la hoja.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";

export default function HojaEscalada({ children }: { children: ReactNode }) {
  const marcoRef = useRef<HTMLDivElement>(null);
  const hojaRef = useRef<HTMLDivElement>(null);
  const [ampliado, setAmpliado] = useState(false);
  const [medida, setMedida] = useState({ disponible: 0, ancho: 0, alto: 0 });

  const medir = useCallback(() => {
    const marco = marcoRef.current;
    const hoja = hojaRef.current;
    if (!marco || !hoja) return;
    // 🩸 `clientWidth` INCLUYE el padding. El marco lleva `px-4`, así que a 390
    // devolvía 390 cuando el hueco real para dibujar es 358: la hoja se escalaba
    // a 390 de ancho, arrancaba en x=16 y terminaba en 406 — **16px fuera de la
    // pantalla**, con la última columna cortada. El síntoma engañaba porque el
    // arrastre del marco daba 0 (overflow-hidden lo recorta en silencio).
    const cs = getComputedStyle(marco);
    const relleno = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    setMedida((prev) => {
      const sig = {
        disponible: Math.max(0, marco.clientWidth - (Number.isFinite(relleno) ? relleno : 0)),
        // 🩸 `scrollWidth`, NO `max-content`. Con `width: max-content` la tabla
        // se estira hasta no cortar UNA sola línea: medido, 1.616px contra los
        // ~548 que ocupa de verdad. Eso achicaba la hoja **en los cuatro
        // anchos** (escala 0.68 hasta en 1440), o sea rompía el escritorio.
        //
        // En flujo normal `scrollWidth` = max(ancho mínimo real del contenido,
        // ancho del contenedor): 548 en un iPhone —el piso de la tabla— y 1.104
        // en escritorio, donde no desborda nada. Justo la pregunta correcta.
        //
        // scrollWidth/offsetHeight son de LAYOUT: el transform no los toca, así
        // que siguen siendo el tamaño natural aunque la hoja esté achicada. Y
        // cuando la hoja YA está fijada a su ancho natural, scrollWidth vuelve a
        // dar ese mismo número → la medición no oscila.
        ancho: Math.max(hoja.scrollWidth, hoja.offsetWidth),
        alto: hoja.offsetHeight,
      };
      return prev.disponible === sig.disponible && prev.ancho === sig.ancho && prev.alto === sig.alto
        ? prev
        : sig;
    });
  }, []);

  useLayoutEffect(() => {
    medir();
    const ro = new ResizeObserver(medir);
    if (marcoRef.current) ro.observe(marcoRef.current);
    if (hojaRef.current) ro.observe(hojaRef.current);
    window.addEventListener("resize", medir);
    return () => { ro.disconnect(); window.removeEventListener("resize", medir); };
  }, [medir]);

  // Escala: 1 salvo que la hoja no entre. Nunca agranda.
  const cabe = medida.disponible === 0 || medida.ancho === 0 || medida.ancho <= medida.disponible;
  const escala = cabe ? 1 : medida.disponible / medida.ancho;
  const achicada = !cabe && !ampliado;

  // Al salir del modo ampliado, el marco vuelve al principio: si quedaba
  // scrolleado a la derecha, la hoja achicada aparecería corrida.
  useEffect(() => { if (!ampliado && marcoRef.current) marcoRef.current.scrollLeft = 0; }, [ampliado]);

  // Escape también sale del zoom (además del botón).
  useEffect(() => {
    if (!ampliado) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setAmpliado(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [ampliado]);

  const puedeAmpliar = !cabe;

  return (
    <>
      <style>{`
        @media print {
          [data-hoja-marco], [data-hoja-escala] {
            /* 🔴 transform Y position: LAS DOS cosas crean un bloque contenedor
               para el #print-document, que en print es position:absolute con
               width:100%. Si cualquiera de las dos sobrevive, el papel sale
               mal. El marco necesita position:relative en pantalla (para el
               overlay que amplía), así que acá se devuelve a static. */
            transform: none !important;
            position: static !important;
            width: auto !important;
            min-width: 0 !important;
            height: auto !important;
            max-height: none !important;
            overflow: visible !important;
            margin: 0 !important;
            padding: 0 !important;
          }
        }
      `}</style>

      {puedeAmpliar && (
        <div className="no-print mb-2 flex items-center justify-between gap-3">
          <p className="text-xs text-gray-400">
            {ampliado ? "Arrastra para ver el resto de la hoja." : "Toca la hoja para verla más grande."}
          </p>
          <button
            type="button"
            onClick={() => setAmpliado((a) => !a)}
            className="inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-md border border-gray-200 px-4 text-sm text-gray-600 transition hover:border-gray-400 hover:text-black active:bg-gray-100"
          >
            {ampliado ? "Ver hoja completa" : "Ver más grande"}
          </button>
        </div>
      )}

      <div
        ref={marcoRef}
        data-hoja-marco
        className={`relative ${ampliado ? "overflow-x-auto" : "overflow-hidden"} -mx-4 px-4 sm:mx-0 sm:px-0 print:overflow-visible print:mx-0 print:px-0`}
        style={achicada ? { height: Math.ceil(medida.alto * escala) } : undefined}
      >
        <div
          ref={hojaRef}
          data-hoja-escala
          // Cuando la hoja entra, NO se le fija ancho: queda en flujo normal y
          // llena el contenedor, exactamente como estaba antes de este cambio
          // (por eso iPad, 1024 y escritorio no cambian en nada).
          //
          // Cuando NO entra, se la fija a su ancho natural medido y se la achica
          // por ese mismo factor: `548 × (358/548) = 358`, o sea la hoja entera
          // dentro de la pantalla. Fijar el ancho es imprescindible — escalar un
          // elemento que ya está recortado a 358 solo achica el pedazo visible.
          style={
            achicada
              ? {
                  width: medida.ancho,
                  transform: `scale(${escala})`,
                  transformOrigin: "top left",
                }
              : undefined
          }
        >
          {children}
        </div>

        {/* La hoja achicada se toca para agrandarla. Va por encima del
            documento y NO se imprime. */}
        {achicada && (
          <button
            type="button"
            data-hoja-ampliar
            aria-label="Ver la guía más grande"
            onClick={() => setAmpliado(true)}
            className="no-print absolute inset-0 h-full w-full cursor-zoom-in"
            style={{ position: "absolute", inset: 0 }}
          />
        )}
      </div>

      {ampliado && (
        <button
          type="button"
          data-hoja-reducir
          onClick={() => setAmpliado(false)}
          className="no-print mt-2 inline-flex min-h-[44px] w-full items-center justify-center rounded-md border border-gray-200 text-sm text-gray-600 transition hover:border-gray-400 hover:text-black active:bg-gray-100"
        >
          Ver hoja completa
        </button>
      )}
    </>
  );
}
