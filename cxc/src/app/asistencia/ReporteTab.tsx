"use client";

// El reporte. Usa el motor de `lib/asistencia/reporte.ts` — el mismo que genera
// el Excel y el PDF, así que la pantalla y los archivos NO pueden contradecirse.
//
// Todo en MINUTOS, nunca horas decimales: "295 minutos" se le discute a una
// persona, "4,92 horas" no le dice nada a nadie.

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ToastSystem";
import { TOLERANCIA_MIN, EXTRA_MINIMO_MIN, fmtMin, type DiaReporte, type PersonaReporte, type ReglasReporte } from "@/lib/asistencia/reporte";
import { etiquetaPersona } from "@/lib/asistencia/directorio";
import { ALMUERZO_FIJO_MIN } from "@/lib/asistencia/config";
import { hoyPanama } from "@/lib/fecha-panama";
import { Ayuda } from "@/components/shared/Ayuda";
import RangoFechas from "./RangoFechas";
import EstadoReloj from "./EstadoReloj";
import CorregirMarcacionModal, { type MarcaParaCorregir } from "./CorregirMarcacionModal";

const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const DOW = ["dom","lun","mar","mié","jue","vie","sáb"];
function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return `${DOW[new Date(Date.UTC(a, m - 1, d)).getUTCDay()]} ${d} ${MESES[m - 1]}`;
}
/** 0 se muestra como raya: una columna de ceros esconde lo que sí importa. */
/**
 * Un número de la tabla. Cero es una raya, no un 0 que compite por la vista.
 *
 * 🔑 Los minutos se calculan AL SEGUNDO desde el 13-ago-2026, así que pueden
 * traer fracción: `fmtMin` los muestra con 2 decimales solo cuando la tienen.
 * Redondear al entero en cada celda haría que la columna no sumara el total.
 */
const n = (v: number) =>
  v ? <span className="tabular-nums">{fmtMin(v)}</span> : <span className="text-gray-300">—</span>;

