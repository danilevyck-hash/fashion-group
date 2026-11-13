// Candado del «Excel de tallas por pedido» (Plantilla Switch › Tallas por bulto,
// 13-nov-2026). Con los datos REALES del pedido 16-000002182 de Fashion Shoes
// (líneas de Switch + tallas de los despachos de ASW, foto del 13-nov-2026) fija
// los totales, los amarillos y los naranjas; con casos chicos, cada regla.
import { describe, it, expect } from "vitest";
import XLSX from "xlsx-js-style";
import fixture from "./fixtures/tallas-pedido-2182.json";
import {
  armarTallasDelPedido, candidatosDeReferencia, curvasDeReferencia, delUltimoDespacho, idDelPedido, nombreDelArchivo,
  type TallaDeDespacho,
} from "@/lib/tallas-pedido/armar";
import { adjuntosDeDespacho, empresaDelDestinatario, leerAdjuntoDeDespacho, leerDespacho, proveedorDelCorreo, SIN_CAJA } from "@/lib/tallas-pedido/despacho-archivo";
import { libroDeTallas, FONDO } from "@/lib/tallas-pedido/excel";

const caja = (referencia: string, codigo_caja: string, tallas: [string, number][], cajas: number, extra: Partial<TallaDeDespacho> = {}): TallaDeDespacho[] =>
  tallas.map(([talla, porCaja], i) => ({
    referencia, codigo_caja, talla, ean: `ean-${referencia}-${talla}`, cantidad: porCaja * cajas, cajas,
    pares_por_caja: tallas.reduce((s, [, n]) => s + n, 0), factura: "F1", correo_id: "C1", fecha_despacho: "2026-10-01",
    ...extra, ...(i < 0 ? {} : {}),
  }));

describe("pedido 16-000002182 (datos reales)", () => {
  const { filas, resumen } = armarTallasDelPedido(fixture.lineas, fixture.despachos as TallaDeDespacho[]);

  it("cada total cuadra con los pares del pedido y las tallas suman el total", () => {
    for (const l of fixture.lineas) {
      const totales = filas.filter((f) => f.esTotal && (f.referencia === `Total ${l.codigo}` || f.referencia.startsWith(`Total ${l.codigo} · `)));
      const amarilla = filas.find((f) => !f.esTotal && f.referencia === l.codigo && f.color === "amarillo");
      expect(totales.length > 0 || !!amarilla, l.codigo).toBe(true);
      for (const t of totales) expect(t.pares, t.referencia).toBe(l.cantidad);
    }
    // Las tallas de cada opción completa suman el total de esa opción.
    let suma = 0;
    for (const f of filas) {
      if (f.esTotal) {
        if (f.color === null) expect(suma, f.referencia).toBe(f.pares);
        suma = 0;
      } else if (f.color === null) suma += f.pares ?? 0;
    }
  });

  it("nunca un decimal; el naranja va con los pares vacíos", () => {
    for (const f of filas) if (f.pares !== null) expect(Number.isInteger(f.pares)).toBe(true);
    for (const f of filas.filter((x) => x.color === "naranja" && !x.esTotal)) expect(f.pares).toBeNull();
  });

  it("los amarillos, los naranjas y la línea de arriba son los medidos", () => {
    const amarillos = filas.filter((f) => f.color === "amarillo").map((f) => f.referencia);
    const naranjas = [...new Set(filas.filter((f) => f.color === "naranja" && !f.esTotal).map((f) => `${f.referencia}${f.opcion ? ` · ${f.opcion}` : ""}`))];
    expect(amarillos).toEqual(fixture.esperado.amarillos);
    expect(naranjas).toEqual(fixture.esperado.naranjas);
    expect(resumen).toEqual(fixture.esperado.resumen);
  });

  it("el orden es el del pedido", () => {
    const orden = [...new Set(filas.filter((f) => !f.esTotal).map((f) => f.referencia))];
    expect(orden).toEqual(fixture.lineas.map((l) => l.codigo));
  });
});

