// ─────────────────────────────────────────────────────────────────────────────
// LA FICHA DE UNA PERSONA — qué se LEE y qué es una EXCEPCIÓN (10-sep-2026)
//
// Módulo PURO: sin base, sin red, sin `new Date()`. Decide dos cosas y nada
// más, y las decide en UN solo lugar para que la página, el celular y el
// candado no puedan contradecirse.
//
//   1. QUÉ DICE LA FICHA EN MODO TEXTO. Daniel aprobó que arriba se LEA la
//      información, no que se edite: un formulario permanente hace que once
//      campos pesen lo mismo, y diez de ellos no se tocan nunca.
//
//   2. QUÉ ES UNA EXCEPCIÓN. 🔴 Solo aparece si la persona la tiene. Un rótulo
//      «Paga seguros: sí» en las 37 fichas no informa de nada — es la regla de
//      la casa: *un aviso que sale siempre deja de avisar*. Lo que se dibuja es
//      lo RARO, y por eso el que lo ve sabe que ahí hay algo.
//
// ⚠️ NADA DE ESTO TOCA UN CÁLCULO. Es cómo se presenta la MISMA ficha que ya
// existe; los valores salen del mismo GET de siempre.
// ─────────────────────────────────────────────────────────────────────────────

import { capitalizarNombre } from "@/lib/nombre-en-pantalla";
import { etiquetaEmpresa } from "./config";

/** Lo que la página necesita saber de una persona para dibujarla. */
export interface PersonaFicha {
  codigo: string;
  nombre: string | null;
  posicion?: string | null;
  cedula?: string | null;
  empresa: string | null;
  salarioMensual: number | null;
  jornadaSemanal: number;
  /** La rata por hora que multiplica la planilla (2 decimales). La lista ya no la
   *  muestra (10-sep-2026): vive acá. `undefined` = un payload viejo no la trae. */
  rataHora?: number | null;
  fechaIngreso: string | null;
  fechaSalida?: string | null;
  /** `true` = cobra fijo y no pasa por el reloj. */
  noMarcaReloj: boolean;
  /** `true` = se le descuentan el seguro social y el educativo, los dos juntos. */
  pagaSeguros: boolean;
  /** El monto de UNA quincena sobre el que se calculan. `null` = el bruto. */
  baseSeguros: number | null;
  /** `true` = marca el reloj pero NO va en planilla. */
  servicioProfesional: boolean;
  /** Las partes de un sueldo repartido entre dos empresas. Vacío = una sola. */
  reparto?: readonly { empresa: string; salarioMensual: number }[];
  /** «Renunció el 12 de agosto de 2026». `null` = sigue trabajando. */
  baja?: string | null;
}

/** El guion de la casa para «no hay dato». NUNCA un cero grande ni un vacío. */
export const SIN_DATO = "—";

export interface DatoDeFicha {
  clave: string;
  etiqueta: string;
  valor: string;
  /** `true` = va con `tabular-nums` y alineado a la derecha. */
  numero?: boolean;
}

