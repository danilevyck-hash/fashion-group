// ─────────────────────────────────────────────────────────────────────────────
// `npm run migrar` — el comando que aplica una migración desde la terminal.
//
// Lo que estos tests FIJAN:
//   1. Sin token, falla CERRADO: mensaje con el link para conseguirlo y CERO
//      llamadas a la red. El token se lee solo de `.env.local`.
//   2. `--dry-run` muestra todo (archivo, tamaño, resumen) y no llama a la red,
//      con o sin token.
//   3. La confirmación es de verdad: cualquier cosa que no sea «s» no aplica.
//   4. Una migración ya registrada no se repite sin `--forzar`.
//   5. El error de Postgres sale TAL CUAL, y no se registra nada.
//   6. El INSERT en el registro sigue las columnas que el registro tiene.
//   7. El token nunca aparece en pantalla, pase lo que pase.
//
// Todo contra un doble de la Management API: acá no se toca producción.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  migrar,
  partesDelNombre,
  resumenDelSql,
  sqlDeRegistro,
  sqlCompleto,
  citarConDolar,
  leerVariableDeEnvLocal,
  DONDE_SACAR_TOKEN,
  NOMBRE_VARIABLE,
  URL_QUERY,
  type Deps,
} from "../../../scripts/migrar-core";

const TOKEN_FALSO = "sbp_TOKEN_DE_MENTIRA_QUE_NO_DEBE_SALIR_EN_PANTALLA";
const NOMBRE = "20260909120000_clientes_vs_anio_anterior_mismos_dias.sql";
const SQL =
  "-- ─────────────\n" +
  "-- «vs 2025» comparaba OCHO meses contra NUEVE\n" +
  "--\n" +
  "-- Daniel toma decisiones mirando esa columna.\n" +
  "-- ══ DÓNDE ESTABA ══════\n" +
  "-- el detalle que no hace falta mostrar\n" +
  "CREATE OR REPLACE VIEW x AS SELECT 1;\n";

/* ── Un proyecto de mentira en /tmp ──────────────────────────────────────── */

let raiz: string;
beforeEach(() => {
  raiz = mkdtempSync(path.join(tmpdir(), "migrar-"));
  mkdirSync(path.join(raiz, "supabase/migrations"), { recursive: true });
  writeFileSync(path.join(raiz, "supabase/migrations", NOMBRE), SQL);
});
afterEach(() => rmSync(raiz, { recursive: true, force: true }));

function conToken() {
  writeFileSync(path.join(raiz, ".env.local"), `OTRA=1\n${NOMBRE_VARIABLE}=${TOKEN_FALSO}\n`);
}

/** Doble de la Management API: contesta por orden y anota cada query. */
function dobleApi(respuestas: Array<{ status?: number; cuerpo: unknown }>) {
  const queries: string[] = [];
  const fetch = vi.fn(async (_url: unknown, init?: RequestInit) => {
    queries.push(JSON.parse(String(init?.body)).query);
    const r = respuestas.shift() ?? { cuerpo: [] };
    const status = r.status ?? 200;
    return {
      ok: status < 400,
      status,
      text: async () => (typeof r.cuerpo === "string" ? r.cuerpo : JSON.stringify(r.cuerpo)),
    } as Response;
  }) as unknown as typeof globalThis.fetch;
  return { fetch, queries };
}

function deps(fetch: typeof globalThis.fetch, respuesta = "s") {
  const pantalla: string[] = [];
  const d: Deps = {
    fetch,
    preguntar: vi.fn(async () => respuesta),
    escribir: (l) => pantalla.push(l),
  };
  return { d, pantalla, texto: () => pantalla.join("\n") };
}

const COLUMNAS = [{ column_name: "version" }, { column_name: "statements" }, { column_name: "name" }];
const ULTIMAS = [
  { version: "20260903120000", name: "asistencia_aprobador_empresa", es_esta: false },
  { version: "20260902100000", name: "boston_fuera_directorio", es_esta: false },
];

/* ── 1. Sin token ─────────────────────────────────────────────────────────── */

