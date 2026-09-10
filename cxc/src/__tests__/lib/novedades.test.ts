// ─────────────────────────────────────────────────────────────────────────────
// «QUÉ CAMBIÓ» — LAS SIETE REGLAS, CADA UNA CON SU CANDADO (9-sep-2026).
//
// Daniel: *«a cada usuario que entre a cada módulo le salga mensajito de que hay
// nuevo o qué cambió, de manera súper resumida»*.
//
//   1. Se ve UNA sola vez por persona y por novedad.
//   2. No bloquea nada (candado en `novedades-aviso.test.tsx`).
//   3. Máximo 3 a la vez, las más nuevas.
//   4. Cada novedad es UNA línea, en el idioma de ellos.
//   5. Solo la ve quien TIENE ese módulo.
//   6. Caduca sola a los 30 días.
//   7. Nunca sale una novedad de un módulo dentro de otro.
//
// Más: las novedades son DATOS escritos a mano, y lo leído se guarda por
// PERSONA (tabla + respaldo en este navegador), nunca solo en un navegador.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
  MAX_A_LA_VEZ,
  DIAS_VIGENCIA,
  estaVigente,
  seAvisaDesde,
  idEsDelModulo,
  moduloDeRuta,
  novedadesPendientes,
  novedadesParaMostrar,
  type Novedad,
} from "@/lib/novedades/seleccion";
import { NOVEDADES } from "@/lib/novedades/lista";
import { ALL_MODULES, ALL_MODULE_KEYS } from "@/lib/modules";
import { CLASIFICACION } from "@/lib/backup/tablas";

const RAIZ = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

const HOY = "2026-09-09";
const TODOS_LOS_MODULOS = ALL_MODULE_KEYS;

/** Una novedad de mentira, para probar la regla sin depender de la lista real. */
const n = (id: string, modulo: string, fecha: string, desde?: string): Novedad =>
  ({ id, modulo, fecha, texto: `cambió algo en ${modulo}`, ...(desde ? { desde } : {}) });

const ctx = (extra: Partial<Parameters<typeof novedadesPendientes>[0]> = {}) => ({
  novedades: [] as Novedad[],
  moduloKey: "cxc" as string | null,
  hoy: HOY,
  vistas: [] as string[],
  modulosDelUsuario: TODOS_LOS_MODULOS as readonly string[],
  ...extra,
});

/* ═══ 1 · una sola vez por persona y por novedad ═══════════════════════════ */

describe("🔴 1 · cerrada, no vuelve", () => {
  it("la que ya cerró NO sale de nuevo", () => {
    const vistas = ["cxc-a"];
    const r = novedadesParaMostrar(ctx({
      novedades: [n("cxc-a", "cxc", "2026-09-08"), n("cxc-b", "cxc", "2026-09-08")],
      vistas,
    }));
    expect(r.map((x) => x.id)).toEqual(["cxc-b"]);
  });

  it("la que NUNCA cerró se sigue viendo", () => {
    const r = novedadesParaMostrar(ctx({
      novedades: [n("cxc-a", "cxc", "2026-09-08")],
      vistas: ["cxc-otra-que-no-es"],
    }));
    expect(r.map((x) => x.id)).toEqual(["cxc-a"]);
  });

  it("lo cerrado por UNA persona no apaga el aviso de otra", () => {
    const novedades = [n("cxc-a", "cxc", "2026-09-08")];
    expect(novedadesParaMostrar(ctx({ novedades, vistas: ["cxc-a"] }))).toHaveLength(0);
    expect(novedadesParaMostrar(ctx({ novedades, vistas: [] }))).toHaveLength(1);
  });

  it("el id EMPIEZA con la key de su módulo — sin eso, cerrar una apaga otra", () => {
    for (const nov of NOVEDADES) {
      expect(idEsDelModulo(nov), `«${nov.id}» no empieza con «${nov.modulo}-»`).toBe(true);
    }
  });

  it("no hay dos novedades con el mismo id", () => {
    const ids = NOVEDADES.map((x) => x.id);
    expect(new Set(ids).size, `ids repetidos: ${ids.join(", ")}`).toBe(ids.length);
  });
});

