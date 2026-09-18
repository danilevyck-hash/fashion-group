// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS — las etiquetas de las cajas de un despacho (módulo PURO:
// sin React, sin fetch, sin Supabase, sin fecha implícita).
//
// Daniel: elegir una factura, escribir cuántas cajas y que salgan las hojas
// para pegar. La etiqueta se imprime PRIMERO; la guía se hace ese día o tres
// días después, y sola se entera.
//
// 🩸 EL HUECO QUE LLENA (medido contra producción el 18-sep-2026): los bultos
// son UN NÚMERO POR RENGLÓN (`guia_items.bultos`) escrito AL CREAR LA GUÍA; un
// bulto no es una cosa en ningún lado —no hay caja 1 de 14—; y la factura del
// renglón es TEXTO LIBRE sin un solo id de Switch. Esta función guarda las tres
// cosas que faltaban: cuántas cajas lleva CADA factura, su numeración, y el
// `switch_factura_id`.
//
// 🔴 REGLAS DURAS QUE ESTE MÓDULO SOSTIENE:
//   · EL ESTADO SE DERIVA, jamás se mantiene. «En GT-XXX» solo si la etiqueta
//     apunta a un renglón VIVO de una guía VIVA. Borrado el renglón o la guía,
//     vuelve sola a «Pendiente de guía» (`guiaQueSeLlevo`).
//   · IMPORTADA = BLOQUEADA. Corregir bultos y borrar solo mientras está
//     pendiente — y lo decide el SERVIDOR, no el botón (`puedeCorregirse`).
//   · UNA FACTURA, UN JUEGO. Etiquetar la misma factura otra vez NO crea un
//     segundo juego: se dice lo que ya hay (409 del servidor + índice único
//     parcial en la base).
//   · Se juntan por CLIENTE + EMPRESA, exacto y normalizado, nunca por parecido.
//   · La etiqueta lleva EMPRESA · fecha · Factura · Cliente · Destino · CAJA
//     con su número. SIN transportista, SIN piezas, SIN código de barras y SIN
//     la dirección del directorio (ese candado sigue valiendo).
//   · 🔴 EL RÓTULO VA ARRIBA DEL DATO y el destino es tan grande como el
//     cliente (rediseño del 18-sep-2026, mockup de Daniel). El dibujo vive en
//     `pdf-etiquetas.ts`; acá viven los TEXTOS, para que haya uno solo.
// ─────────────────────────────────────────────────────────────────────────────

import { GUIAS_WRITE_ROLES } from "@/lib/guias/roles-escritura";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import {
  normalizarEmpresaGuia,
  numerosDeFacturas,
  type FacturaDelCliente,
  type RenglonDeGuia,
} from "@/lib/guias/atajos-facturas";
import { claveDeFactura } from "@/lib/guias/numero-factura";
import { fmtDate } from "@/lib/format";

/**
 * 🔴 QUIÉN ENTRA A ETIQUETAS — los MISMOS tres que escriben una guía, y la
 * lista se DERIVA de `GUIAS_WRITE_ROLES` en vez de copiarse. El vendedor ve
 * Guías en solo lectura y acá no entra.
 */
export const ETIQUETAS_ROLES: readonly string[] = GUIAS_WRITE_ROLES;

/** ¿Este rol puede ver y usar la pestaña Etiquetas? */
export function puedeEtiquetar(role: string | null | undefined): boolean {
  return ETIQUETAS_ROLES.includes(String(role ?? ""));
}

/**
 * Cuántas cajas se admiten. El récord REAL medido es 291 bultos en una guía
 * entera y 79 en un renglón (GT-256, Nova Lux); 300 deja aire sin dejar pasar
 * un dedo que se apoyó en el teclado. El mismo rango está en el CHECK de la
 * tabla: pantalla y base dicen lo mismo.
 */
export const MIN_CAJAS = 1;
export const MAX_CAJAS = 300;

/** Hoja carta partida en cuartos: cuatro etiquetas por hoja. */
export const ETIQUETAS_POR_HOJA = 4;

