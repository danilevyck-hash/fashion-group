// ═══════════════════════════════════════════════════════════════════════════
//   🩸 EL SILENCIO NO CUENTA COMO QUE ESTÁ BIEN.
//
//   Dos avisos hermanos para el caso peor: que Switch NO dé error y
//   simplemente deje de mandar. A mira las CORRIDAS, B mira los DATOS.
// ═══════════════════════════════════════════════════════════════════════════
//
// ── EL INCIDENTE QUE LOS PIDIÓ (1 y 2-sep-2026) ──────────────────────────────
// Switch reescribió su motor de reportes por segunda vez en dos semanas (la
// primera rompió la cartera de Boston el 19-ago) y el sync de Egresos Varios
// tiró los 378 renglones de Vistana y los de las otras cuatro empresas con
// gastos. El módulo Gastos estuvo DOS DÍAS sin recibir datos y nos enteramos
// por el segundo fallo del cron, o sea por la regla 2 y de casualidad: falló el
// 100% de los renglones, así que la corrida murió entera y quedó en `error`.
//
// Si hubiera fallado el 3% —o si Switch hubiera devuelto un reporte vacío en vez
// de uno con formato nuevo— la corrida se anotaba `success` con CERO renglones y
// NADA habría sonado. La pantalla, además, no mentía: seguía diciendo
// «Cargado hasta julio 2026», que ES el último mes cargado. No mentía y tampoco
// avisaba.
//
// ── LOS DOS AVISOS, Y POR QUÉ SON DOS ───────────────────────────────────────
//
//   A · «un sync trajo cero donde siempre trae cientos» — mira switch_sync_log.
//       Ve el caso "corrió, dijo que todo bien, no trajo nada". Es el RÁPIDO:
//       lo detecta en la pasada siguiente de la reconciliación (horas).
//
//   B · «un módulo dejó de recibir datos» — mira la TABLA de negocio.
//       Ve todo lo que A no puede ver, y es justamente lo que no deja rastro:
//       que el cron no se haya invocado, que lo hayan sacado de vercel.json sin
//       querer, que el sync escriba en una tabla que nadie mira, que su propia
//       fila de log no se haya llegado a escribir. Es el LENTO y el de fondo:
//       si no hay corrida, no hay nada que A pueda evaluar.
//
// Cumplen la regla de tres del canal 🔧 SISTEMA (`alertas/canal.ts`) entera:
//   1. Es real — el volumen sale del historial medido del propio par, no de un
//      número escrito a mano.
//   2. No se arregla solo — las dos esperan a que la recuperación se agote (ver
//      «CUÁNDO SE MIRA» y el umbral de B).
//   3. Alguien tiene que hacer algo — y el texto dice qué: avisarle a quien
//      programa, que es la acción válida cuando el formato del proveedor cambió.
//
// Y NO estrenan una cuarta regla de sistema: A es la regla 2 («algo se rompió y
// no se arregló solo») mirando el resultado en vez del `status`, y B es la
// regla 1 («un dato que mirás está viejo», `datos-frescos.ts`) extendida a datos
// que esa regla no cubre. La lista de reglas no crece.
//
// ── 🔴 EL FILTRO QUE HACE TODO EL TRABAJO: SOLO SYNCS DE UNIVERSO COMPLETO ───
//
// Hay ceros perfectamente legítimos, y son la mayoría. Medidos sobre los 96 días
// de switch_sync_log que hay en producción (9.113 corridas, 2-sep-2026):
//
//   · `joystep` y `american_classic` figuran `success` con 0 renglones de
//     egresos_varios TODOS los días desde el 13-ago: no tienen egresos varios.
//   · 🩸 `utilidad` y `recibos` cargan el MES EN CURSO. El 1-jul-2026 seis pares
//     de recibos y cuatro de utilidad trajeron 0 a la vez — no se rompió nada:
//     era el primero de mes y julio todavía no tenía ni un documento. Y
//     `joystep|utilidad` trajo 0 ocho días seguidos (6 al 13-ago) porque joystep
//     no vendió nada en esa quincena.
//   · `active_wear|facturas` trae 0 en 81 de 248 corridas y `joystep|facturas`
//     en 98 de 244: son empresas chicas y hay días sin facturar.
//   · `ventas_tipos` es un centinela: su normal ES cero, siempre.
//
// El patrón detrás de todos: **el volumen de esos syncs es un número del
// NEGOCIO** («cuántas novedades hubo»), no una señal de salud. Un sync que
// escribe solo lo que cambió, o que carga un período que empieza vacío, tiene
// que poder traer cero sin que nadie se asuste.
//
// Por eso A solo opina sobre los syncs que reescriben un UNIVERSO COMPLETO en
// cada corrida —todo el catálogo, todos los saldos vivos, el mes de gastos ya
// cerrado—: ahí el cero no es «no pasó nada», es «no vino nada», que es otra
// cosa. La lista está declarada abajo, una por una, con su motivo.
//
// Con ese filtro puesto, el backtest sobre los 96 días da **0 disparos**. Sin
// él da 14, y los 14 son falsas alarmas.
//
// ── LOS TRES CANDADOS ESTADÍSTICOS (por si la lista se equivoca) ─────────────
// La lista declarada es el filtro principal; estos tres son la red de abajo, y
// se aplican POR PAR (empresa, sync_type), nunca por sync_type suelto:
//   · `A_MIN_HISTORIA` corridas exitosas previas — sin historia no se opina.
//   · la MEDIANA de esa historia ≥ `A_PISO_MEDIANA` — mediana y no promedio, la
//     convención de la casa (ver «puede estar a medio cargar» en Gastos): un
//     día raro no mueve la mediana.
//   · NI UN CERO en esa historia. Es el más duro y el que mata las excepciones
//     que la lista no vio: `active_shoes|egresos_varios` tuvo 4 ceros legítimos
//     entre el 13 y el 16-ago (todavía no le habían cargado gastos), así que ese
//     par NO se vigila por A — y lo agarra B igual.
//
// Ante la duda, callar. Una alerta que grita por un cero legítimo se gana que
// Daniel la ignore, y entonces no sirve para nada.
//
// ── CUÁNDO SE MIRA, Y POR QUÉ ESO ES LA REGLA 2 GRATIS ──────────────────────
// A NO corre dentro del sync: corre en la reconciliación (10/14/18 UTC), y mira
// la ÚLTIMA corrida exitosa de cada par. Eso hace el filtro de «se arregla solo»
// sin escribir una sola condición: un catálogo que corre 4 veces al día y trajo
// 0 a las 14:30 pero 127 a las 17:00 llega a la pasada de las 18:00 con su
// última corrida en 127 — no hay nada que avisar. Solo el par que sigue en cero
// cuando lo miramos merece el mensaje. Para un sync diario, en cambio, no hay
// segunda oportunidad en el día y el aviso sale la misma tarde.
//
// ── ANTI-LOOP: LA CLAVE ES EL MÓDULO, NO EL PAR ─────────────────────────────
// Mismo patrón que el guard de montos imposibles y el aviso de renglones
// ilegibles: 7 días entre avisos de la misma clave. Acá la clave es el MÓDULO
// que Daniel abre, y eso resuelve dos cosas de un saque:
//   · un sync roto en cinco empresas manda UN mensaje con las cinco, no cinco;
//   · A y B disparando por el mismo hecho —que es lo que pasó con Gastos— no
//     pueden mandar dos mensajes, porque comparten la clave.
// ═══════════════════════════════════════════════════════════════════════════

