// ─────────────────────────────────────────────────────────────────────────────
// MULTIFASHION EN EL CELULAR — «un número y cuatro renglones» (24-sep-2026).
//
// Daniel aprobó el mockup «Un número y cuatro renglones»: en el teléfono el mes
// es UN número grande y las cuatro pestañas son CUATRO RENGLONES que se tocan.
//
// 🩸 QUÉ PASABA ANTES, MEDIDO EL 24-sep-2026 en un iPhone de 390×844:
//   · **308 px de los 844 (36 % de la pantalla) antes del primer número**:
//     barra del sistema, título, el desplegable de período, la banda «HOY» y
//     las cuatro pestañas.
//   · La banda «HOY» decía «jueves, 24 sept · sin ventas todavía» **incluso
//     mirando agosto** — hablaba de hoy en una pantalla que no era de hoy.
//   · El desplegable ofrecía **57 a 65 opciones** (cinco años de meses) en una
//     ventana de 506 px.
//   · Vendedoras era la pestaña más cargada: **48 bloques de texto** en la
//     primera pantalla y los montos en 16 px.
//
// LO QUE QUEDA EN EL CELULAR:
//   1. El mes como TÍTULO («Septiembre»), una línea gris con los días y lo de
//      hoy, y el número grande con su cambio y el «cierra en».
//   2. «‹ Agosto» cambia de mes; «Octubre ›» solo si el mes elegido no es el
//      actual. 🔴 NUNCA hacia el futuro.
//   3. Cuatro renglones: Año · Vendedoras · Productos · Clientes.
//   4. Vendedoras: una fila por vendedora y la meta como UN renglón.
//
// 🔴 NINGÚN NÚMERO SE MUEVE. Este módulo no calcula nada: recibe los mismos
// datos que ya dibujan las tarjetas de siempre y los ESCRIBE distinto. Las
// únicas operaciones son redondeos de presentación (`fmtMoneyCompact`, que ya
// existía) y el mismo umbral de color de `formatDeltaRatio` (±5 %).
//
// ⚠️ SOLO CAMBIA LA VISTA DE CELULAR (hasta `sm`). La de computadora se dibuja
// igual que siempre, con su desplegable de meses y sus pestañas.
// ─────────────────────────────────────────────────────────────────────────────

import { fmtMoney, fmtMoneyCompact } from "@/lib/ventas/format";
import type { TabMultifashion } from "@/lib/multifashion/pestanas";
import { etiquetaPeriodo, type CortePeriodo, type Periodo } from "@/lib/multifashion/periodo";

/**
 * El interruptor. `false` = la pantalla de celular de antes, intacta (título,
 * desplegable de 57 meses, banda «HOY» y las cuatro pestañas).
 */
export const MULTIFASHION_CELULAR = true;

/** Las dos pantallas que el celular agrega adentro de «Resumen». */
export type PantallaCelular = "inicio" | "anio";

/** Basura en `?mfCel=` → «inicio», nunca una pantalla en blanco. */
export function esPantallaCelular(v: unknown): PantallaCelular {
  return v === "anio" ? "anio" : "inicio";
}

export type TonoCelular = "sube" | "baja" | "neutro";

const MES_LARGO = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

// ── Plata y porcentajes ──────────────────────────────────────────────────────

/**
 * El monto del celular: sin centavos. `$32,946`.
 *
 * 🔴 Es `fmtMoneyCompact`, el redondeo que ya usaba el módulo — no uno nuevo.
 * El candado compara este número contra el de la tarjeta de computadora.
 */
export function montoCorto(n: number | null | undefined): string {
  return fmtMoneyCompact(n);
}

/** El monto con centavos, para donde hace falta el exacto. */
export function montoLargo(n: number): string {
  return fmtMoney(n);
}

/**
 * El cambio, como lo pidió el mockup: «▲ 39 %» · «▼ 12 %».
 *
 * 🔴 MISMO NÚMERO Y MISMO COLOR QUE LA PANTALLA DE COMPUTADORA: el entero sale
 * de `(delta * 100).toFixed(0)` y el tono del umbral de ±5 %, los dos de
 * `formatDeltaRatio`. Lo único distinto es la ropa: sin signo y con la flecha
 * separada del número.
 *
 * `null` cuando no hay con qué comparar — no se dibuja «n/a» al lado de un
 * monto grande, se deja el hueco.
 */
export function deltaCorto(
  delta: number | null | undefined,
): { texto: string; tono: TonoCelular } | null {
  if (delta == null || !Number.isFinite(delta)) return null;
  const entero = Math.abs(Number((delta * 100).toFixed(0)));
  if (delta > 0.05) return { texto: `▲ ${entero} %`, tono: "sube" };
  if (delta < -0.05) return { texto: `▼ ${entero} %`, tono: "baja" };
  return { texto: `= ${entero} %`, tono: "neutro" };
}

