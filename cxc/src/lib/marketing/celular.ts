// ─────────────────────────────────────────────────────────────────────────────
// MARKETING EN EL CELULAR — «nombre y UN monto; el desglose adentro»
// (24-sep-2026). Módulo PURO: sin React, sin Supabase, sin fetch.
//
// Daniel aprobó el mockup letra por letra (`cel-marketing.html`): 1a · 2a · 3a
// · 4c · 5b · 6b · 7b · 8a · 9a · 10a · 11a · 12a · 13b. Lo que este archivo
// guarda es la REGLA que atraviesa las trece pantallas, dicha por él:
//
//   «ya son datos que veré adentro, eso me ensucia la pantalla, no solo aquí
//    sino en todo el sistema»
//
// O sea: en el celular, **una fila es un nombre y UN monto**. El desglose por
// marca («Tommy $8,913.22 · Calvin $3,736.75»), el «entregadas 543 de 561» de
// Mobiliario y el número de factura de la ficha «General» salen de la fila y
// viven adentro, al tocarla.
//
// 🔴 NINGÚN NÚMERO SE MUEVE. Este módulo no suma, no redondea y no reagrupa
// plata: recibe las MISMAS filas que dibuja la computadora y las ESCRIBE
// distinto. Los montos salen de `formatearMonto` —el de siempre, con centavos—
// y los totales siguen saliendo de `periodo-estado.ts`. El único agrupado que
// existe acá (los pagos de impulsadora de «General», 8a) es de PRESENTACIÓN:
// su total es la suma de los mismos renglones que ya estaban en la lista.
//
// 🔴 LAS MARCAS NO SE SUMAN ENTRE SÍ (5b). La portada de Marcas del celular no
// lleva número grande: Daniel eligió la lista y nada más, porque un total de
// Tommy + Calvin + Joybees no existe en ninguna pantalla del módulo.
//
// ⚠️ SOLO CAMBIA LA VISTA DE CELULAR (hasta `sm`). La computadora se dibuja
// igual que siempre, con sus tablas, sus chips y sus columnas.
// ─────────────────────────────────────────────────────────────────────────────

import { formatearFecha, formatearMonto } from "./normalizar";
import { TIENDA_GENERAL } from "./gasto";
import type { FilaTienda } from "./tiendas-y-marcas";
import type { FilaDeTienda } from "./vista-tienda";

/**
 * 🔴 EL INTERRUPTOR. `true` = las trece pantallas del mockup en el celular.
 * `false` = el celular de antes, intacto (la portada con sus cuatro pestañas,
 * la ficha como tabla con deslizamiento, Mobiliario en tarjetas de 12
 * renglones): no se tocó una línea de esas pantallas.
 *
 * ⚠️ Es un interruptor de CÓDIGO, no de variable de entorno: Daniel prueba en
 * producción con su secretaria y apagarlo es un cambio de una línea más un
 * despliegue.
 */
export const MARKETING_CELULAR = true;

/**
 * 🔴 EL ANCHO EN EL QUE EMPIEZA EL CELULAR: hasta 639 px, el escalón `sm` de
 * Tailwind menos uno. Es la MISMA raya que usan las clases `sm:` del resto del
 * módulo, escrita una sola vez.
 */
export const HASTA_SM = "(max-width: 639px)";

/**
 * ¿Quien mira está en un celular?
 *
 * 🔑 SE MONTA UN SOLO ÁRBOL, NO DOS ESCONDIDOS CON CSS. Marketing tiene seis
 * pantallas con vista de celular, y dibujar las dos a la vez duplicaría cada
 * lectura de fotos y dejaría dos veces el mismo nombre en el documento —que es
 * exactamente lo que rompe los candados que ya existen—. Es el mismo patrón
 * del rediseño de Asistencia: se pregunta en un efecto y el valor de arranque
 * es `false`.
 *
 * ⚠️ En el servidor no hay `matchMedia`: ante la duda, COMPUTADORA. Un
 * navegador sin `matchMedia` cae al plan B de siempre (el dedo).
 */
export function esPantallaDeCelular(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const mq = window.matchMedia?.(HASTA_SM);
    if (mq) return mq.matches;
  } catch {
    /* un navegador sin matchMedia cae al plan B */
  }
  return false;
}

const plural = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

/** El monto del celular: el MISMO de siempre, con centavos. No hay redondeo. */
export function montoCelular(n: number | null | undefined): string {
  return formatearMonto(n);
}

// ─── 1a · LA PORTADA: TIENDAS ────────────────────────────────────────────────