export default function ReporteTab() {
  const { toast } = useToast();
  // 🔑 EL MISMO "hoy" QUE USA EL SERVIDOR. Acá había una segunda cuenta a mano
  // (`Date.now() - 5h`), correcta pero aparte: si las dos se separaran, la
  // pantalla podría pedir hasta un día y el servidor marcar como "en curso"
  // otro. Una sola definición de hoy, y es `hoyPanama()`.
  const hoy = hoyPanama();
  const [desde, setDesde] = useState(hoyPanama(new Date(Date.now() - 14 * 86_400_000)));
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
  // Correcciones: cuántas hay en el rango, si se pueden hacer (la migración
  // puede no haber corrido) y cuál se está tocando.
  const [correcciones, setCorrecciones] = useState({ correcciones: 0, dias: 0, agregadas: 0 });
  const [puedeCorregir, setPuedeCorregir] = useState(false);
  const [avisoCorreccion, setAvisoCorreccion] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<MarcaParaCorregir | null>(null);
  // Cuántas personas quedaron fuera por no estar trabajando en este rango, y
  // cuál es el día que todavía va corriendo (`null` si el rango ya cerró).
  const [fueraDelRango, setFueraDelRango] = useState(0);
  const [diaEnCurso, setDiaEnCurso] = useState<string | null>(null);

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
      setCorrecciones(data.correcciones ?? { correcciones: 0, dias: 0, agregadas: 0 });
      setPuedeCorregir(Boolean(data.correccionesDisponible));
      setAvisoCorreccion(data.avisoCorrecciones ?? null);
      setFueraDelRango(data.fueraDelRango ?? 0);
      setDiaEnCurso(data.diaEnCurso ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setPersonas(null);
    } finally { setCargando(false); }
  }, [desde, hasta, q]);

  useEffect(() => { void cargar(); }, [cargar]);

  // 🩸 LAS LIBRERÍAS DE EXCEL Y PDF SE BAJAN AL TOCAR EL BOTÓN, no al abrir la
  // pantalla (12-ago-2026). Estaban importadas arriba, así que `xlsx-js-style`,
  // `jspdf` y `jspdf-autotable` entraban al bundle inicial de /asistencia
  // aunque nadie exportara nada — y quien entra a Asistencia entra a mirar
  // marcas, no a bajar archivos. Medido contra el build de producción:
  // /asistencia era la pantalla MÁS PESADA del sistema con 864 KB de JS.
  //
  // Es el patrón que ya usan Ventas (`lib/ventas/excel.ts`), Packing Lists y
  // Catálogos — no uno nuevo. ⚠️ `lib/asistencia/exportar` importa xlsx y jspdf
  // de forma estática, así que importarlo a él YA arrastra las tres librerías:
  // por eso el `await import()` tiene que envolverlo a él también, no solo a
  // xlsx.
  async function bajarExcel() {
    if (!personas?.length) return;
    try {
      const XLSX = (await import("xlsx-js-style")).default;
      const { construirExcel } = await import("@/lib/asistencia/exportar");
      XLSX.writeFile(construirExcel({ personas, desde, hasta, reglas: reglas ?? undefined }), `Asistencia ${desde} a ${hasta}.xlsx`);
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el Excel. Intenta de nuevo.", "error");
    }
  }
  async function bajarPdf() {
    if (!personas?.length) return;
    try {
      const { construirPdf } = await import("@/lib/asistencia/exportar");
      construirPdf({ personas, desde, hasta, reglas: reglas ?? undefined }).save(`Asistencia ${desde} a ${hasta}.pdf`);
      toast("PDF listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el PDF. Intenta de nuevo.", "error");
    }
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

      {/* 🔴 QUE NADIE LEA UN TOTAL SIN ENTERARSE DE QUE HAY HORAS TOCADAS A
          MANO. Va arriba de la tabla, no escondido en el detalle de una
          persona: el número de abajo ya viene calculado con estas horas. */}
      {correcciones.correcciones > 0 && (
        <p className="rounded-md bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
          <b>{correcciones.correcciones}</b>{" "}
          {correcciones.correcciones === 1 ? "hora corregida a mano" : "horas corregidas a mano"} en{" "}
          <b>{correcciones.dias}</b> {correcciones.dias === 1 ? "día" : "días"}
          {correcciones.agregadas > 0 && (
            <> — {correcciones.agregadas} {correcciones.agregadas === 1 ? "es una marcación agregada" : "son marcaciones agregadas"}</>
          )}
          . Los números de abajo ya cuentan con eso. Abre a la persona para ver qué se cambió y por qué.
        </p>
      )}

      {/* 🔴 EL DÍA QUE NO TERMINÓ NO ES UN ERROR, Y SE DICE. Sin esta línea,
          quien mire a las 3 de la tarde vería a media oficina con 3 marcas y
          "A revisar" en cero, y pensaría que el cuadro se equivoca. El día se
          ve entero —las marcas están—; lo único que no se hace es juzgarlo. */}
      {diaEnCurso && (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
          Hoy ({fechaCorta(diaEnCurso)}) todavía va corriendo: sus marcas se ven, pero el día
          <b> no se cuenta como mal marcado ni como ausencia</b> hasta que termine.
        </p>
      )}

      {/* Quien no estaba trabajando en el rango no sale — y se dice cuántos son,
          para que nadie busque a una persona que la pantalla decidió no mostrar. */}
      {fueraDelRango > 0 && (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
          <b>{fueraDelRango}</b>{" "}
          {fueraDelRango === 1 ? "persona no aparece" : "personas no aparecen"} porque no
          estaba trabajando en estas fechas (entró después o ya se había ido). Sus marcaciones
          siguen guardadas y salen si consultas el rango en que sí trabajaba.
        </p>
      )}

      {/* Sin la migración corrida la pantalla NO ofrece corregir, y lo dice: un
          botón que siempre falla es peor que no tenerlo. */}
      {avisoCorreccion && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{avisoCorreccion}</p>
      )}

      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!cargando && !error && personas?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay marcaciones en este rango. Revisa las fechas, y arriba cómo va el reloj.
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
                  onToggle={() => setAbierta(abierta === p.codigo ? null : p.codigo)}
                  puedeCorregir={puedeCorregir}
                  onCorregir={setCorrigiendo} />
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

      {/* La metodología del cuadro se aprende una vez: va al ⓘ. Los avisos que
          cambian una decisión —el reloj callado, las horas de salida sin
          confirmar— siguen arriba y a la vista. */}
      <div className="-ml-2">
        <Ayuda titulo="Cómo se leen estos números" etiqueta="Cómo se leen estos números">
          <p>
            Todo en minutos. Entrada 8:00 con {reglas?.toleranciaTardanzaMin ?? TOLERANCIA_MIN} de
            tolerancia · almuerzo de {ALMUERZO_FIJO_MIN} minutos · extras desde{" "}
            {reglas?.extraMinimoMin ?? EXTRA_MINIMO_MIN} min, menos el atraso del día.{" "}
            <b>&quot;A revisar&quot;</b> es un día TERMINADO sin las 4 marcas: los minutos igual
            cuentan. El día de <b>hoy</b> nunca entra ahí —sigue corriendo, así que todavía no
            se le puede decir que está mal marcado—, y el reporte muestra solo a quien estaba
            trabajando en las fechas que pediste.
            Estos números se cambian en <b>Configuración</b>.{" "}
            <b>Corregir una hora</b> no borra lo que marcó el reloj: la corrección va encima,
            con quién la puso y por qué, y se puede deshacer.
          </p>
        </Ayuda>
      </div>

      {corrigiendo && (
        <CorregirMarcacionModal
          marca={corrigiendo}
          onCerrar={() => setCorrigiendo(null)}
          onGuardado={() => void cargar()}
        />
      )}
    </div>
  );
}

