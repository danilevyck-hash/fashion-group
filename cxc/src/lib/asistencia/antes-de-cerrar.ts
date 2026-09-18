/* ─────────────────────────────────────────────────────────────────────────────
 * «ANTES DE CERRAR» — la lista compacta de arriba de la planilla (11-sep-2026).
 *
 * Módulo PURO: sin base, sin red, sin `new Date()`.
 *
 * 🩸 Hasta el 11-sep-2026 arriba de la tabla había SIETE cajas de avisos — unas
 * 15 líneas de texto antes del primer número: el corte, «Todavía no está
 * cerrada / Esto es un borrador…», el período sin terminar, las horas extra sin
 * aprobar con los quince nombres, el préstamo sin aprobar, los códigos sin
 * ficha, los que no salen, la hora de salida sin confirmar. Daniel aprobó el
 * mockup: UNA lista, con encabezado «Antes de cerrar · borrador, faltan N días
 * hábiles», arriba lo que hay que ARREGLAR antes de cerrar (número en negrita y
 * enlace a la derecha), abajo en gris lo INFORMATIVO. Sin nombres sueltos
 * —están en Aprobaciones—, sin el párrafo del borrador —lo dice el encabezado—
 * y sin la caja de préstamos —ya no se aprueba—. Cuando no hay nada que
 * arreglar: «Todo listo para cerrar».
 *
 * 🔴 LOS AVISOS NO DESAPARECEN COMO DATOS: la ruta sigue mandando los mismos
 * `avisos` (el Excel y el PDF los siguen leyendo). Acá solo se decide CÓMO se
 * dibujan. Nada se descarta en silencio: cada aviso que existía tiene su línea.
 * ────────────────────────────────────────────────────────────────────────── */

import { enlaceAprobaciones, horasBonitas, type ExtraNoAprobada } from "./aprobaciones";
import { fechaCortaCorte, fraseCorte } from "./elegir-quincena";
import type { CodigoSinFicha } from "./periodo";
import type { PrestamoSinAtar } from "./prestamos-planilla";
import { textoSinDescontar, type SinDescontar } from "./casilla-sin-descontar";
import {
  hrefFilaPlanilla,
  textoCuotasRecortadas,
  textoNetosNegativos,
  type CuotaRecortada,
  type NetoNegativo,
} from "./neto-no-negativo";
import { PESTANA_PRESTAMOS } from "@/lib/prestamos-una-puerta";
import {
  contarDias,
  detalleDias,
  enlaceDiasDe,
  partirImpares,
  type PersonaConMarcasImpares,
} from "./marcas-impares";

/** Una persona detrás de una línea (las de «ver quiénes»). */
export interface PersonaDeLinea {
  codigo: string;
  etiqueta: string;
  href: string;
  /** «2,50 h · $12.20» */
  detalle: string;
}

export interface LineaAntesDeCerrar {
  clave: string;
  /** El número en negrita al principio. `null` = la línea no lleva número. */
  numero: number | null;
  /** El resto de la línea. */
  texto: string;
  /** El enlace a la derecha: a dónde ir a arreglarlo. */
  enlace: { rotulo: string; href: string } | null;
  /**
   * Ámbar con acción = hay que hacer algo antes de cerrar («arreglar»); ámbar
   * sin acción = plata que se movió y se dice con nombre («plata»: vacaciones ya
   * pagadas, la última cuota del préstamo); gris = para saber («info»).
   */
  tono: "arreglar" | "plata" | "info";
  /** Quiénes están detrás, para «ver quiénes» (solo las horas extra). */
  personas?: PersonaDeLinea[];
}

export interface AntesDeCerrar {
  /** «Antes de cerrar · borrador, faltan 3 días hábiles» */
  encabezado: string;
  arreglar: LineaAntesDeCerrar[];
  info: LineaAntesDeCerrar[];
  /** Sin nada que arreglar: la lista dice «Todo listo para cerrar». */
  todoListo: boolean;
}

