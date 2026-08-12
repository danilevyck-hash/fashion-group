/**
 * Candado: TODO logo que va dentro de un PDF tiene que poder embeberse de
 * verdad con `doc.addImage`.
 *
 * Por qué existe (26-jul-2026): a `FG_LOGO_BASE64` le faltaba un `=` de padding,
 * así que la cadena NO era base64 válida. jsPDF la decodifica con `atob()`, que
 * es estricto, y `addImage` lanzaba — pero TODAS las llamadas están envueltas en
 * `try { … } catch { /* skip *\/ }`, así que el logo de Fashion Group llevaba
 * quién sabe cuánto tiempo sin salir en NINGÚN PDF: ni en el estado de cuenta
 * que se le adjunta al cliente, ni en el resumen de reclamos que se le manda al
 * proveedor, ni en los reportes de CXC. Cero errores en logs, cero señal.
 *
 * El test de `logos-marca.test.ts` valida los PNG de las marcas; este valida que
 * todos (marcas + Fashion Group) SE PUEDEN DIBUJAR, que es lo que importa.
 */
import { describe, it, expect } from "vitest";
import { jsPDF } from "jspdf";
import { FG_LOGO_BASE64, FG_LOGO_WIDTH, FG_LOGO_HEIGHT } from "@/lib/pdf-logo";
import { REEBOK_LOGO_BASE64 } from "@/lib/reebok-logo";
import { TOMMY_LOGO_BASE64, TOMMY_LOGO_BLANCO_BASE64 } from "@/lib/tommy-logo";
import { JOYBEES_LOGO_BASE64, JOYBEES_LOGO_BLANCO_BASE64 } from "@/lib/joybees-logo";
import { CALVIN_LOGO_BASE64, CALVIN_LOGO_BLANCO_BASE64 } from "@/lib/calvin-logo";

const LOGOS: [string, string, "JPEG" | "PNG"][] = [
  ["Fashion Group", FG_LOGO_BASE64, "JPEG"],
  ["Reebok", REEBOK_LOGO_BASE64, "PNG"],
  ["Tommy", TOMMY_LOGO_BASE64, "PNG"],
  ["Tommy blanco", TOMMY_LOGO_BLANCO_BASE64, "PNG"],
  ["Joybees", JOYBEES_LOGO_BASE64, "PNG"],
  ["Joybees blanco", JOYBEES_LOGO_BLANCO_BASE64, "PNG"],
  ["Calvin", CALVIN_LOGO_BASE64, "PNG"],
  ["Calvin blanco", CALVIN_LOGO_BLANCO_BASE64, "PNG"],
];

describe("logos embebibles en PDF", () => {
  it.each(LOGOS)("%s: el payload es base64 válido para atob()", (_n, dataUrl) => {
    const payload = dataUrl.slice(dataUrl.indexOf(",") + 1);
    expect(payload.length % 4, "largo múltiplo de 4 (falta o sobra padding '=')").toBe(0);
    expect(() => atob(payload)).not.toThrow();
  });

  it.each(LOGOS)("%s: doc.addImage NO lanza", (_n, dataUrl, fmt) => {
    const doc = new jsPDF({ unit: "mm", format: "letter" });
    expect(() => doc.addImage(dataUrl, fmt, 10, 10, 20, 20)).not.toThrow();
  });

  it("el logo de Fashion Group es un JPEG completo (SOI + EOI)", () => {
    const bin = atob(FG_LOGO_BASE64.slice(FG_LOGO_BASE64.indexOf(",") + 1));
    const b = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    expect([b[0], b[1]]).toEqual([0xff, 0xd8]); // SOI
    expect([b[b.length - 2], b[b.length - 1]]).toEqual([0xff, 0xd9]); // EOI
    expect(FG_LOGO_WIDTH).toBeGreaterThan(0);
    expect(FG_LOGO_HEIGHT).toBeGreaterThan(0);
  });
});
