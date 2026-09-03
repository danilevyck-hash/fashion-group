// ─────────────────────────────────────────────────────────────────────────────
// `npm run migrar <archivo.sql>` — aplicar UNA migración a Supabase desde la
// terminal, sin pasar por el portapapeles ni por el SQL Editor.
//
// Daniel, textual (3-sep-2026): «no quiero SQL en portapapeles, lo quiero en
// comando para terminal, así más fácil».
//
// 🔴 LO QUE NO CAMBIA: la confirmación humana. El 31-ago Daniel decidió que
// ese paso manual es el único control sobre cambios de esquema en una base
// con $3M. Este comando lo hace cómodo, no lo elimina: muestra qué va a
// correr, pregunta «¿Aplicar? [s/N]» y sin una «s» no toca nada.
//
// Cómo aplica: Management API de Supabase
//   POST https://api.supabase.com/v1/projects/<ref>/database/query
// con el token personal `SUPABASE_ACCESS_TOKEN`, que se lee ÚNICAMENTE de
// `.env.local` y nunca se imprime.
//
// Qué deja escrito: la migración Y su fila en
// `supabase_migrations.schema_migrations` — en la MISMA llamada, así una
// migración que falla no queda registrada y una que corre no queda sin
// registrar. La fila sigue el formato que ya tiene el registro (se leen las
// columnas reales antes de insertar), para que `supabase db push` la vea como
// aplicada y no la intente de nuevo.
//
// Este archivo es el núcleo, con las dependencias (red, teclado, pantalla,
// `.env.local`) inyectables para poder probarlo sin tocar producción.
// El CLI vive en `scripts/migrar.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const PROJECT_REF = "rspocgqhtpveytgbtler";
export const URL_QUERY = `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`;
export const DONDE_SACAR_TOKEN = "https://supabase.com/dashboard/account/tokens";
export const NOMBRE_VARIABLE = "SUPABASE_ACCESS_TOKEN";
export const TABLA_REGISTRO = "supabase_migrations.schema_migrations";

/** Las migraciones de la casa: `20260909120000_lo_que_hace.sql`. */
export const PATRON_NOMBRE = /^(\d{14})_(.+)\.sql$/;

/** Cuántas líneas de comentario inicial se muestran antes de preguntar. */
export const MAX_LINEAS_RESUMEN = 14;

export interface Opciones {
  /** Ruta al `.sql`, relativa a la raíz de `cxc/` o absoluta. */
  ruta: string;
  /** Muestra todo y no llama a la API. */
  dryRun?: boolean;
  /** Vuelve a correr una migración que ya está registrada. */
  forzar?: boolean;
  /** Raíz del proyecto (`cxc/`). Ahí se busca `.env.local`. */
  raiz: string;
}

export interface Deps {
  /** La red. En los tests, un doble que anota si lo llamaron. */
  fetch: typeof globalThis.fetch;
  /** Pregunta en la terminal y devuelve lo que se escribió. */
  preguntar: (texto: string) => Promise<string>;
  /** Una línea a la pantalla. */
  escribir: (linea: string) => void;
}

export type Resultado =
  | { ok: true; aplicada: boolean; version: string; motivo: string }
  | { ok: false; motivo: string };

/* ── Piezas puras ─────────────────────────────────────────────────────────── */

