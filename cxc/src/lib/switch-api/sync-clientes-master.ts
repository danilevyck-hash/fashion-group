// ─────────────────────────────────────────────────────────────────────────────
// Refresco de clientes_master (datos fiscales) desde switch_clientes.
//
// Extraído del route /api/cron/sync-clientes-master (antes inline) para poder
// invocarlo IN-PROCESS desde la reconciliación cuando el cron diario se pierde
// (scheduler de Vercel). El route sigue siendo el caller de producción; la
// reconciliación es el caller de recuperación. La lógica vive aquí, una sola vez.
//
// 🩸 EL HUECO QUE TENÍA, medido el 8-ago-2026 — dos cosas distintas:
//
//   1. EL NOMBRE LO ELEGÍA EL CALENDARIO DE CRONS. El dedup por código se
//      quedaba con la fila de `synced_at` más reciente, o sea con la empresa
//      cuyo cron corrió último (joystep, 05:42). Como cada empresa de Switch
//      lleva su PROPIA numeración, hay 4 códigos del grupo con más de un nombre
//      —D-134, D-26, D-170 y TCKCTA— y para esos el resultado no era una función
//      de los datos: mover una entrada de vercel.json 15 minutos habría
//      renombrado clientes en silencio. Ahora la regla es explícita y vive en
//      `lib/clientes/nombre-canonico` (gana el nombre que más empresas usan),
//      que reproduce EXACTAMENTE lo que hay hoy en producción.
//   2. SE PAGINABA POR UNA COLUMNA QUE SE MUEVE (`synced_at`, que el sync
//      reescribe) → filas salteadas o repetidas entre páginas, sin error. Ahora
//      va por `id` con `leerTodoPaginado`, que además verifica contra el COUNT.
//
// QUÉ REFRESCA (SOLO fiscal): nombre, razon_social, identificacion (RUC), dv.
// NUNCA toca telefono/celular/email/notas/provincia — editables en la app; el
// payload uniforme sin esas columnas garantiza que el UPSERT (merge-duplicates)
// solo actualice las que mandamos.
//
// FUENTE: lee de NUESTRA DB (switch_clientes), NO pega al API de Switch → cero
// riesgo de colisión de sesión única.
//
// NO registra heartbeat ni logCronError: eso es responsabilidad del caller
// (route de producción o reconciliación), que mapea este resultado.
// ─────────────────────────────────────────────────────────────────────────────

import { supabaseServer } from "@/lib/supabase-server";
import { limpiarDireccionSwitch } from "@/lib/clientes/direccion-switch";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { EMPRESAS_DEL_GRUPO } from "@/lib/clientes/mundos";
import {
  esCodigoAusente,
  fechaAusenteDesde,
  MAX_FRACCION_AUSENTES,
} from "@/lib/clientes/ausentes";
import {
  elegirNombreCanonico,
  codigosAmbiguos,
  type CandidatoNombre,
  type CodigoAmbiguo,
} from "@/lib/clientes/nombre-canonico";

// N2: UPPER + quita [.,] + colapsa espacios (mismo algoritmo que cxc / ventas).
const N2 = (s: string | null | undefined): string =>
  (s ?? "").trim().toUpperCase().replace(/[.,]/g, "").replace(/\s+/g, " ").trim();

const cleanText = (s: string | null | undefined): string | null => {
  const v = (s ?? "").trim();
  return v === "" ? null : v;
};

/**
 * La dirección de Switch de un código, mirando TODAS sus filas de empresa.
 *
 * Desempate DETERMINISTA (la primera alfabéticamente): es el MISMO criterio del
 * backfill de la migración 20260930120000, así que la primera corrida del sync
 * después de aplicarla no reescribe nada. Un desempate por «la empresa cuyo
 * cron corrió último» es el error que ya se pagó con el NOMBRE del cliente.
 *
 * 🔴 Este dato se MUESTRA en la ficha y **no alimenta Guías** — ver
 * `lib/clientes/direccion-switch.ts`.
 */
