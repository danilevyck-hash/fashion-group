// ─────────────────────────────────────────────────────────────────────────────
// DOS COSAS QUE SE MIDIERON Y CAMBIARON EL 5-sep-2026.
//
// 1) «ÚLTIMOS PAGOS» POR FECHA, NO POR EMPRESA.
//    Los clientes grandes le pagan a varias empresas EL MISMO DÍA: el
//    29-jun-2026, D-25 pagó $241.857,77 repartido en las SEIS. Por empresa eso
//    eran 6 bloques de 3 pagos = **18 líneas para decir lo que dicen 3**, y
//    ninguna decía cuánto entró ese día.
//
// 2) EL RASTRO DE LO QUE SE MANDÓ.
//    `cxc_emails_enviados` guardaba SOLO el correo: **19 filas en toda su
//    historia, todas entre el 9 y el 14 de julio de 2026**. WhatsApp y «copiar
//    el mensaje» —que es como se cobra de verdad— no dejaban ninguna, así que
//    nadie sabía si a ese cliente ya le habían escrito ayer.
//    🔴 Y las palabras NO son las mismas para los tres: si lo último fue un
//    COPIAR no se puede decir «le enviaste» — copiar no se lo mandó a nadie.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { agruparPagosPorFecha, fechaCortaPago, FECHAS_DE_PAGO } from "@/lib/cxc/pagos-por-fecha";
import {
  CANALES_ENVIO,
  VENTANA_MARCA_DIAS,
  esCanalEnvio,
  textoUltimoEnvio,
  diasDesdeEnvio,
} from "@/lib/cxc/envios-registro";

const HOY = "2026-09-05";
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

describe("🔴 los últimos pagos se agrupan POR FECHA", () => {
  it("son TRES fechas", () => {
    expect(FECHAS_DE_PAGO).toBe(3);
  });

  it("el caso real de D-25: 3 líneas en vez de 18", () => {
    const pagos = [
      { fecha: "2026-08-20", monto: 100000, empresa: "vistana" },
      { fecha: "2026-08-20", monto: 80000, empresa: "fashion_wear" },
      { fecha: "2026-08-20", monto: 30000, empresa: "active_shoes" },
      { fecha: "2026-08-20", monto: 24189.21, empresa: "fashion_shoes" },
      { fecha: "2026-07-29", monto: 50000, empresa: "vistana" },
      { fecha: "2026-07-29", monto: 20129.85, empresa: "fashion_shoes" },
      { fecha: "2026-07-22", monto: 187651.51, empresa: "fashion_wear" },
    ];
    const dias = agruparPagosPorFecha(pagos);
    expect(dias.length).toBe(3);
    expect(dias[0]).toEqual({
      fecha: "2026-08-20",
      monto: 234189.21,
      empresas: ["vistana", "fashion_wear", "active_shoes", "fashion_shoes"],
    });
    expect(dias[1].monto).toBe(70129.85);
    expect(dias[2].monto).toBe(187651.51);
  });

  it("las fechas salen de la más reciente a la más vieja", () => {
    const dias = agruparPagosPorFecha([
      { fecha: "2026-01-01", monto: 1, empresa: "a" },
      { fecha: "2026-03-01", monto: 1, empresa: "a" },
      { fecha: "2026-02-01", monto: 1, empresa: "a" },
    ]);
    expect(dias.map((d) => d.fecha)).toEqual(["2026-03-01", "2026-02-01", "2026-01-01"]);
  });

  it("una empresa no se repite dentro del mismo día", () => {
    const dias = agruparPagosPorFecha([
      { fecha: "2026-06-29", monto: 10, empresa: "vistana" },
      { fecha: "2026-06-29", monto: 20, empresa: "vistana" },
    ]);
    expect(dias[0].empresas).toEqual(["vistana"]);
    expect(dias[0].monto).toBe(30);
  });

  it("se queda con las 3 más recientes aunque haya diez días con pagos", () => {
    const pagos = Array.from({ length: 10 }, (_, i) => ({
      fecha: `2026-0${(i % 9) + 1}-01`, monto: 1, empresa: "a",
    }));
    expect(agruparPagosPorFecha(pagos).length).toBe(3);
  });

  it("descarta filas sin fecha sin romperse", () => {
    expect(agruparPagosPorFecha([{ fecha: "", monto: 5, empresa: "a" }])).toEqual([]);
  });

  it("«20 ago» sin año este año, con año si es de otro", () => {
    expect(fechaCortaPago("2026-08-20", HOY)).toBe("20 ago");
    expect(fechaCortaPago("2025-11-11", HOY)).toBe("11 nov 2025");
  });
});

