/**
 * 🔴 UN SOLO SELECTOR DE CLIENTE EN TODO EL SISTEMA.
 *
 * Daniel, textual (ago-2026): *"sí, todos deben de tener mismo selector, tiene
 * que hacer sentido con el sistema"*. La regla ya estaba escrita en CLAUDE.md
 * —el campo de cliente es un picker a `clientes_master` (D-XXX), nunca texto
 * libre— y aun así había una SEGUNDA forma de elegir cliente viva en Marketing
 * (`ClienteTypeahead`, con `onFreeText`): dos verdades para la misma pregunta.
 *
 * Este archivo es el BARRIDO que pone el build ROJO si aparece otra. No es una
 * lista de pantallas a revisar a mano —eso caza lo que ya se conoce y no puede
 * cazar lo que alguien escriba mañana—: es un detector sobre el código, con
 * excepciones EXPLÍCITAS y con el motivo escrito.
 *
 * ⚠️ EL BARRIDO BORRA LOS COMENTARIOS PRIMERO. Este repo ya pagó CUATRO veces
 * el candado que se cumple (o se rompe) con su propia explicación: este mismo
 * archivo nombra `ClienteTypeahead` y `setCliente(` en su encabezado.
 *
 * 🔑 El detector es una función PURA y se prueba con fuentes sintéticas: si solo
 * se corriera contra el repo de hoy, un detector roto devolvería cero hallazgos
 * y todo pasaría en verde sin haber mirado nada.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";
import { globSync } from "glob";

const SRC = join(__dirname, "..");

/** Fuera comentarios de bloque y de línea. Lo que queda es CÓDIGO. */
export function sinComentarios(fuente: string): string {
  return fuente
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/([^\n:"'`])\/\/[^\n]*$/gm, "$1");
}

/** Por qué este archivo cuenta como "otra forma de elegir cliente". */
export type MotivoHallazgo =
  /** Busca el directorio del grupo por su cuenta. */
  | "busca-el-directorio"
  /** Guarda un cliente elegido con un control PROPIO, sin pasar por el selector. */
  | "selector-propio"
  /** Ofrece clientes/tiendas en un `<datalist>`. */
  | "datalist-de-clientes";

/** Los dos selectores compartidos que existen. Importar uno = delegar. */
const SELECTORES_COMPARTIDOS =
  /from\s+["'][^"']*(ClientePicker|ClienteSwitchPicker)["']/;

/**
 * Qué hace de este archivo una forma de elegir cliente. Lista vacía = no lo es.
 *
 * 🔴 "Elegir" no es "buscar": un buscador que solo FILTRA una lista que ya está
 * en pantalla (el directorio, la cartera, las ventas) no ata a nadie a ningún
 * registro y no entra acá. Lo que se vigila es el campo que GUARDA un cliente.
 */
export function motivosDeSelectorDeCliente(fuenteCruda: string): MotivoHallazgo[] {
  const src = sinComentarios(fuenteCruda);
  const motivos: MotivoHallazgo[] = [];

  // (1) Llama al motor de búsqueda del directorio. Importar el TIPO no cuenta.
  if (/\buse(BusquedaClientes|ClientesDelGrupo)\s*\(/.test(src)) {
    motivos.push("busca-el-directorio");
  }

  // (2) Se queda con un cliente ELEGIDO y lo recoge con un control PROPIO, sin
  //     delegar en el selector compartido. Las tres condiciones importan:
  //     guardar + OFRECER una lista de clientes + no delegar. Sin la del medio,
  //     la ficha del directorio —que guarda el cliente que se está EDITANDO—
  //     se vería igual que un selector, y no lo es.
  const guardaElegido =
    /\bset(Cliente|Tienda)[A-Za-z]*\s*\(/.test(src) ||
    /\bcliente_switch_id\s*:/.test(src) ||
    /\btienda_codigo\s*:/.test(src);
  const ofreceClientes = /\b(cliente|tienda|hit|resultado)s?[A-Za-z]*\s*\??\.\s*map\s*\(/i.test(src);
  const dibujaControl = /<(input|select)\b/.test(src);
  if (guardaElegido && ofreceClientes && dibujaControl && !SELECTORES_COMPARTIDOS.test(src)) {
    motivos.push("selector-propio");
  }

  // (3) Un `<datalist>` de clientes o tiendas: la otra forma de "elegir de una
  //     lista" que no pasa por ningún componente.
  if (/<datalist[^>]*id=[^>]*(cliente|tienda)/i.test(src)) {
    motivos.push("datalist-de-clientes");
  }

  return motivos;
}

// ─────────────────────────────────────────────────────────────────────────────
// El detector, probado contra fuentes SINTÉTICAS (mutación)
// ─────────────────────────────────────────────────────────────────────────────

describe("🔑 el detector caza un selector nuevo, y no se conforma con nada menos", () => {
  it("caza el typeahead libre que había en Marketing (el hallazgo real)", () => {
    const typeaheadLibre = `
      "use client";
      import { useBusquedaClientes } from "@/lib/hooks/useBusquedaClientes";
      export default function Otro({ onSelect }) {
        const [tienda, setTienda] = useState("");
        const { hits } = useBusquedaClientes(tienda, true);
        return (<><input value={tienda} onChange={(e) => setTienda(e.target.value)} />
          {hits.map((h) => <button key={h.codigo} onClick={() => onSelect(h.nombre, h.codigo)}>{h.nombre}</button>)}</>);
      }`;
    expect(motivosDeSelectorDeCliente(typeaheadLibre)).toEqual([
      "busca-el-directorio",
      "selector-propio",
    ]);
  });

  it("caza una lista de clientes escrita a mano, aunque no toque el motor", () => {
    const aMano = `
      export default function Checkout() {
        const [cliente, setCliente] = useState();
        return (<><input type="search" />
          <ul>{clientes.map((c) => <li key={c.id}><button onClick={() => setCliente(c)}>{c.nombre}</button></li>)}</ul></>);
      }`;
    expect(motivosDeSelectorDeCliente(aMano)).toContain("selector-propio");
  });

  it("caza un <datalist> de clientes", () => {
    const conDatalist = `<datalist id="mis-clientes"><option value="City Mall" /></datalist>`;
    expect(motivosDeSelectorDeCliente(conDatalist)).toEqual(["datalist-de-clientes"]);
  });

  it("NO caza a quien delega en el selector compartido", () => {
    const delega = `
      import ClientePicker from "@/components/ClientePicker";
      export default function Form() {
        const [cliente, setCliente] = useState("");
        return (<><input value={otraCosa} />
          <ClientePicker value={cliente} codigo={cod} onChange={(n, c) => setCliente(n)} /></>);
      }`;
    expect(motivosDeSelectorDeCliente(delega)).toEqual([]);
  });

  it("NO caza un buscador que solo FILTRA una lista (no ata a nadie)", () => {
    const filtro = `
      export default function Lista() {
        const [q, setQ] = useState("");
        return <input placeholder="Buscar cliente…" value={q} onChange={(e) => setQ(e.target.value)} />;
      }`;
    expect(motivosDeSelectorDeCliente(filtro)).toEqual([]);
  });

  it("NO caza la ficha del directorio (guarda el cliente que se EDITA, no uno elegido)", () => {
    const ficha = `
      export default function ClienteDetail({ initialData }) {
        const [cliente, setCliente] = useState(initialData.cliente);
        return <input value={cliente.nombre} onChange={(e) => setCliente({ ...cliente, nombre: e.target.value })} />;
      }`;
    expect(motivosDeSelectorDeCliente(ficha)).toEqual([]);
  });

  it("🩸 un COMENTARIO no puede disparar ni silenciar el barrido", () => {
    const soloComentario = `
      // Acá vivía un useBusquedaClientes( con su setCliente( y su <datalist id="clientes">
      /* y este bloque también lo nombra: <input /> setTienda( */
      export const nada = 1;`;
    expect(motivosDeSelectorDeCliente(soloComentario)).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// El barrido sobre el repo REAL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Excepciones EXPLÍCITAS, con el motivo escrito. Agregar una es una edición
 * deliberada que se lee en el diff — que es todo el punto.
 */
const PERMITIDOS: Record<string, string> = {
  "components/ClientePicker.tsx":
    "EL selector del sistema contra el directorio (clientes_master, D-XXX).",
  "lib/hooks/useBusquedaClientes.ts":
    "El motor de búsqueda que usa ese selector. No dibuja ningún control.",
  "app/guias/page.tsx":
    "Lee el directorio UNA vez y se lo pasa al selector de la ventana de atar; no dibuja control propio.",

  // ── Otro universo de clientes: los de Switch, por empresa, con "Contado" ──
  "components/catalogo/ClienteSwitchPicker.tsx":
    "Pedidos: elige clientes de SWITCH (switch_clientes por empresa, con Contado), que no son los D-XXX del directorio.",
  "components/catalogo/CheckoutClient.tsx":
    "🔴 HALLAZGO REPORTADO A DANIEL: tiene su propia lista sobre el MISMO universo de Switch que ClienteSwitchPicker. Se dejó como está (es el checkout de pedidos, recién rehecho) y espera su decisión.",

  // ── Filtros de reporte: no atan a nadie a ningún registro ──
  "app/marketing/components/ReportePorTiendaView.tsx":
    "Filtro del reporte por tienda: solo acota lo que ya está en pantalla, no guarda nada.",
  "app/marketing/components/ReportePorProyectoView.tsx":
    "Filtro del reporte por proyecto: solo acota lo que ya está en pantalla, no guarda nada.",
};

function archivosDelSistema(): string[] {
  return globSync("{app,components,lib}/**/*.{ts,tsx}", { cwd: SRC })
    .filter((f) => !f.startsWith("__tests__"))
    .sort();
}

describe("🔴 no puede haber una segunda forma de elegir cliente", () => {
  it("el barrido encuentra archivos (si no, no está mirando nada)", () => {
    expect(archivosDelSistema().length).toBeGreaterThan(200);
  });

  it("todo el que elige cliente pasa por el selector único, o está en la lista con su motivo", () => {
    const hallazgos: string[] = [];
    for (const rel of archivosDelSistema()) {
      const motivos = motivosDeSelectorDeCliente(readFileSync(join(SRC, rel), "utf8"));
      if (motivos.length > 0 && !(rel in PERMITIDOS)) {
        hallazgos.push(`${rel} → ${motivos.join(", ")}`);
      }
    }
    expect(hallazgos).toEqual([]);
  });

  it("ninguna excepción quedó ZOMBI (el archivo existe y sigue siendo un hallazgo)", () => {
    for (const [rel, motivo] of Object.entries(PERMITIDOS)) {
      expect(existsSync(join(SRC, rel)), `${rel} ya no existe`).toBe(true);
      expect(motivo.length).toBeGreaterThan(30);
      expect(
        motivosDeSelectorDeCliente(readFileSync(join(SRC, rel), "utf8")).length,
        `${rel} ya no elige cliente: sacala de la lista`,
      ).toBeGreaterThan(0);
    }
  });

  it("⛔ el typeahead libre de cliente NO vuelve", () => {
    expect(existsSync(join(SRC, "app", "guias", "components", "ClienteTypeahead.tsx"))).toBe(false);
    const marketing = globSync("app/marketing/**/*.tsx", { cwd: SRC });
    for (const rel of marketing) {
      expect(sinComentarios(readFileSync(join(SRC, rel), "utf8"))).not.toContain(
        "ClienteTypeahead",
      );
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Los tres candados de conducta del selector, leídos del código compartido
// ─────────────────────────────────────────────────────────────────────────────

const picker = () => readFileSync(join(SRC, "components", "ClientePicker.tsx"), "utf8");
const sugerencias = () =>
  readFileSync(join(SRC, "components", "SugerenciasCliente.tsx"), "utf8");

describe("🔴 la salida a mano no puede volver a llamarse solo \"Otro\"", () => {
  it("el rótulo dice que es LA SALIDA, no un cliente más", () => {
    const codigo = sinComentarios(picker());
    expect(codigo).toContain("No está en la lista — escribir a mano");
    // El distintivo del campo tampoco: "Otro" se leía como un cliente.
    expect(codigo).toMatch(/>\s*A mano\s*</);
    expect(codigo).not.toMatch(/>\s*Otro\s*</);
  });
});

describe("🔴 elegir cliente NO es obligatorio", () => {
  it("la salida a mano viene ENCENDIDA por defecto (bodega despacha a destinos que no existen)", () => {
    expect(sinComentarios(picker())).toMatch(/permitirOtro\s*=\s*true/);
  });

  it("y las guías no la apagan", () => {
    const form = sinComentarios(
      readFileSync(join(SRC, "app", "guias", "components", "GuiaForm.tsx"), "utf8"),
    );
    expect(form).toContain("<ClientePicker");
    expect(form).not.toMatch(/permitirOtro=\{false\}/);
  });
});

describe("🔴 la sugerencia no puede atar sola", () => {
  it("no llama a ningún guardado: solo avisa qué se eligió", () => {
    const codigo = sinComentarios(sugerencias());
    expect(codigo).not.toMatch(/\bfetch\s*\(/);
    expect(codigo).not.toMatch(/method:\s*["'](POST|PUT|PATCH)/);
    expect(codigo).toContain("onElegir");
  });

  it("el selector la dibuja y la conecta a su onChange, no a un envío", () => {
    const codigo = sinComentarios(picker());
    expect(codigo).toContain("<SugerenciasCliente");
    expect(codigo).not.toMatch(/method:\s*["'](POST|PUT|PATCH)/);
  });
});
