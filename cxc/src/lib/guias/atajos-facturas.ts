// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › NUEVA GUÍA — el cliente se elige UNA vez y sus FACTURAS se marcan.
// (módulo PURO: sin React, sin fetch, sin fecha implícita)
//
// Daniel aprobó el mockup con un *«va»* (3-sep-2026) y fijó la salida:
// *«te aviso si quiero revertir todo después de probarlo en producción con mi
// secretaria estas semanas»*. Por eso TODO lo nuevo de esa pantalla cuelga de
// UNA constante (`GUIAS_ATAJOS_NUEVOS`): en `false`, el formulario queda
// EXACTAMENTE como hoy — mismos campos, mismo orden, mismos textos.
//
// 🔴 NADA DE ESTO CAMBIA LO QUE SE GUARDA. Marcar facturas solo LLENA los
// mismos renglones que hoy se escriben a mano (`guia_items`: cliente, empresa,
// facturas "2535, 2536", bultos POR EMPRESA). El payload del POST/PUT, la guía
// impresa y el Excel son idénticos con la constante encendida o apagada — por
// eso apagarla no deja datos raros atrás. Hay candado que compara los dos
// caminos con `instantaneaRenglones`.
//
// 🔴 Reglas duras que este módulo sostiene:
//   · Elegir cliente NO es obligatorio y sigue sin serlo: todo esto es atajo,
//     jamás candado. Escribir cliente, empresa y facturas a mano sigue igual.
//   · Marcar una factura SÍ rellena cliente y empresa — es una ELECCIÓN del
//     usuario (tocó la casilla), no una sugerencia que ata sola.
//   · «Ya salió en otra guía» es AVISO, nunca bloqueo. Y el pareo del aviso es
//     exacto y normalizado POR EMPRESA: los secuenciales de Switch se repiten
//     entre empresas ("2535" existe en Vistana Y en Fashion Wear).
// ─────────────────────────────────────────────────────────────────────────────

import { TIPOS_VENTA_SUMAN } from "@/lib/ventas/tipos-comprobante";
import { fechaPanamaDe } from "@/lib/fecha-panama";

/**
 * 🔴 EL INTERRUPTOR DE REVERSIÓN — un solo lugar.
 *
 * Daniel: *«te aviso si quiero revertir todo después de probarlo en producción
 * con mi secretaria estas semanas»* (3-sep-2026). Angela y Andrea lo prueban;
 * si no va, esto se pone en `false` y la pantalla de Nueva guía vuelve a ser
 * la de hoy, sin nada que migrar: lo guardado nunca cambió de forma.
 */
export const GUIAS_ATAJOS_NUEVOS = true;

/**
 * El único tipo de comprobante que se ofrece para marcar. Amarra por tipo al
 * vocabulario canónico de `tipos-comprobante.ts`: si esa lista algún día
 * renombra «Factura», esto se pone rojo en compilación en vez de filtrar cero
 * filas en silencio.
 */
export const TIPO_FACTURA = "Factura" satisfies (typeof TIPOS_VENTA_SUMAN)[number];

/** Cuántas facturas se muestran antes del «Ver más» (un cliente típico tiene 13 en 90 días). */
export const FACTURAS_VISIBLES_INICIAL = 20;

/** Una factura del cliente, tal como la sirve `/api/guias/facturas-cliente`. */
export interface FacturaDelCliente {
  empresa_key: string;
  /** Nombre de display de la empresa — el MISMO que escribe el `<select>` del formulario. */
  empresa: string;
  secuencial: string;
  /** timestamptz ISO de `switch_facturas.fecha`. */
  fecha: string;
  total: number;
  /** N° de la guía VIVA donde esta factura ya aparece, o null. Aviso, nunca bloqueo. */
  yaSalioEn: number | null;
}

/**
 * Un renglón del formulario, reducido a lo que este módulo toca. Es
 * estructuralmente compatible con `GuiaItem` (`app/guias/components/types.ts`);
 * no se importa de `app/` porque `lib/` no puede depender de `app/`.
 */
export interface RenglonDeGuia {
  id?: string;
  uid?: string;
  orden: number;
  cliente: string;
  cliente_codigo?: string;
  direccion: string;
  empresa: string;
  facturas: string;
  bultos: number;
  numero_guia_transp: string;
}

export interface ClienteElegido {
  nombre: string;
  codigo: string;
}

// ─── Normalización (exacta, nunca por parecido) ──────────────────────────────

/**
 * Normaliza UN número de factura para compararlo: trim, y si es puramente
 * numérico se le quitan los ceros a la izquierda ("02535" y "2535" son el
 * MISMO valor). Nada más: "FA-001" y "FA-1" siguen siendo distintos — el
 * pareo por parecido está prohibido en este módulo.
 */
