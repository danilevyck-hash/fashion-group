// Lógica PURA del formulario de guía (crear y editar). Sin React, sin fetch,
// sin localStorage — para que se pueda probar sin montar nada.
//
// Por qué existe: hasta jul-2026 todo esto vivía adentro de `useGuiaFormState`
// y de `GuiaForm`, así que la cobertura del formulario era CERO. Las reglas que
// importan (qué es obligatorio, qué empresa se acepta, cómo se identifica una
// fila) ahora son funciones sueltas con candados propios.

import { ALL_EMPRESA_KEYS, mapEmpresaName } from "@/lib/empresa-mapping";
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
  if (!estado.entregadoPor) errores.add("entregadoPor");

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
      if (partes.some((p) => p.replace(/\D/g, "").length < 4)) {
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