// ── El mes: título y navegación ──────────────────────────────────────────────

/** «Septiembre» si es del año de corte; «Septiembre 2025» si no. */
export function etiquetaMesCorto(p: Periodo, corte: CortePeriodo): string {
  if (p.tipo !== "mes") return etiquetaPeriodo(p);
  const nombre = MES_LARGO[p.mes - 1];
  return p.anio === corte.anio ? nombre : `${nombre} ${p.anio}`;
}

/** El mes anterior al que se está mirando. `null` si el período no es un mes. */
export function mesAnterior(p: Periodo): Periodo | null {
  if (p.tipo !== "mes") return null;
  return p.mes === 1
    ? { tipo: "mes", anio: p.anio - 1, mes: 12 }
    : { tipo: "mes", anio: p.anio, mes: p.mes - 1 };
}

/**
 * El mes siguiente. 🔴 `null` cuando ya se está en el mes de corte: **nunca se
 * navega al futuro**, la misma regla que tenían las flechas ‹ › del módulo.
 */
export function mesSiguiente(p: Periodo, corte: CortePeriodo): Periodo | null {
  if (p.tipo !== "mes") return null;
  if (p.anio > corte.anio || (p.anio === corte.anio && p.mes >= corte.mes)) return null;
  return p.mes === 12
    ? { tipo: "mes", anio: p.anio + 1, mes: 1 }
    : { tipo: "mes", anio: p.anio, mes: p.mes + 1 };
}

/** ¿El mes que se mira es el de hoy en Panamá? */
export function esElMesDeHoy(p: Periodo, corte: CortePeriodo): boolean {
  return p.tipo === "mes" && p.anio === corte.anio && p.mes === corte.mes;
}

/**
 * Cuántos días del mes mirado ya pasaron: los del mes entero si ya cerró, y los
 * transcurridos si es el mes en curso. `hoyIso` es el día de PANAMÁ.
 */
export function diasDelMesMirado(p: Periodo, corte: CortePeriodo, hoyIso: string): number {
  if (p.tipo !== "mes") return 0;
  if (esElMesDeHoy(p, corte)) return Number(hoyIso.slice(8, 10));
  return new Date(Date.UTC(p.anio, p.mes, 0)).getUTCDate();
}

// ── El encabezado del celular ────────────────────────────────────────────────

export interface EncabezadoCelular {
  titulo: string;
  /** El rótulo del botón de la izquierda; `null` = no hay a dónde ir. */
  atras: string | null;
  /** El rótulo del botón de la derecha; `null` = no se navega al futuro. */
  adelante: string | null;
}

/**
 * Qué dice el encabezado en cada pantalla del celular.
 *
 * · Resumen/inicio → el MES, con «‹ mes anterior» y «mes siguiente ›».
 * · Resumen/año    → «Año 2026», y «‹ Septiembre» vuelve al mes.
 * · Las otras      → su nombre, y «‹ Septiembre» vuelve al inicio.
 */
export function encabezadoCelular(args: {
  tab: TabMultifashion;
  pantalla: PantallaCelular;
  periodo: Periodo;
  corte: CortePeriodo;
}): EncabezadoCelular {
  const { tab, pantalla, periodo, corte } = args;
  const mes = etiquetaMesCorto(periodo, corte);

  if (tab === "resumen" && pantalla === "anio") {
    const anio = periodo.tipo === "mes" ? periodo.anio : corte.anio;
    return { titulo: `Año ${anio}`, atras: mes, adelante: null };
  }
  if (tab === "vendedoras") return { titulo: "Vendedoras", atras: mes, adelante: null };
  if (tab === "productos") return { titulo: "Productos", atras: mes, adelante: null };
  if (tab === "clientes") return { titulo: "Clientes", atras: mes, adelante: null };

  const previo = mesAnterior(periodo);
  const siguiente = mesSiguiente(periodo, corte);
  return {
    titulo: mes,
    atras: previo ? etiquetaMesCorto(previo, corte) : null,
    adelante: siguiente ? etiquetaMesCorto(siguiente, corte) : null,
  };
}

/**
 * La línea gris bajo el título: «23 días · hoy sin ventas todavía».
 *
 * 🔴 LO DE HOY SOLO SALE EN EL MES DE HOY. La banda «HOY» del módulo seguía
 * ahí mirando agosto: hablaba del día de hoy en una pantalla que no era de hoy.
 * Acá, en un mes cerrado, la línea dice solo los días.
 */
