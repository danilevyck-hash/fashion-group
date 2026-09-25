// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — «CLIENTES QUE NO COMISIONAN», EN PALABRAS Y SIN CASILLAS
// (25-sep-2026, la «5t/5u»).
//
// 🩸 LA PREGUNTA DE DANIEL, textual: *«¿la casilla llena significa que comisiona
// o no?»*. La casilla **marcada** quería decir **excluido** —o sea que NO
// comisiona— bajo una columna que se llamaba «VENTA»: se leía al revés.
//
// 🩸 Y EL CONTEO, medido el 25-sep-2026 en `comision_exclusion`: **18 filas
// activas que son 12 reglas**, porque «Multi Fashion Holding D-108 · Todos los
// vendedores» ocupa **SEIS** —una por empresa, el 33 % de las filas para una
// sola regla— y «Millenium Sports D-104» dos. **D-81 «Jerusalem Duty Free» ·
// Edwin · Vistana es la ÚNICA regla de «solo el cobro»** de las doce.
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. Las 18 filas se juntan en 12 reglas, y D-108 se dice UNA vez.
//   2. Cada regla lo dice en PALABRAS, y la única de «solo el cobro» se
//      distingue sin descifrar dos casillas.
//   3. La regla de la base NO cambia: `excluye_venta` / `excluye_cobro`, el
//      CHECK de «al menos una», el soft delete y las mismas rutas.
//   4. En la pantalla no queda una sola casilla, y la pregunta del alta va al
//      derecho: «¿Qué no comisiona?».
//   5. El comodín «todos los vendedores» NUNCA se esconde al filtrar por una
//      persona: esconderlo diría que ese cliente sí le comisiona.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  PREGUNTA_DEL_ALTA,
  ROTULO_EL_COBRO,
  ROTULO_LA_VENTA,
  TODAS,
  TODOS,
  filtrarReglas,
  fraseDeLaRegla,
  loQueNoComisiona,
  queNoComisiona,
  reglasEnPalabras,
  rotuloTodasLasEmpresas,
} from "@/lib/comisiones/exclusiones-en-palabras";
import type { ExclusionActiva } from "@/lib/comisiones/exclusiones";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// El fixture: las 18 filas REALES del 25-sep-2026
// ─────────────────────────────────────────────────────────────────────────────

let siguienteId = 1;
function fila(
  empresa: string,
  codigo: string,
  nombre: string,
  vendedor: string,
  venta = true,
  cobro = true,
): ExclusionActiva {
  return {
    id: siguienteId++,
    empresa_key: empresa,
    cliente_codigo: codigo,
    cliente_nombre: nombre,
    vendedor,
    excluye_venta: venta,
    excluye_cobro: cobro,
    creado_por: "daniel",
    creado_en: "2026-09-03T17:00:00Z",
  };
}

const REY = "REYNALDO ESPINOSA";
const SEIS = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

const LAS_18: ExclusionActiva[] = [
  // D-108 · todos los vendedores · las 6 empresas → SEIS filas, UNA regla.
  ...SEIS.map((e) => fila(e, "D-108", "Multi Fashion Holding", "*")),
  // D-104 · Reynaldo · dos empresas → DOS filas, UNA regla.
  fila("active_shoes", "D-104", "Millenium Sports", REY),
  fila("active_wear", "D-104", "Millenium Sports", REY),
  // Nueve reglas de una fila cada una.
  fila("active_shoes", "D-103", "Metro Shoes Panama S.A.", REY),
  fila("active_shoes", "D-115", "Novedades El Dollar", REY),
  fila("active_shoes", "D-145", "Super Centro La Competencia S.A.", REY),
  fila("active_shoes", "D-84", "Kheriddine", REY),
  fila("active_wear", "D-156", "Wolf Mall Center Int", REY),
  fila("active_wear", "D-42", "De City Moda Del Norte, S.A.", REY),
  fila("active_wear", "D-49", "El Punto Poderoso", REY),
  fila("active_wear", "D-50", "El Remate", REY),
  fila("active_wear", "D-98", "Lutylui", REY),
  // 🔴 La ÚNICA de «solo el cobro».
  fila("vistana", "D-81", "Jerusalem Duty Free", "EDWIN", false, true),
];

// ─────────────────────────────────────────────────────────────────────────────
// 1 · 18 filas, 12 reglas
// ─────────────────────────────────────────────────────────────────────────────

