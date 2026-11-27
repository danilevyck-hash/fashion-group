"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <LineaDeFrescura /> — «Actualizado 4:00 pm ↻» (celular) o «Actualizado hace
// 5 min · Actualizar» (computadora), al estilo Mail de Apple (4-oct-2026).
//
// 🔴 LA ÚNICA FORMA DE DECIR «DE CUÁNDO ES EL DATO» Y DE ACTUALIZARLO, EN TODO
// EL SISTEMA. Daniel, 4-oct-2026: *«tiene que estar así en TODO el sistema. No
// en uno sí y otro diferente»*. Mismo texto, mismo ícono (↻), mismo toque: al
// tocar, actualiza y el ↻ gira. Candado `frescura-unica.test.ts`.
//
// De dónde sale la hora (una de dos):
//   · `tabla` + `empresas`: `/api/sync-status` (el MISMO `useEstadoSync` de
//     `<SyncStatus>`).
//   · `actualizado`: la fecha que la pantalla ya tiene (catálogo, Guías…).
// Qué hace el toque (una de dos, o ninguna = la hora sola):
//   · `opciones`: el MISMO `SyncNowButton` (permisos, acelerador, enganche al
//     sync en curso, secuencia con progreso y avisos no cambian).
//   · `onActualizar`: la acción propia de la pantalla (Guías, el reloj…).
// `forma` omitida = las dos, celular hasta `md` y computadora desde `md`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState, type ReactNode } from "react";
import SyncNowButton, { AvisoPausaEnBoton, CLASE_BOTON_LINEA, type SyncNowOpcion } from "./SyncNowButton";
import { usePausaSwitch } from "./usePausaSwitch";
import { useAccionDelGesto } from "./DeslizarParaActualizar";
import { useEstadoSync, type SyncTable } from "./useEstadoSync";
import { haceCuantoFrescura, horaDeFrescura } from "@/lib/ui/frescura";
import { TEXTO_ACTUALIZANDO } from "@/lib/ui/actualizar-ahora";
import { FRESCURA_GIRO_GRANDE_2026_11 as GIRO_GRANDE } from "@/lib/ui/celular-optimizar-2026-11";

type Forma = "celular" | "computadora";

interface Comun {
  forma?: Forma;
  className?: string;
  /** La palabra del toque en la computadora. «Actualizar» por defecto. */
  accion?: string;
  /** Lo que dice mientras corre. «Actualizando…» por defecto. */
  ocupado?: string;
  /** Celular: «↻ 10:01 am», sin «Actualizado», para cerrar una línea de
   *  filtros (revisión 110, Ventas › Clientes). */
  soloHora?: boolean;
  /** Celular con «hace N min» en vez de la hora (vivo-05: la línea del resumen en la computadora). */
  conHace?: boolean;
}

type Fuente =
  | { tabla: SyncTable; empresas: readonly string[]; actualizado?: never }
  | { actualizado: string | null | undefined; tabla?: never; empresas?: never };

type Toque =
  | {
      opciones: SyncNowOpcion[];
      secuencial?: boolean;
      paralelo?: boolean;
      resumenExito?: string | ((cantidad: number) => string);
      roles?: string[];
      disabledReason?: string | null;
      onSuccess: () => void | Promise<void>;
      onActualizar?: never;
    }
  | {
      onActualizar: () => void | Promise<void>;
      /** La pantalla sigue ocupada aunque la promesa ya volvió (el reloj). */
      actualizando?: boolean;
      /** La acción NO lee de Switch (el reloj de asistencia): no se apaga en una pausa. */
      sinSwitch?: boolean;
      deshabilitado?: boolean;
      opciones?: never;
    }
  | { opciones?: never; onActualizar?: never };

export type LineaDeFrescuraProps = Comun & Fuente & Toque;

export default function LineaDeFrescura(props: LineaDeFrescuraProps) {
  return props.tabla ? <DesdeSyncStatus {...props} tabla={props.tabla} /> : <Linea {...props} iso={props.actualizado ?? null} />;
}

function DesdeSyncStatus(props: LineaDeFrescuraProps & { tabla: SyncTable }) {
  const { data } = useEstadoSync(props.tabla, props.empresas ?? []);
  return <Linea {...props} iso={data?.last_global ?? null} />;
}

/** El ↻. Gira mientras actualiza. `grande`: el del celular, en un cuadro de 44 px. */
function Giro({ girando, grande = false }: { girando: boolean; grande?: boolean }) {
  const giro = (
    <span aria-hidden className={`inline-block leading-none ${girando ? "animate-spin" : ""}`}>
      ↻
    </span>
  );
  if (!grande) return giro;
  return (
    <span aria-hidden className="-ml-3 -mr-3 inline-flex h-11 w-11 shrink-0 items-center justify-center text-[22px]">
      {giro}
    </span>
  );
}