describe("sin token", () => {
  it("falla cerrado: dice dónde conseguirlo y NO llama a la red", async () => {
    const { fetch } = dobleApi([]);
    const { d, texto } = deps(fetch);
    const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
    expect(r.ok).toBe(false);
    expect(texto()).toContain(NOMBRE_VARIABLE);
    expect(texto()).toContain(DONDE_SACAR_TOKEN);
    expect(fetch).not.toHaveBeenCalled();
    expect(d.preguntar).not.toHaveBeenCalled();
  });

  it("el token se lee solo de .env.local, no del ambiente del proceso", async () => {
    process.env[NOMBRE_VARIABLE] = TOKEN_FALSO;
    try {
      const { fetch } = dobleApi([]);
      const { d } = deps(fetch);
      const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
      expect(r.ok).toBe(false);
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      delete process.env[NOMBRE_VARIABLE];
    }
  });

  it("leerVariableDeEnvLocal ignora comentarios y quita comillas", () => {
    writeFileSync(
      path.join(raiz, ".env.local"),
      `# ${NOMBRE_VARIABLE}=comentado\n${NOMBRE_VARIABLE}="${TOKEN_FALSO}"\n`,
    );
    expect(leerVariableDeEnvLocal(raiz, NOMBRE_VARIABLE)).toBe(TOKEN_FALSO);
    expect(leerVariableDeEnvLocal(raiz, "NO_EXISTE")).toBeNull();
  });
});

/* ── 2. --dry-run ─────────────────────────────────────────────────────────── */

describe("--dry-run", () => {
  it("muestra archivo, tamaño y resumen, y no llama a la red aunque haya token", async () => {
    conToken();
    const { fetch } = dobleApi([]);
    const { d, texto } = deps(fetch);
    const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz, dryRun: true }, d);
    expect(r).toMatchObject({ ok: true, aplicada: false, version: "20260909120000" });
    expect(texto()).toContain(NOMBRE);
    expect(texto()).toMatch(/\d+ B|\d+\.\d KB/);
    expect(texto()).toContain("comparaba OCHO meses contra NUEVE");
    expect(texto()).not.toContain("el detalle que no hace falta mostrar");
    expect(texto()).toContain("no se llamó a la API");
    expect(fetch).not.toHaveBeenCalled();
    expect(d.preguntar).not.toHaveBeenCalled();
  });

  it("sin token tampoco llama a la red, y dice que falta", async () => {
    const { fetch } = dobleApi([]);
    const { d, texto } = deps(fetch);
    const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz, dryRun: true }, d);
    expect(r.ok).toBe(true);
    expect(texto()).toContain("FALTA");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("archivo inexistente: dice cuál buscó", async () => {
    const { fetch } = dobleApi([]);
    const { d, texto } = deps(fetch);
    const r = await migrar({ ruta: "supabase/migrations/no_existe.sql", raiz, dryRun: true }, d);
    expect(r.ok).toBe(false);
    expect(texto()).toContain(path.join(raiz, "supabase/migrations/no_existe.sql"));
    expect(fetch).not.toHaveBeenCalled();
  });
});

/* ── 3–5. El flujo con la API de mentira ──────────────────────────────────── */

describe("aplicar", () => {
  it("con «s»: una sola llamada de escritura, migración + registro juntos", async () => {
    conToken();
    const { fetch, queries } = dobleApi([{ cuerpo: COLUMNAS }, { cuerpo: ULTIMAS }, { cuerpo: [] }]);
    const { d, texto } = deps(fetch, "s");
    const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
    expect(r).toMatchObject({ ok: true, aplicada: true, version: "20260909120000" });
    expect(fetch).toHaveBeenCalledTimes(3);
    expect(fetch).toHaveBeenLastCalledWith(URL_QUERY, expect.anything());
    const escritura = queries[2];
    expect(escritura).toContain("CREATE OR REPLACE VIEW x AS SELECT 1;");
    expect(escritura).toContain("INSERT INTO supabase_migrations.schema_migrations (version, name, statements)");
    expect(escritura).toContain("'20260909120000'");
    expect(escritura).toContain("clientes_vs_anio_anterior_mismos_dias");
    expect(escritura).toContain("ON CONFLICT (version) DO NOTHING");
    expect(texto()).toContain("✅ Aplicada");
    // Las últimas registradas se muestran antes de preguntar
    expect(texto()).toContain("20260903120000  asistencia_aprobador_empresa");
  });

  it("con Enter (vacío) o «n»: no aplica y solo leyó el registro", async () => {
    for (const respuesta of ["", "n", "no", "N"]) {
      conToken();
      const { fetch } = dobleApi([{ cuerpo: COLUMNAS }, { cuerpo: ULTIMAS }]);
      const { d, texto } = deps(fetch, respuesta);
      const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
      expect(r).toMatchObject({ ok: true, aplicada: false, motivo: "cancelada" });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(texto()).toContain("Cancelado");
    }
  });

  it("ya registrada: avisa, no pregunta, no aplica; con --forzar sí", async () => {
    conToken();
    const yaEsta = [{ version: "20260909120000", name: "clientes_vs_anio_anterior_mismos_dias", es_esta: true }, ...ULTIMAS];
    {
      const { fetch } = dobleApi([{ cuerpo: COLUMNAS }, { cuerpo: yaEsta }]);
      const { d, texto } = deps(fetch, "s");
      const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
      expect(r).toMatchObject({ ok: true, aplicada: false, motivo: "ya registrada" });
      expect(fetch).toHaveBeenCalledTimes(2);
      expect(d.preguntar).not.toHaveBeenCalled();
      expect(texto()).toContain("--forzar");
    }
    {
      const { fetch } = dobleApi([{ cuerpo: COLUMNAS }, { cuerpo: yaEsta }, { cuerpo: [] }]);
      const { d } = deps(fetch, "s");
      const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz, forzar: true }, d);
      expect(r).toMatchObject({ ok: true, aplicada: true });
      expect(fetch).toHaveBeenCalledTimes(3);
    }
  });

  it("error de Postgres: sale tal cual, y el resultado es fallo", async () => {
    conToken();
    const cuerpo = '{"message":"ERROR: relation \\"clientes_master\\" does not exist (SQLSTATE 42P01)"}';
    const { fetch } = dobleApi([{ cuerpo: COLUMNAS }, { cuerpo: ULTIMAS }, { status: 400, cuerpo }]);
    const { d, texto } = deps(fetch, "s");
    const r = await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
    expect(r.ok).toBe(false);
    expect(texto()).toContain(cuerpo);
    expect(texto()).not.toContain("✅");
  });

  it("registro con solo `version`: el INSERT no inventa columnas", async () => {
    conToken();
    const { fetch, queries } = dobleApi([
      { cuerpo: [{ column_name: "version" }] },
      { cuerpo: [{ version: "20260903120000", es_esta: false }] },
      { cuerpo: [] },
    ]);
    const { d } = deps(fetch, "s");
    await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
    expect(queries[2]).toContain("(version)\nVALUES ('20260909120000')");
    expect(queries[2]).not.toContain("statements");
  });
});

