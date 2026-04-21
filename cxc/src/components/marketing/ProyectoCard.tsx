"use client";

import type { ProyectoResumen } from "@/lib/marketing/types";
import { formatearFecha, formatearMonto } from "@/lib/marketing/normalizar";
import { EstadoBadge } from "./EstadoBadge";
import { MarcaBadge } from "./MarcaBadge";

interface ProyectoCardProps {
  proyecto: ProyectoResumen;
  marcaCodigoActual: string;
  onClick?: () => void;
}

type MarcaCodigo = "TH" | "CK" | "RBK";

function esMarcaConocida(c: string): c is MarcaCodigo {
  return c === "TH" || c === "CK" || c === "RBK";
}

export function ProyectoCard({
  proyecto,
  marcaCodigoActual,
  onClick,
}: ProyectoCardProps) {
  const marcasOtras = proyecto.marcas.filter(
    (m) => m.marca.codigo !== marcaCodigoActual
  );
  const compartido = marcasOtras.length > 0;

  const base =
    "rounded-lg border border-gray-200 bg-white p-3 text-left transition hover:border-black focus:outline-none focus:border-black";

  const contenido = (
    <div className="flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-semibold text-sm text-gray-900 truncate">
            {proyecto.tienda}
          </div>
          {proyecto.nombre && (
            <div className="text-sm text-gray-600 truncate">
              {proyecto.nombre}
            </div>
          )}
        </div>
        <div className="shrink-0">
          <EstadoBadge tipo="proyecto" estado={proyecto.estado} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {proyecto.marcas.map((m) => {
          const codigo = m.marca.codigo;
          return (
            <div key={m.marca.id} className="inline-flex items-center gap-1">
              {esMarcaConocida(codigo) ? (
                <MarcaBadge codigo={codigo} />
              ) : (
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 font-medium">
                  {m.marca.nombre}
                </span>
              )}
              <span className="text-xs text-gray-500 tabular-nums">
                {m.porcentaje}%
              </span>
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <div>
          {proyecto.conteo_facturas} facturas · {proyecto.conteo_fotos} fotos
        </div>
        <div>{formatearFecha(proyecto.fecha_inicio)}</div>
      </div>

      <div className="flex items-center justify-between pt-1 border-t border-gray-100">
        <div className="text-xs text-gray-500">Cobrable a marca</div>
        <div className="text-sm font-mono tabular-nums text-gray-900">
          {formatearMonto(proyecto.total_cobrable_marca)}
        </div>
      </div>

      {compartido && (
        <div className="text-xs text-gray-500">
          Compartido con{" "}
          {marcasOtras.map((m) => m.marca.nombre).join(", ")}
        </div>
      )}
    </div>
  );

  if (!onClick) {
    return <div className={base}>{contenido}</div>;
  }

  return (
    <button type="button" onClick={onClick} className={`w-full ${base}`}>
      {contenido}
    </button>
  );
}

export default ProyectoCard;
