// Duplicar eligiendo el cliente + agregar artículos a un pedido existente
// (pedido de Daniel, 12-ago-2026). Se renderizan los modales REALES:
//
//  · DuplicarPedidoModal — el SELECTOR DE CLIENTE DE SWITCH, que es
//    OBLIGATORIO: sin elegir no se puede duplicar (Daniel: *"un vendedor TIENE
//    que elegir un cliente de switch, todos siempre"*).
//    🔴 TOCAR EL CLIENTE LO ELIGE; EL BOTÓN LO CONFIRMA (13-ago-2026). Daniel:
//    *"al seleccionar un cliente de una se agrega, enves de tener un boton para
//    confirmar el cliente, se siente mas natural asi"*. Antes el toque en la
//    fila DISPARABA el duplicado y un dedo en el cliente de al lado ya dejaba
//    el pedido creado a nombre de otro. Lo que confirma el botón es el CLIENTE
//    —por eso dice "Usar este cliente" y no "Duplicar"—, y el elegido se ve
//    escrito antes de aplicarlo.
//    🩸 El campo de NOMBRE LIBRE se fue y no vuelve: preguntaba lo mismo que el
//    selector y lo contradecía (venía pre-llenado con el cliente del pedido
//    VIEJO). El nombre del pedido nuevo ES el del cliente elegido.
//    Lo usan el Duplicar de la lista y "Duplicar y corregir" del pedido
//    bloqueado por Switch.
// Además, candados estáticos: el draftIdKey muerto no puede volver, y el
// "+ Agregar productos" del detalle lleva al CATÁLOGO en modo pedido
// (`?agregarA=<id>`) — el buscador inline que lo tapó se retiró el 12-ago-2026,
// ver src/__tests__/lib/catalogo-modo-pedido.test.ts.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { readFileSync } from "fs";
import path from "path";
import DuplicarPedidoModal from "@/components/catalogo/DuplicarPedidoModal";