/** Una etiqueta, tal como la sirve `/api/guias/etiquetas`. */
export interface EtiquetaFila {
  id: number;
  empresa_key: string;
  /** Nombre de display de la empresa — el MISMO que escribe el `<select>` de la guía. */
  empresa: string;
  switch_factura_id: number;
  secuencial: string;
  /** YYYY-MM-DD, la fecha de la FACTURA (nunca «hoy»). */
  fecha_factura: string;
  cliente_codigo: string;
  cliente_nombre: string;
  destino: string;
  cajas: number;
  creado_en: string;
  /**
   * 🔴 DERIVADO EN EL SERVIDOR: el N° de la guía VIVA cuyo renglón VIVO se
   * llevó esta factura, o `null`. No es una columna de estado: sale de
   * `guiaQueSeLlevo` cada vez que se lee.
   */
  guia_numero: number | null;
}

// ─── El estado, DERIVADO ─────────────────────────────────────────────────────

/** El renglón al que apunta una etiqueta, con la guía a la que pertenece. */
export interface RenglonAtado {
  deleted: boolean | null;
  guia: { numero: number | null; deleted: boolean | null } | null;
}

/**
 * 🔴 ¿QUÉ GUÍA SE LLEVÓ ESTA ETIQUETA? `null` = ninguna, o sea «Pendiente de
 * guía». Daniel, al aprobar el mockup: *«si la guía o el renglón se borran
 * (soft delete), la etiqueta vuelve sola a Pendiente»*.
 *
 * Los DOS `deleted` son independientes: `guia_items` tiene el suyo y
 * `guia_transporte` el suyo. Mirar solo uno deja pasar etiquetas atadas a algo
 * que ya no existe, y la lista mostraría «En GT-203» de una guía borrada.
 */
export function guiaQueSeLlevo(renglon: RenglonAtado | null | undefined): number | null {
  if (!renglon) return null;
  if (renglon.deleted) return null;
  const g = renglon.guia;
  if (!g || g.deleted) return null;
  return typeof g.numero === "number" ? g.numero : null;
}

/** ¿Esta etiqueta ya salió en una guía? Deriva de `guia_numero`, nada más. */
export function estaImportada(e: Pick<EtiquetaFila, "guia_numero">): boolean {
  return e.guia_numero !== null;
}

/**
 * 🔴 CORREGIR BULTOS Y BORRAR: SOLO MIENTRAS ESTÁ PENDIENTE. Importada =
 * bloqueada. Esta función la usan la pantalla (para apagar el botón) Y el
 * servidor (para rechazar con 409): una sola regla, no dos.
 */
export function puedeCorregirse(e: Pick<EtiquetaFila, "guia_numero">): boolean {
  return !estaImportada(e);
}

/** N° de guía como se escribe en todo el módulo: GT-256. */
export function rotuloGuia(numero: number): string {
  return `GT-${String(numero).padStart(3, "0")}`;
}

/** Lo que dice la columna «Estado» de la lista. */
export function rotuloEstado(e: Pick<EtiquetaFila, "guia_numero">): string {
  return e.guia_numero === null ? "Pendiente de guía" : `En ${rotuloGuia(e.guia_numero)}`;
}

/** El texto del bloqueo, para que el botón apagado DIGA por qué. */
export function motivoBloqueo(e: Pick<EtiquetaFila, "guia_numero">): string | null {
  if (!estaImportada(e)) return null;
  return `Ya salió en ${rotuloGuia(e.guia_numero as number)}: no se corrige ni se borra.`;
}

// ─── Lo que se escribe ───────────────────────────────────────────────────────

/** Lo que viaja en el POST para etiquetar una factura. */
export interface EtiquetaNueva {
  empresa_key: string;
  switch_factura_id: number;
  secuencial: string;
  fecha_factura: string;
  cliente_codigo: string;
  cliente_nombre: string;
  destino: string;
  cajas: number;
}

export type Validacion<T> = { ok: true; valor: T } | { ok: false; error: string };

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * Las cajas: entero entre 1 y `MAX_CAJAS`. Fail-closed y con texto para la
 * pantalla — nunca una fila «más o menos».
 */