function FilaPersona({ p, abierta, onToggle, puedeCorregir, onCorregir }: {
  p: PersonaReporte;
  abierta: boolean;
  onToggle: () => void;
  puedeCorregir: boolean;
  onCorregir: (m: MarcaParaCorregir) => void;
}) {
  const r = p.resumen;
  const persona = etiquetaPersona(p.codigo, p.nombre);
  return (
    <>
      <tr onClick={onToggle} className="cursor-pointer border-b border-gray-100 transition hover:bg-gray-50">
        {/* El NOMBRE manda; el código va chico al lado, y solo si aporta algo.
            Sin nombre configurado se muestra el código —nunca un blanco— y se
            dice qué falta, porque un número suelto no se le reclama a nadie. */}
        <td className="px-3 py-2.5 text-gray-900">
          {persona}
          {p.nombre ? (
            <span className="ml-1.5 text-xs text-gray-400">{p.codigo}</span>
          ) : (
            <span className="ml-1.5 text-xs text-amber-700">falta configurar</span>
          )}
          {/* 🔴 Se ve SIN abrir nada: los minutos de esta fila ya salen de una
              hora que alguien escribió a mano. */}
          {r.diasCorregidos > 0 && (
            <span className="ml-1.5 whitespace-nowrap rounded bg-blue-50 px-1.5 py-0.5 text-xs font-semibold text-blue-700">
              {r.diasCorregidos} {r.diasCorregidos === 1 ? "día corregido" : "días corregidos"}
            </span>
          )}
        </td>
        <td className="px-2 py-2.5 text-center tabular-nums text-gray-500">{p.salida}</td>
        <td className="px-2 py-2.5 text-right tabular-nums text-gray-700">{r.diasTrabajados}</td>
        <td className="px-2 py-2.5 text-right">{r.ausenciasSinJustificar
          ? <span className="font-semibold tabular-nums text-red-700">{r.ausenciasSinJustificar}</span>
          : <span className="text-gray-300">—</span>}</td>
        <td className="px-2 py-2.5 text-right text-gray-700">{n(r.vecesTarde)}</td>
        <td className="px-2 py-2.5 text-right">{r.minutosTarde
          ? <span className="font-medium tabular-nums text-amber-700">{fmtMin(r.minutosTarde)}</span>
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
              De los <b>{fmtMin(r.minutosTarde)}</b> minutos tarde, <b>{fmtMin(r.minutosTardeDeDiasARevisar)}</b> vienen
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
                  <FilaDia key={d.fecha} d={d} codigo={p.codigo} persona={persona}
                    puedeCorregir={puedeCorregir} onCorregir={onCorregir} />
                ))}
              </tbody>
            </table>
          </div>
        </td></tr>
      )}
    </>
  );
}

