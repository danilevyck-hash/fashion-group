/* ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CANDADO — LA NAVEGACIÓN LLEVA A DONDE DICE (17-sep-2026)
 *
 * La auditoría de rutas del 6-sep-2026 (`docs/mapas/rutas.md`, 53 direcciones)
 * cerró con seis preguntas para Daniel y nadie la ejecutó. Él contestó
 * **«todas»**. Estas son las cuatro que se arreglaron, y ninguna mueve plata.
 *
 *   1a · **No existía UNA pantalla de 404.** Medido: cero `not-found.tsx` en
 *        todo `src/app`. Quien escribía mal una dirección —o recortaba una
 *        intermedia: `/catalogos`, `/catalogo`, `/productos`, `/g`— veía el 404
 *        de Next, **en inglés**, en una pantalla en blanco y sin salida.
 *
 *   1b · **El «atrás» no llevaba a ningún lado para TRES roles.** Bodega,
 *        Jennifer (`gerente_acs`) y David (`gerente_boston`) tienen un solo
 *        módulo: `/home` los empujaba a él con `push`, así que `/home` quedaba
 *        en el historial y Atrás los devolvía a una pantalla que los volvía a
 *        empujar. 108 sesiones en 30 días (77 + 26 + 5).
 *
 *   1c · **El breadcrumb de Usuarios mentía dos veces.** Decía «Sistema» —un
 *        grupo que dejó de existir con el rediseño del home— y el clic caía en
 *        `/admin`, que `next.config` redirige a **Cuentas por Cobrar**.
 *
 *   1d · **«Reclamos sin pagar» de Vista General no abría el reclamo.**
 *        Enlazaba a `/reclamos?id=X` y Reclamos solo abre el detalle con
 *        `view=detail`: caías en el selector de empresas, sin error.
 *
 * 🔑 EL PATRÓN ES EL DE `busqueda-global-destinos.test.ts` (11-sep-2026): un
 * enlace que no llega no da error, te deja en OTRA pantalla, que es peor —
 * parece que funcionó.
 *
 * 🔴 «IR AL INICIO» ES LA CASA DEL ROL, NO `/home` A SECAS. Es la regla más
 * fácil de romper de las cuatro: `/home` se ve correcto en el código y es
 * exactamente la pantalla que esos tres roles no pueden ver.
 * ────────────────────────────────────────────────────────────────────────── */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync, statSync } from "fs";
import path from "path";
import { casaDelRol, yaEstaEnSuCasa, INICIO } from "@/lib/navegacion/casa-del-rol";
import { MODULO_CASA_POR_ROL, getVisibleModules, grupoDeModulo, GROUPS } from "@/lib/modules";
import { enlaceDetalleReclamo } from "@/lib/reclamos/enlace";

const RAIZ = process.cwd();
const leer = (rel: string) => readFileSync(path.join(RAIZ, rel), "utf8");
/** El código sin comentarios: las historias nombran a propósito lo retirado. */
const plano = (rel: string) =>
  leer(rel).replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, " ");

