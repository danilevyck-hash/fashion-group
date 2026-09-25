// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — AGRUPAR POR MODELO SON LOS ÚLTIMOS 3 CARACTERES (25-sep-2026)
//
// Daniel, textual: *«los últimos 3 dígitos, letra o número, es el color, pasa
// igual con las otras marcas»*.
//
// 🩸 La regla vieja pedía 3 DÍGITOS. El color de Tommy lleva letras
// (`MW0MW32346C1R`), así que Fashion Wear agrupaba **el 6 %**: 5.130 códigos
// caían en 4.820 «modelos» donde los modelos de verdad son **2.573**.
//
// ✅ MEDIDO CONTRA PRODUCCIÓN el 25-sep-2026 (`switch_articulo_info`, códigos
// distintos por empresa) — la tabla entera está en `referencia-pantalla.ts`.
// Los códigos que usa este candado son REALES, copiados de esa medición.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { colorDe, modeloDe } from "@/lib/ventas/referencia";
import { REFERENCIA_2026_09 } from "@/lib/ventas/referencia-pantalla";

/** 12 de los 47 colores REALES de `MW0MW32346` en Fashion Wear (Tommy). */
const TOMMY = [
  "MW0MW323460EV",
  "MW0MW323460EY",
  "MW0MW32346ACG",
  "MW0MW32346AEG",
  "MW0MW32346AFE",
  "MW0MW32346C1R",
  "MW0MW32346C30",
  "MW0MW32346C3D",
  "MW0MW32346C4U",
  "MW0MW32346C7F",
  "MW0MW32346CSR",
  "MW0MW32346CTA",
];

/** Los 11 empaques REALES `PZ3PK.JOY.*` de Joystep (Joybees). */
const JOYBEES = [
  "PZ3PK.JOY.COOL",
  "PZ3PK.JOY.DLND",
  "PZ3PK.JOY.FTRN",
  "PZ3PK.JOY.GRDN",
  "PZ3PK.JOY.HAZY",
  "PZ3PK.JOY.HLWN",
  "PZ3PK.JOY.ICRM",
  "PZ3PK.JOY.KAWI",
  "PZ3PK.JOY.SNOW",
  "PZ3PK.JOY.SUMR",
  "PZ3PK.JOY.XMAS",
];

/** Reebok (Active Shoes): el color YA son 3 dígitos — no se puede mover. */
const REEBOK = ["100000001", "100000015", "100000016", "100000024", "100000025"];

const modelos = (cods: readonly string[]) => new Set(cods.map(modeloDe));

describe("Tommy — la marca que la regla vieja no agrupaba", () => {
  it("🔴 los 12 colores de MW0MW32346 caen en UN solo modelo", () => {
    if (!REFERENCIA_2026_09) return;
    expect([...modelos(TOMMY)]).toEqual(["MW0MW32346"]);
    expect(colorDe("MW0MW32346C1R")).toBe("C1R");
    expect(colorDe("MW0MW323460EV")).toBe("0EV");
  });
});

describe("Reebok — la marca que NO se puede mover", () => {
  it("🔴 sus códigos ya terminan en 3 dígitos: mismo modelo con las dos reglas", () => {
    expect([...modelos(REEBOK)]).toEqual(["100000"]);
    expect(colorDe("100000001")).toBe("001");
  });
});

describe("Joybees — la excepción que se midió y NO necesitó regla propia", () => {
  // ⚠️ Sus códigos son `PZ3PK.JOY.COOL` / `UKVCG.FPE-KIDS`: el color no ocupa
  // 3 caracteres, así que la regla agrupa de MENOS. Lo que este candado exige
  // es que NO agrupe de MÁS: nunca junta dos empaques distintos.
  it("🔴 nunca mete dos empaques DISTINTOS en el mismo modelo", () => {
    if (!REFERENCIA_2026_09) return;
    // Los 11 quedan bajo llaves que empiezan todas por el mismo empaque.
    for (const m of modelos(JOYBEES)) expect(m.startsWith("PZ3PK.JOY.")).toBe(true);
    // Y un empaque de 4 piezas NUNCA cae con uno de 3.
    expect(modeloDe("PZ4PK.JOY.BCHD")).not.toBe(modeloDe("PZ3PK.JOY.COOL"));
  });

  it("⚠️ agrupa de menos, y se acepta: 11 empaques quedan en varios grupos", () => {
    if (!REFERENCIA_2026_09) return;
    const grupos = modelos(JOYBEES).size;
    expect(grupos).toBeGreaterThan(1);
    expect(grupos).toBeLessThan(JOYBEES.length);
  });

  it("🔴 un código de 3 caracteres o menos no se parte: sería un modelo vacío", () => {
    expect(modeloDe("001")).toBe("001");
    expect(modeloDe("01")).toBe("01");
    expect(colorDe("001")).toBeNull();
  });
});

describe("la medición que justificó el cambio queda escrita", () => {
  it("🔴 el porqué vive en el módulo del interruptor, no en la memoria de nadie", async () => {
    const { readFileSync } = await import("fs");
    const src = readFileSync("src/lib/ventas/referencia-pantalla.ts", "utf8");
    // Los seis renglones de la tabla medida contra producción.
    for (const empresa of [
      "vistana",
      "fashion_wear",
      "fashion_shoes",
      "active_shoes",
      "active_wear",
      "joystep",
    ]) {
      expect(src).toContain(empresa);
    }
    expect(src).toContain("5.130");
    expect(src).toContain("2.573");
  });
});
