"use client";

// Despachos › Pedidos como PIPELINE (26-nov-2026, `PEDIDOS_PIPELINE_2026_11`,
// Daniel: «que se sienta en qué proceso va»). Daniel eligió la opción 11 de
// las 20 (estilo FedEx/DHL): cinco íconos unidos por una línea, con la cuenta
// y el nombre debajo; el paso elegido, en negro. El MISMO diseño en el
// celular y en la computadora: cabe en 360 px sin deslizar.

import { Clock, Package, CircleCheck, Inbox, ReceiptText, type LucideIcon } from "lucide-react";

export interface PasoPipeline {
  valor: string;
  rotulo: string;
  /** Nombre corto para el celular («Preparación»); sin él, el rótulo. */
  corto?: string;
  /** null = todavía no se sabe (cargando o sin lectura): se dibuja «—». */
  cuenta: number | null;
}

interface Props {
  pasos: readonly PasoPipeline[];
  elegido: string;
  onElegir: (valor: string) => void;
  /** Celular: el nombre corto y todo un poco más compacto. */
  celular?: boolean;
}

const ICONO: Record<string, LucideIcon> = {
  pendiente: Clock,
  en_preparacion: Package,
  preparado: CircleCheck,
  recibido: Inbox,
  facturado: ReceiptText,
};

export default function PipelinePedidos({ pasos, elegido, onElegir, celular }: Props) {
  const circulo = celular ? 40 : 44;
  return (
    <div role="group" aria-label="Paso del pedido" data-pipeline-pedidos className={`relative flex w-full min-w-0 ${celular ? "" : "max-w-[720px]"}`}>
      {/* La línea que une los pasos, de centro a centro del primero al último. */}
      <span
        aria-hidden
        className="absolute h-0.5 bg-gray-300"
        style={{ top: circulo / 2 - 1, left: `${50 / pasos.length}%`, right: `${50 / pasos.length}%` }}
      />
      {pasos.map((p) => {
        const activo = p.valor === elegido;
        const apagada = !activo && !p.cuenta;
        const Icono = ICONO[p.valor] ?? Clock;
        return (
          <button
            key={p.valor}
            type="button"
            aria-pressed={activo}
            aria-label={`${p.rotulo} ${p.cuenta ?? ""}`.trim()}
            onClick={() => onElegir(p.valor)}
            className="group relative flex min-w-0 flex-1 flex-col items-center rounded-lg pb-0.5 leading-tight transition active:scale-[0.97]"
          >
            <span
              style={{ width: circulo, height: circulo }}
              className={`flex items-center justify-center rounded-full border-2 transition ${
                activo ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 bg-white text-gray-600 group-hover:border-gray-500"
              }`}
            >
              <Icono aria-hidden size={celular ? 19 : 20} strokeWidth={1.9} />
            </span>
            <span className={`mt-1 font-semibold tabular-nums ${celular ? "text-[16px]" : "text-[17px]"} ${apagada ? "text-gray-400" : "text-gray-900"}`}>{p.cuenta ?? "—"}</span>
            <span className={`whitespace-nowrap ${celular ? "text-[12px] tracking-tight" : "text-[13px]"} ${activo ? "font-semibold text-gray-900" : "text-gray-600"}`}>
              {celular ? (p.corto ?? p.rotulo) : p.rotulo}
            </span>
          </button>
        );
      })}
    </div>
  );
}
