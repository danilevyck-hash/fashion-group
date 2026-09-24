// ============================================================================
// 🔴 EL MENÚ DE LAS TRES RAYAS ES UNA PANTALLA COMPLETA (24-sep-2026).
//
// 🩸 QUÉ VINO A ARREGLAR. La hoja de abajo del 24-sep por la mañana arrancaba
// a 413 px —la mitad justa de un iPhone de 844— y dejaba ver **6 de los 20
// módulos** de admin. Las pestañas obligaban a un TERCER toque para salir del
// grupo, «Inicio» quedaba suelto arriba fuera de todo, los íconos eran grises
// y todos iguales, y no se veía dónde estaba parada la persona. Daniel la miró
// y no le gustó.
//
// 🔴 AHORA ☰ ABRE EL MENÚ ENTERO: título grande «Menú», un buscador que solo
// acorta esta lista, los tres grupos como encabezados de sección y sus módulos
// en tarjetas blancas sobre el gris del sistema, cada uno con su ícono a color
// y el de aquí marcado. Cualquier módulo son DOS toques, se venga de donde se
// venga.
//
// 🔑 LOS MÓDULOS SALEN DEL ROL. Este candado compara la lista dibujada contra
// `gruposDelCajon`, que sale de `getVisibleModules`/`GROUPS`: si alguien
// escribe un módulo a mano en el encabezado, sobra o falta y la prueba cae.
//
// Mutaciones que caza: (1) el menú vuelve a ser la hoja de media pantalla ·
// (2) se pierde un grupo o un módulo del rol · (3) el módulo de aquí deja de
// marcarse · (4) el buscador filtra por parecido o no filtra · (5) el menú no
// cierra con Escape, con la ✕ o al navegar · (6) los cuatro módulos que no
// tenían color vuelven al gris · (7) «Inicio» o el pie con nombre · rol ·
// Contraseña · Salir desaparecen.
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";

const nav = vi.hoisted(() => ({ push: vi.fn(), ruta: "/asistencia" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: nav.push, replace: vi.fn() }),
  usePathname: () => nav.ruta,
  useSearchParams: () => new URLSearchParams(""),
}));

vi.mock("@/components/SearchBar", async (original) => ({
  ...(await original<typeof import("@/components/SearchBar")>()),
  default: () => null,
}));
vi.mock("@/components/NotificationCenter", () => ({ default: () => null }));
vi.mock("@/components/NovedadesAviso", () => ({ default: () => null }));

import AppHeader from "@/components/AppHeader";
import {
  MODO_DEL_CAJON,
  cuantosModulos,
  esMenuDePantalla,
  filtrarGruposPorTexto,
  gruposDelCajon,
} from "@/lib/navegacion/cajon-por-grupos";
import { getModuleColorByKey } from "@/lib/moduleColors";

/** Los cuatro que no tenían acento propio hasta el 24-sep-2026. */
const LOS_CUATRO_NUEVOS = ["vista-general", "referencia", "catalogos", "usuarios"] as const;

function montarComoAdmin(ruta = "/asistencia") {
  nav.ruta = ruta;
  sessionStorage.setItem("cxc_role", "admin");
  sessionStorage.setItem("fg_user_name", "daniel");
  return render(<AppHeader module="Asistencia y Planilla" />);
}

/**
 * Las filas del menú, en el orden en que se dibujan, por su rótulo exacto.
 *
 * Se lee el primer `span` de cada botón —el del nombre— y no el nombre
 * accesible: «Ventas» es prefijo de «Ventas Boston», y comparar por prefijo
 * haría pasar un menú al que le falta un módulo.
 */
function filasDelMenu(menu: HTMLElement): string[] {
  return [...menu.querySelectorAll("nav button")].map(
    (b) => b.querySelector("span")?.textContent ?? "",
  );
}

async function abrirElMenu(): Promise<HTMLElement> {
  fireEvent.click(await screen.findByLabelText("Abrir menú de módulos"));
  return (await waitFor(() => {
    const el = document.querySelector("[data-menu-pantalla]");
    if (!el) throw new Error("el menú no se abrió");
    return el as HTMLElement;
  })) as HTMLElement;
}

