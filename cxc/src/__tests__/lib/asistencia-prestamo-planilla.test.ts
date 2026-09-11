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
 *   7. 🔴 LA CUOTA ENTRA SOLA (11-sep-2026, Daniel: *«quita lo de aprobación a
 *      préstamos, no es necesario»*): lo escrito a mano manda, vacío = lo que
 *      propone el módulo. Se avisa SOLO la última cuota y quien debe pero no
 *      cobra aquí. ⚠️ Hasta ese día el punto 7 decía «LO NO APROBADO SE DICE»;
 *      cambió de dirección, no se borró: ya no hay nada sin aprobar.
 *   8. 🩸 «YA DESCONTADO» ES SOLO LO QUE SALIÓ DE LA QUINCENA — el caso de
 *      CRISTIAM BLANCO ($125 de liquidación el 7-sep, que la planilla le habría
 *      vuelto a quitar del sueldo).
 * ─────────────────────────────────────────────────────────────────────────── */
import { describe, it, expect } from "vitest";

import {
  CONCEPTOS_DESCUENTO,
  CONCEPTOS_DEUDA,
  CONCEPTOS_PAGO,
  aplicarPrestamoEnLinea,
  avisosDeUltimaCuota,
  casillaAutomatica,
  esDescuentoDeQuincena,
  montoDeFicha,
  montoTercerosDeFicha,
  prestamosDeQuienNoCobra,
  prestamosSinAtar,
  sugerirPrestamos,
  textoAvisoPrestamo,
  textoPrestamoSinAtar,
  type FichaPrestamo,
  type PersonaEnCuadro,
} from "@/lib/asistencia/prestamos-planilla";
import type { DineroLinea, ManualesLinea } from "@/lib/asistencia/planilla";

// ── Andamiaje ───────────────────────────────────────────────────────────────
function ficha(p: Partial<FichaPrestamo> & { nombre: string }): FichaPrestamo {
  // 🔑 `saldo` sin desglose = todo en la cuenta PRÉSTAMO, que es como estaba el
  // 100% de la deuda medida el 5-sep-2026 (13 de 14 personas, y la 14ª con
  // saldo neto $0). Los casos de DAÑO pasan las dos cuentas explícitas.
  const saldoP = p.saldoPrestamo ?? p.saldo ?? 0;
  const saldoD = p.saldoDano ?? 0;
  // 🔴 La TERCERA cuenta (10-sep-2026). Por defecto en cero: los casos viejos
  // siguen valiendo exactamente lo mismo.
  const saldoT = p.saldoTerceros ?? 0;
  return {
    id: p.id ?? p.nombre,
    codigo: p.codigo ?? null,
    nombre: p.nombre,
    cuota: p.cuota ?? 0,
    cuotaDano: p.cuotaDano ?? 0,
    saldo: p.saldo ?? saldoP + saldoD + saldoT,
    saldoPrestamo: saldoP,
    saldoDano: saldoD,
    yaDescontado: p.yaDescontado ?? 0,
    cuotaTerceros: p.cuotaTerceros ?? 0,
    saldoTerceros: saldoT,
    yaDescontadoTerceros: p.yaDescontadoTerceros ?? 0,
  };
}

