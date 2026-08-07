"use client";

// LA PLANILLA QUINCENAL — el cuadro que la contable armaba a mano en Excel.
//
// Toda la regla vive en `lib/asistencia/planilla.ts` (puro) y los minutos salen
// del MISMO motor que el Reporte, así que las dos pestañas no pueden decir
// cosas distintas sobre los mismos minutos.
//
// ── 🔴 LO QUE ESTA PANTALLA NO HACE ──────────────────────────────────────────
// No muestra $0 por nadie. Quien no tiene salario, jornada o ficha sale en una
// sección aparte con el motivo escrito, y NO entra al total. Hoy hay 6 códigos
// con marcaciones y sin ficha (48 a 53): un cero silencioso en una planilla es
// el error que nadie ve hasta que alguien reclama su pago.
//
// ── EL ANCHO ─────────────────────────────────────────────────────────────────
// Son 19 columnas: en escritorio es una tabla que se arrastra DENTRO de su caja
// (la página nunca se mueve de lado) con la columna Persona pegada a la
// izquierda; en celular son tarjetas. Mismo criterio que `PanelCxcMobile`.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { downloadWorkbook } from "@/lib/excel-export";
import { EMPRESAS_ASISTENCIA, etiquetaEmpresa } from "@/lib/asistencia/config";
import type { ReglasAsistencia } from "@/lib/asistencia/config";
import {
  aHoras,
  FORMULA_NETO,
  quincenasHasta,
  type LineaPlanilla,
  type ManualesLinea,
  type Quincena,
  type TotalesPlanilla,
} from "@/lib/asistencia/planilla";
import {
  construirExcelPlanilla,
  construirPdfPlanilla,
  nombreArchivo,
} from "@/lib/asistencia/planilla-exportar";

interface Respuesta {
  quincena: Quincena;
  empresa: string | null;
  empresaEtiqueta: string | null;
  lineas: LineaPlanilla[];
  totales: TotalesPlanilla;
  reglas: ReglasAsistencia;
  avisos: {
    faltaMigracionConfiguracion: string | null;
    faltaMigracionManual: string | null;
    sinHorario: number;
    salidaAsumida: string;
    horasAusenciaDefault: number;
    conSabado: number;
  };
}

const $ = (n: number | null | undefined): string =>
  n === null || n === undefined || n === 0
    ? "—"
    : n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Un monto con su signo de dólares. El cero es una raya PELADA, no "$—". */
const $$ = (n: number): string => (n === 0 ? "—" : `$${$(n)}`);

/**
 * Los 5 montos que se escriben a mano, en el orden del cuadro, con el LADO al
 * que van. 🔴 Cuatro restan y «otros servicios» SUMA: es un pago extra, no un
 * descuento (la fórmula de la contable es `=+L-S+T`).
 */
const MANUALES: Array<[keyof ManualesLinea, string, "+" | "−"]> = [
  ["isr", "ISR", "−"],
  ["prestamo", "Préstamo", "−"],
  ["terceros", "Terceros", "−"],
  ["mercancia", "Mercancía", "−"],
  ["otrosServicios", "Otros servicios", "+"],
];