function direccionDeLasFilas(filas: SwitchClienteRow[]): string | null {
  const candidatas = filas
    .map((f) => limpiarDireccionSwitch(f.raw_data?.direccion))
    .filter((d): d is string => !!d)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  return candidatas[0] ?? null;
}

/** El MISMO renglón sin `direccion_switch`, para reintentar cuando la columna
 *  todavía no existe. Se quita la columna, no se manda `null`: mandar null
 *  BORRARÍA la dirección de todos si la columna sí existiera. */
function sinDireccion(fila: MasterUpsertRow): MasterUpsertRow {
  const copia = { ...fila };
  delete copia.direccion_switch;
  return copia;
}

interface SwitchClienteRow {
  empresa_key: string;
  codigo: string | null;
  nombre: string | null;
  razonsocial: string | null;
  identificacion: string | null;
  raw_data: Record<string, unknown> | null;
  synced_at: string | null;
  /** false = Switch ya no lo manda en esa empresa (lo escribe sync-empresa con
   *  guard de lista completa). Ausente del select de respaldo si la DDL
   *  20260723110000 no corrió — y entonces NO se marca a nadie. */
  activo?: boolean | null;
  ausente_desde?: string | null;
}

interface MasterUpsertRow {
  codigo: string;
  nombre: string;
  nombre_normalized: string;
  razon_social: string | null;
  identificacion: string | null;
  dv: string | null;
  /** 🔴 ESPEJO de Switch, y la ÚNICA columna de esta familia que el sync SÍ
   *  refresca (telefono/celular/email/notas/contacto los escribe la gente y
   *  nunca se pisan). ⚠️ **No alimenta los destinos de Guías** — ver
   *  `lib/clientes/direccion-switch.ts` y la migración 20260930120000.
   *  Ausente mientras esa DDL no corra: el upsert reintenta sin ella. */
  direccion_switch?: string | null;
  last_synced_at: string;
}

export interface ClientesMasterResult {
  ok: boolean;
  source_rows: number;
  distinct_codigos: number;
  upserted: number;
  skipped_sin_nombre: number;
  synced_at: string;
  /**
   * Códigos que llevan MÁS DE UN nombre entre las empresas del grupo. No es un
   * error del sync: es un dato de Switch que hay que corregir en su panel. Antes
   * el sync elegía uno y se callaba; ahora se ven.
   */
  codigos_ambiguos: CodigoAmbiguo[];
  /**
   * Códigos que NINGUNA de las 6 empresas del grupo manda ya (todas sus filas
   * de switch_clientes con activo=false). Se marcan con `ausente_desde` en
   * clientes_master para que dejen de ofrecerse en los selectores — la fila NO
   * se borra: guías y facturas viejas siguen mostrando su nombre.
   */
  ausentes: string[];
  /** Cuántos de esos quedaron marcados en esta corrida (0 si ya lo estaban). */
  ausentes_marcados: number;
  /** Cuántos volvieron a la vida (Switch los mandó de nuevo → marca en null). */
  revividos: number;
  /** Presente si la pasada de ausentes NO corrió, con el porqué. El resto del
   *  sync (upsert fiscal) no se ve afectado. */
  marca_ausentes_omitida?: string;
  /** Presente solo si ok=false. */
  error?: string;
}

/**
 * Refresca clientes_master desde switch_clientes. Tolerante: nunca lanza —
 * devuelve `{ ok:false, error }` para que el caller decida cómo reportar.
 */