describe("el modo del cajón", () => {
  it("hoy ☰ abre el menú a pantalla completa", () => {
    expect(MODO_DEL_CAJON).toBe("pantalla");
    expect(esMenuDePantalla()).toBe(true);
  });

  it("el buscador filtra por subcadena normalizada, NUNCA por parecido", () => {
    const grupos = gruposDelCajon("admin");
    expect(cuantosModulos(grupos)).toBeGreaterThan(10);
    // Vacío no filtra nada.
    expect(cuantosModulos(filtrarGruposPorTexto(grupos, ""))).toBe(cuantosModulos(grupos));
    expect(cuantosModulos(filtrarGruposPorTexto(grupos, "   "))).toBe(cuantosModulos(grupos));

    // Sin acentos y sin mayúsculas: «guias», «GUÍAS» y «Guías» son lo mismo.
    for (const texto of ["guias", "GUÍAS", "Guías"]) {
      const r = filtrarGruposPorTexto(grupos, texto);
      expect(r.flatMap((g) => g.modulos.map((m) => m.label))).toEqual(["Guías de Despacho"]);
      // 🔴 Un grupo que se queda sin módulos NO se dibuja.
      expect(r.map((g) => g.key)).toEqual(["operacion"]);
    }

    // 🔴 Nada por parecido: un nombre mal escrito no encuentra nada.
    expect(cuantosModulos(filtrarGruposPorTexto(grupos, "guyas"))).toBe(0);
    expect(cuantosModulos(filtrarGruposPorTexto(grupos, "zzz"))).toBe(0);
  });

  it("los CUATRO que salían en gris ya tienen tono, y ninguno choca", () => {
    const nuevos = LOS_CUATRO_NUEVOS.map((k) => {
      const tono = getModuleColorByKey(k);
      expect(tono, `${k} sigue sin color`).not.toBeNull();
      return tono!;
    });
    // Los cuatro son distintos entre sí…
    expect(new Set(nuevos.map((t) => t.hex)).size).toBe(4);
    // …y ningún módulo que admin ve se queda sin acento.
    for (const g of gruposDelCajon("admin")) {
      for (const m of g.modulos) {
        expect(getModuleColorByKey(m.key), `${m.key} sale en gris`).not.toBeNull();
      }
    }
  });
});

