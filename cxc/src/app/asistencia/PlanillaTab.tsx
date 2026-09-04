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
//
// ── 🔴 EL FLUJO, TAL COMO LO APROBÓ DANIEL (4-sep-2026) ──────────────────────
//
//     elegir período → [Generar] → BORRADOR → revisar → [Cerrar quincena]
//                                                   → CERRADA → [Reabrir]
//
// El calendario arranca A LA VISTA —dos meses, como el de Copa: *«que sea user
// friendly como el de copa airlines… su fecha de salida sería la fecha que
// termina la quincena»*— y recién al generar se pliega a la píldora de arriba,
// porque las 18 columnas de plata necesitan el ancho entero.
//
// 🔴 NADA SE RECALCULA POR DEBAJO. Aprobar un préstamo o escribir un monto a
// mano NO vuelve a pedir el cuadro: lo marca VIEJO y aparece «Regenerar». Que
// los números se muevan solos mientras alguien los revisa es exactamente cómo
// se termina cerrando una quincena distinta de la que se miró.
//
// 🔴 Y EL CIERRE ES DEL SERVIDOR, ENTERO. Esta pantalla NO manda un solo monto:
// el POST recibe empresa y fechas, y la ruta vuelve a calcular y congela ESO
// (ver `planilla-guardada.ts`). Acá solo se muestra el estado y se pide.

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useToast } from "@/components/ToastSystem";
import { Ayuda } from "@/components/shared/Ayuda";
import {
  EMPRESAS_ASISTENCIA,
  etiquetaEmpresa,
  MINUTOS_TARDE_QUE_SON_AUSENCIA,
} from "@/lib/asistencia/config";
import {
  EXPLICACION_SERVICIO_PROFESIONAL,
  MOTIVO_FUERA_DE_PLANILLA,
} from "@/lib/asistencia/participacion";
import type { ReglasAsistencia } from "@/lib/asistencia/config";
import {
  aHoras,
  fechaCorta,
  FORMULA_NETO,
  grupoDeLinea,
  quincenasHasta,
  textoAusencias,
  textoTardanzas,
  type LineaPlanilla,
  type ManualesLinea,
  type Periodo,
  type Quincena,
  type TotalesPlanilla,
} from "@/lib/asistencia/planilla";
import { CHIP_NO_MARCA_RELOJ } from "@/lib/asistencia/sueldo-fijo";
import { CHIP_REPARTIDO, type RepartoRechazado } from "@/lib/asistencia/reparto";
// 🔑 `baseSeguros` es EL MISMO LECTOR que usan el servidor y el motor. Acá hace
// falta de verdad: una línea armada a mano —hay fixtures de tests que lo hacen,
// y una respuesta vieja del servidor guardada en caché también— llega SIN el
// campo, y un `!== null` pelado dejaría pasar el `undefined` y reventaría la
// pantalla entera al formatearlo. Ante la duda: no hay sello, o sea lo de ayer.
import { baseSeguros, chipBaseSeguros } from "@/lib/asistencia/seguros-base";
import type { AvisoPeriodoAbierto, CodigoSinFicha } from "@/lib/asistencia/periodo";
import Link from "next/link";
import {
  cabeceraExtraNoAprobada,
  enlaceAprobaciones,
  horasBonitas,
  type ExtraNoAprobada,
} from "@/lib/asistencia/aprobaciones";
import type {
  PrestamoSinAtar,
  SugerenciaPrestamo,
} from "@/lib/asistencia/prestamos-planilla";
import type { VacacionNoPagada } from "@/lib/asistencia/vacaciones";
import { fmtMin } from "@/lib/asistencia/reporte";
// 🔴 QUIÉN CIERRA SALE DEL MISMO MÓDULO QUE EL CANDADO DEL SERVIDOR
// (`cerrarPlanillaRoles()` = Asistencia menos secretaria). Escribir acá
// `["admin","contabilidad"]` habría estrenado la cuarta lista de roles del
// módulo, que es el bug que `roles.ts` vino a matar. Esconder el botón no cierra
// nada —la ruta es el candado—, pero dibujarle a la secretaria un botón que le
// va a contestar 403 es peor que no dibujarlo.
//
// ⚠️ Import de VALOR y no de tipo, así que pesa: son tres funciones puras y el
// resto del módulo (los mapas de columnas, el I/O) se cae solo en el tree-shake.
import {
  etiquetaRango as etiquetaRangoGuardado,
  motivoReaperturaValido,
  puedeCerrar,
  textoSolapamiento,
  type CabeceraGuardada,
  type FrenoCierre,
} from "@/lib/asistencia/planilla-guardada";
import { useBodyScrollLock } from "@/lib/hooks/useBodyScrollLock";
// 🔴 DEL MÓDULO PURO, NUNCA de `CalendarioRango`: ese archivo trae
// `react-day-picker` y un import estático anularía el `dynamic()` del selector.
import { aIso, deIso } from "@/components/ui/rango-fechas-iso";

import RangoFechas from "@/components/ui/RangoFechas";
interface Respuesta {
  quincena: Quincena;
  periodo: Periodo;
  empresa: string | null;
  empresaEtiqueta: string | null;
  lineas: LineaPlanilla[];
  totales: TotalesPlanilla;
  reglas: ReglasAsistencia;
  /** 🔴 Lo que el módulo de Préstamos dice que hay que descontar esta quincena,
   *  persona por persona. Vacío en un rango libre.
   *
   *  🩸 OPCIONAL A PROPÓSITO: una respuesta guardada por SWR de ANTES de este
   *  cambio no lo trae, y esa respuesta se pinta antes de que llegue la nueva.
   *  Declararlo obligatorio le mentiría al compilador sobre lo que de verdad
   *  puede llegar, y el precio sería la planilla en blanco. */
  prestamos?: SugerenciaPrestamo[];
  avisos: {
    faltaMigracionConfiguracion: string | null;
    faltaMigracionManual: string | null;
    faltaMigracionBajas: string | null;
    faltaMigracionServicioProfesional: string | null;
    /** Fichas que no entran a ESTA quincena: ya se habían ido, o todavía no
     *  habían entrado. Una quincena vieja NO cambia por esto: se compara contra
     *  las fechas de la quincena, nunca contra hoy. */
    fueraPorBaja: number;
    /** Dadas de baja que igual marcaron después de irse. */
    marcoDespuesDeIrse: number;
    sinHorario: number;
    salidaAsumida: string;
    horasAusenciaDefault: number;
    conSabado: number;
    /** El período todavía no terminó. `null` cuando ya cerró. */
    periodoAbierto: AvisoPeriodoAbierto | null;
    /** Los códigos que marcaron y no tienen ficha. Van UNA vez, fuera del cuadro. */
    sinFicha: CodigoSinFicha[];
    avisoSinFicha: string | null;
    /** El período pedido NO es una quincena: hay cosas que cambian. */
    rangoLibre: boolean;
    factorBase: number;
    diasCalendario: number;
    /** Lo que la planilla DEJÓ DE PAGAR por vacaciones marcadas «ya se le pagó».
     *  Nada se descarta en silencio: va con nombre, rango y monto. */
    vacacionesNoPagadas: VacacionNoPagada[];
    avisoVacacionesNoPagadas: string | null;
    /** Falta correr el SQL de las vacaciones. Nadie está de vacaciones y la
     *  planilla paga lo de siempre — pero se dice. */
    faltaMigracionVacaciones: string | null;
    /** 🔴 Las horas extra que este cuadro NO pagó porque nadie las autorizó.
     *  Contadora, textual: *«Sólo se pagan las horas extras autorizadas»*.
     *  Nada se descarta en silencio: va con nombre y cantidad. */
    extraSinAprobar: ExtraNoAprobada[];
    avisoExtraSinAprobar: string | null;
    /** Falta correr el SQL de las aprobaciones. NO se exige aprobación: se paga
     *  todo lo que midió el reloj, como hasta hoy — pero se dice. */
    faltaMigracionAprobaciones: string | null;
    /** Falta correr el SQL del reparto. Nadie reparte su sueldo entre dos
     *  empresas y cada persona sale en una sola planilla, como hoy — pero se
     *  dice: quien ya dio a Julio por repartido va a esperar verlo en las dos. */
    faltaMigracionReparto: string | null;
    /** 🔴 Los repartos que el guard NO aplicó, con nombre y motivo. Esa persona
     *  cobró en UNA sola planilla, y sin este aviso nadie se enteraría. */
    repartosRechazados: RepartoRechazado[];
    avisoRepartoRechazado: string | null;
    /** 🔴 Los descuentos de préstamo que este cuadro NO hizo porque nadie los
     *  aprobó. Contadora, textual: *«El préstamo si debe ser por aprobarlo»*.
     *  Nada se descarta en silencio: va con nombre y monto.
     *  🩸 Opcionales por el mismo motivo que `prestamos`: una respuesta vieja
     *  guardada por SWR no los trae. */
    prestamoSinAprobar?: SugerenciaPrestamo[];
    avisoPrestamoSinAprobar?: string | null;
    /** 🔴 Préstamos CON SALDO que no están atados a nadie de la planilla: no se
     *  le descuentan a ninguna persona. */
    prestamoSinAtar?: PrestamoSinAtar[];
    avisoPrestamoSinAtar?: string | null;
    /** Falta correr el SQL del amarre. La casilla se sigue escribiendo a mano,
     *  como hasta hoy — pero se dice. */
    faltaMigracionAmarrePrestamos?: string | null;
    /** Falta correr el SQL de la aprobación del préstamo. Ídem. */
    faltaMigracionPrestamoAprobado?: string | null;
  };
}

/** Lo que se PIDIÓ: la planilla que hay en pantalla es de estas tres cosas. */
interface Pedido {
  desde: string;
  hasta: string;
  empresa: string;
}