export function validarCajas(v: unknown): Validacion<number> {
  const n = typeof v === "number" ? v : Number(texto(v));
  if (!Number.isInteger(n)) return { ok: false, error: "Escribe cuántas cajas son" };
  if (n < MIN_CAJAS) return { ok: false, error: "Tiene que ser al menos una caja" };
  if (n > MAX_CAJAS) return { ok: false, error: `Son demasiadas cajas (el tope es ${MAX_CAJAS})` };
  return { ok: true, valor: n };
}

/** ¿Es una fecha calendario YYYY-MM-DD? (exacta, sin reloj ni zona horaria) */
export function esFechaCalendario(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  const fecha = new Date(Date.UTC(y, m - 1, d));
  return fecha.getUTCFullYear() === y && fecha.getUTCMonth() === m - 1 && fecha.getUTCDate() === d;
}

/**
 * Valida el POST entero. 🔴 La empresa se valida por INCLUSIÓN contra
 * `B2B_EMPRESA_KEYS` (las 6 del grupo): Boston y Multifashion no entran ni
 * aunque alguien mande su clave a mano.
 */
export function validarEtiquetaNueva(body: unknown): Validacion<EtiquetaNueva> {
  const b = (body ?? {}) as Record<string, unknown>;

  const empresa_key = texto(b.empresa_key);
  if (!(B2B_EMPRESA_KEYS as readonly string[]).includes(empresa_key)) {
    return { ok: false, error: "Esa empresa no entra en las etiquetas" };
  }

  const switch_factura_id = typeof b.switch_factura_id === "number"
    ? b.switch_factura_id
    : Number(texto(b.switch_factura_id));
  if (!Number.isInteger(switch_factura_id) || switch_factura_id <= 0) {
    return { ok: false, error: "Falta el número interno de la factura" };
  }

  const secuencial = texto(b.secuencial);
  if (!secuencial) return { ok: false, error: "Falta el número de la factura" };

  const fecha_factura = texto(b.fecha_factura).slice(0, 10);
  if (!esFechaCalendario(fecha_factura)) {
    return { ok: false, error: "Falta la fecha de la factura" };
  }

  const cliente_codigo = texto(b.cliente_codigo);
  if (!cliente_codigo) return { ok: false, error: "Falta el cliente" };

  const cliente_nombre = texto(b.cliente_nombre);
  if (!cliente_nombre) return { ok: false, error: "Falta el nombre del cliente" };

  const destino = texto(b.destino);
  if (!destino) return { ok: false, error: "Escribe el destino del envío" };

  const cajas = validarCajas(b.cajas);
  if (!cajas.ok) return { ok: false, error: cajas.error };

  return {
    ok: true,
    valor: {
      empresa_key,
      switch_factura_id,
      secuencial,
      fecha_factura,
      cliente_codigo,
      cliente_nombre,
      destino,
      cajas: cajas.valor,
    },
  };
}

// ─── Las hojas del papel ─────────────────────────────────────────────────────

/** Los números de caja de un juego completo: 1..total. */
export function cajasDelJuego(total: number): number[] {
  const n = Math.max(0, Math.floor(total));
  return Array.from({ length: n }, (_, i) => i + 1);
}

/**
 * Las hojas: cada una es un arreglo de CUATRO cuartos, y un cuarto sin
 * etiqueta es `null` (se imprime en blanco y las líneas de corte igual se
 * dibujan, para que el papel se parta siempre igual).
 *
 * 🔴 REIMPRIMIR UNA SOLA CAJA es el MISMO generador con una lista de un
 * elemento: una hoja, la etiqueta en la POSICIÓN 1 (arriba izquierda) y el
 * resto en blanco. No hay un segundo dibujo del papel.
 */
export function hojasDeEtiquetas(cajas: readonly number[]): Array<Array<number | null>> {
  const hojas: Array<Array<number | null>> = [];
  for (let i = 0; i < cajas.length; i += ETIQUETAS_POR_HOJA) {
    const hoja: Array<number | null> = [];
    for (let j = 0; j < ETIQUETAS_POR_HOJA; j++) {
      hoja.push(i + j < cajas.length ? cajas[i + j] : null);
    }
    hojas.push(hoja);
  }
  return hojas;
}

