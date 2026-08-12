// ============================================================================
// Candado del COMPROBANTE DE ENTREGA DE MOBILIARIO (PDF).
//
// Lo que protege:
//   1. Que el LOGO se dibuje de verdad. `addImage` va en try/catch, así que un
//      base64 malo lo hace desaparecer SIN error (fue el bug del 26-jul-2026, a
//      la cadena le faltaba un `=`). Acá se cuentan los XObject de imagen del
//      PDF ya generado: si el logo no entra, el test se pone rojo.
//   2. Que el detalle de los muebles y los montos LLEGUEN al papel — un
//      comprobante que sale en blanco es peor que no tenerlo.
//   3. Que el número sea SECUENCIAL (ME-0001) y ESTABLE: la misma entrega
//      abierta dos veces tiene que decir lo mismo, y dos entregas nunca pueden
//      compartir número.
//   4. Que lo que Daniel mandó sacar NO vuelva: tienda, firmas, resumen de
//      unidades, nota del ITBMS y pie de página.
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  buildComprobanteEntregaPdf,
  nombreArchivoComprobante,
  numeroComprobante,
  type EntregaMueblePdfData,
} from "@/lib/marketing/pdf-entrega-mueble";

const ENTREGA_ID = "a1e6b971-2f4c-4a9e-9b71-0c1d2e3f4a5b";

const datos: EntregaMueblePdfData = {
  entregaId: ENTREGA_ID,
  numero: 7,
  fecha: "2026-06-22T16:15:32.586175+00:00",
  cliente: "Jerusalem De Panama",
  clienteCodigo: "D-80",
  tienda: "Jerusalem Pasocanoa",
  proyecto: "Remodelacion",
  items: [
    { articulo: "Barra plana", cantidad: 114, precioUnitario: 28 },
    { articulo: "Paneles", cantidad: 38, precioUnitario: 130 },
  ],
  porMarca: [{ marca: "Tommy Hilfiger", monto: 14630 }],
  total: 14630,
  notas: null,
};

/** Texto crudo del PDF (jsPDF no comprime los streams de texto por default). */
function crudo(buf: Buffer): string {
  return buf.toString("latin1");
}
function imagenes(buf: Buffer): number {
  return (crudo(buf).match(/\/Subtype\s*\/Image/g) || []).length;
}
/** El texto en un PDF de jsPDF va en literales `(…)`; se busca por trozos. */
function contiene(buf: Buffer, texto: string): boolean {
  return crudo(buf).includes(texto);
}

describe("numeroComprobante", () => {
  it("es secuencial y con 4 dígitos, no un hash del uuid", () => {
    expect(numeroComprobante({ numero: 1, entregaId: ENTREGA_ID })).toBe("ME-0001");
    expect(numeroComprobante({ numero: 21, entregaId: ENTREGA_ID })).toBe("ME-0021");
    expect(numeroComprobante({ numero: 1234, entregaId: ENTREGA_ID })).toBe("ME-1234");
  });

  it("ES ESTABLE: la misma entrega da siempre el mismo número", () => {
    const d = { numero: 7, entregaId: ENTREGA_ID };
    expect(numeroComprobante(d)).toBe(numeroComprobante(d));
    // Y no depende del uuid: el número guardado manda.
    expect(numeroComprobante({ numero: 7, entregaId: "otro-uuid-cualquiera" })).toBe(
      numeroComprobante(d),
    );
  });

  it("SIN REPETIDOS NI HUECOS: 1..9999 dan 9999 números distintos y ordenados", () => {
    const vistos = new Set<string>();
    let previo = "";
    for (let n = 1; n <= 9999; n++) {
      const s = numeroComprobante({ numero: n, entregaId: ENTREGA_ID });
      expect(s).toMatch(/^ME-\d{4}$/);
      expect(vistos.has(s)).toBe(false); // ningún repetido
      vistos.add(s);
      // Con padding fijo el orden alfabético es el orden numérico: sin huecos.
      expect(s > previo).toBe(true);
      previo = s;
    }
    expect(vistos.size).toBe(9999);
  });

  it("pasado 9999 sigue creciendo en vez de truncarse", () => {
    expect(numeroComprobante({ numero: 10000, entregaId: ENTREGA_ID })).toBe("ME-10000");
  });

  it("sin número guardado cae al respaldo del uuid, no a un número repetido", () => {
    // Mientras la migración no corra, dos entregas distintas siguen dando
    // números distintos (lo peor sería que todas dijeran ME-0000).
    expect(numeroComprobante({ numero: null, entregaId: ENTREGA_ID })).toBe("ME-A1E6B971");
    expect(
      numeroComprobante({ numero: null, entregaId: "e8cc66dd-0000-0000-0000-000000000000" }),
    ).toBe("ME-E8CC66DD");
    expect(numeroComprobante({ entregaId: "" })).toBe("ME-00000000");
  });

  it("el nombre de archivo lleva la fecha y el número", () => {
    expect(
      nombreArchivoComprobante({ entregaId: ENTREGA_ID, numero: 7, fecha: "2026-06-22" }),
    ).toBe("2026-06-22 · Entrega de mobiliario ME-0007");
  });
});

