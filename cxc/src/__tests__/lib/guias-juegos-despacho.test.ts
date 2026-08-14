// ─────────────────────────────────────────────────────────────────────────────
// RECORDAR PLACA + QUIÉN RECIBE + CÉDULA, POR TRANSPORTISTA.
//
// Daniel, textual: *«Sí quiero»*.
//
// 🔑 EL BENEFICIO GRANDE NO ES EL TECLEO: es que el mismo dato deje de
// guardarse de dos formas. Todos los fixtures de este archivo son valores
// REALES medidos sobre las 186 guías vivas de producción:
//
//   · placas repetidas: DG7115 (11) · EK0700 (11) · 961885 (10) · EL6433 (8)
//   · la MISMA cédula como `810102403` (5) y `8-1010-2403` (4)
//   · `8-918-246` (7) y `8918246` (3) · `172744` (4) y `1-727-44` (4)
//   · el MISMO receptor como `Jocsan murillo` (5) y `Jocsan` (5),
//     `Aníbal arauz` (5) y `Anibal arauz` (2), `Alan` (8) y `alan` (1)
//   · GT-202, ya despachada, con la placa guardada como `Dg7738`
//
// ⚠️ Y LO QUE SE GUARDA ES EL VALOR ORIGINAL, NO EL NORMALIZADO. La
// normalización existe SOLO para no listar tres veces lo mismo; guardar la
// versión normalizada estrenaría una TERCERA forma de escribir el mismo dato.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  claveJuego,
  juegosRecientes,
  normalizarCodigo,
  normalizarNombre,
  JUEGOS_VISIBLES,
  type GuiaDespachadaParaJuego,
} from "@/lib/guias/juegos-despacho";

const leer = (p: string) => readFileSync(join(process.cwd(), p), "utf8");
const sinComentarios = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

function g(over: Partial<GuiaDespachadaParaJuego>): GuiaDespachadaParaJuego {
  return {
    estado: "Completada",
    fecha: "2026-08-01",
    numero: 100,
    deleted: false,
    receptor_nombre: "Alan",
    cedula: "8-918-246",
    placa: "DG7115",
    ...over,
  };
}

describe("🔴 el mismo dato escrito de dos formas es UN solo juego", () => {
  it("la cédula con y sin guiones: `810102403` ≡ `8-1010-2403`", () => {
    expect(normalizarCodigo("8-1010-2403")).toBe(normalizarCodigo("810102403"));
    expect(normalizarCodigo("8-918-246")).toBe(normalizarCodigo("8918246"));
    expect(normalizarCodigo("1-727-44")).toBe(normalizarCodigo("172744"));
  });

  it("la placa con mayúsculas mezcladas: `Dg7738` ≡ `DG7738`", () => {
    expect(normalizarCodigo("Dg7738")).toBe("DG7738");
  });

  it("el nombre con y sin tilde: `Aníbal arauz` ≡ `Anibal arauz`, y `Alan` ≡ `alan`", () => {
    expect(normalizarNombre("Aníbal arauz")).toBe(normalizarNombre("Anibal arauz"));
    expect(normalizarNombre("Alan")).toBe(normalizarNombre("alan"));
    expect(normalizarNombre("  Jocsan   murillo ")).toBe("JOCSAN MURILLO");
  });

  it("🔑 `Jocsan murillo` y `Jocsan` son la MISMA persona: los junta la CÉDULA", () => {
    // Ninguna normalización de mayúsculas/tildes/guiones los junta — son textos
    // distintos. Lo que sí los junta es el documento de identidad.
    const a = { receptor: "Jocsan murillo", cedula: "8-918-246", placa: "DG7115" };
    const b = { receptor: "Jocsan", cedula: "8918246", placa: "dg7115" };
    expect(claveJuego(a)).toBe(claveJuego(b));
  });

  it("⚠️ pero dos personas DISTINTAS en el mismo camión NO se fusionan", () => {
    const a = { receptor: "Jocsan", cedula: "8-918-246", placa: "DG7115" };
    const b = { receptor: "Alan", cedula: "1-727-44", placa: "DG7115" };
    expect(claveJuego(a)).not.toBe(claveJuego(b));
  });

  it("la misma persona con OTRA placa es otro juego (es otro camión)", () => {
    const a = { receptor: "Alan", cedula: "8-918-246", placa: "DG7115" };
    const b = { receptor: "Alan", cedula: "8-918-246", placa: "EK0700" };
    expect(claveJuego(a)).not.toBe(claveJuego(b));
  });
});