const money = (n: number | null | undefined): string =>
  n === null || n === undefined || !Number.isFinite(n)
    ? SIN_DATO
    : `$${Number(n).toLocaleString("es-PA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const texto = (v: string | null | undefined): string => {
  const s = String(v ?? "").trim();
  return s === "" ? SIN_DATO : s;
};

/**
 * El nombre como se LEE. 🔴 Solo cambia cómo se muestra: lo guardado sigue en
 * mayúsculas y no se inventa ningún acento (`capitalizarNombre` es el único
 * capitalizador del sistema). Sin nombre cargado, el código — nunca un vacío.
 */
export function tituloDePersona(p: Pick<PersonaFicha, "nombre" | "codigo">): string {
  const n = String(p.nombre ?? "").trim();
  return n === "" ? `Código ${p.codigo}` : capitalizarNombre(n);
}

/**
 * LOS DIEZ DATOS QUE SE LEEN, en el orden en que se leen.
 *
 * 🔑 `fmtFecha` entra por parámetro y no se importa acá: este módulo es puro y
 * el formateador de fechas de la casa vive en `lib/format`. Pasarlo deja que el
 * test compruebe el ORDEN y las etiquetas sin depender de un locale.
 */
export function datosDeLaFicha(
  p: PersonaFicha,
  fmtFecha: (d: string) => string,
): DatoDeFicha[] {
  const fecha = (d: string | null | undefined) => {
    const s = String(d ?? "").trim();
    return s === "" ? SIN_DATO : fmtFecha(s);
  };
  return [
    { clave: "codigo", etiqueta: "Código", valor: String(p.codigo) },
    { clave: "posicion", etiqueta: "Cargo", valor: texto(p.posicion) },
    { clave: "empresa", etiqueta: "Empresa", valor: p.empresa ? etiquetaEmpresa(p.empresa) : SIN_DATO },
    { clave: "ingreso", etiqueta: "Empezó", valor: fecha(p.fechaIngreso) },
    { clave: "cedula", etiqueta: "Cédula", valor: texto(p.cedula) },
    { clave: "salario", etiqueta: "Salario", valor: money(p.salarioMensual), numero: true },
    // 🔴 La rata por hora SALIÓ de la lista (10-sep-2026, Daniel) y queda acá,
    // pegada al salario: es el número exacto con el que multiplica la planilla.
    { clave: "rata", etiqueta: "Rata por hora", valor: money(p.rataHora ?? null), numero: true },
    { clave: "jornada", etiqueta: "Jornada", valor: `${p.jornadaSemanal} h/semana`, numero: true },
    // 🔑 El reloj y los seguros SÍ salen siempre, aunque su valor normal sea el
    // de todos: son las dos preguntas que la contadora hace en voz alta cuando
    // un neto no le cuadra. Lo que no se dibuja cuando es normal son las
    // ETIQUETAS de excepción de abajo, que es otra cosa.
    { clave: "reloj", etiqueta: "Reloj", valor: p.noMarcaReloj ? "Cobra fijo, no marca" : "Marca el reloj" },
    { clave: "seguros", etiqueta: "Seguros", valor: p.pagaSeguros ? "Se le retienen" : "No se le retienen" },
  ];
}

export interface EtiquetaExcepcion {
  clave: string;
  texto: string;
  /** Qué significa, para el `title` y el lector de pantalla. */
  ayuda: string;
  /** `true` = es plata que no se le paga por asistencia (ámbar, no gris). */
  ojo?: boolean;
}

/**
 * 🔴 LO RARO, Y SOLO LO RARO.
 *
 * Una ficha normal —36 de las 37 medidas— NO devuelve ni una etiqueta, y esa
 * es la prueba de que sirve: cuando aparece una, hay algo que mirar.
 *
 * 🩸 Es la lección del chip verde «despachada» de Guías, que salía en 221 de
 * 222 filas: *un color que sale siempre deja de avisar*.
 */
export function excepcionesDeLaFicha(p: PersonaFicha): EtiquetaExcepcion[] {
  const out: EtiquetaExcepcion[] = [];

  if (p.servicioProfesional) {
    out.push({
      clave: "servicio",
      texto: "Servicio profesional",
      ayuda: "Marca el reloj para ver sus tardanzas y ausencias, pero no se le calcula planilla.",
      ojo: true,
    });
  }
  if (p.noMarcaReloj) {
    out.push({
      clave: "no-marca",
      texto: "No marca reloj",
      ayuda: "Cobra fijo: sus horas no salen del reloj.",
    });
  }
  if (!p.pagaSeguros) {
    out.push({
      clave: "sin-seguros",
      texto: "Sin seguros",
      ayuda: "No se le retienen el seguro social ni el educativo.",
      ojo: true,
    });
  }
  if (p.baseSeguros !== null && p.baseSeguros !== undefined) {
    out.push({
      clave: "base-seguros",
      texto: `Seguros sobre ${money(p.baseSeguros)}`,
      ayuda: "Los seguros se calculan sobre este monto por quincena, no sobre el bruto.",
    });
  }
  if ((p.reparto ?? []).length > 0) {
    const donde = (p.reparto ?? []).map((r) => etiquetaEmpresa(r.empresa)).join(" y ");
    out.push({
      clave: "reparto",
      texto: `Sueldo repartido: ${donde}`,
      ayuda: "Cobra en dos planillas. La rata sale del sueldo COMPLETO, no de cada parte.",
    });
  }
  if (String(p.baja ?? "").trim() !== "") {
    out.push({
      clave: "baja",
      texto: String(p.baja).trim(),
      ayuda: "Ya no trabaja aquí. Sus quincenas viejas siguen intactas.",
      ojo: true,
    });
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// LAS CUATRO SECCIONES DE ABAJO
//
// 🔑 La lista vive acá y no en el JSX para que el candado pueda exigir las
// CUATRO sin leer un archivo de pantalla, y para que agregar una quinta sea un
// renglón en un módulo puro.
// ─────────────────────────────────────────────────────────────────────────────

export interface SeccionDePersona {
  clave: "prestamos" | "justificaciones" | "vacaciones" | "asistencia";
  titulo: string;
  /** El rótulo del botón que agrega algo ahí. `null` = la sección no agrega. */
  boton: string | null;
}

export const SECCIONES_DE_PERSONA: readonly SeccionDePersona[] = [
  { clave: "prestamos", titulo: "Préstamos", boton: "+ Préstamo" },
  { clave: "justificaciones", titulo: "Justificaciones", boton: "+ Justificar" },
  { clave: "vacaciones", titulo: "Vacaciones", boton: "+ Vacación" },
  { clave: "asistencia", titulo: "Asistencia del período", boton: null },
] as const;

/**
 * 🔴 UN CERO GRANDE SE LEE COMO DATO ROTO. La sección de préstamos no escribe
 * «$0.00»: dice que no debe nada.
 */
export function textoDeuda(total: number | null | undefined): string {
  const n = Number(total ?? 0);
  if (!Number.isFinite(n) || n <= 0) return "No debe nada";
  return `Debe ${money(n)}`;
}

/**
 * El desglose de la deuda, SOLO con las cuentas que tienen algo. Las tres en
 * cero no se dibujan: sería una fila de ceros debajo de «No debe nada».
 */
export function desgloseDeuda(d: {
  prestamo?: number | null; dano?: number | null; terceros?: number | null;
}): { clave: string; etiqueta: string; valor: string }[] {
  const filas = [
    { clave: "prestamo", etiqueta: "Préstamo", n: Number(d.prestamo ?? 0) },
    { clave: "dano", etiqueta: "Daño de mercancía", n: Number(d.dano ?? 0) },
    { clave: "terceros", etiqueta: "Terceros", n: Number(d.terceros ?? 0) },
  ];
  return filas
    .filter((f) => Number.isFinite(f.n) && f.n > 0)
    .map((f) => ({ clave: f.clave, etiqueta: f.etiqueta, valor: money(f.n) }));
}

/**
 * 🔴 SIN SALDO DE VACACIONES NO SE INVENTA UN CERO. El saldo lo carga
 * contabilidad junto con su fecha de corte; sin los dos, no hay saldo — y decir
 * «0 días» sería afirmar que ya las gastó.
 */
export function textoSaldoVacaciones(dias: number | null | undefined): string {
  if (dias === null || dias === undefined || !Number.isFinite(Number(dias))) {
    return "Falta el saldo";
  }
  const n = Number(dias);
  return n === 1 ? "1 día" : `${n} días`;
}