import { mapEmpresaName } from "@/lib/empresa-mapping";

/**
 * 🔴 LOS SYNCS SOBRE LOS QUE A PUEDE OPINAR, y el módulo que Daniel abre para
 * ver ese dato.
 *
 * El criterio para entrar es UNO: la corrida reescribe un universo COMPLETO, así
 * que su volumen no depende ni del calendario ni de que haya habido movimiento.
 * Un sync que escribe solo lo que cambió NO entra, por más importante que sea.
 *
 * Los que quedaron AFUERA y por qué (todos medidos, ver el encabezado):
 *   · `facturas`  — ventana de días; una empresa chica factura 0 y está sana.
 *                   Además la cubre la regla 1 (`datos-frescos.ts`).
 *   · `recibos`   — carga el mes en curso: el día 1 vale 0 por definición.
 *   · `utilidad`  — ídem, y encima con 8 días seguidos en cero medidos en joystep.
 *   · `articulos` — escritura selectiva: 30 de 58 corridas de `active_wear` en 0.
 *   · `factura_lineas`, `ingresos_mercancia` — upsert selectivo sobre una ventana.
 *   · `ventas_tipos` — es un centinela: su normal ES cero.
 *   · `multifashion`, `mayor` — retirados.
 *   · `clientes` (el directorio semanal de Boston) — reescribe un universo
 *     completo y calificaría de sobra, pero A lee `A_DIAS_DE_LOG` = 30 días de
 *     log y exige `A_MIN_HISTORIA` = 10 corridas previas: un par SEMANAL nunca
 *     junta más de 4 en esa ventana. Ponerlo acá sería una vigilancia que
 *     parece existir y nunca puede disparar. Lo cubre B, que mira la tabla.
 */
