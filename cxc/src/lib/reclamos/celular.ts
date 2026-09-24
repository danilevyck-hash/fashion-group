// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS EN EL CELULAR (24-sep-2026). Daniel aprobó el mockup letra por
// letra: 1b · 2c · 2e · 3b · 3e · 4b · 5b · 6b · 7b · 8b · 9 · 10c · 11c.
//
// 🩸 QUÉ REEMPLAZA, medido el 24-sep-2026 contra producción y sobre las fotos
// del iPhone de Daniel (390 px):
//   · **La portada medía 1.055 px** (1,25 pantallas) y «Nuevo Reclamo» se
//     llevaba una fila entera con el lado izquierdo en blanco; el buscador se
//     cortaba a media palabra («…estilo o empre»).
//   · **La lista de una empresa tenía 45 cosas tocables**: 12 botones antes del
//     primer reclamo (que empezaba en y=423 de 844) y tres botones DENTRO de
//     cada tarjeta de 174 px → 2,5 reclamos por pantalla. Medido: **9 correos
//     en toda la historia del módulo** contra **14 cobros, 9 en septiembre**:
//     el botón que más ocupaba era el que menos se usa.
//   · **El reclamo abierto** llevaba cuatro botones en dos filas, dos menús que
//     no se conocían, y una cabecera de cinco renglones.
//   · **28 de los 33 reclamos vivos no tienen una sola foto** y las notas a mano
//     son 14 en toda la historia: las dos cajas del pie estaban casi siempre
//     vacías y ocupaban sitio igual.
//   · **En «Cobrados» los días seguían corriendo** («350 días» en uno ya
//     cobrado) y la fecha salía pelada, sin decir de qué era.
//   · **Buscar devolvía una tabla de 560 px dentro de 358**: «Estado» y
//     «Total» —o sea la plata— quedaban fuera de la pantalla.
//   · **El «···» de la fila abría hacia abajo** y «Eliminar» en rojo caía sobre
//     el número del reclamo de abajo. Ya se borraron 14 reclamos en la historia
//     del módulo.
//
// 🔴 NADA DE LO QUE SE GUARDA CAMBIA. Las cuatro cosas que escriben —crear,
// cobrar, el correo al proveedor y las fotos— siguen llamando a las MISMAS
// rutas con los MISMOS payloads, desde los mismos manejadores de
// `ReclamosClient`. Este archivo no calcula ni un total: los números salen de
// `lib/reclamos/portada.ts` y de `reclamoTaxes`, como en la computadora.
//
// ⚠️ SOLO CAMBIA HASTA `sm`. La computadora se dibuja igual que siempre, con
// sus tablas, sus chips y sus cinco botones.
// ─────────────────────────────────────────────────────────────────────────────

import { fmt, fmtDate } from "@/lib/format";
import { DIAS_RECLAMO_VIEJO } from "./viejos";

/**
 * El interruptor. `false` = el celular de antes, intacto (las tarjetas de
 * `EmpresaSelector`, `EmpresaList` y `ReclamoDetail` por debajo de `lg`).
 *
 * ⚠️ Es un interruptor de CÓDIGO, no de variable de entorno: Daniel prueba en
 * producción con su secretaria y apagarlo es un cambio de una línea más un
 * despliegue.
 */
export const RECLAMOS_CELULAR = true;

/** La plata, EXACTA y con centavos. En el celular nada se redondea. */
export function montoCel(n: number): string {
  return `$${fmt(n)}`;
}

/** «19 por cobrar» + «6 pasan de 120 días» (esto último, en rojo y aparte). */
export function subtituloPortada(porCobrar: number, viejos: number): { texto: string; viejos: string | null } {
  return {
    texto: `${porCobrar} por cobrar`,
    viejos: viejos > 0 ? `${viejos} pasa${viejos === 1 ? "" : "n"} de ${DIAS_RECLAMO_VIEJO} días` : null,
  };
}

