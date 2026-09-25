// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — «MANDAR» LA COMISIÓN AL VENDEDOR (25-sep-2026, la «9r»).
//
// 🩸 QUÉ VINO A ARREGLAR: el papel de un vendedor se BAJABA al teléfono y de
// ahí había que buscarlo en la carpeta de descargas y adjuntarlo a mano.
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. Las tres salidas son las MISMAS del estado de cuenta de Cuentas por
//      Cobrar: Correo · WhatsApp · Copiar el link.
//   2. 🔴 EL PDF ES EL MISMO QUE BAJA «DESCARGAR»: la pantalla lo arma con
//      `construirPdfComision` y de ahí salen sus bytes. No hay un segundo
//      generador, y la ruta no dibuja ni una línea de papel.
//   3. El enlace se firma por **30 días**, el mismo plazo que los ZIP de
//      Marketing, y vive en un cajón PRIVADO.
//   4. 🔴 SIN EL CAJÓN NO SE MANDA UN LINK ROTO: se contesta que no se pudo.
//   5. El correo PIDE la dirección —el sistema no guarda el correo de ningún
//      vendedor— y sale del remitente de siempre.
//   6. Queda rastro en `activity_logs`, DESPUÉS de que salió.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  CAJON_PAPELES,
  CORREO_ENVIADO,
  DIAS_DEL_LINK,
  LINK_COPIADO,
  REMITENTE_COMISIONES,
  SIN_CAJON,
  TTL_LINK_SEGUNDOS,
  asuntoDelCorreo,
  cuerpoDelCorreo,
  mensajeDeWhatsApp,
  pathDelPapel,
} from "@/lib/comisiones/mandar";
import { OPCIONES_MANDAR, ROTULO_MANDAR } from "@/lib/comisiones/celular";
import { ACCION_MANDAR_CORREO, ACCION_MANDAR_LINK, MODULO_ACTIVIDAD_COMISIONES } from "@/lib/comisiones/rastro";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

describe("las tres salidas", () => {
  it("son las MISMAS del estado de cuenta de Cuentas por Cobrar", () => {
    expect(OPCIONES_MANDAR.map((o) => o.clave)).toEqual(["correo", "whatsapp", "link"]);
    expect(OPCIONES_MANDAR.map((o) => o.rotulo)).toEqual(["Correo", "WhatsApp", "Copiar el link"]);
    expect(ROTULO_MANDAR).toBe("Mandar");
  });

  it("🔴 el botón vive en el DETALLE del vendedor, no en la fila de la lista", () => {
    const modal = leer("src/components/comisiones/ComisionesDetalleModal.tsx");
    expect(modal).toContain("data-boton-mandar");
    expect(modal).toContain("<HojaMandarComision");
    // La lista no manda nada al deslizar (la «9s», que Daniel NO eligió).
    expect(leer("src/components/comisiones/ComisionesTarjetas.tsx")).not.toContain("Mandar");
  });
});

describe("🔴 el papel es el MISMO que baja «Descargar»", () => {
  it("lo arma `construirPdfComision`, el generador de siempre", () => {
    const modal = leer("src/components/comisiones/ComisionesDetalleModal.tsx");
    expect(modal).toContain("construirPdfComision([");
    expect(modal).toContain('doc.output("datauristring")');
  });

  it("y la ruta NO dibuja ni una línea de papel", () => {
    // Sin los comentarios: el encabezado del archivo SÍ nombra al generador
    // para decir de dónde viene el papel.
    const ruta = leer("src/app/api/comisiones/mandar/route.ts")
      .split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
    expect(ruta).not.toContain("jsPDF");
    expect(ruta).not.toContain("construirPdfComision");
    expect(ruta).not.toContain("autoTable");
    // Recibe los bytes, nada más.
    expect(ruta).toContain("Buffer.from(pdf, \"base64\")");
  });
});

