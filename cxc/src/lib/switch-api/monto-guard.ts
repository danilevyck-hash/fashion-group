// ═══════════════════════════════════════════════════════════════════════════
//   GUARD DE MONTOS IMPOSIBLES — el ÚNICO lugar donde se decide si una cifra
//   que llegó de Switch es imposible. Módulo PURO (sin imports) para poder
//   testearlo sin arrastrar supabase-server.
// ═══════════════════════════════════════════════════════════════════════════
//
// 🩸 POR QUÉ EXISTE. El 27-jul-2026 la certificación encontró en
// `switch_costo_diario` la fila `confecciones_boston · 2026-07-14 ·
// costo_total = $1.000.000.049,22` contra una venta de $493,00. **No fue un
// tecleo de nadie: vino de la fuente.** Se pidió `/apireporte/totalventas`
// en vivo y Switch devuelve ese número; el propio reporte de Switch sale
// corrupto por ella (Utilidad −$999.861.591,01, margen −228.547,91%). El mismo
// día, `/apiingresomercancia/lista` de `active_shoes` devolvió un documento con
// `subTotal 4.460.999.999.999,55`. Switch produce cifras imposibles y hay que
// frenarlas ANTES de escribirlas.
//
// El guard de costo (PR #340) cubrió UNA tabla. Este generaliza el mismo
// criterio a todas las tablas de plata, con UN solo helper — no seis copias.
// Candado anti-copia: `src/__tests__/lib/monto-guard-candado.test.ts` pone el
// build en ROJO si alguien vuelve a escribir la validación a mano en otro
// archivo, o si un sync protegido deja de importar este módulo.
//
// ── LA REGLA, EN UNA LÍNEA ───────────────────────────────────────────────────
//   umbral = max(piso de la familia, 20 × el récord histórico de esa empresa)
//
// ── POR QUÉ RELATIVO Y NO UN NÚMERO FIJO ─────────────────────────────────────
// Un "si es mayor a X" envejece mal: el grupo crece y algún día un día bueno lo
// cruza. El umbral se calcula contra el PROPIO histórico, así que sube solo
// cuando el negocio sube. El piso manda mientras la empresa es chica.
//
// ── ⚠️ EL RIESGO REAL ES EL FALSO POSITIVO ───────────────────────────────────
// Un mes fuerte legítimo NO puede quedar bloqueado: con esto se calculan el
// margen y las comisiones, así que descartar un dato BUENO es peor que guardar
// la fila mala. **Un valor GRANDE no es un valor IMPOSIBLE.** Por eso cada piso
// se justifica contra el récord REAL medido en la tabla, con 7× de aire como
// mínimo, y el test `monto-guard.test.ts` corre los picos históricos reales de
// cada tabla y exige que TODOS pasen.
//
// 🩸 La lección la dio `switch_proveedor_estadocuenta`: tiene TRES filas por
// encima de $1.000.000 —$2.074.195,21 (fashion_wear), $1.233.330,25
// (fashion_shoes), $1.035.616,02 (vistana), todas contra proveedores
// intercompañía— y son **legítimas**. Un piso de $1M copiado del guard de costo
// habría rechazado datos buenos el primer día. Por eso el piso NO es un número
// único global: es POR FAMILIA, medido contra la distribución de SU tabla.
//
// ── SIMETRÍA: SE MIRA LA FILA ENTERA, NO UNA COLUMNA ─────────────────────────
// 🩸 Los dos guards que ya existían eran ASIMÉTRICOS: validaban el COSTO y
// dejaban pasar la VENTA de la misma fila sin mirar. Con la venta corrupta y el
// costo sano, el margen queda igual de reventado y el guard no se entera. Ahora
// cada familia declara TODAS las columnas de plata de su fila y el umbral se
// aplica a todas. `monto-guard.test.ts` verifica columna por columna.
//
// ── ANTI-ENVENENAMIENTO ──────────────────────────────────────────────────────
// El histórico sale de la misma tabla que se está protegiendo. Si una fila
// absurda ya guardada contara como historia, ella sola levantaría el umbral por
// encima de sí misma y desarmaría el guard para siempre. Por eso las filas ≥
// `techoHistoria()` (10 × el piso) NO cuentan como historia.
//
// ── UNA FILA MALA NO TUMBA EL SYNC ───────────────────────────────────────────
// `particionarFilas()` devuelve las buenas y las rechazadas por separado: las
// buenas se escriben igual. El descarte queda en `switch_sync_log.skip_details`
// y avisa por 🔧 SISTEMA — nunca en silencio, nunca en loop.

