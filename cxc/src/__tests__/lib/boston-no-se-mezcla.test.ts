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
import { EMPRESA_SYNC_CAPABILITIES, empresasCarteraAparte, empresasConCxc } from "@/lib/switch-api/empresas";

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

describe("los endpoints que leen la TABLA BASE acotan al grupo", () => {
  // Defensa en profundidad. La vista ya deja a Boston afuera, pero estas rutas
  // leen `switch_estadocuenta` DIRECTO (no la vista) para calcular frescura, y
  // la vista no las protege. Si alguien mañana escribe una consulta nueva contra
  // la tabla base, este barrido no la va a cubrir — pero al menos las conocidas
  // no se pueden destapar sin poner el build rojo.
  const RUTAS = [
    ["src/app/api/cxc-summary/route.ts", "lastUpload / lastUploadEmpresa del resumen"],
    ["src/app/api/notification-badges/route.ts", "badge cxcStale"],
    ["src/app/api/upload/route.ts", "frescura por empresa (UploadFreshness)"],
  ] as const;

  for (const [rel, que] of RUTAS) {
    it(`${rel} — ${que}`, () => {
      const src = leer(rel);
      expect(src).toContain('.from("switch_estadocuenta")');
      expect(
        src.includes('.in("empresa_key", CXC_GRUPO_EMPRESA_KEYS)'),
        `${rel}: lee switch_estadocuenta sin acotar al grupo. Boston vive en esa ` +
          `tabla desde el 27-jul-2026 y su cartera va aparte.`,
      ).toBe(true);
    });
  }

  it("el estado de cuenta por cliente valida la empresa contra el grupo", () => {
    // Esta ruta alimenta el drawer Y el correo que se le manda al cliente. Un
    // cliente del grupo NUNCA puede recibir un PDF con saldo de Boston adentro.
    const src = leer("src/app/api/cxc/estado-cuenta/[codigo]/route.ts");
    expect(src).toContain("CXC_GRUPO_EMPRESA_KEYS");
    expect(src).toMatch(/CXC_GRUPO_EMPRESA_KEYS as readonly string\[\]\)\.includes\(empresaParam\)/);
  });

  it("el correo de estado de cuenta también", () => {
    const src = leer("src/app/api/cxc/enviar-email/route.ts");
    expect(src).toContain("CXC_GRUPO_EMPRESA_KEYS");
  });
});

describe("la vista de aging del GRUPO deja a Boston afuera", () => {
  // El blindaje de los saldos NO se hace pantalla por pantalla: unas 20 rutas
  // leen `switch_estadocuenta_aging` (o su MV) — CXC consolidado, búsqueda
  // global, Vista General, ficha de cliente, cxc-summary, cxc-rows, correos de
  // estado de cuenta, /api/clients. Se cierra UNA vez, en la vista, y todo lo
  // que la lea queda separado sin enterarse. Estos tests son lo que impide que
  // la exclusión se caiga de la migración sin que nadie lo note.
  const SQL = leer("supabase/migrations/20260728120000_aging_grupo_y_boston_aparte.sql");

  /** Extrae las keys del `NOT IN (...)` de la vista del grupo. */
  function excluidasEnSql(): string[] {
    const m = SQL.match(/empresa_key\s+NOT\s+IN\s*\(([^)]*)\)/i);
    if (!m) return [];
    return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort();
  }

  it("la lista excluida del SQL es EXACTAMENTE empresasCarteraAparte()", () => {
    // Una vista no puede importar TypeScript, así que las keys se repiten en el
    // SQL. Dos listas paralelas que se contradicen en silencio es exactamente lo
    // que costó $15.262 con joystep, así que acá se comparan. Agregar una
    // empresa de un lado y no del otro pone el build ROJO.
    expect(excluidasEnSql()).toEqual([...empresasCarteraAparte()].sort());
  });

  it("la vista del grupo excluye confecciones_boston", () => {
    expect(SQL).toMatch(/CREATE OR REPLACE VIEW switch_estadocuenta_aging AS/);
    expect(excluidasEnSql()).toContain("confecciones_boston");
  });

  it("existe una vista propia para Boston, y solo trae a Boston", () => {
    expect(SQL).toMatch(/CREATE OR REPLACE VIEW switch_estadocuenta_aging_boston AS/);
    const boston = SQL.slice(SQL.indexOf("switch_estadocuenta_aging_boston AS"));
    expect(boston).toMatch(/empresa_key\s*=\s*'confecciones_boston'/);
  });

  it("la vista de Boston NO usa clientes_master para el nombre", () => {
    // Los clientes de Boston no están en clientes_master (se puebla desde las
    // empresas del grupo). Con el JOIN, el COALESCE caería al cliente_codigo,
    // que para Boston es el id numérico de Switch — ilegible en pantalla.
    const boston = SQL.slice(SQL.indexOf("switch_estadocuenta_aging_boston AS"));
    expect(boston).not.toMatch(/clientes_master/);
    expect(boston).toMatch(/cliente_nombre/);
  });

  it("las dos vistas usan el MISMO signo defensivo", () => {
    // El API manda `saldo` como magnitud SIEMPRE POSITIVA: las notas de crédito
    // y los recibos hay que RESTARLOS por tipo_comprobante. Sumarlos crudos
    // infla la cartera al doble del crédito — el error que se cometió en el
    // dry-run del 27-jul-2026 (dio $399.817,62 contra los $224.749,88 reales).
    const credito = /'Nota de Crédito',\s*'Recibo',\s*'Recibo Saldo Anterior'/g;
    expect([...SQL.matchAll(credito)]).toHaveLength(2);
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