export const SYNCS_DE_UNIVERSO_COMPLETO: Readonly<Record<string, string>> = {
  // Todos los saldos vivos de la empresa, uno por documento. 0 ceros en 1.302
  // corridas.
  estadocuenta: "Cuentas por Cobrar",
  // La foto de costo de la ventana completa: 31 filas en TODAS las corridas.
  costo: "Ventas",
  // El catálogo entero de la empresa (existencia, precio de etiqueta, CIF).
  articulo_info: "Ventas › Referencia",
  // El mapa artículo → marca completo de Multifashion.
  articulo_marca: "Multifashion",
  // El catálogo de cuentas contables entero.
  cuentas_contables: "Gastos",
  // El MES de egresos, reemplazado entero (`egresos_reemplazar_mes`). El mes que
  // se carga viene con más de un mes de atraso, o sea que ya está CERRADO: no
  // crece de un día para el otro y por eso su volumen es estable al renglón.
  egresos_varios: "Gastos",
  // Toda la cuenta por pagar de la empresa.
  proveedores: "Proveedores",
  // Los cuatro catálogos públicos, completos, en cada pasada.
  catalogo_reebok: "Catálogos",
  catalogo_joybees: "Catálogos",
  catalogo_tommy: "Catálogos",
  catalogo_calvin: "Catálogos",
};

/** Cuántas corridas exitosas del par se leen para armar «lo normal». 20 cubre
 *  de sobra los 10 que exige `A_MIN_HISTORIA` aun con días salteados. */
export const A_VENTANA = 20;

/**
 * Corridas exitosas previas que hacen falta ANTES de opinar.
 *
 * 10 no es un número redondo elegido al azar: es exactamente lo que la poda de
 * `switch_sync_log` garantiza conservar de cada par por viejo que sea
 * (`podar_switch_sync_log`, migración 20260726210200), así que la ventana nunca
 * se queda sin piso por una limpieza. Y con 10 corridas seguidas sin un solo
 * cero, un cero ya no se puede explicar como «este par a veces trae cero».
 *
 * 🔑 Un par SIN esa historia —uno nuevo, o uno que corre cada varios días— NO
 * se vigila. Es el «ante la duda, callar»: preferimos no opinar de un par que
 * todavía no sabemos leer antes que estrenar una falsa alarma.
 */
export const A_MIN_HISTORIA = 10;

/**
 * Mediana mínima del historial para que el par entre en la vigilancia.
 *
 * Debajo de 10 filas por corrida el cero deja de ser una señal: un par que trae
 * 3 proveedores puede traer 0 un día por un motivo tonto y nadie tendría qué
 * hacer con ese mensaje. Hoy este piso deja afuera `proveedores` de tres
 * empresas (medianas 3, 5 y 5) y a nadie más.
 */
export const A_PISO_MEDIANA = 10;

