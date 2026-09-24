// ============================================================================
// 🔴 EN EL CELULAR, EL MENÚ DE LAS TRES RAYAS MUESTRA EL MENÚ (24-sep-2026).
//
// 🩸 El cajón tenía CUATRO renglones —Inicio y los tres grupos— y el resto en
// blanco: tocar un grupo cerraba el cajón y cargaba OTRA pantalla, `/g/<grupo>`,
// solo para elegir el módulo. Ahora ☰ abre una hoja desde abajo con los grupos
// como pestañas y los módulos del grupo debajo, abierta en el grupo del módulo
// donde está la persona y con ese módulo marcado.
//
// Mutaciones cazadas: (1) el rótulo de la pestaña vuelve a ser el nombre
// completo («Ventas y clientes» no entra en un tercio de 390 px) · (2) la hoja
// abre siempre en el primer grupo en vez del grupo donde está la persona ·
// (3) se dibuja el segmentado con UN solo grupo (un botón que no hace nada) ·
// (4) los módulos dejan de salir del rol · (5) tocar un módulo no cierra la
// hoja · (6) el interruptor apagado ya no devuelve el cajón lateral de antes.
//
// ⚠️ 24-sep-2026 — LA HOJA YA NO ES LO QUE SE VE. Daniel la miró y no le gustó
// (arrancaba a la mitad de la pantalla y mostraba 6 de 20 módulos), así que hoy
// `MODO_DEL_CAJON` es `"pantalla"` y ☰ abre el menú a pantalla completa —su
// candado es `menu-pantalla-completa.test.tsx`—. Este archivo se queda entero:
// la hoja sigue viva detrás del modo `"hoja"`, y lo que protege —que los
// módulos salen del ROL, el rótulo corto derivado, el grupo de la ruta, el
// segmentado que no se dibuja solo, y el cajón lateral con el interruptor
// apagado— no cambió ni una coma. Los bloques que la dibujan piden el modo
// `"hoja"` a propósito.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), ruta: "/asistencia" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => nav.ruta,
  useSearchParams: () => new URLSearchParams(""),
}));

// El interruptor se lee en cada render, así que un getter alcanza para probar
// las dos caras sin duplicar el componente.
const interruptor = vi.hoisted(() => ({ prendido: true, modo: "hoja" as "hoja" | "pantalla" }));
vi.mock("@/lib/navegacion/cajon-por-grupos", async (original) => {
  const real = await original<typeof import("@/lib/navegacion/cajon-por-grupos")>();
  return {
    ...real,
    get CAJON_HOJA_ABAJO() { return interruptor.prendido; },
    get MODO_DEL_CAJON() { return interruptor.modo; },
    esHojaDeAbajo: () => interruptor.prendido && interruptor.modo === "hoja",
    esMenuDePantalla: () => interruptor.prendido && interruptor.modo === "pantalla",
  };
});

// Piezas pesadas del encabezado que no son lo que se está probando.
vi.mock("@/components/SearchBar", async (original) => ({
  ...(await original<typeof import("@/components/SearchBar")>()),
  default: () => null,
}));
vi.mock("@/components/NotificationCenter", () => ({ default: () => null }));
vi.mock("@/components/NovedadesAviso", () => ({ default: () => null }));

import AppHeader from "@/components/AppHeader";
import {
  rotuloCortoDeGrupo,
  gruposDelCajon,
  grupoDeLaRuta,
  grupoAlAbrir,
  seDibujaElSegmentado,
} from "@/lib/navegacion/cajon-por-grupos";
import { getModulesInGroup } from "@/lib/modules";

