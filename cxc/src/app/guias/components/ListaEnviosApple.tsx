"use client";

// ─────────────────────────────────────────────────────────────────────────────
// DETALLE DE GUÍA › LOS ENVÍOS, UNA FILA CADA UNO (2-oct-2026,
// `GUIA_DETALLE_APPLE_2026_10`). Daniel: *«mira que hay mucho espacio vacío,
// ¿qué opinas?»*.
//
// 🩸 En la computadora cada envío ocupaba TRES filas: el cliente, «Bultos» en su
// propia fila con una caja chica, y el N° del transportista como caja de ancho
// completo para un código corto.
//
// Ahora, en la computadora: cliente en negrita y debajo destino · empresa ·
// facturas en gris; a la derecha los bultos (caja angosta o «🔒 9 bultos») y el
// N° del transportista (caja de ~184 px). En el celular se apila.
//
// 🔴 SOLO CAMBIA LA PANTALLA. Las reglas de `ListaEnvios` siguen igual, y por
// eso las cajas son las MISMAS (mismos `id`, mismos setters):
//   · bultos solo con la guía PENDIENTE y quien puede despachar (`editable`), y
//     el envío etiquetado se LEE con su candado;
//   · el N° del transportista es POR LÍNEA y no bloquea.
// Lo que viaja al despachar no cambia (candado `guias-detalle-apple.test.tsx`).
// ─────────────────────────────────────────────────────────────────────────────

import type { ListaEnviosProps } from "./ListaEnvios";
import ResumenEnvio from "./ResumenEnvio";
import { numeroTranspImpreso } from "@/lib/guias/modo-despacho";
import { textoCorreccionEnVivo, textoCorreccionGuardada } from "@/lib/guias/bultos-correccion";
import { bultosBloqueadosPorEtiquetas } from "@/lib/guias/etiquetas-por-envio";

/** 44 px con el dedo, denso con mouse. Sin `w-full`: el ancho lo pone cada caja. */
const CAJA =
  "border border-gray-200 rounded-lg px-3 py-2.5 text-base md:text-sm outline-none focus:border-black transition min-h-[44px]";
const ANCHO_BULTOS = "w-[72px]";
const ANCHO_TRANSP = "sm:w-[184px]";

function Candado() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-3.5 w-3.5 text-gray-400" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="11" width="14" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </svg>
  );
}

export default function ListaEnviosApple({
  items,
  numeroGuiaCabecera,
  numerosTransp,
  setNumeroTransp,
  editable,
  externo,
  bultosPorLinea,
  setBultos,
  rol,
}: ListaEnviosProps) {
  const conTransp = editable && externo;
  const puedeContar = editable && Boolean(setBultos);
  return (
    <section>
      <div className="mb-2 flex items-end justify-between gap-4">
        <h2 className="text-[15px] font-semibold">Envíos</h2>
        {/* Los rótulos de las columnas, una sola vez y solo en la computadora. */}
        {(puedeContar || conTransp) && items.length > 0 && (
          <div aria-hidden="true" className="hidden sm:flex items-center gap-2 px-4 text-xs text-gray-500">
            {puedeContar && <span className={`${ANCHO_BULTOS} text-right`}>Bultos</span>}
            {conTransp && <span className="w-[184px]">N° del transportista</span>}
          </div>
        )}
      </div>
      {conTransp && items.length > 0 && (
        <p className="mb-2 text-xs text-gray-500">
          Anota el N° que te dio el transportista; si no dio ninguno, se despacha igual.
          {String(numeroGuiaCabecera ?? "").trim() ? (
            <>
              {" "}Al crear la guía se anotó{" "}
              <span className="font-medium text-gray-700">{String(numeroGuiaCabecera).trim()}</span>{" "}
              para toda la guía.
            </>
          ) : null}
        </p>
      )}
      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
        {items.map((item, idx) => {
          const fijos = bultosBloqueadosPorEtiquetas(item);
          const conCaja = puedeContar && !fijos;
          const enVivo = conCaja ? textoCorreccionEnVivo(item.bultos, bultosPorLinea?.[idx], rol) : "";
          const guardada = textoCorreccionGuardada(item);
          return (
            <li
              key={item.id || idx}
              data-envio-fila
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="min-w-0 flex-1">
                <ResumenEnvio item={item}>
                  <span className="block break-words text-[15px] font-semibold">{item.cliente || "Sin cliente"}</span>
                </ResumenEnvio>
                {guardada && <p className="mt-0.5 text-xs text-gray-400">{guardada}</p>}
                {enVivo && <p className="mt-0.5 text-xs text-amber-700">{enVivo}</p>}
              </div>

              <div className="flex items-center gap-2 sm:shrink-0">
                {conCaja ? (
                  <>
                    <label htmlFor={`despacho-bultos-${idx}`} className="text-xs text-gray-500 sm:sr-only">
                      Bultos
                    </label>
                    <input
                      id={`despacho-bultos-${idx}`}
                      type="number"
                      min={0}
                      inputMode="numeric"
                      value={bultosPorLinea?.[idx] ?? ""}
                      onChange={(e) => setBultos?.(idx, e.target.value)}
                      className={`${CAJA} ${ANCHO_BULTOS} tabular-nums text-right`}
                    />
                  </>
                ) : (
                  <span
                    className="inline-flex items-center gap-1 text-sm tabular-nums whitespace-nowrap"
                    data-bultos-de-etiquetas={fijos ? "1" : undefined}
                  >
                    {fijos && <Candado />}
                    {item.bultos || 0} {(item.bultos || 0) === 1 ? "bulto" : "bultos"}
                    {fijos && <span className="sr-only">, de las etiquetas impresas: no se cambian</span>}
                  </span>
                )}

                {conTransp ? (
                  <>
                    <label htmlFor={`transp-${idx}`} className="sr-only">
                      N° de guía del transportista de este envío
                    </label>
                    <input
                      id={`transp-${idx}`}
                      type="text"
                      value={numerosTransp[idx] ?? ""}
                      onChange={(e) => setNumeroTransp(idx, e.target.value)}
                      placeholder="N° del transportista"
                      className={`${CAJA} min-w-0 flex-1 sm:flex-none ${ANCHO_TRANSP}`}
                    />
                  </>
                ) : editable ? null : (
                  <span className="text-xs text-gray-500 whitespace-nowrap sm:ml-2">
                    N° del transportista:{" "}
                    <span className="font-medium text-gray-700">
                      {numeroTranspImpreso(item.numero_guia_transp, numeroGuiaCabecera) || "—"}
                    </span>
                  </span>
                )}
              </div>
            </li>
          );
        })}
        {items.length === 0 && (
          <li className="px-4 py-2.5 text-sm text-gray-400">Esta guía no tiene envíos cargados.</li>
        )}
      </ul>
    </section>
  );
}