/** Días de historia de `switch_sync_log` que se leen para evaluar A. 30 le da a
 *  un sync diario 30 corridas —el triple de `A_MIN_HISTORIA`— aguantando huecos. */
export const A_DIAS_DE_LOG = 30;

/**
 * 🔴 LAS TABLAS QUE VIGILA B, y por qué SOLO estas.
 *
 * Los tres requisitos, y los tres tienen que darse:
 *
 *  1. **La escritura es COMPLETA en cada corrida.** Es el mismo criterio de A y
 *     por el mismo motivo. 🩸 Medido hoy contra producción: `switch_recibos` de
 *     `active_wear` lleva **144 h** sin una escritura y `switch_factura_lineas`
 *     de `joystep` **132 h**, y las dos empresas están perfectamente sanas — sus
 *     syncs escriben solo lo que cambió y no cambió nada. Vigilar la recencia de
 *     escritura de una tabla con escritura selectiva es garantizar el falso
 *     positivo eterno.
 *
 *  2. **Nadie más la vigila.** La cartera (`switch_estadocuenta`) y las ventas
 *     ya son la regla 1 en `datos-frescos.ts`; repetirlas acá sería el mensaje
 *     doble que este archivo justamente evita.
 *
 *  3. **No tiene segunda oportunidad.** Ni `sync-egresos-varios` ni
 *     `sync-articulo-info` están en `COLATERAL_CRONS`, así que la reconciliación
 *     NO los re-ejecuta: si su corrida del día se pierde, se perdió.
 *
 * ⚠️ **Se mira CUÁNDO SE ESCRIBIÓ, nunca la fecha del dato.** El reporte de
 * egresos viene con más de un mes de atraso porque así lo carga la contadora: el
 * egreso más nuevo de Vistana hoy es del 31-jul y eso es lo normal. Usar la
 * fecha del dato como señal haría sonar esta alerta para siempre.
 */
export interface TablaVigilada {
  tabla: string;
  /** La columna que dice CUÁNDO LA ESCRIBIMOS. Nunca la fecha del documento. */
  columna: string;
  /** El módulo que Daniel abre. Es también la clave del anti-loop. */
  modulo: string;
  /** Qué es ese dato, en palabras de negocio. Sin nombres de tabla. */
  que: string;
  /** Horas sin una sola escritura antes de avisar. Ver `HORAS_SIN_ESCRIBIR`. */
  horas: number;
  /**
   * Empresas de esta entrada. Ausente = las 8.
   *
   * 🔴 Existe porque la MISMA tabla puede tener ritmos distintos según la
   * empresa, y un solo umbral las mentiría a todas. `switch_clientes` lo
   * escribe el estado de cuenta DIARIO en las 6 del grupo, un cron diario en
   * Multifashion y un cron SEMANAL en Boston: vigilar las 8 con las horas de
   * Boston taparía seis días de silencio del grupo, y con las del grupo sonaría
   * todos los días por Boston estando sana.
   */
  empresas?: readonly string[];
}

/**
 * El umbral de B, y la cuenta que lo fija (los dos crons de abajo son DIARIOS y
 * la reconciliación mira a las 10:00, 14:00 y 18:00 UTC):
 *
 *   · Sano, en la pasada de las 10:00 —justo ANTES de la corrida del día— el
 *     dato ya tiene 23 h y media. O sea que cualquier umbral por debajo de ~24 h
 *     suena todos los días sin que pase nada.
 *   · Un día perdido: a las 18:00 el dato lleva 31 h. Eso NO se avisa: estos
 *     syncs reescriben todo, así que la corrida de mañana lo repara sola y la
 *     regla 2 dice explícitamente que eso no es un incidente.
 *   · Dos días perdidos: a las 10:00 del segundo día el dato lleva 47 h. Ahí sí.
 *
 * Sirve cualquier valor entre 32 y 47; **40 h** queda en el medio y aguanta el
 * jitter del scheduler de Vercel por los dos lados. Es la misma regla de «dos
 * seguidas» de la política de sync, escrita del lado del dato.
 */
export const HORAS_SIN_ESCRIBIR = 40;