/** Cada tabla de plata protegida. El nombre es de NEGOCIO, no de tabla. */
export type FamiliaMonto =
  | "costo_diario"
  | "articulo_diario"
  | "factura"
  | "cxc"
  | "utilidad"
  | "recibo"
  | "proveedor"
  | "producto"
  | "articulo_info";

export interface DefinicionGuard {
  /** Tabla donde vive la historia con la que se calibra. */
  tabla: string;
  /** Columna que se mide para calcular el récord. Es la de MAYOR magnitud de la
   *  familia, así que el umbral que sale de ella nunca es más estricto para las
   *  demás columnas de la fila. */
  anclaje: string;
  /** TODAS las columnas de plata de la fila. La simetría vive acá: el umbral se
   *  aplica a cada una, no solo al anclaje. */
  columnas: readonly string[];
  /** Piso absoluto del umbral, medido contra el récord real de ESTA tabla. */
  piso: number;
  /** Récord REAL medido (30-jul-2026). Documenta el piso y lo fija en el test. */
  record: number;
  /** La historia se filtra por `empresa_key`. `products` no tiene empresa. */
  porEmpresa: boolean;
  /** Cómo se nombra en el mensaje a Daniel. Sin nombres de tabla. */
  que: string;
}

/**
 * Multiplicador sobre el récord histórico. Es lo que hace que el umbral
 * envejezca bien: si la empresa duplica su récord, el umbral la sigue sin que
 * nadie toque una constante. Mismo 20× que aprobó el guard de costo (PR #340).
 */
export const MONTO_FACTOR = 20;

/** Cada cuánto se REPITE el aviso si el dato malo sigue llegando de Switch. */
export const MONTO_DIAS_ENTRE_AVISOS = 7;

/** Ventana de historia que se mira para calibrar. */
export const MONTO_DIAS_HISTORIA = 365;

/**
 * EL REGISTRO. Cada piso está justificado en una línea contra el récord real
 * medido el 30-jul-2026 con `scripts/_diag-calibrar-guard-montos.mjs`.
 */