/* ═══ 3 · máximo tres, las más nuevas ═════════════════════════════════════ */

describe("🔴 3 · máximo TRES a la vez, y son las más nuevas", () => {
  const cinco = [
    n("cxc-1", "cxc", "2026-09-01"),
    n("cxc-2", "cxc", "2026-09-02"),
    n("cxc-3", "cxc", "2026-09-03"),
    n("cxc-4", "cxc", "2026-09-04"),
    n("cxc-5", "cxc", "2026-09-05"),
  ];

  it("el tope es 3", () => {
    expect(MAX_A_LA_VEZ).toBe(3);
  });

  it("con cinco pendientes se muestran TRES", () => {
    expect(novedadesParaMostrar(ctx({ novedades: cinco }))).toHaveLength(3);
  });

  it("y son las tres MÁS NUEVAS, de la más nueva a la más vieja", () => {
    expect(novedadesParaMostrar(ctx({ novedades: cinco })).map((x) => x.id))
      .toEqual(["cxc-5", "cxc-4", "cxc-3"]);
  });

  it("con la MISMA fecha el orden es estable, no el del array", () => {
    const mismas = [n("cxc-z", "cxc", "2026-09-08"), n("cxc-a", "cxc", "2026-09-08")];
    expect(novedadesParaMostrar(ctx({ novedades: mismas })).map((x) => x.id))
      .toEqual(["cxc-a", "cxc-z"]);
  });

  it("ningún módulo escribió más de 3 el mismo día: las de más nunca se verían", () => {
    const porDia = new Map<string, number>();
    for (const nov of NOVEDADES) {
      const k = `${nov.modulo}·${nov.fecha}`;
      porDia.set(k, (porDia.get(k) ?? 0) + 1);
    }
    const pasadas = [...porDia].filter(([, c]) => c > MAX_A_LA_VEZ);
    expect(pasadas.map(([k]) => k), "se enterrarían novedades").toEqual([]);
  });

  it("`novedadesPendientes` NO corta: el corte es del que muestra", () => {
    expect(novedadesPendientes(ctx({ novedades: cinco }))).toHaveLength(5);
  });
});

/* ═══ 4 · una línea, en el idioma de ellos ════════════════════════════════ */

describe("🔴 4 · cada novedad es UNA línea y se entiende sin ser técnico", () => {
  it("ninguna trae salto de línea", () => {
    for (const nov of NOVEDADES) {
      expect(nov.texto.includes("\n"), `«${nov.id}» tiene más de una línea`).toBe(false);
    }
  });

  it("ninguna pasa de 160 caracteres — es un aviso, no un párrafo", () => {
    for (const nov of NOVEDADES) {
      expect(nov.texto.length, `«${nov.id}» mide ${nov.texto.length}`).toBeLessThanOrEqual(160);
    }
  });

  it("cero jerga: ni rutas, ni nombres de tabla, ni «endpoint»", () => {
    // Los usuarios son secretarias, bodegueros y vendedores en Panamá.
    const PROHIBIDO = [
      /\bendpoint\b/i, /\bAPI\b/, /\bcommit\b/i, /\bdeploy/i, /\bmigraci[oó]n\b/i,
      /\bbase de datos\b/i, /\bquery\b/i, /\bbackend\b/i, /\bfrontend\b/i,
      /\bswitch_[a-z_]+/i, /\bcxc_[a-z_]+/i, /\bguia_[a-z_]+/i, /\bcomision_[a-z_]+/i,
      /\/api\//, /\bsrc\//,
    ];
    for (const nov of NOVEDADES) {
      for (const re of PROHIBIDO) {
        expect(re.test(nov.texto), `«${nov.id}» dice jerga: ${re}`).toBe(false);
      }
    }
  });

  it("ninguna está vacía ni con espacios de sobra en los bordes", () => {
    for (const nov of NOVEDADES) {
      expect(nov.texto).toBe(nov.texto.trim());
      expect(nov.texto.length).toBeGreaterThan(10);
    }
  });
});