/**
 * El umbral de B para un sync SEMANAL, y la misma cuenta hecha con siete días.
 * Hoy solo lo usa el directorio de clientes de Boston (domingos 07:10 UTC), y
 * la reconciliación sigue mirando a las 10:00, 14:00 y 18:00:
 *
 *   · Sano, el dato envejece hasta **154,8 h** — la pasada del sábado a las
 *     18:00 es la última antes de la corrida del domingo. Cualquier umbral por
 *     debajo de eso suena todas las semanas sin que pase nada.
 *   · Una corrida perdida: la pasada del domingo a las 10:00 ve **171 h**.
 *   · Dos perdidas: 339 h.
 *
 * Sirve cualquier valor entre 155 y 171; **165 h** queda en el medio y aguanta
 * el jitter del scheduler por los dos lados.
 *
 * 🔑 A diferencia del umbral diario, éste avisa a la PRIMERA corrida perdida, y
 * es correcto: la regla 2 del canal de sistema exculpa lo que «se arregla solo
 * en horas», y acá la próxima oportunidad es dentro de SIETE DÍAS. Esperar una
 * segunda corrida sería tolerar tres semanas de dato viejo — que es exactamente
 * lo que ya pasó.
 */
export const HORAS_SIN_ESCRIBIR_SEMANAL = 165;

export const TABLAS_VIGILADAS: readonly TablaVigilada[] = [
  {
    tabla: "egresos_varios",
    // `egresos_reemplazar_mes` borra e inserta el mes entero en una transacción,
    // así que `created_at` se renueva en cada corrida: es literalmente «cuándo
    // reescribimos este mes».
    //
    // 🔴 NO se mira `egresos_importaciones`: esa fila se escribe aunque el
    // reporte venga vacío. Medido el 2-sep-2026, con el módulo muerto hacía dos
    // días: `egresos_importaciones` decía 4,9 h y `egresos_varios` 52,9 h. Una
    // mide el mecanismo, la otra el dato — y esta alerta existe para mirar el dato.
    columna: "created_at",
    modulo: "Gastos",
    que: "los gastos de caja y banco",
    horas: HORAS_SIN_ESCRIBIR,
  },
  {
    tabla: "switch_articulo_info",
    // El upsert manda `synced_at: ahoraIso` en TODAS las filas del catálogo.
    columna: "synced_at",
    modulo: "Ventas › Referencia",
    que: "la existencia y el precio de etiqueta de los artículos",
    horas: HORAS_SIN_ESCRIBIR,
  },
  {
    // 🩸 LA QUE FALTABA. El directorio de clientes de Confecciones Boston estuvo
    // **37 días congelado** —sus 4.915 filas con el mismo `synced_at`, el
    // 30-jul-2026— y nadie lo notó, porque ninguna alerta lo cubría. Se descubrió
    // de casualidad, igual que el de Gastos.
    //
    // Cumple los tres requisitos: la escritura es COMPLETA en cada corrida
    // (`persistClientesDirectorio` manda `synced_at` en todas las filas), nadie
    // más la vigila (`datos-frescos.ts` no la mira) y no tiene segunda
    // oportunidad — es semanal.
    tabla: "switch_clientes",
    columna: "synced_at",
    modulo: "Confecciones Boston",
    que: "el directorio de clientes de Confecciones Boston",
    horas: HORAS_SIN_ESCRIBIR_SEMANAL,
    // 🔴 SOLO Boston. En las 6 del grupo esta tabla la escribe el estado de
    // cuenta DIARIO y en Multifashion el cron de fidelización: con el umbral
    // semanal, seis días de silencio del grupo no dirían nada.
    empresas: ["confecciones_boston"],
  },
];

/** Días entre dos avisos de la MISMA clave. El mismo número que el guard de
 *  montos imposibles y el aviso de renglones ilegibles, y por el mismo motivo:
 *  un módulo que dejó de recibir datos sigue igual mañana, y repetirlo cada
 *  pasada lo convierte en la alerta que suena para siempre y que nadie lee. */
export const DIAS_ENTRE_AVISOS = 7;

