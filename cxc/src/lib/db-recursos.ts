// ─────────────────────────────────────────────────────────────────────────────
// Salud de recursos de la base (memoria / swap / disco / CPU / conexiones).
//
// POR QUÉ EXISTE (26-jul-2026): esa noche el proyecto de Supabase —que venía en
// Free con compute Nano, 0,5 GB de RAM compartida— se ahogó y devolvió 521
// durante 1 h 16 min (22:41 → 23:57 UTC). Nos enteramos porque el sitio dejó de
// andar. La telemetría que YA existía no podía avisar: `cron_email_errors` y
// `cron_heartbeats` viven DENTRO de la base que se cayó, así que la caída no
// dejó ni una fila (medido: cero errores registrados en esa ventana). Un vigía
// que escribe en el paciente no sirve para certificar que el paciente respira.
//
// Este módulo es la pieza pura: parsea el endpoint Prometheus de Supabase y
// decide si hay que gritar. NO toca la base, NO hace fetch, NO manda nada — todo
// eso vive en /api/cron/db-salud. Así se puede testear con muestras reales sin
// red y sin credenciales.
//
// FUENTE: https://<ref>.supabase.co/customer/v1/privileged/metrics
// Basic auth con usuario "service_role" y la service_role key de password.
// Es un add-on GRATIS del plan Pro (en Free no existe) — verificado el
// 27-jul-2026 contra el proyecto real: HTTP 200, 135 KB, 317 métricas.
//
// Devuelve una FOTO del instante, no una serie de tiempo: por eso el cron toma
// varias muestras al día en vez de una. Supabase refresca los valores 1×/min.
// ─────────────────────────────────────────────────────────────────────────────

/** Una métrica del texto Prometheus: nombre, etiquetas y valor. */
export interface MetricaCruda {
  nombre: string;
  labels: Record<string, string>;
  valor: number;
}

/**
 * Parser mínimo del formato de exposición Prometheus. Ignora comentarios
 * (`# HELP` / `# TYPE`) y líneas que no tengan un número final parseable.
 *
 * No usamos una librería a propósito: el formato que nos importa es una línea
 * `nombre{k="v",...} 123.4` y una dependencia más en el bundle serverless
 * cuesta arranque en frío para ahorrar 20 líneas.
 */
export function parsePrometheus(texto: string): MetricaCruda[] {
  const out: MetricaCruda[] = [];
  for (const linea of texto.split("\n")) {
    const l = linea.trim();
    if (!l || l.startsWith("#")) continue;

    const m = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{[^}]*\})?\s+(.+)$/.exec(l);
    if (!m) continue;

    const valor = Number(m[3].trim().split(/\s+/)[0]);
    if (!Number.isFinite(valor)) continue;

    const labels: Record<string, string> = {};
    if (m[2]) {
      // Etiquetas simples `k="v"`. Los valores de Supabase no traen comillas
      // escapadas ni comas dentro del valor, así que alcanza con esto.
      for (const par of m[2].slice(1, -1).matchAll(/([a-zA-Z_][a-zA-Z0-9_]*)="([^"]*)"/g)) {
        labels[par[1]] = par[2];
      }
    }
    out.push({ nombre: m[1], labels, valor });
  }
  return out;
}

/** Primer valor de una métrica que cumpla el filtro de etiquetas (o null). */
function valor(
  metricas: MetricaCruda[],
  nombre: string,
  filtro?: (labels: Record<string, string>) => boolean,
): number | null {
  for (const m of metricas) {
    if (m.nombre !== nombre) continue;
    if (filtro && !filtro(m.labels)) continue;
    return m.valor;
  }
  return null;
}

/** Suma de todos los valores de una métrica que cumplan el filtro. */
function suma(
  metricas: MetricaCruda[],
  nombre: string,
  filtro?: (labels: Record<string, string>) => boolean,
): number {
  let acc = 0;
  for (const m of metricas) {
    if (m.nombre !== nombre) continue;
    if (filtro && !filtro(m.labels)) continue;
    acc += m.valor;
  }
  return acc;
}

/**
 * Tope de tamaño de la base incluido en el plan Pro: 8 GB.
 * (Free eran 500 MB. Medido el 27-jul-2026: la base pesa ~261 MB = 3,2%.)
 */
export const DB_LIMITE_BYTES = 8 * 1024 * 1024 * 1024;

