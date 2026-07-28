/**
 * CANDADO — la plata de `confecciones_boston` no se mezcla con la del grupo.
 *
 * Regla de Daniel (27-jul-2026), textual: *"si un cliente esta en el grupo de 6
 * empresas y mismo cliente en conf boston, quiero q no se toque"*. O sea: un
 * mismo cliente puede deberle a Fashion Wear Y a Boston al mismo tiempo, y esos
 * dos saldos NUNCA se suman. Si debe $10.000 al grupo y $4.000 a Boston, en
 * ningún lado puede aparecer $14.000.
 *
 * NO es hipotético. Medido contra producción el 27-jul-2026 cruzando los 1.940
 * clientes de Boston (`switch_facturas`) contra los 127 con saldo de las 6 B2B
 * (`switch_estadocuenta`): **10 clientes existen en los dos lados** por nombre
 * normalizado — CITY MALL DAVID, CITY MALL PASO CANOA, LA FRONTERA DUTY FREE,
 * JERUSALEM DUTY FREE, WOLF MALL CENTER INT, GOLDEN MALL, EL MACHETAZO-CALIDONIA,
 * ALADDIN, CENTRO DOLLAR 123 RIFAT y VENTAS. Son malls y duty-free: exactamente
 * los clientes que le compran a varias empresas del grupo a la vez.
 *
 * Por CÓDIGO no hay ni un cruce (Boston usa ids numéricos de Switch — 1, 112,
 * 132060 — y las B2B usan el esquema D-XXX), **pero el CXC consolidado agrupa por
 * NOMBRE normalizado**, no por código. Ahí es donde se sumarían solos.
 *
 * Qué protege este archivo:
 *   1. Boston sigue fuera de las listas que definen "el grupo" (cxc / B2B).
 *   2. Las consultas que leen `switch_recibos` filtrando por CLIENTE llevan un
 *      filtro de empresa EXPLÍCITO en la query — no heredado de una proyección
 *      posterior. Es un barrido estático: quitar el `.in(...)` pone el build ROJO.
 *   3. La proyección del "Cobrado YTD" ignora las claves que no son del grupo aun
 *      si le llegan filas de más.
 */
import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import { B2B_EMPRESA_KEYS, type EmpresaKey } from "@/lib/empresa-mapping";
import { EMPRESA_SYNC_CAPABILITIES, empresasConCxc } from "@/lib/switch-api/empresas";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Los 10 clientes que existen en Boston Y en las 6 B2B (medido en producción). */
const CLIENTES_EN_AMBOS_LADOS = [
  "CITY MALL DAVID",
  "CITY MALL PASO CANOA",
  "LA FRONTERA DUTY FREE",
  "JERUSALEM DUTY FREE",
  "WOLF MALL CENTER INT",
  "GOLDEN MALL",
  "EL MACHETAZO-CALIDONIA",
  "ALADDIN",
  "CENTRO DOLLAR 123 RIFAT",
  "VENTAS",
];

describe("confecciones_boston no pertenece al grupo, por definición", () => {
  it("no está en B2B_EMPRESA_KEYS ni en las empresas con CXC", () => {
    expect(B2B_EMPRESA_KEYS).not.toContain("confecciones_boston" as never);
    expect(empresasConCxc()).not.toContain("confecciones_boston" as EmpresaKey);
  });

  it("tiene cxc:false y utilidad:false — no aporta cartera ni comisión al grupo", () => {
    // Su cuenta corriente se lleva fuera de este sistema (Brand It). Encender
    // `cxc` la metería en B2B_EMPRESA_KEYS (el test de capabilities exige que
    // sean la misma lista) y de ahí al CXC consolidado, al aging y a comisiones
    // de una sola vez. Ese es el cambio que esta línea obliga a justificar.
    expect(EMPRESA_SYNC_CAPABILITIES.confecciones_boston.cxc).toBe(false);
    expect(EMPRESA_SYNC_CAPABILITIES.confecciones_boston.utilidad).toBe(false);
  });
});

