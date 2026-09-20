/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 EL ESTADO DE CUENTA DICE DÓNDE SE PAGA (20-sep-2026)
 *
 * 🩸 CÓMO ESTABA. El papel le decía al cliente cuánto debe y **ningún lugar
 * donde pagarlo**: los teléfonos de las ocho fichas estaban en `""`, no había un
 * solo número de cuenta en el sistema y el correo cerraba con «Favor confirmar
 * su programación de pagos» — que es pedirle que confirme un pago sin decirle a
 * dónde lo manda.
 *
 * 🔴 CADA EMPRESA COBRA EN SU PROPIA CUENTA, y lo eligió Daniel: la hoja de
 * Fashion Wear lleva la cuenta de Fashion Wear y la de Confecciones Boston la de
 * Boston. No hay una cuenta del grupo. Por eso la cuenta se pregunta por
 * `empresa_key` —el mismo dato del que ya salen el logo, la firma y la cabeza
 * fiscal— y no se elige en cada llamada.
 *
 * 🔴 Y UNA CUENTA MAL COPIADA MANDA LA PLATA DE UN CLIENTE A OTRO LADO. Por eso
 * este candado compara los ocho números **dígito por dígito** contra lo que
 * Daniel dictó, y no contra lo que hoy diga el archivo.
 *
 * ⚠️ PENDIENTE DE DANIEL: el teléfono `212-0790` lo dictó para «todas», pero lo
 * dijo **antes** de dar la cuenta de Confecciones Boston. Que Boston conteste en
 * ese mismo número está por confirmarse.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  BANCO_DE_TODAS,
  TELEFONO_DE_TODAS,
  TIPO_DE_CUENTA,
  comoPagar,
  fichaFiscal,
  lineasDePago,
} from "@/lib/cxc/empresa-fiscal";
import { buildCuentasHtml, composeEmailHtml } from "@/lib/cxc/estado-cuenta-email";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta, EstadoEmpresa } from "@/lib/cxc/estado-cuenta-tipos";

const raiz = process.cwd();
const fuentePdf = readFileSync(path.join(raiz, "src/lib/pdf-estado-cuenta.ts"), "utf8");

/**
 * 🔴 LO QUE DANIEL DICTÓ, VERBATIM (20-sep-2026). Todas en Banco General, todas
 * cuenta corriente, teléfono 212-0790.
 */
const DICTADO: Array<[string, string]> = [
  ["fashion_wear", "03-02-01-094730-4"],
  ["fashion_shoes", "03-02-01-103566-3"],
  ["vistana", "03-02-01-119821-6"],
  ["joystep", "04-02-00-001055-7"],
  ["active_wear", "04-02-97-548356-3"],
  ["active_shoes", "04-02-97-602364-7"],
  ["american_classic", "03-02-01-114161-3"],
  ["confecciones_boston", "03-02-01-110198-4"],
];

const BOSTON = "confecciones_boston";
const CUENTA_BOSTON = "03-02-01-110198-4";
const CUENTA_FASHION_WEAR = "03-02-01-094730-4";

function empresa(key: string, nombre: string): EstadoEmpresa {
  return {
    empresa_key: key,
    empresa_nombre: nombre,
    documentos: [
      {
        numero: "01-001000",
        fecha: "2026-08-10",
        tipo: "Factura",
        monto: 1200,
        saldo: 1200,
        dias: 40,
        debito: 1200,
        credito: 0,
        plazoCredito: 60,
        numeroFiscal: null,
      },
    ],
    subtotal: 1200,
    saldoSwitch: null,
  };
}

