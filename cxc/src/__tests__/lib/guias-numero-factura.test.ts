// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL NÚMERO DE FACTURA: SE GUARDA COMPLETO, SE MUESTRA CORTO.
//
// Daniel, 5-sep-2026: *«¿Sugieres agregar la factura completa pero que solo se
// refleje los últimos 4 dígitos?»* → sí.
//
// 🩸 El atajo de marcar facturas (4-sep-2026) guarda el `secuencial` crudo de
// Switch, `11-000002534`. Medido contra producción el 5-sep-2026: de los 566
// renglones vivos, **565 traen el formato corto y 1 el largo**. El papel, el
// PDF y el Excel imprimían 12 caracteres donde siempre hubo 4, y el aviso «ya
// salió en otra guía» comparaba el largo contra la clave corta de los 518
// renglones viejos, así que NUNCA pareaba con ninguno.
//
// 🔴 LA COMPARACIÓN VA POR LOS ÚLTIMOS 4 DÍGITOS **DENTRO DE LA MISMA EMPRESA**,
// y esa segunda mitad es la que evita falsas alarmas. Medido el 5-sep-2026
// sobre las 10.279 facturas de 2026 (`switch_facturas`, tipo Factura):
//   · acotando por empresa → 10.279 claves distintas: **ni un choque**;
//   · sin acotar          → 7.830 claves: **2.449 choques**.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  DIGITOS_DE_LA_FACTURA,
  claveDeFactura,
  facturaParaMostrar,
  facturasParaMostrar,
} from "@/lib/guias/numero-factura";
import {
  indiceYaSalio,
  yaSalioEn,
  facturaMarcada,
  marcarFactura,
  desmarcarFactura,
  numerosDeFacturas,
  TEXTO_TRASLADO,
} from "@/lib/guias/atajos-facturas";

const raiz = process.cwd();
const leer = (p: string) => readFileSync(path.join(raiz, p), "utf8");

const CLIENTE = { nombre: "City Mall", codigo: "D-24" };
const fila = (over: Partial<Record<string, unknown>> = {}) => ({
  orden: 1,
  cliente: "",
  cliente_codigo: "",
  direccion: "",
  empresa: "",
  facturas: "",
  bultos: 0,
  numero_guia_transp: "",
  ...over,
}) as Parameters<typeof marcarFactura>[0][number];

describe("🔴 la clave de comparación son los últimos 4 dígitos", () => {
  it("son CUATRO, no otro número", () => {
    expect(DIGITOS_DE_LA_FACTURA).toBe(4);
  });

  it("el largo de Switch y el corto de siempre dan la MISMA clave", () => {
    expect(claveDeFactura("11-000002534")).toBe("2534");
    expect(claveDeFactura("2534")).toBe("2534");
    expect(claveDeFactura("02534")).toBe("2534");
  });

  it("con menos de 4 dígitos se usan los que hay — no se inventan", () => {
    expect(claveDeFactura("985")).toBe("985");
    expect(claveDeFactura("7")).toBe("7");
  });

  it("🔴 «Traslado» y el «0000» viejo NO son facturas: clave vacía", () => {
    // Medido: 67 renglones vivos con `0000`. Si se indexaran, dos traslados de
    // la misma empresa se acusarían entre sí de «ya salió».
    expect(claveDeFactura(TEXTO_TRASLADO)).toBe("");
    expect(claveDeFactura("0000")).toBe("");
    expect(claveDeFactura("00000")).toBe("");
    expect(claveDeFactura("")).toBe("");
    expect(claveDeFactura(null)).toBe("");
  });
});