describe("las reglas, una por una", () => {
  it("niños: Switch TH101074T000 encuentra a ASW TH101074T", () => {
    expect(candidatosDeReferencia("TH101074T000")).toEqual(["TH101074T000", "TH101074T"]);
    expect(candidatosDeReferencia("FW0FW09104BDS")).toEqual(["FW0FW09104BDS"]);
    const { filas } = armarTallasDelPedido(
      [{ codigo: "TH101074T000", descripcion: "Boys-Sneakers", cantidad: 12 }],
      caja("TH101074T", "K7", [["7", 12]], 2),
    );
    expect(filas.map((f) => [f.referencia, f.talla, f.pares])).toEqual([
      ["TH101074T000", "7", 12],
      ["Total TH101074T000", "", 12],
    ]);
  });

  it("pares = pares del pedido ÷ pares por caja × curva", () => {
    const { filas } = armarTallasDelPedido(
      [{ codigo: "A", descripcion: "x", cantidad: 16 }],
      caja("A", "M8", [["40", 1], ["41", 2], ["42", 2], ["43", 2], ["44", 1]], 3),
    );
    expect(filas.filter((f) => !f.esTotal).map((f) => f.pares)).toEqual([2, 4, 4, 4, 2]);
  });

  it("THS10474T: la MISMA curva en dos cajas es UNA opción", () => {
    const despachos = [
      ...caja("THS10474T", "P8", [["8", 12]], 1),
      ...caja("THS10474T", "P9", [["9", 12]], 1),
      ...caja("THS10474T", "P10", [["10", 12]], 1),
      ...caja("THS10474T", "Q8", [["8", 12]], 2),
      ...caja("THS10474T", "Q9", [["9", 12]], 1),
    ];
    expect(curvasDeReferencia(despachos).map((c) => c.tallas.map((t) => t.talla).join())).toEqual(["8", "9", "10"]);
    const { filas } = armarTallasDelPedido([{ codigo: "THS10474T", descripcion: "x", cantidad: 12 }], despachos);
    expect(filas.filter((f) => f.esTotal).map((f) => f.opcion)).toEqual(["Opción 1", "Opción 2", "Opción 3"]);
  });

  it("las curvas salen del despacho MÁS RECIENTE de la referencia", () => {
    const viejo = caja("K", "A", [["7", 12]], 1, { correo_id: "C1", factura: "F1", fecha_despacho: "2026-05-01", ean: "viejo" });
    const nuevo = caja("K", "B", [["8", 12]], 1, { correo_id: "C2", factura: "F2", fecha_despacho: "2026-10-01" });
    expect(delUltimoDespacho([...viejo, ...nuevo])).toEqual(nuevo);
    const { filas } = armarTallasDelPedido([{ codigo: "K", descripcion: "x", cantidad: 12 }], [...nuevo, ...viejo]);
    expect(filas.filter((f) => !f.esTotal).map((f) => f.talla)).toEqual(["8"]);
  });

  it("curvas distintas → Opción 1, 2… ordenadas por talla", () => {
    const despachos = [
      ...caja("R", "B", [["6", 2], ["7", 2], ["8", 2]], 2),
      ...caja("R", "A", [["6", 1], ["7", 3], ["8", 2]], 2),
    ];
    const { filas } = armarTallasDelPedido([{ codigo: "R", descripcion: "x", cantidad: 6 }], despachos);
    expect(filas.filter((f) => !f.esTotal && f.talla === "6").map((f) => [f.opcion, f.pares])).toEqual([["Opción 1", 1], ["Opción 2", 2]]);
  });

  it("sin despacho → una fila AMARILLA con los pares del pedido, sin talla ni código", () => {
    const { filas, resumen } = armarTallasDelPedido([{ codigo: "Z", descripcion: "Men", cantidad: 12 }], []);
    expect(filas).toEqual([{ referencia: "Z", descripcion: "Men", talla: "", codigoBarra: "", pares: 12, opcion: "", esTotal: false, color: "amarillo" }]);
    expect(resumen).toEqual({ referencias: 1, conTallas: 0, aMano: 1, pares: 12 });
  });

  it("no llena cajas completas → NARANJA con los pares vacíos (12 pares, caja de 5)", () => {
    const { filas, resumen } = armarTallasDelPedido(
      [{ codigo: "T1B8", descripcion: "x", cantidad: 12 }],
      caja("T1B8", "S5", [["23", 1], ["24", 1], ["25", 1], ["26", 1], ["27", 1]], 4),
    );
    expect(filas.every((f) => f.color === "naranja")).toBe(true);
    expect(filas.filter((f) => !f.esTotal).every((f) => f.pares === null)).toBe(true);
    expect(filas.at(-1)?.pares).toBe(12);
    expect(resumen.aMano).toBe(1);
  });

  it("una caja que no cuadra no se ofrece", () => {
    // 3 + 1 pares en 2 cajas: suma los 2 por caja, pero ninguna talla divide exacto.
    const mala = caja("M", "X", [["6", 1], ["7", 1]], 2).map((f, i) => ({ ...f, cantidad: i === 0 ? 3 : 1 }));
    expect(curvasDeReferencia(mala)).toEqual([]);
  });

  it("el N.° de pedido y el nombre del archivo", () => {
    expect(idDelPedido("16-000002182")).toBe(2182);
    expect(idDelPedido("2182")).toBe(2182);
    expect(idDelPedido("abc")).toBeNull();
    expect(nombreDelArchivo("16-000002182", "2026-11-13")).toBe("Tallas-16-000002182-2026-11-13.xlsx");
  });
});