describe("la migración que numera las entregas", () => {
  const sql = fs.readFileSync(
    path.join(
      process.cwd(),
      "supabase/migrations/20260730120000_mk_entregas_muebles_numero.sql",
    ),
    "utf8",
  );

  it("numera lo existente EN ORDEN DE FECHA de entrega", () => {
    expect(sql).toMatch(/row_number\(\)\s*OVER\s*\(\s*ORDER BY created_at/i);
  });

  it("deja el número a cargo de una sequence (nada de max+1 en el código)", () => {
    expect(sql).toMatch(/CREATE SEQUENCE IF NOT EXISTS mk_entregas_muebles_numero_seq/i);
    expect(sql).toMatch(/SET DEFAULT nextval\('mk_entregas_muebles_numero_seq'\)/i);
  });

  it("tiene el candado de que nadie repita número", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS mk_entregas_muebles_numero_key/i);
  });
});

describe("buildComprobanteEntregaPdf", () => {
  it("genera un PDF válido de una sola página", () => {
    const buf = buildComprobanteEntregaPdf(datos);
    expect(buf.length).toBeGreaterThan(5000);
    expect(crudo(buf).startsWith("%PDF-")).toBe(true);
    expect((crudo(buf).match(/\/Type\s*\/Page[^s]/g) || []).length).toBe(1);
  });

  it("EL LOGO SALE — hay al menos un XObject de imagen en el PDF", () => {
    // Este es el candado del bug del logo invisible: addImage está en try/catch.
    expect(imagenes(buildComprobanteEntregaPdf(datos))).toBeGreaterThanOrEqual(1);
  });

  it("trae el número secuencial, el cliente, el código y el proyecto", () => {
    const buf = buildComprobanteEntregaPdf(datos);
    expect(contiene(buf, "ME-0007")).toBe(true);
    expect(contiene(buf, "Jerusalem De Panama")).toBe(true);
    expect(contiene(buf, "D-80")).toBe(true);
    expect(contiene(buf, "Remodelacion")).toBe(true);
    expect(contiene(buf, "22/06/2026")).toBe(true);
  });

  it("trae el detalle de los muebles y el total", () => {
    const buf = buildComprobanteEntregaPdf(datos);
    expect(contiene(buf, "Barra plana")).toBe(true);
    expect(contiene(buf, "Paneles")).toBe(true);
    expect(contiene(buf, "14,630.00")).toBe(true);
  });

  it("NO trae nada de lo que Daniel mandó sacar", () => {
    // *"tiene q ser asi de simple"*. Si alguno de estos vuelve, este test avisa.
    const buf = buildComprobanteEntregaPdf(datos);
    expect(contiene(buf, "Jerusalem Pasocanoa")).toBe(false); // la TIENDA
    expect(contiene(buf, "Recibido por")).toBe(false); // firmas
    expect(contiene(buf, "Entregado por")).toBe(false);
    expect(contiene(buf, "Conformidad")).toBe(false);
    expect(contiene(buf, "unidades en")).toBe(false); // "152 unidades en 2 art."
    expect(contiene(buf, "ITBMS")).toBe(false); // la nota del impuesto
    expect(contiene(buf, "fashiongr.com")).toBe(false); // el pie de página
  });

  it("una entrega SIN detalle de artículos no sale vacía: muestra el total", () => {
    const buf = buildComprobanteEntregaPdf({ ...datos, items: [] });
    expect(imagenes(buf)).toBeGreaterThanOrEqual(1);
    expect(contiene(buf, "Sin detalle de art")).toBe(true);
    expect(contiene(buf, "14,630.00")).toBe(true);
  });

  it("un proyecto sin código de directorio igual muestra el cliente", () => {
    const buf = buildComprobanteEntregaPdf({ ...datos, clienteCodigo: null });
    expect(contiene(buf, "Jerusalem De Panama")).toBe(true);
    expect(contiene(buf, "D-80")).toBe(false);
  });

  it("sin marca asignada lo dice explícito", () => {
    const buf = buildComprobanteEntregaPdf({ ...datos, porMarca: [] });
    expect(contiene(buf, "Sin marca asignada")).toBe(true);
  });

  it("dos marcas: las dos aparecen con su monto", () => {
    const buf = buildComprobanteEntregaPdf({
      ...datos,
      porMarca: [
        { marca: "Tommy Hilfiger", monto: 3080 },
        { marca: "Calvin Klein", monto: 2695 },
      ],
    });
    expect(contiene(buf, "Tommy Hilfiger")).toBe(true);
    expect(contiene(buf, "Calvin Klein")).toBe(true);
    expect(contiene(buf, "3,080.00")).toBe(true);
  });

  it("las notas de la entrega salen cuando existen", () => {
    const buf = buildComprobanteEntregaPdf({
      ...datos,
      notas: "Entrega parcial de la bodega",
    });
    expect(contiene(buf, "Entrega parcial")).toBe(true);
  });

  it("sin notas no dibuja el bloque de notas", () => {
    expect(contiene(buildComprobanteEntregaPdf(datos), "NOTAS")).toBe(false);
  });
});

