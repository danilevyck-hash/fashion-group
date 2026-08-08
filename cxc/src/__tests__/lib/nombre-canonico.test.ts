// ─────────────────────────────────────────────────────────────────────────────
// EL NOMBRE DE UN CLIENTE NO LO PUEDE DECIDIR EL RELOJ.
//
// 🩸 El hueco (medido contra producción, 8-ago-2026): `syncClientesMaster` se
// quedaba con la fila de `synced_at` más reciente, o sea con **la empresa cuyo
// cron corrió último** (joystep, 05:42). Como cada empresa de Switch lleva su
// PROPIA numeración, hay códigos con más de un nombre — y para esos el resultado
// no era una función de los datos: mover una entrada de `vercel.json` 15 minutos
// habría renombrado clientes en el Directorio, en Guías, en Cheques y en el
// buscador, en silencio.
//
// Los 3 casos REALES están abajo como test, con los repartos medidos:
//   D-134  "Rey Store" (5)          vs  "Rey Store (Agua)" (vistana)
//   D-170  "Nova Lux, S.A." (5)     vs  "El Machetazo-Calidonia" (active_wear)
//   D-26   "City Moda Chorrera" (4) vs  "City Moda" (active_wear, fashion_wear)
//
// El test mira las DOS direcciones: que la regla sea estable **y** que el
// ganador siga siendo el de hoy (0 de 5.059 códigos cambian de nombre —
// verificado con `scripts/_verif-nombre-canonico.ts`).
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";

vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

import {
  elegirNombreCanonico,
  codigosAmbiguos,
  type CandidatoNombre,
} from "@/lib/clientes/nombre-canonico";

const c = (empresa_key: string, nombre: string | null): CandidatoNombre => ({ empresa_key, nombre });

// Los tres códigos ambiguos REALES, tal como los devuelve producción.
const D134 = [
  c("active_shoes", "Rey Store"), c("active_wear", "Rey Store"), c("fashion_shoes", "Rey Store"),
  c("fashion_wear", "Rey Store"), c("joystep", "Rey Store"), c("vistana", "Rey Store (Agua)"),
];
const D170 = [
  c("active_shoes", "Nova Lux, S.A."), c("fashion_shoes", "Nova Lux, S.A."),
  c("fashion_wear", "Nova Lux, S.A."), c("joystep", "Nova Lux, S.A."),
  c("vistana", "Nova Lux, S.A."), c("active_wear", "El Machetazo-Calidonia"),
];
const D26 = [
  c("active_shoes", "City Moda Chorrera"), c("fashion_shoes", "City Moda Chorrera"),
  c("joystep", "City Moda Chorrera"), c("vistana", "City Moda Chorrera"),
  c("active_wear", "City Moda"), c("fashion_wear", "City Moda"),
];

describe("gana el nombre que MÁS empresas comparten", () => {
  it.each([
    ["D-134", D134, "Rey Store"],
    ["D-170", D170, "Nova Lux, S.A."],
    ["D-26", D26, "City Moda Chorrera"],
  ])("%s conserva el nombre que ya tiene hoy en producción", (_cod, filas, esperado) => {
    expect(elegirNombreCanonico(filas)).toBe(esperado);
  });

  it("el resultado NO depende del orden en que llegan las filas", () => {
    // Es lo que rompía: el orden lo daba `synced_at`, o sea el calendario.
    const alReves = [...D170].reverse();
    const mezclado = [D170[5], D170[2], D170[0], D170[4], D170[1], D170[3]];
    expect(elegirNombreCanonico(alReves)).toBe("Nova Lux, S.A.");
    expect(elegirNombreCanonico(mezclado)).toBe("Nova Lux, S.A.");
  });

  it("con UNA sola empresa, ese nombre gana", () => {
    expect(elegirNombreCanonico([c("vistana", "Cliente Único")])).toBe("Cliente Único");
  });

  it("mayoría chica también manda: 2 contra 1", () => {
    expect(
      elegirNombreCanonico([c("joystep", "B"), c("active_wear", "A"), c("fashion_wear", "A")]),
    ).toBe("A");
  });
});

describe("los empates los rompe una LISTA, no un horario", () => {
  it("empate 1-1 → gana la empresa que va antes en EMPRESAS_DEL_GRUPO", () => {
    // vistana es la primera de la lista; joystep la última.
    expect(elegirNombreCanonico([c("joystep", "Zeta"), c("vistana", "Alfa")])).toBe("Alfa");
    expect(elegirNombreCanonico([c("vistana", "Alfa"), c("joystep", "Zeta")])).toBe("Alfa");
  });

  it("empate 2-2 → mismo criterio, y sigue sin depender del orden", () => {
    const filas = [
      c("fashion_shoes", "X"), c("joystep", "X"),
      c("vistana", "Y"), c("fashion_wear", "Y"),
    ];
    expect(elegirNombreCanonico(filas)).toBe("Y");
    expect(elegirNombreCanonico([...filas].reverse())).toBe("Y");
  });

  it("una empresa fuera del grupo (Boston) nunca gana un empate", () => {
    expect(
      elegirNombreCanonico([c("confecciones_boston", "BOSTON"), c("joystep", "GRUPO")]),
    ).toBe("GRUPO");
  });
});