describe("🔴 se muestra corto, y SOLO lo que es un secuencial de Switch", () => {
  it("el largo de Switch se recorta a sus 4 dígitos", () => {
    expect(facturaParaMostrar("11-000002534")).toBe("2534");
    expect(facturasParaMostrar("11-000002534, 11-000002540")).toBe("2534, 2540");
  });

  it("lo que ya era corto no cambia una coma", () => {
    expect(facturaParaMostrar("2534")).toBe("2534");
    expect(facturasParaMostrar("2535, 2536")).toBe("2535, 2536");
    expect(facturasParaMostrar("2911-2912-2913")).toBe("2911-2912-2913");
  });

  it("🔴 una factura de 5 dígitos escrita a mano NO se recorta", () => {
    // Medido: 12 renglones vivos con facturas de 5 dígitos (23589, 32565…).
    // Ése ES el número, no un secuencial con ceros: recortarlo sería mentir.
    expect(facturaParaMostrar("23589")).toBe("23589");
    expect(facturaParaMostrar("32565")).toBe("32565");
  });

  it("«Traslado», «0000» y un código con letras salen TAL CUAL", () => {
    expect(facturaParaMostrar(TEXTO_TRASLADO)).toBe(TEXTO_TRASLADO);
    expect(facturaParaMostrar("0000")).toBe("0000");
    expect(facturaParaMostrar("FA-0012")).toBe("FA-0012");
  });
});

describe("🔴 el aviso «ya salió» parea con los renglones viejos, y por EMPRESA", () => {
  const indice = indiceYaSalio([
    { empresa: "Fashion Shoes", facturas: "2534", guiaNumero: 210 },
    { empresa: "Vistana International", facturas: "2911, 2912", guiaNumero: 211 },
    { empresa: "Fashion Wear", facturas: "0000", guiaNumero: 212 },
  ]);

  it("🩸 el secuencial LARGO encuentra el renglón viejo escrito corto", () => {
    // Es el defecto entero: antes esto daba null y el aviso no saltaba nunca.
    expect(yaSalioEn(indice, "Fashion Shoes", "11-000002534")).toBe(210);
  });

  it("y el corto sigue encontrando lo de siempre", () => {
    expect(yaSalioEn(indice, "Vistana International", "2912")).toBe(211);
  });

  it("🔴 NO parea entre empresas: 2.449 choques medidos en 2026", () => {
    expect(yaSalioEn(indice, "Vistana International", "11-000002534")).toBeNull();
    expect(yaSalioEn(indice, "Fashion Wear", "2911")).toBeNull();
  });

  it("🔴 un renglón «0000» no entra al índice ni se acusa a sí mismo", () => {
    expect(yaSalioEn(indice, "Fashion Wear", "0000")).toBeNull();
    expect(yaSalioEn(indice, "Fashion Wear", "11-000010000")).toBeNull();
  });

  it("numerosDeFacturas devuelve CLAVES, sin vacíos", () => {
    expect(numerosDeFacturas("11-000002534, 2540")).toEqual(["2534", "2540"]);
    expect(numerosDeFacturas("0000")).toEqual([]);
    expect(numerosDeFacturas(null)).toEqual([]);
  });
});

describe("🔴 marcar y desmarcar hablan el MISMO idioma que el renglón viejo", () => {
  const f = { empresa: "Fashion Shoes", secuencial: "11-000002534" };

  it("una factura ya escrita a mano se ve MARCADA aunque el secuencial venga largo", () => {
    const items = [fila({ cliente: "City Mall", cliente_codigo: "D-24", empresa: "Fashion Shoes", facturas: "2534" })];
    expect(facturaMarcada(items, CLIENTE, f)).toBe(true);
  });

  it("marcar GUARDA el secuencial COMPLETO — el corto es solo cómo se ve", () => {
    const items = [fila()];
    const [r] = marcarFactura(items, CLIENTE, f);
    expect(r.facturas).toBe("11-000002534");
    expect(facturasParaMostrar(r.facturas)).toBe("2534");
  });

  it("🔴 la SEGUNDA factura del mismo renglón también se guarda COMPLETA", () => {
    // Es el otro camino de `marcarFactura` (el renglón del cliente ya existe).
    const items = [fila({ cliente: "City Mall", cliente_codigo: "D-24", empresa: "Fashion Shoes", facturas: "11-000002534" })];
    const [r] = marcarFactura(items, CLIENTE, { empresa: "Fashion Shoes", secuencial: "11-000002540" });
    expect(r.facturas).toBe("11-000002534, 11-000002540");
    expect(facturasParaMostrar(r.facturas)).toBe("2534, 2540");
  });

  it("desmarcar quita el número aunque el renglón lo tuviera escrito corto", () => {
    const items = [fila({ cliente: "City Mall", cliente_codigo: "D-24", empresa: "Fashion Shoes", facturas: "2534", bultos: 3 })];
    const [r] = desmarcarFactura(items, CLIENTE, f);
    expect(r.facturas).toBe("");
    expect(r.bultos).toBe(3);
  });

  it("🔴 desmarcar algo SIN dígitos no borra los «0000» del renglón", () => {
    const items = [fila({ cliente: "City Mall", cliente_codigo: "D-24", empresa: "Fashion Shoes", facturas: "0000", bultos: 2 })];
    const [r] = desmarcarFactura(items, CLIENTE, { empresa: "Fashion Shoes", secuencial: TEXTO_TRASLADO });
    expect(r.facturas).toBe("0000");
  });
});