// ============================================================================
// AGOSTO 2026 — lo que Daniel pidió agregar: FOTO por renglón y BULTOS aparte.
//
//   *"en la nota de entrega que vaya con foto"*
//   *"puedo mandar 30 norte colgador en 1 bulto. o 20 norte colgador en un
//     bulto"*
//
// 🔴 Las piezas y los bultos son DOS columnas. Fundirlas —o peor, imprimir
//    bultos donde va la mercancía— es lo que descuadra el conteo de quien
//    recibe en la tienda.
// ============================================================================

/** JPEG real de 1×1 px: jsPDF PARSEA la cabecera, no acepta cualquier base64. */
const FOTO_1PX =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsL" +
  "DBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAAB" +
  "AAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==";

const conFotoYBultos: EntregaMueblePdfData = {
  ...datos,
  items: [
    {
      articulo: "Norte colgador",
      cantidad: 150,
      bultos: 5,
      precioUnitario: 66,
      fotoDataUrl: FOTO_1PX,
    },
    {
      articulo: "Paneles",
      cantidad: 38,
      bultos: null,
      precioUnitario: 130,
      fotoDataUrl: null,
    },
  ],
};

describe("nota de entrega — foto de cada mueble", () => {
  it("LA FOTO SALE: con 1 foto hay un XObject de imagen MÁS que sin ella", () => {
    // Contra el logo, que siempre está: se compara el mismo documento con y
    // sin foto. `addImage` va en try/catch, así que una foto que no se dibuja
    // desaparecería sin error — es el mismo bug del logo del 26-jul.
    const sinFoto = imagenes(buildComprobanteEntregaPdf(datos));
    const conFoto = imagenes(buildComprobanteEntregaPdf(conFotoYBultos));
    expect(conFoto).toBe(sinFoto + 1);
  });

  it("un renglón SIN foto no rompe el papel ni pierde su fila", () => {
    const buf = buildComprobanteEntregaPdf(conFotoYBultos);
    expect(contiene(buf, "Paneles")).toBe(true);
    expect(contiene(buf, "Norte colgador")).toBe(true);
  });

  it("una foto corrupta NO tumba el comprobante", () => {
    const buf = buildComprobanteEntregaPdf({
      ...conFotoYBultos,
      items: [
        {
          articulo: "Norte colgador",
          cantidad: 150,
          bultos: 5,
          precioUnitario: 66,
          fotoDataUrl: "data:image/jpeg;base64,esto-no-es-una-imagen",
        },
      ],
    });
    expect(contiene(buf, "Norte colgador")).toBe(true);
    expect(contiene(buf, "150")).toBe(true);
  });
});