describe("el enlace", () => {
  it("🔴 dura 30 días, el mismo plazo que los ZIP de Marketing", () => {
    expect(DIAS_DEL_LINK).toBe(30);
    expect(TTL_LINK_SEGUNDOS).toBe(60 * 60 * 24 * 30);
    // El mismo número que Marketing, dicho en el mismo formato.
    expect(leer("src/lib/marketing/zip-e-impulsadoras.ts")).toContain("60 * 60 * 24 * 30");
  });

  it("vive en un cajón PRIVADO, por año, mes y vendedor", () => {
    expect(CAJON_PAPELES).toBe("comisiones-papeles");
    const p = pathDelPapel(2026, 8, "Reynaldo Espinosa", "Fashion Wear", "2026-09-25T14:03:07.000Z");
    expect(p).toBe("2026/08/fashion-wear-reynaldo-espinosa-20260925140307.pdf");
    // Un nombre raro no deja una ruta vacía ni con barras de más.
    expect(pathDelPapel(2026, 1, "///", "!!!", "2026-01-02T00:00:00.000Z"))
      .toBe("2026/01/x-x-20260102000000.pdf");
  });

  it("🔴 SIN EL CAJÓN no se manda un link roto: se dice que no se pudo", () => {
    const ruta = leer("src/app/api/comisiones/mandar/route.ts");
    expect(ruta).toContain('error: "No se pudo guardar el papel para armar el enlace."');
    expect(ruta).toContain('error: "No se pudo armar el enlace."');
    expect(ruta).toContain("status: 503");
    expect(SIN_CAJON).toContain("Manda el papel por correo");
  });

  it("el WhatsApp lleva el enlace y dice cuándo vence", () => {
    const m = mensajeDeWhatsApp("Reynaldo Espinosa", "Agosto 2026", "https://x/y");
    expect(m).toContain("Reynaldo Espinosa");
    expect(m).toContain("Agosto 2026");
    expect(m).toContain("https://x/y");
    expect(m).toContain("vence en 30 días");
  });
});

describe("el correo", () => {
  it("🔴 PIDE la dirección: el sistema no guarda el correo de ningún vendedor", () => {
    const hoja = leer("src/components/comisiones/celular/HojaMandarComision.tsx");
    expect(hoja).toContain("¿A qué correo se lo mando?");
    expect(hoja).toContain('type="email"');
    const ruta = leer("src/app/api/comisiones/mandar/route.ts");
    expect(ruta).toContain('error: "Falta el correo de esa persona."');
  });

  it("sale del remitente de siempre, con el papel ADJUNTO", () => {
    expect(REMITENTE_COMISIONES).toBe("Fashion Group <notificaciones@fashiongr.com>");
    const ruta = leer("src/app/api/comisiones/mandar/route.ts");
    expect(ruta).toContain("https://api.resend.com/emails");
    expect(ruta).toContain("attachments:");
    expect(ruta).toContain("process.env.RESEND_API_KEY");
  });

  it("el asunto y el cuerpo dicen de quién es y de qué mes", () => {
    expect(asuntoDelCorreo("Reynaldo Espinosa", "Agosto 2026"))
      .toBe("Tu comisión de Agosto 2026 — Reynaldo Espinosa");
    const cuerpo = cuerpoDelCorreo("Reynaldo Espinosa", "Agosto 2026");
    expect(cuerpo).toContain("Hola Reynaldo Espinosa,");
    expect(cuerpo).toContain("Agosto 2026");
    expect(CORREO_ENVIADO).toBe("Listo, el correo salió");
    expect(LINK_COPIADO).toContain("30 días");
  });
});

describe("el rastro", () => {
  it("se anota DESPUÉS de que salió, y en el módulo de Comisiones", () => {
    expect(ACCION_MANDAR_CORREO).toBe("mandar_correo");
    expect(ACCION_MANDAR_LINK).toBe("mandar_link");
    expect(MODULO_ACTIVIDAD_COMISIONES).toBe("comisiones");
    const ruta = leer("src/app/api/comisiones/mandar/route.ts");
    const salio = ruta.indexOf("https://api.resend.com/emails");
    const anota = ruta.indexOf("anotarConfigComision(auth, ACCION_MANDAR_CORREO");
    expect(salio).toBeGreaterThan(-1);
    expect(anota).toBeGreaterThan(salio);
  });

  it("y entran los MISMOS tres roles que ven la comisión", () => {
    const ruta = leer("src/app/api/comisiones/mandar/route.ts");
    expect(ruta).toContain('["admin", "contabilidad", "secretaria"]');
  });
});
