// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL CANDADO DE LAS DOS PUERTAS A LA MISMA FICHA (14-sep-2026)
//
// ── QUÉ PROTEGE, Y POR QUÉ ES ÉSTE Y NO OTRO ─────────────────────────────────
//
// Hasta hoy `/asistencia/colaboradores/:codigo` pedía la LISTA ENTERA y se
// quedaba con una fila, a propósito. `PersonaPagina.tsx` lo decía textual:
// *«No se estrena una ruta "de una persona": dos lecturas de la misma ficha es
// cómo nacen dos verdades»*. Costaba leer las 6.998 marcaciones de 180 días
// (835 KB en siete páginas de PostgREST) para dibujar a una persona: 1.656 ms
// medidos contra producción.
//
// Daniel aprobó abrir esa puerta **con la condición de este archivo**: que los
// DOS caminos —la lista y la ficha de una persona— devuelvan EXACTAMENTE lo
// mismo, campo por campo, sobre el universo entero de colaboradores. De esta
// ficha sale el salario, la jornada, la rata por hora, los seguros y quién está
// de baja: dos verdades acá no se pagan con una pantalla fea, se pagan en plata.
//
// ── CÓMO SE PRUEBA ───────────────────────────────────────────────────────────
//
// Con una base FALSA cargada con la FORMA REAL de producción
// (`fixtures/asistencia-colaboradores.json`, capturado el 14-sep-2026 con
// `scripts/_capturar-fixture-fichas.ts`): **51 colaboradores** —48 con ficha y
// 3 que solo marcan—, los **2** renglones del único sueldo repartido entre dos
// empresas, **45** horarios, **5** códigos ignorados (dos de ellos CON ficha),
// **32** fichas de préstamos con sus movimientos, y marcaciones reales de cada
// persona. No se compara contra números congelados: se corren los dos caminos
// **sobre los mismos datos** y se exige que digan lo mismo.
//
// ⚠️ Las marcaciones del fixture son una MUESTRA de las reales (la primera, una
// del medio y la última de cada persona: 147 de 6.998) y las cédulas van
// despersonalizadas. Ninguna de las dos cosas debilita el candado: acá no se
// compara contra una cifra de afuera, se comparan los dos caminos entre sí, y
// los dos leen el mismo fixture. La medición contra producción de verdad, con
// las 6.998 marcaciones y los 51 colaboradores, vive en
// `scripts/_verif-ficha-una-persona.ts`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { NextRequest } from "next/server";
import { signSession } from "@/lib/session-cookie";

const SECRET_PREV = process.env.SESSION_SECRET;
beforeAll(() => { process.env.SESSION_SECRET = "test-secret-ficha-una-persona"; });
afterAll(() => { process.env.SESSION_SECRET = SECRET_PREV; });

interface Fixture {
  reglas: Record<string, unknown>;
  fichas: Record<string, unknown>[];
  repartos: Record<string, unknown>[];
  horarios: Record<string, unknown>[];
  ignorados: Record<string, unknown>[];
  prestamos: Record<string, unknown>[];
  marcaciones: Record<string, unknown>[];
}
const DATOS: Fixture = JSON.parse(
  readFileSync("src/__tests__/fixtures/asistencia-colaboradores.json", "utf8"),
);

// ── LA BASE FALSA ────────────────────────────────────────────────────────────
//
// Lo mínimo de PostgREST que las dos rutas usan: `select` (con `count`), `eq`,
// `gte`, el `or` de préstamos, `order`, `range` y `maybeSingle`. Es la MISMA
// instancia para los dos caminos: si uno de los dos leyera de otro lado, este
// archivo no probaría nada.
const TABLAS: Record<string, Record<string, unknown>[]> = {
  asistencia_marcaciones: DATOS.marcaciones,
  asistencia_reglas: [{ id: 1, ...DATOS.reglas }],
  asistencia_personas: DATOS.fichas,
  asistencia_reparto_empresa: DATOS.repartos,
  asistencia_horarios: DATOS.horarios,
  asistencia_codigos_ignorados: DATOS.ignorados,
  prestamos_empleados: DATOS.prestamos,
};

/** Cuántas veces se le preguntó a cada tabla. Lo mira el caso del final. */
const consultas: string[] = [];

