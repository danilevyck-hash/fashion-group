/**
 * CATÁLOGO DE CUENTAS CONTABLES de Switch (Contabilidad → Catálogo de cuentas).
 *
 * Módulo PURO: normaliza lo que devuelve el panel y resuelve "código → nombre".
 * No toca la base ni la red, así que se prueba entero.
 *
 * ── 🩸 POR QUÉ EXISTE ───────────────────────────────────────────────────────
 *
 * El reporte de EGRESOS VARIOS trae **el código de la cuenta y no su nombre**.
 * En pantalla eso son renglones como `6.02.01 · $63.938,43` — un número al lado
 * de otro número. Medido el 13-ago-2026 sobre los 378 renglones reales de
 * Vistana (42 cuentas distintas), cruzando contra los nombres que ya estaban
 * guardados en `mayor_lineas.cuenta_nombre`: **22 cuentas tenían nombre y 20 no,
 * y esas 20 valen $55.463,70**.
 *
 * 🔴 Y el nombre NO se puede deducir del código. `6.02.01.00.00` parece
 * "salarios" por vecindad con `6.01` y en realidad es **SERVICIOS
 * PROFESIONALES** ($63.938,43, el gasto más grande de Vistana); `2.01.05.01.00`
 * es SALARIOS POR PAGAR. Inventar un nombre encima de una cifra de plata es peor
 * que dejar el código pelado: el código pelado no dice nada, el nombre inventado
 * dice algo falso. Por eso este módulo **nunca fabrica un nombre**: si no lo
 * tiene, devuelve `null` y la pantalla muestra el código solo.
 *
 * ── DE DÓNDE SALE ───────────────────────────────────────────────────────────
 *
 * Del MISMO camino que ya usan el mayor y Egresos Varios: la app web de Switch
 * (`web-client.ts`). El endpoint es `GET /cuentacontable/cuentas`, descubierto
 * en el asset PÚBLICO `/assets/js/cuentacontable/cuentacontable.js` — que se lee
 * sin sesión, así que descubrirlo no costó ni una expulsión del panel (la misma
 * puerta por la que se descubrieron el mayor y los egresos).
 *
 * Devuelve `{response: true, contacuentacontable: [...]}` con un nodo por cuenta
 * de TODOS los niveles (grupo, cuenta, subcuenta, auxiliar). Cada nodo trae el
 * código COMPLETO de 5 segmentos en `cuenta` y el nombre en `nombreCuenta`; el
 * propio JS de la página lo recorta para mostrar según `nivel`
 * (2→4 caracteres, 3→7, 4→10, 5→13), que es de donde sale `codigoVisible`.
 */

/** Un nodo del catálogo, ya normalizado. */
export interface CuentaContable {
  /** Código COMPLETO de 5 segmentos: `"6.02.01.00.00"`. Es la llave. */
  cuenta: string;
  /** Nombre listo para pintar: espacios colapsados y sin bordes. Nunca vacío. */
  nombre: string;
  /** El nombre TAL COMO vino de Switch, con sus espacios de más. */
  nombreCrudo: string;
  /** 1..5. `null` si Switch no lo dijo. */
  nivel: number | null;
}

/**
 * `"  SERVICIOS    PROFESIONALES  "` → `"SERVICIOS PROFESIONALES"`.
 *
 * ⚠️ Los nombres de Switch vienen con espacios de más, y no es una rareza
 * aislada: en el catálogo real de Vistana pasa en decenas de cuentas (hasta el
 * encabezado dice `" NOMBRE  CUENTA "`). Sin colapsarlos, la pantalla enseña
 * `"CUENTAS  POR  PAGAR  MULTI  FASHION  HOLDING"` — que se lee como un defecto
 * de la app, no como el dato que es.
 *
 * 🔴 Sólo toca ESPACIOS. Ni mayúsculas, ni acentos, ni abreviaturas: el nombre
 * es el que escribió la contadora y con ése se cuadra contra el panel.
 */
export function normalizarNombreCuenta(s: unknown): string {
  return String(s ?? "").replace(/\s+/g, " ").trim();
}

/** El código de 5 segmentos, completo. */
const CUENTA_RE = /^\d+(\.\d+){4}$/;

/** Los 3 segmentos que este módulo siempre muestra como mínimo. */
const SEGMENTOS_MINIMOS = 3;