describe("el archivo de ASW", () => {
  const H = ["FACT", "FECHA", "REFERENCIA", "EAN", "TALLA", "CANTIDAD", "NO_TRANSPORTE", "NOMBRE_DESTINATARIO_MERCANCIAS", "CODIGO_PREPACK", "CANTIDAD_PREPACK", "CANTIDAD_ORD_X_PP"];
  it("lee las columnas, suma la misma caja repartida en dos posiciones y salta lo que no tiene caja", () => {
    const r = leerDespacho(
      [
        H,
        ["2000015336", "10262026", "FM0FM062760GY", "8721386978487", "40", "3", "48198", "FASHION SHOES HOLDING", "M8B", "3", "8"],
        ["2000015336", "10262026", "FM0FM062760GY", "8721386978487", "40", "1", "48198", "FASHION SHOES HOLDING", "M8B", "1", "8"],
        ["2000015336", "10262026", "AM0AM006", "871", "OS", "7", "48198", "FASHION SHOES HOLDING", "", "", ""],
        ["3000016310", "11122026", "X1", "1", "M", "4", "48405", "OTRA EMPRESA S.A.", "K", "1", "4"],
      ],
      { correo_id: "C" },
    );
    expect(r.filas).toEqual([
      expect.objectContaining({ empresa_key: "fashion_shoes", referencia: "FM0FM062760GY", talla: "40", cantidad: 4, cajas: 4, pares_por_caja: 8, fecha_despacho: "2026-10-26", transporte: "48198", factura: "2000015336", ean: "8721386978487" }),
    ]);
    expect(r.descartadas).toBe(2);
    expect(r.destinatariosDesconocidos).toEqual(["OTRA EMPRESA S.A."]);
  });

  it("destinatarios, correos y adjuntos", () => {
    expect(empresaDelDestinatario("VISTANA INTERNACIONAL PANAMA, S.A.")).toBe("vistana");
    expect(empresaDelDestinatario("MULTI FASHION HOLDING CORP.")).toBe("american_classic");
    expect(empresaDelDestinatario("FASHIONS SHOES")).toBeNull();
    expect(proveedorDelCorreo("itorres@aswgr.com", "NOTIFICACION DE DESPACHO DE FASHION SHOES HOLDING T.48286")).toBe("asw");
    expect(proveedorDelCorreo("itorres@aswgr.com", "Recuperar: NOTIFICACION DE DESPACHO DE X")).toBeNull();
    expect(proveedorDelCorreo("alguien@otro.com", "NOTIFICACION DE DESPACHO")).toBeNull();
    expect(proveedorDelCorreo("dalvarez@aswgr.com", "PRE FALL 2027 CATALOGO")).toBeNull();
    const a = adjuntosDeDespacho([
      { name: "2000015706_TXT.xlsx" }, { name: "2000015706_TXT.txt" }, { name: "2000015706_Fact.pdf" },
      { name: "2000014480.txt" }, { name: "FASHION WEAR Y VISTANA.xlsx" }, { name: "2000014566_TXT.xls" },
    ]);
    expect(a.map((x) => x.name)).toEqual(["2000015706_TXT.txt", "2000014480.txt", "2000014566_TXT.xls"]);
  });
});