/** Lee `.env.local` a mano (sin dotenv) y devuelve solo la variable pedida. */
export function leerVariableDeEnvLocal(raiz: string, nombre: string): string | null {
  const archivo = path.join(raiz, ".env.local");
  if (!existsSync(archivo)) return null;
  for (const cruda of readFileSync(archivo, "utf8").split("\n")) {
    const linea = cruda.trim();
    if (!linea || linea.startsWith("#")) continue;
    const i = linea.indexOf("=");
    if (i < 0) continue;
    if (linea.slice(0, i).trim() !== nombre) continue;
    const valor = linea
      .slice(i + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    return valor || null;
  }
  return null;
}

export function resolverArchivo(ruta: string, raiz: string): string {
  return path.isAbsolute(ruta) ? ruta : path.resolve(raiz, ruta);
}

/** `20260909120000_x.sql` → `{ version: "20260909120000", nombre: "x" }`. */
export function partesDelNombre(archivo: string): { version: string; nombre: string } | null {
  const m = PATRON_NOMBRE.exec(path.basename(archivo));
  return m ? { version: m[1], nombre: m[2] } : null;
}

/** Las primeras líneas de comentario del SQL: qué hace la migración. */
export function resumenDelSql(sql: string, max = MAX_LINEAS_RESUMEN): string[] {
  const salida: string[] = [];
  for (const linea of sql.split("\n")) {
    const l = linea.trimEnd();
    if (!l.startsWith("--")) break;
    const texto = l.replace(/^--\s?/, "");
    const esBlanco = texto.trim() === "";
    const esRegla = !esBlanco && /^[\s─═\-]+$/.test(texto);
    const esTituloDeSeccion = /^[═─]{2,}\s*\S/.test(texto);
    // Las reglas dibujadas (────) y los blancos de arriba no dicen nada.
    if ((esRegla || esBlanco) && salida.length === 0) continue;
    // Una regla o un «══ DÓNDE ESTABA ══» después del primer bloque es donde
    // empieza el detalle: con el qué alcanza para decidir.
    if (esRegla || esTituloDeSeccion) break;
    salida.push(texto);
    if (salida.length >= max) break;
  }
  return salida;
}

export function tamanoLegible(bytes: number): string {
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

/** Etiqueta de dollar-quoting que no aparece en el texto. */
export function etiquetaSegura(texto: string): string {
  let etiqueta = "$migrar$";
  let n = 0;
  while (texto.includes(etiqueta)) etiqueta = `$migrar${++n}$`;
  return etiqueta;
}

export function citarConDolar(texto: string): string {
  const e = etiquetaSegura(texto);
  return `${e}${texto}${e}`;
}

/**
 * El INSERT en el registro, con las columnas que el registro REALMENTE tiene.
 * `version` es la clave; `name` y `statements` van solo si existen.
 */
export function sqlDeRegistro(
  columnas: string[],
  version: string,
  nombre: string,
  sql: string,
): string {
  const cols = ["version"];
  const vals = [`'${version}'`];
  if (columnas.includes("name")) {
    cols.push("name");
    vals.push(citarConDolar(nombre));
  }
  if (columnas.includes("statements")) {
    cols.push("statements");
    vals.push(`ARRAY[${citarConDolar(sql)}]`);
  }
  return (
    `INSERT INTO ${TABLA_REGISTRO} (${cols.join(", ")})\n` +
    `VALUES (${vals.join(", ")})\n` +
    `ON CONFLICT (version) DO NOTHING;`
  );
}

/** Migración + registro en UNA llamada: o entran los dos o no entra ninguno. */
export function sqlCompleto(sqlMigracion: string, sqlRegistro: string): string {
  return `${sqlMigracion}\n;\n${sqlRegistro}\n`;
}

/* ── La API ───────────────────────────────────────────────────────────────── */

type Fila = Record<string, unknown>;

async function consultar(
  deps: Deps,
  token: string,
  query: string,
): Promise<{ ok: true; filas: Fila[] } | { ok: false; status: number; cuerpo: string }> {
  const r = await deps.fetch(URL_QUERY, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const cuerpo = await r.text();
  if (!r.ok) return { ok: false, status: r.status, cuerpo };
  let filas: Fila[] = [];
  try {
    const json = JSON.parse(cuerpo);
    if (Array.isArray(json)) filas = json as Fila[];
  } catch {
    /* un cuerpo vacío o no-JSON en un 200 es «sin filas» */
  }
  return { ok: true, filas };
}

/* ── El flujo ─────────────────────────────────────────────────────────────── */

export async function migrar(op: Opciones, deps: Deps): Promise<Resultado> {
  const { escribir } = deps;
  const falla = (motivo: string): Resultado => {
    escribir(`❌ ${motivo}`);
    return { ok: false, motivo };
  };

  // 1. El archivo
  const archivo = resolverArchivo(op.ruta, op.raiz);
  if (!existsSync(archivo)) {
    return falla(`No encontré el archivo. Busqué en:\n   ${archivo}`);
  }
  const partes = partesDelNombre(archivo);
  if (!partes) {
    return falla(
      `El nombre no sigue el formato de las migraciones (14 dígitos, guion bajo, nombre, .sql):\n` +
        `   ${path.basename(archivo)}\n` +
        `   Sin ese timestamp no hay versión que registrar.`,
    );
  }
  const sql = readFileSync(archivo, "utf8");
  if (!sql.trim()) return falla(`El archivo está vacío: ${archivo}`);
  const bytes = statSync(archivo).size;

  // 2. Qué se va a correr
  escribir("");
  escribir(`📄 ${path.basename(archivo)}`);
  escribir(`   ${tamanoLegible(bytes)} · ${sql.split("\n").length} líneas · versión ${partes.version}`);
  const resumen = resumenDelSql(sql);
  if (resumen.length) {
    escribir("");
    for (const l of resumen) escribir(`   ${l}`);
  } else {
    escribir("   (sin comentario inicial que diga qué hace)");
  }
  escribir("");

  // 3. El token — solo de .env.local, nunca se imprime
  const token = leerVariableDeEnvLocal(op.raiz, NOMBRE_VARIABLE);
  if (op.dryRun) {
    escribir(`🔑 Token ${NOMBRE_VARIABLE}: ${token ? "presente en .env.local" : "FALTA en .env.local"}`);
    escribir("🧪 --dry-run: no se llamó a la API. Nada cambió.");
    return { ok: true, aplicada: false, version: partes.version, motivo: "dry-run" };
  }
  if (!token) {
    return falla(
      `Falta ${NOMBRE_VARIABLE} en .env.local (${path.join(op.raiz, ".env.local")}).\n` +
        `   Genera uno en ${DONDE_SACAR_TOKEN} y agrégalo como:\n` +
        `   ${NOMBRE_VARIABLE}=<el token>`,
    );
  }

  // 4. Cómo está el registro hoy
  const columnasRes = await consultar(
    deps,
    token,
    `SELECT column_name FROM information_schema.columns ` +
      `WHERE table_schema = 'supabase_migrations' AND table_name = 'schema_migrations' ` +
      `ORDER BY ordinal_position`,
  );
  if (!columnasRes.ok) {
    return falla(`No pude leer el registro de migraciones (HTTP ${columnasRes.status}):\n${columnasRes.cuerpo}`);
  }
  const columnas = columnasRes.filas.map((f) => String(f.column_name));
  if (!columnas.includes("version")) {
    return falla(`El registro ${TABLA_REGISTRO} no existe o no tiene columna version.`);
  }
  const conNombre = columnas.includes("name");
  const ultimasRes = await consultar(
    deps,
    token,
    `SELECT version${conNombre ? ", name" : ""}, version = '${partes.version}' AS es_esta ` +
      `FROM ${TABLA_REGISTRO} ` +
      `WHERE version IN (SELECT version FROM ${TABLA_REGISTRO} ORDER BY version DESC LIMIT 3) ` +
      `   OR version = '${partes.version}' ` +
      `ORDER BY version DESC`,
  );
  if (!ultimasRes.ok) {
    return falla(`No pude leer el registro de migraciones (HTTP ${ultimasRes.status}):\n${ultimasRes.cuerpo}`);
  }
  escribir(`📒 Últimas registradas (${columnas.join(", ")}):`);
  for (const f of ultimasRes.filas) {
    const marca = f.es_esta ? "  ← esta" : "";
    escribir(`   ${String(f.version)}${conNombre ? `  ${String(f.name ?? "")}` : ""}${marca}`);
  }
  const yaRegistrada = ultimasRes.filas.some((f) => f.es_esta === true);
  if (yaRegistrada && !op.forzar) {
    escribir("");
    escribir(`⚠️  Ya está registrada como aplicada. No la volví a correr.`);
    escribir(`   Si de verdad quieres repetirla: npm run migrar ${op.ruta} -- --forzar`);
    return { ok: true, aplicada: false, version: partes.version, motivo: "ya registrada" };
  }
  if (yaRegistrada && op.forzar) {
    escribir("");
    escribir(`⚠️  Ya está registrada; con --forzar se corre de nuevo igual.`);
  }

  // 5. La confirmación humana. Sin «s», no se toca nada.
  escribir("");
  const respuesta = (await deps.preguntar("¿Aplicar? [s/N] ")).trim().toLowerCase();
  if (!["s", "si", "sí"].includes(respuesta)) {
    escribir("Cancelado. Nada cambió.");
    return { ok: true, aplicada: false, version: partes.version, motivo: "cancelada" };
  }

  // 6. Migración + registro, juntos
  const registro = sqlDeRegistro(columnas, partes.version, partes.nombre, sql);
  const res = await consultar(deps, token, sqlCompleto(sql, registro));
  if (!res.ok) {
    escribir("");
    escribir(`❌ Postgres respondió (HTTP ${res.status}):`);
    escribir(res.cuerpo);
    return { ok: false, motivo: `HTTP ${res.status}` };
  }
  escribir("");
  escribir(`✅ Aplicada y registrada como ${partes.version}${yaRegistrada ? " (ya figuraba en el registro)" : ""}`);
  return { ok: true, aplicada: true, version: partes.version, motivo: "aplicada" };
}