function crearConsulta(tabla: string) {
  let filas = [...(TABLAS[tabla] ?? [])];
  let conCount = false;
  const api = {
    select(_cols: string, opts?: { count?: string }) {
      consultas.push(tabla);
      conCount = opts?.count === "exact";
      return api;
    },
    eq(col: string, v: unknown) {
      filas = filas.filter((f) => String(f[col] ?? "") === String(v) || f[col] === v);
      return api;
    },
    gte(col: string, v: string) {
      filas = filas.filter((f) => String(f[col] ?? "") >= v);
      return api;
    },
    or(expr: string) {
      // El único `or` del módulo: «deleted es null o false» (préstamos).
      if (expr !== "deleted.is.null,deleted.eq.false") throw new Error(`or no soportado: ${expr}`);
      filas = filas.filter((f) => f.deleted == null || f.deleted === false);
      return api;
    },
    order(col: string, o?: { ascending?: boolean }) {
      const asc = o?.ascending !== false;
      filas = [...filas].sort((a, b) => {
        const x = String(a[col] ?? ""); const y = String(b[col] ?? "");
        return (x < y ? -1 : x > y ? 1 : 0) * (asc ? 1 : -1);
      });
      return api;
    },
    range(desde: number, hasta: number) {
      const total = filas.length;
      const pagina = filas.slice(desde, hasta + 1);
      return Promise.resolve({ data: pagina, error: null, count: conCount ? total : null });
    },
    maybeSingle() {
      return Promise.resolve({ data: filas[0] ?? null, error: null });
    },
    then<T>(res: (v: { data: unknown[]; error: null; count: number | null }) => T) {
      return Promise.resolve(res({ data: filas, error: null, count: conCount ? filas.length : null }));
    },
  };
  return api;
}

vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: { from: (t: string) => crearConsulta(t) },
}));

const { GET: getLista } = await import("@/app/api/asistencia/configuracion/route");
const { GET: getUna } = await import("@/app/api/asistencia/configuracion/persona/route");

const COOKIE = () =>
  signSession({ role: "admin", userId: "u", userName: "daniel", sessionToken: "t", modules: ["asistencia"] });

const pedirLista = () =>
  getLista(new NextRequest("http://x/api/asistencia/configuracion", {
    headers: { cookie: `cxc_session=${COOKIE()}` },
  }));

const pedirUna = (codigo: string) =>
  getUna(new NextRequest(
    `http://x/api/asistencia/configuracion/persona?codigo=${encodeURIComponent(codigo)}`,
    { headers: { cookie: `cxc_session=${COOKIE()}` } },
  ));

type Persona = Record<string, unknown> & { codigo: string };

// 🔴 EL UNIVERSO SE DERIVA DEL FIXTURE, no de lo que la lista devuelva: `it.each`
// arma los casos ANTES de que corra un `beforeAll`, y un universo que se
// construye a sí mismo desde la respuesta que quiere probar no prueba nada. Es
// la MISMA unión que hace la ruta: códigos del reloj ∪ fichas guardadas — los
// ignorados incluidos, a propósito, porque igualar lo que la lista ESCONDE es
// la otra mitad del trabajo.
const UNIVERSO: string[] = [...new Set([
  ...DATOS.marcaciones.map((m) => String(m.empleado_codigo ?? "").trim()).filter(Boolean),
  ...DATOS.fichas.map((f) => String(f.empleado_codigo)),
])];

let LISTA: Persona[] = [];
let IGNORADOS: string[] = [];

beforeAll(async () => {
  const r = await pedirLista();
  expect(r.status).toBe(200);
  const j = await r.json();
  LISTA = j.personas as Persona[];
  IGNORADOS = (j.ignorados as { codigo: string }[]).map((i) => i.codigo);
});