export function normalizarNumeroFactura(v: string | null | undefined): string {
  const t = (v ?? "").trim();
  if (/^\d+$/.test(t)) return t.replace(/^0+(?=\d)/, "");
  return t.toUpperCase();
}

/** Los números de un campo `facturas` ("2535, 2536"), normalizados y sin vacíos. */
export function numerosDeFacturas(facturas: string | null | undefined): string[] {
  return (facturas ?? "")
    .split(",")
    .map(normalizarNumeroFactura)
    .filter((n) => n !== "");
}

/**
 * Normaliza el nombre de empresa de un renglón para el pareo del aviso «ya
 * salió»: trim + minúsculas. Exacto — "VISTANA INTERNATIONAL" (texto viejo
 * sucio) parea con "Vistana International"; "Vistana" a secas NO.
 */
export function normalizarEmpresaGuia(v: string | null | undefined): string {
  return (v ?? "").trim().toLowerCase();
}

// ─── Agrupar por fecha: Hoy · Esta semana · Antes ────────────────────────────

export type GrupoFecha = "hoy" | "semana" | "antes";

export const TITULO_GRUPO: Record<GrupoFecha, string> = {
  hoy: "Hoy",
  semana: "Esta semana",
  antes: "Antes",
};

export const ORDEN_GRUPOS: readonly GrupoFecha[] = ["hoy", "semana", "antes"];

/**
 * En qué grupo cae una factura. `hoy` viene de afuera (YYYY-MM-DD en Panamá):
 * este módulo no mira el reloj — los tests usan fechas fijas, nunca `new Date()`.
 * «Esta semana» = los 6 días anteriores a hoy.
 */
export function grupoDeFecha(fechaIso: string, hoy: string): GrupoFecha {
  const dia = fechaPanamaDe(fechaIso);
  if (dia >= hoy) return "hoy";
  const corte = new Date(`${hoy}T00:00:00-05:00`).getTime() - 6 * 24 * 3600_000;
  const diaMs = new Date(`${dia}T00:00:00-05:00`).getTime();
  return diaMs >= corte ? "semana" : "antes";
}

// ─── El aviso «ya salió en otra guía» ────────────────────────────────────────
//
// 🔴 El sistema puede afirmar «ya salió», pero NO lo contrario: hay facturas
// sin guía que son mostrador o retiro en bodega (Multi Fashion Holding tiene
// 135 así). Por eso el índice solo produce el aviso positivo, y el aviso nunca
// deshabilita nada.

/** Un renglón VIVO de una guía VIVA, en lo mínimo que el índice necesita. */
export interface RenglonVivo {
  empresa: string | null;
  facturas: string | null;
  guiaNumero: number;
}

function claveYaSalio(empresaNombre: string | null | undefined, numeroNormalizado: string): string {
  return `${normalizarEmpresaGuia(empresaNombre)}|${numeroNormalizado}`;
}

/**
 * Índice (empresa normalizada, número normalizado) → N° de guía viva. Con la
 * misma factura en dos guías vivas gana la de número más ALTO (la más
 * reciente), que es la que sirve para ir a mirar.
 */
export function indiceYaSalio(renglones: readonly RenglonVivo[]): Map<string, number> {
  const indice = new Map<string, number>();
  for (const r of renglones) {
    for (const n of numerosDeFacturas(r.facturas)) {
      const clave = claveYaSalio(r.empresa, n);
      const previa = indice.get(clave);
      if (previa === undefined || r.guiaNumero > previa) indice.set(clave, r.guiaNumero);
    }
  }
  return indice;
}

/** ¿En qué guía viva ya salió esta factura de ESTA empresa? null = no consta. */
export function yaSalioEn(
  indice: ReadonlyMap<string, number>,
  empresaNombre: string,
  secuencial: string,
): number | null {
  return indice.get(claveYaSalio(empresaNombre, normalizarNumeroFactura(secuencial))) ?? null;
}

// ─── Marcar y desmarcar: las facturas LLENAN los renglones de siempre ────────

function filaVacia(r: RenglonDeGuia): boolean {
  return (
    !(r.cliente ?? "").trim() &&
    !(r.direccion ?? "").trim() &&
    !(r.empresa ?? "").trim() &&
    !(r.facturas ?? "").trim() &&
    !((r.bultos ?? 0) > 0)
  );
}

function renglonNuevo(orden: number): RenglonDeGuia {
  // Sin `uid`: lo asigna `reemplazarItems` en el hook (el generador vive en la
  // capa de app). `id` tampoco: es un renglón que nace en esta pantalla.
  return {
    orden,
    cliente: "",
    cliente_codigo: "",
    direccion: "",
    empresa: "",
    facturas: "",
    bultos: 0,
    numero_guia_transp: "",
  };
}

