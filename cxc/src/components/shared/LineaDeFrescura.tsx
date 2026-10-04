"use client";

// ─────────────────────────────────────────────────────────────────────────────
// <LineaDeFrescura /> — «Actualizado 9:41 ↻» (celular) o «Actualizado hace
// 5 min · Actualizar» (computadora), al estilo Mail de Apple (4-oct-2026).
//
// La hora sale de `/api/sync-status` (el MISMO `useEstadoSync` de
// `<SyncStatus>`) y el toque es el MISMO `SyncNowButton`: permisos,
// acelerador, enganche al sync en curso y avisos no cambian. Quien no puede
// actualizar ve la hora sola. Solo se monta con `FRESCURA_VISIBLE_2026_10`.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useState } from "react";
import SyncNowButton, { type SyncNowOpcion } from "./SyncNowButton";
import { useEstadoSync, type SyncTable } from "./SyncStatus";
import { haceCuantoFrescura, horaDeFrescura } from "@/lib/ui/frescura";

interface Props {
  /** De dónde sale la hora: la tabla y las empresas de `/api/sync-status`. */
  tabla: SyncTable;
  empresas: readonly string[];
  /** Lo que actualiza: las MISMAS opciones que el «Actualizar ahora» de hoy. */
  opciones: SyncNowOpcion[];
  secuencial?: boolean;
  roles?: string[];
  onSuccess: () => void | Promise<void>;
  /** «celular»: la línea entera se toca. «computadora»: hora · Actualizar. */
  forma: "celular" | "computadora";
  className?: string;
}

export default function LineaDeFrescura({ tabla, empresas, opciones, secuencial, roles, onSuccess, forma, className }: Props) {
  const { data } = useEstadoSync(tabla, empresas);
  // «hace 5 min» se mueve solo, sin volver a preguntar.
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const iso = data?.last_global ?? null;
  const cuando = iso ? (forma === "celular" ? horaDeFrescura(iso, ahora) : haceCuantoFrescura(iso, ahora)) : null;
  const texto = cuando ? `Actualizado ${cuando}` : null;
  const boton = (rotulo: React.ReactNode) => (
    <SyncNowButton
      variante="linea"
      opciones={opciones}
      secuencial={secuencial}
      roles={roles}
      onSuccess={onSuccess}
      rotulo={rotulo}
      sinPermiso={forma === "celular" ? texto : null}
    />
  );

  if (forma === "celular") {
    return (
      <span data-frescura className={`inline-flex items-center ${className ?? ""}`}>
        {boton(
          <>
            {texto && <span className="text-gray-500">{texto}</span>}
            <span aria-label="Actualizar ahora" className="text-blue-600"> ↻</span>
          </>,
        )}
      </span>
    );
  }
  return (
    <span data-frescura className={`inline-flex items-center gap-1.5 text-sm text-gray-500 ${className ?? ""}`}>
      {texto && <span>{texto}</span>}
      {boton(
        <>
          {texto && <span aria-hidden className="text-gray-400">·&nbsp;</span>}
          Actualizar
        </>,
      )}
    </span>
  );
}