describe("Los dos caminos a la ficha de un colaborador dicen lo MISMO", () => {
  it("el universo del fixture es el de producción: 51 colaboradores, 5 ignorados", () => {
    expect(UNIVERSO.length).toBe(51);
    expect(IGNORADOS.length).toBe(5);
    // Y la lista devuelve EXACTAMENTE el universo menos los escondidos: si la
    // ruta perdiera a alguien por el camino, los casos de abajo no lo notarían.
    expect([...LISTA.map((p) => p.codigo)].sort())
      .toEqual(UNIVERSO.filter((c) => !IGNORADOS.includes(c)).sort());
    // 48 con ficha y 3 que solo marcan en el reloj.
    expect(LISTA.filter((p) => p.configurado).length + IGNORADOS.filter((c) =>
      DATOS.fichas.some((f) => String(f.empleado_codigo) === c)).length).toBe(48);
  });

  // 🔴 EL CASO QUE DANIEL PUSO COMO CONDICIÓN. Uno por persona, para que cuando
  // falle el nombre del caso diga a QUIÉN se le está mintiendo.
  it.each(UNIVERSO.map((c) => [c] as const))(
    "código %s: campo por campo, la ficha sola = la de la lista",
    async (codigo) => {
      const r = await pedirUna(codigo);
      expect(r.status).toBe(200);
      const { persona } = await r.json();
      const deLaLista = LISTA.find((p) => p.codigo === codigo) ?? null;
      // `toEqual` compara en profundidad: si una clave sobra, falta o cambia de
      // valor —incluido el arreglo `reparto`— este caso se pone rojo.
      expect(persona).toEqual(deLaLista);
    },
  );

  it("un código IGNORADO da `null` por los dos caminos (no una ficha a medias)", async () => {
    expect(IGNORADOS.length).toBeGreaterThan(0);
    for (const c of IGNORADOS) {
      const { persona } = await (await pedirUna(c)).json();
      expect(persona).toBeNull();
      expect(LISTA.some((p) => p.codigo === c)).toBe(false);
    }
  });

  it("los dos mandan las MISMAS banderas de «qué se puede hacer» y las mismas reglas", async () => {
    const lista = await (await pedirLista()).json();
    const una = await (await pedirUna(LISTA[0].codigo)).json();
    for (const k of [
      "faltaMigracion", "puedeDarDeBaja", "puedeMarcarServicioProfesional",
      "puedeQuitarSeguros", "puedeCargarBaseSeguros", "puedeMarcarSueldoFijo",
      "puedeCargarSaldoVacaciones",
    ]) {
      expect([k, una[k]]).toEqual([k, lista[k]]);
    }
    expect(una.reglas).toEqual(lista.reglas);
    expect(una.reglasDefault).toEqual(lista.reglasDefault);
  });

  it("un código que no existe contesta una ficha vacía, no un error", async () => {
    const r = await pedirUna("no-existe-999");
    expect(r.status).toBe(200);
    expect((await r.json()).persona).toBeNull();
  });

  it("sin código, 400 con una frase que se entiende", async () => {
    const r = await pedirUna("");
    expect(r.status).toBe(400);
    expect(String((await r.json()).error)).toMatch(/[Ff]alta el código/);
  });
});

describe("El camino nuevo pide MENOS, y lo pide a la base", () => {
  it("la ficha de una persona no lee las marcaciones de todos", async () => {
    // 🔑 El filtro va en la CONSULTA, no en memoria: lo que se comprueba es que
    // la ruta de una persona traiga solo las marcaciones de esa persona. Con el
    // filtro en memoria, este caso pasaría igual de rápido y la base seguiría
    // mandando 835 KB — por eso se cuenta lo que LLEGA, no lo que se dibuja.
    const codigo = LISTA.find((p) => Number(p.marcaciones) > 0)!.codigo;
    const { persona } = await (await pedirUna(codigo)).json();
    const suyas = DATOS.marcaciones.filter((m) => String(m.empleado_codigo ?? "").trim() === codigo);
    expect(persona.marcaciones).toBe(suyas.length);
    expect(suyas.length).toBeLessThan(DATOS.marcaciones.length);
  });

  it("la ruta de una persona NO escribe: solo `select`", async () => {
    const src = readFileSync("src/app/api/asistencia/configuracion/persona/route.ts", "utf8");
    for (const prohibido of ["upsert(", "insert(", "update(", "delete(", "export async function PUT", "export async function POST"]) {
      expect([prohibido, src.includes(prohibido)]).toEqual([prohibido, false]);
    }
  });

  it("el mapeo vive en UN solo archivo y las dos rutas lo llaman", () => {
    const lista = readFileSync("src/app/api/asistencia/configuracion/route.ts", "utf8");
    const una = readFileSync("src/app/api/asistencia/configuracion/persona/route.ts", "utf8");
    for (const [quien, src] of [["lista", lista], ["una persona", una]] as const) {
      expect([quien, src.includes("armarPersonaDeConfiguracion")]).toEqual([quien, true]);
      // 🔴 Nadie vuelve a armar la persona a mano: si una ruta empieza a leer
      // las columnas de la ficha por su cuenta, este barrido lo caza.
      expect([quien, src.includes("servicioProfesionalDeFila")]).toEqual([quien, false]);
      expect([quien, src.includes("rataPorHoraCalculo")]).toEqual([quien, false]);
    }
  });

  it("la página del colaborador pide a SU persona, no la lista entera", () => {
    const src = readFileSync("src/app/asistencia/colaboradores/PersonaPagina.tsx", "utf8");
    expect(src).toContain("/api/asistencia/configuracion/persona?codigo=");
    // ⚠️ El PUT de guardar sigue siendo el de siempre: una sola puerta de
    // escritura. Es el CONTROL de este caso — si desapareciera, el candado
    // estaría festejando que la pantalla dejó de guardar.
    expect(src).toContain('fetch("/api/asistencia/configuracion"');
  });
});
