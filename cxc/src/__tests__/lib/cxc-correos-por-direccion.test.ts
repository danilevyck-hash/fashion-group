// ─────────────────────────────────────────────────────────────────────────────
// MANDAR A VARIOS — UN CORREO POR DIRECCIÓN, NO POR CLIENTE (5-sep-2026).
//
// 🔴 LA REGLA. Trece clientes distintos comparten `oficina@citymoda.store` y
// deben $402.376,67 entre todos; los dos City Mall comparten
// `contabilidad@citymall.com.pa` ($480.784,72). Mandar un correo por CLIENTE le
// pone trece mensajes en la bandeja a la misma persona el mismo minuto, cada
// uno con un pedazo del saldo y ninguno con la cuenta completa.
//
// MEDIDO CONTRA PRODUCCIÓN el 5-sep-2026 sobre los 100 clientes con saldo:
//   · 79 tienen correo · 21 NO lo tienen
//   · 31 de esos 79 comparten 9 direcciones → **57 correos, no 79**
//
// 🔴 LOS QUE NO TIENEN CORREO NO ABORTAN EL LOTE: se manda a los que se puede y
// se dicen POR NOMBRE los que quedaron fuera.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  agruparPorCorreo,
  normalizarCorreo,
  textoCorreosCompartidos,
  textoSinCorreo,
  textoSeleccion,
  type DestinoCliente,
} from "@/lib/cxc/correos-lote";

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

const cliente = (codigo: string, nombre: string, correo: string | null, total = 100): DestinoCliente =>
  ({ codigo, nombre, correo, total });

describe("🔴 un correo por DIRECCIÓN", () => {
  it("trece clientes con la misma dirección son UN solo envío", () => {
    const trece = Array.from({ length: 13 }, (_, i) =>
      cliente(`D-${i}`, `City Moda ${i}`, "oficina@citymoda.store", 30952.05));
    const lote = agruparPorCorreo(trece);
    expect(lote.envios.length).toBe(1);
    expect(lote.envios[0].clientes.length).toBe(13);
  });

  it("la cuenta medida: 79 con correo, 31 comparten 9 direcciones → 57 correos", () => {
    // 48 con dirección propia + 31 repartidos en 9 direcciones = 48 + 9 = 57.
    const propios = Array.from({ length: 48 }, (_, i) => cliente(`P-${i}`, `Propio ${i}`, `p${i}@x.com`));
    const repartos = [13, 3, 3, 2, 2, 2, 2, 2, 2];
    const compartidos = repartos.flatMap((n, g) =>
      Array.from({ length: n }, (_, i) => cliente(`C-${g}-${i}`, `Compartido ${g}-${i}`, `g${g}@x.com`)));
    expect(compartidos.length).toBe(31);
    const lote = agruparPorCorreo([...propios, ...compartidos]);
    expect(lote.envios.length).toBe(57);
    expect(lote.clientesQueComparten).toBe(31);
    expect(lote.correosCompartidos).toBe(9);
  });

  it("el total de un envío es la suma de SUS clientes", () => {
    const lote = agruparPorCorreo([
      cliente("D-25", "City Mall", "contabilidad@citymall.com.pa", 472675.56),
      cliente("D-26", "City Mall David", "contabilidad@citymall.com.pa", 8109.16),
    ]);
    expect(lote.envios[0].total).toBe(480784.72);
  });
});

describe("🔴 los que no tienen correo no abortan el lote", () => {
  it("salen aparte y NO cuentan como envío", () => {
    const lote = agruparPorCorreo([
      cliente("D-1", "Con correo", "a@x.com"),
      cliente("D-2", "Jocuran", null),
      cliente("D-3", "Larious", "   "),
    ]);
    expect(lote.envios.length).toBe(1);
    expect(lote.sinCorreo.map((c) => c.nombre)).toEqual(["Jocuran", "Larious"]);
  });

  it("se dicen POR NOMBRE, no como un número suelto", () => {
    const lote = agruparPorCorreo([cliente("D-2", "Jocuran", null), cliente("D-3", "Larious", null)]);
    const texto = textoSinCorreo(lote);
    expect(texto).toContain("Jocuran");
    expect(texto).toContain("Larious");
  });

  it("uno solo se dice en singular", () => {
    const lote = agruparPorCorreo([cliente("D-2", "Waco, S.A.", null)]);
    expect(textoSinCorreo(lote)).toBe("Este no tiene correo: Waco, S.A.");
  });

  it("sin ninguno, no se dice nada (no un «0 sin correo» pegado al número)", () => {
    expect(textoSinCorreo(agruparPorCorreo([cliente("D-1", "X", "a@x.com")]))).toBeNull();
  });
});

