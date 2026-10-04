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

import { useEffect, useState, type ReactNode } from "react";
import SyncNowButton, { CLASE_BOTON_LINEA, type SyncNowOpcion } from "./SyncNowButton";
import { useEstadoSync, type SyncTable } from "./useEstadoSync";
import { haceCuantoFrescura, horaDeFrescura } from "@/lib/ui/frescura";
import { TEXTO_ACTUALIZANDO } from "@/lib/ui/actualizar-ahora";

type Forma = "celular" | "computadora";

interface Comun {
  forma?: Forma;
  className?: string;
  /** La palabra del toque en la computadora. «Actualizar» por defecto. */
  accion?: string;
  /** Lo que dice mientras corre. «Actualizando…» por defecto. */
  ocupado?: string;
}

type Fuente =
  | { tabla: SyncTable; empresas: readonly string[]; actualizado?: never }
  | { actualizado: string | null | undefined; tabla?: never; empresas?: never };

type Toque =
  | {
      opciones: SyncNowOpcion[];
      secuencial?: boolean;
      engancharRunning?: boolean;
      resumenExito?: string;
      roles?: string[];
      disabledReason?: string | null;
      onSuccess: () => void | Promise<void>;
      onActualizar?: never;
    }
  | {
      onActualizar: () => void | Promise<void>;
      /** La pantalla sigue ocupada aunque la promesa ya volvió (el reloj). */
      actualizando?: boolean;
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

/** El ↻. Gira mientras actualiza. */
function Giro({ girando }: { girando: boolean }) {
  return (
    <span aria-hidden className={`inline-block leading-none ${girando ? "animate-spin" : ""}`}>
      ↻
    </span>
  );
}

function Linea(props: LineaDeFrescuraProps & { iso: string | null }) {
  const { iso, forma, className } = props;
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

  const cuando = iso ? (forma === "celular" ? horaDeFrescura(iso, ahora) : haceCuantoFrescura(iso, ahora)) : null;
  const texto = cuando ? `Actualizado ${cuando}` : null;
  const accion = props.accion ?? "Actualizar";
  const ocupado = props.ocupado ?? TEXTO_ACTUALIZANDO;

  // Lo que dice el toque, en reposo y mientras corre.
  const rotulo = (corriendo: boolean, progreso: string = ""): ReactNode =>
    forma === "celular" ? (
      <>
        <span className="text-gray-500">{corriendo ? `${ocupado}${progreso}` : texto ?? accion}</span>
        <span aria-label={accion} className="text-blue-600"> <Giro girando={corriendo} /></span>
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
        engancharRunning={props.engancharRunning}
        resumenExito={props.resumenExito}
        roles={props.roles}
        disabledReason={props.disabledReason}
        onSuccess={props.onSuccess}
        rotulo={rotulo}
        sinPermiso={sinToque}
      />
    );
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
  return (
    <button
      type="button"
      disabled={ocupado || deshabilitado}
      onClick={async () => {
        setCorriendo(true);
        try {
          await onActualizar();
          // La hora de `/api/sync-status` se vuelve a pedir en el foco, igual
          // que tras `SyncNowButton`.
          window.dispatchEvent(new Event("focus"));
        } finally {
          setCorriendo(false);
        }
      }}
      className={CLASE_BOTON_LINEA}
    >
      {rotulo(ocupado)}
    </button>
  );
}