vi.mock("next/navigation", () => ({
  usePathname: () => "/catalogo/reebok/pedido/x",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/useSidebarCollapsed", () => ({
  useSidebarCollapsed: () => false,
  readSidebarCollapsed: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// ── DuplicarPedidoModal ───────────────────────────────────────────────────────

const CLIENTES = [
  { cliente_switch_id: 42, codigo: "D-42", nombre: "Sporting Shoes" },
  { cliente_switch_id: 77, codigo: "D-77", nombre: "City Mall David" },
];

/** Directorio de clientes de la marca (lo que devuelve clientes-switch). */
function stubClientes(clientes: unknown = CLIENTES) {
  const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ clientes }) }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function renderDup(props: Partial<React.ComponentProps<typeof DuplicarPedidoModal>> = {}) {
  return render(
    <DuplicarPedidoModal
      orderNumber="PED-100"
      api="/api/catalogo/reebok"
      directorioLabel="Active Shoes"
      duplicando={false}
      onElegir={() => {}}
      onCancel={() => {}}
      {...props}
    />,
  );
}

/** Los botones que ofrece la ventana, tal como se leen. */
function botonesDelModal(): string[] {
  return screen.getAllByRole("button").map((b) => (b.textContent || "").trim());
}

describe("DuplicarPedidoModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("🔴 pregunta UNA sola cosa: sin campo de nombre libre, y el único botón de acción confirma el CLIENTE", async () => {
    stubClientes();
    renderDup();
    expect(screen.getByText("Duplicar pedido PED-100")).toBeTruthy();
    expect(screen.getByText("¿Para quién es el pedido nuevo?")).toBeTruthy();
    // El buscador del selector es el ÚNICO campo, y es un `search`; un campo de
    // texto suelto sería el "Nombre que sale en el pedido" volviendo.
    expect(screen.queryAllByRole("textbox")).toEqual([]);
    expect(screen.getAllByRole("searchbox").length).toBe(1);
    expect(screen.queryByText(/Nombre que sale en el pedido/)).toBeNull();
    // 🔴 UN solo paso más, y ni uno más: la lista, el botón que confirma el
    // cliente y Cancelar. Nada de re-elegir ni de pantalla intermedia.
    await screen.findByText("Sporting Shoes");
    expect(botonesDelModal()).toEqual([
      "Contado (venta de mostrador)",
      "Sporting ShoesD-42",
      "City Mall DavidD-77",
      "Usar este cliente",
      "Cancelar",
    ]);
  });

  it("🔴 TOCAR el cliente lo ELIGE — no duplica nada todavía", async () => {
    stubClientes();
    const onElegir = vi.fn();
    renderDup({ onElegir });
    fireEvent.click(await screen.findByText("Sporting Shoes"));
    // El dedo equivocado ya no crea el pedido: solo eligió.
    expect(onElegir).not.toHaveBeenCalled();
    // Y se VE cuál eligió, escrito, además de la fila marcada.
    expect(screen.getByText(/Cliente elegido:/).textContent).toContain("Sporting Shoes");
    expect(screen.getByRole("button", { name: /Sporting Shoes/ }).getAttribute("aria-pressed")).toBe("true");
  });

  it("🔴 el botón confirma el cliente elegido, y RECIÉN AHÍ duplica", async () => {
    stubClientes();
    const onElegir = vi.fn();
    renderDup({ onElegir });
    fireEvent.click(await screen.findByText("Sporting Shoes"));
    fireEvent.click(screen.getByRole("button", { name: "Usar este cliente" }));
    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(onElegir).toHaveBeenCalledWith("Sporting Shoes", { id: 42, nombre: "Sporting Shoes", codigo: "D-42" });
  });

  it("🔴 sin cliente elegido el botón va APAGADO (abrir la ventana no duplica nada)", async () => {
    stubClientes();
    const onElegir = vi.fn();
    renderDup({ onElegir });
    const btn = screen.getByRole("button", { name: "Usar este cliente" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onElegir).not.toHaveBeenCalled();
    // Y no hay ningún "Cliente elegido:" mintiendo antes de elegir.
    expect(screen.queryByText(/Cliente elegido:/)).toBeNull();
  });

  it("🔴 el toque equivocado SE CORRIGE sin salir: elegir otro cliente reemplaza al anterior", async () => {
    stubClientes();
    const onElegir = vi.fn();
    renderDup({ onElegir });
    fireEvent.click(await screen.findByText("Sporting Shoes"));
    fireEvent.click(screen.getByText("City Mall David"));
    expect(screen.getByText(/Cliente elegido:/).textContent).toContain("City Mall David");
    fireEvent.click(screen.getByRole("button", { name: "Usar este cliente" }));
    expect(onElegir).toHaveBeenCalledTimes(1);
    expect(onElegir).toHaveBeenCalledWith("City Mall David", { id: 77, nombre: "City Mall David", codigo: "D-77" });
  });

  it("Contado es una OPCIÓN que se elige y se confirma, no un default silencioso", () => {
    stubClientes();
    const onElegir = vi.fn();
    renderDup({ onElegir });
    expect(onElegir).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Contado (venta de mostrador)" }));
    expect(onElegir).not.toHaveBeenCalled();
    expect(screen.getByText(/Cliente elegido:/).textContent).toContain("Contado (venta de mostrador)");
    fireEvent.click(screen.getByRole("button", { name: "Usar este cliente" }));
    expect(onElegir).toHaveBeenCalledWith("Contado (venta de mostrador)", { id: null, nombre: "Contado (venta de mostrador)", codigo: null });
  });

  it("buscar NO es elegir: escribir en el buscador no duplica nada", async () => {
    stubClientes();
    const onElegir = vi.fn();
    renderDup({ onElegir });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Sporting" } });
    await waitFor(() => expect(screen.getByText("Sporting Shoes")).toBeTruthy());
    expect(onElegir).not.toHaveBeenCalled();
    expect((screen.getByRole("button", { name: "Usar este cliente" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("mientras duplica lo dice EN el botón y no acepta un segundo toque", async () => {
    stubClientes();
    const onElegir = vi.fn();
    const { rerender } = renderDup({ onElegir });
    fireEvent.click(await screen.findByText("Sporting Shoes"));
    fireEvent.click(screen.getByRole("button", { name: "Usar este cliente" }));
    rerender(
      <DuplicarPedidoModal
        orderNumber="PED-100"
        api="/api/catalogo/reebok"
        directorioLabel="Active Shoes"
        duplicando
        onElegir={onElegir}
        onCancel={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: "Duplicando..." }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    // Y las filas quedan apagadas: no se cambia de cliente a mitad de camino.
    const fila = screen.getByRole("button", { name: /Sporting Shoes/ }) as HTMLButtonElement;
    expect(fila.disabled).toBe(true);
    fireEvent.click(fila);
    expect(onElegir).toHaveBeenCalledTimes(1);
  });

  it("si el duplicado falla lo dice DENTRO de la ventana (no solo en un toast)", async () => {
    stubClientes();
    renderDup({ error: "No se pudo duplicar el pedido. Intenta de nuevo." });
    expect(screen.getByText("No se pudo duplicar el pedido. Intenta de nuevo.")).toBeTruthy();
    // Y se puede volver a intentar: las opciones siguen tocables.
    expect((screen.getByRole("button", { name: "Contado (venta de mostrador)" }) as HTMLButtonElement).disabled).toBe(false);
    await screen.findByText("Sporting Shoes");
  });

  it("Cancelar cierra sin duplicar", () => {
    stubClientes();
    const onCancel = vi.fn();
    const onElegir = vi.fn();
    renderDup({ onElegir, onCancel });
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalled();
    expect(onElegir).not.toHaveBeenCalled();
  });

  it("mientras duplica, Cancelar queda deshabilitado", () => {
    stubClientes();
    const onCancel = vi.fn();
    renderDup({ duplicando: true, onCancel });
    const btn = screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("busca en el directorio de LA MARCA (no en uno global)", async () => {
    const fetchMock = stubClientes();
    renderDup({ api: "/api/catalogo/calvin", directorioLabel: "Vistana International" });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toBe("/api/catalogo/calvin/clientes-switch?q=");
  });

  it("si el directorio no carga lo dice y NO deja elegir un cliente que no vio", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    renderDup();
    await waitFor(() =>
      expect(screen.getByText(/No se pudo cargar el directorio de clientes/)).toBeTruthy(),
    );
    // Contado sigue disponible: es la única opción que no depende del directorio.
    expect(screen.getByRole("button", { name: "Contado (venta de mostrador)" })).toBeTruthy();
  });
});

// ── Candados estáticos sobre el detalle del pedido ────────────────────────────

const SRC = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

/** El código SIN comentarios — un candado no se puede cumplir a sí mismo con
 *  el comentario que lo explica. */
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("candados estáticos", () => {
  it("el draftIdKey muerto no vuelve (nadie lo leía: solo se escribía)", () => {
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).not.toContain("draftIdKey");
    expect(SRC("src/lib/catalogo/marcas-ui.tsx")).not.toContain("draftIdKey");
  });

  it("'+ Agregar productos' lleva al catálogo en modo pedido (una sola forma de agregar)", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    expect(src).toContain("hrefCatalogoAgregando(theme.catalogoHref, id)");
    // El buscador inline que tapó el problema se retiró.
    expect(src).not.toContain("AgregarProductosModal");
    // Y el link crudo al catálogo (que metía al CARRITO) tampoco vuelve.
    expect(src).not.toMatch(/Link href=\{theme\.catalogoHref\}[^>]*>\s*\+ Agregar productos/);
  });

  it("los dos caminos de Duplicar pasan por el MISMO mini-modal", () => {
    expect(SRC("src/components/catalogo/ComprobantesPanel.tsx")).toContain("DuplicarPedidoModal");
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).toContain("DuplicarPedidoModal");
    // El POST de "Duplicar y corregir" manda el nombre elegido en el body.
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).toMatch(
      /orders\/\$\{id\}\/duplicar[\s\S]{0,200}client_name/,
    );
  });

  it("🔴 el campo de nombre libre NO puede volver al modal de duplicar", () => {
    const modal = SRC("src/components/catalogo/DuplicarPedidoModal.tsx");
    // Ni el campo, ni su etiqueta, ni el nombre del pedido viejo como semilla.
    expect(modal).not.toMatch(/<input/);
    expect(modal).not.toContain("Nombre que sale en el pedido");
    expect(modal).not.toContain("nombreInicial");
    expect(modal).not.toMatch(/setNombre|useState\(nombre/);
    // El nombre del pedido nuevo se DERIVA del cliente elegido, con la misma
    // función que dibuja el texto en pantalla (una sola fuente).
    expect(modal).toMatch(/onElegir\(nombreDeCliente\(cliente\), cliente\)/);
    // Y ningún padre le pasa el nombre del pedido viejo.
    for (const p of ["ComprobantesPanel", "PedidoDetalleClient"]) {
      expect(SRC(`src/components/catalogo/${p}.tsx`)).not.toContain("nombreInicial");
    }
  });

  it("🔴 el toque en la fila NO puede volver a duplicar solo: el selector solo ELIGE", () => {
    const modal = SRC("src/components/catalogo/DuplicarPedidoModal.tsx");
    // El `onElegir` del selector escribe estado y nada más — si volviera a
    // llamar al del padre, el dedo equivocado crearía el pedido otra vez.
    expect(modal).toMatch(/onElegir=\{setCliente\}/);
    expect(modal).not.toMatch(/onElegir=\{elegir\}/);
    // El disparo vive en un confirmar propio, que exige cliente elegido.
    expect(modal).toMatch(/function confirmar\(\)/);
    expect(modal).toMatch(/if \(duplicando \|\| !cliente\) return/);
    // Y el botón está apagado mientras no haya cliente.
    expect(modal).toMatch(/disabled=\{duplicando \|\| !cliente\}/);
    // Los dos padres siguen recibiendo la elección por onElegir (el contrato no
    // cambió): el paso nuevo vive DENTRO del modal, uno solo para los dos.
    for (const p of ["ComprobantesPanel", "PedidoDetalleClient"]) {
      const src = SRC(`src/components/catalogo/${p}.tsx`);
      expect(src).toMatch(/onElegir=\{/);
      expect(src).not.toMatch(/onConfirm=\{[^}]*[Dd]uplic/);
    }
  });

  it("🔴 lo que el botón confirma es el CLIENTE, no la duplicación", () => {
    // Sin comentarios: un candado que se cumple con su propia explicación da
    // permiso para romperlo (lección de `ventas-poda-textos`).
    const modal = sinComentarios(SRC("src/components/catalogo/DuplicarPedidoModal.tsx"));
    // Daniel: *"aqui me refiero al seleccionar un cliente… enves de tener un
    // boton para confirmar el cliente"*. El texto tiene que hablar del cliente:
    // un "¿Duplicar PED-100?" volvería a pedir dos veces la misma decisión.
    expect(modal).toMatch(/\{duplicando \? "Duplicando\.\.\." : "Usar este cliente"\}/);
    // El botón apagado no vuelve a explicarse con la etiqueta que se retiró.
    expect(modal).not.toContain("Elige el cliente");
    // Y el elegido se LEE antes de aplicarlo (el selector tiene scroll propio:
    // la fila marcada se puede quedar fuera de vista).
    expect(modal).toContain("Cliente elegido:");
  });

  it("los DOS caminos mandan el cliente de Switch elegido al servidor", () => {
    // Lista → POST /orders ; detalle → POST /duplicar. Si alguno dejara de
    // mandarlo, el pedido nacería en Contado aunque la pantalla mostrara otro.
    expect(SRC("src/components/catalogo/ComprobantesPanel.tsx")).toMatch(
      /\$\{theme\.api\}\/orders[\s\S]{0,800}cliente_switch_id/,
    );
    expect(SRC("src/components/catalogo/PedidoDetalleClient.tsx")).toMatch(
      /orders\/\$\{id\}\/duplicar[\s\S]{0,300}cliente_switch_id/,
    );
  });

  it("el botón 'Guardar' y el letrero 'Guardado a las …' se fueron, pero el AUTOGUARDADO sigue vivo", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    // Se fue lo que pedía atención…
    expect(src).not.toContain("Guardado a las");
    expect(src).not.toContain("Cambios sin guardar");
    expect(src).not.toContain("fmtTimeHMS");
    // …y quedó el Reintentar, que solo sale cuando el guardado FALLA.
    expect(src).toContain("Reintentar");
    // 🔴 EL MECANISMO NO SE TOCA: "+ Agregar productos" escribe directo en el
    // servidor y sin autoguardado el resto quedaría solo en memoria.
    expect(src).toContain("setTimeout(() => { performSave(); }, 2000)");
    expect(src).toMatch(/autoSaveTimer\.current = setTimeout/);
  });

  it("UN botón encadena confirmar + revisar + enviar, y el correo interno es opcional", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    // 12-ago-2026: el botón hace el camino COMPLETO — el modal de preview dejó
    // de ser un paso obligatorio.
    // 25-ago-2026: y ya no es UN botón: son las DOS salidas, directo, con el
    // control compartido. El texto viejo no puede volver por ningún lado.
    expect(src).toContain("<EnviarDocumentoSwitch");
    expect(src).not.toContain('"Enviar a Switch"');
    expect(src).not.toContain("Confirmar y enviar a Switch");
    // ⏱️ 12-ago-2026 (un solo viaje): la pre-validación y la creación viajan
    // juntas (`auto:true`) en vez de un `dry:true` + un POST real que volvía a
    // cruzar TODOS los SKU contra Switch. Primero confirmar, después el toque.
    expect(src).toMatch(/status: "confirmado"[\s\S]{0,2000}await crearEnSwitch\(true, documento\)/);
    expect(src).toContain("JSON.stringify(auto ? { auto: true, documento } : { documento })");
    // send-order YA NO cuelga de confirmar: es su propio botón.
    expect(src).toContain("Avisar por correo a Fashion Group");
    expect(src).toMatch(/async function avisarPorCorreo\(\)/);
    expect(src).not.toMatch(/async function confirmOrder\(\)/);
    // "Crear pedido en Switch" sobrevive SOLO como salida de la pantalla de
    // problema (cuando hay un aviso bloqueante que decidir), no como paso.
    // 24-ago-2026: dice "Crear pedido en Switch" o "Crear cotización en
    // Switch" según lo elegido — el mismo botón, con el nombre de lo elegido.
    expect(src).toContain("`Crear ${etiquetaDocumento(documentoElegido).toLowerCase()} en Switch`");
  });

  it("el selector de cliente del detalle ya no está gated a admin/secretaria", () => {
    const src = SRC("src/components/catalogo/PedidoDetalleClient.tsx");
    // El bloque se muestra a todo rol editor (vendedor incluido) y ya no vive
    // dentro de la rama `canDelete` del pedido confirmado.
    expect(src).toMatch(/puedeCambiarCliente = isEditorRole/);
    expect(src).not.toMatch(/canDelete && \(\s*<div className="pt-3 border-t border-gray-100">/);
  });
});
