// ============================================================================
// 🔴 LA BARRA DEL CELULAR (v3, 2-oct-2026): TRES RENGLONES CON TEXTO.
//
// v3 — Daniel rechazó la v2: *«no es intuitivo así como Apple. Puedes usar 3
// líneas si quieres, pero optimizadas»*. Los íconos solos (🏢, ⬇) y el período
// escondido no se entendían: solo lo universal (🔍, «···») va sin texto.
//   1 · título-selector · 🔍 · «···» (solo si hay ayuda o configuración)
//   2 · el período a todo el ancho
//   3 · segmentado · «Empresa: Todas ▾» · «Excel» (si no hay nada, no se dibuja)
//
// Lo de la v2 que sigue valiendo:
//
// Daniel rechazó la v1: *«Pones en los 3 puntitos cosas más usables y gastas
// una línea sólo en buscador. ¿Cómo lo haría Apple?»*. Rescató los títulos de
// 22 px.
//
// Lo que este candado congela:
//   1. `BARRA_CELULAR_2026_10` va en `false` en el commit; apagado (o en la
//      computadora) no se dibuja NADA nuevo y los títulos quedan como hoy.
//   2. La acción principal sigue existiendo, fija abajo, y llama a la MISMA
//      función una vez; publica `--fg-alto-barra-fija`.
//   3. BUSCAR NO OCUPA UNA FILA: es una lupa en la barra que se abre EN la
//      misma línea; con texto escrito se queda abierta.
//   4. Lo FRECUENTE va a la vista (íconos de la barra): ni la lupa, ni la
//      descarga, ni el filtro de empresa viven en el «···».
//   5. El «···» es solo para lo raro y no se dibuja si no hay nada raro.
//   6. El nombre se dice UNA vez: con pestañas, el título es la pestaña.
//   7. Título de 22 px: prendido baja, apagado es la clase de siempre, letra
//      por letra.
//   8. En cada módulo, la acción de la barra es la del botón de la computadora
//      (se lee el código: lo que se envía no cambia).
// ============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, act, renderHook } from "@testing-library/react";
import { readFileSync } from "fs";
import { join } from "path";
import { useState } from "react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/asistencia",
  useSearchParams: () => new URLSearchParams(""),
}));

import {
  BARRA_CELULAR_2026_10,
  subtituloDeLaBarra,
  textoDelTitulo,
  tituloCelular,
  usaBarraCelular,
} from "@/lib/navegacion/barra-controles-celular";
import {
  BarraDeControles,
  BuscarEnLaBarra,
  ChipSelector,
  DescargarEnLaBarra,
  EnLaBarra,
  ProveedorBarraCelular,
  useBarraCelular,
  useHayBarraCelular,
} from "@/components/celular/BarraDeControles";
import { ATRIBUTO_BARRA_FIJA, VAR_ALTO_BARRA_FIJA } from "@/lib/navegacion/barra-celular";

