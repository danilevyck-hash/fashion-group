// ─────────────────────────────────────────────────────────────────────────────
// scripts/lib/backup-inventario.mjs — lógica PURA (sin red, sin credenciales)
// que decide si una carpeta de fecha del backup es restaurable.
//
// Por qué existe: un backup de un día lo escriben DOS invocaciones distintas de
// /api/cron/backup —core (meta.json, 57 datasets) y ?grupo=switch
// (meta-switch.json, 8 datasets)— sobre la MISMA carpeta `<fecha>/`. Con una
// sola de las dos, el día no se restaura entero; sin ninguna, no se restaura
// nada. `restore.mjs --list` listaba las carpetas de fecha a secas, así que una
// fecha a medias se veía idéntica a una sana. El 25-jul-2026 eso dio
// exactamente el peor resultado posible: `--list` respondía "2026-07-25" (se ve
// sano) y el restore moría con `404 NoSuchKey` en meta.json.
//
// Se separó del script para poder testearla en vitest sin tocar R2 ni Supabase
// (src/__tests__/scripts/backup-inventario.test.ts). El script solo aporta el
// I/O: listar la carpeta y bajar los metas.
// ─────────────────────────────────────────────────────────────────────────────

/** Archivo meta de cada grupo del backup dentro de `<fecha>/`. */
export const GRUPOS_META = {
  core: "meta.json",
  switch: "meta-switch.json",
};

/**
 * Agrupa keys de R2 (`data/<fecha>/<archivo>`) en Map<fecha, Set<archivo>>.
 * Ignora las keys planas heredadas (`data/<tabla>.ndjson.gz`, formato anterior
 * a los paths con fecha): no pertenecen a ninguna fecha y no son restaurables
 * por sí solas — no hay meta que diga cuántas filas debería traer cada una.
 */
export function agruparKeysPorFecha(keys) {
  const out = new Map();
  for (const key of keys) {
    const m = key.match(/^data\/(\d{4}-\d{2}-\d{2})\/(.+)$/);
    if (!m) continue;
    if (!out.has(m[1])) out.set(m[1], new Set());
    out.get(m[1]).add(m[2]);
  }
  return out;
}

/**
 * Diagnóstico de una fecha.
 * @param fecha   YYYY-MM-DD
 * @param archivos Set con los NOMBRES de archivo presentes en esa carpeta.
 * @param metas   { core: <meta.json parseado|null>, switch: <…|null> }.
 *                null = el archivo existe pero no se pudo bajar/parsear.
 */
export function diagnosticarFecha(fecha, archivos, metas = {}) {
  const grupos = [];
  const faltan = [];
  const datasetsPorGrupo = {};
  const datasetsFaltantes = [];
  const formatosMalos = [];
  const conErrores = [];

  for (const [grupo, metaFile] of Object.entries(GRUPOS_META)) {
    if (!archivos.has(metaFile)) {
      faltan.push({ grupo, metaFile, motivo: "sin meta" });
      continue;
    }
    const meta = metas[grupo];
    if (!meta) {
      faltan.push({ grupo, metaFile, motivo: "meta ilegible" });
      continue;
    }
    if (meta.format !== "v2-ndjson-gz") {
      formatosMalos.push({ grupo, format: meta.format || "v1 (backup.json monolítico)" });
    }
    if (meta.errores?.length) {
      conErrores.push({ grupo, files: meta.errores.map((e) => e.file) });
    }
    grupos.push(grupo);
    const ds = meta.datasets || [];
    datasetsPorGrupo[grupo] = ds.length;
    for (const d of ds) {
      if (!archivos.has(`${d.file}.ndjson.gz`)) datasetsFaltantes.push(`${grupo}:${d.file}`);
    }
  }

  const datasets = Object.values(datasetsPorGrupo).reduce((s, n) => s + n, 0);
  // Estados, de peor a mejor. DAÑADO gana a PARCIAL: que falten archivos de un
  // grupo QUE SÍ corrió es un backup roto; que falte un grupo entero es un
  // backup a medias (los días anteriores al split core/switch de jul-2026 son
  // legítimamente PARCIAL — el grupo switch todavía no existía).
  const estado =
    grupos.length === 0
      ? "INSERVIBLE"
      : datasetsFaltantes.length || formatosMalos.length
        ? "DAÑADO"
        : faltan.length
          ? "PARCIAL"
          : "OK";
  return {
    fecha,
    estado,
    grupos,
    faltan,
    datasets,
    datasetsPorGrupo,
    datasetsFaltantes,
    formatosMalos,
    conErrores,
    /** Se puede restaurar ALGO (al menos un grupo con su meta). */
    restaurable: grupos.length > 0,
    /** Se puede restaurar el día ENTERO. */
    completo: estado === "OK",
  };
}

/** Problemas de un diagnóstico, en texto para humanos. */
export function problemasDe(d) {
  const out = [];
  for (const f of d.faltan) out.push(`falta el grupo ${f.grupo} (${f.metaFile}: ${f.motivo})`);
  for (const f of d.formatosMalos) out.push(`grupo ${f.grupo} en formato "${f.format}" (no restaurable)`);
  if (d.datasetsFaltantes.length) {
    const muestra = d.datasetsFaltantes.slice(0, 5).join(", ");
    const extra = d.datasetsFaltantes.length > 5 ? ` (+${d.datasetsFaltantes.length - 5})` : "";
    out.push(`sin archivo: ${muestra}${extra}`);
  }
  return out;
}

/** Línea de `--list` para un diagnóstico. Honesta: nunca muestra "disponible"
 *  una fecha que no se puede restaurar. */
export function formatearFecha(d) {
  const detalle = d.grupos.length
    ? `${d.datasets} datasets (${d.grupos.map((g) => `${g} ${d.datasetsPorGrupo[g]}`).join(", ")})`
    : "0 datasets";
  const linea = `  ${d.fecha}  ${d.estado.padEnd(10)} ${detalle}`;
  const problemas = problemasDe(d);
  return problemas.length ? `${linea} — ${problemas.join("; ")}` : linea;
}

/**
 * Fecha por defecto cuando no se pasa --date: la MÁS NUEVA COMPLETA. Si ninguna
 * lo está, la más nueva restaurable (el caller avisa). Si ninguna lo es, null.
 * Elegir "la más nueva" a secas es lo que hacía que el restore por defecto
 * apuntara a una carpeta a medias.
 */
export function elegirFechaPorDefecto(diags) {
  const orden = [...diags].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  const completa = orden.find((d) => d.completo);
  if (completa) return { fecha: completa.fecha, completa: true };
  const parcial = orden.find((d) => d.restaurable);
  if (parcial) return { fecha: parcial.fecha, completa: false };
  return null;
}