export function subtituloDelMes(args: {
  dias: number;
  /** `undefined` = todavía no llegó el dato; `null` = el mes no es el de hoy. */
  hoy?: { hayVentas: boolean; ventas: number } | null;
}): string {
  const { dias, hoy } = args;
  const base = `${dias} ${dias === 1 ? "día" : "días"}`;
  if (hoy === undefined || hoy === null) return base;
  return hoy.hayVentas
    ? `${base} · hoy ${montoCorto(hoy.ventas)}`
    : `${base} · hoy sin ventas todavía`;
}

/**
 * La línea bajo el número grande: «▲ 29 % contra septiembre 2025 · cierra en
 * $47,117». Se devuelve en piezas porque el % va con color.
 */
export interface LineaDelMes {
  delta: { texto: string; tono: TonoCelular } | null;
  /** «contra septiembre 2025» — `null` cuando no hay con qué comparar. */
  contra: string | null;
  /** «cierra en $47,117» — `null` en un mes cerrado o sin proyección. */
  cierra: string | null;
}

export function lineaDelMes(args: {
  periodo: Periodo;
  deltaAnioPasado: number | null;
  cierraEn: number | null;
}): LineaDelMes {
  const { periodo, deltaAnioPasado, cierraEn } = args;
  const delta = deltaCorto(deltaAnioPasado);
  const contra =
    delta != null && periodo.tipo === "mes"
      ? `contra ${MES_LARGO[periodo.mes - 1].toLowerCase()} ${periodo.anio - 1}`
      : null;
  return {
    delta,
    contra,
    cierra: cierraEn != null && Number.isFinite(cierraEn) ? `cierra en ${montoCorto(cierraEn)}` : null,
  };
}

// ── Los cuatro renglones ─────────────────────────────────────────────────────

export type ClaveRenglon = "anio" | "vendedoras" | "productos" | "clientes";

export interface RenglonCelular {
  clave: ClaveRenglon;
  titulo: string;
  /** La línea chica de abajo. `null` mientras el dato no llegó. */
  detalle: string | null;
  /** Lo que va a la derecha. `null` cuando ese renglón no lleva monto. */
  monto: string | null;
  delta: { texto: string; tono: TonoCelular } | null;
}

export interface DatosRenglones {
  anio: { anio: number; ventas: number; cierra: number | null; delta: number | null } | null;
  vendedoras: { cuantas: number; tiquetes: number; ventas: number } | null;
  productos: { piezas: number; deja: number; margen: number | null } | null;
  clientes: { frecuentes: number; noVuelven: number } | null;
  /** El año siempre se sabe: sale del período, aunque el resto no haya llegado. */
  anioDelPeriodo: number;
}

const miles = (n: number) => Math.round(n).toLocaleString("en-US");

/**
 * Los CUATRO renglones, en su orden. Un dato que todavía no llegó deja el
 * renglón dibujado con su nombre y sin número — nunca un `$0.00` inventado.
 */
export function renglonesDelInicio(d: DatosRenglones): RenglonCelular[] {
  const anio: RenglonCelular = {
    clave: "anio",
    titulo: `Año ${d.anio?.anio ?? d.anioDelPeriodo}`,
    detalle: d.anio
      ? d.anio.cierra != null
        ? `retail · cierra en ${montoCorto(d.anio.cierra)}`
        : "retail"
      : null,
    monto: d.anio ? montoCorto(d.anio.ventas) : null,
    delta: d.anio ? deltaCorto(d.anio.delta) : null,
  };

  const vendedoras: RenglonCelular = {
    clave: "vendedoras",
    titulo: "Vendedoras",
    detalle: d.vendedoras
      ? `${d.vendedoras.cuantas} · ${miles(d.vendedoras.tiquetes)} ${d.vendedoras.tiquetes === 1 ? "tiquete" : "tiquetes"}`
      : null,
    monto: d.vendedoras ? montoCorto(d.vendedoras.ventas) : null,
    delta: null,
  };

  const productos: RenglonCelular = {
    clave: "productos",
    titulo: "Productos",
    detalle: d.productos
      ? `${miles(d.productos.piezas)} piezas · deja ${montoCorto(d.productos.deja)}`
      : null,
    monto:
      d.productos && d.productos.margen != null && Number.isFinite(d.productos.margen)
        ? `margen ${Math.round(d.productos.margen * 100)} %`
        : null,
    delta: null,
  };

  const clientes: RenglonCelular = {
    clave: "clientes",
    titulo: "Clientes",
    detalle: d.clientes
      ? `${miles(d.clientes.frecuentes)} frecuentes · ${miles(d.clientes.noVuelven)} no vuelven`
      : null,
    monto: null,
    delta: null,
  };

  return [anio, vendedoras, productos, clientes];
}

// ── Vendedoras ───────────────────────────────────────────────────────────────

