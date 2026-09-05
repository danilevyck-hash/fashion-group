// ─────────────────────────────────────────────────────────────────────────────
// RECORDATORIOS — EL REDISEÑO (5-sep-2026). Candados de las reglas NUEVAS.
//
// Lo que este archivo cuida, regla por regla:
//
//   A. LA AGENDA: una lista, agrupada por CUÁNDO. Lo abierto se ve; lo
//      depositado solo aparece al buscarlo. Ningún total sumado.
//   B. EL CUÁNDO: seis pastillas, «Hoy» no existe, «Lunes» es el próximo.
//   C. LA REPETICIÓN: `cada_dia` y el `hasta` que corta.
//   D. EL DESTINO: lo decide el ROL, no el cuerpo del pedido.
//   E. EL AVISO ÚNICO de cheque vencido.
//   F. LA RETENCIÓN de 365 días — soft delete, y solo depositados.
//   G. LA MIGRACIÓN: aditiva, y el CHECK de la base = la lista del código.
//   H. EL CRON: 14:00 UTC = 9:00 a.m. de Panamá, una sola ocurrencia al día.
//
// 🔴 Fechas FIJAS, nunca `new Date()`: Panamá es UTC−5 fijo y un test que
// depende del calendario no prueba el código, prueba qué día es hoy.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import {
  DESTINOS,
  ETIQUETA_DESTINO,
  ETIQUETA_REPETICION,
  FALTA_FECHA_PASADA,
  REPETICIONES,
  ROLES_QUE_ELIGEN_DESTINO,
  destinoPermitido,
  faltaParaGuardar,
  fechaYaPaso,
  leerCuerpo,
  mensajeDeFalta,
  ocurreEn,
  partirPorDestino,
  proximaOcurrencia,
  seRepite,
  unirAviso,
  type Recordatorio,
} from "@/lib/recordatorios/recordatorio";
import {
  ETIQUETA_CUANDO,
  OPCIONES_CUANDO,
  aceptaHasta,
  manana,
  proximoLunes,
  resolverCuando,
} from "@/lib/recordatorios/cuando";
import {
  GRUPOS_AGENDA,
  agruparAgenda,
  buscarEnAgenda,
  chequeAbierto,
  estadoVisible,
  grupoDeFecha,
  type ChequeAgenda,
} from "@/lib/recordatorios/agenda";
import {
  construirAvisoVencidos,
  mereceAvisoVencido,
} from "@/lib/cheques-vencidos-aviso";
import {
  RETENCION_DEPOSITADOS_DIAS,
  chequesARetirar,
  corteRetencion,
} from "@/lib/cheques-retencion";
import { construirMensaje } from "@/lib/cheques-aviso-ventana";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** Sin comentarios: en este repo un barrido de texto ya pasó CUATRO veces
 *  estando el código mutado, porque el comentario que explica el cambio dice
 *  justo lo que el barrido busca. */
const plano = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// El lunes 24 de agosto de 2026, el mismo día de los fixtures del módulo.
const HOY = "2026-08-24";

const rec = (over: Partial<Recordatorio> = {}): Recordatorio => ({
  id: "r1",
  fecha: "2026-08-25",
  texto: "Recordar cobrar",
  cliente: "",
  clienteCodigo: null,
  repeticion: "una_vez",
  hasta: null,
  destino: "equipo",
  creadoPor: "Daniel",
  createdAt: "2026-08-24T14:00:00.000Z",
  ...over,
});

const chq = (over: Partial<ChequeAgenda> = {}): ChequeAgenda => ({
  id: "c1",
  cliente: "JERUSALEM DE PANAMA",
  empresa: "vistana",
  numero_cheque: "246001",
  monto: 1000,
  fecha_deposito: HOY,
  estado: "pendiente",
  fecha_depositado: null,
  ...over,
});

