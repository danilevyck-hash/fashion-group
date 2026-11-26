// El PDF de Switch en el correo de los lunes (27-nov-2026): cómo se reconoce
// cada correo de Switch y qué dice su PDF. Daniel: «quiero el pdf de Switch, no
// uno regenerado por ti».
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { deflateSync } from "node:zlib";
import {
  BUZON_INTERMEDIO,
  DESTINO_PRUEBA,
  elegirIdSwitch,
  empresaDelAsunto,
  idDelAdjunto,
  inicioDeLaSemanaUtc,
  leerPdfSwitch,
  nombreDelPdf,
  pdfEsDelCliente,
  resumenPdfsHtml,
} from "@/lib/cxc/estado-cuenta-pdf-switch";

const GRUPO = ["vistana", "fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"];

/** Un PDF con la forma del de Switch (dompdf): texto en `[(…)] TJ` dentro de un stream deflate. */
function pdfFalso(paginas: string[][]): Uint8Array {
  const partes: Buffer[] = [Buffer.from("%PDF-1.7\n")];
  for (const textos of paginas) {
    const plano = textos.map((t, i) => `BT 37.0 ${700 - i * 12}.0 Td /F1 9.0 Tf  [(${t})] TJ ET`).join("\n");
    partes.push(Buffer.from("4 0 obj << /Filter /FlateDecode >>\nstream\n"), deflateSync(Buffer.from(plano, "latin1")), Buffer.from("\nendstream\nendobj\n"));
  }
  return new Uint8Array(Buffer.concat(partes));
}

describe("de quién es cada correo de Switch", () => {
  it("la empresa sale del asunto, con el nombre legal EXACTO", () => {
    expect(empresaDelAsunto("FASHION WEAR, INC le ha enviado el estado de cuenta solicitado ", GRUPO)).toBe("fashion_wear");
    expect(empresaDelAsunto("ACTIVE SHOES S.A le ha enviado el estado de cuenta solicitado", GRUPO)).toBe("active_shoes");
    expect(empresaDelAsunto("ACTIVE WEAR S.A le ha enviado el estado de cuenta solicitado", GRUPO)).toBe("active_wear");
    expect(empresaDelAsunto("VISTANA INTERNATIONAL PANAMA, S.A. le ha enviado el estado de cuenta solicitado", GRUPO)).toBe("vistana");
    // Boston no se pidió: no cuenta aunque llegue.
    expect(empresaDelAsunto("CONFECCIONES BOSTON S.A le ha enviado el estado de cuenta solicitado", GRUPO)).toBeNull();
    expect(empresaDelAsunto("RE: FASHION WEAR, INC le ha enviado el estado de cuenta solicitado", GRUPO)).toBeNull();
  });

  it("el cliente sale del adjunto «<id>_<hora>.pdf»", () => {
    expect(idDelAdjunto("13_1126171058.pdf")).toBe(13);
    expect(idDelAdjunto("70_1126171148.PDF")).toBe(70);
    expect(idDelAdjunto("estado.pdf")).toBeNull();
    expect(idDelAdjunto("13_abc.pdf")).toBeNull();
  });

  it("el id de Switch: el único presente; dos o ninguno no se adivina", () => {
    expect(elegirIdSwitch([{ cliente_switch_id: 203, ausente_desde: null }, { cliente_switch_id: 204, ausente_desde: "2026-10-23" }])).toBe(203);
    expect(elegirIdSwitch([{ cliente_switch_id: 1, ausente_desde: null }, { cliente_switch_id: 2, ausente_desde: null }])).toBeNull();
    expect(elegirIdSwitch([])).toBeNull();
    expect(elegirIdSwitch([{ cliente_switch_id: 9, ausente_desde: "2026-10-01" }])).toBe(9);
  });

  it("el buzón intermedio es info@ y la prueba va SOLO a daniel@", () => {
    expect(BUZON_INTERMEDIO).toBe("info@fashiongr.com");
    expect(DESTINO_PRUEBA).toBe("daniel@fashiongr.com");
    expect(inicioDeLaSemanaUtc("2026-11-30")).toBe("2026-11-30T05:00:00Z");
  });
});

