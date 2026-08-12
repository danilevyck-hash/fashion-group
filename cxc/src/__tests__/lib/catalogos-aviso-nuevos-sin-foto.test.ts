// Candado del aviso "entraron productos NUEVOS sin foto" (30-jul-2026).
//
// El bug que se arregla: el aviso estaba atado al EVENTO de una corrida del
// cron, así que los 60 productos de Reebok que entraron por "Actualizar ahora"
// (`by=manual`, 28-jul 17:23 UTC) no avisaron NUNCA — y ya no podían, porque
// para la corrida siguiente del cron las filas dejaban de ser nuevas.
//
// Se prueba en las DOS direcciones: que lo nuevo suene y que lo viejo NO vuelva
// a sonar.

import { describe, it, expect, vi } from "vitest";
import fs from "fs";
import path from "path";

// Mismo arnés que cron-registro.test.ts: importar cron-telemetry construye el
// client de Supabase al cargar el módulo, y acá no hay env.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: vi.fn() } }));
vi.mock("@/lib/telegram", () => ({
  sendTelegramAlert: vi.fn(),
  shortError: (s: string) => s,
}));
vi.mock("@/lib/alertas/canal", () => ({
  enviarNegocio: vi.fn(async () => true),
  enviarSistema: vi.fn(async () => true),
}));

import {
  planAvisoNuevos,
  ordenarCodigosAZ,
  buildNuevosSinFotoMsg,
  type FilaSinFoto,
} from "@/lib/catalogos/fotos-faltantes";
import { HEARTBEATS_NO_CRON, esHeartbeatNoVigilable } from "@/lib/cron-telemetry";
import { watermarkNuevosSinFoto, WATERMARKS_NUEVOS_SIN_FOTO } from "@/lib/catalogos/fotos-nuevos";

const fila = (sku: string, created: string, extra: Partial<FilaSinFoto> = {}): FilaSinFoto => ({
  sku,
  created_at: created,
  image_url: null,
  active: true,
  ...extra,
});

const AHORA = "2026-07-30T12:00:00.000Z";

describe("planAvisoNuevos — solo lo NUEVO, y una sola vez", () => {
  it("primera vez (sin marca de agua): NO avisa, solo siembra", () => {
    const p = planAvisoNuevos([fila("A1", "2026-07-25T04:51:48Z")], null, AHORA);
    expect(p.sembrar).toBe(true);
    expect(p.codigos).toEqual([]);
    expect(p.watermark).toBe(AHORA);
  });

  it("avisa SOLO de las filas creadas después de la marca de agua", () => {
    const filas = [
      fila("VIEJO1", "2026-07-25T04:51:48Z"),
      fila("VIEJO2", "2026-07-26T10:00:00Z"),
      fila("NUEVO1", "2026-07-29T18:00:00Z"),
      fila("NUEVO2", "2026-07-30T09:00:00Z"),
    ];
    const p = planAvisoNuevos(filas, "2026-07-28T00:00:00Z", AHORA);
    expect(p.sembrar).toBe(false);
    expect(p.codigos).toEqual(["NUEVO1", "NUEVO2"]);
  });

  it("NO REPITE: con la marca de agua avanzada, la segunda pasada no avisa nada", () => {
    const filas = [fila("VIEJO", "2026-07-25T04:51:48Z"), fila("NUEVO", "2026-07-29T18:00:00Z")];
    const primera = planAvisoNuevos(filas, "2026-07-28T00:00:00Z", AHORA);
    expect(primera.codigos).toEqual(["NUEVO"]);
    // Misma tabla, misma pasada de nuevo con la marca de agua que dejó la anterior.
    const segunda = planAvisoNuevos(filas, primera.watermark, "2026-07-30T18:00:00.000Z");
    expect(segunda.codigos).toEqual([]);
  });

  it("los 61 de siempre no vuelven a sonar todos los días", () => {
    const viejos = Array.from({ length: 61 }, (_, i) => fila(`SKU${i}`, "2026-07-20T00:00:00Z"));
    let wm = "2026-07-21T00:00:00Z";
    for (let dia = 22; dia <= 30; dia++) {
      const p = planAvisoNuevos(viejos, wm, `2026-07-${dia}T12:00:00.000Z`);
      expect(p.codigos).toEqual([]);
      wm = p.watermark;
    }
  });

  it("los codigos salen ordenados A-Z", () => {
    const filas = [
      fila("ZZ1", "2026-07-29T10:00:00Z"),
      fila("AA9", "2026-07-29T11:00:00Z"),
      fila("MM5", "2026-07-29T12:00:00Z"),
    ];
    expect(planAvisoNuevos(filas, "2026-07-28T00:00:00Z", AHORA).codigos).toEqual(["AA9", "MM5", "ZZ1"]);
  });

  it("ignora los que YA tienen foto, los ocultos del sync y los ocultos a mano", () => {
    const filas = [
      fila("CONFOTO", "2026-07-29T10:00:00Z", { image_url: "tommy/x.jpg" }),
      fila("VACIA", "2026-07-29T10:00:00Z", { image_url: "   " }), // string en blanco = sin foto
      fila("INACTIVO", "2026-07-29T10:00:00Z", { active: false }),
      fila("OCULTO", "2026-07-29T10:00:00Z", { oculto_manual: true }),
      fila("CUENTA", "2026-07-29T10:00:00Z"),
    ];
    expect(planAvisoNuevos(filas, "2026-07-28T00:00:00Z", AHORA).codigos).toEqual(["CUENTA", "VACIA"]);
  });

  it("una fila sin created_at nunca se anuncia (no se puede fechar)", () => {
    const p = planAvisoNuevos([fila("SINFECHA", null as unknown as string)], "2026-07-28T00:00:00Z", AHORA);
    expect(p.codigos).toEqual([]);
  });

  it("la marca de agua nueva es max(ahora, created_at más nuevo) — no duplica una fila insertada durante la consulta", () => {
    // La fila nació DESPUÉS del `ahora` que se capturó antes de la consulta.
    const durante = fila("CARRERA", "2026-07-30T12:00:05.000Z");
    const primera = planAvisoNuevos([durante], "2026-07-28T00:00:00Z", AHORA);
    expect(primera.codigos).toEqual(["CARRERA"]);
    expect(primera.watermark).toBe("2026-07-30T12:00:05.000Z"); // no AHORA
    // Sin el max(), la pasada siguiente la anunciaría otra vez.
    expect(planAvisoNuevos([durante], primera.watermark, "2026-07-30T18:00:00.000Z").codigos).toEqual([]);
  });

  it("caso real 28-jul: 60 productos que entraron por 'Actualizar ahora' se avisan igual", () => {
    const filas = Array.from({ length: 60 }, (_, i) =>
      fila(`1002${String(i).padStart(5, "0")}`, "2026-07-28T17:27:23.000Z"),
    );
    // Marca de agua puesta por el cron de las 17:00, ANTES del clic manual.
    const p = planAvisoNuevos(filas, "2026-07-28T17:00:30.000Z", "2026-07-28T17:29:00.000Z");
    expect(p.codigos).toHaveLength(60);
    expect(buildNuevosSinFotoMsg("Reebok", p.codigos)).toContain("60 productos nuevos sin foto");
  });
});