/* ═══ 5 · solo la ve quien tiene el módulo ════════════════════════════════ */

describe("🔴 5 · solo la ve quien TIENE ese módulo", () => {
  it("una novedad de Comisiones NO le sale a quien no tiene Comisiones", () => {
    const r = novedadesParaMostrar(ctx({
      novedades: [n("comisiones-a", "comisiones", "2026-09-08")],
      moduloKey: "comisiones",
      // Los módulos de bodega, sin `comisiones`.
      modulosDelUsuario: ALL_MODULES.filter((m) => m.roles.includes("bodega")).map((m) => m.key),
    }));
    expect(r).toEqual([]);
  });

  it("y SÍ le sale a quien sí lo tiene (control)", () => {
    const r = novedadesParaMostrar(ctx({
      novedades: [n("comisiones-a", "comisiones", "2026-09-08")],
      moduloKey: "comisiones",
      modulosDelUsuario: ["comisiones"],
    }));
    expect(r).toHaveLength(1);
  });

  it("bodega no tiene Comisiones — es lo que hace real a la prueba de arriba", () => {
    const comisiones = ALL_MODULES.find((m) => m.key === "comisiones")!;
    expect(comisiones.roles).not.toContain("bodega");
  });

  it("quién ve qué lo decide el SERVIDOR, con los módulos de la cookie firmada", () => {
    const ruta = leer("src/app/api/novedades/route.ts");
    expect(ruta).toContain("requireRole");
    expect(ruta).toContain("modulosDelUsuario");
    // No sale de la URL ni del cuerpo: sale de la sesión.
    expect(/modulosDelUsuario:\s*modulosDe\(auth\)/.test(ruta)).toBe(true);
  });

  it("el POST tampoco deja anotar una novedad de un módulo ajeno", () => {
    const ruta = leer("src/app/api/novedades/route.ts");
    expect(/suyos\.has\(n\.modulo\)/.test(ruta), "el POST no recorta por módulo").toBe(true);
  });
});

/* ═══ 6 · caduca sola a los 30 días ═══════════════════════════════════════ */

describe("🔴 6 · a los 30 días se va sola", () => {
  it("la vigencia son 30 días", () => {
    expect(DIAS_VIGENCIA).toBe(30);
  });

  it("la de hoy y la del día 30 se ven; la del 31 ya no", () => {
    expect(estaVigente(n("cxc-a", "cxc", "2026-09-09"), HOY)).toBe(true);
    expect(estaVigente(n("cxc-a", "cxc", "2026-08-10"), HOY)).toBe(true);   // 30 días
    expect(estaVigente(n("cxc-a", "cxc", "2026-08-09"), HOY)).toBe(false);  // 31
  });

  it("una de hace TRES MESES no sale por ningún lado", () => {
    const vieja = n("cxc-vieja", "cxc", "2026-06-09");
    expect(estaVigente(vieja, HOY)).toBe(false);
    expect(novedadesParaMostrar(ctx({ novedades: [vieja] }))).toEqual([]);
  });

  it("una con fecha FUTURA tampoco: es un cambio que todavía no salió", () => {
    expect(estaVigente(n("cxc-a", "cxc", "2026-09-10"), HOY)).toBe(false);
  });

  it("cruza el fin de mes sin equivocarse (agosto tiene 31)", () => {
    expect(estaVigente(n("cxc-a", "cxc", "2026-08-15"), "2026-09-14")).toBe(true);
    expect(estaVigente(n("cxc-a", "cxc", "2026-08-15"), "2026-09-15")).toBe(false);
  });
});

/* ═══ 6b · «salen todas, aunque sean viejas» ══════════════════════════════ */

