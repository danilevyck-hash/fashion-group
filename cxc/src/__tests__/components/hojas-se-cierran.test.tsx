// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO: LAS HOJAS SE CIERRAN COMO DICE LA REGLA (16-nov-2026, errores de
// los videos #13 · #20 · #23 · #37).
//
// La regla, para todo el sistema:
//  • Una hoja de UNA opción (filtro, orden, fecha, empresa, acción) SE CIERRA AL
//    ELEGIR y no lleva «Listo».
//  • Una hoja de VARIAS opciones o con formulario se queda abierta hasta
//    «Listo»/«Guardar».
//  • Todo menú flotante se cierra al tocar afuera y con Escape; Escape en un
//    calendario de adentro cierra SOLO el calendario, nunca el formulario.
//
// 🩸 #13: `HojaMenu` ataba su «cerrar al elegir» en un efecto que corría cuando
// la hoja todavía no existía (la primera pasada tras hidratar no dibuja el
// portal) y no volvía a correr: en /clientes, «Todos ▾» y «Ordenar ▾» se
// quedaban abiertos.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";
import { act, render, fireEvent, screen, waitFor } from "@testing-library/react";
import ClientesListClient from "@/app/clientes/ClientesListClient";
import { HojaMenu } from "@/components/celular/BarraDeControles";
import { OrdenarEnLaBarra } from "@/components/ui/OrdenTabla";
import AvatarDelUsuario from "@/components/estructura/AvatarDelUsuario";
import MenuDelUsuario from "@/components/estructura/MenuDelUsuario";
import { MetaFormModal } from "@/components/multifashion/MetaFormModal";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(""),
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/clientes",
}));
vi.mock("@/lib/hooks/useAuth", () => ({ useAuth: () => ({ authChecked: true, role: "admin" }) }));
vi.mock("@/components/AppHeader", () => ({ default: () => null }));

function comoElServidor(el: React.ReactElement): string {
  const g = globalThis as Record<string, unknown>;
  const d = g.document;
  const w = g.window;
  delete g.document;
  delete g.window;
  try {
    return renderToString(el);
  } finally {
    g.document = d;
    g.window = w;
  }
}

const hoja = (nombre: string) => document.querySelector(`[role="dialog"][aria-label="${nombre}"]`) as HTMLElement;
const fondoDe = (nombre: string) => hoja(nombre).querySelector("button[aria-label='Cerrar']") as HTMLElement;
const abierta = (nombre: string) => document.querySelector(`[role="dialog"][aria-label="${nombre}"]`)?.getAttribute("aria-hidden") === "false";

describe("#13 Clientes › lista: «Todos ▾» y «Ordenar ▾» se cierran al elegir", () => {
  it("después de hidratar, elegir una vista cierra la hoja «Mostrar»", async () => {
    const clientes = [{ id: "1", codigo: "D-25", nombre: "City Mall", razon_social: null, telefono: "727-7247", celular: null, email: "a@b.com", debe: 300 }];
    const el = <ClientesListClient initialClientes={clientes} actualizado="2026-11-14T07:00:00Z" />;
    const div = document.createElement("div");
    div.innerHTML = comoElServidor(el);
    document.body.appendChild(div);
    let raiz: ReturnType<typeof hydrateRoot> | null = null;
    await act(async () => { raiz = hydrateRoot(div, el); });

    fireEvent.click(div.querySelector("[data-menu-vistas]")!);
    expect(abierta("Mostrar")).toBe(true);
    const opcion = document.querySelector("[data-vista-opcion]:not([aria-pressed='true'])") as HTMLElement;
    await act(async () => { fireEvent.click(opcion); await new Promise((r) => setTimeout(r, 5)); });
    expect(abierta("Mostrar")).toBe(false);

    fireEvent.click(div.querySelector("[data-ordenar-barra]")!);
    expect(abierta("Ordenar por")).toBe(true);
    await act(async () => { fireEvent.click(document.querySelector("[data-ordenar-opcion]")!); await new Promise((r) => setTimeout(r, 5)); });
    expect(abierta("Ordenar por")).toBe(false);
    act(() => raiz!.unmount());
    div.remove();
  });
});