export const TODO_LISTO = "Todo listo para cerrar";

export interface EntradaAntesDeCerrar {
  /** `null` = el período ya terminó. */
  periodoAbierto: { diasHabiles: number } | null;
  esQuincena: boolean;
  /** El rango que se está mirando, para que los enlaces aterricen en la misma quincena. */
  rango: { desde: string; hasta: string } | null;
  extraSinAprobar: readonly ExtraNoAprobada[];
  sinFicha: readonly CodigoSinFicha[];
  sinHorario: number;
  /** El corte con el que se leyó el reloj, y hasta dónde llega la quincena. */
  corte: string | null;
  hasta: string;
  fueraPorBaja: number;
  marcoDespuesDeIrse: number;
  /** El aviso del reparto rechazado, ya redactado por el servidor (con nombre y motivo). */
  avisoRepartoRechazado: string | null;
  prestamoSinAtar: readonly PrestamoSinAtar[];
  /** El aviso del préstamo (última cuota, quien no cobra aquí), ya redactado. */
  avisoPrestamo: string | null;
  /**
   * 🔴 Las casillas con un 0 a propósito («no descontar esta quincena»,
   * 11-sep-2026). Van en la parte informativa: es una decisión de quien arma
   * el cuadro, no algo que arreglar. Opcional: sin pasarlo, nada cambia.
   */
  sinDescontar?: readonly SinDescontar[];
  /**
   * 🔴 Las cuotas que NO entraron enteras porque el neto no alcanzaba
   * (14-sep-2026, `neto-no-negativo.ts`). Es plata que se movió: va con nombre
   * y monto, en ámbar. Opcional: sin pasarlo, nada cambia.
   */
  recortadas?: readonly CuotaRecortada[];
  /**
   * 🔴 Los netos que quedaron en NEGATIVO por montos escritos a mano
   * (14-sep-2026, `neto-no-negativo.ts` › `netosNegativos`). Va en la parte de
   * ARREGLAR, con nombre, monto y enlace a su fila — pero NO frena el cierre:
   * Daniel dejó el freno para después, a propósito. Opcional: sin pasarlo, nada cambia.
   */
  netosNegativos?: readonly NetoNegativo[];
  /**
   * 🔴 Los días hábiles mal marcados (15-sep-2026, `marcas-impares.ts`). Van en
   * ARREGLAR y FRENAN el cierre (Daniel: *«frenan»*), separados en los de
   * marcas de MENOS y los de MÁS: no son el mismo problema. Opcional: sin
   * pasarlo, nada cambia.
   * ⚠️ 18-sep-2026: la regla pasó de «impar» a «impar O más de 4» (Daniel:
   * *«cuando hay 5 o mas es porq es error»*). Acá no cambió nada — el tipo y el
   * reparto son los mismos—; lo que entra son además los días de 6 marcas.
   */
  marcasImpares?: readonly PersonaConMarcasImpares[];
  /** El aviso de las vacaciones ya pagadas, ya redactado (nombre, rango y monto). */
  avisoVacacionesNoPagadas: string | null;
  /**
   * 🔴 El aviso del DÍA LIBRE DE LA EMPRESA (17-sep-2026, `dia-libre-empresa.ts`):
   * a quién le pagaron las horas extra parte de la deuda y cuánto le queda. Es
   * plata que se movió, así que va con nombre y monto. Opcional: sin pasarlo,
   * nada cambia.
   */
  avisoDiasLibres?: string | null;
  conSabado: number;
  rangoLibre: boolean;
  factorBase: number;
  diasCalendario: number;
  /** Los «falta correr el SQL …» que vengan en la respuesta (los que no son null). */
  migraciones: readonly string[];
  /** Cómo se llama la pestaña de las fichas («Colaboradores»). */
  pestanaFichas: string;
}

const HREF_FICHAS = "/asistencia?tab=colaboradores";

