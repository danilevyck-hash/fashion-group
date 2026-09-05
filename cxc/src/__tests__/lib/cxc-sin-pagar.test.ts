// ─────────────────────────────────────────────────────────────────────────────
// «SIN PAGAR HACE +90 D» — el único dato NUEVO del rediseño de Cuentas por
// Cobrar (5-sep-2026), y la mejora que Daniel eligió primero.
//
// LA DEFINICIÓN: días desde el ÚLTIMO PAGO REAL del cliente en las 6 empresas
// del grupo. Sin ningún recibo → «nunca ha pagado», que TAMBIÉN avisa.
//
// 🔴 LAS RETENCIONES NO CUENTAN, NI LOS RECIBOS EN CERO. Si contaran, City Mall
// parecería que pagó ayer por $19,60 de retención de ITBMS. La regla vive en la
// vista `switch_ultimo_pago_cliente_v2` y en la ruta que la lee — acá se cierra
// que quien arma el mapa no puede saltarse ese camino.
//
// MEDIDO CONTRA PRODUCCIÓN el 5-sep-2026 (94 clientes con deuda de 100 filas):
//   · 37 clientes · $647.944,31 avisan
//   · 7 de ellos NUNCA pagaron ($56.672,56) — entre ellos ACTIVE SHOES, S.A.
//     con $43.806,10 y TODA su deuda en 0-90 d: fila VERDE que igual avisa, que
//     es exactamente el punto del cambio
//   · los otros 30 suman $591.271,75; 24 pasan los 180 días ($408.414,81)
//
// ⚠️ Fechas FIJAS, nunca `new Date()`: Panamá es UTC−5 y un test que dependa
// del reloj falla a las 19:00 hora de Panamá.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  DIAS_SIN_PAGAR_UMBRAL,
  diasSinPagar,
  avisaSinPagar,
  textoSinPagar,
  rotuloSinPagar,
  rotuloClientes,
  filtrarSinPagar,
  ultimoPagoPorCodigo,
} from "@/lib/cxc/sin-pagar";

const HOY = "2026-09-05"; // el día de la medición, fijo

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

describe("el umbral y la cuenta de días", () => {
  it("el umbral son 90 días — no 60, no 120", () => {
    expect(DIAS_SIN_PAGAR_UMBRAL).toBe(90);
  });

  it("cuenta los días exactos entre el pago y hoy", () => {
    expect(diasSinPagar("2026-09-04", HOY)).toBe(1);
    expect(diasSinPagar("2026-09-05", HOY)).toBe(0);
    expect(diasSinPagar("2026-06-07", HOY)).toBe(90);
  });

  it("un pago con fecha futura vale 0, nunca negativo", () => {
    expect(diasSinPagar("2026-12-01", HOY)).toBe(0);
  });

  it("sin fecha de pago devuelve null — que NO es cero", () => {
    expect(diasSinPagar(null, HOY)).toBeNull();
    expect(diasSinPagar("", HOY)).toBeNull();
    expect(diasSinPagar(undefined, HOY)).toBeNull();
  });
});

describe("🔴 quién avisa", () => {
  it("exactamente 90 días NO avisa; 91 sí", () => {
    expect(avisaSinPagar(90)).toBe(false);
    expect(avisaSinPagar(91)).toBe(true);
  });

  it("🔴 el que NUNCA pagó avisa — callarlo sería lo contrario del aviso", () => {
    expect(avisaSinPagar(null)).toBe(true);
  });

  it("el que pagó ayer no avisa", () => {
    expect(avisaSinPagar(1)).toBe(false);
  });
});

describe("lo que se lee en pantalla", () => {
  it("la fila dice los días, o que nunca pagó", () => {
    expect(textoSinPagar(298)).toBe("no paga hace 298 d");
    expect(textoSinPagar(null)).toBe("nunca ha pagado");
  });

  it("la tira dice cuántos son y con qué umbral", () => {
    expect(rotuloSinPagar(37)).toBe("37 sin pagar hace +90 d");
  });

  it("sin ninguno, la misma celda vuelve a contar clientes (singular y plural)", () => {
    expect(rotuloClientes(1)).toBe("1 cliente");
    expect(rotuloClientes(100)).toBe("100 clientes");
  });
});