describe("nombres vacíos y basura", () => {
  it("sin ningún nombre devuelve null (el sync lo cuenta como saltado)", () => {
    expect(elegirNombreCanonico([])).toBeNull();
    expect(elegirNombreCanonico([c("vistana", null), c("joystep", "   ")])).toBeNull();
  });

  it("una empresa con el nombre en blanco no le gana a la que sí lo tiene", () => {
    expect(elegirNombreCanonico([c("vistana", ""), c("joystep", "Real")])).toBe("Real");
  });

  it("dos formas de escribir el MISMO nombre son UNA variante, no dos", () => {
    // "Nova Lux, S.A." y "NOVA LUX SA" normalizan igual: si contaran como dos
    // variantes, la mayoría se partiría al medio y ganaría cualquier cosa.
    const filas = [
      c("vistana", "Nova Lux, S.A."), c("joystep", "NOVA LUX SA"),
      c("active_wear", "El Machetazo-Calidonia"),
    ];
    expect(elegirNombreCanonico(filas)).toBe("Nova Lux, S.A.");
    expect(codigosAmbiguos(new Map([["D-170", filas]]))[0].variantes).toHaveLength(2);
  });
});

describe("codigosAmbiguos — lo que hay que corregir EN Switch", () => {
  const mapa = new Map<string, CandidatoNombre[]>([
    ["D-134", D134],
    ["D-170", D170],
    ["D-26", D26],
    ["D-80", [c("vistana", "Jerusalem De Panama"), c("joystep", "Jerusalem De Panama")]],
    ["TCKCTA", [c("vistana", "VENTAS"), c("fashion_shoes", "VENTAS LOCA"), c("joystep", "Contado")]],
  ]);

  it("devuelve SOLO los que llevan más de un nombre", () => {
    expect(codigosAmbiguos(mapa).map((a) => a.codigo)).toEqual(["D-134", "D-170", "D-26"]);
  });

  it("un código con un solo nombre en 2 empresas NO es ambiguo", () => {
    expect(codigosAmbiguos(mapa).find((a) => a.codigo === "D-80")).toBeUndefined();
  });

  it("TCKCTA queda fuera a propósito — es el mostrador, se llama distinto por diseño", () => {
    expect(codigosAmbiguos(mapa).find((a) => a.codigo === "TCKCTA")).toBeUndefined();
  });

  it("la variante GANADORA va primera, con sus empresas", () => {
    const d170 = codigosAmbiguos(mapa).find((a) => a.codigo === "D-170")!;
    expect(d170.variantes[0].nombre).toBe("Nova Lux, S.A.");
    expect(d170.variantes[0].empresas).toHaveLength(5);
    expect(d170.variantes[1].nombre).toBe("El Machetazo-Calidonia");
    expect(d170.variantes[1].empresas).toEqual(["active_wear"]);
  });

  it("sin ambigüedades devuelve lista vacía, no null", () => {
    expect(codigosAmbiguos(new Map([["D-1", [c("vistana", "Uno")]]]))).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("BARRIDO ESTÁTICO — el sync no puede volver a los dos defectos", () => {
  const leer = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
  const SYNC = "src/lib/switch-api/sync-clientes-master.ts";

  it("el nombre lo elige el módulo puro, no el sync a mano", () => {
    expect(leer(SYNC)).toContain("elegirNombreCanonico");
  });

  it("NO se pagina por `synced_at` — es una columna que el sync reescribe", () => {
    // Paginar por una llave que se mueve entre una página y la siguiente saltea
    // o repite filas, en silencio y sin error. Boston son 4.915 de las 5.750
    // filas y su sync de las 06:30 puede solaparse con este de las 07:00.
    const src = leer(SYNC);
    expect(src).not.toMatch(/\.order\(\s*"synced_at"/);
    expect(src).toMatch(/\.order\(\s*"id"/);
  });

  it("se pagina con el helper que VERIFICA contra el count", () => {
    const src = leer(SYNC);
    expect(src).toContain("leerTodoPaginado");
    // El bucle a mano con PAGE=1000 ya no existe.
    expect(src).not.toMatch(/const PAGE = 1000/);
  });

  it("los códigos ambiguos salen en el resultado, no se los traga el sync", () => {
    expect(leer(SYNC)).toContain("codigos_ambiguos");
    expect(leer("src/app/api/cron/sync-clientes-master/route.ts")).toContain("codigos_ambiguos");
  });

  it("el aviso de ambigüedad NO manda Telegram", () => {
    // La lista cerrada de 3 alertas de sistema no lo incluye, y sólo Daniel
    // puede arreglarlo (en el panel de Switch): sería la alerta que suena para
    // siempre, el modo de fallo con el que este repo ya se quemó dos veces.
    const route = leer("src/app/api/cron/sync-clientes-master/route.ts");
    const i = route.indexOf("codigos_ambiguos.length > 0");
    expect(i).toBeGreaterThan(-1);
    expect(route.slice(i, i + 600)).not.toMatch(/enviarSistema|enviarNegocio|sendTelegram/);
  });
});
