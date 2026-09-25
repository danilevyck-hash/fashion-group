// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — COMISIONES EN EL CELULAR (25-sep-2026). El mockup que Daniel
// aprobó letra por letra: 1b · 2d · 3h · 4j · 5t/5u · 6o · 7p · 8 · 9r.
//
// 🩸 QUÉ REEMPLAZA, medido el 25-sep-2026 a 390 px:
//   · la portada gastaba **265 px (el 31 %) en 7 controles en 4 renglones**
//     antes del primer vendedor, y los dos botones de papel **100 px en dos
//     renglones sueltos, en zig-zag**;
//   · el ☰ se comía el total: con una fila abierta la barra quedaba en y≈760 y
//     el botón empezaba en y=772 — se leía **«TOTAL A PAGAR $5,97…»**;
//   · el detalle **no enseñaba ni un monto**: «% UTIL.» y «COMISIÓN» se veían
//     **0 px** de 69 y de 93, y «SUBTOTAL» 31 de 104;
//   · Configuración medía **3.106 px con OCHO tablas, y las ocho se salían**;
//   · Multifashion **nunca decía su total** ($255,27 en agosto).
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. 🔴 NINGÚN NÚMERO CAMBIA: el total a pagar de agosto 2026 sigue siendo
//      **$5.978,55**, prendido y apagado el interruptor.
//   2. El total va ARRIBA y no hay barra negra que el ☰ pueda tapar.
//   3. El mes es «‹ Ago 2026 ›» y NUNCA va al futuro.
//   4. En el detalle la plata va primero, y no se perdió ni una columna.
//   5. 🔴 MULTIFASHION NUNCA SE SUMA CON EL GRUPO: su barra lleva el nombre
//      adentro, y hay barrido.
//   6. «Descargar» es UN botón con su hoja de tres.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  AVISO_DESLIZA,
  COLUMNAS_DETALLE_COBRO,
  COLUMNAS_DETALLE_VENTA,
  COMISIONES_CELULAR,
  OPCIONES_DESCARGA,
  OPCIONES_MANDAR,
  ROTULO_TOTAL_A_PAGAR,
  ROTULO_TOTAL_GRUPO,
  ROTULO_TOTAL_MULTIFASHION,
  mesEnPalabras,
  mesesAlrededor,
  tickets,
  tituloDeLaHojaMandar,
} from "@/lib/comisiones/celular";
import { fmtMoney } from "@/lib/ventas/format";
import { sumarPagable } from "@/lib/comisiones/sin-pago";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

// ─────────────────────────────────────────────────────────────────────────────
// 1 · 🔴 NINGÚN NÚMERO CAMBIA — agosto 2026, medido
// ─────────────────────────────────────────────────────────────────────────────

/** Los tres vendedores de Fashion Group en agosto 2026, medidos en producción. */
const AGOSTO_2026 = [
  { vendedor: "REYNALDO ESPINOSA", total: 5091.64, se_paga: true },
  { vendedor: "EDWIN", total: 652.42, se_paga: true },
  { vendedor: "RODRIGO", total: 234.49, se_paga: true },
  // Los dos que se calculan y NO se pagan.
  { vendedor: "DANIEL LEVY", total: 470.23, se_paga: false },
  { vendedor: "DEFAULT", total: 327.77, se_paga: false },
];