describe("🔴 LOS CINCO CASOS DE CONTROL, medidos contra producción el 5-sep-2026", () => {
  // Nombre, código, último pago real y lo que debe. Si el corte se mueve o el
  // «nunca pagó» deja de avisar, alguno de estos cinco cambia de lado.
  const CASOS = [
    { nombre: "Internacional Belen", codigo: "D-76", ultimoPago: "2025-11-11", dias: 298, avisa: true },
    { nombre: "Grup M.E.L. International, S.A.", codigo: "D-66", ultimoPago: "2026-03-19", dias: 170, avisa: true },
    { nombre: "Multimarkas", codigo: "D-109", ultimoPago: "2024-03-11", dias: 908, avisa: true },
    { nombre: "Colon Town By Japanese", codigo: "D-36", ultimoPago: "2025-02-12", dias: 570, avisa: true },
    { nombre: "ACTIVE SHOES, S.A.", codigo: "12188", ultimoPago: null, dias: null, avisa: true },
  ] as const;

  for (const caso of CASOS) {
    it(`${caso.nombre} (${caso.codigo}) → ${caso.dias === null ? "nunca ha pagado" : `${caso.dias} d`}`, () => {
      const dias = diasSinPagar(caso.ultimoPago, HOY);
      expect(dias).toBe(caso.dias);
      expect(avisaSinPagar(dias)).toBe(caso.avisa);
    });
  }

  it("🔴 ACTIVE SHOES avisa aunque toda su deuda esté en 0-90 d (fila VERDE)", () => {
    // Es el contraste que motivó el cambio: la barrita de color dice «al día» y
    // el cliente lleva desde 2023 sin mandar un centavo.
    const activeShoes = { codigo: "12188", ultimoPago: null, current: 43806.1, watch: 0, overdue: 0 };
    expect(activeShoes.overdue + activeShoes.watch).toBe(0); // verde
    expect(avisaSinPagar(diasSinPagar(activeShoes.ultimoPago, HOY))).toBe(true);
  });
});

describe("filtrar la lista", () => {
  it("deja solo a los que avisan y devuelve los MISMOS objetos", () => {
    const uno = { codigo: "D-1", ultimoPago: "2026-09-01", total: 100 };
    const dos = { codigo: "D-2", ultimoPago: "2025-01-01", total: 200 };
    const tres = { codigo: "D-3", ultimoPago: null, total: 300 };
    const salen = filtrarSinPagar([uno, dos, tres], HOY);
    expect(salen).toEqual([dos, tres]);
    expect(salen[0]).toBe(dos); // el MISMO objeto: no se pierde el monto
  });

  it("un cliente sin código no puede avisar por su código: no cruza", () => {
    // Sin código no hay identidad, y la identidad es el código — nunca el nombre.
    expect(filtrarSinPagar([{ codigo: null, ultimoPago: "2026-09-01" }], HOY)).toEqual([]);
  });
});

