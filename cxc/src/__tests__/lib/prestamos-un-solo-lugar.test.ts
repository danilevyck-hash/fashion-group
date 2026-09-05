/* ─────────────────────────────────────────────────────────────────────────────
 * UN SOLO LUGAR — el barrido que impide que el módulo vuelva a tener ocho.
 *
 * 🩸 Medido el 4-sep-2026: **OCHO lugares calculaban el saldo**, cada uno
 * escrito aparte. El único que no usaba `calcularSaldoPrestamo` era la FICHA, y
 * traía un `console.warn` que decía, textual: *«Saldo running ($X) no coincide
 * con saldo backend ($Y)»* — la advertencia que `prestamos-saldo.ts` fue creado
 * para evitar, escrita en el único archivo que no lo usaba.
 *
 * Y `PRESTAMOS_ROLES` estaba tecleado a mano en SEIS archivos, dos de ellos con
 * el literal escrito dos veces adentro. Seis listas que nadie obliga a coincidir
 * son seis puertas que un día no cierran igual.
 *
 * Este archivo no prueba aritmética: prueba que no haya una SEGUNDA definición.
 * ─────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { globSync } from "glob";

import { PRESTAMOS_ADMIN_ROLES, PRESTAMOS_ROLES, USUARIO_APRUEBA_PRESTAMOS, puedeAprobarPrestamo } from "@/lib/prestamos-roles";

const RAIZ = process.cwd();
const leer = (f: string) => readFileSync(f, "utf8");

/** Todo el código del módulo, más quien lo lee de afuera. */
const ARCHIVOS = [
  ...globSync(join(RAIZ, "src/app/prestamos/**/*.{ts,tsx}")),
  ...globSync(join(RAIZ, "src/app/api/prestamos/**/*.ts")),
  ...globSync(join(RAIZ, "src/lib/prestamos-*.ts")),
  join(RAIZ, "src/lib/exports/prestamos-excel.ts"),
  join(RAIZ, "src/lib/asistencia/prestamos-planilla-server.ts"),
  join(RAIZ, "src/app/api/boston/prestamos/route.ts"),
  join(RAIZ, "src/app/api/boston/inicio/route.ts"),
  join(RAIZ, "src/app/api/search/route.ts"),
  join(RAIZ, "src/lib/integrity-checks.ts"),
];

/** El archivo sin comentarios: el barrido no puede engañarse con su propia doc. */
function codigo(f: string): string {
  return leer(f)
    .split("\n")
    .filter((l) => {
      const t = l.trim();
      return !t.startsWith("//") && !t.startsWith("*") && !t.startsWith("/*");
    })
    .join("\n");
}

describe("🔴 el saldo se calcula en UN solo lugar", () => {
  const FUENTE = join(RAIZ, "src/lib/prestamos-saldo.ts");

  it("nadie más escribe la lista de conceptos que SUMAN", () => {
    for (const f of ARCHIVOS) {
      if (f === FUENTE) continue;
      const c = codigo(f);
      // La firma inconfundible de una segunda cuenta: los dos cargos juntos.
      expect(
        /"Préstamo"[^\n]{0,40}"Responsabilidad por daño"/.test(c)
        || /'Préstamo'[^\n]{0,40}'Responsabilidad por daño'/.test(c),
        `${f.replace(RAIZ, "")} volvió a escribir la lista de conceptos que suman`,
      ).toBe(false);
    }
  });

  it("nadie más escribe la lista de conceptos que RESTAN", () => {
    // `prestamos-conceptos.ts` nombra los dos RETIRADOS —«Abono extra» y «Pago
    // de responsabilidad»— y es su lugar: dice cuáles dejaron de ofrecerse, no
    // cuánto restan. Los signos siguen viviendo solo en `prestamos-saldo.ts`.
    const CONCEPTOS = join(RAIZ, "src/lib/prestamos-conceptos.ts");
    for (const f of ARCHIVOS) {
      if (f === FUENTE || f === CONCEPTOS) continue;
      const c = codigo(f);
      expect(
        /"Abono extra"[^\n]{0,60}"Pago de responsabilidad"/.test(c),
        `${f.replace(RAIZ, "")} volvió a escribir la lista de conceptos que restan`,
      ).toBe(false);
    }
  });

  it("🩸 y el `console.warn` de la ficha no vuelve — era la admisión del bug", () => {
    const ficha = codigo(join(RAIZ, "src/app/prestamos/[id]/page.tsx"));
    expect(ficha).not.toContain("no coincide con saldo backend");
    expect(ficha).toContain("calcularSaldoPrestamo");
  });

  it("los cinco lectores de afuera usan la función, no su propia cuenta", () => {
    for (const f of [
      "src/lib/exports/prestamos-excel.ts",
      "src/lib/asistencia/prestamos-planilla-server.ts",
      "src/app/api/boston/prestamos/route.ts",
      "src/app/api/boston/inicio/route.ts",
      "src/app/api/search/route.ts",
      "src/lib/integrity-checks.ts",
      "src/lib/prestamos-lista-server.ts",
    ]) {
      expect(leer(join(RAIZ, f)), f).toContain("calcularSaldoPrestamo");
    }
  });
});

