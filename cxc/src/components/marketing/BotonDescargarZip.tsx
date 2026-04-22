"use client";

// Botón Descargar ZIP con estados:
//   idle      → "⬇ Descargar ZIP" (clicable)
//   trabajando → spinner + texto de etapa (disabled)
//   exito     → "✓ Descarga completa" (disabled, 2s)

import type { EstadoDescargaZip } from "@/lib/marketing/useDescargarZip";

interface Props {
  estado?: EstadoDescargaZip;
  onClick: () => void;
  className?: string;
}

const DEFAULT_CLASS =
  "text-xs rounded-md border border-gray-300 bg-white text-gray-700 px-3 py-1.5 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-default active:scale-[0.97] transition inline-flex items-center gap-1.5 min-w-[170px] justify-center";

function Spinner() {
  return (
    <svg
      className="animate-spin"
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M12 2a10 10 0 0 1 10 10" />
    </svg>
  );
}

export function BotonDescargarZip({ estado, onClick, className }: Props) {
  const trabajando = estado?.tipo === "trabajando";
  const exito = estado?.tipo === "exito";
  const disabled = trabajando || exito;

  const label = trabajando
    ? estado.etapa
    : exito
      ? "✓ Descarga completa"
      : "⬇ Descargar ZIP";

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-live="polite"
      aria-busy={trabajando}
      className={className ?? DEFAULT_CLASS}
    >
      {trabajando && <Spinner />}
      <span className="truncate">{label}</span>
    </button>
  );
}

export default BotonDescargarZip;