/** `tipo` con el que se registra el aviso en `cron_email_errors`. Lleva la clave
 *  del módulo pegada, igual que `switch-sync:<slot>`: así el dedup filtra por
 *  `.eq("tipo", …)` y no por un LIKE sobre el texto. */
export const TIPO_SILENCIO = "silencio_de_datos";
export const tipoDeModulo = (modulo: string): string => `${TIPO_SILENCIO}:${modulo}`;

// ─── Lo que encuentra cada alerta ────────────────────────────────────────────

export interface CorridaDeSync {
  /** ISO de `started_at`. */
  cuando: string;
  /** Filas que la corrida escribió: insertadas + actualizadas. Las SALTEADAS no
   *  cuentan: no entraron, y de ellas ya avisan el guard de montos y el de
   *  renglones ilegibles. */
  volumen: number;
}

export type Hallazgo =
  | {
      clase: "sync-en-cero";
      modulo: string;
      empresaKey: string;
      syncType: string;
      /** Desde cuándo viene trayendo cero (la primera corrida de la racha). */
      desdeIso: string;
      /** Lo que ese par trae normalmente. */
      mediana: number;
    }
  | {
      clase: "tabla-quieta";
      modulo: string;
      empresaKey: string;
      tabla: string;
      que: string;
      /** Última vez que ESCRIBIMOS esa tabla para esa empresa. */
      ultimaIso: string;
      horas: number;
    };

// ─── Lógica pura ─────────────────────────────────────────────────────────────

