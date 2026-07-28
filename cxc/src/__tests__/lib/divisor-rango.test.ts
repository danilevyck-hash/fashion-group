/* ─────────────────────────────────────────────────────────────────────────────
 * Candado del RANGO DEL DIVISOR de las fórmulas de precio del Depurador.
 *
 * El bug real (27-jul-2026): "TH Tommy Jeans" tenía `divisor = 70` en vez de
 * 0.70 y los precios salían 100× más baratos. Las 4 rutas de fórmulas solo
 * pedían `divisor >= 0`, así que el 70 entraba sin chistar.
 *
 * Este archivo prueba las DOS direcciones:
 *   1) que el valor malo se rechace con un mensaje que se entienda, y
 *   2) que TODOS los valores que el negocio usa hoy de verdad sigan pasando
 *      (incluido el 0 = "sin fórmula", que es un dato legítimo y frecuente).
 * Más el barrido estático: si mañana alguien agrega una ruta que escribe un
 * divisor y no llama al guard, el build se pone rojo.
 * ────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  validarDivisor,
  DIVISOR_MIN,
  DIVISOR_MAX,
  DIVISOR_SIN_FORMULA,
} from "@/lib/depurador/divisor";

const RUTAS_FORMULAS = [
  "src/app/api/productos/cargar/formulas/route.ts",
  "src/app/api/productos/cargar/rubro-formulas/route.ts",
  "src/app/api/productos/cargar/tienda-formulas/route.ts",
  "src/app/api/productos/cargar/tienda-rubro-formulas/route.ts",
];

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

describe("validarDivisor — el bug que lo originó", () => {
  it("RECHAZA 70 (el valor que estaba en producción para TH Tommy Jeans)", () => {
    const r = validarDivisor(70);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    // El mensaje tiene que decir QUÉ está mal y CÓMO se escribe bien.
    expect(r.error).toContain("no puede ser mayor a 1.00");
    expect(r.error).toContain("0.70");
    expect(r.error).not.toMatch(/divisor inválido/i); // el mensaje viejo no explicaba nada
  });

  it("ACEPTA 0.70, que es lo que debía estar", () => {
    const r = validarDivisor(0.7);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.divisor).toBe(0.7);
  });

  it("el mensaje está en español simple: sin jerga técnica ni nombres de tabla", () => {
    for (const malo of [70, -1, 0.001, "abc"]) {
      const r = validarDivisor(malo);
      expect(r.ok).toBe(false);
      if (r.ok) continue;
      expect(r.error).not.toMatch(/null|undefined|NaN|throw|marca_formulas|numeric|constraint/i);
      expect(r.error).toMatch(/divisor/i);
      // Siempre dice cómo se escribe bien, no solo que está mal.
      expect(r.error).toContain("0.70");
    }
  });
});

describe("validarDivisor — techo (> 1.0)", () => {
  it.each([1.01, 1.5, 2, 30, 70, 100, 1000, Number.MAX_SAFE_INTEGER])(
    "rechaza %p",
    (v) => {
      expect(validarDivisor(v).ok).toBe(false);
    }
  );

  it("1.00 exacto SÍ pasa (vender al costo: raro, pero no es un error de tipeo)", () => {
    const r = validarDivisor(DIVISOR_MAX);
    expect(r.ok).toBe(true);
  });

  it("30 (el porcentaje escrito como entero) se rechaza — es el otro disfraz del mismo error", () => {
    expect(validarDivisor(30).ok).toBe(false);
    expect(validarDivisor(25).ok).toBe(false);
  });
});

describe("validarDivisor — piso (< 0.10), el error simétrico", () => {
  it.each([0.001, 0.01, 0.05, 0.07, 0.099])("rechaza %p", (v) => {
    expect(validarDivisor(v).ok).toBe(false);
  });

  it("0.07 (un dígito de más sobre 0.7) se rechaza y el mensaje dice cuánto se dispararía", () => {
    const r = validarDivisor(0.07);
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toContain("14 veces el costo");
  });

  it("0.10 exacto SÍ pasa (es el borde, no está prohibido)", () => {
    expect(validarDivisor(DIVISOR_MIN).ok).toBe(true);
  });
});

describe("validarDivisor — cero y negativos", () => {
  it("0 es VÁLIDO: es el centinela de 'sin fórmula', no un error", () => {
    const r = validarDivisor(DIVISOR_SIN_FORMULA);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.divisor).toBe(0);
  });

  it.each([-0.5, -1, -70])("rechaza el negativo %p", (v) => {
    const r = validarDivisor(v);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("negativo");
  });

  it.each([NaN, Infinity, -Infinity, "abc", "", null, undefined, {}, []])(
    "rechaza el no-número %p",
    (v) => {
      expect(validarDivisor(v).ok).toBe(false);
    }
  );
});

describe("validarDivisor — no rompe nada de lo que el negocio usa hoy", () => {
  // Valores REALES leídos de producción el 27-jul-2026 (marca_formulas +
  // marca_rubro_formulas) más los defaults de Reebok A/B.
  const EN_PRODUCCION = [0.75, 0.73, 0.7, 0.63, 0.8, 0];

  it.each(EN_PRODUCCION)("acepta %p, que hoy existe en la base", (v) => {
    expect(validarDivisor(v).ok).toBe(true);
  });

  it("0.63 (el margen más agresivo que se usó nunca) queda muy por encima del piso", () => {
    expect(0.63).toBeGreaterThan(DIVISOR_MIN);
    // El piso deja aire de sobra: nada operativo real se acerca.
    expect(0.63 / DIVISOR_MIN).toBeGreaterThan(6);
  });
});

describe("el guard corre en el SERVIDOR, no solo en el formulario", () => {
  it("las 4 rutas que escriben un divisor llaman a validarDivisor", () => {
    for (const rel of RUTAS_FORMULAS) {
      const src = leer(rel);
      expect(src, `${rel} no importa el guard`).toContain(
        'from "@/lib/depurador/divisor"'
      );
      expect(src, `${rel} no llama al guard`).toContain("validarDivisor(");
    }
  });

  it("ninguna ruta conserva la validación vieja (solo `divisor < 0`), que dejaba pasar el 70", () => {
    for (const rel of RUTAS_FORMULAS) {
      const src = leer(rel);
      expect(src, `${rel} sigue con la validación vieja`).not.toMatch(
        /Number\.isFinite\(divisor\)\s*\|\|\s*divisor\s*<\s*0/
      );
      expect(src, `${rel} sigue con el mensaje viejo`).not.toContain('"Divisor inválido."');
    }
  });

  it("el guard rechaza AUNQUE el formulario lo haya dejado pasar: el cuerpo del PUT es la única fuente", () => {
    // Simula exactamente lo que hace cada route: Number(body.divisor) → validar.
    const cuerpoDelFormulario = { marca: "TH Tommy Jeans", divisor: 70, extra: 3, redondeo: "int" };
    const r = validarDivisor(Number(cuerpoDelFormulario.divisor));
    expect(r.ok).toBe(false);
  });

  it("el módulo del guard es PURO: no toca base, red ni process.env", () => {
    const src = leer("src/lib/depurador/divisor.ts");
    expect(src).not.toMatch(/supabase|fetch\(|process\.env|require\(/);
  });
});

describe("la migración del CHECK repite el MISMO rango que el código", () => {
  const MIGRACION = "supabase/migrations/20260727190000_divisor_rango.sql";

  it("existe y cubre las 4 tablas de fórmulas", () => {
    const sql = leer(MIGRACION);
    for (const t of [
      "marca_formulas",
      "marca_rubro_formulas",
      "tienda_marca_formulas",
      "tienda_rubro_formulas",
    ]) {
      expect(sql, `falta ${t}`).toContain(t);
    }
  });

  it("el rango del SQL es el mismo que el de TypeScript (0 · 0.1 · 1)", () => {
    const sql = leer(MIGRACION);
    expect(sql).toContain("divisor = 0");
    expect(sql).toContain(String(DIVISOR_MIN));
    expect(sql).toContain(`divisor <= ${DIVISOR_MAX}`);
  });
});