export async function syncClientesMaster(): Promise<ClientesMasterResult> {
  const now = new Date().toISOString();
  const empty = {
    source_rows: 0,
    distinct_codigos: 0,
    upserted: 0,
    skipped_sin_nombre: 0,
    synced_at: now,
    codigos_ambiguos: [] as CodigoAmbiguo[],
    ausentes: [] as string[],
    ausentes_marcados: 0,
    revividos: 0,
  };

  // 1. Traer los clientes del espejo de Switch, paginado.
  //
  //    🔴 SOLO LAS 6 DEL GRUPO. `clientes_master` es el directorio del GRUPO, y
  //    esto se pide por INCLUSIÓN (`EMPRESAS_DEL_GRUPO`), nunca excluyendo a las
  //    dos que sobran: si mañana entra una empresa nueva al sistema, el default
  //    seguro es que NO contamine el directorio hasta que alguien la agregue a
  //    mano en `lib/clientes/mundos`. Es la misma regla que ya gobierna
  //    `/clientes`, Guías y los selectores.
  //
  //    · american_classic: clientes retail ACS (la fidelización lee
  //      switch_clientes directo), NO directorio B2B — decisión Daniel 4-jul-2026.
  //      Además evita el O(N×M) del trigger trg_refresh_wholesale sobre ventas_raw.
  //    · confecciones_boston: 🔴 EL INVARIANTE MÁS FUERTE DEL REPO
  //      (`docs/postmortems/boston-cxc.md`) — *"Boston NUNCA se mezcla con el CXC
  //      del grupo: ni una fila, ni un total, ni un export, ni un badge"*. Daniel,
  //      textual (2-sep-2026): *"Boston es estricto para ver sus ventas y tiene
  //      hasta su propio CXC, no quiero que se mezcle en mi grupo"*. Sus clientes
  //      viven en `switch_clientes` (que sí es por empresa) y se leen por su
  //      puerta propia: `/api/boston/clientes` y `/api/cxc/boston`. Ninguna
  //      superficie de Boston lee `clientes_master` — está auditado.
  //
  //    🩸 ESTA EXCLUSIÓN FALTABA Y COSTÓ $2,55 MILLONES DE VENTA INVENTADA.
  //    El 28-jul-2026 a las 07:01 UTC este sync metió 4.910 clientes de Boston en
  //    `clientes_master`. La tabla NO tiene columna de empresa —una fila por
  //    CÓDIGO, compartida por las 6— así que adentro un cliente de Boston es
  //    indistinguible de uno del grupo. Las vistas del ranking de Ventas resuelven
  //    el código POR NOMBRE, y 24 nombres quedaron repetidos entre los dos mundos
  //    (`CITY MALL DAVID` = `D-24` del grupo y `83` de Boston): cada factura de
  //    esos clientes se fue por las DOS filas y se contó DOS VECES. Medido el
  //    2-sep-2026: el ranking publicaba $7.911.210,10 contra $5.357.597,39 reales.
  //    El coletazo ya se había parchado DOS veces —Directorio (#387) y buscador
  //    ⌘K (#388), el 30-jul— y nadie miró la tercera superficie. Por eso el
  //    arreglo va acá, en la ÚNICA puerta de escritura, y no en cada pantalla.
  //
  //    🩸 SE PAGINA POR `id`, NO POR `synced_at` (8-ago-2026). Antes el orden era
  //    `synced_at DESC` — una columna que el sync de Switch REESCRIBE. Paginar
  //    por una llave que se mueve entre una página y la siguiente hace que filas
  //    se salteen o se repitan, en silencio y sin error. `leerTodoPaginado`
  //    además VERIFICA contra un `count: "exact"` y revienta si no cuadra, en
  //    vez de seguir con menos.
  //    Se piden también `activo` y `ausente_desde` (los escribe sync-empresa
  //    cuando Switch deja de mandar un cliente) para la pasada de AUSENTES de
  //    más abajo. Si esa DDL (20260723110000) no corrió en este entorno, el
  //    select de respaldo va sin las dos columnas y la pasada se OMITE — el
  //    refresco fiscal no depende de ellas.
  const leerEspejo = (conAusencia: boolean) =>
    leerTodoPaginado<SwitchClienteRow>(
      "switch_clientes (maestro de clientes)",
      (pedirCount, from, to) =>
        supabaseServer
          .from("switch_clientes")
          .select(
            "empresa_key, codigo, nombre, razonsocial, identificacion, raw_data, synced_at" +
              (conAusencia ? ", activo, ausente_desde" : ""),
            pedirCount ? { count: "exact" } : {},
          )
          .in("empresa_key", [...EMPRESAS_DEL_GRUPO])
          .order("id", { ascending: true })
          .range(from, to),
    );

  let rows: SwitchClienteRow[];
  try {
    rows = await leerEspejo(true);
  } catch {
    // Columna `activo`/`ausente_desde` pendiente u otro rechazo del select
    // largo: el refresco fiscal tiene que seguir andando igual que siempre.
    try {
      rows = await leerEspejo(false);
    } catch (e) {
      return { ok: false, ...empty, error: e instanceof Error ? e.message : String(e) };
    }
  }

  // 2. Agrupar por codigo: switch_clientes tiene una fila por (empresa, cliente).
  //    Los datos FISCALES (RUC, razón social, dv) son los mismos en todas, pero
  //    el NOMBRE no siempre — ver `lib/clientes/nombre-canonico`.
  const byCodigo = new Map<string, SwitchClienteRow[]>();
  for (const row of rows) {
    const codigo = cleanText(row.codigo);
    if (!codigo) continue;
    const lista = byCodigo.get(codigo);
    if (lista) lista.push(row);
    else byCodigo.set(codigo, [row]);
  }

  // 2b. Los códigos que llevan más de un nombre. No frenan el sync: se reportan.
  const ambiguos = codigosAmbiguos(
    new Map<string, CandidatoNombre[]>([...byCodigo].map(([c, rs]) => [c, rs])),
  );

  // 3. Armar payload uniforme (SOLO campos fiscales).
  const payload: MasterUpsertRow[] = [];
  let skippedSinNombre = 0;
  for (const [codigo, filas] of byCodigo) {
    // TCKCTA = pseudo-cliente de contado (varios nombres por empresa); lo
    // normalizamos igual que el seed para que la ficha lo muestre consistente.
    //
    // Para el resto, el nombre lo decide una REGLA sobre los datos (el que más
    // empresas comparten), no el reloj: antes ganaba la empresa cuyo cron había
    // corrido último, así que mover una entrada de vercel.json renombraba
    // clientes en silencio.
    const nombre = codigo === "TCKCTA" ? "VENTAS LOCAL" : elegirNombreCanonico(filas) ?? "";
    if (!nombre) {
      skippedSinNombre++;
      continue;
    }

    // Los campos fiscales sí son los mismos en todas las empresas: se toma la
    // primera fila que los tenga, para no perderlos si una empresa los deja en
    // blanco.
    const row =
      filas.find((f) => cleanText(f.identificacion) || cleanText(f.razonsocial)) ?? filas[0];

    const dvRaw = row.raw_data && typeof row.raw_data.dv === "string" ? row.raw_data.dv : null;

    payload.push({
      codigo,
      nombre,
      nombre_normalized: N2(nombre),
      razon_social: cleanText(row.razonsocial),
      identificacion: cleanText(row.identificacion),
      dv: cleanText(dvRaw),
      // La dirección que manda Switch. Se guarda para MOSTRARLA en la ficha;
      // 🔴 no entra a Guías por ningún lado.
      //
      // ⚠️ Se busca en TODAS las filas del código, no solo en `row`: `row` se
      // eligió por tener RUC o razón social, y la empresa que trae esos dos no
      // es necesariamente la que trae la dirección. El desempate es la primera
      // alfabéticamente — determinista, el MISMO criterio que el backfill de la
      // migración, así que el sync no pisa lo que la migración escribió.
      direccion_switch: direccionDeLasFilas(filas),
      last_synced_at: now,
    });
  }

  const sourceRows = rows.length;

  if (payload.length === 0) {
    return {
      ok: false,
      ...empty,
      source_rows: sourceRows,
      distinct_codigos: byCodigo.size,
      codigos_ambiguos: ambiguos,
      error: "switch_clientes vacío o sin filas válidas",
    };
  }

  // 4. UPSERT onConflict=codigo. Al no incluir telefono/celular/email/notas/
  //    contacto/provincia en el payload, merge-duplicates deja esas columnas
  //    intactas — son las que escribe la gente.
  //
  //    🔴 `direccion_switch` PUEDE NO EXISTIR TODAVÍA (migración 20260930120000,
  //    la corre Daniel). Si el upsert la rechaza, se reintenta el MISMO lote sin
  //    esa columna: el refresco fiscal de los 150 clientes no puede caerse
  //    entero por una columna nueva que todavía no está.
  const BATCH = 500;
  let upserted = 0;
  let sinColumnaDireccion = false;
  for (let i = 0; i < payload.length; i += BATCH) {
    const slice = payload.slice(i, i + BATCH);
    const escribir = (conDireccion: boolean) =>
      supabaseServer
        .from("clientes_master")
        .upsert(conDireccion ? slice : slice.map(sinDireccion), {
          onConflict: "codigo",
          ignoreDuplicates: false,
        });
    let { error: upErr } = await escribir(!sinColumnaDireccion);
    if (upErr && !sinColumnaDireccion) {
      console.error(`[sync clientes_master] WARNING direccion_switch (¿DDL 20260930120000 pendiente?): ${upErr.message}`);
      sinColumnaDireccion = true;
      ({ error: upErr } = await escribir(false));
    }
    if (upErr) {
      return {
        ok: false,
        ...empty,
        source_rows: sourceRows,
        distinct_codigos: byCodigo.size,
        upserted,
        skipped_sin_nombre: skippedSinNombre,
        codigos_ambiguos: ambiguos,
        error: upErr.message,
      };
    }
    upserted += slice.length;
  }

  // 5. AUSENTES DE SWITCH (4-sep-2026, aprobado por Daniel). Un cliente que
  //    NINGUNA de las 6 empresas manda ya se marca con `ausente_desde` para que
  //    deje de ofrecerse en los selectores; si Switch lo vuelve a mandar, se
  //    desmarca solo. La fila NUNCA se borra.
  //
  //    🔴 LA PROTECCIÓN, en capas — un fallo de Switch no puede vaciar el
  //    directorio:
  //      · `activo=false` solo lo escribe sync-empresa con una lista de Switch
  //        COMPLETA y no vacía, de una llamada que salió bien (su guard
  //        `listaCompleta`). Una corrida fallida o a medias no cambia `activo`.
  //      · Si la lectura de `switch_clientes` de arriba falló, ya devolvimos
  //        ok:false SIN llegar acá: no se marca a nadie.
  //      · Sin datos de `activo` (DDL pendiente, select de respaldo) la pasada
  //        entera se OMITE — marcar o desmarcar desde la ignorancia es peor
  //        que no hacer nada.
  //      · Y el freno de MAX_FRACCION_AUSENTES: si "ausente" saliera masivo,
  //        eso es un dato roto aguas arriba, no una purga real de clientes.
  //
  //    Cualquier error al escribir la marca NO tumba el sync (la migración
  //    20260919120000 puede no haber corrido): se reporta y el refresco fiscal
  //    queda igual que siempre.
  const resultadoAusentes = await marcarAusentesEnMaster(byCodigo, now);

  return {
    ok: true,
    source_rows: sourceRows,
    distinct_codigos: byCodigo.size,
    upserted,
    skipped_sin_nombre: skippedSinNombre,
    synced_at: now,
    codigos_ambiguos: ambiguos,
    ...resultadoAusentes,
  };
}

