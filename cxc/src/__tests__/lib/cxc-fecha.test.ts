import { describe, it, expect } from "vitest";
import {
  parseFechaFlexible,
  parseFechaFromNFiscal,
  parseFechaFromCSVOrNFiscal,
  isLegitFechaNull,
  isLegitFechaVencimientoNull,
} from "@/lib/cxc-fecha";

describe("parseFechaFlexible", () => {
  it("acepta DD-MM-YYYY con padding", () => {
    expect(parseFechaFlexible("21-04-2026")).toBe("2026-04-21");
    expect(parseFechaFlexible("05-12-2025")).toBe("2025-12-05");
  });

  it("acepta DD/MM/YYYY con padding (caso del bug original)", () => {
    expect(parseFechaFlexible("21/04/2026")).toBe("2026-04-21");
    expect(parseFechaFlexible("05/12/2025")).toBe("2025-12-05");
  });

  it("acepta D-M-YYYY sin padding", () => {
    expect(parseFechaFlexible("5-4-2026")).toBe("2026-04-05");
    expect(parseFechaFlexible("21-4-2026")).toBe("2026-04-21");
  });

  it("acepta D/M/YYYY sin padding", () => {
    expect(parseFechaFlexible("5/4/2026")).toBe("2026-04-05");
  });

  it("acepta YYYY-MM-DD (ISO)", () => {
    expect(parseFechaFlexible("2026-04-21")).toBe("2026-04-21");
  });

  it("acepta YYYY/MM/DD", () => {
    expect(parseFechaFlexible("2026/04/21")).toBe("2026-04-21");
  });

  it("tolera espacios sobrantes", () => {
    expect(parseFechaFlexible("  21-04-2026  ")).toBe("2026-04-21");
  });

  it("devuelve null para vacío, null, undefined", () => {
    expect(parseFechaFlexible("")).toBeNull();
    expect(parseFechaFlexible("   ")).toBeNull();
    expect(parseFechaFlexible(null)).toBeNull();
    expect(parseFechaFlexible(undefined)).toBeNull();
  });

  it("devuelve null para basura no-fecha", () => {
    expect(parseFechaFlexible("abc")).toBeNull();
    expect(parseFechaFlexible("21-04")).toBeNull();
    expect(parseFechaFlexible("21-04-26")).toBeNull(); // año 2 dígitos
    expect(parseFechaFlexible("32-04-2026")).toBeNull(); // día inválido
    expect(parseFechaFlexible("21-13-2026")).toBeNull(); // mes inválido
    expect(parseFechaFlexible("29-02-2025")).toBeNull(); // febrero 29 no bisiesto
  });

  it("rechaza año fuera de rango", () => {
    expect(parseFechaFlexible("21-04-1999")).toBeNull();
    expect(parseFechaFlexible("21-04-2099")).toBeNull();
  });

  it("acepta febrero 29 en año bisiesto", () => {
    expect(parseFechaFlexible("29-02-2024")).toBe("2024-02-29");
  });
});

describe("parseFechaFromNFiscal", () => {
  it("decodifica el patrón fiscal completo de Switch", () => {
    expect(
      parseFechaFromNFiscal(
        "FE01200001481660-1-643734-3900012025120200000021360010118087515096",
      ),
    ).toBe("2025-12-02");
  });

  it("decodifica fecha con prefijo FE06 (NC)", () => {
    expect(
      parseFechaFromNFiscal(
        "FE062000040254-103-278837-5400012026042100000008250010119451961666",
      ),
    ).toBe("2026-04-21");
  });

  it("decodifica fecha de mayo 2026 (caso Quality Shoes)", () => {
    expect(
      parseFechaFromNFiscal(
        "FE0120000148166-...-3900012026050500000028720010118087515099",
      ),
    ).toBe("2026-05-05");
  });

  it("devuelve null para n_fiscal vacío", () => {
    expect(parseFechaFromNFiscal("")).toBeNull();
    expect(parseFechaFromNFiscal(null)).toBeNull();
    expect(parseFechaFromNFiscal(undefined)).toBeNull();
  });

  it("devuelve null para prefijo no-fiscal (recibos TFHKC)", () => {
    expect(parseFechaFromNFiscal("TFHKC50002891-00000622")).toBeNull();
  });

  it("ignora subcadenas que no son fechas válidas", () => {
    // "99999999" no es fecha válida (mes 99)
    expect(parseFechaFromNFiscal("X99999999X")).toBeNull();
  });
});

describe("parseFechaFromCSVOrNFiscal pipeline", () => {
  it("toma la fecha del CSV cuando es válida", () => {
    expect(parseFechaFromCSVOrNFiscal("21/04/2026", "FE...20991231...")).toBe("2026-04-21");
  });

  it("falla al n_fiscal cuando CSV está vacío", () => {
    expect(
      parseFechaFromCSVOrNFiscal(
        "",
        "FE062000040254-103-278837-5400012026042100000008250010119451961666",
      ),
    ).toBe("2026-04-21");
  });

  it("falla al n_fiscal cuando CSV es basura", () => {
    expect(
      parseFechaFromCSVOrNFiscal(
        "abc",
        "FE062000040254-103-278837-5400012026042100000008250010119451961666",
      ),
    ).toBe("2026-04-21");
  });

  it("devuelve null si ambos fallan", () => {
    expect(parseFechaFromCSVOrNFiscal("", "TFHKC-00000001")).toBeNull();
    expect(parseFechaFromCSVOrNFiscal(null, null)).toBeNull();
  });
});

describe("isLegitFechaNull", () => {
  it("acepta Saldo Anterior", () => {
    expect(isLegitFechaNull("Saldo Anterior")).toBe(true);
    expect(isLegitFechaNull(" SALDO ANTERIOR ")).toBe(true);
  });

  it("acepta Nota de Crédito (con o sin tilde)", () => {
    expect(isLegitFechaNull("Nota de Crédito")).toBe(true);
    expect(isLegitFechaNull("Nota de Credito")).toBe(true);
  });

  it("rechaza Factura, Recibo y otros", () => {
    expect(isLegitFechaNull("Factura")).toBe(false);
    expect(isLegitFechaNull("Recibo")).toBe(false);
    expect(isLegitFechaNull("Nota de Débito")).toBe(false);
  });
});

describe("isLegitFechaVencimientoNull", () => {
  it("acepta NC, Recibo, Saldo Anterior", () => {
    expect(isLegitFechaVencimientoNull("Nota de Crédito")).toBe(true);
    expect(isLegitFechaVencimientoNull("Recibo")).toBe(true);
    expect(isLegitFechaVencimientoNull("Saldo Anterior")).toBe(true);
  });

  it("rechaza Factura y Nota de Débito", () => {
    expect(isLegitFechaVencimientoNull("Factura")).toBe(false);
    expect(isLegitFechaVencimientoNull("Nota de Débito")).toBe(false);
  });
});
