"use client";

// Despachos › Pedidos como PIPELINE (26-nov-2026, `PEDIDOS_PIPELINE_2026_11`,
// Daniel: «que se sienta en qué proceso va»): los cinco pasos en su orden,
// cada uno con su cuenta; el elegido, marcado.
//   · Computadora: flechas pegadas, «Pendientes 4 › En preparación 17 › …».
//   · Celular "pista": el control segmentado de iOS, número arriba y nombre
//     corto en UNA línea, con «›» entre pasos. Cabe en 360 px sin deslizar.
//   · Celular "deslizable": las flechas de la computadora en una fila que se
//     desliza de lado, con el paso elegido centrado.

import { useEffect, useRef } from "react";
import { ChevronRight } from "lucide-react";

export interface PasoPipeline {
  valor: string;
  rotulo: string;
  /** Nombre corto para el celular («Preparación»); sin él, el rótulo. */
  corto?: string;
  /** null = todavía no se sabe (cargando o sin lectura): se dibuja «—». */
  cuenta: number | null;
}

export type FormaCelular = "pista" | "deslizable";

interface Props {
  pasos: readonly PasoPipeline[];
  elegido: string;
  onElegir: (valor: string) => void;
  /** Celular: la forma del control. Sin él, la computadora. */
  celular?: FormaCelular;
}

/** La flecha: muesca a la izquierda (menos el primero) y punta a la derecha (menos el último). */
function recorte(i: number, total: number, punta: number): string {
  const der = i === total - 1 ? "100% 0, 100% 100%" : `calc(100% - ${punta}px) 0, 100% 50%, calc(100% - ${punta}px) 100%`;
  const muesca = i === 0 ? "" : `, ${punta}px 50%`;
  return `polygon(0 0, ${der}, 0 100%${muesca})`;
}

function Flechas({ pasos, elegido, onElegir, deslizable }: Omit<Props, "celular"> & { deslizable?: boolean }) {
  const punta = 12;
  const fila = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!deslizable) return;
    fila.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [deslizable, elegido]);
  return (
    <div
      ref={fila}
      role="group"
      aria-label="Paso del pedido"
      data-pipeline-pedidos
      className={deslizable
        ? "-mx-4 flex min-w-0 gap-0.5 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        : "flex w-full min-w-0 max-w-[720px] gap-0.5 overflow-hidden rounded-lg"}
    >
      {pasos.map((p, i) => {
        const activo = p.valor === elegido;
        const apagada = !activo && !p.cuenta;
        return (
          <button
            key={p.valor}
            type="button"
            aria-pressed={activo}
            onClick={() => onElegir(p.valor)}
            style={{
              clipPath: recorte(i, pasos.length, punta),
              marginLeft: i === 0 ? 0 : -punta + 3,
              paddingLeft: i === 0 ? 14 : punta + 8,
              paddingRight: i === pasos.length - 1 ? 14 : punta + 6,
            }}
            className={`flex h-11 items-center justify-center gap-1.5 whitespace-nowrap transition active:scale-[0.98] ${deslizable ? "shrink-0" : "min-w-0 flex-1"} ${
              i === 0 && deslizable ? "rounded-l-lg" : ""
            } ${i === pasos.length - 1 && deslizable ? "rounded-r-lg" : ""} ${activo ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            <span className={deslizable ? "text-[14px] font-medium" : "text-[13px] font-medium"}>{p.rotulo}</span>
            <span className={`${deslizable ? "text-[14px]" : "text-[13px]"} font-semibold tabular-nums ${activo ? "text-white" : apagada ? "text-gray-400" : "text-gray-900"}`}>{p.cuenta ?? "—"}</span>
          </button>
        );
      })}
    </div>
  );
}

function Pista({ pasos, elegido, onElegir }: Omit<Props, "celular">) {
  return (
    <div role="group" aria-label="Paso del pedido" data-pipeline-pedidos className="flex w-full min-w-0 items-center rounded-xl bg-pista-celular p-1">
      {pasos.map((p, i) => {
        const activo = p.valor === elegido;
        const apagada = !activo && !p.cuenta;
        return (
          <div key={p.valor} className="flex min-w-0 flex-auto items-center">
            {i > 0 && <ChevronRight aria-hidden size={12} strokeWidth={2.2} className="-mx-0.5 shrink-0 text-gray-400" />}
            <button
              type="button"
              aria-pressed={activo}
              onClick={() => onElegir(p.valor)}
              className={`flex min-h-11 min-w-0 flex-auto flex-col items-center justify-center rounded-lg px-1 leading-tight transition active:scale-[0.97] ${
                activo ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"
              }`}
            >
              <span className={`text-[16px] font-semibold tabular-nums ${apagada ? "text-gray-400" : activo ? "" : "text-gray-900"}`}>{p.cuenta ?? "—"}</span>
              <span className="whitespace-nowrap text-[12px] font-medium tracking-tight">{p.corto ?? p.rotulo}</span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

export default function PipelinePedidos({ celular, ...props }: Props) {
  if (celular === "pista") return <Pista {...props} />;
  return <Flechas {...props} deslizable={celular === "deslizable"} />;
}
