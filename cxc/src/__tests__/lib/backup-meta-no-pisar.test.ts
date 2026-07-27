// Candado: una corrida de backup que no salvó NADA no debe pisar el índice
// (meta.json / meta-switch.json) que dejó una corrida buena.
//
// EL CASO REAL (26-jul-2026): Supabase devolvió 521 entre las 22:41 y las 23:57
// UTC. La entrada `?grupo=switch` de las 23:30 —que ese mismo día se había
// movido de 19:15 a 23:30— cayó dentro de la ventana: sus 8 datasets fallaron
// con el HTML del error de Cloudflare y el meta se subió igual, con
// `datasets: []`, PISANDO el bueno de la corrida de la 01:28.
//
// Medido en R2 al día siguiente: `data/2026-07-26/` tenía los 59 objetos
// correctos (49 core + 8 switch + 2 metas) pero `meta-switch.json` pesaba
// 60.247 bytes de mensajes de error y declaraba cero datasets. Los datos
// estaban; el mapa para encontrarlos, no. `restore.mjs --list` mostraba la
// fecha como "OK ... switch 0" — la peor forma de fallar: una copia buena que
// se ve inservible.
//
// Agravante de calendario: 23:30 es la ÚLTIMA de las tres entradas del grupo
// switch dentro del día UTC. No hay segunda oportunidad detrás.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const RAIZ = path.resolve(__dirname, "../../..");
const RUTA_BACKUP = path.join(RAIZ, "src/app/api/cron/backup/route.ts");
const fuente = fs.readFileSync(RUTA_BACKUP, "utf-8");

/** Réplica de la condición del route, para poder ejercitarla como lógica. */
function corridaEsteril(results: unknown[], errores: unknown[]): boolean {
  return results.length === 0 && errores.length > 0;
}

describe("guard del índice del backup", () => {
  it("una corrida sin ni un dataset y con errores es estéril", () => {
    // El 26-jul: 0 datasets, 8 errores (uno por tabla, todos el 521).
    expect(corridaEsteril([], new Array(8).fill("521"))).toBe(true);
  });

  it("una corrida PARCIAL sí escribe: refleja lo que quedó", () => {
    // Media copia con sus errores anotados es información útil; un índice
    // vacío no lo es nunca.
    expect(corridaEsteril([{ file: "switch_facturas" }], ["falló otra"])).toBe(false);
  });

  it("una corrida perfecta escribe (obvio, pero es el caso de todos los días)", () => {
    expect(corridaEsteril([{ file: "a" }, { file: "b" }], [])).toBe(false);
  });

  it("cero datasets SIN errores no se trata como estéril", () => {
    // Un grupo vacío por configuración no es un fallo — no hay nada que
    // proteger ni nada que romper.
    expect(corridaEsteril([], [])).toBe(false);
  });
});

describe("cableado del guard en el route", () => {
  it("el meta a Supabase solo se sube cuando la corrida NO fue estéril", () => {
    expect(fuente).toContain("const corridaEsteril = results.length === 0 && errores.length > 0");
    // El upload del meta tiene que estar dentro del else, no suelto.
    const desdeGuard = fuente.slice(fuente.indexOf("const corridaEsteril"));
    const posUpload = desdeGuard.indexOf(`upload(\`\${today}/\${metaFile}\``);
    const posElse = desdeGuard.indexOf("} else {");
    expect(posElse).toBeGreaterThan(-1);
    expect(posUpload).toBeGreaterThan(posElse);
  });

  it("el meta a R2 también respeta el guard (R2 es la única copia fuera)", () => {
    expect(fuente).toMatch(/const r2Meta = corridaEsteril\s*\n?\s*\?/);
  });

  it("avisa por Telegram en vez de fallar en silencio", () => {
    const desdeGuard = fuente.slice(fuente.indexOf("if (corridaEsteril)"));
    expect(desdeGuard.slice(0, 900)).toContain("sendTelegramAlert");
  });
});

describe("calendario del grupo switch", () => {
  const vercel = JSON.parse(fs.readFileSync(path.join(RAIZ, "vercel.json"), "utf-8"));
  const switchEntries: { path: string; schedule: string }[] = vercel.crons.filter(
    (c: { path: string }) => c.path.includes("backup") && c.path.includes("grupo=switch"),
  );

  it("la última corrida del día queda dentro del mismo día UTC", () => {
    // El guard no-op de las 2ª/3ª entradas compara contra el DÍA UTC: una
    // entrada pasada la medianoche se convertiría en la corrida primaria del
    // día siguiente y dejaría al día anterior sin grupo switch.
    const horas = switchEntries.map((c) => Number(c.schedule.split(" ")[1]));
    expect(Math.max(...horas)).toBeLessThan(24);
    // Y con margen antes de la ventana de deploy 23:50-00:20.
    const ultima = switchEntries
      .map((c) => {
        const [min, hr] = c.schedule.split(" ");
        return Number(hr) * 60 + Number(min);
      })
      .sort((a, b) => b - a)[0];
    expect(ultima).toBeLessThanOrEqual(23 * 60 + 50);
  });
});
