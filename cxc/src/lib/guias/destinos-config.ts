// ─────────────────────────────────────────────────────────────────────────────
// GUÍAS › CONFIGURACIÓN — los destinos definidos de cada cliente, la parte PURA.
// (sin React, sin fetch, sin base)
//
// 🩸 Por qué existe (4-sep-2026): los destinos definidos vivían en una
// constante de código y cada corrección de Daniel necesitaba un despliegue.
// Las dos que lo dispararon, textual: *«city shoes → Calle 19 Central, al lado
// de la joyería Super Oro. Y Nine Sport en Calle 19 Central.»* Ahora viven en
// la tabla `guias_destino_cliente` y se corrigen desde la pantalla.
//
// Quién la ve y la edita: **admin Y secretaria** — Daniel, textual:
// *«configuraciones también deja a secretaria»* (son Angela y Andrea quienes
// hacen las guías y notan un destino mal escrito). Bodega y vendedor, 403:
// bodega despacha, vendedor solo lee.
//
// Este módulo solo NORMALIZA y VALIDA lo que viaja por la API. Quién decide
// qué botones ve el formulario es `destinosDefinidosPara` (destinos-clientes.ts,
// el orden de precedencia: tabla → constante → histórico).
// ─────────────────────────────────────────────────────────────────────────────

import { claveDestino } from "@/lib/guias/destinos-clientes";

/** Roles que ven y editan Guías › Configuración. */
export const CONFIG_GUIAS_ROLES = ["admin", "secretaria"] as const;

/** El código como lo guarda la tabla: `d-35 ` → `D-35`. */
export const normalizarCodigoDestino = (s: string): string => s.trim().toUpperCase();

/** Tope del texto de un destino (el más largo real hoy tiene 48 caracteres). */
export const MAX_LARGO_DESTINO = 160;

/**
 * «5, 6, 14, Mas Flow» → ["5","6","14","Mas Flow"]. El campo de tiendas de la
 * pantalla se escribe separado por comas; vacíos y bordes se descartan.
 */
export function parsearTiendas(v: string | null | undefined): string[] {
  return String(v ?? "")
    .split(",")
    .map((t) => t.trim())
    .filter((t) => t !== "");
}

/** Una fila activa de `guias_destino_cliente`, como viaja a la pantalla. */
export interface DestinoConfigurado {
  id: number;
  cliente_codigo: string;
  /** Resuelto desde el directorio del grupo; null si el código ya no está. */
  cliente_nombre: string | null;
  destino: string;
  tiendas: string[];
  orden: number;
  /** 🔴 «El de siempre»: se llena solo al elegir el cliente. A lo sumo uno por cliente. */
  el_de_siempre: boolean;
  creado_por: string;
  creado_en: string;
}

/** Lo que la pantalla manda para definir un destino. */
export interface DestinoNuevo {
  cliente_codigo: string;
  destino: string;
  tiendas: string[];
}

export type ValidacionDestino =
  | { ok: true; valor: DestinoNuevo }
  | { ok: false; error: string };

function validarTiendas(v: unknown): string[] | null {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) return null;
  const tiendas = v.map((t) => (typeof t === "string" ? t.trim() : "")).filter((t) => t !== "");
  if (v.some((t) => typeof t !== "string")) return null;
  if (tiendas.length > 20 || tiendas.some((t) => t.length > 40)) return null;
  return tiendas;
}

function validarTextoDestino(v: unknown): string | null {
  const destino = typeof v === "string" ? v.trim() : "";
  if (!destino || destino.length > MAX_LARGO_DESTINO) return null;
  return destino;
}

/**
 * Valida y normaliza lo que llega por POST. Fail-closed: cualquier duda es un
 * error con texto para la pantalla, nunca una fila «más o menos».
 * ⚠️ Que el código exista en el directorio del GRUPO lo comprueba la ruta con
 * la puerta única (`validarCodigoParaAtar`): un D-XXX inventado o un código de
 * Boston no entran acá.
 */
export function validarDestinoNuevo(body: unknown): ValidacionDestino {
  const b = (body ?? {}) as Record<string, unknown>;
  const codigo = typeof b.cliente_codigo === "string" ? normalizarCodigoDestino(b.cliente_codigo) : "";
  if (!codigo) return { ok: false, error: "Elige el cliente" };
  if (codigo.length > 40) return { ok: false, error: "El código del cliente no es válido" };
  const destino = validarTextoDestino(b.destino);
  if (!destino) return { ok: false, error: "Escribe el destino tal como debe salir en la guía" };
  const tiendas = validarTiendas(b.tiendas);
  if (tiendas === null) return { ok: false, error: "Las tiendas no son válidas" };
  return { ok: true, valor: { cliente_codigo: codigo, destino, tiendas } };
}

export type ValidacionEdicion =
  | { ok: true; valor: { destino?: string; tiendas?: string[]; elDeSiempre?: boolean } }
  | { ok: false; error: string };

/**
 * Valida lo que llega por PATCH: editar el texto de un destino, sus tiendas
 * y/o la marca «el de siempre». Al menos uno tiene que venir.
 */
