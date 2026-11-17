// Revisión de 110 puntos, fase 1 (14-nov-2026): la barra sin «Más», la barra
// FIJA de Daniel, el robot de capturas fuera del conteo, los ayudantes del
// filtro «a» y el buscador que encuentra por código O descripción.
import { describe, expect, it, vi } from "vitest";
import {
  PESTANAS_DE_MODULO, barraFijaDe, rotuloDePestana, ordenPorUso, pestanasDelRol, sinVisitasDelRobot,
} from "@/lib/navegacion/tab-bar";
import { filtrosPuestos, textoDelRenglon, type FiltroDeLaHoja } from "@/components/filtros/FiltroA";
import { filtrarArticulos, type ArticuloVendido } from "@/lib/productos/filtros";
import { coincideGasto } from "@/app/marketing/components/nuevo/GastosNuevo";
import { ROTULO_TODAS } from "@/lib/ventas/rotulo-empresas";
import { opcionesDeEmpresa } from "@/lib/asistencia/empresa-para-todo";

describe("la barra de abajo sin «Más»", () => {
  it("cuatro módulos más Inicio", () => {
    expect(PESTANAS_DE_MODULO).toBe(4);
    expect(pestanasDelRol("admin").length).toBe(4);
  });

  it("la barra de Daniel es FIJA: Despachos · Tienda · Ventas · Por cobrar, mida lo que mida (17-nov-2026)", () => {
    expect(barraFijaDe("daniel")).toEqual(["guias", "multifashion", "ventas", "cxc"]);
    expect(barraFijaDe("Daniel")).toEqual(barraFijaDe("daniel")); // el login no distingue mayúsculas
    expect(barraFijaDe("yulissa")).toBeNull();
    const keys = pestanasDelRol("admin", null, ["marketing", "reclamos", "caja"], "/home", "daniel").map((m) => m.key);
    expect(keys).toEqual(["guias", "multifashion", "ventas", "cxc"]);
    const rotulos = pestanasDelRol("admin", null, [], "/home", "daniel").map(rotuloDePestana);
    expect(rotulos).toEqual(["Despachos", "Tienda", "Ventas", "Por cobrar"]);
  });

  it("otra persona del mismo rol sigue ordenada por su uso", () => {
    const keys = pestanasDelRol("admin", null, ["marketing", "reclamos"], "/home", "alberto").map((m) => m.key);
    expect(keys.slice(0, 2)).toEqual(["marketing", "reclamos"]);
  });

  it("las visitas del robot de capturas (14-nov-2026, usuario daniel) no cuentan", () => {
    const filas = [
      { dia: "2026-11-14", modulo: "marketing", aparato: "celular", visitas: 99 },
      { dia: "2026-11-13", modulo: "ventas", aparato: "celular", visitas: 3 },
    ];
    expect(sinVisitasDelRobot(filas, "daniel").map((f) => f.modulo)).toEqual(["ventas"]);
    expect(sinVisitasDelRobot(filas, "alberto")).toHaveLength(2);
    expect(ordenPorUso(sinVisitasDelRobot(filas, "daniel"))[0]).toBe("ventas");
  });
});

describe("filtro «a»: la línea gris y el texto del renglón", () => {
  const filtro = (valor: string, extra: Partial<FiltroDeLaHoja> = {}): FiltroDeLaHoja => ({
    clave: "marca", etiqueta: "Marca", valor, onCambiar: vi.fn(),
    opciones: [{ valor: "th", etiqueta: "Tommy Hilfiger" }], ...extra,
  });

  it("solo lo puesto va a la línea gris, con su nombre", () => {
    expect(filtrosPuestos([filtro("")])).toEqual([]);
    const [p] = filtrosPuestos([filtro("th")]);
    expect(p.texto).toBe("Tommy Hilfiger");
    p.onQuitar();
  });

  it("un valor por defecto distinto de vacío no cuenta como puesto", () => {
    expect(filtrosPuestos([filtro("todas", { porDefecto: "todas" })])).toEqual([]);
  });

  it("el renglón dice «Todos»/«Todas» o lo elegido", () => {
    expect(textoDelRenglon(filtro(""))).toBe("Todos");
    expect(textoDelRenglon(filtro("", { todos: "Todas" }))).toBe("Todas");
    expect(textoDelRenglon(filtro("th"))).toBe("Tommy Hilfiger");
  });
});

describe("buscar código o descripción", () => {
  const art = (codigo: string, descripcion: string): ArticuloVendido => ({
    codigo, descripcion, unidades: 1, venta: 1, costo: 0, campos: {},
  });
  const lista = [art("EN0EN02434", "Women-Sneakers"), art("AB123", "Men-Hats")];

  it("encuentra por código y por descripción, sin acentos ni mayúsculas", () => {
    expect(filtrarArticulos(lista, "ab12", {}).map((a) => a.codigo)).toEqual(["AB123"]);
    expect(filtrarArticulos(lista, "sneak", {}).map((a) => a.codigo)).toEqual(["EN0EN02434"]);
  });

  it("Marketing › Gastos: proveedor o número de factura", () => {
    const g = { proveedor: "Impresora Comercial S.A.", numero: "F-00123" };
    expect(coincideGasto(g, "impresora")).toBe(true);
    expect(coincideGasto(g, "00123")).toBe(true);
    expect(coincideGasto(g, "")).toBe(true);
    expect(coincideGasto(g, "calvin")).toBe(false);
  });
});

describe("«Todas las empresas», nunca «Todas» a secas", () => {
  it("el rótulo único y el selector de Asistencia", () => {
    expect(ROTULO_TODAS).toBe("Todas las empresas");
    expect(opcionesDeEmpresa("admin")[0].etiqueta).toBe("Todas las empresas");
  });
});