describe("🔴 se leen SUFICIENTES recibos por empresa para armar las 3 fechas", () => {
  const src = sinComentarios(leer("src/app/api/cxc/ultimos-pagos/route.ts"));

  it("no son 3 por empresa: con 3 recibos del mismo día se taparían las otras fechas", () => {
    expect(src).toContain(".limit(RECIBOS_PARA_FECHAS)");
    expect(src).not.toContain(".limit(PAGOS_POR_EMPRESA)");
    // Medido: el cliente con más recibos del grupo (D-25) tiene 6 pagos en un
    // solo día. Con 3 por empresa, una sola fecha taparía las otras dos. Y
    // sigue muy por debajo del tope de 1.000 que corta EN SILENCIO.
    const cuantos = src.match(/const RECIBOS_PARA_FECHAS = (\d+);/);
    expect(cuantos, "¿se renombró RECIBOS_PARA_FECHAS?").toBeTruthy();
    expect(Number(cuantos![1])).toBeGreaterThanOrEqual(12);
    expect(Number(cuantos![1])).toBeLessThan(1000);
  });

  it("la agrupación por fecha la hace el módulo puro, no la ruta a mano", () => {
    expect(src).toContain("agruparPagosPorFecha");
  });

  it("🔴 sigue filtrando retenciones y recibos en cero", () => {
    expect(src).toContain('.eq("es_retencion", false)');
    expect(src).toContain('.neq("total", 0)');
  });

  it("🔴 y sigue consultando EMPRESA POR EMPRESA — Boston nunca entra", () => {
    expect(src).toContain('.eq("empresa_key", empresa)');
    expect(src).toContain("CXC_GRUPO_EMPRESA_KEYS");
    expect(src).not.toContain("confecciones_boston");
  });
});

describe("🔴 el rastro: correo · whatsapp · copia", () => {
  it("la lista de canales es cerrada", () => {
    expect([...CANALES_ENVIO]).toEqual(["correo", "whatsapp", "copia"]);
    expect(esCanalEnvio("correo")).toBe(true);
    expect(esCanalEnvio("telegrama")).toBe(false);
    expect(esCanalEnvio(null)).toBe(false);
  });

  it("la marca dura 7 días", () => {
    expect(VENTANA_MARCA_DIAS).toBe(7);
    expect(textoUltimoEnvio("correo", 7)).not.toBeNull();
    expect(textoUltimoEnvio("correo", 8)).toBeNull();
  });

  it("🔴 COPIAR no dice «le enviaste» — copiar no se lo mandó a nadie", () => {
    expect(textoUltimoEnvio("copia", 3)).toBe("Copiaste el mensaje hace 3 días");
    expect(textoUltimoEnvio("correo", 3)).toBe("Le enviaste el estado de cuenta hace 3 días");
    expect(textoUltimoEnvio("whatsapp", 3)).toBe("Le enviaste el estado de cuenta hace 3 días");
  });

  it("«hoy» y «ayer» en vez de «hace 0 días»", () => {
    expect(textoUltimoEnvio("correo", 0)).toBe("Le enviaste el estado de cuenta hoy");
    expect(textoUltimoEnvio("copia", 1)).toBe("Copiaste el mensaje ayer");
  });

  it("sin envío no se dibuja nada", () => {
    expect(textoUltimoEnvio(null, 3)).toBeNull();
    expect(textoUltimoEnvio("correo", null)).toBeNull();
  });

  it("cuenta los días con fechas fijas, nunca con el reloj", () => {
    expect(diasDesdeEnvio("2026-09-02", HOY)).toBe(3);
    expect(diasDesdeEnvio(null, HOY)).toBeNull();
  });
});

describe("🔴 el correo lo anota quien sabe si SALIÓ", () => {
  it("la ruta de envíos rechaza `canal: correo` — ése lo anota Resend", () => {
    const src = sinComentarios(leer("src/app/api/cxc/envios/route.ts"));
    expect(src).toMatch(/canal === "correo"[\s\S]{0,200}status: 400/);
  });

  it("el correo se anota en `enviar-email`, DESPUÉS de que Resend confirma", () => {
    const src = sinComentarios(leer("src/app/api/cxc/enviar-email/route.ts"));
    expect(src).toMatch(/canal: "correo"/);
    // El insert va después del `ok = true` del envío.
    expect(src.indexOf("ok = true")).toBeLessThan(src.indexOf('canal: "correo"'));
  });

  it("⚠️ si la columna `canal` todavía no existe, la anotación se guarda igual", () => {
    for (const rel of ["src/app/api/cxc/envios/route.ts", "src/app/api/cxc/enviar-email/route.ts"]) {
      const src = sinComentarios(leer(rel));
      expect(src, rel).toMatch(/canal\b/);
      expect(src, rel).toMatch(/\\b?canal\\b?\/i|faltaColumnaCanal/);
    }
  });

  it("WhatsApp y copiar SÍ dejan rastro desde la pantalla", () => {
    const src = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(src).toMatch(/anotarEnvio\(client, "whatsapp"\)/);
    expect(src).toMatch(/anotarEnvio\(client, "copia"\)/);
  });
});