/** Cuántas hojas salen para N etiquetas. */
export function cuantasHojas(cantidad: number): number {
  return Math.ceil(Math.max(0, cantidad) / ETIQUETAS_POR_HOJA);
}

/**
 * 🔴 «CAJA» Y SU NÚMERO SON DOS COSAS (rediseño del 18-sep-2026). Antes era UNA
 * línea, «CAJA 3 de 14», flotando abajo sin separador. En el mockup de Daniel
 * son dos renglones centrados debajo de una raya: el rótulo chico y espaciado,
 * y debajo el número enorme. Están separados acá —y no en el PDF— para que la
 * pantalla y el papel no puedan decir cosas distintas.
 */
export const ROTULO_CAJA = "CAJA";

/** El número de la etiqueta, lo más grande del papel: «3 de 14». */
export function numeroDeCaja(n: number, total: number): string {
  return `${n} de ${total}`;
}

/** Lo que dice el botón: «Imprimir 14 etiquetas · 4 hojas». */
export function textoImprimir(cantidad: number): string {
  const hojas = cuantasHojas(cantidad);
  const etq = `${cantidad} ${cantidad === 1 ? "etiqueta" : "etiquetas"}`;
  const hj = `${hojas} ${hojas === 1 ? "hoja" : "hojas"}`;
  return `Imprimir ${etq} · ${hj}`;
}

/**
 * 🔴 LA FECHA DE LA ETIQUETA VA EN EL FORMATO DE LA CASA: «18 sept 2026»
 * (18-sep-2026). Sale de `fmtDate`, el MISMO que escribe las fechas de todo el
 * papel del sistema —la guía, los pedidos, las comisiones, los reclamos—, así
 * que no hay una segunda forma de escribir una fecha.
 *
 * 🩸 Antes decía «18-09-2026»: un formato de máquina que esta función armaba a
 * mano, y el único del sistema que se leía así.
 *
 * ⚠️ La validación se queda: una fecha que no es calendario devuelve cadena
 * vacía, nunca un «Invalid Date» impreso encima de una caja.
 */
export function fechaDeLaEtiqueta(fechaCalendario: string): string {
  const v = String(fechaCalendario ?? "").slice(0, 10);
  if (!esFechaCalendario(v)) return "";
  return fmtDate(v);
}

/** Cómo se llama el archivo: se ve en la carpeta de descargas, así que dice qué es. */
export function nombreArchivoEtiquetas(e: Pick<EtiquetaFila, "secuencial">, caja?: number | null): string {
  const sec = String(e.secuencial ?? "").replace(/[^\w.-]+/g, "");
  return caja != null
    ? `Etiquetas-${sec}-caja-${caja}.pdf`
    : `Etiquetas-${sec}.pdf`;
}

// ─── Juntar para los renglones de la guía ────────────────────────────────────

/** Un renglón armado desde las etiquetas marcadas en `/guias/nueva`. */
export interface RenglonDeEtiquetas {
  cliente: string;
  cliente_codigo: string;
  empresa: string;
  facturas: string;
  bultos: number;
  direccion: string;
  /** Los ids de las etiquetas que formaron este renglón (para atarlas después). */
  etiquetas: number[];
}

/**
 * 🔴 SE JUNTAN POR CLIENTE **Y** EMPRESA, con los bultos SUMADOS y su destino
 * (18-sep-2026). Daniel dio el ejemplo «3 facturas de Nova Lux → 1 renglón»: se
 * juntan las del mismo par, así que dos facturas del mismo cliente en empresas
 * distintas van en dos renglones — que es lo que ya pasa de verdad (GT-256
 * llevó a Nova Lux en cuatro renglones, uno por empresa).
 *
 * 🔴 LO QUE SE GUARDA NO CAMBIA: esto arma los MISMOS renglones que hoy se
 * escriben a mano (`guia_items`: cliente, empresa, facturas «A, B», bultos,
 * dirección). El pareo es por CÓDIGO y por `empresa_key`, exacto — nunca por
 * nombre ni por parecido.
 *
 * ⚠️ Solo entran las PENDIENTES: una etiqueta que ya salió en una guía no se
 * vuelve a meter en otra.
 */