describe("lo que dice la barra", () => {
  it("«31 comparten correo → 57 correos»", () => {
    const propios = Array.from({ length: 48 }, (_, i) => cliente(`P-${i}`, `P${i}`, `p${i}@x.com`));
    const repartos = [13, 3, 3, 2, 2, 2, 2, 2, 2];
    const compartidos = repartos.flatMap((n, g) =>
      Array.from({ length: n }, (_, i) => cliente(`C-${g}-${i}`, `C${g}${i}`, `g${g}@x.com`)));
    expect(textoCorreosCompartidos(agruparPorCorreo([...propios, ...compartidos])))
      .toBe("31 comparten correo → 57 correos");
  });

  it("sin direcciones compartidas la línea no aparece", () => {
    const lote = agruparPorCorreo([cliente("D-1", "X", "a@x.com"), cliente("D-2", "Y", "b@x.com")]);
    expect(textoCorreosCompartidos(lote)).toBeNull();
  });

  it("«N clientes · $X» — la selección, sin adornos", () => {
    const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    expect(textoSeleccion([cliente("D-1", "X", "a@x.com", 1000), cliente("D-2", "Y", "b@x.com", 234.5)], fmt))
      .toBe("2 clientes · $1,234.50");
  });
});

describe("cómo se comparan dos direcciones", () => {
  it("mayúsculas y espacios de los bordes no hacen dos direcciones", () => {
    expect(normalizarCorreo("  Oficina@CityModa.Store ")).toBe("oficina@citymoda.store");
    const lote = agruparPorCorreo([
      cliente("D-1", "A", "Oficina@CityModa.Store"),
      cliente("D-2", "B", "oficina@citymoda.store "),
    ]);
    expect(lote.envios.length).toBe(1);
  });

  it("⚠️ NO se 'arregla' nada más: dos direcciones distintas son dos correos", () => {
    // Nada de quitar puntos ni de resolver alias con `+`: adivinar que dos
    // direcciones son la misma persona es la clase de pareo por parecido que
    // este sistema tiene prohibida.
    const lote = agruparPorCorreo([
      cliente("D-1", "A", "juan.perez@x.com"),
      cliente("D-2", "B", "juanperez@x.com"),
      cliente("D-3", "C", "juan+cobros@x.com"),
    ]);
    expect(lote.envios.length).toBe(3);
  });
});

describe("🔴 quien decide a quién se le escribe es el SERVIDOR", () => {
  it("la ruta del lote agrupa por dirección con el MISMO módulo puro", () => {
    const src = sinComentarios(leer("src/app/api/cxc/cobrar-lote/route.ts"));
    expect(src).toContain('from "@/lib/cxc/correos-lote"');
    // La LLAMADA, no solo el import: un `envios` armado a mano en la ruta se
    // separa del módulo puro y de su candado sin que nada avise.
    expect(src).toMatch(/const lote = agruparPorCorreo\(destinos\);/);
    expect(src).not.toMatch(/const lote = \{/);
  });

  it("🔴 el lote manda SIEMPRE las 6 del grupo — Boston no entra", () => {
    const src = sinComentarios(leer("src/app/api/cxc/cobrar-lote/route.ts"));
    // La ASIGNACIÓN, no solo el import.
    expect(src).toMatch(/const empresas = \[\.\.\.CXC_GRUPO_EMPRESA_KEYS\];/);
    expect(src).not.toContain("confecciones_boston");
    // Y ninguna empresa escrita a mano en la lista de lo que se manda.
    expect(src).not.toMatch(/const empresas = \[\s*"/);
  });

  it("el PDF del correo compartido trae una hoja por cliente y un total", () => {
    const src = sinComentarios(leer("src/lib/pdf-estado-cuenta.ts"));
    expect(src).toContain("buildEstadoCuentaLotePDF");
    // Una hoja por cliente: se agrega página entre uno y otro.
    expect(src).toMatch(/if \(i > 0\) doc\.addPage\(\)/);
  });

  it("la barra de la pantalla usa el mismo módulo, no su propia cuenta", () => {
    const src = sinComentarios(leer("src/app/cxc/components/BarraSeleccion.tsx"));
    expect(src).toContain("agruparPorCorreo");
    expect(src).toContain("textoCorreosCompartidos");
    expect(src).toContain("textoSinCorreo");
  });
});