export default function PlanillaTab() {
  const { toast } = useToast();

  // 🔑 `hoy` se calcula UNA vez y en hora de Panamá. Recalcularlo en cada
  // render haría que la lista de quincenas cambiara sola a la medianoche
  // mientras alguien está escribiendo montos.
  const hoy = useMemo(() => new Date(Date.now() - 5 * 3_600_000).toISOString().slice(0, 10), []);
  const quincenas = useMemo(() => quincenasHasta(hoy, 12), [hoy]);

  const [clave, setClave] = useState(quincenas[0].clave);
  const [empresa, setEmpresa] = useState<string>(EMPRESAS_ASISTENCIA[0]);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const p = new URLSearchParams({ quincena: clave, empresa });
      const res = await fetch(`/api/asistencia/planilla?${p}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      setData(j as Respuesta);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setData(null);
    } finally {
      setCargando(false);
    }
  }, [clave, empresa]);

  useEffect(() => { void cargar(); }, [cargar]);

  /** Guarda un monto escrito a mano y refresca los números de esa fila. */
  const guardar = useCallback(
    async (codigo: string, campo: keyof ManualesLinea, valor: string) => {
      if (!data) return;
      const linea = data.lineas.find((l) => l.codigo === codigo);
      if (!linea) return;
      const n = Number(String(valor).replace(",", "."));
      const limpio = Number.isFinite(n) && n > 0 ? n : 0;
      if (limpio === linea.manuales[campo]) return; // no se escribió nada nuevo

      try {
        const res = await fetch("/api/asistencia/planilla", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            quincena: clave,
            codigo,
            ...linea.manuales,
            [campo]: limpio,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) toast(j.aviso ?? "No se pudo guardar", "error");
        // Se recarga entero: el monto cambia el total de deducciones, el neto y
        // los totales del pie. Pintar solo la celda dejaría un cuadro que no
        // suma, que es peor que esperar medio segundo.
        await cargar();
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    },
    [cargar, clave, data, toast],
  );

  const exportables = useMemo(() => {
    if (!data) return null;
    return {
      lineas: data.lineas,
      totales: data.totales,
      quincena: data.quincena,
      empresaEtiqueta: data.empresaEtiqueta,
      reglas: data.reglas,
    };
  }, [data]);

  function bajarExcel() {
    if (!exportables?.lineas.length) return;
    downloadWorkbook(construirExcelPlanilla(exportables), nombreArchivo(exportables, "xlsx"));
    toast("Excel listo — revisa tu carpeta de descargas", "success");
  }
  function bajarPdf() {
    if (!exportables?.lineas.length) return;
    construirPdfPlanilla(exportables).save(nombreArchivo(exportables, "pdf"));
    toast("PDF listo — revisa tu carpeta de descargas", "success");
  }

  const buenas = data?.lineas.filter((l) => l.dinero) ?? [];
  const pendientes = data?.lineas.filter((l) => !l.dinero) ?? [];

  return (
    <div className="space-y-4">
      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Quincena</span>
          <select
            value={clave}
            onChange={(e) => setClave(e.target.value)}
            className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
          >
            {quincenas.map((q) => (
              <option key={q.clave} value={q.clave}>{q.etiqueta}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1">
          <span className="text-xs text-gray-500">Empresa</span>
          <select
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className="min-h-[44px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
          >
            {EMPRESAS_ASISTENCIA.map((k) => (
              <option key={k} value={k}>{etiquetaEmpresa(k)}</option>
            ))}
          </select>
        </label>

        <div className="flex gap-2">
          <button
            type="button" onClick={bajarExcel} disabled={!data?.lineas.length}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
          >
            Excel
          </button>
          <button
            type="button" onClick={bajarPdf} disabled={!data?.lineas.length}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
          >
            PDF
          </button>
        </div>
      </div>

      {/* ── Avisos: todo lo que hay que saber ANTES de descontarle plata a nadie ── */}
      {data?.avisos.faltaMigracionConfiguracion && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {data.avisos.faltaMigracionConfiguracion}
        </p>
      )}
      {data?.avisos.faltaMigracionManual && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionManual}
        </p>
      )}
      {!!data?.avisos.sinHorario && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{data.avisos.sinHorario}</b>{" "}
          {data.avisos.sinHorario === 1 ? "persona no tiene" : "personas no tienen"} su hora de
          salida confirmada. Mientras tanto se asume {data.avisos.salidaAsumida} para las horas
          extra, y un día de ausencia se cuenta como{" "}
          <b>{data.avisos.horasAusenciaDefault} horas</b>. Revísalo en <b>Horarios</b>.
        </p>
      )}
      {!!data?.avisos.conSabado && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{data.avisos.conSabado}</b>{" "}
          {data.avisos.conSabado === 1 ? "persona trabajó" : "personas trabajaron"} un sábado. El
          cuadro no tiene columna para el sábado, así que esas horas <b>no se pagan acá</b>: las
          ves en la hoja «Horas» del Excel.
        </p>
      )}

      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!cargando && !error && data?.lineas.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay nadie en esta empresa para esta quincena. Revisa la pestaña <b>Configuración</b>.
        </p>
      )}

      {!cargando && !error && !!data?.lineas.length && (
        <>
          {/* ── ESCRITORIO: la tabla de 19 columnas ── */}
          <div className="hidden md:block">
            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="w-max min-w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 text-[10px] uppercase tracking-wide text-gray-400">
                    <th className="sticky left-0 z-10 bg-white px-3 py-2.5 text-left font-medium">Persona</th>
                    {[
                      "Salario\nquincenal", "Extra\n1.25", "Ausen-\ncias", "Tar-\ndanzas",
                      "Extra\n1.50", "Exce-\ndente", "Domin-\ngos", "Feria-\ndos", "Total\nbruto",
                      "Seguro\nsocial", "Seguro\neducativo", "ISR", "Prés-\ntamo", "Ter-\nceros",
                      "Mercan-\ncía", "Total\ndeducc.",
                      // El «(+)» no es adorno: es la única señal en la tabla de
                      // que esta columna SUMA mientras las cuatro de al lado restan.
                      "Otros\nservicios (+)", "Neto a\npagar",
                    ].map((h) => (
                      <th key={h} className="whitespace-pre px-2 py-2.5 text-right font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {buenas.map((l) => (
                    <Fila key={l.codigo} l={l} onGuardar={guardar} />
                  ))}
                  {pendientes.map((l) => (
                    <tr key={l.codigo} className="border-b border-gray-100 bg-amber-50/50 last:border-0">
                      <td className="sticky left-0 z-10 bg-amber-50 px-3 py-2.5 text-gray-900">
                        {l.etiqueta}
                        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
                      </td>
                      <td colSpan={18} className="px-2 py-2.5 text-[13px] font-medium text-amber-800">
                        falta configurar — {l.faltaConfigurar.join(" · ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-300 bg-gray-50 font-semibold">
                    <td className="sticky left-0 z-10 bg-gray-50 px-3 py-2.5">
                      TOTAL · {data.totales.personas}{" "}
                      {data.totales.personas === 1 ? "persona" : "personas"}
                    </td>
                    {[
                      data.totales.salarioQuincenal, data.totales.extraDiurno, data.totales.ausencias,
                      data.totales.tardanzas, data.totales.extraNocturno, data.totales.excedente,
                      data.totales.domingos, data.totales.feriados, data.totales.totalBruto,
                      data.totales.seguroSocial, data.totales.seguroEducativo, data.totales.isr,
                      data.totales.prestamo, data.totales.terceros, data.totales.mercancia,
                      data.totales.totalDeducciones, data.totales.otrosServicios, data.totales.netoPagar,
                    ].map((v, i) => (
                      <td key={i} className="px-2 py-2.5 text-right tabular-nums">
                        {v === 0 ? <span className="text-gray-400">—</span> : $$(v)}
                      </td>
                    ))}
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          {/* ── CELULAR: una tarjeta por persona ── */}
          <div className="space-y-2 md:hidden">
            {buenas.map((l) => (
              <Tarjeta
                key={l.codigo} l={l}
                abierta={abierta === l.codigo}
                onToggle={() => setAbierta(abierta === l.codigo ? null : l.codigo)}
                onGuardar={guardar}
              />
            ))}
            {pendientes.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="font-medium text-gray-900">
                  {l.etiqueta} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-amber-800">
                  falta configurar — {l.faltaConfigurar.join(" · ")}
                </p>
              </div>
            ))}
            <div className="rounded-lg border-2 border-gray-300 bg-gray-50 p-3">
              <p className="text-xs uppercase tracking-wide text-gray-500">
                Total · {data.totales.personas}{" "}
                {data.totales.personas === 1 ? "persona" : "personas"}
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                ${$(data.totales.netoPagar)}
              </p>
              <p className="text-[13px] text-gray-500">
                Bruto ${$(data.totales.totalBruto)} · deducciones ${$(data.totales.totalDeducciones)}
              </p>
            </div>
          </div>

          {!!pendientes.length && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <b>{pendientes.length}</b>{" "}
              {pendientes.length === 1 ? "persona quedó" : "personas quedaron"} fuera del total
              porque falta configurarles algo. <b>No valen $0</b> — se arreglan en la pestaña{" "}
              <b>Configuración</b>.
            </p>
          )}
        </>
      )}

      <p className="text-xs text-gray-400">
        {FORMULA_NETO} Los recargos, los porcentajes de seguro y la hora de corte se cambian en{" "}
        <b>Configuración</b>. El ISR, el préstamo, los terceros, la mercancía y los otros
        servicios se escriben a mano acá: no salen de ningún sistema.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type OnGuardar = (codigo: string, campo: keyof ManualesLinea, valor: string) => void;

/** Una celda de dinero que se escribe a mano. Guarda al salir del campo. */
function CeldaManual({
  codigo, campo, valor, onGuardar, ancho = "w-20",
}: {
  codigo: string; campo: keyof ManualesLinea; valor: number; onGuardar: OnGuardar; ancho?: string;
}) {
  // 🔑 Estado local mientras se escribe: si el valor viniera del padre en cada
  // tecla, el recargo de la fila pisaría lo que la persona está tecleando.
  const [texto, setTexto] = useState(valor ? String(valor) : "");
  useEffect(() => { setTexto(valor ? String(valor) : ""); }, [valor]);

  return (
    <input
      type="text" inputMode="decimal" value={texto} placeholder="—"
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => onGuardar(codigo, campo, texto)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`${ancho} min-h-[44px] rounded border border-gray-200 bg-white px-1.5 text-right text-sm tabular-nums outline-none transition focus:border-black`}
    />
  );
}

function Fila({ l, onGuardar }: { l: LineaPlanilla; onGuardar: OnGuardar }) {
  const d = l.dinero!;
  const num = (v: number, extra = "") => (
    <td className={`px-2 py-1.5 text-right tabular-nums ${extra}`}>
      {v === 0 ? <span className="text-gray-300">—</span> : $(v)}
    </td>
  );
  return (
    <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
      <td className="sticky left-0 z-10 bg-white px-3 py-1.5 text-gray-900 hover:bg-gray-50">
        {l.etiqueta}
        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
      </td>
      {num(d.salarioQuincenal)}
      {num(d.extraDiurno)}
      {num(d.ausencias, "text-red-700")}
      {num(d.tardanzas, "text-red-700")}
      {num(d.extraNocturno)}
      {num(d.excedente)}
      {num(d.domingos)}
      {num(d.feriados)}
      {num(d.totalBruto, "font-semibold text-gray-900")}
      {num(d.seguroSocial)}
      {num(d.seguroEducativo)}
      {MANUALES.slice(0, 4).map(([campo]) => (
        <td key={campo} className="px-1 py-1.5 text-right">
          <CeldaManual codigo={l.codigo} campo={campo} valor={l.manuales[campo]} onGuardar={onGuardar} />
        </td>
      ))}
      {num(d.totalDeducciones)}
      <td className="px-1 py-1.5 text-right">
        <CeldaManual codigo={l.codigo} campo="otrosServicios" valor={l.manuales.otrosServicios} onGuardar={onGuardar} />
      </td>
      {num(d.netoPagar, "font-semibold text-gray-900")}
    </tr>
  );
}

function Tarjeta({
  l, abierta, onToggle, onGuardar,
}: {
  l: LineaPlanilla; abierta: boolean; onToggle: () => void; onGuardar: OnGuardar;
}) {
  const d = l.dinero!;
  const h = l.horas;
  const linea = (k: string, v: number, rojo = false) =>
    v === 0 ? null : (
      <div key={k} className="flex justify-between py-0.5">
        <span className="text-gray-500">{k}</span>
        <span className={`tabular-nums ${rojo ? "text-red-700" : "text-gray-900"}`}>
          {rojo ? "−" : ""}${$(v)}
        </span>
      </div>
    );

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button" onClick={onToggle}
        className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-medium text-gray-900">{l.etiqueta}</span>
          <span className="text-xs text-gray-400">
            {l.codigo} · bruto ${$(d.totalBruto)}
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-lg font-semibold tabular-nums text-gray-900">
            ${$(d.netoPagar)}
          </span>
          <span className="text-[11px] text-gray-400">{abierta ? "cerrar" : "ver detalle"}</span>
        </span>
      </button>

      {abierta && (
        <div className="border-t border-gray-100 px-3 py-3 text-[13px]">
          {linea("Salario quincenal", d.salarioQuincenal)}
          {linea(`Horas extra 1.25 (${aHoras(h.extraDiurnoMin)} h)`, d.extraDiurno)}
          {linea(`Horas extra 1.50 (${aHoras(h.extraNocturnoMin)} h)`, d.extraNocturno)}
          {linea(`Excedente 2.625 (${aHoras(h.excedenteMin)} h)`, d.excedente)}
          {linea(`Domingos (${aHoras(h.domingoMin)} h)`, d.domingos)}
          {linea(`Feriados (${aHoras(h.feriadoMin)} h)`, d.feriados)}
          {linea(`Ausencias (${h.ausenciaDias} días · ${aHoras(h.ausenciaMin)} h)`, d.ausencias, true)}
          {linea(`Tardanzas (${h.tardanzaMin} min)`, d.tardanzas, true)}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total bruto</span>
            <span className="tabular-nums">${$(d.totalBruto)}</span>
          </div>

          <div className="mt-2">
            {linea("Seguro social", d.seguroSocial, true)}
            {linea("Seguro educativo", d.seguroEducativo, true)}
          </div>

          <p className="mt-3 text-xs uppercase tracking-wide text-gray-400">
            Se escriben a mano
          </p>
          <div className="mt-1 grid grid-cols-2 gap-2">
            {MANUALES.map(([campo, etiqueta, signo]) => (
              <label key={campo} className="flex flex-col gap-0.5">
                {/* El signo va en la etiqueta: cuatro de los cinco se restan y
                    «otros servicios» SUMA. Sin decirlo, el que lo escribe no
                    tiene forma de saber para qué lado va su número. */}
                <span className="text-[11px] text-gray-500">
                  {etiqueta}{" "}
                  <span className={signo === "+" ? "text-emerald-700" : "text-red-700"}>
                    ({signo === "+" ? "suma" : "resta"})
                  </span>
                </span>
                <CeldaManual
                  codigo={l.codigo} campo={campo} valor={l.manuales[campo]}
                  onGuardar={onGuardar} ancho="w-full"
                />
              </label>
            ))}
          </div>

          <div className="mt-3 flex justify-between border-t border-gray-200 pt-1">
            <span className="text-gray-500">Total deducciones</span>
            <span className="tabular-nums text-red-700">−${$(d.totalDeducciones)}</span>
          </div>
          {d.otrosServicios > 0 && (
            <div className="flex justify-between">
              <span className="text-gray-500">Otros servicios</span>
              <span className="tabular-nums text-emerald-700">+${$(d.otrosServicios)}</span>
            </div>
          )}
          <div className="flex justify-between font-semibold">
            <span>Neto a pagar</span>
            <span className="tabular-nums">${$(d.netoPagar)}</span>
          </div>

          {h.diasARevisar > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
              <b>{h.diasARevisar}</b> {h.diasARevisar === 1 ? "día" : "días"} sin las 4 marcas
              {h.tardanzaDeDiasARevisarMin > 0 && (
                <> — de ahí salen <b>{h.tardanzaDeDiasARevisarMin}</b> de los {h.tardanzaMin} minutos
                de tardanza. Míralos antes de descontar.</>
              )}
            </p>
          )}
          {h.sabadoMin > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
              Trabajó <b>{aHoras(h.sabadoMin)} h</b> un sábado. No hay columna para el sábado en el
              cuadro, así que esas horas no se pagan acá.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