export const GUARDS: Readonly<Record<FamiliaMonto, DefinicionGuard>> = {
  // Récord del grupo: $141.707,12 de costo en un día (active_wear, 13-may-2026,
  // contra $181.650,00 de venta). El costo de las 8 empresas juntas en junio
  // (mes cerrado, certificado) fue $489.788,26 → el piso de $1M en UN día de UNA
  // empresa es 7× el récord y el DOBLE del mes del grupo entero.
  costo_diario: {
    tabla: "switch_costo_diario",
    anclaje: "costo_total",
    columnas: ["venta_total", "costo_total", "utilidad_total"],
    piso: 1_000_000,
    record: 141_707.12,
    porEmpresa: true,
    que: "el costo y la venta de un día",
  },
  // Récord: $88.592,00 de venta / $66.790,70 de costo en un artículo×día.
  // Mismo piso de $1M = 11× el récord.
  articulo_diario: {
    tabla: "switch_articulo_diario",
    anclaje: "venta_total",
    columnas: ["venta_total", "costo_total"],
    piso: 1_000_000,
    record: 88_592.0,
    porEmpresa: true,
    que: "la venta y el costo de un artículo en un día",
  },
  // Récord: $97.866,48 (active_shoes, 11-000000142, 29-nov-2023). El piso de $1M
  // es 10× la factura más grande jamás emitida por el grupo.
  factura: {
    tabla: "switch_facturas",
    anclaje: "total",
    columnas: ["subtotal", "subtotal_descuento", "impuesto", "total", "saldo", "descuento"],
    piso: 1_000_000,
    record: 97_866.48,
    porEmpresa: true,
    que: "el monto de una factura",
  },
  // Récord: $151.630,66 de total y $78.914,64 de saldo en un documento abierto.
  // Con $1M el aire sería 6,6× — por debajo del mínimo de 7× que este registro
  // se autoimpone (y que el test verifica familia por familia), así que el piso
  // es $2M: 13,2× el documento de cartera más grande de la historia.
  cxc: {
    tabla: "switch_estadocuenta",
    anclaje: "total",
    columnas: ["total", "saldo", "debito", "credito", "saldo_original", "total_original"],
    piso: 2_000_000,
    record: 151_630.66,
    porEmpresa: true,
    que: "el saldo de un documento en la cartera",
  },
  // Récord: $73.752,00 de subtotal, $57.547,38 de costo, $23.710,80 de utilidad
  // en un documento. Piso $1M = 13,6× el récord.
  utilidad: {
    tabla: "switch_factura_utilidad",
    anclaje: "subtotal_con_descuento",
    columnas: ["subtotal_con_descuento", "costo", "utilidad"],
    piso: 1_000_000,
    record: 73_752.0,
    porEmpresa: true,
    que: "el costo y la utilidad de una factura",
  },
  // Récord: $266.923,96 (fashion_wear, City Mall Paso Canoa, 28-feb-2023). Es la
  // familia con el récord más alto del lado de las ventas, así que su piso NO
  // puede ser el mismo $1M (serían solo 3,7× de aire): $2M deja 7,5×, el mismo
  // margen que el guard de costo ya aprobado.
  recibo: {
    tabla: "switch_recibos",
    anclaje: "total",
    columnas: ["total"],
    piso: 2_000_000,
    record: 266_923.96,
    porEmpresa: true,
    que: "el monto de un cobro",
  },
  // ⚠️ LA FAMILIA QUE MÁS ARRIESGA UN FALSO POSITIVO. Récord REAL Y LEGÍTIMO:
  // $2.074.195,21 (fashion_wear · American Fashion Wear, SA), y hay otras dos
  // filas sobre el millón, todas de proveedores intercompañía. No es un
  // documento: es el saldo ACUMULADO de una cuenta corriente de importación.
  // El piso de $20M deja 9,6× sobre el récord real y sigue atrapando de sobra la
  // clase de $1.000.000.049,22.
  proveedor: {
    tabla: "switch_proveedor_estadocuenta",
    anclaje: "saldo_total",
    columnas: ["saldo_total", "comprado_ytd", "pagado_ytd", "ultimo_pago_monto"],
    piso: 20_000_000,
    record: 2_074_195.21,
    porEmpresa: true,
    que: "el saldo de un proveedor",
  },
  // Récord: $64,00 (tommy_products). El catálogo es calzado y ropa: $58 en
  // Reebok, $20 en Joybees, $64 en Tommy. El piso de $10.000 es 156× el récord
  // —ninguna prenda concebible lo alcanza— y frena tanto el $1.000.000.049,22
  // como un punto decimal corrido ($58 → $58.000). Este precio se PUBLICA al
  // cliente final: es la única familia que un tercero ve.
  producto: {
    tabla: "products",
    anclaje: "price",
    columnas: ["price"],
    piso: 10_000,
    record: 64.0,
    porEmpresa: false,
    que: "el precio de un producto del catálogo",
  },
  // Récord REAL medido (9-ago-2026, switch_articulo_diario de las 6 FG): la
  // venta unitaria más cara de la historia es $850,00 (CLICHE600, vistana).
  // Mismo piso de $10.000 que el catálogo (11,8× el récord): ninguna prenda ni
  // calzado concebible lo alcanza, y frena tanto la clase $1.000.000.049,22
  // como el punto decimal corrido. `costo_api` entra en la simetría aunque hoy
  // NO se muestre — cuando se encienda, ya llega filtrado.
  articulo_info: {
    tabla: "switch_articulo_info",
    anclaje: "precio_etiqueta",
    columnas: ["precio_etiqueta", "costo_api"],
    piso: 10_000,
    record: 850.0,
    porEmpresa: true,
    que: "el precio de etiqueta de un artículo",
  },
};

/**
 * Una fila por encima de esto no cuenta como historia (anti-envenenamiento).
 * 10 × el piso, la misma proporción que el guard de costo ya aprobado
 * ($1M de piso → $10M de techo).
 */
export function techoHistoria(familia: FamiliaMonto): number {
  return GUARDS[familia].piso * 10;
}

/**
 * Umbral para una familia, a partir de su propio histórico.
 * Sin historia (empresa nueva) devuelve el piso. Fail-open por construcción: un
 * histórico vacío nunca hace el guard MÁS agresivo.
 */
