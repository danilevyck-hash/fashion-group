// ─────────────────────────────────────────────────────────────────────────────
// EL REGISTRO DE VISITAS — módulo PURO (sin React, sin red, sin base).
//
// Daniel, textual: «quién entra a cada módulo lo debes saber tú».
//
// QUÉ RESUELVE. Hoy se sabe quién ENTRA AL SISTEMA (`user_sessions`) y qué
// ACCIONES puntuales hizo (`activity_logs`), pero nada dice qué PANTALLA abrió.
// Acá viven las tres reglas de ese registro: qué módulo es cada dirección, cada
// cuánto se anota, y cuánto tiempo se guarda.
//
// 🔴 SILENCIOSO Y BARATO, COMO `last_seen`. La app ya aprendió esta lección:
// escribir en CADA petición fue el renglón más caro del sistema, y el arreglo
// no fue dejar de escribir sino escribir MENOS VECES (una cada 5 min por
// sesión). Acá es lo mismo: como mucho UNA anotación por módulo cada 10 minutos
// por pestaña, sin `await` y con `.catch()`. Nunca frena una pantalla, nunca
// rompe una navegación y nunca le muestra un error a nadie.
//
// 🔴 EL INTERRUPTOR. `REGISTRO_DE_VISITAS = false` = no se manda absolutamente
// nada desde el navegador. La pantalla de Daniel sigue existiendo y sigue
// mostrando lo que ya se había anotado.
//
// ⚠️ ESTO NO ES UN RASTRO DE NAVEGACIÓN. Se guarda un CONTEO por día, persona,
// módulo y aparato. No la dirección exacta, no el filtro, no lo que se miró.
// ─────────────────────────────────────────────────────────────────────────────

import { ALL_MODULES, ALL_MODULE_KEYS } from "@/lib/modules";
import type { Aparato } from "@/lib/aparato";

/** 🔴 El interruptor. `false` = el navegador no manda una sola anotación. */
export const REGISTRO_DE_VISITAS = true;

/** Cada cuánto, como MUCHO, se anota el mismo módulo desde la misma pestaña.
 *
 *  Diez minutos: quien entra y sale de la misma pantalla veinte veces en una
 *  mañana cuenta como las dos o tres VECES que de verdad fue a hacer algo, no
 *  como veinte. Y quien la abre una vez al día cuenta una vez al día, que es
 *  exactamente lo que hay que poder medir. */
export const MINUTOS_ENTRE_VISITAS = 10;
export const MS_ENTRE_VISITAS = MINUTOS_ENTRE_VISITAS * 60_000;

/** Cuánto se guarda. Lo que pasa de acá lo borra el cron `cleanup-sessions`. */
export const DIAS_QUE_SE_GUARDAN = 180;

/** Cuánto se MIRA en la pantalla de Usuarios › «Quién usa qué». */
export const DIAS_QUE_SE_MIRAN = 30;

/** La tabla y la función de la base. En UN solo lugar: el route, el cron y los
 *  candados leen estos nombres en vez de teclearlos cada uno. */
export const TABLA_VISITAS = "visitas_modulo";
export const RPC_REGISTRAR_VISITA = "registrar_visita_modulo";

/** Dónde recuerda cada pestaña lo que ya anotó (`sessionStorage`). */
export const PREFIJO_MEMORIA = "fg_visita_";

// ─────────────────────────────────────────────────────────────────────────────
// 1 · Qué módulo es esta dirección
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Direcciones que NO empiezan por el `href` de su módulo, y por eso hay que
 * nombrarlas. El resto se DERIVA de `ALL_MODULES`: un módulo nuevo entra solo,
 * sin tocar este archivo.
 *
 * ⚠️ Esto NO es `getModuleKeyFromPath` de `moduleColors.ts`, y no se fusiona
 * con él: aquél pinta el acento de 2 px del encabezado y a propósito deja
 * cuatro módulos afuera (Vista General, Referencia, Catálogos y Usuarios salen
 * en gris). Acá los cuatro TIENEN que contar, o la medición mentiría justo
 * donde hace falta.
 */