export function validarDestinoEdicion(body: unknown): ValidacionEdicion {
  const b = (body ?? {}) as Record<string, unknown>;
  const valor: { destino?: string; tiendas?: string[]; elDeSiempre?: boolean } = {};
  if (b.destino !== undefined) {
    const destino = validarTextoDestino(b.destino);
    if (!destino) return { ok: false, error: "Escribe el destino tal como debe salir en la guía" };
    valor.destino = destino;
  }
  if (b.tiendas !== undefined) {
    const tiendas = validarTiendas(b.tiendas);
    if (tiendas === null) return { ok: false, error: "Las tiendas no son válidas" };
    valor.tiendas = tiendas;
  }
  if (b.elDeSiempre !== undefined) {
    if (typeof b.elDeSiempre !== "boolean") {
      return { ok: false, error: "La marca «el de siempre» no es válida" };
    }
    valor.elDeSiempre = b.elDeSiempre;
  }
  if (valor.destino === undefined && valor.tiendas === undefined && valor.elDeSiempre === undefined) {
    return { ok: false, error: "No hay nada que cambiar" };
  }
  return { ok: true, valor };
}

/**
 * Qué le pasa al formulario de guías con esta definición — el texto que la
 * pantalla de configuración le dice a quien administra (4-sep-2026, la regla
 * de «el de siempre»):
 *   · con uno marcado «el de siempre» → ese se llena solo; los demás, botones;
 *   · sin ninguno marcado → solo botones, no se llena nada.
 */
export function comoSeUsa(n: number, conElDeSiempre: boolean): string {
  if (conElDeSiempre) {
    return n === 1
      ? "Se llena solo al elegir el cliente."
      : "El de siempre se llena solo al elegir el cliente; los demás salen como botones.";
  }
  return n === 1
    ? "Se ofrece como botón y la persona elige. Marca «el de siempre» para que se llene solo."
    : "Se ofrecen como botones y la persona elige.";
}

/** El texto de la confirmación al quitar: dice en palabras qué cambia. */
export function textoQuitarDestino(clienteNombre: string | null, codigo: string, destino: string): string {
  const quien = clienteNombre ? clienteNombre : codigo;
  return `${quien} dejará de ofrecer «${destino}» en las guías.`;
}

// ─── La lista agrupada por cliente ───────────────────────────────────────────

/** Un cliente en la pantalla: sus destinos definidos + su historial sin definir. */
export interface GrupoConfig {
  codigo: string;
  nombre: string | null;
  /** Los definidos en la tabla (activos, en orden). */
  filas: DestinoConfigurado[];
  /**
   * Destinos que el cliente YA usó en guías (agrupados por clave exacta) y que
   * no están definidos: se muestran como ayuda para PROMOVERLOS de un toque.
   * 🔴 Nunca se promueven solos — promover es un POST que solo dispara un botón.
   */
  historicosSinDefinir: string[];
}

/**
 * Arma los grupos: los clientes con filas definidas + los que solo tienen
 * historial. El pareo definido↔histórico es por `claveDestino` (regla exacta,
 * jamás por parecido): «Paso Canoas» definido tapa el «Pasocanoas» histórico,
 * pero «Wesland» (typo) sigue apareciendo como no definido.
 */
export function agruparConfiguracion(
  filas: readonly DestinoConfigurado[],
  historicosPorCliente: Readonly<Record<string, readonly string[]>>,
  nombrePorCodigo?: ReadonlyMap<string, string>,
): GrupoConfig[] {
  const por = new Map<string, GrupoConfig>();
  const grupoDe = (codigo: string): GrupoConfig => {
    let g = por.get(codigo);
    if (!g) {
      g = {
        codigo,
        nombre: nombrePorCodigo?.get(codigo) ?? null,
        filas: [],
        historicosSinDefinir: [],
      };
      por.set(codigo, g);
    }
    return g;
  };
  for (const f of filas) {
    const g = grupoDe(f.cliente_codigo);
    if (!g.nombre && f.cliente_nombre) g.nombre = f.cliente_nombre;
    g.filas.push(f);
  }
  for (const [codigo, historicos] of Object.entries(historicosPorCliente)) {
    const c = codigo.trim();
    if (!c) continue;
    const g = grupoDe(c);
    const definidas = new Set(g.filas.map((f) => claveDestino(f.destino)));
    for (const h of historicos) {
      if (!definidas.has(claveDestino(h))) g.historicosSinDefinir.push(h);
    }
  }
  return [...por.values()].sort((a, b) =>
    (a.nombre ?? a.codigo).localeCompare(b.nombre ?? b.codigo, "es"),
  );
}

const sinAcentos = (s: string): string =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

/** El buscador de la pantalla: por nombre o por código, sin acentos. */
export function filtrarGrupos(grupos: readonly GrupoConfig[], busqueda: string): GrupoConfig[] {
  const q = sinAcentos(busqueda.trim());
  if (!q) return [...grupos];
  return grupos.filter(
    (g) => sinAcentos(g.nombre ?? "").includes(q) || sinAcentos(g.codigo).includes(q),
  );
}