/* ── 7. El token nunca sale en pantalla ───────────────────────────────────── */

describe("el token", () => {
  it("no aparece en pantalla en ninguno de los caminos", async () => {
    conToken();
    const caminos: Array<{ respuestas: Array<{ status?: number; cuerpo: unknown }>; contesta: string }> = [
      { respuestas: [{ cuerpo: COLUMNAS }, { cuerpo: ULTIMAS }, { cuerpo: [] }], contesta: "s" },
      { respuestas: [{ cuerpo: COLUMNAS }, { cuerpo: ULTIMAS }], contesta: "n" },
      { respuestas: [{ status: 401, cuerpo: '{"message":"Unauthorized"}' }], contesta: "s" },
      { respuestas: [{ cuerpo: COLUMNAS }, { cuerpo: ULTIMAS }, { status: 500, cuerpo: "boom" }], contesta: "s" },
    ];
    for (const c of caminos) {
      const { fetch } = dobleApi(c.respuestas);
      const { d, texto } = deps(fetch, c.contesta);
      await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz }, d);
      expect(texto()).not.toContain(TOKEN_FALSO);
    }
    const { fetch } = dobleApi([]);
    const { d, texto } = deps(fetch);
    await migrar({ ruta: `supabase/migrations/${NOMBRE}`, raiz, dryRun: true }, d);
    expect(texto()).not.toContain(TOKEN_FALSO);
  });
});

/* ── Piezas puras ─────────────────────────────────────────────────────────── */

describe("piezas", () => {
  it("partesDelNombre: versión = los 14 dígitos; sin timestamp no hay versión", () => {
    expect(partesDelNombre(`/x/${NOMBRE}`)).toEqual({
      version: "20260909120000",
      nombre: "clientes_vs_anio_anterior_mismos_dias",
    });
    expect(partesDelNombre("/x/ventas_v2.sql")).toBeNull();
    expect(partesDelNombre("/x/2026_x.sql")).toBeNull();
  });

  it("resumenDelSql: salta las reglas de arriba, para en la primera sección", () => {
    expect(resumenDelSql(SQL)).toEqual([
      "«vs 2025» comparaba OCHO meses contra NUEVE",
      "",
      "Daniel toma decisiones mirando esa columna.",
    ]);
    expect(resumenDelSql("CREATE TABLE x();")).toEqual([]);
  });

  it("citarConDolar: elige una etiqueta que no esté en el texto", () => {
    expect(citarConDolar("hola")).toBe("$migrar$hola$migrar$");
    expect(citarConDolar("a $migrar$ b")).toBe("$migrar1$a $migrar$ b$migrar1$");
  });

  it("sqlDeRegistro + sqlCompleto: una migración que termina en comentario no se come el INSERT", () => {
    const registro = sqlDeRegistro(["version", "name"], "20260909120000", "x", "SELECT 1");
    const todo = sqlCompleto("SELECT 1; -- fin", registro);
    expect(todo).toContain("-- fin\n;\nINSERT INTO");
  });
});
