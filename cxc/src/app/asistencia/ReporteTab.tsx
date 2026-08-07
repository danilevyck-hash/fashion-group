"use client";

// El reporte. Usa el motor de `lib/asistencia/reporte.ts` — el mismo que genera
// el Excel y el PDF, así que la pantalla y los archivos NO pueden contradecirse.
//
// Todo en MINUTOS, nunca horas decimales: "295 minutos" se le discute a una
// persona, "4,92 horas" no le dice nada a nadie.

import { useCallback, useEffect, useState } from "react";
import * as XLSX from "xlsx-js-style";
import { useToast } from "@/components/ToastSystem";
import { construirExcel, construirPdf } from "@/lib/asistencia/exportar";
import { TOLERANCIA_MIN, EXTRA_MINIMO_MIN, type PersonaReporte, type ReglasReporte } from "@/lib/asistencia/reporte";
import RangoFechas from "./RangoFechas";
import EstadoReloj from "./EstadoReloj";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DOW = ["dom","lun","mar","mié","jue","vie","sáb"];
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1]}`;
}
/** 0 se muestra como raya: una columna de ceros esconde lo que sí importa. */
const n = (v: number) => (v ? <span className="tabular-nums">{v}</span> : <span className="text-gray-300">—</span>);

export default function ReporteTab() {
  const { toast } = useToast();
  const hoy = new Date(Date.now() - 5 * 3600_000).toISOString().slice(0, 10);
  const [desde, setDesde] = useState(new Date(Date.now() - 5 * 3600_000 - 14 * 86_400_000).toISOString().slice(0, 10));
  const [hasta, setHasta] = useState(hoy);
  const [q, setQ] = useState("");
  const [personas, setPersonas] = useState<PersonaReporte[] | null>(null);
  const [sinHorario, setSinHorario] = useState(0);
  // Los números con los que el SERVIDOR calculó. La pantalla no los inventa:
  // si dijera "5 de tolerancia" mientras el motor usa 10, el texto sería falso.
  const [reglas, setReglas] = useState<Partial<ReglasReporte> | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta });
      if (q.trim()) p.set("q", q.trim());
      const res = await fetch(`/api/asistencia/reporte?${p}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
      setPersonas(data.personas ?? []);
      setSinHorario(data.sinHorario ?? 0);
      setReglas(data.reglas ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setPersonas(null);
    } finally { setCargando(false); }
  }, [desde, hasta, q]);

  useEffect(() => { void cargar(); }, [cargar]);

  function bajarExcel() {
    if (!personas?.length) return;
    XLSX.writeFile(construirExcel({ personas, desde, hasta, reglas: reglas ?? undefined }), `Asistencia ${desde} a ${hasta}.xlsx`);
    toast("Excel listo — revisa tu carpeta de descargas", "success");
  }
  function bajarPdf() {
    if (!personas?.length) return;
    construirPdf({ personas, desde, hasta, reglas: reglas ?? undefined }).save(`Asistencia ${desde} a ${hasta}.pdf`);
    toast("PDF listo — revisa tu carpeta de descargas", "success");
  }

  const tot = (personas ?? []).reduce((a, p) => ({
    aus: a.aus + p.resumen.ausenciasSinJustificar,
    tarde: a.tarde + p.resumen.minutosTarde,
    noTrab: a.noTrab + p.resumen.tiempoNoTrabajadoMin,
    extra: a.extra + p.resumen.extraMin,
    rev: a.rev + p.resumen.diasARevisar,
  }), { aus: 0, tarde: 0, noTrab: 0, extra: 0, rev: 0 });

  return (
    <div className="space-y-4">
      {/* Arriba de todo a propósito: si el reloj no está entrando, cualquier
          número de esta pantalla está incompleto y hay que saberlo ANTES de
          leerlo — no después de descontarle minutos a alguien. */}
      <EstadoReloj onLlegaron={() => void cargar()} />

      <div className="flex flex-wrap items-end gap-3">
        <RangoFechas desde={desde} hasta={hasta} onChange={(d, h) => { setDesde(d); setHasta(h); }} />
        <input
          type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar persona"
          className="min-h-[44px] flex-1 min-w-[160px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
        />
        <div className="flex gap-2">
          <button type="button" onClick={bajarExcel} disabled={!personas?.length}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
            Excel
          </button>
          <button type="button" onClick={bajarPdf} disabled={!personas?.length}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
            PDF
          </button>
        </div>
      </div>

      {/* Sin horario fijado se asume 5:00 p.m., y con eso las extras y la salida
          temprana pueden estar mal. Vale avisarlo antes de que descuente. */}
      {sinHorario > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{sinHorario}</b> {sinHorario === 1 ? "persona no tiene" : "personas no tienen"} su hora de salida
          confirmada. Mientras tanto se asume 5:00 p.m. — revísalo en <b>Horarios</b>.
        </p>
      )}

      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!cargando && !error && personas?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay marcaciones en este rango. Si acabas de subir un Excel, revisa las fechas.
        </p>
      )}

      {!cargando && !error && !!personas?.length && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[10.5px] uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2.5 text-left font-medium">Persona</th>
                <th className="px-2 py-2.5 text-center font-medium">Sale</th>
                <th className="px-2 py-2.5 text-right font-medium">Días</th>
                <th className="px-2 py-2.5 text-right font-medium">Ausen.</th>
                <th className="px-2 py-2.5 text-right font-medium">Veces<br />tarde</th>
                <th className="px-2 py-2.5 text-right font-medium">Min<br />tarde</th>
                <th className="px-2 py-2.5 text-right font-medium">Exceso<br />almuerzo</th>
                <th className="px-2 py-2.5 text-right font-medium">Salida<br />temprana</th>
                <th className="px-2 py-2.5 text-right font-medium">No trabajado</th>
                <th className="px-2 py-2.5 text-right font-medium">Extras</th>
                <th className="px-2 py-2.5 text-right font-medium">A revisar</th>
              </tr>
            </thead>
            <tbody>
              {personas.map((p) => (
                <FilaPersona key={p.codigo} p={p} abierta={abierta === p.codigo}
                  onToggle={() => setAbierta(abierta === p.codigo ? null : p.codigo)} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                <td className="px-3 py-2.5" colSpan={3}>{personas.length} personas</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.aus || "—"}</td>
                <td className="px-2 py-2.5"></td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.tarde || "—"}</td>
                <td className="px-2 py-2.5"></td><td className="px-2 py-2.5"></td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.noTrab || "—"}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.extra || "—"}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.rev || "—"}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      <p className="text-xs text-gray-400">
        Todo en minutos. Entrada 8:00 con {reglas?.toleranciaTardanzaMin ?? TOLERANCIA_MIN} de
        tolerancia · almuerzo según cada persona · extras desde{" "}
        {reglas?.extraMinimoMin ?? EXTRA_MINIMO_MIN} min, menos el atraso del día.{" "}
        <b>&quot;A revisar&quot;</b> es un día sin las 4 marcas: los minutos igual cuentan.
        Estos números se cambian en <b>Configuración</b>.
      </p>
    </div>
  );
}

