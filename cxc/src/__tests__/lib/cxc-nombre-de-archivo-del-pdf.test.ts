// ─────────────────────────────────────────────────────────────────────────────
// EL PDF DEL ESTADO DE CUENTA SE LLAMA COMO EL CLIENTE, NO COMO SU CÓDIGO
// INTERNO (7-oct-2026).
//
// 🩸 CÓMO ESTABA. El botón «Descargar PDF» de la hoja «Enviar estado de
// cuenta» bajaba un archivo llamado `Estado-cuenta-D-98-2026-10-07.pdf`. «D-98»
// es el código Switch del cliente: no significa nada para quien lo recibe (ni
// para Daniel, que lo vio en su propia pantalla y no supo de quién era).
//
// 🔴 AHORA el nombre lleva el nombre del cliente y la fecha legible, en el
// mismo formato en los tres caminos que arman el archivo: la descarga/
// compartir de a uno, el lote de varios clientes y los adjuntos del correo.
// Y se sanea para no romper la descarga ni en Mac ni en Windows: fuera
// `/ \ : * ? " < > |`, sin quedar en un punto o espacio final, con un tope de
// largo. Los acentos del nombre se quedan — no son lo que rompe nada.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { sanitizeFilenamePart, nombreArchivoEstadoCuenta } from "@/lib/cxc/estado-cuenta-email";
import { buildEstadoCuentaPDF, buildEstadoCuentaLotePDF } from "@/lib/pdf-estado-cuenta";
import type { EstadoCuenta } from "@/lib/cxc/estado-cuenta-tipos";

function estadoDe(codigo: string, clienteNombre: string): EstadoCuenta {
  return {
    codigo,
    clienteNombre,
    cliente: {
      nombre: clienteNombre, identificacion: "", telefono: "", email: "",
      direccion: "", limiteCredito: null, tiempoMorosidad: null,
    },
    total: 100,
    generadoEn: "2026-10-07T12:00:00.000Z",
    empresas: [{
      empresa_key: "vistana", empresa_nombre: "Vistana International", subtotal: 100, saldoSwitch: null,
      documentos: [{
        numero: "F-1", fecha: "2026-09-01", tipo: "Factura", monto: 100, saldo: 100,
        debito: 100, credito: 0, dias: 36, plazoCredito: 90, numeroFiscal: null,
      }],
    }],
  } as unknown as EstadoCuenta;
}

describe("🔴 sanitizeFilenamePart: limpia sin volverse ilegible", () => {
  it("cambia / \\ : * ? \" < > | por un guion, pero deja los acentos", () => {
    expect(sanitizeFilenamePart('Lutylui / "City" : Mall \\ A*B?C<D>E|F')).toBe('Lutylui - -City- - Mall - A-B-C-D-E-F');
    expect(sanitizeFilenamePart("Peña Niño Muñoz")).toBe("Peña Niño Muñoz");
  });

  it("colapsa espacios y recorta los de las puntas", () => {
    expect(sanitizeFilenamePart("  Lutylui    S.A.  ")).toBe("Lutylui S.A");
  });

  it("no deja el nombre terminando en punto ni espacio (Windows lo rechaza)", () => {
    expect(sanitizeFilenamePart("Cliente...")).toBe("Cliente");
  });

  it("recorta un nombre muy largo sin reventar", () => {
    const largo = "Inversiones y Distribuidora ".repeat(10);
    const limpio = sanitizeFilenamePart(largo);
    expect(limpio.length).toBeLessThanOrEqual(120);
  });
});

describe("🔴 nombreArchivoEstadoCuenta: cliente + fecha legible, nunca el código", () => {
  it("arma «Estado de cuenta - <cliente> - <fecha>»", () => {
    expect(nombreArchivoEstadoCuenta("Lutylui", "2026-10-07")).toBe("Estado de cuenta - Lutylui - 7 oct 2026");
  });

  it("nunca lleva el código interno (D-98) en el nombre", () => {
    const nombre = nombreArchivoEstadoCuenta("Lutylui", "2026-10-07");
    expect(nombre).not.toMatch(/D-\d+/);
  });
});

describe("🔴 el PDF de a uno (botón «Descargar PDF») se llama por el cliente", () => {
  it("buildEstadoCuentaPDF: el nombre del archivo es el del cliente, no «D-98»", () => {
    const { filename } = buildEstadoCuentaPDF(estadoDe("D-98", "Lutylui"), "Lutylui");
    expect(filename).not.toContain("D-98");
    expect(filename).toMatch(/^Estado de cuenta - Lutylui - \d+ \w+ \d{4}\.pdf$/);
  });

  it("un nombre con «/» o comillas no rompe el archivo: sale saneado", () => {
    const { filename } = buildEstadoCuentaPDF(estadoDe("D-7", 'City Mall "Paso Canoas" / Frontera'), 'City Mall "Paso Canoas" / Frontera');
    expect(filename).not.toMatch(/[\\/:*?"<>|]/);
  });
});

describe("🔴 el PDF del lote sigue el mismo formato", () => {
  it("un solo cliente: su nombre, no su código", () => {
    const { filename } = buildEstadoCuentaLotePDF([{ data: estadoDe("D-25", "Lutylui"), nombre: "Lutylui" }]);
    expect(filename).not.toContain("D-25");
    expect(filename).toMatch(/^Estado de cuenta - Lutylui - \d+ \w+ \d{4}\.pdf$/);
  });

  it("varios clientes: cuenta cuántos, sin código y sin reventar el nombre", () => {
    const { filename } = buildEstadoCuentaLotePDF([
      { data: estadoDe("D-25", "Lutylui"), nombre: "Lutylui" },
      { data: estadoDe("D-30", "Otro Cliente"), nombre: "Otro Cliente" },
    ]);
    expect(filename).toMatch(/^Estado de cuenta - 2 clientes - \d+ \w+ \d{4}\.pdf$/);
  });
});