/**
 * El código como lo enseña Switch: sin los `.00` de relleno del final, pero
 * **nunca por debajo de 3 segmentos**.
 *
 *   `"6.02.01.00.00"` → `"6.02.01"`      (lo mismo que se mostraba antes)
 *   `"2.01.04.02.00"` → `"2.01.04.02"`   (más preciso: el 4º segmento SÍ dice algo)
 *   `"6.03.00.00.00"` → `"6.03.00"`      (piso de 3, no se recorta más)
 *
 * 🩸 Por qué importa y no es cosmético: el nombre que se pinta al lado es el de
 * la cuenta COMPLETA. Recortando siempre a 3 segmentos, `2.01.04.02` y
 * `2.01.04.03` se ven las dos como `2.01.04` con nombres distintos — dos
 * renglones con el mismo código diciendo cosas diferentes, que es justo lo que
 * hace desconfiar de una pantalla de plata.
 */
export function codigoVisible(cuenta: string): string {
  const seg = cuenta.split(".");
  let fin = seg.length;
  while (fin > SEGMENTOS_MINIMOS && seg[fin - 1] === "00") fin--;
  return seg.slice(0, fin).join(".");
}

/**
 * Lo que Switch manda por cuenta. Se declara laxo a propósito: la respuesta es
 * de un tercero y lo que no cumpla se descarta con nombre y motivo, no revienta.
 */
interface NodoCrudo {
  cuenta?: unknown;
  nombreCuenta?: unknown;
  nivel?: unknown;
}

export interface CatalogoNormalizado {
  cuentas: CuentaContable[];
  /** Nodos que vinieron y no se pudieron usar, con el porqué. Se REPORTAN. */
  descartados: Array<{ cuenta: string; motivo: string }>;
}

const texto = (v: unknown): string => (typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim());

/**
 * Normaliza la respuesta del panel.
 *
 * ⚠️ Un nodo SIN nombre se DESCARTA, no se guarda vacío: guardar `""` haría que
 * la pantalla mostrara `"6.02.01 — "` (un guion suelto que parece un error de la
 * app) en vez del código limpio, y taparía para siempre el nombre que sí pueda
 * traer el mayor por el otro camino.
 *
 * ⚠️ Se DEDUPLICA por código (gana el primero). El catálogo de Switch es un
 * árbol y en teoría no repite, pero un upsert que reciba dos veces la misma
 * llave en la MISMA sentencia falla entero — es exactamente lo que dejó a
 * `switch_articulo_marca` con el 22% del catálogo durante meses.
 */
export function normalizarCatalogo(nodos: readonly unknown[]): CatalogoNormalizado {
  const cuentas: CuentaContable[] = [];
  const descartados: Array<{ cuenta: string; motivo: string }> = [];
  const vistas = new Set<string>();

  for (const crudo of nodos) {
    const n = (crudo ?? {}) as NodoCrudo;
    const cuenta = texto(n.cuenta);
    const nombreCrudo = typeof n.nombreCuenta === "string" ? n.nombreCuenta : String(n.nombreCuenta ?? "");
    const nombre = normalizarNombreCuenta(nombreCrudo);

    if (!CUENTA_RE.test(cuenta)) {
      descartados.push({ cuenta: cuenta || "(vacío)", motivo: "el código no tiene 5 segmentos" });
      continue;
    }
    if (!nombre) {
      descartados.push({ cuenta, motivo: "vino sin nombre" });
      continue;
    }
    if (vistas.has(cuenta)) {
      descartados.push({ cuenta, motivo: "código repetido" });
      continue;
    }
    vistas.add(cuenta);

    const nivelNum = Number(n.nivel);
    cuentas.push({
      cuenta,
      nombre,
      nombreCrudo,
      nivel: Number.isInteger(nivelNum) && nivelNum >= 1 && nivelNum <= 5 ? nivelNum : null,
    });
  }

  return { cuentas, descartados };
}

/**
 * ¿La respuesta se puede creer?
 *
 * 🔴 FALLAR RUIDOSO, NUNCA ESCRIBIR A MEDIAS. Si Switch devuelve la página de
 * excepción, o una lista recortada, o cambia los nombres de los campos, lo que
 * llega es un catálogo chiquito o vacío — y guardarlo sería BORRAR los nombres
 * buenos que ya estaban (el upsert pisa lo que toca) o dejar el catálogo a
 * medias sin un solo error. El mínimo es holgado: el catálogo más chico
 * concebible de una empresa que factura tiene decenas de cuentas, y las 42 que
 * usa Vistana solo en egresos ya lo superan.
 */