function persona(
  codigo: string, etiqueta: string, enCasilla = 0, enCasillaTerceros = 0,
): PersonaEnCuadro {
  return { codigo, etiqueta, empresa: null, empresaEtiqueta: null, enCasilla, enCasillaTerceros };
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

  it("🩸 la bandera `activo` de la ficha ya NO frena nada — se retiró el 5-sep-2026", () => {
    // Este caso decía lo contrario: «la ficha ARCHIVADA no propone cuota nueva».
    // 🩸 La bandera nunca significó «trabaja acá» sino «tiene algo abierto»:
    // medido, a ESMER CRUZ le archivaron la ficha al terminar de pagar sus $600
    // y sigue trabajando. Usarla como freno dejaba a BRICEIDA MONTERO —$100 vivos
    // desde marzo, y ACTIVA en Asistencia— sin descuento, en silencio.
    //
    // El filtro de verdad es más fuerte y ya estaba puesto: solo entra quien
    // está en el CUADRO de esta quincena, o sea quien cobra.
    const b = ficha({ nombre: "BRICEIDA MONTERO", codigo: "8", cuota: 50, saldo: 100 });
    expect(montoDeFicha(b).monto).toBe(50);
    // ⚠️ Y un descuento YA REGISTRADO le sigue ganando a la propuesta.
    expect(montoDeFicha({ ...b, yaDescontado: 50 }).monto).toBe(50);
  });

  // 🩸 ESTE CANDADO EXIGÍA LO CONTRARIO HASTA EL 10-SEP-2026, Y CAMBIÓ DE
  // DIRECCIÓN, NO SE BORRÓ.
  //
  // Decía: «LAS DOS CUENTAS: cada una capeada a SU saldo, y después se SUMAN»
  // — $30 de préstamo + $10 de daño = $40 en UNA casilla (Daniel: *«juntos»*).
  //
  // Lo cambió la CONTADORA, textual: *«los daños de mercancía debe permanecer
  // en blanco y que nos permita colocar quincenalmente la cantidad a
  // descontar»*. Con el daño ya SIN cuota, sumarlo en la casilla del préstamo
  // pondría ahí una plata que va en otro renglón del comprobante.
  //
  // 🔑 LO QUE NO CAMBIÓ, y es la regla de fondo: cada cuenta se capea a SU
  // PROPIO SALDO. Antes eso importaba al sumarlas; ahora importa porque cada
  // una tiene su casilla. La cuota nunca cobra más de lo que se debe.
  it("🔴 la casilla «Préstamo» es SOLO la cuenta préstamo, capeada a su saldo", () => {
    const f = ficha({
      nombre: "CON DAÑO", codigo: "21",
      cuota: 30, cuotaDano: 10,
      saldoPrestamo: 220, saldoDano: 50, saldo: 270,
    });
    // El daño NO entra: $30, no $40.
    expect(montoDeFicha(f).monto).toBe(30);
    // Aunque el daño tenga cuota y saldo, la casilla del préstamo no lo mira.
    expect(montoDeFicha({ ...f, saldoDano: 5, saldo: 225 }).monto).toBe(30);
    expect(montoDeFicha({ ...f, cuotaDano: 999, saldoDano: 999 }).monto).toBe(30);
    // La ÚLTIMA cuota se capea a SU saldo: con $12 de préstamo solo entran $12.
    expect(montoDeFicha({ ...f, saldoPrestamo: 12 }).monto).toBe(12);
    // Y sin saldo de préstamo no propone nada, tenga la cuota que tenga.
    expect(montoDeFicha({ ...f, saldoPrestamo: 0 }).monto).toBe(0);
  });

  it("🔴 la CUOTA que se muestra es la del préstamo, no una suma", () => {
    const out = sugerirPrestamos({
      fichas: [ficha({
        nombre: "CON DAÑO", codigo: "21",
        cuota: 30, cuotaDano: 10,
        saldoPrestamo: 220, saldoDano: 50, saldo: 270,
      })],
      personas: [persona("21", "RAMON MIRANDA")],
    });
    expect(out).toHaveLength(1);
    expect(out[0].cuota).toBe(30);
    expect(out[0].sugerido).toBe(30);
    // Y el daño no se cuela por la puerta de terceros.
    expect(out[0].sugeridoTerceros).toBe(0);
  });

  // 🔴 LA TERCERA CUENTA: «igual como un préstamo» (la contadora), con su propia
  // casilla, su cuota de la ficha y su saldo.
  it("🔴 «Descuento a terceros» propone min(cuota, saldo) en SU casilla", () => {
    const f = ficha({
      nombre: "CON TERCEROS", codigo: "23",
      cuota: 0, saldoPrestamo: 0,
      cuotaTerceros: 40, saldoTerceros: 79.94, saldo: 79.94,
    });
    // La cuota entera mientras alcance…
    expect(montoTercerosDeFicha(f).monto).toBe(40);
    // …y la ÚLTIMA se capea a lo que queda: $39.94, no $40.
    expect(montoTercerosDeFicha({ ...f, saldoTerceros: 39.94 }).monto).toBe(39.94);
    // Sin saldo no propone nada; sin cuota tampoco.
    expect(montoTercerosDeFicha({ ...f, saldoTerceros: 0 }).monto).toBe(0);
    expect(montoTercerosDeFicha({ ...f, cuotaTerceros: 0 }).monto).toBe(0);
    // Y un pago YA registrado de terceros le gana a la propuesta (regla 2).
    expect(montoTercerosDeFicha({ ...f, yaDescontadoTerceros: 15 })).toEqual({
      monto: 15, origen: "descontado",
    });
  });

  it("🔴 quien SOLO debe terceros igual entra al cuadro", () => {
    const out = sugerirPrestamos({
      fichas: [ficha({
        nombre: "SOLO TERCEROS", codigo: "23",
        cuota: 0, saldoPrestamo: 0,
        cuotaTerceros: 40, saldoTerceros: 79.94, saldo: 79.94,
      })],
      personas: [persona("23", "ANDRES GONZALEZ")],
    });
    expect(out).toHaveLength(1);
    expect(out[0].sugerido).toBe(0);
    expect(out[0].sugeridoTerceros).toBe(40);
    expect(out[0].saldoTerceros).toBe(79.94);
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
    ficha({ id: "vieja", nombre: "RAMON MIRANDA", codigo: "21", cuota: 10, saldo: 0, yaDescontado: 3.13 }),
    // La viva.
    ficha({ id: "viva", nombre: "RAMON MIRANDA", codigo: "21", cuota: 30, saldo: 250 }),
  ];

  it("las DOS fichas de RAMON MIRANDA dan UNA sola línea, y SUMAN", () => {
    const out = sugerirPrestamos({
      fichas: dosFichasDeRamon,
      personas: [persona("21", "RAMON MIRANDA")],
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
    });
    expect(out[0].nombrePrestamos).toContain("RAMON MIRANDA");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 la cuota entra SOLA — la aprobación quincenal se retiró el 11-sep-2026", () => {
  // ⚠️ CAMBIÓ DE DIRECCIÓN, NO SE BORRÓ. Esta sección se llamaba «la aprobación»
  // y probaba que sin fila guardada NO se descontaba, que lo no aprobado se
  // decía con nombre y monto, y que un cambio después de aprobar se avisaba.
  // Daniel, 11-sep-2026, textual: *«quita lo de aprobación a préstamos, no es
  // necesario»*. Medido ese día sobre la quincena 1–15 sep: 10 colaboradores con
  // $495 de cuota que la planilla NO descontaba porque nadie había aprobado.
  const fichas = [
    ficha({ nombre: "KEVIN LUBO", codigo: "6", cuota: 50, saldo: 50 }),
    ficha({ nombre: "GABRIELA A. JARAMILLO P.", codigo: "53", cuota: 60, saldo: 360 }),
  ];
  const personas = [persona("6", "KEVIN LUBO"), persona("53", "GABRIELA JARAMILLO")];

  const DINERO = (o: Partial<DineroLinea> = {}): DineroLinea => ({
    rataHora: 3, valorMinuto: 0.05, salarioQuincenal: 260,
    extraDiurno: 0, extraNocturno: 0, excedente: 0, domingos: 0, feriados: 0,
    ausencias: 0, ausenciaPorTardanza: 0, ausenciaDeDiaCompleto: 0, vacacionesYaPagadas: 0,
    tardanzas: 0, salidaTemprana: 0, totalBruto: 260, baseSeguros: null,
    seguroSocial: 0, seguroEducativo: 0, isr: 0, prestamo: 0, terceros: 0, mercancia: 0,
    totalDeducciones: 0, otrosServicios: 0, netoPagar: 260, ...o,
  });
  const MANUAL = (o: Partial<ManualesLinea> = {}): ManualesLinea => ({
    isr: 0, prestamo: 0, terceros: 0, mercancia: 0, otrosServicios: 0, ...o,
  });

  it("la sugerencia ya no sabe de aprobaciones: ni `aprobado`, ni `montoVisto`, ni `cambio`", () => {
    const out = sugerirPrestamos({ fichas, personas });
    expect(out).toHaveLength(2);
    for (const s of out) {
      expect("aprobado" in s).toBe(false);
      expect("montoVisto" in s).toBe(false);
      expect("cambio" in s).toBe(false);
    }
  });

  it("🔴 vacía = lo que propone el módulo; escrito a mano = lo escrito (manda)", () => {
    expect(casillaAutomatica(0, 50)).toBe(50);
    expect(casillaAutomatica(35, 50)).toBe(0);   // hay algo escrito: no entra nada automático
    expect(casillaAutomatica(0, 0)).toBe(0);
    expect(casillaAutomatica(-3, 50)).toBe(50);  // basura negativa = vacío
  });

  it("🔴 la cuota entra a `dinero` (préstamo, deducciones y neto) y NUNCA a `manuales`", () => {
    const [sug] = sugerirPrestamos({ fichas: [fichas[1]], personas: [personas[1]] });
    const linea = { codigo: "53", manuales: MANUAL(), dinero: DINERO() };
    const con = aplicarPrestamoEnLinea(linea, sug);
    expect(con.dinero!.prestamo).toBe(60);
    expect(con.dinero!.totalDeducciones).toBe(60);
    expect(con.dinero!.netoPagar).toBe(200);
    expect(con.prestamoAutomatico).toEqual({ prestamo: 60, terceros: 0 });
    // 🔑 `manuales` es la foto de la tabla: la pantalla la manda de vuelta entera
    // al guardar el ISR; si la cuota viviera ahí, editar el ISR la congelaría.
    expect(con.manuales.prestamo).toBe(0);
    // Y la línea original no se muta.
    expect(linea.dinero.prestamo).toBe(0);
  });

  it("lo escrito a mano manda: con $35 en la casilla no entra la cuota de $60", () => {
    const [sug] = sugerirPrestamos({ fichas: [fichas[1]], personas: [persona("53", "GABRIELA JARAMILLO", 35)] });
    const linea = { codigo: "53", manuales: MANUAL({ prestamo: 35 }), dinero: DINERO({ prestamo: 35, totalDeducciones: 35, netoPagar: 225 }) };
    const con = aplicarPrestamoEnLinea(linea, sug);
    expect(con).toBe(linea); // misma referencia: nada que meter
    expect(con.dinero!.prestamo).toBe(35);
  });

  it("terceros entra a SU casilla, aparte del préstamo", () => {
    const f = ficha({ nombre: "CON TERCEROS", codigo: "23", cuota: 0, saldoPrestamo: 0, cuotaTerceros: 40, saldoTerceros: 79.94, saldo: 79.94 });
    const [sug] = sugerirPrestamos({ fichas: [f], personas: [persona("23", "ANDRES GONZALEZ")] });
    const con = aplicarPrestamoEnLinea({ codigo: "23", manuales: MANUAL(), dinero: DINERO() }, sug);
    expect(con.dinero!.terceros).toBe(40);
    expect(con.dinero!.prestamo).toBe(0);
    expect(con.dinero!.netoPagar).toBe(220);
    expect(con.prestamoAutomatico).toEqual({ prestamo: 0, terceros: 40 });
  });

  it("sin `dinero` (servicio profesional, «Tú decides») no se toca nada", () => {
    const [sug] = sugerirPrestamos({ fichas: [fichas[1]], personas: [personas[1]] });
    const linea = { codigo: "53", manuales: MANUAL(), dinero: null };
    expect(aplicarPrestamoEnLinea(linea, sug)).toBe(linea);
    expect(aplicarPrestamoEnLinea({ ...linea, dinero: DINERO() }, undefined).prestamoAutomatico).toBeUndefined();
  });

  it("🔴 se avisa la ÚLTIMA cuota: cuota $45 sobre saldo $40 → se descuenta $40, y se dice", () => {
    const out = sugerirPrestamos({
      fichas: [ficha({ nombre: "LUIS PARAJON", codigo: "10", cuota: 45, saldo: 40 })],
      personas: [persona("10", "LUIS PARAJON")],
    });
    expect(out[0].sugerido).toBe(40);
    const avisos = avisosDeUltimaCuota(out);
    expect(avisos).toEqual([{ tipo: "ultima-cuota", codigo: "10", etiqueta: "LUIS PARAJON", cuenta: "prestamo", cuota: 45, saldo: 40 }]);
    const texto = textoAvisoPrestamo(avisos)!;
    expect(texto).toContain("LUIS PARAJON");
    expect(texto).toContain("$40.00");
    expect(texto).toContain("$45.00");
    expect(texto).toContain("termina de pagar");
  });

  it("una cuota normal NO avisa nada, y un hecho consumado tampoco", () => {
    expect(avisosDeUltimaCuota(sugerirPrestamos({ fichas, personas }))).toEqual([]);
    const ya = sugerirPrestamos({
      fichas: [ficha({ nombre: "YA", codigo: "6", cuota: 50, saldo: 0, yaDescontado: 50 })],
      personas: [persona("6", "KEVIN LUBO")],
    });
    expect(avisosDeUltimaCuota(ya)).toEqual([]);
    expect(textoAvisoPrestamo([])).toBeNull();
  });

  it("🔴 quien debe y NO está en el cuadro (salió, o no cobra aquí) se DICE, y no se le descuenta", () => {
    const f = ficha({ nombre: "BRICEIDA MONTERO", codigo: "8", cuota: 50, saldo: 100 });
    // No está en `personas`: no propone nada…
    expect(sugerirPrestamos({ fichas: [f], personas: [] })).toHaveLength(0);
    // …pero si la capa de arriba la dejó afuera, se avisa con nombre y saldo.
    const avisos = prestamosDeQuienNoCobra({ fichas: [f], fuera: new Set(["8"]), nombreDe: () => "Briceida Montero" });
    expect(avisos).toEqual([{ tipo: "no-cobra", codigo: "8", etiqueta: "Briceida Montero", saldo: 100 }]);
    const texto = textoAvisoPrestamo(avisos)!;
    expect(texto).toContain("Briceida Montero");
    expect(texto).toContain("$100.00");
    expect(texto).toContain("no se le descuenta");
    expect(texto).toContain("liquidación");
    // Quien no está en `fuera` no es noticia; sin saldo, tampoco.
    expect(prestamosDeQuienNoCobra({ fichas: [f], fuera: new Set(), nombreDe: () => null })).toEqual([]);
    expect(prestamosDeQuienNoCobra({ fichas: [{ ...f, saldo: 0 }], fuera: new Set(["8"]), nombreDe: () => null })).toEqual([]);
  });

  it("🩸 «ya descontado» es SOLO lo que salió de la quincena — el caso de CRISTIAM BLANCO", () => {
    // 7-sep-2026: canceló su préstamo con $125 de la LIQUIDACIÓN. Concepto
    // «Pago», origen «Liquidación». NO es un descuento del sueldo.
    expect(esDescuentoDeQuincena({ concepto: "Pago", origen_pago: "Liquidación" })).toBe(false);
    expect(esDescuentoDeQuincena({ concepto: "Pago", origen_pago: "Efectivo" })).toBe(false);
    expect(esDescuentoDeQuincena({ concepto: "Pago", origen_pago: "Décimo" })).toBe(false);
    // Lo que sí: «Quincena», o sin origen (las filas anteriores al 5-sep-2026).
    expect(esDescuentoDeQuincena({ concepto: "Pago", origen_pago: "Quincena" })).toBe(true);
    expect(esDescuentoDeQuincena({ concepto: "Pago", origen_pago: null })).toBe(true);
    expect(esDescuentoDeQuincena({ concepto: "Pago de terceros" })).toBe(true);
    // Y un cargo nunca.
    expect(esDescuentoDeQuincena({ concepto: "Préstamo", origen_pago: null })).toBe(false);
    expect(esDescuentoDeQuincena({ concepto: "Abono extra", origen_pago: null })).toBe(false);
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
    });
    expect(out[0].etiqueta).toBe("GABRIELA JARAMILLO");
    expect(out[0].nombrePrestamos).toBe("GABRIELA A. JARAMILLO P.");
  });
});