/** Lo que la base sabe de este período. `GET /api/asistencia/planilla-guardada`. */
interface Cierre {
  /**
   * La cerrada que coincide EXACTO con el rango pedido.
   *
   * 🔑 El `estado` («borrador» / «cerrada») que la ruta también devuelve NO se
   * guarda: lo que la pantalla pinta se deriva de estos dos campos, y tener
   * además una palabra que diga lo mismo es la forma de que un día digan cosas
   * distintas.
   */
  cerrada: CabeceraGuardada | null;
  /** Las que PISAN el rango sin ser la misma: son las que impiden cerrar. */
  solapadas: CabeceraGuardada[];
  /** ⚠️ Falta correr la migración. NO es un error — ver la nota del aviso. */
  aviso: string | null;
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** El día de después. `deIso` cae a mediodía, así que no hay salto de huso. */
function diaSiguiente(iso: string): string {
  const d = deIso(iso);
  d.setDate(d.getDate() + 1);
  return aIso(d);
}

/** «3 sep 2026, 4:12 p.m.», en hora de Panamá (UTC−5 fijo, como todo el módulo). */
function cuandoBonito(iso: string): string {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return "";
  const d = new Date(t - 5 * 3_600_000);
  const h24 = d.getUTCHours();
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  const min = String(d.getUTCMinutes()).padStart(2, "0");
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]} ${d.getUTCFullYear()}, ${h}:${min} ${h24 < 12 ? "a.m." : "p.m."}`;
}

/**
 * Por qué una casilla de monto a mano está apagada. Son DOS motivos distintos y
 * el texto de cada uno es la mitad del mensaje: uno se arregla eligiendo otras
 * fechas, el otro reabriendo la quincena.
 */
const BLOQUEO_RANGO = {
  placeholder: "por quincena",
  title: "Se escribe por quincena, no por rango de fechas",
};
const BLOQUEO_CERRADA = {
  placeholder: "cerrada",
  title: "La quincena está cerrada. Para corregir un monto hay que reabrirla.",
};
type Bloqueo = typeof BLOQUEO_RANGO | null;

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
  // ⛔ EL MODO «QUINCENA» SE RETIRÓ (25-ago-2026). Daniel, textual: *"quita
  // periodo quincena en planilla, eso no se usara asi. y sisi, que el usuario
  // eliga el rango"*. Con un solo modo, el control segmentado sobraba: los dos
  // campos de fecha se muestran directo.
  //
  // 🔴 PERO LA QUINCENA NO DESAPARECIÓ DEL CÁLCULO, y eso es lo que sostiene
  // todo lo de abajo: `periodoDesdeRango` reconoce un rango que COINCIDE con
  // una quincena y devuelve esa quincena —misma clave de montos manuales, mismo
  // factor 1—, así que el caso normal sigue pagando exactamente lo de siempre.
  // Por eso el rango arranca en la quincena en curso: el primer cuadro que se
  // ve es el de siempre y de ahí se mueven las fechas.
  // ═════════════════════════════════════════════════════════════════════════
  // 🔴 LA PLANILLA ABRE VACÍA HASTA QUE ALGUIEN ELIJA EL PERÍODO (1-sep-2026)
  // ═════════════════════════════════════════════════════════════════════════
  //
  // Daniel, textual: *«la quincena se paga según el rango de fecha
  // seleccionado»*. Ahí está todo: el rango NO es el filtro de una consulta, es
  // **lo que define qué quincena se paga**.
  //
  // 🩸 Y POR ESO ARRANCAR CON UN RANGO PUESTO ERA PELIGROSO. Abría en «del 1 al
  // 15» y mostraba una planilla completa —sueldos, deducciones, neto a pagar—
  // de un período que en esta empresa muchas veces NO es el que se está por
  // pagar: el corte real es variable (a veces del 28 al 10). Plata con cara de
  // definitiva, de una quincena que nadie pidió. Es el mismo error que los
  // cuatro presets retirados, pero peor: el preset había que tocarlo, esto
  // salía solo.
  //
  // ⚠️ ESTO INVIERTE UNA DECISIÓN ANTERIOR, a propósito. Decía «arranca en la
  // quincena en curso: el caso normal sigue siendo abrir y mirar», con el motivo
  // de ahorrar teclear dos fechas. Ese motivo valía cuando el rango se tecleaba;
  // ahora se elige en un calendario con dos toques.
  //
  // 🔴 Y TAMPOCO SE RECUERDA EL ÚLTIMO RANGO (tenía `ultimoRango`, se le quitó).
  // Recordarlo es la misma trampa disfrazada: al abrir la quincena siguiente
  // mostraría la ANTERIOR ya cargada, con su plata, como si fuera la de ahora.
  const quincenaEnCurso = useMemo(() => quincenasHasta(hoy, 1)[0], [hoy]);
  const [desde, setDesde] = useState(quincenaEnCurso.desde);
  const [hasta, setHasta] = useState(quincenaEnCurso.hasta);
  /** `false` hasta que alguien elige un período. Sin esto no se pide nada. */
  const [elegido, setElegido] = useState(false);
  const [empresa, setEmpresa] = useState<string>(EMPRESAS_ASISTENCIA[0]);
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<string | null>(null);

  // ── EL FLUJO: elegir → Generar → revisar → Cerrar ───────────────────────────
  /** Lo que se pidió y está en pantalla. `null` = todavía no se generó nada. */
  const [pedido, setPedido] = useState<Pedido | null>(null);
  /** 🔴 Alguien tocó algo que mueve los números. NO se recalcula solo. */
  const [desactualizada, setDesactualizada] = useState(false);
  /** Lo que la base dice de este período: cerrada, borrador, o que se pisa. */
  const [cierre, setCierre] = useState<Cierre | null>(null);
  /** Lo que impidió cerrar la última vez (el 409 de los frenos). */
  const [frenos, setFrenos] = useState<FrenoCierre[]>([]);
  const [modal, setModal] = useState<"cerrar" | "reabrir" | null>(null);
  const [trabajandoCierre, setTrabajandoCierre] = useState(false);
  /**
   * 🔴 El calendario arranca A LA VISTA y se pliega al generar. Daniel:
   * *«no veo lo de poner las fechas, sigue igual pero no cortado»* — un
   * desplegable que hay que descubrir no sirve para el PRIMER paso de la
   * pantalla. Plegado, las 18 columnas de plata recuperan el ancho entero.
   */
  const [calendarioAbierto, setCalendarioAbierto] = useState(true);
  // 🔑 El rol sale de `sessionStorage`, igual que en `AsistenciaClient` y
  // `AppHeader`. Arranca vacío: en el primer render no hay sessionStorage, y
  // dibujar el botón de cerrar para sacarlo un tick después es peor.
  const [rol, setRol] = useState("");
  useEffect(() => { setRol(sessionStorage.getItem("cxc_role") || ""); }, []);

  // ── 🔴 EL INICIO RECOMENDADO: EL DÍA DESPUÉS DE LA ÚLTIMA CERRADA ──────────
  //
  // Daniel, textual: *«después de cerrar la primera quincena, el recomendado de
  // inicio debe de ser el día siguiente que cerró la quincena pasada»*. Es lo
  // que evita las dos formas de equivocarse: un hueco de días que nadie pagó, y
  // un solapamiento que el servidor va a rechazar al cerrar.
  //
  // ⚠️ ES UNA SUGERENCIA, NO UNA IMPOSICIÓN. Se marca el día con un aro en el
  // calendario y se dice en una línea; el primer toque sigue eligiendo el inicio
  // donde la persona quiera. Elegir el período por ella sería el mismo error que
  // los cuatro presets que se retiraron.
  //
  // 🔑 Sale del `historial` que ya devuelve la ruta del cierre — sin endpoint
  // nuevo. Se pide SIN fechas: así contesta el historial de la empresa entera.
  const [sugerido, setSugerido] = useState<{ inicio: string; ultimaHasta: string } | null>(null);
  useEffect(() => {
    // Ya se generó algo, o la persona ya eligió: lo que manda es su elección.
    if (pedido || elegido) return;
    let vivo = true;
    void (async () => {
      try {
        const r = await fetch(
          `/api/asistencia/planilla-guardada?empresa=${encodeURIComponent(empresa)}`,
          { cache: "no-store" },
        );
        const j = await r.json();
        // 🩸 `vivo` no es adorno: si la persona elige mientras esto viaja, el
        // efecto se limpia y la respuesta vieja NO le pisa lo que eligió.
        if (!r.ok || !vivo) return;
        const historial = Array.isArray(j.historial) ? (j.historial as CabeceraGuardada[]) : [];
        // Solo las CERRADAS: una reabierta no pagó nada todavía.
        const cerradas = historial.filter((c) => c.estado === "cerrada");
        if (cerradas.length === 0) { setSugerido(null); return; }
        const ultima = cerradas.reduce((a, b) => (b.hasta > a.hasta ? b : a));
        const inicio = diaSiguiente(ultima.hasta);
        setSugerido({ inicio, ultimaHasta: ultima.hasta });
        // El calendario abre en ese mes. No queda «elegido»: sigue en vacío
        // hasta que alguien toque los dos días.
        setDesde(inicio);
        setHasta(inicio);
      } catch { /* la sugerencia es una ayuda, no un requisito */ }
    })();
    return () => { vivo = false; };
  }, [elegido, empresa, pedido]);

  /**
   * Qué hay CERRADO de este período. Va aparte del cuadro a propósito: que la
   * tabla del cierre no se pueda leer —o que falte correr la migración— no
   * puede dejar a nadie sin su planilla.
   */
  const pedirCierre = useCallback(async (p: Pedido) => {
    // 🔴 Se limpia ANTES de preguntar: si la consulta falla, quedarse con el
    // cierre del período anterior diría «esta quincena está cerrada» sobre otra.
    setCierre(null);
    try {
      const q = new URLSearchParams({ empresa: p.empresa, desde: p.desde, hasta: p.hasta });
      const res = await fetch(`/api/asistencia/planilla-guardada?${q}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) return;
      setCierre({
        cerrada: (j.cerrada ?? null) as CabeceraGuardada | null,
        solapadas: Array.isArray(j.solapadas) ? (j.solapadas as CabeceraGuardada[]) : [],
        aviso: typeof j.aviso === "string" ? j.aviso : null,
      });
    } catch { /* el estado del cierre es información, no un requisito */ }
  }, []);

  const cargar = useCallback(async (p: Pedido) => {
    setCargando(true);
    setError(null);
    // Un freno de la corrida anterior no puede sobrevivir a un cuadro nuevo:
    // sería un cartel rojo hablando de una planilla que ya no está en pantalla.
    setFrenos([]);
    try {
      const q = new URLSearchParams({ desde: p.desde, hasta: p.hasta, empresa: p.empresa });
      const res = await fetch(`/api/asistencia/planilla?${q}`, { cache: "no-store" });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "No se pudo cargar");
      setData(j as Respuesta);
      setDesactualizada(false);
      // Generado: el cuadro necesita el ancho. La píldora de arriba lo vuelve
      // a abrir cuando haga falta.
      setCalendarioAbierto(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar");
      setData(null);
    } finally {
      setCargando(false);
    }
    await pedirCierre(p);
  }, [pedirCierre]);

  // 🔴 Nada se pide solo: se pide lo que alguien GENERÓ. `pedido` es un objeto
  // nuevo en cada toque, así que «Regenerar» con las mismas fechas también
  // vuelve a pedir.
  useEffect(() => { if (pedido) void cargar(pedido); }, [cargar, pedido]);

  /** Generar / Regenerar: pedir el cuadro de lo que está elegido AHORA. */
  const generar = useCallback(() => {
    if (!elegido) return;
    setPedido({ desde, hasta, empresa });
  }, [desde, elegido, empresa, hasta]);

  // ── LO QUE SE DERIVA DEL ESTADO ────────────────────────────────────────────
  /** ¿El cuadro en pantalla es de lo que está elegido arriba? */
  const coincide = !!pedido && pedido.desde === desde && pedido.hasta === hasta && pedido.empresa === empresa;
  /** 🔴 Hay números en pantalla que ya no son los de lo que está elegido. */
  const vieja = !!data && (!coincide || desactualizada);
  const cerrada = cierre?.cerrada ?? null;
  const solapadas = cierre?.solapadas ?? [];
  /** ⚠️ Falta correr el SQL. La pantalla entera sigue andando; el cierre no. */
  const faltaMigracionCierre = cierre?.aviso ?? null;
  const puedeCerrarla = puedeCerrar(rol);
  /** Se puede cerrar cuando hay un cuadro fresco, sin cerrar y sin pisar nada. */
  const sePuedeCerrar =
    !!data && !vieja && !cerrada && solapadas.length === 0 && !faltaMigracionCierre && !!data.lineas.length;
  /**
   * 🔴 POR QUÉ NO SE PUEDE ESCRIBIR UN MONTO A MANO. Son dos motivos y gana el
   * de la quincena cerrada: escribir un ISR sobre un cuadro congelado no cambia
   * un centavo de lo que se pagó, y quien lo escribe se va creyendo que corrigió
   * el pago.
   */
  /**
   * El día que se marca en el calendario. UNA sola definición para los dos
   * sitios donde vive el control (la píldora y el calendario en línea): dos
   * copias es cómo una se queda marcando después de que la persona eligió.
   */
  const diaSugerido = elegido ? null : sugerido?.inicio ?? null;
  const bloqueoManuales: Bloqueo = cerrada
    ? BLOQUEO_CERRADA
    : data?.avisos.rangoLibre
      ? BLOQUEO_RANGO
      : null;

  /** Guarda un monto escrito a mano y refresca los números de esa fila. */
  const guardar = useCallback(
    async (codigo: string, campo: keyof ManualesLinea, valor: string) => {
      if (!data) return;
      const linea = data.lineas.find((l) => l.codigo === codigo);
      if (!linea) return;
      const n = Number(String(valor).replace(",", "."));
      const limpio = Number.isFinite(n) && n > 0 ? n : 0;
      if (limpio === linea.manuales[campo]) return; // no se escribió nada nuevo
      // 🔴 SIN QUINCENA NO HAY DÓNDE GUARDARLO. El campo ya va deshabilitado en
      // un rango libre, pero el freno tiene que vivir también del lado que
      // escribe: `asistencia_planilla_manual` guarda por quincena y su CHECK no
      // acepta otra clave, así que mandar el POST sin ella sería un 400 en la
      // cara de quien acaba de escribir un monto.
      if (!data.periodo.claveManuales) return;

      try {
        const res = await fetch("/api/asistencia/planilla", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            // 🔴 LA CLAVE SALE DE LA RESPUESTA, no de un estado propio. Es la
            // quincena que el servidor reconoció en estas fechas
            // (`periodo.claveManuales`), o sea la MISMA con la que ya estaban
            // guardados: escribir una clave calculada acá sería una segunda
            // definición de «a qué quincena pertenece este cuadro», y el día
            // que difieran los montos se guardarían en una quincena y se
            // leerían de otra.
            quincena: data.periodo.claveManuales,
            codigo,
            ...linea.manuales,
            [campo]: limpio,
          }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) toast(j.aviso ?? "No se pudo guardar", "error");
        // 🔴 NO SE RECARGA SOLO (4-sep-2026). El monto cambia el total de
        // deducciones, el neto y el pie — así que el cuadro queda VIEJO y lo
        // dice, con «Regenerar» al lado. Antes se recargaba entero acá: los
        // números se movían solos debajo de quien estaba revisando, que es cómo
        // se termina cerrando una quincena distinta de la que se miró.
        setDesactualizada(true);
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      }
    },
    [data, toast],
  );

  // ── 🔴 APROBAR EL DESCUENTO DE PRÉSTAMO ────────────────────────────────────
  //
  // Contadora, textual: *«El préstamo si debe ser por aprobarlo»*. Aprobar
  // ESCRIBE el monto en la casilla —que queda editable— y deja registro de
  // quién lo hizo. Retirar la aprobación la vacía, salvo que alguien la haya
  // corregido a mano: eso no se pisa, y el servidor lo devuelve en `noTocadas`.
  const [aprobandoPrestamo, setAprobandoPrestamo] = useState(false);
  const aprobarPrestamo = useCallback(
    async (personas: Array<{ codigo: string; monto: number }>, aprobado: boolean) => {
      if (!data || personas.length === 0) return;
      // 🔴 LA CLAVE SALE DE LA RESPUESTA, no de un estado propio — mismo motivo
      // que en `guardar`: una segunda definición de «a qué quincena pertenece
      // este cuadro» terminaría guardando en una y leyendo de otra.
      if (!data.periodo.claveManuales) return;
      setAprobandoPrestamo(true);
      try {
        const res = await fetch("/api/asistencia/prestamos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ quincena: data.periodo.claveManuales, aprobado, personas }),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "No se pudo guardar");
        if (j.ok === false) {
          toast(j.aviso ?? "No se pudo guardar", "error");
        } else if (Array.isArray(j.noTocadas) && j.noTocadas.length > 0) {
          // 🔴 Nada se descarta en silencio: si una casilla se dejó como estaba
          // porque alguien la había corregido, se DICE.
          toast(
            `Se retiró la aprobación, pero ${j.noTocadas.length === 1 ? "1 casilla quedó" : `${j.noTocadas.length} casillas quedaron`} `
            + "con el monto que alguien escribió a mano. Corrígelo en el cuadro si hace falta.",
            "warning",
          );
        }
        // 🔴 Mismo criterio que los montos a mano: aprobar mueve la plata, así
        // que el cuadro queda VIEJO y se dice. No se recalcula por debajo.
        setDesactualizada(true);
        toast("Listo. Toca «Regenerar» para ver el cuadro con este cambio.", "success");
      } catch (e) {
        toast(e instanceof Error ? e.message : "No se pudo guardar", "error");
      } finally {
        setAprobandoPrestamo(false);
      }
    },
    [data, toast],
  );

  // ── 🔴 CERRAR LA QUINCENA ──────────────────────────────────────────────────
  //
  // Se manda EMPRESA Y FECHAS, y nada más. Ni un monto: la ruta vuelve a pedirle
  // el cuadro al mismo handler que pinta esta pantalla y congela ESO. Mandar los
  // números desde acá convertiría a cualquiera con el módulo en alguien que
  // puede escribir el sueldo que quiera en el registro de lo que se pagó.
  //
  // Los tres «no» que puede contestar son distintos y se muestran distinto:
  //   · 503 → falta correr la migración. NO es un error: es ámbar y con el
  //           nombre del archivo. Todo lo demás de la pantalla sigue andando.
  //   · 409 con `frenos` → horas extra o préstamos sin aprobar. Rojo, con el
  //           texto que ya nombra la pestaña a la que hay que ir.
  //   · 409 con `solapadas` → hay una cerrada que pisa estas fechas. Rojo, y
  //           NOMBRA cuál, con un botón para ir a verla.
  const cerrarQuincena = useCallback(async () => {
    if (!pedido) return;
    setTrabajandoCierre(true);
    try {
      const res = await fetch("/api/asistencia/planilla-guardada", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa: pedido.empresa, desde: pedido.desde, hasta: pedido.hasta }),
      });
      const j = await res.json();
      setModal(null);
      if (res.status === 503) {
        setCierre((c) => ({
          cerrada: c?.cerrada ?? null, solapadas: c?.solapadas ?? [],
          aviso: typeof j.aviso === "string" ? j.aviso : "Falta preparar la base de datos.",
        }));
        toast("Todavía no se puede cerrar: falta preparar la base. Lee el aviso de arriba.", "warning");
        return;
      }
      if (res.status === 409) {
        if (Array.isArray(j.frenos) && j.frenos.length > 0) setFrenos(j.frenos as FrenoCierre[]);
        if (Array.isArray(j.solapadas) && j.solapadas.length > 0) {
          setCierre((c) => ({
            cerrada: c?.cerrada ?? null,
            solapadas: j.solapadas as CabeceraGuardada[], aviso: c?.aviso ?? null,
          }));
        }
        // El texto largo va al cartel, no al toast: son tres renglones con
        // nombres adentro y un toast se va antes de que se terminen de leer.
        toast("No se pudo cerrar la quincena. Lee el aviso de arriba.", "error");
        return;
      }
      if (!res.ok || j.ok === false) throw new Error(j.error ?? "No se pudo cerrar la quincena");
      toast("Listo — la quincena quedó cerrada. Los números quedaron congelados.", "success");
      await pedirCierre(pedido);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo cerrar la quincena", "error");
    } finally {
      setTrabajandoCierre(false);
    }
  }, [pedido, pedirCierre, toast]);

  // ── 🔴 REABRIR — con MOTIVO obligatorio ────────────────────────────────────
  //
  // No borra nada: la versión que se cerró queda entera, con sus montos y su
  // firma, y el próximo cierre nace como versión 2. El motivo es lo único que
  // permite reconstruir dentro de un mes por qué los números cambiaron.
  const reabrir = useCallback(async (motivo: string) => {
    if (!cerrada || !pedido) return;
    setTrabajandoCierre(true);
    try {
      const res = await fetch("/api/asistencia/planilla-guardada", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: cerrada.id, motivo }),
      });
      const j = await res.json();
      if (!res.ok || j.ok === false) throw new Error(j.error ?? "No se pudo reabrir");
      setModal(null);
      toast("Listo — la quincena quedó abierta otra vez. Lo que se cerró se guardó igual.", "success");
      await pedirCierre(pedido);
    } catch (e) {
      toast(e instanceof Error ? e.message : "No se pudo reabrir", "error");
    } finally {
      setTrabajandoCierre(false);
    }
  }, [cerrada, pedido, pedirCierre, toast]);

  /** Ir a mirar una quincena cerrada que pisa estas fechas: se genera ESA. */
  const irACerrada = useCallback((c: CabeceraGuardada) => {
    setDesde(c.desde);
    setHasta(c.hasta);
    setElegido(true);
    setPedido({ desde: c.desde, hasta: c.hasta, empresa: c.empresa });
  }, []);

  const exportables = useMemo(() => {
    if (!data) return null;
    return {
      lineas: data.lineas,
      totales: data.totales,
      quincena: data.quincena,
      periodo: data.periodo,
      empresaEtiqueta: data.empresaEtiqueta,
      reglas: data.reglas,
      // Los avisos que no se pueden perder al mandar el archivo por correo: el
      // papel sobrevive a la conversación donde se explicaron.
      periodoAbierto: data.avisos.periodoAbierto,
      avisoSinFicha: data.avisos.avisoSinFicha,
      // 🔴 El descuento por vacaciones ya pagadas VIAJA AL PAPEL: si la
      // pantalla lo avisa y el archivo no, el archivo es el que va a decidir un
      // pago con menos información que la pantalla.
      avisoVacacionesNoPagadas: data.avisos.avisoVacacionesNoPagadas,
      // 🔴 Igual que el anterior: si la pantalla avisa que unas horas extra no
      // se pagaron y el archivo no, el archivo es el que va a decidir un pago
      // con menos información que la pantalla.
      avisoExtraSinAprobar: data.avisos.avisoExtraSinAprobar,
      // 🔴 Y lo mismo con el préstamo: si la pantalla dice que a alguien no se
      // le descontó su cuota y el papel no, el papel es el que va a decidir un
      // pago con menos información que la pantalla.
      avisoPrestamoSinAprobar: data.avisos.avisoPrestamoSinAprobar ?? null,
      avisoPrestamoSinAtar: data.avisos.avisoPrestamoSinAtar ?? null,
    };
  }, [data]);

  // Las librerías de Excel y PDF se bajan al TOCAR el botón — ver la nota larga
  // en `ReporteTab`. ⚠️ Acá `planilla-exportar` ya tenía el cuidado de importar
  // el tipo de xlsx con `import type`, pero dos líneas más abajo importaba
  // VALORES de `lib/excel-export`, que sí trae `xlsx-js-style` estático: el
  // cuidado quedaba anulado. Por eso los dos van dentro del handler.
  //
  // `construirPdfPlanilla` se deja SÍNCRONA a propósito (el `await import` va
  // acá, en el llamador): hay un candado que la busca por el texto
  // `export function construirPdfPlanilla`.
  async function bajarExcel() {
    if (!exportables?.lineas.length) return;
    try {
      const { downloadWorkbook } = await import("@/lib/excel-export");
      const { construirExcelPlanilla, nombreArchivo } = await import("@/lib/asistencia/planilla-exportar");
      downloadWorkbook(construirExcelPlanilla(exportables), nombreArchivo(exportables, "xlsx"));
      toast("Excel listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el Excel. Intenta de nuevo.", "error");
    }
  }
  async function bajarPdf() {
    if (!exportables?.lineas.length) return;
    try {
      const { construirPdfPlanilla, nombreArchivo } = await import("@/lib/asistencia/planilla-exportar");
      construirPdfPlanilla(exportables).save(nombreArchivo(exportables, "pdf"));
      toast("PDF listo — revisa tu carpeta de descargas", "success");
    } catch {
      toast("No se pudo armar el PDF. Intenta de nuevo.", "error");
    }
  }

  // 🔴 CUATRO grupos, no dos, y el reparto lo hace `grupoDeLinea` —la MISMA
  // función que ordena el cuadro, cuenta los totales y arma el Excel y el PDF—.
  // Con la lista partida acá a mano, la pantalla y el papel podían discrepar
  // sobre en qué cajón cae una persona.
  //
  // 🩸 «Falta un dato» y «Tú decides» eran UNA SOLA bolsa ámbar, y por eso
  // RODRIGO MIRANDA (trabajo fuera de la oficina) y ELOYN MENDOZA (vacaciones)
  // salían pidiendo que los arreglaran en Configuración, donde no hay nada que
  // arreglarles. Ámbar dice "arreglame"; esto es una decisión, y va en gris.
  const buenas = data?.lineas.filter((l) => grupoDeLinea(l) === "pagada") ?? [];
  const fueraDePlanilla = data?.lineas.filter((l) => grupoDeLinea(l) === "fuera") ?? [];
  const decidir = data?.lineas.filter((l) => grupoDeLinea(l) === "decidir") ?? [];
  const pendientes = data?.lineas.filter((l) => grupoDeLinea(l) === "falta") ?? [];

  /**
   * 🔴 UN SOLO BOTÓN, y cambia de nombre según lo que va a hacer: «Generar» la
   * primera vez y cuando lo elegido no es lo que está en pantalla; «Regenerar»
   * cuando es el mismo cuadro. Va en el pie del calendario mientras está a la
   * vista y al lado de la píldora cuando se plegó — el MISMO elemento, no dos:
   * dos botones que hacen lo mismo en la misma pantalla es cómo se toca el que
   * no era.
   */
  const botonGenerar = (
    <button
      type="button"
      onClick={generar}
      disabled={!elegido || cargando}
      className={`min-h-[44px] rounded-md px-4 text-sm font-medium transition active:scale-[0.97] disabled:opacity-40 ${
        data && !vieja
          ? "border border-gray-300 text-gray-700 hover:border-black hover:text-black"
          : "bg-black text-white"
      }`}
    >
      {cargando ? "Generando…" : data && coincide ? "Regenerar" : "Generar"}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* ── Elegir qué se va a pagar ── */}
      <div className="flex flex-wrap items-end gap-3">
        {/* 🔴 LA PÍLDORA, solo cuando el calendario está plegado. Tocarla vuelve
            a abrirlo (el desplegable de siempre), sin quitarle el ancho a la
            tabla de 18 columnas que quedó abajo. */}
        {!calendarioAbierto && (
          <div className="flex flex-col gap-1">
            <span className="text-xs text-gray-500">Período</span>
            <RangoFechas
              desde={desde} hasta={hasta} label={null}
              vacio={!elegido}
              sugerido={diaSugerido}
              onChange={(d, h) => { setDesde(d); setHasta(h); setElegido(true); }}
            />
          </div>
        )}

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

        {/* Plegado, el botón va acá; abierto, va en el pie del calendario. */}
        {!calendarioAbierto && botonGenerar}

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

      {/* 🔴 DÓNDE CONVIENE EMPEZAR. La quincena pasada terminó un día, y la que
          sigue empieza al otro: decirlo evita las dos formas de equivocarse —
          dejar días sin pagar, o pisar una quincena que ya se pagó (que el
          servidor rechaza al cerrar). Se dice y se marca; no se elige solo. */}
      {sugerido && !pedido && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
          La última quincena cerrada de <b>{etiquetaEmpresa(empresa)}</b> terminó el{" "}
          <b>{fechaCorta(sugerido.ultimaHasta)}</b>, así que esta empieza el{" "}
          <b>{fechaCorta(sugerido.inicio)}</b> — está marcado en el calendario. Puedes elegir otro
          día si hace falta.
        </p>
      )}

      {/* ── 🔴 EL CALENDARIO, A LA VISTA HASTA QUE SE GENERA ──────────────────
          Dos meses en escritorio, uno con scroll en el teléfono, y abajo el
          resumen con el botón. Es el primer paso de la pantalla: esconderlo
          detrás de un desplegable es lo que Daniel encontró mal. */}
      {calendarioAbierto && (
        <RangoFechas
          desde={desde} hasta={hasta} label={null} inline accion={botonGenerar}
          vacio={!elegido}
          sugerido={diaSugerido}
          onChange={(d, h) => { setDesde(d); setHasta(h); setElegido(true); }}
        />
      )}

      {/* ═══ EL ESTADO DE ESTA QUINCENA ═════════════════════════════════════ */}

      {/* ⚠️ FALTA CORRER LA MIGRACIÓN. No es un error y no rompe nada: la
          planilla se calcula, se revisa y se imprime igual — lo único que no
          hay todavía es dónde registrar el cierre. Por eso va en ÁMBAR y con el
          nombre del archivo, que es lo que hay que correr. */}
      {faltaMigracionCierre && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {faltaMigracionCierre}
        </p>
      )}

      {/* 🔴 EL CUADRO QUEDÓ VIEJO. Pasa por dos motivos y se dicen los dos: o
          alguien cambió lo elegido arriba, o tocó algo que mueve la plata. En
          ninguno de los dos se recalcula solo: el número se mueve cuando la
          persona lo pide. */}
      {vieja && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2.5">
          <p className="text-sm font-medium text-amber-900">
            Los números que ves son de antes
          </p>
          <p className="mt-0.5 text-[13px] text-amber-900">
            {!coincide
              ? "Cambiaste el período o la empresa, así que este cuadro ya no es el de lo que está elegido arriba."
              : "Cambiaste algo que mueve la plata (un monto a mano, un préstamo aprobado) y el cuadro no se rehace solo."}
            {" "}Toca <b>{data && coincide ? "Regenerar" : "Generar"}</b> para verlo con ese cambio.
          </p>
        </div>
      )}

      {/* 🔴 YA ESTÁ CERRADA. Dice quién y cuándo, y lo que quedó congelado. */}
      {cerrada && (
        <div className="rounded-lg border border-gray-300 bg-gray-50 px-3 py-2.5">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900">
                Quincena cerrada{cerrada.version > 1 ? ` · versión ${cerrada.version}` : ""}
              </p>
              <p className="mt-0.5 text-[13px] text-gray-600">
                La cerró <b>{cerrada.cerradaPor}</b> el {cuandoBonito(cerrada.cerradaEn)} —{" "}
                {cerrada.personas} {cerrada.personas === 1 ? "persona" : "personas"}, neto{" "}
                <b>${$(cerrada.totalNeto)}</b>. Esos números quedaron congelados: aunque después
                alguien corrija una marcación, lo que se pagó no cambia.
              </p>
            </div>
            {puedeCerrarla && (
              <button
                type="button"
                onClick={() => setModal("reabrir")}
                className="min-h-[44px] shrink-0 rounded-md border border-gray-300 px-3 text-sm font-medium text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97]"
              >
                Reabrir
              </button>
            )}
          </div>
          {/* 🔴 LA DERIVA SE DENUNCIA. El cuadro de arriba se acaba de calcular
              con los datos de HOY; el cerrado es de cuando se cerró. Si no dan
              lo mismo, algo cambió después del pago y hay que saberlo — pero lo
              que vale sigue siendo lo cerrado. */}
          {!!data && Math.abs(data.totales.netoPagar - cerrada.totalNeto) > 0.005 && (
            <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
              Ojo: el cuadro que ves ahora da <b>${$(data.totales.netoPagar)}</b> y lo que se cerró
              fue <b>${$(cerrada.totalNeto)}</b>. Cambió algo después del cierre. Vale lo cerrado;
              si hay que rehacerlo, hay que reabrir la quincena.
            </p>
          )}
        </div>
      )}

      {/* 🔴 SE PISA CON UNA CERRADA. Una persona no puede quedar pagada dos
          veces por el mismo día: no se puede cerrar, y se NOMBRA cuál estorba
          con un botón para ir a verla. */}
      {!cerrada && solapadas.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-[13px] text-red-800">{textoSolapamiento(solapadas)}</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {solapadas.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => irACerrada(c)}
                className="min-h-[44px] rounded-md border border-red-300 bg-white px-3 text-[13px] font-medium text-red-800 transition hover:border-red-500 active:scale-[0.97]"
              >
                Ver la del {c.etiqueta || etiquetaRangoGuardado(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 🔴 LOS FRENOS. No es un aviso: es un NO. Lo que quedó sin aprobar no se
          paga, y una vez cerrada la quincena el aviso no le devuelve la plata a
          nadie. El texto viene del servidor y ya nombra la pestaña. */}
      {frenos.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5">
          <p className="text-sm font-medium text-red-900">No se puede cerrar la quincena todavía</p>
          <ul className="mt-1 space-y-1.5">
            {frenos.map((f) => (
              <li key={f.tipo} className="text-[13px] text-red-800">
                {f.texto}
                {/* 🔴 CADA NOMBRE LLEVA A LA PERSONA (3-sep-2026). Daniel: *«al
                    hacer clic en el mensaje de aprobacion, que te lleve al
                    colaborador para aprobar»*. Mismo nivel → `replace`. Un 409
                    viejo sin `codigos` cae al enlace único de antes. */}
                {f.tipo === "horas-extra" && (
                  f.codigos && f.codigos.length === f.quienes.length ? (
                    <span className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
                      {f.codigos.map((codigo, i) => (
                        <Link
                          key={codigo}
                          href={enlaceAprobaciones(codigo, pedido ? { desde: pedido.desde, hasta: pedido.hasta } : null)}
                          replace
                          scroll={false}
                          className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-2"
                        >
                          {f.quienes[i]}
                        </Link>
                      ))}
                    </span>
                  ) : (
                    <>
                      {" "}
                      <Link
                        href="/asistencia?tab=aprobaciones"
                        replace
                        scroll={false}
                        className="inline-flex min-h-[44px] items-center font-medium underline underline-offset-2"
                      >
                        Ir a Aprobaciones
                      </Link>
                    </>
                  )
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 🔴 BORRADOR: todavía no se guardó nada. Va con el botón de cerrar al
          lado, que es la única acción que hay que tomar acá. */}
      {!!data && !vieja && !cerrada && !!data.lineas.length && (
        <div className="flex flex-wrap items-start justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-sm font-medium text-blue-900">Todavía no está cerrada</p>
            <p className="mt-0.5 text-[13px] text-blue-900">
              Esto es un borrador: se vuelve a calcular cada vez que lo generas y no queda
              registrado en ningún lado. Al cerrar la quincena los números quedan congelados,
              con tu nombre y la fecha.
              {!puedeCerrarla && " La cierra contabilidad; aquí puedes generarla, revisarla e imprimirla."}
            </p>
          </div>
          {puedeCerrarla && (
            <button
              type="button"
              onClick={() => setModal("cerrar")}
              disabled={!sePuedeCerrar}
              className="min-h-[44px] shrink-0 rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
            >
              Cerrar quincena
            </button>
          )}
        </div>
      )}

      {/* ── Avisos: todo lo que hay que saber ANTES de descontarle plata a nadie ── */}
      {/* 🔴 EL PERÍODO NO TERMINÓ. Va arriba de todo: los días que no pasaron
          dejaron de contarse como falta —eran $866,99 de $1.127,78 el día que
          se midió— y un número que baja sin explicación se lee como un número
          que no cuadra. */}
      {data?.avisos.periodoAbierto && (
        <p className="rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-[13px] text-blue-900">
          {data.avisos.periodoAbierto.texto}
        </p>
      )}
      {/* 🔴 El código que marca y no tiene ficha: UNA vez, arriba, fuera del
          cuadro de cada empresa. Antes salía tres veces —una por empresa— como
          si fueran tres personas distintas. */}
      {/* 🔴 NADA SE DESCARTA EN SILENCIO. Si la planilla dejó de pagar días por
          una vacación marcada, se dice acá: nombre, rango y monto. Va ARRIBA,
          con los avisos de plata, no escondido en el detalle de una fila. */}
      {data?.avisos.avisoVacacionesNoPagadas && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.avisoVacacionesNoPagadas}
        </p>
      )}

      {data?.avisos.faltaMigracionVacaciones && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionVacaciones}
        </p>
      )}

      {/* 🔴 LO MISMO CON LAS HORAS EXTRA SIN APROBAR. Contadora, textual: *«Sólo
          se pagan las horas extras autorizadas y las reportadas por Julio
          Garay»*. No se pagan — pero se DICEN, con nombre y cantidad, arriba y
          en ámbar. Rechazar sí, esconder no. */}
      {/* 🔴 Y CADA PERSONA ES UN ENLACE (3-sep-2026). Daniel, textual: *«al
          hacer clic en el mensaje de aprobacion, que te lleve al colaborador
          para aprobar»*. Lleva a la pestaña Aprobaciones con `persona=<código>`
          y el MISMO rango que se está mirando; la pestaña abre el primer día
          que esa persona tiene sin aprobar y la resalta. Mismo nivel del
          breadcrumb → `replace`, el Atrás no cicla. `avisoExtraSinAprobar`
          (el párrafo de antes) queda en la respuesta para el Excel/PDF y para
          quien lo lea; acá se arma con la lista. */}
      {!!data?.avisos.extraSinAprobar?.length && (
        <div
          data-testid="aviso-extra-sin-aprobar"
          className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900"
        >
          <p>{cabeceraExtraNoAprobada(data.avisos.extraSinAprobar.length)}</p>
          <ul className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5">
            {data.avisos.extraSinAprobar.map((e) => (
              <li key={e.codigo}>
                <Link
                  href={enlaceAprobaciones(e.codigo, pedido ? { desde: pedido.desde, hasta: pedido.hasta } : null)}
                  replace
                  scroll={false}
                  className="inline-flex min-h-[44px] items-center gap-1 font-medium tabular-nums underline underline-offset-2 hover:text-amber-950"
                >
                  {e.etiqueta} · {horasBonitas(e.minutos)}{e.monto === null ? "" : ` · $${e.monto.toFixed(2)}`}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 🔴 LO QUE EL GUARD RECHAZÓ SE DICE, con el nombre y el motivo. Sin
          esto, la persona cobraría en una sola planilla y el reparto se vería
          «deshecho solo». Ámbar y no rojo: no se rompió nada, está mal cargado. */}
      {data?.avisos.avisoRepartoRechazado && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.avisoRepartoRechazado}
        </p>
      )}
      {data?.avisos.faltaMigracionReparto && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.faltaMigracionReparto}
        </p>
      )}
      {data?.avisos.faltaMigracionAprobaciones && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionAprobaciones}
        </p>
      )}

      {/* 🔴 Y LO MISMO CON EL PRÉSTAMO. Contadora, textual: *«El préstamo si
          debe ser por aprobarlo»*. Lo que no se aprobó no se descontó — pero se
          DICE, con nombre y monto. Es la lección del #651: un freno que esconde
          plata es peor que no tener freno. */}
      {data?.avisos.avisoPrestamoSinAprobar && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          {data.avisos.avisoPrestamoSinAprobar}
        </p>
      )}

      {/* 🔴 Un préstamo con saldo que no es de nadie es plata que NUNCA se va a
          descontar. Va en rojo: pide que una persona haga algo. */}
      {data?.avisos.avisoPrestamoSinAtar && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
          {data.avisos.avisoPrestamoSinAtar}
        </p>
      )}

      {data?.avisos.faltaMigracionAmarrePrestamos && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionAmarrePrestamos}
        </p>
      )}

      {data?.avisos.faltaMigracionPrestamoAprobado && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionPrestamoAprobado}
        </p>
      )}

      {data?.avisos.avisoSinFicha && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.avisoSinFicha}{" "}
          Se le da de alta en <b>Configuración</b>.
        </p>
      )}
      {/* 🔴 EL AVISO DEL RANGO LIBRE. Va PRIMERO y no se esconde detrás de un ⓘ:
          en un rango que no es una quincena, el sueldo base se reparte y los
          montos escritos a mano no entran. Quien imprima este cuadro para pagar
          tiene que leer eso antes que cualquier otra cosa. */}
      {/* 🔴 UNA LÍNEA, NO UN PÁRRAFO. Eran tres viñetas, escritas cuando el
          rango era la excepción; hoy es el único modo y ese bloque saldría en
          cada cuadro que no cuadre con una quincena. Se conserva lo único que
          es PLATA —que el sueldo base se reparte, y en qué proporción—, porque
          eso cambia el número y nada se descarta en silencio. Lo de los montos
          a mano se dice donde están los campos, no acá. */}
      {data?.avisos.rangoLibre && (
        <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <b>Estas fechas no son una quincena</b> ({data.avisos.diasCalendario} días): del sueldo
          base se paga <b>{(data.avisos.factorBase * 100).toFixed(1)} %</b> de un quincenal.
        </p>
      )}
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
      {data?.avisos.faltaMigracionBajas && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionBajas}
        </p>
      )}
      {data?.avisos.faltaMigracionServicioProfesional && (
        <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
          {data.avisos.faltaMigracionServicioProfesional}
        </p>
      )}
      {/* 🩸 Que alguien siga marcando después de darse de baja no se esconde:
          o volvió, o alguien está usando su huella. Va en ROJO porque las dos
          explicaciones piden que una persona haga algo. */}
      {!!data?.avisos.marcoDespuesDeIrse && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-800">
          <b>{data.avisos.marcoDespuesDeIrse}</b>{" "}
          {data.avisos.marcoDespuesDeIrse === 1
            ? "persona marcó en el reloj después de la fecha en que salió"
            : "personas marcaron en el reloj después de la fecha en que salieron"}
          . O volvieron a trabajar —hay que reactivarlas en <b>Configuración</b> o la planilla
          les paga cero— o alguien más está usando su huella.
        </p>
      )}
      {!!data?.avisos.fueraPorBaja && (
        <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
          <b>{data.avisos.fueraPorBaja}</b>{" "}
          {data.avisos.fueraPorBaja === 1 ? "persona no sale" : "personas no salen"} en esta
          quincena: ya no trabajaban aquí, o entraron después. Las quincenas en las que sí
          trabajaron siguen igual — se ven eligiendo esa quincena arriba.
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
          cuadro no tiene columna para el sábado, así que esas horas <b>no se pagan aquí</b>: las
          ves en la hoja «Horas» del Excel.
        </p>
      )}

      {/* 🔴 EL VACÍO ES EL ESTADO INICIAL, y dice qué hacer. No es un error ni
          un «no hay datos»: es que nadie eligió todavía qué quincena pagar. */}
      {!elegido && !cargando && (
        <div className="rounded-lg border border-dashed border-gray-200 px-4 py-12 text-center">
          <p className="text-sm font-medium text-gray-700">Elige el período que vas a pagar</p>
          <p className="mt-1 text-[13px] text-gray-500">
            Toca el primer día y el último en el calendario, y después <b>Generar</b>.
          </p>
        </div>
      )}
      {cargando && <p className="py-8 text-center text-sm text-gray-400">Cargando…</p>}
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {!cargando && !error && data?.lineas.length === 0 && (
        <p className="py-10 text-center text-sm text-gray-500">
          No hay nadie en esta empresa para estas fechas. Revisa la pestaña <b>Configuración</b>.
        </p>
      )}

      {!cargando && !error && !!data?.lineas.length && (
        <>
          {/* 🔴 UNA LÍNEA, Y VA DONDE ESTÁN LOS CAMPOS. Los cinco montos que se
              escriben a mano viven por quincena (`asistencia_planilla_manual`,
              con la clave «2026-08-1» y un CHECK que no acepta otra cosa), así
              que en un rango que no es una quincena no hay dónde guardarlos y
              quedan apagados. Enterarse DESPUÉS de escribir un ISR es el
              problema; el porqué se dice acá, sin párrafo. */}
          {data.avisos.rangoLibre && (
            <p className="text-[13px] text-gray-500">
              Los montos a mano se guardan por quincena — escribe las fechas exactas de una
              quincena para poder llenarlos.
            </p>
          )}

          {/* 🔴 EL PRÉSTAMO, TRAÍDO DEL MÓDULO Y CON APROBACIÓN. Va ACÁ ARRIBA
              y no adentro de la fila de cada persona: es la decisión que hay
              que tomar ANTES de mirar el cuadro, y tomarla treinta veces
              abriendo treinta filas es lo que hacía que se tecleara mal. */}
          <PrestamosPorDescontar
            items={data.prestamos}
            onAprobar={aprobarPrestamo}
            // 🔴 Con la quincena cerrada no se aprueba nada: el descuento ya
            // está congelado y aprobarlo ahora no lo cambia. Para tocarlo hay
            // que reabrir, que es una decisión con motivo y firma.
            trabajando={aprobandoPrestamo || !!cerrada}
          />

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
                    <Fila
                      key={l.codigo} l={l} onGuardar={guardar}
                      // Apagados, no escondidos: su ausencia es parte de lo que
                      // hay que ver. Y el motivo va escrito, porque son DOS y se
                      // arreglan distinto — con otras fechas, o reabriendo.
                      bloqueo={bloqueoManuales}
                    />
                  ))}
                  {/* Fuera de planilla a propósito: en GRIS, no en ámbar. El
                      color es la mitad del mensaje — ámbar dice "arreglame". */}
                  {fueraDePlanilla.map((l) => (
                    <tr key={l.codigo} className="border-b border-gray-100 last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-gray-500">
                        {l.etiqueta}
                        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
                      </td>
                      <td colSpan={18} className="px-2 py-2.5 text-[13px] text-gray-500">
                        {MOTIVO_FUERA_DE_PLANILLA} · se le mide la asistencia, no se le calcula pago
                      </td>
                    </tr>
                  ))}
                  {/* 🔴 DECIDILO VOS: en GRIS, con el motivo escrito y con el
                      quincenal que le correspondería, para que la contadora no
                      tenga que calcularlo aparte. No es un error: es una
                      decisión que el sistema no puede tomar. */}
                  {decidir.map((l) => (
                    <tr key={l.codigo} className="border-b border-gray-100 last:border-0">
                      <td className="sticky left-0 z-10 bg-white px-3 py-2.5 text-gray-700">
                        {l.etiqueta}
                        <span className="ml-1.5 text-xs text-gray-400">{l.codigo}</span>
                      </td>
                      <td colSpan={18} className="px-2 py-2.5 text-[13px] text-gray-600">
                        {l.decidirAMano}
                        {l.quincenalReferencia !== null && (
                          <> — la quincena completa le daría <b>${$(l.quincenalReferencia)}</b></>
                        )}
                      </td>
                    </tr>
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
            {/* 🔴 EL PIE QUE EXPLICA EL ASTERISCO. Solo aparece cuando hay algo
                que explicar: un cartel permanente se deja de leer, y éste tiene
                que leerse el día que aparece un número raro en «Ausencias». */}
            {buenas.some((l) => (l.dinero?.ausenciaPorTardanza ?? 0) > 0) && (
              <p className="mt-2 px-1 text-[12px] text-gray-600">
                <span className="font-semibold text-amber-700">*</span>{" "}
                Incluye días en que la persona SÍ vino pero llegó más de{" "}
                {MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. <b>Se descuentan los minutos, igual
                que una tardanza</b> — la columna solo cambia de nombre, el total bruto es el mismo.
                Pasa el cursor por el número para ver cuánto y de cuántos días.
              </p>
            )}
          </div>

          {/* ── CELULAR: una tarjeta por persona ── */}
          <div className="space-y-2 md:hidden">
            {buenas.map((l) => (
              <Tarjeta
                key={l.codigo} l={l}
                abierta={abierta === l.codigo}
                onToggle={() => setAbierta(abierta === l.codigo ? null : l.codigo)}
                onGuardar={guardar}
                bloqueo={bloqueoManuales}
              />
            ))}
            {fueraDePlanilla.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="font-medium text-gray-700">
                  {l.etiqueta} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-gray-500">
                  {MOTIVO_FUERA_DE_PLANILLA} · se le mide la asistencia, no se le calcula pago
                </p>
              </div>
            ))}
            {decidir.map((l) => (
              <div key={l.codigo} className="rounded-lg border border-gray-200 bg-white p-3">
                <p className="font-medium text-gray-700">
                  {l.etiqueta} <span className="text-xs text-gray-400">{l.codigo}</span>
                </p>
                <p className="mt-0.5 text-[13px] text-gray-600">
                  {l.decidirAMano}
                  {l.quincenalReferencia !== null && (
                    <> — la quincena completa le daría <b>${$(l.quincenalReferencia)}</b></>
                  )}
                </p>
              </div>
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

          {!!fueraDePlanilla.length && (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
              <b>{fueraDePlanilla.length}</b>{" "}
              {fueraDePlanilla.length === 1 ? "persona no va" : "personas no van"} en la planilla
              (servicio profesional). {EXPLICACION_SERVICIO_PROFESIONAL} Se cambia en{" "}
              <b>Configuración</b>.
            </p>
          )}

          {/* 🔴 DOS listas con nombre propio, no una bolsa. «Tú decides» va en
              GRIS y sin mandar a Configuración: ahí no hay nada que arreglar.
              El rótulo se llamó «Decidilo vos» hasta el 1-sep-2026; se renombró
              porque era voseo y este sistema habla tuteo neutro. Es el MISMO
              grupo (`grupoDeLinea === "decidir"`), solo cambió cómo se lee. */}
          {!!decidir.length && (
            <p className="rounded-md bg-gray-50 px-3 py-2 text-[13px] text-gray-600">
              <b>Tú decides:</b> {decidir.length}{" "}
              {decidir.length === 1 ? "persona quedó" : "personas quedaron"} fuera del total porque
              el sistema no puede saber cuánto le toca —está justificada, o entró o salió a mitad
              del período—. <b>No es un error y no hay nada que arreglar</b>: al lado de cada una
              está el motivo y lo que le daría la quincena completa. Para sacar lo suyo, usa{" "}
              <b>Rango de fechas</b> aquí arriba.
            </p>
          )}
          {!!pendientes.length && (
            <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
              <b>Falta un dato:</b> {pendientes.length}{" "}
              {pendientes.length === 1 ? "persona quedó" : "personas quedaron"} fuera del total
              porque falta configurarles algo. <b>No valen $0</b> — se arreglan en la pestaña{" "}
              <b>Configuración</b>.
            </p>
          )}
        </>
      )}

      {/* La fórmula se aprende UNA vez y no cambia ninguna decisión al abrir la
          pantalla: va al ⓘ. Todo lo de arriba —los avisos de plata— se queda
          en pantalla. */}
      {modal && data && (
        <ModalCierre
          modo={modal}
          empresa={data.empresaEtiqueta ?? etiquetaEmpresa(empresa)}
          rango={etiquetaRangoGuardado({ desde, hasta })}
          totales={data.totales}
          cerrada={cerrada}
          trabajando={trabajandoCierre}
          onConfirmar={(motivo) => { void (modal === "cerrar" ? cerrarQuincena() : reabrir(motivo)); }}
          onCerrar={() => { if (!trabajandoCierre) setModal(null); }}
        />
      )}

      <div className="-ml-2">
        <Ayuda titulo="Cómo se calcula el neto" etiqueta="Cómo se calcula el neto">
          <p>{FORMULA_NETO}</p>
          <p className="mt-1.5">
            Los recargos, los porcentajes de seguro y la hora de corte se cambian en{" "}
            <b>Configuración</b>. El ISR, el préstamo, los terceros, la mercancía y los otros
            servicios se escriben a mano aquí: no salen de ningún sistema.
          </p>
        </Ayuda>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// LA VENTANA DE CERRAR / REABRIR
//
// 🔴 CONFIRMAR SOLO LO IRREVERSIBLE, y cerrar una quincena lo es: firma un pago
// y después hay que reabrir —con motivo y con nombre— para tocarlo. Generar no
// pregunta nada: no escribe.
//
// 🔴 Y LA CONFIRMACIÓN DICE QUÉ SE VA A CERRAR, con números: empresa, fechas,
// cuánta gente y el neto. Un «¿Estás seguro?» pelado no le da a nadie con qué
// darse cuenta de que tiene la empresa equivocada elegida.
//
// Patrón de la casa para iOS: `createPortal` + `inset-0` + `useBodyScrollLock`,
// y SIN `autoFocus` (en iPhone el teclado salta encima antes de que se lea).
// ─────────────────────────────────────────────────────────────────────────────

function ModalCierre({
  modo, empresa, rango, totales, cerrada, trabajando, onConfirmar, onCerrar,
}: {
  modo: "cerrar" | "reabrir";
  empresa: string;
  rango: string;
  totales: TotalesPlanilla;
  cerrada: CabeceraGuardada | null;
  trabajando: boolean;
  onConfirmar: (motivo: string) => void;
  onCerrar: () => void;
}) {
  useBodyScrollLock(true);
  const [motivo, setMotivo] = useState("");
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);

  const reabriendo = modo === "reabrir";
  // 🔴 La MISMA regla que la ruta y que el CHECK de la base: en blanco no vale,
  // y «   » tampoco. Tres capas, como el motivo de una corrección de marcación.
  const listo = reabriendo ? motivoReaperturaValido(motivo) !== null : true;

  if (!montado) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4"
      onClick={onCerrar}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-gray-200 bg-white sm:rounded-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-5 py-4">
          <div>
            <h2 className="text-base font-medium text-gray-900">
              {reabriendo ? "Reabrir la quincena" : "Cerrar la quincena"}
            </h2>
            <p className="mt-0.5 text-[13px] text-gray-500">{empresa} · {rango}</p>
          </div>
          <button
            type="button" onClick={onCerrar} aria-label="Cerrar"
            className="-mr-2 -mt-1 min-h-[44px] min-w-[44px] text-2xl leading-none text-gray-400 transition hover:text-black"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {reabriendo ? (
            <>
              <p className="text-[13px] text-gray-600">
                {cerrada && (
                  <>La cerró <b>{cerrada.cerradaPor}</b> el {cuandoBonito(cerrada.cerradaEn)}, con un
                  neto de <b>${$(cerrada.totalNeto)}</b>. </>
                )}
                Reabrir <b>no borra nada</b>: ese cuadro se queda guardado con sus montos y su
                firma, y si se vuelve a cerrar nace una versión nueva.
              </p>
              <label className="block">
                <span className="text-[13px] font-medium text-gray-700">¿Por qué se reabre?</span>
                <textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  rows={3}
                  placeholder="Faltó cargar la incapacidad de Briceida"
                  className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-base outline-none transition focus:border-black sm:text-sm"
                />
                <span className="mt-1 block text-[12px] text-gray-500">
                  Queda registrado con tu nombre. Es lo único que permite entender dentro de un mes
                  por qué los números de esta quincena cambiaron.
                </span>
              </label>
            </>
          ) : (
            <>
              {/* Los cuatro números, en una línea: es lo que deja darse cuenta
                  de que está elegida la empresa equivocada antes de firmar. */}
              <p className="rounded-md border border-gray-200 bg-gray-50 px-3 py-2.5 text-[13px] tabular-nums text-gray-700">
                Se congelan <b>{totales.personas} {totales.personas === 1 ? "persona" : "personas"}</b>,
                con un <b>neto a pagar de ${$(totales.netoPagar)}</b> — bruto ${$(totales.totalBruto)},
                deducciones ${$(totales.totalDeducciones)}.
              </p>
              <p className="text-[13px] text-gray-600">
                Al cerrarla, <b>estos números quedan congelados</b>: aunque después alguien corrija
                una marcación o cambie un horario, lo que se pagó no cambia. Queda guardado con tu
                nombre y la fecha. Para corregirla hay que <b>reabrirla</b>, y reabrir pide un
                motivo por escrito.
              </p>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-100 px-5 py-3">
          <button
            type="button" onClick={onCerrar} disabled={trabajando}
            className="min-h-[44px] rounded-md border border-gray-300 px-3 text-sm text-gray-700 transition hover:border-black hover:text-black active:scale-[0.97] disabled:opacity-40"
          >
            Mejor no
          </button>
          <button
            type="button"
            onClick={() => onConfirmar(motivo.trim())}
            disabled={!listo || trabajando}
            className="min-h-[44px] rounded-md bg-black px-4 text-sm font-medium text-white transition active:scale-[0.97] disabled:opacity-40"
          >
            {trabajando
              ? "Un momento…"
              : reabriendo ? "Reabrir la quincena" : "Cerrar quincena"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// EL BLOQUE DE PRÉSTAMOS
//
// ── 🔴 POR QUÉ ESTÁ ACÁ Y NO EN LA PESTAÑA «APROBACIONES» ────────────────────
//
// Aquella pestaña la ve el usuario `bodega` —con el que trabaja Julio Garay—, y
// a propósito NO le llega un solo sueldo: el servidor le recorta la respuesta
// (ver `soloApruebaRoles()` en `roles.ts`). Un descuento de préstamo ES plata
// del sueldo, así que vive donde vive la planilla y lo aprueba quien la arma.
//
// ── ⚠️ LO NO APROBADO NO SE ESCONDE ─────────────────────────────────────────
//
// Las ya aprobadas SIGUEN EN LA LISTA. Una lista de solo pendientes no deja
// retirar nada, y un toque de más no puede ser irreversible. Es la misma forma
// que la pantalla de horas extra.
// ─────────────────────────────────────────────────────────────────────────────

type OnAprobarPrestamo = (
  personas: Array<{ codigo: string; monto: number }>,
  aprobado: boolean,
) => void;

function PrestamosPorDescontar({
  items, onAprobar, trabajando,
}: {
  // 🩸 `undefined` A PROPÓSITO, y no es defensa de más: esta pantalla se
  // rehidrata con la respuesta que SWR dejó guardada, y una respuesta anterior
  // a este cambio no trae el campo. Un `items.length` pelado revienta la
  // planilla ENTERA en el primer render después del deploy — la pantalla con la
  // que se paga, en blanco, por un bloque que es un extra.
  items: SugerenciaPrestamo[] | undefined;
  onAprobar: OnAprobarPrestamo;
  trabajando: boolean;
}) {
  // Sin nada que descontar no hay bloque. Un cartel permanente es un cartel que
  // se deja de leer — misma regla que el resto del módulo.
  if (!items?.length) return null;

  const pendientes = items.filter((s) => !s.aprobado);
  const totalPendiente = pendientes.reduce((a, s) => a + s.sugerido, 0);

  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2.5">
        <div className="text-sm font-semibold text-gray-800">
          Préstamos por descontar
          <span className="ml-2 font-normal text-gray-500">
            {pendientes.length === 0
              ? `${items.length} ${items.length === 1 ? "aprobado" : "aprobados"}`
              : `${pendientes.length} sin aprobar · $${$(totalPendiente)}`}
          </span>
        </div>
        {pendientes.length > 1 && (
          <button
            type="button"
            disabled={trabajando}
            onClick={() =>
              onAprobar(pendientes.map((s) => ({ codigo: s.codigo, monto: s.sugerido })), true)}
            className="min-h-[44px] rounded-md bg-gray-900 px-3 text-[13px] font-medium text-white disabled:opacity-50"
          >
            Aprobar {pendientes.length}
          </button>
        )}
      </div>

      <ul className="divide-y divide-gray-100">
        {items.map((s) => (
          <li key={s.codigo} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium text-gray-900">
                {s.etiqueta}
                {/* 🔴 EL NOMBRE DE PRÉSTAMOS VA A LA VISTA cuando NO es el
                    mismo. El amarre lo hizo una migración con una lista
                    explícita, y quien mira tiene que poder verlo: es la única
                    forma de que un amarre equivocado se note. */}
                {s.nombrePrestamos.toUpperCase() !== s.etiqueta.toUpperCase() && (
                  <span className="ml-1.5 font-normal text-gray-400">
                    (en Préstamos: {s.nombrePrestamos})
                  </span>
                )}
              </div>
              <div className="text-xs text-gray-500">
                {s.origen === "descontado"
                  // 🔑 Ya lo registró el módulo en esta quincena: no es una
                  // estimación, es lo que de verdad se le descontó.
                  ? <>Ya descontado en Préstamos esta quincena · saldo ${$(s.saldo)}</>
                  : <>Cuota ${$(s.cuota)} · saldo ${$(s.saldo)}</>}
                {s.aprobado && s.por && <> · aprobó {s.por}</>}
              </div>
              {/* 🔴 Aprobado, pero lo que hay ya no es lo que se aprobó. Se dice
                  con los DOS números y no se corrige solo: una plata que se
                  mueve sola es peor que una que se explica. */}
              {s.cambio && (
                <div className="text-xs text-amber-700">
                  Se aprobó ${$(s.montoVisto ?? 0)}; hoy el módulo dice ${$(s.sugerido)} y la
                  casilla dice ${$(s.enCasilla)}.
                </div>
              )}
            </div>
            <div className="tabular-nums text-[13px] font-semibold text-gray-900">
              ${$(s.sugerido)}
            </div>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => onAprobar([{ codigo: s.codigo, monto: s.sugerido }], !s.aprobado)}
              className={`min-h-[44px] rounded-md px-3 text-[13px] font-medium disabled:opacity-50 ${
                s.aprobado
                  ? "border border-gray-300 text-gray-700"
                  : "bg-gray-900 text-white"
              }`}
            >
              {s.aprobado ? "Quitar" : "Aprobar"}
            </button>
          </li>
        ))}
      </ul>

      <p className="border-t border-gray-100 px-3 py-2 text-xs text-gray-500">
        Aprobar escribe el monto en la casilla <b>Préstamo</b> del cuadro, y la casilla se
        puede corregir a mano después. El saldo lo lleva el módulo de <b>Préstamos</b>: aquí no
        se cambia.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

type OnGuardar = (codigo: string, campo: keyof ManualesLinea, valor: string) => void;

/** Una celda de dinero que se escribe a mano. Guarda al salir del campo. */
function CeldaManual({
  codigo, campo, valor, onGuardar, ancho = "w-20", bloqueo,
}: {
  codigo: string; campo: keyof ManualesLinea; valor: number; onGuardar: OnGuardar;
  ancho?: string;
  /** 🔴 Por qué está apagada. `null` = se puede escribir. */
  bloqueo?: Bloqueo;
}) {
  const bloqueada = !!bloqueo;
  // 🔑 Estado local mientras se escribe: si el valor viniera del padre en cada
  // tecla, el recargo de la fila pisaría lo que la persona está tecleando.
  const [texto, setTexto] = useState(valor ? String(valor) : "");
  useEffect(() => { setTexto(valor ? String(valor) : ""); }, [valor]);

  return (
    <input
      type="text" inputMode="decimal" value={bloqueada ? "" : texto}
      placeholder={bloqueo ? bloqueo.placeholder : "—"}
      disabled={bloqueada}
      title={bloqueo ? bloqueo.title : undefined}
      onChange={(e) => setTexto(e.target.value)}
      onBlur={() => onGuardar(codigo, campo, texto)}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className={`${ancho} min-h-[44px] rounded border border-gray-200 bg-white px-1.5 text-right text-sm tabular-nums outline-none transition focus:border-black disabled:bg-gray-100 disabled:text-gray-400 disabled:placeholder:text-[10px]`}
    />
  );
}

function Fila({
  l, onGuardar, bloqueo,
}: { l: LineaPlanilla; onGuardar: OnGuardar; bloqueo?: Bloqueo }) {
  const d = l.dinero!;
  /** El monto sobre el que se calcularon los seguros, si no fue el bruto. */
  const sobreQueBase = baseSeguros(d.baseSeguros);
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
        {/* 🔑 Sin esto, los ceros de ausencias, tardanzas y extras se leen como
            un error de cálculo. El chip dice que están en cero A PROPÓSITO. */}
        {l.noMarcaReloj && (
          <span className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500">
            {CHIP_NO_MARCA_RELOJ}
          </span>
        )}
        {/* 🔴 SU SUELDO SE PAGA ENTRE DOS EMPRESAS, Y ESTA LÍNEA ES SOLO UNA
            PARTE. Sin el chip, un quincenal de $400 donde la ficha dice $1.000
            se lee como un error de carga. Dice cuánto paga ESTA empresa y si
            acá caen las horas extra, que es lo que explica el resto. */}
        {l.parte && (
          <span
            className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500"
            title={`${l.empresaEtiqueta ?? l.parte.empresa} le paga ${$$(l.parte.salarioMensual)} al mes de un sueldo de ${$$(l.salarioMensual ?? 0)}.`
              + (l.parte.llevaHorasExtra ? " Las horas extra se pagan aquí." : " Las horas extra se pagan en la otra empresa.")}
          >
            {CHIP_REPARTIDO}
          </span>
        )}
        {/* 🔴 POR QUÉ SU SEGURO ES DISTINTO. Sin esto, quien mira la línea de
            RODRIGO y ve $17,06 donde esperaba $39,38 no tiene forma de saber de
            dónde sale sin preguntarle a alguien. El sello dice el monto sobre
            el que se calculó, que es todo lo que hace falta para reconstruirlo.
            Sale de `dinero.baseSeguros` —el que DE VERDAD se multiplicó, ya
            repartido si el rango no es una quincena entera—, no de la ficha. */}
        {sobreQueBase !== null && (
          <span
            className="ml-1.5 rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-500"
            title={`Los seguros no salen de su total bruto: se calculan sobre ${$$(sobreQueBase)}.`}
          >
            {chipBaseSeguros(sobreQueBase)}
          </span>
        )}
      </td>
      {num(d.salarioQuincenal)}
      {num(d.extraDiurno)}
      {/* 🔴 EL ASTERISCO NO ES ADORNO. En el escritorio esta celda es todo lo
          que la contadora ve de la ausencia, y desde el 25-ago-2026 puede traer
          minutos de alguien que VINO TODOS LOS DÍAS. Sin la marca, ella lee una
          ausencia donde sabe que la persona trabajó. El `title` da el detalle
          y el pie de la tabla explica qué significa el asterisco. */}
      <td className={`px-2 py-1.5 text-right tabular-nums text-red-700 ${d.ausencias === 0 ? "" : ""}`}>
        {d.ausencias === 0 ? <span className="text-gray-300">—</span> : (
          <span
            title={d.ausenciaPorTardanza > 0
              ? `${$(d.ausenciaPorTardanza)} de estos ${$(d.ausencias)} son de ${l.horas.tardanzaGraveDias} día(s) en que llegó más de ${MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. Se descuentan los minutos, igual que una tardanza.`
              : undefined}
          >
            {$(d.ausencias)}
            {d.ausenciaPorTardanza > 0 && <span className="ml-0.5 text-amber-700">*</span>}
          </span>
        )}
      </td>
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
          <CeldaManual codigo={l.codigo} campo={campo} valor={l.manuales[campo]}
            onGuardar={onGuardar} bloqueo={bloqueo} />
        </td>
      ))}
      {num(d.totalDeducciones)}
      <td className="px-1 py-1.5 text-right">
        <CeldaManual codigo={l.codigo} campo="otrosServicios" valor={l.manuales.otrosServicios}
          onGuardar={onGuardar} bloqueo={bloqueo} />
      </td>
      {num(d.netoPagar, "font-semibold text-gray-900")}
    </tr>
  );
}

function Tarjeta({
  l, abierta, onToggle, onGuardar, bloqueo,
}: {
  l: LineaPlanilla; abierta: boolean; onToggle: () => void; onGuardar: OnGuardar;
  bloqueo?: Bloqueo;
}) {
  const d = l.dinero!;
  const h = l.horas;
  /** El monto sobre el que se calcularon los seguros, si no fue el bruto.
   *  Por el MISMO lector que el escritorio: dos formas de decidir si se muestra
   *  el sello es como una pantalla lo muestra y la otra no. */
  const sobreQueBaseTarjeta = baseSeguros(d.baseSeguros);
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
            {l.noMarcaReloj && ` · ${CHIP_NO_MARCA_RELOJ}`}
            {/* El mismo sello que en el escritorio, con las MISMAS palabras. */}
            {l.parte && ` · ${CHIP_REPARTIDO}`}
            {/* El mismo sello que en el escritorio, y con las MISMAS palabras:
                dos redacciones del mismo hecho es la forma de que se separen. */}
            {sobreQueBaseTarjeta !== null && ` · ${chipBaseSeguros(sobreQueBaseTarjeta)}`}
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
          {linea(`Excedente (${aHoras(h.excedenteMin)} h — no se usa, va al 1.50)`, d.excedente)}
          {linea(`Domingos (${aHoras(h.domingoMin)} h)`, d.domingos)}
          {linea(`Feriados (${aHoras(h.feriadoMin)} h)`, d.feriados)}
          {/* 🔴 LAS DOS ETIQUETAS SALEN DE `planilla.ts`, y no se arman acá.
              Desde el 25-ago-2026 estas dos columnas SE REPARTEN los mismos
              minutos —más de 30 tarde se muestran en «Ausencias»— y escribir el
              texto en la pantalla es la forma de que los minutos dejen de
              cuadrar con los dólares de al lado sin que nadie lo note. */}
          {linea(`Ausencias (${textoAusencias(h)})`, d.ausencias, true)}
          {linea(`Tardanzas (${textoTardanzas(h)})`, d.tardanzas, true)}
          <div className="mt-1 flex justify-between border-t border-gray-200 pt-1 font-semibold">
            <span>Total bruto</span>
            <span className="tabular-nums">${$(d.totalBruto)}</span>
          </div>

          <div className="mt-2">
            {linea("Seguro social", d.seguroSocial, true)}
            {linea("Seguro educativo", d.seguroEducativo, true)}
            {/* Una línea gris, no un párrafo: dice sobre qué monto salieron los
                dos de arriba cuando NO fue el bruto. */}
            {sobreQueBaseTarjeta !== null && (
              <p className="py-0.5 text-[12px] text-gray-500">
                Los dos se calculan sobre {$$(sobreQueBaseTarjeta)}, no sobre el total bruto.
              </p>
            )}
          </div>

          {/* Sin rótulo de grupo: cada campo ya dice su nombre y para qué lado
              va («resta» / «suma»), y que se escriben a mano lo dice el ⓘ del
              pie de la pantalla. */}
          <div className="mt-3 grid grid-cols-2 gap-2">
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
                  onGuardar={onGuardar} ancho="w-full" bloqueo={bloqueo}
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
              {/* ⚠️ «minutos que llegó tarde» y no «minutos de tardanza»: desde
                  el 25-ago-2026 esos minutos se reparten entre las dos columnas,
                  así que llamarlos «de tardanza» ya no cuadraría con el monto
                  que la columna «Tardanzas» muestra al lado. */}
              {h.tardanzaDeDiasARevisarMin > 0 && (
                <> — de ahí salen <b>{fmtMin(h.tardanzaDeDiasARevisarMin)}</b> de los {fmtMin(h.tardanzaMin)} minutos
                que llegó tarde. Míralos antes de descontar.</>
              )}
            </p>
          )}
          {/* 🔴 UN MONTO EN «AUSENCIAS» DE ALGUIEN QUE VINO TODOS LOS DÍAS NO
              PUEDE QUEDAR SIN EXPLICACIÓN. Es la contadora la que revisa este
              cuadro, y sin esta línea vería una ausencia donde ella sabe que la
              persona trabajó. Se dice el monto y de dónde sale. */}
          {d.ausenciaPorTardanza > 0 && (
            <p className="mt-2 rounded bg-blue-50 px-2 py-1.5 text-[12px] text-blue-900">
              De los <b>${$(d.ausencias)}</b> de ausencia, <b>${$(d.ausenciaPorTardanza)}</b> son de{" "}
              <b>{h.tardanzaGraveDias}</b> {h.tardanzaGraveDias === 1 ? "día" : "días"} en que llegó más de{" "}
              {MINUTOS_TARDE_QUE_SON_AUSENCIA} minutos tarde. <b>Se descuentan los minutos, igual que una
              tardanza</b> — la columna solo cambia de nombre, el monto es el mismo.
            </p>
          )}
          {/* 🔴 UN MONTO EN «AUSENCIAS» QUE SALE DE UNAS VACACIONES TAMPOCO
              PUEDE QUEDAR SIN EXPLICACIÓN, y acá además hay que decir que NO
              es una ausencia: la persona no faltó, se tomó vacaciones que ya
              había cobrado. */}
          {d.vacacionesYaPagadas > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-900">
              De los <b>${$(d.ausencias)}</b>, <b>${$(d.vacacionesYaPagadas)}</b> son{" "}
              <b>{h.vacacionesYaPagadasDias}</b>{" "}
              {h.vacacionesYaPagadasDias === 1 ? "día" : "días"} de <b>vacaciones ya pagadas</b> —
              no faltó: esos días ya se le habían pagado antes, así que no se le pagan otra vez.
            </p>
          )}
          {h.sabadoMin > 0 && (
            <p className="mt-2 rounded bg-amber-50 px-2 py-1.5 text-[12px] text-amber-800">
              Trabajó <b>{aHoras(h.sabadoMin)} h</b> un sábado. No hay columna para el sábado en el
              cuadro, así que esas horas no se pagan aquí.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