describe("Reebok (Active Shoes): otro formato", () => {
  it("Packing List: el cartón y debajo sus tallas → una caja con su curva", () => {
    const filas = leerAdjuntoDeDespacho(
      [
        ["Nro Pedido", "Nro Carton", "Articulo", "SKU", "Talla", "Barcode", "Cant Empaque"],
        ["3004176", "00019732300807899161", "100257651-B", "100257651-B", "NA", "100257651-B", null],
        [null, null, "100257651", 1200179714435, 5.5, 1200179714435, 1],
        [null, null, "100257651", 1200179714459, 6.5, 1200179714459, 2],
        ["3003984", "ILPN18K000000081255", "APPTR1203", "RBKAPPTR1203S", "S", 616518416556, 26],
      ],
      { correo_id: "C", proveedor: "reebok" },
    )!;
    expect(filas.map((f) => [f.referencia, f.talla, f.ean, f.cantidad, f.cajas, f.pares_por_caja, f.factura])).toEqual([
      ["100257651", "5.5", "1200179714435", 1, 1, 3, "PL 3004176"],
      ["100257651", "6.5", "1200179714459", 2, 1, 3, "PL 3004176"],
      ["APPTR1203", "S", "616518416556", 26, 1, 26, "PL 3003984"],
    ]);
    expect(filas.every((f) => f.empresa_key === "active_shoes")).toBe(true);
    const { filas: x } = armarTallasDelPedido([{ codigo: "100257651", descripcion: "x", cantidad: 6 }], filas.slice(0, 2) as TallaDeDespacho[]);
    expect(x.map((f) => f.pares)).toEqual([2, 4, 6]);
  });

  it("Detalle despacho: tallas y código de barra sin caja → NARANJA con los pares vacíos", () => {
    const filas = leerAdjuntoDeDespacho(
      [
        ["Document Number", "Posting Date", "BP Reference No.", "SKU Father", "SKU", "Talla", "EAN", "UPC", "Quantity"],
        ["4146", 46325, "ACTIVE SHOES", "100272101", 1200186497703, 7.5, 1200186497703, 199307377363, 5],
        ["4146", 46325, "ACTIVE SHOES", "100272101", 1200186497704, 6, null, 199307377364, 3],
      ],
      { correo_id: "C", proveedor: "reebok" },
    )!;
    expect(filas.map((f) => [f.referencia, f.talla, f.ean, f.codigo_caja, f.factura, f.fecha_despacho])).toEqual([
      ["100272101", "7.5", "1200186497703", SIN_CAJA, "4146", "2026-10-30"],
      ["100272101", "6", "199307377364", SIN_CAJA, "4146", "2026-10-30"],
    ]);
    const { filas: x, resumen } = armarTallasDelPedido([{ codigo: "100272101", descripcion: "x", cantidad: 8 }], filas as TallaDeDespacho[]);
    expect(x.map((f) => [f.talla, f.pares, f.color])).toEqual([["6", null, "naranja"], ["7.5", null, "naranja"], ["", 8, "naranja"]]);
    expect(resumen.aMano).toBe(1);
  });

  it("formato desconocido → null (se avisa), y el correo de Reebok se reconoce", () => {
    expect(leerAdjuntoDeDespacho([["A", "B"], [1, 2]], { correo_id: "C", proveedor: "reebok" })).toBeNull();
    expect(proveedorDelCorreo("ssanchez@fashionfitnessgroup.com", "DETALLE DE DESPACHO")).toBe("reebok");
    expect(adjuntosDeDespacho([{ name: "Detalle despacho Active.xlsx" }, { name: "Packing List Ordenes 3004176.xlsx" }, { name: "FE4146.pdf" }], "reebok").length).toBe(2);
  });
});

describe("el Excel", () => {
  const { filas } = armarTallasDelPedido(
    [{ codigo: "A", descripcion: "Men", cantidad: 8 }, { codigo: "Z", descripcion: "Men", cantidad: 12 }],
    caja("A", "M8", [["40", 1], ["41", 2], ["42", 2], ["43", 2], ["44", 1]], 3).map((f) => ({ ...f, ean: "8721289583894" })),
  );
  // El estilo se mira en el libro armado (la lectura de vuelta no trae los estilos).
  const libro = libroDeTallas(filas);
  const ws = libro.Sheets[libro.SheetNames[0]];

  it("encabezado en la fila 1 con filtro desde A1", () => {
    expect(XLSX.utils.sheet_to_json(ws, { header: 1 })[0]).toEqual(["Referencia", "Descripción", "Talla", "Código de barra", "Pares", "Opción"]);
    expect(ws["!autofilter"]?.ref).toBe(`A1:F${filas.length + 1}`);
  });

  it("código de barra como texto, talla como número, total en negrita, amarillo pintado", () => {
    expect(ws.D2.t).toBe("s");
    expect(ws.D2.v).toBe("8721289583894");
    expect(ws.C2.t).toBe("n");
    expect(ws.A7.v).toBe("Total A");
    expect(ws.A7.s?.font?.bold).toBe(true);
    expect(ws.A8.s?.fill?.fgColor?.rgb).toBe(FONDO.amarillo);
    expect(() => XLSX.write(libro, { type: "array", bookType: "xlsx" })).not.toThrow();
  });
});