describe("🔴 6b · los 30 días se cuentan desde que se AVISA, no desde que cambió", () => {
  // Daniel, 9-sep-2026: *«Salen todas — que se enteren de todo aunque sea
  // viejo»*. El aviso nació el 9-sep con lo de esa semana; el resto del trabajo
  // de dos semanas se escribió después. Sin esto, un cambio del 25-ago nacería
  // con cuatro días de vida.
  it("sin `desde`, se cuenta desde el día del cambio — como siempre", () => {
    expect(seAvisaDesde(n("cxc-a", "cxc", "2026-08-25"))).toBe("2026-08-25");
  });

  it("con `desde`, se cuenta desde ese día", () => {
    expect(seAvisaDesde(n("cxc-a", "cxc", "2026-08-25", "2026-09-09"))).toBe("2026-09-09");
  });

  it("🔴 una novedad VIEJA que recién hoy se avisa SÍ se ve", () => {
    const vieja = n("cxc-vieja", "cxc", "2026-08-25", "2026-09-09");
    expect(estaVigente(vieja, HOY)).toBe(true);
    expect(novedadesParaMostrar(ctx({ novedades: [vieja] })).map((x) => x.id))
      .toEqual(["cxc-vieja"]);
  });

  it("CONTROL: la MISMA novedad sin `desde` se apaga 15 días antes", () => {
    // Las dos son del 25-ago; lo que se mide es CUÁNDO se apaga cada una.
    const conDesde = n("cxc-a", "cxc", "2026-08-25", "2026-09-09");
    const sinDesde = n("cxc-b", "cxc", "2026-08-25");
    expect(estaVigente(sinDesde, "2026-09-25")).toBe(false);  // 31 días del cambio
    expect(estaVigente(conDesde, "2026-09-25")).toBe(true);   // 16 días del aviso
    expect(estaVigente(conDesde, "2026-10-09")).toBe(true);   // 30 del aviso
    expect(estaVigente(conDesde, "2026-10-10")).toBe(false);  // 31 del aviso
  });

  it("un `desde` FUTURO no adelanta nada: todavía no se avisa", () => {
    expect(estaVigente(n("cxc-a", "cxc", "2026-08-25", "2026-09-10"), HOY)).toBe(false);
  });

  it("y un cambio que TODAVÍA NO SALIÓ no se avisa aunque el `desde` ya pasó", () => {
    // Avisar de algo que no está en pantalla es peor que no avisar.
    expect(estaVigente(n("cxc-a", "cxc", "2026-09-10", "2026-09-01"), HOY)).toBe(false);
  });

  it("🔴 ninguna novedad avisa ANTES de que el cambio saliera", () => {
    for (const nov of NOVEDADES) {
      if (!nov.desde) continue;
      expect(nov.desde >= nov.fecha, `«${nov.id}» avisa antes de existir`).toBe(true);
    }
  });

  it("el orden lo sigue mandando `fecha`, no `desde`", () => {
    // Todas empezaron a avisarse el mismo día; arriba va el cambio más nuevo.
    const r = novedadesParaMostrar(ctx({ novedades: [
      n("cxc-vieja", "cxc", "2026-08-25", "2026-09-09"),
      n("cxc-nueva", "cxc", "2026-09-08", "2026-09-09"),
    ] }));
    expect(r.map((x) => x.id)).toEqual(["cxc-nueva", "cxc-vieja"]);
  });

  it("🔴 TODAS las novedades escritas están vigentes hoy — ninguna nació muerta", () => {
    const muertas = NOVEDADES.filter((x) => !estaVigente(x, HOY)).map((x) => x.id);
    expect(muertas, "nadie las va a leer").toEqual([]);
  });
});

/* ═══ 7 · nunca una de otro módulo ════════════════════════════════════════ */

