"use client";

// Puente para cargar marcaciones desde el Excel de iVMS-4200, mientras no se
// tiene la contraseña de red del reloj. Ver `lib/asistencia/importar-excel.ts`.
//
// Siempre PREVISUALIZA antes de guardar: el formato del Excel de iVMS cambia
// entre versiones e idiomas, y la forma de cazar una fecha mal interpretada es
// VERLA antes de escribir en la tabla.

import { useState } from "react";
import AppHeader from "@/components/AppHeader";
import { useToast } from "@/components/ToastSystem";
import VerMarcaciones from "./VerMarcaciones";

interface Preview {
  encabezados: string[];
  columnasDetectadas: { codigo: string | null; nombre: string | null; fecha: string | null; tipo: string | null };
  filasEnArchivo: number;
  listasParaGuardar: number;
  descartadas: number;
  ejemplosDescartados: Array<{ fila: number; motivo: string }>;
  muestra: Array<{ empleado: string | null; ocurrio_en: string; tipo: string | null }>;
  rango: { desde: string; hasta: string } | null;
}

const RELOJES = [
  { key: "RELOJ_FG", label: "Fashion Group" },
  { key: "RELOJ_ACS", label: "Multifashion (ACS)" },
];

/** Muestra un instante en hora de Panamá (UTC−5 fijo). */
function enPanama(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 60 * 60 * 1000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function ImportarAsistenciaClient() {
  const { toast } = useToast();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [reloj, setReloj] = useState(RELOJES[0].key);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [guardadas, setGuardadas] = useState<number | null>(null);
  const [tab, setTab] = useState<"ver" | "cargar">("ver");

  async function enviar(soloPreview: boolean) {
    if (!archivo) return toast("Elige el archivo primero", "error");
    setTrabajando(true);
    try {
      const fd = new FormData();
      fd.append("archivo", archivo);
      fd.append("dispositivo", reloj);
      const res = await fetch(`/api/asistencia/importar${soloPreview ? "?preview=1" : ""}`, {
        method: "POST",
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo procesar");
      if (soloPreview) {
        setPreview(data as Preview);
        setGuardadas(null);
      } else {
        setGuardadas(data.guardadas ?? 0);
        toast(`Listo, ${data.guardadas} marcaciones cargadas`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo procesar", "error");
    } finally {
      setTrabajando(false);
    }
  }

  const faltaFecha = preview && !preview.columnasDetectadas.fecha;

  return (
    <>
      <AppHeader module="asistencia" />
      <div className="mx-auto max-w-5xl px-4 py-6">
        <h1 className="text-xl font-semibold text-gray-900">Asistencia</h1>

        <div className="mt-4 flex gap-1 border-b border-gray-200">
          {([["ver", "Marcaciones"], ["cargar", "Cargar Excel"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`min-h-[44px] px-4 text-sm transition ${
                tab === k
                  ? "border-b-2 border-black font-medium text-gray-900"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "ver" && <div className="mt-5"><VerMarcaciones /></div>}

        {tab === "cargar" && (
        <div className="mt-5">
        <p className="text-sm text-gray-500">
          Sube el Excel que exportas desde iVMS-4200. Puedes subir el mismo archivo
          más de una vez sin miedo: las marcaciones repetidas no se duplican.
        </p>

        <div className="mt-6 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">
              ¿De qué reloj es?
            </label>
            <select
              value={reloj}
              onChange={(e) => { setReloj(e.target.value); setPreview(null); }}
              className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
            >
              {RELOJES.map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Archivo</label>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setPreview(null); setGuardadas(null); }}
              className="w-full text-sm file:mr-3 file:min-h-[44px] file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:text-sm"
            />
          </div>

          <button
            type="button"
            onClick={() => void enviar(true)}
            disabled={!archivo || trabajando}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50"
          >
            {trabajando ? "Revisando…" : "Revisar archivo"}
          </button>
        </div>

        {preview && (
          <div className="mt-4 space-y-4 rounded-lg border border-gray-200 bg-white p-4">
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <span className="text-gray-500">
                Filas en el archivo:{" "}
                <b className="tabular-nums text-gray-900">{preview.filasEnArchivo}</b>
              </span>
              <span className="text-gray-500">
                Se van a cargar:{" "}
                <b className="tabular-nums text-gray-900">{preview.listasParaGuardar}</b>
              </span>
              {preview.descartadas > 0 && (
                <span className="text-amber-700">
                  No utilizables: <b className="tabular-nums">{preview.descartadas}</b>
                </span>
              )}
            </div>

            {faltaFecha ? (
              <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
                No encontré la columna de fecha y hora. Las columnas del archivo son:{" "}
                {preview.encabezados.join(" · ") || "(ninguna)"}. Mándame una captura y
                la agrego.
              </p>
            ) : (
              <>
                {preview.rango && (
                  <p className="text-sm text-gray-500">
                    Van del <b className="text-gray-900">{enPanama(preview.rango.desde)}</b> al{" "}
                    <b className="text-gray-900">{enPanama(preview.rango.hasta)}</b>.
                  </p>
                )}

                {/* Lo más importante de esta pantalla: ver la hora ya
                    interpretada. Una fecha mal leída se caza mirándola. */}
                {preview.muestra.length > 0 && (
                  <div>
                    <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">
                      Revisa que las horas se vean bien
                    </p>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <tbody>
                          {preview.muestra.map((m, i) => (
                            <tr key={i} className="border-b border-gray-100 last:border-0">
                              <td className="py-1.5 pr-3 text-gray-900">{m.empleado ?? "—"}</td>
                              <td className="py-1.5 pr-3 tabular-nums text-gray-700">
                                {enPanama(m.ocurrio_en)}
                              </td>
                              <td className="py-1.5 text-gray-500">{m.tipo ?? ""}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {preview.ejemplosDescartados.length > 0 && (
                  <div className="text-[13px] text-gray-500">
                    <p className="mb-1">Filas que no entran:</p>
                    <ul className="space-y-0.5">
                      {preview.ejemplosDescartados.map((d, i) => (
                        <li key={i}>Fila {d.fila}: {d.motivo}</li>
                      ))}
                    </ul>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void enviar(false)}
                  disabled={trabajando || preview.listasParaGuardar === 0 || guardadas !== null}
                  className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50"
                >
                  {guardadas !== null
                    ? `Cargadas ${guardadas}`
                    : trabajando
                      ? "Cargando…"
                      : `Cargar ${preview.listasParaGuardar} marcaciones`}
                </button>
              </>
            )}
          </div>
        )}
        </div>
        )}
      </div>
    </>
  );
}