export function agruparEtiquetasEnRenglones(
  etiquetas: readonly EtiquetaFila[],
): RenglonDeEtiquetas[] {
  const grupos = new Map<string, RenglonDeEtiquetas>();
  for (const e of etiquetas) {
    if (estaImportada(e)) continue;
    const codigo = (e.cliente_codigo ?? "").trim();
    const clave = `${codigo}|${(e.empresa_key ?? "").trim()}`;
    const previo = grupos.get(clave);
    if (previo) {
      grupos.set(clave, {
        ...previo,
        facturas: previo.facturas ? `${previo.facturas}, ${e.secuencial}` : e.secuencial,
        bultos: previo.bultos + (e.cajas ?? 0),
        // El destino del primero manda; si ése venía vacío, entra el siguiente
        // que tenga uno. Nunca se inventa ni se mezclan dos destinos.
        direccion: previo.direccion || (e.destino ?? "").trim(),
        etiquetas: [...previo.etiquetas, e.id],
      });
      continue;
    }
    grupos.set(clave, {
      cliente: (e.cliente_nombre ?? "").trim(),
      cliente_codigo: codigo,
      empresa: (e.empresa ?? "").trim(),
      facturas: (e.secuencial ?? "").trim(),
      bultos: e.cajas ?? 0,
      direccion: (e.destino ?? "").trim(),
      etiquetas: [e.id],
    });
  }
  return [...grupos.values()];
}

/** El total de bultos de lo marcado — el mismo número que va al pie de la guía. */
export function totalBultos(renglones: readonly RenglonDeEtiquetas[]): number {
  return renglones.reduce((suma, r) => suma + (r.bultos ?? 0), 0);
}

// ─── La lista de la pestaña ──────────────────────────────────────────────────

export type FiltroEtiquetas = "pendientes" | "todas";

/**
 * Lo que se ve en la lista. Abre por PENDIENTES (lo que todavía no salió en
 * ninguna guía) y el buscador filtra lo YA CARGADO por subcadena exacta
 * normalizada, nunca por parecido — la misma regla de `buscar-en-lista.ts`.
 */
export function filtrarEtiquetas(
  etiquetas: readonly EtiquetaFila[],
  filtro: FiltroEtiquetas,
  buscar: string,
): EtiquetaFila[] {
  const q = normalizar(buscar);
  return etiquetas.filter((e) => {
    if (filtro === "pendientes" && estaImportada(e)) return false;
    if (!q) return true;
    const heno = normalizar(`${e.secuencial} ${e.cliente_nombre} ${e.cliente_codigo} ${e.empresa} ${e.destino}`);
    return heno.includes(q);
  });
}