describe("🔴 PRESTAMOS_ROLES se dice una vez", () => {
  it("son admin y contabilidad", () => {
    expect([...PRESTAMOS_ROLES]).toEqual(["admin", "contabilidad"]);
    expect([...PRESTAMOS_ADMIN_ROLES]).toEqual(["admin"]);
  });

  it("ningún archivo del módulo vuelve a teclear la lista", () => {
    const FUENTE = join(RAIZ, "src/lib/prestamos-roles.ts");
    for (const f of ARCHIVOS) {
      if (f === FUENTE) continue;
      const c = codigo(f);
      expect(
        /\[\s*"admin"\s*,\s*"contabilidad"\s*\]/.test(c),
        `${f.replace(RAIZ, "")} volvió a teclear PRESTAMOS_ROLES`,
      ).toBe(false);
    }
  });
});

describe("🔴 quién aprueba es una PERSONA, no un rol", () => {
  it("hace falta ser admin Y ser él — hay dos admins en producción", () => {
    expect(USUARIO_APRUEBA_PRESTAMOS).toBe("daniel");
    expect(puedeAprobarPrestamo({ role: "admin", userName: "daniel" })).toBe(true);
    expect(puedeAprobarPrestamo({ role: "admin", userName: "alberto" })).toBe(false);
    expect(puedeAprobarPrestamo({ role: "contabilidad", userName: "daniel" })).toBe(false);
    expect(puedeAprobarPrestamo({ role: "gerente_boston", userName: "david" })).toBe(false);
    expect(puedeAprobarPrestamo(null)).toBe(false);
  });

  it("no distingue mayúsculas ni espacios, como el login del sistema", () => {
    expect(puedeAprobarPrestamo({ role: "admin", userName: " Daniel " })).toBe(true);
    expect(puedeAprobarPrestamo({ role: "admin", userName: "DANIEL" })).toBe(true);
  });
});

describe("🔴 la quincena se define una vez, y en hora de PANAMÁ", () => {
  it("nadie vuelve a derivarla con el reloj del navegador", () => {
    for (const f of ARCHIVOS) {
      const c = codigo(f);
      // `new Date().getMonth()` / `.getDate()` es el reloj LOCAL del navegador:
      // en el borde del 15 y del 30 da otra quincena que el servidor.
      expect(
        /new Date\(\)\.get(Date|Month|FullYear)\(\)/.test(c),
        `${f.replace(RAIZ, "")} volvió a derivar la quincena con el reloj local`,
      ).toBe(false);
    }
  });

  it("y las dos copias de `hasDeduccionEnQuincena` no vuelven", () => {
    for (const f of ARCHIVOS) {
      expect(codigo(f), f.replace(RAIZ, "")).not.toContain("hasDeduccionEnQuincena");
      expect(codigo(f), f.replace(RAIZ, "")).not.toContain("getQuincenaRange(");
    }
  });
});

describe("🔴 el único hard delete del repo se fue", () => {
  it("ninguna ruta de préstamos hace un `.delete()` real de Postgres", () => {
    for (const f of globSync(join(RAIZ, "src/app/api/prestamos/**/*.ts"))) {
      expect(codigo(f), f.replace(RAIZ, "")).not.toMatch(/\.delete\(\)/);
    }
  });

  it("y borrar el historial queda registrado en activity_logs", () => {
    const ruta = leer(join(RAIZ, "src/app/api/prestamos/movimientos/route.ts"));
    const i = ruta.indexOf("export async function DELETE");
    expect(i).toBeGreaterThan(-1);
    const cuerpo = ruta.slice(i);
    expect(cuerpo).toContain("logActivity");
    expect(cuerpo).toContain("{ deleted: true }");
  });
});

describe("🔴 `deleted` es NULLABLE en préstamos: `.eq(\"deleted\", false)` pierde filas", () => {
  it("ninguna lectura del módulo usa el `.eq` que pierde filas", () => {
    for (const f of ARCHIVOS) {
      const c = codigo(f);
      // ⚠️ Solo lo que cuelga de una tabla de PRÉSTAMOS: en otras tablas
      // `deleted` no admite NULL y el `.eq` es correcto.
      for (const trozo of c.split(/from\(\s*"(prestamos_empleados|prestamos_movimientos)"\s*\)/).slice(1)) {
        const consulta = trozo.split(/from\(/)[0];
        expect(consulta, f.replace(RAIZ, "")).not.toMatch(/\.eq\(\s*"deleted"\s*,\s*false\s*\)/);
      }
    }
  });
});
