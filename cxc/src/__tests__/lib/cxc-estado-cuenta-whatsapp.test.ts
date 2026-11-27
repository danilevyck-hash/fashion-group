import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  ESTADO_CUENTA_WHATSAPP_2026_11,
  enlaceWhatsAppWeb,
  puedeMandarPorWhatsApp,
  rotuloSemana,
  rutaDelPdf,
  textoWhatsApp,
} from "@/lib/cxc/estado-cuenta-whatsapp";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");

describe("estados de cuenta por WhatsApp", () => {
  it("prendido para el lunes 30-nov", () => {
    expect(ESTADO_CUENTA_WHATSAPP_2026_11).toBe(true);
  });

  it("solo admin y secretaria; ni vendedor ni Boston", () => {
    expect(puedeMandarPorWhatsApp("admin")).toBe(true);
    expect(puedeMandarPorWhatsApp("secretaria")).toBe(true);
    expect(puedeMandarPorWhatsApp("vendedor")).toBe(false);
    expect(puedeMandarPorWhatsApp("gerente_boston")).toBe(false);
    expect(puedeMandarPorWhatsApp(null)).toBe(false);
  });

  it("la ruta del bucket es segura", () => {
    expect(rutaDelPdf("2026-11-30", "D-170", "fashion_wear")).toBe("2026-11-30/D-170/fashion_wear.pdf");
    expect(rutaDelPdf("2026-11-30", "D/../x", "vistana")).toBe("2026-11-30/D____x/vistana.pdf");
  });

  it("el texto lleva el cuadro de saldos y el total cuando son varias", () => {
    const t = textoWhatsApp(
      [
        { nombreEmpresa: "Vistana", total: 1234.5 },
        { nombreEmpresa: "Fashion Wear", total: 100 },
      ],
      "30 nov 2026",
    );
    expect(t).toContain("al 30 nov 2026");
    expect(t).toContain("• Vistana: $1,234.50");
    expect(t).toContain("• Fashion Wear: $100.00");
    expect(t).toContain("*Total: $1,334.50*");
    expect(textoWhatsApp([{ nombreEmpresa: "Vistana", total: 5 }], "x")).not.toContain("Total");
    expect(enlaceWhatsAppWeb("a b")).toBe("https://web.whatsapp.com/send?text=a%20b");
  });

  it("«Semana del 30 nov»", () => {
    expect(rotuloSemana("2026-11-30")).toBe("30 nov");
  });

  it("el cron imprime los sin correo DESPUÉS de los con correo y con el mismo candado", () => {
    const src = leer("src/app/api/cron/estado-cuenta-semanal/route.ts");
    expect(src).toContain("[...conCorreo, ...sinCorreo]");
    expect(src).toContain("pdfsDelCliente(c, papeles)");
    expect(src).toContain("BUCKET_ESTADOS_CUENTA");
  });

  it("la ruta exige admin o secretaria", () => {
    const src = leer("src/app/api/cxc/whatsapp/route.ts");
    expect(src).toMatch(/requireRole\(req, roles\(\)\)/);
    expect(src).toContain("ROLES_WHATSAPP");
  });
});
