/**
 * Candados de los SALDOS DE BANCO — hoy la 2ª pestaña de "Gastos".
 *
 * CONTEXTO, y son tres pasos que hay que leer juntos para no deshacer ninguno:
 *   · 11-ago-2026 (#465/#467). De los DOS módulos de gastos quedó uno solo,
 *     **"Gastos"** (`gastos-contabilidad`, el que baja el mayor de Switch), y
 *     del viejo "Gastos de Empresa" sobrevivió lo único que SÍ se usaba: los
 *     **saldos de banco** (`bancos_saldos`, 52 filas cargadas por Contabilidad
 *     entre ene y ago 2026, 7 empresas). Para poder retirar el viejo SIN dejar a
 *     Contabilidad sin ese dato, los saldos se publicaron como módulo suelto.
 *   · 13-ago-2026. Terminada esa mudanza, Daniel pidió lo contrario y fue
 *     textual: *"y debeeria estar en un solo modulo"*. `saldos-banco` deja de
 *     ser ficha y pasa a ser **PESTAÑA** de Gastos
 *     (`/gastos-contabilidad?tab=saldos-banco`). La dirección vieja
 *     `/saldos-banco` sigue llegando (redirect 307 en next.config.js).
 *
 * 🔴 LO QUE ESTOS TESTS PROTEGEN, y no es lo mismo que protegían el 11-ago: la
 * ficha suelta ya no tiene que existir, pero la PANTALLA sí — entera, con su
 * carga, su corrección por fecha y su historial — y la puerta de Contabilidad al
 * dato NO se puede haber cerrado en el camino.
 */import { describe, it, expect } from "vitest";
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

/** El archivo SIN comentarios. 🩸 Hace falta de verdad: el barrido de "esta
 *  pestaña no tiene h1" pasaba en verde por el comentario de cabecera de
 *  `SaldosBancoTab.tsx`, que EXPLICA que su `<h1>` se fue. Un candado que se
 *  cumple a sí mismo con su propia explicación es peor que no tener candado. */
const plano = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

// ─────────────────────────────────────────────────────────────────────────────
// 1. La PESTAÑA existe y la ficha suelta ya no
// ─────────────────────────────────────────────────────────────────────────────

