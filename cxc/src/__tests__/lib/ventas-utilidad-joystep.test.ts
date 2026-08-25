// ─────────────────────────────────────────────────────────────────────────────
// JOYSTEP ENTRA A Ventas › Utilidad — y la lista de empresas se DERIVA.
//
// 🩸 EL BUG. `utilidad_por_cliente(p_anio)` (migración 20260610130100) llevaba
// las empresas ESCRITAS A MANO en su WHERE:
//
//     AND empresa_key IN ('vistana','fashion_wear','fashion_shoes',
//                         'active_shoes','active_wear')
//
// Cinco. Fashion Group son SEIS: falta `joystep`. Su utilidad se sincroniza
// desde el 27-jul-2026 (`switch_factura_utilidad` tiene sus filas) y entró a
// Comisiones el 14-ago-2026, pero este tab no la dibujaba. Es EXACTAMENTE el
// olvido que costó 15.262,00 de cobros de julio invisibles: los insumos
// completos, la plata en la base, y la pantalla sin dibujarla.
//
// 🔑 LO QUE ESTE ARCHIVO PROTEGE NO ES "que joystep esté en una lista": es que
// NO HAYA LISTA QUE ESCRIBIR. La lista viaja por parámetro desde
// `empresasConUtilidad()` — la misma fuente única de la que salen el sync de
// utilidad y el cronograma de crons. Una empresa que se encienda mañana en
// `EMPRESA_SYNC_CAPABILITIES` aparece acá sola.
//
// Son candados de CONDUCTA: se llama al handler REAL y se cuenta QUÉ RPC salió
// y con qué argumentos. Que el archivo contenga la palabra "joystep" no prueba
// que el endpoint lo pida.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, readdirSync } from "fs";
import path from "path";
import { empresasConUtilidad } from "@/lib/switch-api/empresas";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { alcanceEmpresas, EMPRESAS_UTILIDAD_V1 } from "@/lib/ventas/utilidad-cliente";

// ── Conducta: qué RPC dispara de verdad el endpoint ─────────────────────────
const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
/** Cuando true, `utilidad_por_cliente_v2` responde "esa función no existe"
 *  (PGRST202) — o sea, la migración todavía no la corrió Daniel. */
let v2Ausente = false;

vi.mock("@/lib/requireRole", () => ({
  requireRole: () => ({ role: "admin", userName: "Daniel" }),
}));
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      if (fn === "utilidad_por_cliente_v2" && v2Ausente) {
        return {
          data: null,
          error: { code: "PGRST202", message: "Could not find the function public.utilidad_por_cliente_v2" },
        };
      }
      return {
        data: [{
          empresa_key: "joystep", cliente_switch_id: 7, cliente: "CLIENTE JOYSTEP",
          n_docs: 4, total_subtotal: 1000, total_costo: 700, total_utilidad: 300, pct_utilidad: 30,
        }],
        error: null,
      };
    },
  },
}));

async function llamar(year = 2026) {
  const { GET } = await import("@/app/api/ventas/utilidad-cliente/route");
  const req = { nextUrl: new URL(`http://x/api/ventas/utilidad-cliente?year=${year}`) };
  const res = await GET(req as never);
  return { res, body: await res.json() };
}

beforeEach(() => {
  rpcCalls.length = 0;
  v2Ausente = false;
});