function normalizar(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Cuántas pendientes hay (el número del chip). */
export function cuantasPendientes(etiquetas: readonly EtiquetaFila[]): number {
  return etiquetas.filter((e) => !estaImportada(e)).length;
}

/** ¿Esta factura ya está etiquetada? Devuelve la etiqueta VIVA, o null. */
export function etiquetaDeLaFactura(
  etiquetas: readonly EtiquetaFila[],
  empresaKey: string,
  switchFacturaId: number,
): EtiquetaFila | null {
  const k = String(empresaKey ?? "").trim();
  return (
    etiquetas.find((e) => e.empresa_key === k && e.switch_factura_id === switchFacturaId) ?? null
  );
}

/** El texto de la tarjeta anti-duplicado: «Ya etiquetada · 14 cajas». */
export function textoYaEtiquetada(e: Pick<EtiquetaFila, "cajas">): string {
  return `Ya etiquetada · ${e.cajas} ${e.cajas === 1 ? "caja" : "cajas"}`;
}

// ─── El selector para etiquetar NO ofrece lo ya etiquetado (18-sep-2026) ─────
//
// Daniel: *«Reimprimir/corregir solo desde la lista de la pestaña»*.
//
// 🩸 Hasta acá las facturas ya etiquetadas SALÍAN en la lista del panel, con un
// chip verde; elegir una y darle a Imprimir terminaba en el 409 del servidor.
// O sea: la pantalla ofrecía un camino que no llevaba a ningún lado.
//
// 🔴 Y NO SE ESCONDEN EN SILENCIO: se dice cuántas se escondieron y dónde
// están. Esconder sin contar haría creer que una factura se perdió.

/**
 * Las facturas que todavía se pueden etiquetar, y cuántas se escondieron por
 * tener ya su juego. El pareo es por `empresa_key` + `switch_factura_id`
 * (el id REAL de Switch): una factura sin ese id nunca se esconde.
 */
export function facturasParaEtiquetar(
  facturas: readonly FacturaDelCliente[],
  etiquetas: readonly EtiquetaFila[],
): { visibles: FacturaDelCliente[]; escondidas: number } {
  const visibles = facturas.filter(
    (f) =>
      f.switch_factura_id == null ||
      etiquetaDeLaFactura(etiquetas, f.empresa_key, f.switch_factura_id) === null,
  );
  return { visibles, escondidas: facturas.length - visibles.length };
}

/** Lo que se dice de las escondidas. `null` = no se escondió ninguna. */
export function textoEscondidasPorEtiqueta(n: number): string | null {
  if (n <= 0) return null;
  return n === 1
    ? "1 factura de este cliente ya está etiquetada — mírala en la lista"
    : `${n} facturas de este cliente ya están etiquetadas — míralas en la lista`;
}

/**
 * 🔴 EL TEXTO DE SWITCH, COMO LO DICTÓ DANIEL (18-sep-2026), verbatim:
 * *«¿No aparece la factura de hoy? Tráela de Switch»*. Antes decía «¿No está
 * la factura de hoy? El detalle de Switch entra una vez al día» — una
 * explicación del mecanismo donde hacía falta una pregunta y qué hacer.
 */
export const TEXTO_TRAER_DE_SWITCH = "¿No aparece la factura de hoy? Tráela de Switch";

// ─── Corregir bultos lleva a reimprimir (18-sep-2026) ────────────────────────

/**
 * 🔴 CORREGIR LOS BULTOS DEJA EL PAPEL VIEJO MAL, Y HAY QUE DECIRLO. Si alguien
 * corrigió de 14 a 16 cajas, las 14 etiquetas impresas dicen «de 14» y la caja
 * 15 y la 16 no existen en papel. Por eso guardar abre directo la reimpresión
 * del JUEGO COMPLETO, con este aviso arriba.
 *
 * `null` cuando el número no cambió: no hay nada que rehacer y una frase de más
 * tapa los datos.
 */
export function avisoDeReimpresion(antes: number, despues: number): string | null {
  if (antes === despues) return null;
  return `Eran ${antes} ${antes === 1 ? "caja" : "cajas"} y ahora son ${despues}: las etiquetas impresas quedaron mal. Imprime el juego completo.`;
}

// ─── Marcar etiquetas en Nueva guía: LLENAN los renglones de siempre ─────────
//
// 🔴 LA GUÍA SE SIGUE ARMANDO IGUAL QUE HOY. Marcar una etiqueta rellena los
// MISMOS renglones que se escriben a mano (`guia_items`: cliente, empresa,
// facturas «A, B», bultos, dirección) — el payload del POST no cambia ni un
// campo. Es un atajo, jamás un candado: si no se toca, la pantalla es la de
// siempre.
//
// 🔴 Y NUNCA PISA LO ESCRITO A MANO: se agrega al renglón que ya existe para
// ese par (cliente, empresa), sumando bultos, igual que `marcarFactura`.

/** ¿Este renglón es el del cliente y la empresa de esta etiqueta? (exacto) */
function esRenglonDeLaEtiqueta(r: RenglonDeGuia, e: EtiquetaFila): boolean {
  return (
    (r.cliente_codigo ?? "").trim() === (e.cliente_codigo ?? "").trim() &&
    normalizarEmpresaGuia(r.empresa) === normalizarEmpresaGuia(e.empresa)
  );
}

/** ¿Está marcada esta etiqueta? La fuente de verdad son los RENGLONES. */
export function etiquetaMarcada(items: readonly RenglonDeGuia[], e: EtiquetaFila): boolean {
  const clave = claveDeFactura(e.secuencial);
  if (clave === "") return false;
  return items.some(
    (r) => esRenglonDeLaEtiqueta(r, e) && numerosDeFacturas(r.facturas).includes(clave),
  );
}

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

/**
 * Marca una etiqueta: su factura se AGREGA al renglón de ese (cliente, empresa)
 * y sus cajas se SUMAN a los bultos — o nace un renglón nuevo con el destino ya
 * puesto. Devuelve un arreglo NUEVO; nunca muta.
 */
export function marcarEtiqueta(
  items: readonly RenglonDeGuia[],
  e: EtiquetaFila,
): RenglonDeGuia[] {
  if (etiquetaMarcada(items, e)) return [...items];
  const sec = (e.secuencial ?? "").trim();
  const idx = items.findIndex((r) => esRenglonDeLaEtiqueta(r, e));
  if (idx >= 0) {
    return items.map((r, i) => {
      if (i !== idx) return r;
      const previas = (r.facturas ?? "").trim();
      return {
        ...r,
        facturas: previas ? `${previas}, ${sec}` : sec,
        bultos: (r.bultos ?? 0) + (e.cajas ?? 0),
        direccion: r.direccion || (e.destino ?? ""),
      };
    });
  }

  const relleno = (r: RenglonDeGuia): RenglonDeGuia => ({
    ...r,
    cliente: e.cliente_nombre,
    cliente_codigo: e.cliente_codigo,
    empresa: e.empresa,
    facturas: sec,
    bultos: (r.bultos ?? 0) + (e.cajas ?? 0),
    direccion: r.direccion || (e.destino ?? ""),
  });
  const idxVacia = items.findIndex(filaVacia);
  if (idxVacia >= 0) return items.map((r, i) => (i === idxVacia ? relleno(r) : r));
  return [...items, relleno(renglonNuevo(items.length + 1))];
}

/**
 * Desmarca una etiqueta: se quita su factura del renglón y se le restan sus
 * cajas. Si el renglón queda sin NADA, se retira — pero lo escrito a mano
 * (otra factura, otro destino, bultos que no vienen de acá) nunca se borra.
 */
export function desmarcarEtiqueta(
  items: readonly RenglonDeGuia[],
  e: EtiquetaFila,
): RenglonDeGuia[] {
  const clave = claveDeFactura(e.secuencial);
  if (clave === "") return [...items];
  const idx = items.findIndex(
    (r) => esRenglonDeLaEtiqueta(r, e) && numerosDeFacturas(r.facturas).includes(clave),
  );
  if (idx < 0) return [...items];

  const r = items[idx];
  const quedan = (r.facturas ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "" && claveDeFactura(t) !== clave);
  const facturas = quedan.join(", ");
  const bultos = Math.max(0, (r.bultos ?? 0) - (e.cajas ?? 0));
  // El destino que puso la etiqueta no cuenta como escrito a mano.
  const destinoEsElDeLaEtiqueta = (r.direccion ?? "").trim() === (e.destino ?? "").trim();
  if (facturas === "" && bultos === 0 && (!(r.direccion ?? "").trim() || destinoEsElDeLaEtiqueta)) {
    const sinLaFila = items.filter((_, i) => i !== idx);
    return sinLaFila.length > 0 ? sinLaFila : [renglonNuevo(1)];
  }
  return items.map((fila, i) => (i === idx ? { ...fila, facturas, bultos } : fila));
}

/**
 * Los ids de las etiquetas que están marcadas en los renglones de hoy.
 *
 * ⚠️ Desde el 18-sep-2026 el panel NO usa esto para decidir qué atar: una
 * factura puede estar en el renglón porque la marcó el selector de siempre, y
 * eso no es una etiqueta marcada. Lo que atar lo dice `idsParaAtar`
 * (`anti-doble-captura.ts`), que además mira QUIÉN la marcó. Esta función
 * queda como lo que siempre fue: «¿esta factura está en algún renglón?».
 */
export function etiquetasMarcadas(
  items: readonly RenglonDeGuia[],
  etiquetas: readonly EtiquetaFila[],
): number[] {
  return etiquetas.filter((e) => etiquetaMarcada(items, e)).map((e) => e.id);
}
