/**
 * ─────────────────────────────────────────────────────────────────────────────
 * «RECHAZAR / DEVOLVER» SE FUE DE GUÍAS (14-ago-2026)
 *
 * Daniel, textual: *"en la guia si quitar rechazar, una guia se marca como
 * despachado / se edita / se imprime / pdf"* — o sea, ése es el flujo completo
 * y rechazar no es parte.
 *
 * EL DATO, medido contra producción el 14-ago-2026:
 *   · 0 guías en estado "Rechazada" de 186 (185 Completada + 1 Pendiente Bodega)
 *   · `motivo_rechazo` lleno en 0 filas
 *   · 5 meses de historia
 * Estaba tan escondido que solo aparecía con `canReject && isDispatched &&
 * estado !== "Rechazada"`, dentro del panel desplegado de una guía YA
 * despachada. Nunca se usó.
 *
 * 🔴 EL CANDADO ES DE CONDUCTA, NO DE TEXTO. En este repo los barridos que
 * buscan un literal dentro de un archivo pasan ESTANDO MUTADOS: el comentario
 * que explica lo retirado contiene el texto que el barrido busca, y el barrido
 * se da por satisfecho con su propia explicación. Ya pasó cuatro veces (el
 * `revalidateOnFocus` de Reclamos, el `<h1>` de Saldos, el `fetchMayorAsientos`
 * del mayor y el aporte de Metas). Así que acá se RENDERIZA y se lee el DOM.
 *
 * ⚠️ LO QUE **NO** SE TOCÓ, y está probado abajo:
 *   · La columna `motivo_rechazo` y el estado "Rechazada" SIGUEN en la base.
 *   · `guiaYaDespachada("Rechazada")` sigue devolviendo `true`: una fila
 *     heredada sigue siendo HISTORIA (no editable). Aflojar eso volvería
 *     editable una guía rechazada — el lado peligroso.
 *   · Despachar, editar e imprimir siguen intactos.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, cleanup, fireEvent } from "@testing-library/react";
import GuiasList from "@/app/guias/components/GuiasList";
import { guiaYaDespachada } from "@/lib/guias/modo-despacho";
import type { Guia, GuiaItem } from "@/app/guias/components/types";

afterEach(cleanup);

const ITEMS: GuiaItem[] = [
  {
    id: "i1",
    cliente: "City Mall Paso Canoa",
    direccion: "Paso Canoas",
    bultos: 4,
    facturas: "F-1",
  } as GuiaItem,
];

function guia(over: Partial<Guia> = {}): Guia {
  return {
    id: "g1",
    numero: 190,
    fecha: "2026-08-11",
    transportista: "Transporte Rápido",
    modo_entrega: "transportista",
    transportista_id: null,
    placa: "AB1234",
    observaciones: "",
    total_bultos: 4,
    item_count: 1,
    monto_total: 0,
    estado: "Completada",
    entregado_por: "Julio",
    numero_guia_transp: "TR-1",
    receptor_nombre: "Nicolás",
    cedula: "8-888-888",
    guia_items: ITEMS,
    ...over,
  } as Guia;
}

/** La lista con UNA guía, ya desplegada — que es donde vivía "Rechazar". */
function lista(over: Partial<Guia> = {}, role = "admin") {
  const g = guia(over);
  return render(
    <GuiasList
      guias={[g]}
      loading={false}
      error={null}
      search=""
      setSearch={() => {}}
      showPending={false}
      setShowPending={() => {}}
      role={role}
      onNewGuia={() => {}}
      expandedId="g1"
      expandedGuia={g}
      expandedLoading={false}
      onToggleExpand={() => {}}
      onEditar={() => {}}
      onDespachar={() => {}}
      onDelete={() => {}}
    />,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el camino para rechazar una guía no existe en la pantalla", () => {
  /**
   * 🩸 EL MENÚ «···» NO PINTA SUS ÍTEMS HASTA QUE SE ABRE (`{open && …}` en
   * `ui/OverflowMenu`), así que mirar el DOM con el menú cerrado NO prueba
   * nada: la primera versión de este candado PASÓ con "Rechazar/Devolver"
   * puesto de vuelta en el menú. Hay que ABRIRLO. Lo cazó la corrida de
   * mutación, no la lectura del código.
   */
  function abrirMenus(container: HTMLElement) {
    for (const t of Array.from(
      container.querySelectorAll('[aria-haspopup="menu"]'),
    )) {
      fireEvent.click(t);
    }
    // Los ítems van en un portal: se buscan en el documento, no en el container.
    return Array.from(
      container.ownerDocument.querySelectorAll('[role="menuitem"]'),
    ).map((e) => (e.textContent || "").trim());
  }

  // Los dos roles que PODÍAN rechazar (REJECT_ROLES era ["admin","secretaria"]).
  for (const role of ["admin", "secretaria"]) {
    it(`${role}: el menú «···» abierto NO ofrece "Rechazar/Devolver"`, () => {
      const { container } = lista({ estado: "Completada" }, role);
      const items = abrirMenus(container);
      // El menú tiene que existir de verdad, o el candado no mira nada:
      // "Eliminar guía" sigue estando para estos dos roles.
      expect(items.length, "el menú «···» no se abrió — el candado no probó nada")
        .toBeGreaterThan(0);
      expect(items.some((t) => /Rechazar|Devolver/i.test(t))).toBe(false);
      // Y tampoco suelto en ningún lado de la pantalla.
      expect(container.ownerDocument.body.textContent || "").not.toMatch(
        /Rechazar|Devolver/i,
      );
    });
  }

  it("no hay campo para escribir un motivo de rechazo", () => {
    const { container } = lista({ estado: "Completada" });
    for (const input of Array.from(container.querySelectorAll("input"))) {
      expect((input.getAttribute("placeholder") || "").toLowerCase()).not.toContain("motivo");
    }
    expect(container.textContent || "").not.toMatch(/Motivo de rechazo/i);
  });

  it("una guía heredada 'Rechazada' NO muestra su motivo ni pinta de rojo", () => {
    // No existe ninguna en producción (0 de 186), pero el estado sigue
    // siendo válido en la base: si apareciera, no debe reabrir el camino.
    const { container } = lista({
      estado: "Rechazada",
      motivo_rechazo: "llegó rota",
    } as Partial<Guia>);
    abrirMenus(container);
    const doc = container.ownerDocument.body.textContent || "";
    expect(doc).not.toContain("llegó rota");
    expect(doc).not.toMatch(/Rechazar|Devolver|Motivo de rechazo/i);
    expect(container.querySelector(".border-l-red-400")).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ lo que NO se tocó sigue en pie", () => {
  // ⚠️ NOTA 5-sep-2026 — estos dos candados CAMBIARON DE DIRECCIÓN, no se
  // borraron. El 14-ago-2026 se retiró el BOTÓN de rechazar y el estado se dejó
  // vivo «por si aparecía una fila heredada». No apareció: medido contra
  // producción el 5-sep-2026, **0 de las 242 guías** de toda la historia lo
  // usaron, y `motivo_rechazo` tiene 0 filas. Daniel: *«quitarlo»*. Ahora
  // `guiaYaDespachada` solo reconoce «Completada», `motivo_rechazo` salió de la
  // lista de campos que el PATCH acepta y la ruta de juegos frecuentes pide
  // `.eq("estado", "Completada")`. Lo que se sigue exigiendo —que una guía que
  // ya salió NO se vuelva editable— vale igual sobre «Completada», que es el
  // único estado cerrado que queda.
  it("«Completada» sigue siendo HISTORIA (no se vuelve editable)", () => {
    expect(guiaYaDespachada("Completada")).toBe(true);
    expect(guiaYaDespachada("Pendiente Bodega")).toBe(false);
    // Y el estado retirado ya no existe para el sistema.
    expect(guiaYaDespachada("Rechazada")).toBe(false);
  });

  it("una «Completada» se ve como despachada, NO como pendiente", () => {
    // ⚠️ CAMBIO DE DIRECCIÓN (5-sep-2026). Este caso leía el CHIP verde
    // «despachada», que Daniel retiró: salía en 221 de 222 filas y *«un color
    // que sale siempre deja de avisar»*. Lo que se sigue exigiendo es la
    // distinción, leída en el borde izquierdo —que no se tocó— y en que la
    // despachada NO se pinta como pendiente.
    const { container } = lista({ estado: "Completada" });
    expect(container.querySelector(".border-l-emerald-400")).not.toBeNull();
    expect(container.querySelector(".border-l-amber-400")).toBeNull();
    expect(container.textContent).not.toContain("despachada");
    const { container: pend } = lista({ estado: "Pendiente Bodega" });
    expect(pend.querySelector(".border-l-amber-400")).not.toBeNull();
    expect(pend.textContent).toContain("pendiente");
  });

  // El flujo que Daniel describió, entero: "se marca como despachado / se
  // edita / se imprime / pdf". Los tres estados, con sus botones REALES.
  //
  // ⚠️ CAMBIO DE DIRECCIÓN (5-sep-2026, «el panel de guías»). Los cuatro
  // salieron del acordeón y viven en la FILA: «Imprimir» y «Compartir» como
  // botones con `aria-label` («Imprimir la guía GT-xxx»), «Despachar» a la vista
  // solo en la pendiente, y «Editar» dentro del «···». Lo que este bloque
  // protege es lo mismo —qué se ofrece en cada estado— leído donde ahora está.
  const acciones = (c: HTMLElement) =>
    Array.from(c.querySelectorAll("button"))
      .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim())
      .filter(Boolean);

  /** Los ítems del «···» de la primera fila. Salen por un portal. */
  const itemsDelMenu = (c: HTMLElement) => {
    const trigger = c.querySelector('[aria-haspopup="menu"]');
    if (!trigger) return [];
    fireEvent.click(trigger);
    return Array.from(document.querySelectorAll('[role="menuitem"]')).map((e) => (e.textContent || "").trim());
  };

  it("Pendiente Bodega → Editar + Despachar + Imprimir + Compartir", () => {
    const { container } = lista({ estado: "Pendiente Bodega" });
    const t = acciones(container);
    expect(t.some((x) => /^Despachar$/i.test(x))).toBe(true);
    expect(t.some((x) => /^Imprimir la guía/i.test(x))).toBe(true);
    expect(t.some((x) => /^Compartir la guía/i.test(x))).toBe(true);
    expect(itemsDelMenu(container)).toContain("Editar");
  });

  it("Confirmada (legacy, sin despachar) → Editar + Imprimir", () => {
    const { container } = lista({ estado: "Confirmada" });
    expect(acciones(container).some((x) => /^Imprimir la guía/i.test(x))).toBe(true);
    expect(itemsDelMenu(container)).toContain("Editar");
  });

  it("🔴 Completada → Editar + Imprimir + Compartir, pero NUNCA Despachar", () => {
    // 🩸 ESTE CANDADO CAMBIÓ DE DIRECCIÓN, y es una decisión escrita de Daniel.
    //
    // Antes exigía que una guía despachada NO ofreciera «Editar». El resultado
    // medido: a `/guias/[id]` de una `Completada` **solo se llegaba escribiendo
    // la URL a mano**, y ahí adentro vive el N° del transportista. O sea que el
    // chip ámbar "Falta N° transportista" marcaba 143 guías que **nadie podía
    // destildar desde la pantalla**.
    //
    // Punto 9, textual: *"Entrar a una despachada → se entra igual que a
    // cualquier otra"*. Y punto 4: adentro se corrigen **tres** cosas (N° del
    // transportista · cliente · facturas), no todo — eso lo protegen
    // `campos-editables.ts` y el candado de la ruta.
    //
    // 🔴 LO QUE **NO** SE AFLOJÓ, y es lo que este test sigue cuidando:
    // «Despachar» NO aparece en una guía que ya salió. Una guía se despacha una
    // sola vez.
    const { container } = lista({ estado: "Completada" });
    const t = acciones(container);
    expect(t.some((x) => /^Imprimir la guía/i.test(x))).toBe(true);
    expect(t.some((x) => /^Compartir la guía/i.test(x))).toBe(true);
    expect(t.some((x) => /^Despachar$/i.test(x))).toBe(false);
    expect(itemsDelMenu(container)).toContain("Editar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("la base NO se toca", () => {
  it("el tipo de Guía conserva `motivo_rechazo` (la columna sigue en la base)", async () => {
    // Daniel: las columnas NO se borran. El tipo la sigue declarando para que
    // una fila heredada no se lea como dato desconocido.
    const src = await import("node:fs").then((fs) =>
      fs.readFileSync(process.cwd() + "/src/app/guias/components/types.ts", "utf8"),
    );
    expect(src).toContain("motivo_rechazo");
  });

  it("ninguna migración dropea la columna ni el estado", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const dir = path.join(process.cwd(), "supabase/migrations");
    for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".sql"))) {
      const sql = fs
        .readFileSync(path.join(dir, f), "utf8")
        .split("\n")
        .filter((l) => !l.trimStart().startsWith("--"))
        .join("\n");
      expect(sql, `${f} dropea motivo_rechazo`).not.toMatch(
        /DROP\s+COLUMN\s+(IF\s+EXISTS\s+)?motivo_rechazo/i,
      );
    }
  });
});