export const MINIMO_CUENTAS = 30;

export function catalogoUtilizable(c: CatalogoNormalizado): boolean {
  return c.cuentas.length >= MINIMO_CUENTAS;
}

// ── Resolver "código → nombre" ───────────────────────────────────────────────

/**
 * Diccionario de nombres de UNA empresa.
 *
 * Se arma con DOS fuentes y en este orden:
 *   1. `cuentas_contables` — el catálogo de Switch. Es la fuente de verdad.
 *   2. `mayor_lineas.cuenta_nombre` — el nombre que el CSV del mayor trae
 *      pegado a cada línea, de lo poco que la contadora cerró.
 *
 * 🔑 Las dos hacen falta, y no es redundancia: mientras el catálogo no se haya
 * bajado, el mayor es lo único que hay (las 22 cuentas con nombre del 13-ago
 * salieron de ahí), y la pantalla ya muestra algo. Cuando el catálogo llegue,
 * gana él — es el catálogo, no un nombre copiado en una línea de asiento.
 */
export type NombresDeCuentas = ReadonlyMap<string, string>;

export function armarNombres(
  catalogo: ReadonlyArray<{ cuenta: string; nombre: string }>,
  delMayor: ReadonlyArray<{ cuenta: string; nombre: string | null }>,
): Map<string, string> {
  const out = new Map<string, string>();
  // Primero el mayor, para que el catálogo lo PISE (no al revés).
  for (const l of delMayor) {
    const nombre = (l.nombre ?? "").trim();
    if (nombre) out.set(l.cuenta, nombre);
  }
  for (const c of catalogo) {
    const nombre = c.nombre.trim();
    if (nombre) out.set(c.cuenta, nombre);
  }
  return out;
}

/**
 * El nombre de una cuenta, o `null`.
 *
 * Match EXACTO por el código completo, y después el mismo código con los
 * segmentos finales en `00` — un egreso puede venir cargado en un auxiliar que
 * el catálogo no tenga como nodo propio, y ahí el nombre de su subcuenta es la
 * verdad más cercana que existe. **No hay nada más:** ni parecido, ni prefijo
 * suelto, ni deducción por vecindad. Un nombre que no está no se inventa.
 */
export function nombreDeCuenta(cuenta: string, nombres: NombresDeCuentas): string | null {
  const exacto = nombres.get(cuenta);
  if (exacto) return exacto;

  const seg = cuenta.split(".");
  for (let fin = seg.length - 1; fin >= SEGMENTOS_MINIMOS; fin--) {
    const padre = [...seg.slice(0, fin), ...Array(seg.length - fin).fill("00")].join(".");
    const n = nombres.get(padre);
    if (n) return n;
  }
  return null;
}

/**
 * Todos los códigos que `nombreDeCuenta` podría llegar a mirar para este juego
 * de cuentas: cada una y sus "padres" con los segmentos finales en `00`.
 *
 * 🔑 Es lo que permite pedirle a la base **sólo los nombres que el mes usa** en
 * vez de bajarse el catálogo entero. Vistana usa 42 cuentas → ~100 códigos, una
 * sola consulta chica. Con Supabase en compute Micro, traer catálogos completos
 * de 8 empresas para pintar una pantalla es exactamente lo que no hay que hacer.
 */
export function codigosCandidatos(cuentas: readonly string[]): string[] {
  const out = new Set<string>();
  for (const c of cuentas) {
    if (!CUENTA_RE.test(c)) continue;
    out.add(c);
    const seg = c.split(".");
    for (let fin = seg.length - 1; fin >= SEGMENTOS_MINIMOS; fin--) {
      out.add([...seg.slice(0, fin), ...Array(seg.length - fin).fill("00")].join("."));
    }
  }
  return [...out];
}

/** `"6.02.01.00.00"` + nombre → `"6.02.01 — SERVICIOS PROFESIONALES"`. Sin
 *  nombre, el código solo: nunca un guion colgando. */
export function etiquetaCuenta(cuenta: string, nombre: string | null): string {
  const cod = codigoVisible(cuenta);
  return nombre ? `${cod} — ${nombre}` : cod;
}
