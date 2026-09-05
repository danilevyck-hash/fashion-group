// ─────────────────────────────────────────────────────────────────────────────
// 🔴 LA DIRECCIÓN DE SWITCH SE MUESTRA EN LA FICHA Y **NO ALIMENTA GUÍAS**.
//
// Switch manda una dirección por cliente (`raw_data->>'direccion'`) para **702
// de los 847** clientes del grupo, y hasta el 5-sep-2026 no se guardaba en
// ningún lado. Se guarda y se muestra. Lo que NO se hace es dejarla entrar al
// módulo de Guías, y la razón está MEDIDA contra los destinos que Daniel definió
// a mano, que se contradicen con Switch:
//
//   · **City Moda Chorrera (D-26)** — Switch dice «Chorrera». Daniel marcó como
//     «el de siempre» **Sport Corner Calidonia**, que es a donde de verdad va la
//     mercancía; «Chorrera» quedó de botón, no de autollenado. Si la dirección
//     de Switch autollenara, TODAS las guías de ese cliente saldrían con el
//     destino equivocado.
//   · **Sporting Shoes (D-142)** — Switch dice «Los Andes, Panama», UNA línea.
//     Daniel le tiene **8 destinos definidos**, con tienda opcional.
//
// Es el invariante de Guías dicho de otra forma: *«La dirección de un renglón es
// el DESTINO del envío, no la dirección del cliente»*. La precedencia de los
// destinos vive en UNA función (`destinosDefinidosPara`) y es **tabla →
// constante → histórico agrupado**; esta columna no es ninguna de las tres y no
// puede colarse como cuarta.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  COLUMNA_DIRECCION_SWITCH,
  GUIAS_NO_LA_TOCAN,
  ROTULO_DIRECCION_SWITCH,
  limpiarDireccionSwitch,
  lineaFiscal,
} from "@/lib/clientes/direccion-switch";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

