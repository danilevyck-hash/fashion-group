"use client";

// ─────────────────────────────────────────────────────────────────────────────
// LOS ENVÍOS DE LA GUÍA — **UNA SOLA LISTA** (17-ago-2026).
//
// 🩸 LOS 7 ENVÍOS APARECÍAN DOS VECES EN LA MISMA PANTALLA. Arriba, un bloque
// `ENVÍOS` de solo lectura (cliente · dirección · empresa · facturas · bultos) y
// más abajo, dentro del formulario de despacho, el bloque `N° DE GUÍA DEL
// TRANSPORTISTA · UNO POR LÍNEA` con **los mismos 7 renglones otra vez**, cada
// uno en su cajita. Había que bajar por la misma lista dos veces, y con 7 envíos
// la pantalla pasaba los 2.000 px en un celular.
//
// Ahora es UNA lista: cada renglón dice lo suyo **y trae su caja del N° del
// transportista ahí mismo**.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 UNA SOLA FORMA DE EDITAR (25-ago-2026). Daniel, punto 1: *"se retira el
// «Corregir» por renglón. Un formulario, el MISMO al crear y al editar"*.
//
// 🩸 ACÁ VIVÍAN DOS COSAS QUE YA NO ESTÁN:
//
//   1. **«Corregir»**, que abría una cajita con cliente, dirección, empresa,
//      bultos y facturas — o sea EXACTAMENTE los mismos campos que el
//      formulario que abre «Editar», con su propio botón de guardar, su propia
//      validación y su propio idioma. Dos caminos para arreglar el mismo
//      renglón, y en la misma pantalla.
//   2. **«Anotar el N°»** en una guía ya despachada, que desde el 18-ago-2026
//      era la única excepción. Ya no hace falta: en una guía despachada el
//      formulario se abre igual, con el N° del transportista, el cliente y las
//      facturas editables (Daniel, punto 4).
//
// ⚠️ **LAS CAJAS DEL N° DEL TRANSPORTISTA SE QUEDAN, y no son una tercera forma
// de editar**: son parte de DESPACHAR. Se llenan con el papel del chofer en la
// mano y se confirman con las firmas, en el mismo acto. Por eso solo aparecen
// mientras la guía está pendiente y solo para quien puede despachar.
//
// ⚠️ Y ESO NO PASA POR EL PUT: viaja en `items_guia_transp`, que toca UNA
// columna de cada renglón. El `items` del PUT es un reemplazo completo (borra e
// inserta, cambiando el id de cada línea) y usarlo en pleno despacho tiraría el
// trabajo de atar clientes.
// ─────────────────────────────────────────────────────────────────────────────

import type { GuiaItem } from "./types";
import ResumenEnvio from "./ResumenEnvio";
import { numeroTranspImpreso } from "@/lib/guias/modo-despacho";
import { textoCorreccionEnVivo, textoCorreccionGuardada } from "@/lib/guias/bultos-correccion";

/** Campo de texto: 44 px con el dedo, denso solo cuando hay mouse. */
const CAMPO =
  "w-full border border-gray-200 rounded-lg px-3 py-2.5 text-base md:text-sm outline-none focus:border-black transition min-h-[44px]";

interface ListaEnviosProps {
  items: GuiaItem[];
  /** El N° de la cabecera: una línea sin el suyo hereda ése, igual que el papel. */
  numeroGuiaCabecera?: string | null;
  /** Los N° del transportista por línea, en el orden de la guía. */
  numerosTransp: string[];
  setNumeroTransp: (idx: number, v: string) => void;
  /** false = guía ya despachada, o quien mira no puede despachar: solo lectura. */
  editable: boolean;
  /** En entrega directa no hay transportista al que pedirle un número. */
  externo: boolean;
  /**
   * 🔴 LOS BULTOS QUE BODEGA CUENTA, uno por línea (5-sep-2026). Daniel:
   * *«porque bodega si al despachar cuentan más bultos de lo que puso la
   * secretaria, quiero que lo pueda cambiar en caso de algún error»*.
   *
   * ⚠️ Solo se dibuja la caja cuando `editable` — o sea con la guía PENDIENTE
   * y con permiso de despachar. En una guía firmada los bultos son lo que el
   * transportista firmó y no se tocan; ahí se lee el número y, si alguien lo
   * corrigió antes de la firma, la línea discreta que lo dice.
   */
  bultosPorLinea?: number[];
  setBultos?: (idx: number, v: string) => void;
  /** El rol de quien está despachando, para la línea en vivo («↑ 7 → 8, bodega»). */
  rol?: string | null;
}