/** Mediana (no promedio: la convención de la casa). Devuelve 0 si no hay datos. */
export function medianaDe(nums: readonly number[]): number {
  if (nums.length === 0) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 === 1 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * ALERTA A, pura. `corridas` son las corridas EXITOSAS del par, de la más nueva
 * a la más vieja (el orden en que las devuelve PostgREST).
 *
 * Devuelve `null` —o sea, se calla— en todos estos casos, y cada uno tapa una
 * falsa alarma medida:
 *   · el sync no reescribe un universo completo (no está en la lista);
 *   · la última corrida trajo algo (aunque la anterior haya traído cero: eso ya
 *     se recuperó solo);
 *   · el par no tiene `A_MIN_HISTORIA` corridas previas al primer cero;
 *   · esa historia tiene aunque sea UN cero;
 *   · la mediana de esa historia no llega a `A_PISO_MEDIANA`.
 */
export function evaluarSyncEnCero(
  empresaKey: string,
  syncType: string,
  corridas: readonly CorridaDeSync[],
): Hallazgo | null {
  const modulo = SYNCS_DE_UNIVERSO_COMPLETO[syncType];
  if (!modulo) return null;
  if (corridas.length === 0) return null;
  if (corridas[0].volumen !== 0) return null;

  // La racha de ceros arranca en la más nueva y camina hacia atrás.
  let fin = 0;
  while (fin + 1 < corridas.length && corridas[fin + 1].volumen === 0) fin++;

  const historia = corridas.slice(fin + 1).map((c) => c.volumen);
  if (historia.length < A_MIN_HISTORIA) return null;
  if (historia.some((v) => v === 0)) return null;
  const mediana = medianaDe(historia);
  if (mediana < A_PISO_MEDIANA) return null;

  return {
    clase: "sync-en-cero",
    modulo,
    empresaKey,
    syncType,
    desdeIso: corridas[fin].cuando,
    mediana,
  };
}

/**
 * ALERTA B, pura. `ultimaEscrituraIso` es el máximo de la columna de escritura
 * para esa empresa; `null` significa que esa empresa NUNCA tuvo una fila.
 *
 * 🔴 «Nunca tuvo datos» NO alerta, ni una vez. `joystep`, `american_classic` y
 * `confecciones_boston` no tienen un solo renglón en `egresos_varios` y no lo
 * van a tener: su vacío es correcto. Un par sin historia no se vigila — la misma
 * regla que A.
 */
export function evaluarTablaQuieta(
  cfg: TablaVigilada,
  empresaKey: string,
  ultimaEscrituraIso: string | null,
  ahoraMs: number,
): Hallazgo | null {
  if (!ultimaEscrituraIso) return null;
  const t = new Date(ultimaEscrituraIso).getTime();
  if (!Number.isFinite(t)) return null;
  const horas = (ahoraMs - t) / 3_600_000;
  if (horas <= cfg.horas) return null;
  return {
    clase: "tabla-quieta",
    modulo: cfg.modulo,
    empresaKey,
    tabla: cfg.tabla,
    que: cfg.que,
    ultimaIso: ultimaEscrituraIso,
    horas: Math.floor(horas),
  };
}

/**
 * Agrupa por MÓDULO, que es la unidad del mensaje y la del anti-loop.
 *
 * 🔴 Es lo que impide los dos mensajes por el mismo hecho: cuando el sync de
 * Gastos deja de traer, A dispara por cinco pares y B por cinco empresas de la
 * misma tabla — diez hallazgos, un solo módulo, un solo mensaje, una sola clave
 * de dedup.
 */
export function agruparPorModulo(hallazgos: readonly Hallazgo[]): Map<string, Hallazgo[]> {
  const out = new Map<string, Hallazgo[]>();
  for (const h of hallazgos) {
    const l = out.get(h.modulo) ?? [];
    l.push(h);
    out.set(h.modulo, l);
  }
  return out;
}

/** "31 ago 2026, 05:36" en hora de Panamá. */
function fmtPanama(iso: string): string {
  return new Intl.DateTimeFormat("es-PA", {
    timeZone: "America/Panama",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const listar = (nombres: readonly string[]): string =>
  [...new Set(nombres.map(mapEmpresaName))].join(", ");

/**
 * El mensaje que va al celular. PURO, para poder revisar cómo se lee un aviso
 * que ojalá casi nunca salga.
 *
 * Un mensaje por MÓDULO. Sin nombres de tabla, sin `sync_type`, sin códigos: lo
 * único que Daniel necesita para actuar es qué pantalla quedó corta, desde
 * cuándo y a quién avisarle.
 */
export function mensajeSilencio(modulo: string, hallazgos: readonly Hallazgo[]): string {
  const enCero = hallazgos.filter((h) => h.clase === "sync-en-cero");
  const quietas = hallazgos.filter((h) => h.clase === "tabla-quieta");
  const lineas: string[] = [];

  lineas.push(`${modulo} dejó de recibir datos.`);
  lineas.push("");

  for (const h of enCero) {
    if (h.clase !== "sync-en-cero") continue;
    lineas.push(
      `• ${mapEmpresaName(h.empresaKey)}: la actualización corrió bien pero trajo CERO ` +
        `desde ${fmtPanama(h.desdeIso)}. Normalmente trae ${h.mediana}.`,
    );
  }
  if (quietas.length > 0) {
    // El peor caso manda, y se nombran todas las empresas — misma forma que el
    // mensaje de la regla 1, para que los dos avisos se lean igual.
    const peor = quietas.reduce((a, b) =>
      b.clase === "tabla-quieta" && a.clase === "tabla-quieta" && b.horas > a.horas ? b : a,
    );
    if (peor.clase === "tabla-quieta") {
      lineas.push(
        `• ${peor.que}: no entra nada nuevo desde hace ${peor.horas} horas ` +
          `(lo último es del ${fmtPanama(peor.ultimaIso)}).`,
      );
      lineas.push(`  Empresas: ${listar(quietas.map((h) => h.empresaKey))}`);
    }
  }

  lineas.push("");
  lineas.push(
    `Qué significa: lo que ves en ${modulo} sigue siendo correcto hasta la fecha que dice, ` +
      "pero le falta todo lo nuevo. La pantalla no lo avisa sola porque no sabe que falta.",
  );
  lineas.push(
    "Qué hacer: avísame para revisarlo — cuando algo deja de llegar de golpe suele ser que " +
      "Switch cambió el formato de su reporte, y eso hay que enseñárselo a la app.",
  );
  lineas.push(
    `Mientras siga así, este aviso se repite una vez por semana, no todos los días.`,
  );
  return lineas.join("\n");
}