describe("#20 una hoja de UNA opción no lleva «Listo»", () => {
  it("«Ordenar por» se cierra al elegir y no dibuja «Listo»", async () => {
    const tocar = vi.fn();
    render(<OrdenarEnLaBarra api={{ orden: { col: "a", dir: "desc" } as never, tocar }} opciones={[{ col: "a", rotulo: "Venta" }, { col: "b", rotulo: "Nombre" }]} />);
    fireEvent.click(document.querySelector("[data-ordenar-barra]")!);
    expect(abierta("Ordenar por")).toBe(true);
    expect(screen.queryByRole("button", { name: "Listo" })).toBeNull();
    await act(async () => { fireEvent.click(screen.getByText("Nombre")); await new Promise((r) => setTimeout(r, 5)); });
    expect(tocar).toHaveBeenCalledWith("b");
    expect(abierta("Ordenar por")).toBe(false);
  });

  it("toda HojaMenu: fondo y Escape la cierran", () => {
    const onCerrar = vi.fn();
    render(<HojaMenu abierta onCerrar={onCerrar} titulo="Mostrar"><button type="button">Uno</button></HojaMenu>);
    fireEvent.click(fondoDe("Mostrar"));
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onCerrar).toHaveBeenCalledTimes(2);
  });
});

describe("#37 Inicio: el menú de la cuenta se cierra al tocar afuera", () => {
  it("celular (avatar): tocar el fondo cierra la hoja «Tu cuenta»", () => {
    render(<AvatarDelUsuario nombre="Daniel" rol="admin" />);
    fireEvent.click(screen.getByRole("button", { name: /Tu cuenta/ }));
    expect(abierta("Tu cuenta")).toBe(true);
    fireEvent.click(fondoDe("Tu cuenta"));
    expect(abierta("Tu cuenta")).toBe(false);
  });

  it("menú flotante: un toque afuera en el iPhone (sin `mousedown`) lo cierra", () => {
    render(<div><p data-afuera>afuera</p><MenuDelUsuario nombre="Daniel" rol="admin" /></div>);
    fireEvent.click(screen.getByRole("button", { name: /Daniel/ }));
    expect(document.querySelector("[data-desplegable='menu-del-usuario']")).not.toBeNull();
    // iOS Safari no manda `mousedown` al tocar algo que no es tocable: solo el toque.
    fireEvent.touchStart(document.querySelector("[data-afuera]")!);
    expect(document.querySelector("[data-desplegable='menu-del-usuario']")).toBeNull();
  });
});

describe("#23 Multifashion › Nueva meta: el calendario no se lleva el formulario", () => {
  const props = { meta: null, vendedoras: [], guardando: false, onGuardar: vi.fn(), onRetirar: vi.fn() };

  it("elegir el día cierra el calendario «Desde» (computadora)", async () => {
    const mm = window.matchMedia;
    window.matchMedia = ((q: string) => ({ matches: true, media: q, addEventListener() {}, removeEventListener() {} })) as never;
    try {
      render(<MetaFormModal {...props} onCerrar={vi.fn()} />);
      fireEvent.click(document.querySelectorAll("button[aria-haspopup='dialog']")[0]);
      expect(screen.getAllByText("Toca el día").length).toBeGreaterThan(0);
      fireEvent.click(screen.getAllByRole("button", { name: "Hoy" })[0]);
      await waitFor(() => expect(screen.queryByText("Toca el día")).toBeNull());
    } finally {
      window.matchMedia = mm;
    }
  });

  it("Escape con el calendario abierto cierra SOLO el calendario", async () => {
    const onCerrar = vi.fn();
    render(<MetaFormModal {...props} onCerrar={onCerrar} />);
    fireEvent.click(document.querySelectorAll("button[aria-haspopup='dialog']")[0]);
    expect(screen.getAllByText("Toca el día").length).toBeGreaterThan(0);
    fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByText("Toca el día")).toBeNull());
    expect(onCerrar).not.toHaveBeenCalled();
    // Sin calendario, Escape sí cierra el formulario.
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCerrar).toHaveBeenCalledTimes(1);
  });
});

