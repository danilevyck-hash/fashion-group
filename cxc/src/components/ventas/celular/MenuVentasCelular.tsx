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

import { createContext, useContext, useState } from "react";
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
import { BotonPuntos, HojaCel, HojaMenuCel } from "./PiezasVentas";
import LineaDeFrescura from "@/components/shared/LineaDeFrescura";
import { empresasConFacturas } from "@/lib/switch-api/empresas";
import { FRESCURA_VISIBLE_2026_10 } from "@/lib/ui/frescura";

/**
 * 🔴 «Actualizado 9:41 ↻» de Ventas (4-oct-2026, `FRESCURA_VISIBLE_2026_10`):
 * la MISMA secuencia de «Actualizar ahora» que vivía en el «···». Va en la
 * línea gris de cada pestaña; con el interruptor apagado no se dibuja.
 */
export function FrescuraVentasCel({
  onActualizado,
  forma = "celular",
  className,
  soloHora,
  conHace,
}: {
  onActualizado: () => void;
  /** «↻ 10:01 am» al final de una línea de filtros (revisión 110). */
  soloHora?: boolean;
  /** «Actualizado hace N min ↻» (vivo-05, al final del resumen en la computadora). */
  conHace?: boolean;
  /** «computadora»: la barra de Resumen, Clientes y Productos (4-oct-2026). */
  forma?: "celular" | "computadora";
  className?: string;
}) {
  if (!FRESCURA_VISIBLE_2026_10 && forma === "celular" && !conHace) return null;
  return (
    <LineaDeFrescura
      forma={forma}
      className={className}
      soloHora={soloHora}
      conHace={conHace}
      tabla="facturas"
      empresas={empresasConFacturas()}
      opciones={SYNC_NOW_VENTAS_SECUENCIA}
      secuencial
      onSuccess={onActualizado}
    />
  );
}

/** «Cómo se usa» (videos de ayuda): lo pone VentasShell; sin él, no sale la fila. */
export const ComoSeUsaVentas = createContext<(() => void) | null>(null);

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
  /** Revisión 110: una opción más en «Descargar» (el Excel de utilidad por cliente). */
  extra?: { rotulo: string; detalle?: string; onClick: () => void | Promise<void> } | null;
}

export function MenuVentasCelular({
  pestana,
  periodoRotulo,
  onEstaPestana,
  onLasTres,
  onActualizado,
  apagada = false,
  extra = null,
}: Props) {
  const [menu, setMenu] = useState(false);
  const [descarga, setDescarga] = useState(false);
  const comoSeUsa = useContext(ComoSeUsaVentas);

  return (
    <>
      <BotonPuntos onClick={() => setMenu(true)} ariaLabel="Más opciones" />

      <HojaMenuCel abierta={menu} onCerrar={() => setMenu(false)} data-menu-ventas>
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
        {comoSeUsa && (
          <button
            type="button"
            onClick={() => {
              setMenu(false);
              comoSeUsa();
            }}
            className="mb-2 block w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-center text-[17px] text-gray-900 active:scale-[0.97]"
          >
            Cómo se usa
          </button>
        )}
        {/* Con la línea de frescura prendida, «Actualizar ahora» sale de aquí. */}
        {!FRESCURA_VISIBLE_2026_10 && (
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
        )}
      </HojaMenuCel>

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
          ...(extra
            ? [{ clave: "utilidad", rotulo: extra.rotulo, detalle: extra.detalle, onClick: () => void extra.onClick() }]
            : []),
        ]}
      />
    </>
  );
}
