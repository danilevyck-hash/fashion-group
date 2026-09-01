// ─────────────────────────────────────────────────────────────────────────────
// 🔴 DOS MIGRACIONES NO PUEDEN COMPARTIR TIMESTAMP.
//
// 🩸 DESCUBIERTO AL RECONCILIAR (31-ago-2026). El registro del CLI
// (`supabase_migrations.schema_migrations`) tiene el timestamp como PRIMARY KEY,
// así que dos archivos con el mismo número son UNA sola fila. Al sembrar las 305
// migraciones ya aplicadas entraron **278**: había **25 timestamps repetidos en
// 52 archivos**.
//
// Hoy no rompe nada —esos 52 ya están aplicados— pero el modo de fallo futuro es
// silencioso y caro: `supabase db push` ve la versión en el registro, la da por
// corrida y **salta el archivo hermano sin decir una palabra**. Una tabla que
// nadie creó, y la app degradando por `cols-opcionales` como si el DDL estuviera
// pendiente, para siempre.
//
// ⚠️ Los 52 que ya existen quedan como están: renombrarlos los volvería
// «nuevos» para el CLI y los intentaría correr de nuevo sobre datos reales. Se
// congelan acá y la regla aplica de este número en adelante.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readdirSync } from "node:fs";
import path from "node:path";

const DIR = path.join(process.cwd(), "supabase/migrations");
const CON_TIMESTAMP = /^(\d{14})_(.+)\.sql$/;

/** El corte: lo de acá para abajo ya estaba escrito cuando se puso la regla. */
const HEREDADAS_HASTA = "20260903120000";

function porTimestamp(): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const f of readdirSync(DIR)) {
    const g = CON_TIMESTAMP.exec(f);
    if (!g) continue;
    m.set(g[1], [...(m.get(g[1]) ?? []), f]);
  }
  return m;
}

describe("el registro de migraciones no puede perder un archivo", () => {
  const mapa = porTimestamp();

  it("el barrido encuentra migraciones (si diera 0, todo pasaría en verde)", () => {
    expect(mapa.size).toBeGreaterThan(250);
  });

  it("🔴 ninguna migración NUEVA repite el timestamp de otra", () => {
    const nuevas = [...mapa.entries()].filter(
      ([v, fs]) => fs.length > 1 && v > HEREDADAS_HASTA,
    );
    expect(
      nuevas.map(([v, fs]) => `${v}: ${fs.join(" + ")}`),
      "dos migraciones con el mismo timestamp son UNA sola fila en el registro del CLI: `db push` correría una y saltaría la otra en silencio",
    ).toEqual([]);
  });

  it("⚠️ las heredadas están CONGELADAS: 25 timestamps en 52 archivos", () => {
    // Si este número cambia hacia arriba, alguien agregó un duplicado nuevo por
    // debajo del corte. Si baja, alguien renombró un archivo ya aplicado — que
    // es peor: el CLI lo vería como nuevo y lo correría otra vez.
    const viejos = [...mapa.entries()].filter(([v, fs]) => fs.length > 1 && v <= HEREDADAS_HASTA);
    expect(viejos.length).toBe(25);
    expect(viejos.reduce((n, [, fs]) => n + fs.length, 0)).toBe(52);
  });

  it("el nombre después del timestamp nunca está vacío", () => {
    for (const f of readdirSync(DIR)) {
      const g = CON_TIMESTAMP.exec(f);
      if (g) expect(g[2].length, f).toBeGreaterThan(0);
    }
  });
});
