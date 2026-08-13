/**
 * La pantalla de saldos de banco, PINTADA y TOCADA.
 *
 * ── POR QUÉ ESTE TEST RENDERIZA EN VEZ DE LEER EL ARCHIVO ───────────────────
 *
 * Lo que Daniel pidió es que la contadora *"vea si lo hizo bien"*. Eso no es una
 * función pura: es que el error ESTÉ EN PANTALLA. Un `expect(FUENTE).toContain
 * ("repiteAnterior")` pasaría en verde con el aviso dentro de un `if (false)`,
 * con el chip escondido detrás de un breakpoint, o con el historial armado y
 * nunca dibujado. Este repo ya se quemó dos veces con candados de texto que se
 * cumplían a sí mismos.
 *
 * 🩸 EL CASO REAL, medido en producción el 13-ago-2026: las 3 cargas del 10-ago
 * repiten AL CENTAVO el saldo del 31-jul (`active_shoes $27.647,97`,
 * `active_wear $60.678,97`, `fashion_shoes $74.336,02`). Se copiaron los de
 * julio. Acá se pinta ese caso, tal cual, y se exige que se vea.
 */

import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";

import SaldosBancarios from "@/app/gastos-contabilidad/components/saldos/SaldosBancarios";
import { historialPorEmpresa, ultimoPorEmpresa, type FilaSaldo } from "@/lib/saldos-banco/historial";

// El componente avisa con toasts; el provider real no hace falta para lo que
// acá se mide, así que se sustituye por un espía.
const toastSpy = vi.fn();
vi.mock("@/components/ToastSystem", () => ({
  useToast: () => ({ toast: toastSpy }),
}));

afterEach(cleanup);

/** Los datos REALES de producción (13-ago-2026), transcritos. */
const FILAS: FilaSaldo[] = [
  { empresa_key: "active_shoes", fecha_dato: "2026-06-30", saldo: 62911.97, created_by: "Contabilidad" },
  { empresa_key: "active_shoes", fecha_dato: "2026-07-31", saldo: 27647.97, created_by: "Contabilidad" },
  { empresa_key: "active_shoes", fecha_dato: "2026-08-10", saldo: 27647.97, created_by: "Contabilidad" },
  { empresa_key: "active_wear", fecha_dato: "2026-07-31", saldo: 60678.97, created_by: "Contabilidad" },
  { empresa_key: "active_wear", fecha_dato: "2026-08-10", saldo: 60678.97, created_by: "Contabilidad" },
  { empresa_key: "fashion_shoes", fecha_dato: "2026-07-31", saldo: 74336.02, created_by: "Contabilidad" },
  { empresa_key: "fashion_shoes", fecha_dato: "2026-08-10", saldo: 74336.02, created_by: "Contabilidad" },
  // La que NO copió: su último es de julio y sus montos son todos distintos.
  { empresa_key: "fashion_wear", fecha_dato: "2026-06-30", saldo: 189431.88, created_by: "Contabilidad" },
  { empresa_key: "fashion_wear", fecha_dato: "2026-07-31", saldo: 317460.51, created_by: "Contabilidad" },
];

function pintar(filas: FilaSaldo[] = FILAS) {
  const historial: Record<string, ReturnType<typeof historialPorEmpresa> extends Map<string, infer V> ? V : never> =
    {} as never;
  for (const [emp, cargas] of historialPorEmpresa(filas)) {
    (historial as Record<string, unknown>)[emp] = cargas;
  }
  return render(
    <SaldosBancarios
      bancos={ultimoPorEmpresa(filas).map((b) => ({
        empresa_key: b.empresa_key,
        saldo: b.saldo,
        fecha_dato: b.fecha_dato,
      }))}
      historial={historial as never}
      onGuardado={() => {}}
      titulo={null}
    />,
  );
}

/** La tarjeta de una empresa, por su nombre visible. */
function filaDe(nombre: string): HTMLElement {
  const etiqueta = screen.getByText(nombre);
  const contenedor = etiqueta.closest("div.p-3");
  if (!contenedor) throw new Error(`no se encontró la fila de ${nombre}`);
  return contenedor as HTMLElement;
}

describe("🩸 el saldo copiado SE VE", () => {
  it("el aviso de arriba nombra a las TRES empresas que copiaron", () => {
    pintar();
    expect(screen.getByText(/3 saldos quedaron igualitos al anterior/i)).toBeTruthy();
    const aviso = screen.getByText(/el monto es\s+exactamente el mismo/i);
    for (const nombre of ["Active Shoes", "Active Wear", "Fashion Shoes"]) {
      expect(aviso.textContent).toContain(nombre);
    }
    // 🔴 Y NO nombra a la que no copió: un aviso que marca de más se deja de
    // leer, y entonces deja de servir para las que sí.
    expect(aviso.textContent).not.toContain("Fashion Wear");
  });

  it("cada empresa que copió lleva su marca EN SU FILA, diciendo contra qué fecha", () => {
    pintar();
    expect(within(filaDe("Active Shoes")).getByText("igual al 31 jul")).toBeTruthy();
    expect(within(filaDe("Active Wear")).getByText("igual al 31 jul")).toBeTruthy();
    expect(within(filaDe("Fashion Shoes")).getByText("igual al 31 jul")).toBeTruthy();
    expect(within(filaDe("Fashion Wear")).queryByText(/igual al/)).toBeNull();
  });

  it("sin ningún repetido, el aviso NO aparece (no es un cartel decorativo)", () => {
    pintar(FILAS.filter((f) => f.empresa_key === "fashion_wear"));
    expect(screen.queryByText(/igualito/i)).toBeNull();
    expect(screen.queryByText(/igualitos/i)).toBeNull();
  });
});

