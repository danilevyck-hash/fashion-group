/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — QUIÉN ENTRA A MARCACIÓN, Y QUÉ VE (14-sep-2026)
 *
 * Daniel aprobó un reloj más: el del teléfono, para cuatro personas que
 * trabajan afuera y no pasan por ningún reloj físico — Ana Trejos (2), Cindy
 * De Gracia (3) y Yeisibeth Muñoz (306), impulsadoras de Multifashion, y
 * Rodrigo Miranda (13), bodega en Vistana. Textual: *«ponle marcación al
 * módulo»*, *«rodrigo es bodega con marcacion»*, *«me tienes q dar acceso a mi»*.
 *
 * 🔴 LO QUE ESTE ARCHIVO PROTEGE, y es lo único que importa: quien SOLO marca
 * no ve NADA más del sistema. Ni planilla, ni sueldos, ni las marcas de otra
 * persona, ni el resto de Asistencia. Las dos veces que un módulo de este
 * sistema quedó abierto —`/multifashion` y `/catalogos/admin/[marca]`, las dos
 * el 6-sep-2026— fue por una PÁGINA que no preguntaba nada mientras el
 * middleware solo miraba que la sesión existiera. Por eso acá se exige el
 * guard del lado del SERVIDOR, no del navegador.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect, beforeAll } from "vitest";
import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import {
  ALL_MODULES,
  SYSTEM_ROLE_KEYS,
  SYSTEM_ROLES,
  getVisibleModules,
  moduloCasaDeRol,
} from "@/lib/modules";
import {
  MODULO_MARCACION,
  ROL_MARCACION,
  ROLES_MODULO_MARCACION,
  RUTA_MARCACION,
  esRolMarcacion,
} from "@/lib/marcacion/rol";
import { puedeAbrirMarcacion, destinoSiNoAbreMarcacion, requireMarcacion } from "@/lib/marcacion/acceso";
import { modulosOfrecibles } from "@/lib/modulos-ofrecibles";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");

beforeAll(() => {
  process.env.SESSION_SECRET ||= "secreto-de-prueba-marcacion-0123456789abcdef";
});

/** Una cookie de sesión firmada de verdad, como la que arma el login. */
async function cookieDe(role: string, modules?: string[]): Promise<string> {
  const { signSession } = await import("@/lib/session-cookie");
  return signSession({ role, modules, userId: "u-1", userName: "quien-sea", sessionToken: "tok-1" });
}

async function reqDe(role: string, modules?: string[]): Promise<NextRequest> {
  const req = new NextRequest("http://localhost/api/marcacion", { method: "POST" });
  req.cookies.set("cxc_session", await cookieDe(role, modules));
  return req;
}

/* ═══ 1 · EL ROL VE UN SOLO MÓDULO ════════════════════════════════════════ */

describe("🔴 quien solo marca no ve nada más", () => {
  it("el rol existe, se llama `marcacion` y tiene nombre en pantalla", () => {
    expect(SYSTEM_ROLE_KEYS).toContain(ROL_MARCACION);
    const fila = SYSTEM_ROLES.find((r) => r.key === ROL_MARCACION);
    expect(fila?.label).toBe("Marcación");
    expect(esRolMarcacion("marcacion")).toBe(true);
    expect(esRolMarcacion("bodega")).toBe(false);
  });

  it("🔴 su lista de módulos visibles es UNO: Marcación", () => {
    const visibles = getVisibleModules(ROL_MARCACION).map((m) => m.key);
    expect(visibles).toEqual([MODULO_MARCACION]);
  });

  it("🔴 y lo mismo con la lista que trae su cookie (el override no le suma nada)", () => {
    expect(getVisibleModules(ROL_MARCACION, [MODULO_MARCACION]).map((m) => m.key)).toEqual([MODULO_MARCACION]);
  });

  it("🔴 uno por uno: ningún otro módulo del catálogo lo nombra en sus roles", () => {
    const colados = ALL_MODULES.filter(
      (m) => m.key !== MODULO_MARCACION && m.roles.includes(ROL_MARCACION),
    ).map((m) => m.key);
    expect(colados, `«marcacion» se coló en: ${colados.join(", ")}`).toEqual([]);
  });

  it("🔴 y no se le puede regalar otro módulo desde Usuarios", () => {
    expect(modulosOfrecibles(ROL_MARCACION).map((m) => m.key)).toEqual([MODULO_MARCACION]);
  });

  it("su casa es Marcación, y ahí aterriza desde el Inicio", () => {
    expect(moduloCasaDeRol(ROL_MARCACION)).toBe(MODULO_MARCACION);
    const ficha = ALL_MODULES.find((m) => m.key === MODULO_MARCACION);
    expect(ficha?.href).toBe(RUTA_MARCACION);
  });
});

