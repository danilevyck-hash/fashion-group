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
import { unAnioAntes } from "@/lib/ventas/clientes-corte-comparativo";

/**
 * El interruptor. `false` = la pantalla de celular de antes, intacta (título,
 * desplegable de 57 meses, banda «HOY» y las cuatro pestañas).
 */
export const MULTIFASHION_CELULAR = true;

/**
 * 🔴 EL DÍA QUE SE TOCA Y LO DE AYER (4-oct-2026, propuesta). Daniel: las
 * barras del día por día no se podían tocar y no había forma de ver lo de
 * ayer. Prendido:
 *  · tocar una barra dice ARRIBA «Sáb 3 oct · $7,104 · 82 tickets» y la marca;
 *    tocarla otra vez vuelve al mes. Son los MISMOS `dias` del detalle del mes.
 *  · la línea gris pasa de «4 días · hoy $1,979» a «hoy $1,979 · ayer $X ·
 *    Actualizado 4:00 pm ↻» (el «ayer» es el de `venta-hoy.ts`; la hora y el ↻
 *    son la MISMA línea de frescura de `FRESCURA_VISIBLE_2026_10`: una sola).
 * `false` = como hoy. Candado `multifashion-dia-tocado.test.ts`.
 * ✅ PRENDIDO el 4-oct-2026: Daniel aprobó «ver un día» del mockup («sí»).
 */
export const MF_DIA_2026_10 = true;

