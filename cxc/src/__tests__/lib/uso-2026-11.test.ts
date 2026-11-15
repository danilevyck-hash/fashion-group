import { describe, it, expect } from "vitest";
import {
  avisoLoteAprobado,
  despachadorDelUsuario,
  esCelularPanama,
  rotuloLoteConCuantos,
  telefonoParaWhatsApp,
  textoSinCelular,
} from "@/lib/ui/uso-2026-11";
import { armarAntesDeCerrar } from "@/lib/asistencia/antes-de-cerrar";

describe("ux-01 · el lote dice cuántos", () => {
  it("rótulo y aviso", () => {
    expect(rotuloLoteConCuantos(36)).toBe("Aprobar 36 pendientes");
    expect(rotuloLoteConCuantos(1)).toBe("Aprobar 1 pendiente");
    expect(rotuloLoteConCuantos(0)).toBe("Aprobar pendientes");
    expect(avisoLoteAprobado(36, "586:52")).toBe("36 aprobadas · 586:52 h");
  });
});

describe("ux-05 · WhatsApp solo a celular", () => {
  it("727-7247 (City Mall) es fijo: no hay WhatsApp", () => {
    expect(esCelularPanama("727-7247")).toBe(false);
    expect(telefonoParaWhatsApp("727-7247", null)).toBeNull();
    expect(textoSinCelular("727-7247")).toBe("727-7247 es fijo: no tiene WhatsApp");
  });
  it("8 dígitos que empiezan en 6, con o sin 507", () => {
    expect(esCelularPanama("6212-0673")).toBe(true);
    expect(esCelularPanama("507 6533 1308")).toBe(true);
    expect(esCelularPanama("2212-0673")).toBe(false);
  });
  it("toma el primer CELULAR entre los campos y entre varios números", () => {
    expect(telefonoParaWhatsApp("727-7247 / 6301-1122", null)).toBe("6301-1122");
    expect(telefonoParaWhatsApp("727-7247", "6212-0673")).toBe("6212-0673");
  });
});

describe("ux-06 · despachado por quien entró", () => {
  const lista = ["Julio", "Rodrigo", "Eloyn", "Jorman"];
  it("igualdad exacta del nombre entero o del primer nombre, sin acentos ni mayúsculas", () => {
    expect(despachadorDelUsuario(lista, "julio")).toBe("Julio");
    expect(despachadorDelUsuario(lista, "Julio Guzmán")).toBe("Julio");
    expect(despachadorDelUsuario(lista, "", "RODRIGO")).toBe("Rodrigo");
  });
  it("nunca por parecido; sin coincidencia queda vacío", () => {
    expect(despachadorDelUsuario(lista, "Jul")).toBe("");
    expect(despachadorDelUsuario(lista, "Daniel Levy")).toBe("");
  });
});

describe("ux-07 · el día libre en una línea gris con «ver quiénes»", () => {
  it("una línea informativa, con número y los nombres detrás", () => {
    const r = armarAntesDeCerrar({
      periodoAbierto: null, esQuincena: true, rango: null, extraSinAprobar: [], sinFicha: [], sinHorario: 0,
      corte: null, hasta: "2026-11-15", fueraPorBaja: 0, marcoDespuesDeIrse: 0, avisoRepartoRechazado: null,
      prestamoSinAtar: [], avisoPrestamo: null, avisoVacacionesNoPagadas: null,
      avisoDiasLibres: "17 colaboradores deben horas…",
      diasLibres: [{ codigo: "6", etiqueta: "KEVIN LUBO", pagado: 24.16, queda: 0 }],
      conSabado: 0, rangoLibre: false, factorBase: 1, diasCalendario: 15, migraciones: [], pestanaFichas: "Colaboradores",
    });
    const l = [...r.arreglar, ...r.info].find((x) => x.clave === "dias-libres")!;
    expect(l.tono).toBe("info");
    expect(l.numero).toBe(1);
    expect(l.texto).toBe("paga con sus horas extra un día libre de la empresa; lo que falta pasa a la próxima quincena");
    expect(l.personas?.[0]).toMatchObject({ etiqueta: "KEVIN LUBO", detalle: "pagó $24.16 · le quedan $0.00", href: "#planilla-fila-6" });
  });
});
