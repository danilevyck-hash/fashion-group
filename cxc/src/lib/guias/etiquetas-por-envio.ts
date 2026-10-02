// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › ETIQUETAS POR ENVÍO (1-oct-2026) — módulo PURO: sin React, sin
// fetch, sin Supabase, sin reloj.
//
// Daniel, 1-oct-2026: las etiquetas son POR ENVÍO = empresa + cliente +
// destino. Se marcan VARIAS facturas, cada una con sus bultos y una NOTA
// opcional, y se imprime AL FINAL, cuando el envío está completo: al imprimir
// el envío queda CERRADO.
//
// 🔴 LAS REGLAS QUE ESTE MÓDULO SOSTIENE:
//   · NUMERACIÓN CORRIDA: factura A 1–10, B 11–20, C 21–30, todas «de 30».
//     Los rangos se CALCULAN (`rangosDelEnvio`), nunca se guardan.
//   · LO IMPRESO NO SE CAMBIA: no hay «Corregir bultos» para un envío; si hay
//     un error se ANULA el envío entero (borrado firmado de TODAS sus filas) y
//     se hace de nuevo — y solo si el envío NO está en una guía (409).
//   · EN LA GUÍA, EL ENVÍO ES UN RENGLÓN y sus bultos son el total de sus
//     etiquetas: NO se editan, ni en Nueva guía ni en el despacho de bodega.
//     Los renglones sin etiquetas (guías a mano) siguen como siempre.
//   · LA NOTA: ≤ 15 letras, en mayúsculas, opcional. Los atajos son las 3 MÁS
//     USADAS, contadas de las etiquetas que existen (se actualizan solas).
//
// 🔴 EL INTERRUPTOR: `ETIQUETAS_POR_ENVIO`. En `false` vuelve la pantalla de
// antes («Una a la vez», «Corregir bultos», bultos editables en la guía).
// ─────────────────────────────────────────────────────────────────────────────

import {
  MAX_CAJAS,
  estaImportada,
  validarEtiquetaNueva,
  type EtiquetaFila,
  type Validacion,
} from "@/lib/guias/etiquetas";
import { normalizarEmpresaGuia, numerosDeFacturas, type RenglonDeGuia } from "@/lib/guias/atajos-facturas";
import { claveDeFactura } from "@/lib/guias/numero-factura";
import { GUIA_NUEVA_2026_10 } from "@/lib/guias/guias-2026-10";

/** 🔴 El interruptor. `false` = Etiquetas y la guía como estaban el 30-sep-2026. */
export const ETIQUETAS_POR_ENVIO = true;

/** La nota cabe en el papel grande y se lee de lejos: 15 letras como mucho. */
export const MAX_NOTA = 15;

/** Cuántas notas MÁS USADAS se ofrecen como atajo debajo de la caja. */
export const NOTAS_A_LA_MANO = 3;

/** El envío al que pertenece una etiqueta: sin la columna, cada fila es el suyo. */
export function envioDe(e: Pick<EtiquetaFila, "id" | "envio_id">): string {
  return e.envio_id || String(e.id);
}

/**
 * La nota: se recortan los bordes, se juntan los espacios y va en MAYÚSCULAS.
 * Vacía = sin nota (`null`, nunca cadena vacía: así lo exige el CHECK).
 */
export function normalizarNota(v: unknown): Validacion<string | null> {
  const t = typeof v === "string" ? v.trim().replace(/\s+/g, " ").toUpperCase() : "";
  if (!t) return { ok: true, valor: null };
  if (t.length > MAX_NOTA) return { ok: false, error: `La nota es de ${MAX_NOTA} letras como mucho` };
  return { ok: true, valor: t };
}

// ─── Lo que viaja en el POST de un envío ─────────────────────────────────────

export interface FacturaDelEnvio {
  switch_factura_id: number;
  secuencial: string;
  fecha_factura: string;
  cajas: number;
  nota: string | null;
}

export interface EnvioNuevo {
  empresa_key: string;
  cliente_codigo: string;
  cliente_nombre: string;
  destino: string;
  facturas: FacturaDelEnvio[];
}

/**
 * Valida el envío ENTERO: la cabecera (empresa · cliente · destino) y cada
 * factura con las MISMAS reglas que una etiqueta suelta (`validarEtiquetaNueva`).
 * 🔴 Todo o nada: una sola factura mal y no se guarda ninguna.
 *
 * ⚠️ El total del envío tiene el mismo tope que una factura (`MAX_CAJAS`): es
 * lo que se imprime como «de N», y 300 ya pasa el récord real de una guía
 * entera (291 bultos).
 */
