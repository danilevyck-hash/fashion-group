// ─────────────────────────────────────────────────────────────────────────────
// LA MEMORIA DE LA GUÍA: LOS JUEGOS MÁS FRECUENTES DE ESTE TRANSPORTISTA.
//
// Daniel: *«Si quiero»*, y después precisando: *«normalmente mandamos con las
// mismas 3/4 compañías. Y los que varían a veces son los choferes. Que tenga
// memoria guía para mostrar los más frecuentes.»*
//
// 🔑 TODOS LOS FIXTURES SON VALORES REALES, medidos contra producción el
// 14-ago-2026 sobre las 185 guías despachadas
// (`scripts/_diag-guias-juegos-frecuencia.ts`, solo lectura):
//
//   RedNblue (47 guías): un juego escrito de **4 formas** —
//     `Jocsan murillo · 8918246 · DG7115` + `Jocsan murillo · 8-918-246 ·
//     DG7115` + `Jocsan · 8-918-246 · DG7115` + `Jocnsa · 8918246 · Dg7115`
//   Boston (30): `Eric · 8-930 · Ek0700` **10 veces** + `Erick · 8-930 ·
//     Ek0700` 1 vez
//   Transporte Sol (12): `Nicolás guillen · 172744 · 961885` ×3 +
//     `… · 1-727-44 · 961885` ×3 + `Nicolas · 172744 · 961885` ×1 = **7 de 12**
//   Sanjur (12): `Elaeric Sanjur` / `Adrián sanjur` / `Adrian sanjur` /
//     `Elaeric sanjur`, los cuatro con cédula `9-764-2287`
//
// 🔴 ORDENAR POR FRECUENCIA DA UN RESULTADO DISTINTO QUE POR FECHA **en los 6
// transportistas medidos**. En Boston el juego de 10 usos no es el de la guía
// más reciente. Ése es el cambio, y por eso hay tests en las dos direcciones.
//
// ⚠️ Y LO QUE SE GUARDA ES EL VALOR ORIGINAL, NO EL NORMALIZADO: guardar el
// normalizado estrenaría una forma MÁS de escribir el mismo dato.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  claveJuego,
  juegosMasFrecuentes,
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
    fecha: "2026-07-01",
    numero: 100,
    deleted: false,
    receptor_nombre: "Eric",
    cedula: "8-930",
    placa: "Ek0700",
    ...over,
  };
}

describe("🔴 el mismo dato escrito de dos formas es UN solo juego", () => {
  it("la cédula con y sin guiones: `810102403` ≡ `8-1010-2403`", () => {
    expect(normalizarCodigo("8-1010-2403")).toBe(normalizarCodigo("810102403"));
    expect(normalizarCodigo("8-918-246")).toBe(normalizarCodigo("8918246"));
    expect(normalizarCodigo("1-727-44")).toBe(normalizarCodigo("172744"));
    // Y el caso con espacios de más que también está en producción.
    expect(normalizarCodigo("8918 2 46")).toBe("8918246");
  });

  it("la placa con mayúsculas mezcladas: `Dg7115` ≡ `DG7115`", () => {
    expect(normalizarCodigo("Dg7115")).toBe("DG7115");
    expect(normalizarCodigo("El6433")).toBe("EL6433");
    expect(normalizarCodigo("Ek7003")).toBe("EK7003");
  });

  it("el nombre con y sin tilde: `Aníbal arauz` ≡ `Anibal arauz`", () => {
    expect(normalizarNombre("Aníbal arauz")).toBe(normalizarNombre("Anibal arauz"));
    expect(normalizarNombre("Alan")).toBe(normalizarNombre("alan"));
    expect(normalizarNombre("Nicolás guillen")).toBe("NICOLAS GUILLEN");
  });

  it("🔑 `Jocsan murillo`, `Jocsan` y hasta el tipeo `Jocnsa` son la MISMA persona: los junta la CÉDULA", () => {
    // Las 4 formas REALES del mismo juego de RedNblue. Ninguna normalización
    // de mayúsculas/tildes/guiones junta "Jocnsa" con "Jocsan murillo".
    const formas = [
      { receptor: "Jocsan murillo", cedula: "8918246", placa: "DG7115" },
      { receptor: "Jocsan murillo", cedula: "8-918-246", placa: "DG7115" },
      { receptor: "Jocsan", cedula: "8-918-246", placa: "DG7115" },
      { receptor: "Jocnsa", cedula: "8918246", placa: "Dg7115" },
    ];
    const claves = new Set(formas.map(claveJuego));
    expect(claves.size).toBe(1);
  });

  it("⚠️ pero dos personas DISTINTAS en el mismo camión NO se fusionan", () => {
    const a = { receptor: "Jocsan", cedula: "8-918-246", placa: "DG7115" };
    const b = { receptor: "Alan", cedula: "1-727-44", placa: "DG7115" };
    expect(claveJuego(a)).not.toBe(claveJuego(b));
  });

  it("la misma persona con OTRA placa es otro juego (es otro camión)", () => {
    const a = { receptor: "Jocsan murillo", cedula: "8-918-246", placa: "DG7115" };
    const b = { receptor: "Jocsan murillo", cedula: "8-918-246", placa: "EL6433" };
    expect(claveJuego(a)).not.toBe(claveJuego(b));
  });
});

