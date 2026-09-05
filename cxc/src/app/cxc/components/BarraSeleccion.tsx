"use client";

// ─────────────────────────────────────────────────────────────────────────────
// MANDAR A VARIOS — la barra que aparece al seleccionar clientes.
//
// 🔴 UN CORREO POR DIRECCIÓN, NO POR CLIENTE. Trece clientes comparten
// `oficina@citymoda.store`: «uno por cliente» le pone trece correos en la
// bandeja a la misma persona el mismo minuto, cada uno con un pedazo de lo que
// debe. La barra lo DICE antes de mandar: «31 comparten correo → 57 correos».
//
// 🔴 Los que no tienen correo NO abortan el lote: se manda a los que se puede y
// se dicen POR NOMBRE los que quedaron fuera. La cuenta y los textos viven en
// `lib/cxc/correos-lote.ts`, módulo puro con candado propio.
// ─────────────────────────────────────────────────────────────────────────────

import { fmt } from "@/lib/format";
import {
  agruparPorCorreo,
  textoCorreosCompartidos,
  textoSinCorreo,
  textoSeleccion,
  type DestinoCliente,
} from "@/lib/cxc/correos-lote";

interface Props {
  clientes: DestinoCliente[];
  onQuitarSeleccion: () => void;
  onCobrarATodos: () => void;
  enviando: boolean;
}

export default function BarraSeleccion({ clientes, onQuitarSeleccion, onCobrarATodos, enviando }: Props) {
  if (clientes.length === 0) return null;
  const lote = agruparPorCorreo(clientes);
  const compartidos = textoCorreosCompartidos(lote);
  const sinCorreo = textoSinCorreo(lote);

  return (
    <div className="sticky bottom-0 z-20 -mx-6 mt-4 border-t border-gray-200 bg-white px-6 py-3 shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <span className="text-sm font-medium text-gray-900 tabular-nums">
          {textoSeleccion(clientes, fmt)}
        </span>
        {compartidos && <span className="text-xs text-gray-500">{compartidos}</span>}
        {sinCorreo && <span className="text-xs text-amber-700">{sinCorreo}</span>}
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={onQuitarSeleccion}
            className="inline-flex min-h-[44px] items-center rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 transition active:scale-[0.97]"
          >
            Quitar selección
          </button>
          <button
            type="button"
            onClick={onCobrarATodos}
            disabled={enviando || lote.envios.length === 0}
            className="inline-flex min-h-[44px] items-center rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-50"
          >
            {enviando ? "Enviando…" : `Cobrar a los ${clientes.length}`}
          </button>
        </div>
      </div>
    </div>
  );
}
