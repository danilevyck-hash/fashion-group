// ============================================================================
// CANDADO — MARKETING, EL CIMIENTO DEL REDISEÑO (22-sep-2026).
//
// Lo que Daniel definió ese día y este archivo no deja aflojar:
//
//   1. UN GASTO TIENE UNA MARCA. Con dos, el guardado se frena en las TRES
//      puertas (factura · entrega · impulsadora) y el build se pone rojo si
//      alguna deja de preguntar.
//   2. `se_reporta` APAGADO NO SUMA en el período ni va al ZIP; prendido es el
//      default y `null` se lee como prendido (lo de hoy).
//   3. EL PROVEEDOR SE COMPARA POR IGUALDAD DEL NORMALIZADO, nunca `includes`:
//      «S a», «S.A.», puntos, acentos, mayúsculas y espacios dobles no lo
//      vuelven otro proveedor.
//   4. EL DUPLICADO NO SE CUELA por un cero de más ni por otra grafía: mismo
//      proveedor + mismo monto + misma fecha + MISMA TIENDA → no se guarda.
//      🔴 23-sep-2026, Daniel: *«me debes dejar subir si las facturas suman
//      igual pero cliente es diferente, como en el caso de Impreco a Nova
//      Lux»* — la TIENDA entra a la llave («General» es una tienda más) y dos
//      NÚMEROS de factura distintos nunca son la misma factura; si a alguna le
//      falta el número, decide la llave.
//   5. LAS MIGRACIONES SON ADITIVAS: no borran ni modifican un valor que
//      exista, `se_reporta` nace `NOT NULL DEFAULT true`, la tienda se COPIA
//      del proyecto solo donde está en NULL, y `proyecto_id` no se toca.
//   6. EL CÓDIGO FALLA ABIERTO SIN LA MIGRACIÓN: «esa columna no existe» se
//      relee sin ella y se completa con el valor de hoy.
//   7. EL PROYECTO NO VUELVE A DECIDIR LA TIENDA: los módulos puros no
//      conocen `proyecto_id`; «General» junta lo que no es de ninguna tienda.
//   8. «ELIMINAR DEFINITIVAMENTE» NO VUELVE: ni el botón, ni la función, y
//      las dos rutas contestan 403. `mk_proyecto_marcas` queda sin lectores
//      ni escritores y NINGUNA migración la dropea.
//   9. LA NOTA DE CRÉDITO ES TEXTO y no entra en ningún cálculo.
//
// Verificado por mutación: `scripts/_mutar-candados-marketing-cimiento.sh`.
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  ErrorMarcaRepartida,
  ROTULO_DE_TIPO,
  SE_REPORTA_POR_DEFECTO,
  TABLA_DE_TIPO,
  TIENDA_GENERAL,
  TIPOS_DE_GASTO,
  armarGasto,
  esTipoDeGasto,
  exigirUnaMarca,
  faltantesDelGasto,
  rotuloTienda,
  seReportaDe,
  tipoDeFila,
} from "@/lib/marketing/gasto";
import {
  MAX_SUGERENCIAS,
  mismoProveedor,
  normalizarProveedor,
  sugerirProveedores,
} from "@/lib/marketing/proveedor";
import {
  buscarDuplicado,
  claveDeDuplicado,
  esDuplicado,
  mensajeDuplicado,
  montoClave,
  numeroClave,
  numerosSeContradicen,
  tiendaClave,
} from "@/lib/marketing/duplicado";
import {
  ESTADOS_PERIODO,
  MSG_FALTA_NOMBRE,
  TRANSICIONES,
  abrirSiguiente,
  aceptaGastos,
  anotarZip,
  armarCierre,
  nombrePorDefectoDelSiguiente,
  puedeCerrar,
  sumaEnElPeriodo,
  totalesDelPeriodo,
} from "@/lib/marketing/periodo-estado";
import { agruparPorTienda, totalReportadoDe } from "@/lib/marketing/agrupar-por-tienda";
import {
  COLUMNAS_DEL_GASTO,
  COLUMNAS_DEL_PERIODO,
  completarGasto,
  completarPeriodo,
  conRespaldoSinColumnas,
  esColumnaAusente,
  sinColumnasDelRediseno,
} from "@/lib/marketing/columnas-opcionales";
import { CLASIFICACION } from "@/lib/backup/tablas";
import { formatearFecha } from "@/lib/marketing/normalizar";

const RAIZ = path.resolve(__dirname, "../../..");
const SRC = path.join(RAIZ, "src");
const MIGRACIONES = path.join(RAIZ, "supabase", "migrations");
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Fuera comentarios: lo que explica que algo se fue no cuenta como que volvió. */
function sinComentarios(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}
const codigo = (rel: string) => sinComentarios(leer(rel));

function archivosDe(dir: string, out: string[] = []): string[] {
  for (const nombre of fs.readdirSync(dir)) {
    const p = path.join(dir, nombre);
    if (fs.statSync(p).isDirectory()) archivosDe(p, out);
    else if (/\.(ts|tsx)$/.test(nombre)) out.push(p);
  }
  return out;
}