describe("🔴 el último pago del CLIENTE es el más reciente de sus 6 empresas", () => {
  it("se queda con la fecha MÁXIMA, no con la primera que llega", () => {
    const mapa = ultimoPagoPorCodigo([
      { codigo: "D-25", fecha: "2026-07-22" },
      { codigo: "D-25", fecha: "2026-08-20" },
      { codigo: "D-25", fecha: "2026-07-29" },
    ]);
    expect(mapa.get("D-25")).toBe("2026-08-20");
  });

  it("🩸 el que terminó de pagarle a una empresa NO sale como moroso por otra", () => {
    // Si el mapa se armara solo con las empresas donde el cliente TIENE deuda,
    // el que le pagó todo a Vistana la semana pasada y debe en Fashion Wear
    // saldría como «no paga hace 300 días».
    const mapa = ultimoPagoPorCodigo([
      { codigo: "D-9", fecha: "2025-11-01" }, // fashion_wear, donde debe
      { codigo: "D-9", fecha: "2026-09-01" }, // vistana, ya saldada
    ]);
    expect(avisaSinPagar(diasSinPagar(mapa.get("D-9") ?? null, HOY))).toBe(false);
  });

  it("descarta filas sin código o sin fecha, sin romperse", () => {
    const mapa = ultimoPagoPorCodigo([
      { codigo: null, fecha: "2026-01-01" },
      { codigo: "D-1", fecha: null },
      { codigo: "  ", fecha: "2026-01-01" },
    ]);
    expect(mapa.size).toBe(0);
  });
});

describe("🔴 de dónde sale el dato: retenciones y recibos en cero NO cuentan", () => {
  it("la ruta que alimenta el mapa filtra retenciones y ceros", () => {
    // `/api/cxc/ultimo-pago` lee `switch_ultimo_pago_cliente_v2` (que ya excluye
    // retenciones y total = 0 en la vista) y encima descarta los de $0 en el
    // servidor, como red hasta que la DDL corra.
    const src = sinComentarios(leer("src/app/api/cxc/ultimo-pago/route.ts"));
    expect(src).toContain("switch_ultimo_pago_cliente_v2");
    expect(src).toContain("esPagoDeVerdad");
  });

  it("🔴 el mapa se arma con la lectura del GRUPO, no con una nueva", () => {
    const src = sinComentarios(leer("src/app/cxc/hooks/useAdminData.ts"));
    expect(src).toContain("ultimoPagoPorCodigo");
    expect(src).toContain("/api/cxc/ultimo-pago");
    // Nada de una consulta propia a `switch_recibos` desde el hook: ahí conviven
    // los recibos de Boston y de American Classic con los del grupo.
    expect(src).not.toContain("switch_recibos");
  });

  it("🔴 la ruta del último pago acota a las empresas con CXC — Boston no entra", () => {
    const src = sinComentarios(leer("src/app/api/cxc/ultimo-pago/route.ts"));
    expect(src).toContain("empresasConCxc");
    expect(src).toContain('.in("empresa_key", EMPRESAS_CXC)');
    expect(src).not.toContain("confecciones_boston");
  });
});

describe("la pantalla usa la regla, no una copia", () => {
  it("Cuentas por Cobrar importa el módulo en vez de comparar días a mano", () => {
    const src = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(src).toContain('from "@/lib/cxc/sin-pagar"');
    expect(src).toContain("avisaSinPagar");
    expect(src).toContain("diasSinPagar");
    // Ni un `> 90` escrito a mano en la pantalla.
    expect(src).not.toMatch(/>\s*90\b/);
  });

  it("🔴 el 'hoy' del aviso es el de PANAMÁ, no el del servidor en UTC", () => {
    const src = sinComentarios(leer("src/app/cxc/page.tsx"));
    // El VALOR, no solo el import: entre las 19:00 y la medianoche de Panamá el
    // día UTC ya es el siguiente y todos los «días sin pagar» saldrían con uno
    // de más.
    expect(src).toMatch(/const hoy = hoyPanama\(\)/);
    expect(src).not.toMatch(/const hoy = new Date\(\)/);
  });

  it("el aviso solo cuenta a los que DEBEN (saldo a favor no avisa)", () => {
    const src = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(src).toMatch(/c\.total\s*>\s*0\s*&&\s*avisaSinPagar/);
  });

  it("el «no paga hace N d» de la fila se dibuja SOLO con el filtro encendido", () => {
    const src = sinComentarios(leer("src/app/cxc/page.tsx"));
    expect(src).toMatch(/sinPagarActivo\s*\?\s*textoSinPagar/);
  });
});
