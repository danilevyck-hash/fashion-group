// 29-sep-2026 · Daniel, desde la ficha de Alejandra: «¿dónde?» cambio el
// horario. Ahora va en la ficha y se guarda con Guardar (la lista sigue sola).
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import FichaEditar, { borradorDe } from "@/app/asistencia/colaboradores/FichaEditar";
import type { HorarioDeLaPagina } from "@/app/asistencia/colaboradores/tipos";
import { ToastProvider } from "@/components/ToastSystem";

afterEach(cleanup);

const PERMISOS = {
  puedeDarDeBaja: true, puedeMarcarServicioProfesional: true, puedeQuitarSeguros: true,
  puedeCargarBaseSeguros: true, puedeMarcarSueldoFijo: true,
};
const H: HorarioDeLaPagina = {
  codigo: "22", nombre: "Alejandra Camaño", entrada: "08:00", salida: "16:30",
  almuerzoMinutos: 30, diasLaborables: [1, 2, 3, 4, 5], entradaAfuera: null, salidaAfuera: null,
};

function montar(onCambioHorario: (h: HorarioDeLaPagina) => void, horario: HorarioDeLaPagina | null = H) {
  const b = { ...borradorDe(null, "22"), nombre: "Alejandra Camaño", empresa: "confecciones_boston", salario: "523.47" };
  render(
    <ToastProvider>
      <FichaEditar borrador={b} onCambio={() => {}} onGuardar={() => {}} onCancelar={() => {}}
        guardando={false} nueva={false} permisos={PERMISOS} puedeEditar onCambioFoto={() => {}}
        horario={horario} onCambioHorario={onCambioHorario} />
    </ToastProvider>,
  );
}

describe("la ficha muestra y edita el horario", () => {
  it("muestra sus horas y el almuerzo fijo", () => {
    montar(() => {});
    expect((screen.getByLabelText("Entrada en el reloj") as HTMLInputElement).value).toBe("08:00");
    expect((screen.getByLabelText("Salida en el reloj") as HTMLInputElement).value).toBe("16:30");
    expect(screen.getByText(/Almuerzo: 30 minutos/)).toBeTruthy();
  });
  it("prender el sábado agrega el 6; no guarda solo, solo avisa el cambio", () => {
    let visto: HorarioDeLaPagina | null = null;
    montar((h) => { visto = h; });
    const botones = screen.getByRole("group", { name: "Días que trabaja" }).querySelectorAll("button");
    fireEvent.click(botones[botones.length - 1]);
    expect(visto!.diasLaborables).toEqual([1, 2, 3, 4, 5, 6]);
  });
  it("el último día no se apaga", () => {
    let llamado = false;
    montar(() => { llamado = true; }, { ...H, diasLaborables: [1] });
    const botones = screen.getByRole("group", { name: "Días que trabaja" }).querySelectorAll("button");
    fireEvent.click(botones[0]);
    expect(llamado).toBe(false);
  });
  it("sin horario (nunca marcó) no se dibuja la sección", () => {
    montar(() => {}, null);
    expect(screen.queryByLabelText("Entrada en el reloj")).toBeNull();
  });
});