// ── Texto SIN comentarios: la explicación de un cambio contiene las palabras
//    que el barrido busca, y este repo ya pagó cuatro veces ese candado que se
//    cumple a sí mismo. ─────────────────────────────────────────────────────
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map(l => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const sinComentariosSql = (src: string) =>
  src.split("\n").map(l => l.replace(/--.*$/, "")).join("\n");

const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");

const MIGRACIONES = path.join(process.cwd(), "supabase/migrations");
const MIGRACION_V2 = "20260824180000_utilidad_por_cliente_empresas_parametro.sql";

describe("la lista de empresas se DERIVA, nunca se escribe", () => {
  it("`empresasConUtilidad()` tiene a joystep, y son las SEIS de Fashion Group", () => {
    const derivada = empresasConUtilidad();
    expect(derivada).toContain("joystep");
    // Las mismas seis que comisionan y que tienen CXC del grupo. Si algún día
    // difieren, es una decisión que hay que tomar, no un descuido que se cuela.
    expect([...derivada].sort()).toEqual([...B2B_EMPRESA_KEYS].sort());
  });

  it("el endpoint le manda ESA lista a la RPC, no una escrita a mano", async () => {
    await llamar();
    const v2 = rpcCalls.find(c => c.fn === "utilidad_por_cliente_v2");
    expect(v2, "no salió utilidad_por_cliente_v2").toBeTruthy();
    expect(v2!.args.p_empresas).toEqual(empresasConUtilidad());
    expect(v2!.args.p_empresas).toContain("joystep");
  });

  it("la RPC nueva NO lleva ninguna empresa adentro del SQL", () => {
    const sql = sinComentariosSql(leer(`supabase/migrations/${MIGRACION_V2}`));
    // El cuerpo recibe la lista; si alguna key aparece escrita, volvió la copia.
    for (const k of [...B2B_EMPRESA_KEYS, "confecciones_boston", "american_classic"]) {
      expect(sql, `"${k}" volvió a escribirse dentro del SQL`).not.toContain(`'${k}'`);
    }
    expect(sql).toContain("p_empresas");
  });

  it("un array vacío o NULL no devuelve nada: mejor una pantalla vacía que un total cambiado en silencio", () => {
    const sql = sinComentariosSql(leer(`supabase/migrations/${MIGRACION_V2}`));
    expect(sql).toContain("COALESCE(p_empresas, ARRAY[]::text[])");
  });
});

describe("la migración es ADITIVA — la app funciona antes y después de correrla", () => {
  it("no toca `utilidad_por_cliente(p_anio)`: ni la reemplaza ni la borra", () => {
    const sql = sinComentariosSql(leer(`supabase/migrations/${MIGRACION_V2}`));
    expect(sql).not.toMatch(/DROP\s+FUNCTION/i);
    // Solo crea la v2. Un `CREATE OR REPLACE FUNCTION utilidad_por_cliente(`
    // sin el `_v2` estaría pisando la que la app usa de respaldo.
    expect(sql).not.toMatch(/FUNCTION\s+utilidad_por_cliente\s*\(/i);
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION utilidad_por_cliente_v2/i);
  });

  it("la v1 sigue existiendo en el repo con sus cinco empresas — es el respaldo", () => {
    const sql = leer("supabase/migrations/20260610130100_utilidad_por_cliente.sql");
    for (const k of EMPRESAS_UTILIDAD_V1) expect(sql).toContain(`'${k}'`);
  });

  it("si la v2 todavía no existe, se cae sola a la v1 y la pantalla NO queda en blanco", async () => {
    v2Ausente = true;
    const { res, body } = await llamar();
    expect(res.status).toBe(200);
    expect(rpcCalls.map(c => c.fn)).toEqual(["utilidad_por_cliente_v2", "utilidad_por_cliente"]);
    // La v1 no recibe lista: la lleva adentro.
    expect(rpcCalls[1].args).toEqual({ p_anio: 2026 });
    expect(body.rows.length).toBe(1);
  });

  it("nadie deja la migración por la mitad: el archivo existe con ese nombre exacto", () => {
    expect(readdirSync(MIGRACIONES)).toContain(MIGRACION_V2);
  });
});

describe("el alcance que se muestra es el que la consulta miró de verdad", () => {
  it("con la v2 viva, la respuesta declara las SEIS", async () => {
    const { body } = await llamar();
    expect(body.empresas).toEqual(empresasConUtilidad());
    expect(alcanceEmpresas(body.empresas)).toBe("6 empresas B2B");
  });

  it("con la v2 ausente, la respuesta declara CINCO — no miente hacia arriba", async () => {
    v2Ausente = true;
    const { body } = await llamar();
    expect(body.empresas).toEqual([...EMPRESAS_UTILIDAD_V1]);
    expect(alcanceEmpresas(body.empresas)).toBe("5 empresas B2B");
  });

  it("el rótulo se dice en singular cuando corresponde", () => {
    expect(alcanceEmpresas(["vistana"])).toBe("1 empresa B2B");
  });

  it("ni el lib ni la pantalla llevan el número escrito a mano", () => {
    for (const f of ["src/lib/ventas/utilidad-cliente.ts", "src/components/ventas/UtilidadView.tsx"]) {
      const src = sinComentarios(leer(f));
      expect(src, `"5 empresas B2B" volvió a ${f}`).not.toContain("5 empresas B2B");
      expect(src, `"6 empresas B2B" volvió a ${f}`).not.toContain("6 empresas B2B");
    }
  });
});

describe("⚠️ lo que NO cambió", () => {
  it("las notas de crédito siguen restando: la RPC SUMA plano, sin CASE por tipo", () => {
    const sql = sinComentariosSql(leer(`supabase/migrations/${MIGRACION_V2}`));
    expect(sql).toContain("SUM(subtotal_con_descuento)");
    expect(sql).toContain("SUM(utilidad)");
    // Firmar por tipo acá daría exactamente el DOBLE de las devoluciones de
    // diferencia: las NC ya se guardan negativas.
    expect(sql).not.toMatch(/CASE\s+WHEN\s+tipo/i);
  });

  it("la llave de agrupación es la MISMA que la v1 (id de Switch, con respaldo al nombre)", () => {
    const v2 = sinComentariosSql(leer(`supabase/migrations/${MIGRACION_V2}`));
    const v1 = sinComentariosSql(leer("supabase/migrations/20260610130100_utilidad_por_cliente.sql"));
    const grupo = /GROUP BY[\s\S]*?ORDER BY/;
    expect(v2.match(grupo)?.[0].replace(/\s+/g, " ")).toBe(v1.match(grupo)?.[0].replace(/\s+/g, " "));
  });

  it("el orden de salida es el mismo: por utilidad, de mayor a menor", () => {
    const sql = sinComentariosSql(leer(`supabase/migrations/${MIGRACION_V2}`));
    expect(sql.replace(/\s+/g, " ")).toContain("ORDER BY SUM(utilidad) DESC");
  });
});
