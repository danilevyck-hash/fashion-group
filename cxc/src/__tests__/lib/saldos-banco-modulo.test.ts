/**
 * Candados de "Saldos de Banco" — el módulo que se separó de "Gastos de Empresa".
 *
 * CONTEXTO (11-ago-2026). Daniel decidió que de los dos módulos de gastos quede
 * uno solo: **"Gastos"** (el nuevo, que baja el mayor de Switch — PR #463) y que
 * del viejo sobreviva únicamente lo que SÍ se usa: los **saldos de banco**
 * (`bancos_saldos`, 52 filas cargadas por Contabilidad entre ene y ago 2026,
 * 7 empresas). La carga manual de gastos (`empresa_gastos_mensuales`, 0 filas,
 * nunca se usó) se retira DESPUÉS, en otro PR.
 *
 * 🔴 EL ORDEN NO ES NEGOCIABLE, y estos tests son lo que lo sostiene: este PR
 * NO puede llevarse la carga manual de gastos. Si se fuera antes de que el
 * módulo nuevo esté publicado, Daniel se queda sin NINGUNO de los dos. Por eso
 * hay tests que exigen que el módulo viejo siga ENTERO — un candado "al revés"
 * de lo habitual: protege lo que todavía no se puede borrar.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";
import {
  ALL_MODULES,
  MODULO_HEREDA_PERMISO_DE,
  getVisibleModules,
  getDefaultModulesForRole,
} from "@/lib/modules";

const raiz = join(__dirname, "..", "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// 1. El módulo existe y hace lo que dice
// ─────────────────────────────────────────────────────────────────────────────

describe("Saldos de Banco — el módulo", () => {
  const saldos = ALL_MODULES.find((m) => m.key === "saldos-banco");

  it("está en el catálogo, con su nombre en español simple", () => {
    expect(saldos).toBeTruthy();
    expect(saldos!.label).toBe("Saldos de Banco");
    expect(saldos!.href).toBe("/saldos-banco");
    expect(saldos!.group).toBe("operacion");
  });

  it("lo ven los mismos roles que cargan el dato: admin y contabilidad", () => {
    // Las 52 filas de bancos_saldos están firmadas `created_by = "Contabilidad"`.
    // Si el rol se cayera de acá, quien carga los saldos se queda afuera.
    expect(saldos!.roles).toEqual(["admin", "contabilidad"]);
    expect(getDefaultModulesForRole("contabilidad")).toContain("saldos-banco");
    for (const rol of ["secretaria", "bodega", "vendedor", "gerente_acs"]) {
      expect(getDefaultModulesForRole(rol), `${rol} no debe verlo`).not.toContain("saldos-banco");
    }
  });

  it("la pantalla y su API existen", () => {
    expect(existsSync(join(raiz, "src/app/saldos-banco/page.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "src/app/saldos-banco/SaldosBancoClient.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "src/app/saldos-banco/components/SaldosBancarios.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "src/app/api/saldos-banco/route.ts"))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. La herencia de permiso — la pantalla funciona ANTES de que corra la DDL
//
// 🩸 `role_permissions.contabilidad.modulos` es una lista de keys guardada en la
// base, y el login la copia a `fg_modules`. Una key NUEVA no está ahí, así que
// la ficha no aparece en el menú hasta que alguien corra la migración A MANO —
// y este repo tiene DDLs pendientes de correr desde hace semanas. Sin la
// herencia, el día que se retire "Gastos de Empresa" la persona que carga los
// saldos se queda sin ninguna puerta al dato.
// ─────────────────────────────────────────────────────────────────────────────

describe("Saldos de Banco — permiso heredado mientras la DDL no corra", () => {
  it("quien tenía `gastos-empresa` ve `saldos-banco` sin tocar la base", () => {
    const guardadoHoy = ["asistencia", "gastos-empresa", "prestamos", "proveedores", "ventas"];
    const visibles = getVisibleModules("contabilidad", guardadoHoy).map((m) => m.key);
    expect(visibles).toContain("saldos-banco");
    // Y no le regala nada más de rebote.
    expect(visibles).not.toContain("cxc");
    expect(visibles).not.toContain("catalogos");
    expect(visibles).not.toContain("usuarios");
  });

  it("con la DDL ya corrida sigue funcionando igual (idempotente)", () => {
    const conDdl = ["asistencia", "gastos-empresa", "saldos-banco", "prestamos", "proveedores", "ventas"];
    expect(getVisibleModules("contabilidad", conDdl).map((m) => m.key)).toContain("saldos-banco");
  });

  it("el día que se retire `gastos-empresa` de la lista guardada, la herencia ya no alcanza → la DDL es obligatoria antes de ese PR", () => {
    const sinElViejo = ["asistencia", "prestamos", "proveedores", "ventas"];
    expect(getVisibleModules("contabilidad", sinElViejo).map((m) => m.key)).not.toContain("saldos-banco");
  });

  it("quien NUNCA tuvo el módulo viejo tampoco hereda el nuevo", () => {
    expect(getVisibleModules("bodega", ["guias", "packing-lists", "catalogos"]).map((m) => m.key))
      .not.toContain("saldos-banco");
  });

  it("la herencia es de UNA sola key y apunta al módulo del que salió", () => {
    // Que no se convierta en un cajón de sastre: cada entrada acá es un permiso
    // que alguien recibe sin que nadie lo haya escrito en la base.
    expect(Object.keys(MODULO_HEREDA_PERMISO_DE)).toEqual(["saldos-banco"]);
    expect(MODULO_HEREDA_PERMISO_DE["saldos-banco"]).toBe("gastos-empresa");
  });

  it("existe la migración que agrega la key, y NO toca bancos_saldos", () => {
    const dir = join(raiz, "supabase", "migrations");
    const archivo = readdirSync(dir).find((f) => f.includes("modulo_saldos_banco"));
    expect(archivo, "falta la migración del módulo saldos-banco").toBeTruthy();
    const sql = readFileSync(join(dir, archivo!), "utf8");

    expect(sql).toMatch(/UPDATE\s+role_permissions/i);
    expect(sql).toContain("saldos-banco");

    // 🔴 El dato NO se toca. Ni la tabla de saldos, ni la de gastos, ni las
    // categorías: esta migración solo reparte una key de menú.
    const sentencias = sql
      .split("\n")
      .filter((l) => !l.trim().startsWith("--"))
      .join("\n");
    for (const prohibido of [
      /\bDROP\b/i,
      /\bDELETE\s+FROM\b/i,
      /\bTRUNCATE\b/i,
      /\bALTER\s+TABLE\b/i,
      /bancos_saldos/i,
      /empresa_gastos_mensuales/i,
      /gastos_categorias/i,
    ]) {
      expect(sentencias, `la migración no puede contener ${prohibido}`).not.toMatch(prohibido);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 🔴 EL ORDEN DE MERGE — la carga manual de gastos NO se va en este PR
// ─────────────────────────────────────────────────────────────────────────────

describe("la carga manual de gastos sigue en pie (se retira en OTRO PR)", () => {
  it("el módulo `gastos-empresa` sigue en el menú, con su nombre de siempre", () => {
    const viejo = ALL_MODULES.find((m) => m.key === "gastos-empresa");
    expect(viejo, "no se puede retirar acá: el módulo nuevo todavía no está publicado").toBeTruthy();
    expect(viejo!.label).toBe("Gastos de Empresa");
    expect(viejo!.href).toBe("/gastos-empresa");
  });

  it("la pantalla y las rutas de la carga manual siguen existiendo", () => {
    for (const p of [
      "src/app/gastos-empresa/page.tsx",
      "src/app/gastos-empresa/components/EmpresaGastosForm.tsx",
      "src/app/gastos-empresa/components/ChecklistView.tsx",
      "src/app/api/gastos-empresa/resumen/route.ts",
      "src/app/api/gastos-empresa/gastos/route.ts",
      "src/app/api/gastos-empresa/categorias/route.ts",
      "src/app/api/gastos-empresa/copiar-mes/route.ts",
    ]) {
      expect(existsSync(join(raiz, p)), `${p} no se toca en este PR`).toBe(true);
    }
  });

  it("mientras el módulo viejo exista sigue MOSTRANDO los saldos — nadie se queda sin el dato en el medio", () => {
    const cliente = leer("src/app/gastos-empresa/GastosEmpresaClient.tsx");
    expect(cliente).toMatch(/<SaldosBancarios\b/);
    // Y usa el componente MUDADO, no una copia: dos copias divergen y sólo se
    // nota cuando una guarda distinto que la otra.
    expect(cliente).toContain('from "@/app/saldos-banco/components/SaldosBancarios"');
    expect(existsSync(join(raiz, "src/app/gastos-empresa/components/SaldosBancarios.tsx")))
      .toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. `bancos_saldos` — la tabla no se toca y la Disponibilidad sigue saliendo
//    de donde salía
// ─────────────────────────────────────────────────────────────────────────────

describe("bancos_saldos y la Disponibilidad de Vista General", () => {
  it("Vista General sigue leyendo `bancos_saldos` con su propio criterio", () => {
    const ruta = leer("src/app/api/dashboard/vista-general/route.ts");
    expect(ruta).toContain('.from("bancos_saldos")');
    expect(ruta).toMatch(/disponibilidad/);
    // No se le metió una lectura al módulo nuevo por el medio: el número que
    // ve Daniel se calcula igual que antes, sobre la misma tabla.
    expect(ruta).not.toContain("/api/saldos-banco");
  });

  it("la tarjeta Disponibilidad lleva al módulo de saldos", () => {
    const pagina = leer("src/app/vista-general/page.tsx");
    const i = pagina.indexOf('label="Disponibilidad"');
    expect(i).toBeGreaterThan(-1);
    expect(pagina.slice(i - 300, i)).toContain('href="/saldos-banco"');
  });

  it("la API del módulo lee y escribe la MISMA tabla, con las mismas reglas", () => {
    const api = leer("src/app/api/saldos-banco/route.ts");
    expect(api).toContain('.from("bancos_saldos")');
    // Upsert por (empresa_key, fecha_dato): repetir la fecha corrige el día,
    // nunca duplica ni borra historia.
    expect(api).toContain('onConflict: "empresa_key,fecha_dato"');
    expect(api).not.toMatch(/\.delete\(\)/);
    // Mismos roles que la ruta vieja.
    expect(api).toMatch(/requireRole\(req,\s*\["admin",\s*"contabilidad"\]\)/);
    // Paginado verificado: `db-max-rows` = 1000 corta EN SILENCIO, y acá un
    // truncado se vería como "esta empresa no tiene saldo", no como un error.
    expect(api).toContain("leerTodoPaginado");
    expect(api).toMatch(/\.order\("id"/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Dos módulos no se pueden llamar casi igual
//
// 🩸 De dónde sale esta regla: el PR #463 estrenó el módulo del mayor como
// "Gastos por Empresa" al lado de "Gastos de Empresa" — UNA PREPOSICIÓN de
// diferencia, uno debajo del otro en el menú. Para alguien no técnico eso no
// son dos módulos que hacen cosas distintas, es un typo, y el que se equivoca
// termina en la pantalla equivocada. Acá esa regla deja de ser sobre esos dos
// nombres y pasa a valer para TODO el catálogo.
// ─────────────────────────────────────────────────────────────────────────────

/** Palabras que distinguen: sin tildes, en minúscula, y sin las de relleno
 *  ("de", "por", "la"…), que son justamente las que producen el parecido. */
