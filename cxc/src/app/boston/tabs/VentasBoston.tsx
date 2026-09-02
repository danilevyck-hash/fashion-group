"use client";

// VENTAS de Confecciones Boston, mes a mes.
//
// 🔴 SIN COSTO NI UTILIDAD, y lo dice la pantalla. Boston es `utilidad: false`
// en `EMPRESA_SYNC_CAPABILITIES`: su reporte de utilidad nunca se sincronizó ni
// se certificó contra nada. Publicar un margen que nadie cuadró es peor que no
// publicarlo — con eso se ponen precios. El servidor manda la bandera
// (`utilidadDisponible`), derivada de `empresasConUtilidad()`, así que el día
// que Daniel encienda el sync esta pantalla se entera sola.

import { useState } from "react";
import useSWR from "swr";
import { fmt } from "@/lib/format";

interface Mes {
  mes: number;
  label: string;
  ventas: number;
}
interface Anio {
  anio: number;
  total: number;
  meses: Mes[];
}
interface Respuesta {
  utilidadDisponible: boolean;
  años: Anio[];
}

const fetcher = (u: string) =>
  fetch(u, { cache: "no-store" }).then((r) => {
    if (!r.ok) throw new Error("No se pudieron leer las ventas de Confecciones Boston");
    return r.json();
  });

export default function VentasBoston() {
  const { data, error, isLoading } = useSWR<Respuesta>("/api/boston/ventas", fetcher, {
    revalidateOnFocus: false,
  });
  const [abierto, setAbierto] = useState<number | null>(null);

  if (error) {
    return <p className="text-sm text-red-600 py-8">No se pudieron cargar las ventas de Confecciones Boston.</p>;
  }
  if (isLoading) return <p className="text-sm text-gray-500 py-8">Cargando…</p>;

  const años = data?.años ?? [];
  if (años.length === 0) {
    return <p className="text-sm text-gray-500 py-8">Todavía no hay ventas registradas.</p>;
  }

  // El año más reciente arranca desplegado: es el que se mira.
  const activo = abierto ?? años[0].anio;
  const pico = Math.max(...años.flatMap((a) => a.meses.map((m) => m.ventas)), 1);

  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        Venta neta, sin ITBMS. Las notas de crédito ya están restadas.
      </p>

      {años.map((a) => {
        const esteAbierto = a.anio === activo;
        return (
          <div key={a.anio} className="rounded-xl border border-gray-200 bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => setAbierto(esteAbierto ? -1 : a.anio)}
              aria-expanded={esteAbierto}
              className="w-full min-h-[44px] flex items-baseline justify-between gap-3 px-4 py-3 text-left
                         hover:bg-gray-50 transition"
            >
              <span className="font-medium text-gray-900">{a.anio}</span>
              <span className="font-semibold tabular-nums">${fmt(a.total)}</span>
            </button>

            {esteAbierto && (
              <div className="border-t border-gray-100 px-4 py-3 space-y-1.5">
                {a.meses.map((m) => (
                  <div key={m.mes} className="flex items-center gap-2 text-sm">
                    <span className="w-8 shrink-0 text-gray-500">{m.label}</span>
                    {/* La barra se mide contra el mes más alto de TODA la serie,
                        para que dos años se puedan comparar de un vistazo. */}
                    <span className="flex-1 h-2 rounded-full bg-gray-100 overflow-hidden">
                      <span
                        className="block h-full rounded-full bg-stone-500"
                        style={{ width: `${Math.max(0, (m.ventas / pico) * 100)}%` }}
                      />
                    </span>
                    <span className="w-24 shrink-0 text-right tabular-nums text-gray-900">
                      {m.ventas ? `$${fmt(m.ventas)}` : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {data && !data.utilidadDisponible && (
        <p className="text-xs text-gray-500 pt-1">
          De Confecciones Boston no se trae el costo desde Switch, así que aquí no hay utilidad ni
          margen: solo lo vendido.
        </p>
      )}
    </div>
  );
}
