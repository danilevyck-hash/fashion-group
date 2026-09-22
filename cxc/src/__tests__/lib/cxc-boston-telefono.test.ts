/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 CONFECCIONES BOSTON CONTESTA EN EL 212-0790 (22-sep-2026)
 *
 * Daniel lo confirmó. Era lo ÚNICO que quedaba en duda del dictado del
 * 20-sep-2026: ese día dio el teléfono «para todas» **antes** de dar la cuenta
 * de Boston, y el código quedó con la nota «pendiente de que Daniel lo
 * confirme». Ya no hay pendiente: las OCHO llevan el mismo número.
 *
 * ─── LO QUE SE MIDIÓ ANTES DE TOCAR NADA (22-sep-2026) ──────────────────────
 * El papel de Boston **NO tenía un hueco de teléfono**: desde el 20-sep-2026 su
 * ficha ya tomaba `TELEFONO_DE_TODAS`, así que el número ya salía en los TRES
 * lugares que lo dibujan —el encabezado del PDF (`TEL: …`), el recuadro «Dónde
 * pagar» de cada hoja y el bloque «Dónde pagar» del correo—. Lo que faltaba era
 * la confirmación y un candado que lo sujete. Por eso este archivo no estrena
 * una línea de pantalla: **congela** que Boston lleve ese número y que lo siga
 * tomando de un solo lugar.
 *
 * ─── LAS CUATRO COSAS QUE ESTE ARCHIVO NO DEJA ROMPER ───────────────────────
 *   1. La ficha de Boston dice `212-0790`, **dígito por dígito**.
 *   2. El número sale en su PDF y en su correo, y de **UN SOLO LUGAR**
 *      (`TELEFONO_DE_TODAS`): Boston no lo declara aparte, así que el día que
 *      cambie no puede quedar corregido en siete empresas y viejo en la octava.
 *   3. **Boston sigue firmando como Boston**: ponerle teléfono no le devolvió
 *      el logo del grupo ni `fashiongr.com` al pie. Es la regla que este cambio
 *      tenía más cerca de romper.
 *   4. **Lo que es de Boston no se cuela en el papel del grupo** —su correo
 *      `ventas@cboston.net`, su nombre legal y su cuenta— ni al revés. El
 *      teléfono es el único dato que las ocho comparten, y se dice acá para que
 *      nadie lo lea como un descuido.
 *
 * ⚠️ Su correo sigue viajando por Resend desde `fashiongr.com`: Boston no tiene
 * dominio propio y Daniel decidió que se queda así. Eso no se toca acá.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import {
  TELEFONO_DE_TODAS,
  comoPagar,
  fichaFiscal,
  lineasDePago,
} from "@/lib/cxc/empresa-fiscal";
import { buildCuentasHtml } from "@/lib/cxc/estado-cuenta-email";
import { casaDeEmpresa, CASA_GRUPO } from "@/lib/cxc/casa-del-papel";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta, EstadoEmpresa } from "@/lib/cxc/estado-cuenta-tipos";

/** 🔴 El número, escrito acá a mano: el candado compara contra lo que Daniel
 *  dictó, nunca contra lo que hoy diga el archivo. */
const TELEFONO_BOSTON = "212-0790";

const BOSTON = "confecciones_boston";
const NOMBRE_BOSTON = "Confecciones Boston";

/** Las SEIS del grupo, escritas: son con las que Boston no se debe mezclar. */
const LAS_SEIS = [
  "fashion_wear",
  "vistana",
  "fashion_shoes",
  "active_shoes",
  "active_wear",
  "joystep",
] as const;

const raiz = process.cwd();
const fuenteFiscal = readFileSync(path.join(raiz, "src/lib/cxc/empresa-fiscal.ts"), "utf8");

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

/** El papel de verdad, por la MISMA función que arma el que se manda. */
function papelDe(empresas: EstadoEmpresa[]): string {
  const data: EstadoCuenta = {
    codigo: "B-100",
    clienteNombre: "Almacenes La Fe",
    cliente: {
      nombre: "Almacenes La Fe",
      identificacion: "",
      telefono: "",
      email: "",
      direccion: "",
      limiteCredito: null,
      tiempoMorosidad: null,
    },
    empresas,
    total: empresas.reduce((s, e) => s + e.subtotal, 0),
    generadoEn: "2026-09-22T12:00:00.000Z",
  };
  return buildEstadoCuentaPDF(data, "ALMACENES LA FE").doc.output();
}