describe("ordenarCodigosAZ", () => {
  it("ordena A-Z, colapsa repetidos y descarta vacíos/nulos", () => {
    expect(ordenarCodigosAZ(["b2", "A1", null, "  ", "b2", undefined, "c3"])).toEqual(["A1", "b2", "c3"]);
  });
  it("es case-insensitive en el orden pero conserva el código tal cual", () => {
    expect(ordenarCodigosAZ(["tw1", "TH2", "T3A"])).toEqual(["T3A", "TH2", "tw1"]);
  });
  it("recorta espacios alrededor", () => {
    expect(ordenarCodigosAZ([" ZZ ", "AA "])).toEqual(["AA", "ZZ"]);
  });
});

describe("marcas de agua: no se vigilan como crons", () => {
  it("los 4 nombres están en HEARTBEATS_NO_CRON y coinciden con watermarkNuevosSinFoto()", () => {
    for (const marca of ["reebok", "joybees", "tommy", "calvin"] as const) {
      const nombre = watermarkNuevosSinFoto(marca);
      expect(nombre).toBe(`catalogos-fotos-nuevos:${marca}`);
      expect(HEARTBEATS_NO_CRON as readonly string[]).toContain(nombre);
      // Ni el watchdog Telegram ni health-crons pueden alertar por ellas.
      expect(esHeartbeatNoVigilable(nombre)).toBe(true);
    }
    expect([...WATERMARKS_NUEVOS_SIN_FOTO].sort()).toEqual(
      ["calvin", "reebok", "joybees", "tommy"].map((m) => `catalogos-fotos-nuevos:${m}`).sort(),
    );
  });
});

describe("barrido estático: ningún camino de sync de catálogo se queda mudo", () => {
  const SRC = path.join(process.cwd(), "src");

  function archivosTs(dir: string, out: string[] = []): string[] {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "__tests__") continue;
        archivosTs(p, out);
      } else if (/\.tsx?$/.test(e.name)) out.push(p);
    }
    return out;
  }

  it("todo archivo que dispara un sync de catálogo también llama a avisarNuevosSinFoto", () => {
    // Se excluyen los wrappers que DEFINEN los syncs (ahí vive la función, no
    // el disparo) y el motor compartido.
    const definiciones = [
      "sync-catalogo-reebok.ts",
      "sync-catalogo-joybees.ts",
      "sync-catalogo-tommy.ts",
      "sync-catalogo-calvin.ts",
    ];
    const culpables: string[] = [];
    for (const f of archivosTs(SRC)) {
      if (definiciones.some((d) => f.endsWith(d))) continue;
      const s = fs.readFileSync(f, "utf8");
      const dispara = /syncCatalogo(Reebok|Joybees|Tommy|Calvin)\s*\(/.test(s);
      if (dispara && !s.includes("avisarNuevosSinFoto")) culpables.push(path.relative(SRC, f));
    }
    expect(culpables).toEqual([]);
  });

  it("los 4 crons de catálogo + sync-now + la reconciliación lo llaman", () => {
    const esperados = [
      "app/api/cron/reebok-catalogo/route.ts",
      "app/api/cron/joybees-catalogo/route.ts",
      "app/api/cron/tommy-catalogo/route.ts",
      "app/api/cron/calvin-catalogo/route.ts",
      "app/api/admin/sync-now/route.ts",
      "app/api/cron/switch-reconciliacion/route.ts",
    ];
    for (const rel of esperados) {
      const s = fs.readFileSync(path.join(SRC, rel), "utf8");
      expect(s, `${rel} debe avisar de los nuevos sin foto`).toContain("avisarNuevosSinFoto");
    }
  });

  it("el aviso NO vuelve a depender de nuevosSinFotoTotal (el dato de una sola corrida)", () => {
    for (const rel of [
      "app/api/cron/reebok-catalogo/route.ts",
      "app/api/cron/joybees-catalogo/route.ts",
      "app/api/cron/tommy-catalogo/route.ts",
      "app/api/cron/calvin-catalogo/route.ts",
    ]) {
      const s = fs.readFileSync(path.join(SRC, rel), "utf8");
      expect(s, `${rel} no puede volver al aviso por evento`).not.toContain("nuevosSinFotoTotal");
    }
  });
});
