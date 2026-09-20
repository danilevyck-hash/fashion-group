/**
 * QUIEN NO TIENE INICIO NO LO VE NI UN INSTANTE (19-sep-2026)
 *
 * 🩸 Daniel: *«la persona entra y se ve el home y de una marcaciones, se siente
 * bug»*. El rebote a «la casa del rol» vivía SOLO en un efecto del navegador:
 * el servidor mandaba el Inicio entero, el navegador lo pintaba y recién
 * después —con el JavaScript abajo y `sessionStorage` leído— navegaba. Ana,
 * Cindy y Yeisibeth (`marcacion`), Jennifer (`gerente_acs`) y David
 * (`gerente_boston`) veían dibujarse una pantalla que no es suya.
 *
 * Lo que este candado exige:
 *
 *  A. LA DECIDE EL SERVIDOR. El layout de `/home` es un componente de
 *     servidor —nunca `"use client"`— que corre antes que `page.tsx`, lee la
 *     cookie FIRMADA y redirige. No pinta nada.
 *  B. UN MÓDULO → REDIRIGE. Con la casa del rol distinta del Inicio, sale un
 *     `redirect()` y el Inicio no se llega a renderizar.
 *  C. VARIOS MÓDULOS → VE EL INICIO, IGUAL QUE HOY. Bodega (4 módulos),
 *     secretaria, vendedor, contabilidad y admin pasan derecho.
 *  D. SIN SESIÓN, TODO COMO HOY: falla ABIERTA. Sin cookie, con cookie
 *     forjada, sin secreto o con `cookies()` reventando, no redirige nadie.
 *  E. LA REGLA ES LA DE SIEMPRE, NO UNA COPIA: `casaDelRol`, el mismo módulo
 *     que usan el 404, el encabezado y el efecto del navegador. Y NUNCA se
 *     mira el token de sesión.
 *  F. EL EFECTO DEL NAVEGADOR SIGUE AHÍ: es la red para la sesión sin semilla.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { renderToString } from "react-dom/server";

// `next/headers` solo existe adentro de Next: aquí se simula la cookie que trae
// la petición, y un modo en que `cookies()` revienta.
let COOKIE_DE_LA_PETICION: string | undefined;
let COOKIES_REVIENTA = false;
vi.mock("next/headers", () => ({
  cookies: () => {
    if (COOKIES_REVIENTA) throw new Error("cookies() fuera de una petición");
    return { get: (n: string) => (n === "cxc_session" && COOKIE_DE_LA_PETICION ? { value: COOKIE_DE_LA_PETICION } : undefined) };
  },
}));

// `redirect()` de Next LANZA para cortar el render. Se simula igual, para poder
// comprobar que el Inicio no se alcanza a dibujar.
const A_DONDE: string[] = [];
class SalidaPorRedirect extends Error {}
vi.mock("next/navigation", () => ({
  redirect: (destino: string) => { A_DONDE.push(destino); throw new SalidaPorRedirect(destino); },
}));

process.env.SESSION_SECRET = "secreto-de-prueba-19-sep-2026";

import { signSession } from "@/lib/session-cookie";
import { casaDelRol, INICIO } from "@/lib/navegacion/casa-del-rol";
import { SYSTEM_ROLES } from "@/lib/modules";
import HomeLayout from "@/app/home/layout";

const RAIZ = path.resolve(__dirname, "../../..");
const leer = (p: string) => readFileSync(path.join(RAIZ, p), "utf8");
const sinComentarios = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const LAYOUT = "src/app/home/layout.tsx";
const ELINICIO = <div data-inicio="si">El Inicio</div>;

/** Firma una cookie como la del login. El `sessionToken` es obligatorio para
 *  que `verifySession` la acepte — y el candado E exige que no se lea. */
function cookieDe(role: string, modules?: string[]): string {
  return signSession({ role, userId: "u-1", userName: "prueba", modules, isOwner: false, sessionToken: "tok-1" });
}

/** Corre el layout como lo corre Next: del lado del SERVIDOR. Devuelve el HTML
 *  que saldría, o el destino del redirect. */
function correrElLayout(): { html: string } | { redirigeA: string } {
  try {
    return { html: renderToString(<HomeLayout>{ELINICIO}</HomeLayout>) };
  } catch (e) {
    if (e instanceof SalidaPorRedirect) return { redirigeA: e.message };
    throw e;
  }
}

beforeEach(() => {
  COOKIE_DE_LA_PETICION = undefined;
  COOKIES_REVIENTA = false;
  A_DONDE.length = 0;
});