describe("🔴 el total a pagar de agosto 2026 no se mueve", () => {
  it("son $5,978.55, prendido o apagado el interruptor", () => {
    // 5.091,64 + 652,42 + 234,49 = 5.978,55 — y los dos que no se pagan NO entran.
    const total = sumarPagable(AGOSTO_2026, (r) => r.total);
    expect(total).toBeCloseTo(5978.55, 2);
    expect(fmtMoney(total)).toBe("$5,978.55");
    // El interruptor es de PANTALLA: no toca el cálculo. La suma es la misma
    // función (`sumarPagable`) en los dos casos, y este archivo no la reescribe.
    expect(leer("src/lib/comisiones/celular.ts")).not.toContain("sumarPagable");
    expect(leer("src/lib/comisiones/celular.ts")).not.toContain("reduce(");
  });

  it("y el celular NO recalcula el total: lo REPORTA la vista del grupo", () => {
    const consolidado = leer("src/components/comisiones/ComisionesConsolidadoView.tsx");
    expect(consolidado).toContain("onTotal?.(loading || error || empty ? null : grandTotal)");
    const portada = leer("src/components/comisiones/celular/PortadaComisionesCelular.tsx");
    // La portada solo lo dibuja.
    expect(portada).toContain("fmtMoney(total)");
    expect(portada).not.toContain("reduce(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 · El interruptor
// ─────────────────────────────────────────────────────────────────────────────

describe("el interruptor", () => {
  it("está prendido y es de CÓDIGO", () => {
    expect(COMISIONES_CELULAR).toBe(true);
    expect(leer("src/lib/comisiones/celular.ts")).not.toContain("process.env");
  });

  it("🔑 se monta UN SOLO ÁRBOL, no dos escondidos con CSS", () => {
    const vista = leer("src/components/comisiones/ComisionesView.tsx");
    expect(vista).toContain("if (enCelular) {");
    expect(vista).toContain("const cuerpo =");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3 · 1b — el total arriba, y el mes con flechas
// ─────────────────────────────────────────────────────────────────────────────

describe("1b · la portada", () => {
  it("🔴 el total va ARRIBA y no queda barra negra que el ☰ pueda tapar", () => {
    expect(ROTULO_TOTAL_A_PAGAR).toBe("a pagar");
    const tarjetas = leer("src/components/comisiones/ComisionesTarjetas.tsx");
    expect(tarjetas).toContain("{!totalArriba && <TarjetaTotal");
  });

  it("«‹ Ago 2026 ›», y NUNCA al futuro", () => {
    expect(mesEnPalabras("2026-08")).toBe("Ago 2026");
    expect(mesEnPalabras("2026-12")).toBe("Dic 2026");
    // Con el mes tope puesto en septiembre, no hay «siguiente».
    expect(mesesAlrededor("2026-09", "2026-09")).toEqual({ anterior: "2026-08", siguiente: null });
    expect(mesesAlrededor("2026-08", "2026-09")).toEqual({ anterior: "2026-07", siguiente: "2026-09" });
    // Enero mira a diciembre del año pasado.
    expect(mesesAlrededor("2026-01", "2026-09").anterior).toBe("2025-12");
    // Un valor raro no rompe la pantalla.
    expect(mesesAlrededor("qué", "2026-09")).toEqual({ anterior: null, siguiente: null });
  });

  it("el mes tope es el de PANAMÁ, no el del navegador", () => {
    expect(leer("src/components/comisiones/celular/PortadaComisionesCelular.tsx"))
      .toContain('hoyPanama().slice(0, 7)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 · 3h — el detalle, con la plata a la vista
// ─────────────────────────────────────────────────────────────────────────────

describe("3h · el detalle de una comisión", () => {
  it("🔴 en el celular la PLATA va primero", () => {
    expect(COLUMNAS_DETALLE_VENTA[0].clave).toBe("comision");
    expect(COLUMNAS_DETALLE_VENTA[1].clave).toBe("subtotal");
    expect(COLUMNAS_DETALLE_COBRO[0].clave).toBe("comision");
    expect(COLUMNAS_DETALLE_COBRO[1].clave).toBe("monto");
  });

  it("🔴 no se perdió NINGUNA columna: siguen siendo seis y cuatro", () => {
    expect(COLUMNAS_DETALLE_VENTA.map((c) => c.clave).sort()).toEqual(
      ["cliente", "comision", "factura", "fecha", "subtotal", "utilidad"],
    );
    // ⚠️ COBROS son CUATRO: el API de Switch no expone el número de recibo.
    expect(COLUMNAS_DETALLE_COBRO.map((c) => c.clave).sort()).toEqual(
      ["cliente", "comision", "fecha", "monto"],
    );
  });

  it("y en la computadora el orden de siempre no se toca", () => {
    const modal = leer("src/components/comisiones/ComisionesDetalleModal.tsx");
    expect(modal).toContain('{ clave: "fecha", rotulo: "Fecha", alineado: "izq" }');
    expect(modal).toContain("enCelular\n    ? COLUMNAS_DETALLE_VENTA");
  });

  it("se dice que la tabla se desliza, y una sola vez por tabla", () => {
    expect(AVISO_DESLIZA).toBe("desliza para el lado →");
    expect(leer("src/components/comisiones/ComisionesDetalleModal.tsx")).toContain("data-aviso-desliza");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5 · 4j y 6o — las dos tablas de Configuración
// ─────────────────────────────────────────────────────────────────────────────

describe("4j y 6o · Configuración", () => {
  it("🔴 Tasas: TRES columnas en el celular, las empresas al abrir la fila", () => {
    const fuente = leer("src/components/comisiones/comisiones-config/TasasPorVendedor.tsx");
    expect(fuente).toContain('<th className="hidden px-3.5 py-2 font-medium sm:table-cell">Empresas</th>');
    expect(fuente).toContain("data-empresas-de=");
    // 🩸 La fila de Reynaldo medía 165 px contra 57: 108 px de hueco por una
    // columna fuera de la pantalla.
    expect(fuente).toContain("165 px");
  });

  it("🔴 Descuentos: TRES columnas, empresa y fechas al abrir", () => {
    const fuente = leer("src/components/comisiones/comisiones-config/Descuentos.tsx");
    expect(fuente).toContain('<th className="hidden px-3.5 py-2 font-medium sm:table-cell">Desde</th>');
    expect(fuente).toContain('<th className="hidden px-3.5 py-2 font-medium sm:table-cell">Hasta</th>');
    expect(fuente).toContain("data-detalle-descuento=");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6 · 7p — Multifashion, con SU total y NUNCA sumado
// ─────────────────────────────────────────────────────────────────────────────

describe("7p · Multifashion", () => {
  it("🔴 su barra lleva el nombre adentro, para que nunca se lea como sumable", () => {
    expect(ROTULO_TOTAL_MULTIFASHION).toBe("TOTAL A PAGAR · Multifashion");
    expect(ROTULO_TOTAL_GRUPO).toBe("TOTAL A PAGAR");
    expect(ROTULO_TOTAL_MULTIFASHION).not.toBe(ROTULO_TOTAL_GRUPO);
  });

  it("🔴 BARRIDO: nadie suma el total del grupo con el de Multifashion", () => {
    const archivos = [
      "src/components/comisiones/ComisionesView.tsx",
      "src/components/comisiones/ComisionesConsolidadoView.tsx",
      "src/components/comisiones/celular/PortadaComisionesCelular.tsx",
      "src/components/multifashion/VendedorasSubtab.tsx",
    ];
    for (const a of archivos) {
      const fuente = leer(a);
      // Ninguna suma que mezcle los dos mundos.
      expect(fuente, a).not.toMatch(/grandTotal\s*\+/);
      expect(fuente, a).not.toMatch(/\+\s*grandTotal/);
      expect(fuente, a).not.toMatch(/totalMultifashion\s*\+/);
    }
  });

  it("su total es la SUMA de lo que se ve, y sale solo dentro de Comisiones", () => {
    const fuente = leer("src/components/multifashion/VendedorasSubtab.tsx");
    expect(fuente).toContain("data-total-multifashion");
    expect(fuente).toContain("conTotalAPagar && sortedVendedoras.length > 0");
    // El módulo Multifashion no la pide.
    expect(leer("src/components/comisiones/ComisionesView.tsx")).toContain("conTotalAPagar={COMISIONES_CELULAR}");
  });

  it("«1 ticket», no «1 tickets»", () => {
    expect(tickets(1)).toBe("1 ticket");
    expect(tickets(2)).toBe("2 tickets");
    expect(tickets(0)).toBe("0 tickets");
    expect(leer("src/components/multifashion/VendedorasSubtab.tsx"))
      .toContain('v.tickets === 1 ? "ticket" : "tickets"');
  });

  it("🔴 «por la venta de la tienda», no «retail contra retail»", () => {
    const bono = leer("src/lib/multifashion/bono-linea.ts");
    // Lo que ve Daniel no lleva la jerga; la cuenta no cambió.
    expect(bono).toContain("por la venta de la tienda");
    expect(bono).not.toContain('"Bono: se define al cerrar el mes (retail contra retail)."');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7 · 8 y 9r — Descargar y Mandar
// ─────────────────────────────────────────────────────────────────────────────

describe("8 y 9r · el papel", () => {
  it("«Descargar» es UN botón con tres opciones", () => {
    expect(OPCIONES_DESCARGA.map((o) => o.rotulo)).toEqual([
      "PDF del mes", "Excel del mes", "PDF de un vendedor…",
    ]);
    expect(leer("src/components/comisiones/celular/PortadaComisionesCelular.tsx"))
      .toContain("data-abrir-descargar");
  });

  it("«Mandar» tiene las MISMAS tres salidas del estado de cuenta", () => {
    expect(OPCIONES_MANDAR.map((o) => o.rotulo)).toEqual(["Correo", "WhatsApp", "Copiar el link"]);
    expect(tituloDeLaHojaMandar("2026-08", "Reynaldo Espinosa"))
      .toBe("Mandar la comisión de Ago 2026 a Reynaldo Espinosa");
  });

  it("🔴 y vive en el DETALLE del vendedor", () => {
    expect(leer("src/components/comisiones/ComisionesDetalleModal.tsx")).toContain("data-boton-mandar");
  });
});
