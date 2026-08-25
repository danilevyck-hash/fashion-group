/**
 * PODA DE EXPLICACIONES (23-ago-2026) — CANDADOS DE CONDUCTA.
 *
 * Daniel, textual: *"no siempre tiene que haber explicación, al menos que te lo
 * pida, eso ensucia mi ERP"*. La vara que aprobó: **se queda solo lo que el
 * SISTEMA decidió y no se puede adivinar; lo que ya se sabe del negocio o de
 * Switch, fuera.**
 *
 * 🔴 EL RIESGO QUE ESTE ARCHIVO EXISTE PARA CAZAR NO ES QUE EL TEXTO VUELVA.
 * Es el otro: que al sacar la frase se lleve por delante el CAMPO, el BOTÓN o
 * el AVISO que estaban al lado. Una bajada de menos no la extraña nadie; un
 * "Subir foto" que desapareció con ella se descubre el día que hace falta la
 * foto. Por eso cada bloque de acá abajo MONTA la pantalla y afirma las dos
 * mitades: el texto NO está, y todo lo demás SÍ.
 *
 * ⚠️ Tres textos de la lista NO se podaron y no es un olvido — sus propios
 * candados los reclaman EN PANTALLA, así que la auditoría se equivocó con
 * ellos:
 *   · `ventas/ReferenciaView` "Podés pegar hasta N códigos juntos"
 *     → `components/ventas-poda-textos.test.tsx`
 *   · `multifashion/VendedorasSubtab` "incluye mayoreo si lo hubo"
 *     → `lib/poda-textos-cxc-multifashion.test.ts`
 *   · `caja/AvisoSaldoNegativo` "Considera solicitar reabastecimiento"
 *     → `lib/poda-textos-ayuda.test.ts`
 * y dos más quedaron fuera por decisión: el "El API de Switch no expone el
 * número de recibo" (candado propio en ventas-poda-textos) y el "Obligatorio —
 * sin paneles" de EntregaForm (candado propio en marketing-reclamos-toques).
 */
import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** El archivo SIN comentarios: un candado no se cumple con su propia historia. */
const soloCodigo = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

afterEach(cleanup);

// ───────────────────────────────────────────────────────────────────────────
// Reclamos › pasar a "En proceso"
// ───────────────────────────────────────────────────────────────────────────
import ComprobanteModal from "@/app/reclamos/components/ComprobanteModal";