/** Todos los archivos de código bajo una carpeta. */
function archivosDe(rel: string): string[] {
  const raiz = path.join(RAIZ, rel);
  if (!fs.existsSync(raiz)) return [];
  const salida: string[] = [];
  const recorrer = (dir: string) => {
    for (const entrada of fs.readdirSync(dir, { withFileTypes: true })) {
      const completo = path.join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(completo);
      else if (/\.(ts|tsx)$/.test(entrada.name)) salida.push(completo);
    }
  };
  recorrer(raiz);
  return salida;
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL BARRIDO: Guías no toca esta columna", () => {
  it("las tres carpetas de Guías existen (si no, el barrido no barre nada)", () => {
    // 🩸 Un barrido sobre una carpeta que no existe pasa en VERDE sin mirar un
    // solo archivo. Es la trampa clásica de este tipo de candado.
    for (const carpeta of GUIAS_NO_LA_TOCAN) {
      expect(archivosDe(carpeta).length, carpeta).toBeGreaterThan(0);
    }
  });

  it("ningún archivo de Guías nombra `direccion_switch`", () => {
    const culpables: string[] = [];
    for (const carpeta of GUIAS_NO_LA_TOCAN) {
      for (const archivo of archivosDe(carpeta)) {
        if (fs.readFileSync(archivo, "utf8").includes(COLUMNA_DIRECCION_SWITCH)) {
          culpables.push(path.relative(RAIZ, archivo));
        }
      }
    }
    expect(
      culpables,
      "la dirección de Switch entró a Guías: el destino de una guía es a dónde va ESE envío, " +
        "no la dirección del cliente (D-26 va a Sport Corner Calidonia, no a «Chorrera»).",
    ).toEqual([]);
  });

  it("tampoco lee `raw_data->>'direccion'` por su cuenta", () => {
    const culpables: string[] = [];
    for (const carpeta of GUIAS_NO_LA_TOCAN) {
      for (const archivo of archivosDe(carpeta)) {
        const src = fs.readFileSync(archivo, "utf8");
        if (/raw_data[^\n]{0,40}direccion/.test(src)) culpables.push(path.relative(RAIZ, archivo));
      }
    }
    expect(culpables).toEqual([]);
  });

  it("⚠️ y la precedencia de los destinos sigue siendo tabla → constante → histórico", () => {
    const src = leer("src/lib/guias/destinos-clientes.ts");
    expect(src).toContain("export function destinosDefinidosPara");
    expect(src).toContain("DESTINOS_DEFINIDOS");
    expect(src).not.toContain(COLUMNA_DIRECCION_SWITCH);
  });

  it("⚠️ CONTROL — el barrido SÍ mira los archivos de verdad", () => {
    // Si este control fallara, el barrido de arriba estaría pasando por vacío.
    const todos = GUIAS_NO_LA_TOCAN.flatMap(archivosDe);
    expect(todos.some((a) => a.endsWith("destinos-clientes.ts"))).toBe(true);
    expect(todos.some((a) => a.includes(path.join("app", "guias")))).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("dónde SÍ vive", () => {
  it("la ficha del cliente la muestra, rotulada como dato de Switch", () => {
    const src = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    expect(src).toContain("ROTULO_DIRECCION_SWITCH");
    expect(src).toContain("cliente.direccion_switch");
    expect(ROTULO_DIRECCION_SWITCH).toBe("Dirección en Switch");
  });

  it("🔴 la escribe SOLO el sync de `clientes_master`", () => {
    const src = leer("src/lib/switch-api/sync-clientes-master.ts");
    expect(src).toContain("direccion_switch: direccionDeLasFilas(filas)");
    // El desempate es determinista (alfabético), el MISMO del backfill de la
    // migración: la primera corrida después de aplicarla no reescribe nada.
    expect(src).toContain("function direccionDeLasFilas");
    expect(src).toContain(".sort(");
  });

  it("⚠️ y el sync NO se cae si la columna todavía no existe", () => {
    // La migración la corre Daniel. Sin este reintento, el refresco fiscal de
    // los 150 clientes se caería entero por una columna nueva.
    const src = leer("src/lib/switch-api/sync-clientes-master.ts");
    expect(src).toContain("sinColumnaDireccion");
    expect(src).toContain("function sinDireccion");
    // Se QUITA la columna, no se manda `null`: un null la borraría de todos si
    // la columna sí existiera.
    expect(src).toContain("delete copia.direccion_switch");
  });

  it("la ficha tolera que la columna no exista todavía", () => {
    const src = leer("src/app/clientes/[codigo]/page.tsx");
    expect(src).toContain("conDireccion");
    expect(src).toContain("direccion_switch");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la migración", () => {
  const MIGRACION = "supabase/migrations/20260930120000_clientes_master_direccion_switch.sql";
  const sql = leer(MIGRACION);
  /** El SQL sin sus comentarios: lo que corre, no lo que explica. */
  const corre = sql.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");

  it("agrega la columna sin romper si ya existiera", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS direccion_switch text/i);
  });

  it("🔴 el backfill pide las 6 del grupo por INCLUSIÓN, nunca excluyendo", () => {
    for (const e of ["vistana", "fashion_wear", "fashion_shoes", "active_wear", "active_shoes", "joystep"]) {
      expect(corre, `falta ${e}`).toContain(`'${e}'`);
    }
    expect(corre).not.toContain("confecciones_boston");
    expect(corre).not.toContain("american_classic");
    expect(corre).not.toMatch(/NOT IN \(/i);
  });

  it("el cruce va por CÓDIGO, nunca por nombre", () => {
    expect(corre).toMatch(/cm\.codigo = sc\.codigo/);
    expect(corre).not.toMatch(/cm\.nombre\w* = sc\.nombre/);
  });

  it("el COMMENT deja escrito que no alimenta Guías", () => {
    expect(sql).toMatch(/COMMENT ON COLUMN clientes_master\.direccion_switch/i);
    expect(sql).toContain("NO alimenta los destinos de Guías");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la línea fiscal del encabezado", () => {
  it("arma la línea completa de D-25", () => {
    expect(
      lineaFiscal({
        codigo: "D-25",
        razonSocial: "City Mall S A",
        ruc: "1513069-1-650069",
        direccionSwitch: "Paso Canoas",
        provincia: "Chiriquí",
      }),
    ).toBe("D-25 · City Mall S A · RUC 1513069-1-650069 · Paso Canoas, Chiriquí");
  });

  it("lo que falta no deja un « · » colgando ni un «—»", () => {
    // D-119 no tiene provincia (99 de los 150 no la tienen).
    expect(lineaFiscal({ codigo: "D-119", razonSocial: "Outlet Duty Free S.A." }))
      .toBe("D-119 · Outlet Duty Free S.A.");
    expect(lineaFiscal({ codigo: "D-9" })).toBe("D-9");
    expect(lineaFiscal({ codigo: "D-9", provincia: "Chiriquí" })).toBe("D-9 · Chiriquí");
  });
});

describe("limpiar lo que manda Switch", () => {
  it("colapsa espacios y deja `null` lo vacío", () => {
    expect(limpiarDireccionSwitch("  Paso   Canoas \n")).toBe("Paso Canoas");
    expect(limpiarDireccionSwitch("   ")).toBeNull();
    expect(limpiarDireccionSwitch(null)).toBeNull();
    expect(limpiarDireccionSwitch(42)).toBeNull();
  });
});