describe("🔴 se ordena por FRECUENCIA, no por fecha", () => {
  it("el caso REAL de Boston: el juego de 10 usos va primero aunque no sea el más reciente", () => {
    const juegos = juegosMasFrecuentes([
      // El más reciente, usado UNA vez.
      g({ fecha: "2026-08-10", numero: 190, receptor_nombre: "Jose castillo", cedula: "4-803-1102", placa: "Dg7738" }),
      // El de 10 usos, más viejo.
      ...Array.from({ length: 10 }, (_, i) =>
        g({ fecha: "2026-04-29", numero: 100 + i, receptor_nombre: "Eric", cedula: "8-930", placa: "Ek0700" }),
      ),
    ]);
    expect(juegos[0]).toMatchObject({ receptor: "Eric", cedula: "8-930", placa: "Ek0700", veces: 10 });
    expect(juegos[1]).toMatchObject({ receptor: "Jose castillo", veces: 1 });
  });

  it("el caso REAL de Transporte Sol: 3+3+1 formas son UN juego de 7, no tres de 3/3/1", () => {
    const juegos = juegosMasFrecuentes([
      ...Array.from({ length: 3 }, (_, i) =>
        g({ numero: 100 + i, receptor_nombre: "Nicolás guillen", cedula: "172744", placa: "961885" }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        g({ numero: 110 + i, receptor_nombre: "Nicolás guillen", cedula: "1-727-44", placa: "961885" }),
      ),
      g({ numero: 120, receptor_nombre: "Nicolas", cedula: "172744", placa: "961885" }),
      // Un juego distinto, más reciente, con 2 usos.
      ...Array.from({ length: 2 }, (_, i) =>
        g({ fecha: "2026-08-01", numero: 130 + i, receptor_nombre: "Jonnathan", cedula: "88791944", placa: "961885" }),
      ),
    ]);
    expect(juegos).toHaveLength(2);
    expect(juegos[0].veces).toBe(7);
    expect(juegos[1].veces).toBe(2);
  });

  it("🔴 sin agrupar, el más usado quedaría PARTIDO y ninguno llegaría arriba", () => {
    // La misma entrada que arriba: si se contaran las formas por separado,
    // el juego de 7 saldría como 3/3/1 y perdería contra el de 2.
    const juegos = juegosMasFrecuentes([
      ...Array.from({ length: 3 }, (_, i) => g({ numero: 100 + i, cedula: "172744", placa: "961885", receptor_nombre: "Nicolás guillen" })),
      ...Array.from({ length: 3 }, (_, i) => g({ numero: 110 + i, cedula: "1-727-44", placa: "961885", receptor_nombre: "Nicolás guillen" })),
      ...Array.from({ length: 4 }, (_, i) => g({ numero: 130 + i, cedula: "88791944", placa: "961885", receptor_nombre: "Jonnathan" })),
    ]);
    expect(juegos[0].veces).toBe(6);
    expect(juegos[0].cedula).toMatch(/172744|1-727-44/);
  });

  it("empate en frecuencia → gana el usado más recientemente", () => {
    const juegos = juegosMasFrecuentes([
      g({ fecha: "2026-05-01", numero: 100, cedula: "111", placa: "AAA" }),
      g({ fecha: "2026-08-01", numero: 180, cedula: "222", placa: "BBB" }),
    ]);
    expect(juegos[0].cedula).toBe("222");
  });

  it("son 3 como mucho, aunque haya 24 juegos distintos (RedNblue)", () => {
    const muchos = Array.from({ length: 24 }, (_, i) =>
      g({ numero: 100 + i, cedula: `8-000-${i}`, placa: `AA${i}` }),
    );
    expect(juegosMasFrecuentes(muchos)).toHaveLength(JUEGOS_VISIBLES);
    expect(JUEGOS_VISIBLES).toBe(3);
  });
});

describe("🔴 se ofrece la forma MÁS ESCRITA, y es un valor ORIGINAL", () => {
  it("el caso REAL de Boston: gana `Eric` (10 veces), no `Erick` (1)", () => {
    const juegos = juegosMasFrecuentes([
      ...Array.from({ length: 9 }, (_, i) =>
        g({ numero: 100 + i, receptor_nombre: "Eric", cedula: "8-930", placa: "Ek0700" }),
      ),
      g({ fecha: "2026-08-01", numero: 180, receptor_nombre: "Erick", cedula: "8-930", placa: "Ek0700" }),
    ]);
    expect(juegos[0].receptor).toBe("Eric");
    expect(juegos[0].veces).toBe(10);
  });

  it("⚠️ NUNCA se ofrece el valor normalizado", () => {
    const juegos = juegosMasFrecuentes([
      g({ receptor_nombre: "Aníbal arauz", cedula: "8-1010-2403", placa: "Dg7738" }),
    ]);
    expect(juegos[0]).toEqual({ receptor: "Aníbal arauz", cedula: "8-1010-2403", placa: "Dg7738", veces: 1 });
    expect(juegos[0].receptor).not.toBe("ANIBAL ARAUZ");
    expect(juegos[0].cedula).not.toBe("810102403");
  });

  it("empate entre formas → gana la más reciente", () => {
    const juegos = juegosMasFrecuentes([
      g({ fecha: "2026-05-01", numero: 100, receptor_nombre: "Jocsan murillo", cedula: "8-918-246", placa: "DG7115" }),
      g({ fecha: "2026-08-01", numero: 180, receptor_nombre: "Jocsan", cedula: "8918246", placa: "Dg7115" }),
    ]);
    expect(juegos[0].receptor).toBe("Jocsan");
    expect(juegos[0].veces).toBe(2);
  });
});

describe("⚠️ qué NO entra en la lista", () => {
  it("una guía que todavía no salió: nadie confirmó ese dato", () => {
    expect(juegosMasFrecuentes([g({ estado: "Pendiente Bodega" })])).toEqual([]);
    expect(juegosMasFrecuentes([g({ estado: "Confirmada" })])).toEqual([]);
  });

  it("una guía borrada", () => {
    expect(juegosMasFrecuentes([g({ deleted: true })])).toEqual([]);
  });

  it("un juego INCOMPLETO: el valor de esto es llenar los tres de un toque", () => {
    expect(juegosMasFrecuentes([g({ placa: "" })])).toEqual([]);
    expect(juegosMasFrecuentes([g({ cedula: null })])).toEqual([]);
    expect(juegosMasFrecuentes([g({ receptor_nombre: "   " })])).toEqual([]);
  });

  it("una guía Rechazada SÍ entra: se despachó y alguien firmó", () => {
    expect(juegosMasFrecuentes([g({ estado: "Rechazada" })])).toHaveLength(1);
  });
});

describe("🔴 la ruta acota por transportista y falla ABIERTA", () => {
  const ruta = sinComentarios(leer("src/app/api/guias/despachos-frecuentes/route.ts"));

  it("solo trae guías de ESE transportista, vivas y ya despachadas", () => {
    expect(ruta).toContain('.eq("transportista_id", transportista)');
    expect(ruta).toContain('.eq("deleted", false)');
    expect(ruta).toContain('.in("estado", ["Completada", "Rechazada"])');
  });

  it("🔴 se trae TODA la historia, no una ventana — contar sobre las N últimas es ordenar por fecha disfrazado", () => {
    expect(ruta).toContain(".limit(1000)");
    expect(ruta).not.toMatch(/\.limit\((?:[1-9]|[1-9]\d|60)\)/);
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
    expect(ruta).toContain("juegosMasFrecuentes(");
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
