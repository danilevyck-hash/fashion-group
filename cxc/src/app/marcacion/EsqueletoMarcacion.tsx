// ─────────────────────────────────────────────────────────────────────────────
// EL ESQUELETO DE MARCACIÓN — lo que ocupa el lugar mientras no hay dato
// (19-sep-2026).
//
// 🔴 ES UNO SOLO, Y POR ESO VIVE ACÁ. Lo dibujan las DOS esperas de esta
// pantalla: `loading.tsx` (mientras el servidor arma el estado) y
// `MarcacionClient` (si el servidor no lo pudo armar y el dato tiene que venir
// del navegador, como antes). Dos esqueletos distintos es cómo se llega a que
// la pantalla salte distinto según por dónde se entró.
//
// 🔴 CADA BLOQUE MIDE LO MISMO QUE LO QUE VA A REEMPLAZAR, y por eso las
// alturas están escritas con el mismo número que la pantalla de verdad:
//   · el saludo        `text-sm`        → h-5      (20 px)
//   · el reloj grande  `text-[46px]`    → h-[46px]
//   · la fecha         `text-sm`        → h-5
//   · el botón         `min-h-[56px]`   → min-h-[56px], el MISMO
//   · «Mis marcas»     `text-sm`        → h-5
// Si uno de esos números cambia de un lado, tiene que cambiar del otro: hay
// candado que los compara. Un esqueleto que mide distinto no arregla el
// parpadeo, lo cambia por un salto — que se siente peor.
//
// ⚠️ NO DICE «Cargando…». Un texto centrado que después desaparece es
// exactamente el salto que se está evitando.
// ─────────────────────────────────────────────────────────────────────────────

import {
  CLASES_CAJON_BOTON,
  MARCACION_UN_TOQUE,
  PADDING_ABAJO_BOTON,
} from "@/lib/marcacion/un-toque";

/**
 * Los bloques, y nada más. Va DENTRO del `<main>` de la pantalla, que ya trae
 * su ancho y sus márgenes: por eso no los repite.
 *
 * 🔴 CON «UN TOQUE» SON TRES, NO CINCO (24-sep-2026), y por la MISMA razón de
 * siempre: el esqueleto mide lo que va a reemplazar. La pantalla nueva no
 * dibuja «Mis marcas», su reloj es de 56 px y su botón vive pegado al borde de
 * abajo, en el cajón fijo — así que el esqueleto pone el botón AHÍ, no en
 * medio del texto. Las medidas salen de las MISMAS constantes que el botón de
 * verdad.
 */
export function BloquesDelEsqueleto() {
  if (MARCACION_UN_TOQUE) {
    return (
      <div aria-hidden="true" data-esqueleto="marcacion">
        <div className="h-5 w-40 rounded bg-gray-100 animate-pulse" />
        <div className="mt-2 h-[56px] w-56 rounded bg-gray-100 animate-pulse" />
        <div className="mt-2 h-5 w-64 rounded bg-gray-100 animate-pulse" />
        <div data-boton-fijo className={CLASES_CAJON_BOTON} style={{ paddingBottom: PADDING_ABAJO_BOTON }}>
          <div className="mx-auto w-full max-w-md">
            <div className="min-h-[52px] w-full rounded-xl bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div aria-hidden="true" data-esqueleto="marcacion">
      <div className="h-5 w-40 rounded bg-gray-100 animate-pulse" />
      <div className="mt-3 h-[46px] w-56 rounded bg-gray-100 animate-pulse" />
      <div className="mt-2 h-5 w-64 rounded bg-gray-100 animate-pulse" />
      <div className="mt-6 min-h-[56px] w-full rounded-md bg-gray-100 animate-pulse" />
      <div className="mt-8 h-5 w-52 rounded bg-gray-100 animate-pulse" />
    </div>
  );
}

/**
 * La pantalla entera en esqueleto, para `loading.tsx` — que se dibuja ANTES
 * que `AppHeader`, así que tiene que poner también la barra de arriba.
 *
 * ⚠️ La barra mide `h-11` + 2 px de borde: el alto REAL del encabezado en
 * celular. Con `h-14`, que es lo que usan las otras seis pantallas de la casa
 * (todas de escritorio), el contenido bajaría 10 px al entrar el encabezado de
 * verdad — un salto, que es justo lo que se está evitando.
 */
export default function EsqueletoMarcacion() {
  return (
    <div className="min-h-screen bg-white">
      <div className="h-11 w-full border-b-2 border-gray-200 bg-white" />
      <div className="mx-auto w-full max-w-md px-4 pb-16 pt-6">
        <BloquesDelEsqueleto />
      </div>
    </div>
  );
}