/**
 * Un día del detalle.
 *
 * 🔴 ACÁ SE VE LA CORRECCIÓN Y ACÁ SE PONE. Cada hora es tocable: al tocarla se
 * abre la ventana con la hora del RELOJ arriba (que no se puede borrar) y la
 * corrección debajo. Debajo de la fila, una línea por corrección dice qué se
 * cambió, por qué, quién y cuándo — sin abrir nada más.
 */
function FilaDia({ d, codigo, persona, puedeCorregir, onCorregir }: {
  d: DiaReporte;
  codigo: string;
  persona: string;
  puedeCorregir: boolean;
  onCorregir: (m: MarcaParaCorregir) => void;
}) {
  /** La corrección que produjo la marca de esa posición, si la hay. */
  const correccionDe = (idx: number) =>
    d.correcciones.find((c) => c.hora === d.marcas[idx]) ?? null;

  function abrir(idx: number) {
    const c = correccionDe(idx);
    onCorregir({
      marcacionId: d.marcasIds[idx] ?? null,
      codigo,
      persona,
      fecha: d.fecha,
      relojHora: c ? c.relojHora : (d.marcas[idx] ?? null),
      correccionId: c?.id ?? null,
      correccionMotivo: c?.motivo ?? null,
      correccionPor: c?.creadaPor ?? null,
      correccionEn: c?.creadaEn ?? null,
    });
  }

  function agregar() {
    onCorregir({
      marcacionId: null,
      codigo,
      persona,
      fecha: d.fecha,
      relojHora: null,
    });
  }

  /** Una celda de hora. Tocable solo si se puede corregir. */
  function Hora({ idx, mostrar, tenue }: { idx: number; mostrar: boolean; tenue?: boolean }) {
    if (!mostrar) return <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">—</td>;
    const hora = d.marcas[idx];
    const c = correccionDe(idx);
    const clase = `tabular-nums ${tenue ? "text-gray-500" : ""}`;
    return (
      <td className="px-2 py-1.5 text-right">
        {puedeCorregir ? (
          <button
            type="button"
            onClick={() => abrir(idx)}
            title="Corregir esta hora"
            className={`min-h-[44px] rounded px-1 ${clase} ${c ? "font-semibold text-blue-700 underline decoration-blue-300 underline-offset-2" : "underline decoration-dotted decoration-gray-300 underline-offset-2 hover:decoration-black"}`}
          >
            {hora}
          </button>
        ) : (
          <span className={`${clase} ${c ? "font-semibold text-blue-700" : ""}`}>{hora}</span>
        )}
      </td>
    );
  }

  const ultima = d.marcas.length - 1;

  return (
    <>
      <tr className={`border-b border-gray-100 ${d.revisar ? "bg-amber-50/60" : ""} ${d.correcciones.length ? "bg-blue-50/40" : ""}`}>
        <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">{fechaCorta(d.fecha)}</td>
        {d.marcas.length ? (
          <>
            <Hora idx={0} mostrar={d.marcas.length > 0} />
            <Hora idx={1} mostrar={d.marcas.length >= 4} tenue />
            <Hora idx={2} mostrar={d.marcas.length >= 4} tenue />
            <Hora idx={ultima} mostrar={d.marcas.length > 1} />
            <td className="px-2 py-1.5 text-right">{d.tardeMin
              ? <span className="font-medium tabular-nums text-amber-700">{fmtMin(d.tardeMin)}</span>
              : <span className="text-gray-300">—</span>}</td>
            <td className="px-2 py-1.5 text-right text-gray-600">{n(d.excesoAlmuerzoMin)}</td>
            <td className="px-2 py-1.5 text-right text-gray-600">{n(d.extraMin)}</td>
            <td className="whitespace-nowrap px-2 py-1.5">
              {d.revisar && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Revisar</span>
              )}
              {/* 🔴 GRIS, NUNCA ÁMBAR. El color es la mitad del mensaje: ámbar
                  dice "hay algo que corregir" y acá no lo hay — el día sigue
                  corriendo. Se dice igual, para que un día sin las 4 marcas y
                  sin "Revisar" no se lea como un cuadro que se equivoca. */}
              {/* 🔑 12 px, no 11. El chip «Revisar» de al lado mide 11 y está
                  ahí desde antes —eso no se toca—, pero un texto NUEVO no baja
                  de 12 (misma decisión que en el PR de correcciones). Y no se
                  ven raros juntos porque NUNCA aparecen juntos: un día es "en
                  curso" o es "a revisar", nunca los dos. */}
              {d.enCurso && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">En curso</span>
              )}
              {/* Agregar la marca que falta. Es el caso más común de todos: quien
                  olvidó marcar no tiene nada que corregir. */}
              {puedeCorregir && (
                <button type="button" onClick={agregar}
                  className="ml-1.5 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 transition hover:text-black">
                  Agregar hora
                </button>
              )}
            </td>
          </>
        ) : (
          <td colSpan={8} className="px-2 py-1.5 text-gray-500">
            {d.feriado ? <>Feriado — {d.feriado}</>
              : d.justificado ? <>Ausencia justificada — {d.justificado}</>
              // 🔴 Hoy sin marcas NO es una falta: a las 8:59 nadie faltó
              // todavía. En rojo diría lo contrario, así que va en gris.
              : d.enCurso ? <span className="text-gray-500">Todavía no marcó — el día va corriendo</span>
              : <span className="font-medium text-red-700">Ausencia sin justificar</span>}
            {puedeCorregir && !d.feriado && (
              <button type="button" onClick={agregar}
                className="ml-2 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 transition hover:text-black">
                Agregar marcación
              </button>
            )}
          </td>
        )}
      </tr>

      {/* 🔴 LO QUE DIJO EL RELOJ Y LO QUE SE CORRIGIÓ, LAS DOS COSAS. Sin esto
          la fila de arriba mostraría una hora escrita a mano como si el reloj
          la hubiera registrado. */}
      {d.correcciones.map((c) => (
        <tr key={c.id} className="border-b border-gray-100 bg-blue-50/40">
          <td></td>
          <td colSpan={8} className="px-2 pb-1.5 text-[12px] text-blue-900">
            {c.agregada ? (
              <>Marcación <b>agregada</b>: <b className="tabular-nums">{c.hora}</b> — el reloj no registró nada</>
            ) : (
              <>Reloj <span className="tabular-nums line-through decoration-blue-300">{c.relojHora}</span>{" "}
                → <b className="tabular-nums">{c.hora}</b></>
            )}
            {" · "}“{c.motivo}” · {c.creadaPor}{c.creadaEn ? ` · ${fechaCortaISO(c.creadaEn)}` : ""}
          </td>
        </tr>
      ))}
    </>
  );
}

/** Un instante ISO → "13 ago", en hora de Panamá. */
function fechaCortaISO(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * 3600_000);
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}`;
}
