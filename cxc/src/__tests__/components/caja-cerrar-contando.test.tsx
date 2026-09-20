/**
 * ─────────────────────────────────────────────────────────────────────────────
 * CAJA — LA VENTANA DE CERRAR PREGUNTA CUÁNTA PLATA HAY (20-sep-2026).
 *
 * 🩸 Los dos cierres de toda la historia dieron exactamente $0.00, y en los dos
 * el último recibo cargado —7 y 10 segundos antes de cerrar— es justo lo que
 * faltaba para llegar a $200. El sistema no tenía cómo distinguir «cuadró» de
 * «le puse lo que faltaba», porque nunca preguntaba.
 *
 * Lo que este archivo vigila, en la PANTALLA:
 *  - la casilla existe y es OBLIGATORIA (sin conteo no se puede cerrar);
 *  - el descuadre se dice en palabras: «Faltan $2.00» / «Sobran $1.50»;
 *  - 🔴 el descuadre NO frena: con la diferencia en pantalla, el botón cierra
 *    igual y el número contado viaja al servidor;
 *  - CONTROL: las cuatro líneas de siempre (Fondo · Gastado · Queda en caja ·
 *    Reposición) no se movieron.
 * ─────────────────────────────────────────────────────────────────────────────
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import CerrarPeriodoModal from "@/app/caja/components/CerrarPeriodoModal";

/** jsdom trae un `localStorage` a medias en este arnés: memoria propia. */
function memStorage(): Storage {
  const mem = new Map<string, string>();
  return {
    getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
    setItem: (k: string, v: string) => { mem.set(k, String(v)); },
    removeItem: (k: string) => { mem.delete(k); },
    clear: () => { mem.clear(); },
    key: (i: number) => Array.from(mem.keys())[i] ?? null,
    get length() { return mem.size; },
  } as Storage;
}

beforeEach(() => { vi.stubGlobal("localStorage", memStorage()); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

// Fondo $200, gastado $163.28 → queda $36.72 (el saldo del período Nº3 medido).
function montar(extra: Partial<React.ComponentProps<typeof CerrarPeriodoModal>> = {}) {
  const onConfirm = vi.fn();
  render(
    <CerrarPeriodoModal
      open
      onClose={vi.fn()}
      onConfirm={onConfirm}
      fondo={200}
      gastado={163.28}
      recibos={26}
      siguienteNumero={4}
      {...extra}
    />,
  );
  return onConfirm;
}

const casilla = () => screen.getByLabelText(/Cuánto dinero hay en la caja/) as HTMLInputElement;
const botonCerrar = () => screen.getByRole("button", { name: /Cerrar y abrir el 4/ }) as HTMLButtonElement;

describe("🔴 SE PREGUNTA CUÁNTA PLATA HAY, Y ES OBLIGATORIO", () => {
  it("la casilla existe y el botón arranca apagado: sin contar no se cierra", () => {
    const onConfirm = montar();
    expect(casilla()).toBeTruthy();
    expect(botonCerrar().disabled).toBe(true);
    fireEvent.click(botonCerrar());
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("con el conteo escrito, el botón se enciende y manda lo contado", () => {
    const onConfirm = montar();
    fireEvent.change(casilla(), { target: { value: "36.72" } });
    expect(botonCerrar().disabled).toBe(false);
    fireEvent.click(botonCerrar());
    expect(onConfirm).toHaveBeenCalledWith(36.72);
  });

  it("contar $0.00 vale: la caja vacía es un conteo, no «no contestó»", () => {
    const onConfirm = montar();
    fireEvent.change(casilla(), { target: { value: "0" } });
    fireEvent.click(botonCerrar());
    expect(onConfirm).toHaveBeenCalledWith(0);
  });
});

describe("🔴 EL DESCUADRE SE DICE CON CLARIDAD, Y NO FRENA EL CIERRE", () => {
  it("$34.72 contra $36.72 → «Faltan $2.00», y cierra igual", () => {
    const onConfirm = montar();
    fireEvent.change(casilla(), { target: { value: "34.72" } });
    expect(screen.getByText(/Faltan \$2\.00/)).toBeTruthy();
    expect(screen.getByText(/queda anotada/)).toBeTruthy();
    expect(botonCerrar().disabled).toBe(false);
    fireEvent.click(botonCerrar());
    expect(onConfirm).toHaveBeenCalledWith(34.72);
  });

  it("$38.22 contra $36.72 → «Sobran $1.50»", () => {
    montar();
    fireEvent.change(casilla(), { target: { value: "38.22" } });
    expect(screen.getByText(/Sobran \$1\.50/)).toBeTruthy();
  });

  it("cuando coincide, lo dice y no habla de faltantes ni sobrantes", () => {
    montar();
    fireEvent.change(casilla(), { target: { value: "36.72" } });
    expect(screen.getByText(/Cuadra con la cuenta del sistema/)).toBeTruthy();
    expect(screen.queryByText(/Faltan/)).toBeNull();
    expect(screen.queryByText(/Sobran/)).toBeNull();
  });
});

describe("CONTROL: la cuenta de siempre no se movió", () => {
  it("siguen las cuatro líneas, con el saldo y la reposición", () => {
    montar();
    const texto = document.body.textContent || "";
    expect(texto).toContain("Fondo");
    expect(texto).toContain("Gastado (26 recibos)");
    expect(texto).toContain("Queda en caja");
    expect(texto).toContain("Reposición para volver a $200.00");
    expect(texto).toContain("$36.72");
    expect(texto).toContain("$163.28");
  });

  it("un saldo negativo se sigue diciendo, y tampoco frena", () => {
    montar({ gastado: 236.5 });
    expect(screen.getByText("Se gastó más que el fondo.")).toBeTruthy();
    fireEvent.change(casilla(), { target: { value: "0" } });
    expect(botonCerrar().disabled).toBe(false);
  });
});