describe("Saldos de banco — la 2ª pestaña de Gastos", () => {
  it("ya NO es una ficha suelta del menú", () => {
    // Lo que Daniel pidió es MENOS módulos: si esta key volviera al catálogo,
    // el menú tendría otra vez dos entradas para lo mismo.
    expect(ALL_MODULES.find((m) => m.key === "saldos-banco")).toBeUndefined();
    for (const rol of ["admin", "contabilidad", "secretaria", "bodega", "vendedor", "gerente_acs"]) {
      expect(getDefaultModulesForRole(rol), `${rol} no puede tener la key retirada`)
        .not.toContain("saldos-banco");
    }
  });

  it("la pantalla NO se perdió: vive dentro de Gastos, con su API intacta", () => {
    // Es una MUDANZA, no un recorte. Los archivos son los MISMOS (git mv), no
    // copias: si alguien los duplicara, habría dos verdades para un mismo saldo.
    const base = "src/app/gastos-contabilidad/components/saldos";
    for (const f of ["SaldosBancoTab.tsx", "SaldosBancarios.tsx", "types.ts"]) {
      expect(existsSync(join(raiz, base, f)), `falta ${f}`).toBe(true);
    }
    expect(existsSync(join(raiz, "src/app/api/saldos-banco/route.ts"))).toBe(true);
    // Y la casa vieja quedó vacía: una pantalla en dos lugares se desincroniza.
    expect(existsSync(join(raiz, "src/app/saldos-banco/page.tsx"))).toBe(false);
    expect(existsSync(join(raiz, "src/app/saldos-banco/SaldosBancoClient.tsx"))).toBe(false);
    expect(existsSync(join(raiz, "src/app/saldos-banco/components/SaldosBancarios.tsx"))).toBe(false);
  });

  it("la pestaña está montada en el módulo de Gastos, con `?tab=` en la URL", () => {
    const cliente = leer("src/app/gastos-contabilidad/GastosContabilidadClient.tsx");
    expect(cliente).toContain('import SaldosBancoTab from "./components/saldos/SaldosBancoTab"');
    expect(cliente).toContain("<SaldosBancoTab />");
    expect(cliente).toContain('<TabsTrigger value="saldos-banco"');
    // `?tab=` en la URL es lo que hace que un marcador, un refresh y el
    // back/forward caigan donde estaba la persona — y lo que le da destino al
    // redirect de la dirección vieja.
    expect(cliente).toMatch(/useUrlState\("tab", "gastos"\)/);
  });

  it("🔴 la dirección vieja `/saldos-banco` TIENE que seguir llegando", () => {
    // La tarjeta "Disponibilidad" de Vista General apunta ahí, y también
    // cualquier marcador de Contabilidad. Va en next.config.js —el mecanismo que
    // ya usa el repo— y no con un page.tsx que redirige: así ni siquiera se
    // descarga la pantalla equivocada.
    const cfg = leer("next.config.js");
    expect(cfg).toMatch(
      /source:\s*"\/saldos-banco",\s*destination:\s*"\/gastos-contabilidad\?tab=saldos-banco"/,
    );
  });

  it("la pestaña NO trae su propio h1: el de la página es UNO solo", () => {
    // Mismo invariante que DataHealthTab dentro de Usuarios. Dos h1 en una
    // página no son un encabezado, son un encabezado roto.
    expect(plano(leer("src/app/gastos-contabilidad/components/saldos/SaldosBancoTab.tsx")))
      .not.toMatch(/<h1\b/);
    const cliente = plano(leer("src/app/gastos-contabilidad/GastosContabilidadClient.tsx"));
    expect((cliente.match(/<h1\b/g) || []).length).toBe(1);
    expect(cliente).toContain('<h1 className="sr-only">Gastos</h1>');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. EL PERMISO PRESTADO SE RETIRÓ — y quién ve qué no se movió
//
// 🩸 De dónde venía: `role_permissions.contabilidad.modulos` es una lista de
// keys guardada en la base, y el login la copia a `fg_modules`. Una key NUEVA no
// está ahí hasta que alguien corra la migración A MANO — y este repo tiene DDLs
// pendientes desde hace semanas. Por eso el 11-ago se le prestó a `saldos-banco`
// el permiso de `gastos-empresa`: sin eso, el día del retiro la persona que
// carga los saldos (contabilidad: las 52 filas están firmadas por ella) se
// quedaba sin ninguna puerta al dato.
//
// AHORA se retira, y por las DOS razones a la vez:
//   1. `saldos-banco` ya no es un módulo → la entrada quedaba ZOMBI.
//   2. La puerta es `gastos-contabilidad`, y contabilidad la tiene POR DERECHO
//      PROPIO. Medido en producción el 13-ago-2026:
//      ["asistencia","gastos-empresa","prestamos","proveedores","ventas",
//       "saldos-banco","gastos-contabilidad"].
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que `role_permissions.contabilidad.modulos` tiene HOY en producción,
 *  medido con `scripts/_diag-gastos-saldos-fusion.ts` (solo lectura) el
 *  13-ago-2026. Se usa tal cual, con sus keys inertes incluidas: probar con una
 *  lista idealizada no probaría nada sobre la base real. */
const CONTABILIDAD_EN_PRODUCCION = [
  "asistencia", "gastos-empresa", "prestamos", "proveedores", "ventas",
  "saldos-banco", "gastos-contabilidad",
];

describe("el permiso prestado se retiró sin cerrarle la puerta a nadie", () => {
  it("la herencia es una lista CERRADA y ya no incluye `saldos-banco`", () => {
    // Que no se convierta en un cajón de sastre: cada entrada acá es un permiso
    // que alguien recibe sin que nadie lo haya escrito en la base.
    expect(Object.keys(MODULO_HEREDA_PERMISO_DE).sort()).toEqual(["referencia"]);
    expect(MODULO_HEREDA_PERMISO_DE["saldos-banco"]).toBeUndefined();
    expect(MODULO_HEREDA_PERMISO_DE["referencia"]).toBe("catalogos");
  });

  it("🔴 contabilidad SIGUE llegando al dato — con lo que tiene HOY en la base", () => {
    const visibles = getVisibleModules("contabilidad", CONTABILIDAD_EN_PRODUCCION).map((m) => m.key);
    // La puerta: entra a Gastos y adentro toca la pestaña.
    expect(visibles).toContain("gastos-contabilidad");
    // Y no gana nada de rebote por el camino.
    expect(visibles).not.toContain("cxc");
    expect(visibles).not.toContain("catalogos");
    expect(visibles).not.toContain("usuarios");
  });

  it("las keys viejas quedaron INERTES, no rompen ni pintan nada", () => {
    // `gastos-empresa` y `saldos-banco` siguen en la fila de la base (la
    // migración 20260811130000 nunca corrió, y la nueva tampoco es bloqueante).
    // `getVisibleModules` filtra contra ALL_MODULES, así que no pintan ficha.
    const visibles = getVisibleModules("contabilidad", CONTABILIDAD_EN_PRODUCCION).map((m) => m.key);
    expect(visibles).not.toContain("gastos-empresa");
    expect(visibles).not.toContain("saldos-banco");
    expect(visibles.sort()).toEqual(
      ["asistencia", "gastos-contabilidad", "prestamos", "proveedores", "ventas"].sort(),
    );
  });

  it("con la DDL nueva ya corrida ve EXACTAMENTE lo mismo (idempotente)", () => {
    // Después de 20260813140000 la fila queda sin las dos keys muertas. Si el
    // menú cambiara al correrla, la migración sería bloqueante — y no lo es.
    const conDdl = ["asistencia", "prestamos", "proveedores", "ventas", "gastos-contabilidad"];
    expect(getVisibleModules("contabilidad", conDdl).map((m) => m.key).sort()).toEqual(
      getVisibleModules("contabilidad", CONTABILIDAD_EN_PRODUCCION).map((m) => m.key).sort(),
    );
  });

  it("🔴 nadie más gana la puerta a los saldos: rol por rol, antes y después", () => {
    // Los saldos son plata de la empresa. La pestaña vive dentro de Gastos, así
    // que quien no tiene Gastos no la ve — y Gastos es de admin y contabilidad.
    const mayor = ALL_MODULES.find((m) => m.key === "gastos-contabilidad")!;
    expect(mayor.roles).toEqual(["admin", "contabilidad"]);
    for (const rol of ["secretaria", "bodega", "vendedor", "gerente_acs"]) {
      expect(getDefaultModulesForRole(rol), `${rol} no debe ver Gastos`)
        .not.toContain("gastos-contabilidad");
    }
    // Y la API tampoco se abrió: mismos dos roles que siempre.
    expect(leer("src/app/api/saldos-banco/route.ts"))
      .toMatch(/requireRole\(req,\s*\["admin",\s*"contabilidad"\]\)/);
  });

  it("la migración que barre las keys muertas existe, y NO toca bancos_saldos", () => {
    const dir = join(raiz, "supabase", "migrations");
    const archivo = readdirSync(dir).find((f) => f.includes("retirar_modulo_saldos_banco"));
    expect(archivo, "falta la migración que retira la key `saldos-banco`").toBeTruthy();
    const sql = readFileSync(join(dir, archivo!), "utf8");
    const sentencias = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

    // Asegura la key que reemplaza ANTES de sacar las viejas — al revés dejaría
    // al rol sin ningún módulo de gastos.
    const iAppend = sentencias.indexOf("array_append(modulos, 'gastos-contabilidad')");
    const iRemove = sentencias.indexOf("array_remove(modulos, 'saldos-banco')");
    expect(iAppend).toBeGreaterThan(-1);
    expect(iRemove === -1 || iAppend < iRemove).toBe(true);

    // 🔴 El dato NO se toca.
    for (const prohibido of [
      /\bDROP\b/i, /\bDELETE\s+FROM\b/i, /\bTRUNCATE\b/i, /\bALTER\s+TABLE\b/i,
      /bancos_saldos/i, /empresa_gastos_mensuales/i, /gastos_categorias/i,
    ]) {
      expect(sentencias, `la migración no puede contener ${prohibido}`).not.toMatch(prohibido);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 🔴 EL ORDEN DE MERGE del 11-ago — sigue valiendo hacia atrás
// ─────────────────────────────────────────────────────────────────────────────

describe("la carga manual de gastos YA se retiró (y el orden se respetó)", () => {
  it("queda UN solo módulo de gastos, y se llama \"Gastos\"", () => {
    const deGastos = ALL_MODULES.filter((m) => /gasto/i.test(m.label) || /gastos/.test(m.key));
    expect(deGastos.map((m) => m.key)).toEqual(["gastos-contabilidad"]);
    expect(deGastos[0].label).toBe("Gastos");
    expect(deGastos[0].href).toBe("/gastos-contabilidad");
    // 🔴 La `key` NO cambió: la migración del #463 y la fila de role_permissions
    // ya corrieron con ese nombre. Renombrarla no compra nada y rompe las dos.
    expect(deGastos[0].key).toBe("gastos-contabilidad");
  });

  it("el módulo viejo se fue del menú y de la app", () => {
    expect(ALL_MODULES.find((m) => m.key === "gastos-empresa")).toBeUndefined();
    for (const p of ["src/app/gastos-empresa", "src/app/api/gastos-empresa"]) {
      expect(existsSync(join(raiz, p)), `${p} debía retirarse`).toBe(false);
    }
  });

  it("🔴 el módulo del mayor TIENE que estar publicado para que esto sea seguro", () => {
    // El candado que sostiene el orden: sin él no quedaría ningún módulo de
    // gastos, y ahora además se llevaría puestos los saldos, que son su pestaña.
    expect(existsSync(join(raiz, "src/app/gastos-contabilidad/page.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "src/app/api/gastos-contabilidad/resumen/route.ts"))).toBe(true);
  });

  it("los saldos de banco NO se fueron con él: siguen vivos, ahora como pestaña", () => {
    expect(existsSync(join(raiz, "src/app/gastos-contabilidad/components/saldos/SaldosBancarios.tsx"))).toBe(true);
    expect(existsSync(join(raiz, "src/app/api/saldos-banco/route.ts"))).toBe(true);
  });

  it("las TABLAS no se borraron — 0 filas no es motivo para un DROP", () => {
    // `empresa_gastos_mensuales` tiene 0 filas y `gastos_categorias` 6, pero
    // borrar tablas es irreversible y Daniel no lo pidió: quedan en la base.
    //
    // ⚠️ Desde el 11-ago-2026 Vista General YA NO LAS LEE — su gasto sale del
    // mayor contable de Switch. Que nadie las lea NO es lo mismo que borrarlas,
    // y este candado protege lo segundo, que es lo irreversible.
    const dir = join(raiz, "supabase", "migrations");
    for (const f of readdirSync(dir)) {
      if (!f.endsWith(".sql")) continue;
      const sql = readFileSync(join(dir, f), "utf8")
        .split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
      for (const t of ["empresa_gastos_mensuales", "gastos_categorias", "bancos_saldos"]) {
        expect(sql, `${f} no puede borrar ${t}`).not.toMatch(new RegExp(`DROP\\s+TABLE[^;]*${t}`, "i"));
      }
    }
    // La Disponibilidad SÍ tiene que seguir saliendo de `bancos_saldos`: esa
    // es la tabla viva de las tres y su número no puede moverse ni un centavo.
    const vg = leer("src/app/api/dashboard/vista-general/route.ts");
    expect(vg).toContain('.from("bancos_saldos")');
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

  it("las PESTAÑAS de un módulo tampoco se confunden entre sí", () => {
    // La regla nació para las fichas del menú, pero el defecto es el mismo en
    // cualquier lista que el usuario lee de un vistazo — y desde el 13-ago-2026
    // hay módulos con pestañas adentro (Usuarios estrenó "Data Health" como 2ª).
    // Se compara cada tira de pestañas CONSIGO MISMA: que una pestaña se llame
    // igual que su módulo es otra cosa (es su sección principal), no un choque.
    const TIRAS: Record<string, string[]> = {
      Usuarios: ["Usuarios", "Data Health"],
      // Gastos estrenó su 2ª pestaña el 13-ago-2026. "Gastos" vs "Saldos de
      // banco" no comparten ni una palabra que distinga: no hay confusión.
      Gastos: ["Gastos", "Saldos de banco"],
      Ventas: ["Resumen", "Clientes", "Productos", "Utilidad"],
      Multifashion: ["Resumen", "Vendedoras", "Productos", "Clientes", "Caja"],
    };
    const choques: string[] = [];
    for (const [modulo, pestanas] of Object.entries(TIRAS)) {
      for (let i = 0; i < pestanas.length; i += 1) {
        for (let j = i + 1; j < pestanas.length; j += 1) {
          if (seConfunden(pestanas[i], pestanas[j])) {
            choques.push(`${modulo}: "${pestanas[i]}" vs "${pestanas[j]}"`);
          }
        }
      }
    }
    expect(choques, `pestañas demasiado parecidas:\n${choques.join("\n")}`).toEqual([]);
  });

  it("una pestaña tampoco se puede confundir con OTRO módulo del menú", () => {
    // "Data Health" no puede parecerse a ninguna ficha que no sea la suya: si
    // se pareciera, quien busca el módulo terminaría adentro de otro.
    const propias = new Set(["Usuarios"]); // el módulo anfitrión de la pestaña
    const choques: string[] = [];
    for (const pestana of ["Data Health"]) {
      for (const m of ALL_MODULES) {
        if (propias.has(m.label)) continue;
        if (seConfunden(pestana, m.label)) choques.push(`"${pestana}" vs "${m.label}" (${m.key})`);
      }
    }
    expect(choques, `la pestaña se confunde con un módulo:\n${choques.join("\n")}`).toEqual([]);
  });

  it("🔴 \"Asistencia y Planilla\" no choca con nada del catálogo", () => {
    // Daniel, textual (13-ago-2026): *"y asistencia se debe de llamar asistencia
    // y planilla"*. El módulo ya calculaba la planilla; el nombre solo hablaba
    // de las marcaciones. Se verifica CONTRA EL CATÁLOGO REAL, no contra una
    // lista escrita a mano: un módulo nuevo llamado "Planilla" a secas —o
    // "Asistencia del reloj"— tiene que poner el build rojo.
    const asistencia = ALL_MODULES.find((m) => m.key === "asistencia")!;
    expect(asistencia.label).toBe("Asistencia y Planilla");
    // 🔴 La KEY no cambia: está en `role_permissions` y en
    // `fg_users.modulos_override`, y renombrarla rompería los permisos.
    expect(asistencia.href).toBe("/asistencia");
    for (const otro of ALL_MODULES) {
      if (otro.key === "asistencia") continue;
      expect(seConfunden(asistencia.label, otro.label), `choca con "${otro.label}"`).toBe(false);
    }
    // Y la "y" del medio no puede contar como palabra propia: sin eso,
    // "Asistencia" y "Asistencia y Planilla" se leerían como distintas por dos.
    expect(seConfunden("Asistencia", "Asistencia y Planilla")).toBe(true);
    expect(seConfunden("Asistencia y Planilla", "Planilla")).toBe(true);
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