describe("lo que dice el PDF", () => {
  it("lee el código y el «Total General», también en la última de varias hojas", () => {
    const pdf = pdfFalso([
      ["FASHION WEAR, INC", "Código:", " D-24", "Email:", " info@fashiongr.com"],
      ["14-09-2026", "1,518.14"],
      ["Total General: ", "180,201.54"],
    ]);
    const l = leerPdfSwitch(pdf);
    expect(l).toEqual({ codigo: "D-24", total: 180201.54 });
    expect(pdfEsDelCliente(l, "d-24")).toBe(true);
    expect(pdfEsDelCliente(l, "D-2")).toBe(false);
    expect(pdfEsDelCliente(l, "D-245")).toBe(false);
  });

  it("sin código o sin total legible: no se da por bueno", () => {
    const l = leerPdfSwitch(pdfFalso([["Nombre:", " X", "Total General: ", "s/d"]]));
    expect(l.codigo).toBeNull();
    expect(l.total).toBeNull();
    expect(pdfEsDelCliente(l, "D-24")).toBe(false);
    expect(leerPdfSwitch(new Uint8Array([1, 2, 3]))).toEqual({ codigo: null, total: null });
  });

  it("paréntesis escapados dentro del texto", () => {
    const l = leerPdfSwitch(pdfFalso([["Código:", " D-9 \\(viejo\\)", "Total General: ", "10.00"]]));
    expect(l.codigo).toBe("D-9 (viejo)");
  });
});

describe("el correo", () => {
  it("el cuadrito suma los totales de los PDF y el archivo lleva empresa, cliente y fecha", () => {
    const h = resumenPdfsHtml([
      { empresa: "Fashion Wear", total: 180201.54 },
      { empresa: "Vistana", total: 76058.15 },
    ]);
    expect(h).toContain("Fashion Wear");
    expect(h).toContain("256,259.69");
    expect(nombreDelPdf("Vistana", "City Mall: David", "30-11-2026")).toBe("Estado de cuenta Vistana - City Mall- David - 30-11-2026.pdf");
  });
});

describe("candados del camino", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("el paso 2 no toca Switch y verifica el código ANTES de mandar", () => {
    const ruta = leer("src/app/api/cron/estado-cuenta-semanal/route.ts");
    expect(ruta).not.toMatch(/switch-api\/web-client/);
    expect(ruta).not.toMatch(/buildEstadoCuentaPDF|fetchEstadoCuentaData|asegurarPdfs|pedirASwitch/);
    expect(ruta).toContain("mandarCorreoDelCliente(");
    const correo = leer("src/lib/cxc/estado-cuenta-correo-switch.ts");
    const verifica = correo.slice(correo.indexOf("async function pdfsDelCliente"));
    expect(verifica.indexOf("pdfEsDelCliente(")).toBeGreaterThan(-1);
    expect(correo.indexOf("await pdfsDelCliente(")).toBeGreaterThan(-1);
    expect(correo.indexOf("await pdfsDelCliente(")).toBeLessThan(correo.lastIndexOf("await mandarPorResend("));
    // Se archiva el correo de Switch SOLO después de que Resend aceptó.
    expect(correo.indexOf("if (!envio.ok) throw")).toBeLessThan(correo.indexOf("await archivarCorreoSwitch("));
  });

  it("el buzón no se llena: carpeta propia y a los 30 días a Elementos eliminados, nunca un DELETE", () => {
    const io = leer("src/lib/cxc/estado-cuenta-pdf-switch-io.ts");
    expect(io).toContain('CARPETA_SWITCH = "Estados de cuenta Switch"');
    expect(io).toContain("DIAS_EN_CARPETA = 30");
    expect(io).toContain('destinationId: "deleteditems"');
    expect(io).not.toMatch(/method:\s*"DELETE"/);
  });

  it("el paso 1 respeta «Pausar Switch» y nunca pide a Switch con destino daniel@", () => {
    const ruta = leer("src/app/api/cron/estado-cuenta-switch/route.ts");
    expect(ruta).toContain('respuestaSiSwitchEnPausa("estado-cuenta-switch")');
    const io = leer("src/lib/cxc/estado-cuenta-pdf-switch-io.ts");
    expect(io).toContain("enviarEstadoCuentaPendiente(sesion, id, BUZON_INTERMEDIO)");
    expect(io).not.toMatch(/daniel@/);
  });
});