function medio(celular: boolean) {
  window.matchMedia = ((consulta: string) => ({
    matches: celular,
    media: consulta,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

const leer = (ruta: string) => readFileSync(join(__dirname, "../../", ruta), "utf8");

beforeEach(() => medio(true));
afterEach(() => {
  cleanup();
  document.documentElement.style.removeProperty(VAR_ALTO_BARRA_FIJA);
});

describe("el interruptor", () => {
  it("va APAGADO en el commit", () => {
    expect(BARRA_CELULAR_2026_10).toBe(false);
  });

  it("solo prende con el interruptor Y en el celular", () => {
    expect(usaBarraCelular(true, true)).toBe(true);
    expect(usaBarraCelular(true, false)).toBe(false);
    expect(usaBarraCelular(false, true)).toBe(false);
    medio(true);
    expect(renderHook(() => useBarraCelular()).result.current).toBe(false);
    expect(renderHook(() => useBarraCelular(true)).result.current).toBe(true);
    medio(false);
    expect(renderHook(() => useBarraCelular(true)).result.current).toBe(false);
  });
});

describe("reglas puras", () => {
  it("el nombre se dice una vez: con pestaña, el título es la pestaña", () => {
    expect(textoDelTitulo("Asistencia", "Aprobaciones")).toBe("Aprobaciones");
    expect(textoDelTitulo("Recordatorios", null)).toBe("Recordatorios");
    expect(textoDelTitulo("Guías", "  ")).toBe("Guías");
  });

  it("el subtítulo junta el período y el filtro puesto, sin huecos", () => {
    expect(subtituloDeLaBarra(["16 – 30 sep 2026", null, "Boston"])).toBe("16 – 30 sep 2026 · Boston");
    expect(subtituloDeLaBarra([false, ""])).toBe("");
  });

  it("título de 22 px prendido; apagado, la clase de siempre letra por letra", () => {
    const antes = "truncate text-[28px] font-bold leading-tight tracking-tight text-gray-900";
    expect(tituloCelular(antes, false)).toBe(antes);
    expect(tituloCelular(antes, true)).toBe("truncate text-[22px] font-semibold leading-tight tracking-tight text-gray-900");
    expect(tituloCelular("flex text-[34px] font-semibold leading-[1.08] text-gray-950", true)).toBe(
      "flex text-[22px] font-semibold leading-tight text-gray-950",
    );
    expect(tituloCelular("text-3xl font-bold", true)).toBe("text-[22px] font-semibold");
    // El tamaño por defecto sale del interruptor, que va apagado.
    expect(tituloCelular(antes)).toBe(antes);
  });
});

describe("apagada, no se dibuja nada nuevo", () => {
  it("sin proveedor activo, EnLaBarra no dibuja ni la acción ni los íconos", () => {
    function Pestana() {
      const hay = useHayBarraCelular();
      return (
        <>
          <span>{hay ? "barra" : "como-hoy"}</span>
          <EnLaBarra
            accion={{ rotulo: "Aprobar pendientes", onClick: () => {} }}
            iconos={<button type="button">Descargar Excel</button>}
          />
        </>
      );
    }
    render(
      <ProveedorBarraCelular activo={false}>
        <Pestana />
      </ProveedorBarraCelular>,
    );
    expect(screen.getByText("como-hoy")).toBeTruthy();
    expect(screen.queryByText("Aprobar pendientes")).toBeNull();
    expect(screen.queryByText("Descargar Excel")).toBeNull();
    expect(document.querySelector(`[${ATRIBUTO_BARRA_FIJA}]`)).toBeNull();
  });
});

describe("prendida", () => {
  function Pantalla({ activa, enviar, bajar = () => {} }: { activa: string; enviar: () => void; bajar?: () => void }) {
    const [q, setQ] = useState("");
    const [empresa, setEmpresa] = useState("todas");
    return (
      <ProveedorBarraCelular activo activa={activa}>
        <BarraDeControles
          titulo="Asistencia"
          pestanas={[
            { value: "asistencia", label: "Asistencia" },
            { value: "aprobaciones", label: "Aprobaciones" },
          ]}
          activa={activa}
          periodo={<span>16 – 30 sep 2026</span>}
          fila={
            <ChipSelector
              rotulo="Empresa"
              valor={empresa}
              opciones={[{ valor: "todas", etiqueta: "Todas" }, { valor: "boston", etiqueta: "Boston" }]}
              onCambiar={setEmpresa}
            />
          }
          menu={<button type="button">Cómo funciona</button>}
        />
        <EnLaBarra
          pestana="aprobaciones"
          iconos={<BuscarEnLaBarra valor={q} onCambiar={setQ} placeholder="Buscar colaborador…" etiqueta="Buscar colaborador" />}
          filaDer={<DescargarEnLaBarra opciones={[{ rotulo: "Excel", onClick: bajar }]} />}
          accion={{ rotulo: "Aprobar pendientes", onClick: enviar }}
        />
        <p data-testid="buscando">{q}</p>
      </ProveedorBarraCelular>
    );
  }

  it("la acción principal existe, abajo, y llama a la MISMA función una vez", () => {
    const enviar = vi.fn();
    render(<Pantalla activa="aprobaciones" enviar={enviar} />);
    const boton = screen.getByRole("button", { name: "Aprobar pendientes" });
    expect(boton.closest(`[${ATRIBUTO_BARRA_FIJA}]`)).not.toBeNull();
    fireEvent.click(boton);
    expect(enviar).toHaveBeenCalledTimes(1);
  });

  it("publica --fg-alto-barra-fija y la suelta al irse", () => {
    const { unmount } = render(<Pantalla activa="aprobaciones" enviar={() => {}} />);
    expect(document.documentElement.style.getPropertyValue(VAR_ALTO_BARRA_FIJA)).toMatch(/px$/);
    unmount();
    expect(document.documentElement.style.getPropertyValue(VAR_ALTO_BARRA_FIJA)).toBe("0px");
  });

  it("lo frecuente va EN LA BARRA y CON TEXTO, no en el «···»", () => {
    render(<Pantalla activa="aprobaciones" enviar={() => {}} />);
    const barra = document.querySelector("[data-barra-celular]") as HTMLElement;
    const menu = document.querySelector("[data-hoja-mas]") as HTMLElement;
    // 🔍 en el renglón 1; el período en el 2; empresa y Excel, con texto, en el 3.
    const r1 = barra.querySelector('[data-renglon="titulo"]') as HTMLElement;
    const r2 = barra.querySelector('[data-renglon="periodo"]') as HTMLElement;
    const r3 = barra.querySelector('[data-renglon="filtros"]') as HTMLElement;
    expect(r1.contains(screen.getByLabelText("Buscar colaborador"))).toBe(true);
    expect(r2.textContent).toContain("16 – 30 sep 2026");
    expect(r3.textContent).toContain("Empresa: Todas");
    expect(r3.textContent).toContain("Excel");
    for (const el of [screen.getByLabelText("Empresa"), screen.getByText("Excel")]) {
      expect(menu.contains(el)).toBe(false);
    }
    expect(menu.textContent).toContain("Cómo funciona");
  });

  it("descargar con una sola opción dice su nombre y descarga directo", () => {
    const bajar = vi.fn();
    render(<Pantalla activa="aprobaciones" enviar={() => {}} bajar={bajar} />);
    fireEvent.click(screen.getByRole("button", { name: "Excel" }));
    expect(bajar).toHaveBeenCalledTimes(1);
  });

  it("el renglón 3 no se dibuja si no hay nada que poner", () => {
    cleanup();
    render(
      <ProveedorBarraCelular activo>
        <BarraDeControles titulo="Recordatorios" />
      </ProveedorBarraCelular>,
    );
    expect((document.querySelector('[data-renglon="filtros"]') as HTMLElement).className).toContain("hidden");
    expect(document.querySelector('[data-renglon="periodo"]')).toBeNull();
  });

  it("buscar no ocupa una fila: la lupa se abre EN la barra y filtra", () => {
    render(<Pantalla activa="aprobaciones" enviar={() => {}} />);
    expect(screen.queryByRole("searchbox")).toBeNull();
    fireEvent.click(screen.getByLabelText("Buscar colaborador"));
    const campo = screen.getByRole("searchbox");
    const barra = document.querySelector("[data-barra-celular]") as HTMLElement;
    expect(barra.contains(campo)).toBe(true);
    fireEvent.change(campo, { target: { value: "Angel" } });
    expect(screen.getByTestId("buscando").textContent).toBe("Angel");
    fireEvent.click(screen.getByText("Cancelar"));
    expect(screen.getByTestId("buscando").textContent).toBe("");
    expect(screen.queryByRole("searchbox")).toBeNull();
  });

  it("el filtro puesto se ve: el chip dice cuál y va en negro", () => {
    render(<Pantalla activa="aprobaciones" enviar={() => {}} />);
    const select = screen.getByLabelText("Empresa") as HTMLSelectElement;
    expect(select.parentElement!.className).not.toContain("bg-gray-900");
    fireEvent.change(select, { target: { value: "boston" } });
    expect(select.parentElement!.textContent).toContain("Empresa: Boston");
    expect(select.parentElement!.className).toContain("bg-gray-900");
  });

  it("lo de una pestaña escondida no entra a la barra", () => {
    render(<Pantalla activa="asistencia" enviar={() => {}} />);
    expect(screen.queryByText("Aprobar pendientes")).toBeNull();
    expect(screen.queryByLabelText("Buscar colaborador")).toBeNull();
  });

  it("la página termina con un relleno = barra fija + 76 px: nada queda bajo el ☰", () => {
    render(<Pantalla activa="aprobaciones" enviar={() => {}} />);
    const colchones = document.querySelectorAll("[data-colchon-abajo]");
    expect(colchones.length).toBe(1);
    expect((colchones[0] as HTMLElement).style.height).toBe("calc(var(--fg-alto-barra-fija, 0px) + 76px)");
    // Va al final del documento, después de todo el contenido.
    expect(document.body.lastElementChild?.contains(colchones[0]) || document.body.lastElementChild === colchones[0] || colchones[0].parentElement === document.body).toBe(true);
  });

  it("el título es la pestaña, sin repetir el módulo", () => {
    render(<Pantalla activa="aprobaciones" enviar={() => {}} />);
    const fila = (document.querySelector("[data-barra-celular] p") as HTMLElement).cloneNode(true) as HTMLElement;
    fila.querySelectorAll("select").forEach((s) => s.remove());
    expect(fila.textContent).toBe("Aprobaciones");
  });

  it("el «···» se cierra al tocar lo de adentro, y sin nada raro no se dibuja", async () => {
    render(<Pantalla activa="aprobaciones" enviar={() => {}} />);
    const hoja = document.querySelector("[data-hoja-mas]") as HTMLElement;
    fireEvent.click(screen.getByRole("button", { name: "Más opciones" }));
    expect(hoja.className).not.toContain("hidden");
    await act(async () => {
      fireEvent.click(screen.getByText("Cómo funciona"));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(hoja.className).toContain("hidden");
    cleanup();
    render(
      <ProveedorBarraCelular activo>
        <BarraDeControles titulo="Recordatorios" />
      </ProveedorBarraCelular>,
    );
    expect(screen.queryByRole("button", { name: "Más opciones" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. En cada módulo la acción de la barra es la del botón de la computadora.
// ─────────────────────────────────────────────────────────────────────────────
describe("lo que se envía no cambia: la barra llama a la misma función", () => {
  const casos: Array<[string, string, RegExp]> = [
    ["app/asistencia/AprobacionesTab.tsx", 'void decidir(pendientes, "si")', /onClick: \(\) => void decidir\(pendientes, "si"\)/],
    ["app/asistencia/PrestamosTab.tsx", "void abrirNuevoPrestamo()", /onClick: \(\) => void abrirNuevoPrestamo\(\)/],
    ["app/asistencia/ConfiguracionTab.tsx", "RUTA_PERSONA_NUEVA", /router\.push\(RUTA_PERSONA_NUEVA\)/],
    ["app/guias/components/GuiasList.tsx", "onNewGuia", /rotulo: "Nueva guía", onClick: onNewGuia/],
    ["app/recordatorios/RecordatoriosClient.tsx", "setPuertaAbierta(true)", /BarraAccionFija[^>]*onClick=\{\(\) => setPuertaAbierta\(true\)\}/],
  ];
  for (const [archivo, delEscritorio, deLaBarra] of casos) {
    it(`${archivo}: la barra y la computadora usan ${delEscritorio}`, () => {
      const src = leer(archivo);
      expect(src).toMatch(deLaBarra);
      expect(src.split(delEscritorio).length - 1).toBeGreaterThanOrEqual(2);
    });
  }

  it("Aprobaciones: el nombre COMPLETO arriba y «días · horas» debajo, con la barra prendida", () => {
    const src = leer("app/asistencia/aprobaciones/PorColaborador.tsx");
    const barra = src.slice(src.indexOf("{barra ? ("), src.indexOf(") : (", src.indexOf("{barra ? (")));
    expect(barra).toMatch(/flex-col/);
    expect(barra).not.toMatch(/truncate text-sm font-semibold/);
    expect(barra).toMatch(/capitalizarNombre\(p\.etiqueta\)/);
    expect(barra).toMatch(/textoDiasYHoras\(p\.diasPendientes, p\.minutosPendientes\)/);
    expect(barra).toMatch(/<BotonesSiNo/);
  });

  it("las descargas de la barra llaman a las MISMAS funciones", () => {
    // v3.1: descargar es ocasional → vive en el «···», con la MISMA función.
    expect(leer("app/asistencia/AprobacionesTab.tsx")).toMatch(/menu=\{[\s\S]{0,200}onClick=\{\(\) => void bajarExcel\(\)\}[\s\S]{0,120}Descargar Excel/);
    const reporte = leer("app/asistencia/ReporteTab.tsx");
    expect(reporte).toMatch(/onClick=\{\(\) => void bajarExcel\(\)\} className=\{CLASE_FILA_MENU\}/);
    expect(reporte).toMatch(/onClick=\{\(\) => void bajarPdf\(\)\} className=\{CLASE_FILA_MENU\}/);
    const prestamos = leer("app/asistencia/PrestamosTab.tsx");
    expect(prestamos).toMatch(/onClick=\{\(\) => void descargar\("deben"\)\} className=\{`\$\{CLASE_FILA_MENU\}/);
    expect(prestamos).toMatch(/onClick=\{\(\) => void descargar\("todos"\)\} className=\{`\$\{CLASE_FILA_MENU\}/);
  });

  it("cada módulo cuelga del gancho compartido, no de un interruptor propio", () => {
    for (const m of [
      "app/asistencia/AsistenciaClient.tsx",
      "app/guias/page.tsx",
      "app/recordatorios/RecordatoriosClient.tsx",
      "app/ventas/VentasShell.tsx",
      "app/comisiones/ComisionesPageClient.tsx",
    ]) expect(leer(m)).toMatch(/useBarraCelular\(\)/);
  });

  it("el título de 22 px llega a TODAS las portadas del celular", () => {
    for (const m of [
      "components/AppHeader.tsx",
      "components/celular/Piezas.tsx",
      "app/cxc/components/PanelCxcCelular.tsx",
      "app/reclamos/components/celular/PortadaCelular.tsx",
      "app/marketing/components/celular/PiezasCelular.tsx",
      "app/asistencia/PortadaCelular.tsx",
      "app/multifashion/MultifashionShell.tsx",
    ]) expect(leer(m), m).toMatch(/tituloCelular\("/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// v3.1 (2-oct-2026): mismos altos, nada solo en una fila, y el vidrio.
// ─────────────────────────────────────────────────────────────────────────────
import { CLASE_SEGMENTADO_BARRA, CLASE_TOQUE_44 } from "@/components/celular/BarraDeControles";
import { CLASE_VIDRIO, VIDRIO_2026_10, conVidrio } from "@/lib/ui/vidrio";

describe("v3.1 · una sola medida para los controles", () => {
  it("segmentados y chips miden 36 px a la vista y se tocan en 44", () => {
    expect(CLASE_SEGMENTADO_BARRA).toMatch(/(^|\s)h-9(\s|$)/);
    expect(CLASE_SEGMENTADO_BARRA).toMatch(/before:-inset-y-1\.5/); // 36 + 4 + 4 = 44
    expect(CLASE_TOQUE_44).toMatch(/before:-inset-y-1(\s|$)/);
  });

  it("todo segmentado de la barra usa la MISMA clase (Aprobaciones, Préstamos, Colaboradores, Recordatorios)", () => {
    for (const m of [
      "app/asistencia/AprobacionesTab.tsx",
      "app/asistencia/PrestamosTab.tsx",
      "app/asistencia/ConfiguracionTab.tsx",
      "app/recordatorios/RecordatoriosClient.tsx",
    ]) expect(leer(m), m).toMatch(/className=\{CLASE_SEGMENTADO_BARRA\}/);
  });

  it("el chip del módulo sube al lado del período cuando el renglón 3 quedaría con él solo", () => {
    render(
      <ProveedorBarraCelular activo>
        <BarraDeControles titulo="Planilla" periodo={<span>16 – 30 sep 2026</span>} fila={<span>Empresa: Todas</span>} />
      </ProveedorBarraCelular>,
    );
    const r2 = document.querySelector('[data-renglon="periodo"]') as HTMLElement;
    const r3 = document.querySelector('[data-renglon="filtros"]') as HTMLElement;
    expect(r2.textContent).toContain("Empresa: Todas");
    expect(r3.className).toContain("hidden");
  });

  it("Planilla: «Generar» comparte la línea del corte (el hueco de la quincena no ocupa lugar)", () => {
    expect(leer("app/asistencia/PlanillaTab.tsx")).toMatch(/barra \? "flex flex-wrap items-center gap-2" : "flex flex-wrap items-end gap-3"/);
  });

  it("Marcaciones: el lugar largo no ensancha la página", () => {
    expect(leer("app/asistencia/MarcacionesTab.tsx")).toMatch(/flex min-w-0 flex-1 justify-end overflow-hidden/);
  });
});

describe("v3.1 · el vidrio de iOS 26", () => {
  it("PRENDIDO (Daniel lo aprobó el 2-oct-2026) y apagado devuelve la clase de hoy", () => {
    expect(VIDRIO_2026_10).toBe(true);
    expect(conVidrio("bg-white", "vidrio", false)).toBe("bg-white");
    expect(conVidrio("bg-white", "vidrio", true)).toBe("vidrio");
  });

  it("la clase vive UNA vez en globals.css y cae a blanco sólido sin backdrop-filter", () => {
    const css = leer("app/globals.css");
    expect(css.match(/^\.vidrio \{/gm)?.length).toBe(1);
    expect(css).toMatch(/backdrop-filter: blur\(/);
    expect(css).toMatch(/@supports not \(\(backdrop-filter: blur\(1px\)\) or \(-webkit-backdrop-filter: blur\(1px\)\)\) \{\s*\.vidrio \{\s*background-color: rgb\(255 255 255 \/ 0\.95\);/);
  });

  it("se usa donde Apple lo usa: desplegables, hojas, el ☰ y la barra fija de abajo", () => {
    for (const m of [
      "components/ui/select.tsx",
      "components/ui/OverflowMenu.tsx",
      "components/celular/Piezas.tsx",
      "components/celular/BarraDeControles.tsx",
      "components/AppHeader.tsx",
      "app/reclamos/components/celular/piezas.tsx",
    ]) expect(leer(m), m).toMatch(/conVidrio\(/);
    expect(CLASE_VIDRIO).toBe("vidrio");
  });
});