/** ¿Este renglón es el del cliente elegido para esta empresa? */
function esRenglonDe(r: RenglonDeGuia, cliente: ClienteElegido, empresaNombre: string): boolean {
  return (
    normalizarEmpresaGuia(r.empresa) === normalizarEmpresaGuia(empresaNombre) &&
    (r.cliente_codigo ?? "").trim() === cliente.codigo
  );
}

/** ¿Está marcada esta factura en los renglones actuales? (la fuente de verdad son los renglones) */
export function facturaMarcada(
  items: readonly RenglonDeGuia[],
  cliente: ClienteElegido,
  f: Pick<FacturaDelCliente, "empresa" | "secuencial">,
): boolean {
  const numero = normalizarNumeroFactura(f.secuencial);
  return items.some(
    (r) => esRenglonDe(r, cliente, f.empresa) && numerosDeFacturas(r.facturas).includes(numero),
  );
}

/**
 * Marca una factura: se AGREGA al renglón del cliente en ESA empresa (uno por
 * empresa — el formato de hoy: `"2535, 2536"`), o llena la primera fila vacía,
 * o crea un renglón nuevo. Devuelve un arreglo NUEVO; nunca muta.
 *
 * ⚠️ Lo que la persona ya escribió a mano en `facturas` se CONSERVA: marcar
 * agrega el número al final, no reescribe el campo.
 */
export function marcarFactura(
  items: readonly RenglonDeGuia[],
  cliente: ClienteElegido,
  f: Pick<FacturaDelCliente, "empresa" | "secuencial">,
): RenglonDeGuia[] {
  if (facturaMarcada(items, cliente, f)) return [...items];
  const sec = (f.secuencial ?? "").trim();

  const idxRenglon = items.findIndex((r) => esRenglonDe(r, cliente, f.empresa));
  if (idxRenglon >= 0) {
    return items.map((r, i) => {
      if (i !== idxRenglon) return r;
      const previas = (r.facturas ?? "").trim();
      return { ...r, facturas: previas ? `${previas}, ${sec}` : sec };
    });
  }

  const relleno = (r: RenglonDeGuia): RenglonDeGuia => ({
    ...r,
    cliente: cliente.nombre,
    cliente_codigo: cliente.codigo,
    empresa: f.empresa,
    facturas: sec,
  });

  const idxVacia = items.findIndex(filaVacia);
  if (idxVacia >= 0) return items.map((r, i) => (i === idxVacia ? relleno(r) : r));
  return [...items, relleno(renglonNuevo(items.length + 1))];
}

/**
 * Desmarca una factura: se quita el número del renglón que la tenía. Si el
 * renglón queda sin NADA que la persona haya escrito (sin bultos, sin
 * dirección, sin otras facturas), se retira; lo escrito a mano nunca se borra.
 */
export function desmarcarFactura(
  items: readonly RenglonDeGuia[],
  cliente: ClienteElegido,
  f: Pick<FacturaDelCliente, "empresa" | "secuencial">,
): RenglonDeGuia[] {
  const numero = normalizarNumeroFactura(f.secuencial);
  const idx = items.findIndex(
    (r) => esRenglonDe(r, cliente, f.empresa) && numerosDeFacturas(r.facturas).includes(numero),
  );
  if (idx < 0) return [...items];

  const r = items[idx];
  const quedan = (r.facturas ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "" && normalizarNumeroFactura(t) !== numero);
  const facturas = quedan.join(", ");

  const quedoSinNada = facturas === "" && !(r.direccion ?? "").trim() && !((r.bultos ?? 0) > 0);
  if (quedoSinNada) {
    const sinLaFila = items.filter((_, i) => i !== idx);
    // El formulario siempre tiene al menos una fila donde escribir.
    return sinLaFila.length > 0 ? sinLaFila : [renglonNuevo(1)];
  }
  return items.map((fila, i) => (i === idx ? { ...fila, facturas } : fila));
}

/**
 * «No está en la lista» / «Traslado sin factura»: un renglón del cliente con lo
 * que se le pase en `facturas` ("" = escribir el número a mano, como hoy;
 * "0000" = el traslado de siempre — 30 renglones así desde julio). Llena la
 * primera fila vacía o agrega una al final. Nunca es obligatorio pasar por acá.
 */
export function renglonDelCliente(
  items: readonly RenglonDeGuia[],
  cliente: ClienteElegido,
  facturas: string,
): RenglonDeGuia[] {
  const relleno = (r: RenglonDeGuia): RenglonDeGuia => ({
    ...r,
    cliente: cliente.nombre,
    cliente_codigo: cliente.codigo,
    facturas,
  });
  const idxVacia = items.findIndex(filaVacia);
  if (idxVacia >= 0) return items.map((r, i) => (i === idxVacia ? relleno(r) : r));
  return [...items, relleno(renglonNuevo(items.length + 1))];
}

/** El texto de «traslado sin factura», el mismo que hoy se teclea a mano. */
export const FACTURA_TRASLADO = "0000";
