/**
 * Candados de la MUDANZA de Data Health a Usuarios (13-ago-2026).
 *
 * Daniel pidió menos módulos en el menú y aprobó UNA cosa concreta: *"Data
 * Health deja de ser un módulo suelto y pasa a vivir dentro de Usuarios"*. Es
 * una MUDANZA, no un recorte — la pantalla es la misma, entera, como 2ª pestaña
 * de `/admin/usuarios`.
 *
 * 🔴 EL RIESGO DE VERDAD NO ES LA PANTALLA: ES EL PERMISO. Meter una pantalla
 * admin-only adentro de otra pantalla es, por defecto, hacer que herede los
 * permisos de la anfitriona. Y acá eso NO es teórico: medido contra producción
 * el 13-ago-2026, `role_permissions` tiene `data-health` SOLO en `admin`, pero
 * `fg_users.modulos_override` de **Angela (secretaria)** trae `usuarios`. O sea
 * que existe, hoy, una persona no-admin con la key de la anfitriona. Si el
 * guard de la página pasara de `moduleKey: "admin"` a `moduleKey: "usuarios"`,
 * ella ganaría Usuarios Y Data Health de un saque.
 *
 * Por eso los tests de acá miran las DOS direcciones:
 *   · nadie que no fuera admin gana Data Health (ni por rol, ni por override);
 *   · nadie que tuviera algo lo pierde (los 5 roles no-admin quedan idénticos).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import {
  ALL_MODULES,
  ALL_MODULE_KEYS,
  GROUPS,
  GROUP_ORDER,
  GROUP_LABELS,
  SYSTEM_ROLE_KEYS,
  getDefaultModulesForRole,
  getVisibleModules,
  getVisibleGroups,
  getModulesInGroup,
} from "@/lib/modules";

const raiz = join(__dirname, "..", "..", "..");
const leer = (p: string) => readFileSync(join(raiz, p), "utf8");

/** El archivo sin comentarios: un `/admin/data-health` citado en una nota no es
 *  un enlace vivo, y contarlo como tal haría que el candado se conforme con su
 *  propia explicación (el defecto que este repo ya se cazó a sí mismo). */
function plano(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");
}

const PAGINA = "src/app/admin/usuarios/page.tsx";
const PESTANA = "src/app/admin/usuarios/DataHealthTab.tsx";

// ─────────────────────────────────────────────────────────────────────────────
// 1. El catálogo de módulos
// ─────────────────────────────────────────────────────────────────────────────