describe("nota de entrega — PIEZAS y BULTOS en columnas separadas", () => {
  it("las dos columnas existen y se llaman por su nombre", () => {
    const buf = buildComprobanteEntregaPdf(conFotoYBultos);
    expect(contiene(buf, "Piezas")).toBe(true);
    expect(contiene(buf, "Bultos")).toBe(true);
    // "Cantidad" era ambiguo: se retiró justamente para no confundirlas.
    expect(contiene(buf, "Cantidad")).toBe(false);
  });

  it("las piezas mandan el importe — los bultos NO lo tocan", () => {
    // 150 piezas × $66 = $9,900.00. Con bultos (5) darían $330.
    const buf = buildComprobanteEntregaPdf({
      ...conFotoYBultos,
      items: [conFotoYBultos.items[0]],
      total: 9900,
    });
    expect(contiene(buf, "9,900.00")).toBe(true);
    expect(contiene(buf, "330.00")).toBe(false);
  });

  it("sin bultos anotados la celda va VACÍA, nunca en 0", () => {
    const buf = buildComprobanteEntregaPdf({
      ...datos,
      items: [
        { articulo: "Paneles", cantidad: 38, bultos: null, precioUnitario: 130 },
      ],
    });
    expect(contiene(buf, "Bultos")).toBe(true);
    // El único "0" suelto del renglón sería el de un bulto inventado.
    expect(crudo(buf)).not.toMatch(/\(0\)\s*Tj/);
  });

  // ── SON DOS PAPELES (12-ago-2026). Daniel, textual: *"lo de los bultos no
  //    es para el comprobante que le mando a la marca, sino para el envio del
  //    producto al cliente, son dos cosas distintas"*. UN generador, un flag:
  //    `incluirBultos: true` (default) = NOTA DE ENTREGA (envío al cliente);
  //    `false` = COMPROBANTE DE ENTREGA (el del ZIP que va a la marca). ──────
  it("la NOTA de envío (default) lleva Bultos y se titula NOTA DE ENTREGA", () => {
    const buf = buildComprobanteEntregaPdf(conFotoYBultos);
    expect(contiene(buf, "Bultos")).toBe(true);
    expect(contiene(buf, "NOTA DE ENTREGA")).toBe(true);
    expect(contiene(buf, "COMPROBANTE DE ENTREGA")).toBe(false);
  });

  it("el COMPROBANTE para la marca (incluirBultos:false) sale SIN Bultos", () => {
    const buf = buildComprobanteEntregaPdf(conFotoYBultos, {
      incluirBultos: false,
    });
    expect(contiene(buf, "Bultos")).toBe(false);
    expect(contiene(buf, "COMPROBANTE DE ENTREGA")).toBe(true);
    // Y el dato de los bultos (5) tampoco se filtra por otra celda.
    expect(crudo(buf)).not.toMatch(/\(5\)\s*Tj/);
  });

  it("sin Bultos, las piezas y la plata quedan INTACTAS (misma entrega)", () => {
    const buf = buildComprobanteEntregaPdf(conFotoYBultos, {
      incluirBultos: false,
    });
    expect(contiene(buf, "Piezas")).toBe(true);
    expect(contiene(buf, "Norte colgador")).toBe(true);
    expect(contiene(buf, "150")).toBe(true);
    expect(contiene(buf, "14,630.00")).toBe(true);
  });

  it("sin detalle de artículos, el comprobante sin bultos tampoco se rompe", () => {
    const buf = buildComprobanteEntregaPdf(
      { ...datos, items: [] },
      { incluirBultos: false },
    );
    expect(contiene(buf, "Sin detalle de art")).toBe(true);
    expect(contiene(buf, "14,630.00")).toBe(true);
    expect(contiene(buf, "Bultos")).toBe(false);
  });

  it("los ZIP (marca y global) piden el papel SIN bultos; la nota, CON", () => {
    // Candado estático: el flag correcto en cada llamador. Si un ZIP volviera
    // al default (con bultos), el papel que va a la marca cambiaría solo.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const raiz = path.join(__dirname, "..", "..");
    const zipMarca = fs.readFileSync(
      path.join(raiz, "lib/marketing/zip-marca.ts"),
      "utf8",
    );
    const zipExport = fs.readFileSync(
      path.join(raiz, "lib/marketing/zip-export.ts"),
      "utf8",
    );
    const nota = fs.readFileSync(
      path.join(raiz, "components/marketing/NotaEntregaAcciones.tsx"),
      "utf8",
    );
    const rutaPdf = fs.readFileSync(
      path.join(raiz, "app/api/marketing/entregas-pdf/[id]/route.ts"),
      "utf8",
    );
    expect(zipMarca).toMatch(
      /buildComprobanteEntregaPdf\(datos,\s*\{\s*incluirBultos:\s*false\s*\}\)/,
    );
    expect(zipExport).toMatch(
      /buildComprobanteEntregaPdf\(datos,\s*\{\s*incluirBultos:\s*false\s*\}\)/,
    );
    expect(nota).toMatch(/incluirBultos:\s*true/);
    expect(nota).not.toMatch(/incluirBultos:\s*false/);
    expect(rutaPdf).toMatch(/incluirBultos:\s*true/);
  });

  it("cada número cae DEBAJO de su columna (piezas antes que bultos)", () => {
    // Sin esto, intercambiar las dos columnas pasaría en verde: los mismos
    // encabezados y los mismos números, en el orden equivocado. Se mide la
    // POSICIÓN en el flujo del PDF, que es el orden en que autoTable dibuja
    // las celdas de la fila.
    const buf = buildComprobanteEntregaPdf({
      ...datos,
      items: [
        { articulo: "Norte colgador", cantidad: 150, bultos: 7, precioUnitario: 66 },
      ],
      total: 9900,
    });
    const txt = crudo(buf);
    const desde = txt.indexOf("Bultos"); // fin del encabezado
    expect(desde).toBeGreaterThan(0);
    const piezas = txt.indexOf("(150)", desde);
    const bultos = txt.indexOf("(7)", desde);
    expect(piezas).toBeGreaterThan(0);
    expect(bultos).toBeGreaterThan(0);
    expect(piezas).toBeLessThan(bultos);
  });
});
