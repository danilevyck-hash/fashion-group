"use client";

// El reporte. Usa el motor de `lib/asistencia/reporte.ts` — el mismo que genera
// el Excel y el PDF, así que la pantalla y los archivos NO pueden contradecirse.
//
// Todo en MINUTOS, nunca horas decimales: "295 minutos" se le discute a una
// persona, "4,92 horas" no le dice nada a nadie.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useToast } from "@/components/ToastSystem";
import { TOLERANCIA_MIN, EXTRA_MINIMO_MIN, fmtMin, cuentaHorasExtra, extraQueCuenta, type DiaReporte, type PersonaReporte, type ReglasReporte } from "@/lib/asistencia/reporte";
import { TEXTO_DIA_FUERA_DE_VIGENCIA } from "@/lib/asistencia/vigencia";
import { etiquetaPersona } from "@/lib/asistencia/directorio";
// 🔴 Los nombres se MUESTRAN capitalizados, como en la lista; lo guardado sigue
// en mayúsculas (10-sep-2026: el Reporte mezclaba «YULISSA JUAREZ» con «Andrea Perez»).
import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { textoAlmuerzo, MINUTOS_TARDE_QUE_SON_AUSENCIA } from "@/lib/asistencia/config";
import { esTrabajoDeVendedor, textoDiaJustificado } from "@/lib/asistencia/motivos";
import { textoDiaVacaciones } from "@/lib/asistencia/vacaciones";
// 🔴 El texto del permiso sale de un módulo PURO, nunca escrito acá: la
// pantalla, el título y el Excel tienen que decir exactamente lo mismo.
import { etiquetaPermisoDelDia, textoPerdonDelPeriodo, textoPermisoDelDia, type PerdonDelDia } from "@/lib/asistencia/permiso-horas";
import { hoyPanama } from "@/lib/fecha-panama";
import { Ayuda } from "@/components/shared/Ayuda";
import RangoFechas, { ultimoRango } from "@/components/ui/RangoFechas";
// 🔴 Los atajos del período y el período en la URL: dos módulos PUROS.
import { atajosDePeriodo, atajoActivo } from "@/lib/asistencia/atajos-periodo";
import { periodoInicial, urlTraePeriodo } from "@/lib/asistencia/periodo-en-la-url";
import { useUrlState } from "@/lib/hooks/useUrlState";
// 🔴 Dos marcas y la segunda a mediodía: un aviso, nunca un cálculo.
import { TEXTO_SALIDA_SOSPECHOSA, tituloSalidaSospechosa } from "@/lib/asistencia/salida-sospechosa";
// 🔴 La columna «Extras» dice cuánto está aprobado.
import { repartirExtras, textoExtrasDecididas, tituloExtrasDecididas } from "@/lib/asistencia/extras-decididas";
import type { Decision } from "@/lib/asistencia/aprobaciones";
import EstadoReloj from "./EstadoReloj";
import JustificacionesDelPeriodo from "./JustificacionesDelPeriodo";
import { PERSONA_EN_EL_CENTRO, PESTANA_FICHAS, dondeSeCargaLaFicha, rutaDePersona } from "@/lib/asistencia/persona-en-el-centro";
import { empresaParaPedir, nombreArchivoPorEmpresa } from "@/lib/asistencia/empresa-para-todo";
import CorregirMarcacionModal, { type MarcaParaCorregir } from "./CorregirMarcacionModal";
import JustificarDiaModal, { type DiaParaJustificar } from "./JustificarDiaModal";
// 🔴 EL RELOJ DEL TELÉFONO EN EL REPORTE (14-sep-2026). Lo que Daniel pidió que
// viera la contadora: la selfie y el mapa, y de dónde salió cada marca. Es una
// capa de ARRIBA: el motor no sabe nada de esto y sus minutos no cambian.
import SelfieMarcacionModal, { type SelfieParaVer } from "./SelfieMarcacionModal";
import { llaveDelDia, type MarcaTelefonoUI } from "@/lib/marcacion/en-el-reporte";
import { rotuloDeLaMarca } from "@/lib/marcacion/marcacion";

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

/** La raya de «acá no se cuenta», con el motivo al pasar el cursor. */
// 🔴 14-sep-2026: lo que apaga la columna es la casilla «¿Cobra horas extra?»
// de la ficha, no ser servicio profesional (Daniel: *«solo yulissa no cobra»*).
const SIN_EXTRA_TITULO = "No cobra horas extra (casilla de su ficha): solo se le cuentan tardanzas y ausencias.";
const sinExtra = () => <span className="text-gray-300" title={SIN_EXTRA_TITULO}>—</span>;