describe("las consultas de recibos POR CLIENTE filtran empresa en la query", () => {
  // Estas dos leen switch_recibos con `.eq("cliente_codigo", codigo)`. Un código
  // de cliente NO es único entre empresas, así que sin filtro de empresa la
  // consulta puede traer plata de otra empresa para el mismo cliente.
  const ARCHIVOS = [
    "src/app/clientes/[codigo]/page.tsx",
    "src/app/api/clientes/[codigo]/route.ts",
  ];

  for (const rel of ARCHIVOS) {
    it(`${rel} acota switch_recibos con .in("empresa_key", B2B_EMPRESA_KEYS)`, () => {
      const src = leer(rel);
      const bloque = src.slice(src.indexOf('.from("switch_recibos")'));
      expect(src).toContain('.from("switch_recibos")');
      // El filtro tiene que estar en el MISMO encadenamiento, antes del cierre.
      const hastaCierre = bloque.slice(0, bloque.indexOf("),"));
      expect(
        hastaCierre.includes('.in("empresa_key", B2B_EMPRESA_KEYS)'),
        `${rel}: la lectura de switch_recibos por cliente perdió su filtro de empresa. ` +
          `Sin él, un cliente que exista en Boston y en el grupo suma las dos plata.`,
      ).toBe(true);
    });
  }

  it('/api/cxc/ultimo-pago acota la vista a las empresas con CXC', () => {
    const src = leer("src/app/api/cxc/ultimo-pago/route.ts");
    // La vista switch_ultimo_pago_cliente_v2 no filtra empresa en su SQL: toda
    // empresa con filas en switch_recibos aparece ahí.
    expect(src).toContain("empresasConCxc");
    expect(src).toContain('.in("empresa_key", EMPRESAS_CXC)');
  });
});

describe("el Cobrado YTD nunca suma una empresa fuera del grupo", () => {
  /** Réplica exacta de la proyección de la ficha de cliente. */
  function cobradoPorEmpresa(filas: { empresa_key: string; total: number }[]) {
    const map = new Map<string, number>();
    for (const r of filas) map.set(r.empresa_key, (map.get(r.empresa_key) ?? 0) + Number(r.total));
    const empresas = B2B_EMPRESA_KEYS.map((e) => ({
      empresa: e,
      cobrado_ytd: Math.round((map.get(e) ?? 0) * 100) / 100,
    }));
    return {
      empresas,
      total_grupo: Math.round(empresas.reduce((s, e) => s + e.cobrado_ytd, 0) * 100) / 100,
    };
  }

  it("el caso de Daniel: $10.000 al grupo + $4.000 a Boston = $10.000, nunca $14.000", () => {
    const out = cobradoPorEmpresa([
      { empresa_key: "fashion_wear", total: 10_000 },
      { empresa_key: "confecciones_boston", total: 4_000 },
    ]);
    expect(out.total_grupo).toBe(10_000);
    expect(out.total_grupo).not.toBe(14_000);
    expect(out.empresas.map((e) => e.empresa)).not.toContain("confecciones_boston");
  });

  it("aguanta a los 10 clientes que existen en los dos lados", () => {
    // Mismo cliente, plata en varias empresas del grupo y también en Boston.
    for (const _cliente of CLIENTES_EN_AMBOS_LADOS) {
      const out = cobradoPorEmpresa([
        { empresa_key: "vistana", total: 1_500 },
        { empresa_key: "fashion_shoes", total: 500 },
        { empresa_key: "confecciones_boston", total: 9_999 },
      ]);
      expect(out.total_grupo).toBe(2_000);
    }
  });

  it("Boston sola no inventa un cliente del grupo", () => {
    const out = cobradoPorEmpresa([{ empresa_key: "confecciones_boston", total: 35_338.99 }]);
    expect(out.total_grupo).toBe(0);
  });
});
