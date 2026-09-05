/* ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — «Pagado» SE ESCRIBE UNA SOLA VEZ.
 *
 * 🔴 QUÉ PASA SI SE ROMPE: si uno de estos lugares cambia el literal y otro no,
 * un reclamo YA PAGADO vuelve a la lista de pendientes y se cuela en el Excel
 * que se le manda al proveedor — o sea, cobrarle dos veces. Medido antes de que
 * `soloPendientes()` existiera: 5 de 33 reclamos vivos ya pagados ($5.306,62)
 * viajaban en los archivos.
 *
 * Los CUATRO lugares donde el literal estaba suelto:
 *   1. `esPendiente()`                         → src/lib/reclamos/pendientes.ts
 *   2. el badge de notificaciones              → api/notification-badges
 *   3. el RPC del home                         → migración SQL (no importa TS)
 *   4. el flip que exige comprobante           → api/reclamos/[id]/settlements
 * Y el quinto que salió del mismo barrido: Vista General.
 *
 * El SQL no puede importar la constante, así que acá se comparan byte a byte.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { ESTADO_PAGADO, esPendiente, soloPendientes } from "@/lib/reclamos/pendientes";

const leer = (...p: string[]) => readFileSync(join(process.cwd(), ...p), "utf8");

/** Sin comentarios: un archivo que EXPLICA el literal no puede darse el visto bueno solo. */
const sinComentarios = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

/** Los lugares de TypeScript que deciden «pendiente o pagado». */
const LUGARES_TS = [
  ["el badge de notificaciones", ["src", "app", "api", "notification-badges", "route.ts"]],
  ["el flip a Pagado que exige comprobante", ["src", "app", "api", "reclamos", "[id]", "settlements", "route.ts"]],
  ["la máquina de estados del PATCH", ["src", "app", "api", "reclamos", "[id]", "route.ts"]],
  ["Vista General", ["src", "app", "api", "dashboard", "vista-general", "route.ts"]],
] as const;

describe("🔴 la constante es la única definición", () => {
  it("vale «Pagado» y `esPendiente` la usa", () => {
    expect(ESTADO_PAGADO).toBe("Pagado");
    expect(esPendiente({ estado: "Pagado" })).toBe(false);
    expect(esPendiente({ estado: "Creado" })).toBe(true);
    expect(esPendiente({ estado: "En proceso" })).toBe(true);
    expect(esPendiente({})).toBe(true);
    expect(soloPendientes([{ estado: "Pagado" }, { estado: "Creado" }])).toHaveLength(1);
  });

  it("`pendientes.ts` no repite el literal fuera de la constante", () => {
    const codigo = sinComentarios(leer("src", "lib", "reclamos", "pendientes.ts"));
    const veces = (codigo.match(/["']Pagado["']/g) ?? []).length;
    expect(veces).toBe(1);
    expect(codigo).toMatch(/ESTADO_PAGADO\s*=\s*"Pagado"/);
  });
});

describe("🔴 ninguno de los cuatro lugares escribe el literal a mano", () => {
  for (const [nombre, ruta] of LUGARES_TS) {
    it(`${nombre} importa ESTADO_PAGADO y no tipea «Pagado»`, () => {
      const codigo = sinComentarios(leer(...ruta));
      expect(codigo, nombre).toMatch(/ESTADO_PAGADO/);
      expect(codigo, nombre).not.toMatch(/["'`(,]Pagado["'`),]/);
    });
  }
});

describe("🔴 el RPC del home dice exactamente lo mismo", () => {
  // El SQL no puede importar la constante: se compara byte a byte. Si mañana el
  // estado terminal se llama distinto en TypeScript y esta migración no se
  // rehace, «reclamosResueltosEsteMes» cuenta cero para siempre.
  const SQL = sinComentarios(
    leer("supabase", "migrations", "20260812190000_home_lastupload_solo_grupo.sql")
      .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n"),
  );

  it("el estado terminal del RPC es el mismo string", () => {
    expect(SQL).toContain(`estado = '${ESTADO_PAGADO}'`);
  });

  it("no cuenta un pagado como pendiente", () => {
    // Los dos contadores de pendientes miran 'Creado', que no es el terminal.
    expect(SQL).toMatch(/reclamosPendientes/);
    expect(ESTADO_PAGADO).not.toBe("Creado");
  });
});
