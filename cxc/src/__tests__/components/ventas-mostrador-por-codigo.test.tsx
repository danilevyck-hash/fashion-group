// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — LA FILA ÁMBAR «MOSTRADOR» DICE EL MOSTRADOR ENTERO
//
// El defecto (2-sep-2026): la fila decía **$25.835,65** cuando el mostrador del
// grupo es **$54.478,59**. Faltaba el 53% — y es un número que Daniel lee.
//
// ── LA CAUSA ────────────────────────────────────────────────────────────────
// `ClientesView.tsx` marcaba la fila comparando `nombre === "VENTAS LOCAL"`.
//
// 🩸 **IDENTIFICAR UN CLIENTE POR SU NOMBRE FALLA PORQUE EL NOMBRE ES DE CADA
// EMPRESA; EL CÓDIGO ES DEL GRUPO.** El mostrador es `TCKCTA` en las seis y se
// llama distinto en cada una (medido en `switch_clientes`):
//
//     Contado      → joystep · active_wear · active_shoes
//     VENTAS       → fashion_wear · vistana
//     VENTAS LOCA  → fashion_shoes   (truncado por Switch)
//
// **Ninguna se llama "VENTAS LOCAL".** Ese texto salía de `clientes_master`,
// que tiene UNA fila `TCKCTA` con el nombre canónico, y el join se lo pegaba
// encima a la única fila que sobrevivía al filtro por nombre del SQL. Por eso a
// veces coincidía y casi siempre no.
//
// Es la misma regla que el commit 44be9b16 fijó esa mañana para todo el
// ranking (*"se debería de usar el código del cliente, ya que todos los D-24
// son de City Mall across mis 6 empresas"*). El defecto seguía vivo un piso más
// arriba: acá y en el `filtered` del SQL
// (`20260908120000_mostrador_por_codigo.sql`).
//
// ── 🔑 POR QUÉ ESTE CANDADO MIDE PLATA Y NO SELECTORES ──────────────────────
// Un test que solo mirara «¿compara por código?» habría pasado en verde con la
// fila diciendo un sexto del total: el bug NO era el selector, era que el número
// se armaba con un `find` en vez de una suma. Acá se monta la pantalla REAL con
// las seis empresas y se lee el monto que el navegador habría pintado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

// `mundos.ts` (vía el re-export) importa Supabase del servidor en otros tests;
// acá se dobla por las dudas, igual que en el resto de esta carpeta.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: { from: () => ({}) } }));
vi.mock("@/lib/supabase-paginado", () => ({ leerTodoPaginado: async () => [] }));

import { ClientesView } from "@/components/ventas/ClientesView";
import { CODIGO_MOSTRADOR } from "@/lib/clientes/mostrador";
import { EMPRESA_KEY_TO_NAME } from "@/lib/empresa-mapping";

afterEach(cleanup);

type Fila = Record<string, unknown>;

const fila = (over: Partial<Fila> = {}): Fila => ({
  rank: 1,
  id: "D-24",
  nombre: "City Mall David",
  empresa: "Vistana International",
  empresaKey: "vistana",
  ytd: 113936.14,
  prev: 90000,
  delta: 0.26,
  ultima: "1 sep 2026",
  ultimaIso: "2026-09-01",
  wa: "",
  empresas_count: 1,
  isOrphan: false,
  esDelGrupo: false,
  ...over,
});

/**
 * EL MOSTRADOR REAL DEL GRUPO — medido contra producción el 2-sep-2026 con
 * `subtotal_descuento`, que es la MISMA columna con la que el ranking arma
 * "Compras 2026" de cada cliente. Medirlo con `subtotal` (bruto) daría
 * $55.555,49 y pondría esta fila en otra base que la columna de al lado.
 *
 * Los nombres son los CRUDOS de Switch a propósito: ninguno es "VENTAS LOCAL".
 * Si la pantalla volviera a identificar por nombre, este fixture da $0,00.
 */
