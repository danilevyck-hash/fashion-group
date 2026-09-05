"use client";

import { useEffect, useState } from "react";
import { COMPANIAS_DEPURADOR } from "@/lib/depurador/logic";

interface CargaRow {
  id: string;
  usuario: string;
  empresa: string;
  marca: string;
  cantidad_estilos: number;
  total_unidades: number;
  total_costo: number;
  created_at: string;
  /** true si el Excel descargado sigue guardado (90 días). Las corridas viejas
   *  (antes del 4-sep-2026) no tienen archivo: salen en gris, sin botón. */
  tiene_archivo: boolean;
  archivo_nombre: string | null;
}

function fmtFecha(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("es-PA", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

/** Las filas viejas de Facturas Tienda decían «Facturas Tienda»; la compañía
 *  real es Multifashion — así el filtro por compañía también las encuentra. */
function empresaCanonica(empresa: string): string {
  return empresa === "Facturas Tienda" ? "Multifashion" : empresa;
}

interface HistorialViewProps {
  /** Cambia para forzar un refetch (ej. tras una descarga). */
  refreshKey?: number;
}

export default function HistorialView({ refreshKey = 0 }: HistorialViewProps) {
  const [rows, setRows] = useState<CargaRow[] | null>(null);
  const [error, setError] = useState("");
  // Filtro por compañía: Todas + las 6. Todos ven todo (Daniel: «todos»).
  const [empresaFiltro, setEmpresaFiltro] = useState("");

  useEffect(() => {
    let alive = true;
    setError("");
    fetch("/api/productos/cargar/historial")
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("fetch")))
      .then((d) => { if (alive) setRows(d.rows ?? []); })
      .catch(() => { if (alive) { setRows([]); setError("No se pudo cargar el historial."); } });
    return () => { alive = false; };
  }, [refreshKey]);

  const visibles = (rows ?? []).filter(
    (r) => !empresaFiltro || empresaCanonica(r.empresa) === empresaFiltro
  );

  const botonDescargar = (r: CargaRow) =>
    r.tiene_archivo ? (
      <a
        href={`/api/productos/cargar/historial/archivo?id=${encodeURIComponent(r.id)}`}
        className="inline-flex min-h-[44px] items-center rounded-md border border-stone-300 bg-white px-3 text-[12px] font-semibold text-teal-700 transition hover:border-teal-600 hover:text-teal-900 active:scale-[0.97]"
      >
        Descargar
      </a>
    ) : null;

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={empresaFiltro}
          aria-label="Compañía"
          onChange={(e) => setEmpresaFiltro(e.target.value)}
          className="min-h-[44px] rounded-md border border-stone-300 bg-white px-2.5 text-sm text-stone-900 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
        >
          <option value="">Todas</option>
          {COMPANIAS_DEPURADOR.map((c) => (
            <option key={c.key} value={c.label}>{c.label}</option>
          ))}
        </select>
        {/* Los archivos se guardan 90 días; la fila con los totales queda. */}
        <span className="text-[12px] text-stone-500">El Excel se puede volver a bajar por 90 días.</span>
      </div>

      {rows === null ? (
        <div className="py-16 text-center text-stone-500">Cargando…</div>
      ) : visibles.length === 0 ? (
        <div className="py-16 text-center text-stone-500">Todavía no hay cargas registradas.</div>
      ) : (
        /* ── 🩸 EL HISTORIAL, MEDIDO (30-jul-2026) ────────────────────────
           Hasta `lg` no hay relleno que haga entrar la tabla → TARJETAS; de
           `lg` a `xl` entra apretando el relleno (`px-1.5 xl:px-3`) → TABLA.
           El escritorio no cambia. */
        <div className="overflow-hidden rounded-xl border border-stone-200 bg-white" data-medir="depurador-historial">
          {/* Celular e iPad vertical: una tarjeta por carga. */}
          <ul className="lg:hidden max-h-[560px] overflow-y-auto divide-y divide-stone-100" data-vista="tarjetas">
            {visibles.map((r) => (
              <li key={r.id} className={`px-3 py-3 ${r.tiene_archivo ? "" : "opacity-60"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[13px] font-medium text-stone-900 truncate">
                      {r.marca || "—"}
                    </div>
                    <div className="text-[12px] text-stone-500 truncate">
                      {empresaCanonica(r.empresa) || "—"} · {r.usuario}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-[12px] text-stone-500">{fmtFecha(r.created_at)}</div>
                  </div>
                </div>
                <div className="mt-1.5 flex items-center gap-4 text-[12px] text-stone-500">
                  <span>Estilos <span className="tabular-nums text-stone-700">{r.cantidad_estilos.toLocaleString()}</span></span>
                  <span>Unidades <span className="tabular-nums text-stone-700">{r.total_unidades.toLocaleString()}</span></span>
                  <span className="ml-auto">{botonDescargar(r)}</span>
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden lg:block max-h-[560px] overflow-auto" data-vista="tabla">
            <table className="w-full border-collapse whitespace-nowrap text-[13px] tabular-nums">
              <thead>
                <tr>
                  {["Fecha", "Quién", "Compañía", "Marca", "Estilos", "Unidades", ""].map((h, i) => (
                    <th
                      key={i}
                      className={`sticky top-0 border-b-[1.5px] border-stone-300 bg-stone-100 px-1.5 xl:px-3 py-2.5 text-[12px] font-semibold uppercase tracking-wide text-stone-600 ${
                        i === 4 || i === 5 ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibles.map((r) => (
                  <tr key={r.id} className={r.tiene_archivo ? "hover:bg-teal-50" : "text-stone-400"}>
                    <td className="border-b border-stone-100 px-1.5 xl:px-3 py-2 text-stone-700">{fmtFecha(r.created_at)}</td>
                    <td className={`border-b border-stone-100 px-1.5 xl:px-3 py-2 ${r.tiene_archivo ? "text-stone-900" : ""}`}>{r.usuario}</td>
                    <td className={`border-b border-stone-100 px-1.5 xl:px-3 py-2 ${r.tiene_archivo ? "text-stone-900" : ""}`}>{empresaCanonica(r.empresa) || "—"}</td>
                    <td className={`border-b border-stone-100 px-1.5 xl:px-3 py-2 ${r.tiene_archivo ? "text-stone-900" : ""}`}>{r.marca || "—"}</td>
                    <td className="border-b border-stone-100 px-1.5 xl:px-3 py-2 text-right text-stone-700">{r.cantidad_estilos.toLocaleString()}</td>
                    <td className="border-b border-stone-100 px-1.5 xl:px-3 py-2 text-right text-stone-700">{r.total_unidades.toLocaleString()}</td>
                    <td className="border-b border-stone-100 px-1.5 xl:px-3 py-2 text-right">{botonDescargar(r)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
