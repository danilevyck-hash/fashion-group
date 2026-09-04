/**
 * CANDADO — las anotaciones del CXC NO se comparten entre carteras.
 *
 * ─── LA REGLA, dicha por Daniel (12-ago-2026), textual ───────────────────────
 *   "debe de ser cxc de fashion group y otro aparte de boston, no deben de ni
 *    convivir juntos."
 * Y sobre CITY MALL PASO CANOA, que existe en las dos:
 *   "es la misma persona, pero no lo quiero ver en fashion group porque no
 *    tiene el mismo codigo"
 * → eligió SEPARAR: cada cartera con sus propias notas y estrellas.
 *
 * ─── QUÉ VIGILA ESTE ARCHIVO ────────────────────────────────────────────────
 * 1. BARRIDO por `src/` — ningún archivo fuera de `lib/cxc/anotaciones.ts`
 *    toca las 3 tablas. Sin esto, el route número seis que alguien escriba
 *    mañana nace sin cartera (el modo de fallo del #522: dos copias del mismo
 *    criterio, una se actualizó y la otra no).
 * 2. BARRIDO por las 5 rutas que las exponen — todas exigen la cartera.
 * 3. COMPORTAMIENTO contra un doble EN MEMORIA de PostgREST, en los DOS
 *    estados de la base: con la columna `cartera` y sin ella. ⚠️ Desde el
 *    3-sep-2026 el estado "sin columna" ya no degrada: la tolerancia a la DDL
 *    se retiró (la columna existe desde 20260813120000) y TODO falla visible.
 * 4. La MIGRACIÓN — que las llaves únicas lleven la cartera adentro y que
 *    ninguna fila se pierda ni cambie de dueño.
 *
 * 🩸 Los barridos borran los COMENTARIOS antes de mirar. Es la lección del
 * #499: un candado que se conforma con encontrar el texto se cumple a sí mismo
 * con el comentario que explica por qué existe.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");
const MIGRACION = path.join(RAIZ, "supabase/migrations/20260813120000_cxc_anotaciones_por_cartera.sql");

const TABLAS = ["cxc_favorites", "cxc_client_overrides", "cxc_contact_log"] as const;

// ─────────────────────────────────────────────────────────────────────────────
// Doble EN MEMORIA de PostgREST — ejecuta `anotaciones.ts` DE VERDAD.
//
// Un mock que solo devuelve `{data, error}` fijos no puede ver el bug que
// importa: que una lectura de una cartera traiga filas de la otra. Éste guarda
// filas y las filtra, así que el cruce se ve.
// ─────────────────────────────────────────────────────────────────────────────
interface Estado {
  tablas: Record<string, Record<string, unknown>[]>;
  /** ¿Ya corrió el DDL? Con `false` se simula la base de HOY. */
  tieneCartera: boolean;
}

const estado: Estado = { tablas: {}, tieneCartera: true };

class Consulta {
  private modo: "select" | "insert" | "upsert" | "delete" = "select";
  private filtros: [string, unknown][] = [];
  private payload: Record<string, unknown> | null = null;
  private onConflict: string[] = [];
  private tope: number | null = null;

  constructor(private tabla: string) {}

  select() { if (this.modo === "select") this.modo = "select"; return this; }
  insert(row: Record<string, unknown>) { this.modo = "insert"; this.payload = row; return this; }
  upsert(row: Record<string, unknown>, opts?: { onConflict?: string }) {
    this.modo = "upsert";
    this.payload = row;
    this.onConflict = (opts?.onConflict ?? "").split(",").map((c) => c.trim()).filter(Boolean);
    return this;
  }
  delete() { this.modo = "delete"; return this; }
  eq(col: string, val: unknown) { this.filtros.push([col, val]); return this; }
  not() { return this; }
  order() { return this; }
  limit(n: number) { this.tope = n; return this; }
  maybeSingle() { this.tope = 1; return this; }

  private get filas() { return (estado.tablas[this.tabla] ??= []); }