interface ResultadoAusentes {
  ausentes: string[];
  ausentes_marcados: number;
  revividos: number;
  marca_ausentes_omitida?: string;
}

/**
 * Marca en `clientes_master.ausente_desde` los códigos que TODAS sus filas de
 * `switch_clientes` (entre las 6 del grupo) declaran `activo = false`, y
 * desmarca los que volvieron. Ver el bloque 5 de `syncClientesMaster` para las
 * capas de protección. Nunca lanza: reporta.
 */
async function marcarAusentesEnMaster(
  byCodigo: ReadonlyMap<string, SwitchClienteRow[]>,
  now: string,
): Promise<ResultadoAusentes> {
  // Sin ni UNA fila con `activo` boolean no sabemos nada: ni marcar ni revivir.
  let hayDatoDeActivo = false;
  for (const filas of byCodigo.values()) {
    if (filas.some((f) => typeof f.activo === "boolean")) {
      hayDatoDeActivo = true;
      break;
    }
  }
  if (!hayDatoDeActivo) {
    return {
      ausentes: [],
      ausentes_marcados: 0,
      revividos: 0,
      marca_ausentes_omitida: "switch_clientes sin datos de activo (¿DDL 20260723110000 pendiente?)",
    };
  }

  const ausentes: string[] = [];
  const vivos: string[] = [];
  const fechaPorCodigo = new Map<string, string>();
  for (const [codigo, filas] of byCodigo) {
    if (esCodigoAusente(filas)) {
      ausentes.push(codigo);
      fechaPorCodigo.set(codigo, fechaAusenteDesde(filas) ?? now);
    } else {
      vivos.push(codigo);
    }
  }

  // 🔴 El freno: una pasada que marcaría a media lista no marca a NADIE.
  if (ausentes.length > byCodigo.size * MAX_FRACCION_AUSENTES) {
    const msg = `freno: ${ausentes.length} de ${byCodigo.size} códigos saldrían ausentes (>${Math.round(MAX_FRACCION_AUSENTES * 100)}%) — dato sospechoso aguas arriba, no se marca a nadie`;
    console.error(`[sync clientes_master] WARNING ausentes: ${msg}`);
    return { ausentes, ausentes_marcados: 0, revividos: 0, marca_ausentes_omitida: msg };
  }

  let marcados = 0;
  let revividos = 0;

  // Marcar — solo filas todavía sin marca (`ausente_desde IS NULL`): una marca
  // ya puesta no se pisa, así la fecha que ve la ficha es estable. Se agrupa
  // por fecha para hacer una escritura por valor (en la práctica, 1 o 2).
  const porFecha = new Map<string, string[]>();
  for (const codigo of ausentes) {
    const fecha = fechaPorCodigo.get(codigo) ?? now;
    const lista = porFecha.get(fecha);
    if (lista) lista.push(codigo);
    else porFecha.set(fecha, [codigo]);
  }
  for (const [fecha, codigos] of porFecha) {
    const { data, error } = await supabaseServer
      .from("clientes_master")
      .update({ ausente_desde: fecha })
      .in("codigo", codigos)
      .is("ausente_desde", null)
      .select("codigo");
    if (error) {
      console.error(`[sync clientes_master] WARNING marcar ausentes (¿DDL 20260919120000 pendiente?): ${error.message}`);
      return {
        ausentes,
        ausentes_marcados: marcados,
        revividos,
        marca_ausentes_omitida: error.message,
      };
    }
    marcados += data?.length ?? 0;
  }

  // Revivir — Switch lo mandó de nuevo (alguna empresa lo declara vivo): la
  // marca se quita sola, sin que nadie haga nada.
  if (vivos.length > 0) {
    const { data, error } = await supabaseServer
      .from("clientes_master")
      .update({ ausente_desde: null })
      .in("codigo", vivos)
      .not("ausente_desde", "is", null)
      .select("codigo");
    if (error) {
      console.error(`[sync clientes_master] WARNING revivir presentes (¿DDL 20260919120000 pendiente?): ${error.message}`);
      return {
        ausentes,
        ausentes_marcados: marcados,
        revividos,
        marca_ausentes_omitida: error.message,
      };
    }
    revividos = data?.length ?? 0;
  }

  return { ausentes, ausentes_marcados: marcados, revividos };
}
