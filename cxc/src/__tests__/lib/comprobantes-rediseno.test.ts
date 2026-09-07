/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CANDADO — EL REDISEÑO DE LA LISTA DE COMPROBANTES (6-sep-2026)
 *
 * Las REGLAS puras del cambio. Lo que se dibuja se mide aparte, montando la
 * pantalla (`comprobantes-rediseno-pantalla.test.tsx`): un barrido de texto se
 * cumple con su propio comentario, y este repo ya pagó ese defecto.
 *
 * Lo que vigila, cambio por cambio:
 *   1. Los DOS filtros son píldoras con rótulo, y lo que está en CERO no
 *      aparece — salvo el chip activo, que si se escondiera dejaría la pantalla
 *      sin forma de volver.
 *   2. Los rótulos son «Del cliente» y «Del vendedor». 🔑 Se verificó primero
 *      QUÉ filtra cada uno: «Míos» NO era del usuario que entró.
 *   3. Los conteos cuentan lo que se está MIRANDO, con el otro filtro puesto.
 *   4. «Sin mandar» son los CONFIRMADOS que no llegaron a Switch — nunca los
 *      borradores, nunca el pedido del link sin convertir. Medido: 2 en
 *      producción (PED-004 y CKP-020), no 7.
 *   5. El pedido del link que nadie confirmó dura 30 días en la lista; el resto,
 *      90. Nada se borra: sale por «Ver más», el mismo mecanismo.
 *   6. La lista abre en el mes que TIENE comprobantes, y el encabezado dice
 *      «Julio de 2026», no «Julio De 2026».
 *   7. El papel de la fila dice la MISMA palabra que el del detalle.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  FILTROS_ORIGEN,
  ORIGEN_LABEL,
  pasaFiltroOrigen,
  ROTULO_GRUPO_ORIGEN,
} from "@/lib/catalogo/origen-comprobante";
import {
  gruposDeChips,
  pasaLosDosFiltros,
  pasaVista,
  ROTULO_GRUPO_VISTA,
  VISTAS_COMPROBANTE,
  type FilaParaChips,
} from "@/lib/catalogo/chips-comprobantes";
import { CHIP_SIN_MANDAR, esSinMandar, textoSinMandar } from "@/lib/catalogo/sin-mandar";
import {
  DIAS_VENTANA_COMPROBANTES,
  DIAS_VENTANA_LINK_SIN_CONFIRMAR,
  diasDeVentana,
  partirPorVentana,
} from "@/lib/catalogo/comprobantes-ventana";
import {
  agruparPorMes,
  conMayusculaInicial,
  mesLabel,
  mesQueAbre,
} from "@/lib/catalogo/mes-comprobantes";
import { nombreArchivoPapel, palabraDelPapelDeFila } from "@/lib/catalogo/papel-de-la-fila";
import { FILTROS_COMPROBANTE } from "@/lib/catalogo/numeros-pedido";

const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, "");
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), "utf8");

// Fecha FIJA: nada de `new Date()` en un candado.
const AHORA = new Date("2026-09-07T15:00:00.000Z");
const HOY_PANAMA = "2026-09-07";
const haceDias = (d: number) => new Date(AHORA.getTime() - d * 86_400_000).toISOString();

const fila = (over: Partial<FilaParaChips> = {}): FilaParaChips => ({
  origen: "mio",
  fuente: "orders",
  status: "confirmado",
  enSwitch: true,
  switchDocumento: "pedido",
  created_at: haceDias(1),
  ...over,
});