/** Lectura normalizada de una foto de métricas. `null` en los campos que la
 *  respuesta no traiga (no inventamos ceros: un cero se ve como emergencia). */
export interface MuestraRecursos {
  /** RAM del compute (Micro = 1 GB → ~950 MB visibles por el SO). */
  memoriaTotalBytes: number | null;
  /** MemAvailable: libre + caché reclamable. Es el número que importa. */
  memoriaDisponibleBytes: number | null;
  memoriaDisponiblePct: number | null;

  swapTotalBytes: number | null;
  swapUsadoBytes: number | null;
  swapUsadoPct: number | null;

  /** Partición /data = donde vive Postgres (la del sistema no nos interesa). */
  discoTotalBytes: number | null;
  discoDisponibleBytes: number | null;
  discoDisponiblePct: number | null;

  /** Tamaño de la base `postgres` (sin template0/template1). */
  dbBytes: number | null;
  dbUsadoPct: number | null;

  cpuNucleos: number | null;
  carga1: number | null;
  carga5: number | null;
  carga15: number | null;
  /** load5 / núcleos. 1,0 = el server está exactamente lleno. */
  cargaPorNucleo: number | null;

  conexiones: number | null;
  conexionesMax: number | null;
  conexionesPct: number | null;
}

const pct = (parte: number | null, total: number | null): number | null =>
  parte === null || total === null || total <= 0 ? null : (parte / total) * 100;

/** Convierte el texto crudo del endpoint en una muestra normalizada. */
export function leerMuestra(texto: string): MuestraRecursos {
  const m = parsePrometheus(texto);

  const memoriaTotalBytes = valor(m, "node_memory_MemTotal_bytes");
  const memoriaDisponibleBytes = valor(m, "node_memory_MemAvailable_bytes");

  const swapTotalBytes = valor(m, "node_memory_SwapTotal_bytes");
  const swapLibre = valor(m, "node_memory_SwapFree_bytes");
  const swapUsadoBytes =
    swapTotalBytes !== null && swapLibre !== null ? swapTotalBytes - swapLibre : null;

  // La partición de datos de Postgres. Supabase la monta en /data; el `/` del
  // sistema puede estar apretado sin que eso afecte a la base.
  const esData = (l: Record<string, string>) => l.mountpoint === "/data";
  const discoTotalBytes = valor(m, "node_filesystem_size_bytes", esData);
  const discoDisponibleBytes = valor(m, "node_filesystem_avail_bytes", esData);

  const dbBytes = valor(m, "pg_database_size_bytes", (l) => l.datname === "postgres");

  // node_cpu_online trae una fila por núcleo con valor 1.
  const nucleos = suma(m, "node_cpu_online");
  const cpuNucleos = nucleos > 0 ? nucleos : null;
  const carga1 = valor(m, "node_load1");
  const carga5 = valor(m, "node_load5");
  const carga15 = valor(m, "node_load15");

  const conexiones = valor(m, "pg_stat_database_num_backends");
  const conexionesMax = valor(m, "max_connections_connection_count");

  return {
    memoriaTotalBytes,
    memoriaDisponibleBytes,
    memoriaDisponiblePct: pct(memoriaDisponibleBytes, memoriaTotalBytes),
    swapTotalBytes,
    swapUsadoBytes,
    swapUsadoPct: pct(swapUsadoBytes, swapTotalBytes),
    discoTotalBytes,
    discoDisponibleBytes,
    discoDisponiblePct: pct(discoDisponibleBytes, discoTotalBytes),
    dbBytes,
    dbUsadoPct: pct(dbBytes, DB_LIMITE_BYTES),
    cpuNucleos,
    carga1,
    carga5,
    carga15,
    cargaPorNucleo:
      carga5 !== null && cpuNucleos !== null && cpuNucleos > 0 ? carga5 / cpuNucleos : null,
    conexiones,
    conexionesMax,
    conexionesPct: pct(conexiones, conexionesMax),
  };
}

// ─── Umbrales ────────────────────────────────────────────────────────────────
// Calibrados contra la línea base REAL del 27-jul-2026 con compute Micro en
// reposo (1 GB / 2 núcleos):
//   memoria disponible 56,8 %  ·  swap usado 13,5 %  ·  disco /data libre 92 %
//   base 261 MB de 8 GB (3,2 %)  ·  load5 0,04 (0,02/núcleo)  ·  9 de 60 conex.
// Es decir: en un día normal TODO está lejísimos de cualquier umbral. Si algo
// se acerca, es señal de verdad, no ruido — que es exactamente lo que se quiere
// después de haber vivido la caída sin aviso previo.

