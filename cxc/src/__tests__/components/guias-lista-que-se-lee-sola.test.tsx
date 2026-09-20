/**
 * ─────────────────────────────────────────────────────────────────────────────
 * 🔴 LA LISTA DE GUÍAS SE LEE SOLA (19-sep-2026)
 *
 * Cinco cosas que Daniel aprobó después de mirar la pantalla:
 *
 *   1. **Encabezados de columna.** La fila de escritorio tenía seis columnas y
 *      ninguna decía qué era.
 *   2. **Una columna de FECHA.** Se había ido el 5-sep porque «el encabezado
 *      del día ya la dice» — y el encabezado del día dice «Este mes».
 *   3. **El pie dice «47 guías de 236»**, no «236 GUÍAS»: la lista abre con el
 *      último mes y el resto espera detrás de un botón.
 *   4. **El borde de color solo cuando hay algo que decir.** El verde salía en
 *      las 236 filas. Y la rama que pintaba de AZUL los estados «Confirmada» y
 *      «Despachada» se borró: ninguna guía los tuvo jamás.
 *   5. **El aviso «Falta N° transportista» dejó de gritar.** Daniel: *«veo
 *      desorden más que nada cuando falta N de transportista, que la falta no
 *      se vea tan ruidosa»*. Era un chip ámbar con fondo en medio de la fila
 *      que empujaba las columnas ~95 px; ahora es un punto, y **su columna
 *      existe siempre**, con o sin aviso, así que nada se mueve.
 *
 * Y el buscador (G2): **con algo tecleado la ventana se abre entera.** 🩸
 * Buscar una guía de hace tres meses dejaba la lista VACÍA y la única
 * coincidencia escondida detrás de «Ver guías más viejas (1)».
 *
 * 🔴 CANDADO DE CONDUCTA: se RENDERIZA y se lee el DOM. Un barrido de texto se
 * cumple con el comentario que explica el cambio — en este repo ya pasó cuatro
 * veces.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, cleanup } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import type { Guia, GuiaItem } from "@/app/guias/components/types";
import { fmtDate } from "@/lib/format";
import { textoPieDeLista } from "@/lib/guias/pie-de-la-lista";
import {
  AVISO_SALIO_INCOMPLETA,
  AVISO_SIN_NUMERO_TRANSP,
  avisosDeLaFila,
} from "@/lib/guias/avisos-de-la-fila";
import { hayBusqueda, partirGuiasParaLaLista } from "@/lib/guias/ventana-lista";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
  vi.setSystemTime(new Date("2026-09-05T15:00:00Z"));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const ITEMS: GuiaItem[] = [
  { id: "i1", orden: 1, cliente: "City Mall Paso Canoa", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "2520", bultos: 7, numero_guia_transp: "725" },
];

/** Una guía COMPLETA: despachada y sin nada que reclamarle. */
function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g240", numero: 240, fecha: "2026-09-04", transportista: "RedNblue",
    modo_entrega: "transportista", transportista_id: "t1", placa: "EK0700",
    observaciones: "", total_bultos: 7, item_count: 1, estado: "Completada",
    entregado_por: "Julio", receptor_nombre: "Eric", cedula: "8-930-2142",
    numero_guia_transp: "725", guia_items: ITEMS,
    ...over,
  } as Guia;
}

function pintar(guias: Guia[], props: Record<string, unknown> = {}) {
  return render(
    <GuiasList
      guias={guias} loading={false} error={null} search="" setSearch={() => {}}
      showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
      expandedId={null} expandedGuia={null} expandedLoading={false} onToggleExpand={() => {}}
      onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}}
      onAtarCliente={() => {}}
      {...props}
    />,
  );
}

const encabezado = (c: HTMLElement) => c.querySelector<HTMLElement>('[data-testid="encabezado-lista"]');
const filas = (c: HTMLElement) => Array.from(c.querySelectorAll<HTMLElement>('[data-testid="fila-escritorio"]'));
/** La tarjeta del teléfono de la PRIMERA guía. */
const tarjeta = (c: HTMLElement) => c.querySelector<HTMLElement>(".lg\\:hidden.px-4")!;

/** 78 días atrás: fuera de la ventana de 30 días de la lista. */
const VIEJA = guia({ id: "g100", numero: 100, fecha: "2026-06-19" });

// ─── 1 · los encabezados de columna ──────────────────────────────────────────