/**
 * Contra qué compara, dicho corto: «agosto». Sale del MISMO rótulo que ya usa
 * la tabla de computadora (`vendedoras-rotulo.ts`, «vs agosto 2026»); acá solo
 * se le quita el «vs» y el año cuando es el mismo que se está mirando — decirlo
 * dos veces en 390 px es palabra de más.
 */
export function contraDeVendedoras(rotuloCorto: string | null, anio: number): string | null {
  if (!rotuloCorto) return null;
  return rotuloCorto.replace(/^vs\s+/i, "").replace(new RegExp(`\\s+${anio}$`), "");
}

/** El subtítulo de la pantalla: «$32,649 · 690 tiquetes · contra agosto, mismos días». */
export function subtituloVendedoras(args: {
  ventas: number;
  tiquetes: number;
  /** Lo que ya dice `vendedoras-rotulo.ts`: «vs agosto 2026». `null` = nada. */
  rotuloDelta: string | null;
  anio: number;
  /** El período todavía no cerró: la comparación va a los mismos días. */
  parcial: boolean;
}): string {
  const partes = [
    montoCorto(args.ventas),
    `${miles(args.tiquetes)} ${args.tiquetes === 1 ? "tiquete" : "tiquetes"}`,
  ];
  const contra = contraDeVendedoras(args.rotuloDelta, args.anio);
  if (contra) partes.push(args.parcial ? `contra ${contra}, mismos días` : `contra ${contra}`);
  return partes.join(" · ");
}

/** La segunda línea de una vendedora: «Sheynee $11,675 · Redes $375 · 275 tiquetes». */
export function lineaVendedora(args: {
  /** Ya armado por `canales.ts`, con centavos y con el nombre adelante. `null` = sin canal aparte. */
  desglose: string | null;
  tiquetes: number;
  ticketPromedio: number;
  gerente: boolean;
}): string {
  const partes: string[] = [];
  if (args.gerente) partes.push("gerente");
  if (args.desglose) {
    // El desglose viene con centavos («Sheynee $11,674.57»); en el celular va
    // corto, con la MISMA plata. El recorte mira el MONTO, no el rótulo: le da
    // igual que adelante diga «tienda», un nombre o «Redes».
    partes.push(args.desglose.replace(/\$([\d,]+)\.(\d\d)/g, (_m, entero: string, dec: string) =>
      montoCorto(Number(`${entero.replace(/,/g, "")}.${dec}`)),
    ));
  }
  partes.push(`${miles(args.tiquetes)} ${args.tiquetes === 1 ? "tiquete" : "tiquetes"}`);
  if (!args.desglose) partes.push(`${montoLargo(args.ticketPromedio)} promedio`);
  return partes.join(" · ");
}

/** Lo que se despliega al tocar el nombre: «Comisión $56.71 · tiquete promedio $43.94». */
export function detalleVendedora(args: { comision: number; ticketPromedio: number }): string {
  return `Comisión ${montoLargo(args.comision)} · tiquete promedio ${montoLargo(args.ticketPromedio)}`;
}

/**
 * La meta como UN renglón: «$32,946 de $420,000 · así como van cierran en
 * $440,643». El porcentaje va aparte, a la derecha.
 */
export function renglonMeta(args: {
  vendido: number;
  objetivo: number;
  proyeccion: number | null;
  pctVendido: number;
  cerrada: boolean;
}): { titulo: string; detalle: string | null; pct: string } {
  const titulo = `${montoCorto(args.vendido)} de ${montoCorto(args.objetivo)}`;
  const detalle =
    args.proyeccion != null && Number.isFinite(args.proyeccion)
      ? `${args.cerrada ? "cerraron en" : "así como van cierran en"} ${montoCorto(args.proyeccion)}`
      : null;
  return { titulo, detalle, pct: `${Math.round(args.pctVendido * 100)} %` };
}

// ── Las barras del día por día ───────────────────────────────────────────────

export interface BarraDia {
  dia: number;
  /** Alto relativo 0..1 contra el mejor día del mes. */
  alto: number;
  /** El día todavía no llegó: se dibuja apagado. */
  futuro: boolean;
}

/**
 * El día por día como barras chicas, sin ejes. Son los MISMOS datos del gráfico
 * «Ventas día por día»; acá solo se normalizan a una altura.
 */
export function barrasDelMes(args: {
  dias: readonly { dia: number; ventas: number }[];
  esMesActual: boolean;
  diaActual: number;
}): BarraDia[] {
  const tope = Math.max(0, ...args.dias.map((d) => Number(d.ventas) || 0));
  return args.dias.map((d) => {
    const v = Math.max(0, Number(d.ventas) || 0);
    return {
      dia: d.dia,
      alto: tope > 0 ? v / tope : 0,
      futuro: args.esMesActual && d.dia > args.diaActual,
    };
  });
}