describe("las 18 filas son 12 reglas", () => {
  const reglas = reglasEnPalabras(LAS_18);

  it("🔴 son DOCE renglones, no dieciocho", () => {
    expect(LAS_18).toHaveLength(18);
    expect(reglas).toHaveLength(12);
  });

  it("🔴 D-108 se dice UNA vez, con «Las 6 empresas»", () => {
    const d108 = reglas.filter((r) => r.clienteCodigo === "D-108");
    expect(d108).toHaveLength(1);
    expect(d108[0].chipsEmpresas).toEqual([rotuloTodasLasEmpresas(6)]);
    expect(d108[0].vendedor).toBe("Todos los vendedores");
    expect(d108[0].vendedorEsTodos).toBe(true);
    // Y quitar la regla quita sus SEIS filas: los ids viajan todos.
    expect(d108[0].ids).toHaveLength(6);
  });

  it("D-104 junta sus dos empresas en un renglón, con sus dos pastillas", () => {
    const d104 = reglas.find((r) => r.clienteCodigo === "D-104")!;
    expect(d104.chipsEmpresas).toEqual(["Active Shoes", "Active Wear"]);
    expect(d104.ids).toHaveLength(2);
  });

  it("la que cubre más empresas encabeza, y el resto va alfabético", () => {
    expect(reglas[0].clienteCodigo).toBe("D-108");
    expect(reglas[1].clienteCodigo).toBe("D-104");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · En palabras
// ─────────────────────────────────────────────────────────────────────────────

describe("cada regla dice lo que hace, en palabras", () => {
  it("🔴 D-81 · Edwin es la ÚNICA de «solo el cobro»", () => {
    const reglas = reglasEnPalabras(LAS_18);
    const soloCobro = reglas.filter((r) => r.que === "solo-el-cobro");
    expect(soloCobro).toHaveLength(1);
    expect(soloCobro[0].clienteCodigo).toBe("D-81");
    expect(soloCobro[0].vendedor).toBe("Edwin");
    expect(fraseDeLaRegla(soloCobro[0].que)).toBe("No comisiona solo el cobro");
    // Las otras once son «venta ni cobro».
    expect(reglas.filter((r) => r.que === "venta-ni-cobro")).toHaveLength(11);
  });

  it("las tres frases, y la parte que va en negrita", () => {
    expect(queNoComisiona({ excluye_venta: true, excluye_cobro: true })).toBe("venta-ni-cobro");
    expect(queNoComisiona({ excluye_venta: true, excluye_cobro: false })).toBe("solo-la-venta");
    expect(queNoComisiona({ excluye_venta: false, excluye_cobro: true })).toBe("solo-el-cobro");
    expect(fraseDeLaRegla("venta-ni-cobro")).toBe("No comisiona venta ni cobro");
    expect(loQueNoComisiona("venta-ni-cobro")).toBe("venta ni cobro");
    expect(loQueNoComisiona("solo-la-venta")).toBe("solo la venta");
    expect(loQueNoComisiona("solo el cobro" as never)).toBe("solo el cobro");
  });

  it("🔴 dos filas del mismo cliente que excluyen COSAS DISTINTAS son dos reglas", () => {
    // Juntarlas escondería que en una empresa no comisiona nada y en otra solo
    // el cobro.
    const mezcla = [
      fila("vistana", "D-9", "Cliente", REY, true, true),
      fila("fashion_wear", "D-9", "Cliente", REY, false, true),
    ];
    const reglas = reglasEnPalabras(mezcla);
    expect(reglas).toHaveLength(2);
    expect(new Set(reglas.map((r) => r.que))).toEqual(new Set(["venta-ni-cobro", "solo-el-cobro"]));
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · Los dos filtros
// ─────────────────────────────────────────────────────────────────────────────

describe("los dos desplegables", () => {
  const reglas = reglasEnPalabras(LAS_18);

  it("con «todas» y «todos» puestos no se filtra nada", () => {
    expect(filtrarReglas(reglas, { empresa: TODAS, vendedor: TODOS })).toHaveLength(12);
  });

  it("por empresa deja solo las que la tocan", () => {
    const enVistana = filtrarReglas(reglas, { empresa: "vistana", vendedor: TODOS });
    expect(enVistana.map((r) => r.clienteCodigo).sort()).toEqual(["D-108", "D-81"]);
  });

  it("🔴 el comodín «todos los vendedores» NUNCA se esconde al filtrar por una persona", () => {
    const deEdwin = filtrarReglas(reglas, { empresa: TODAS, vendedor: "Edwin" });
    // D-81 es suya, y D-108 vale para todos: esconderla diría que sí comisiona.
    expect(deEdwin.map((r) => r.clienteCodigo).sort()).toEqual(["D-108", "D-81"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · Lo que NO cambia, y lo que sí
// ─────────────────────────────────────────────────────────────────────────────

describe("la base no cambia; la pantalla sí", () => {
  const pantalla = leer("src/components/comisiones/comisiones-config/ClientesQueNoComisionan.tsx");

  it("🔴 CERO casillas en la lista, y la pregunta del alta va al derecho", () => {
    expect(pantalla).not.toContain('type="checkbox"');
    expect(PREGUNTA_DEL_ALTA).toBe("¿Qué no comisiona?");
    expect(ROTULO_LA_VENTA).toBe("La venta");
    expect(ROTULO_EL_COBRO).toBe("El cobro");
    expect(pantalla).toContain('role="switch"');
  });

  it("🔴 las MISMAS rutas y el MISMO payload de siempre", () => {
    expect(pantalla).toContain('fetch("/api/ventas/comisiones/exclusiones"');
    expect(pantalla).toContain("excluye_venta: excluyeVenta");
    expect(pantalla).toContain("excluye_cobro: excluyeCobro");
    expect(pantalla).toContain('method: "PATCH"');
    expect(pantalla).toContain('method: "DELETE"');
    // Y el alta sigue escribiendo UNA FILA POR EMPRESA.
    expect(pantalla).toContain("empresa_keys: EMPRESAS_COMISIONAN.filter");
  });

  it("y el módulo puro no escribe en ninguna parte", () => {
    const fuente = leer("src/lib/comisiones/exclusiones-en-palabras.ts");
    expect(fuente).not.toMatch(/\bfetch\(/);
    expect(fuente).not.toContain("supabase");
  });

  it("en pantalla no se dice «exclusión» por ningún lado", () => {
    // El texto que ve la gente: los literales y el JSX, sin los comentarios.
    const sinComentarios = pantalla
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .split("\n")
      .filter((l) => !l.trim().startsWith("//"))
      .join("\n")
      // Los nombres de ruta, de tipo y de variable no son texto de pantalla.
      .replace(/exclusiones|ExclusionActiva|excluye_venta|excluye_cobro|Exclusiones/g, "");
    expect(sinComentarios).not.toMatch(/exclusi[oó]n/i);
  });
});