const ALIAS: ReadonlyArray<readonly [string, string]> = [
  // El hub vive en `/catalogos/marcas`, pero el módulo entero cuelga de las dos
  // grafías: `/catalogos/admin/reebok`, `/catalogo/tommy`…
  ["/catalogos", "catalogos"],
  ["/catalogo", "catalogos"],
  // ⚠️ La dirección vieja del CXC NO se nombra acá: redirige (307) antes de que
  // ninguna pantalla se pinte, así que el navegador nunca la ve — y nombrarla
  // rompería el barrido que exige que ningún enlace interno la mencione.
];

/** Los prefijos, del más largo al más corto: el más específico manda. */
const PREFIJOS: ReadonlyArray<readonly [string, string]> = [
  ...ALL_MODULES.map((m) => [m.href, m.key] as const),
  ...ALIAS,
].sort((a, b) => b[0].length - a[0].length);

/** ¿Esta `key` es un módulo de verdad? */
export function esModuloConocido(key: string | null | undefined): boolean {
  return !!key && ALL_MODULE_KEYS.includes(key);
}

/**
 * La `key` del módulo al que pertenece una dirección, o `null`.
 *
 * `null` para el Inicio, las páginas de grupo, el login y las páginas públicas
 * (los pedidos de Tommy y Calvin, que no son módulos): ahí no hay nada que
 * contar.
 */
export function moduloDeLaRuta(pathname: string | null | undefined): string | null {
  if (!pathname) return null;
  // Sin query ni ancla, y sin la barra final: `/guias/` es `/guias`.
  const limpio = pathname.split("?")[0].split("#")[0].replace(/\/+$/, "") || "/";
  for (const [prefijo, key] of PREFIJOS) {
    if (limpio === prefijo || limpio.startsWith(`${prefijo}/`)) {
      return esModuloConocido(key) ? key : null;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// 2 · Cada cuánto se anota
// ─────────────────────────────────────────────────────────────────────────────

/** La llave de memoria de esta pestaña para un módulo y un aparato. */
export function claveDeMemoria(modulo: string, aparato: Aparato): string {
  return `${PREFIJO_MEMORIA}${modulo}_${aparato}`;
}

/**
 * ¿Toca anotar? `ultimaVisita` es lo que esta pestaña recuerda (ms), o `null`
 * si nunca anotó ese módulo.
 *
 * 🔑 Ante la duda, SÍ se anota: una marca ilegible (alguien limpió el
 * navegador, o `sessionStorage` devolvió basura) cuenta como «nunca». Perder
 * una visita es perder la medición; repetir una es una fila que sube de a uno.
 */
export function debeRegistrar(ultimaVisita: number | null, ahora: number): boolean {
  if (ultimaVisita === null || !Number.isFinite(ultimaVisita)) return true;
  // Un reloj que va para atrás (cambio de hora, pestaña dormida) no puede dejar
  // la anotación bloqueada para siempre.
  if (ultimaVisita > ahora) return true;
  return ahora - ultimaVisita >= MS_ENTRE_VISITAS;
}

/** El aparato, normalizado. Ante la duda, COMPUTADORA — la misma regla de
 *  `src/lib/aparato.ts`: nunca se inventa un celular. */
export function aparatoValido(valor: unknown): Aparato {
  return valor === "celular" ? "celular" : "computadora";
}

/** La fecha de corte (YYYY-MM-DD) de lo que se MIRA o de lo que se BORRA,
 *  contada hacia atrás desde un día de Panamá. */
export function diaHaceNDias(hoyYmd: string, dias: number): string {
  const t = Date.parse(`${hoyYmd}T00:00:00Z`);
  return new Date(t - dias * 86_400_000).toISOString().slice(0, 10);
}
