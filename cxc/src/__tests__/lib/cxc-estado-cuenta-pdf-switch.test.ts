// El PDF de Switch en el correo de los lunes (27-nov-2026): el papel de
// «Imprimir» del panel, a PDF, y el candado contra el saldo de Switch. Daniel:
// «quiero el pdf de Switch, no uno regenerado por ti».
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  DESTINO_PRUEBA,
  elegirIdSwitch,
  leerPapelSwitch,
  nombreDelPdf,
  resumenPdfsHtml,
  veredictoDelPapel,
} from "@/lib/cxc/estado-cuenta-pdf-switch";

/** Un papel con la forma del HTML de «Imprimir» de Switch (datos inventados). */
function papel(codigo: string, total: string, documentos: number): string {
  const fila = (i: number) =>
    `<tr> <td style="text-align:left;" class="rowBody">0${(i % 9) + 1}-05-2026</td> <td style="text-align:left;" class="rowBody">Factura</td> <td class="rowBody">11-00000${i}</td> </tr>`;
  return `<html><body><table>
    <tr> <td align="left"><span class='titleDetail'>C&oacute;digo:</span> ${codigo} </td> </tr>
    <tr> <td align="left"><span class='titleDetail'>L&iacute;mite de cr&eacute;dito:</span> 0.00</td> </tr>
  </table>
  <table><thead><tr><th>Fecha</th></tr></thead><tbody> ${Array.from({ length: documentos }, (_, i) => fila(i)).join(" ")} </tbody></table>
  <table><tr> <td align="left"><span class='titleDetail'>Total General: </span>${total}</td> </tr></table></body></html>`;
}

describe("lo que dice el papel de Switch", () => {
  it("lee el código, el «Total General» y cuántos documentos trae", () => {
    expect(leerPapelSwitch(papel("D-999", "180,150.18", 55))).toEqual({ codigo: "D-999", total: 180150.18, documentos: 55 });
    expect(leerPapelSwitch(papel("D-1", "-12.50", 1)).total).toBe(-12.5);
  });

  it("sin código o sin total legible: null, nunca un cero inventado", () => {
    expect(leerPapelSwitch("<html></html>")).toEqual({ codigo: null, total: null, documentos: 0 });
  });
});

describe("🔴 el candado antes de mandar", () => {
  const bueno = leerPapelSwitch(papel("D-999", "180,150.18", 55));

  it("cuadra al centavo y con los mismos documentos: se manda", () => {
    expect(veredictoDelPapel(bueno, "d-999", { saldo: 180150.18, documentos: 55 })).toEqual({ ok: true, total: 180150.18 });
  });

  it("un centavo de diferencia NO se manda", () => {
    const v = veredictoDelPapel(bueno, "D-999", { saldo: 180150.19, documentos: 55 });
    expect(v.ok).toBe(false);
  });

  it("la historia completa (más documentos que los pendientes) NO se manda", () => {
    expect(veredictoDelPapel(bueno, "D-999", { saldo: 180150.18, documentos: 52 }).ok).toBe(false);
  });

  it("otro cliente, sin total o sin saldo de Switch: NO se manda", () => {
    expect(veredictoDelPapel(bueno, "D-99", { saldo: 180150.18, documentos: 55 }).ok).toBe(false);
    expect(veredictoDelPapel({ ...bueno, total: null }, "D-999", { saldo: 180150.18, documentos: 55 }).ok).toBe(false);
    expect(veredictoDelPapel(bueno, "D-999", { saldo: null, documentos: 55 }).ok).toBe(false);
  });
});

describe("el id y el correo", () => {
  it("el id de Switch: el único presente; dos o ninguno no se adivina", () => {
    expect(elegirIdSwitch([{ cliente_switch_id: 203, ausente_desde: null }, { cliente_switch_id: 204, ausente_desde: "2026-10-23" }])).toBe(203);
    expect(elegirIdSwitch([{ cliente_switch_id: 1, ausente_desde: null }, { cliente_switch_id: 2, ausente_desde: null }])).toBeNull();
    expect(elegirIdSwitch([])).toBeNull();
    expect(elegirIdSwitch([{ cliente_switch_id: 9, ausente_desde: "2026-10-01" }])).toBe(9);
  });

  it("el cuadrito suma los totales de los PDF y el archivo lleva empresa, cliente y fecha", () => {
    const h = resumenPdfsHtml([
      { empresa: "Fashion Wear", total: 180201.54 },
      { empresa: "Vistana", total: 76058.15 },
    ]);
    expect(h).toContain("Fashion Wear");
    expect(h).toContain("256,259.69");
    expect(nombreDelPdf("Vistana", "City Mall: David", "30-11-2026")).toBe("Estado de cuenta Vistana - City Mall- David - 30-11-2026.pdf");
    expect(DESTINO_PRUEBA).toBe("daniel@fashiongr.com");
  });
});

describe("candados del camino", () => {
  const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("el papel se comprueba contra el API DESPUÉS de cerrar la sesión web (el API la cierra)", () => {
    const io = leer("src/lib/cxc/estado-cuenta-pdf-switch-io.ts");
    expect(io.indexOf("await cerrarSesionWeb(sesion)")).toBeLessThan(io.indexOf("api.getEstadoCuenta("));
    expect(io.indexOf("api.getEstadoCuenta(")).toBeLessThan(io.indexOf("veredictoDelPapel("));
    expect(io).not.toMatch(/daniel@|graph\.microsoft/);
  });

  it("el correo no sale si una empresa no cuadró, y la ruta respeta «Pausar Switch»", () => {
    const correo = leer("src/lib/cxc/estado-cuenta-correo-switch.ts");
    expect(correo).toContain("if (!papel.ok) throw");
    expect(correo.indexOf("pdfsDelCliente(c, o.papeles)")).toBeLessThan(correo.lastIndexOf("await mandarPorResend("));
    const ruta = leer("src/app/api/cron/estado-cuenta-semanal/route.ts");
    expect(ruta).toContain('respuestaSiSwitchEnPausa("estado-cuenta-semanal")');
    expect(ruta).not.toMatch(/buildEstadoCuentaPDF|fetchEstadoCuentaData/);
  });
});
