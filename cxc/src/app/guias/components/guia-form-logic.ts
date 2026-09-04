// Lógica PURA del formulario de guía (crear y editar). Sin React, sin fetch,
// sin localStorage — para que se pueda probar sin montar nada.
//
// Por qué existe: hasta jul-2026 todo esto vivía adentro de `useGuiaFormState`
// y de `GuiaForm`, así que la cobertura del formulario era CERO. Las reglas que
// importan (qué es obligatorio, qué empresa se acepta, cómo se identifica una
// fila) ahora son funciones sueltas con candados propios.

import { ALL_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";
import { unirEnHumano } from "@/lib/guias/falta-para-despachar";
// 🔑 El centinela de «Otro…» vive en `lib/` porque los DOS papeles lo
// necesitan: acá se REUSA, no se redefine.
import { entregadoPorElegido } from "@/lib/guias/despachado-por";
// «Traslado» como valor válido de FACTURA(S) — vive con el resto del atajo y
// cuelga del mismo interruptor.
import { GUIAS_ATAJOS_NUEVOS, esTraslado } from "@/lib/guias/atajos-facturas";
import type { GuiaItem, ModoEntrega } from "./types";

/**
 * Las 8 empresas del grupo, en su orden canónico. **Única fuente.**
 *
 * Antes había TRES listas: `DEFAULT_EMPRESAS` en constants.ts (cargada en
 * localStorage y jamás pasada al formulario — código muerto, y encima con
 * "MultiFashion Holding" en vez de "Multifashion"), `FALLBACK_EMPRESAS` copiada
 * a mano dentro de GuiaForm, y la de verdad en `empresa-mapping.ts`. Las dos
 * primeras se borraron. `empresa-mapping.ts` no importa nada del servidor, así
 * que se puede leer desde un componente cliente.
 *
 * El orden que ve el usuario lo manda `/api/guias/frecuencias` (las mismas 8,
 * ordenadas por uso). Esta lista es el respaldo cuando no hay red, y sobre todo
 * es contra la que se valida.
 */
export const EMPRESAS_CANONICAS: string[] = ALL_EMPRESA_KEYS.map(mapEmpresaName);

/** ¿Es una de las 8 empresas del grupo? Compara exacto (sin trim el select no puede producir otra cosa). */
export function esEmpresaCanonica(valor: string | null | undefined): boolean {
  return EMPRESAS_CANONICAS.includes((valor ?? "").trim());
}

export interface OpcionEmpresa {
  value: string;
  label: string;
  /** true = valor viejo y sucio que ya estaba guardado; no se puede elegir de nuevo una vez que se cambia. */
  legacy: boolean;
}

/**
 * Opciones del selector de empresa para UNA fila.
 *
 * El selector es CERRADO: solo las 8 del grupo. Pero las guías históricas
 * tienen texto sucio ("VISTANA", "VISTANA / FASHION WEAR") y el MISMO
 * formulario se usa para editarlas. Si la lista fuera solo las 8, abrir una
 * guía vieja mostraría el campo vacío y guardar le CAMBIARÍA la empresa sin que
 * nadie lo pidiera — o la dejaría sin poder guardarse.
 *
 * Solución: el valor que ya está guardado siempre aparece en la lista, marcado
 * como "(como estaba)". Se puede conservar tal cual o reemplazar por una de las
 * 8; una vez reemplazado, el valor sucio desaparece de la lista y no vuelve.
 * Es una limpieza de un solo sentido, nunca un bloqueo.
 */
export function opcionesEmpresa(valorActual: string, canonicas: string[] = EMPRESAS_CANONICAS): OpcionEmpresa[] {
  const base: OpcionEmpresa[] = canonicas.map((e) => ({ value: e, label: e, legacy: false }));
  const v = (valorActual ?? "").trim();
  if (v && !canonicas.includes(v)) {
    base.push({ value: valorActual, label: `${valorActual} (como estaba)`, legacy: true });
  }
  return base;
}

/** Identidad estable de fila. `crypto.randomUUID` no está en todos los WebView viejos. */
export function nuevoUid(): string {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 9)}`;
}

/** Clave de un campo de fila para `touched` y para los errores de validación. */
export function claveCampo(item: Pick<GuiaItem, "uid">, campo: string): string {
  return `item-${item.uid ?? "?"}-${campo}`;
}

/** Cómo quedó el cliente de una fila. Lo que se pinta distinto en pantalla. */
export type VinculoCliente = "vacio" | "vinculado" | "otro";

export function vinculoCliente(item: Pick<GuiaItem, "cliente" | "cliente_codigo">): VinculoCliente {
  if (!(item.cliente ?? "").trim()) return "vacio";
  return (item.cliente_codigo ?? "").trim() ? "vinculado" : "otro";
}

export interface EstadoGuia {
  fecha: string;
  modoEntrega: ModoEntrega;
  transportistaId: string | null;
  entregadoPor: string;
  items: GuiaItem[];
}

/** ¿La fila tiene algo escrito? Una fila totalmente vacía no se valida ni se guarda. */
export function filaTieneDatos(i: GuiaItem): boolean {
  return Boolean(i.cliente || i.direccion || i.facturas || (i.bultos ?? 0) > 0);
}

export function filasConDatos(items: GuiaItem[]): GuiaItem[] {
  return items.filter(filaTieneDatos);
}

/**
 * Todos los errores del formulario. Las claves de fila van por `uid`, NO por
 * posición: con `item-2-cliente` bastaba borrar la fila 1 para que el rojo
 * quedara señalando a la fila equivocada.
 */
export function validarGuia(estado: EstadoGuia): Set<string> {
  const errores = new Set<string>();
  if (!estado.fecha) errores.add("fecha");
  if (estado.modoEntrega === "transportista" && !estado.transportistaId) errores.add("transportista");
  // 🔴 `__other__` NO es un nombre: es el centinela de "Otro…". Sin esto se
  // guardaba tal cual y se IMPRIMÍA en el papel que alguien firma.
  if (!entregadoPorElegido(estado.entregadoPor)) errores.add("entregadoPor");

  if (filasConDatos(estado.items).length === 0) errores.add("items-empty");

  for (const item of estado.items) {
    if (!filaTieneDatos(item)) continue;
    if (!item.cliente) errores.add(claveCampo(item, "cliente"));
    if (!item.direccion) errores.add(claveCampo(item, "direccion"));
    if (!item.empresa) errores.add(claveCampo(item, "empresa"));
    if (!item.facturas) {
      errores.add(claveCampo(item, "facturas"));
    } else {
      if (item.facturas.includes(",") && !item.facturas.match(/^[^,]+(, [^,]+)*$/)) {
        errores.add(claveCampo(item, "facturas-separator"));
      } else if (item.facturas.includes(";")) {
        errores.add(claveCampo(item, "facturas-separator"));
      }
      const partes = item.facturas.split(",").map((s) => s.trim()).filter(Boolean);
      // 🔴 «Traslado» es un valor VÁLIDO del campo (4-sep-2026, Daniel: «que
      // en factura salga traslado»): el envío sin factura se guarda con ese
      // texto y se imprime así. Solo con el interruptor encendido — apagado,
      // la validación es EXACTAMENTE la de antes de 115f90ed.
      if (partes.some((p) => p.replace(/\D/g, "").length < 4 && !(GUIAS_ATAJOS_NUEVOS && esTraslado(p)))) {
        errores.add(claveCampo(item, "facturas-format"));
      }
    }
    if (!item.bultos || item.bultos <= 0) errores.add(claveCampo(item, "bultos"));
  }

  return errores;
}

/** Renumera `orden` sin tocar `uid`. */
function renumerar(items: GuiaItem[]): GuiaItem[] {
  return items.map((item, i) => ({ ...item, orden: i + 1 }));
}

/** Quita la fila `idx`. Nunca deja el formulario sin filas. */
export function quitarFila(items: GuiaItem[], idx: number): GuiaItem[] {
  if (items.length <= 1) return items;
  return renumerar(items.filter((_, i) => i !== idx));
}

/**
 * Devuelve una fila borrada a SU posición original, con TODOS sus campos.
 *
 * El "Deshacer" viejo agregaba una fila al final y le copiaba 5 campos a mano;
 * `cliente_codigo` no estaba en esa lista, así que deshacer un borrado
 * desvinculaba al cliente en silencio: el nombre volvía, el vínculo con el
 * directorio no. Acá se reinserta el objeto entero.
 */
export function restaurarFila(items: GuiaItem[], idx: number, fila: GuiaItem): GuiaItem[] {
  const destino = Math.max(0, Math.min(idx, items.length));
  return renumerar([...items.slice(0, destino), fila, ...items.slice(destino)]);
}

// ─────────────────────────────────────────────────────────────────────────────
// QUÉ LE FALTA A LA GUÍA PARA PODER GUARDARSE — dicho en español simple.
//
// 🩸 EL BOTÓN "Guardar Guía" APARECÍA APAGADO Y NO DECÍA POR QUÉ. Se apagaba
// con `!items.some(i => i.cliente)` —una regla propia, más floja que la que de
// verdad decide— así que también pasaba lo contrario: el botón se veía
// encendido, se tocaba, y el formulario entero se ponía rojo con "Completa
// todos los campos obligatorios". Dos formas de la misma falta de respuesta.
//
// La pantalla de despachar ya hacía lo correcto —botón apagado y, justo debajo,
// *"Falta: placa, recibido por y cédula"*— y esto copia ese patrón.
//
// 🔑 LAS REGLAS NO SE COPIAN: esto LLAMA a `validarGuia`, la misma función que
// rechaza el guardado. Si fueran dos listas, el día que una cambiara el botón
// se pondría negro y el guardado rechazaría igual — que es peor que el botón
// apagado, porque miente.
// ─────────────────────────────────────────────────────────────────────────────

/** Nombre humano de cada campo de un envío, en el orden en que se leen. */
const CAMPOS_DE_ENVIO: Array<[campo: string, humano: string]> = [
  ["cliente", "el cliente"],
  ["direccion", "la dirección"],
  ["empresa", "la empresa"],
  ["facturas", "la factura"],
  ["bultos", "los bultos"],
];

/**
 * Devuelve los faltantes en el orden en que se leen en la pantalla. Lista
 * vacía = se puede guardar.
 *
 * ⚠️ Los envíos van AGRUPADOS, no campo por campo: con 7 envíos a los que les
 * falta el cliente, una lista plana daría 7 renglones que dicen lo mismo. Con
 * un solo envío ni siquiera se lo numera — decir "del envío 1" cuando hay uno
 * solo es ruido.
 */
export function faltaParaGuardar(estado: EstadoGuia): string[] {
  const errores = validarGuia(estado);
  const falta: string[] = [];

  if (errores.has("fecha")) falta.push("la fecha");
  if (errores.has("transportista")) falta.push("el transportista");
  if (errores.has("entregadoPor")) falta.push("quién despacha");
  if (errores.has("items-empty")) {
    falta.push("por lo menos un envío");
    return falta;
  }

  // El número que se dice es la POSICIÓN QUE SE VE en la pantalla (el
  // formulario numera las filas por su índice), no la posición entre las filas
  // que tienen datos: mandar a mirar "el envío 2" y que sea el tercero de la
  // lista es peor que no decir nada.
  const malos: Array<{ numero: number; campos: string[] }> = [];
  estado.items.forEach((item, idx) => {
    if (!filaTieneDatos(item)) return;
    const campos = CAMPOS_DE_ENVIO
      .filter(([campo]) => errores.has(claveCampo(item, campo)))
      .map(([, humano]) => humano);
    if (
      errores.has(claveCampo(item, "facturas-separator")) ||
      errores.has(claveCampo(item, "facturas-format"))
    ) {
      campos.push("la factura bien escrita");
    }
    if (campos.length > 0) malos.push({ numero: idx + 1, campos });
  });

  if (malos.length === 1) {
    const { numero, campos } = malos[0];
    const soloUnEnvio = estado.items.filter(filaTieneDatos).length === 1;
    falta.push(soloUnEnvio ? unirEnHumano(campos) : `${unirEnHumano(campos)} del envío ${numero}`);
  } else if (malos.length > 1) {
    falta.push(`los datos de los envíos ${unirEnHumano(malos.map((m) => String(m.numero)))}`);
  }

  return falta;
}