  private errorSinColumna() {
    // Los tres errores REALES de PostgREST cuando la columna no existe.
    if (!estado.tieneCartera) {
      if (this.onConflict.includes("cartera")) {
        return { code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" };
      }
      if (this.filtros.some(([c]) => c === "cartera")) {
        return { code: "42703", message: `column ${this.tabla}.cartera does not exist` };
      }
      if (this.payload && "cartera" in this.payload) {
        return { code: "PGRST204", message: `Could not find the 'cartera' column of '${this.tabla}' in the schema cache` };
      }
    }
    return null;
  }

  private coincide(f: Record<string, unknown>) {
    return this.filtros.every(([c, v]) => f[c] === v);
  }

  then(resolver: (r: { data: unknown; error: unknown }) => unknown) {
    const err = this.errorSinColumna();
    if (err) return Promise.resolve(resolver({ data: null, error: err }));

    if (this.modo === "insert") {
      this.filas.push({ id: `id-${this.filas.length + 1}`, ...this.payload });
      return Promise.resolve(resolver({ data: null, error: null }));
    }
    if (this.modo === "upsert") {
      const llave = this.onConflict.length ? this.onConflict : ["nombre_normalized"];
      const existente = this.filas.find((f) => llave.every((c) => f[c] === this.payload![c]));
      if (existente) Object.assign(existente, this.payload);
      else this.filas.push({ id: `id-${this.filas.length + 1}`, ...this.payload });
      const fila = existente ?? this.filas[this.filas.length - 1];
      return Promise.resolve(resolver({ data: [fila], error: null }));
    }
    if (this.modo === "delete") {
      estado.tablas[this.tabla] = this.filas.filter((f) => !this.coincide(f));
      return Promise.resolve(resolver({ data: null, error: null }));
    }
    let out = this.filas.filter((f) => this.coincide(f));
    if (this.tope != null) out = out.slice(0, this.tope);
    return Promise.resolve(resolver({ data: out.map((f) => ({ ...f })), error: null }));
  }
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (tabla: string) => new Consulta(tabla) },
}));

import {
  alternarFavorito,
  guardarOverride,
  leerContactLog,
  leerCorreoDeOverride,
  leerFavoritos,
  leerOverrides,
  registrarContacto,
} from "@/lib/cxc/anotaciones";
import {
  CARTERAS,
  CARTERA_BOSTON,
  CARTERA_GRUPO,
  CarteraNoDisponibleError,
  esErrorSinColumnaCartera,
  parseCartera,
} from "@/lib/cxc/cartera";

/** El cliente que existe en las DOS carteras y que disparó todo esto. */
const COMPARTIDO = "CITY MALL PASO CANOA";