describe("cajon-por-grupos · el módulo puro", () => {
  it("el interruptor está PRENDIDO y hoy el modo es PANTALLA", async () => {
    const real = await vi.importActual<typeof import("@/lib/navegacion/cajon-por-grupos")>(
      "@/lib/navegacion/cajon-por-grupos",
    );
    expect(real.CAJON_HOJA_ABAJO).toBe(true);
    // 🔴 Lo que Daniel ve hoy es el menú a pantalla completa. La hoja sigue
    // entera detrás del otro modo: volver a ella es cambiar esta palabra.
    expect(real.MODO_DEL_CAJON).toBe("pantalla");
    expect(real.esMenuDePantalla()).toBe(true);
    expect(real.esHojaDeAbajo()).toBe(false);
  });

  it("el rótulo corto es la PRIMERA palabra, derivada, no una lista a mano", () => {
    expect(rotuloCortoDeGrupo("Ventas y clientes")).toBe("Ventas");
    expect(rotuloCortoDeGrupo("Operación")).toBe("Operación");
    expect(rotuloCortoDeGrupo("Administración")).toBe("Administración");
    // 🔴 El largo no puede volver: en 390 px se leía «Ventas y cl…».
    expect(rotuloCortoDeGrupo("Ventas y clientes")).not.toBe("Ventas y clientes");
  });

  it("admin ve los TRES grupos, con los módulos de su rol y ninguno vacío", () => {
    const grupos = gruposDelCajon("admin");
    expect(grupos.map((g) => g.key)).toEqual(["ventas-clientes", "operacion", "administracion"]);
    expect(grupos.map((g) => g.rotuloCorto)).toEqual(["Ventas", "Operación", "Administración"]);
    for (const g of grupos) {
      expect(g.modulos.length).toBeGreaterThan(0);
      // 🔴 La lista sale del rol, nunca escrita acá.
      expect(g.modulos.map((m) => m.key)).toEqual(
        getModulesInGroup(g.key, "admin").map((m) => m.key),
      );
    }
  });

  it("un rol de UN solo módulo no ve pestañas ni grupos vacíos", () => {
    const grupos = gruposDelCajon("gerente_acs");
    expect(grupos).toHaveLength(1);
    expect(grupos[0].modulos).toHaveLength(1);
    expect(seDibujaElSegmentado(grupos)).toBe(false);
    expect(seDibujaElSegmentado(gruposDelCajon("admin"))).toBe(true);
  });

  it("la hoja abre en el grupo del módulo donde está la persona", () => {
    const grupos = gruposDelCajon("admin");
    expect(grupoDeLaRuta("/asistencia", grupos)).toBe("operacion");
    expect(grupoDeLaRuta("/asistencia/personas/E-1", grupos)).toBe("operacion");
    expect(grupoDeLaRuta("/cxc", grupos)).toBe("ventas-clientes");
    expect(grupoDeLaRuta("/admin/usuarios", grupos)).toBe("administracion");
    // Una pantalla que no es de ningún módulo no inventa grupo…
    expect(grupoDeLaRuta("/home", grupos)).toBeNull();
    // …pero la hoja igual tiene que abrir por algún lado.
    expect(grupoAlAbrir("/home", grupos)).toBe("ventas-clientes");
    expect(grupoAlAbrir("/asistencia", grupos)).toBe("operacion");
    expect(grupoAlAbrir("/home", [])).toBeNull();
  });
});

function montarComoAdmin(ruta = "/asistencia") {
  nav.ruta = ruta;
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_name", "daniel");
  return render(<AppHeader module="Asistencia y Planilla" />);
}

describe("AppHeader · la hoja de abajo en el celular", () => {
  beforeEach(() => {
    nav.push.mockClear();
    interruptor.prendido = true;
    interruptor.modo = "hoja";
    sessionStorage.clear();
  });
  afterEach(() => cleanup());

  it("☰ abre la hoja: pestañas cortas, los módulos del grupo y el de aquí marcado", async () => {
    montarComoAdmin("/asistencia");
    fireEvent.click(await screen.findByLabelText("Abrir menú de módulos"));

    const pestanas = await screen.findByRole("tablist", { name: "Grupos de módulos" });
    expect([...pestanas.querySelectorAll("button")].map((b) => b.textContent)).toEqual([
      "Ventas", "Operación", "Administración",
    ]);

    // Abre en Operación, que es donde está: sus módulos a la vista.
    await screen.findByRole("button", { name: "Guías de Despacho" });
    const aqui = screen.getByRole("button", { name: "Asistencia y Planilla" });
    expect(aqui.getAttribute("aria-current")).toBe("page");
    // Y los de otro grupo NO se dibujan hasta que se toque su pestaña.
    expect(screen.queryByRole("button", { name: "Proveedores" })).toBeNull();
  });

  it("la pestaña cambia la lista sin salir de la hoja, y tocar un módulo navega", async () => {
    montarComoAdmin("/asistencia");
    fireEvent.click(await screen.findByLabelText("Abrir menú de módulos"));
    await screen.findByRole("button", { name: "Guías de Despacho" });

    fireEvent.click(screen.getByRole("tab", { name: "Ventas" }));
    await screen.findByRole("button", { name: "Proveedores" });
    expect(nav.push).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Proveedores" }));
    expect(nav.push).toHaveBeenCalledWith("/proveedores");
    // 🔴 Tocar un módulo CIERRA la hoja.
    await waitFor(() => {
      expect(screen.queryByRole("tablist", { name: "Grupos de módulos" })).toBeNull();
    });
  });

  it("con el interruptor apagado vuelve el cajón lateral de antes", async () => {
    interruptor.prendido = false;
    montarComoAdmin("/asistencia");
    fireEvent.click(await screen.findByLabelText("Abrir menú de módulos"));

    await screen.findByLabelText("Cerrar menú");
    // Los TRES grupos como renglones, con su nombre completo, y ninguna pestaña.
    await screen.findByRole("button", { name: "Ventas y clientes" });
    screen.getByRole("button", { name: "Operación" });
    expect(screen.queryByRole("tablist", { name: "Grupos de módulos" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Guías de Despacho" })).toBeNull();
  });
});