export function validarEnvioNuevo(body: unknown): Validacion<EnvioNuevo> {
  const b = (body ?? {}) as Record<string, unknown>;
  const lista = Array.isArray(b.facturas) ? (b.facturas as unknown[]) : [];
  if (lista.length === 0) return { ok: false, error: "Marca al menos una factura" };

  const facturas: FacturaDelEnvio[] = [];
  let cabecera: Omit<EnvioNuevo, "facturas"> | null = null;
  const vistas = new Set<number>();
  for (const f of lista) {
    const fila = (f ?? {}) as Record<string, unknown>;
    const v = validarEtiquetaNueva({ ...b, ...fila, facturas: undefined });
    if (!v.ok) return { ok: false, error: v.error };
    const nota = normalizarNota(fila.nota);
    if (!nota.ok) return { ok: false, error: `${v.valor.secuencial}: ${nota.error}` };
    if (vistas.has(v.valor.switch_factura_id)) {
      return { ok: false, error: `La factura ${v.valor.secuencial} está dos veces en el envío` };
    }
    vistas.add(v.valor.switch_factura_id);
    cabecera ??= {
      empresa_key: v.valor.empresa_key,
      cliente_codigo: v.valor.cliente_codigo,
      cliente_nombre: v.valor.cliente_nombre,
      destino: v.valor.destino,
    };
    facturas.push({
      switch_factura_id: v.valor.switch_factura_id,
      secuencial: v.valor.secuencial,
      fecha_factura: v.valor.fecha_factura,
      cajas: v.valor.cajas,
      nota: nota.valor,
    });
  }
  const total = facturas.reduce((s, f) => s + f.cajas, 0);
  if (total > MAX_CAJAS) {
    return { ok: false, error: `Son demasiados bultos para un envío (el tope es ${MAX_CAJAS})` };
  }
  return { ok: true, valor: { ...(cabecera as Omit<EnvioNuevo, "facturas">), facturas } };
}

// ─── Los rangos: CALCULADOS, nunca guardados ─────────────────────────────────

type FilaDeEnvio = Pick<EtiquetaFila, "id" | "cajas" | "orden_en_envio">;

export interface RangoDeFactura<T> {
  fila: T;
  /** El primer bulto de esta factura en la numeración corrida del envío. */
  desde: number;
  /** El último. */
  hasta: number;
}

/**
 * 🔴 LA NUMERACIÓN CORRIDA. Las filas van por `orden_en_envio` (y por id, para
 * que dos filas viejas sin orden salgan siempre igual) y se acumulan:
 * A con 10 → 1–10, B con 10 → 11–20, C con 10 → 21–30, total 30.
 */
export function rangosDelEnvio<T extends FilaDeEnvio>(
  filas: readonly T[],
): { rangos: RangoDeFactura<T>[]; total: number } {
  const ordenadas = [...filas].sort(
    (a, b) => (a.orden_en_envio ?? 1) - (b.orden_en_envio ?? 1) || a.id - b.id,
  );
  let total = 0;
  const rangos = ordenadas.map((fila) => {
    const n = Math.max(0, Math.floor(fila.cajas ?? 0));
    const desde = total + 1;
    total += n;
    return { fila, desde, hasta: total };
  });
  return { rangos, total };
}

/** «1–10», o «7» cuando la factura lleva un solo bulto. */
export function textoRango(r: Pick<RangoDeFactura<unknown>, "desde" | "hasta">): string {
  return r.desde === r.hasta ? String(r.desde) : `${r.desde}–${r.hasta}`;
}

/** ¿De qué factura es el bulto N del envío? `null` si N está fuera. */
export function facturaDelBulto<T extends FilaDeEnvio>(
  filas: readonly T[],
  n: number,
): T | null {
  return rangosDelEnvio(filas).rangos.find((r) => n >= r.desde && n <= r.hasta)?.fila ?? null;
}

// ─── La lista: un renglón por ENVÍO ──────────────────────────────────────────

export interface Envio {
  envio_id: string;
  /** Las facturas del envío, en su orden. */
  filas: EtiquetaFila[];
  empresa_key: string;
  empresa: string;
  cliente_codigo: string;
  cliente_nombre: string;
  destino: string;
  /** El total del envío: el «de N» que se imprimió. */
  total: number;
  /** La guía que se lo llevó (cualquiera de sus filas atada lo ata). */
  guia_numero: number | null;
  creado_en: string;
}