// ─────────────────────────────────────────────────────────────────────────────
describe("A · la decisión es del SERVIDOR, antes de mandar una línea de HTML", () => {
  it("el layout de /home NO es un componente de navegador", () => {
    expect(leer(LAYOUT)).not.toMatch(/^\s*["']use client["']/m);
  });

  it("lee la cookie FIRMADA por la puerta de siempre y redirige con Next", () => {
    const src = sinComentarios(leer(LAYOUT));
    expect(src).toContain("leerSemillaDeSesion");
    expect(src).toMatch(/import \{ redirect \} from "next\/navigation"/);
    expect(src).toContain("redirect(casa)");
  });

  it("no decodifica la cookie por su cuenta ni mira el token", () => {
    const src = leer(LAYOUT);
    expect(src).not.toContain("sessionToken");
    expect(src).not.toContain("base64");
    expect(src).not.toContain('cookies()');
  });

  it("el layout no pinta nada suyo: solo deja pasar a la página", () => {
    COOKIE_DE_LA_PETICION = cookieDe("admin");
    const r = correrElLayout();
    expect(r).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("B · un solo módulo → cae directo en su módulo, sin ver el Inicio", () => {
  const UN_SOLO_MODULO: Array<[string, string]> = [
    // Ana, Cindy y Yeisibeth: su único módulo es Marcación.
    ["marcacion", "/marcacion"],
    // Jennifer: Multifashion es su único módulo.
    ["gerente_acs", "/multifashion"],
    // David tiene tres módulos, pero su CASA está fijada en Boston.
    ["gerente_boston", "/boston"],
  ];

  it.each(UN_SOLO_MODULO)("%s entra a /home y sale a %s", (rol, destino) => {
    COOKIE_DE_LA_PETICION = cookieDe(rol);
    expect(correrElLayout()).toEqual({ redirigeA: destino });
    expect(A_DONDE).toEqual([destino]);
  });

  it("el Inicio NO se alcanza a renderizar: el redirect corta antes", () => {
    COOKIE_DE_LA_PETICION = cookieDe("marcacion");
    const r = correrElLayout();
    expect("html" in r).toBe(false);
  });

  it("manda a donde dicen sus MÓDULOS, no su rol: sin su módulo no se le inventa casa", () => {
    // A un `marcacion` al que le cambiaron los módulos a mano no se lo manda a
    // una pantalla que su propio guard le rebota. Con UN módulo ajeno, va a
    // ESE; con dos, al Inicio — nunca a `/marcacion`.
    COOKIE_DE_LA_PETICION = cookieDe("marcacion", ["cheques"]);
    expect(correrElLayout()).toEqual({ redirigeA: "/recordatorios" });

    A_DONDE.length = 0;
    COOKIE_DE_LA_PETICION = cookieDe("marcacion", ["cheques", "guias"]);
    expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
    expect(A_DONDE).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("C · varios módulos → el Inicio, exactamente igual que hoy", () => {
  // Angel y Rodrigo son `bodega`: cuatro módulos, y el Inicio es su pantalla.
  const CON_INICIO = ["admin", "secretaria", "bodega", "vendedor", "contabilidad"];

  it.each(CON_INICIO)("%s ve el Inicio", (rol) => {
    COOKIE_DE_LA_PETICION = cookieDe(rol);
    expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
    expect(A_DONDE).toEqual([]);
  });

  it("bodega tiene CUATRO módulos, no uno: por eso se queda", () => {
    expect(casaDelRol("bodega", null)).toBe(INICIO);
  });

  it("cada rol del sistema se comporta como dice `casaDelRol`, sin excepciones escritas a mano", () => {
    for (const { key } of SYSTEM_ROLES) {
      COOKIE_DE_LA_PETICION = cookieDe(key);
      A_DONDE.length = 0;
      const casa = casaDelRol(key, []);
      const r = correrElLayout();
      if (casa === INICIO) expect(r, key).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
      else expect(r, key).toEqual({ redirigeA: casa });
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("D · sin sesión, todo como hoy: falla ABIERTA", () => {
  it("sin cookie no redirige a nadie", () => {
    COOKIE_DE_LA_PETICION = undefined;
    expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
    expect(A_DONDE).toEqual([]);
  });

  it("una cookie FORJADA (sin firma buena) no mueve a nadie", () => {
    const cuerpo = Buffer.from(JSON.stringify({ role: "marcacion", sessionToken: "x" })).toString("base64url");
    COOKIE_DE_LA_PETICION = `${cuerpo}.firmaInventada`;
    expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
  });

  it("una cookie sin firma tampoco", () => {
    COOKIE_DE_LA_PETICION = Buffer.from(JSON.stringify({ role: "marcacion" })).toString("base64url");
    expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
  });

  it("si `cookies()` revienta, se sirve el Inicio como siempre", () => {
    COOKIE_DE_LA_PETICION = cookieDe("marcacion");
    COOKIES_REVIENTA = true;
    expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
  });

  it("un rol desconocido no se rebota a ninguna parte", () => {
    COOKIE_DE_LA_PETICION = cookieDe("rol_que_no_existe");
    expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
  });

  it("sin SESSION_SECRET no hay semilla, y no hay rebote", () => {
    COOKIE_DE_LA_PETICION = cookieDe("marcacion");
    const antes = process.env.SESSION_SECRET;
    delete process.env.SESSION_SECRET;
    try {
      expect(correrElLayout()).toEqual({ html: '<div data-inicio="si">El Inicio</div>' });
    } finally {
      process.env.SESSION_SECRET = antes;
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("E · la regla es la de siempre, dicha en UN solo lugar", () => {
  it("el layout usa `casaDelRol`, no una lista de roles propia", () => {
    const src = sinComentarios(leer(LAYOUT));
    expect(src).toContain("casaDelRol");
    expect(src).not.toMatch(/role === ["']/);
    expect(src).not.toContain("marcacion");
    expect(src).not.toContain("gerente_");
  });

  it("los cuatro lugares que deciden «tu casa» leen el MISMO módulo", () => {
    for (const p of [LAYOUT, "src/app/home/page.tsx", "src/app/not-found.tsx", "src/components/AppHeader.tsx"]) {
      expect(leer(p), p).toContain('from "@/lib/navegacion/casa-del-rol"');
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("F · el efecto del navegador sigue ahí — es la red del que no trae semilla", () => {
  it("`/home` conserva su rebote con `replace`, no con `push`", () => {
    const src = sinComentarios(leer("src/app/home/page.tsx"));
    expect(src).toMatch(/casaDelRol\(role, fgModules\)/);
    expect(src).toContain("router.replace(casa)");
  });
});