const DIA_SEMANA = new Intl.DateTimeFormat("es-PA", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** «Sáb 3 oct · $7,104 · 82 tickets» — el día tocado, en una línea. */
export function lineaDelDia(args: { anio: number; mes: number; dia: number; ventas: number; tickets: number }): string {
  const fecha = DIA_SEMANA.format(new Date(Date.UTC(args.anio, args.mes - 1, args.dia))).replace(/[.,]/g, "");
  const conMayuscula = fecha.charAt(0).toUpperCase() + fecha.slice(1);
  const t = Math.max(0, Math.round(args.tickets));
  return `${conMayuscula} · ${montoCorto(args.ventas)} · ${t} ${t === 1 ? "ticket" : "tickets"}`;
}

/**
 * La línea gris con `MF_DIA_2026_10`: «hoy $1,979 · ayer $7,104» en el mes de
 * hoy; en otro mes, los días (como `subtituloDelMes`).
 */
export function subtituloHoyAyer(args: {
  dias: number;
  /** `undefined` = todavía no llegó; `null` = el mes no es el de hoy. */
  hoy?: { hayVentas: boolean; ventas: number; ayer: number } | null;
}): string {
  const { hoy } = args;
  if (hoy === undefined || hoy === null) return subtituloDelMes({ dias: args.dias, hoy });
  const deHoy = hoy.hayVentas ? `hoy ${montoCorto(hoy.ventas)}` : "hoy sin ventas todavía";
  return `${deHoy} · ayer ${montoCorto(hoy.ayer)}`;
}

/**
 * 🔴 EL ENCABEZADO COMPARTIDO (11-oct-2026, propuesta). Daniel, desde su iPhone:
 * «¿Por qué los otros tabs no están como en los otros módulos en el celular?» y
 * «¿la venta del día cómo debería de estar?». Prendido, en el celular:
 *  · el encabezado es `BarraDeControles`, el mismo de Ventas: el título es la
 *    sección con su lista (Resumen · Año · Vendedoras · Productos · Clientes) y
 *    el renglón 2 lleva el período con el calendario a su derecha;
 *  · la venta de hoy tiene su línea («Hoy $1,866 · ayer $1,795») y la frescura
 *    queda sola, en su línea gris;
 *  · UNA sola forma de ir a cada sección, el título: los cuatro renglones salen
 *    del Resumen (Daniel: «¿por qué el menú arriba y en la pantalla?») y también
 *    la línea gris de hábitos bajo la gráfica. El Resumen termina en la gráfica.
 * 🔴 Ningún número cambia.
 * `false` = el encabezado de antes («‹ Septiembre» y el mes como título).
 * Candado `multifashion-barra-celular.test.ts`.
 */
export const MULTIFASHION_BARRA_2026_10 = true;

/** Las secciones del título: Resumen y las cuatro que eran renglones, con sus nombres. */
export function seccionesDeLaBarra(
  pestanas: readonly { id: TabMultifashion; label: string }[],
  anio: number,
): { value: string; label: string }[] {
  return pestanas.flatMap((p) =>
    p.id === "resumen"
      ? [{ value: p.id, label: p.label }, { value: "anio", label: `Año ${anio}` }]
      : [{ value: p.id, label: p.label }],
  );
}

/**
 * La línea de hoy, en piezas: «$1,866» (o «sin ventas todavía») y «ayer $1,795».
 * Los MISMOS dos montos de `subtituloHoyAyer`; `null` si el mes no es el de hoy
 * o el dato no llegó.
 */
export function lineaDeHoy(
  hoy?: { hayVentas: boolean; ventas: number; ayer: number } | null,
): { hoy: string; ayer: string } | null {
  if (!hoy) return null;
  return { hoy: hoy.hayVentas ? montoCorto(hoy.ventas) : "sin ventas todavía", ayer: `ayer ${montoCorto(hoy.ayer)}` };
}

/**
 * 🔴 EL NÚMERO DEL MES CON LA VENTA DE HOY (`MULTIFASHION_BARRA_2026_10`, Daniel,
 * 11-oct-2026). El detalle del mes corta en el último día COMPLETO; arriba dice
 * «Hoy $2,140» y cualquiera supone que el número grande ya lo trae. En el
 * celular: número grande = días completos + la venta de hoy, la MISMA del
 * renglón «Hoy» (`venta-hoy`). La proyección y el promedio NO se tocan: siguen
 * sobre días completos. El % va hasta la misma hora (`baseDeHoyAnioPasado`).
 * Devuelve lo que se suma, o `null` (= el número de siempre) si el mes no es el
 * de hoy, si hoy todavía no vendió, o si el día de «hoy» no es el que sigue al
 * corte del detalle (medianoche, dato viejo): nunca se suma dos veces ni se adivina.
 */
export function ventaDeHoyParaElMes(e: {
  esMesActual: boolean;
  anio: number;
  mes: number;
  /** El último día completo del detalle (`dia_actual`). */
  diaActual: number;
  hoy?: { fecha: string; hayVentas: boolean; ventas: number } | null;
}): number | null {
  if (!e.esMesActual || !e.hoy || !e.hoy.hayVentas) return null;
  const sigue = `${e.anio}-${String(e.mes).padStart(2, "0")}-${String(e.diaActual + 1).padStart(2, "0")}`;
  return e.hoy.fecha === sigue && Number.isFinite(e.hoy.ventas) ? e.hoy.ventas : null;
}

/**
 * 🔴 EL % HASTA LO MÁS ACTUALIZADO (Daniel, 11-oct-2026: «que la comparación sea
 * hasta lo más actualizado»). El número grande ya trae hoy; el % compara contra
 * el año pasado hasta el MISMO día y la MISMA hora: los días completos de
 * siempre + ese día del año pasado solo hasta la hora del último sync de hoy.
 * Un día a medias contra un día entero se leería como caída cada mañana.
 *
 * El instante del año pasado: la misma fecha un año antes (`unAnioAntes`, 29-feb
 * → 28-feb) a la misma hora de Panamá del sync. `null` si el sync no es de hoy.
 * `mismoDia: false` = el año pasado no tuvo ese día (29-feb): no se suma nada.
 */
export function instanteUnAnioAntes(
  fechaHoy: string,
  corteIso: string,
): { fecha: string; instante: string; mismoDia: boolean } | null {
  const t = Date.parse(corteIso);
  if (!Number.isFinite(t)) return null;
  const enPanama = new Date(t - 5 * 3_600_000).toISOString(); // UTC−5 fijo
  if (enPanama.slice(0, 10) !== fechaHoy) return null;
  const fecha = unAnioAntes(fechaHoy);
  return { fecha, instante: `${fecha}T${enPanama.slice(11, 19)}-05:00`, mismoDia: fecha.slice(5) === fechaHoy.slice(5) };
}

/**
 * Lo que se suma a la base del año pasado, o `null` (= el % de días completos,
 * como siempre): solo si las dos lecturas se cortaron en el MISMO instante.
 */
export function baseDeHoyAnioPasado(e: {
  /** La hora del último sync que trae la venta de hoy (`sync.ultimo`). */
  corteDeHoy: string | null | undefined;
  fechaDeHoy: string | null | undefined;
  comparativo?: { fecha?: string; corte?: string | null; ventasPrev?: number | null } | null;
}): number | null {
  const c = e.comparativo;
  if (!c || !e.corteDeHoy || c.corte !== e.corteDeHoy || c.fecha !== e.fechaDeHoy) return null;
  return typeof c.ventasPrev === "number" && Number.isFinite(c.ventasPrev) ? c.ventasPrev : null;
}

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
  /** «proyección $47,117» — `null` en un mes cerrado o sin proyección. */
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
    cierra: cierraEn != null && Number.isFinite(cierraEn) ? `proyección ${montoCorto(cierraEn)}` : null,
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
        ? `retail · proyección ${montoCorto(d.anio.cierra)}`
        : "retail"
      : null,
    monto: d.anio ? montoCorto(d.anio.ventas) : null,
    delta: d.anio ? deltaCorto(d.anio.delta) : null,
  };

  const vendedoras: RenglonCelular = {
    clave: "vendedoras",
    titulo: "Vendedoras",
    detalle: d.vendedoras
      ? `${d.vendedoras.cuantas} · ${miles(d.vendedoras.tiquetes)} ${d.vendedoras.tiquetes === 1 ? "ticket" : "tickets"}`
      : null,
    monto: d.vendedoras ? montoCorto(d.vendedoras.ventas) : null,
    delta: null,
  };

  const productos: RenglonCelular = {
    clave: "productos",
    titulo: "Productos",
    detalle: d.productos
      ? `${miles(d.productos.piezas)} unidades · utilidad ${montoCorto(d.productos.deja)}`
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
    `${miles(args.tiquetes)} ${args.tiquetes === 1 ? "ticket" : "tickets"}`,
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
  partes.push(`${miles(args.tiquetes)} ${args.tiquetes === 1 ? "ticket" : "tickets"}`);
  if (!args.desglose) partes.push(`${montoLargo(args.ticketPromedio)} promedio`);
  return partes.join(" · ");
}

/** Lo que se despliega al tocar el nombre: «Comisión $56.71 · tiquete promedio $43.94». */
export function detalleVendedora(args: { comision: number; ticketPromedio: number; bono?: number }): string {
  const base = `Comisión ${montoLargo(args.comision)} · tiquete promedio ${montoLargo(args.ticketPromedio)}`;
  // 🔴 5-oct-2026: lo que pagaba Comisiones › Multifashion, aquí. Con bono del
  // mes cerrado, el total a pagar de la persona (comisión + bono).
  return args.bono ? `${base} · bono ${montoLargo(args.bono)} · total a pagar ${montoLargo(args.comision + args.bono)}` : base;
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
      ? `${args.cerrada ? "Cierre" : "Proyección de cierre"} ${montoCorto(args.proyeccion)}`
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