describe("Reclamos · el modal de comprobante pierde la bajada, no el adjunto", () => {
  function pintar() {
    render(
      <ComprobanteModal
        open
        submitting={false}
        requireFile={false}
        title={'Pasar a "En proceso"'}
        submitLabel="Pasar a En proceso"
        onClose={() => {}}
        onSubmit={() => {}}
      />,
    );
  }

  it("la explicación NO está", () => {
    pintar();
    expect(screen.queryByText(/en este paso es opcional/i)).toBeNull();
    expect(screen.queryByText(/Adjunta el comprobante/i)).toBeNull();
  });

  it("el título, el adjunto, la nota y los dos botones SIGUEN", () => {
    pintar();
    expect(screen.getByText('Pasar a "En proceso"')).toBeTruthy();
    expect(screen.getByRole("button", { name: "Pasar a En proceso" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cancelar/i })).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
    expect(document.querySelector("textarea")).toBeTruthy();
  });

  it("el `description` se fue del componente Y de quien lo llamaba", () => {
    expect(soloCodigo("app/reclamos/components/ComprobanteModal.tsx")).not.toContain("description");
    expect(soloCodigo("app/reclamos/ReclamosClient.tsx")).not.toContain("en este paso es opcional");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Caja Menuda › lista de períodos
// ───────────────────────────────────────────────────────────────────────────
import PeriodoList from "@/app/caja/components/PeriodoList";

describe("Caja Menuda · sin la bajada del fondo fijo, y sin hueco donde estaba", () => {
  const PERIODOS = [
    {
      id: "p1",
      numero: 7,
      fecha_apertura: "2026-08-01",
      fecha_cierre: null,
      fondo_inicial: 500,
      estado: "abierto",
      total_gastado: 120.5,
      repuesto: false,
      repuesto_at: null,
    },
  ];

  function pintar(hasOpenPeriod: boolean) {
    render(
      <PeriodoList
        periodos={PERIODOS}
        loading={false}
        error={null}
        hasOpenPeriod={hasOpenPeriod}
        role="admin"
        onCreatePeriodo={() => {}}
        onLoadDetail={() => {}}
        onPrintPeriodo={() => {}}
        onClosePeriodo={() => {}}
        onDeletePeriodo={() => {}}
      />,
    );
  }

  it("la explicación NO está", () => {
    pintar(false);
    expect(screen.queryByText(/ciclo del fondo fijo/i)).toBeNull();
    expect(screen.queryByText(/Crea uno nuevo cuando se reponga el fondo/i)).toBeNull();
  });

  it("el botón de crear período y la lista SIGUEN", () => {
    pintar(false);
    expect(screen.getByRole("button", { name: /Nuevo período/i })).toBeTruthy();
    expect(screen.getByText(/Nº 7/)).toBeTruthy();
  });

  it("🔴 no queda una caja vacía: con período abierto NO se dibuja el encabezado", () => {
    const { container } = render(
      <PeriodoList
        periodos={PERIODOS}
        loading={false}
        error={null}
        hasOpenPeriod
        role="admin"
        onCreatePeriodo={() => {}}
        onLoadDetail={() => {}}
        onPrintPeriodo={() => {}}
        onClosePeriodo={() => {}}
        onDeletePeriodo={() => {}}
      />,
    );
    expect(screen.queryByRole("button", { name: /Nuevo período/i })).toBeNull();
    // El `max-w-xl` que sostenía la bajada ya no existe en ningún lado.
    expect(container.querySelector(".max-w-xl")).toBeNull();
    // Y el h1 sigue, para no dejar la página sin encabezado.
    expect(screen.getByText("Caja Menuda")).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Asistencia › corregir una marcación
// ───────────────────────────────────────────────────────────────────────────
import CorregirMarcacionModal from "@/app/asistencia/CorregirMarcacionModal";
import { ToastProvider } from "@/components/ToastSystem";

describe("Asistencia · el motivo sigue siendo OBLIGATORIO sin la frase que lo decía", () => {
  function pintar() {
    render(
      <ToastProvider>
        <CorregirMarcacionModal
          marca={{
            marcacionId: "m1",
            codigo: "12",
            persona: "ANA GÓMEZ",
            fecha: "2026-08-20",
            relojHora: "08:47:00",
          }}
          onCerrar={() => {}}
          onGuardado={() => {}}
        />
      </ToastProvider>,
    );
  }

  it("la explicación NO está", () => {
    pintar();
    expect(screen.queryByText(/nadie va a acordarse/i)).toBeNull();
  });

  it("🔴 el asterisco, el campo y el freno de guardar SIGUEN", () => {
    pintar();
    // El rótulo con su `*`.
    expect(screen.getByText(/Por qué se corrige/i).textContent).toContain("*");
    const motivo = document.querySelector("textarea") as HTMLTextAreaElement;
    expect(motivo).toBeTruthy();
    // Sin motivo, Guardar sigue apagado: la REGLA no se fue con el texto.
    const guardar = screen.getByRole("button", { name: /Guardar/i }) as HTMLButtonElement;
    expect(guardar.disabled).toBe(true);
    fireEvent.change(motivo, { target: { value: "Se le dañó el carro, avisó" } });
    expect((screen.getByRole("button", { name: /Guardar/i }) as HTMLButtonElement).disabled).toBe(false);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Cheques › recordatorio
// ───────────────────────────────────────────────────────────────────────────
import RecordatorioFormModal, { recordatorioVacio } from "@/app/cheques/components/RecordatorioFormModal";

/** El arnés trae un `localStorage` pelado; el picker de clientes lo usa. */
function almacenFalso(): Storage {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? (m.get(k) as string) : null),
    setItem: (k: string, v: string) => { m.set(k, String(v)); },
    removeItem: (k: string) => { m.delete(k); },
    clear: () => { m.clear(); },
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() { return m.size; },
  } as Storage;
}

describe("Cheques · el recordatorio pierde el pie de '¿Se repite?', no las opciones", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", almacenFalso());
    vi.stubGlobal("sessionStorage", almacenFalso());
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ clientes: [], total: 0 }) })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function pintar() {
    render(
      <RecordatorioFormModal
        open
        editingId={null}
        initial={recordatorioVacio("2026-08-30")}
        onClose={() => {}}
        onSave={() => {}}
        saving={false}
        isOnline
        error={null}
      />,
    );
  }

  it("la explicación NO está", () => {
    pintar();
    expect(screen.queryByText(/casi siempre, una sola vez/i)).toBeNull();
  });

  it("el rótulo y las opciones de repetición SIGUEN", () => {
    pintar();
    expect(screen.getByText(/¿Se repite\?/)).toBeTruthy();
    expect(screen.getByRole("group", { name: "Se repite" })).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Marketing › Registrar gasto (los tres caminos)
// ───────────────────────────────────────────────────────────────────────────
import RegistrarGastoModal from "@/app/marketing/components/RegistrarGastoModal";
import type { MkMarca } from "@/lib/marketing/types";

vi.mock("@/app/marketing/components/RegistrarPagoModal", () => ({
  default: () => <div data-testid="registrar-pago-modal" />,
}));

describe("Marketing · los tres caminos quedan con su nombre y sin su bajada", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => [] })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function abrir() {
    render(
      <ToastProvider>
        <RegistrarGastoModal
          marcas={[{ id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca]}
          marcaInicial={null}
          onClose={() => {}}
          onSaved={() => {}}
        />
      </ToastProvider>,
    );
  }

  it("las tres explicaciones NO están", () => {
    abrir();
    expect(screen.queryByText(/letreros, material, remodelación/i)).toBeNull();
    expect(screen.queryByText(/Descuenta el inventario en piezas/i)).toBeNull();
    expect(screen.queryByText(/para la marca en general, sin tienda/i)).toBeNull();
  });

  it("🔴 los TRES botones siguen, con su gancho de medición y su nombre", () => {
    abrir();
    expect(screen.getByText("¿Qué es el gasto?")).toBeTruthy();
    for (const [key, titulo] of [
      ["factura", "Factura"],
      ["mueble", "Mueble"],
      ["marca", "Gasto de la marca"],
    ] as const) {
      const boton = document.querySelector(`[data-camino="${key}"]`) as HTMLElement;
      expect(boton, `falta el camino ${key}`).toBeTruthy();
      expect(boton.textContent).toContain(titulo);
    }
  });

  it("el camino sigue ABRIENDO su formulario (la función no se podó)", () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]') as HTMLElement);
    expect(screen.getByRole("button", { name: /Continuar|Abriendo/ })).toBeTruthy();
  });

  it("la foto pierde su bajada y NO el botón de subirla", () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="factura"]') as HTMLElement);
    expect(screen.queryByText(/La del letrero puesto/i)).toBeNull();
    expect(screen.queryByText(/se agrega aunque el período ya esté cerrado/i)).toBeNull();
    expect(screen.getByRole("button", { name: "Subir foto" })).toBeTruthy();
  });

  it("la sub-opción de 'Gasto de la marca' conserva SUS ayudas (no estaban en la lista)", () => {
    abrir();
    fireEvent.click(document.querySelector('[data-camino="marca"]') as HTMLElement);
    expect(screen.getByText(/El pago de una impulsadora por el período que trabajó/i)).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Marketing › "Por cliente"
// ───────────────────────────────────────────────────────────────────────────
import PorClienteModal from "@/app/marketing/components/PorClienteModal";

describe("Marketing · 'Por cliente' pierde la definición, NO el aviso de que no se reporta", () => {
  const BLOQUES = [
    {
      key: "TH",
      nombre: "Tommy Hilfiger",
      periodoAbierto: null,
      facturas: { count: 1, total: 100 },
      muebles: { count: 0, total: 0 },
      total: 100,
      proyectos: 1,
      sinComprobante: 0,
      sinFoto: 0,
    },
  ] as never;
  const FILAS = [
    { cliente: "City Moda Chorrera", clienteCodigo: "D-30", porBloque: { TH: 100 }, total: 100 },
  ] as never;

  it("la definición NO está, pero el aviso SÍ", () => {
    render(<PorClienteModal bloques={BLOQUES} filas={FILAS} onClose={() => {}} />);
    expect(screen.queryByText(/Cuánto te costó cada tienda en total/i)).toBeNull();
    // 🔴 la segunda mitad NO estaba en la lista y frena un envío equivocado.
    expect(screen.getByText(/no se le reporta a ninguna marca/i)).toBeTruthy();
  });

  it("la tabla y el cierre SIGUEN", () => {
    render(<PorClienteModal bloques={BLOQUES} filas={FILAS} onClose={() => {}} />);
    expect(screen.getByText("City Moda Chorrera")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Marketing › Cerrar período
// ───────────────────────────────────────────────────────────────────────────
import CerrarPeriodoModal from "@/app/marketing/components/CerrarPeriodoModal";

describe("Marketing · cerrar período pierde la bajada del campo, no el campo ni el aviso rojo", () => {
  function pintar() {
    render(
      <ToastProvider>
        <CerrarPeriodoModal
          bloque={
            {
              key: "CK",
              nombre: "Calvin Klein",
              periodoAbierto: { id: "per-1", nombre: "2026 T1" },
              facturas: { count: 2, total: 300 },
              muebles: { count: 0, total: 0 },
              total: 300,
              proyectos: 2,
              sinComprobante: 0,
              sinFoto: 0,
            } as never
          }
          periodoId="per-1"
          onClose={() => {}}
          onCerrado={() => {}}
        />
      </ToastProvider>,
    );
  }

  it("la explicación NO está", () => {
    pintar();
    expect(screen.queryByText(/van a entrar en ese período/i)).toBeNull();
  });

  it("🔴 el campo obligatorio con su `*` y el aviso de 'no se puede deshacer' SIGUEN", () => {
    pintar();
    expect(screen.getByLabelText(/¿Cómo se llama el período que empieza\?/)).toBeTruthy();
    expect(screen.getByText(/Después de cerrarlo no se puede deshacer/i)).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Marketing › formulario de factura (pasos 1 y 2)
// ───────────────────────────────────────────────────────────────────────────
import { FacturaForm } from "@/components/marketing/FacturaForm";

describe("Marketing · los pasos del formulario de factura pierden la bajada, no el paso", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ existe: false, facturas: [] }) })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  function pintar() {
    render(
      <ToastProvider>
        <FacturaForm
          proyecto={{ id: "", marcas: [] } as never}
          marcasCatalogo={[{ id: "m-th", codigo: "TH", nombre: "Tommy Hilfiger" } as MkMarca]}
          marcaFija={null}
          onSubmit={() => {}}
          onCancel={() => {}}
        />
      </ToastProvider>,
    );
  }

  it("las dos explicaciones NO están", () => {
    pintar();
    expect(screen.queryByText(/Aceptamos solo PDF/i)).toBeNull();
    expect(screen.queryByText(/Edita lo que la IA no haya leído bien/i)).toBeNull();
  });

  it("los dos pasos, el uploader y los campos obligatorios SIGUEN", () => {
    pintar();
    expect(screen.getAllByText("Sube el PDF de la factura").length).toBeGreaterThan(0);
    expect(screen.getByText("Revisa o llena los datos de la factura")).toBeTruthy();
    expect(screen.getByLabelText(/Nº factura/)).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Depurador › Mi Excel con fotos
// ───────────────────────────────────────────────────────────────────────────
import MiExcelFotosClient from "@/app/productos/cargar/MiExcelFotosClient";

describe("Depurador · 'Mi Excel con fotos' se queda con la regla del nombre, no con la prosa", () => {
  it("las cuatro explicaciones de la puerta NO están", () => {
    render(<MiExcelFotosClient />);
    expect(screen.queryByText(/La fila 1 es el encabezado/i)).toBeNull();
    expect(screen.queryByText(/ahí se pegan las fotos/i)).toBeNull();
    expect(screen.queryByText(/salen tal cual/i)).toBeNull();
  });

  it("🔴 la caja sigue con su título y con la ÚNICA regla que no se adivina", () => {
    render(<MiExcelFotosClient />);
    expect(screen.getByText("Cómo tiene que estar tu archivo")).toBeTruthy();
    expect(screen.getByText(/Cada foto tiene que llamarse igual que el código/i)).toBeTruthy();
    // La caja NO quedó vacía.
    expect(document.querySelectorAll("li").length).toBeGreaterThan(0);
  });

  it("el selector de archivo SIGUE", () => {
    render(<MiExcelFotosClient />);
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
    expect(screen.getByText(/Suelta tu Excel aquí/i)).toBeTruthy();
  });

  it("las tres del 'Qué le va a pasar' se fueron del código, no a un comentario", () => {
    const src = soloCodigo("app/productos/cargar/MiExcelFotosClient.tsx");
    for (const t of [
      "donde hay foto queda la foto",
      "pegada a su fila",
      "no se suben a ningún lado",
      "salen tal cual",
      "La fila 1 es el encabezado",
      "ahí se pegan las fotos",
    ]) {
      expect(src, `"${t}" sigue en el código`).not.toContain(t);
    }
    // 🔴 y lo que SÍ se queda: el aviso del archivo que se descarga.
    expect(src).toContain("igual que entró");
    expect(src).toContain("TEXTO_SIN_FOTO");
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Depurador › puerta (dispatcher)
// ───────────────────────────────────────────────────────────────────────────
import DepuradorDispatcher from "@/app/productos/cargar/DepuradorDispatcher";

describe("Depurador · la puerta pierde 'La marca se detecta sola'", () => {
  it("la explicación NO está y el uploader SÍ", () => {
    render(<DepuradorDispatcher onDownloaded={() => {}} />);
    expect(screen.queryByText(/La marca se detecta sola/i)).toBeNull();
    expect(screen.getByText(/Suelta el archivo aquí/i)).toBeTruthy();
    expect(document.querySelector('input[type="file"]')).toBeTruthy();
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Depurador › Reglas
// ───────────────────────────────────────────────────────────────────────────
import ReglasView from "@/app/productos/cargar/ReglasView";

describe("Depurador · Reglas pierde las dos bajadas, no los principios", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ catalogo: [] }) })),
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it("las explicaciones NO están", () => {
    render(<ReglasView />);
    expect(screen.queryByText(/manda captura a Daniel/i)).toBeNull();
    expect(screen.queryByText(/antes de buscar en el catálogo/i)).toBeNull();
  });

  it("el título de la sección y la lista de principios SIGUEN", () => {
    render(<ReglasView />);
    expect(screen.getByText("Principios de limpieza")).toBeTruthy();
    expect(document.querySelectorAll("ol li").length).toBeGreaterThan(0);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Los que no se montan solos: barrido sobre el CÓDIGO, sin comentarios
// ───────────────────────────────────────────────────────────────────────────
describe("las pantallas grandes: el texto se fue del CÓDIGO y lo de al lado sigue", () => {
  const CASOS: Array<{ archivo: string; fuera: string[]; sigue: string[] }> = [
    {
      archivo: "app/marketing/components/FacturasSection.tsx",
      fuera: ["Arrastra PDFs aquí", "La IA leerá"],
      // El rótulo del botón de subir y el contador de progreso.
      sigue: ["Subir facturas (varias a la vez)", "Procesando {bulk.progress.procesados}"],
    },
    {
      archivo: "app/gastos-contabilidad/GastosContabilidadClient.tsx",
      fuera: ["Cada pago que salió de caja o del banco, mes por mes"],
      sigue: ["<SelectorMes", "No se pudo cargar la información"],
    },
    {
      archivo: "app/gastos-contabilidad/components/saldos/SaldosBancoTab.tsx",
      fuera: ["Disponibilidad"],
      sigue: ["<SaldosBancarios", "No se pudo cargar la información"],
    },
    {
      archivo: "app/productos/cargar/FacturasTiendaClient.tsx",
      fuera: ["separadas del Depurador", "TECHO(Costo"],
      // La tabla de fórmulas por marca y el freno por descripciones nuevas.
      sigue: ["Marca en esta factura", "Bloqueado: hay", "Jerarquía: precio fijo"],
    },
    {
      archivo: "app/productos/cargar/ReebokClient.tsx",
      fuera: ["plantilla por artículo", "corrige si hace falta"],
      sigue: [
        'label="¿Qué quieres generar?"',
        'label="Columna de piezas (mes)"',
        "Vacío = hereda la fórmula de marca",
      ],
    },
    {
      archivo: "app/productos/cargar/DepuradorClient.tsx",
      fuera: ["Un divisor + extra para todas las filas", "Cada marca usa su fórmula guardada", "{desc}"],
      sigue: ["Una fórmula para todo", "Fórmula guardada por marca", "Bloqueado: hay"],
    },
    {
      archivo: "app/admin/usuarios/DataHealthTab.tsx",
      fuera: ["peor severity del día", "Gris = sin corrida"],
      sigue: ["Historial 30 días"],
    },
    {
      archivo: "app/clientes/[codigo]/ClienteDetail.tsx",
      fuera: ["editable en fashiongr"],
      // El encabezado corto, los campos, y el aviso de frescura que tiene
      // candado propio en `lib/poda-textos-cxc-multifashion.test.ts`.
      sigue: [">Contacto</h2>", 'label="Teléfono"', "Última sincronización"],
    },
  ];

  it.each(CASOS.map((c) => [c.archivo, c] as const))("%s", (_n, caso) => {
    const src = soloCodigo(caso.archivo);
    for (const t of caso.fuera) {
      expect(src, `"${t}" sigue en el código de ${caso.archivo}`).not.toContain(t);
    }
    for (const t of caso.sigue) {
      expect(src, `se llevó por delante "${t}" en ${caso.archivo}`).toContain(t);
    }
  });
});
