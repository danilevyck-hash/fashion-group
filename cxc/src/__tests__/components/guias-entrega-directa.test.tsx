/**
 * ─────────────────────────────────────────────────────────────────────────────
 * ENTREGA DIRECTA: LA PANTALLA Y EL PAPEL, PINTADOS DE VERDAD.
 *
 * 🔴 EL CANDADO OBLIGATORIO ES DE CONDUCTA, NO DE TEXTO. En este repo los
 * candados que buscan un literal dentro de un archivo pasan **estando mutados**:
 * el comentario que explica lo que se retiró contiene el texto que el barrido
 * busca, y el barrido se da por satisfecho con su propia explicación. Ya pasó
 * cuatro veces (el `revalidateOnFocus` de Reclamos, el `<h1>` de Saldos, el
 * `fetchMayorAsientos` del mayor y el aporte de Metas). Así que acá se
 * RENDERIZA y se LEE EL DOM.
 *
 * Lo que se prueba, y por qué:
 *
 *  1. **Una guía creada como entrega directa NO puede terminar impresa como
 *     "Transportista externo" ni con placa en cero.** Es el caso REAL: 50 de
 *     las 51 guías creadas como entrega directa quedaron grabadas como
 *     transportista externo, y GT-194/195/196 (11-ago-2026) tienen placa "0" y
 *     N° de transportista "0" — alguien tecleó ceros para poder apretar el
 *     botón. Las tres son las únicas placas "0" de toda la base.
 *
 *  2. **En entrega directa la pantalla NO PIDE placa ni N° de transportista.**
 *     No es que sean opcionales: no existe un transportista. Se esconden.
 *
 *  3. **El modo no se vuelve a preguntar: se muestra, con un "Cambiar" al
 *     lado.** Y cambiarlo sigue siendo posible.
 *
 *  4. **Las mismas palabras en las dos pantallas.**
 *
 *  5. **El botón de la fila dice "Despachar" cuando la guía está pendiente.**
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import PrintDocument from "@/app/guias/components/PrintDocument";
import DespachoForm from "@/app/guias/components/DespachoForm";
import ListaEnvios from "@/app/guias/components/ListaEnvios";
import GuiasList from "@/app/guias/components/GuiasList";
import GuiaForm from "@/app/guias/components/GuiaForm";
import type { Guia, GuiaItem, ModoEntrega } from "@/app/guias/components/types";
import type { TipoDespacho } from "@/lib/guias/falta-para-despachar";
import { ETIQUETA_TIPO_DESPACHO } from "@/lib/guias/modo-despacho";

/** El texto del PAPEL, sin el bloque <style> que va al lado en el mismo árbol. */
function textoDelPapel(guia: Guia): string {
  const { container } = render(<PrintDocument guia={guia} />);
  return container.querySelector("#print-document")?.textContent ?? "";
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).startsWith("/api/guias/frecuencias")) {
        return { ok: true, json: async () => ({ clientes: [], empresas: [], direcciones: {} }) };
      }
      return { ok: true, json: async () => ({}) };
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ITEMS: GuiaItem[] = [
  { id: "i1", orden: 1, cliente: "CITY MALL PASO CANOA", cliente_codigo: "D-25", direccion: "Paso Canoas", empresa: "Fashion Wear", facturas: "F-1001", bultos: 4, numero_guia_transp: "" },
];