export function umbralMonto(familia: FamiliaMonto, historico: readonly number[]): number {
  const techo = techoHistoria(familia);
  let max = 0;
  for (const v of historico) {
    if (!Number.isFinite(v)) continue;
    const magnitud = Math.abs(v);
    if (magnitud >= techo) continue; // fila envenenada: no cuenta como historia
    if (magnitud > max) max = magnitud;
  }
  return Math.max(GUARDS[familia].piso, MONTO_FACTOR * max);
}

/**
 * ¿Este monto es IMPOSIBLE? Se mira la MAGNITUD: una nota de crédito o un
 * documento dominado por devoluciones da negativo legítimo, pero
 * −$1.000.000.000 es tan imposible como +$1.000.000.000.
 *
 * `null`/`undefined` NO son imposibles: son "sin dato", que ya manejan los
 * parsers de cada sync. Un no-numérico (NaN, Infinity) sí.
 */
export function esMontoImposible(valor: unknown, umbral: number): boolean {
  if (valor == null) return false;
  const n = typeof valor === "number" ? valor : Number(valor);
  if (!Number.isFinite(n)) return true;
  return Math.abs(n) > umbral;
}

/** Qué columna reventó y con qué valor. */
export interface ColumnaImposible {
  columna: string;
  valor: number;
}

/**
 * Revisa la fila ENTERA — todas las columnas de plata de la familia, no solo el
 * anclaje. Acá vive el arreglo de la asimetría: con la venta corrupta y el costo
 * sano, el margen queda igual de reventado.
 */
export function columnasImposibles(
  familia: FamiliaMonto,
  fila: Readonly<Record<string, unknown>>,
  umbral: number,
): ColumnaImposible[] {
  const malas: ColumnaImposible[] = [];
  for (const columna of GUARDS[familia].columnas) {
    if (!(columna in fila)) continue; // la fila no trae esa columna: nada que validar
    const crudo = fila[columna];
    if (!esMontoImposible(crudo, umbral)) continue;
    malas.push({ columna, valor: Number(crudo) });
  }
  return malas;
}

export interface FilaRechazada<T> {
  /** Llave estable de la fila. Es también la llave del anti-loop. */
  clave: string;
  fila: T;
  columnas: ColumnaImposible[];
}

export interface Particion<T> {
  buenas: T[];
  rechazadas: FilaRechazada<T>[];
}

/**
 * Separa las filas buenas de las imposibles. **Una fila mala no puede tumbar el
 * sync**: las buenas salen enteras por `buenas` y se escriben igual.
 *
 * Se RECHAZA la fila, no se pone en cero: los syncs son UPSERT, así que no
 * escribir CONSERVA el último valor bueno; escribir un 0 lo destruiría.
 * (`switch_recibos` es la excepción —hace delete+insert por mes— y ahí no hay
 * valor anterior que conservar: simplemente no entra.)
 */
export function particionarFilas<T>(
  familia: FamiliaMonto,
  filas: readonly T[],
  umbral: number,
  clave: (fila: T) => string,
): Particion<T> {
  const buenas: T[] = [];
  const rechazadas: FilaRechazada<T>[] = [];
  for (const fila of filas) {
    const malas = columnasImposibles(familia, fila as Readonly<Record<string, unknown>>, umbral);
    if (malas.length === 0) {
      buenas.push(fila);
      continue;
    }
    rechazadas.push({ clave: clave(fila), fila, columnas: malas });
  }
  return { buenas, rechazadas };
}

/**
 * Anti-loop del aviso. Los reportes de Switch traen la misma ventana todos los
 * días, así que una fila mal cargada vuelve a llegar en CADA corrida. Solo se
 * avisa por las llaves que no se avisaron en la ventana reciente; si el dato
 * sigue mal, el aviso reaparece a la semana en vez de todos los días.
 * Preserva el orden de entrada y no repite llaves.
 */
export function clavesPorAvisar(
  rechazadas: readonly string[],
  yaAvisadas: Iterable<string>,
): string[] {
  const vistas = new Set(yaAvisadas);
  const salida: string[] = [];
  for (const clave of rechazadas) {
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    salida.push(clave);
  }
  return salida;
}

/** Marca del descarte en `switch_sync_log.skip_details`. Es también la llave del
 *  anti-loop: de acá salen las claves que ya se avisaron. */
export function campoSkip(familia: FamiliaMonto): string {
  return `monto_imposible_${familia}`;
}

/** Formato de plata para los mensajes. Un solo lugar. */
export function fmtMonto(n: number): string {
  return `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
