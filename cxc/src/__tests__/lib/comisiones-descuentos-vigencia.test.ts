// ═════════════════════════════════════════════════════════════════════════════
// 🔴 UN DESCUENTO TIENE FECHAS — y el de Reynaldo empieza en JULIO de 2026.
// ═════════════════════════════════════════════════════════════════════════════
// 🩸 Medido contra producción el 5-sep-2026: `comision_descuentos_fijos` tenía
// OCHO columnas y NINGUNA de fecha, así que el descuento se restaba en TODOS
// los meses, para siempre y hacia atrás. Las dos filas vivas —«Descuento»
// $1.400,00 y «Descuento de adelanto» $173,08, las dos de REYNALDO ESPINOSA en
// Fashion Shoes— se crearon el 8-jul-2026 y se estaban restando también en
// enero, febrero, marzo, abril, mayo y junio: SEIS meses anteriores al día en
// que el descuento existió. En 2026 iban $14.157,72 (9 × $1.573,08).
//
// Daniel, 6-sep-2026: «no sé [qué era] pero hay que descontarlo así mensual» y,
// al ver el cuadro del antes/después: **«pero el descuento es indefinido. No hay
// hasta. Ponlo desde enero que se le descuenta esos 1500 y pico.»**
//
// 🔴 O SEA: `desde = 2026-01-01`, `hasta` en NULL, y **NINGÚN número de 2026 se
// mueve** — los 9 meses quedan como están y el total del año sigue siendo
// $67.815,75 (medido: `scripts/_medir-descuento-vigencia.mjs`).
//
// 🔑 ENTONCES ¿PARA QUÉ SIRVE? Para el PRÓXIMO descuento. El defecto no era el
// monto de Reynaldo —ahí sí correspondía desde enero—: era que **la tabla no
// tenía forma de decir desde cuándo**, así que el descuento que se cargue en
// octubre también se iba a restar en marzo, y ahí sí sin querer.
//
// 🔴 LO QUE ESTE CANDADO EXIGE:
//   · La regla vive en UN módulo puro (`vigencia.ts`) y `desde`/`hasta` no
//     significan «no hay dato»: sin ellos, el descuento se comporta como antes.
//   · «Hasta» corta INCLUSIVE (mismo criterio que Recordatorios) y es OPCIONAL:
//     un descuento indefinido es la REGLA, no la excepción.
//   · La lectura filtra por vigencia ANTES de buscar la excepción del mes.
//   · La migración le pone `desde = 2026-01-01` a las dos filas, NO les escribe
//     `hasta`, y **no mueve un solo mes de 2026**.
// ═════════════════════════════════════════════════════════════════════════════

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  descuentoVigente,
  validarVigencia,
  claveMes,
  mesISO,
} from "@/lib/comisiones/vigencia";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
const MIG = "supabase/migrations/20261007120000_comision_descuentos_vigencia.sql";

