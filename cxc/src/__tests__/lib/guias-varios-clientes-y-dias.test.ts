/**
 * ─────────────────────────────────────────────────────────────────────────────
 * GUÍAS › NUEVA GUÍA — VARIOS CLIENTES EN UNA GUÍA, Y LOS DÍAS PLEGADOS.
 * (las DECISIONES, en el módulo puro; la pantalla, en el `.tsx` hermano)
 *
 * Daniel, textual (10-sep-2026):
 *   · *«Una guía lleva facturas de varios clientes en un mismo despacho»*
 *   · *«un cliente a la vez»*, *«se quedan abajo»*,
 *     *«un renglón por cliente-empresa, pueden haber más de una factura en ese
 *     renglón»*
 *   · *«al menos déjame poder desplegar más días y que no me llene la
 *     pantalla»*, *«que se pueda desplegar los días, que ya venga plegado solo
 *     el último día desplegado by default»*
 *   · *«el ya salió no me molesta»* — la etiqueta se queda COMPLETA.
 *
 * 🔴 NADA DE ESTO CAMBIA LO QUE SE GUARDA: el último bloque compara, byte a
 * byte con `instantaneaRenglones`, la guía de DOS clientes armada con el atajo
 * contra la misma guía escrita a mano.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import {
  alternarDia,
  diaAbierto,
  marcarFactura,
  resumenDelDia,
  type RenglonDeGuia,
} from "@/lib/guias/atajos-facturas";
import { instantaneaRenglones } from "@/lib/guias/cambios-form";

const HOY = "2026-09-04";
const AYER = "2026-09-03";
const ANTEAYER = "2026-09-02";

function vacia(orden = 1): RenglonDeGuia {
  return {
    uid: `u${orden}`,
    orden,
    cliente: "",
    cliente_codigo: "",
    direccion: "",
    empresa: "",
    facturas: "",
    bultos: 0,
    numero_guia_transp: "",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Solo el día más reciente abre solo
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 los días vienen PLEGADOS, menos el más reciente", () => {
  const nadaTocado = new Set<string>();

  it("el día de arriba abre; los de abajo, no", () => {
    expect(diaAbierto(HOY, HOY, nadaTocado)).toBe(true);
    expect(diaAbierto(AYER, HOY, nadaTocado)).toBe(false);
    expect(diaAbierto(ANTEAYER, HOY, nadaTocado)).toBe(false);
  });

  it("un toque lo abre, y otro lo vuelve a plegar", () => {
    const abierto = alternarDia(nadaTocado, AYER);
    expect(diaAbierto(AYER, HOY, abierto)).toBe(true);
    const plegadoOtraVez = alternarDia(abierto, AYER);
    expect(diaAbierto(AYER, HOY, plegadoOtraVez)).toBe(false);
  });

  it("el más reciente también se puede PLEGAR (no está clavado abierto)", () => {
    expect(diaAbierto(HOY, HOY, alternarDia(nadaTocado, HOY))).toBe(false);
  });

  it("🔴 «Ver más días» trae días PLEGADOS: ninguno de ellos es el más reciente", () => {
    // Los tres que ya estaban + tres que llegan. Solo el de arriba sigue abierto.
    const nuevos = ["2026-08-30", "2026-08-29", "2026-08-28"];
    for (const d of nuevos) expect(diaAbierto(d, HOY, nadaTocado)).toBe(false);
  });

  it("🔑 un día que se abrió a mano SIGUE abierto cuando llegan más días", () => {
    // Es el motivo de que el estado sean los días ALTERNADOS y no «los abiertos»:
    // así no hace falta ningún efecto de inicialización al crecer la lista.
    const tocados = alternarDia(new Set<string>(), AYER);
    expect(diaAbierto(AYER, HOY, tocados)).toBe(true);
    expect(diaAbierto("2026-08-28", HOY, tocados)).toBe(false);
  });

  it("sin ningún día (lista vacía) nada abre y nada revienta", () => {
    expect(diaAbierto(HOY, null, nadaTocado)).toBe(false);
  });

  it("alternar NO muta el conjunto anterior (inmutable, como todo acá)", () => {
    const antes = new Set<string>([AYER]);
    const despues = alternarDia(antes, ANTEAYER);
    expect([...antes]).toEqual([AYER]);
    expect(despues.has(ANTEAYER)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. El encabezado dice CUÁNTAS facturas tiene el día
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 el día plegado dice cuántas facturas esconde", () => {
  it("plural y singular, en español neutro", () => {
    expect(resumenDelDia(12, 0, false)).toBe("12 facturas");
    expect(resumenDelDia(1, 0, false)).toBe("1 factura");
  });

  it("plegado y con facturas ya marcadas, lo DICE — si no, escondería trabajo hecho", () => {
    expect(resumenDelDia(12, 2, false)).toBe("12 facturas · 2 marcadas");
    expect(resumenDelDia(5, 1, false)).toBe("5 facturas · 1 marcada");
  });

  it("🔴 abierto NO repite las marcadas: las casillas se ven (palabra de más)", () => {
    expect(resumenDelDia(12, 2, true)).toBe("12 facturas");
    expect(resumenDelDia(17, 17, true)).toBe("17 facturas");
  });

  it("sin ninguna marcada tampoco se dice nada", () => {
    expect(resumenDelDia(17, 0, false)).toBe("17 facturas");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. 🔴 EL PAYLOAD NO CAMBIA — dos clientes, byte a byte
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 varios clientes en una guía producen EXACTAMENTE lo mismo que escribirlo a mano", () => {
  const CITY = { nombre: "City Mall David", codigo: "D-24" };
  const SPORTING = { nombre: "Sporting Shoes N 4", codigo: "D-142" };

  it("marcar dos clientes × varias facturas = los mismos renglones (instantaneaRenglones)", () => {
    // Camino 1: el atajo. Primer cliente, dos empresas…
    let atajo: RenglonDeGuia[] = [vacia()];
    atajo = marcarFactura(atajo, CITY, { empresa: "Vistana International", secuencial: "2535" });
    atajo = marcarFactura(atajo, CITY, { empresa: "Vistana International", secuencial: "2536" });
    atajo = marcarFactura(atajo, CITY, { empresa: "Fashion Wear", secuencial: "7001" });
    // …y después «+ Otro cliente»: se limpia el BUSCADOR, no los renglones, y
    // se sigue marcando encima de los mismos `items`.
    atajo = marcarFactura(atajo, SPORTING, { empresa: "Fashion Wear", secuencial: "7010" });
    atajo = marcarFactura(atajo, SPORTING, { empresa: "Fashion Wear", secuencial: "7011" });
    // La persona escribe destino y bultos por renglón, como en el formulario.
    const destinos = ["David", "David", "Los Andes"];
    const bultos = [3, 2, 7];
    atajo = atajo.map((r, i) => ({ ...r, direccion: destinos[i], bultos: bultos[i] }));

    // Camino 2: a mano, exactamente como hoy — un renglón por cliente-empresa.
    const aMano: RenglonDeGuia[] = [
      { orden: 1, cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Vistana International", facturas: "2535, 2536", bultos: 3, numero_guia_transp: "" },
      { orden: 2, cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Fashion Wear", facturas: "7001", bultos: 2, numero_guia_transp: "" },
      { orden: 3, cliente: "Sporting Shoes N 4", cliente_codigo: "D-142", direccion: "Los Andes", empresa: "Fashion Wear", facturas: "7010, 7011", bultos: 7, numero_guia_transp: "" },
    ];

    expect(instantaneaRenglones(atajo)).toBe(instantaneaRenglones(aMano));
  });

  it("🔴 el segundo cliente NO se mete en el renglón del primero, ni aunque compartan empresa", () => {
    let items: RenglonDeGuia[] = [vacia()];
    items = marcarFactura(items, CITY, { empresa: "Fashion Wear", secuencial: "7001" });
    items = marcarFactura(items, SPORTING, { empresa: "Fashion Wear", secuencial: "7010" });
    expect(items).toHaveLength(2);
    expect(items.map((r) => [r.cliente_codigo, r.empresa, r.facturas])).toEqual([
      ["D-24", "Fashion Wear", "7001"],
      ["D-142", "Fashion Wear", "7010"],
    ]);
  });
});
