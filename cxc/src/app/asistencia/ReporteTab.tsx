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
import {
  TITULO_DECIDIR_EXTRA, etiquetaDecidirExtra, repartirExtras, seDecideEnElReporte,
  textoExtrasDecididas, tituloExtrasDecididas,
} from "@/lib/asistencia/extras-decididas";
// 🔴 LOS DOS BOTONES SON LOS MISMOS DE APROBACIONES, no unos nuevos: mismo
// componente, mismo endpoint, mismas reglas del servidor (19-sep-2026).
import { BotonesSiNo } from "./aprobaciones/BotonesSiNo";
import { claveDia } from "@/lib/asistencia/aprobaciones";
import { aprobacionesRoles } from "@/lib/asistencia/roles";
// 🔴 LAS MARCAS DEL DÍA SE VEN TODAS (18-sep-2026). La contadora: *«y como veo
// quien marco de mas? en el excel solo salen max 4 marcaciones»*. La cuenta de
// qué esconden las cuatro columnas vive en un módulo PURO, nunca acá.
import {
  cabenEnLasCuatroColumnas, columnasClasicas, cuantasMarcasTexto,
  indicesPegados, marcasPegadas, tituloPegada,
  marcasDelMedio,
  marcasEscondidas,
  rotuloMarcasSueltas,
  notaMarcasSueltas,} from "@/lib/asistencia/marcas-del-dia";