/**
 * Junta las etiquetas por envío, en el orden en que llegan (la lista ya viene
 * con lo más reciente arriba). Cada envío trae sus filas en orden.
 */
export function agruparEnEnvios(etiquetas: readonly EtiquetaFila[]): Envio[] {
  const porEnvio = new Map<string, EtiquetaFila[]>();
  for (const e of etiquetas) {
    const k = envioDe(e);
    porEnvio.set(k, [...(porEnvio.get(k) ?? []), e]);
  }
  return [...porEnvio.entries()].map(([envio_id, sueltas]) => {
    const { rangos, total } = rangosDelEnvio(sueltas);
    const filas = rangos.map((r) => r.fila);
    const primera = filas[0];
    return {
      envio_id,
      filas,
      empresa_key: primera.empresa_key,
      empresa: primera.empresa,
      cliente_codigo: primera.cliente_codigo,
      cliente_nombre: primera.cliente_nombre,
      destino: primera.destino,
      total,
      guia_numero: filas.find((f) => f.guia_numero !== null)?.guia_numero ?? null,
      creado_en: primera.creado_en,
    };
  });
}

/** Las facturas del envío, como se leen en la lista: «11-0001, 11-0002». */
export function facturasDelEnvio(envio: Pick<Envio, "filas">): string {
  return envio.filas.map((f) => f.secuencial).join(", ");
}