const MOSTRADOR = [
  { empresaKey: "fashion_shoes", nombre: "VENTAS LOCA", ytd: 25835.65, ultimaIso: "2026-09-02" },
  { empresaKey: "fashion_wear",  nombre: "VENTAS",      ytd: 15264.12, ultimaIso: "2026-09-01" },
  { empresaKey: "vistana",       nombre: "VENTAS",      ytd:  6847.75, ultimaIso: "2026-08-30" },
  { empresaKey: "active_wear",   nombre: "Contado",     ytd:  3691.50, ultimaIso: "2026-08-29" },
  { empresaKey: "active_shoes",  nombre: "Contado",     ytd:  2220.20, ultimaIso: "2026-08-28" },
  { empresaKey: "joystep",       nombre: "Contado",     ytd:   619.37, ultimaIso: "2026-08-27" },
] as const;

const TOTAL_MOSTRADOR = "$54,478.59";
const SOLO_FASHION_SHOES = "$25,835.65";

const filasMostrador = () =>
  MOSTRADOR.map((m) =>
    fila({
      id: CODIGO_MOSTRADOR,
      nombre: m.nombre,
      empresaKey: m.empresaKey,
      empresa: EMPRESA_KEY_TO_NAME[m.empresaKey as keyof typeof EMPRESA_KEY_TO_NAME] ?? m.empresaKey,
      ytd: m.ytd,
      prev: 0,
      delta: 0,
      ultima: "2 sep 2026",
      ultimaIso: m.ultimaIso,
    }),
  );

function pintar(rows: Fila[]) {
  const data = { rows } as unknown as Parameters<typeof ClientesView>[0]["data"];
  return render(<ClientesView data={data} selectedYear={2026} isClosedYear={false} />);
}

/** El monto de la fila ámbar, leído por su ancla estable. Hay dos renders (la
 *  tabla del escritorio y la tarjeta del celular) y los DOS tienen que decir lo
 *  mismo: que uno solo esté bien es medio arreglo. */
function montosDeLaFilaMostrador(): string[] {
  const anclas = [...document.querySelectorAll("[data-fila-mostrador]")];
  expect(anclas.length, "la fila ámbar no se pintó en las dos pantallas").toBe(2);
  return anclas.map((a) => a.querySelector('[data-col="ytd"]')?.textContent?.trim() ?? "");
}