beforeEach(() => {
  estado.tablas = {};
  estado.tieneCartera = true;
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la cartera es un valor cerrado y SIN default", () => {
  it("solo existen dos carteras", () => {
    expect([...CARTERAS]).toEqual(["grupo", "boston"]);
  });

  it("acepta las dos, con espacios y mayúsculas", () => {
    expect(parseCartera("grupo")).toBe("grupo");
    expect(parseCartera(" BOSTON ")).toBe("boston");
  });

  it("🔴 NO tiene default: sin valor devuelve null, no 'grupo'", () => {
    // Un default acá sería la puerta por la que un camino nuevo escribe "sin
    // cartera" y la fila queda en el grupo por descarte.
    for (const v of [undefined, null, "", "  ", 0, {}, [], "gruppo", "bostón", "Boston Inc"]) {
      expect(parseCartera(v)).toBeNull();
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("una estrella de Boston NO aparece en el grupo (ni al revés)", () => {
  it("favoritos: cada cartera ve solo los suyos", async () => {
    await alternarFavorito(CARTERA_BOSTON, "daniel", COMPARTIDO);

    expect(await leerFavoritos(CARTERA_BOSTON, "daniel")).toEqual([COMPARTIDO]);
    expect(await leerFavoritos(CARTERA_GRUPO, "daniel")).toEqual([]);

    await alternarFavorito(CARTERA_GRUPO, "daniel", COMPARTIDO);
    expect(await leerFavoritos(CARTERA_GRUPO, "daniel")).toEqual([COMPARTIDO]);
    expect(await leerFavoritos(CARTERA_BOSTON, "daniel")).toEqual([COMPARTIDO]);

    // Y quitarla de una NO la quita de la otra.
    await alternarFavorito(CARTERA_BOSTON, "daniel", COMPARTIDO);
    expect(await leerFavoritos(CARTERA_BOSTON, "daniel")).toEqual([]);
    expect(await leerFavoritos(CARTERA_GRUPO, "daniel")).toEqual([COMPARTIDO]);
  });

  it("favoritos: el toggle de una cartera no ve la fila de la otra como 'ya está'", async () => {
    await alternarFavorito(CARTERA_GRUPO, "daniel", COMPARTIDO);
    // Si el toggle mirara sin cartera, esto devolvería "removed" y borraría la
    // estrella del grupo desde la pestaña de Boston.
    expect(await alternarFavorito(CARTERA_BOSTON, "daniel", COMPARTIDO)).toBe("added");
    expect(estado.tablas.cxc_favorites).toHaveLength(2);
  });

  it("contactos: la ficha de una cartera no pisa la de la otra", async () => {
    await guardarOverride(CARTERA_GRUPO, { nombre_normalized: COMPARTIDO, correo: "grupo@x.com" });
    await guardarOverride(CARTERA_BOSTON, { nombre_normalized: COMPARTIDO, correo: "boston@x.com" });

    expect(estado.tablas.cxc_client_overrides).toHaveLength(2);
    expect(await leerCorreoDeOverride(CARTERA_GRUPO, COMPARTIDO)).toBe("grupo@x.com");
    expect(await leerCorreoDeOverride(CARTERA_BOSTON, COMPARTIDO)).toBe("boston@x.com");
  });

  it("contactos: la lista de cada cartera trae solo lo suyo", async () => {
    await guardarOverride(CARTERA_GRUPO, { nombre_normalized: "UNO" });
    await guardarOverride(CARTERA_BOSTON, { nombre_normalized: "DOS" });

    expect((await leerOverrides(CARTERA_GRUPO)).map((o) => o.nombre_normalized)).toEqual(["UNO"]);
    expect((await leerOverrides(CARTERA_BOSTON)).map((o) => o.nombre_normalized)).toEqual(["DOS"]);
  });

  it("bitácora: una llamada anotada en Boston no sale en el grupo", async () => {
    await registrarContacto(CARTERA_BOSTON, COMPARTIDO, "llamada");

    expect(await leerContactLog(CARTERA_GRUPO)).toEqual([]);
    expect((await leerContactLog(CARTERA_BOSTON)).map((r) => r.nombre_normalized)).toEqual([COMPARTIDO]);
  });

  it("toda escritura deja la cartera guardada en la fila", async () => {
    await alternarFavorito(CARTERA_BOSTON, "daniel", "X");
    await guardarOverride(CARTERA_BOSTON, { nombre_normalized: "X" });
    await registrarContacto(CARTERA_BOSTON, "X", "email");

    for (const t of TABLAS) {
      for (const fila of estado.tablas[t] ?? []) expect(fila.cartera).toBe(CARTERA_BOSTON);
    }
  });

  it("el upsert de contactos lleva la cartera en el onConflict", async () => {
    // Con `onConflict: "nombre_normalized"` a secas, el segundo guardado
    // PISARÍA la ficha de la otra cartera en vez de crear la suya.
    await guardarOverride(CARTERA_GRUPO, { nombre_normalized: COMPARTIDO, correo: "a@a.com" });
    await guardarOverride(CARTERA_GRUPO, { nombre_normalized: COMPARTIDO, correo: "b@b.com" });
    expect(estado.tablas.cxc_client_overrides).toHaveLength(1);
    expect(await leerCorreoDeOverride(CARTERA_GRUPO, COMPARTIDO)).toBe("b@b.com");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ Cambio de dirección (3-sep-2026). Este bloque se llamaba "la app funciona
// ANTES de que corra el DDL" y fijaba la degradación: el grupo reintentaba SIN
// la columna y Boston lanzaba `CarteraNoDisponibleError`. La tolerancia se
// retiró — la columna `cartera` existe en las tres tablas (verificado en
// producción) — y hoy un "no existe la columna" es un error de verdad que se
// propaga con su `code`. Lo que NO cambió, y este bloque sigue midiendo, es lo
// que importa: NADA se escribe sin cartera y Boston NUNCA recibe una fila del
// grupo. El detector `esErrorSinColumnaCartera` sigue en `cartera.ts` (puro).
describe("sin la columna `cartera` TODO falla visible (antes: el grupo degradaba)", () => {
  beforeEach(() => {
    estado.tieneCartera = false;
  });

  it("reconoce los 3 errores reales de PostgREST", () => {
    expect(esErrorSinColumnaCartera({ code: "42703", message: "column cxc_favorites.cartera does not exist" })).toBe(true);
    expect(esErrorSinColumnaCartera({ code: "PGRST204", message: "Could not find the 'cartera' column of 'cxc_favorites' in the schema cache" })).toBe(true);
    expect(esErrorSinColumnaCartera({ code: "42P10", message: "there is no unique or exclusion constraint matching the ON CONFLICT specification" })).toBe(true);
  });

  it("🔴 NO reintenta ante un error de verdad", () => {
    // Reintentar ante cualquier error convierte un problema de permisos o de
    // red en una lectura silenciosamente incompleta, que es peor que fallar.
    expect(esErrorSinColumnaCartera({ code: "42501", message: "permission denied for table cxc_favorites" })).toBe(false);
    expect(esErrorSinColumnaCartera({ message: "fetch failed" })).toBe(false);
    expect(esErrorSinColumnaCartera({ code: "42703", message: "column cxc_favorites.otra_cosa does not exist" })).toBe(false);
    expect(esErrorSinColumnaCartera(null)).toBe(false);
  });

  it("🔴 el GRUPO ya NO reintenta sin la columna: falla con el `code` de PostgREST y no escribe nada", async () => {
    // Antes: "added" y una fila sin `cartera`. Hoy: el error se propaga con su
    // código intacto (es lo que `respuestaErrorEscritura` necesita) y la tabla
    // queda como estaba. Una fila sin cartera es exactamente la que el #522 vino
    // a prohibir.
    await expect(alternarFavorito(CARTERA_GRUPO, "daniel", COMPARTIDO)).rejects.toMatchObject({ name: "ErrorAnotacion", code: "42703" });
    await expect(leerFavoritos(CARTERA_GRUPO, "daniel")).rejects.toMatchObject({ name: "ErrorAnotacion", code: "42703" });
    await expect(guardarOverride(CARTERA_GRUPO, { nombre_normalized: COMPARTIDO, correo: "a@a.com" })).rejects.toMatchObject({ name: "ErrorAnotacion", code: "42P10" });
    await expect(registrarContacto(CARTERA_GRUPO, COMPARTIDO, "llamada")).rejects.toMatchObject({ name: "ErrorAnotacion", code: "PGRST204" });
    await expect(leerContactLog(CARTERA_GRUPO)).rejects.toMatchObject({ name: "ErrorAnotacion", code: "42703" });

    for (const t of TABLAS) expect(estado.tablas[t] ?? []).toHaveLength(0);
  });

  it("🔴 BOSTON no escribe en el namespace compartido: falla y lo dice (ahora con el error de la base)", async () => {
    // Escribir igual metería la nota de Boston donde el grupo la vería.
    await expect(alternarFavorito(CARTERA_BOSTON, "daniel", COMPARTIDO)).rejects.toMatchObject({ name: "ErrorAnotacion" });
    await expect(guardarOverride(CARTERA_BOSTON, { nombre_normalized: COMPARTIDO })).rejects.toMatchObject({ name: "ErrorAnotacion" });
    await expect(registrarContacto(CARTERA_BOSTON, COMPARTIDO, "llamada")).rejects.toMatchObject({ name: "ErrorAnotacion" });

    for (const t of TABLAS) expect(estado.tablas[t] ?? []).toHaveLength(0);
  });

  it("BOSTON nunca recibe lo del grupo: con la columna rota, lee ERROR — no vacío, no ajeno", async () => {
    // Se siembra el grupo CON la columna, y después se "rompe".
    estado.tieneCartera = true;
    await alternarFavorito(CARTERA_GRUPO, "daniel", COMPARTIDO);
    await guardarOverride(CARTERA_GRUPO, { nombre_normalized: COMPARTIDO, correo: "grupo@x.com" });
    await registrarContacto(CARTERA_GRUPO, COMPARTIDO, "llamada");
    estado.tieneCartera = false;

    await expect(leerFavoritos(CARTERA_BOSTON, "daniel")).rejects.toMatchObject({ name: "ErrorAnotacion" });
    await expect(leerOverrides(CARTERA_BOSTON)).rejects.toMatchObject({ name: "ErrorAnotacion" });
    await expect(leerContactLog(CARTERA_BOSTON)).rejects.toMatchObject({ name: "ErrorAnotacion" });
    // Lo que NUNCA puede pasar: que Boston reciba la fila del grupo. El correo
    // es una sugerencia y no lanza: cae a null, jamás a "grupo@x.com".
    expect(await leerCorreoDeOverride(CARTERA_BOSTON, COMPARTIDO)).toBeNull();
  });

  it("el mensaje es para una persona, sin jerga de base de datos", () => {
    const msg = new CarteraNoDisponibleError(CARTERA_BOSTON).message;
    expect(msg).toContain("Confecciones Boston");
    expect(msg).not.toMatch(/PGRST|42703|column|schema|null/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BARRIDOS ESTÁTICOS
// ─────────────────────────────────────────────────────────────────────────────
function archivosTs(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "__tests__") continue;
      archivosTs(p, acc);
    } else if (/\.(ts|tsx)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

/** Fuera comentarios: un ejemplo en la documentación no cuenta como código. */
function sinComentarios(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const PUERTA_UNICA = path.join(SRC, "lib/cxc/anotaciones.ts");

describe("BARRIDO 1 — solo `lib/cxc/anotaciones.ts` toca las 3 tablas", () => {
  const archivos = archivosTs(SRC);

  it("el barrido encuentra archivos (si diera 0, todo pasaría sin mirar nada)", () => {
    expect(archivos.length).toBeGreaterThan(200);
    expect(archivos).toContain(PUERTA_UNICA);
  });

  it("ningún otro archivo consulta cxc_favorites / cxc_client_overrides / cxc_contact_log", () => {
    const culpables: string[] = [];
    for (const f of archivos) {
      if (f === PUERTA_UNICA) continue;
      const src = sinComentarios(fs.readFileSync(f, "utf8"));
      for (const t of TABLAS) {
        // `.from("tabla")` en cualquiera de sus dos comillas.
        if (new RegExp(`\\.from\\(\\s*["'\`]${t}["'\`]`).test(src)) {
          culpables.push(`${path.relative(RAIZ, f)} → ${t}`);
        }
      }
    }
    expect(culpables, "una consulta fuera de la puerta única nace SIN cartera").toEqual([]);
  });

  it("la puerta única sí las consulta (el barrido mide algo real)", () => {
    const src = sinComentarios(fs.readFileSync(PUERTA_UNICA, "utf8"));
    for (const t of TABLAS) expect(src).toContain(`.from("${t}")`);
  });
});

describe("BARRIDO 2 — toda ruta que expone anotaciones exige la cartera", () => {
  const RUTAS = [
    "app/api/cxc/favorites/route.ts",
    "app/api/cxc/overrides/route.ts",
    "app/api/cxc/contact-log/route.ts",
    "app/api/overrides/route.ts",
  ];

  it.each(RUTAS)("%s pide la cartera antes de tocar la tabla", (rel) => {
    const src = sinComentarios(fs.readFileSync(path.join(SRC, rel), "utf8"));
    expect(src).toMatch(/carteraDeQuery\(/);
    expect(src).toMatch(/carteraDeBody\(/);
    // Y contesta bien mientras el DDL no haya corrido.
    expect(src).toMatch(/respuestaSiCarteraNoDisponible\(/);
  });

  it("las rutas nuevas que usen la puerta única también quedan vigiladas", () => {
    // Cualquier archivo que importe `anotaciones` tiene que decir de qué
    // cartera escribe: o lo lee del request, o nombra una constante.
    const culpables: string[] = [];
    for (const f of archivosTs(SRC)) {
      if (f === PUERTA_UNICA) continue;
      const src = sinComentarios(fs.readFileSync(f, "utf8"));
      if (!/from\s+["']@\/lib\/cxc\/anotaciones["']/.test(src)) continue;
      const declara = /carteraDeQuery\(|carteraDeBody\(|CARTERA_GRUPO|CARTERA_BOSTON/.test(src);
      if (!declara) culpables.push(path.relative(RAIZ, f));
    }
    expect(culpables, "usa la puerta única pero no dice en qué cartera escribe").toEqual([]);
  });
});

describe("BARRIDO 3 — los dos lados están cableados, cada uno con SU cartera", () => {
  const lee = (rel: string) => sinComentarios(fs.readFileSync(path.join(SRC, rel), "utf8"));

  it("el panel del grupo manda cartera=grupo en todas sus llamadas", () => {
    const panel = lee("app/admin/page.tsx");
    const hook = lee("app/admin/hooks/useAdminData.ts");
    expect(panel).toContain("CARTERA_GRUPO");
    expect(panel).not.toContain("CARTERA_BOSTON");
    // favoritos (GET + POST) y overrides (POST), más el import.
    //
    // ⚠️ El 14-ago-2026 se retiró el POST a contact-log: el menú "···" perdió
    // las dos opciones "Ya contacté" (Daniel: el seguimiento de cobro NO va a
    // existir en este módulo) y la bitácora dejó de escribirse desde acá. La
    // tabla `cxc_contact_log` y sus 141 filas QUEDAN, y la puerta única sigue
    // exigiendo la cartera — lo que bajó es la cuenta de llamadas, no el rigor.
    //
    // ⚠️ El 24-ago-2026 bajó otra: se retiró `handleSaveEdit`, el POST a
    // `/api/cxc/overrides` que ya NO llamaba nadie (la edición de contacto se
    // mudó a la ficha `/clientes/[codigo]` y este panel se quedó con el camino
    // de escritura sin puerta). Quedan las 3 apariciones que importan —el
    // import, el GET y el POST de favoritos—, o sea que **toda llamada que
    // escribe sigue diciendo su cartera**: lo que se retiró fue una llamada, no
    // una declaración. El piso baja; el invariante no se aflojó.
    expect(panel.match(/CARTERA_GRUPO/g)!.length).toBeGreaterThanOrEqual(3);
    // overrides (GET) vive en el hook; el GET de contact-log se retiró el mismo
    // día (nadie pintaba el resultado: llegaba como prop y no se leía).
    expect(hook).toContain("cartera=${CARTERA_GRUPO}");
    expect(hook.match(/CARTERA_GRUPO/g)!.length).toBeGreaterThanOrEqual(2);
    // Y lo que NO puede pasar: que el panel del grupo pida otra cartera.
    expect(hook).not.toContain("CARTERA_BOSTON");
  });

  it("la pestaña de Boston manda cartera=boston, y NUNCA la del grupo", () => {
    const tab = lee("components/cxc/BostonTab.tsx");
    expect(tab).toContain("CARTERA_BOSTON");
    expect(tab).not.toContain("CARTERA_GRUPO");
    expect(tab).toMatch(/cartera=\$\{CARTERA_BOSTON\}/);
    expect(tab).toMatch(/cartera:\s*CARTERA_BOSTON/);
    // Y sus favoritos SÍ ordenan la lista (antes pasaba `() => false`).
    expect(tab).not.toContain("esFavorito: () => false");
  });

  it("Cheques escribe en la cartera del grupo (su CXC es el del grupo)", () => {
    const ch = lee("app/cheques/ChequesClient.tsx");
    expect(ch).toContain("CARTERA_GRUPO");
    expect(ch).not.toContain("CARTERA_BOSTON");
  });

  it("el correo del estado de cuenta se busca en la cartera del GRUPO", () => {
    // Esa ruta acota por CXC_GRUPO_EMPRESA_KEYS: sin la cartera, un correo
    // cargado en Boston desviaría el estado de cuenta del grupo.
    const src = lee("app/api/cxc/enviar-email/route.ts");
    expect(src).toMatch(/leerCorreoDeOverride\(\s*CARTERA_GRUPO/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("LA MIGRACIÓN — aditiva, y ninguna fila cambia de dueño", () => {
  const sql = fs.readFileSync(MIGRACION, "utf8");
  const cuerpo = sql.replace(/^--.*$/gm, " ");

  it.each(TABLAS)("%s gana la columna con el backfill adentro", (t) => {
    expect(cuerpo).toMatch(
      new RegExp(`ALTER TABLE ${t}\\s+ADD COLUMN IF NOT EXISTS cartera text NOT NULL DEFAULT 'grupo'`, "i"),
    );
  });

  it("🔴 las llaves únicas nuevas llevan la cartera PRIMERO", () => {
    // Sin la cartera adentro, las dos carteras nunca pueden tener su propia
    // estrella ni su propia ficha: la segunda choca o pisa a la primera.
    expect(cuerpo).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \S+ *\n? *ON cxc_favorites \(cartera, user_id, nombre_normalized\)/i);
    expect(cuerpo).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS \S+ *\n? *ON cxc_client_overrides \(cartera, nombre_normalized\)/i);
  });

  it("retira los UNIQUE viejos por su DEFINICIÓN, no por un nombre adivinado", () => {
    // `cxc_client_overrides.nombre_normalized` se declaró inline y
    // `cxc_contact_log` ni está en el repo: buscar por nombre dejaría el
    // UNIQUE viejo puesto y la separación no funcionaría, sin avisar.
    expect(cuerpo).toMatch(/contype\s*=\s*'u'/i);
    expect(cuerpo).toMatch(/DROP CONSTRAINT/i);
    expect(cuerpo).toMatch(/a\.attname\s*=\s*'cartera'/i);
  });

  it("solo existen dos carteras, y la base lo hace cumplir", () => {
    for (const t of TABLAS) {
      expect(cuerpo).toMatch(new RegExp(`${t}_cartera_check[\\s\\S]{0,200}CHECK \\(cartera IN \\('grupo', 'boston'\\)\\)`, "i"));
    }
  });

  it("🔴 NO borra ni reasigna ninguna fila existente", () => {
    // El default hace el backfill; cualquier DELETE/UPDATE acá sería mover
    // filas de dueño a mano, que es exactamente lo prohibido.
    for (const t of TABLAS) {
      expect(cuerpo).not.toMatch(new RegExp(`DELETE\\s+FROM\\s+${t}`, "i"));
      expect(cuerpo).not.toMatch(new RegExp(`UPDATE\\s+${t}\\s+SET`, "i"));
      expect(cuerpo).not.toMatch(new RegExp(`DROP\\s+TABLE[\\s\\S]{0,40}${t}`, "i"));
    }
  });

  it("no toca ninguna tabla de plata", () => {
    for (const t of ["switch_estadocuenta", "switch_facturas", "switch_recibos", "cxc_rows"]) {
      expect(cuerpo).not.toContain(t);
    }
  });

  it("deja escrito en la base qué significa la columna", () => {
    for (const t of TABLAS) expect(cuerpo).toMatch(new RegExp(`COMMENT ON COLUMN ${t}\\.cartera`, "i"));
  });
});