/**
 * 🔴 LA FILA DE UNA TIENDA ES NOMBRE + UN MONTO (1a). Daniel, textual: *«ya
 * son datos que veré adentro, eso me ensucia la pantalla»*.
 *
 * 🩸 Hasta hoy la línea gris decía «Tommy Hilfiger $8,913.22 · Calvin Klein
 * $3,736.75» —dos montos más, en una fila que ya tenía el suyo—. Acá queda
 * solo QUÉ es la tienda y CUÁNTOS gastos tiene; el desglose por marca está
 * adentro, en la cabecera de su ficha, que no se tocó.
 */
export function subtituloTiendaCelular(f: Pick<FilaTienda, "cantidad" | "esGeneral" | "esMultifashion">): string {
  const gastos = plural(f.cantidad, "gasto", "gastos");
  if (f.esGeneral) return `sin tienda · ${gastos}`;
  if (f.esMultifashion) return `tienda propia · ${gastos}`;
  return gastos;
}

/** Los tres renglones del final de la portada: las otras puertas del módulo. */
export const PUERTAS_DEL_CELULAR = [
  { clave: "marcas", titulo: "Marcas", detalle: "cerrar y mandar el ZIP" },
  { clave: "impulsadoras", titulo: "Impulsadoras", detalle: "meses sin pagar" },
  { clave: "mobiliario", titulo: "Mobiliario", detalle: "inventario en piezas" },
] as const;

export type PuertaDelCelular = (typeof PUERTAS_DEL_CELULAR)[number]["clave"];

// ─── 2a · 8a · 9a · LA FICHA DE LA TIENDA: DOS RENGLONES POR GASTO ───────────

/** La fecha corta del renglón: «21 sep». Sin fecha, cadena vacía. */
export function fechaCortaCelular(iso: string | null | undefined): string {
  const larga = formatearFecha(iso);
  if (!larga) return "";
  // «21 sep 2026» → «21 sep». El año no cambia dentro de un período y ocupa
  // el lugar de la marca.
  const partes = larga.split(" ");
  return partes.length >= 2 ? `${partes[0]} ${partes[1]}` : larga;
}

export interface RenglonDeGastoCelular {
  /** Arriba: proveedor · concepto. */
  titulo: string;
  /** Abajo, en gris: fecha · marca · factura. */
  detalle: string;
  /** El monto, a la derecha. */
  monto: string;
}

/**
 * 🔴 DOS RENGLONES POR GASTO, CON EL MONTO A LA VISTA (2a). Arriba el
 * proveedor y qué fue; abajo la fecha, la marca y la factura; a la derecha el
 * monto.
 *
 * 🩸 En la tabla de hoy el monto de cada gasto empieza en el píxel 537 de una
 * pantalla de 390: se ve QUÉ es el gasto o CUÁNTO vale, nunca las dos cosas.
 *
 * 🔴 `sinNumeroDeFactura` es la ficha «General» (8a): Daniel la pidió sin el
 * número de factura en la fila. El número no se borra de ningún lado — sigue
 * en la tabla de la computadora, en el Excel y adentro del gasto.
 */
export function renglonDeGastoCelular(
  f: FilaDeTienda,
  opciones: { sinNumeroDeFactura?: boolean } = {},
): RenglonDeGastoCelular {
  const proveedor = String(f.proveedor ?? "").trim();
  const concepto = String(f.concepto ?? f.detalle ?? "").trim();
  const nota = String(f.nota ?? "").trim();
  const fecha = fechaCortaCelular(f.fecha);
  const marca = String(f.marcaNombre ?? "").trim();
  const monto = montoCelular(f.monto);

  if (f.tipo === "mueble") {
    return {
      titulo: nota || concepto || "Muebles de la bodega",
      detalle: [fecha, marca, "precio reportado"].filter(Boolean).join(" · "),
      monto,
    };
  }
  if (f.tipo === "impulsadora") {
    const mes = String(f.mes ?? "").trim();
    return {
      titulo: proveedor ? `Impulsadora ${proveedor}` : "Pago de impulsadora",
      detalle: [fecha, marca, mes ? `pago de ${mes}` : "pago de impulsadora"].filter(Boolean).join(" · "),
      monto,
    };
  }
  const numero = String(f.numero ?? "").trim();
  const partes = [fecha, marca];
  if (!opciones.sinNumeroDeFactura && numero) partes.push(`factura ${numero}`);
  if (!f.seReporta) partes.push("no se reporta");
  return {
    titulo: [proveedor, nota || concepto].filter(Boolean).join(" · ") || "Factura",
    detalle: partes.filter(Boolean).join(" · "),
    monto,
  };
}