// 🔴 LA MARCA REPETIDA SE OLVIDÓ SOLA (18-sep-2026): el motor ya no la cuenta,
// y aquí se DICE —tachada en su día, con su porqué, y contada arriba—. El texto
// sale del módulo puro para que la pantalla y el Excel digan lo mismo.
import { avisoRepetidas, contarRepetidas, explicacionRepetida } from "@/lib/asistencia/marca-repetida";
// 🔴 ENCONTRAR RÁPIDO LOS DÍAS A REVISAR (18-sep-2026). Daniel: *«opcion a con
// mockup»* y *«si y nada más el botón de "Solo a revisar"»*. Dos cosas: el
// número es un enlace a esos días, y un botón deja solo a quien tiene algo.
// La regla de qué es «a revisar» NO vive acá: la pone el motor (`revisar`).
import {
  PARAM_DIAS_DE, PARAM_SOLO_A_REVISAR, ROTULO_SOLO_A_REVISAR, TITULO_NUMERO,
  VACIO_SIN_A_REVISAR, VALOR_PRENDIDO, VER_A_TODOS,
  conteoARevisar, diasARevisarDe, enlaceDiasARevisarDe, filtroPrendido,
  rotuloDescarga, soloConDiasARevisar, textoSoloEstosDias,
} from "@/lib/asistencia/solo-a-revisar";
import type { Decision } from "@/lib/asistencia/aprobaciones";
import EstadoReloj from "./EstadoReloj";
import JustificacionesDelPeriodo from "./JustificacionesDelPeriodo";
import { PERSONA_EN_EL_CENTRO, PESTANA_FICHAS, dondeSeCargaLaFicha, rutaDePersona } from "@/lib/asistencia/persona-en-el-centro";
import { empresaParaPedir, nombreArchivoPorEmpresa } from "@/lib/asistencia/empresa-para-todo";
import CorregirMarcacionModal, { type MarcaParaCorregir } from "./CorregirMarcacionModal";
import JustificarDiaModal, { type DiaParaJustificar } from "./JustificarDiaModal";
// 🔴 JUSTIFICAR A VARIOS DESDE EL REPORTE (19-sep-2026). El día de lluvia del
// 17-ago son 13 justificaciones cargadas una por una con la misma nota. Se
// seleccionan varias filas y se justifican de una vez, con la MISMA ruta.
import JustificarVariosModal, { type PersonaSeleccionada } from "./JustificarVariosModal";
import {
  JUSTIFICAR_A_VARIOS, QUITAR_LA_SELECCION, hayAQuienJustificar, textoDeLaSeleccion,
} from "@/lib/asistencia/justificar-a-varios";
// 🔴 Una barra que se pega se pega DEBAJO del encabezado, nunca encima: la
// única forma de hacerlo es esta clase (`lib/ui/barra-pegajosa.ts`).
import { CLASE_BARRA_PEGAJOSA } from "@/lib/ui/barra-pegajosa";
// 🔴 EL DÍA COMPLETO SE ARREGLA EN LA FILA, SIN ABRIR UNA VENTANA (19-sep-2026).
// La regla de qué se va a escribir vive en un módulo PURO; acá solo se dibuja.
import {
  EDITAR_EL_DIA, GUARDAR_EL_DIA, PORQUE, TITULO_EDITAR_EL_DIA,
  casillasDelDia, claveMarca, claveVacia, conEntradaAutorizada,
  faltaParaGuardarElDia, planDelDia, resumenDelPlan, textoGuardado,
  type CasillaDelDia, type EscritoEnCasilla,
} from "@/lib/asistencia/editar-el-dia";
import { MOTIVO_MAX } from "@/lib/asistencia/correcciones";
// 🔴 LA ENTRADA AUTORIZADA Y SU AVISO (24-sep-2026). Daniel: «hoy entraba a
// las __:__» desde «Arreglar el día», con motivo; y el aviso «llegó N min antes
// · ¿entrada autorizada?» solo desde 30 minutos. La regla vive en el módulo
// PURO; acá solo se dibuja y se manda por la misma ruta del día.
import {
  ENTRADA_AUTORIZADA, QUITAR_ENTRADA_AUTORIZADA, ROTULO_ENTRADA_AUTORIZADA,
  TITULO_AVISO_ENTRADA_TEMPRANA, cambioEntradaAutorizada, textoAvisoEntradaTemprana,
  textoEntradaAutorizada, type EscritoEntradaAutorizada,
} from "@/lib/asistencia/entrada-autorizada";
// 🔴 EL RELOJ DEL TELÉFONO EN EL REPORTE (14-sep-2026). Lo que Daniel pidió que
// viera la contadora: la selfie y el mapa, y de dónde salió cada marca. Es una
// capa de ARRIBA: el motor no sabe nada de esto y sus minutos no cambian.
import SelfieMarcacionModal, { type SelfieParaVer } from "./SelfieMarcacionModal";
import { llaveDelDia, type MarcaTelefonoUI } from "@/lib/marcacion/en-el-reporte";
import { rotuloDeLaMarca } from "@/lib/marcacion/marcacion";
// 🔴 GUARDAR UNA HORA NO BORRA LA TABLA NI SALTA ARRIBA (24-sep-2026), y la
// fila recién corregida no se va sola. Las reglas viven en el módulo PURO.
import {
  ASISTENCIA_GUARDAR_SIN_SALTO, ROTULO_ANCLADA, TEXTO_ACTUALIZANDO, TITULO_ANCLADA,
  ancladosQueSeQuedan, conAnclados,
} from "@/lib/asistencia/pestanas-vivas";
// 🔴 QUIEN NO MARCÓ EN EL PERÍODO APARECE IGUAL (24-sep-2026). La fila gris
// solo informa: la planilla no le cuenta ausencias. Ver `sin-marcas.ts`.
import {
  NOTA_SIN_MARCAS, TEXTO_DIA_SIN_MARCAS, TEXTO_SIN_MARCAS, avisoSinMarcas, esSinMarcas,
} from "@/lib/asistencia/sin-marcas";
// ── 🔴 EL REDISEÑO DEL 24-sep-2026 ────────────────────────────────────────────
// Un solo selector de período (‹ 16 – 30 sep 2026 › + 📅), una sola fila de
// mandos, los avisos plegados en una línea, la columna «Sale» retirada (el
// código a la IZQUIERDA del nombre y la salida en burbuja) y, en el celular,
// una tarjeta por colaborador. Las reglas viven en los módulos PUROS.
import {
  ASISTENCIA_PANTALLA_2026_09, PARAM_ABRE, anchoDelCodigo, columnasDelReporte, rotuloDeAvisos,
} from "@/lib/asistencia/pantalla-2026-09";
import { datosDeLaTarjeta, lineaDeDias, pieDelCelular } from "@/lib/asistencia/celular-asistencia";
import SelectorPeriodo, { usePeriodoAsistencia } from "@/components/asistencia/SelectorPeriodo";
import { aparatoDeQuienMira } from "@/lib/aparato";

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
  // 🔴 EL PERÍODO ES EL DEL MÓDULO ENTERO (24-sep-2026): la MISMA clave de la
  // dirección y la MISMA memoria que Aprobaciones, Planilla y Movimientos.
  // Apagado, todo queda exactamente como estaba (llave `asistencia_reporte`).
  const compartido = usePeriodoAsistencia();
  const viejo = useCallback((d: string, h: string) => {
    setDesdeUrl(d); setHastaUrl(h);
    try { localStorage.setItem("fg_last_asistencia_reporte", `${d}|${h}`); } catch { /* modo privado */ }
  }, [setDesdeUrl, setHastaUrl]);
  const desde = ASISTENCIA_PANTALLA_2026_09 ? compartido.desde : inicial.desde;
  const hasta = ASISTENCIA_PANTALLA_2026_09 ? compartido.hasta : inicial.hasta;
  const elegirPeriodo = ASISTENCIA_PANTALLA_2026_09 ? compartido.elegir : viejo;

  // La URL queda escrita UNA vez al montar, para que el rango sobreviva al
  // cambio de pestaña aunque nadie haya tocado el selector. Con la URL ya
  // completa no corre: lo que trae el enlace manda.
  useEffect(() => {
    // Con el rediseño esto lo escribe `usePeriodoAsistencia`, una sola vez y
    // para las cuatro pestañas.
    if (ASISTENCIA_PANTALLA_2026_09) return;
    if (urlTraePeriodo({ desde: desdeUrl, hasta: hastaUrl })) return;
    setDesdeUrl(inicial.desde); setHastaUrl(inicial.hasta);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Los cuatro atajos: Hoy · Ayer · Esta quincena · Quincena pasada. */
  const atajos = useMemo(() => atajosDePeriodo(hoy), [hoy]);
  const atajoPrendido = atajoActivo(atajos, desde, hasta);
  const [q, setQ] = useState(llegada.q);

  // ── 🔴 SOLO A REVISAR (18-sep-2026) ───────────────────────────────────────
  //
  // Los dos filtros viven en la URL con `replace`, como el período y la
  // empresa: son del MISMO nivel y el Atrás del navegador no tiene que ciclar
  // por ellos. `revisar=1` deja en la tabla solo a quien tiene algo; `diasDe=`
  // dice qué fila está abierta mostrando SOLO sus días a revisar.
  const [revisarUrl, setRevisarUrl] = useUrlState(PARAM_SOLO_A_REVISAR, "");
  const [diasDeUrl, setDiasDeUrl] = useUrlState(PARAM_DIAS_DE, "");
  const soloARevisar = filtroPrendido(revisarUrl);
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
  // ── 🔴 EL APARATO DE QUIEN MIRA (24-sep-2026) ─────────────────────────────
  // Se pregunta por el DEDO (`pointer: coarse`), como en todo el sistema, y en
  // un efecto: en el servidor no hay `matchMedia` y pintar la tabla para
  // después cambiarla sería peor que pintarla un tick tarde.
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    if (ASISTENCIA_PANTALLA_2026_09) setCelular(aparatoDeQuienMira() === "celular");
  }, []);
  // 🔴 7a — SE LLEGA DESDE LA PLANILLA CON LA PERSONA PUESTA. `?abre=<código>`
  // abre su tabla de días; el período ya viaja en `?desde=&hasta=`.
  const [abreUrl] = useUrlState(PARAM_ABRE, "");
  useEffect(() => {
    if (!ASISTENCIA_PANTALLA_2026_09) return;
    const c = String(abreUrl ?? "").trim();
    if (c) setAbierta(c);
  }, [abreUrl]);
  /** ¿El panel de arriba está desplegado? (relojes · avisos · buscador) */
  const [avisosAbiertos, setAvisosAbiertos] = useState(false);
  const [relojesAbiertos, setRelojesAbiertos] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  const [descargasAbiertas, setDescargasAbiertas] = useState(false);
  /**
   * 🔴 LA VISTA «JUSTIFICACIONES DEL PERÍODO» (10-sep-2026). Arranca CERRADA:
   * el trabajo de esta pantalla es el reporte, y las justificaciones son la
   * explicación que se va a buscar cuando algo no cuadra.
   */
  const [cargando, setCargando] = useState(false);
  // ── 🔴 GUARDAR UNA HORA NO BORRA LA TABLA (24-sep-2026) ──────────────────
  //
  // 🩸 Guardar llamaba a `cargar()`, que prende `cargando`, y la tabla estaba
  // condicionada a `!cargando`: **desaparecía varios segundos** y la página
  // pasaba de medir varias pantallas de alto a una línea, así que el teléfono
  // quedaba arriba de todo. Medido: las lecturas de esa recarga tardan
  // 2.031 ms + 1.108 ms + 996 ms. Es el «se me sale de la pantalla» de Daniel.
  //
  // Ahora la recarga de después de guardar es SILENCIOSA: la tabla se queda
  // con lo viejo hasta que llega lo nuevo, y el aviso es una pastilla FIJA
  // abajo —fuera del flujo— para que ni un píxel de la página se mueva.
  const [refrescando, setRefrescando] = useState(false);
  /** 🔴 Los códigos recién corregidos: su fila no se va aunque el filtro la saque. */
  const [anclados, setAnclados] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  // Correcciones: cuántas hay en el rango, si se pueden hacer (la migración
  // puede no haber corrido) y cuál se está tocando.
  // 🔴 `quitadas` desde el 18-sep-2026: el aviso azul tiene que contar también
  // las marcaciones QUITADAS. Sin esto, quitar una marca del reloj no dejaba
  // rastro arriba de la tabla y el total de abajo cambiaba sin decir por qué.
  const [correcciones, setCorrecciones] = useState({ correcciones: 0, dias: 0, agregadas: 0, quitadas: 0 });
  const [puedeCorregir, setPuedeCorregir] = useState(false);
  const [avisoCorreccion, setAvisoCorreccion] = useState<string | null>(null);
  const [corrigiendo, setCorrigiendo] = useState<MarcaParaCorregir | null>(null);
  // 🔴 LOS MOTIVOS MÁS USADOS SE PIDEN UNA VEZ POR PANTALLA (19-sep-2026), no
  // una por ventana: ahora el campo del porqué vive en cada fila que se edita y
  // pedirlos por fila serían 30 peticiones iguales. Sin ellos el campo libre
  // sigue sirviendo, que es lo que se guarda.
  const [motivosFrecuentes, setMotivosFrecuentes] = useState<string[]>([]);
  // 🔑 El rol sale de `sessionStorage`, igual que en `PlanillaTab` y `AppHeader`.
  // Arranca vacío: solo decide si se DIBUJAN los dos botones; el freno de verdad
  // está en la ruta, que rechaza a quien no puede aprobar y a quien manda un
  // código de otra empresa.
  const [rol, setRol] = useState("");
  useEffect(() => { setRol(sessionStorage.getItem("cxc_role") || ""); }, []);
  const puedeDecidirExtra = aprobacionesRoles().includes(rol);
  /** Las decisiones que están viajando, para apagar sus botones. */
  const [extrasEnVuelo, setExtrasEnVuelo] = useState<ReadonlySet<string>>(new Set());
  // «Justificar» desde la fila del día (11-sep-2026): el mismo formulario de la
  // ficha, con el colaborador y ese día ya puestos.
  const [justificando, setJustificando] = useState<DiaParaJustificar | null>(null);
  /** 🔴 Los colaboradores marcados para justificar a varios, por CÓDIGO. */
  const [seleccion, setSeleccion] = useState<ReadonlySet<string>>(new Set());
  const [justificandoVarios, setJustificandoVarios] = useState(false);
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

  const cargar = useCallback(async (silenciosa = false) => {
    // 🔑 Con el interruptor apagado, TODA recarga vuelve a ser la de antes.
    if (silenciosa && ASISTENCIA_GUARDAR_SIN_SALTO) setRefrescando(true);
    else setCargando(true);
    setError(null);
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
      setCorrecciones(data.correcciones ?? { correcciones: 0, dias: 0, agregadas: 0, quitadas: 0 });
      setPuedeCorregir(Boolean(data.correccionesDisponible));
      setAvisoCorreccion(data.avisoCorrecciones ?? null);
      setFueraDelRango(data.fueraDelRango ?? 0);
      setDiaEnCurso(data.diaEnCurso ?? null);
      setMarcasTelefono(data.marcasTelefono ?? {});
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setPersonas(null);
    } finally { setCargando(false); setRefrescando(false); }
  }, [desde, hasta, q, empresa]);

  useEffect(() => { void cargar(); }, [cargar]);

  // ── 🔴 DECIDIR LAS HORAS EXTRA DESDE ACÁ (19-sep-2026) ────────────────────
  //
  // Daniel: los dos botones Sí/No en la misma fila del día, sin ir a la pestaña
  // Aprobaciones —que NO se toca y sigue siendo la que ve el conjunto—.
  //
  // 🔴 AL APROBAR MANDA EL SERVIDOR. Es el MISMO endpoint, el MISMO cuerpo y el
  // MISMO `?empresa=` que usa `AprobacionesTab`: el alcance del aprobador, el
  // filtro por empresa y el «todo o nada» los sigue decidiendo la ruta. Acá no
  // se calcula nada; lo único propio es el optimismo de la pantalla.
  const decidirExtra = useCallback(
    async (codigo: string, fecha: string, minutos: number, decision: Decision) => {
      const clave = claveDia(codigo, fecha);
      let previo: Decision = null;
      setDecisionesExtra((m) => {
        previo = m.get(clave) ?? null;
        const n = new Map(m);
        if (decision === null) n.delete(clave); else n.set(clave, decision);
        return n;
      });
      setExtrasEnVuelo((v) => new Set([...v, clave]));
      try {
        // 🔴 Con empresa elegida, la ruta rechaza cualquier código de otra empresa.
        const emp = empresaParaPedir(empresa);
        const res = await fetch(
          `/api/asistencia/aprobaciones${emp ? `?empresa=${encodeURIComponent(emp)}` : ""}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ decision, dias: [{ codigo, fecha, minutos }] }),
          },
        );
        const j = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) throw new Error(j.aviso ?? "No se pudo guardar");
      } catch (e) {
        // Se revierte a lo que había y se dice: una decisión que no llegó no
        // puede quedarse pintada como si hubiera llegado.
        setDecisionesExtra((m) => {
          const n = new Map(m);
          if (previo === null) n.delete(clave); else n.set(clave, previo);
          return n;
        });
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setExtrasEnVuelo((v) => { const n = new Set(v); n.delete(clave); return n; });
      }
    },
    [empresa, toast],
  );

  // Los motivos frecuentes, una sola vez y solo cuando se puede corregir.
  useEffect(() => {
    if (!puedeCorregir || !EDITAR_EL_DIA) return;
    let vivo = true;
    void fetch("/api/asistencia/correcciones/motivos", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!vivo) return;
        const lista = Array.isArray(d?.motivos) ? d.motivos.filter((m: unknown) => typeof m === "string") : [];
        setMotivosFrecuentes(lista as string[]);
      })
      .catch(() => { /* sin botones; el campo libre sigue */ });
    return () => { vivo = false; };
  }, [puedeCorregir]);

  // 🔴 LO QUE SE VE. Con el botón prendido queda solo quien tiene días a
  // revisar — filtrando lo YA cargado, sin pedirle nada al servidor. Todo lo
  // que está debajo de los botones se calcula sobre esto: el pie, los avisos,
  // el Excel y el PDF. **O el total sigue al filtro, o no hay filtro.**
  // 🔴 LA FILA QUE SE ACABA DE CORREGIR NO DESAPARECE. 🩸 Con «Solo a revisar»
  // prendido, guardar una hora que dejaba a la persona sin días por revisar la
  // sacaba de la tabla: se corregía y la fila que se estaba mirando ya no
  // estaba. La regla del filtro no se toca —la sigue poniendo el motor—: lo
  // único que se agrega es que a lo filtrado se le devuelven los anclados, EN
  // SU LUGAR. Se van al cambiar el filtro, el período o la empresa.
  const filtradas = useMemo(
    () => (personas === null ? null : soloConDiasARevisar(personas, soloARevisar)),
    [personas, soloARevisar],
  );
  const visibles = useMemo(
    () => (filtradas === null ? null : conAnclados(filtradas, personas ?? [], anclados)),
    [filtradas, personas, anclados],
  );
  /** Los que se quedan SOLO porque se los ancló: llevan el chip «listo». */
  const seQuedanAncladas = useMemo(
    () => ancladosQueSeQuedan(filtradas, anclados),
    [filtradas, anclados],
  );
  // Cambiar lo que se mira limpia los anclajes: son de esta vuelta, no del día.
  useEffect(() => { setAnclados(new Set()); }, [soloARevisar, desde, hasta, empresa]);
  /** Se guardó el día de alguien: se lo ancla y se recarga sin borrar la tabla. */
  const guardadoElDia = useCallback((codigo: string) => {
    setAnclados((s) => (s.has(codigo) ? s : new Set([...s, codigo])));
    void cargar(true);
  }, [cargar]);
  const conteo = conteoARevisar(visibles?.length ?? 0, personas?.length ?? 0, soloARevisar);
  /** El ancho del código más largo: el nombre arranca siempre en el mismo punto. */
  const anchoCodigo = useMemo(
    () => anchoDelCodigo((visibles ?? []).map((x) => x.codigo)),
    [visibles],
  );
  /** Cuántas cajas de aviso hay abajo. Es lo que dice la línea que las pliega. */
  const cuantosAvisos =
    (sinHorario > 0 ? 1 : 0) +
    (correcciones.correcciones > 0 ? 1 : 0) +
    (visibles && contarRepetidas(visibles.flatMap((x) => x.dias)) > 0 ? 1 : 0) +
    (diaEnCurso ? 1 : 0) +
    (fueraDelRango > 0 ? 1 : 0) +
    (avisoSinMarcas((visibles ?? []).filter(esSinMarcas).length) ? 1 : 0) +
    (avisoCorreccion ? 1 : 0);

  // 🔴 LA SELECCIÓN SE DERIVA DE LO QUE SE VE. Un código marcado que dejó de
  // estar en la tabla (cambió el período, se prendió el filtro) no se justifica
  // a escondidas: desaparece de la selección y del contador.
  const seleccionados = useMemo<PersonaSeleccionada[]>(
    () => (visibles ?? [])
      .filter((p) => seleccion.has(p.codigo))
      .map((p) => ({
        codigo: p.codigo,
        etiqueta: p.nombre
          ? capitalizarNombre(etiquetaPersona(p.codigo, p.nombre))
          : etiquetaPersona(p.codigo, p.nombre),
        empresa: (p as PersonaReporte & { empresa?: string | null }).empresa ?? null,
      })),
    [visibles, seleccion],
  );
  const alternarSeleccion = useCallback((codigo: string) => {
    setSeleccion((s) => {
      const n = new Set(s);
      if (n.has(codigo)) n.delete(codigo); else n.add(codigo);
      return n;
    });
  }, []);

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
    // 🔴 BAJA LO QUE ESTÁ EN PANTALLA (18-sep-2026). Con el buscador ya era así
    // —filtra en el SERVIDOR, así que el Excel llegaba recortado—; el botón
    // «Solo a revisar» no puede portarse distinto o la pantalla diría 34 y el
    // archivo 45. Por eso el botón DICE a cuántos afecta: «Excel · 34».
    if (!visibles?.length) return;
    try {
      const { construirExcel } = await import("@/lib/asistencia/exportar");
      // 🔴 Por el camino común (`downloadWorkbook`), como todo export.
      const { downloadWorkbook } = await import("@/lib/excel-export");
      downloadWorkbook(
        construirExcel({ personas: visibles, desde, hasta, reglas: reglas ?? undefined }),
        nombreArchivoPorEmpresa("Asistencia", empresa, desde, hasta, "xlsx"),
      );
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el Excel. Intenta de nuevo.", "error");
    }
  }
  async function bajarPdf() {
    if (!visibles?.length) return;
    try {
      const { construirPdf } = await import("@/lib/asistencia/exportar");
      construirPdf({ personas: visibles, desde, hasta, reglas: reglas ?? undefined }).save(nombreArchivoPorEmpresa("Asistencia", empresa, desde, hasta, "pdf"));
      toast("PDF listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el PDF. Intenta de nuevo.", "error");
    }
  }

  // 🔴 EL TOTAL SIGUE AL FILTRO: se suma sobre `visibles`, nunca sobre la lista
  // entera. Un pie de 45 personas arriba de una tabla de 34 hace dudar de cuál
  // de los dos manda, y ninguna nota al pie arregla esa duda (`buscar-en-lista`).
  const tot = (visibles ?? []).reduce((a, p) => ({
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
      {/* ══════════════════════════════════════════════════════════════════
          🔴 EL PANEL DE ARRIBA, EN UNA SOLA FILA (24-sep-2026)
          Daniel: *«veo todo este panel que me ensucia»*. 🩸 Medido: nueve
          bloques y 1.085 px antes del primer nombre. Ahora: el selector único,
          la lupa, «Solo a revisar», compartir y un «···» con los relojes; los
          avisos, plegados en una línea.
          ══════════════════════════════════════════════════════════════════ */}
      {ASISTENCIA_PANTALLA_2026_09 ? (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <SelectorPeriodo desde={desde} hasta={hasta} hoy={hoy} onElegir={elegirPeriodo} />

            {/* El buscador vive detrás de la lupa; con algo escrito se queda
                abierto para que nadie pierda de vista por qué falta gente. */}
            <button
              type="button"
              onClick={() => setBuscadorAbierto((v) => !v)}
              aria-pressed={buscadorAbierto || !!q}
              aria-label="Buscar colaborador"
              title="Buscar colaborador"
              className={`flex h-11 w-11 items-center justify-center rounded-md border text-base transition active:scale-[0.97] ${
                buscadorAbierto || q ? "border-black text-gray-900" : "border-gray-300 text-gray-600 hover:border-black"
              }`}
            >
              <span aria-hidden>🔍</span>
            </button>
            {(buscadorAbierto || !!q) && (
              <input
                type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colaborador"
                autoFocus
                className="min-h-[44px] min-w-[160px] flex-1 rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
              />
            )}

            <button
              type="button"
              onClick={() => {
                const prender = !soloARevisar;
                setRevisarUrl(prender ? VALOR_PRENDIDO : "");
                if (!prender) setDiasDeUrl("");
              }}
              aria-pressed={soloARevisar}
              className={`min-h-[44px] rounded-md border px-3 text-sm transition active:scale-[0.97] ${
                soloARevisar
                  ? "border-black bg-black font-medium text-white"
                  : "border-gray-300 text-gray-700 hover:border-black hover:text-black"
              }`}
            >
              {ROTULO_SOLO_A_REVISAR}
            </button>

            {/* Compartir: Excel y PDF detrás de un ícono. Dicen a cuántos
                afectan, igual que antes. */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setDescargasAbiertas((v) => !v)}
                disabled={!visibles?.length}
                aria-haspopup="menu"
                aria-expanded={descargasAbiertas}
                aria-label="Bajar Excel o PDF"
                title="Bajar Excel o PDF"
                className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 text-base text-gray-600 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
              >
                <span aria-hidden>⇧</span>
              </button>
              {descargasAbiertas && (
                <div role="menu" className="absolute right-0 z-20 mt-1 w-52 rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
                  <button type="button" role="menuitem"
                    onClick={() => { setDescargasAbiertas(false); void bajarExcel(); }}
                    className="block w-full px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50">
                    {rotuloDescarga("Excel", visibles?.length ?? 0, soloARevisar)}
                  </button>
                  <button type="button" role="menuitem"
                    onClick={() => { setDescargasAbiertas(false); void bajarPdf(); }}
                    className="block w-full px-3 py-2.5 text-left text-sm text-gray-700 transition hover:bg-gray-50">
                    {rotuloDescarga("PDF", visibles?.length ?? 0, soloARevisar)}
                  </button>
                </div>
              )}
            </div>

            {/* 🔴 Los relojes, en el «···». En el celular la línea se ve
                siempre (abajo) porque es lo único que dice si los números están
                completos; acá entra al menú, que es lo que pidió Daniel. */}
            {!celular && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setRelojesAbiertos((v) => !v)}
                  aria-haspopup="menu"
                  aria-expanded={relojesAbiertos}
                  aria-label="Los relojes"
                  title="Los relojes"
                  className="flex h-11 w-11 items-center justify-center rounded-md border border-gray-300 text-base text-gray-600 transition hover:border-black hover:text-black active:scale-[0.97]"
                >
                  <span aria-hidden>···</span>
                </button>
                {/* 🔴 EL LECTOR DEL RELOJ QUEDA MONTADO, ESCONDIDO. Desarmarlo
                    al cerrar el menú se llevaría el pedido en el aire: el
                    «Traer ahora» deja un encargo que la PC recoge en un par de
                    minutos, y es ESTE componente el que se entera y refresca la
                    tabla. Se esconde, no se desarma. */}
                <div
                  hidden={!relojesAbiertos}
                  className={relojesAbiertos
                    ? "absolute right-0 z-20 mt-1 w-[22rem] max-w-[90vw] rounded-lg border border-gray-200 bg-white p-2 shadow-lg"
                    : "hidden"}
                >
                  <EstadoReloj onLlegaron={() => void cargar()} />
                </div>
              </div>
            )}

            {conteo && <span className="ml-auto text-[13px] text-gray-500">{conteo}</span>}
          </div>

          {/* En el celular, los relojes en UNA línea: si el reloj no está
              entrando, cualquier número de abajo está incompleto. */}
          {celular && <EstadoReloj resumen onLlegaron={() => void cargar()} />}
        </>
      ) : (
        <>
          <EstadoReloj onLlegaron={() => void cargar()} />

        <div className="flex flex-wrap items-end gap-3">
          <RangoFechas desde={desde} hasta={hasta} recordarComo="asistencia_reporte" onChange={elegirPeriodo} />
          <input
            type="text" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar colaborador"
            className="min-h-[44px] flex-1 min-w-[160px] rounded-lg border border-gray-200 px-3 text-base outline-none transition focus:border-black sm:text-sm"
          />
          {/* ── 🔴 EL BOTÓN «SOLO A REVISAR» (18-sep-2026) ────────────────────
              Daniel: *«si y nada más el botón de "Solo a revisar"»*. Al lado del
              buscador y con la misma forma que los atajos del período. Filtra lo
              YA cargado —no le pide nada al servidor— y se combina con el
              buscador y con el selector de empresa en vez de pelearlos.
              🔴 Al apagarlo se suelta también la fila abierta con solo sus días:
              dejarla recortada bajo un filtro apagado es mentir con la pantalla. */}
          <button
            type="button"
            onClick={() => {
              const prender = !soloARevisar;
              setRevisarUrl(prender ? VALOR_PRENDIDO : "");
              if (!prender) setDiasDeUrl("");
            }}
            aria-pressed={soloARevisar}
            // 🔑 NEGRO, COMO LOS ATAJOS DEL PERÍODO, no ámbar: el ámbar de esta
            // pantalla significa «esto hay que mirarlo» y vive en el número. Un
            // botón prendido se ve igual en todo el sistema.
            className={`min-h-[44px] rounded-md border px-3 text-sm transition active:scale-[0.97] ${
              soloARevisar
                ? "border-black bg-black font-medium text-white"
                : "border-gray-300 text-gray-700 hover:border-black hover:text-black"
            }`}
          >
            {ROTULO_SOLO_A_REVISAR}
          </button>
          <div className="flex gap-2">
            {/* 🔴 EL BOTÓN DICE A CUÁNTOS AFECTA cuando la pantalla está
                recortada: «Excel · 34». Es la única excepción que admite la regla
                de que lo que sale de la pantalla nunca se recorta. */}
            <button type="button" onClick={bajarExcel} disabled={!visibles?.length}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
              {rotuloDescarga("Excel", visibles?.length ?? 0, soloARevisar)}
            </button>
            <button type="button" onClick={bajarPdf} disabled={!visibles?.length}
              className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
              {rotuloDescarga("PDF", visibles?.length ?? 0, soloARevisar)}
            </button>
          </div>
          {/* «34 de 45 colaboradores»: que el total recortado del pie no se lea
              como el de todos. Solo con el filtro prendido. */}
          {conteo && <span className="text-[13px] text-gray-500">{conteo}</span>}
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
        </>
      )}

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

      {/* ══════════════════════════════════════════════════════════════════
          🔴 LOS AVISOS, PLEGADOS EN UNA LÍNEA (24-sep-2026)
          🩸 Eran hasta siete cajas apiladas que ocupaban más alto que las dos
          primeras filas de la tabla. Ninguno se borró: se dicen en una línea
          que los abre. El texto sale del módulo puro.
          ══════════════════════════════════════════════════════════════════ */}
      {ASISTENCIA_PANTALLA_2026_09 && rotuloDeAvisos(cuantosAvisos) && (
        <button
          type="button"
          onClick={() => setAvisosAbiertos((v) => !v)}
          aria-expanded={avisosAbiertos}
          className="flex min-h-[44px] w-full items-center justify-between rounded-md border border-gray-200 bg-gray-50 px-3 text-left text-[13px] text-gray-700 transition hover:border-gray-400"
        >
          <span>{rotuloDeAvisos(cuantosAvisos)}</span>
          <span aria-hidden className="text-gray-400">{avisosAbiertos ? "⌃" : "›"}</span>
        </button>
      )}
      <div
        hidden={ASISTENCIA_PANTALLA_2026_09 && !avisosAbiertos}
        className={ASISTENCIA_PANTALLA_2026_09 && !avisosAbiertos ? "hidden" : "space-y-4"}
      >
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
            {/* 🔴 18-sep-2026: las QUITADAS se dicen aparte. Son las que destraban
                el cierre, y el aviso tiene que nombrarlas por lo que son. */}
            {correcciones.quitadas > 0 && (
              <> — {correcciones.quitadas} {correcciones.quitadas === 1 ? "es una marcación quitada" : "son marcaciones quitadas"}</>
            )}
            . Los números de abajo ya cuentan con eso. Abre al colaborador para ver qué se cambió y por qué.
          </p>
        )}

        {/* 🔴 LA MARCA REPETIDA SE OLVIDÓ SOLA, Y SE DICE (18-sep-2026). Daniel:
            *«quiero que el sistema agarre la primera marcación y olvide la
            próxima si es en x cantidad de tiempo»* — «1 minuto». Un número que
            cambia sin explicación es peor que el error: arriba se cuenta cuántas
            y abajo, en su día, cada una va tachada con su porqué. Gris, no azul:
            nadie tocó nada a mano. */}
        {visibles && contarRepetidas(visibles.flatMap((p) => p.dias)) > 0 && (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-700">
            {avisoRepetidas(contarRepetidas(visibles.flatMap((p) => p.dias)))}
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

        {/* 🔴 QUIEN NO MARCÓ NI UN DÍA SALE IGUAL, EN GRIS (24-sep-2026). 🩸 La
            lista se armaba solo con quien tiene marcas, así que Yeisibeth Muñoz
            (306, Multifashion) no existía para la quincena 1–15 de septiembre y
            no había forma de arreglarle las horas. */}
        {avisoSinMarcas((visibles ?? []).filter(esSinMarcas).length) && (
          <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
            {avisoSinMarcas((visibles ?? []).filter(esSinMarcas).length)}
          </p>
        )}

        {/* Sin la migración corrida la pantalla NO ofrece corregir, y lo dice: un
            botón que siempre falla es peor que no tenerlo. */}
        {avisoCorreccion && (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">{avisoCorreccion}</p>
        )}
      </div>

      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {/* 🔴 FIJA, no en el flujo: una línea que aparece y desaparece arriba de
          la tabla empuja la página y mueve el lugar donde se estaba mirando. */}
      {refrescando && (
        <p className="fixed bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg">
          {TEXTO_ACTUALIZANDO}
        </p>
      )}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!cargando && !error && personas?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay marcaciones en este rango. Revisa las fechas, y arriba cómo va el reloj.
        </p>
      )}

      {/* 🔴 EL FILTRO QUE NO DEJA A NADIE SE DICE CON PALABRAS, nunca con una
          tabla en blanco — y con la salida al lado. Es otra cosa que «no hay
          marcaciones en este rango»: acá sí las hay, y están todas bien. */}
      {!cargando && !error && !!personas?.length && visibles?.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          {VACIO_SIN_A_REVISAR}.{" "}
          <button type="button" onClick={() => { setRevisarUrl(""); setDiasDeUrl(""); }}
            className="font-medium text-gray-900 underline underline-offset-2">
            {VER_A_TODOS}
          </button>
        </p>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          🔴 JUSTIFICAR A VARIOS (19-sep-2026). 🩸 El día de lluvia del
          17-ago-2026 son 13 justificaciones cargadas una por una con la misma
          nota: 13 de las 29 de toda la historia del módulo.
          La barra aparece SOLO con alguien marcado: un control permanente que
          casi nunca se usa se vuelve ruido en una pantalla que se mira a diario.
          ══════════════════════════════════════════════════════════════════ */}
      {hayAQuienJustificar(seleccionados.length) && (
        <div className={`flex flex-wrap items-center gap-3 rounded-md border border-gray-300 bg-gray-50 px-3 py-2 ${CLASE_BARRA_PEGAJOSA}`}>
          <span className="text-[13px] font-medium text-gray-900">
            {textoDeLaSeleccion(seleccionados.length)}
          </span>
          <button type="button" onClick={() => setJustificandoVarios(true)}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97]">
            {JUSTIFICAR_A_VARIOS}
          </button>
          <button type="button" onClick={() => setSeleccion(new Set())}
            className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]">
            {QUITAR_LA_SELECCION}
          </button>
        </div>
      )}

      {!cargando && !error && !!visibles?.length && (
        /* 🔴 EN EL CELULAR NADA SE DESLIZA DE LADO (24-sep-2026): la tabla mide
           888 px dentro de una ventana de 356. Sigue siendo la MISMA tabla —el
           detalle de días de adentro no cambia—, pero la fila de la persona se
           dibuja como una tarjeta que ocupa el ancho entero. */
        <div className={celular ? "rounded-lg border border-gray-200 bg-white" : "overflow-x-auto rounded-lg border border-gray-200 bg-white"}>
          <table className="w-full text-sm">
            <thead className={celular ? "hidden" : undefined}>
              <tr className="border-b border-gray-200 text-[10.5px] uppercase tracking-wide text-gray-400">
                <th className="px-3 py-2.5 text-left font-medium">Colaborador</th>
                {/* 🔴 LA COLUMNA «SALE» SE RETIRÓ (24-sep-2026). Daniel: *«pone
                    salida como en una burbuja al lado del nombre, y el código a
                    la izquierda del nombre»*. Once columnas pasan a diez. */}
                {!ASISTENCIA_PANTALLA_2026_09 && <th className="px-2 py-2.5 text-center font-medium">Sale</th>}
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
              {visibles.map((p) => (
                <FilaPersona key={p.codigo} p={p}
                  celular={celular}
                  anchoCodigo={anchoCodigo}
                  // 🔴 Una fila abierta por «Ver solo esos días» está abierta
                  // igual: es la MISMA fila desplegada, con menos días adentro.
                  abierta={abierta === p.codigo || diasDeUrl === p.codigo}
                  soloDiasARevisar={diasDeUrl === p.codigo}
                  rango={{ desde, hasta }}
                  onVerDiasARevisar={() => { setDiasDeUrl(p.codigo); setAbierta(null); }}
                  marcasTelefono={marcasTelefono} onVerSelfie={setVerSelfie}
                  // 🔴 Tocar la fila abierta en «solo esos días» la abre ENTERA:
                  // es la salida, y no hace falta un control nuevo para tenerla.
                  onToggle={() => {
                    if (diasDeUrl === p.codigo) { setDiasDeUrl(""); setAbierta(p.codigo); return; }
                    setAbierta(abierta === p.codigo ? null : p.codigo);
                  }}
                  puedeCorregir={puedeCorregir}
                  onCorregir={setCorrigiendo}
                  onJustificar={setJustificando}
                  motivosFrecuentes={motivosFrecuentes}
                  onGuardadoElDia={() => guardadoElDia(p.codigo)}
                  anclada={seQuedanAncladas.has(p.codigo)}
                  seleccionada={seleccion.has(p.codigo)}
                  onSeleccionar={alternarSeleccion}
                  puedeDecidirExtra={puedeDecidirExtra}
                  onDecidirExtra={decidirExtra}
                  extrasEnVuelo={extrasEnVuelo}
                  decisionesExtra={decisionesExtra} />
              ))}
            </tbody>
            <tfoot>
              {/* 🔴 EL PIE DEL CELULAR DICE LO MISMO EN UNA LÍNEA: «8
                  colaboradores · 11 ausencias · 34.17 min tarde». Los mismos
                  números del pie de la tabla, sin una columna que se deslice. */}
              {celular ? (
                <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                  <td className="px-3 py-2.5 text-[13px]" colSpan={columnasDelReporte()}>
                    {pieDelCelular({ colaboradores: visibles.length, ausencias: tot.aus, minutosTarde: tot.tarde })}
                  </td>
                </tr>
              ) : (
              <tr className="border-t border-gray-200 bg-gray-50 font-semibold">
                <td className="px-3 py-2.5" colSpan={ASISTENCIA_PANTALLA_2026_09 ? 2 : 3}>{visibles.length} {visibles.length === 1 ? "colaborador" : "colaboradores"}</td>
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
              )}
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
            {/* 🔴 18-sep-2026: se dice que son EXACTAMENTE 4. Daniel: *«las
                quincena solo cierran con 4, hay q quitar hasta que llegue a 4
                maximo. cuando hay 5 o mas es porq es error»*. «Sin las 4» se
                podía leer como «le faltan»; también entra el que tiene de más. */}
            <b>&quot;A revisar&quot;</b> es un día TERMINADO que no tiene EXACTAMENTE 4 marcas
            —le falta alguna, o marcó de más—: los minutos igual
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
      {justificandoVarios && (
        <JustificarVariosModal
          personas={seleccionados}
          // 🔴 ABRE EN EL PRIMER DÍA DEL PERÍODO QUE SE ESTÁ MIRANDO, no en el
          // período entero: con los atajos «Hoy» y «Ayer» es exactamente el día
          // que se quiere justificar, y con un rango largo se ve y se cambia.
          // Justificar el período completo por defecto sería regalar quincenas.
          desdeInicial={desde}
          hastaInicial={desde}
          onCerrar={() => setJustificandoVarios(false)}
          onGuardado={() => {
            setSeleccion(new Set());
            setRefrescoJustificaciones((n) => n + 1);
            void cargar();
          }}
        />
      )}
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

function FilaPersona({ p, abierta, soloDiasARevisar, rango, onVerDiasARevisar, onToggle, puedeCorregir, onCorregir, onJustificar, marcasTelefono, onVerSelfie, decisionesExtra, motivosFrecuentes, onGuardadoElDia, anclada, puedeDecidirExtra, onDecidirExtra, extrasEnVuelo, seleccionada, onSeleccionar, celular = false, anchoCodigo = 3 }: {
  p: PersonaReporte;
  abierta: boolean;
  /** 🔴 En el celular la fila es una TARJETA de ancho completo, no once columnas. */
  celular?: boolean;
  /** Cuántos dígitos mide el código más largo: el nombre arranca siempre igual. */
  anchoCodigo?: number;
  /** Abierta por «Ver solo esos días»: adentro van SOLO los días a revisar. */
  soloDiasARevisar: boolean;
  /** El período que se está mirando, para que el enlace lo lleve puesto. */
  rango: { desde: string; hasta: string };
  onVerDiasARevisar: () => void;
  onToggle: () => void;
  puedeCorregir: boolean;
  onCorregir: (m: MarcaParaCorregir) => void;
  onJustificar: (d: DiaParaJustificar) => void;
  marcasTelefono: Record<string, MarcaTelefonoUI[]>;
  onVerSelfie: (m: SelfieParaVer) => void;
  /** `codigo|fecha → si|no`. Lo que no está es PENDIENTE. */
  decisionesExtra: ReadonlyMap<string, Decision>;
  /** Los motivos más escritos en 90 días, para los botones del porqué. */
  motivosFrecuentes: readonly string[];
  /** Se guardó un día: hay que volver a leer el reporte. */
  onGuardadoElDia: () => void;
  /** 🔴 Está en la tabla SOLO porque se la acaba de corregir. Lleva «listo». */
  anclada: boolean;
  /** ¿Este rol puede decidir las horas extra? El freno de verdad es del servidor. */
  puedeDecidirExtra: boolean;
  onDecidirExtra: (codigo: string, fecha: string, minutos: number, decision: Decision) => void;
  /** Las decisiones que están viajando, por `codigo|fecha`. */
  extrasEnVuelo: ReadonlySet<string>;
  /** ¿Está marcada para «Justificar a varios»? */
  seleccionada: boolean;
  onSeleccionar: (codigo: string) => void;
}) {
  const r = p.resumen;
  // 🔴 LA COLUMNA «EXTRAS» DICE CUÁNTO ESTÁ APROBADO (16-sep-2026). Se reparte
  // el MISMO número que la columna ya sumaba, día por día, según la decisión de
  // ese día. No cambia qué se paga: solo lo que se ve.
  const extras = repartirExtras(p.codigo, p.dias, decisionesExtra);
  const persona = p.nombre
    ? capitalizarNombre(etiquetaPersona(p.codigo, p.nombre))
    : etiquetaPersona(p.codigo, p.nombre);
  /** El detalle de días. EL MISMO en la tabla y en la tarjeta del celular. */
  const detalleDeLosDias = (
        <tr><td colSpan={columnasDelReporte()} className="bg-gray-50 px-3 py-3">
          {/* 🔴 LA FILA GRIS SOLO INFORMA. Medido en `armarPlanilla`: a quien no
              marcó nada se le da `HORAS_CERO`, o sea que la planilla NO le
              cuenta ausencias. La pantalla no puede decir otra cosa que el pago. */}
          {esSinMarcas(p) && (
            <p className="mb-2 text-[13px] text-gray-600">{NOTA_SIN_MARCAS}</p>
          )}
          {/* 🔴 SE DICE QUE ESTÁ RECORTADO, Y CÓMO SE SUELTA (18-sep-2026). Un
              detalle con 3 de 11 días y sin una línea que lo diga se lee como
              si la persona hubiera trabajado tres días. El texto sale del
              módulo puro; la salida es tocar la fila, que ya existía. */}
          {textoSoloEstosDias(diasARevisarDe(p.dias, soloDiasARevisar).length, p.dias.length) && soloDiasARevisar && (
            <p className="mb-2 text-[13px] text-gray-600">
              {textoSoloEstosDias(diasARevisarDe(p.dias, true).length, p.dias.length)}
            </p>
          )}
          {/* De los minutos tarde, cuántos vienen de días mal marcados. Que
              nadie descuente sin saber de dónde sale el número. */}
          {r.minutosTardeDeDiasARevisar > 0 && (
            <p className="mb-2 text-[13px] text-amber-800">
              De los <b>{fmtMin(r.minutosTarde)}</b> minutos tarde, <b>{fmtMin(r.minutosTardeDeDiasARevisar)}</b> vienen
              de días que no tienen exactamente 4 marcas. Míralos antes de descontar.
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
                {diasARevisarDe(p.dias, soloDiasARevisar).map((d) => (
                  <FilaDia key={d.fecha} d={d} codigo={p.codigo} persona={persona}
                    empresa={(p as PersonaReporte & { empresa?: string | null }).empresa ?? null}
                    conExtra={cuentaHorasExtra(p)}
                    sinMarcas={esSinMarcas(p)}
                    puedeCorregir={puedeCorregir} onCorregir={onCorregir}
                    onJustificar={onJustificar}
                    motivosFrecuentes={motivosFrecuentes}
                    onGuardadoElDia={onGuardadoElDia}
                    decisionExtra={decisionesExtra.get(claveDia(p.codigo, d.fecha)) ?? null}
                    puedeDecidirExtra={puedeDecidirExtra}
                    onDecidirExtra={onDecidirExtra}
                    extraEnVuelo={extrasEnVuelo.has(claveDia(p.codigo, d.fecha))}
                    delTelefono={marcasTelefono[llaveDelDia(p.codigo, d.fecha)] ?? []}
                    onVerSelfie={onVerSelfie} />
                ))}
              </tbody>
            </table>
          </div>
        </td></tr>
  );
  // 🔴 EL CÓDIGO A LA IZQUIERDA, alineado entre sí (24-sep-2026). Los códigos
  // van de uno a tres dígitos (2 · 3 · 301…), así que se reserva el ancho del
  // más largo y el nombre arranca siempre en el mismo punto.
  const codigoIzquierda = ASISTENCIA_PANTALLA_2026_09 && !!p.nombre ? (
    <span
      className="mr-2 inline-block text-right align-middle text-xs tabular-nums text-gray-400"
      style={{ minWidth: `${anchoCodigo}ch` }}
    >
      {p.codigo}
    </span>
  ) : null;
  /** La burbuja gris con la hora a la que sale. Solo si la ficha la tiene. */
  const burbujaSalida = ASISTENCIA_PANTALLA_2026_09 && p.salida ? (
    <span
      title="Hora de salida de su ficha"
      className="ml-1.5 whitespace-nowrap rounded-full bg-gray-100 px-1.5 py-0.5 text-[11px] tabular-nums text-gray-600"
    >
      {p.salida}
    </span>
  ) : null;

  // ── 🔴 EN EL CELULAR, UNA TARJETA POR COLABORADOR (24-sep-2026) ───────────
  //
  // Es la MISMA fila: el mismo `onToggle`, la misma selección, y adentro el
  // MISMO detalle de días. Lo único que cambia es que ocupa el ancho entero en
  // vez de once columnas de 888 px.
  if (celular) {
    const datos = datosDeLaTarjeta(
      {
        ausenciasSinJustificar: r.ausenciasSinJustificar,
        vecesTarde: r.vecesTarde,
        minutosTarde: r.minutosTarde,
        extraMin: r.extraMin,
        diasARevisar: r.diasARevisar,
      },
      { cuentaHorasExtra: cuentaHorasExtra(p) },
    );
    const TONO: Record<string, string> = {
      rojo: "text-red-700 font-semibold",
      ambar: "text-amber-700",
      gris: "text-gray-600",
      verde: "text-emerald-700",
    };
    return (
      <>
        <tr onClick={onToggle}
          className={`cursor-pointer border-b border-gray-100 transition active:bg-gray-50${
            esSinMarcas(p) ? " bg-gray-50/70" : ""
          }`}>
          <td className="px-3 py-3" colSpan={columnasDelReporte()}>
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={seleccionada}
                onClick={(e) => e.stopPropagation()}
                onChange={(e) => { e.stopPropagation(); onSeleccionar(p.codigo); }}
                aria-label={`Seleccionar ${persona}`}
                className="mt-1 h-5 w-5 shrink-0 cursor-pointer accent-black"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-medium text-gray-900">
                  {persona}
                  {p.nombre
                    ? <span className="ml-1.5 text-xs font-normal text-gray-400">{p.codigo}</span>
                    : <span className="ml-1.5 text-xs text-amber-700">falta configurar</span>}
                  {anclada && (
                    <span title={TITULO_ANCLADA} className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
                      {ROTULO_ANCLADA}
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  {lineaDeDias(r.diasTrabajados, p.salida)}
                  {esSinMarcas(p) && <> · {TEXTO_SIN_MARCAS}</>}
                </p>
                <p className="mt-0.5 text-[13px]">
                  {datos.map((d, i) => (
                    <span key={d.clave}>
                      {i > 0 && <span className="text-gray-300"> · </span>}
                      <span className={TONO[d.tono]}>{d.texto}</span>
                    </span>
                  ))}
                </p>
              </div>
              <span aria-hidden className="mt-1 shrink-0 text-gray-300">{abierta ? "⌃" : "›"}</span>
            </div>
          </td>
        </tr>
        {abierta && detalleDeLosDias}
      </>
    );
  }

  return (
    <>
      {/* 🔴 La fila de quien no marcó va en GRIS: se ve que no es una fila con
          números, sin sacarla de la lista ni del papel. */}
      <tr onClick={onToggle}
        className={`cursor-pointer border-b border-gray-100 transition hover:bg-gray-50${
          esSinMarcas(p) ? " bg-gray-50/70 text-gray-500" : ""
        }`}>
        {/* El NOMBRE manda; el código va chico al lado, y solo si aporta algo.
            Sin nombre configurado se muestra el código —nunca un blanco— y se
            dice qué falta, porque un número suelto no se le reclama a nadie. */}
        <td className="px-3 py-2.5 text-gray-900">
          {/* 🔴 LA CASILLA VA DENTRO DE «Colaborador», no en una columna nueva:
              la tabla tiene once y agregar una doceava la aprieta en el iPad.
              `stopPropagation` porque tocar la fila la despliega — marcar y
              abrir son dos cosas distintas. */}
          <input
            type="checkbox"
            checked={seleccionada}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => { e.stopPropagation(); onSeleccionar(p.codigo); }}
            aria-label={`Seleccionar ${persona}`}
            className="mr-2 h-4 w-4 cursor-pointer align-middle accent-black"
          />
          {/* 🔴 El código va DELANTE del nombre (24-sep-2026) y la hora de
              salida, en burbuja: así el nombre arranca siempre en el mismo
              punto y la columna «Sale» deja de existir. */}
          {codigoIzquierda}
          {persona}
          {burbujaSalida}
          {!ASISTENCIA_PANTALLA_2026_09 && (p.nombre ? (
            <span className="ml-1.5 text-xs text-gray-400">{p.codigo}</span>
          ) : (
            <span className="ml-1.5 text-xs text-amber-700">falta configurar</span>
          ))}
          {ASISTENCIA_PANTALLA_2026_09 && !p.nombre && (
            <span className="ml-1.5 text-xs text-amber-700">falta configurar</span>
          )}
          {/* 🔴 Dice por qué esta fila está vacía: no marcó. Sin esto se lee
              igual que alguien que trabajó y no tiene nada anotado. */}
          {esSinMarcas(p) && (
            <span className="ml-1.5 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              {TEXTO_SIN_MARCAS}
            </span>
          )}
          {/* 🔴 Dice por qué esta fila sigue acá con el filtro prendido. */}
          {anclada && (
            <span title={TITULO_ANCLADA}
              className="ml-1.5 whitespace-nowrap rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-600">
              {ROTULO_ANCLADA}
            </span>
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
        {!ASISTENCIA_PANTALLA_2026_09 && (
          <td className="px-2 py-2.5 text-center tabular-nums text-gray-500">{p.salida}</td>
        )}
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
        {/* 🔴 EL NÚMERO LLEVA AL DÍA (18-sep-2026). Daniel: *«opcion a con
            mockup»*. 🩸 Era un número MUERTO: decía cuántos días había que
            revisar y para saber CUÁLES había que abrir a la persona y recorrer
            los once días del período, en 34 fichas.
            🔴 CON 0 DÍAS NO HAY ENLACE: va el guion de siempre. Un enlace que
            abre una lista vacía es peor que no tenerlo.
            ⚠️ Es un `<a>` de verdad —se puede copiar y abrir en otra pestaña—,
            y el clic normal lo resuelve en el acto, sin recargar la pantalla. */}
        <td className="px-2 py-2.5 text-right">{r.diasARevisar
          ? (
            <a
              href={enlaceDiasARevisarDe(p.codigo, rango)}
              title={TITULO_NUMERO}
              onClick={(e) => {
                // Con Cmd/Ctrl/medio se deja pasar: abrir en otra pestaña es
                // una forma legítima de usar el enlace.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                e.stopPropagation();
                onVerDiasARevisar();
              }}
              className="rounded bg-amber-50 px-1.5 py-0.5 text-xs font-semibold text-amber-700 underline decoration-dotted underline-offset-2 transition hover:bg-amber-100 hover:text-amber-900"
            >
              {r.diasARevisar}
            </a>
          )
          : <span className="text-gray-300">—</span>}</td>
      </tr>

      {abierta && detalleDeLosDias}
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
function FilaDia({ d, codigo, persona, empresa, conExtra, sinMarcas, puedeCorregir, onCorregir, onJustificar, delTelefono, onVerSelfie, motivosFrecuentes, onGuardadoElDia, decisionExtra, puedeDecidirExtra, onDecidirExtra, extraEnVuelo }: {
  d: DiaReporte;
  codigo: string;
  persona: string;
  /** La empresa de la ficha (la ruta la pega a cada persona): decide qué motivos ofrece «Justificar». */
  empresa: string | null;
  /** `false` = servicio profesional: la columna Extra va con raya. */
  conExtra: boolean;
  /** 🔴 Esta persona no marcó NI UNA VEZ en el período: su día no es ausencia. */
  sinMarcas: boolean;
  puedeCorregir: boolean;
  onCorregir: (m: MarcaParaCorregir) => void;
  onJustificar: (d: DiaParaJustificar) => void;
  /** Las marcas que ese día salieron del teléfono. Vacío = ninguna. */
  delTelefono: MarcaTelefonoUI[];
  onVerSelfie: (m: SelfieParaVer) => void;
  /** Los motivos más escritos en 90 días, para los botones del porqué. */
  motivosFrecuentes: readonly string[];
  /** Se guardó este día: el reporte se vuelve a leer. */
  onGuardadoElDia: () => void;
  /** Lo decidido para la hora extra de ESTE día. `null` = pendiente. */
  decisionExtra: Decision;
  puedeDecidirExtra: boolean;
  onDecidirExtra: (codigo: string, fecha: string, minutos: number, decision: Decision) => void;
  /** Esa decisión está viajando: los botones se apagan hasta que conteste. */
  extraEnVuelo: boolean;
}) {
  const { toast } = useToast();
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

  // ══════════════════════════════════════════════════════════════════════════
  // 🔴 EL DÍA COMPLETO SE ARREGLA ACÁ, SIN ABRIR UNA VENTANA (19-sep-2026)
  // ══════════════════════════════════════════════════════════════════════════
  //
  // 🩸 Antes: una ventana por cada marca, y para cambiar una hora ya corregida
  // había que deshacer primero y volver a escribir el motivo. Medido: 58 de 141
  // días necesitaron 2, 3 y hasta 7 ventanas, y 44 de las 58 correcciones
  // anuladas fueron seguidas de otra del mismo día en menos de 10 minutos.
  //
  // Ahora se toca una hora (o un hueco), la celda se vuelve escribible ahí
  // mismo, se arreglan las cuatro a la vez, y abajo va UN porqué y UN botón.
  //
  // 🔴 Lo que se escribe lo decide `planDelDia` (módulo PURO): una casilla que
  // nadie tocó no produce nada, y una hora igual a la que ya valía, tampoco.
  const [editando, setEditando] = useState(false);
  const [escrito, setEscrito] = useState<Map<string, EscritoEnCasilla>>(new Map());
  const [motivoDia, setMotivoDia] = useState("");
  const [guardandoDia, setGuardandoDia] = useState(false);
  // 🔴 Lo tecleado en «Hoy entraba a las» (24-sep-2026). `null` = no se tocó.
  const [escritoEntrada, setEscritoEntrada] = useState<EscritoEntradaAutorizada | null>(null);
  const casillas = useMemo(() => casillasDelDia(d), [d]);
  const porClave = useMemo(
    () => new Map(casillas.map((c) => [c.clave, c])),
    [casillas],
  );
  const entradaActual = d.entradaAutorizada ?? null;
  const plan = useMemo(
    () => conEntradaAutorizada(
      planDelDia(casillas, escrito),
      cambioEntradaAutorizada(entradaActual, escritoEntrada),
    ),
    [casillas, escrito, entradaActual, escritoEntrada],
  );
  const faltaDia = faltaParaGuardarElDia(plan, motivoDia);
  /** Editar es lo mismo que corregir: mismos roles, misma migración. */
  const seEdita = EDITAR_EL_DIA && puedeCorregir && !d.fueraDeVigencia;

  function abrirEditor() {
    if (!seEdita) return;
    setEscrito(new Map());
    setEscritoEntrada(null);
    setMotivoDia("");
    setEditando(true);
  }
  function cerrarEditor() {
    setEditando(false);
    setEscrito(new Map());
    setEscritoEntrada(null);
    setMotivoDia("");
  }
  function escribir(clave: string, cambio: EscritoEnCasilla) {
    setEscrito((m) => {
      const n = new Map(m);
      n.set(clave, cambio);
      return n;
    });
  }
  function loEscrito(clave: string): EscritoEnCasilla {
    const e = escrito.get(clave);
    if (e) return e;
    return { hora: porClave.get(clave)?.hora ?? "", quitar: false };
  }

  async function guardarElDia() {
    if (faltaDia) return;
    setGuardandoDia(true);
    try {
      const res = await fetch("/api/asistencia/correcciones/dia", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          codigo,
          fecha: d.fecha,
          motivo: motivoDia,
          cambios: plan.cambios,
          // 🔴 La entrada autorizada viaja en el MISMO golpe (24-sep-2026).
          ...(plan.entradaAutorizada
            ? {
                entradaAutorizada: plan.entradaAutorizada.tipo === "poner"
                  ? { hora: plan.entradaAutorizada.hora }
                  : { quitar: true },
              }
            : {}),
        }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
      // El aviso sale del módulo puro: dice cuántas horas se tocaron y cómo.
      toast(textoGuardado(plan), "success");
      cerrarEditor();
      onGuardadoElDia();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo guardar. Intenta de nuevo.", "error");
    } finally {
      setGuardandoDia(false);
    }
  }

  /**
   * Deshacer una corrección ya guardada. Es el MISMO `DELETE` de siempre: la
   * corrección se ANULA con firma y la fila queda; vuelve a valer lo que dijo
   * el reloj.
   */
  const [deshaciendo, setDeshaciendo] = useState<string | null>(null);
  async function deshacerCorreccion(id: string) {
    setDeshaciendo(id);
    try {
      const res = await fetch(`/api/asistencia/correcciones?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "No se pudo deshacer");
      toast("Listo, se deshizo. Vuelve a valer la hora del reloj.", "success");
      onGuardadoElDia();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo deshacer.", "error");
    } finally {
      setDeshaciendo(null);
    }
  }
  /** 🔴 Deshacer una ENTRADA AUTORIZADA (24-sep-2026): se anula con firma por
   *  la misma puerta; la extra de entrada de ese día vuelve a cero. */
  async function deshacerEntradaAutorizada(id: string) {
    setDeshaciendo(id);
    try {
      const res = await fetch(`/api/asistencia/correcciones?entrada=${encodeURIComponent(id)}`, { method: "DELETE" });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error ?? "No se pudo quitar");
      toast("Listo, se quitó la entrada autorizada. Ese día vuelve a medirse como siempre.", "success");
      onGuardadoElDia();
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo quitar.", "error");
    } finally {
      setDeshaciendo(null);
    }
  }

  /** 🔴 «Justificar» se ofrece donde una justificación puede cambiar algo:
   *  no en un feriado, ni en vacaciones, ni en un día que ya está justificado
   *  (un control que no ofrece nada no se dibuja). */
  // 🔴 Ni en un día que no era suyo (15-sep-2026): no hay nada que justificar
  //    en un día anterior al ingreso o posterior a la salida.
  const seJustifica = !d.feriado && !d.vacacion && !d.justificado && !d.fueraDeVigencia;
  // 🔴 2d — UN DÍA QUE TODAVÍA NO LLEGÓ NO OFRECE NADA QUE ARREGLAR. Es
  // ESTRICTAMENTE futuro: hoy sí se puede arreglar, que para eso está.
  const diaFuturo = ASISTENCIA_PANTALLA_2026_09 && d.enCurso && d.fecha > hoyPanama();
  /** Las acciones del día: se ven al pasar el mouse y con el foco del teclado. */
  const alPasarElMouse = ASISTENCIA_PANTALLA_2026_09
    ? "opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100"
    : "";
  const justificar = () => onJustificar({ codigo, persona, empresa, fecha: d.fecha });
  const enlaceJustificar = diaFuturo ? null : (
    <button type="button" onClick={justificar}
      className={`ml-1.5 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-black ${alPasarElMouse}`}>
      Justificar
    </button>
  );

  /**
   * 🔴 LAS MARCAS PEGADAS SE SEÑALAN (18-sep-2026). Dos marcas a segundos una
   * de otra son el caso real de «marcó de más»: 14:23:38 y 14:23:39. Se pinta
   * en ámbar y se dice al pasar el cursor; NO cambia un minuto y no decide cuál
   * sobra — eso lo decide quien mira, y la quita a mano.
   */
  const pegados = indicesPegados(d.marcas);
  const segundosPegada = (idx: number) =>
    marcasPegadas(d.marcas).find((p) => p.idx === idx)?.segundos ?? 0;

  /** El texto de una hora, con su color: corregida (azul) o pegada (ámbar). */
  function textoHora(idx: number, tenue?: boolean) {
    const c = correccionDe(idx);
    const pegada = pegados.has(idx);
    const base = `tabular-nums ${tenue ? "text-gray-500" : ""}`;
    const color = c
      ? "font-semibold text-blue-700"
      : pegada
        ? "font-semibold text-amber-800"
        : "";
    return {
      clase: `${base} ${color}`,
      titulo: pegada ? tituloPegada(segundosPegada(idx)) : undefined,
      corregida: Boolean(c),
    };
  }

  /** Una hora tocable. Tocarla abre el editor del día (o la ventana de antes). */
  function HoraBoton({ idx, tenue }: { idx: number; tenue?: boolean }) {
    const { clase, titulo, corregida } = textoHora(idx, tenue);
    if (!puedeCorregir) {
      return <span className={clase} title={titulo}>{d.marcas[idx]}</span>;
    }
    return (
      <button
        type="button"
        onClick={() => (seEdita ? abrirEditor() : abrir(idx))}
        // 🔴 El título DICE que también se puede quitar: hasta el 18-sep-2026
        // decía solo «Corregir esta hora» y quitar no existía por esta puerta.
        title={titulo ?? (seEdita ? TITULO_EDITAR_EL_DIA : "Corregir o quitar esta marcación")}
        className={`min-h-[44px] rounded px-1 ${clase} ${corregida ? "underline decoration-blue-300 underline-offset-2" : "underline decoration-dotted decoration-gray-300 underline-offset-2 hover:decoration-black"}`}
      >
        {d.marcas[idx]}
      </button>
    );
  }

  /**
   * 🔴 UNA CELDA ESCRIBIBLE. Se dibuja con una FUNCIÓN, no con un componente
   * anidado: un componente definido adentro cambia de identidad en cada render
   * y React desmontaría el `<input>` a cada tecla — el foco se perdería y
   * escribir una hora sería imposible.
   *
   * @param clave    la casilla (`m<i>` una marca, `v<c>` un hueco)
   * @param casilla  lo que hay hoy ahí. `null` = hueco.
   */
  function campoEscribible(clave: string, casilla: CasillaDelDia | null, tenue: boolean) {
    const e = loEscrito(clave);
    const quitada = e.quitar === true;
    return (
      <>
        <input
          type="time"
          step="1"
          // 🔴 Al quitar no vale ninguna hora: el campo se apaga en vez de
          // mostrar una que ya no cuenta.
          value={quitada ? "" : e.hora}
          disabled={quitada || guardandoDia}
          aria-label={`Hora ${clave}`}
          onChange={(ev) => escribir(clave, { hora: ev.target.value, quitar: false })}
          className={`min-h-[44px] w-full min-w-[6.5rem] rounded-md border px-1.5 text-[13px] tabular-nums outline-none transition focus:border-black disabled:bg-gray-100 disabled:text-gray-400 ${
            tenue ? "border-gray-200 text-gray-600" : "border-gray-300 text-gray-900"
          }`}
        />
        {/* 🔴 QUITAR SOLO SE OFRECE SOBRE UNA MARCA DEL RELOJ. Una agregada a
            mano no se quita: se deshace la corrección que la creó, abajo. */}
        {casilla?.marcacionId && (
          <button
            type="button"
            onClick={() => escribir(clave, { hora: quitada ? casilla.hora : "", quitar: !quitada })}
            aria-pressed={quitada}
            disabled={guardandoDia}
            className={`mt-1 block w-full rounded px-1 text-[11px] transition ${
              quitada ? "bg-amber-100 font-semibold text-amber-900" : "text-gray-400 hover:text-black"
            }`}
          >
            {quitada ? "Se quita ✕" : "Quitar"}
          </button>
        )}
      </>
    );
  }

  /** El campo escribible, ya dentro de su celda de la tabla. */
  function celdaEscribible(clave: string, casilla: CasillaDelDia | null, tenue: boolean) {
    return (
      <td className="px-1 py-1.5 align-top">
        {campoEscribible(clave, casilla, tenue)}
      </td>
    );
  }

  /** Una celda de hora de las CUATRO columnas de siempre. */
  function Hora({ idx, col }: { idx: number | null; col: number }) {
    if (editando) {
      const clave = idx === null ? claveVacia(col) : claveMarca(idx);
      return celdaEscribible(clave, idx === null ? null : (porClave.get(clave) ?? null), col === 1 || col === 2);
    }
    if (idx === null) {
      // 🔴 EL HUECO TAMBIÉN SE TOCA: la marca que falta es el caso más común, y
      // antes había que buscar el enlace «Agregar hora» al final de la fila.
      if (!seEdita) return <td className="px-2 py-1.5 text-right tabular-nums text-gray-400">—</td>;
      return (
        <td className="px-2 py-1.5 text-right">
          <button
            type="button"
            onClick={abrirEditor}
            title={TITULO_EDITAR_EL_DIA}
            className="min-h-[44px] rounded px-1 tabular-nums text-gray-400 underline decoration-dotted decoration-gray-300 underline-offset-2 transition hover:text-black hover:decoration-black"
          >
            —
          </button>
        </td>
      );
    }
    return (
      <td className="px-2 py-1.5 text-right">
        <HoraBoton idx={idx} tenue={idx === 1 || idx === 2} />
      </td>
    );
  }

  // 🔴 LAS CUATRO COLUMNAS DE SIEMPRE, Y CUÁLES ESCONDEN (18-sep-2026). La
  // cuenta salió de la pantalla a `marcas-del-dia.ts`: acá solo se pregunta.
  // 🔑 Con 4 marcas —381 de 466 días medidos, el 81,8 %— esto devuelve
  // [0,1,2,3] y la fila se dibuja EXACTAMENTE igual que antes.
  const columnas = columnasClasicas(d.marcas.length);
  const cabenLasCuatro = cabenEnLasCuatroColumnas(d.marcas.length);

  return (
    <>
      {/* 🔴 2d — LAS ACCIONES SALEN AL PASAR EL MOUSE (24-sep-2026). 🩸 Un
          colaborador abierto tenía **32 cosas para tocar**; doce de ellas en
          días que todavía no llegaron. `group` + `focus-within` para que el
          teclado las siga alcanzando: esconderlas del tabulador sería sacarlas
          de verdad. */}
      <tr className={`group border-b border-gray-100 ${d.revisar ? "bg-amber-50/60" : ""} ${d.correcciones.length ? "bg-blue-50/40" : ""}`}>
        <td className="whitespace-nowrap px-2 py-1.5 text-gray-700">{fechaCorta(d.fecha)}</td>
        {/* 🔴 CON EL EDITOR ABIERTO SIEMPRE VAN LAS CUATRO COLUMNAS, aunque el
            día no tenga ni una marca: el caso más común es justamente ése —quien
            olvidó marcar no tiene nada que corregir— y sin las celdas no habría
            dónde escribir. */}
        {d.marcas.length || editando ? (
          <>
            {/* 🔴 LAS CUATRO COLUMNAS SE DIBUJAN SIEMPRE (18-sep-2026).
                🩸 Hasta hoy acá se ESCONDÍAN marcas: las cuatro celdas se
                llenaban por índice —0, 1, 2 y la última—, así que un día de 5
                mostraba la 1.ª, la 2.ª, la 3.ª y la 5.ª, y la CUARTA —que suele
                ser justo la repetida— no se veía por ningún lado.
                🩸 Dos intentos antes de éste rompían la grilla —primero las
                cuatro celdas fundidas en una, después solo las dos del
                almuerzo— y Daniel corrigió los dos con la captura en la mano:
                *«no está en su columna, se ve desordenado»* y *«y aun se ve
                desordenado»*. Lo que no entra en las cuatro baja a una línea
                debajo del día, que es donde esta pantalla ya cuenta lo que pasa
                con una marca. Ver `rotuloMarcasSueltas`. */}
            <Hora idx={columnas[0]} col={0} />
            <Hora idx={columnas[1]} col={1} />
            <Hora idx={columnas[2]} col={2} />
            <Hora idx={columnas[3]} col={3} />
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
              {/* ══════════════════════════════════════════════════════════
                  🔴 LAS HORAS EXTRA SE DECIDEN ACÁ (19-sep-2026).
                  Daniel: Sí / No en la misma fila, sin ir a Aprobaciones.
                  🔴 AL APROBAR MANDA EL SERVIDOR: los mismos dos botones,
                  el mismo endpoint y las mismas reglas de siempre.
                  ⚠️ La pestaña Aprobaciones NO se tocó, y sigue siendo la
                  única que ofrece el domingo y el feriado trabajados.
                  ══════════════════════════════════════════════════════════ */}
              {puedeDecidirExtra && seDecideEnElReporte(d.extraMin, conExtra) && (
                <span className="mr-1.5 inline-flex align-middle" title={TITULO_DECIDIR_EXTRA}>
                  <BotonesSiNo
                    decision={decisionExtra}
                    etiqueta={etiquetaDecidirExtra(persona, fechaCorta(d.fecha))}
                    disabled={extraEnVuelo}
                    onDecidir={(dec) => onDecidirExtra(codigo, d.fecha, d.extraMin, dec)}
                  />
                </span>
              )}
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
              {/* 🔴 «LLEGÓ N MIN ANTES · ¿ENTRADA AUTORIZADA?» (24-sep-2026). Un
                  AVISO, nunca un cálculo: llegar antes sigue valiendo cero
                  hasta que alguien escriba desde qué hora entraba. Solo desde
                  el umbral de las reglas (hoy 30 min) y nunca si el día ya tiene
                  entrada autorizada. Tocarlo abre «Arreglar el día», que es
                  donde se decide. En gris: es una pregunta, no un problema. */}
              {ENTRADA_AUTORIZADA && typeof d.entradaTempranaMin === "number" && (
                seEdita && !editando ? (
                  <button
                    type="button"
                    onClick={abrirEditor}
                    title={TITULO_AVISO_ENTRADA_TEMPRANA}
                    className="ml-1.5 min-h-[44px] rounded bg-gray-100 px-1.5 text-xs font-medium text-gray-700 underline decoration-dotted underline-offset-2 transition hover:text-black"
                  >
                    {textoAvisoEntradaTemprana(d.entradaTempranaMin)}
                  </button>
                ) : (
                  <span
                    className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-xs font-medium text-gray-700"
                    title={TITULO_AVISO_ENTRADA_TEMPRANA}
                  >
                    {textoAvisoEntradaTemprana(d.entradaTempranaMin)}
                  </span>
                )
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
              {puedeCorregir && !d.fueraDeVigencia && !editando && !diaFuturo && (
                <button type="button" onClick={() => (seEdita ? abrirEditor() : agregar())}
                  className={`ml-1.5 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-black ${alPasarElMouse}`}>
                  {seEdita ? "Arreglar el día" : "Agregar hora"}
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
              // 🔴 NO MARCÓ NI UNA VEZ EN EL PERÍODO (24-sep-2026): gris y no
              // rojo, por lo mismo que el día en curso — la planilla no se la
              // cobra, y un «Ausencia sin justificar» acá diría lo contrario de
              // lo que se paga. Ver `sin-marcas.ts`.
              : sinMarcas ? <span className="text-gray-500">{TEXTO_DIA_SIN_MARCAS}</span>
              : <span className="font-medium text-red-700">Ausencia sin justificar</span>}
            {puedeCorregir && !d.feriado && !d.fueraDeVigencia && !editando && !diaFuturo && (
              <button type="button" onClick={() => (seEdita ? abrirEditor() : agregar())}
                className={`ml-2 min-h-[44px] rounded px-1 text-xs text-gray-500 underline decoration-dotted underline-offset-2 hover:text-black ${alPasarElMouse}`}>
                {seEdita ? "Arreglar el día" : "Agregar marcación"}
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
      {/* ══════════════════════════════════════════════════════════════════
          🔴 UN SOLO PORQUÉ Y UN SOLO BOTÓN PARA TODO EL DÍA (19-sep-2026).
          🩸 Antes cada marca pedía su ventana y su motivo: 58 de 141 días
          necesitaron 2, 3 y hasta 7. Acá se arreglan las cuatro y se guarda
          una vez. El motivo sigue siendo OBLIGATORIO.
          ══════════════════════════════════════════════════════════════════ */}
      {editando && (
        <tr className="border-b border-gray-100 bg-blue-50/40">
          <td></td>
          <td colSpan={8} className="px-2 pb-3 pt-1">
            {/* 🔴 «HOY ENTRABA A LAS __:__» (24-sep-2026). Con hora, ese día la
                extra de la entrada se mide desde ahí hasta su hora de entrada y
                va a Aprobaciones; sin hora, nada cambia. Se guarda con el MISMO
                porqué y el mismo botón. */}
            {ENTRADA_AUTORIZADA && (
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <label htmlFor={`entrada-${codigo}-${d.fecha}`} className="text-[12px] font-medium text-gray-700">
                  {ROTULO_ENTRADA_AUTORIZADA}
                </label>
                <input
                  id={`entrada-${codigo}-${d.fecha}`}
                  type="time"
                  value={escritoEntrada?.quitar ? "" : (escritoEntrada?.hora ?? entradaActual?.hora.slice(0, 5) ?? "")}
                  disabled={guardandoDia || escritoEntrada?.quitar === true}
                  onChange={(ev) => setEscritoEntrada({ hora: ev.target.value, quitar: false })}
                  className="min-h-[44px] w-[7.5rem] rounded-md border border-gray-300 px-1.5 text-[13px] tabular-nums outline-none transition focus:border-black disabled:bg-gray-100 disabled:text-gray-400"
                />
                {entradaActual && (
                  <button
                    type="button"
                    onClick={() => setEscritoEntrada((e) => (e?.quitar ? null : { hora: "", quitar: true }))}
                    aria-pressed={escritoEntrada?.quitar === true}
                    disabled={guardandoDia}
                    className={`min-h-[44px] rounded px-1.5 text-[12px] transition ${
                      escritoEntrada?.quitar ? "bg-amber-100 font-semibold text-amber-900" : "text-gray-500 hover:text-black"
                    }`}
                  >
                    {escritoEntrada?.quitar ? "Se quita ✕" : QUITAR_ENTRADA_AUTORIZADA}
                  </button>
                )}
                <span className="text-[12px] text-gray-500">
                  Solo si ese día entraba antes de su hora: lo de antes de su entrada pasa a hora extra para aprobar.
                </span>
              </div>
            )}
            <div>
              {/* 🩸 El rótulo NO envuelve los botones en un <label>: un botón es
                  «labelable», así que el label se ataría al PRIMER botón y no al
                  campo. El campo se rotula por `aria-labelledby`. */}
              <span id={`porque-${codigo}-${d.fecha}`} className="block text-[12px] font-medium text-gray-700">
                {PORQUE} <span className="text-red-600">*</span>
              </span>
              {/* Los más usados, si los hay. Tocar uno ESCRIBE en el campo. */}
              {motivosFrecuentes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {motivosFrecuentes.map((m) => (
                    <button key={m} type="button" onClick={() => setMotivoDia(m)}
                      aria-pressed={motivoDia === m}
                      className={`min-h-[44px] rounded-full border px-3 text-[12px] transition active:scale-[0.97] ${
                        motivoDia === m
                          ? "border-black bg-black text-white"
                          : "border-gray-200 bg-white text-gray-600 hover:border-black hover:text-black"
                      }`}>
                      {m}
                    </button>
                  ))}
                </div>
              )}
              <input
                aria-labelledby={`porque-${codigo}-${d.fecha}`}
                value={motivoDia}
                onChange={(e) => setMotivoDia(e.target.value.slice(0, MOTIVO_MAX))}
                placeholder="Escribe el motivo…"
                disabled={guardandoDia}
                className="mt-1.5 min-h-[44px] w-full rounded-lg border border-gray-200 bg-white px-3 text-base outline-none transition focus:border-black sm:text-sm"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button type="button" onClick={() => void guardarElDia()}
                  disabled={Boolean(faltaDia) || guardandoDia}
                  className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40">
                  {guardandoDia ? "Guardando…" : GUARDAR_EL_DIA}
                </button>
                <button type="button" onClick={cerrarEditor} disabled={guardandoDia}
                  className="min-h-[44px] rounded-md border border-gray-300 bg-white px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40">
                  Cancelar
                </button>
                {/* 🔴 EL BOTÓN APAGADO DICE QUÉ FALTA. Un botón gris sin
                    explicación se lee como «esta pantalla está rota». */}
                {faltaDia && !guardandoDia && (
                  <span className="text-[12px] text-amber-700">{faltaDia}</span>
                )}
                {/* Y cuando se puede, se dice QUÉ se va a escribir antes de
                    escribirlo: «2 horas corregidas · 1 quitada». */}
                {!faltaDia && resumenDelPlan(plan) && (
                  <span className="text-[12px] text-gray-600">{resumenDelPlan(plan)}</span>
                )}
              </div>
              <p className="mt-1.5 text-[12px] text-gray-500">
                No se borra nada: lo que marcó el reloj queda guardado y la corrección va encima,
                con tu nombre y este motivo.
              </p>
            </div>
          </td>
        </tr>
      )}

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

      {/* 🔴 LO QUE NO ENTRA EN LAS CUATRO COLUMNAS, EN SU PROPIA LÍNEA. Con 4
          marcas —el 82 % de los días— esto no se dibuja y la fila es la de
          siempre.

          🩸 18-sep-2026: esta línea DEJÓ DE NOMBRAR cuál sobra. Decía «Marca de
          más: 13:28:13» —una hora elegida por POSICIÓN, sin mirar el reloj— y
          en el día de Enrique Sánchez (7-sep) la que sobraba era la 11:17:58:
          la contadora quitó la que la línea señalaba y el día quedó igual de
          mal. Ahora cuenta y no acusa. El texto y el porqué, en
          `rotuloMarcasSueltas`. */}
      {marcasEscondidas(d.marcas.length).length > 0 && (
        <tr className="border-b border-gray-100">
          <td></td>
          <td colSpan={8} className="px-2 pb-1.5 text-[12px] text-amber-800">
            {rotuloMarcasSueltas(d.marcas.length, marcasEscondidas(d.marcas.length).length)}
            {marcasEscondidas(d.marcas.length).map((i) => (
              <span key={i} className="mx-1.5 inline-block align-middle">
                {/* 🔴 SIGUE SIENDO TOCABLE: es una de las que pueden sobrar.
                    Con el editor abierto se escribe y se quita acá mismo —es
                    el caso que más importa, porque la que sobra casi nunca es
                    una de las cuatro columnas—. */}
                {editando ? (
                  <span className="inline-block w-[7.5rem] align-top">
                    {campoEscribible(claveMarca(i), porClave.get(claveMarca(i)) ?? null, true)}
                  </span>
                ) : (
                  <HoraBoton idx={i} tenue />
                )}
              </span>
            ))}
            {notaMarcasSueltas(d.marcas.length)}
          </td>
        </tr>
      )}

      {/* 🔴 LA ENTRADA AUTORIZADA DEL DÍA, DICHA (24-sep-2026): desde qué hora,
          quién y por qué, y cuánto de la extra salió de ahí. En azul, como una
          decisión tomada. «Deshacer» la anula con firma; la fila queda. */}
      {ENTRADA_AUTORIZADA && d.entradaAutorizada && (
        <tr className="border-b border-gray-100 bg-blue-50/40">
          <td></td>
          <td colSpan={8} className="px-2 pb-1.5 text-[12px] text-blue-900">
            {textoEntradaAutorizada(d.entradaAutorizada)}
            {(d.extraEntradaMin ?? 0) > 0 && d.entradaAutorizada.desde
              ? ` · ${fmtMin(d.extraEntradaMin ?? 0)} min de extra medidos de ${d.entradaAutorizada.desde} a ${d.entradaAutorizada.hasta}`
              : " · sin extra de entrada ese día"}
            {puedeCorregir && (
              <button type="button" onClick={() => void deshacerEntradaAutorizada(d.entradaAutorizada!.id)}
                disabled={deshaciendo === d.entradaAutorizada.id}
                className="ml-1.5 min-h-[44px] rounded px-1 text-[12px] text-blue-700 underline decoration-dotted underline-offset-2 transition hover:text-black disabled:opacity-40">
                {deshaciendo === d.entradaAutorizada.id ? "Quitando…" : "Deshacer"}
              </button>
            )}
          </td>
        </tr>
      )}

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
            {/* 🔴 «DESHACER» SE QUEDA, Y VIVE DONDE VIVE LO YA GUARDADO
                (19-sep-2026). Editar una hora ya no obliga a deshacer primero
                —eso lo resuelve el editor de arriba—, pero volver a lo que dijo
                el reloj sigue siendo deshacer, y la corrección queda anotada
                con quién la deshizo. 🩸 Una marcación QUITADA no se podía
                deshacer por ninguna puerta: no está en `marcas`, así que la
                ventana nunca se abría sobre ella. */}
            {puedeCorregir && (
              <button type="button" onClick={() => void deshacerCorreccion(c.id)}
                disabled={deshaciendo === c.id}
                className="ml-1.5 min-h-[44px] rounded px-1 text-[12px] text-blue-700 underline decoration-dotted underline-offset-2 transition hover:text-black disabled:opacity-40">
                {deshaciendo === c.id ? "Deshaciendo…" : "Deshacer"}
              </button>
            )}
          </td>
        </tr>
      ))}

      {/* 🔴 LA MARCA REPETIDA SE VE TACHADA, NO SE ESCONDE (18-sep-2026). El
          motor la olvidó solo —a 60 s o menos de la última que cuenta— y la
          fila sigue en la base. Se dice con el mismo texto que el Excel
          (`explicacionRepetida`), en gris: nadie la tocó a mano, y por eso no
          va en azul como una corrección. */}
      {/* ⚠️ `?? []`: falla ABIERTA. Un día que llegue sin el campo (una
          respuesta vieja, un test que arma el día a mano) se dibuja igual. */}
      {(d.repetidas ?? []).map((r, i) => (
        <tr key={`repetida-${i}`} className="border-b border-gray-100 bg-gray-50/60">
          <td></td>
          <td colSpan={8} className="px-2 pb-1.5 text-[12px] text-gray-600">
            Marca <b>repetida</b>: <b className="tabular-nums line-through">{r.hora}</b> — {explicacionRepetida(r)}
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