/** «11 reclamos» + «el más viejo 599 días» (la segunda mitad va en rojo). */
export function lineaEmpresa(n: number, masViejoDias: number | null): { texto: string; dias: string | null } {
  return {
    texto: `${n} reclamo${n === 1 ? "" : "s"}`,
    dias: masViejoDias === null ? null : `el más viejo ${masViejoDias} día${masViejoDias === 1 ? "" : "s"}`,
  };
}

export interface FilaDeReclamo {
  /** Las facturas ya partidas (`facturasDe`). */
  facturas: readonly string[];
  fotos: number;
  /** Días desde la FECHA DE FACTURA; `null` = la factura no trae fecha. */
  dias: number | null;
}

/**
 * La segunda línea de un reclamo POR COBRAR:
 * «factura 200004329 · hace 29 días» · «3 facturas · 3 fotos · hace 65 días».
 *
 * 🔴 Los días son los MISMOS de la computadora (`diasDesde` sobre la fecha de
 * la factura) y van en rojo a partir del corte único de «viejo», 120 días.
 * Sin fecha se dice, como en la tabla: no se inventa un número.
 */
export function lineaReclamo(f: FilaDeReclamo): { texto: string; rojo: boolean } {
  const partes: string[] = [];
  if (f.facturas.length === 1) partes.push(`factura ${f.facturas[0]}`);
  else if (f.facturas.length > 1) partes.push(`${f.facturas.length} facturas`);
  if (f.fotos > 0) partes.push(`${f.fotos} foto${f.fotos === 1 ? "" : "s"}`);
  if (f.dias === null) partes.push("sin fecha de factura");
  else partes.push(`hace ${f.dias} día${f.dias === 1 ? "" : "s"}`);
  return {
    texto: partes.join(" · "),
    rojo: f.dias !== null && f.dias >= DIAS_RECLAMO_VIEJO,
  };
}

/**
 * 🔴 EN «COBRADOS» NO SE CUENTAN LOS DÍAS (5b). Decía «350 días» en un reclamo
 * ya cobrado —los días son la mora de algo que ya se cobró— y la fecha de la
 * derecha salía pelada, sin decir de qué era. Ahora: visto verde y la fecha
 * DEL COBRO. Sin cobro vivo no se inventa ninguna.
 */
export function lineaCobrado(fecha: string | null, fotos: number): string {
  const partes = [fecha ? `cobrado el ${fmtDate(fecha)}` : "cobrado"];
  if (fotos > 0) partes.push(`${fotos} foto${fotos === 1 ? "" : "s"}`);
  return partes.join(" · ");
}

/** El título del modo «Elegir»: «2 elegidos» + «de 11 por cobrar · $2,872.35». */
export function tituloSeleccion(elegidos: number, deCuantos: number, monto: number, cobrados: boolean): {
  titulo: string;
  sub: string;
} {
  return {
    titulo: elegidos === 0 ? "Elige reclamos" : `${elegidos} elegido${elegidos === 1 ? "" : "s"}`,
    sub: `de ${deCuantos} ${cobrados ? "cobrados" : "por cobrar"} · ${montoCel(monto)}`,
  };
}

/** «Mandar los 2 al proveedor» — el botón dice qué hace y a cuántos. */
export function botonMandar(n: number): string {
  return `Mandar ${n === 1 ? "el reclamo" : `los ${n}`} al proveedor`;
}

/**
 * 🔴 UNA FACTURA DE VARIAS HOJAS SON VARIAS FOTOS, Y HOY NO SE SOPORTA (4b).
 * La caja manda UN solo archivo, así que se dice en pantalla en una línea en
 * vez de dejar que alguien mande la primera hoja y crea que mandó todo.
 */
export const AVISO_VARIAS_HOJAS =
  "Si la factura tiene varias hojas, mándala en PDF: la foto es de una sola hoja.";

/** La línea del pie de las hojas con deshacer, igual que en Cuentas por Cobrar. */
export const SE_DESHACE = "Se deshace por 5 segundos.";