/* ═══ 2 · EL ADMIN ENTRA, Y ESO NO ABRE NADA MÁS ══════════════════════════ */

describe("🔴 Daniel entra a probarlo en su iPhone", () => {
  it("admin ve la ficha de Marcación", () => {
    expect([...ROLES_MODULO_MARCACION]).toContain("admin");
    expect(getVisibleModules("admin").map((m) => m.key)).toContain(MODULO_MARCACION);
    expect(puedeAbrirMarcacion({ role: "admin" })).toBe(true);
  });

  it("🔴 pero el admin NO se auto-redirige: sigue aterrizando en su Inicio", () => {
    // El redirect del home se salta al admin antes de mirar nada, y su casa
    // no está fijada. Si alguna de las dos cosas cambiara, Daniel abriría la
    // app y caería en la pantalla de marcar.
    expect(moduloCasaDeRol("admin")).toBeNull();
    const home = sinComentarios(leer("src/app/home/page.tsx"));
    expect(home).toContain('if (role === "admin") return;');
  });

  it("🔴 que el admin lo vea no se lo abre a nadie más: la lista por ROL son dos", () => {
    expect([...ROLES_MODULO_MARCACION].sort()).toEqual(["admin", "marcacion"]);
    // `bodega` NO está: si estuviera, TODOS los bodegas abrirían la pantalla
    // escribiendo la dirección. Rodrigo entra por su override, no por su rol.
    expect([...ROLES_MODULO_MARCACION]).not.toContain("bodega");
  });
});

/* ═══ 3 · EL GUARD, DEL LADO DEL SERVIDOR ═════════════════════════════════ */

describe("🔴 el guard SSR: sin permiso no llega ni el HTML", () => {
  it("🔴 el segmento /marcacion tiene guard en su LAYOUT, no en una página suelta", () => {
    // En el layout cubre la pantalla de marcar y cualquiera que nazca debajo.
    const rel = "src/app/marcacion/layout.tsx";
    expect(fs.existsSync(path.join(RAIZ, rel)), "el portero de /marcacion desapareció").toBe(true);
    const src = sinComentarios(leer(rel));
    expect(src).toContain("destinoSiNoAbreMarcacion");
    expect(src).toContain("redirect(destino)");
    // Y es de servidor: sin "use client" y leyendo la cookie con `cookies()`.
    expect(src).not.toContain('"use client"');
    expect(src).toContain("cookies()");
  });

  it("sin sesión manda a la contraseña; con sesión y sin permiso, al Inicio", async () => {
    expect(destinoSiNoAbreMarcacion(undefined)).toBe("/");
    expect(destinoSiNoAbreMarcacion("basura-sin-firma")).toBe("/");
    expect(destinoSiNoAbreMarcacion(await cookieDe("contabilidad"))).toBe("/home");
    expect(destinoSiNoAbreMarcacion(await cookieDe("secretaria", ["caja", "guias"]))).toBe("/home");
    expect(destinoSiNoAbreMarcacion(await cookieDe(ROL_MARCACION, [MODULO_MARCACION]))).toBeNull();
    expect(destinoSiNoAbreMarcacion(await cookieDe("admin"))).toBeNull();
  });

  it("🔴 falla CERRADO: sin sesión, sin rol conocido y sin módulos, no entra", () => {
    expect(puedeAbrirMarcacion(null)).toBe(false);
    expect(puedeAbrirMarcacion(undefined)).toBe(false);
    expect(puedeAbrirMarcacion({ role: "inventado" })).toBe(false);
    expect(puedeAbrirMarcacion({ role: "bodega" })).toBe(false);
    expect(puedeAbrirMarcacion({ role: "bodega", modules: [] })).toBe(false);
  });

  it("las rutas contestan 401 sin sesión y 403 sin permiso", async () => {
    const sinSesion = requireMarcacion(new NextRequest("http://localhost/api/marcacion", { method: "POST" }));
    expect(sinSesion).toBeInstanceOf(NextResponse);
    expect((sinSesion as NextResponse).status).toBe(401);

    const ajeno = requireMarcacion(await reqDe("contabilidad"));
    expect((ajeno as NextResponse).status).toBe(403);

    const bodegaSinModulo = requireMarcacion(await reqDe("bodega", ["guias"]));
    expect((bodegaSinModulo as NextResponse).status).toBe(403);

    const entra = requireMarcacion(await reqDe(ROL_MARCACION, [MODULO_MARCACION]));
    expect(entra).not.toBeInstanceOf(NextResponse);
  });

  it("🔴 CONTROL: si nace una ruta /api/marcacion/*, pasa por `requireMarcacion`", () => {
    const dir = path.join(RAIZ, "src/app/api/marcacion");
    if (!fs.existsSync(dir)) return; // todavía no existe: la pantalla es de otra mano
    const anda = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? anda(path.join(d, e.name)) : /route\.tsx?$/.test(e.name) ? [path.join(d, e.name)] : [],
      );
    const rutas = anda(dir);
    expect(rutas.length, "hay carpeta /api/marcacion sin una sola ruta").toBeGreaterThan(0);
    for (const abs of rutas) {
      const src = sinComentarios(leer(path.relative(RAIZ, abs)));
      expect(src, `${path.relative(RAIZ, abs)} no pregunta quién entra`).toContain("requireMarcacion");
    }
  });
});

