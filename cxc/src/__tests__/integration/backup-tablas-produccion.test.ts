/**
 * LA CLASIFICACIÓN DE LA BASE ES LA BASE DE VERDAD — contra PRODUCCIÓN, solo
 * lectura.
 *
 * `src/lib/backup/tablas.ts` dice qué existe y qué se pierde si se pierde, y de
 * ahí sale la decisión de qué se respalda. Es una FOTO: si alguien crea una
 * tabla desde el panel de Supabase (31 de las 136 de hoy nacieron así, antes de
 * que existieran las migraciones), el candado de `backup-nada-sin-copia` no la
 * ve — ese lee migraciones. Este test mira el catálogo de verdad.
 *
 * También verifica las LLAVES PRIMARIAS: el respaldo pagina de a 1.000 y una PK
 * que no sea `id` sin su entrada en `ORDER_BY` deja un respaldo incompleto que
 * parece completo. Si una migración le cambia la PK a una tabla respaldada, acá
 * se ve.
 *
 * NO corre en `npm test` por defecto:
 *   RUN_DB_TESTS=1 npx vitest run src/__tests__/integration/backup-tablas-produccion.test.ts
 *
 * Requiere SUPABASE_ACCESS_TOKEN en .env.local (el mismo de `npm run migrar`;
 * https://supabase.com/dashboard/account/tokens). Sin él, se salta.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import path from "path";

import { CLASIFICACION, PK_QUE_NO_ES_ID } from "@/lib/backup/tablas";

const RUN = !!process.env.RUN_DB_TESTS;
const PROJECT_REF = "rspocgqhtpveytgbtler";

function tokenDeEnvLocal(): string | null {
  try {
    const raiz = path.resolve(__dirname, "../../..");
    for (const cruda of readFileSync(path.join(raiz, ".env.local"), "utf8").split("\n")) {
      const linea = cruda.trim();
      if (!linea || linea.startsWith("#")) continue;
      const i = linea.indexOf("=");
      if (i < 0 || linea.slice(0, i).trim() !== "SUPABASE_ACCESS_TOKEN") continue;
      return linea.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
    }
  } catch {
    /* sin .env.local → el test se salta */
  }
  return null;
}

async function consultar<T>(token: string, sql: string): Promise<T[]> {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw new Error(`Management API ${r.status}: ${await r.text()}`);
  return r.json() as Promise<T[]>;
}

const token = tokenDeEnvLocal();
const CORRE = RUN && !!token;

describe.skipIf(!CORRE)("la clasificación cubre la base de producción", () => {
  let relaciones: Array<{ tabla: string; tipo: string }> = [];
  let pks: Array<{ tabla: string; pk: string }> = [];

  beforeAll(async () => {
    relaciones = await consultar(token!, `
      select c.relname as tabla,
             case c.relkind when 'r' then 'tabla' when 'p' then 'tabla' else 'vista' end as tipo
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
    `);
    pks = await consultar(token!, `
      select c.relname as tabla, string_agg(a.attname, ',' order by k.ord) as pk
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace and n.nspname = 'public'
      join pg_constraint p on p.conrelid = c.oid and p.contype = 'p'
      join lateral unnest(p.conkey) with ordinality as k(attnum, ord) on true
      join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
      where c.relkind = 'r'
      group by c.relname
    `);
  }, 60_000);

  it("ninguna relación de producción quedó sin clasificar", () => {
    const sinClasificar = relaciones
      .map((r) => r.tabla)
      .filter((t) => CLASIFICACION[t] === undefined)
      .sort();
    expect(
      sinClasificar,
      `Relaciones vivas que nadie clasificó: ${sinClasificar.join(", ")}\n` +
        `Agregalas a src/lib/backup/tablas.ts diciendo qué se pierde si se pierden.`,
    ).toEqual([]);
  });

  it("la clasificación no nombra nada que ya no existe", () => {
    const vivas = new Set(relaciones.map((r) => r.tabla));
    const fantasmas = Object.keys(CLASIFICACION).filter((t) => !vivas.has(t)).sort();
    expect(
      fantasmas,
      `Clasificadas pero borradas de la base: ${fantasmas.join(", ")}`,
    ).toEqual([]);
  });

  it("lo clasificado como vista ES una vista, y al revés", () => {
    const mal = relaciones
      .filter((r) => (CLASIFICACION[r.tabla] === "vista") !== (r.tipo === "vista"))
      .map((r) => `${r.tabla} (en la base es ${r.tipo})`)
      .sort();
    expect(mal, `clase equivocada: ${mal.join(", ")}`).toEqual([]);
  });

  it("las llaves primarias son las que dice la foto", () => {
    const mal: string[] = [];
    for (const { tabla, pk } of pks) {
      const declarada = PK_QUE_NO_ES_ID[tabla];
      if (pk === "id") {
        if (declarada) mal.push(`${tabla}: la base dice id, la foto dice ${declarada.join("+")}`);
      } else if (!declarada) {
        mal.push(`${tabla}: PK ${pk.split(",").join("+")} y no está en PK_QUE_NO_ES_ID`);
      } else if (declarada.join(",") !== pk) {
        mal.push(`${tabla}: la base dice ${pk}, la foto dice ${declarada.join(",")}`);
      }
    }
    expect(
      mal,
      `Llaves primarias fuera de foto — el respaldo pagina por ellas:\n` +
        mal.map((m) => `  · ${m}`).join("\n"),
    ).toEqual([]);
  });
});
