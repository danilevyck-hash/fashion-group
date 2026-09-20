// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL PAPEL DEL CLIENTE DEJA DE SALIR CON LÍNEAS ROTAS (20-sep-2026).
//
// 🩸 QUÉ VEÍA DANIEL. En **cada página de cada** estado de cuenta, la ficha del
// cliente salía así:
//
//     Identificación:1513069-1-650069
//     Límite de crédito0.00
//     Tiempo de Morosidad0
//
// Sin espacio, y el valor comiéndose los dos puntos del rótulo.
//
// LA CAUSA, medida a 8 pt en `dibujarFichaCliente`: el rótulo se dibuja en
// **negrita** y su ancho se medía **después** de volver a la letra normal, que
// es más angosta. «Identificación:» ocupa **19,05 mm** en negrita y **17,16 mm**
// en normal, así que el valor caía en 17,16 + 1,5 = **18,66 mm**: 0,39 mm
// ADENTRO del rótulo. Los rótulos cortos se salvaban de casualidad —«Nombre:»
// pierde 0,82 mm y el hueco es de 1,5—, y por eso el defecto aparecía en dos
// líneas de cuatro y no en todas.
//
// 🩸 Y SE FUERON DOS LÍNEAS. «Límite de crédito» y «Tiempo de Morosidad» valen
// **CERO en los 100 clientes** de la cartera: la cuarta línea del papel decía
// `0.00` y `0` para todo el mundo. Los campos NO se borran de `FichaCliente` —el
// sync de Switch los sigue leyendo—; lo que se retira es la línea del papel.
//
// 🔑 ESTE CANDADO MIDE EL PAPEL RENDERIZADO, no el archivo: saca de cada página
// la posición X de cada rótulo y de su valor y exige que el valor arranque
// DESPUÉS de donde termina el rótulo. Un candado de texto («contiene
// Identificación:») pasaba en verde con el defecto puesto.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";

const RAIZ = process.cwd();
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");
const plano = (rel: string) => sinComentarios(fs.readFileSync(path.join(RAIZ, rel), "utf8"));

const HOJA = "src/lib/cxc/pdf-estado-cuenta-hoja.ts";

/** Un pedazo de texto del PDF con dónde empieza y dónde termina, en puntos. */
interface Pedazo {
  texto: string;
  x0: number;
  x1: number;
  y: number;
  pagina: number;
}

async function pedazosDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<Pedazo[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
  const fuera: Pedazo[] = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    for (const it of (await page.getTextContent()).items as any[]) {
      if (!it.str?.trim()) continue;
      const x0 = it.transform[4];
      fuera.push({ texto: it.str, x0, x1: x0 + it.width, y: it.transform[5], pagina: i });
    }
  }
  return fuera;
}

// ── El cliente de la medición: el mismo D-25 que fija la forma del papel ─────
const D25 = {
  codigo: "D-25",
  clienteNombre: "City Mall Paso Canoa",
  cliente: {
    nombre: "City Mall Paso Canoa",
    identificacion: "1513069-1-650069",
    telefono: "727-7247",
    email: "contabilidad@citymall.com.pa",
    direccion: "Paso Canoas",
    limiteCredito: 0,
    tiempoMorosidad: 0,
  },
  total: 5579.91,
  generadoEn: "2026-09-09T12:00:00.000Z",
  empresas: [
    {
      empresa_key: "fashion_wear",
      empresa_nombre: "Fashion Wear",
      subtotal: 5579.91,
      saldoSwitch: null,
      documentos: [
        { numero: "11-000003121", fecha: "2026-06-16", tipo: "Factura", monto: 2978.88, saldo: 1006.8, debito: 1006.8, credito: 0, dias: 85, plazoCredito: 90, numeroFiscal: null },
        { numero: "11-000003122", fecha: "2026-06-17", tipo: "Factura", monto: 2792.7, saldo: 2701.35, debito: 2701.35, credito: 0, dias: 84, plazoCredito: 90, numeroFiscal: null },
      ],
    },
    // Una segunda compañía = una segunda hoja: el defecto salía en CADA página.
    {
      empresa_key: "vistana",
      empresa_nombre: "Vistana International",
      subtotal: 100,
      saldoSwitch: null,
      documentos: [
        { numero: "11-000000001", fecha: "2026-07-01", tipo: "Factura", monto: 100, saldo: 100, debito: 100, credito: 0, dias: 70, plazoCredito: 30, numeroFiscal: null },
      ],
    },
  ],
};

/** Los cuatro rótulos que quedan vivos en la ficha, con el valor que les toca. */
const PARES: [string, string][] = [
  ["Nombre:", "City Mall Paso Canoa"],
  ["Teléfono:", "727-7247"],
  ["Identificación:", "1513069-1-650069"],
  ["Email:", "contabilidad@citymall.com.pa"],
  ["Código:", "D-25"],
  ["Dirección:", "Paso Canoas"],
];