// ─────────────────────────────────────────────────────────────────────────────
// 1a · La pantalla de 404 existe, está en español y tiene salida
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1a · el 404 propio", () => {
  it("existe `src/app/not-found.tsx`", () => {
    expect(existsSync(path.join(RAIZ, "src/app/not-found.tsx"))).toBe(true);
  });

  it("dice qué pasó, en español, y ofrece las DOS salidas", () => {
    const src = plano("src/app/not-found.tsx");
    expect(src).toContain("Esta pantalla no existe");
    expect(src).toContain("Ir al inicio");
    expect(src).toContain("Volver");
    // La explicación de una línea: dirección mal escrita o pantalla movida.
    expect(src).toMatch(/dirección esté mal escrita/);
  });

  it("🔴 «Ir al inicio» NO manda a `/home` a secas: pide la casa del rol", () => {
    const src = plano("src/app/not-found.tsx");
    expect(src).toContain("casaDelRol");
    expect(src, "volvió el `/home` escrito a mano").not.toContain('push("/home")');
    expect(src, "volvió el `/home` escrito a mano").not.toContain('href="/home"');
  });

  it("⚠️ «Volver» solo se dibuja si hay a dónde volver", () => {
    const src = plano("src/app/not-found.tsx");
    expect(src).toContain("window.history.length > 1");
    expect(src).toContain("router.back()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b · La casa del rol, y el Inicio que deja de rebotar
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1b · la casa del rol", () => {
  it("admin aterriza en el Inicio de verdad", () => {
    expect(casaDelRol("admin", null)).toBe(INICIO);
    expect(casaDelRol("admin", ["boston"])).toBe(INICIO);
  });

  // 🩸 MEDIDO HOY, 17-sep-2026, contra `getVisibleModules`: los roles de UN
  // SOLO módulo son **`gerente_acs`** (Jennifer → Multifashion) y
  // **`marcacion`**. ⚠️ **BODEGA YA NO ES UNO**: hoy tiene CUATRO
  // (referencia · catalogos · guias · asistencia), así que ve el Inicio como
  // cualquiera y su Atrás nunca estuvo muerto por esto. La auditoría del
  // 6-sep-2026 lo contaba entre los tres atrapados y esa línea ya era vieja
  // cuando se escribió — `CLAUDE.md` lo marca desde que le abrieron catálogos.
  it("un rol de UN SOLO módulo aterriza en ese módulo, no en `/home`", () => {
    const deUnSoloModulo = ["gerente_acs", "marcacion"];
    for (const rol of deUnSoloModulo) {
      const visibles = getVisibleModules(rol, null);
      expect(visibles.length, `${rol} dejó de tener un solo módulo`).toBe(1);
      expect(casaDelRol(rol, null)).toBe(visibles[0].href);
      expect(casaDelRol(rol, null), `${rol} cae en una pantalla que su rol rebota`).not.toBe(INICIO);
    }
    expect(casaDelRol("gerente_acs", null)).toBe("/multifashion");
  });

  it("⚠️ bodega tiene CUATRO módulos y sí ve el Inicio (medido el 17-sep-2026)", () => {
    expect(getVisibleModules("bodega", null).length).toBe(4);
    expect(casaDelRol("bodega", null)).toBe(INICIO);
  });

  it("🔴 el rol con CASA fijada aterriza en ella aunque tenga varios módulos", () => {
    for (const [rol, key] of Object.entries(MODULO_CASA_POR_ROL)) {
      const visibles = getVisibleModules(rol, null);
      const casa = visibles.find((m) => m.key === key);
      expect(casa, `${rol} ya no ve su casa (${key})`).toBeTruthy();
      expect(casaDelRol(rol, null)).toBe(casa!.href);
    }
    // David tiene DOS módulos (Boston + Catálogos) y su casa sigue siendo Boston.
    expect(getVisibleModules("gerente_boston", null).length).toBeGreaterThan(1);
    expect(casaDelRol("gerente_boston", null)).toBe("/boston");
  });

  it("los demás roles (y el desconocido) siguen yendo al Inicio", () => {
    expect(casaDelRol("secretaria", null)).toBe(INICIO);
    expect(casaDelRol("contabilidad", null)).toBe(INICIO);
    expect(casaDelRol("vendedor", null)).toBe(INICIO);
    expect(casaDelRol("", null)).toBe(INICIO);
    expect(casaDelRol(null)).toBe(INICIO);
    expect(casaDelRol("rol-que-no-existe", null)).toBe(INICIO);
  });

  it("⚠️ la casa se resuelve contra lo VISIBLE: sin el módulo, no se lo manda ahí", () => {
    // A David le quitan Boston a mano: se comporta como cualquier otro rol.
    expect(casaDelRol("gerente_boston", ["catalogos"])).not.toBe("/boston");
  });

  it("«ya está en su casa» reconoce la pantalla y lo que cuelga de ella", () => {
    expect(yaEstaEnSuCasa("/boston", "/boston")).toBe(true);
    expect(yaEstaEnSuCasa("/guias/123", "/guias")).toBe(true);
    expect(yaEstaEnSuCasa("/guias-viejo", "/guias")).toBe(false);
    expect(yaEstaEnSuCasa("/cxc", "/boston")).toBe(false);
    expect(yaEstaEnSuCasa("/home", INICIO)).toBe(true);
    expect(yaEstaEnSuCasa("/cxc", INICIO)).toBe(false);
  });

  it("🔴 `/home` empuja con `replace`, NUNCA con `push`", () => {
    const src = plano("src/app/home/page.tsx");
    expect(src).toContain("router.replace(casa)");
    expect(src, "volvió el push que dejaba `/home` en el historial").not.toMatch(
      /router\.push\((visible|casa)/,
    );
    // Y la regla no se volvió a escribir a mano acá.
    expect(src).toContain("casaDelRol");
  });

  it("🔴 el encabezado manda «Inicio» a la casa, y no lo dibuja si ya está ahí", () => {
    const src = plano("src/components/AppHeader.tsx");
    expect(src).toContain("casaDelRol");
    expect(src).toContain("yaEstaEnSuCasa");
    expect(src).toContain("router.push(casa)");
    expect(src, "volvió el `/home` escrito a mano en el encabezado").not.toContain('router.push("/home")');
    // Las dos puertas: el breadcrumb y el cajón del celular.
    expect(src).toContain("enSuCasa ? [] : [{ label: \"Inicio\"");
    expect(src).toContain("{!enSuCasa && (");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1c · El breadcrumb de Usuarios
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1c · Usuarios dice Administración y lleva a Administración", () => {
  it("el grupo sale de `grupoDeModulo`, no de un rótulo escrito a mano", () => {
    const grupo = grupoDeModulo("usuarios");
    expect(grupo?.label).toBe("Administración");
    expect(grupo?.href).toBe("/g/administracion");
    // Y el grupo existe de verdad en la lista de grupos.
    expect(GROUPS.map((g) => g.key)).toContain("administracion");
    expect(grupoDeModulo("modulo-inventado")).toBeNull();
  });

  it("🩸 «Sistema» se fue de la pantalla, y con él el clic a `/admin`", () => {
    const src = plano("src/app/admin/usuarios/page.tsx");
    expect(src, "volvió el grupo «Sistema», que ya no existe").not.toContain('module="Sistema"');
    expect(src).toContain('module="Usuarios"');
    expect(src).toContain('grupo={grupoDeModulo("usuarios")}');
  });

  it("el encabezado sabe dibujar el grupo, y sigue siendo OPCIONAL", () => {
    const src = plano("src/components/AppHeader.tsx");
    expect(src).toContain("grupo?: AppGroup | null");
    expect(src).toContain("grupo ? [{ label: grupo.label, onClick: () => router.push(grupo.href) }] : []");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1d · Vista General abre el reclamo que nombra
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1d · «Reclamos sin pagar» abre EL reclamo", () => {
  it("el enlace trae `view=detail` — sin él, Reclamos abre el selector", () => {
    const url = enlaceDetalleReclamo("abc-123", "Fashion Wear");
    expect(url.startsWith("/reclamos?")).toBe(true);
    expect(url).toContain("view=detail");
    expect(url).toContain("id=abc-123");
    expect(url).toContain("empresa=Fashion+Wear");
  });

  it("⚠️ sin empresa (o con el guion del dato que falta) no se inventa ninguna", () => {
    for (const vacia of [undefined, null, "", "   ", "—"]) {
      const url = enlaceDetalleReclamo("abc-123", vacia);
      expect(url, `«${vacia}» se coló como empresa`).not.toContain("empresa=");
      expect(url).toContain("view=detail");
    }
  });

  it("la tarjeta de Vista General usa el enlace y ya no arma la URL a mano", () => {
    const src = plano("src/app/vista-general/page.tsx");
    expect(src).toContain("enlaceDetalleReclamo(r.id, r.empresa)");
    expect(src, "volvió el `/reclamos?id=` que caía en el selector").not.toContain("/reclamos?id=");
  });

  it("y Reclamos sigue leyendo `view=detail` de la dirección", () => {
    const cliente = plano("src/app/reclamos/ReclamosClient.tsx");
    expect(cliente).toContain('searchParams.get("view")');
    const ssr = plano("src/app/reclamos/page.tsx");
    expect(ssr).toContain('params.view === "detail"');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CONTROL · lo que ya llegaba sigue llegando
// ─────────────────────────────────────────────────────────────────────────────

describe("CONTROL: los destinos que ya estaban bien no se tocaron", () => {
  it("la búsqueda global conserva sus cuatro destinos del 11-sep-2026", () => {
    const barra = plano("src/components/SearchBar.tsx");
    expect(barra).toContain("href: `/guias/${g.id}`");
    expect(barra).toContain("/ventas?tab=clientes&cliente=");
    expect(barra).toContain("/reclamos?view=detail&id=${rec.id}");
    expect(barra).toContain("/prestamos/${p.id}");
  });

  it("los redirects viejos siguen vivos: `/admin` y `/g/sistema`", () => {
    const cfg = leer("next.config.js");
    expect(cfg).toContain("/g/sistema");
    expect(cfg).toContain("/admin");
  });

  it("ninguna de las dos puertas del Inicio volvió a clavar `/home`", () => {
    // El barrido mira SOLO lo que DECIDE a dónde va «Inicio». El `|| "/home"`
    // de `moduleBaseHref` es otra cosa (el respaldo del nombre del módulo) y se
    // deja en paz a propósito.
    for (const rel of ["src/components/AppHeader.tsx", "src/app/not-found.tsx"]) {
      expect(plano(rel), `${rel} volvió a clavar /home`).not.toContain('push("/home")');
      expect(plano(rel), `${rel} volvió a clavar /home`).not.toContain('replace("/home")');
    }
  });

  it("CONTROL de que el barrido no mira carpetas vacías: los archivos existen", () => {
    for (const rel of [
      "src/lib/navegacion/casa-del-rol.ts",
      "src/lib/reclamos/enlace.ts",
      "src/app/not-found.tsx",
      "src/components/AppHeader.tsx",
      "src/app/admin/usuarios/page.tsx",
      "src/app/vista-general/page.tsx",
    ]) {
      expect(existsSync(path.join(RAIZ, rel)), rel).toBe(true);
      expect(leer(rel).length, rel).toBeGreaterThan(200);
    }
  });

  it("⚠️ el 404 es UNO SOLO: no nacieron `not-found.tsx` sueltos por módulo", () => {
    const encontrados: string[] = [];
    const caminar = (dir: string) => {
      for (const e of readdirSync(dir)) {
        if (e === "node_modules") continue;
        const full = path.join(dir, e);
        if (statSync(full).isDirectory()) caminar(full);
        else if (e === "not-found.tsx") encontrados.push(path.relative(RAIZ, full));
      }
    };
    caminar(path.join(RAIZ, "src/app"));
    expect(encontrados).toEqual(["src/app/not-found.tsx"]);
  });
});