function hrefAprobaciones(rango: { desde: string; hasta: string } | null): string {
  const p = new URLSearchParams({ tab: "aprobaciones" });
  if (rango) { p.set("desde", rango.desde); p.set("hasta", rango.hasta); }
  return `/asistencia?${p.toString()}`;
}

/** «32:10 h» — horas y minutos, para el encabezado de la línea. */
export function horasYMinutos(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${h}:${String(m).padStart(2, "0")} h`;
}

/** El encabezado: qué es y cuánto falta. */
export function encabezadoAntesDeCerrar(
  periodoAbierto: { diasHabiles: number } | null,
  esQuincena: boolean,
): string {
  const que = esQuincena ? "quincena" : "período";
  if (!periodoAbierto) return `Antes de cerrar · borrador, ${que === "quincena" ? "quincena terminada" : "período terminado"}`;
  const n = periodoAbierto.diasHabiles;
  const cuanto = n === 0 ? "no quedan días hábiles" : n === 1 ? "falta 1 día hábil" : `faltan ${n} días hábiles`;
  return `Antes de cerrar · borrador, ${cuanto}`;
}

/** La línea del corte: «Reloj leído hasta el 11 sep; del 12 al 15 se paga normal y se ajusta en la siguiente». */
export function lineaDelCorte(corte: string | null, hasta: string): string | null {
  if (!corte) return null;
  const frase = fraseCorte(corte, hasta);
  const resto = frase ? frase.replace(/^Del /, "del ").replace(/^El /, "el ").replace(/\.$/, "") : null;
  return `Reloj leído hasta el ${fechaCortaCorte(corte)}${resto ? `; ${resto}` : ""}`;
}

export function armarAntesDeCerrar(e: EntradaAntesDeCerrar): AntesDeCerrar {
  const arreglar: LineaAntesDeCerrar[] = [];
  const info: LineaAntesDeCerrar[] = [];
  const fichas = { rotulo: `${e.pestanaFichas} ›`, href: HREF_FICHAS };

  // ── Lo que hay que ARREGLAR antes de cerrar ───────────────────────────────
  if (e.extraSinAprobar.length > 0) {
    const minutos = e.extraSinAprobar.reduce((a, x) => a + x.minutos, 0);
    arreglar.push({
      clave: "extras",
      numero: e.extraSinAprobar.length,
      texto: `con horas extra sin decidir · ${horasYMinutos(minutos)}`,
      enlace: { rotulo: "Aprobaciones ›", href: hrefAprobaciones(e.rango) },
      tono: "arreglar",
      // 🔴 CADA PERSONA SIGUE LLEVANDO A SU DÍA EN APROBACIONES (3-sep-2026,
      // Daniel: «al hacer clic en el mensaje de aprobacion, que te lleve al
      // colaborador para aprobar»). Va detrás de «ver quiénes»: los nombres no
      // se listan sueltos, pero el enlace no se pierde.
      personas: e.extraSinAprobar.map((x) => ({
        codigo: x.codigo,
        etiqueta: x.etiqueta,
        href: enlaceAprobaciones(x.codigo, e.rango),
        detalle: `${horasBonitas(x.minutos)}${x.monto === null ? "" : ` · $${x.monto.toFixed(2)}`}`,
      })),
    });
  }
  if (e.sinFicha.length > 0) {
    const lista = e.sinFicha.map((c) => c.codigo).join(", ");
    arreglar.push({
      clave: "sin-ficha",
      numero: e.sinFicha.length,
      texto: `${e.sinFicha.length === 1 ? "código" : "códigos"} del reloj sin ficha (${lista})`,
      enlace: fichas,
      tono: "arreglar",
    });
  }
  if (e.sinHorario > 0) {
    arreglar.push({
      clave: "sin-horario",
      numero: e.sinHorario,
      texto: "sin su hora de salida confirmada",
      enlace: fichas,
      tono: "arreglar",
    });
  }
  if (e.marcoDespuesDeIrse > 0) {
    arreglar.push({
      clave: "marco-despues",
      numero: e.marcoDespuesDeIrse,
      texto: e.marcoDespuesDeIrse === 1
        ? "marcó después de su fecha de salida: o volvió a trabajar, o alguien más está usando su huella"
        : "marcaron después de su fecha de salida: o volvieron a trabajar, o alguien más está usando su huella",
      enlace: fichas,
      tono: "arreglar",
    });
  }
  if (e.avisoRepartoRechazado) {
    arreglar.push({ clave: "reparto", numero: null, texto: e.avisoRepartoRechazado, enlace: fichas, tono: "arreglar" });
  }
  if (e.prestamoSinAtar.length > 0) {
    const detalle = e.prestamoSinAtar.map((p) => `${p.nombre} · $${p.saldo.toFixed(2)}`).join(" — ");
    arreglar.push({
      clave: "prestamo-sin-atar",
      numero: e.prestamoSinAtar.length,
      texto: `${e.prestamoSinAtar.length === 1 ? "préstamo con saldo sin atar a nadie: no se descuenta" : "préstamos con saldo sin atar a nadie: no se descuentan"} (${detalle})`,
      enlace: { rotulo: "Préstamos ›", href: PESTANA_PRESTAMOS },
      tono: "arreglar",
    });
  }
  // 🔴 «N colaborador queda con neto negativo (X · −$125.16): baja lo que le
  // escribiste a mano en su fila» (14-sep-2026). Sale de la MISMA función que
  // el aviso de la celda (`faltanteDeNeto`). Es ámbar CON acción —hay que
  // mirarlo antes de cerrar— y aun así el cierre NO se frena: el freno quedó
  // fuera por decisión de Daniel (la contadora está aprendiendo el módulo).
  const negativos = e.netosNegativos ?? [];
  const textoNegativos = textoNetosNegativos(negativos);
  if (textoNegativos) {
    arreglar.push({
      clave: "neto-negativo",
      numero: negativos.length,
      texto: textoNegativos,
      enlace: { rotulo: negativos.length === 1 ? "Ver su fila ›" : "Ver sus filas ›", href: hrefFilaPlanilla(negativos[0].codigo) },
      tono: "arreglar",
    });
  }
  // 🔴 «N días con una marca de menos: falta una hora» (15-sep-2026). Dos
  // líneas y no una: al día que le FALTA una marca el motor le lee como salida
  // una marca que no lo es y le descuenta horas trabajadas; al que le SOBRA,
  // casi siempre los números salen bien. ⚠️ La regla es IMPAR, así que un día
  // de 6 marcas no está acá — es par, y puede ser correcto.
  // 🔴 18-sep-2026: ESO ÚLTIMO YA NO VALE. Daniel: *«las quincena solo cierran
  // con 4, hay q quitar hasta que llegue a 4 maximo. cuando hay 5 o mas es porq
  // es error»*. La regla pasó a «impar O más de 4», así que el día de 6 SÍ está
  // acá y cae en «marcas-de-mas». La partición no se tocó: `partirImpares`
  // separa por «menos de 4» y «más de 4», y el 6 ya caía del lado correcto.
  const impares = e.marcasImpares ?? [];
  if (impares.length > 0) {
    const { deMenos, deMas } = partirImpares(impares);
    const linea = (
      clave: string,
      gente: readonly PersonaConMarcasImpares[],
      texto: string,
    ): void => {
      if (gente.length === 0) return;
      arreglar.push({
        clave,
        numero: contarDias(gente),
        texto,
        enlace: { rotulo: "Asistencia ›", href: enlaceDiasDe(gente[0].codigo, e.rango) },
        tono: "arreglar",
        personas: gente.map((p) => ({
          codigo: p.codigo,
          etiqueta: p.etiqueta,
          href: enlaceDiasDe(p.codigo, e.rango),
          detalle: detalleDias(p.dias),
        })),
      });
    };
    linea(
      "marcas-de-menos",
      deMenos,
      "con una marca de MENOS: falta ponerles la hora con «Agregar hora»",
    );
    linea(
      "marcas-de-mas",
      deMas,
      // 🔴 Dice QUÉ hacer, y el botón por su nombre (18-sep-2026): hasta hoy
      // decía «revísalos» porque quitar una marca del reloj no se podía.
      "con marcas de MÁS: quítales la que sobra con «Quitar esta marcación»",
    );
  }
  for (const [i, m] of e.migraciones.entries()) {
    arreglar.push({ clave: `migracion-${i}`, numero: null, texto: m, enlace: null, tono: "arreglar" });
  }

  // ── Lo INFORMATIVO ────────────────────────────────────────────────────────
  const corte = lineaDelCorte(e.corte, e.hasta);
  if (corte) info.push({ clave: "corte", numero: null, texto: corte, enlace: null, tono: "info" });
  if (e.fueraPorBaja > 0) {
    info.push({
      clave: "fuera",
      numero: e.fueraPorBaja,
      texto: `no ${e.fueraPorBaja === 1 ? "sale" : "salen"} en esta ${e.esQuincena ? "quincena" : "planilla"} (${e.fueraPorBaja === 1 ? "salió o entró" : "salieron o entraron"} después)`,
      enlace: null,
      tono: "info",
    });
  }
  // 🔴 LO QUE MUEVE PLATA SE DICE CON NOMBRE Y MONTO, en ámbar (la regla de
  // Daniel que ya cumplían las cajas): no frena el cierre, pero no va en gris.
  if (e.avisoPrestamo) info.push({ clave: "prestamo", numero: null, texto: e.avisoPrestamo, enlace: null, tono: "plata" });
  // 🔴 «N préstamos sin descontar esta quincena, a propósito» — informativo (lo
  // decidió quien está armando el cuadro), pero con nombre y monto: es plata.
  const sinDescontar = textoSinDescontar(e.sinDescontar ?? []);
  if (sinDescontar) {
    info.push({ clave: "sin-descontar", numero: e.sinDescontar!.length, texto: sinDescontar, enlace: null, tono: "info" });
  }
  // 🔴 «N cuotas recortadas para que el neto no quede en negativo» — plata que
  // NO salió del sueldo y sigue debiéndose (14-sep-2026). Con nombre y monto,
  // en ámbar: un recorte silencioso es lo que esta casa no hace.
  const recortadas = textoCuotasRecortadas(e.recortadas ?? []);
  if (recortadas) {
    info.push({ clave: "recortadas", numero: e.recortadas!.length, texto: recortadas, enlace: null, tono: "plata" });
  }
  if (e.avisoVacacionesNoPagadas) info.push({ clave: "vacaciones", numero: null, texto: e.avisoVacacionesNoPagadas, enlace: null, tono: "plata" });
  // 🔴 La columna del extra en cero sin explicación se lee como un error del
  // cuadro. Acá se dice qué pasó: sus horas extra pagaron un día libre.
  if (e.avisoDiasLibres) info.push({ clave: "dias-libres", numero: null, texto: e.avisoDiasLibres, enlace: null, tono: "plata" });
  if (e.conSabado > 0) {
    info.push({
      clave: "sabado",
      numero: e.conSabado,
      texto: `${e.conSabado === 1 ? "trabajó" : "trabajaron"} un sábado: esas horas no se pagan aquí (están en la hoja «Horas» del Excel)`,
      enlace: null,
      tono: "info",
    });
  }
  if (e.rangoLibre) {
    info.push({
      clave: "rango-libre",
      numero: null,
      texto: `Estas fechas no son una quincena (${e.diasCalendario} días): del sueldo base se paga ${(e.factorBase * 100).toFixed(1)} % de un quincenal`,
      enlace: null,
      tono: "info",
    });
  }

  return {
    encabezado: encabezadoAntesDeCerrar(e.periodoAbierto, e.esQuincena),
    arreglar,
    info,
    todoListo: arreglar.length === 0,
  };
}