/** GT-194 tal como está en producción: creada entrega directa, ceros tecleados. */
function guiaDirecta(over: Partial<Guia> = {}): Guia {
  return {
    id: "g194",
    numero: 194,
    fecha: "2026-08-11",
    transportista: "Entrega directa",
    modo_entrega: "entrega_directa",
    transportista_id: null,
    placa: "0",
    observaciones: "",
    total_bultos: 4,
    item_count: 1,
    monto_total: 0,
    estado: "Pendiente Bodega",
    entregado_por: "Julio",
    numero_guia_transp: "0",
    guia_items: ITEMS.map((i) => ({ ...i, numero_guia_transp: "0" })),
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL CANDADO: una entrega directa no puede salir impresa como transportista externo", () => {
  it("la hoja de una guía creada como entrega directa NO dice 'Transportista externo'", () => {
    // ⚠️ `tipo_despacho` viene 'externo' porque es el DEFAULT de la columna en
    // la base — no porque nadie lo haya elegido. Ése era exactamente el bug.
    const texto = textoDelPapel(guiaDirecta({ tipo_despacho: "externo" }));
    expect(texto).not.toContain("Transportista externo");
    expect(texto).toContain("Entrega directa");
  });

  it("…y NO imprime una placa en cero: no imprime placa en absoluto", () => {
    const texto = textoDelPapel(guiaDirecta({ tipo_despacho: "externo" }));
    expect(texto).not.toContain("PLACA");
    // El "0" tecleado no puede aparecer suelto por ningún lado del papel.
    expect(texto).not.toMatch(/(^|[^0-9])0([^0-9]|$)/);
  });

  it("tampoco imprime el N° de guía del transportista (no hay transportista)", () => {
    expect(textoDelPapel(guiaDirecta({ tipo_despacho: "externo" }))).not.toContain("N GUIA TRANSP");
  });

  it("despachada por el camino NUEVO (tipo_despacho='directo') sale igual de bien", () => {
    const g = guiaDirecta({
      estado: "Completada",
      tipo_despacho: "directo",
      placa: "",
      numero_guia_transp: "",
      nombre_chofer: "Julio",
      guia_items: ITEMS,
    });
    const texto = textoDelPapel(g);
    expect(texto).not.toContain("Transportista externo");
    expect(texto).toContain("Entrega directa");
    expect(texto).toContain("Julio");
  });

  it("⚠️ y una guía que SÍ salió con transportista externo no se toca", () => {
    // La otra dirección importa igual: si `modo_entrega` ganara siempre, una
    // guía creada como directa y despachada a propósito con un tercero saldría
    // impresa como "Entrega directa" con la placa real del tercero al lado.
    const g = guiaDirecta({
      estado: "Completada",
      tipo_despacho: "externo",
      placa: "DG7115",
      numero_guia_transp: "TR-4471",
      guia_items: [{ ...ITEMS[0], numero_guia_transp: "TR-4471" }],
    });
    const texto = textoDelPapel(g);
    expect(texto).toContain("Transportista externo");
    expect(texto).toContain("DG7115");
    expect(texto).toContain("TR-4471");
  });

  it("una guía normal con transportista sigue imprimiendo placa y N° de línea", () => {
    const g: Guia = {
      ...guiaDirecta(),
      modo_entrega: "transportista",
      transportista: "Transporte Rápido",
      transportista_id: "t1",
      placa: "EK0700",
      numero_guia_transp: "TR-900",
      guia_items: [{ ...ITEMS[0], numero_guia_transp: "TR-900" }],
    };
    const texto = textoDelPapel(g);
    expect(texto).toContain("Transportista externo");
    expect(texto).toContain("PLACA");
    expect(texto).toContain("EK0700");
    expect(texto).toContain("TR-900");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
/** Monta DespachoForm con estado real, para poder tocar "Cambiar". */
function Despacho({ inicial }: { inicial: TipoDespacho }) {
  const [tipo, setTipo] = useState<TipoDespacho>(inicial);
  const [placa, setPlaca] = useState("");
  const [receptor, setReceptor] = useState("");
  const [cedula, setCedula] = useState("");
  const [chofer, setChofer] = useState("");
  return (
    <DespachoForm
      tipoDespacho={tipo}
      setTipoDespacho={setTipo}
      bPlaca={placa}
      setBPlaca={setPlaca}
      bReceptor={receptor}
      setBReceptor={setReceptor}
      bCedula={cedula}
      setBCedula={setCedula}
      bChofer={chofer}
      setBChofer={setChofer}
      bSaving={false}
      onConfirmar={() => {}}
    />
  );
}

describe("🔴 en entrega directa la pantalla NO pide placa ni N° de transportista", () => {
  it("los campos no existen — no es que estén marcados como opcionales", () => {
    render(<Despacho inicial="directo" />);
    expect(document.getElementById("despacho-placa")).toBeNull();
    // Y sí pide lo que corresponde.
    expect(document.getElementById("despacho-chofer")).not.toBeNull();
    expect(document.getElementById("despacho-receptor")).not.toBeNull();
    expect(document.getElementById("despacho-cedula")).not.toBeNull();
  });

  it("la caja del N° tampoco: vive en la lista de envíos, y ahí también se esconde", () => {
    // ⚠️ Desde el 17-ago-2026 los N° del transportista NO se dibujan en el
    // formulario: están pegados a su renglón en `ListaEnvios` (una sola lista).
    // La regla de entrega directa no cambió — se mide donde ahora vive.
    render(
      <ListaEnvios
        items={ITEMS}
        numerosTransp={[""]}
        setNumeroTransp={() => {}}
        editable
        externo={false}
      />,
    );
    expect(document.getElementById("transp-0")).toBeNull();
  });

  it("con transportista externo los dos campos SIGUEN estando", () => {
    render(<Despacho inicial="externo" />);
    expect(document.getElementById("despacho-placa")).not.toBeNull();
    render(
      <ListaEnvios
        items={ITEMS}
        numerosTransp={[""]}
        setNumeroTransp={() => {}}
        editable
        externo
      />,
    );
    expect(document.getElementById("transp-0")).not.toBeNull();
  });

  it("el botón 'Despachar' se puede tocar sin placa en entrega directa", () => {
    render(<Despacho inicial="directo" />);
    fireEvent.change(document.getElementById("despacho-chofer") as HTMLElement, { target: { value: "Julio" } });
    fireEvent.change(document.getElementById("despacho-receptor") as HTMLElement, { target: { value: "Ana" } });
    fireEvent.change(document.getElementById("despacho-cedula") as HTMLElement, { target: { value: "8-1-1" } });
    // Faltan las firmas, no la placa.
    const falta = screen.getByText(/^Falta:/).textContent ?? "";
    expect(falta).toContain("firma");
    expect(falta).not.toContain("placa");
  });
});

describe("🔴 el modo se MUESTRA, con un 'Cambiar' al lado", () => {
  it("no hay dos botones preguntando el modo: hay un texto y un 'Cambiar'", () => {
    render(<Despacho inicial="directo" />);
    expect(screen.getByText(ETIQUETA_TIPO_DESPACHO.directo)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cambiar" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: ETIQUETA_TIPO_DESPACHO.externo })).toBeNull();
  });

  it("tocar 'Cambiar' abre las dos opciones, y elegir cambia el modo de verdad", () => {
    render(<Despacho inicial="directo" />);
    fireEvent.click(screen.getByRole("button", { name: "Cambiar" }));
    fireEvent.click(screen.getByRole("button", { name: ETIQUETA_TIPO_DESPACHO.externo }));
    // Cambió: ahora sí pide placa.
    expect(document.getElementById("despacho-placa")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Cambiar" })).toBeTruthy();
  });

  it("en entrega directa se explica por qué no se pide placa", () => {
    render(<Despacho inicial="directo" />);
    expect(screen.getByText(/nuestro propio camión/i)).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 las MISMAS palabras al crear y al despachar", () => {
  it("el formulario de alta dice 'Transportista externo', igual que el despacho", () => {
    render(
      <GuiaForm
        editingId={null}
        formNumero={1}
        fecha="2026-08-14"
        setFecha={() => {}}
        modoEntrega={"transportista" as ModoEntrega}
        setModoEntrega={() => {}}
        transportistaId={null}
        setTransportistaId={() => {}}
        entregadoPor=""
        setEntregadoPor={() => {}}
        observaciones=""
        setObservaciones={() => {}}
        items={ITEMS}
        transportistas={[]}
        direcciones={["David"]}
        validationErrors={new Set()}
        error={null}
        saving={false}
        onAddDireccion={() => {}}
        onUpdateItem={() => {}}
        onUpdateItemFields={() => {}}
        onAddRow={() => {}}
        onRemoveRow={() => {}}
        onRestoreRow={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
    expect(screen.getByRole("button", { name: ETIQUETA_TIPO_DESPACHO.externo })).toBeTruthy();
    expect(screen.getByRole("button", { name: ETIQUETA_TIPO_DESPACHO.directo })).toBeTruthy();
    // El nombre viejo, que no coincidía con el del despacho, no vuelve.
    expect(screen.queryByRole("button", { name: "Transportista" })).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el botón de la fila dice 'Despachar' cuando la guía está pendiente", () => {
  function listaCon(estado: string) {
    const g = guiaDirecta({ estado, id: "g1", modo_entrega: "transportista", transportista: "Transporte Rápido" });
    return render(
      <GuiasList
        guias={[g]}
        loading={false}
        error={null}
        search=""
        setSearch={() => {}}
        showPending={false}
        setShowPending={() => {}}
        role="admin"
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

  // ⚠️ CANDADO QUE CAMBIÓ DE DIRECCIÓN (25-ago-2026). El 14-ago el único botón
  // pasó a llamarse "Despachar" y "Editar" desapareció de la fila; corregir un
  // nombre obligaba a entrar por "Despachar" y buscar el formulario adentro.
  // Daniel: *"Dos botones en la fila: «Editar» y «Despachar»"*.
  it("Pendiente Bodega → los DOS: 'Editar' y 'Despachar'", () => {
    listaCon("Pendiente Bodega");
    expect(screen.getByRole("button", { name: /Despachar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /^Editar$/ })).toBeTruthy();
  });

  it("los demás estados sin despachar siguen con 'Editar' solo", () => {
    // "Confirmada" es un estado legacy que existe en la base y NO está
    // despachado, pero ya salió: no hay nada que despachar, solo corregir.
    listaCon("Confirmada");
    expect(screen.getByRole("button", { name: /Editar/ })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Despachar/ })).toBeNull();
  });

  it("los dos botones NAVEGAN — la fila no despacha", () => {
    const editar = vi.fn();
    const despachar = vi.fn();
    const g = guiaDirecta({ estado: "Pendiente Bodega", id: "g1", modo_entrega: "transportista", transportista: "Transporte Rápido" });
    const { container } = render(
      <GuiasList
        guias={[g]} loading={false} error={null} search="" setSearch={() => {}}
        showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
        expandedId="g1" expandedGuia={g} expandedLoading={false} onToggleExpand={() => {}}
        onEditar={editar} onDespachar={despachar} onDelete={() => {}}
      />,
    );
    const botones = [...container.querySelectorAll("button")];
    fireEvent.click(botones.find((b) => /^Editar$/.test((b.textContent ?? "").trim()))!);
    fireEvent.click(botones.find((b) => /^Despachar$/.test((b.textContent ?? "").trim()))!);
    expect(editar).toHaveBeenCalledWith("g1");
    expect(despachar).toHaveBeenCalledWith("g1");
    // 🔴 Y nada más: ni un pedido al servidor salió de la lista.
    expect(globalThis.fetch as unknown as ReturnType<typeof vi.fn>).not.toHaveBeenCalled();
  });

  it("Imprimir no se perdió", () => {
    listaCon("Pendiente Bodega");
    expect(screen.getByRole("button", { name: /Imprimir/ })).toBeTruthy();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 🩸 EL N° DEL TRANSPORTISTA DE UNA GUÍA DESPACHADA, EN EL ACORDEÓN.
//
// Desde el 18-ago-2026 el número se anota TARDE, y eso escribe UNA columna de
// UNA línea sin tocar `guia_transporte`. El acordeón leía la CABECERA, así que
// decía "—" con el número ya cargado. Es el mismo defecto que el 25-ago se
// arregló en el Excel y en el buscador de la lista, y que acá quedó vivo.
// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el acordeón lee el N° de los RENGLONES, no el de la cabecera", () => {
  function despachadaCon(items: GuiaItem[], cabecera = "") {
    const g = guiaDirecta({
      estado: "Completada", id: "g9", modo_entrega: "transportista",
      transportista: "Boston", tipo_despacho: "externo",
      numero_guia_transp: cabecera, guia_items: items,
    });
    return render(
      <GuiasList
        guias={[g]} loading={false} error={null} search="" setSearch={() => {}}
        showPending={false} setShowPending={() => {}} role="admin" onNewGuia={() => {}}
        expandedId="g9" expandedGuia={g} expandedLoading={false} onToggleExpand={() => {}}
        onEditar={() => {}} onDespachar={() => {}} onDelete={() => {}}
      />,
    );
  }

  it("el número anotado TARDE en una línea se ve, aunque la cabecera esté vacía", () => {
    const { container } = despachadaCon([{ ...ITEMS[0], numero_guia_transp: "TR-9999" }], "");
    expect(container.textContent).toContain("TR-9999");
    expect(container.textContent).not.toMatch(/N° guía transp\.\s*—/);
  });

  it("con varios distintos los lista TODOS: elegir uno sería elegir por el que lee", () => {
    const { container } = despachadaCon(
      [
        { ...ITEMS[0], id: "a", numero_guia_transp: "TR-4471" },
        { ...ITEMS[0], id: "b", numero_guia_transp: "TR-9999" },
      ],
      "TR-4471",
    );
    expect(container.textContent).toContain("TR-4471, TR-9999");
  });

  it("sin ninguno sigue diciendo «—»", () => {
    const { container } = despachadaCon([{ ...ITEMS[0], numero_guia_transp: "" }], "");
    expect(container.textContent).toMatch(/N° guía transp\./);
    expect(container.textContent).toContain("—");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 el N° del transportista se pide POR LÍNEA — y no en entrega directa", () => {
  // Daniel, punto 7: *"N° del transportista → POR LÍNEA, al lado de bultos"*.
  // ⚠️ Y en entrega directa NO se pide: sale en nuestro propio camión, no hay
  // transportista a quien pedírselo, y un campo que nadie puede llenar es
  // ruido. Es la misma razón por la que tampoco se pide la placa.
  function form(modo: ModoEntrega) {
    return render(
      <GuiaForm
        editingId={null}
        formNumero={1}
        fecha="2026-08-25"
        setFecha={() => {}}
        modoEntrega={modo}
        setModoEntrega={() => {}}
        transportistaId={modo === "transportista" ? "t1" : null}
        setTransportistaId={() => {}}
        entregadoPor="Julio"
        setEntregadoPor={() => {}}
        observaciones=""
        setObservaciones={() => {}}
        items={ITEMS}
        transportistas={[{ id: "t1", nombre: "Transporte Sol", activo: true }]}
        direcciones={["David"]}
        validationErrors={new Set()}
        error={null}
        saving={false}
        onAddDireccion={() => {}}
        onUpdateItem={() => {}}
        onUpdateItemFields={() => {}}
        onAddRow={() => {}}
        onRemoveRow={() => {}}
        onRestoreRow={() => {}}
        onSave={() => {}}
        onCancel={() => {}}
      />,
    );
  }

  /** El layout de TARJETA. Los dos se dibujan y el CSS esconde uno. */
  const cajas = () =>
    document.querySelectorAll('input[id^="numtransp-"][id$="-m"]');

  it("con transportista externo: una caja por renglón, al lado de los bultos", () => {
    form("transportista");
    expect(cajas()).toHaveLength(ITEMS.length);
    // Y va DESPUÉS de los bultos en el orden de lectura de la tarjeta.
    const bultos = document.querySelector('input[id^="bultos-"][id$="-m"]')!;
    const transp = cajas()[0];
    expect(bultos.compareDocumentPosition(transp) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("🔴 en ENTREGA DIRECTA no se pregunta: no hay a quién pedírselo", () => {
    form("entrega_directa");
    expect(cajas()).toHaveLength(0);
    expect(screen.queryByText(/N° guía del transportista/i)).toBeNull();
  });

  it("🩸 y el campo de CABECERA no vuelve: se preguntaba una vez para toda la guía", () => {
    // El transportista arma VARIAS guías suyas por cada guía nuestra, así que
    // preguntarlo arriba era pedir el dato equivocado — se escribía uno y el
    // papel lo repetía en las 7 filas.
    form("transportista");
    expect(document.getElementById("guia-numero-transp")).toBeNull();
  });
});