describe("🔴 1 · la fila de escritorio dice qué es cada columna", () => {
  it("el encabezado existe y nombra las seis", () => {
    const { container } = pintar([guia()]);
    const e = encabezado(container);
    expect(e, "no se dibujó el encabezado de columnas").toBeTruthy();
    const texto = (e!.textContent || "").replace(/\s+/g, " ").trim();
    for (const rotulo of ["Guía", "Fecha", "Cliente", "Destino", "Bultos", "Transportista"]) {
      expect(texto, rotulo).toContain(rotulo);
    }
  });

  it("y van en el MISMO orden en que la fila dibuja sus datos", () => {
    const { container } = pintar([guia()]);
    const texto = (encabezado(container)!.textContent || "").replace(/\s+/g, " ");
    const orden = ["Guía", "Fecha", "Cliente", "Destino", "Bultos", "Transportista"].map((r) => texto.indexOf(r));
    for (let i = 1; i < orden.length; i += 1) expect(orden[i], orden.join(",")).toBeGreaterThan(orden[i - 1]);

    const fila = (filas(container)[0].textContent || "").replace(/\s+/g, " ");
    const datos = ["GT-240", fmtDate("2026-09-04"), "City Mall Paso Canoa", "Paso Canoas", "7 bultos", "RedNblue"]
      .map((d) => fila.indexOf(d));
    for (const i of datos) expect(i).toBeGreaterThan(-1);
    for (let i = 1; i < datos.length; i += 1) expect(datos[i], datos.join(",")).toBeGreaterThan(datos[i - 1]);
  });

  it("⚠️ el encabezado NO sale en el teléfono: ahí manda la tarjeta, que ya nombra cada dato", () => {
    const { container } = pintar([guia()]);
    expect(encabezado(container)!.className).toContain("hidden lg:flex");
  });

  it("sin ninguna guía no hay encabezado que encabece nada", () => {
    const { container } = pintar([]);
    expect(encabezado(container)).toBeNull();
  });
});

// ─── 2 · la columna de fecha ─────────────────────────────────────────────────

describe("🔴 2 · la fecha vuelve a ser una columna", () => {
  it("cada fila dice su día, aunque el encabezado del grupo diga «Este mes»", () => {
    const { container } = pintar([guia()]);
    expect(filas(container)[0].textContent).toContain(fmtDate("2026-09-04"));
  });
});

// ─── 3 · el pie ──────────────────────────────────────────────────────────────

describe("🔴 3 · el pie dice cuántas se VEN, de cuántas", () => {
  it("con guías escondidas detrás del botón, el pie lo dice", () => {
    const { container } = pintar([guia(), VIEJA]);
    expect(container.textContent).toContain("1 guía de 2");
  });

  it("con todo a la vista vuelve a ser UN número: nada de «2 de 2»", () => {
    const { container } = pintar([guia()]);
    expect(container.textContent).toContain("1 guía");
    expect(container.textContent).not.toContain("1 guía de 1");
  });

  it("la cuenta es de un módulo puro, y respeta el singular", () => {
    expect(textoPieDeLista(47, 236)).toBe("47 guías de 236");
    expect(textoPieDeLista(1, 236)).toBe("1 guía de 236");
    expect(textoPieDeLista(236, 236)).toBe("236 guías");
    expect(textoPieDeLista(1, 1)).toBe("1 guía");
    // Nunca se pasa de la raya: si se dibujan más de las que hay, un número.
    expect(textoPieDeLista(5, 3)).toBe("3 guías");
  });
});

// ─── 4 · el borde de color ───────────────────────────────────────────────────

describe("🔴 4 · el borde de color solo cuando hay algo que decir", () => {
  /** La tarjeta de la fila, que es la que lleva el borde. */
  const tarjetaDe = (f: HTMLElement) => f.closest<HTMLElement>(".rounded-lg")!;

  it("una despachada NO lleva borde verde: eran las 236 diciendo lo mismo", () => {
    const { container } = pintar([guia()]);
    const clases = tarjetaDe(filas(container)[0]).className;
    expect(clases).not.toContain("border-l-emerald");
    // El hueco de 4 px se conserva para que las filas no bailen.
    expect(clases).toContain("border-l-4");
  });

  it("la que todavía espera SÍ se pinta de ámbar", () => {
    const { container } = pintar([guia({ estado: "Pendiente Bodega" })]);
    expect(tarjetaDe(filas(container)[0]).className).toContain("border-l-amber-400");
  });

  it("🩸 y el AZUL de «Confirmada»/«Despachada» se borró: no existieron nunca", () => {
    for (const estado of ["Confirmada", "Despachada"]) {
      cleanup();
      const { container } = pintar([guia({ estado })]);
      expect(tarjetaDe(filas(container)[0]).className, estado).not.toContain("border-l-blue");
    }
  });
});

// ─── 5 · el aviso callado, y su columna que no se mueve ──────────────────────