function normalizar(s: string | null | undefined): string {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Lo que se ve en la lista de envíos: abre por PENDIENTES y el buscador filtra
 * lo ya cargado por subcadena exacta normalizada —factura, cliente, empresa,
 * destino o nota—, nunca por parecido (la misma regla de `filtrarEtiquetas`).
 */
export function filtrarEnvios(
  envios: readonly Envio[],
  filtro: "pendientes" | "todas",
  buscar: string,
): Envio[] {
  const q = normalizar(buscar);
  return envios.filter((v) => {
    if (filtro === "pendientes" && v.filas.some(estaImportada)) return false;
    if (!q) return true;
    const heno = normalizar(
      [facturasDelEnvio(v), v.cliente_nombre, v.cliente_codigo, v.empresa, v.destino, ...v.filas.map((f) => f.nota ?? "")].join(" "),
    );
    return heno.includes(q);
  });
}

// ─── Las notas más usadas ────────────────────────────────────────────────────

/**
 * 🔴 LOS ATAJOS SE CALCULAN, NO SE ESCRIBEN: las `n` notas que más se usaron en
 * las etiquetas que existen. Empate → la que se usó más recientemente primero
 * (la lista llega con lo más nuevo arriba), y si no, por orden alfabético.
 */
export function notasMasUsadas(
  etiquetas: readonly Pick<EtiquetaFila, "nota">[],
  n: number = NOTAS_A_LA_MANO,
): string[] {
  const cuenta = new Map<string, { veces: number; primera: number }>();
  etiquetas.forEach((e, i) => {
    const nota = normalizarNota(e.nota);
    if (!nota.ok || !nota.valor) return;
    const previa = cuenta.get(nota.valor);
    cuenta.set(nota.valor, { veces: (previa?.veces ?? 0) + 1, primera: previa?.primera ?? i });
  });
  return [...cuenta.entries()]
    .sort((a, b) => b[1].veces - a[1].veces || a[1].primera - b[1].primera || a[0].localeCompare(b[0]))
    .slice(0, Math.max(0, n))
    .map(([nota]) => nota);
}

// ─── Nueva guía: el envío es UN renglón, con los bultos bloqueados ───────────

/** Un renglón de la guía que puede venir de un envío etiquetado. */
export type RenglonConEtiquetas = RenglonDeGuia & {
  /**
   * 🔴 Este renglón es un envío etiquetado: sus bultos son el total de las
   * etiquetas y NO se editan. En Nueva guía lo pone `marcarEnvio`; en una guía
   * guardada lo DERIVA el servidor de `guias_etiquetas.guia_item_id`.
   */
  con_etiquetas?: boolean;
  /**
   * 🔴 UN RENGLÓN POR ENVÍO (1-oct-2026): el envío que llenó este renglón. Solo
   * vive en la pantalla (el POST no lo guarda): sirve para desmarcar ESE envío
   * y no otro del mismo cliente + empresa + destino.
   */
  envio_id?: string;
};

/** ¿Los bultos de este renglón están bloqueados por venir de etiquetas? */
export function bultosBloqueadosPorEtiquetas(
  r: Pick<RenglonConEtiquetas, "con_etiquetas">,
  porEnvio: boolean = ETIQUETAS_POR_ENVIO,
): boolean {
  return porEnvio && r.con_etiquetas === true;
}

const destinoClave = (s: string | null | undefined) =>
  String(s ?? "").trim().replace(/\s+/g, " ").toLowerCase();

/** ¿Este renglón es el del envío? Exacto: cliente + empresa + destino. */
function esRenglonDelEnvio(r: RenglonConEtiquetas, envio: Envio): boolean {
  return (
    r.con_etiquetas === true &&
    (r.cliente_codigo ?? "").trim() === envio.cliente_codigo.trim() &&
    normalizarEmpresaGuia(r.empresa) === normalizarEmpresaGuia(envio.empresa) &&
    destinoClave(r.direccion) === destinoClave(envio.destino)
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

/**
 * Marca un envío entero: TODAS sus facturas van a UN renglón, con los bultos
 * sumados y bloqueados. Nunca se mezcla con un renglón escrito a mano.
 *
 * 🔴 UN RENGLÓN POR ENVÍO (1-oct-2026, Daniel aprobó el mockup): el envío va
 * SIEMPRE a su propio renglón (la primera fila vacía o una nueva al final). 🩸
 * Antes dos envíos del mismo cliente + empresa + destino se JUNTABAN en un
 * renglón, y la numeración «1 de 10» se repetía en la misma línea de la guía.
 * Con `unoPorEnvio` en `false` se juntan como el 30-sep-2026.
 */
export function marcarEnvio<R extends RenglonConEtiquetas>(
  items: readonly R[],
  envio: Envio,
  unoPorEnvio: boolean = GUIA_NUEVA_2026_10,
): R[] {
  const secs = envio.filas.map((f) => f.secuencial.trim());
  if (unoPorEnvio && items.some((r) => r.envio_id === envio.envio_id)) return [...items];
  const idx = unoPorEnvio ? -1 : items.findIndex((r) => esRenglonDelEnvio(r, envio));
  if (idx >= 0) {
    return items.map((r, i) => {
      if (i !== idx) return r;
      const previas = (r.facturas ?? "").trim();
      return {
        ...r,
        facturas: [previas, ...secs].filter(Boolean).join(", "),
        bultos: (r.bultos ?? 0) + envio.total,
      };
    });
  }
  const relleno = (r: R): R => ({
    ...r,
    cliente: envio.cliente_nombre,
    cliente_codigo: envio.cliente_codigo,
    empresa: envio.empresa,
    direccion: envio.destino,
    facturas: secs.join(", "),
    bultos: envio.total,
    con_etiquetas: true,
    ...(unoPorEnvio ? { envio_id: envio.envio_id } : {}),
  });
  const idxVacia = items.findIndex(filaVacia);
  if (idxVacia >= 0) return items.map((r, i) => (i === idxVacia ? relleno(r) : r));
  const nuevo = {
    orden: items.length + 1,
    cliente: "",
    cliente_codigo: "",
    direccion: "",
    empresa: "",
    facturas: "",
    bultos: 0,
    numero_guia_transp: "",
  } as R;
  return [...items, relleno(nuevo)];
}

/** Desmarca un envío: salen sus facturas y sus bultos; sin nada, el renglón se va. */
export function desmarcarEnvio<R extends RenglonConEtiquetas>(items: readonly R[], envio: Envio): R[] {
  // 🔴 1-oct-2026: el renglón que es de ESTE envío (y de ningún otro) se va entero.
  const suyo = items.findIndex((r) => r.envio_id !== undefined && r.envio_id === envio.envio_id);
  if (suyo >= 0) {
    const sin = items.filter((_, i) => i !== suyo);
    if (sin.length > 0) return sin;
    const r = items[suyo];
    return [{ ...r, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, con_etiquetas: undefined, envio_id: undefined }];
  }
  const claves = new Set(envio.filas.map((f) => claveDeFactura(f.secuencial)).filter(Boolean));
  const idx = items.findIndex(
    (r) => esRenglonDelEnvio(r, envio) && numerosDeFacturas(r.facturas).some((k) => claves.has(k)),
  );
  if (idx < 0) return [...items];
  const r = items[idx];
  const facturas = (r.facturas ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "" && !claves.has(claveDeFactura(t)))
    .join(", ");
  const bultos = Math.max(0, (r.bultos ?? 0) - envio.total);
  if (facturas === "" && bultos === 0) {
    const sin = items.filter((_, i) => i !== idx);
    if (sin.length > 0) return sin;
    return [{ ...r, cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, con_etiquetas: undefined }];
  }
  return items.map((fila, i) => (i === idx ? { ...fila, facturas, bultos } : fila));
}

// ─── El PUT de la guía: re-atar las etiquetas a los renglones nuevos ─────────

export interface RenglonParaAtar {
  id: string;
  cliente_codigo: string | null;
  empresa: string | null;
  direccion: string | null;
  /** Las facturas del renglón (texto «A, B»). Con ellas se ata POR ENVÍO. */
  facturas?: string | null;
}

const trio = (r: Pick<RenglonParaAtar, "cliente_codigo" | "empresa" | "direccion">) =>
  `${par(r)}|${destinoClave(r.direccion)}`;
const par = (r: Pick<RenglonParaAtar, "cliente_codigo" | "empresa">) =>
  `${String(r.cliente_codigo ?? "").trim().toUpperCase()}|${normalizarEmpresaGuia(r.empresa)}`;

/**
 * 🔴 EL ARREGLO DEL PUT (1-oct-2026). Guardar una guía con `items` REEMPLAZA
 * sus renglones (inserta los nuevos y borra los viejos), y por el `ON DELETE
 * SET NULL` las etiquetas atadas a los viejos se desataban EN SILENCIO y
 * volvían a «Pendiente» aunque el envío siguiera en la guía.
 *
 * Esto dice a qué renglón NUEVO va cada etiqueta de un renglón viejo: el del
 * mismo cliente + empresa + destino; si el destino cambió, el ÚLTIMO del mismo
 * cliente + empresa (la misma regla con la que `importarEtiquetas` ata). Si el
 * renglón se quitó de la guía, la etiqueta no va a ninguno y vuelve a
 * «Pendiente» — que es lo correcto: el envío ya no viaja en esta guía.
 */
export function renglonNuevoDe<R extends RenglonParaAtar>(
  viejo: Pick<RenglonParaAtar, "cliente_codigo" | "empresa" | "direccion">,
  nuevos: readonly R[],
): R | null {
  const exacto = nuevos.find((n) => trio(n) === trio(viejo));
  if (exacto) return exacto;
  const delPar = nuevos.filter((n) => par(n) === par(viejo));
  return delPar[delPar.length - 1] ?? null;
}

/**
 * 🔴 ATAR POR ENVÍO, NO POR CLIENTE + EMPRESA (1-oct-2026). Con un renglón por
 * envío, dos envíos del mismo cliente + empresa + destino viven en DOS
 * renglones: buscar «el renglón del trío» los ataba a los dos al PRIMERO.
 *
 * El renglón de un envío es el que lleva SUS facturas (mismo cliente y empresa,
 * pareo por `claveDeFactura`, exacto): una factura tiene una sola etiqueta viva,
 * así que ese renglón es uno solo. Si nadie lleva sus facturas (alguien las
 * reescribió a mano), cae a la regla de antes (`renglonNuevoDe`) pero SOLO entre
 * los renglones que todavía no se llevó otro envío (`usados`).
 *
 * Lo usan `importarEtiquetas` (al crear la guía) y `reatarEtiquetas` (el PUT).
 */
export function renglonDelEnvio<R extends RenglonParaAtar>(
  envio: Pick<RenglonParaAtar, "cliente_codigo" | "empresa" | "direccion"> & { secuenciales: readonly string[] },
  nuevos: readonly R[],
  usados: ReadonlySet<string> = new Set(),
): R | null {
  const claves = new Set(envio.secuenciales.map((s) => claveDeFactura(s)).filter(Boolean));
  const conSusFacturas = nuevos.find(
    (n) => par(n) === par(envio) && numerosDeFacturas(n.facturas).some((k) => claves.has(k)),
  );
  if (conSusFacturas) return conSusFacturas;
  return renglonNuevoDe(envio, nuevos.filter((n) => !usados.has(n.id)));
}

/**
 * 🔴 EL ORDEN DE LOS BULTOS SE CAMBIA CON ↑ ↓ (1-oct-2026). Mueve el elemento
 * `i` un lugar arriba (`-1`) o abajo (`+1`); en el borde no hace nada. Nunca
 * muta: devuelve un arreglo nuevo. El orden del arreglo ES `orden_en_envio`.
 */
export function moverEnElEnvio<T>(lista: readonly T[], i: number, paso: -1 | 1): T[] {
  const j = i + paso;
  if (i < 0 || i >= lista.length || j < 0 || j >= lista.length) return [...lista];
  const copia = [...lista];
  [copia[i], copia[j]] = [copia[j], copia[i]];
  return copia;
}