describe("AppHeader · el menú a pantalla completa", () => {
  beforeEach(() => { nav.push.mockClear(); sessionStorage.clear(); });
  afterEach(() => cleanup());

  it("☰ abre el menú entero: título, buscador, los tres grupos y TODOS los módulos del rol", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();

    within(menu).getByRole("heading", { name: "Menú" });
    within(menu).getByLabelText("Buscar un módulo");

    const grupos = gruposDelCajon("admin");
    // Los encabezados de sección llevan el nombre COMPLETO del grupo: acá hay
    // ancho de sobra, así que no se recorta como en la pestaña de la hoja.
    expect(
      [...menu.querySelectorAll("h3")].map((h) => h.textContent),
    ).toEqual(grupos.map((g) => g.label));

    // 🔴 Todos los módulos del rol, en el orden del rol, sin pestañas, con
    // «Inicio» a la cabeza. Es una igualdad, no un «contiene»: así se cae
    // también si sobra un módulo escrito a mano.
    expect(filasDelMenu(menu)).toEqual([
      "Inicio",
      ...grupos.flatMap((g) => g.modulos.map((m) => m.label)),
    ]);
    expect(within(menu).queryByRole("tablist")).toBeNull();
  });

  it("el módulo de aquí está marcado y dice «aquí»", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();

    const aqui = within(menu).getByRole("button", { name: /^Asistencia y Planilla/ });
    expect(aqui.getAttribute("aria-current")).toBe("page");
    expect(aqui.textContent).toContain("aquí");

    const otro = within(menu).getByRole("button", { name: /^Guías de Despacho/ });
    expect(otro.getAttribute("aria-current")).toBeNull();
  });

  it("cada módulo lleva su ícono en SU color, incluidos los cuatro nuevos", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();

    const claseDelIcono = (etiqueta: string) =>
      within(menu).getByRole("button", { name: new RegExp(`^${etiqueta}`) })
        .querySelector("svg")?.getAttribute("class") ?? "";

    // Uno de los de siempre…
    expect(claseDelIcono("Guías de Despacho")).toContain(getModuleColorByKey("guias")!.text);
    // …y los cuatro que hasta hoy salían en gris.
    expect(claseDelIcono("Vista General")).toContain(getModuleColorByKey("vista-general")!.text);
    expect(claseDelIcono("Referencia")).toContain(getModuleColorByKey("referencia")!.text);
    expect(claseDelIcono("Catálogos")).toContain(getModuleColorByKey("catalogos")!.text);
    expect(claseDelIcono("Usuarios")).toContain(getModuleColorByKey("usuarios")!.text);
    // 🔴 Nadie se queda con el gris de respaldo.
    expect(claseDelIcono("Catálogos")).not.toContain("text-gray-400");
  });

  it("el buscador acorta la lista sin navegar, y lo dice cuando no queda ninguno", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();

    fireEvent.change(within(menu).getByLabelText("Buscar un módulo"), { target: { value: "guía" } });
    await waitFor(() => {
      expect(within(menu).queryByRole("button", { name: /^Proveedores/ })).toBeNull();
    });
    within(menu).getByRole("button", { name: /^Guías de Despacho/ });
    expect([...menu.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Operación"]);
    expect(nav.push).not.toHaveBeenCalled();

    fireEvent.change(within(menu).getByLabelText("Buscar un módulo"), { target: { value: "zzz" } });
    await within(menu).findByText("Ningún módulo se llama así.");
  });

  it("«Inicio» arriba y el pie con nombre · rol · Contraseña · Salir", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();

    within(menu).getByRole("button", { name: /^Inicio/ });
    within(menu).getByText("daniel");
    within(menu).getByText("Administrador");
    within(menu).getByRole("button", { name: "Salir" });
    // El botón de cambiar la contraseña es el de siempre, en su variante texto.
    expect(menu.textContent).toContain("Contraseña");
  });

  it("tocar un módulo navega y cierra el menú", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();

    fireEvent.click(within(menu).getByRole("button", { name: /^Proveedores/ }));
    expect(nav.push).toHaveBeenCalledWith("/proveedores");
    await waitFor(() => {
      expect(document.querySelector("[data-menu-pantalla]")).toBeNull();
    });
  });

  it("cierra con la ✕ y con Escape", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();
    fireEvent.click(within(menu).getByLabelText("Cerrar menú"));
    await waitFor(() => expect(document.querySelector("[data-menu-pantalla]")).toBeNull());

    await abrirElMenu();
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(document.querySelector("[data-menu-pantalla]")).toBeNull());
  });

  it("el menú abre siempre en limpio: no se hereda lo que se escribió antes", async () => {
    montarComoAdmin("/asistencia");
    const menu = await abrirElMenu();
    fireEvent.change(within(menu).getByLabelText("Buscar un módulo"), { target: { value: "guía" } });
    await waitFor(() => {
      expect(within(menu).queryByRole("button", { name: /^Proveedores/ })).toBeNull();
    });
    fireEvent.click(within(menu).getByLabelText("Cerrar menú"));
    await waitFor(() => expect(document.querySelector("[data-menu-pantalla]")).toBeNull());

    const otraVez = await abrirElMenu();
    expect((within(otraVez).getByLabelText("Buscar un módulo") as HTMLInputElement).value).toBe("");
    within(otraVez).getByRole("button", { name: /^Proveedores/ });
  });

  it("un rol de UN solo módulo ve su módulo, sin grupos vacíos", async () => {
    nav.ruta = "/multifashion";
    sessionStorage.setItem("cxc_role", "gerente_acs");
    sessionStorage.setItem("fg_user_name", "jennifer");
    render(<AppHeader module="Multifashion" />);
    const menu = await abrirElMenu();

    expect([...menu.querySelectorAll("h3")].map((h) => h.textContent)).toEqual(["Ventas y clientes"]);
    const suyo = within(menu).getByRole("button", { name: /^Multifashion/ });
    expect(suyo.getAttribute("aria-current")).toBe("page");
    expect(within(menu).queryByRole("button", { name: /^Guías de Despacho/ })).toBeNull();
  });
});
