"use client";

import { useEffect, useMemo, useState } from "react";
import { fmt } from "@/lib/format";
import type { Colaborador } from "@/lib/prestamos-lista-server";

/**
 * ELEGIR A LA PERSONA — de Asistencia, buscando por nombre.
 *
 * 🩸 Antes acá había una lista de las 15 fichas que ya existían, y para
 * prestarle a alguien nuevo había que ir a «Nuevo empleado» y **teclear su
 * nombre a mano**. Una ficha con el nombre tecleado es una ficha que la planilla
 * no puede atar: así nacieron las de MARTHA y YERITZA, **$400 de deuda viva que
 * no se puede descontar**.
 *
 * 🔴 Acá se elige a una de las 37 personas activas y la ficha nace CON SU
 * CÓDIGO. Nada se ata por parecido: lo que viaja al servidor es el código.
 */
export default function ElegirPersonaModal({
  open, colaboradores, onClose, onElegir,
}: {
  open: boolean;
  colaboradores: readonly Colaborador[];
  onClose: () => void;
  onElegir: (c: Colaborador) => void;
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!open) return;
    setQ("");
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

  const grupos = useMemo(() => {
    const filtrados = colaboradores.filter((c) => !q.trim() || norm(c.nombre).includes(norm(q)));
    const m = new Map<string, Colaborador[]>();
    for (const c of filtrados) {
      const k = c.empresaNombre ?? "Sin empresa";
      const l = m.get(k);
      if (l) l.push(c); else m.set(k, [c]);
    }
    return [...m.entries()];
  }, [colaboradores, q]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-4 -mt-2 -mr-2">
          <h2 className="font-medium mt-2">¿A quién?</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md text-gray-400 hover:text-black active:scale-[0.97] transition"
          >
            <span aria-hidden="true" className="text-xl leading-none">&times;</span>
          </button>
        </div>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Escribe el nombre..."
          className="w-full min-h-[44px] border-b border-gray-200 py-2 text-sm outline-none focus:border-black transition mb-3"
          autoFocus
        />

        {grupos.length === 0 ? (
          <p className="py-6 text-center text-sm text-gray-400">No hay nadie con ese nombre en Asistencia.</p>
        ) : (
          <div className="space-y-4">
            {grupos.map(([empresa, gente]) => (
              <div key={empresa}>
                <div className="mb-1 text-xs uppercase tracking-wide text-gray-400">{empresa}</div>
                <div className="space-y-1">
                  {gente.map((c) => (
                    <button
                      key={c.codigo}
                      onClick={() => onElegir(c)}
                      className="flex min-h-[44px] w-full items-center justify-between gap-3 rounded-lg px-3 text-left transition hover:bg-gray-50"
                    >
                      <span className="min-w-0 truncate text-sm font-medium">{c.nombre}</span>
                      <span className="shrink-0 text-xs tabular-nums text-gray-500">
                        {c.saldo > 0 ? `Debe $${fmt(c.saldo)}` : "No debe nada"}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-4">
          <button onClick={onClose} className="w-full min-h-[44px] border border-gray-200 rounded-md text-sm hover:border-gray-400 transition">Cancelar</button>
        </div>
      </div>
    </div>
  );
}