// ═════════════════════════════════════════════════════════════════════════════
describe("A · LA AGENDA — una lista, agrupada por CUÁNDO", () => {
  it("los grupos son cinco, en ese orden, y «Vencido» va arriba", () => {
    expect([...GRUPOS_AGENDA]).toEqual([
      "vencido", "hoy", "esta_semana", "despues", "se_repiten",
    ]);
  });

  it("🔴 «vencido», «hoy» y «esta semana» son CUÁNDO, no estados", () => {
    // Es la frase del rediseño: las cuatro pestañas viejas eran una fecha
    // disfrazada. `grupoDeFecha` no mira el estado del cheque ni una sola vez.
    expect(grupoDeFecha("2026-08-20", HOY)).toBe("vencido");
    expect(grupoDeFecha(HOY, HOY)).toBe("hoy");
    expect(grupoDeFecha("2026-08-28", HOY)).toBe("esta_semana"); // el viernes
    expect(grupoDeFecha("2026-09-15", HOY)).toBe("despues");
  });

  it("«esta semana» llega hasta el DOMINGO de la semana calendario", () => {
    // El 24-ago-2026 es lunes → el domingo es el 30. El 31 (lunes) ya es
    // «Después». Dos definiciones de semana en la misma pantalla se separan
    // solas, así que se reusa el corte que ya usaban los cheques.
    expect(grupoDeFecha("2026-08-30", HOY)).toBe("esta_semana");
    expect(grupoDeFecha("2026-08-31", HOY)).toBe("despues");
  });

  it("🔴 la lista muestra lo ABIERTO: el depositado NO entra", () => {
    const grupos = agruparAgenda(
      [chq(), chq({ id: "c2", estado: "depositado", fecha_depositado: "2026-08-20" })],
      [],
      HOY,
    );
    const ids = grupos.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toEqual(["c1"]);
  });

  it("🔴 un cheque REBOTADO se queda (dejó de ser pestaña, es una marca)", () => {
    expect(chequeAbierto(chq({ estado: "rebotado" }))).toBe(true);
    const grupos = agruparAgenda([chq({ estado: "rebotado" })], [], HOY);
    expect(grupos.flatMap((g) => g.items.map((i) => i.id))).toEqual(["c1"]);
  });

  it("un pendiente con la fecha pasada se VE como vencido (la base no cambia)", () => {
    expect(estadoVisible(chq({ fecha_deposito: "2026-08-20" }), HOY)).toBe("vencido");
    expect(estadoVisible(chq(), HOY)).toBe("pendiente");
    expect(estadoVisible(chq({ estado: "depositado" }), HOY)).toBe("depositado");
  });

  it("🔴 un recordatorio que se repite va en UNA fila, en «Se repiten»", () => {
    const grupos = agruparAgenda([], [rec({ repeticion: "cada_dia", fecha: "2026-08-01" })], HOY);
    expect(grupos.map((g) => g.key)).toEqual(["se_repiten"]);
    expect(grupos[0].items).toHaveLength(1);
  });

  it("y uno que ya se pasó de su «hasta» sale de la lista", () => {
    const grupos = agruparAgenda(
      [],
      [rec({ repeticion: "semanal", fecha: "2026-06-01", hasta: "2026-07-01" })],
      HOY,
    );
    expect(grupos).toEqual([]);
  });

  it("un recordatorio de una sola vez que ya pasó tampoco se lista", () => {
    // Daniel: no se marcan como hechos, se mandan y ya. Dejarlos arriba en rojo
    // sería pedirle que los cierre uno por uno.
    expect(agruparAgenda([], [rec({ fecha: "2026-08-01" })], HOY)).toEqual([]);
  });

  it("dentro de un grupo, el cheque va antes que el recordatorio del mismo día", () => {
    const grupos = agruparAgenda([chq()], [rec({ fecha: HOY })], HOY);
    const hoyGrupo = grupos.find((g) => g.key === "hoy")!;
    expect(hoyGrupo.items.map((i) => i.tipo)).toEqual(["cheque", "recordatorio"]);
  });

  it("no se devuelven grupos vacíos (un encabezado sin nada es una pregunta sin respuesta)", () => {
    expect(agruparAgenda([], [], HOY)).toEqual([]);
  });

  // ── El buscador ──────────────────────────────────────────────────────────
  it("🔴 el buscador SÍ encuentra lo depositado — es su única puerta", () => {
    const dep = chq({ id: "c2", estado: "depositado", numero_cheque: "246002" });
    expect(buscarEnAgenda([dep], [], "246002", HOY).map((i) => i.id)).toEqual(["c2"]);
    expect(buscarEnAgenda([dep], [], "jerusalem", HOY).map((i) => i.id)).toEqual(["c2"]);
  });

  it("busca por texto del recordatorio y por su cliente", () => {
    const r = rec({ texto: "Pagar el alquiler", cliente: "City Mall" });
    expect(buscarEnAgenda([], [r], "alquiler", HOY)).toHaveLength(1);
    expect(buscarEnAgenda([], [r], "city", HOY)).toHaveLength(1);
  });

  it("sin término no devuelve nada (no es «mostrar todo»)", () => {
    expect(buscarEnAgenda([chq()], [rec()], "   ", HOY)).toEqual([]);
  });

  it("🔴 el módulo de la agenda NO exporta ninguna función que sume montos", () => {
    // Daniel eligió que el módulo no muestre ningún total. La forma de que no
    // vuelva no es mirar la pantalla: es que la aritmética no exista.
    const src = plano(leer("src/lib/recordatorios/agenda.ts"));
    expect(src).not.toMatch(/reduce\(/);
    expect(src).not.toMatch(/\bsuma|\btotal\b/i);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("B · EL CUÁNDO — seis pastillas, y «Hoy» no es una de ellas", () => {
  it("las seis, en orden, con su etiqueta en español", () => {
    expect([...OPCIONES_CUANDO]).toEqual([
      "manana", "lunes", "elegir", "cada_dia", "cada_semana", "cada_mes",
    ]);
    expect(OPCIONES_CUANDO.map((o) => ETIQUETA_CUANDO[o])).toEqual([
      "Mañana", "Lunes", "Elegir fecha", "Cada día", "Cada semana", "Cada mes",
    ]);
  });

  it("🔴 «Hoy» NO existe — el aviso sale a las 9:00 y para entonces ya pasó", () => {
    expect(OPCIONES_CUANDO).not.toContain("hoy");
    expect(Object.values(ETIQUETA_CUANDO)).not.toContain("Hoy");
  });

  it("«Mañana» es mañana", () => {
    expect(manana(HOY)).toBe("2026-08-25");
    expect(resolverCuando("manana", HOY)).toEqual({ fecha: "2026-08-25", repeticion: "una_vez" });
  });

  it("🔴 «Lunes» es el PRÓXIMO lunes, nunca hoy — un lunes salta +7", () => {
    // El 24-ago-2026 ES lunes. Si «Lunes» cayera en hoy, sería la opción «Hoy»
    // que justamente no existe, y el aviso no llegaría nunca.
    expect(proximoLunes("2026-08-24")).toBe("2026-08-31");
    expect(proximoLunes("2026-08-25")).toBe("2026-08-31"); // martes
    expect(proximoLunes("2026-08-30")).toBe("2026-08-31"); // domingo
  });

  it("las tres repeticiones arrancan MAÑANA, no hoy", () => {
    for (const [op, esperada] of [
      ["cada_dia", "cada_dia"],
      ["cada_semana", "semanal"],
      ["cada_mes", "mensual"],
    ] as const) {
      expect(resolverCuando(op, HOY)).toEqual({ fecha: "2026-08-25", repeticion: esperada });
    }
  });

  it("«Elegir fecha» usa la que se tecleó, y las demás la IGNORAN", () => {
    expect(resolverCuando("elegir", HOY, "2026-09-30").fecha).toBe("2026-09-30");
    // Una fecha de un «Elegir fecha» abandonado no puede colarse en «Mañana».
    expect(resolverCuando("manana", HOY, "2026-01-01").fecha).toBe("2026-08-25");
  });

  it("solo las tres repeticiones aceptan «Hasta…»", () => {
    expect(OPCIONES_CUANDO.filter(aceptaHasta)).toEqual(["cada_dia", "cada_semana", "cada_mes"]);
  });

  it("🔴 no se guarda para un día que ya pasó, y el mensaje dice POR QUÉ", () => {
    expect(fechaYaPaso(HOY, HOY)).toBe(true); // HOY ya pasó: el aviso salió a las 9
    expect(fechaYaPaso("2026-08-23", HOY)).toBe(true);
    expect(fechaYaPaso("2026-08-25", HOY)).toBe(false);

    const falta = faltaParaGuardar({ fecha: HOY, texto: "x" }, HOY);
    expect(falta).toContain(FALTA_FECHA_PASADA);
    expect(mensajeDeFalta(falta)).toContain("9:00 de la mañana");
    expect(mensajeDeFalta(falta)).not.toContain("Falta:");
  });

  it("un «hasta» anterior a la fecha de arranque no se guarda", () => {
    const falta = faltaParaGuardar(
      { fecha: "2026-08-25", texto: "x", hasta: "2026-08-20" },
      HOY,
    );
    expect(falta.length).toBeGreaterThan(0);
    expect(mensajeDeFalta(falta)).toContain("«hasta»");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("C · LA REPETICIÓN — `cada_dia`, y el «hasta» que corta", () => {
  it("son cuatro, con etiqueta, y `una_vez` no cuenta como repetición", () => {
    expect([...REPETICIONES]).toEqual(["una_vez", "cada_dia", "semanal", "mensual"]);
    for (const r of REPETICIONES) expect(ETIQUETA_REPETICION[r], r).toBeTruthy();
    expect(seRepite(rec())).toBe(false);
    expect(seRepite(rec({ repeticion: "cada_dia" }))).toBe(true);
  });

  it("`cada_dia` toca TODOS los días desde su fecha, nunca antes", () => {
    const r = rec({ repeticion: "cada_dia", fecha: "2026-08-25" });
    expect(ocurreEn(r, "2026-08-24")).toBe(false); // antes de arrancar
    for (const d of ["2026-08-25", "2026-08-26", "2026-12-31"]) {
      expect(ocurreEn(r, d), d).toBe(true);
    }
  });

  it("🔴 el «hasta» corta, y corta INCLUSIVE", () => {
    const r = rec({ repeticion: "cada_dia", fecha: "2026-08-25", hasta: "2026-08-27" });
    expect(ocurreEn(r, "2026-08-27")).toBe(true); // el último día SÍ suena
    expect(ocurreEn(r, "2026-08-28")).toBe(false);
  });

  it("y con «hasta» pasado, `proximaOcurrencia` es null (sale de la lista)", () => {
    const r = rec({ repeticion: "semanal", fecha: "2026-06-01", hasta: "2026-07-01" });
    expect(proximaOcurrencia(r, HOY)).toBeNull();
  });

  it("el borde de fin de mes sigue intacto: un mensual del 31 cae en el último día", () => {
    const r = rec({ repeticion: "mensual", fecha: "2026-01-31" });
    expect(ocurreEn(r, "2026-02-28")).toBe(true); // febrero no tiene 31
    expect(ocurreEn(r, "2026-04-30")).toBe(true);
    expect(ocurreEn(r, "2026-03-31")).toBe(true);
  });

  it("🔴 un «hasta» sobre algo que NO se repite se descarta al leer el cuerpo", () => {
    // Guardado sería una bomba: el día que a ese recordatorio le pongan
    // repetición, la fecha de fin vieja lo apagaría sin que nadie la mire.
    const c = leerCuerpo({ fecha: "2026-08-25", texto: "x", hasta: "2026-12-31" }, "admin");
    expect(c.hasta).toBeNull();
    const con = leerCuerpo(
      { fecha: "2026-08-25", texto: "x", repeticion: "semanal", hasta: "2026-12-31" },
      "admin",
    );
    expect(con.hasta).toBe("2026-12-31");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("D · EL DESTINO — lo decide el ROL, no el cuerpo del pedido", () => {
  it("son dos, con etiqueta sin jerga de canales", () => {
    expect([...DESTINOS]).toEqual(["equipo", "privado"]);
    expect(ETIQUETA_DESTINO.equipo).toBe("Al equipo");
    expect(ETIQUETA_DESTINO.privado).toBe("Solo a mí");
  });

  it("🔴 solo los admin eligen; el resto va SIEMPRE al equipo", () => {
    expect([...ROLES_QUE_ELIGEN_DESTINO]).toEqual(["admin"]);
    expect(destinoPermitido("admin", "privado")).toBe("privado");
    // Una secretaria no ve la opción, pero un POST a mano sí podría mandarla.
    for (const rol of ["secretaria", "vendedor", "bodega", "contabilidad", ""]) {
      expect(destinoPermitido(rol, "privado"), rol).toBe("equipo");
    }
  });

  it("un valor raro cae en «equipo», nunca en «privado»", () => {
    // Caer en privado escondería del grupo un aviso que nadie pidió esconder.
    for (const raro of [undefined, null, "", "otro", 7, {}]) {
      expect(destinoPermitido("admin", raro)).toBe("equipo");
    }
  });

  it("`leerCuerpo` aplica la regla (es la puerta de las dos rutas)", () => {
    expect(leerCuerpo({ fecha: "2026-08-25", texto: "x", destino: "privado" }, "secretaria").destino)
      .toBe("equipo");
    expect(leerCuerpo({ fecha: "2026-08-25", texto: "x", destino: "privado" }, "admin").destino)
      .toBe("privado");
  });

  it("🔴 son DOS mensajes, no uno con dos secciones", () => {
    const { equipo, privado } = partirPorDestino([
      { rec: rec({ id: "a" }), fecha: HOY },
      { rec: rec({ id: "b", destino: "privado" }), fecha: HOY },
    ]);
    expect(equipo.map((o) => o.rec.id)).toEqual(["a"]);
    expect(privado.map((o) => o.rec.id)).toEqual(["b"]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("E · EL AVISO ÚNICO de cheque vencido", () => {
  const vencido = {
    estado: "pendiente",
    deleted: false,
    fecha_deposito: "2026-08-31",
    aviso_vencido_en: null as string | null,
  };
  const HOY_SEP = "2026-09-05"; // el día que se midió el hueco en producción

  it("🔴 un cheque vencido y sin avisar SÍ merece su aviso", () => {
    expect(mereceAvisoVencido(vencido, HOY_SEP)).toBe(true);
  });

  it("🔴 y SOLO UNA VEZ: con la marca puesta, no vuelve a sonar nunca", () => {
    expect(
      mereceAvisoVencido({ ...vencido, aviso_vencido_en: "2026-09-01T14:00:00Z" }, HOY_SEP),
    ).toBe(false);
  });

  it("el que vence HOY no avisa por acá (lo cubre el aviso de siempre)", () => {
    expect(mereceAvisoVencido({ ...vencido, fecha_deposito: HOY_SEP }, HOY_SEP)).toBe(false);
  });

  it("🔴 un REBOTADO no avisa — decisión de Daniel", () => {
    expect(mereceAvisoVencido({ ...vencido, estado: "rebotado" }, HOY_SEP)).toBe(false);
  });

  it("un depositado o un borrado tampoco", () => {
    expect(mereceAvisoVencido({ ...vencido, estado: "depositado" }, HOY_SEP)).toBe(false);
    expect(mereceAvisoVencido({ ...vencido, deleted: true }, HOY_SEP)).toBe(false);
  });

  it("el texto dice cliente, empresa, monto, cuándo vencía y el vendedor", () => {
    const t = construirAvisoVencidos(
      [{
        cliente: "JERUSALEM DE PANAMA",
        empresa: "vistana",
        monto: 18393.32,
        fecha_deposito: "2026-08-31",
        vendedor: "Edwin",
      }],
      HOY_SEP,
    );
    expect(t).toContain("🔴 1 cheque venció y sigue sin depositar");
    expect(t).toContain("JERUSALEM DE PANAMA");
    expect(t).toContain("$18,393.32");
    expect(t).toContain("Edwin");
    expect(t).toContain("vencía");
  });

  it("con varios, concuerda en plural", () => {
    const t = construirAvisoVencidos(
      [
        { cliente: "A", empresa: "vistana", monto: 1, fecha_deposito: "2026-08-31" },
        { cliente: "B", empresa: "vistana", monto: 2, fecha_deposito: "2026-08-30" },
      ],
      HOY_SEP,
    );
    expect(t).toContain("2 cheques vencieron y siguen sin depositar");
  });

  it("sin ninguno devuelve cadena vacía (no existe el «hoy no venció nada»)", () => {
    expect(construirAvisoVencidos([], HOY_SEP)).toBe("");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("F · LA RETENCIÓN — 365 días, y SOLO los depositados", () => {
  const HOY_SEP = "2026-09-05";

  it("el umbral es 365 días y el corte se cuenta hacia atrás", () => {
    expect(RETENCION_DEPOSITADOS_DIAS).toBe(365);
    expect(corteRetencion(HOY_SEP)).toBe("2025-09-05");
  });

  it("🔴 solo los DEPOSITADOS se retiran: lo que se debe se queda para siempre", () => {
    const viejo = "2025-01-01";
    const filas = [
      { id: "dep", estado: "depositado", fecha_deposito: viejo, fecha_depositado: viejo },
      { id: "pen", estado: "pendiente", fecha_deposito: viejo, fecha_depositado: null },
      { id: "reb", estado: "rebotado", fecha_deposito: viejo, fecha_depositado: null },
    ];
    expect(chequesARetirar(filas, HOY_SEP)).toEqual(["dep"]);
  });

  it("uno depositado hace menos de un año se queda", () => {
    const filas = [
      { id: "a", estado: "depositado", fecha_deposito: "2026-08-01", fecha_depositado: "2026-08-20" },
    ];
    expect(chequesARetirar(filas, HOY_SEP)).toEqual([]);
  });

  it("🔴 se cuenta desde CUÁNDO SE DEPOSITÓ, no desde cuándo vencía", () => {
    // Un cheque que venció hace 400 días pero se depositó hace 10 sigue vivo:
    // contar desde el vencimiento lo haría desaparecer antes de tiempo.
    const filas = [
      { id: "a", estado: "depositado", fecha_deposito: "2025-07-01", fecha_depositado: "2026-08-26" },
    ];
    expect(chequesARetirar(filas, HOY_SEP)).toEqual([]);
  });

  it("sin `fecha_depositado` cae a la de vencimiento, nunca a «hoy»", () => {
    // Caer a "hoy" dejaría vivo para siempre a un cheque sin esa fecha.
    const filas = [
      { id: "a", estado: "depositado", fecha_deposito: "2024-01-01", fecha_depositado: null },
    ];
    expect(chequesARetirar(filas, HOY_SEP)).toEqual(["a"]);
  });

  it("lo ya retirado no se vuelve a tocar (la limpieza es idempotente)", () => {
    const filas = [
      { id: "a", estado: "depositado", deleted: true, fecha_deposito: "2024-01-01", fecha_depositado: "2024-01-05" },
    ];
    expect(chequesARetirar(filas, HOY_SEP)).toEqual([]);
  });

  it("🔴 y se retira con SOFT DELETE — el cron no hace un solo `.delete()`", () => {
    const src = plano(leer("src/lib/cheques-alert.ts"));
    expect(src).toContain("deleted: true");
    expect(src).not.toMatch(/\.delete\(\)/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("G · EL MENSAJE — tres bloques al grupo, uno al privado", () => {
  it("🔴 la línea de WhatsApp se fue del aviso de cheques", () => {
    const t = construirMensaje(
      [{ cliente: "X", empresa: "vistana", monto: 100, fecha_deposito: HOY }],
      HOY,
    );
    expect(t).not.toContain("WhatsApp");
    expect(t).not.toContain("50766745522");
    expect(t).not.toContain("50766494096");
    // CONTROL: el resto del texto NO se tocó, palabra por palabra.
    expect(t).toContain("⚠️ 1 cheque por vencer — $100.00");
    expect(t).toContain("• X (Vistana International) $100.00 — HOY");
  });

  it("y el número no quedó escondido en ningún lado del módulo", () => {
    for (const f of ["src/lib/cheques-aviso-ventana.ts", "src/lib/cheques-alert.ts"]) {
      const src = plano(leer(f));
      expect(src, f).not.toContain("50766745522");
      expect(src, f).not.toContain("WA_NUMBERS");
    }
  });

  it("`unirAviso` respeta el ORDEN y descarta los bloques vacíos", () => {
    expect(unirAviso("cheques", "", "recordatorios")).toBe("cheques\n\nrecordatorios");
    expect(unirAviso("", "", "")).toBe("");
    expect(unirAviso("a", "b", "c")).toBe("a\n\nb\n\nc");
  });

  it("🔴 el privado sale por `enviarNegocioPrivado`, SIN el prefijo de sistema", () => {
    // Mismo patrón que el resumen diario de ACS: destino de sistema, trato de
    // negocio. Rotular un recordatorio como avería sería mentir en la
    // notificación del celular.
    const src = plano(leer("src/lib/cheques-alert.ts"));
    expect(src).toContain("enviarNegocioPrivado");
    expect(src).toContain("enviarNegocio(");
    expect(src).not.toContain("enviarSistema");
    expect(src).not.toContain("PREFIJO_SISTEMA");
    // Y nadie llama a Telegram por la puerta de atrás.
    expect(src).not.toContain("sendTelegramAlert");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("H · LA MIGRACIÓN — aditiva, y el CHECK de la base = el código", () => {
  const ARCHIVO = "supabase/migrations/20260925130000_recordatorios_rediseno.sql";
  const SQL = leer(ARCHIVO).replace(/^--.*$/gm, " ");

  it("existe y es ADITIVA: nada se borra, nada se reescribe", () => {
    expect(SQL).not.toMatch(/\bDROP\s+TABLE\b/i);
    expect(SQL).not.toMatch(/\bDROP\s+COLUMN\b/i);
    expect(SQL).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(SQL).not.toMatch(/\bTRUNCATE\b/i);
    expect(SQL).not.toMatch(/\bUPDATE\s+(cheques|recordatorios)\b/i);
  });

  it("🔴 el CHECK de `repeticion` admite EXACTAMENTE lo que admite el código", () => {
    const m = SQL.match(/CHECK \(repeticion IN \(([^)]*)\)\)/);
    expect(m, "no se encontró el CHECK de repeticion").toBeTruthy();
    const enSql = m![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(enSql.sort()).toEqual([...REPETICIONES].sort());
  });

  it("🔴 y el de `destino` también", () => {
    const m = SQL.match(/CHECK \(destino IN \(([^)]*)\)\)/);
    expect(m, "no se encontró el CHECK de destino").toBeTruthy();
    const enSql = m![1].split(",").map((s) => s.trim().replace(/'/g, ""));
    expect(enSql.sort()).toEqual([...DESTINOS].sort());
  });

  it("el default de `destino` es `equipo` (la fila que existe no cambia)", () => {
    expect(SQL).toMatch(/destino\s+text\s+NOT NULL\s+DEFAULT\s+'equipo'/);
  });

  it("un «hasta» sin repetición, o anterior al arranque, lo frena la BASE también", () => {
    expect(SQL).toContain("repeticion <> 'una_vez' AND hasta >= fecha");
  });

  it("`cheques` gana la memoria del aviso y la fecha del borrado, y nada más", () => {
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS aviso_vencido_en timestamptz");
    expect(SQL).toContain("ADD COLUMN IF NOT EXISTS deleted_at timestamptz");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("I · EL CRON — 9:00 a.m. de Panamá, una sola ocurrencia al día", () => {
  const vercel = JSON.parse(leer("vercel.json")) as {
    crons: Array<{ path: string; schedule: string }>;
  };

  it("🔴 `cheques-alert` corre a las 14:00 UTC = 9:00 a.m. Panamá (UTC−5 fijo)", () => {
    const filas = vercel.crons.filter((c) => c.path === "/api/cron/cheques-alert");
    expect(filas).toHaveLength(1); // una entrada = una ocurrencia al día
    expect(filas[0].schedule).toBe("0 14 * * *");
    // Y no quedó una lista de horas escondida, que Vercel Pro sí acepta.
    expect(filas[0].schedule).not.toContain(",");
  });

  it("la recuperación de la reconciliación NO se le adelanta", () => {
    // Con hora mínima 14 la pasada de las 14:00 empataría con su propio run, y
    // recuperar algo que todavía no falló no es recuperar.
    const src = leer("src/lib/cron-telemetry.ts");
    expect(src).toMatch(/"cheques-alert":\s*15/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe("J · LA DIRECCIÓN — /cheques sigue llegando a /recordatorios", () => {
  const cfg = leer("next.config.js");

  it("🔴 hay redirect de `/cheques` a `/recordatorios`", () => {
    expect(cfg).toMatch(
      /source:\s*"\/cheques"\s*,\s*destination:\s*"\/recordatorios"/,
    );
  });

  it("y la pantalla vieja ya no existe", () => {
    for (const rel of ["src/app/cheques/page.tsx", "src/app/cheques/ChequesClient.tsx"]) {
      expect(fs.existsSync(path.join(RAIZ, rel)), rel).toBe(false);
    }
    expect(fs.existsSync(path.join(RAIZ, "src/app/recordatorios/page.tsx"))).toBe(true);
  });

  it("🔴 ningún enlace interno sigue apuntando a `/cheques`", () => {
    for (const f of [
      "src/lib/modules.ts",
      "src/components/SearchBar.tsx",
      "src/lib/moduleColors.ts",
      "src/lib/hooks/useKeyboardShortcuts.ts",
    ]) {
      const src = plano(leer(f));
      expect(src, f).not.toMatch(/["']\/cheques(\?|["'])/);
    }
  });

  it("los archivos de la pantalla respetan el límite de 800 líneas de la casa", () => {
    // El archivo que reemplazan tenía 1.693.
    const dir = path.join(RAIZ, "src/app/recordatorios");
    const anda = (d: string): string[] =>
      fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? anda(path.join(d, e.name)) : [path.join(d, e.name)],
      );
    for (const f of anda(dir)) {
      const lineas = fs.readFileSync(f, "utf8").split("\n").length;
      expect(lineas, `${path.basename(f)} tiene ${lineas} líneas`).toBeLessThanOrEqual(800);
    }
  });
});
