"use client";

// ============================================================================
// EL «···» DE VENTAS EN EL CELULAR — la «6a» (25-sep-2026).
//
// 🔴 EL «···» TIENE DOS COSAS Y NADA MÁS: **Descargar** y **Actualizar ahora**.
// Los dos estaban al aire en las tres pestañas, y «Descargar en Excel» se
// llevaba un renglón entero él solo en dos de ellas. Medido: 3 descargas en
// 7 días y 2 usos del botón de actualizar en 90 días.
//
// 🔴 «DESCARGAR» ES UN SOLO BOTÓN, y al tocarlo la hoja pregunta si se quiere
// **esta pestaña** o **las tres en un solo Excel**.
//
// 🔑 «Actualizar ahora» sigue siendo el MISMO `SyncNowButton` de siempre, con
// su gate de rol, su acelerador y su toast: acá no se reescribió ni una línea
// de lo que hace.
// ============================================================================

import { useState } from "react";
import SyncNowButton from "@/components/shared/SyncNowButton";
import { SYNC_NOW_VENTAS_SECUENCIA } from "@/components/shared/syncNowOpciones";
import {
  DETALLE_LAS_TRES,
  OPCION_ESTA_PESTANA,
  OPCION_LAS_TRES,
  TITULO_HOJA_DESCARGA,
  detalleDeEstaPestana,
  type PestanaDescarga,
} from "@/lib/ventas/descarga-un-boton";
import { ROTULO_DESCARGAR } from "@/lib/ventas/celular";
import { BotonPuntos, HojaCel } from "./PiezasVentas";

interface Props {
  pestana: PestanaDescarga;
  /** «año 2026», «últimos 12 meses»… para el subtítulo de la primera opción. */
  periodoRotulo: string;
  /** Baja SOLO esta pestaña, con lo que está en pantalla. */
  onEstaPestana: () => void | Promise<void>;
  /** Baja las tres en un solo archivo. */
  onLasTres: () => void | Promise<void>;
  /** Recarga los datos de la vista tras un «Actualizar ahora» bueno. */
  onActualizado: () => void;
  /** `true` mientras no haya nada que bajar. */
  apagada?: boolean;
}

export function MenuVentasCelular({
  pestana,
  periodoRotulo,
  onEstaPestana,
  onLasTres,
  onActualizado,
  apagada = false,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [descarga, setDescarga] = useState(false);

  return (
    <>
      <BotonPuntos onClick={() => setMenu(true)} ariaLabel="Más opciones" />

      {menu && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Más opciones"
          data-menu-ventas
          className="fixed inset-0 z-[60] flex flex-col justify-end"
        >
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => setMenu(false)}
            className="absolute inset-0 bg-black/30"
          />
          <div
            className="relative mx-2 mb-2 overflow-hidden rounded-2xl bg-white p-3"
            style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
          >
            <button
              type="button"
              disabled={apagada}
              data-abrir-descargar
              onClick={() => {
                setMenu(false);
                setDescarga(true);
              }}
              className="mb-2 block w-full rounded-xl bg-gray-900 px-4 py-3 text-center text-[17px] font-semibold text-white active:scale-[0.97] disabled:bg-gray-300"
            >
              {ROTULO_DESCARGAR}
            </button>
            <div className="[&>*]:w-full">
              <SyncNowButton
                opciones={SYNC_NOW_VENTAS_SECUENCIA}
                secuencial
                className="w-full justify-center"
                onSuccess={() => {
                  setMenu(false);
                  onActualizado();
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => setMenu(false)}
              className="mt-2 block w-full rounded-xl px-4 py-3 text-center text-[17px] text-gray-600 active:bg-gray-100"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      <HojaCel
        abierta={descarga}
        titulo={TITULO_HOJA_DESCARGA}
        onCerrar={() => setDescarga(false)}
        opciones={[
          {
            clave: "esta-pestana",
            rotulo: OPCION_ESTA_PESTANA,
            detalle: detalleDeEstaPestana(pestana, periodoRotulo),
            onClick: () => void onEstaPestana(),
          },
          {
            clave: "las-tres",
            rotulo: OPCION_LAS_TRES,
            detalle: DETALLE_LAS_TRES,
            onClick: () => void onLasTres(),
          },
        ]}
      />
    </>
  );
}