describe("candado estático — se muestra corto en las CUATRO superficies", () => {
  const superficies: Array<[string, string]> = [
    ["el papel", "src/app/guias/components/PrintDocument.tsx"],
    ["el PDF", "src/lib/guias/pdf-guia.ts"],
    ["el Excel", "src/app/guias/components/excel-guias.ts"],
    // ⚠️ CAMBIO DE DIRECCIÓN (5-sep-2026, «fuera la tabla que se corta»). Este
    // renglón apuntaba a `ListaEnvios.tsx`, donde vivía el helper `Resumen` que
    // arma la línea `destino · empresa · factura`. Ese helper se sacó a
    // `ResumenEnvio.tsx` para que el acordeón del teléfono dibuje EXACTAMENTE lo
    // mismo que la pantalla de despacho, así que la superficie a vigilar es la
    // ficha, no la lista que la usa. `ListaEnvios` sigue cubierto abajo: se le
    // exige que delegue.
    ["la ficha del envío", "src/app/guias/components/ResumenEnvio.tsx"],
    ["el acordeón de la lista", "src/app/guias/components/GuiasList.tsx"],
    ["la imagen de WhatsApp", "src/lib/guias/png-guia.ts"],
  ];

  it.each(superficies)("%s pasa las facturas por facturasParaMostrar", (_n, ruta) => {
    const src = leer(ruta);
    expect(src).toContain("facturasParaMostrar");
    // 🔴 Y ninguna dibuja el campo CRUDO por ningún camino. Importar la función
    // y no usarla en la celda es exactamente la mutación que hay que cazar.
    expect(src).not.toMatch(/[^a-zA-Z_](it|item|item\?)\.facturas(?!\s*\))/);
  });

  it("🔴 las dos pantallas que muestran renglones DELEGAN en la misma ficha", () => {
    // Sin esto, una de las dos podría volver a escribir su propia línea y
    // saltarse `facturasParaMostrar` sin que ningún candado lo note.
    for (const ruta of [
      "src/app/guias/components/ListaEnvios.tsx",
      "src/app/guias/components/GuiasList.tsx",
    ]) {
      expect(leer(ruta), ruta).toContain("<ResumenEnvio item={item}");
    }
  });

  it("🔴 lo que se GUARDA no se recorta: el atajo sigue mandando el secuencial", () => {
    const atajos = leer("src/lib/guias/atajos-facturas.ts");
    // `marcarFactura` escribe `sec`, que es `f.secuencial` sin tocar.
    expect(atajos).toContain('const sec = (f.secuencial ?? "").trim();');
    expect(atajos).not.toContain("facturaParaMostrar(");
  });

  it("hay UNA sola definición de la clave, y vive en numero-factura.ts", () => {
    expect(leer("src/lib/guias/atajos-facturas.ts")).not.toContain("export function normalizarNumeroFactura");
    expect(leer("src/lib/guias/numero-factura.ts")).toContain("export function claveDeFactura");
  });
});