function Linea(props: LineaDeFrescuraProps & { iso: string | null }) {
  const { iso, forma, className } = props;
  const pausa = usePausaSwitch();
  // «hace 5 min» se mueve solo, sin volver a preguntar.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (!forma) {
    return (
      <>
        <Linea {...props} forma="celular" className={`md:!hidden ${className ?? ""}`} />
        <Linea {...props} forma="computadora" className={`!hidden md:!inline-flex ${className ?? ""}`} />
      </>
    );
  }

  const cuando = iso ? (forma === "celular" && !props.conHace ? horaDeFrescura(iso, ahora) : haceCuantoFrescura(iso, ahora)) : null;
  const texto = cuando ? `Actualizado ${cuando}` : null;
  const accion = props.accion ?? "Actualizar";
  const ocupado = props.ocupado ?? TEXTO_ACTUALIZANDO;

  // Lo que dice el toque, en reposo y mientras corre.
  const rotulo = (corriendo: boolean, progreso: string = ""): ReactNode =>
    forma === "celular" && props.soloHora ? (
      <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px]">
        <span aria-label={accion} className="text-blue-600"><Giro girando={corriendo} /></span>
        <span className="tabular-nums text-gray-500">{corriendo ? "…" : cuando ?? ""}</span>
      </span>
    ) : forma === "celular" ? (
      <>
        <span className="text-gray-500">{corriendo ? `${ocupado}${progreso}` : texto ?? accion}</span>
        {GIRO_GRANDE ? (
          <span aria-label={accion} className="text-blue-600"><Giro girando={corriendo} grande /></span>
        ) : (
          <span aria-label={accion} className="text-blue-600"> <Giro girando={corriendo} /></span>
        )}
      </>
    ) : (
      <>
        {texto && <span aria-hidden className="text-gray-400">·&nbsp;</span>}
        {corriendo ? (
          <>
            <Giro girando />
            &nbsp;{ocupado}
            {progreso}
          </>
        ) : (
          accion
        )}
      </>
    );

  const sinToque = forma === "celular" ? (texto ? <span className="text-gray-500">{texto}</span> : null) : null;

  let toque: ReactNode = sinToque;
  if (props.opciones) {
    toque = (
      <SyncNowButton
        variante="linea"
        opciones={props.opciones}
        secuencial={props.secuencial}
        paralelo={props.paralelo}
        resumenExito={props.resumenExito}
        roles={props.roles}
        disabledReason={props.disabledReason}
        onSuccess={props.onSuccess}
        rotulo={rotulo}
        sinPermiso={sinToque}
      />
    );
  } else if (props.onActualizar && pausa?.activa && !props.sinSwitch) {
    // «Pausar Switch»: la acción propia también lee de Switch (Guías, Caja…).
    toque = <AvisoPausaEnBoton texto={pausa.texto ?? "Switch en pausa"} variante="linea" />;
  } else if (props.onActualizar) {
    toque = (
      <BotonPropio
        onActualizar={props.onActualizar}
        actualizando={!!props.actualizando}
        deshabilitado={!!props.deshabilitado}
        rotulo={rotulo}
      />
    );
  }

  if (forma === "celular") {
    return (
      <span data-frescura className={`inline-flex items-center text-sm ${className ?? ""}`}>
        {toque}
      </span>
    );
  }
  return (
    <span data-frescura className={`inline-flex items-center gap-1.5 text-sm text-gray-500 ${className ?? ""}`}>
      {texto && <span>{texto}</span>}
      {toque}
    </span>
  );
}

function BotonPropio({
  onActualizar,
  actualizando,
  deshabilitado,
  rotulo,
}: {
  onActualizar: () => void | Promise<void>;
  actualizando: boolean;
  deshabilitado: boolean;
  rotulo: (corriendo: boolean) => ReactNode;
}) {
  const [corriendo, setCorriendo] = useState(false);
  const ocupado = corriendo || actualizando;
  const ref = useRef<HTMLButtonElement>(null);
  const alTocar = async () => {
    setCorriendo(true);
    try {
      await onActualizar();
      // La hora de `/api/sync-status` se vuelve a pedir en el foco, igual
      // que tras `SyncNowButton`.
      window.dispatchEvent(new Event("focus"));
    } finally {
      setCorriendo(false);
    }
  };
  // Deslizar hacia abajo = tocar este botón (misma función).
  useAccionDelGesto("actualizar", ref, true, alTocar, () => ocupado || deshabilitado);
  return (
    <button
      ref={ref}
      type="button"
      disabled={ocupado || deshabilitado}
      onClick={alTocar}
      className={CLASE_BOTON_LINEA}
    >
      {rotulo(ocupado)}
    </button>
  );
}