describe("🔴 7 · nunca sale una novedad de un módulo dentro de otro", () => {
  it("en Guías solo salen las de Guías", () => {
    const r = novedadesParaMostrar(ctx({
      novedades: [n("guias-a", "guias", "2026-09-08"), n("cxc-a", "cxc", "2026-09-08")],
      moduloKey: "guias",
    }));
    expect(r.map((x) => x.id)).toEqual(["guias-a"]);
  });

  it("fuera de todo módulo (el home, por ejemplo) no sale ninguna", () => {
    expect(novedadesParaMostrar(ctx({
      novedades: [n("cxc-a", "cxc", "2026-09-08")],
      moduloKey: null,
    }))).toEqual([]);
  });

  it("cada novedad apunta a un módulo QUE EXISTE, por su key", () => {
    for (const nov of NOVEDADES) {
      expect(ALL_MODULE_KEYS, `«${nov.id}» apunta a «${nov.modulo}», que no existe`)
        .toContain(nov.modulo);
    }
  });

  it("la dirección manda: gana el módulo de `href` más largo", () => {
    expect(moduloDeRuta("/cxc", ALL_MODULES)).toBe("cxc");
    expect(moduloDeRuta("/cxc/algo", ALL_MODULES)).toBe("cxc");
    expect(moduloDeRuta("/admin/usuarios", ALL_MODULES)).toBe("usuarios");
    expect(moduloDeRuta("/home", ALL_MODULES)).toBe(null);
    expect(moduloDeRuta("/g/operacion", ALL_MODULES)).toBe(null);
  });

  it("no calza un módulo por parecido de texto", () => {
    expect(moduloDeRuta("/cxcotra", ALL_MODULES)).toBe(null);
    expect(moduloDeRuta("/ventas-viejo", ALL_MODULES)).toBe(null);
  });

  it("la tira le pasa la KEY, no el rótulo que se lee", () => {
    const header = leer("src/components/AppHeader.tsx");
    expect(header).toContain("moduloDeRuta(pathname, ALL_MODULES)");
    // `module` es el texto del breadcrumb («Cuentas por Cobrar»): no es una key.
    expect(/moduloKey=\{module\}/.test(header)).toBe(false);
  });
});

/* ═══ las novedades son DATOS escritos a mano ═════════════════════════════ */

describe("🔴 las novedades se ESCRIBEN, no se generan del historial", () => {
  it("viven en UN solo archivo", () => {
    const lista = leer("src/lib/novedades/lista.ts");
    expect(lista).toContain("export const NOVEDADES");
    // Nada de leer git, commits ni el sistema de archivos.
    for (const prohibido of ["child_process", "git log", "readFileSync", "execSync"]) {
      expect(lista.includes(prohibido), `la lista se genera sola: ${prohibido}`).toBe(false);
    }
  });

  // ⚠️ CAMBIÓ DE DIRECCIÓN EL 9-sep-2026, NO SE BORRÓ. Hasta ese día los campos
  // permitidos eran cuatro (+ `desde`); Daniel pidió el cuadrito —*«hazlo con
  // una imagen cada punto de ser necesario para que el usuario lo vea»*— y
  // `dibujo` es el quinto. Lo que la regla cuida sigue siendo lo mismo: NADA
  // fuera de esa lista cerrada. El CONTROL de abajo lo comprueba al revés.
  it("cada una trae módulo, fecha y texto — y a lo sumo `desde` y `dibujo`, nada más", () => {
    const PERMITIDOS = ["desde", "dibujo", "fecha", "id", "modulo", "texto"];
    for (const nov of NOVEDADES) {
      const campos = Object.keys(nov).sort();
      const esperado = PERMITIDOS.filter((c) => campos.includes(c));
      expect(campos, `«${nov.id}» trae campos de más`).toEqual(esperado);
      for (const obligatorio of ["fecha", "id", "modulo", "texto"]) {
        expect(campos.includes(obligatorio), `«${nov.id}» sin ${obligatorio}`).toBe(true);
      }
      expect(/^\d{4}-\d{2}-\d{2}$/.test(nov.fecha), `«${nov.id}» sin fecha`).toBe(true);
      if (nov.desde) {
        expect(/^\d{4}-\d{2}-\d{2}$/.test(nov.desde), `«${nov.id}» con un «desde» raro`).toBe(true);
      }
    }
  });

  it("CONTROL · un campo inventado sigue cayendo — la lista es CERRADA", () => {
    const PERMITIDOS = ["desde", "dibujo", "fecha", "id", "modulo", "texto"];
    const inventada = { ...n("cxc-x", "cxc", "2026-09-09"), color: "rojo" } as Record<string, unknown>;
    const campos = Object.keys(inventada).sort();
    expect(campos).not.toEqual(PERMITIDOS.filter((c) => campos.includes(c)));
  });

  it("🔴 «salen todas»: los 21 módulos tienen la suya, medida contra el código", () => {
    // Daniel, 9-sep-2026: *«Salen todas — que se enteren de todo aunque sea
    // viejo»*. En las dos semanas del 25-ago al 9-sep cambió algo VISIBLE en
    // los 21; si mañana nace un módulo, este candado obliga a decidir si lleva
    // novedad o no lleva ninguna a propósito.
    const con = new Set(NOVEDADES.map((x) => x.modulo));
    const sin = ALL_MODULE_KEYS.filter((k) => !con.has(k));
    expect(sin, "un módulo sin novedad: decide si es a propósito").toEqual([]);
  });

  it("ningún módulo se lleva la mitad de la lista: tope de 6 por módulo", () => {
    // No es un límite del mecanismo (se ven de a 3 y las demás vuelven), es
    // higiene: pasado eso ya no es un aviso, es un manual.
    const porModulo = new Map<string, number>();
    for (const nov of NOVEDADES) porModulo.set(nov.modulo, (porModulo.get(nov.modulo) ?? 0) + 1);
    const pasados = [...porModulo].filter(([, c]) => c > 6).map(([k, c]) => `${k}=${c}`);
    expect(pasados).toEqual([]);
  });

  it("y lo que dicen es cierto: el módulo se llama «Plantilla Switch»", () => {
    expect(ALL_MODULES.find((m) => m.key === "cargar")?.label).toBe("Plantilla Switch");
  });

  it("«Descargar», no «Exportar» — el menú de la cartera lo dice", () => {
    expect(leer("src/app/cxc/components/MenuDescargar.tsx")).toContain("Descargar");
  });

  it("al saldo a favor no se le cobra — la regla existe", () => {
    expect(leer("src/lib/cxc/cobrable.ts")).toContain("export function seLeCobra");
  });
});