describe("el catálogo: Data Health ya no es un módulo suelto", () => {
  it("`data-health` se fue de ALL_MODULES", () => {
    expect(ALL_MODULES.find((m) => m.key === "data-health")).toBeUndefined();
    expect(ALL_MODULE_KEYS).not.toContain("data-health");
  });

  it("Usuarios se queda tal cual: misma key, mismo nombre, misma ruta, mismos roles", () => {
    const usuarios = ALL_MODULES.find((m) => m.key === "usuarios");
    expect(usuarios).toBeTruthy();
    expect(usuarios!.label).toBe("Usuarios");
    expect(usuarios!.href).toBe("/admin/usuarios");
    expect(usuarios!.roles).toEqual(["admin"]);
    expect(usuarios!.group).toBe("administracion");
  });

  it("🔴 el grupo Administración SE QUEDA, con Usuarios adentro", () => {
    // La decisión: no se disuelve el grupo mudando Usuarios a "Operación".
    // Administración es admin-only (lo ve solo Daniel); mudarlo lo enterraría
    // entre los 13 módulos que el resto usa a diario, y borrar el grupo dejaría
    // `/g/administracion` muerta con el redirect viejo `/g/sistema` apuntándole.
    expect(GROUPS.map((g) => g.key)).toContain("administracion");
    expect(GROUP_ORDER).toContain("administracion");
    expect(GROUP_LABELS.administracion.title).toBe("Administración");
    expect(getModulesInGroup("administracion", "admin").map((m) => m.key)).toEqual(["usuarios"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Quién ve qué — rol por rol, en las dos direcciones
// ─────────────────────────────────────────────────────────────────────────────

/** Lo que cada rol NO-ADMIN ve por defecto. Copiado del estado vigente: este
 *  cambio no puede mover ni una key. (El snapshot literal de referencia vive en
 *  `catalogo-roles.test.ts`; acá se repite el invariante que importa para esta
 *  mudanza: que ninguno gane ni pierda nada.) */
const NO_ADMIN_ESPERADO: Record<string, string[]> = {
  secretaria: ["catalogos", "guias", "packing-lists", "asistencia", "reclamos", "cargar",
    "comisiones", "marketing", "caja", "cheques", "directorio"],
  bodega: ["referencia", "catalogos", "guias", "packing-lists"],
  // `saldos-banco` salió el 13-ago-2026: dejó de ser módulo (es la 2ª pestaña
  // de "Gastos"). La puerta al dato sigue abierta por `gastos-contabilidad`.
  contabilidad: ["proveedores", "asistencia", "gastos-contabilidad", "prestamos"],
  vendedor: ["referencia", "cxc", "directorio", "catalogos", "guias"],
  gerente_acs: ["multifashion"],
};

describe("quién ve qué — antes y después, rol por rol", () => {
  for (const [rol, esperado] of Object.entries(NO_ADMIN_ESPERADO)) {
    it(`${rol}: exactamente los mismos módulos que antes`, () => {
      expect(getDefaultModulesForRole(rol).sort()).toEqual([...esperado].sort());
    });
  }

  it("admin pierde la ficha `data-health` y NADA más", () => {
    const admin = getDefaultModulesForRole("admin");
    expect(admin).not.toContain("data-health");
    expect(admin).toContain("usuarios");
    // Y sigue teniendo todo el resto del catálogo.
    expect(admin.sort()).toEqual([...ALL_MODULE_KEYS].sort());
  });

  it("🔴 NINGÚN rol ve Data Health como módulo — ni por rol ni por permisos a mano", () => {
    for (const rol of SYSTEM_ROLE_KEYS) {
      expect(getVisibleModules(rol).map((m) => m.key)).not.toContain("data-health");
      // Y con la key vieja todavía escrita en la base (que es como está hoy:
      // `role_permissions.admin.modulos` la sigue trayendo), tampoco reaparece.
      const conKeyVieja = [...getDefaultModulesForRole(rol), "data-health"];
      expect(getVisibleModules(rol, conKeyVieja).map((m) => m.key)).not.toContain("data-health");
    }
  });

  it("🔴 quien tiene `usuarios` a mano NO gana Data Health (el caso REAL de Angela)", () => {
    // Override medido en producción el 13-ago-2026 para `Angela` (secretaria).
    const angela = ["directorio", "marketing", "cheques", "caja", "comisiones", "guias",
      "packing-lists", "reclamos", "catalogos", "cargar", "cxc", "usuarios"];
    const visibles = getVisibleModules("secretaria", angela).map((m) => m.key);
    // Lo que ya veía sigue igual (incluida la ficha `usuarios`, que la página le
    // rebota desde antes de este cambio — es un dato de la base, no del código).
    expect(visibles).toContain("usuarios");
    expect(visibles).toContain("cxc");
    // Y no aparece Data Health por ningún lado.
    expect(visibles).not.toContain("data-health");
    expect(visibles.filter((k) => k === "usuarios")).toHaveLength(1);
  });

  it("el auto-redirect de \"rol con un solo módulo\" no se mueve", () => {
    // Cuenta MÓDULOS visibles, no grupos: bodega tiene 4 (no redirige) y
    // gerente_acs sigue teniendo 1 (redirige a Multifashion). Ninguno de los dos
    // toca Administración, así que esta mudanza no puede alterarlos.
    expect(getVisibleModules("bodega").length).toBe(4);
    expect(getVisibleModules("gerente_acs").map((m) => m.href)).toEqual(["/multifashion"]);
    // Y admin, que es el único con Administración, está exento por código.
    expect(plano(leer("src/app/home/page.tsx"))).toContain('if (role === "admin") return;');
  });

  it("los grupos visibles de cada rol no cambian", () => {
    expect(getVisibleGroups("admin").map((g) => g.key)).toEqual(["ventas-clientes", "operacion", "administracion"]);
    for (const rol of ["secretaria", "bodega", "contabilidad", "vendedor", "gerente_acs"]) {
      expect(getVisibleGroups(rol).map((g) => g.key), `${rol}`).not.toContain("administracion");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. El permiso, escrito en la pantalla
// ─────────────────────────────────────────────────────────────────────────────

describe("la pantalla sigue siendo solo de admin", () => {
  it("🔴 el guard de la página NO se aflojó a `moduleKey: \"usuarios\"`", () => {
    const src = plano(leer(PAGINA));
    expect(src).toContain('useAuth({ moduleKey: "admin", allowedRoles: ["admin"] })');
    expect(src, "con `usuarios` como moduleKey, quien tenga esa key a mano entraría")
      .not.toContain('moduleKey: "usuarios"');
  });

  it("la pestaña de Data Health solo se dibuja y solo se monta para admin", () => {
    const src = plano(leer(PAGINA));
    expect(src).toContain('const esAdmin = role === "admin"');
    // El trigger y el contenido, los dos detrás del mismo gate.
    expect(src).toMatch(/\{esAdmin && \(\s*<TabsTrigger value="data-health"/);
    expect(src).toMatch(/\{esAdmin && \(\s*<TabsContent value="data-health"/);
  });

  it("un `?tab=` que este rol no puede ver cae en Usuarios, nunca en blanco", () => {
    const src = plano(leer(PAGINA));
    expect(src).toContain('(tabRaw !== "data-health" || esAdmin)');
    expect(src).toContain(': "usuarios"');
  });

  it("la API de Data Health sigue exigiendo admin", () => {
    const api = plano(leer("src/app/api/admin/data-health/route.ts"));
    expect(api).toMatch(/requireRole\(req,\s*\["admin"\]\)/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La dirección vieja tiene que seguir llegando
// ─────────────────────────────────────────────────────────────────────────────

describe("`/admin/data-health` sigue funcionando", () => {
  it("hay un redirect a la pestaña, con el mismo mecanismo que los slugs viejos", () => {
    const cfg = leer("next.config.js");
    expect(cfg).toContain('source: "/admin/data-health"');
    expect(cfg).toContain('destination: "/admin/usuarios?tab=data-health"');
    // Temporal, como el resto: no se quema en el caché del navegador.
    const linea = cfg.split("\n").find((l) => l.includes('source: "/admin/data-health"'))!;
    expect(linea).toContain("permanent: false");
  });

  it("la ruta vieja ya no existe (si existiera, ganaría sobre el redirect)", () => {
    expect(existsSync(join(raiz, "src/app/admin/data-health/page.tsx"))).toBe(false);
  });

  it("la alerta de integridad y el aviso del Inicio apuntan a la pestaña", () => {
    expect(plano(leer("src/lib/integrity-check-run.ts")))
      .toContain("https://fashiongr.com/admin/usuarios?tab=data-health");
    expect(plano(leer("src/app/home/page.tsx")))
      .toContain('router.push("/admin/usuarios?tab=data-health")');
  });

  it("no quedó ningún enlace VIVO a la dirección vieja dentro de la app", () => {
    // La API `/api/admin/data-health` NO se tocó y no cuenta acá.
    for (const archivo of [PAGINA, PESTANA, "src/app/home/page.tsx", "src/lib/integrity-check-run.ts", "src/lib/modules.ts"]) {
      const src = plano(leer(archivo)).replace(/\/api\/admin\/data-health/g, "");
      expect(src, `${archivo} todavía enlaza la dirección vieja`).not.toContain("/admin/data-health");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. No se perdió NADA de Data Health — es una mudanza
// ─────────────────────────────────────────────────────────────────────────────

describe("la pantalla de Data Health llegó entera", () => {
  // 🩸 SIN COMENTARIOS, Y NO ES UN DETALLE. La primera versión de este bloque
  // leía el archivo crudo, y el comentario de cabecera de `DataHealthTab.tsx`
  // enumera justamente las piezas que hay que conservar ("…el detalle en modal
  // y el botón «Correr checks ahora»"). Verificado por mutación: borrar el
  // BOTÓN dejaba el test en VERDE, porque se daba por satisfecho con su propia
  // explicación. Un candado así da permiso para romper.
  const src = plano(leer(PESTANA));

  it("existe como pestaña y la página la monta", () => {
    expect(existsSync(join(raiz, PESTANA))).toBe(true);
    expect(plano(leer(PAGINA))).toContain('import DataHealthTab from "./DataHealthTab"');
    expect(plano(leer(PAGINA))).toContain("<DataHealthTab />");
  });

  it("conserva las cuatro piezas de la pantalla", () => {
    // KPI por severidad, lista de checks, mapa de 30 días y detalle en modal.
    for (const pieza of [
      "Estado actual por check",
      "Historial 30 días",
      "Detalles técnicos",
      "Correr checks ahora",
      "SEVERITY_MEANING",
      "CHECK_INFO",
      "buildLast30Days",
      "<ModalOverlay",
    ]) {
      expect(src, `falta "${pieza}"`).toContain(pieza);
    }
  });

  it("sigue leyendo y sigue pudiendo correr los checks a mano", () => {
    expect(src).toContain('fetch("/api/admin/data-health", { cache: "no-store" })');
    expect(src).toContain('fetch("/api/cron/integrity-check", { cache: "no-store" })');
  });

  it("los 6 checks explicados siguen explicados", () => {
    for (const check of [
      "cheques_criticos_null",
      "prestamos_saldo_anomalo",
      "last_upload_age_cxc",
      "aging_tipos_sin_clasificar",
      "aging_dias_anomalo",
      "switch_facturas_continuidad",
    ]) {
      // 🩸 Se exige la ENTRADA del diccionario, no el texto suelto. Con un
      // `toContain(check)` a secas, renombrar la clave a `aging_dias_anomalo_XX`
      // —que rompe el pareo con `check_name` y deja el check sin explicación en
      // pantalla— seguía pasando en verde: el nombre viejo es prefijo del nuevo.
      // Verificado por mutación.
      expect(src, `se perdió la explicación de ${check}`).toContain(`${check}: {`);
    }
  });

  it("dejó de ser una página: sin AppHeader y sin su propio guard", () => {
    expect(src).not.toContain("AppHeader");
    expect(src).not.toContain("useAuth");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Un solo encabezado y un solo botón por fila
// ─────────────────────────────────────────────────────────────────────────────

describe("la página tiene UN encabezado, no dos", () => {
  it("`page.tsx` conserva exactamente un h1, `sr-only`, y dice \"Usuarios\"", () => {
    const p = plano(leer(PAGINA));
    expect(p).toContain('<h1 className="sr-only">Usuarios</h1>');
    expect((p.match(/<h1\b/g) || []).length).toBe(1);
  });

  it("🔴 la pestaña NO trae h1 propio (si no, el documento tendría dos)", () => {
    expect((plano(leer(PESTANA)).match(/<h1\b/g) || []).length).toBe(0);
  });

  it("las filas que quedaron con un solo botón dicen `justify-end`", () => {
    // Sin esto el botón se va al borde IZQUIERDO y se ve colgando.
    expect(plano(leer(PAGINA))).toContain("flex items-end justify-end gap-4 flex-wrap");
    expect(plano(leer(PESTANA))).toContain("flex flex-wrap items-start justify-end gap-4 mb-6");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Las pestañas — el patrón de la casa, no uno nuevo
// ─────────────────────────────────────────────────────────────────────────────

describe("las pestañas siguen el patrón de Ventas y Multifashion", () => {
  const src = plano(leer(PAGINA));

  it("usa Radix Tabs del repo y `useUrlState` para el `?tab=`", () => {
    expect(src).toContain('from "@/components/ui/tabs"');
    expect(src).toContain('useUrlState("tab", "usuarios")');
  });

  it("el subrayado teal y los 44 px al tacto", () => {
    expect(src).toContain("data-[state=active]:border-teal-700");
    expect(src).toContain("min-h-[44px]");
  });

  it("`useSearchParams` va dentro de su propio Suspense", () => {
    // Sin el límite, el build de Next 14 se pone rojo en esta ruta.
    expect(src).toMatch(/<Suspense>\s*<UsuariosPageInner \/>\s*<\/Suspense>/);
  });

  it("las dos pestañas se llaman como se llamaban las dos pantallas", () => {
    expect(src).toContain("> Usuarios");
    expect(src).toContain("> Data Health");
  });
});