/** Una despachada a la que le falta el número del transportista. */
const SIN_NUMERO = guia({
  id: "g241", numero: 241, numero_guia_transp: "",
  guia_items: [{ ...ITEMS[0], id: "i2", numero_guia_transp: "" }],
});

describe("🔴 5 · el aviso no grita y NO empuja las columnas", () => {
  it("lo que se avisa no cambió: las dos preguntas de siempre", () => {
    expect(avisosDeLaFila(SIN_NUMERO)).toEqual([AVISO_SIN_NUMERO_TRANSP]);
    expect(avisosDeLaFila(guia())).toEqual([]);
    // Sin placa: «Salió incompleta», el otro aviso, intacto.
    expect(avisosDeLaFila(guia({ placa: "" }))).toEqual([AVISO_SALIO_INCOMPLETA]);
  });

  it("🩸 ya no es un chip ámbar con fondo en medio de la fila", () => {
    const { container } = pintar([SIN_NUMERO]);
    const fila = filas(container)[0];
    // El texto sigue estando (para quien no ve la pantalla y para el `title`),
    // pero sin el fondo ámbar que se comía la fila.
    expect(fila.textContent).toContain(AVISO_SIN_NUMERO_TRANSP);
    expect(fila.innerHTML).not.toContain("bg-amber-50");
    expect(fila.innerHTML).not.toContain("border-amber-200");
  });

  it("🔴 LA COLUMNA DEL AVISO EXISTE SIEMPRE: la fila con aviso y la fila sin aviso tienen las MISMAS celdas", () => {
    const { container } = pintar([SIN_NUMERO, guia()]);
    const [conAviso, sinAviso] = filas(container);
    expect(conAviso.children.length, "las dos filas no tienen la misma cantidad de celdas")
      .toBe(sinAviso.children.length);
    // Y celda por celda, la misma clase de ancho: nada se corre.
    const anchos = (f: HTMLElement) => Array.from(f.children).map((c) => (c as HTMLElement).className);
    expect(anchos(conAviso)).toEqual(anchos(sinAviso));
  });

  it("el punto lleva el aviso en `title` y en texto para quien no ve la pantalla", () => {
    const { container } = pintar([SIN_NUMERO]);
    const punto = filas(container)[0].querySelector(`[title="${AVISO_SIN_NUMERO_TRANSP}"]`);
    expect(punto, "el aviso no lleva su texto en el title").toBeTruthy();
    expect(punto!.querySelector(".sr-only")?.textContent).toBe(AVISO_SIN_NUMERO_TRANSP);
  });

  it("en el teléfono el aviso se lee entero, pero tampoco lleva fondo", () => {
    const { container } = pintar([SIN_NUMERO]);
    const t = tarjeta(container);
    expect(t.textContent).toContain(AVISO_SIN_NUMERO_TRANSP);
    expect(t.innerHTML).not.toContain("bg-amber-50");
  });
});

// ─── 6 · el buscador abre la ventana entera ──────────────────────────────────

describe("🔴 6 · buscar una guía vieja la ENCUENTRA, no la esconde", () => {
  it("🩸 sin esto, buscarla dejaba la lista vacía detrás de «Ver guías más viejas»", () => {
    const { container } = pintar([guia(), VIEJA], { search: "GT-100" });
    expect(container.textContent).toContain("GT-100");
    expect(container.textContent).not.toContain("Ver guías más viejas");
  });

  it("y lo que no coincide sigue sin salir: se abre la VENTANA, no el filtro", () => {
    const { container } = pintar([guia(), VIEJA], { search: "GT-100" });
    expect(container.textContent).not.toContain("GT-240");
  });

  it("sin nada tecleado, todo como siempre: la vieja espera detrás del botón", () => {
    const { container } = pintar([guia(), VIEJA]);
    expect(container.textContent).toContain("Ver guías más viejas (1)");
    expect(container.textContent).not.toContain("GT-100");
  });

  it("la regla vive en un módulo puro, y los espacios solos no cuentan", () => {
    expect(hayBusqueda("")).toBe(false);
    expect(hayBusqueda("   ")).toBe(false);
    expect(hayBusqueda(null)).toBe(false);
    expect(hayBusqueda("GT-100")).toBe(true);

    const ahora = new Date("2026-09-05T15:00:00Z");
    const lista = [{ fecha: "2026-09-04" }, { fecha: "2026-06-19" }];
    expect(partirGuiasParaLaLista(lista, ahora, "").viejas).toHaveLength(1);
    expect(partirGuiasParaLaLista(lista, ahora, "  ").viejas).toHaveLength(1);
    expect(partirGuiasParaLaLista(lista, ahora, "x").viejas).toHaveLength(0);
    expect(partirGuiasParaLaLista(lista, ahora, "x").recientes).toHaveLength(2);
  });
});
