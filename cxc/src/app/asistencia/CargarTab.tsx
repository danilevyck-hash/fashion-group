"use client";

// Cargar los Excel de iVMS. Acepta VARIOS a la vez: los exportes vienen
// separados por departamento (Boston, Vistana, Fashion Wear), así que subir de
// a uno son tres vueltas por la misma pantalla.
//
// Siempre previsualiza antes de guardar: el formato de iVMS cambia entre
// versiones, y la forma de cazar una fecha mal interpretada es VERLA.

import { useState } from "react";
import { useToast } from "@/components/ToastSystem";

interface Preview {
  archivo: string;
  encabezados: string[];
  columnasDetectadas: Record<string, string | null>;
  filasEnArchivo: number;
  filasDeDetalle: number;
  listasParaGuardar: number;
  descartadas: number;
  ejemplosDescartados: Array<{ fila: number; motivo: string }>;
  muestra: Array<{ empleado: string | null; ocurrio_en: string; tipo: string | null }>;
  rango: { desde: string; hasta: string } | null;
  guardadas?: number;
  error?: string;
}

const RELOJES = [
  { key: "RELOJ_FG", label: "Fashion Group" },
  { key: "RELOJ_ACS", label: "Multifashion (ACS)" },
];

function enPanama(iso: string): string {
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export default function CargarTab({ onCargado }: { onCargado?: () => void }) {
  const { toast } = useToast();
  const [archivos, setArchivos] = useState<File[]>([]);
  const [reloj, setReloj] = useState(RELOJES[0].key);
  const [previews, setPreviews] = useState<Preview[] | null>(null);
  const [trabajando, setTrabajando] = useState(false);
  const [cargado, setCargado] = useState(false);

  async function procesar(soloPreview: boolean) {
    if (!archivos.length) return toast("Elige al menos un archivo", "error");
    setTrabajando(true);
    try {
      // Uno por uno y no en paralelo: son upserts sobre la misma tabla y el
      // orden hace que los mensajes de error se puedan atribuir a su archivo.
      const res: Preview[] = [];
      for (const f of archivos) {
        const fd = new FormData();
        fd.append("archivo", f);
        fd.append("dispositivo", reloj);
        const r = await fetch(`/api/asistencia/importar${soloPreview ? "?preview=1" : ""}`, { method: "POST", body: fd });
        const d = await r.json();
        res.push({ ...d, archivo: f.name, error: r.ok ? undefined : (d.error ?? "No se pudo procesar") });
      }
      setPreviews(res);
      if (!soloPreview) {
        const total = res.reduce((a, x) => a + (x.guardadas ?? 0), 0);
        const fallaron = res.filter((x) => x.error).length;
        setCargado(true);
        toast(fallaron ? `Se cargaron ${total}; ${fallaron} archivo(s) fallaron` : `Listo, ${total} marcaciones cargadas`,
              fallaron ? "error" : "success");
        onCargado?.();
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo procesar", "error");
    } finally { setTrabajando(false); }
  }

  const totalListas = (previews ?? []).reduce((a, p) => a + (p.listasParaGuardar ?? 0), 0);
  const algunoSinFecha = (previews ?? []).some((p) => !p.error && !p.columnasDetectadas?.fecha);

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Sube el Excel que exportas desde iVMS-4200. <b>Puedes elegir varios de una vez</b> —
        los exportes vienen separados por departamento. Subir el mismo archivo dos veces
        no duplica nada.
      </p>

      <div className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">¿De qué reloj son?</label>
          <select value={reloj} onChange={(e) => { setReloj(e.target.value); setPreviews(null); setCargado(false); }}
            className="min-h-[44px] w-full rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm">
            {RELOJES.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs uppercase tracking-wide text-gray-400">Archivos</label>
          <input type="file" accept=".xlsx,.xls,.csv" multiple
            onChange={(e) => { setArchivos(Array.from(e.target.files ?? [])); setPreviews(null); setCargado(false); }}
            className="w-full text-sm file:mr-3 file:min-h-[44px] file:rounded-md file:border file:border-gray-300 file:bg-white file:px-3 file:text-sm" />
          {archivos.length > 1 && (
            <p className="mt-1 text-[12px] text-gray-500">{archivos.length} archivos elegidos</p>
          )}
        </div>

        <button type="button" onClick={() => void procesar(true)} disabled={!archivos.length || trabajando}
          className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
          {trabajando ? "Revisando…" : archivos.length > 1 ? `Revisar ${archivos.length} archivos` : "Revisar archivo"}
        </button>
      </div>

      {previews?.map((p) => (
        <div key={p.archivo} className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-sm font-medium text-gray-900">{p.archivo}</p>

          {p.error ? (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{p.error}</p>
          ) : !p.columnasDetectadas?.fecha ? (
            <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">
              No encontré la columna de fecha. Las columnas son: {p.encabezados?.join(" · ") || "(ninguna)"}.
              Mándame una captura y la agrego.
            </p>
          ) : (
            <>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
                <span className="text-gray-500">Se van a cargar <b className="tabular-nums text-gray-900">{p.listasParaGuardar}</b> marcaciones</span>
                {!!p.descartadas && <span className="text-amber-700">No entran: <b className="tabular-nums">{p.descartadas}</b></span>}
              </div>
              {p.rango && (
                <p className="text-sm text-gray-500">
                  Del <b className="text-gray-900">{enPanama(p.rango.desde)}</b> al <b className="text-gray-900">{enPanama(p.rango.hasta)}</b>.
                </p>
              )}
              {!!p.muestra?.length && (
                <div>
                  <p className="mb-1 text-xs uppercase tracking-wide text-gray-400">Revisa que las horas se vean bien</p>
                  <table className="w-full text-sm">
                    <tbody>
                      {p.muestra.map((m, i) => (
                        <tr key={i} className="border-b border-gray-100 last:border-0">
                          <td className="py-1.5 pr-3 text-gray-900">{m.empleado ?? "—"}</td>
                          <td className="py-1.5 pr-3 tabular-nums text-gray-700">{enPanama(m.ocurrio_en)}</td>
                          <td className="py-1.5 text-gray-500">{m.tipo ?? ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {!!p.ejemplosDescartados?.length && (
                <details className="text-[13px] text-gray-500">
                  <summary className="cursor-pointer">Ver las {p.descartadas} que no entran</summary>
                  <ul className="mt-1 space-y-0.5">
                    {p.ejemplosDescartados.map((d, i) => <li key={i}>Fila {d.fila}: {d.motivo}</li>)}
                  </ul>
                </details>
              )}
            </>
          )}
        </div>
      ))}

      {!!previews?.length && !algunoSinFecha && totalListas > 0 && (
        <button type="button" onClick={() => void procesar(false)} disabled={trabajando || cargado}
          className="min-h-[44px] rounded-md bg-black px-4 text-sm text-white transition active:scale-[0.97] disabled:opacity-50">
          {cargado ? "Cargadas" : trabajando ? "Cargando…" : `Cargar ${totalListas} marcaciones`}
        </button>
      )}
    </div>
  );
}