/* ═══ dónde se guarda lo leído ════════════════════════════════════════════ */

describe("🔴 lo leído se guarda POR PERSONA, no solo en un navegador", () => {
  it("hay tabla, y su llave es (persona, novedad)", () => {
    const mig = readdirSync(join(RAIZ, "supabase/migrations"))
      .find((f) => f.includes("novedades_vistas"));
    expect(mig, "falta la migración de `novedades_vistas`").toBeTruthy();
    const sql = leer(`supabase/migrations/${mig}`);
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS novedades_vistas");
    expect(sql).toContain("UNIQUE (usuario_id, novedad_id)");
    // Sin esto no se puede contestar «¿cuántas personas la vieron?».
    expect(sql).toContain("usuario_id");
  });

  it("la tabla está clasificada en el respaldo (si no, el build se pone rojo)", () => {
    expect(CLASIFICACION["novedades_vistas"]).toBe("bitacora");
  });

  it("el navegador es RESPALDO, no la fuente: se leen los dos y se unen", () => {
    const comp = leer("src/components/NovedadesAviso.tsx");
    expect(comp).toContain("localStorage");
    expect(comp).toContain("/api/novedades");
    // La × anota en los dos lados.
    expect(comp).toContain("anotarLocal");
    expect(/method:\s*"POST"/.test(comp)).toBe(true);
  });

  it("sin el cambio de base la pantalla NO se rompe: falla abierta", () => {
    const ruta = leer("src/app/api/novedades/route.ts");
    expect(ruta).toContain("faltaLaTabla");
    expect(ruta).toContain("42P01");
  });

  it("Daniel puede ver la lista y cuántos la leyeron, sin módulo nuevo", () => {
    const resumen = leer("src/app/api/novedades/resumen/route.ts");
    expect(resumen).toContain('requireRole(req, ["admin"])');
    expect(resumen).toContain("usuario_nombre");
    const page = leer("src/app/admin/usuarios/page.tsx");
    expect(page).toContain("NovedadesTab");
    expect(page).toContain('"novedades"');
  });

  it("la pestaña de Daniel es SOLO de admin", () => {
    const page = leer("src/app/admin/usuarios/page.tsx");
    expect(/SOLO_ADMIN[^\n]*"novedades"/.test(page)).toBe(true);
  });
});