// ═══ 1. La regla, en el módulo puro ══════════════════════════════════════════
describe("🔴 descuentoVigente: desde / hasta, con el MES como grano", () => {
  it("sin fechas se resta siempre — una fila vieja no cambia de conducta", () => {
    for (const mes of [1, 6, 7, 12]) {
      expect(descuentoVigente({}, 2026, mes)).toBe(true);
      expect(descuentoVigente({ desde: null, hasta: null }, 2026, mes)).toBe(true);
    }
    expect(descuentoVigente({}, 2019, 3)).toBe(true);
  });

  it("🔴 el de Reynaldo (desde enero 2026, SIN hasta): los 12 meses de 2026 lo llevan, y 2027 también", () => {
    const v = { desde: "2026-01-01", hasta: null };
    for (let mes = 1; mes <= 12; mes++) {
      expect(descuentoVigente(v, 2026, mes), `mes ${mes}`).toBe(true);
    }
    // Indefinido: no se apaga solo al cambiar de año. Daniel: «no hay hasta».
    expect(descuentoVigente(v, 2027, 1)).toBe(true);
    expect(descuentoVigente(v, 2030, 6)).toBe(true);
    // Pero antes de enero de 2026 no existe.
    expect(descuentoVigente(v, 2025, 12)).toBe(false);
  });

  it("🔑 el «desde» es para el PRÓXIMO: uno cargado en octubre no se resta en marzo", () => {
    const v = { desde: "2026-10-01" };
    for (const mes of [1, 3, 6, 9]) {
      expect(descuentoVigente(v, 2026, mes), `mes ${mes}`).toBe(false);
    }
    for (const mes of [10, 11, 12]) {
      expect(descuentoVigente(v, 2026, mes), `mes ${mes}`).toBe(true);
    }
  });

  it("🔴 «hasta» corta INCLUSIVE — el mismo criterio que el «Hasta…» de Recordatorios", () => {
    const v = { desde: "2026-07-01", hasta: "2026-09-01" };
    expect(descuentoVigente(v, 2026, 9)).toBe(true);   // el último mes SÍ lo lleva
    expect(descuentoVigente(v, 2026, 10)).toBe(false);
  });

  it("el grano es el MES: un día a mitad de mes cuenta por su mes entero", () => {
    expect(descuentoVigente({ desde: "2026-07-31" }, 2026, 7)).toBe(true);
    expect(descuentoVigente({ hasta: "2026-07-01" }, 2026, 7)).toBe(true);
    expect(descuentoVigente({ hasta: "2026-07-31" }, 2026, 8)).toBe(false);
  });

  it("🔑 falla ABIERTO: una fecha ilegible se lee como «sin límite», no como «apagado»", () => {
    // Un descuento que deja de restarse en silencio le paga de más a alguien y
    // nadie lo nota; uno que se resta de más se ve en pantalla el mismo día.
    expect(descuentoVigente({ desde: "no es fecha" }, 2026, 1)).toBe(true);
    expect(descuentoVigente({ hasta: "" }, 2026, 12)).toBe(true);
    expect(claveMes("2026-13-01")).toBeNull();
    expect(claveMes(null)).toBeNull();
    expect(claveMes("2026-07-15")).toBe(202607);
  });

  it("mesISO arma el día 1 (la llave de la excepción del mes)", () => {
    expect(mesISO(2026, 7)).toBe("2026-07-01");
    expect(mesISO(2026, 11)).toBe("2026-11-01");
  });
});

describe("🔴 validarVigencia: «Hasta» antes que «Desde» es un error con texto", () => {
  it("acepta vacíos y los normaliza a null", () => {
    expect(validarVigencia(undefined, undefined)).toEqual({ ok: true, valor: { desde: null, hasta: null } });
    expect(validarVigencia("", "")).toEqual({ ok: true, valor: { desde: null, hasta: null } });
  });
  it("rechaza lo ilegible y el orden invertido, en español y sin jerga", () => {
    expect(validarVigencia("julio", null).ok).toBe(false);
    expect(validarVigencia(null, "2026/07/01").ok).toBe(false);
    const r = validarVigencia("2026-09-01", "2026-07-01");
    expect(r.ok).toBe(false);
    expect(r.ok === false && r.error).toBe("«Hasta» no puede ser antes que «Desde»");
  });
  it("el mismo mes en los dos lados es válido (un solo mes)", () => {
    expect(validarVigencia("2026-07-01", "2026-07-01").ok).toBe(true);
  });
});

// ═══ 2. La lectura la aplica ANTES de buscar la excepción ════════════════════
const consultas: { tabla: string; ids?: string[] }[] = [];
let filasFijos: Record<string, unknown>[] = [];

vi.mock("@/lib/supabase-server", () => {
  const q = (tabla: string) => {
    const estado: { ids?: string[] } = {};
    const api: Record<string, unknown> = {};
    const paso = () => api;
    api.select = paso;
    api.in = (col: string, vals: string[]) => {
      if (col === "descuento_id") estado.ids = vals;
      return api;
    };
    api.eq = paso;
    api.order = () => {
      consultas.push({ tabla, ...estado });
      return Promise.resolve({ data: filasFijos, error: null });
    };
    // La segunda consulta (excepciones) termina en .eq(), no en .order()
    api.then = (res: (v: unknown) => unknown) => {
      consultas.push({ tabla, ...estado });
      return Promise.resolve(res({ data: [], error: null }));
    };
    return api;
  };
  return { supabaseServer: { from: (t: string) => q(t) } };
});