export interface Umbrales {
  memoriaDisponiblePctAviso: number;
  memoriaDisponiblePctCritico: number;
  swapUsadoPctAviso: number;
  swapUsadoPctCritico: number;
  discoDisponiblePctAviso: number;
  discoDisponiblePctCritico: number;
  dbUsadoPctAviso: number;
  dbUsadoPctCritico: number;
  cargaPorNucleoAviso: number;
  cargaPorNucleoCritico: number;
  conexionesPctAviso: number;
  conexionesPctCritico: number;
}

export const UMBRALES: Umbrales = {
  // Memoria: MemAvailable ya descuenta la caché reclamable, así que por debajo
  // de 20 % el kernel empieza a pelear y por debajo de 10 % aparece el OOM
  // killer (la métrica node_vmstat_oom_kill lo confirmaría después del hecho).
  memoriaDisponiblePctAviso: 20,
  memoriaDisponiblePctCritico: 10,
  // ⛔ Los umbrales de swap quedan declarados pero YA NO SE APLICAN: el swap no
  // genera hallazgos (ver el comentario en evaluarRecursos). Se conservan para no
  // romper la forma de `Umbrales` ni los tests de coherencia aviso<crítico.
  //
  // Swap 40→70 aviso y 70→85 crítico (30-jul-2026). El 40 generaba RUIDO PURO:
  // Daniel recibió "🟡 Memoria de emergencia en uso: 42%" con la base
  // perfectamente sana, y encima lo leyó como falta de ESPACIO (acababa de pagar
  // Supabase Pro). Medido ese día contra el endpoint de métricas: swap usado
  // 40,3 % — o sea parado justo encima del umbral — con memoria disponible 53,3 %
  // y `node_vmstat_oom_kill` en 0 (la base nunca fue matada por memoria).
  //
  // ⚠️ POR QUÉ EL NÚMERO SOLO NO SIRVE DE MUCHO: el swap usado es una marca de
  // marea ALTA y PEGAJOSA. Cuando el kernel manda páginas al swap no las trae de
  // vuelta hasta que alguien las pide, así que el porcentaje sube y casi nunca
  // baja: 13,5 % el 27-jul → 40,3 % el 30-jul, sin ningún incidente en el medio.
  // Un umbral bajo sobre una métrica monótona = una alerta que, una vez que
  // suena, suena para siempre. La señal que de verdad importa es la memoria
  // DISPONIBLE (que tiene su propio umbral, 20 %) y `oom_kill`.
  //
  // El 70 deja el doble de aire sobre la deriva observada y sigue atrapando el
  // episodio REAL: durante la caída del 26-jul el swap llegó a 86 % → cae en
  // crítico (>85). Si con el tiempo la deriva normal también cruza el 70, el
  // arreglo NO es volver a subir el número: es dejar de alertar por swap usado y
  // mirar la ACTIVIDAD de swap (node_vmstat_pswpin/pswpout entre dos muestras),
  // que sí distingue "hay páginas viejas guardadas" de "está paginando ahora".
  swapUsadoPctAviso: 70,
  swapUsadoPctCritico: 85,
  // Disco: Postgres necesita aire para WAL, vacuum e índices temporales.
  discoDisponiblePctAviso: 25,
  discoDisponiblePctCritico: 12,
  // Tamaño de la base contra los 8 GB del plan Pro.
  dbUsadoPctAviso: 75,
  dbUsadoPctCritico: 90,
  // Carga: 1,0 por núcleo = server exactamente lleno. 1,5 sostenido ya alarga
  // las consultas; 3,0 es el territorio del `statement timeout` del 25-jul.
  cargaPorNucleoAviso: 1.5,
  cargaPorNucleoCritico: 3,
  conexionesPctAviso: 70,
  conexionesPctCritico: 90,
};

export type Nivel = "ok" | "aviso" | "critico";

export interface Hallazgo {
  clave: string;
  nivel: Exclude<Nivel, "ok">;
  /** Texto en español simple, sin jerga: lo lee Daniel, no un DBA. */
  texto: string;
}