// ─── 8a · «GENERAL»: LOS PAGOS DE IMPULSADORA, EN UN RENGLÓN ─────────────────

/** El renglón agrupado de los pagos de impulsadora de «General». */
export interface GrupoDeImpulsadoraCelular {
  /** Cuántos pagos se plegaron. */
  cantidad: number;
  /** La suma de esos MISMOS renglones. No es un número nuevo. */
  total: number;
  /** «Ana Trejos 11 · Cindy de Gracia 6». */
  detalle: string;
  /** Los pagos plegados, para abrir el renglón. */
  filas: FilaDeTienda[];
}

export interface FichaGeneralCelular {
  /** Las facturas y muebles, tal cual, de mayor a menor monto. */
  sueltas: FilaDeTienda[];
  /** `null` cuando no hay ni un pago de impulsadora. */
  grupo: GrupoDeImpulsadoraCelular | null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * 🔴 «GENERAL» AGRUPA SUS PAGOS DE IMPULSADORA EN UN RENGLÓN (8a). De los 21
 * gastos de General, 17 son el mismo pago de $800.00 repetido mes a mes y
 * ocupan la misma altura que una factura de $6.163,20.
 *
 * 🔴 El total del grupo es la SUMA DE ESOS MISMOS RENGLONES: no se recalcula
 * nada y el renglón se abre para ver los 17 uno por uno. Solo se pliega lo que
 * SE REPORTA igual que en la lista: acá no se filtra nada, se ordena y se
 * junta.
 */
export function fichaGeneralCelular(filas: ReadonlyArray<FilaDeTienda>): FichaGeneralCelular {
  const pagos = filas.filter((f) => f.tipo === "impulsadora");
  const sueltas = [...filas.filter((f) => f.tipo !== "impulsadora")].sort(
    (a, b) => b.monto - a.monto || a.id.localeCompare(b.id),
  );
  if (pagos.length === 0) return { sueltas, grupo: null };

  const porPersona = new Map<string, number>();
  for (const p of pagos) {
    const quien = String(p.proveedor ?? "").trim() || "Sin nombre";
    porPersona.set(quien, (porPersona.get(quien) ?? 0) + 1);
  }
  const detalle = [...porPersona.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "es"))
    .map(([quien, n]) => `${quien} ${n}`)
    .join(" · ");

  return {
    sueltas,
    grupo: {
      cantidad: pagos.length,
      total: round2(pagos.reduce((s, p) => s + (Number.isFinite(p.monto) ? p.monto : 0), 0)),
      detalle,
      filas: [...pagos].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "") || a.id.localeCompare(b.id)),
    },
  };
}

/** ¿Esta ficha es el cajón «General»? El nombre que se dibuja arriba. */
export function esFichaGeneral(nombre: string | null | undefined): boolean {
  return String(nombre ?? "").trim() === TIENDA_GENERAL;
}

// ─── 3a · 5b · LAS MARCAS ────────────────────────────────────────────────────

/** La línea gris de una marca en la lista del celular. Sin montos de más. */
export function subtituloMarcaCelular(args: { gastos: number; sinFoto?: number }): string {
  if (args.gastos <= 0) return "sin gasto este período";
  const partes = [plural(args.gastos, "gasto", "gastos")];
  if (args.sinFoto && args.sinFoto > 0) partes.push(`${args.sinFoto} sin foto`);
  return partes.join(" · ");
}

/**
 * 🔴 EN MARCAS NO HAY NÚMERO GRANDE (5b). Daniel eligió la lista y nada más:
 * sumar Tommy + Calvin + Joybees sería un total ENTRE MARCAS, y el módulo no
 * suma entre marcas en ninguna otra pantalla. La constante existe para que el
 * candado pueda exigirla y para que nadie la «arregle» sin leer esto.
 */
export const MARCAS_SIN_TOTAL = true;

// ─── 7b · MOBILIARIO ─────────────────────────────────────────────────────────

/**
 * 🔴 LA FILA DE UN PRODUCTO ES SU PRECIO Y NADA MÁS (7b). Daniel: el
 * «entregadas 543 de 561» *«son datos que veré adentro»*. A la derecha van las
 * piezas que quedan en bodega, que es lo que se mira.
 *
 * ⚠️ Los números no cambian: comprado, entregado y disponible siguen siendo
 * los mismos y se ven al abrir el producto y en la computadora.
 */