function FilaPersona({ p, abierta, onToggle }: { p: PersonaReporte; abierta: boolean; onToggle: () => void }) {
  const r = p.resumen;
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50">
        <td className="px-3 py-2.5 text-gray-900">
          {p.nombre ?? p.codigo}
          <span className="ml-1.5 text-xs text-gray-400">{p.codigo}</span>
        </td>
        <td className="px-2 py-2.5 text-center tabular-nums text-gray-500">{p.salida}</td>
        <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{r.diasTrabajados}</td>
        <td className="px-2 py-2.5 text-right">{r.ausenciasSinJustificar
          ? <span className="font-semibold tabular-nums text-red-700">{r.ausenciasSinJustificar}</span>
          : <span className="text-gray-300">—</span>}</td>
        <td className="px-2 py-2.5 text-right text-gray-700">{n(r.vecesTarde)}</td>
        <td className="px-2 py-2.5 text-right">{r.minutosTarde
          ? <span className="font-medium tabular-nums text-amber-700">{r.minutosTarde}</span>
          : <span className="text-gray-300">—</span>}</td>
        <td className="px-2 py-2.5 text-right text-gray-700">{n(r.excesoAlmuerzoMin)}</td>
        <td className="px-2 py-2.5 text-right text-gray-700">{n(r.salidaTempranaMin)}</td>
        <td className="px-2 py-2.5 text-right font-semibold text-gray-900">{n(r.tiempoNoTrabajadoMin)}</td>
        <td className="px-2 py-2.5 text-right text-gray-700">{n(r.extraMin)}</td>
        <td className="px-2 py-2.5 text-right">{r.diasARevisar
          ? <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700">{r.diasARevisar}</span>
          : <span className="text-gray-300">—</span>}</td>
      </tr>

      {abierta && (
        <tr><td colSpan={11} className="bg-gray-50 px-3 py-3">
          {/* De los minutos tarde, cuántos vienen de días mal marcados. Que
              nadie descuente sin saber de dónde sale el número. */}
          {r.minutosTardeDeDiasARevisar > 0 && (
            <p className="mb-2 text-[13px] text-amber-800">
              De los <b>{r.minutosTarde}</b> minutos tarde, <b>{r.minutosTardeDeDiasARevisar}</b> vienen
              de días sin las 4 marcas. Míralos antes de descontar.
            </p>
          )}
          <div className="overflow-x-auto rounded-md border border-gray-200 bg-white">
            <table className="w-full text-[13px]">
              <thead><tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                <th className="px-2 py-2 text-left font-medium">Día</th>
                <th className="px-2 py-2 text-right font-medium">Entrada</th>
                <th className="px-2 py-2 text-right font-medium">Sale almz.</th>
                <th className="px-2 py-2 text-right font-medium">Vuelve</th>
                <th className="px-2 py-2 text-right font-medium">Salida</th>
                <th className="px-2 py-2 text-right font-medium">Tarde</th>
                <th className="px-2 py-2 text-right font-medium">Almz.</th>
                <th className="px-2 py-2 text-right font-medium">Extra</th>
                <th className="px-2 py-2 text-left font-medium"></th>
              </tr></thead>
              <tbody>
                {p.dias.map((d) => (
                  <tr key={d.fecha} className={`border-b border-gray-100 last:border-0 ${d.revisar ? "bg-amber-50/60" : ""}`}>
                    <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">{fechaCorta(d.fecha)}</td>
                    {d.marcas.length ? (
                      <>
                        <td className="px-2 py-1.5 text-right tabular-nums">{d.marcas[0] ?? "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{d.marcas.length >= 4 ? d.marcas[1] : "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{d.marcas.length >= 4 ? d.marcas[2] : "—"}</td>
                        <td className="px-2 py-1.5 text-right tabular-nums">{d.marcas.length > 1 ? d.marcas[d.marcas.length - 1] : "—"}</td>
                        <td className="px-2 py-1.5 text-right">{d.tardeMin
                          ? <span className="font-medium tabular-nums text-amber-700">{d.tardeMin}</span>
                          : <span className="text-gray-300">—</span>}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600">{n(d.excesoAlmuerzoMin)}</td>
                        <td className="px-2 py-1.5 text-right text-gray-600">{n(d.extraMin)}</td>
                        <td className="px-2 py-1.5">{d.revisar &&
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Revisar</span>}</td>
                      </>
                    ) : (
                      <td colSpan={8} className="px-2 py-1.5 text-gray-500">
                        {d.feriado ? <>Feriado — {d.feriado}</>
                          : d.justificado ? <>Ausencia justificada — {d.justificado}</>
                          : <span className="font-medium text-red-700">Ausencia sin justificar</span>}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </td></tr>
      )}
    </>
  );
}