export interface Evaluacion {
  nivel: Nivel;
  hallazgos: Hallazgo[];
}

const un = (n: number) => n.toFixed(0);

/**
 * Compara una medición contra sus dos umbrales.
 * `direccion: "menor"` = alerta cuando el valor BAJA (memoria libre, disco);
 * `"mayor"` = alerta cuando SUBE (swap, carga, conexiones).
 */
function revisar(
  clave: string,
  valorMedido: number | null,
  aviso: number,
  critico: number,
  direccion: "menor" | "mayor",
  texto: (v: number) => string,
): Hallazgo | null {
  if (valorMedido === null || !Number.isFinite(valorMedido)) return null;
  const superaCritico =
    direccion === "menor" ? valorMedido < critico : valorMedido > critico;
  const superaAviso = direccion === "menor" ? valorMedido < aviso : valorMedido > aviso;
  if (superaCritico) return { clave, nivel: "critico", texto: texto(valorMedido) };
  if (superaAviso) return { clave, nivel: "aviso", texto: texto(valorMedido) };
  return null;
}

/** Aplica los umbrales a una muestra. Sin efectos: entra una foto, sale un veredicto. */
export function evaluarRecursos(
  m: MuestraRecursos,
  u: Umbrales = UMBRALES,
): Evaluacion {
  const hallazgos: Hallazgo[] = [];

  const candidatos = [
    revisar(
      "memoria",
      m.memoriaDisponiblePct,
      u.memoriaDisponiblePctAviso,
      u.memoriaDisponiblePctCritico,
      "menor",
      (v) => `MEMORIA apretada: solo queda ${un(v)}% de memoria libre`,
    ),
    // ⛔ SWAP: NO ALERTA. Decisión de Daniel (30-jul-2026): "solo arriba del 80%
    // de memoria, no del 42%. Al 42% no se avisa nada". Sigue MEDIDO y visible en
    // el bloque de estado del mensaje (es contexto útil cuando algo pasa), pero
    // ya no genera hallazgos.
    //
    // Por qué es la métrica correcta para callar, y no solo una orden que se
    // acata: el swap usado es una marca de marea ALTA y PEGAJOSA — el kernel no
    // trae de vuelta las páginas hasta que alguien las pide, así que el
    // porcentaje sube y casi nunca baja (13,5 % el 27-jul → 40,3 % el 30-jul, sin
    // ningún incidente en el medio). Alertar sobre una métrica monótona es
    // garantizar una alerta que, una vez que suena, suena para siempre: eso fue
    // exactamente lo que pasó (🟡 al 41-42 % los días 28, 29 y 30 con la base
    // sana, memoria disponible 53,3 % y `node_vmstat_oom_kill` en 0).
    //
    // Lo que SÍ queda vigilando la memoria es `memoriaDisponiblePct` (aviso <20 %
    // = más del 80 % usado, que es el umbral que pidió Daniel; crítico <10 %).
    // El episodio REAL del 26-jul entra por ahí: durante la caída la memoria
    // estaba en el piso y la carga disparada (ver el test "la caída del 26-jul se
    // habría detectado antes de los 521"), no hacía falta el swap para verlo.
    revisar(
      "disco",
      m.discoDisponiblePct,
      u.discoDisponiblePctAviso,
      u.discoDisponiblePctCritico,
      "menor",
      (v) => `Espacio libre en disco: ${un(v)}%`,
    ),
    revisar(
      "tamano_base",
      m.dbUsadoPct,
      u.dbUsadoPctAviso,
      u.dbUsadoPctCritico,
      "mayor",
      (v) => `La base ocupa ${un(v)}% de los 8 GB del plan`,
    ),
    revisar(
      "carga",
      m.cargaPorNucleo,
      u.cargaPorNucleoAviso,
      u.cargaPorNucleoCritico,
      "mayor",
      (v) => `Trabajo acumulado: ${v.toFixed(1)}x lo que el servidor aguanta`,
    ),
    revisar(
      "conexiones",
      m.conexionesPct,
      u.conexionesPctAviso,
      u.conexionesPctCritico,
      "mayor",
      (v) =>
        `Conexiones abiertas: ${un(v)}% del máximo` +
        (m.conexiones !== null && m.conexionesMax !== null
          ? ` (${m.conexiones} de ${m.conexionesMax})`
          : ""),
    ),
  ];

  for (const c of candidatos) if (c) hallazgos.push(c);

  // Los críticos primero: si hay que leer una sola línea, que sea la peor.
  hallazgos.sort((a, b) => (a.nivel === b.nivel ? 0 : a.nivel === "critico" ? -1 : 1));

  const nivel: Nivel = hallazgos.some((h) => h.nivel === "critico")
    ? "critico"
    : hallazgos.length > 0
      ? "aviso"
      : "ok";

  return { nivel, hallazgos };
}