// ⚠️ La ficha de Marcación para el admin NO se tocó: la decisión del 14-sep-2026
// («Daniel entra a probarlo en su iPhone», `marcacion-permisos.test.ts`) manda
// hasta que Daniel diga otra cosa.
describe("#37 Inicio: la búsqueda usa el alto", () => {
  it("la lista de resultados no se queda en 320 px", () => {
    const src = readFileSync(path.join(__dirname, "../../components/SearchBar.tsx"), "utf8");
    expect(src).toMatch(/data-resultados-busqueda className="max-h-\[max\(20rem,calc\(100dvh-14rem\)\)\]/);
  });
});

/* ═══ El candado que recorre las piezas conocidas ═══════════════════════════ */

const leer = (r: string) => readFileSync(path.join(__dirname, "../..", r), "utf8");
const trozo = (src: string, desde: string) => {
  const i = src.indexOf(desde);
  const j = src.indexOf("\nexport ", i + 1);
  return src.slice(i, j < 0 ? undefined : j);
};

describe("🔒 la regla vive en las piezas compartidas", () => {
  // Hojas de UNA opción: se cierran al elegir y NO llevan «Listo».
  const deUnaOpcion: [string, string][] = [
    ["components/celular/BarraDeControles.tsx", "export function HojaMenu("],
    ["components/celular/Piezas.tsx", "export function HojaCel("],
    ["components/celular/Piezas.tsx", "export function HojaMenuCel("],
    ["app/marketing/components/celular/HojaDeAcciones.tsx", "export default function"],
    ["components/filtros/FiltroA.tsx", "export function Capsula("],
    ["components/productos/FiltrosProductos.tsx", "export function ChipLista("],
    ["components/catalogo/CatalogoFilters.tsx", "export function FiltroDesplegable("],
  ];
  it.each(deUnaOpcion)("%s › %s: sin «Listo»", (archivo, desde) => {
    const src = leer(archivo);
    expect(src.indexOf(desde)).toBeGreaterThan(-1);
    expect(trozo(src, desde)).not.toMatch(/>\s*Listo\s*</);
  });

  // La hoja de VARIAS opciones sí lo lleva.
  it("«Filtros» (varias opciones) se queda hasta «Listo»", () => {
    expect(trozo(leer("components/filtros/FiltroA.tsx"), "export function HojaFiltros(")).toMatch(/Listo/);
  });

  // Escape adentro cierra SOLO la capa: captura en `document` + stopPropagation.
  const popovers = ["components/ui/CampoFecha.tsx", "components/ui/PanelPeriodo.tsx", "components/ui/RangoFechas.tsx", "components/ui/OverflowMenu.tsx", "components/ui/DesplegableFlotante.tsx"];
  it.each(popovers)("%s: Escape no llega al formulario de atrás", (archivo) => {
    const src = leer(archivo);
    expect(src).toMatch(/addEventListener\("keydown", \w+, true\)/);
    expect(src).toMatch(/e\.stopPropagation\(\)/);
    // Sin un Escape en burbuja que se lleve también lo de atrás.
    expect(src).not.toMatch(/addEventListener\("keydown", \w+\)/);
  });

  // Tocar afuera en el iPhone: `touchstart`, que iOS sí manda.
  it.each(["components/ui/OverflowMenu.tsx", "components/ui/DesplegableFlotante.tsx"])("%s: se cierra al tocar afuera en el iPhone", (archivo) => {
    expect(leer(archivo)).toMatch(/addEventListener\("touchstart"/);
  });
});