export default function ListaEnvios({
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
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      {/* "de esta guía" se fue: se está DENTRO de la guía. */}
      <span className="text-xs uppercase tracking-wide text-gray-400 block mb-1">
        Envíos
      </span>
      {/* ⚠️ UNA LÍNEA, NO UN PÁRRAFO. Acá había tres frases explicando que el
          transportista arma varias guías suyas por cada guía nuestra y que sin
          número se despacha igual. Daniel: *"no siempre hay q estar explicando
          todo, se vuelve tedioso"*. Queda la instrucción y el dato; el porqué
          se fue.

          🔴 El número que se escribió al crear la guía SE DICE, no se copia.
          Antes se prellenaban las 7 cajas con él y bodega las encontraba todas
          iguales; escondido del todo, quien despacha no sabría que ya hay uno
          anotado para toda la guía. */}
      {editable && externo && items.length > 0 && (
        <p className="text-xs text-gray-500 mb-3">
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
      <ul className="divide-y divide-gray-100">
        {items.map((item, idx) => {
          // 🔴 Contar bultos es parte de DESPACHAR: hace falta la guía pendiente
          // (`editable`) y que la pantalla haya pasado las cajas. Sin el
          // `setBultos` no se dibuja nada — es la misma pantalla de siempre.
          const puedeContar = editable && Boolean(setBultos);
          return (
          <li key={item.id || idx} className="py-3">
            <div className="flex items-start justify-between gap-3">
              <ResumenEnvio item={item} />
              {/* En una guía firmada el número se LEE. Editable, la caja está
                  abajo junto a la del N° del transportista. */}
              {!puedeContar && (
                <span className="text-sm tabular-nums shrink-0">{item.bultos || 0} bultos</span>
              )}
            </div>

            {/* 🔴 EL RASTRO DE LA CORRECCIÓN, DESPUÉS. Una línea discreta y nada
                más; en el papel, el PDF y el Excel sale el número FINAL, sin
                historia. `null` mientras la migración `20261004120000` no corra:
                sin dato no se afirma nada. */}
            {textoCorreccionGuardada(item) && (
              <p className="mt-0.5 text-xs text-gray-400">{textoCorreccionGuardada(item)}</p>
            )}

            {puedeContar && (
              <div className="mt-2 flex items-end gap-2">
                <div className="w-28 shrink-0">
                  <label htmlFor={`despacho-bultos-${idx}`} className="block text-xs text-gray-500 mb-1">
                    Bultos
                  </label>
                  <input
                    id={`despacho-bultos-${idx}`}
                    type="number"
                    min={0}
                    inputMode="numeric"
                    value={bultosPorLinea?.[idx] ?? ""}
                    onChange={(e) => setBultos?.(idx, e.target.value)}
                    className={`${CAMPO} tabular-nums text-right`}
                  />
                </div>
                {/* ↑ 7 → 8, bodega — solo cuando el número de verdad cambió. */}
                {textoCorreccionEnVivo(item.bultos, bultosPorLinea?.[idx], rol) && (
                  <p className="text-xs text-amber-700 pb-3">
                    {textoCorreccionEnVivo(item.bultos, bultosPorLinea?.[idx], rol)}
                  </p>
                )}
              </div>
            )}

            {editable && externo ? (
              <div className="mt-2">
                {/* ⚠️ El rótulo va en el campo, no encima: repetido 7 veces
                    sumaba una pantalla entera de alto en un celular, y arriba
                    de la lista ya está explicado. Se conserva como `sr-only`
                    para quien no ve la pantalla. */}
                <label htmlFor={`transp-${idx}`} className="sr-only">
                  N° de guía del transportista de este envío
                </label>
                <input
                  id={`transp-${idx}`}
                  type="text"
                  value={numerosTransp[idx] ?? ""}
                  onChange={(e) => setNumeroTransp(idx, e.target.value)}
                  placeholder="N° del transportista"
                  className={CAMPO}
                />
              </div>
            ) : editable ? null : (
              <div className="mt-0.5">
                <span className="text-xs text-gray-500">
                  N° guía transportista:{" "}
                  <span className="font-medium text-gray-700">
                    {numeroTranspImpreso(item.numero_guia_transp, numeroGuiaCabecera) || "—"}
                  </span>
                </span>
              </div>
            )}
          </li>
          );
        })}
        {items.length === 0 && (
          <li className="py-2.5 text-sm text-gray-400">Esta guía no tiene envíos cargados.</li>
        )}
      </ul>
    </div>
  );
}