const mb = (b: number | null) => (b === null ? "—" : `${Math.round(b / 1048576)} MB`);
const unoDec = (n: number | null) => (n === null ? "—" : n.toFixed(0));

/** Claves de hallazgo que hablan de MEMORIA (RAM), no de almacenamiento. */
const CLAVES_MEMORIA = ["memoria", "swap"];

/**
 * Mensaje de Telegram en español simple. Texto plano (sin parse_mode): es el
 * modo seguro de `sendTelegramAlert` para contenido con números y símbolos.
 *
 * 🩸 POR QUÉ EL ESTADO VA EN GRUPOS SEPARADOS (30-jul-2026). El mensaje viejo
 * listaba de corrido "Memoria de emergencia usada 42% · Disco libre 92% · Tamaño
 * de la base 270 MB de 8 GB". Daniel lo leyó como un aviso de que se estaba
 * quedando sin ESPACIO —justo después de pagar Supabase Pro— cuando lo que se
 * apretaba era la RAM (906 MB, que el plan no cambió) y el almacenamiento estaba
 * perfecto. Mezclar memoria y disco en una sola lista es lo que produjo la
 * confusión: ahora van en bloques con título, y cuando el hallazgo es de memoria
 * el mensaje dice explícitamente que el disco no tiene nada que ver.
 */
export function mensajeRecursos(m: MuestraRecursos, ev: Evaluacion): string {
  const titulo =
    ev.nivel === "critico"
      ? "🔴 La base de datos está al límite"
      : "🟡 La base de datos se está apretando";

  const lineas = [titulo, ""];
  for (const h of ev.hallazgos) {
    lineas.push(`${h.nivel === "critico" ? "🔴" : "🟡"} ${h.texto}`);
  }

  // Aclaración anti-confusión, SOLO cuando el problema es de memoria.
  if (ev.hallazgos.some((h) => CLAVES_MEMORIA.includes(h.clave))) {
    lineas.push("");
    lineas.push(
      "Qué significa: es MEMORIA (RAM), no espacio de almacenamiento. " +
        "Tener disco libre no lo arregla, y el plan de Supabase no cambia la RAM: " +
        "se baja consultando menos de golpe o subiendo el tamaño del servidor.",
    );
  }

  lineas.push("");
  lineas.push("MEMORIA (es lo que se aprieta):");
  lineas.push(
    `· Memoria libre ${unoDec(m.memoriaDisponiblePct)}% (${mb(m.memoriaDisponibleBytes)} de ${mb(m.memoriaTotalBytes)})`,
  );
  lineas.push(`· Memoria de respaldo usada ${unoDec(m.swapUsadoPct)}%`);
  lineas.push("");
  lineas.push("ALMACENAMIENTO (va aparte, no tiene que ver con la memoria):");
  lineas.push(`· Disco libre ${unoDec(m.discoDisponiblePct)}%`);
  lineas.push(`· Tamaño de la base ${mb(m.dbBytes)} de 8 GB`);
  lineas.push("");
  lineas.push("SERVIDOR:");
  lineas.push(
    `· Trabajo acumulado ${m.cargaPorNucleo === null ? "—" : m.cargaPorNucleo.toFixed(2)}x`,
  );
  lineas.push(`· Conexiones ${m.conexiones ?? "—"} de ${m.conexionesMax ?? "—"}`);
  lineas.push("");
  lineas.push("Qué hacer: cxc/docs/runbook-base-lenta.md");
  return lineas.join("\n");
}

/** Mensaje para cuando NO se pudo leer el endpoint de métricas. */
export function mensajeSinLectura(detalle: string): string {
  return [
    "🔴 No se puede leer el estado de la base de datos",
    "",
    `Detalle: ${detalle}`,
    "",
    "Si la app también está caída, la base se cayó.",
    "Qué hacer: cxc/docs/runbook-base-lenta.md",
  ].join("\n");
}