// ─────────────────────────────────────────────────────────────────────────────
describe("1-2. 🔴 «Del cliente» y «Del vendedor» — y por qué esos dos nombres", () => {
  it("los rótulos son exactamente ésos", () => {
    expect(ORIGEN_LABEL.link).toBe("Del cliente");
    expect(ORIGEN_LABEL.mio).toBe("Del vendedor");
    expect(FILTROS_ORIGEN.map((f) => f.label)).toEqual(["Todos", "Del cliente", "Del vendedor"]);
  });

  it("🔴 «Del link» y «Míos» no vuelven a la pantalla", () => {
    const etiquetas = FILTROS_ORIGEN.map((f) => f.label).join(" ");
    expect(etiquetas).not.toContain("Del link");
    expect(etiquetas).not.toContain("Míos");
    expect(etiquetas).not.toContain("Mío");
  });

  it("🔑 el origen NO mira la sesión: es de dónde vino el pedido", () => {
    // Es lo que hace que «Del vendedor» sea el nombre correcto y no «Míos».
    // Si un día el origen empezara a depender del usuario que entró, este
    // candado se pone rojo y hay que volver a hablar del rótulo.
    const mapeo = sinComentarios(leer("src/lib/catalogo/fila-comprobante.ts"));
    expect(mapeo).toContain('o.del_link === true || fuente === "publicos" ? "link" : "mio"');
    for (const sesion of ["sessionStorage", "fg_user_name", "cxc_role", "session", "userId"]) {
      expect(mapeo, `el origen no puede depender de «${sesion}»`).not.toContain(sesion);
    }
  });

  it("el filtro por origen sigue filtrando lo mismo", () => {
    expect(pasaFiltroOrigen("link", "todos")).toBe(true);
    expect(pasaFiltroOrigen("mio", "todos")).toBe(true);
    expect(pasaFiltroOrigen("link", "link")).toBe(true);
    expect(pasaFiltroOrigen("mio", "link")).toBe(false);
    expect(pasaFiltroOrigen("mio", "mio")).toBe(true);
  });

  it("los dos grupos tienen rótulo chico, y son distintos", () => {
    expect(ROTULO_GRUPO_ORIGEN).toBe("Quién lo armó");
    expect(ROTULO_GRUPO_VISTA).toBe("Qué es");
    expect(ROTULO_GRUPO_ORIGEN).not.toBe(ROTULO_GRUPO_VISTA);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("1. 🔴 lo que está en CERO no ocupa lugar (salvo el activo)", () => {
  const TODAS = [fila(), fila(), fila({ origen: "link", fuente: "publicos", status: null, enSwitch: false })];

  it("«Cotizaciones 0» no se dibuja", () => {
    const { vista } = gruposDeChips(TODAS, { origen: "todos", vista: "pedido" });
    expect(vista.opciones.map((o) => o.clave)).not.toContain("cotizacion");
  });

  it("🔴 el chip ACTIVO se dibuja aunque quede en cero", () => {
    // Sin esta excepción la pantalla queda sin ningún chip encendido y sin
    // forma de volver: el filtro está SIEMPRE puesto (no hay «Todos»).
    const { vista } = gruposDeChips(TODAS, { origen: "todos", vista: "cotizacion" });
    const cot = vista.opciones.find((o) => o.clave === "cotizacion");
    expect(cot, "el chip activo desapareció").toBeTruthy();
    expect(cot!.conteo).toBe(0);
    expect(cot!.activo).toBe(true);
  });

  it("y en el grupo de origen pasa lo mismo", () => {
    const soloInternos = [fila(), fila()];
    const { origen } = gruposDeChips(soloInternos, { origen: "todos", vista: "pedido" });
    expect(origen.opciones.map((o) => o.clave)).toEqual(["todos", "mio"]);
    const conLinkPuesto = gruposDeChips(soloInternos, { origen: "link", vista: "pedido" });
    expect(conLinkPuesto.origen.opciones.map((o) => o.clave)).toContain("link");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("3. 🔴 los conteos cuentan lo que se está MIRANDO", () => {
  const FILAS = [
    fila({ origen: "mio" }),                                            // pedido interno
    fila({ origen: "mio", status: "borrador", enSwitch: false }),       // borrador interno
    fila({ origen: "link", fuente: "publicos", status: null, enSwitch: false }), // del link
  ];

  it("el conteo de ORIGEN se calcula con la vista puesta", () => {
    // Con «Borradores» puesto, «Del cliente» tiene 0 (el del link no es
    // borrador) y por eso ni se dibuja.
    const { origen } = gruposDeChips(FILAS, { origen: "todos", vista: "borrador" });
    expect(origen.opciones.find((o) => o.clave === "todos")!.conteo).toBe(1);
    expect(origen.opciones.find((o) => o.clave === "link")).toBeUndefined();
  });

  it("el conteo de VISTA se calcula con el origen puesto", () => {
    const { vista } = gruposDeChips(FILAS, { origen: "link", vista: "pedido" });
    expect(vista.opciones.find((o) => o.clave === "pedido")!.conteo).toBe(1);
    expect(vista.opciones.find((o) => o.clave === "borrador")).toBeUndefined();
  });

  it("🔑 NINGÚN grupo se cuenta con su PROPIO filtro puesto", () => {
    // Si lo hiciera, todos los chips menos el activo dirían 0 — que es como no
    // decir nada.
    const { vista } = gruposDeChips(FILAS, { origen: "todos", vista: "borrador" });
    expect(vista.opciones.find((o) => o.clave === "pedido")!.conteo).toBe(2);
    expect(vista.opciones.find((o) => o.clave === "borrador")!.conteo).toBe(1);
  });

  it("los dos filtros se cruzan", () => {
    const delLink = FILAS[2];
    expect(pasaLosDosFiltros(delLink, { origen: "link", vista: "pedido" })).toBe(true);
    expect(pasaLosDosFiltros(delLink, { origen: "mio", vista: "pedido" })).toBe(false);
    expect(pasaLosDosFiltros(delLink, { origen: "link", vista: "borrador" })).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("4. 🔴 «Sin mandar» son los CONFIRMADOS que no llegaron a Switch", () => {
  it("el chip existe, se llama así, y va al final", () => {
    expect(CHIP_SIN_MANDAR).toBe("Sin mandar");
    expect(VISTAS_COMPROBANTE[VISTAS_COMPROBANTE.length - 1].clave).toBe("sin_mandar");
  });

  it("🔴 NO es un cuarto balde: los tres de siempre siguen particionando solos", () => {
    // `FILTROS_COMPROBANTE` no lo trae, y por eso el candado de la partición
    // (`numeros-pedido.test.ts`) sigue valiendo tal cual.
    expect(FILTROS_COMPROBANTE.map((f) => f.clave)).toEqual(["pedido", "cotizacion", "borrador"]);
    expect(FILTROS_COMPROBANTE.map((f) => String(f.clave))).not.toContain("sin_mandar");
  });

  it("un CONFIRMADO sin envío activo sí es «sin mandar»", () => {
    expect(esSinMandar(fila({ status: "confirmado", enSwitch: false }))).toBe(true);
  });

  it("🔴 un BORRADOR no lo es: no se mandó porque no se terminó", () => {
    expect(esSinMandar(fila({ status: "borrador", enSwitch: false }))).toBe(false);
  });

  it("🔴 el pedido del LINK sin convertir tampoco: todavía no es un pedido", () => {
    expect(esSinMandar(fila({ fuente: "publicos", status: null, enSwitch: false }))).toBe(false);
  });

  it("uno que SÍ está en Switch nunca lo es", () => {
    expect(esSinMandar(fila({ enSwitch: true }))).toBe(false);
  });

  it("🩸 manda el ENVÍO, no el número: un envío vivo sin número está en Switch", () => {
    expect(esSinMandar(fila({ enSwitch: true, switchNumero: null }))).toBe(false);
  });

  it("los 2 de producción, medidos el 7-sep-2026 — y los 5 borradores afuera", () => {
    // reebok PED-004 · calvin CKP-020 confirmados sin mandar.
    // reebok PED-018/PED-019 · tommy TOM-005/006/023 · calvin CKP-007 son
    // borradores: no entran (5 de ellos vivos hoy).
    const prod: FilaParaChips[] = [
      fila({ status: "confirmado", enSwitch: false }), // PED-004
      fila({ status: "confirmado", enSwitch: false }), // CKP-020
      fila({ status: "borrador", enSwitch: false }),
      fila({ status: "borrador", enSwitch: false }),
      fila({ status: "borrador", enSwitch: false }),
      fila({ status: "borrador", enSwitch: false }),
      fila({ status: "borrador", enSwitch: false }),
    ];
    const { vista } = gruposDeChips(prod, { origen: "todos", vista: "pedido" });
    expect(vista.opciones.find((o) => o.clave === "sin_mandar")!.conteo).toBe(2);
  });

  it("filtrar por el chip deja SOLO esos", () => {
    expect(pasaVista(fila({ status: "confirmado", enSwitch: false }), "sin_mandar")).toBe(true);
    expect(pasaVista(fila({ enSwitch: true }), "sin_mandar")).toBe(false);
  });

  it("🔴 la frase lleva los DÍAS, contados con el día de PANAMÁ", () => {
    // PED-004 nació el 4-jul-2026; al 7-sep-2026 son 65 días.
    expect(textoSinMandar("2026-07-04T12:00:00Z", HOY_PANAMA)).toBe("Sin mandar a Switch · hace 65 días");
    // CKP-020, del 15-ago: 23 días.
    expect(textoSinMandar("2026-08-15T12:00:00Z", HOY_PANAMA)).toBe("Sin mandar a Switch · hace 23 días");
  });

  it("hoy y ayer se dicen con palabras, no con «hace 0 días»", () => {
    expect(textoSinMandar("2026-09-07T12:00:00Z", HOY_PANAMA)).toBe("Sin mandar a Switch · hoy");
    expect(textoSinMandar("2026-09-06T12:00:00Z", HOY_PANAMA)).toBe("Sin mandar a Switch · ayer");
  });

  it("una fecha ilegible no inventa un número ni revienta", () => {
    expect(textoSinMandar("no-es-fecha", HOY_PANAMA)).toBe("Sin mandar a Switch");
    expect(textoSinMandar(null, HOY_PANAMA)).toBe("Sin mandar a Switch");
  });

  it("🔴 el módulo es PURO: no lee el reloj por su cuenta", () => {
    expect(sinComentarios(leer("src/lib/catalogo/sin-mandar.ts"))).not.toContain("new Date()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("5. 🔴 el pedido del link que nadie confirmó dura 30 días", () => {
  it("los dos plazos son los que son", () => {
    expect(DIAS_VENTANA_LINK_SIN_CONFIRMAR).toBe(30);
    expect(DIAS_VENTANA_COMPROBANTES).toBe(90);
  });

  it("solo el del link SIN confirmar lleva el plazo corto", () => {
    expect(diasDeVentana({ created_at: haceDias(1), fuente: "publicos", confirmado_cliente_at: null })).toBe(30);
    expect(diasDeVentana({ created_at: haceDias(1), fuente: "publicos", confirmado_cliente_at: haceDias(1) })).toBe(90);
    expect(diasDeVentana({ created_at: haceDias(1), fuente: "orders", confirmado_cliente_at: null })).toBe(90);
    expect(diasDeVentana({ created_at: haceDias(1) })).toBe(90);
  });

  it("🔴 los SEIS abandonados de producción salen de la lista (medido 7-sep-2026)", () => {
    // $31.620,00 entre 48 y 62 días: 5 pruebas de Daniel (Reebok) y uno real
    // (Joybees, CITY MALL PASO CANOAS, $3.264 del 21-jul).
    const abandonados = [56, 56, 61, 62, 62, 48].map((d, i) => ({
      id: `ab${i}`,
      created_at: haceDias(d),
      fuente: "publicos" as const,
      confirmado_cliente_at: null,
    }));
    const { recientes, viejos } = partirPorVentana(abandonados, AHORA);
    expect(recientes).toHaveLength(0);
    expect(viejos).toHaveLength(6);
  });

  it("🔴 pero un pedido INTERNO de la misma edad se queda", () => {
    const { recientes } = partirPorVentana(
      [{ id: "interno", created_at: haceDias(60), fuente: "orders" as const, confirmado_cliente_at: null }],
      AHORA,
    );
    expect(recientes.map((f) => f.id)).toEqual(["interno"]);
  });

  it("🔴 NADA SE BORRA: recientes + viejos siguen siendo la lista entera", () => {
    const filas = [
      { id: "a", created_at: haceDias(45), fuente: "publicos" as const, confirmado_cliente_at: null },
      { id: "b", created_at: haceDias(45), fuente: "orders" as const, confirmado_cliente_at: null },
      { id: "c", created_at: haceDias(400), fuente: "orders" as const, confirmado_cliente_at: null },
    ];
    const { recientes, viejos } = partirPorVentana(filas, AHORA);
    expect(recientes.length + viejos.length).toBe(3);
    expect([...recientes, ...viejos].map((f) => f.id).sort()).toEqual(["a", "b", "c"]);
  });

  it("el que el cliente SÍ confirmó se queda: es trabajo esperando", () => {
    const { recientes } = partirPorVentana(
      [{ id: "ok", created_at: haceDias(45), fuente: "publicos" as const, confirmado_cliente_at: haceDias(44) }],
      AHORA,
    );
    expect(recientes.map((f) => f.id)).toEqual(["ok"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("6. 🔴 el mes que abre, y el encabezado bien escrito", () => {
  it("«Julio de 2026», nunca «Julio De 2026»", () => {
    const t = mesLabel("2026-07-15T12:00:00Z");
    expect(t).toMatch(/^Julio de 2026$/i);
    expect(t).not.toContain(" De ");
    expect(t.charAt(0)).toBe(t.charAt(0).toUpperCase());
  });

  it("solo la PRIMERA letra sube", () => {
    expect(conMayusculaInicial("julio de 2026")).toBe("Julio de 2026");
    expect(conMayusculaInicial("")).toBe("");
  });

  it("🩸 abre el mes MÁS RECIENTE CON comprobantes, no el del calendario", () => {
    // El caso Joybees: en septiembre su pedido más nuevo es del 24-ago, y la
    // pantalla mostraba tres encabezados y CERO filas.
    const grupos = agruparPorMes([
      { created_at: "2026-08-24T12:00:00Z" },
      { created_at: "2026-07-17T12:00:00Z" },
      { created_at: "2026-07-10T12:00:00Z" },
    ]);
    expect(grupos.map((g) => g.key)).toEqual(["2026-08", "2026-07"]);
    expect(mesQueAbre(grupos)).toBe("2026-08");
    expect(mesQueAbre(grupos)).not.toBe("2026-09");
  });

  it("sin grupos no abre nada (y la pantalla ya muestra su vacío)", () => {
    expect(mesQueAbre([])).toBeNull();
  });

  it("🔴 el módulo es PURO: no lee el reloj por su cuenta", () => {
    expect(sinComentarios(leer("src/lib/catalogo/mes-comprobantes.ts"))).not.toContain("new Date()");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("7. 🔴 el papel de la fila dice la misma palabra que el del detalle", () => {
  it("una cotización en Switch se llama Cotización, aunque el status diga confirmado", () => {
    const f = { en_switch: true, switch_documento: "cotizacion", status: "confirmado", numero_pedido: "TOM-027" };
    expect(palabraDelPapelDeFila(f)).toBe("Cotización");
    expect(nombreArchivoPapel(f, "2026-09-07")).toBe("Cotización-TOM-027-2026-09-07.pdf");
  });

  it("un pedido en Switch se llama Pedido", () => {
    const f = { en_switch: true, switch_documento: "pedido", status: "confirmado", numero_pedido: "PED-017" };
    expect(palabraDelPapelDeFila(f)).toBe("Pedido");
  });

  it("mientras NO salió manda el status: borrador = Cotización, confirmado = Pedido", () => {
    expect(palabraDelPapelDeFila({ en_switch: false, status: "borrador" })).toBe("Cotización");
    expect(palabraDelPapelDeFila({ en_switch: false, status: "confirmado" })).toBe("Pedido");
  });

  it("sin número no inventa uno", () => {
    expect(nombreArchivoPapel({ en_switch: false, status: "borrador", numero_pedido: null }, "2026-09-07"))
      .toBe("Cotización-sin-numero-2026-09-07.pdf");
  });
});