const RELLENO = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "por", "con", "en", "a", "al", "para"]);

export function palabrasQueDistinguen(label: string): Set<string> {
  return new Set(
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 0 && !RELLENO.has(w)),
  );
}

/** Dos nombres se confunden si COMPARTEN alguna palabra que distingue y, aun
 *  así, no llegan a 2 palabras propias de diferencia. Sin palabras en común no
 *  hay confusión posible ("Gastos" y "Cheques" no se parecen en nada). */
export function seConfunden(a: string, b: string): boolean {
  const A = palabrasQueDistinguen(a);
  const B = palabrasQueDistinguen(b);
  const comparten = [...A].some((w) => B.has(w));
  if (!comparten) return false;
  const propiasDeA = [...A].filter((w) => !B.has(w)).length;
  const propiasDeB = [...B].filter((w) => !A.has(w)).length;
  return Math.max(propiasDeA, propiasDeB) < 2;
}

describe("los nombres de los módulos no se confunden entre sí", () => {
  it("ningún par del catálogo se parece demasiado", () => {
    const choques: string[] = [];
    for (let i = 0; i < ALL_MODULES.length; i += 1) {
      for (let j = i + 1; j < ALL_MODULES.length; j += 1) {
        const a = ALL_MODULES[i];
        const b = ALL_MODULES[j];
        if (seConfunden(a.label, b.label)) choques.push(`"${a.label}" (${a.key}) vs "${b.label}" (${b.key})`);
      }
    }
    expect(choques, `nombres demasiado parecidos:\n${choques.join("\n")}`).toEqual([]);
  });

  it("reconoce el caso REAL que originó la regla", () => {
    // El error del #463, tal cual ocurrió.
    expect(seConfunden("Gastos de Empresa", "Gastos por Empresa")).toBe(true);
    // Y el nombre con el que se arregló: dos palabras propias de diferencia.
    expect(seConfunden("Gastos de Empresa", "Gastos según Contabilidad")).toBe(false);
  });

  it("no marca como parecido lo que no comparte ni una palabra", () => {
    expect(seConfunden("Gastos", "Cheques")).toBe(false);
    expect(seConfunden("Gastos", "Saldos de Banco")).toBe(false);
    expect(seConfunden("Guías de Despacho", "Saldos de Banco")).toBe(false); // solo comparten "de"
  });

  it("sí marca un nombre que es otro con una palabra pegada", () => {
    expect(seConfunden("Caja Menuda", "Caja Menuda Chica")).toBe(true);
    expect(seConfunden("Ventas", "Ventas por Empresa")).toBe(true);
  });

  it("cada módulo tiene key, ruta y nombre únicos", () => {
    const keys = ALL_MODULES.map((m) => m.key);
    const hrefs = ALL_MODULES.map((m) => m.href);
    const labels = ALL_MODULES.map((m) => m.label);
    expect(new Set(keys).size).toBe(keys.length);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