describe("🔴 1 · ningún valor se le monta a su rótulo, en NINGUNA página", () => {
  it("el valor arranca después de donde termina el rótulo, con su hueco", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { doc } = buildEstadoCuentaPDF(D25 as any, "City Mall Paso Canoa");
    const pedazos = await pedazosDelPdf(doc);
    expect(pedazos.length).toBeGreaterThan(0);

    const paginas = new Set(pedazos.map((p) => p.pagina));
    expect(paginas.size, "el papel tiene que traer las DOS hojas").toBe(2);

    for (const pagina of paginas) {
      for (const [rotulo, valor] of PARES) {
        const elRotulo = pedazos.find((p) => p.pagina === pagina && p.texto.trim() === rotulo);
        expect(elRotulo, `falta «${rotulo}» en la hoja ${pagina}`).toBeDefined();
        const elValor = pedazos.find(
          (p) => p.pagina === pagina && p.texto.trim() === valor && Math.abs(p.y - elRotulo!.y) < 1,
        );
        expect(elValor, `falta «${valor}» al lado de «${rotulo}» en la hoja ${pagina}`).toBeDefined();

        // 🔴 LA MEDICIÓN: el valor empieza DESPUÉS de que el rótulo termina.
        expect(
          elValor!.x0,
          `«${valor}» se le monta a «${rotulo}» en la hoja ${pagina} (${elValor!.x0.toFixed(2)} < ${elRotulo!.x1.toFixed(2)})`,
        ).toBeGreaterThanOrEqual(elRotulo!.x1);
      }
    }
  });

  it("🔑 el ancho se mide CON LA NEGRITA PUESTA, y esa es toda la corrección", () => {
    const src = plano(HOJA);
    expect(src).toContain("function inicioDelValor");
    // La negrita se pone ANTES de medir, dentro de la misma función.
    expect(src).toMatch(/inicioDelValor[\s\S]{0,200}setFont\("helvetica", "bold"\)[\s\S]{0,120}getTextWidth\(rotulo\)/);
    // Y ya no queda ningún `getTextWidth` pegado a un `setFont(… "normal")`
    // anterior, que es exactamente el defecto que se arregló.
    expect(src).not.toMatch(/setFont\("helvetica", "normal"\);\s*doc\.text\(v1, MARGEN \+ doc\.getTextWidth/);
  });

  it("el hueco entre rótulo y valor es un DATO, no un número suelto", () => {
    const src = plano(HOJA);
    expect(src).toContain("HUECO_ROTULO_MM = 1.5");
  });
});

describe("🩸 2 · «Límite de crédito» y «Tiempo de Morosidad» salieron del papel", () => {
  it("no se imprimen en ninguna hoja", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { doc } = buildEstadoCuentaPDF(D25 as any, "City Mall Paso Canoa");
    const pedazos = await pedazosDelPdf(doc);
    const texto = pedazos.map((p) => p.texto).join(" ");
    expect(texto, "volvió «Límite de crédito» al papel").not.toContain("Límite de crédito");
    expect(texto, "volvió «Tiempo de Morosidad» al papel").not.toContain("Morosidad");
  });

  it("…y tampoco los escribe el archivo que dibuja la hoja", () => {
    const src = plano(HOJA);
    expect(src).not.toContain('"Límite de crédito:"');
    expect(src).not.toContain('"Tiempo de Morosidad:"');
  });

  it("⚠️ pero los CAMPOS siguen vivos: el sync de Switch los sigue leyendo", () => {
    // Se retira la línea del papel, no el dato. Borrar los campos obligaría a
    // tocar el parseo de Switch y el de Boston por una línea de dibujo.
    const tipos = plano("src/lib/cxc/estado-cuenta-tipos.ts");
    expect(tipos).toContain("limiteCredito");
    expect(tipos).toContain("tiempoMorosidad");
  });
});

describe("⚠️ 3 · CONTROL — la ficha sigue diciendo lo que tiene que decir", () => {
  it("las tres líneas que quedan, con sus seis datos", async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { doc } = buildEstadoCuentaPDF(D25 as any, "City Mall Paso Canoa");
    const pedazos = await pedazosDelPdf(doc);
    const texto = pedazos.map((p) => p.texto).join(" ").replace(/\s+/g, " ");
    for (const t of [
      "Nombre:", "Teléfono:", "Identificación:", "Email:", "Código:", "Dirección:",
      "1513069-1-650069", "727-7247", "Paso Canoas", "D-25", "RECIBIDO CONFORME",
    ]) {
      expect(texto, `falta «${t}» en el papel`).toContain(t);
    }
  });
});
