"use client";

// Despachos › Pedidos como PIPELINE (26-nov-2026, `PEDIDOS_PIPELINE_2026_11`,
// Daniel: «que se sienta en qué proceso va»): los cinco pasos en su orden, en
// forma de flecha y pegados, cada uno con su cuenta; el elegido, en negro.

export interface PasoPipeline {
  valor: string;
  rotulo: string;
  /** null = todavía no se sabe (cargando o sin lectura): se dibuja «—». */
  cuenta: number | null;
}

interface Props {
  pasos: readonly PasoPipeline[];
  elegido: string;
  onElegir: (valor: string) => void;
  /** Celular: cuenta arriba y rótulo abajo, a todo el ancho. */
  celular?: boolean;
}

/** La flecha: muesca a la izquierda (menos el primero) y punta a la derecha (menos el último). */
function recorte(i: number, total: number, punta: number): string {
  const der = i === total - 1 ? "100% 0, 100% 100%" : `calc(100% - ${punta}px) 0, 100% 50%, calc(100% - ${punta}px) 100%`;
  const muesca = i === 0 ? "" : `, ${punta}px 50%`;
  return `polygon(0 0, ${der}, 0 100%${muesca})`;
}

export default function PipelinePedidos({ pasos, elegido, onElegir, celular }: Props) {
  const punta = celular ? 8 : 12;
  return (
    <div role="group" aria-label="Paso del pedido" data-pipeline-pedidos className={`flex w-full min-w-0 gap-0.5 overflow-hidden rounded-lg ${celular ? "" : "max-w-[720px]"}`}>
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
              // Celular: el rótulo largo («En preparación») recibe más ancho para no cortarse.
              flexGrow: celular && p.rotulo.length > 12 ? 1.3 : 1,
              marginLeft: i === 0 ? 0 : -punta + 3,
              paddingLeft: i === 0 ? (celular ? 6 : 14) : punta + (celular ? 2 : 8),
              paddingRight: i === pasos.length - 1 ? (celular ? 6 : 14) : punta + (celular ? 2 : 6),
            }}
            className={`flex min-w-0 flex-1 transition active:scale-[0.98] ${
              celular ? "min-h-[46px] flex-col items-center justify-center leading-tight" : "h-11 items-center justify-center gap-1.5 whitespace-nowrap"
            } ${activo ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
          >
            {celular ? (
              <>
                <span className={`text-[15px] font-semibold tabular-nums ${apagada ? "text-gray-400" : ""}`}>{p.cuenta ?? "—"}</span>
                <span className="text-center text-[12px] font-medium tracking-tight">{p.rotulo}</span>
              </>
            ) : (
              <>
                <span className="text-[13px] font-medium">{p.rotulo}</span>
                <span className={`text-[13px] font-semibold tabular-nums ${activo ? "text-white" : apagada ? "text-gray-400" : "text-gray-900"}`}>{p.cuenta ?? "—"}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