function papelDe(empresas: EstadoEmpresa[]): string {
  const data: EstadoCuenta = {
    codigo: "D-25",
    clienteNombre: "City Mall Paso Canoa",
    cliente: {
      nombre: "City Mall Paso Canoa",
      identificacion: "",
      telefono: "",
      email: "",
      direccion: "",
      limiteCredito: null,
      tiempoMorosidad: null,
    },
    empresas,
    total: empresas.reduce((s, e) => s + e.subtotal, 0),
    generadoEn: "2026-09-20T12:00:00.000Z",
  };
  // El PDF de verdad, armado por la MISMA función que manda el correo. El texto
  // viaja legible adentro: se puede buscar el número de cuenta tal cual.
  return buildEstadoCuentaPDF(data, "CITY MALL PASO CANOA").doc.output();
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LAS OCHO TIENEN CUENTA Y TELÉFONO, Y SON LAS QUE DANIEL DICTÓ
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. las ocho empresas tienen dónde cobrar", () => {
  it("ninguna se quedó sin cuenta ni sin teléfono", () => {
    for (const [key] of DICTADO) {
      const f = fichaFiscal(key, "NO DEBERÍA VERSE");
      expect(f.cuenta, `${key} se quedó sin cuenta`).not.toBe("");
      expect(f.telefono, `${key} se quedó sin teléfono`).not.toBe("");
    }
  });

  it("🔴 y la cuenta es EXACTAMENTE la dictada, dígito por dígito", () => {
    for (const [key, cuenta] of DICTADO) {
      expect(fichaFiscal(key, "X").cuenta, key).toBe(cuenta);
    }
  });

  it("el banco, el tipo de cuenta y el teléfono son los mismos en las ocho", () => {
    expect(BANCO_DE_TODAS).toBe("Banco General");
    expect(TIPO_DE_CUENTA).toBe("Cuenta corriente");
    expect(TELEFONO_DE_TODAS).toBe("212-0790");
    for (const [key] of DICTADO) {
      const f = fichaFiscal(key, "X");
      expect(f.banco, key).toBe("Banco General");
      expect(f.tipoCuenta, key).toBe("Cuenta corriente");
      expect(f.telefono, key).toBe("212-0790");
    }
  });

  it("🔴 ninguna empresa lleva la cuenta de otra", () => {
    const cuentas = DICTADO.map(([, c]) => c);
    expect(new Set(cuentas).size, "dos empresas comparten cuenta").toBe(DICTADO.length);
    for (const [key, cuenta] of DICTADO) {
      for (const [otra, otraCuenta] of DICTADO) {
        if (otra === key) continue;
        expect(fichaFiscal(key, "X").cuenta, `${key} tomó la cuenta de ${otra}`).not.toBe(otraCuenta);
        expect(cuenta, `${key} y ${otra} escriben lo mismo`).not.toBe(otraCuenta);
      }
    }
  });

  it("⚠️ CONTROL: una clave desconocida no hereda la cuenta de nadie", () => {
    expect(comoPagar("lo_que_sea", "Nombre Corto")).toBeNull();
    expect(fichaFiscal("lo_que_sea", "Nombre Corto").cuenta).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · LAS TRES LÍNEAS, LAS MISMAS EN EL PAPEL Y EN EL CORREO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. las tres líneas salen de un solo lugar", () => {
  it("dicen a nombre de quién, el banco con la cuenta y el teléfono", () => {
    const pago = comoPagar("fashion_wear", "Fashion Wear")!;
    expect(lineasDePago(pago)).toEqual([
      "Pagos a nombre de: FASHION WEAR, INC",
      "Banco General · Cuenta corriente · 03-02-01-094730-4",
      "Tel: 212-0790",
    ]);
  });

  it("sin teléfono no se dibuja una línea en blanco", () => {
    const pago = { ...comoPagar("fashion_wear", "Fashion Wear")!, telefono: "" };
    const lineas = lineasDePago(pago);
    expect(lineas).toHaveLength(2);
    for (const l of lineas) expect(l.trim()).not.toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · EL PAPEL — LA CUENTA DE LA EMPRESA DE ESA HOJA, ANTES DEL «RECIBIDO»
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3. el papel del cliente dice dónde pagar", () => {
  it("la hoja de Fashion Wear lleva la cuenta de Fashion Wear", () => {
    const pdf = papelDe([empresa("fashion_wear", "Fashion Wear")]);
    expect(pdf).toContain("Pagos a nombre de");
    expect(pdf).toContain(CUENTA_FASHION_WEAR);
    expect(pdf).toContain("Banco General");
    expect(pdf).toContain("212-0790");
  });

  it("🔴 y NO lleva la de ninguna otra empresa", () => {
    const pdf = papelDe([empresa("fashion_wear", "Fashion Wear")]);
    for (const [key, cuenta] of DICTADO) {
      if (key === "fashion_wear") continue;
      expect(pdf, `la hoja de Fashion Wear salió con la cuenta de ${key}`).not.toContain(cuenta);
    }
  });

  it("🔴 va ANTES del «RECIBIDO CONFORME», que no se movió", () => {
    const pdf = papelDe([empresa("fashion_wear", "Fashion Wear")]);
    expect(pdf).toContain("RECIBIDO CONFORME");
    expect(pdf.indexOf("Pagos a nombre de")).toBeLessThan(pdf.indexOf("RECIBIDO CONFORME"));
    // Y en el código: el bloque se dibuja entre el pie y la firma.
    expect(fuentePdf.indexOf("dibujarComoPagar(doc")).toBeLessThan(
      fuentePdf.indexOf("dibujarRecibidoConforme(doc"),
    );
  });

  it("cada hoja lleva la suya cuando el papel trae varias empresas", () => {
    const pdf = papelDe([
      empresa("fashion_wear", "Fashion Wear"),
      empresa("vistana", "Vistana International"),
    ]);
    expect(pdf).toContain(CUENTA_FASHION_WEAR);
    expect(pdf).toContain("03-02-01-119821-6");
  });

  it("⚠️ CONTROL: una empresa sin ficha deja la hoja como estaba (falla ABIERTA)", () => {
    const pdf = papelDe([empresa("empresa_nueva", "Empresa Nueva")]);
    expect(pdf).toContain("RECIBIDO CONFORME");
    expect(pdf).not.toContain("Pagos a nombre de");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · EL CORREO — TODAS LAS EMPRESAS QUE VAN EN ESE PAPEL
//
// 🔴 El envío manda SIEMPRE las 6 del grupo, con un PDF por empresa. Una sola
// cuenta en el cuerpo le diría al cliente que pague seis saldos en el banco de
// una.
// ═════════════════════════════════════════════════════════════════════════════

const SEIS = [
  ["vistana", "Vistana International"],
  ["fashion_wear", "Fashion Wear"],
  ["fashion_shoes", "Fashion Shoes"],
  ["active_shoes", "Active Shoes"],
  ["active_wear", "Active Wear"],
  ["joystep", "Joystep"],
].map(([empresa_key, empresa_nombre]) => ({ empresa_key, empresa_nombre }));

describe("🔴 4. el correo lleva las cuentas de todas sus empresas", () => {
  it("con las seis del grupo salen las SEIS cuentas", () => {
    const html = buildCuentasHtml(SEIS);
    for (const { empresa_key } of SEIS) {
      const cuenta = DICTADO.find(([k]) => k === empresa_key)![1];
      expect(html, `falta la cuenta de ${empresa_key}`).toContain(cuenta);
    }
    expect(html).toContain("Dónde pagar");
  });

  it("una empresa repetida no sale dos veces", () => {
    const html = buildCuentasHtml([...SEIS, SEIS[0]]);
    const veces = (html.match(new RegExp("03-02-01-119821-6", "g")) ?? []).length;
    expect(veces).toBe(1);
  });

  it("🔴 y el cierre de siempre no se tocó", () => {
    const html = composeEmailHtml({
      cuerpo: "Favor confirmar su programación de pagos.",
      resumenHtml: "<p>resumen</p>",
      firma: "Angela",
      cuentasHtml: buildCuentasHtml(SEIS),
    });
    expect(html).toContain("Favor confirmar su programación de pagos.");
    expect(html).toContain(CUENTA_FASHION_WEAR);
    // Los datos van DEBAJO de ese cierre, nunca antes.
    expect(html.indexOf("Favor confirmar")).toBeLessThan(html.indexOf("Dónde pagar"));
  });

  it("el teléfono se dice UNA vez cuando es el mismo en todas", () => {
    const html = buildCuentasHtml(SEIS);
    expect((html.match(/212-0790/g) ?? []).length).toBe(1);
  });

  it("⚠️ CONTROL: sin ninguna empresa con cuenta, el bloque no existe", () => {
    expect(buildCuentasHtml([{ empresa_key: "empresa_nueva", empresa_nombre: "Empresa Nueva" }])).toBe("");
    expect(buildCuentasHtml([])).toBe("");
    // Y el correo sale como antes si nadie le pasa el bloque.
    const html = composeEmailHtml({ cuerpo: "hola", resumenHtml: "<p>r</p>", firma: "A" });
    expect(html).not.toContain("Dónde pagar");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5 · 🔴 CONFECCIONES BOSTON COBRA EN LA SUYA
//
// Su papel y su correo son aparte y firman como Boston. La cuenta sigue esa
// misma regla: el cliente de Boston le compró a Boston y le paga a Boston.
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 5. Boston cobra en su propia cuenta", () => {
  it("su papel lleva SU cuenta", () => {
    const pdf = papelDe([empresa(BOSTON, "Confecciones Boston")]);
    expect(pdf).toContain(CUENTA_BOSTON);
    expect(pdf).toContain("Pagos a nombre de");
  });

  it("🔴 y NINGUNA cuenta del grupo se le cuela", () => {
    const pdf = papelDe([empresa(BOSTON, "Confecciones Boston")]);
    for (const [key, cuenta] of DICTADO) {
      if (key === BOSTON) continue;
      expect(pdf, `el papel de Boston salió con la cuenta de ${key}`).not.toContain(cuenta);
    }
  });

  it("su correo lleva su cuenta y solo la suya", () => {
    const html = buildCuentasHtml([{ empresa_key: BOSTON, empresa_nombre: "Confecciones Boston" }]);
    expect(html).toContain(CUENTA_BOSTON);
    expect(html).toContain("CONFECCIONES BOSTON S.A");
    for (const [key, cuenta] of DICTADO) {
      if (key === BOSTON) continue;
      expect(html, `el correo de Boston salió con la cuenta de ${key}`).not.toContain(cuenta);
    }
  });

  it("⚠️ CONTROL: el correo del grupo tampoco lleva la de Boston", () => {
    const html = buildCuentasHtml(SEIS);
    expect(html).not.toContain(CUENTA_BOSTON);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6 · LAS TRES PUERTAS QUE MANDAN CORREO LO PASAN
//
// 🔴 Un armador que acepta el bloque y una ruta que no se lo pasa es un correo
// sin dónde pagar que nadie nota: el HTML sale bien formado igual.
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 6. las rutas de correo pasan el bloque", () => {
  const rutas = [
    "src/app/api/cxc/enviar-email/route.ts",
    "src/app/api/cxc/cobrar-lote/route.ts",
    "src/app/api/cxc/boston/enviar-email/route.ts",
  ];

  it("las tres arman las cuentas y se las pasan al correo", () => {
    for (const r of rutas) {
      const src = readFileSync(path.join(raiz, r), "utf8");
      expect(src, `${r} no arma el bloque`).toContain("buildCuentasHtml");
      expect(src, `${r} no se lo pasa al correo`).toContain("cuentasHtml");
    }
  });

  it("🔴 y el preview del modal muestra el MISMO bloque que sale", () => {
    const modal = readFileSync(path.join(raiz, "src/app/cxc/components/EnviarEmailModal.tsx"), "utf8");
    expect(modal).toContain("cuentasHtml: preview.cuentasHtml");
  });
});
