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
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔄 CAMBIO DE DIRECCIÓN, CON NOTA FECHADA (11-sep-2026). NINGÚN CASO SE BORRÓ.
 *
 * Daniel, textual: «data health quiero que el sistema o tú mida todo pero no
 * verlo… no lo uso y no lo quiero usar». Y antes: «yo no uso Data Health,
 * nunca lo veo». La PANTALLA se retiró entera: se fue la 2ª pestaña, se fue el
 * aviso del Inicio y `DataHealthTab.tsx` dejó de existir.
 *
 * 🔴 LA MEDICIÓN NO SE TOCÓ Y ES LO QUE IMPORTA: el cron `integrity-check`
 * sigue a las 12:00 UTC, `data_integrity_checks` sigue insert-only (870 filas
 * y 121 corridas al 11-sep-2026), `LIVE_CHECK_NAMES` no cambió y un check
 * `critical` sigue avisando por 🔧 SISTEMA. Lo que queda para MIRARLO sin
 * pantalla es `GET /api/diag/data-health` (CRON_SECRET o sesión de admin).
 * Eso lo exige el candado nuevo, `data-health-sin-pantalla.test.ts`.
 *
 * Acá, los bloques 3 (la pestaña), 4 (el redirect) y 5 (la mudanza llegó
 * entera) cambiaron de dirección: exigen lo CONTRARIO, con el mismo detalle y
 * con controles para que la ausencia no sea un test que pasa por vacío. Los
 * bloques 1, 2, 6 y 7 —el catálogo, quién ve qué, un solo h1 y el patrón de
 * pestañas— siguen EXACTAMENTE como estaban: eran sobre Usuarios, no sobre
 * Data Health, y esa pantalla no se movió.
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
// 🔄 11-sep-2026: este archivo YA NO EXISTE. La constante se conserva porque
// varios casos de abajo exigen justamente su ausencia.
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
  // 10-sep-2026 · NOTA FECHADA — sin «packing-lists» en secretaria ni en bodega:
  // el módulo se RETIRÓ (Daniel: «packing list no se usa, eliminar»;
  // `packing_lists` con 0 filas desde el 14-may-2026). Ningún rol gana nada;
  // los dos que lo tenían lo pierden, y ninguno lo usaba.
  // 🔴 `cxc` ENTRA el 11-sep-2026 — Daniel, textual: *«a) sí, le doy CXC
  // completo»*. Cambio DELIBERADO y ajeno a esta mudanza: la secretaria ya
  // cobraba (la pantalla y las 12 rutas de `/api/cxc/*` la nombran por
  // `ROLES_CXC`), lo que faltaba era que el módulo le SALIERA en el menú. El
  // candado hizo lo suyo y frenó el build hasta acá. Detalle en
  // `cxc-secretaria-cobra.test.ts`.
  secretaria: ["catalogos", "guias", "asistencia", "reclamos", "cargar",
    "comisiones", "marketing", "caja", "cheques", "directorio", "cxc"],
  // 🔴 `asistencia` desde el 26-ago-2026: Daniel, textual *«julio usa el
  // usuario bodega, asi que ponlo ahi»* — para que Julio Garay apruebe las
  // horas extra que él mismo reporta. Cambio DELIBERADO, ajeno a esta mudanza.
  // ⚠️ Es la ficha, no la Planilla: ve UNA pestaña y la ruta le contesta sin un
  // solo sueldo (`api/asistencia-bodega-solo-aprueba.test.ts`).
  bodega: ["asistencia", "referencia", "catalogos", "guias"],
  // `saldos-banco` salió el 13-ago-2026: dejó de ser módulo (es la 2ª pestaña
  // de "Gastos"). La puerta al dato sigue abierta por `gastos-contabilidad`.
  // `comisiones` ENTRA el 25-ago-2026 — Daniel, textual: *"Q contabilidad vea
  // comisiones"*. Cambio DELIBERADO, ajeno a esta mudanza: el candado hizo lo
  // suyo y frenó el build hasta acá. El detalle (y las mediciones) están en
  // `comisiones-contabilidad.test.tsx`.
  contabilidad: ["proveedores", "asistencia", "gastos-contabilidad", "prestamos", "comisiones"],
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
    // ⚠️ El override REAL de Angela traía además «packing-lists»; se quita de
    // esta foto el 10-sep-2026 porque la migración 20261110120000 lo saca de su
    // `modulos_override` en producción, con el módulo. Lo que este caso prueba
    // —que tener `usuarios` a mano no regala Data Health— no depende de esa key.
    const angela = ["directorio", "marketing", "cheques", "caja", "comisiones", "guias",
      "reclamos", "catalogos", "cargar", "cxc", "usuarios"];
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
    // Cuenta MÓDULOS visibles, no grupos: bodega tiene 5 desde el 26-ago-2026
    // (Asistencia, para que Julio Garay apruebe horas extra) y gerente_acs
    // sigue teniendo 1 (redirige a Multifashion). Ninguno de los dos toca
    // Administración, así que esta mudanza no puede alterarlos.
    // 🔑 Lo que importa acá es que bodega siga SIN redirigir.
    // 10-sep-2026 · NOTA FECHADA — de 5 pasa a **4**: se retiró Packing Lists
    // (Daniel: «packing list no se usa, eliminar»). 4 sigue siendo más de 1, así
    // que el atajo de «rol con un solo módulo» sigue apagado para bodega — que
    // es lo único que este candado protege.
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

  // 🔄 CAMBIO DE DIRECCIÓN (11-sep-2026). Exigía que la pestaña de Data Health
  // se dibujara y se montara SOLO para admin. La pestaña se retiró, así que
  // ahora se exige que no exista — ni el trigger ni el contenido.
  it("la pestaña de Data Health ya no se dibuja ni se monta", () => {
    const src = plano(leer(PAGINA));
    expect(src).toContain('const esAdmin = role === "admin"');
    expect(src).not.toContain('<TabsTrigger value="data-health"');
    expect(src).not.toContain('<TabsContent value="data-health"');
    expect(src).not.toContain("DataHealthTab");
    // CONTROL: el gate de admin sigue vivo y sigue protegiendo a la pestaña
    // que SÍ quedó («Novedades»). Sin esto, borrar `esAdmin` entero pasaría.
    expect(src).toMatch(/\{esAdmin && \(\s*<TabsTrigger value="novedades"/);
    expect(src).toMatch(/\{esAdmin && \(\s*<TabsContent value="novedades"/);
  });

  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 9-sep-2026, y no se borró.
  //
  // Hasta hoy este candado exigía la comparación TEXTUAL
  // `(tabRaw !== "data-health" || esAdmin)`. Ese día nació la 3ª pestaña
  // —«Novedades», la lista de avisos de «qué cambió»—, que también es solo de
  // admin, y la condición pasó a ser una LISTA (`SOLO_ADMIN`). Escribir la
  // segunda a mano al lado de la primera es exactamente cómo nace la tercera
  // pestaña que se le abre a quien no debe.
  //
  // Lo que el candado protege NO cambió: un `?tab=` que este rol no puede ver
  // cae en «Usuarios», nunca en blanco.
  //
  // 🔄 11-sep-2026: `data-health` salió de `SOLO_ADMIN` porque salió de `TABS`.
  // Un `?tab=data-health` guardado en un marcador ahora cae en Usuarios por la
  // MISMA regla que cualquier basura: no está en `TABS`. Se exige eso.
  it("un `?tab=` que este rol no puede ver cae en Usuarios, nunca en blanco", () => {
    const src = plano(leer(PAGINA));
    expect(src).toMatch(/const SOLO_ADMIN[^\n]*=\s*\[[^\]]*"novedades"/);
    expect(src).toContain("!SOLO_ADMIN.includes(tabRaw) || esAdmin");
    expect(src).toContain(': "usuarios"');
    // `data-health` no está en TABS: un marcador viejo cae en Usuarios.
    expect(src).toMatch(/const TABS = \["usuarios", "novedades"\] as const/);
  });

  // 🔄 CAMBIO DE DIRECCIÓN (11-sep-2026). Exigía que
  // `/api/admin/data-health` pidiera admin. Esa ruta servía a la pantalla y se
  // retiró; la lectura vive ahora en `/api/diag/data-health`, con CRON_SECRET
  // o sesión de admin. El detalle de su puerta lo exige el candado nuevo.
  it("la ruta que servía a la pantalla se retiró, y la de lectura pide auth", () => {
    expect(existsSync(join(raiz, "src/app/api/admin/data-health/route.ts"))).toBe(false);
    const api = plano(leer("src/app/api/diag/data-health/route.ts"));
    expect(api).toContain("process.env.CRON_SECRET");
    expect(api).toContain('verifySession(req.cookies.get("cxc_session")?.value)?.role === "admin"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. La dirección vieja tiene que seguir llegando
// ─────────────────────────────────────────────────────────────────────────────

describe("`/admin/data-health` sigue llegando a algún lado", () => {
  // 🔄 CAMBIO DE DIRECCIÓN (11-sep-2026). El destino era la pestaña; ahora es
  // el Inicio, porque la pestaña no existe. Lo que este bloque protege NO
  // cambió: la dirección vieja —que Daniel tiene en marcadores y que las
  // alertas de integridad le mandaron por Telegram durante meses— no puede
  // terminar en un 404.
  it("redirige al Inicio, con el mismo mecanismo que los slugs viejos", () => {
    const cfg = leer("next.config.js");
    for (const ruta of ["/admin/data-health", "/data-health"]) {
      const linea = cfg.split("\n").find((l) => l.includes(`source: "${ruta}"`));
      expect(linea, `falta el redirect de ${ruta}`).toBeTruthy();
      expect(linea!).toContain('destination: "/home"');
      // Temporal, como el resto: no se quema en el caché del navegador.
      expect(linea!).toContain("permanent: false");
    }
  });

  it("la ruta vieja ya no existe (si existiera, ganaría sobre el redirect)", () => {
    expect(existsSync(join(raiz, "src/app/admin/data-health/page.tsx"))).toBe(false);
    expect(existsSync(join(raiz, "src/app/data-health"))).toBe(false);
  });

  // 🔄 CAMBIO DE DIRECCIÓN (11-sep-2026). Exigía que la alerta y el aviso del
  // Inicio apuntaran a la pestaña. El aviso del Inicio se retiró y la alerta
  // dejó de llevar link: mandar a Daniel a una pantalla que no existe es el
  // marcador roto que este repo evita. El aviso 🔧 SISTEMA se basta solo.
  it("la alerta de integridad ya no manda a ninguna pantalla", () => {
    const alerta = plano(leer("src/lib/integrity-check-run.ts"));
    expect(alerta).not.toContain("https://fashiongr.com");
    expect(alerta).not.toContain("Dashboard:");
    // CONTROL: sigue diciendo lo que pasó (check, tabla, filas) y sigue
    // saliendo por el canal de sistema. Sin esto, vaciar la función pasaría.
    expect(alerta).toContain("🔴 Integridad:");
    expect(alerta).toContain("r.check_name");
    expect(alerta).toContain("enviarSistema(buildCriticalAlert(criticals))");
  });

  it("no quedó ningún enlace VIVO a la dirección vieja dentro de la app", () => {
    for (const archivo of [PAGINA, "src/app/home/page.tsx", "src/lib/integrity-check-run.ts", "src/lib/modules.ts"]) {
      const src = plano(leer(archivo));
      expect(src, `${archivo} todavía enlaza la dirección vieja`).not.toContain("/admin/data-health");
      expect(src, `${archivo} todavía enlaza la pestaña vieja`).not.toContain("?tab=data-health");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. No se perdió NADA de Data Health — es una mudanza
// ─────────────────────────────────────────────────────────────────────────────

describe("la pantalla de Data Health se retiró entera (11-sep-2026)", () => {
  // 🔄 CAMBIO DE DIRECCIÓN, CON NOTA FECHADA. NADA SE BORRÓ.
  //
  // Este bloque exigía que la MUDANZA del 13-ago no perdiera nada: las cuatro
  // piezas de la pantalla, las dos lecturas y las seis explicaciones de checks,
  // todo dentro de `DataHealthTab.tsx`. El 11-sep Daniel pidió lo contrario:
  // «data health quiero que el sistema o tú mida todo pero no verlo… no lo uso
  // y no lo quiero usar». Así que ahora se exige que la pantalla NO esté —y,
  // pieza por pieza, que lo que MIDE siga estando—. Un test de ausencia pasa
  // por vacío con una ruta mal escrita, así que cada caso lleva su CONTROL.
  it("el componente no existe y la página no lo monta", () => {
    expect(existsSync(join(raiz, PESTANA))).toBe(false);
    const pag = plano(leer(PAGINA));
    expect(pag).not.toContain('import DataHealthTab from "./DataHealthTab"');
    expect(pag).not.toContain("<DataHealthTab />");
  });

  it("🔴 CONTROL: lo que MIDE sigue entero — el cron, los checks y la tabla", () => {
    // La lógica que corre los chequeos, intacta.
    expect(existsSync(join(raiz, "src/lib/integrity-checks.ts"))).toBe(true);
    expect(existsSync(join(raiz, "src/lib/integrity-check-run.ts"))).toBe(true);
    expect(existsSync(join(raiz, "src/app/api/cron/integrity-check/route.ts"))).toBe(true);
    const checks = plano(leer("src/lib/integrity-checks.ts"));
    expect(checks).toContain("export const LIVE_CHECK_NAMES");
    // Escribe en la tabla, que es insert-only y no se toca.
    expect(checks).toContain('from("data_integrity_checks")');
  });

  it("🔴 CONTROL: los 6 checks vivos siguen vivos", () => {
    // Eran las seis explicaciones de la PANTALLA; ahora se exigen donde de
    // verdad importan: en la allowlist que decide qué se mide y se muestra.
    const checks = plano(leer("src/lib/integrity-checks.ts"));
    const lista = checks.slice(checks.indexOf("export const LIVE_CHECK_NAMES"));
    for (const check of [
      "cheques_criticos_null",
      "prestamos_saldo_anomalo",
      "last_upload_age_cxc",
      "aging_tipos_sin_clasificar",
      "aging_dias_anomalo",
      "switch_facturas_continuidad",
    ]) {
      expect(lista, `se perdió el check ${check}`).toContain(`"${check}"`);
    }
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

  // 🔄 11-sep-2026: exigía que `DataHealthTab.tsx` no trajera h1 propio. El
  // archivo se retiró, así que la garantía es más fuerte: no hay segundo h1
  // posible porque no hay segundo archivo. El conteo de arriba lo cubre.
  it("🔴 no quedó ninguna pestaña con h1 propio", () => {
    expect(existsSync(join(raiz, PESTANA))).toBe(false);
    // CONTROL: la pestaña que SÍ quedó tampoco trae uno.
    expect((plano(leer("src/app/admin/usuarios/NovedadesTab.tsx")).match(/<h1\b/g) || []).length).toBe(0);
  });

  it("las filas que quedaron con un solo botón dicen `justify-end`", () => {
    // Sin esto el botón se va al borde IZQUIERDO y se ve colgando.
    expect(plano(leer(PAGINA))).toContain("flex items-end justify-end gap-4 flex-wrap");
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

  // 🔄 11-sep-2026: eran dos pestañas (Usuarios · Data Health) y hoy son dos
  // distintas (Usuarios · Novedades). Data Health se retiró y no puede volver
  // por acá sin que el candado nuevo lo cace.
  it("las pestañas dicen su nombre, y ninguna dice Data Health", () => {
    expect(src).toContain("> Usuarios");
    expect(src).toContain("> Novedades");
    expect(src).not.toContain("Data Health");
  });
});