/** Los pares `empresa|codigo` de las filas del RANKING. */
function filasDelRanking(): string[] {
  return [...document.querySelectorAll("[data-fila-cliente]")].map(
    (e) => e.getAttribute("data-fila-cliente") ?? "",
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("la fila ámbar suma las SEIS empresas, no una", () => {
  it("dice el mostrador del grupo entero", () => {
    pintar([fila(), ...filasMostrador()]);
    for (const monto of montosDeLaFilaMostrador()) expect(monto).toBe(TOTAL_MOSTRADOR);
  });

  it("y NO el de fashion_shoes solo, que es lo que decía", () => {
    // El número exacto del defecto. Si vuelve, este `it` lo nombra.
    pintar([fila(), ...filasMostrador()]);
    for (const monto of montosDeLaFilaMostrador()) expect(monto).not.toBe(SOLO_FASHION_SHOES);
  });

  it("con UNA sola empresa elegida dice la de esa empresa — coherente con el filtro", () => {
    // El servidor ya filtró por empresa: llega una sola fila de mostrador y la
    // pantalla suma lo que llegó. Si acá apareciera el total del grupo, la fila
    // estaría sumando empresas que el usuario excluyó.
    pintar([fila({ empresaKey: "fashion_shoes" }), filasMostrador()[0]]);
    for (const monto of montosDeLaFilaMostrador()) expect(monto).toBe(SOLO_FASHION_SHOES);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la identidad es el CÓDIGO, nunca el nombre", () => {
  it("reconoce las seis aunque se llamen de tres maneras distintas", () => {
    // Ninguno de los seis nombres del fixture es "VENTAS LOCAL". Comparar por
    // nombre daría $0,00 acá — y en producción daba una empresa de seis, porque
    // `clientes_master` le pegaba el nombre canónico a la única sobreviviente.
    pintar([fila(), ...filasMostrador()]);
    for (const monto of montosDeLaFilaMostrador()) expect(monto).toBe(TOTAL_MOSTRADOR);
  });

  it("un cliente REAL llamado «VENTAS LOCAL» es un cliente, y va al ranking", () => {
    // La trampa exacta del criterio viejo, al revés: el nombre coincide pero el
    // código es de un cliente de verdad. Tiene que quedar EN la lista y NO en la
    // fila ámbar. (Existe el precedente: "VENTAS MAHER" es cliente real.)
    const impostor = fila({ id: "D-99", nombre: "VENTAS LOCAL", empresaKey: "vistana", ytd: 7777.77 });
    pintar([impostor, ...filasMostrador()]);

    expect(filasDelRanking()).toContain("vistana|D-99");
    for (const monto of montosDeLaFilaMostrador()) expect(monto).toBe(TOTAL_MOSTRADOR);
  });

  it("el mostrador NO entra al ranking de clientes — no es un cliente", () => {
    pintar([fila(), ...filasMostrador()]);
    for (const par of filasDelRanking()) expect(par).not.toContain(CODIGO_MOSTRADOR);
    // Y queda EXACTAMENTE el cliente de verdad: una fila en la tabla del
    // escritorio y una tarjeta en el celular, ni una más.
    expect(filasDelRanking()).toEqual(["vistana|D-24", "vistana|D-24"]);
  });

  it("sin ninguna fila de mostrador, la fila ámbar no existe", () => {
    pintar([fila()]);
    expect(document.querySelectorAll("[data-fila-mostrador]").length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("el SQL le deja llegar las seis a la pantalla", () => {
  // La pantalla no puede sumar lo que nunca le llegó: hasta hoy el `filtered`
  // del ranking sacaba los genéricos POR NOMBRE ('CONTADO', 'VENTAS'), y de los
  // seis mostradores solo pasaba fashion_shoes — de casualidad, porque Switch
  // escribe 'VENTAS LOCA' y la lista dice 'VENTAS LOCALES'.
  const sql = fs.readFileSync(
    path.join(process.cwd(), "supabase/migrations/20260908120000_mostrador_por_codigo.sql"),
    "utf8",
  );
  const ejecutable = sql
    .split("\n")
    .filter((l) => !l.trim().startsWith("--"))
    .join("\n");
  const bloquesFiltered = [...ejecutable.matchAll(/filtered AS \(([\s\S]*?)\n\s*\),/g)].map((m) => m[1]);

  it("las DOS ramas (año en curso y años cerrados) dejan pasar el mostrador por código", () => {
    expect(bloquesFiltered.length, "no se encontraron los dos `filtered`").toBe(2);
    for (const b of bloquesFiltered) {
      expect(b, "este filtro no menciona el código del mostrador").toContain("'TCKCTA'");
      expect(b, "el mostrador tiene que pasar atado a que sea del grupo").toMatch(
        /del_grupo\s+AND\s+\S*cliente_codigo\s*=\s*'TCKCTA'/,
      );
    }
  });

  it("`del_grupo` sale del corte que la vista YA hacía, no de una lista nueva", () => {
    // Una cuarta copia escrita a mano de las seis empresas es el defecto que
    // esta casa ya pagó cuatro veces. La bandera se deriva del UNION que separa
    // la rama del grupo de la del resto.
    expect(ejecutable).toContain("SELECT *, true  AS del_grupo FROM src_a");
    expect(ejecutable).toContain("SELECT *, false AS del_grupo FROM src_b");
  });

  it("no toca ninguna fuente de totales de venta", () => {
    for (const fuente of [
      "ventas_dashboard_summary",
      "ventas_rollup_mensual_mv",
      "comision_b2b_v5",
      "switch_estadocuenta_aging",
      "cliente_ficha_ventas",
    ]) {
      expect(ejecutable, `${fuente} no se toca en este arreglo`).not.toContain(fuente);
    }
  });

  it("'VENTAS LOCALES' sigue excluido — no es el mostrador", () => {
    // Son facturas con un `cliente_switch_id` que `switch_clientes` ya no conoce
    // ($1.933,73 en 2026, sin código). Ya eran huérfanas antes de este cambio.
    for (const b of bloquesFiltered) expect(b).toContain("'VENTAS LOCALES'");
  });
});