const MIG_GASTO = "supabase/migrations/20261216120000_marketing_gasto_tienda_se_reporta.sql";
const MIG_PERIODO = "supabase/migrations/20261216120100_marketing_periodo_cierre_y_zips.sql";
/** SQL sin comentarios `--`. */
const sqlDe = (rel: string) =>
  leer(rel)
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");

// ═════════════════════════════════════════════════════════════════════════════
describe("1 · 🔴 UN GASTO TIENE UNA MARCA", () => {
  it("con una marca la devuelve; con dos o con cero lanza `ErrorMarcaRepartida`", () => {
    expect(exigirUnaMarca([{ marcaId: "th" }]).marcaId).toBe("th");
    expect(() => exigirUnaMarca([{ marcaId: "th" }, { marcaId: "ck" }])).toThrow(ErrorMarcaRepartida);
    expect(() => exigirUnaMarca([])).toThrow(ErrorMarcaRepartida);
    expect(() => exigirUnaMarca([{ marcaId: "" }])).toThrow(ErrorMarcaRepartida);
  });

  it("la MISMA marca repetida no es «dos marcas» (un formulario que la manda dos veces)", () => {
    expect(exigirUnaMarca([{ marcaId: "th" }, { marcaId: "th" }]).marcaId).toBe("th");
  });

  it("el mensaje dice cuántas llegaron y qué hacer, en tuteo", () => {
    try {
      exigirUnaMarca([{ marcaId: "a" }, { marcaId: "b" }]);
      expect.unreachable();
    } catch (e) {
      const err = e as ErrorMarcaRepartida;
      expect(err.marcas).toBe(2);
      expect(err.message).toMatch(/UNA marca/);
      expect(err.message).toMatch(/se registra dos veces/);
    }
  });

  it("🔴 las TRES puertas que escriben marcas pasan por `exigirUnaMarca`", () => {
    const factura = codigo("src/lib/marketing/factura-marcas.ts");
    const entrega = codigo("src/lib/marketing/inventario.ts");
    const impulsadora = codigo("src/lib/marketing/impulsadoras.ts");
    expect(factura).toMatch(/exigirUnaMarca\(marcas\)/);
    expect(entrega.match(/exigirUnaMarca\(marcasPct\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(impulsadora).toMatch(/exigirUnaMarca\(marcas\)/);
    for (const [nombre, src] of [
      ["factura-marcas", factura],
      ["inventario", entrega],
      ["impulsadoras", impulsadora],
    ] as const) {
      expect(src, `${nombre} importa la puerta de gasto.ts`).toMatch(
        /import \{[^}]*exigirUnaMarca[^}]*\} from "\.\/gasto"/,
      );
    }
  });

  it("la lista de tipos es cerrada y cada tipo sabe en qué tabla vive", () => {
    expect([...TIPOS_DE_GASTO]).toEqual(["factura", "mueble", "impulsadora"]);
    expect(TABLA_DE_TIPO).toEqual({
      factura: "mk_facturas",
      mueble: "mk_entregas_muebles",
      impulsadora: "mk_facturas",
    });
    for (const t of TIPOS_DE_GASTO) expect(ROTULO_DE_TIPO[t].length).toBeGreaterThan(3);
    expect(esTipoDeGasto("factura")).toBe(true);
    expect(esTipoDeGasto("proyecto")).toBe(false);
    expect(tipoDeFila({ tabla: "mk_facturas", impulsadora_id: "x" })).toBe("impulsadora");
    expect(tipoDeFila({ tabla: "mk_facturas", impulsadora_id: null })).toBe("factura");
    expect(tipoDeFila({ tabla: "mk_entregas_muebles" })).toBe("mueble");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("2 · 🔴 `se_reporta` apagado NO suma; prendido es el default", () => {
  it("nace prendido, y solo un `false` explícito apaga", () => {
    expect(SE_REPORTA_POR_DEFECTO).toBe(true);
    expect(seReportaDe(undefined)).toBe(true);
    expect(seReportaDe(null)).toBe(true);
    expect(seReportaDe(true)).toBe(true);
    expect(seReportaDe(false)).toBe(false);
    expect(sumaEnElPeriodo({ seReporta: false })).toBe(false);
    expect(sumaEnElPeriodo({ seReporta: null })).toBe(true);
    expect(sumaEnElPeriodo({})).toBe(true);
  });

  it("el total del período es SOLO lo reportado; lo apagado va aparte y no se suma", () => {
    const t = totalesDelPeriodo([
      { monto: 100, seReporta: true },
      { monto: 50.5 },
      { monto: 999, seReporta: false },
    ]);
    expect(t).toEqual({
      reportado: 150.5,
      noReportado: 999,
      cantidadReportada: 2,
      cantidadNoReportada: 1,
    });
  });

  it("`armarGasto` conserva el apagado y pone el default cuando no viene", () => {
    const base = { id: "g1", tipo: "factura", marcaCodigo: "th", monto: "10", fecha: "2026-09-22" };
    expect(armarGasto({ ...base, seReporta: false }).seReporta).toBe(false);
    expect(armarGasto(base).seReporta).toBe(true);
    expect(armarGasto(base).marcaCodigo).toBe("TH");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("3 · 🔴 el proveedor: una sola grafía, igualdad y nunca `includes`", () => {
  it("normaliza «S a», «S.A.», «S. A.», puntos, acentos, mayúsculas y espacios dobles", () => {
    const esperado = "impresora comercial";
    for (const grafia of [
      "Impresora Comercial",
      "IMPRESORA COMERCIAL S.A.",
      "Impresora Comercial, S. A.",
      "Impresora  Comercial S a",
      "impresora comercial sa",
      "Impresora Comercial, S.A",
    ]) {
      expect(normalizarProveedor(grafia), grafia).toBe(esperado);
    }
    expect(normalizarProveedor("Premium Paint Panamá, S.A.")).toBe("premium paint panama");
    expect(normalizarProveedor("Confecciones Boston S a")).toBe("confecciones boston");
    expect(normalizarProveedor("  ")).toBe("");
    expect(normalizarProveedor(null)).toBe("");
  });

  it("la cola de sociedad se quita solo al FINAL, y nunca vacía el nombre", () => {
    expect(normalizarProveedor("Sa Marketing")).toBe("sa marketing");
    // Un nombre que es SOLO la cola no se vacía: queda algo con qué comparar.
    expect(normalizarProveedor("S.A.").length).toBeGreaterThan(0);
  });

  it("🔴 `mismoProveedor` es igualdad del normalizado: «nova» NO es «Renovación»", () => {
    expect(mismoProveedor("Impresora Comercial S.A.", "impresora comercial")).toBe(true);
    expect(mismoProveedor("Nova", "Renovación S.A.")).toBe(false);
    expect(mismoProveedor("Premium", "Premium Paint")).toBe(false);
    expect(mismoProveedor("", "")).toBe(false);
  });

  it("🔴 en el módulo no hay `includes` ni `indexOf` sobre el nombre", () => {
    const src = codigo("src/lib/marketing/proveedor.ts");
    expect(src).not.toMatch(/\.includes\(/);
    expect(src).not.toMatch(/\.indexOf\(/);
    // Sugerir es por PREFIJO del normalizado, que es lo único permitido.
    expect(src).toMatch(/\.startsWith\(prefijo\)/);
  });

  it("sugiere por prefijo, UNA grafía por proveedor (la más usada), sin repetir", () => {
    const historico = [
      "Impresora Comercial",
      "IMPRESORA COMERCIAL S.A.",
      "Impresora Comercial",
      "Premium Paint Panama",
      "Premium Paint Panamá S.A.",
      "Confecciones Boston",
    ];
    const s = sugerirProveedores("impre", historico);
    expect(s).toEqual([{ nombre: "Impresora Comercial", usos: 3 }]);
    // «nova» contra «Renovación»: prefijo, no substring.
    expect(sugerirProveedores("paint", historico)).toEqual([]);
    // Vacío → los más usados, ordenados.
    const todos = sugerirProveedores("", historico);
    expect(todos.map((x) => x.nombre)).toEqual([
      "Impresora Comercial",
      "Premium Paint Panama",
      "Confecciones Boston",
    ]);
    expect(sugerirProveedores("", historico, 1)).toHaveLength(1);
    expect(MAX_SUGERENCIAS).toBe(8);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("4 · 🔴 el duplicado no se cuela", () => {
  const existentes = [
    { id: "a", proveedor: "Impresora Comercial S.A.", monto: 55.64, fecha: "2026-04-08", numero: "0000063894" },
    { id: "b", proveedor: "Confecciones Boston", monto: 6163.2, fecha: "2026-09-10", numero: "11-00007766" },
  ];

  it("mismo proveedor (otra grafía) + mismo monto + misma fecha → duplicado, con otro número", () => {
    const nuevo = { proveedor: "IMPRESORA COMERCIAL, S. A.", monto: "55.640", fecha: "2026-04-08" };
    expect(esDuplicado(nuevo, existentes)).toBe(true);
    expect(buscarDuplicado(nuevo, existentes)?.id).toBe("a");
    // El «cero de más» en el número no lo salva: el número no está en la clave.
    expect(esDuplicado({ proveedor: "Confecciones Boston S a", monto: 6163.2, fecha: "2026-09-10" }, existentes)).toBe(true);
  });

  it("cambia UNO de los tres y ya no es duplicado", () => {
    expect(esDuplicado({ proveedor: "Impresora Comercial", monto: 55.65, fecha: "2026-04-08" }, existentes)).toBe(false);
    expect(esDuplicado({ proveedor: "Impresora Comercial", monto: 55.64, fecha: "2026-04-09" }, existentes)).toBe(false);
    expect(esDuplicado({ proveedor: "Premium Paint", monto: 55.64, fecha: "2026-04-08" }, existentes)).toBe(false);
  });

  it("editar la misma fila no se acusa a sí misma; sin los tres datos no se afirma nada", () => {
    expect(esDuplicado({ id: "a", proveedor: "Impresora Comercial", monto: 55.64, fecha: "2026-04-08" }, existentes)).toBe(false);
    expect(claveDeDuplicado({ proveedor: "", monto: 1, fecha: "2026-01-01" })).toBe("");
    expect(claveDeDuplicado({ proveedor: "X", monto: "no", fecha: "2026-01-01" })).toBe("");
    expect(claveDeDuplicado({ proveedor: "X", monto: 1, fecha: "ayer" })).toBe("");
    expect(montoClave(55.640)).toBe("55.64");
    expect(montoClave(0.1 + 0.2)).toBe("0.30");
  });

  it("el mensaje dice cuál es y que no se guarda dos veces", () => {
    const m = mensajeDuplicado(existentes[0]);
    expect(m).toMatch(/Impresora Comercial S\.A\./);
    expect(m).toMatch(/\$55\.64/);
    expect(m).toMatch(/2026-04-08/);
    expect(m).toMatch(/0000063894/);
    expect(m).toMatch(/No se guarda dos veces/);
  });

  it("🔴 la clave es proveedor NORMALIZADO + monto a DOS decimales + fecha + TIENDA", () => {
    expect(claveDeDuplicado({ proveedor: "Impresora Comercial, S.A.", monto: 55.6, fecha: "2026-04-08" })).toBe(
      "impresora comercial|55.60|2026-04-08|GENERAL",
    );
    expect(
      claveDeDuplicado({ proveedor: "Impresora Comercial", monto: 55.6, fecha: "2026-04-08", tienda: "d-170" }),
    ).toBe("impresora comercial|55.60|2026-04-08|D-170");
    const src = codigo("src/lib/marketing/duplicado.ts");
    expect(src).toMatch(/normalizarProveedor\(g\.proveedor\)/);
    expect(src).toMatch(/toFixed\(2\)/);
    expect(src).toMatch(/tiendaClave\(g\.tienda\)/);
  });

  // ── 23-sep-2026 · «Impreco a Nova Lux» ─────────────────────────────────────
  const conTienda = [
    {
      id: "n1",
      proveedor: "Impresora Comercial S.A.",
      monto: 470.13,
      fecha: "2026-09-18",
      tienda: "D-170",
      numero: "0000065457",
    },
  ];

  it("🔴 mismo proveedor, monto y fecha para OTRA tienda SÍ se puede subir", () => {
    // El caso de Daniel: Impreco le hizo el mismo trabajo, el mismo día, por
    // el mismo monto, a dos tiendas distintas.
    expect(
      esDuplicado({ proveedor: "Impresora Comercial", monto: 470.13, fecha: "2026-09-18", tienda: "D-80" }, conTienda),
    ).toBe(false);
    // Y «General» es una tienda más: tampoco choca con la de Nova Lux.
    expect(esDuplicado({ proveedor: "Impresora Comercial", monto: 470.13, fecha: "2026-09-18" }, conTienda)).toBe(false);
    // La MISMA tienda sigue frenada (sin número, decide la llave).
    expect(
      esDuplicado({ proveedor: "Impresora Comercial", monto: 470.13, fecha: "2026-09-18", tienda: "d-170 " }, conTienda),
    ).toBe(true);
    expect(tiendaClave(null)).toBe("GENERAL");
    expect(tiendaClave("  d-170 ")).toBe("D-170");
  });

  it("🔴 dos NÚMEROS de factura distintos no son la misma factura; el cero de relleno no cuenta", () => {
    // Misma tienda, mismo monto, misma fecha, otro número → se puede subir.
    expect(
      esDuplicado(
        { proveedor: "Impresora Comercial", monto: 470.13, fecha: "2026-09-18", tienda: "D-170", numero: "0000065458" },
        conTienda,
      ),
    ).toBe(false);
    // El MISMO número escrito con un cero de más sigue siendo el mismo.
    expect(
      esDuplicado(
        { proveedor: "Impresora Comercial", monto: 470.13, fecha: "2026-09-18", tienda: "D-170", numero: "00000065457" },
        conTienda,
      ),
    ).toBe(true);
    // Si a una le falta el número, no contradice nada: decide la llave.
    expect(
      esDuplicado(
        { proveedor: "Impresora Comercial", monto: 470.13, fecha: "2026-09-18", tienda: "D-170", numero: "" },
        conTienda,
      ),
    ).toBe(true);
    expect(numeroClave("11-000007766")).toBe(numeroClave("11-00007766"));
    expect(numeroClave("0000063894")).toBe("63894");
    expect(numerosSeContradicen("0000063894", "0000063895")).toBe(true);
    expect(numerosSeContradicen("0000063894", null)).toBe(false);
    expect(numerosSeContradicen(null, null)).toBe(false);
  });

  it("🔴 el mensaje dice PARA QUÉ TIENDA, y sin tienda dice General", () => {
    expect(mensajeDuplicado(conTienda[0])).toContain("para D-170");
    expect(mensajeDuplicado(existentes[0])).toContain(`para ${TIENDA_GENERAL}`);
  });

  it("🔴 las tres puertas del servidor mandan la tienda y el número", () => {
    const server = codigo("src/lib/marketing/puerta-gasto-server.ts");
    // La factura lee `tienda_codigo` con respaldo (falla ABIERTA sin la columna).
    expect(server).toMatch(/conRespaldoSinColumnas[\s\S]*?fecha_factura, tienda_codigo/);
    expect(server).toMatch(/huellaDeFila\(r, r\.fecha_factura, r\.tienda_codigo \?\? null\)/);
    // En un pago de impulsadora la «tienda» es LA IMPULSADORA.
    expect(server).toMatch(/buscarDuplicado\(\{ \.\.\.nuevo, tienda: impulsadoraId \}/);
    const mut = codigo("src/lib/marketing/mutations.ts");
    expect(mut).toMatch(/frenarFacturaDuplicada\(\{[\s\S]*?tienda: cols\.tienda_codigo \?\? null,[\s\S]*?numero,/);
    // Cambiar la tienda o el número al EDITAR también vuelve a preguntar.
    expect(mut).toMatch(/payload\.tienda_codigo !== undefined/);
    expect(mut).toMatch(/payload\.numero_factura !== undefined/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("5 · 🔴 las migraciones son ADITIVAS", () => {
  const ambas = [MIG_GASTO, MIG_PERIODO];

  it("existen las dos, con el encabezado narrativo de la casa", () => {
    for (const m of ambas) {
      expect(fs.existsSync(path.join(RAIZ, m)), m).toBe(true);
      expect(leer(m)).toMatch(/ADITIVA/);
      expect(leer(m)).toMatch(/22-sep-2026/);
    }
  });

  it("ninguna borra ni modifica un valor que exista: sin DROP, DELETE, TRUNCATE ni cambio de tipo", () => {
    for (const m of ambas) {
      const sql = sqlDe(m);
      expect(sql, m).not.toMatch(/DROP\s+(TABLE|COLUMN|CONSTRAINT|INDEX)/i);
      expect(sql, m).not.toMatch(/\bDELETE\s+FROM\b/i);
      expect(sql, m).not.toMatch(/\bTRUNCATE\b/i);
      expect(sql, m).not.toMatch(/ALTER\s+COLUMN\s+\w+\s+(TYPE|SET\s+NOT\s+NULL|DROP)/i);
      expect(sql, m).not.toMatch(/SET\s+proyecto_id/i);
      expect(sql, m).not.toMatch(/SET\s+anulado_en/i);
    }
  });

  it("todo `ADD COLUMN` lleva `IF NOT EXISTS`, y `se_reporta` nace `NOT NULL DEFAULT true`", () => {
    for (const m of ambas) {
      const sql = sqlDe(m);
      const adds = sql.match(/ADD\s+COLUMN[^,;]*/gi) ?? [];
      expect(adds.length, m).toBeGreaterThan(0);
      for (const a of adds) expect(a, `${m}: ${a}`).toMatch(/IF NOT EXISTS/i);
    }
    const gasto = sqlDe(MIG_GASTO);
    const seReporta = gasto.match(/ADD COLUMN IF NOT EXISTS se_reporta[^,;]*/gi) ?? [];
    expect(seReporta).toHaveLength(2); // mk_facturas y mk_entregas_muebles
    for (const s of seReporta) expect(s).toMatch(/boolean\s+NOT NULL\s+DEFAULT\s+true/i);
    expect(gasto).toMatch(/ALTER TABLE mk_adjuntos\s+ADD COLUMN IF NOT EXISTS tienda_codigo/);
  });

  it("🔴 la tienda se COPIA del proyecto, solo donde está en NULL, y nunca pisa lo escrito", () => {
    const gasto = sqlDe(MIG_GASTO);
    const updates = gasto.match(/UPDATE\s+[\s\S]*?;/gi) ?? [];
    expect(updates).toHaveLength(3); // facturas · entregas · adjuntos
    for (const u of updates) {
      expect(u).toMatch(/SET\s+tienda_codigo\s*=\s*p\.tienda_codigo/i);
      expect(u).toMatch(/\.tienda_codigo IS NULL/i);
      expect(u).toMatch(/p\.tienda_codigo IS NOT NULL/i);
      expect(u).not.toMatch(/proyecto_id\s*=\s*NULL/i);
    }
    // El UPDATE no toca nada más que tienda_codigo.
    for (const u of updates) expect(u.match(/SET\s+(\w+)/i)?.[1]).toBe("tienda_codigo");
  });

  it("`mk_proyecto_marcas` y `mk_proyectos` se ROTULAN retiradas; ninguna migración las dropea", () => {
    const gasto = sqlDe(MIG_GASTO);
    expect(gasto).toMatch(/COMMENT ON TABLE mk_proyecto_marcas IS\s+'RETIRADA/);
    expect(gasto).toMatch(/COMMENT ON TABLE mk_proyectos IS\s+'RETIRADA DEL MODELO/);
    const sqls = fs.readdirSync(MIGRACIONES).filter((f) => f.endsWith(".sql"));
    expect(sqls.length).toBeGreaterThan(20);
    for (const f of sqls) {
      const sql = sqlDe(path.join("supabase/migrations", f));
      for (const t of ["mk_proyecto_marcas", "mk_proyectos", "mk_facturas", "mk_entregas_muebles", "mk_adjuntos", "mk_periodos"]) {
        expect(sql, `${f} no puede dropear ${t}`).not.toMatch(new RegExp(`DROP\\s+TABLE[^;]*\\b${t}\\b`, "i"));
        expect(sql, `${f} no puede truncar ${t}`).not.toMatch(new RegExp(`TRUNCATE[^;]*\\b${t}\\b`, "i"));
      }
    }
  });

  it("la nota de crédito nace como TEXTO y el registro de ZIPs como LISTA", () => {
    const periodo = sqlDe(MIG_PERIODO);
    expect(periodo).toMatch(/ADD COLUMN IF NOT EXISTS nota_credito\s+text/);
    expect(periodo).not.toMatch(/nota_credito\s+numeric/i);
    expect(periodo).toMatch(/ADD COLUMN IF NOT EXISTS zips_bajados\s+jsonb NOT NULL DEFAULT '\[\]'::jsonb/);
    expect(periodo).toMatch(/jsonb_typeof\(zips_bajados\) = 'array'/);
    expect(periodo).toMatch(/ADD COLUMN IF NOT EXISTS nombre_al_cerrar\s+text/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("6 · 🔴 sin la migración, el código se porta como hoy", () => {
  it("reconoce «esa columna no existe» (PGRST204 · 42703 · el texto), y NADA más", () => {
    expect(esColumnaAusente({ code: "PGRST204", message: "x" })).toBe(true);
    expect(esColumnaAusente({ code: "42703", message: "x" })).toBe(true);
    expect(esColumnaAusente({ message: "Could not find the 'se_reporta' column of 'mk_facturas' in the schema cache" })).toBe(true);
    expect(esColumnaAusente({ message: 'column mk_facturas.tienda_codigo does not exist' })).toBe(true);
    expect(esColumnaAusente({ code: "PGRST205", message: "Could not find the table" })).toBe(false);
    expect(esColumnaAusente({ code: "57014", message: "canceling statement due to statement timeout" })).toBe(false);
    expect(esColumnaAusente({ code: "42501", message: "permission denied" })).toBe(false);
    expect(esColumnaAusente(null)).toBe(false);
  });

  it("completa la fila con el valor de hoy, sin pisar lo que sí vino", () => {
    expect(COLUMNAS_DEL_GASTO).toEqual({ se_reporta: true, tienda_codigo: null, nota: null });
    expect(completarGasto({ id: "f1" })).toEqual({ id: "f1", se_reporta: true, tienda_codigo: null, nota: null });
    expect(completarGasto({ id: "f1", se_reporta: false, tienda_codigo: "D-25", nota: "Apertura" })).toEqual({
      id: "f1", se_reporta: false, tienda_codigo: "D-25", nota: "Apertura",
    });
    expect(COLUMNAS_DEL_PERIODO.zips_bajados).toEqual([]);
    expect(completarPeriodo({ id: "p1", estado: "abierto" })).toEqual({
      id: "p1", estado: "abierto", nombre_al_cerrar: null, nota_credito: null, zips_bajados: [],
    });
  });

  it("con la columna ausente relee SIN ella y avisa; con otro error, lo devuelve tal cual", async () => {
    const avisos: string[] = [];
    const r1 = await conRespaldoSinColumnas(
      async () => ({ data: null, error: { code: "PGRST204", message: "Could not find the 'se_reporta' column" } }),
      async () => ({ data: [{ id: "f1" }], error: null }),
      (m) => avisos.push(m),
    );
    expect(r1.conLasColumnas).toBe(false);
    expect(r1.resultado.data).toEqual([{ id: "f1" }]);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatch(/se sigue como antes de la migración/);

    const r2 = await conRespaldoSinColumnas(
      async () => ({ data: [{ id: "f1", se_reporta: false }], error: null }),
      async () => { throw new Error("no debía llamarse"); },
    );
    expect(r2.conLasColumnas).toBe(true);

    const timeout = { code: "57014", message: "statement timeout" };
    const r3 = await conRespaldoSinColumnas(
      async () => ({ data: null, error: timeout }),
      async () => { throw new Error("no debía llamarse"); },
    );
    expect(r3.resultado.error).toBe(timeout);
  });

  it("para reintentar una escritura se quitan SOLO las columnas del rediseño", () => {
    expect(sinColumnasDelRediseno({ total: 1, se_reporta: false, tienda_codigo: "D-25", nota: "x", nota_credito: "nc", zips_bajados: [] })).toEqual({ total: 1 });
  });

  it("🔴 los tipos del rediseño son OPCIONALES en `types.ts` (la migración puede no estar)", () => {
    const tipos = codigo("src/lib/marketing/types.ts");
    expect(tipos.match(/se_reporta\?: boolean;/g)?.length).toBe(2);
    expect(tipos.match(/tienda_codigo\?: string \| null;/g)?.length).toBe(3);
    expect(tipos).not.toMatch(/\n\s+se_reporta: boolean;/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("7 · 🔴 el proyecto no vuelve a decidir la tienda", () => {
  it("los módulos puros del cimiento no conocen `proyecto`", () => {
    for (const rel of [
      "src/lib/marketing/gasto.ts",
      "src/lib/marketing/agrupar-por-tienda.ts",
      "src/lib/marketing/periodo-estado.ts",
      "src/lib/marketing/duplicado.ts",
      "src/lib/marketing/proveedor.ts",
    ]) {
      expect(codigo(rel), rel).not.toMatch(/proyecto_?[iI]d/);
    }
  });

  it("agrupa por tienda, «General» junta lo sin tienda y va AL FINAL, con dos totales aparte", () => {
    const grupos = agruparPorTienda([
      { id: "1", tiendaCodigo: "D-25", tiendaNombre: "City Mall", monto: 100 },
      { id: "2", tiendaCodigo: "d-25", monto: 50, seReporta: false },
      { id: "3", tiendaCodigo: null, monto: 800 },
      { id: "4", tiendaCodigo: "", monto: 20 },
      { id: "5", tiendaCodigo: "D-87", monto: 300 },
    ]);
    expect(grupos.map((g) => g.rotulo)).toEqual(["D-87", "City Mall", TIENDA_GENERAL]);
    expect(grupos[1]).toMatchObject({
      tiendaCodigo: "D-25",
      totalReportado: 100,
      totalNoReportado: 50,
      cantidadReportada: 1,
      cantidadNoReportada: 1,
    });
    expect(grupos[1].gastos.map((g) => g.id)).toEqual(["1", "2"]);
    expect(grupos[2]).toMatchObject({ tiendaCodigo: null, totalReportado: 820, cantidadReportada: 2 });
    // El total del período es SOLO lo reportado: 300 + 100 + 820, sin el 50 apagado.
    expect(totalReportadoDe(grupos)).toBe(1220);
    expect(rotuloTienda(null)).toBe("General");
    expect(rotuloTienda(" D-25 ")).toBe("D-25");
  });

  it("qué le falta a un gasto se dice en palabras, y la tienda solo se exige si «es de una tienda»", () => {
    expect(faltantesDelGasto({ tipo: "factura", marcaCodigo: "TH", monto: 10, fecha: "2026-09-22" })).toEqual([]);
    expect(faltantesDelGasto({ tipo: "factura", marcaCodigo: "TH", monto: 10, fecha: "2026-09-22", esDeTienda: true })).toEqual([
      "Elige la tienda del directorio.",
    ]);
    expect(faltantesDelGasto({ tipo: "x", marcaCodigo: "", monto: 0, fecha: "hoy" })).toEqual([
      "Elige qué tipo de gasto es.",
      "Elige la marca.",
      "Escribe el monto.",
      "Pon la fecha.",
    ]);
    const g = armarGasto({ id: "1", tipo: "mueble", marcaCodigo: "ck", tiendaCodigo: " d-25 ", nota: "  Apertura   tienda ", monto: 12.345, fecha: "2026-09-22" });
    expect(g).toMatchObject({ tiendaCodigo: "D-25", nota: "Apertura tienda", monto: 12.35, proveedor: "" });
    expect(armarGasto({ id: "1", tipo: "mueble", marcaCodigo: "ck", monto: 1, fecha: "2026-09-22" }).tiendaCodigo).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("8 · 🔴 «Eliminar definitivamente» no vuelve, y `mk_proyecto_marcas` queda sin lectores", () => {
  it("las dos pantallas no ofrecen el botón ni llaman al DELETE", () => {
    for (const rel of [
      "src/app/marketing/components/FacturasSection.tsx",
      "src/app/marketing/components/ProyectoOverlay.tsx",
    ]) {
      const src = codigo(rel);
      expect(src, rel).not.toMatch(/Eliminar definitivamente/);
      expect(src, rel).not.toMatch(/ConfirmDeleteModal|ConfirmTypeNameModal/);
      expect(src, rel).not.toMatch(/method:\s*"DELETE"/);
    }
    // CONTROL: «Anular» sigue ahí — con Anular basta.
    expect(codigo("src/app/marketing/components/FacturasSection.tsx")).toMatch(/Anular/);
  });

  it("las funciones de borrado duro no existen y las dos rutas contestan 403", () => {
    const mut = codigo("src/lib/marketing/mutations.ts");
    expect(mut).not.toMatch(/export async function eliminar(Proyecto|Factura)Definitiv/);
    expect(mut).not.toMatch(/from\("mk_(facturas|proyectos)"\)\s*\.delete\(\)/);
    for (const rel of [
      "src/app/api/marketing/facturas/[id]/route.ts",
      "src/app/api/marketing/proyectos/[id]/route.ts",
    ]) {
      const src = codigo(rel);
      expect(src, rel).toMatch(/export async function DELETE/);
      expect(src, rel).toMatch(/status:\s*403/);
      expect(src, rel).not.toMatch(/eliminar(Proyecto|Factura)Definitiv/);
      expect(src, rel).not.toMatch(/delete_definitivo/);
      // Un route.ts de Next no puede exportar otra cosa que sus handlers.
      expect(src, rel).not.toMatch(/export const MSG_/);
    }
  });

  it("nadie lee ni escribe `mk_proyecto_marcas` desde `src/` (salvo el respaldo)", () => {
    const lectores = archivosDe(SRC)
      .filter((p) => !p.includes(`${path.sep}__tests__${path.sep}`))
      .filter((p) => /from\("mk_proyecto_marcas"\)/.test(sinComentarios(fs.readFileSync(p, "utf8"))))
      .map((p) => path.relative(RAIZ, p));
    expect(lectores).toEqual([]);
    expect(CLASIFICACION["mk_proyecto_marcas"]).toBe("congelada");
    expect(codigo("src/app/api/cron/backup/route.ts")).toMatch(/\{ table: "mk_proyecto_marcas" \}/);
  });

  it("la ruta de marcas por proyecto contesta 410 y no escribe", () => {
    const src = codigo("src/app/api/marketing/proyectos/[id]/marcas/route.ts");
    expect(src).toMatch(/status:\s*410/);
    expect(src).not.toMatch(/updateProyectoMarcas|supabaseServer/);
  });

  it("el reporte por proyecto deriva las marcas de los DOCUMENTOS", () => {
    const src = codigo("src/lib/marketing/reportes.ts");
    expect(src).not.toMatch(/cargarProyMarcas\(/);
    expect(src).toMatch(/cargarGastoCompletoPorMarca\(proyectoIds\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("9 · 🔴 el período: dos estados, la nota de crédito es texto, el siguiente se abre solo", () => {
  it("dos estados y una sola transición", () => {
    expect([...ESTADOS_PERIODO]).toEqual(["abierto", "cerrado"]);
    expect(TRANSICIONES).toEqual({ abierto: ["cerrado"], cerrado: [] });
    expect(puedeCerrar("abierto")).toBe(true);
    expect(puedeCerrar("cerrado")).toBe(false);
    expect(aceptaGastos("abierto")).toBe(true);
    expect(aceptaGastos("cerrado")).toBe(false);
  });

  it("cerrar exige el nombre, guarda la nota como texto y no calcula nada", () => {
    const patch = armarCierre(
      { estado: "abierto" },
      { nombreAlCerrar: "  Temporada   2026 ", notaCredito: " NC-000123 (50%) ", cerradoPor: "daniel", ahoraISO: "2026-09-22T15:00:00.000Z" },
    );
    expect(patch).toEqual({
      estado: "cerrado",
      cerrado_en: "2026-09-22T15:00:00.000Z",
      cerrado_por: "daniel",
      nombre_al_cerrar: "Temporada 2026",
      nota_credito: "NC-000123 (50%)",
    });
    expect(armarCierre({ estado: "abierto" }, { nombreAlCerrar: "x", cerradoPor: "d", ahoraISO: "t" }).nota_credito).toBeNull();
    expect(() => armarCierre({ estado: "abierto" }, { nombreAlCerrar: "  ", cerradoPor: "d", ahoraISO: "t" })).toThrow(MSG_FALTA_NOMBRE);
    expect(() => armarCierre({ estado: "cerrado" }, { nombreAlCerrar: "x", cerradoPor: "d", ahoraISO: "t" })).toThrow(/ya está cerrado/);
    // 🔴 Ni un número sale de la nota de crédito.
    const src = codigo("src/lib/marketing/periodo-estado.ts");
    expect(src).not.toMatch(/Number\(\s*(input\.)?notaCredito/);
    expect(src).not.toMatch(/parseFloat|parseInt/);
    expect(src).not.toMatch(/nota_credito\s*[*\/%-]/);
  });

  it("el siguiente se abre solo, de la MISMA marca, con el nombre por defecto que dice desde cuándo", () => {
    // La fecha sale de `formatearFecha` (la de toda la casa): «22 sept 2026».
    expect(nombrePorDefectoDelSiguiente("2026-09-22")).toBe(`Desde el ${formatearFecha("2026-09-22")}`);
    expect(nombrePorDefectoDelSiguiente("2026-09-22")).toMatch(/^Desde el 22 sept? 2026$/);
    // CK y no TH a propósito: una mutación que escriba "TH" a mano tiene que caer.
    expect(abrirSiguiente({ marcaCodigo: "CK", hoyPanama: "2026-09-22", ahoraISO: "2026-09-22T15:00:00.000Z" })).toEqual({
      proveedor_key: "CK",
      nombre: `Desde el ${formatearFecha("2026-09-22")}`,
      estado: "abierto",
      abierto_en: "2026-09-22T15:00:00.000Z",
    });
    expect(() => abrirSiguiente({ marcaCodigo: "", hoyPanama: "2026-09-22", ahoraISO: "t" })).toThrow(/marca/);
  });

  it("cada ZIP bajado se anota al final; nada se pisa ni se recorta", () => {
    const uno = { bajado_en: "a", bajado_por: "daniela", gastos: 3, monto: 10.005, archivo_path: "periodos/p1/a.zip" };
    const dos = { bajado_en: "b", bajado_por: "daniel", gastos: 4, monto: 20, archivo_path: "periodos/p1/b.zip" };
    const lista = anotarZip(anotarZip(null, uno), dos);
    expect(lista).toHaveLength(2);
    expect(lista[0]).toEqual({ ...uno, monto: 10.01 });
    expect(lista[1]).toEqual(dos);
    expect(anotarZip({ raro: true }, dos)).toEqual([dos]);
  });
});
