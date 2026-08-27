/* ─────────────────────────────────────────────────────────────────────────────
 * EL PRÉSTAMO EN LA PLANILLA — el candado.
 *
 * Contadora, textual: *«El préstamo si debe ser por aprobarlo»*.
 *
 * 🔴 LO QUE SE PRUEBA ACÁ, Y TODO ES PLATA:
 *
 *   1. EL HECHO CONSUMADO LE GANA A LA CUOTA. Si el módulo YA registró el
 *      descuento de esta quincena, la casilla dice ESO y no `min(cuota,saldo)`.
 *      El caso real: KEVIN LUBO, saldo $50 y cuota $50 — aplicada la quincena
 *      su saldo es $0, y sin esta regla la casilla habría dicho $0 el mismo mes
 *      en que se le descontaron los $50.
 *   2. LA ÚLTIMA CUOTA SE CAPEA AL SALDO (`min`), igual que la RPC del módulo.
 *   3. NADA SE ATA POR PARECIDO: una ficha SIN código no produce sugerencia, y
 *      si tiene saldo se DICE aparte. Es la lección de `Outlet Duty Free N2`.
 *   4. SE AGRUPA POR CÓDIGO, no por ficha. RAMON MIRANDA tiene DOS fichas
 *      atadas al código 21 y la planilla tiene UNA casilla.
 *   5. LA FICHA ARCHIVADA NO PROPONE CUOTA NUEVA — misma condición que la RPC.
 *   6. `Abono extra` NO es un descuento de planilla. Descontar del sueldo lo
 *      que la persona ya pagó de su bolsillo es cobrarle dos veces.
 *   7. LO NO APROBADO SE DICE, con nombre Y monto. Rechazar sí, esconder no —
 *      y es la lección del #651, donde un freno escondió $700 durante 22 días.
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";

import {
  CONCEPTOS_DESCUENTO,
  CONCEPTOS_DEUDA,
  CONCEPTOS_PAGO,
  montoDeFicha,
  prestamosSinAprobar,
  prestamosSinAtar,
  resumenPrestamos,
  sugerirPrestamos,
  textoPrestamoSinAprobar,
  textoPrestamoSinAtar,
  type AprobacionPrestamo,
  type FichaPrestamo,
  type PersonaEnCuadro,
} from "@/lib/asistencia/prestamos-planilla";

// ── Andamiaje ───────────────────────────────────────────────────────────────
function ficha(p: Partial<FichaPrestamo> & { nombre: string }): FichaPrestamo {
  return {
    id: p.id ?? p.nombre,
    codigo: p.codigo ?? null,
    nombre: p.nombre,
    activo: p.activo ?? true,
    cuota: p.cuota ?? 0,
    saldo: p.saldo ?? 0,
    yaDescontado: p.yaDescontado ?? 0,
  };
}

function persona(codigo: string, etiqueta: string, enCasilla = 0): PersonaEnCuadro {
  return { codigo, etiqueta, empresa: null, empresaEtiqueta: null, enCasilla };
}

function aprobacion(codigo: string, montoVisto: number, aprobado = true): AprobacionPrestamo {
  return { codigo, aprobado, montoVisto, por: "daniel", cuando: "2026-08-27T12:00:00Z" };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("de dónde sale el monto de la casilla", () => {
  it("🔴 lo que el módulo YA descontó esta quincena le gana a la cuota — el caso KEVIN LUBO", () => {
    // Saldo $50, cuota $50, y la quincena YA se aplicó: el saldo quedó en 0.
    const k = ficha({ nombre: "KEVIN LUBO", codigo: "6", cuota: 50, saldo: 0, yaDescontado: 50 });
    expect(montoDeFicha(k)).toEqual({ monto: 50, origen: "descontado" });
    // 🩸 `min(cuota, saldo)` daría 0 — la casilla en cero el mismo mes en que se
    // le descontaron los $50.
    expect(Math.min(k.cuota, k.saldo)).toBe(0);
  });

  it("sin descuento registrado, es min(cuota, saldo) — igual que la RPC del módulo", () => {
    expect(montoDeFicha(ficha({ nombre: "A", codigo: "1", cuota: 60, saldo: 360 })).monto).toBe(60);
    // 🔴 La ÚLTIMA cuota se capea al saldo: LUIS PARAJON, cuota $45 sobre $85
    // deja $40, y el mes siguiente son $40, no $45.
    expect(montoDeFicha(ficha({ nombre: "B", codigo: "2", cuota: 45, saldo: 40 })).monto).toBe(40);
    expect(montoDeFicha(ficha({ nombre: "C", codigo: "3", cuota: 50, saldo: 0 })).monto).toBe(0);
  });

  it("🔴 la ficha ARCHIVADA no propone cuota nueva (misma condición que la RPC)", () => {
    // BRICEIDA MONTERO: saldo $100 vivo pero la ficha está archivada en
    // Préstamos. Si el módulo no se lo descontaría, la planilla no lo propone.
    const b = ficha({ nombre: "BRICEIDA MONTERO", codigo: "8", cuota: 50, saldo: 100, activo: false });
    expect(montoDeFicha(b).monto).toBe(0);
    // ⚠️ Pero un descuento YA REGISTRADO se respeta igual: es un hecho, no una
    // propuesta. Archivar a alguien no puede borrar lo que ya se le descontó.
    expect(montoDeFicha({ ...b, yaDescontado: 50 }).monto).toBe(50);
  });

  it("un préstamo sin cuota no propone nada — no se inventa una", () => {
    expect(montoDeFicha(ficha({ nombre: "X", codigo: "9", cuota: 0, saldo: 700 })).monto).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el amarre: nada por parecido", () => {
  it("una ficha SIN código no produce ninguna sugerencia", () => {
    // `LAURA CASIANI` (Préstamos) contra `Laura Lismari Casiano Vega` (38):
    // CASIANI ≠ CASIANO. No se ata, y por lo tanto no se le descuenta a nadie.
    const out = sugerirPrestamos({
      fichas: [ficha({ nombre: "LAURA CASIANI", codigo: null, cuota: 10, saldo: 300 })],
      personas: [persona("38", "Laura Lismari Casiano Vega")],
      aprobaciones: new Map(),
    });
    expect(out).toHaveLength(0);
  });

  it("🔴 pero si tiene SALDO se DICE, con nombre y monto", () => {
    const fichas = [
      ficha({ nombre: "LAURA CASIANI", codigo: null, cuota: 10, saldo: 300 }),
      ficha({ nombre: "SIN DEUDA", codigo: null, cuota: 10, saldo: 0 }),
    ];
    const sueltos = prestamosSinAtar(fichas);
    expect(sueltos).toEqual([{ nombre: "LAURA CASIANI", saldo: 300 }]);
    const texto = textoPrestamoSinAtar(sueltos)!;
    expect(texto).toContain("LAURA CASIANI");
    expect(texto).toContain("$300.00");
    // Sin ninguno, no hay cartel: un cartel permanente se deja de leer.
    expect(textoPrestamoSinAtar([])).toBeNull();
  });

  it("una ficha atada a alguien que NO está en el cuadro no propone nada", () => {
    const out = sugerirPrestamos({
      fichas: [ficha({ nombre: "SE FUE", codigo: "99", cuota: 50, saldo: 500 })],
      personas: [persona("7", "ANGELA GARCIA")],
      aprobaciones: new Map(),
    });
    expect(out).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔑 se agrupa por CÓDIGO, no por ficha", () => {
  // 🩸 Las DOS fichas tienen que APORTAR algo, si no el caso no prueba nada: con
  // una sola aportando, agrupar mal y no agrupar dan el mismo número.
  const dosFichasDeRamon = [
    // La vieja, archivada, pero con un descuento YA registrado en la quincena.
    ficha({ id: "vieja", nombre: "RAMON MIRANDA", codigo: "21", cuota: 10, saldo: 0, activo: false, yaDescontado: 3.13 }),
    // La viva.
    ficha({ id: "viva", nombre: "RAMON MIRANDA", codigo: "21", cuota: 30, saldo: 250 }),
  ];

  it("las DOS fichas de RAMON MIRANDA dan UNA sola línea, y SUMAN", () => {
    const out = sugerirPrestamos({
      fichas: dosFichasDeRamon,
      personas: [persona("21", "RAMON MIRANDA")],
      aprobaciones: new Map(),
    });
    expect(out).toHaveLength(1);
    // 🔴 33,13 y no 30: la planilla tiene UNA casilla y le entra todo lo suyo.
    expect(out[0].sugerido).toBe(33.13);
    expect(out[0].saldo).toBe(250);
    // Con un hecho consumado adentro, el origen del conjunto es «descontado».
    expect(out[0].origen).toBe("descontado");
  });

  it("y los dos nombres quedan a la vista", () => {
    const out = sugerirPrestamos({
      fichas: dosFichasDeRamon,
      personas: [persona("21", "RAMON MIRANDA")],
      aprobaciones: new Map(),
    });
    expect(out[0].nombrePrestamos).toContain("RAMON MIRANDA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la aprobación", () => {
  const fichas = [
    ficha({ nombre: "KEVIN LUBO", codigo: "6", cuota: 50, saldo: 50 }),
    ficha({ nombre: "GABRIELA A. JARAMILLO P.", codigo: "53", cuota: 60, saldo: 360 }),
  ];
  const personas = [persona("6", "KEVIN LUBO"), persona("53", "GABRIELA JARAMILLO")];

  it("sin fila guardada, NO está aprobado — el default es no descontar", () => {
    const out = sugerirPrestamos({ fichas, personas, aprobaciones: new Map() });
    expect(out.every((s) => !s.aprobado)).toBe(true);
    expect(resumenPrestamos(out)).toEqual({
      pendientes: 2,
      monto: 110,
      codigos: expect.arrayContaining(["6", "53"]),
    });
  });

  it("🔴 lo NO aprobado se dice, con nombre Y monto", () => {
    const out = sugerirPrestamos({ fichas, personas, aprobaciones: new Map() });
    const texto = textoPrestamoSinAprobar(prestamosSinAprobar(out))!;
    expect(texto).toContain("KEVIN LUBO");
    expect(texto).toContain("$50.00");
    expect(texto).toContain("GABRIELA JARAMILLO");
    expect(texto).toContain("$60.00");
    expect(texto).toContain("NO se descontó");
    expect(textoPrestamoSinAprobar([])).toBeNull();
  });

  it("⚠️ si la casilla YA tiene monto escrito a mano, NO se dice «no se descontó»", () => {
    // La planilla SÍ lo descontó: decir lo contrario sería mentirle a quien paga.
    const out = sugerirPrestamos({
      fichas,
      personas: [persona("6", "KEVIN LUBO", 50), persona("53", "GABRIELA JARAMILLO")],
      aprobaciones: new Map(),
    });
    const faltan = prestamosSinAprobar(out);
    expect(faltan.map((s) => s.codigo)).toEqual(["53"]);
  });

  it("aprobada y con la casilla al día, no avisa ningún cambio", () => {
    const out = sugerirPrestamos({
      fichas,
      personas: [persona("6", "KEVIN LUBO", 50), persona("53", "GABRIELA JARAMILLO", 60)],
      aprobaciones: new Map([
        ["6", aprobacion("6", 50)],
        ["53", aprobacion("53", 60)],
      ]),
    });
    expect(out.every((s) => s.aprobado && !s.cambio)).toBe(true);
    expect(prestamosSinAprobar(out)).toHaveLength(0);
  });

  it("🔴 si el módulo cambió DESPUÉS de aprobar, se avisa — no se corrige solo", () => {
    // Se aprobó $60 y hoy el saldo dejó una cuota de $40.
    const out = sugerirPrestamos({
      fichas: [ficha({ nombre: "G", codigo: "53", cuota: 60, saldo: 40 })],
      personas: [persona("53", "GABRIELA JARAMILLO", 60)],
      aprobaciones: new Map([["53", aprobacion("53", 60)]]),
    });
    expect(out[0].cambio).toBe(true);
    expect(out[0].sugerido).toBe(40);
    // 🔑 La casilla NO se tocó: la aprobación sigue en pie y el número se
    // explica en pantalla. Una plata que se mueve sola es peor.
    expect(out[0].enCasilla).toBe(60);
  });

  it("🔴 si alguien CORRIGIÓ la casilla a mano, también se avisa", () => {
    const out = sugerirPrestamos({
      fichas: [ficha({ nombre: "G", codigo: "53", cuota: 60, saldo: 360 })],
      personas: [persona("53", "GABRIELA JARAMILLO", 30)],
      aprobaciones: new Map([["53", aprobacion("53", 60)]]),
    });
    expect(out[0].cambio).toBe(true);
    expect(out[0].enCasilla).toBe(30);
  });

  it("desaprobada explícitamente NO es lo mismo que nunca mirada, pero las dos no descuentan", () => {
    const out = sugerirPrestamos({
      fichas,
      personas,
      aprobaciones: new Map([["6", aprobacion("6", 50, false)]]),
    });
    const kevin = out.find((s) => s.codigo === "6")!;
    expect(kevin.aprobado).toBe(false);
    // La fila existe: quedó registro de quién la tocó.
    expect(kevin.por).toBe("daniel");
    expect(kevin.montoVisto).toBe(50);
    // Y no avisa «cambió»: no hay nada aprobado sobre lo que avisar.
    expect(kevin.cambio).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 qué movimiento es un descuento de planilla", () => {
  it("«Abono extra» NO es un descuento de planilla — sería cobrarle dos veces", () => {
    expect(CONCEPTOS_DESCUENTO).not.toContain("Abono extra");
    // Pero sí baja la deuda: el saldo ya lo tiene adentro.
    expect(CONCEPTOS_PAGO).toContain("Abono extra");
  });

  it("«Pago» y «Pago de responsabilidad» sí lo son", () => {
    expect(CONCEPTOS_DESCUENTO).toContain("Pago");
    expect(CONCEPTOS_DESCUENTO).toContain("Pago de responsabilidad");
  });

  it("lo que SUMA deuda no puede estar en lo que la RESTA", () => {
    for (const c of CONCEPTOS_DEUDA) {
      expect(CONCEPTOS_PAGO as readonly string[]).not.toContain(c);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el orden y los nombres", () => {
  it("la plata más grande va arriba", () => {
    const out = sugerirPrestamos({
      fichas: [
        ficha({ nombre: "chico", codigo: "1", cuota: 10, saldo: 100 }),
        ficha({ nombre: "grande", codigo: "2", cuota: 60, saldo: 600 }),
      ],
      personas: [persona("1", "CHICO"), persona("2", "GRANDE")],
      aprobaciones: new Map(),
    });
    expect(out.map((s) => s.codigo)).toEqual(["2", "1"]);
  });

  it("🔑 el nombre de Préstamos viaja aparte del de la planilla", () => {
    // Es lo que permite VER un amarre equivocado: si el sistema dice que
    // «GABRIELA A. JARAMILLO P.» es «GABRIELA JARAMILLO (53)», quien mira tiene
    // que poder leer las dos cosas.
    const out = sugerirPrestamos({
      fichas: [ficha({ nombre: "GABRIELA A. JARAMILLO P.", codigo: "53", cuota: 60, saldo: 360 })],
      personas: [persona("53", "GABRIELA JARAMILLO")],
      aprobaciones: new Map(),
    });
    expect(out[0].etiqueta).toBe("GABRIELA JARAMILLO");
    expect(out[0].nombrePrestamos).toBe("GABRIELA A. JARAMILLO P.");
  });
});