describe("ver lo que se cargó, y corregir una fecha vieja", () => {
  it("el historial de la empresa se despliega y muestra fecha, monto y quién lo cargó", () => {
    pintar();
    const fila = filaDe("Active Shoes");
    // Cerrado por defecto: la pantalla arranca mostrando lo de siempre.
    expect(within(fila).queryByText("31 jul 2026")).toBeNull();
    fireEvent.click(within(fila).getByText(/Ver las 2 cargas anteriores/));
    expect(within(fila).getByText("31 jul 2026")).toBeTruthy();
    expect(within(fila).getByText("30 jun 2026")).toBeTruthy();
    // $27.647,97 sale DOS veces a propósito: arriba como saldo vigente y abajo
    // como la carga del 31-jul — que es exactamente lo que hace visible la copia.
    expect(within(fila).getAllByText("$27,647.97").length).toBe(2);
    expect(within(fila).getByText("$62,911.97")).toBeTruthy();
    // `created_by` YA existe en la tabla: se muestra, no se inventa auditoría.
    expect(within(fila).getAllByText("Contabilidad").length).toBeGreaterThan(0);
  });

  it("🔴 tocar una carga vieja la trae al formulario — y NO guarda nada sola", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    pintar();
    const fila = filaDe("Active Shoes");
    fireEvent.click(within(fila).getByText(/Ver las 2 cargas anteriores/));
    fireEvent.click(within(fila).getByText("30 jun 2026"));

    // El formulario quedó apuntando a ESA fecha, con SU monto.
    const fecha = fila.querySelector('input[type="date"]') as HTMLInputElement;
    const monto = fila.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
    expect(fecha.value).toBe("2026-06-30");
    expect(monto.value).toBe("62911.97");
    // Guardar sigue siendo un toque APARTE y deliberado.
    expect(fetchSpy).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("la pantalla DICE que va a corregir esa fecha y que las demás no se tocan", () => {
    pintar();
    const fila = filaDe("Active Shoes");
    fireEvent.click(within(fila).getByText(/Ver las 2 cargas anteriores/));
    fireEvent.click(within(fila).getByText("31 jul 2026"));
    expect(within(fila).getByText(/Vas a corregir el saldo del 31 jul 2026/)).toBeTruthy();
    expect(within(fila).getByText(/Las demás fechas no se tocan/)).toBeTruthy();
    // Y el botón deja de decir "Guardar": lo que se hace es corregir.
    expect(within(fila).getByRole("button", { name: "Corregir" })).toBeTruthy();
  });

  it("🔴 corregir manda el MISMO POST de siempre: una empresa, una fecha, un saldo", () => {
    // Es lo que hace que corregir el 31 de julio no pueda pisar el 10 de agosto:
    // el upsert es por (empresa_key, fecha_dato) y el cuerpo lleva UNA fecha.
    const fetchSpy = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchSpy);
    pintar();
    const fila = filaDe("Active Shoes");
    fireEvent.click(within(fila).getByText(/Ver las 2 cargas anteriores/));
    fireEvent.click(within(fila).getByText("31 jul 2026"));
    fireEvent.click(within(fila).getByRole("button", { name: "Corregir" }));

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/saldos-banco");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      empresa_key: "active_shoes",
      saldo: 27647.97,
      fecha_dato: "2026-07-31",
    });
    vi.unstubAllGlobals();
  });

  it("una empresa con UNA sola carga no ofrece historial (no hay nada anterior)", () => {
    pintar([{ empresa_key: "joystep", fecha_dato: "2026-07-31", saldo: 500, created_by: "Contabilidad" }]);
    expect(screen.queryByText(/cargas anteriores/)).toBeNull();
  });

  it("una empresa SIN saldo sigue diciendo \"sin dato\" y se puede cargar", () => {
    pintar([]);
    // Las 8 empresas se pintan igual: la lista es el catálogo, no lo cargado.
    expect(screen.getAllByText("sin dato").length).toBe(8);
  });
});

describe("lo que ya funcionaba sigue funcionando", () => {
  beforeEach(() => toastSpy.mockClear());

  it("el último saldo de cada empresa se muestra con su fecha", () => {
    pintar();
    const fila = filaDe("Fashion Wear");
    expect(within(fila).getByText("$317,460.51")).toBeTruthy();
    expect(within(fila).getByText(/al 31 jul/)).toBeTruthy();
  });

  it("un saldo NUEVO (fecha que no existe) dice \"Guardar\", no \"Corregir\"", () => {
    pintar();
    const fila = filaDe("Active Shoes");
    const fecha = fila.querySelector('input[type="date"]') as HTMLInputElement;
    fireEvent.change(fecha, { target: { value: "2026-08-12" } });
    expect(within(fila).getByRole("button", { name: "Guardar" })).toBeTruthy();
    expect(within(fila).queryByText(/Vas a corregir/)).toBeNull();
  });
});