describe("🔴 los últimos juegos de ESE transportista", () => {
  it("del más reciente al más viejo, y sin repetir", () => {
    const juegos = juegosRecientes([
      g({ fecha: "2026-07-01", numero: 150, receptor_nombre: "Alan", cedula: "1-727-44", placa: "EL6433" }),
      g({ fecha: "2026-08-11", numero: 196, receptor_nombre: "Jocsan", cedula: "8918246", placa: "DG7115" }),
      g({ fecha: "2026-08-05", numero: 180, receptor_nombre: "Aníbal arauz", cedula: "810102403", placa: "EK0700" }),
      // Repetido del primero, escrito distinto: no puede aparecer dos veces.
      g({ fecha: "2026-06-01", numero: 120, receptor_nombre: "alan", cedula: "172744", placa: "el6433" }),
    ]);
    expect(juegos.map((j) => j.placa)).toEqual(["DG7115", "EK0700", "EL6433"]);
  });

  it("del juego repetido se conserva EL MÁS RECIENTE — es la forma que va a quedar escrita", () => {
    const juegos = juegosRecientes([
      g({ fecha: "2026-06-01", numero: 100, receptor_nombre: "Jocsan murillo", cedula: "8-918-246", placa: "DG7115" }),
      g({ fecha: "2026-08-11", numero: 196, receptor_nombre: "Jocsan", cedula: "8918246", placa: "DG7115" }),
    ]);
    expect(juegos).toHaveLength(1);
    expect(juegos[0]).toEqual({ receptor: "Jocsan", cedula: "8918246", placa: "DG7115" });
  });

  it("dos del mismo día se ordenan por número (es correlativo)", () => {
    const juegos = juegosRecientes([
      g({ fecha: "2026-08-11", numero: 194, placa: "EK0700", cedula: "810102403" }),
      g({ fecha: "2026-08-11", numero: 196, placa: "DG7115", cedula: "8918246" }),
    ]);
    expect(juegos[0].placa).toBe("DG7115");
  });

  it("son 3 como mucho, aunque haya 11 despachos con la misma placa", () => {
    const muchas = Array.from({ length: 11 }, (_, i) =>
      g({ numero: 100 + i, cedula: `8-000-${i}`, placa: "DG7115" }),
    );
    expect(juegosRecientes(muchas)).toHaveLength(JUEGOS_VISIBLES);
    expect(JUEGOS_VISIBLES).toBe(3);
  });
});

describe("⚠️ qué NO entra en la lista", () => {
  it("una guía que todavía no salió: nadie confirmó ese dato", () => {
    expect(juegosRecientes([g({ estado: "Pendiente Bodega" })])).toEqual([]);
    expect(juegosRecientes([g({ estado: "Confirmada" })])).toEqual([]);
  });

  it("una guía borrada", () => {
    expect(juegosRecientes([g({ deleted: true })])).toEqual([]);
  });

  it("un juego INCOMPLETO: el valor de esto es llenar los tres de un toque", () => {
    expect(juegosRecientes([g({ placa: "" })])).toEqual([]);
    expect(juegosRecientes([g({ cedula: null })])).toEqual([]);
    expect(juegosRecientes([g({ receptor_nombre: "   " })])).toEqual([]);
  });

  it("una guía Rechazada SÍ entra: se despachó y alguien firmó", () => {
    expect(juegosRecientes([g({ estado: "Rechazada" })])).toHaveLength(1);
  });

  it("el valor que se ofrece es el ORIGINAL, no el normalizado", () => {
    const juegos = juegosRecientes([g({ receptor_nombre: "Aníbal arauz", cedula: "8-1010-2403", placa: "Dg7738" })]);
    expect(juegos[0]).toEqual({ receptor: "Aníbal arauz", cedula: "8-1010-2403", placa: "Dg7738" });
  });
});

describe("🔴 la ruta acota por transportista y falla ABIERTA", () => {
  const ruta = sinComentarios(leer("src/app/api/guias/despachos-recientes/route.ts"));

  it("solo trae guías de ESE transportista, vivas y ya despachadas", () => {
    expect(ruta).toContain('.eq("transportista_id", transportista)');
    expect(ruta).toContain('.eq("deleted", false)');
    expect(ruta).toContain('.in("estado", ["Completada", "Rechazada"])');
  });

  it("sin transportista devuelve vacío, no un error — es el caso de la entrega directa", () => {
    expect(ruta).toContain("if (!transportista) return NextResponse.json({ juegos: [] })");
  });

  it("un error deja la pantalla como siempre, con los campos en blanco", () => {
    const i = ruta.indexOf("catch");
    expect(i).toBeGreaterThan(0);
    expect(ruta.slice(i)).toContain("juegos: []");
    expect(ruta.slice(i)).not.toContain("status: 500");
  });

  it("exige sesión y rol de guías", () => {
    expect(ruta).toContain("getSession(req)");
    expect(ruta).toContain("GUIAS_ROLES.includes(session.role)");
  });

  it("la regla NO se reescribe en la ruta: sale del módulo puro", () => {
    expect(ruta).toContain("juegosRecientes(");
    expect(ruta).not.toContain("normalizarCodigo");
  });
});

describe("⚠️ en entrega directa esto no aparece", () => {
  it("el bloque solo se dibuja con transportista externo", () => {
    const form = sinComentarios(leer("src/app/guias/components/DespachoForm.tsx"));
    expect(form).toContain("{externo && juegos.length > 0 && onUsarJuego && (");
  });

  it("y el hook ni siquiera lo pide sin transportista", () => {
    const hook = sinComentarios(leer("src/app/guias/components/useDespachoGuia.ts"));
    expect(hook).toContain("if (!transportistaId || despachada) { setJuegos([]); return; }");
  });
});