export default function ReporteTab({ empresa = "" }: {
  /** El selector de arriba de las pestañas (10-sep-2026). «todas» o vacío = todas. */
  empresa?: string;
} = {}) {
  const { toast } = useToast();
  // 🔑 EL MISMO "hoy" QUE USA EL SERVIDOR. Acá había una segunda cuenta a mano
  // (`Date.now() - 5h`), correcta pero aparte: si las dos se separaran, la
  // pantalla podría pedir hasta un día y el servidor marcar como "en curso"
  // otro. Una sola definición de hoy, y es `hoyPanama()`.
  const hoy = hoyPanama();
  // ── 🔴 SE LLEGA DESDE LA FICHA DEL COLABORADOR, A SUS DÍAS (11-sep-2026) ──
  //
  // «Ver sus días ›» manda `?tab=asistencia&desde=…&hasta=…&q=<código>`. 🩸
  // Hasta hoy esta pestaña no leía ninguno de los tres: aterrizaba en la lista
  // de TODOS con el último rango guardado. Es el mismo camino que ya recorre
  // Aprobaciones con `?persona=` — el rango de la URL manda sobre el recordado,
  // y el código va al buscador. Se lee UNA vez, al montar.
  // ⚠️ `useSearchParams()` puede ser `null` fuera del App Router (los tests que
  // montan la pestaña sola): sin URL no hay llegada, y nada se rompe.
  const sp = useSearchParams();
  const llegada = useMemo(() => ({ q: (sp?.get("q") ?? "").trim() }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);

  // ── 🔴 EL PERÍODO VIVE EN LA URL (16-sep-2026) ────────────────────────────
  //
  // Daniel: *«si estoy en asistencia y voy a planilla y vuelvo se me resetea
  // asistencia, quiero q se quede»*. 🩸 Eran `useState`, y esta pestaña se
  // DESMONTA al cambiar de pestaña: volver la montaba de cero con «hace 14
  // días → hoy». Ahora viaja en `?desde=&hasta=`, con `replace` porque es un
  // filtro del MISMO nivel y el Atrás del navegador no tiene que ciclar por
  // cada cambio de fechas (igual que `?tab=` y `?empresa=`).
  //
  // 🔑 La precedencia no cambió y vive en `periodo-en-la-url.ts`: manda la URL,
  // después lo recordado en este dispositivo, y al final la sugerencia. «Ver
  // sus días ›» desde la ficha sigue mandando su rango y sigue ganando.
  const [desdeUrl, setDesdeUrl] = useUrlState("desde", "");
  const [hastaUrl, setHastaUrl] = useUrlState("hasta", "");
  // 🔴 EL RESPALDO SE FIJA AL MONTAR y la URL se relee siempre: así un enlace
  // que cambie el rango se aplica, y la basura (media URL, un rango al revés)
  // cae en lo de siempre en vez de mostrar medio período pedido.
  const respaldo = useMemo(() => ({
    recordado: ultimoRango("asistencia_reporte"),
    haceCatorce: hoyPanama(new Date(Date.now() - 14 * 86_400_000)),
  }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []);
  const inicial = useMemo(
    () => periodoInicial({ url: { desde: desdeUrl, hasta: hastaUrl }, hoy, ...respaldo }),
    [desdeUrl, hastaUrl, hoy, respaldo],
  );
  const { desde, hasta } = inicial;
  const elegirPeriodo = useCallback((d: string, h: string) => {
    setDesdeUrl(d); setHastaUrl(h);
    try { localStorage.setItem("fg_last_asistencia_reporte", `${d}|${h}`); } catch { /* modo privado */ }
  }, [setDesdeUrl, setHastaUrl]);

  // La URL queda escrita UNA vez al montar, para que el rango sobreviva al
  // cambio de pestaña aunque nadie haya tocado el selector. Con la URL ya
  // completa no corre: lo que trae el enlace manda.
  useEffect(() => {
    if (urlTraePeriodo({ desde: desdeUrl, hasta: hastaUrl })) return;
    setDesdeUrl(inicial.desde); setHastaUrl(inicial.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Los cuatro atajos: Hoy · Ayer · Esta quincena · Quincena pasada. */
  const atajos = useMemo(() => atajosDePeriodo(hoy), [hoy]);
  const atajoPrendido = atajoActivo(atajos, desde, hasta);
  const [q, setQ] = useState(llegada.q);
  const [personas, setPersonas] = useState<PersonaReporte[] | null>(null);
  const [sinHorario, setSinHorario] = useState(0);
  /** Quiénes son, para nombrarlos y enlazar a su ficha. */
  const [sinHorarioLista, setSinHorarioLista] = useState<Array<{ codigo: string; nombre: string | null }>>([]);
  /** `codigo|fecha → si|no`. Lo que NO está acá es pendiente. */
  const [decisionesExtra, setDecisionesExtra] = useState<ReadonlyMap<string, Decision>>(new Map());
  // Los números con los que el SERVIDOR calculó. La pantalla no los inventa:
  // si dijera "5 de tolerancia" mientras el motor usa 10, el texto sería falso.
  const [reglas, setReglas] = useState<Partial<ReglasReporte> | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);
  /**
   * 🔴 LA VISTA «JUSTIFICACIONES DEL PERÍODO» (10-sep-2026). Arranca CERRADA:
   * el trabajo de esta pantalla es el reporte, y las justificaciones son la
   * explicación que se va a buscar cuando algo no cuadra.
   */
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Correcciones: cuántas hay en el rango, si se pueden hacer (la migración
  // puede no haber corrido) y cuál se está tocando.
  const [correcciones, setCorrecciones] = useState({ correcciones: 0, dias: 0, agregadas: 0 });
  const [puedeCorregir, setPuedeCorregir] = useState(false);
  const [avisoCorreccion, setAvisoCorreccion] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<MarcaParaCorregir | null>(null);
  // «Justificar» desde la fila del día (11-sep-2026): el mismo formulario de la
  // ficha, con el colaborador y ese día ya puestos.
  const [justificando, setJustificando] = useState<DiaParaJustificar | null>(null);
  // Sube cada vez que se guarda una justificación desde acá, para que la lista
  // «Justificaciones del período» se vuelva a leer sin cambiar de rango.
  const [refrescoJustificaciones, setRefrescoJustificaciones] = useState(0);
  // Cuántas personas quedaron fuera por no estar trabajando en este rango, y
  // cuál es el día que todavía va corriendo (`null` si el rango ya cerró).
  const [fueraDelRango, setFueraDelRango] = useState(0);
  const [diaEnCurso, setDiaEnCurso] = useState<string | null>(null);
  // Las marcas del teléfono del período, por `codigo|fecha`. Vacío cuando no
  // hay ninguna (o la migración todavía no corrió).
  const [marcasTelefono, setMarcasTelefono] = useState<Record<string, MarcaTelefonoUI[]>>({});
  const [verSelfie, setVerSelfie] = useState<SelfieParaVer | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true); setError(null);
    try {
      const p = new URLSearchParams({ desde, hasta });
      if (q.trim()) p.set("q", q.trim());
      // 🔴 El filtro por empresa lo aplica el SERVIDOR: la tabla, los totales y
      // los avisos salen ya filtrados, y el Excel/PDF llevan lo mismo.
      const emp = empresaParaPedir(empresa);
      if (emp) p.set("empresa", emp);
      const res = await fetch(`/api/asistencia/reporte?${p}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "No se pudo cargar");
      setPersonas(data.personas ?? []);
      setSinHorario(data.sinHorario ?? 0);
      setSinHorarioLista(data.sinHorarioLista ?? []);
      setDecisionesExtra(new Map(Object.entries((data.decisionesExtra ?? {}) as Record<string, Decision>)));
      setReglas(data.reglas ?? null);
      setCorrecciones(data.correcciones ?? { correcciones: 0, dias: 0, agregadas: 0 });
      setPuedeCorregir(Boolean(data.correccionesDisponible));
      setAvisoCorreccion(data.avisoCorrecciones ?? null);
      setFueraDelRango(data.fueraDelRango ?? 0);
      setDiaEnCurso(data.diaEnCurso ?? null);
      setMarcasTelefono(data.marcasTelefono ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setPersonas(null);
    } finally { setCargando(false); }
  }, [desde, hasta, q, empresa]);

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
      const { construirExcel } = await import("@/lib/asistencia/exportar");
      // 🔴 Por el camino común (`downloadWorkbook`), como todo export.
      const { downloadWorkbook } = await import("@/lib/excel-export");
      downloadWorkbook(
        construirExcel({ personas, desde, hasta, reglas: reglas ?? undefined }),
        nombreArchivoPorEmpresa("Asistencia", empresa, desde, hasta, "xlsx"),
      );
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el Excel. Intenta de nuevo.", "error");
    }
  }
  async function bajarPdf() {
    if (!personas?.length) return;
    try {
      const { construirPdf } = await import("@/lib/asistencia/exportar");
      construirPdf({ personas, desde, hasta, reglas: reglas ?? undefined }).save(nombreArchivoPorEmpresa("Asistencia", empresa, desde, hasta, "pdf"));
      toast("PDF listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el PDF. Intenta de nuevo.", "error");
    }
  }

  const tot = (personas ?? []).reduce((a, p) => ({
    aus: a.aus + p.resumen.ausenciasSinJustificar,
    tarde: a.tarde + p.resumen.minutosTarde,
    noTrab: a.noTrab + p.resumen.tiempoNoTrabajadoMin,
    // 🔴 El servicio profesional no suma extras (3-sep-2026): `extraQueCuenta`.
    extra: a.extra + extraQueCuenta(p),
    rev: a.rev + p.resumen.diasARevisar,
  }), { aus: 0, tarde: 0, noTrab: 0, extra: 0, rev: 0 });

  return (
    <div className="space-y-4">
      {/* Arriba de todo a propósito: si el reloj no está entrando, cualquier
          número de esta pantalla está incompleto y hay que saberlo ANTES de
          leerlo — no después de descontarle minutos a alguien. */}
      <EstadoReloj onLlegaron={() => void cargar()} />

      <div className="flex flex-wrap items-end gap-3">
        <RangoFechas desde={desde} hasta={hasta} recordarComo="asistencia_reporte" onChange={elegirPeriodo} />
        <input
          type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colaborador"
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

      {/* ── 🔴 LOS ATAJOS DEL PERÍODO (16-sep-2026) ───────────────────────────
          Daniel: *«arregla la manera de seleccionar en el calendario que se ve
          raro, tiene que ser normal, facil»*. 🩸 Para mirar UN día había que
          abrir el calendario y tocar DOS veces (es un selector de rango). Los
          cuatro botones salen de `atajos-periodo.ts`, que arma las quincenas
          con la MISMA función que la Planilla — no hay un tercer selector—, y
          el calendario queda para todo lo demás. */}
      <div className="flex flex-wrap gap-2">
        {atajos.map((a) => (
          <button
            key={a.clave} type="button"
            onClick={() => elegirPeriodo(a.desde, a.hasta)}
            aria-pressed={atajoPrendido === a.clave}
            className={`min-h-[44px] rounded-md border px-3 text-sm transition active:scale-[0.97] ${
              atajoPrendido === a.clave
                ? "border-black bg-black font-medium text-white"
                : "border-gray-300 text-gray-700 hover:border-black hover:text-black"
            }`}
          >
            {a.rotulo}
          </button>
        ))}
      </div>

      {/* 🔴 UN ENLACE AL LADO DE LA TABLA, no un bloque suelto ni filas
          metidas adentro. Daniel: *«Reporte es para otra cosa»* — pero una
          justificación EXPLICA una ausencia de acá, así que vive a un toque.
          Solo con el acomodo nuevo: con el interruptor apagado, Justificaciones
          sigue siendo su propia pestaña y esto sería la misma lista dos veces. */}
      {PERSONA_EN_EL_CENTRO && (
        <div>
          {/* 🔴 El enlace «Justificaciones del período» lo dibuja el componente,
              y SOLO cuando hay alguna (10-sep-2026): un título sobre una lista
              vacía es una palabra de más. */}
          <JustificacionesDelPeriodo desde={desde} hasta={hasta} empresa={empresa} refresco={refrescoJustificaciones} />
        </div>
      )}

      {/* Sin horario fijado se asume 5:00 p.m., y con eso las extras y la salida
          temprana pueden estar mal. Vale avisarlo antes de que descuente.
          🩸 Decía «revísalo en Horarios» (11-sep-2026, Daniel lo vio): esa
          pestaña ya no existe con el acomodo nuevo; la hora de salida se
          confirma en la ficha del colaborador. El destino sale del módulo puro. */}
      {sinHorario > 0 && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          <b>{sinHorario}</b> {sinHorario === 1 ? "colaborador no tiene" : "colaboradores no tienen"} su hora de salida
          confirmada. Mientras tanto se asume 5:00 p.m. — se confirma {dondeSeCargaLaFicha()}, en <b>{PESTANA_FICHAS}</b>.
          {/* 🔴 Y SE DICE QUIÉN, CON EL ENLACE A SU FICHA (16-sep-2026).
              Daniel: *«debería de haber un link directo para ir al problema»*.
              🩸 El aviso daba el número y nada más, así que había que ir a
              buscar a mano a cuál de las 40 personas le falta.
              ⚠️ El enlace solo existe con el acomodo nuevo; apagado, la ficha
              no tiene página propia y se nombran igual. */}
          {sinHorarioLista.length > 0 && (
            <>
              {" — "}
              {sinHorarioLista.map((x, i) => (
                <span key={x.codigo}>
                  {i > 0 && ", "}
                  {PERSONA_EN_EL_CENTRO ? (
                    <a href={rutaDePersona(x.codigo)}
                      className="font-medium underline decoration-dotted underline-offset-2 hover:text-amber-900">
                      {capitalizarNombre(etiquetaPersona(x.codigo, x.nombre))}
                    </a>
                  ) : (
                    <b>{capitalizarNombre(etiquetaPersona(x.codigo, x.nombre))}</b>
                  )}
                </span>
              ))}
            </>
          )}
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
          . Los números de abajo ya cuentan con eso. Abre al colaborador para ver qué se cambió y por qué.
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
          {fueraDelRango === 1 ? "colaborador no aparece" : "colaboradores no aparecen"} porque no
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
                <th className="px-3 py-2.5 text-left font-medium">Colaborador</th>
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
                  marcasTelefono={marcasTelefono} onVerSelfie={setVerSelfie}
                  onToggle={() => setAbierta(abierta === p.codigo ? null : p.codigo)}
                  puedeCorregir={puedeCorregir}
                  onCorregir={setCorrigiendo}
                  onJustificar={setJustificando}
                  decisionesExtra={decisionesExtra} />
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                <td className="px-3 py-2.5" colSpan={3}>{personas.length} {personas.length === 1 ? "colaborador" : "colaboradores"}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.aus || "—"}</td>
                <td className="px-2 py-2.5"></td>
                {/* 🩸 Los minutos se miden al segundo y sumarlos da 9544.499999999998:
                    el total se escribe con el MISMO formato que cada celda
                    (`fmtMin`, dos decimales). Solo cambia cómo se muestra. */}
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.tarde ? fmtMin(tot.tarde) : "—"}</td>
                <td className="px-2 py-2.5"></td><td className="px-2 py-2.5"></td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.noTrab ? fmtMin(tot.noTrab) : "—"}</td>
                <td className="px-2 py-2.5 text-right tabular-nums">{tot.extra ? fmtMin(tot.extra) : "—"}</td>
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
            tolerancia · almuerzo de {textoAlmuerzo()} · extras desde{" "}
            {/* 🔴 1-sep-2026: la extra YA NO se netea contra el atraso del día.
                Daniel, textual: *"No, van separadas"*. El mínimo es una PUERTA
                —pasada, se paga desde el primer minuto— y el atraso sigue
                descontándose por su lado, en «Tiempo no trabajado». El número
                sale de las reglas configurables; el texto NUNCA lo cablea. */}
            {reglas?.extraMinimoMin ?? EXTRA_MINIMO_MIN} min y se pagan completas: el atraso del
            día se descuenta aparte, no se les resta.{" "}
            Los minutos <b className="text-red-700">en rojo</b> son de un día en que se llegó más de{" "}
            {MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde: en la planilla esos minutos se muestran
            en la columna <b>Ausencias</b> en vez de en Tardanzas. <b>Se descuentan igual</b> — la
            columna cambia de nombre, no de precio.{" "}
            <b>&quot;A revisar&quot;</b> es un día TERMINADO sin las 4 marcas: los minutos igual
            cuentan. El día de <b>hoy</b> nunca entra ahí —sigue corriendo, así que todavía no
            se le puede decir que está mal marcado—, y el reporte muestra solo a quien estaba
            trabajando en las fechas que pediste.
            Estos números se cambian en <b>{PESTANA_FICHAS}</b>.{" "}
            {/* 🔴 11-sep-2026: esto se explica UNA vez, acá. El recuadro que lo
                repetía dentro de la ventana «Corregir la hora» se retiró. */}
            <b>Corregir una hora</b> no borra nunca lo que marcó el reloj: la corrección va encima,
            es la que cuenta para el pago, lleva quién la puso y por qué, y se puede deshacer.{" "}
            <b>Justificar</b> desde la fila del día abre el mismo permiso de la ficha del colaborador
            con ese día ya puesto.
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
      <SelfieMarcacionModal marca={verSelfie} onClose={() => setVerSelfie(null)} />
      {justificando && (
        <JustificarDiaModal
          dia={justificando}
          onCerrar={() => setJustificando(null)}
          onGuardado={() => { setRefrescoJustificaciones((n) => n + 1); void cargar(); }}
        />
      )}
    </div>
  );
}

function FilaPersona({ p, abierta, onToggle, puedeCorregir, onCorregir, onJustificar, marcasTelefono, onVerSelfie, decisionesExtra }: {
  p: PersonaReporte;
  abierta: boolean;
  onToggle: () => void;
  puedeCorregir: boolean;
  onCorregir: (m: MarcaParaCorregir) => void;
  onJustificar: (d: DiaParaJustificar) => void;
  marcasTelefono: Record<string, MarcaTelefonoUI[]>;
  onVerSelfie: (m: SelfieParaVer) => void;
  /** `codigo|fecha → si|no`. Lo que no está es PENDIENTE. */
  decisionesExtra: ReadonlyMap<string, Decision>;
}) {
  const r = p.resumen;
  // 🔴 LA COLUMNA «EXTRAS» DICE CUÁNTO ESTÁ APROBADO (16-sep-2026). Se reparte
  // el MISMO número que la columna ya sumaba, día por día, según la decisión de
  // ese día. No cambia qué se paga: solo lo que se ve.
  const extras = repartirExtras(p.codigo, p.dias, decisionesExtra);
  const persona = p.nombre
    ? capitalizarNombre(etiquetaPersona(p.codigo, p.nombre))
    : etiquetaPersona(p.codigo, p.nombre);
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
          {/* 🔴 Se ve SIN abrir nada. Sin este chip, quien trabajó todo el mes
              fuera de la oficina aparece con «0 días trabajados» y ninguna
              explicación: idéntico a alguien que simplemente no vino. */}
          {r.diasTrabajandoFuera > 0 && (
            <span className="ml-1.5 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-xs font-semibold text-gray-700">
              {r.diasTrabajandoFuera} {r.diasTrabajandoFuera === 1 ? "día" : "días"} trabajando fuera
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
        {/* 🔴 El servicio profesional NO cuenta horas extra (3-sep-2026,
            Daniel: *«es solo para ver sus tardanzas y ausencias»*): raya, no 0
            ni el número que midió el reloj. Tardanza y ausencia, intactas. */}
        {/* 🔴 LOS MINUTOS MEDIDOS ARRIBA Y LO DECIDIDO DEBAJO (16-sep-2026).
            Daniel, preguntado si tenía que decir las dos cosas: *«Si»*. 🩸 La
            celda mostraba lo que midió el reloj y se leía como plata que se va
            a pagar — la planilla paga SOLO lo aprobado. El texto sale del
            módulo puro `extras-decididas.ts`. */}
        <td className="px-2 py-2.5 text-right text-gray-700" title={cuentaHorasExtra(p) && r.extraMin > 0 ? tituloExtrasDecididas(extras) : undefined}>
          {cuentaHorasExtra(p) ? n(r.extraMin) : sinExtra()}
          {cuentaHorasExtra(p) && textoExtrasDecididas(extras) && (
            <span className="block text-[11px] font-normal text-gray-500">{textoExtrasDecididas(extras)}</span>
          )}
        </td>
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
          {/* 🔴 NADA CALLADO (16-sep-2026): el permiso baja las tres columnas y
              acá se dice cuánto bajó cada una. Sin esto, la persona aparece con
              menos minutos de los que marcó el reloj y no hay forma de saber
              por qué. El texto sale de `permiso-horas.ts`. */}
          {perdonDelPeriodo(r) && (
            <p className="mb-2 text-[13px] text-blue-900">{perdonDelPeriodo(r)}</p>
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
                    conExtra={cuentaHorasExtra(p)}
                    puedeCorregir={puedeCorregir} onCorregir={onCorregir}
                    onJustificar={onJustificar}
                    delTelefono={marcasTelefono[llaveDelDia(p.codigo, d.fecha)] ?? []}
                    onVerSelfie={onVerSelfie} />
                ))}
              </tbody>
            </table>
          </div>
        </td></tr>
      )}
    </>
  );
}

/** Lo que perdonaron los permisos de TODO el período de una persona. */
function perdonDelPeriodo(r: PersonaReporte["resumen"]): string | null {
  return textoPerdonDelPeriodo({
    tardeMin: r.minutosPerdonadosTarde,
    salidaTempranaMin: r.minutosPerdonadosSalidaTemprana,
    almuerzoMin: r.minutosPerdonadosAlmuerzo,
  });
}

/** Los tres perdones del día, tal como los pide el módulo de textos. */
function perdonDelDia(d: DiaReporte): PerdonDelDia {
  return {
    tardeMin: d.permisoPerdonaMin,
    salidaTempranaMin: d.permisoPerdonaSalidaMin,
    almuerzoMin: d.permisoPerdonaAlmuerzoMin,
  };
}

/**
 * Un día del detalle.
 *
 * 🔴 ACÁ SE VE LA CORRECCIÓN Y ACÁ SE PONE. Cada hora es tocable: al tocarla se
 * abre la ventana con la hora del RELOJ arriba (que no se puede borrar) y la
 * corrección debajo. Debajo de la fila, una línea por corrección dice qué se
 * cambió, por qué, quién y cuándo — sin abrir nada más.
 */
function FilaDia({ d, codigo, persona, conExtra, puedeCorregir, onCorregir, onJustificar, delTelefono, onVerSelfie }: {
  d: DiaReporte;
  codigo: string;
  persona: string;
  /** `false` = servicio profesional: la columna Extra va con raya. */
  conExtra: boolean;
  puedeCorregir: boolean;
  onCorregir: (m: MarcaParaCorregir) => void;
  onJustificar: (d: DiaParaJustificar) => void;
  /** Las marcas que ese día salieron del teléfono. Vacío = ninguna. */
  delTelefono: MarcaTelefonoUI[];
  onVerSelfie: (m: SelfieParaVer) => void;
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

  /** 🔴 «Justificar» se ofrece donde una justificación puede cambiar algo:
   *  no en un feriado, ni en vacaciones, ni en un día que ya está justificado
   *  (un control que no ofrece nada no se dibuja). */
  // 🔴 Ni en un día que no era suyo (15-sep-2026): no hay nada que justificar
  //    en un día anterior al ingreso o posterior a la salida.
  const seJustifica = !d.feriado && !d.vacacion && !d.justificado && !d.fueraDeVigencia;
  const justificar = () => onJustificar({ codigo, persona, fecha: d.fecha });
  const enlaceJustificar = (
    <button type="button" onClick={justificar}
      className="ml-1.5 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 transition hover:text-black">
      Justificar
    </button>
  );

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
            {/* 🔴 EL DÍA DICE SOLO CUÁNTO SE LLEGÓ TARDE, y en rojo cuando esos
                minutos van a la columna «Ausencia» de la planilla. Es el «para
                que lo veas» de Daniel: sin esto, un día de 45 minutos y uno de
                15 se ven igual acá y distinto allá. ⚠️ El minuto NO cambia de
                precio: se descuenta igual de los dos lados. */}
            <td className="px-2 py-1.5 text-right">{d.tardeMin
              ? (
                <span
                  className={`font-medium tabular-nums ${
                    d.tardeMin > MINUTOS_TARDE_QUE_SON_AUSENCIA ? "text-red-700" : "text-amber-700"
                  }`}
                  title={d.tardeMin > MINUTOS_TARDE_QUE_SON_AUSENCIA
                    ? `Más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos: en la planilla estos minutos se muestran en «Ausencias». Se descuentan igual que una tardanza.`
                    : undefined}
                >
                  {fmtMin(d.tardeMin)}
                </span>
              )
              : <span className="text-gray-300">—</span>}</td>
            <td className="px-2 py-1.5 text-right text-gray-600">{n(d.excesoAlmuerzoMin)}</td>
            <td className="px-2 py-1.5 text-right text-gray-600">{conExtra ? n(d.extraMin) : sinExtra()}</td>
            <td className="whitespace-nowrap px-2 py-1.5">
              {d.revisar && (
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800">Revisar</span>
              )}
              {/* 🔴 DOS MARCAS Y LA SEGUNDA MUY ANTES DE SU SALIDA (16-sep-2026).
                  🩸 El caso: Andrea Pérez el 1-sep marcó 08:04 y 12:07 y nada
                  más; el motor leyó las 12:07 como su salida y le contó 292
                  minutos. `marcas-impares` no lo atrapa —DOS es par— así que el
                  día pasaba sin que nadie avisara. Se ve como un «Revisar» más,
                  y NO cambia un solo minuto: la regla y el umbral (con su
                  medición) viven en `salida-sospechosa.ts`. */}
              {d.salidaSospechosa && (
                <span
                  className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800"
                  title={tituloSalidaSospechosa(d.salidaTempranaMin)}
                >
                  {TEXTO_SALIDA_SOSPECHOSA}
                </span>
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
              {/* 🔴 Marcó un día que no era suyo. No cuesta un centavo —el
                  motor lo dejó todo en cero— pero la marca está y se dice: o
                  volvió a trabajar, o alguien más usó su huella. */}
              {d.fueraDeVigencia && (
                <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                  {TEXTO_DIA_FUERA_DE_VIGENCIA}
                </span>
              )}
              {/* 🔴 EL PERMISO DE HORAS SE VE EN EL DÍA, y en AZUL: no es una
                  advertencia (ámbar) ni un problema (rojo) — es una decisión ya
                  tomada. Sin esto, la persona aparece con menos minutos tarde
                  que los que marcó el reloj y no hay forma de saber por qué. */}
              {/* 🔴 NADA CALLADO (16-sep-2026). Daniel: *«La columna muestra
                  los minutos reales y, al lado, cuánto se perdonó. Nada
                  callado.»* 🩸 Acá decía «Permiso 0 min» en el día en que
                  Andrea Pérez tenía la tarde entera cubierta: el chip solo
                  sabía contar tardanza, y los 292 minutos de salida temprana
                  que se le descontaban no aparecían por ningún lado. El texto
                  sale de `permiso-horas.ts` para que la pantalla, el título y
                  el Excel digan lo mismo. */}
              {d.permiso && (
                <span
                  className="ml-1.5 rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-900"
                  title={`${textoPermisoDelDia(d.permiso, perdonDelDia(d))}. NO justifica el día entero.`}
                >
                  {etiquetaPermisoDelDia(d.permisoRango, perdonDelDia(d))}
                </span>
              )}
              {/* Agregar la marca que falta. Es el caso más común de todos: quien
                  olvidó marcar no tiene nada que corregir. */}
              {puedeCorregir && !d.fueraDeVigencia && (
                <button type="button" onClick={agregar}
                  className="ml-1.5 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 transition hover:text-black">
                  Agregar hora
                </button>
              )}
              {/* «Justificar» desde el día (11-sep-2026): el mismo permiso de la
                  ficha, con el colaborador y ESTE día ya puestos. Nada más de
                  la fila cambia. */}
              {seJustifica && enlaceJustificar}
            </td>
          </>
        ) : (
          <td colSpan={8} className="px-2 py-1.5 text-gray-500">
            {/* 🔴 VACACIONES VA PRIMERO, antes que el feriado. Un día de
                vacaciones se lee «Vacaciones» y NUNCA «ausencia»: la persona no
                faltó, está usando un derecho. Y si está marcada como ya pagada
                se dice ahí mismo, porque es el único caso en que ese día no se
                paga y quien mira el renglón tiene que poder saberlo. */}
            {d.vacacion ? (
              <span className="text-gray-700">
                {textoDiaVacaciones(d.vacacion.yaPagadas)}
                {/* 🔑 Las marcas de ese día NO se esconden. No cuentan para
                    nada —ése es el punto de las vacaciones— pero descartar un
                    dato EN SILENCIO es lo que hace que alguien lo busque y no
                    lo encuentre. */}
                {d.vacacion.marcasIgnoradas.length > 0 && (
                  <span className="ml-1.5 text-[12px] text-gray-500">
                    — marcó {d.vacacion.marcasIgnoradas.join(" · ")} (no cuenta)
                  </span>
                )}
              </span>
            )
              : d.feriado ? <>Feriado — {d.feriado}</>
              : d.justificado ? (
                // 🔴 «Trabajando fuera de la oficina», NO «Ausencia justificada
                // — Trabajo fuera…». Quien trabajó afuera no estuvo ausente, y
                // el renglón tiene que decir eso.
                <span className={esTrabajoDeVendedor(d.justificado) ? "text-gray-700" : undefined}>
                  {textoDiaJustificado(d.justificado)}
                </span>
              )
              // 🔴 Hoy sin marcas NO es una falta: a las 8:59 nadie faltó
              // todavía. En rojo diría lo contrario, así que va en gris.
              : d.enCurso ? <span className="text-gray-500">Todavía no marcó — el día va corriendo</span>
              // 🔴 EL DÍA ANTERIOR AL INGRESO —O POSTERIOR A LA SALIDA— NO ES
              // UNA FALTA (15-sep-2026). En gris y no en rojo, por lo mismo que
              // el día en curso: la planilla ya no lo cobra, y un rojo acá
              // diría lo contrario de lo que se paga.
              : d.fueraDeVigencia ? <span className="text-gray-500">{TEXTO_DIA_FUERA_DE_VIGENCIA}</span>
              : <span className="font-medium text-red-700">Ausencia sin justificar</span>}
            {puedeCorregir && !d.feriado && !d.fueraDeVigencia && (
              <button type="button" onClick={agregar}
                className="ml-2 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 transition hover:text-black">
                Agregar marcación
              </button>
            )}
            {seJustifica && enlaceJustificar}
          </td>
        )}
      </tr>

      {/* 🔴 LO QUE DIJO EL RELOJ Y LO QUE SE CORRIGIÓ, LAS DOS COSAS. Sin esto
          la fila de arriba mostraría una hora escrita a mano como si el reloj
          la hubiera registrado. */}
      {/* 🔴 LO QUE SALIÓ DEL TELÉFONO SE DICE ACÁ, Y NUNCA CON LA PALABRA
          «llegó» (14-sep-2026). El mockup decía «Llegó a las 11:30» y Daniel
          avisó que la contadora iba a entender que llegó a TRABAJAR a esa hora:
          a las 11:30 el teléfono recién encontró señal. La hora que CUENTA ya
          está arriba, en su columna; esto es chico y gris, y dice «envió». La
          redacción vive en `textoParaLaContadora` (módulo puro), no acá. */}
      {/* 🔴 EL RELOJ CORRIDO SE DICE ACÁ, Y NO ES UNA ACUSACIÓN (14-sep-2026).
          Daniel probó el módulo con el reloj de su iPhone movido DOS HORAS y
          con señal: el sistema guardó la hora buena —la del servidor— pero esa
          diferencia quedaba guardada y no la veía nadie. La causa común es un
          teléfono mal configurado, no una trampa: se dice el hecho y nada más.
          Importa porque el día que esa persona marque SIN señal, la hora que
          entra es la de su teléfono. */}
      {/* 🔴 Y UNA MARCA DESHECHA SE VE TACHADA, NO SE ESCONDE: la fila sigue en
          la base (append-only) y dejó de contar por una corrección encima. */}
      {delTelefono.map((m) => {
        const idx = d.marcas.findIndex((h) => h.startsWith(m.hora));
        const rotulo = m.quitada ? "Marca" : rotuloDeLaMarca(idx < 0 ? 0 : idx, d.marcas.length);
        return (
          <tr key={m.id} className="border-b border-gray-100">
            <td></td>
            <td colSpan={8} className="px-2 pb-1.5 text-[12px] text-gray-500">
              <b className={`font-semibold ${m.quitada ? "text-gray-400 line-through" : "text-gray-800"}`}>
                {rotulo} {m.horaLarga}
              </b>
              {" · "}{m.detalle}
              {m.relojCorrido && (
                <span className="ml-1.5 text-amber-800">· {m.relojCorrido}</span>
              )}
              {(m.tieneFoto || m.lat !== null) && (
                <button
                  type="button"
                  onClick={() => onVerSelfie({ ...m, persona, fecha: d.fecha, rotulo })}
                  className="ml-1.5 min-h-[44px] rounded px-1 underline decoration-dotted underline-offset-2 transition hover:text-black"
                >
                  Ver la selfie y el mapa
                </button>
              )}
            </td>
          </tr>
        );
      })}

      {d.correcciones.map((c) => (
        <tr key={c.id} className="border-b border-gray-100 bg-blue-50/40">
          <td></td>
          <td colSpan={8} className="px-2 pb-1.5 text-[12px] text-blue-900">
            {c.quitada ? (
              // 🔴 «quitada», nunca «borrada»: la marcación sigue en la base.
              <>Marcación <b>quitada</b>: <b className="tabular-nums line-through">{c.hora}</b> — no cuenta</>
            ) : c.agregada ? (
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
