"use client";

// «Mis marcaciones» (16-nov-2026): la hoja con la tabla de la quincena.
// Solo lee `GET /api/marcacion/historial`. Las horas son las CORREGIDAS.

import { useEffect, useState } from "react";
import { BottomSheet } from "@/components/ui";
import { TEXTO_FALTA_UNA_MARCA, type FilaHistorial } from "@/lib/marcacion/historial";

interface Respuesta {
  quincena: string;
  rotulo: string;
  anterior: string | null;
  siguiente: string | null;
  filas: FilaHistorial[];
}

const COLUMNAS = ["Entrada", "Almuerzo", "Regreso", "Salida"] as const;

export default function MisMarcaciones({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [quincena, setQuincena] = useState<string | null>(null);
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let vivo = true;
    setError(null);
    fetch(`/api/marcacion/historial${quincena ? `?quincena=${quincena}` : ""}`, { cache: "no-store" })
      .then(async (r) => {
        const j = await r.json().catch(() => ({}));
        if (!vivo) return;
        if (!r.ok) setError(j.error || "No se pudieron leer tus marcaciones. Intenta de nuevo.");
        else setDatos(j as Respuesta);
      })
      .catch(() => vivo && setError("Sin conexión. Intenta de nuevo cuando tengas señal."));
    return () => {
      vivo = false;
    };
  }, [open, quincena]);

  const flecha = (destino: string | null, texto: string, rotulo: string) => (
    <button
      type="button"
      aria-label={rotulo}
      disabled={!destino}
      onClick={() => destino && setQuincena(destino)}
      className="flex h-11 w-11 items-center justify-center rounded-full bg-gray-100 text-[20px] text-gray-900 disabled:bg-gray-50 disabled:text-gray-300"
    >
      {texto}
    </button>
  );

  return (
    <BottomSheet open={open} onClose={onClose} abreCompleta>
      <div className="flex items-center justify-between px-1 pb-2">
        <h2 className="text-[17px] font-semibold">Mis marcaciones</h2>
        <button type="button" onClick={onClose} className="min-h-[44px] px-2 text-[16px] text-blue-600">
          Listo
        </button>
      </div>
      <div className="flex items-center justify-between border-b border-gray-200 pb-3">
        {flecha(datos?.anterior ?? null, "‹", "Quincena anterior")}
        <span className="text-[15px] font-semibold">{datos?.rotulo ?? "…"}</span>
        {flecha(datos?.siguiente ?? null, "›", "Quincena siguiente")}
      </div>

      {error && <p className="py-4 text-[14px] text-gray-600">{error}</p>}

      {datos && !error && datos.filas.length === 0 && (
        <p className="py-6 text-center text-[15px] text-gray-500">Sin marcaciones en esta quincena</p>
      )}

      {datos && !error && datos.filas.length > 0 && (
        // 🔑 Columnas parejas (Daniel, 16-nov-2026): ancho fijo, el Día justo
        // y las cuatro horas con el MISMO ancho, el mismo aire y el mismo
        // margen a los dos lados.
        <table className="w-full table-fixed border-collapse text-[15px] tabular-nums">
          <colgroup>
            {/* El Día con su ancho justo; las cuatro horas se reparten el resto por igual. */}
            <col className="w-[66px]" />
            {COLUMNAS.map((c) => (
              <col key={c} />
            ))}
          </colgroup>
          <thead>
            <tr>
              <th className="px-1 py-2.5 text-left text-[12px] font-semibold text-gray-500">Día</th>
              {COLUMNAS.map((c) => (
                <th key={c} className="px-1 py-2.5 text-right text-[12px] font-semibold text-gray-500">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {datos.filas.map((f) => (
              <tr key={f.fecha} className="border-t border-gray-100">
                <td className="px-1 py-2.5 text-left font-semibold">
                  <span className="whitespace-nowrap">{f.dia}</span>
                  {f.faltaMarca && <span className="block text-[12px] font-normal text-amber-700">{TEXTO_FALTA_UNA_MARCA}</span>}
                </td>
                {[f.entrada, f.almuerzo, f.regreso, f.salida].map((h, i) => (
                  <td key={COLUMNAS[i]} className={`whitespace-nowrap px-1 py-2.5 text-right ${h ? "" : "text-gray-300"}`}>
                    {h ?? "—"}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </BottomSheet>
  );
}