export function subtituloProductoCelular(precio: number | null | undefined): string {
  return `${montoCelular(precio)} c/u`;
}

/** La línea gris del resumen por tienda de Mobiliario: piezas, sin marcas. */
export function subtituloTiendaMobiliarioCelular(paneles: number): string {
  return paneles > 0 ? plural(paneles, "panel", "paneles") : "sin paneles";
}

// ─── 6b · 12a · IMPULSADORAS ─────────────────────────────────────────────────

export interface ImpulsadoraParaCelular {
  /** «Tommy», «Calvin»… la primera marca, que es la que se dibuja. */
  marca: string;
  /** Cuántos meses debe. */
  debe: number;
  /** El mes más viejo sin pagar, ya escrito («mayo 2024»). */
  desde: string;
}

/**
 * 🔴 UNA FILA POR PERSONA: quién es, de qué marca, cuánto debe y desde cuándo
 * (6b). Los 24 chips de meses, el historial y «Eliminar» viven ADENTRO.
 *
 * 🩸 La tarjeta de hoy mide 1,2 iPhones por persona y pone «Eliminar» —lo
 * destructivo— como texto suelto debajo de «Ver historial».
 */
export function lineaDeImpulsadoraCelular(i: ImpulsadoraParaCelular): string {
  const partes: string[] = [];
  if (i.marca) partes.push(i.marca);
  if (i.debe > 0) {
    partes.push(`debe ${plural(i.debe, "mes", "meses")}`);
    if (i.desde) partes.push(`desde ${i.desde}`);
  } else {
    partes.push("al día");
  }
  return partes.join(" · ");
}

/** ¿Lo que debe se dice en rojo? Un año o más sin pagar. */
export const MESES_EN_ROJO = 12;

export function debeEnRojo(meses: number): boolean {
  return meses >= MESES_EN_ROJO;
}

// ─── 4c · «＋ GASTO»: LAS TRES PUERTAS ───────────────────────────────────────

/**
 * 🔴 TRES PUERTAS, UNA PARA CADA CASO (4c). Daniel: *«que se pueda meter un
 * gasto por el teléfono así se escanea»*.
 *
 *   · escanear — la cámara del teléfono, y se llena solo.
 *   · pdf      — el PDF que llegó por correo (así entraron 95 de 97 facturas).
 *   · mano     — sin papel.
 *
 * 🔑 EL LECTOR YA EXISTÍA: `POST /api/marketing/ia/leer-factura` devuelve los
 * seis campos. Escanear no es construir un lector: es abrirle la cámara al que
 * ya existe y enseñarle a leer fotos, no solo PDF.
 */
export const PUERTAS_DE_LA_FACTURA = [
  { clave: "escanear", titulo: "Escanear con la cámara", detalle: "tomas la foto y se llena solo" },
  { clave: "pdf", titulo: "Elegir el PDF", detalle: "de Archivos o del correo · también se llena solo" },
  { clave: "mano", titulo: "Escribirlo a mano", detalle: "sin papel" },
] as const;

export type PuertaDeLaFactura = (typeof PUERTAS_DE_LA_FACTURA)[number]["clave"];

export function esPuertaDeLaFactura(v: unknown): v is PuertaDeLaFactura {
  return typeof v === "string" && PUERTAS_DE_LA_FACTURA.some((p) => p.clave === v);
}

/**
 * 🔴 LA CÁMARA SE ABRE CON `capture="environment"` — la de atrás, la que mira
 * al papel. Es el mismo valor que usa Marcación, el único `capture=` que
 * existía en el sistema.
 */
export const CAPTURE_DE_LA_CAMARA = "environment";

/** Lo que acepta el input de escanear: una foto, nunca un PDF. */
export const ACCEPT_DE_LA_CAMARA = "image/*";

/**
 * 🔴 LA FOTO SE ACHICA EN EL NAVEGADOR ANTES DE VIAJAR: 1600 px de lado mayor,
 * JPEG 0,8. Son los MISMOS números que ya usan Reclamos y Mobiliario
 * (`compressImage`), y no son un capricho: el cuerpo de una función de Vercel
 * se topa en ~4,5 MB y una foto de iPhone pesa 3-12 MB.
 */
export const LADO_MAYOR_DE_LA_FOTO = 1600;
export const CALIDAD_DE_LA_FOTO = 0.8;

/** Lo que dice el botón apagado cuando todavía falta algo (11a · 12a). */
export function textoDelBotonCelular(falta: string | null, siListo: string): string {
  return falta ? falta : siListo;
}