// ═════════════════════════════════════════════════════════════════════════════
// 1 · LA FICHA DE BOSTON DICE EL NÚMERO, DÍGITO POR DÍGITO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 1. el teléfono de Confecciones Boston", () => {
  it("es EXACTAMENTE el que Daniel confirmó", () => {
    expect(fichaFiscal(BOSTON, NOMBRE_BOSTON).telefono).toBe(TELEFONO_BOSTON);
  });

  it("y llega igual al bloque de dónde pagarle", () => {
    const pago = comoPagar(BOSTON, NOMBRE_BOSTON);
    expect(pago).not.toBeNull();
    expect(pago!.telefono).toBe(TELEFONO_BOSTON);
    expect(lineasDePago(pago!)).toContain(`Tel: ${TELEFONO_BOSTON}`);
  });

  it("🔴 y sale de UN SOLO LUGAR: Boston no lo declara aparte", () => {
    expect(TELEFONO_DE_TODAS).toBe(TELEFONO_BOSTON);
    // El número está escrito UNA vez en el CÓDIGO del archivo que lo define: la
    // constante. Una segunda aparición es una copia que algún día quedará vieja.
    // (Los comentarios se quitan: ahí el número se explica, no se usa.)
    const codigo = fuenteFiscal.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect((codigo.match(/212-0790/g) ?? []).length, "el teléfono está escrito más de una vez").toBe(1);
    // Y la fila de Boston en el registro NO trae un `telefono` propio.
    const filaBoston = codigo.slice(
      codigo.indexOf("confecciones_boston: {"),
      codigo.indexOf("american_classic: {"),
    );
    expect(filaBoston).not.toContain("telefono");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2 · SALE EN SU PAPEL Y EN SU CORREO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 2. el cliente de Boston lo ve", () => {
  it("el encabezado del PDF lleva la línea TEL", () => {
    const pdf = papelDe([empresa(BOSTON, NOMBRE_BOSTON)]);
    expect(pdf).toContain(`TEL: ${TELEFONO_BOSTON}`);
  });

  it("y el recuadro «Dónde pagar» de la hoja también", () => {
    const pdf = papelDe([empresa(BOSTON, NOMBRE_BOSTON)]);
    expect(pdf).toContain("Pagos a nombre de");
    expect(pdf).toContain(`Tel: ${TELEFONO_BOSTON}`);
  });

  it("el bloque «Dónde pagar» del correo lo dice UNA vez", () => {
    const html = buildCuentasHtml([{ empresa_key: BOSTON, empresa_nombre: NOMBRE_BOSTON }]);
    expect(html).toContain("Dónde pagar");
    expect((html.match(/212-0790/g) ?? []).length).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3 · PONERLE TELÉFONO NO LE DEVOLVIÓ EL PAPEL DEL GRUPO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 3. Boston sigue firmando como Boston", () => {
  it("su papel sale SIN el logo del grupo y SIN fashiongr.com en el pie", () => {
    const casa = casaDeEmpresa(BOSTON);
    expect(casa.logo).toBeNull();
    expect(casa.pie).not.toContain("fashiongr.com");
    expect(casa.firma).toBe("Confecciones Boston");
    // Y la casa del grupo, que sí los lleva, quedó como estaba.
    expect(CASA_GRUPO.logo).not.toBeNull();
    expect(CASA_GRUPO.pie).toContain("fashiongr.com");
  });

  it("y su cabeza fiscal conserva su propio correo, no el del grupo", () => {
    expect(fichaFiscal(BOSTON, NOMBRE_BOSTON).correo).toBe("ventas@cboston.net");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4 · LO DE BOSTON NO SE CUELA EN EL PAPEL DEL GRUPO, NI AL REVÉS
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 4. el teléfono es lo ÚNICO que comparten", () => {
  it("las seis del grupo contestan en el MISMO número, y se dice a propósito", () => {
    // ⚠️ No es un descuido: Daniel dictó un solo teléfono para todas. Lo que este
    // candado impide es que alguien «arregle» una empresa y deje las otras.
    for (const key of LAS_SEIS) {
      expect(fichaFiscal(key, "X").telefono, key).toBe(TELEFONO_BOSTON);
    }
  });

  it("🔴 pero el papel de una del grupo NO lleva nada más de Boston", () => {
    const pdf = papelDe([empresa("fashion_wear", "Fashion Wear")]);
    const f = fichaFiscal(BOSTON, NOMBRE_BOSTON);
    expect(pdf, "el correo de Boston se coló").not.toContain(f.correo);
    expect(pdf, "la cuenta de Boston se coló").not.toContain(f.cuenta);
    expect(pdf, "el nombre legal de Boston se coló").not.toContain(f.legal);
  });

  it("🔴 y el papel de Boston NO lleva nada del grupo", () => {
    const pdf = papelDe([empresa(BOSTON, NOMBRE_BOSTON)]);
    expect(pdf, "el correo del grupo se coló").not.toContain("info@fashiongr.com");
    for (const key of LAS_SEIS) {
      const f = fichaFiscal(key, "X");
      expect(pdf, `la cuenta de ${key} se coló`).not.toContain(f.cuenta);
      expect(pdf, `el nombre legal de ${key} se coló`).not.toContain(f.legal);
    }
  });

  it("⚠️ CONTROL: una clave desconocida no hereda el teléfono de nadie", () => {
    expect(fichaFiscal("lo_que_sea", "Nombre Corto").telefono).toBe("");
    expect(comoPagar("lo_que_sea", "Nombre Corto")).toBeNull();
  });
});