describe("🔴 leerDescuentosEfectivos: la vigencia se aplica antes que todo", () => {
  beforeEach(() => { consultas.length = 0; });

  // Las dos filas REALES, tal como quedan al aplicar la migración.
  const dos = [
    { id: "a", empresa_key: "fashion_shoes", concepto: "Descuento", monto: 1400, vendedor_nombre: "REYNALDO ESPINOSA", desde: "2026-01-01", hasta: null },
    { id: "b", empresa_key: "fashion_shoes", concepto: "Descuento de adelanto", monto: 173.08, vendedor_nombre: "REYNALDO ESPINOSA", desde: "2026-01-01", hasta: null },
  ];

  it("🔴 LOS NUEVE MESES DE 2026 devuelven las dos filas, $1.573,08 — no se mueve un centavo", async () => {
    const { leerDescuentosEfectivos, totalPorVendedor } = await import("@/lib/comisiones/descuentos");
    for (let mes = 1; mes <= 9; mes++) {
      filasFijos = dos;
      const r = await leerDescuentosEfectivos(["fashion_shoes"], 2026, mes);
      expect(r, `mes ${mes}`).toHaveLength(2);
      expect(totalPorVendedor(r), `mes ${mes}`).toEqual({ "REYNALDO ESPINOSA": 1573.08 });
    }
  });

  it("🔑 uno cargado desde octubre NO se devuelve en junio, y ni se pregunta por su excepción", async () => {
    filasFijos = [{ ...dos[0], desde: "2026-10-01" }];
    const { leerDescuentosEfectivos } = await import("@/lib/comisiones/descuentos");
    const r = await leerDescuentosEfectivos(["fashion_shoes"], 2026, 6);
    expect(r).toEqual([]);
    expect(consultas.map((c) => c.tabla)).toEqual(["comision_descuentos_fijos"]);
  });

  it("sin las columnas (DDL pendiente) se comporta como antes: se resta en todos los meses", async () => {
    filasFijos = dos.map(({ desde, hasta, ...resto }) => resto);
    const { leerDescuentosEfectivos, totalPorVendedor } = await import("@/lib/comisiones/descuentos");
    for (const mes of [1, 6, 7]) {
      const r = await leerDescuentosEfectivos(["fashion_shoes"], 2026, mes);
      expect(totalPorVendedor(r), `mes ${mes}`).toEqual({ "REYNALDO ESPINOSA": 1573.08 });
    }
  });

  it("la lectura pide `*` (si pidiera columnas por nombre, `desde`/`hasta` no llegarían)", () => {
    const src = leer("src/lib/comisiones/descuentos.ts");
    expect(src).toContain('.select("*")');
    expect(src).not.toContain('.select("id, empresa_key, concepto, monto, vendedor_nombre")');
  });
});

// ═══ 3. La migración ═════════════════════════════════════════════════════════
describe("🔴 la migración: aditiva, con CHECK, y las dos filas arrancan en julio", () => {
  const sql = leer(MIG);

  it("agrega las dos columnas sin borrar ni cambiar un monto", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS desde date/i);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS hasta date/i);
    expect(sql).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/UPDATE[\s\S]*SET[\s\S]*monto\s*=/i);
  });

  it("🔴 «Hasta» antes que «Desde» no existe: hay CHECK", () => {
    expect(sql).toMatch(/CHECK \(desde IS NULL OR hasta IS NULL OR hasta >= desde\)/i);
  });

  it("🔴 pone desde = 2026-01-01 a las DOS filas de Reynaldo en Fashion Shoes, por su llave y no por uuid", () => {
    expect(sql).toMatch(/SET desde = DATE '2026-01-01'/);
    // 🔴 Y NO le escribe `hasta`: Daniel, «el descuento es indefinido. No hay hasta.»
    expect(sql).not.toMatch(/SET[^;]*hasta\s*=/i);
    expect(sql).toContain("empresa_key = 'fashion_shoes'");
    expect(sql).toContain("vendedor_nombre = 'REYNALDO ESPINOSA'");
    expect(sql).toContain("concepto IN ('Descuento', 'Descuento de adelanto')");
    // Solo las que todavía no tienen fecha: repetirla no pisa una decisión posterior.
    expect(sql).toContain("WHERE desde IS NULL");
    expect(sql).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
  });

  it("deja escrita la medición y la decisión de Daniel, textual", () => {
    expect(sql).toContain("14.157,72");
    expect(sql).toContain("1.573,08");
    expect(sql).toMatch(/el descuento es indefinido\. No hay/i);
    expect(sql).toMatch(/Ponlo desde enero/i);
    // 🔴 Y que NINGÚN número se mueve: es la condición del cambio.
    expect(sql).toContain("67.815,75");
  });
});