/* ═══ 4 · RODRIGO ═════════════════════════════════════════════════════════ */

describe("🔴 Rodrigo: bodega con Marcación, y sin abrírselo a los demás bodegas", () => {
  const sql = leer("supabase/migrations/20261125120000_rol_marcacion_y_rodrigo.sql");

  it("🔴 CONSERVA GUÍAS: el override se arma con la lista de bodega MÁS marcacion", () => {
    // El override REEMPLAZA la lista del rol, no la suma: si acá se escribiera
    // solo `{marcacion}`, Rodrigo perdería Guías el día que se aplique.
    expect(sql).toContain("array_cat(");
    expect(sql).toContain("FROM role_permissions WHERE role = 'bodega'");
    // Y si esa fila no existiera, la red de seguridad trae Guías igual.
    expect(sql).toContain("'guias'");
    expect(sql).toContain("ARRAY['marcacion']::text[]");
  });

  it("🔴 y `bodega` NO gana el módulo: no se toca `role_permissions.bodega`", () => {
    expect(sql).not.toMatch(/UPDATE\s+role_permissions\s+SET[\s\S]{0,400}bodega/i);
    expect(sql).not.toMatch(/INSERT INTO role_permissions[\s\S]{0,200}'bodega'/i);
    // El catálogo tampoco: el módulo se da por persona.
    const ficha = ALL_MODULES.find((m) => m.key === MODULO_MARCACION);
    expect(ficha?.roles).not.toContain("bodega");
  });

  it("con su override puesto, ve Guías Y Marcación", () => {
    const suyos = getVisibleModules("bodega", ["guias", "catalogos", "referencia", "marcacion"]).map((m) => m.key);
    expect(suyos).toContain("guias");
    expect(suyos).toContain(MODULO_MARCACION);
    // Y lo que pierde al dejar de ser vendedor, se pierde: ya no es suyo.
    expect(suyos).not.toContain("cxc");
    expect(suyos).not.toContain("directorio");
  });

  it("la migración toca a UNA persona, por nombre exacto, y no borra nada", () => {
    expect(sql).toContain("name = 'rodrigo'");
    expect(sql).toContain("role = 'vendedor'"); // acotada a su rol de hoy
    // Nada se borra. (El `ON DELETE SET NULL` de la llave foránea no cuenta:
    // es lo que pasaría si un día se borrara una ficha de Asistencia, y lo que
    // hace es soltar el amarre, no borrar al usuario.)
    expect(sql).not.toMatch(/DELETE\s+FROM/i);
    expect(sql).not.toMatch(/\bilike\b/i);
    expect(sql).not.toMatch(/\bDROP\b/i);
  });

  it("🔴 y no le cambia la contraseña a nadie", () => {
    expect(sql).not.toMatch(/password/i);
  });
});

/* ═══ 5 · LOS TRES USUARIOS NUEVOS ════════════════════════════════════════ */

describe("🔴 ana · cindy · yeisibeth — el alta no crea un login ambiguo", () => {
  const script = leer("scripts/_crear-usuarios-marcacion.ts");

  it("usa la MISMA comprobación de contraseña repetida que la app", () => {
    expect(script).toContain("contrasenaEnUso");
    expect(script).toContain('from "../src/lib/auth/contrasena-en-uso"');
  });

  it("🔴 TODO O NADA: si una choca, no se crea ninguna", () => {
    expect(script).toContain("problemas");
    expect(script).toContain("NO SE CREÓ NADA");
    // La comprobación va ANTES del primer insert.
    expect(script.indexOf("contrasenaEnUso")).toBeLessThan(script.indexOf(".insert("));
  });

  it("las tres nacen con el rol `marcacion` y atadas a su colaborador", () => {
    for (const [usuario, codigo] of [["ana", "2"], ["cindy", "3"], ["yeisibeth", "306"]]) {
      expect(script).toContain(`name: "${usuario}"`);
      expect(script).toContain(`empleado_codigo: "${codigo}"`);
    }
    expect(script).toContain("role: ROL_MARCACION");
  });

  it("🔴 no se corre solo: escribe únicamente con --crear", () => {
    expect(script).toContain('process.argv.includes("--crear")');
    expect(script).toContain("Solo se mostró");
  });
});
