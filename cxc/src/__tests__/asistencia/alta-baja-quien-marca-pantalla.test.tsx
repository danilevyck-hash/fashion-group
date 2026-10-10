// 🔴 CANDADO DE PANTALLA — alta y baja de quien marca (9-oct-2026).
// El servidor se cuida en `alta-baja-quien-marca.test.ts`; aquí, lo que se VE:
// el horario y el interruptor en «+ Nuevo colaborador», la casilla de la baja
// y el campo «Colaborador» de Usuarios.
import fs from "node:fs";
import path from "node:path";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { useState } from "react";
import FichaEditar, { borradorDe, type BorradorFicha } from "@/app/asistencia/colaboradores/FichaEditar";
import { horarioDeAlta } from "@/lib/asistencia/alta-colaborador";
import { ToastProvider } from "@/components/ToastSystem";

afterEach(cleanup);
const leer = (...p: string[]) => fs.readFileSync(path.join(process.cwd(), ...p), "utf8");

const PERMISOS = {
  puedeDarDeBaja: true, puedeMarcarServicioProfesional: true, puedeQuitarSeguros: true,
  puedeCargarBaseSeguros: true, puedeMarcarSueldoFijo: true,
};

function Ficha({ nueva, admin = true, usuario = null, sugerido = null, visto }: {
  nueva: boolean; admin?: boolean; usuario?: { name: string; active: boolean } | null;
  sugerido?: string | null; visto?: (b: BorradorFicha) => void;
}) {
  const [b, setB] = useState<BorradorFicha>({
    ...borradorDe(null, nueva ? "" : "307"), nombre: "María Pérez", empresa: "american_classic",
  });
  visto?.(b);
  return (
    <ToastProvider>
      <FichaEditar borrador={b} onCambio={setB} onGuardar={() => {}} onCancelar={() => {}}
        guardando={false} nueva={nueva} permisos={PERMISOS} puedeEditar onCambioFoto={() => {}}
        horario={horarioDeAlta("american_classic")} onCambioHorario={() => {}}
        puedeDarAcceso={admin} usuario={usuario} codigoSugerido={sugerido} />
    </ToastProvider>
  );
}

describe("🔴 «+ Nuevo colaborador»: todo en una pasada", () => {
  it("el horario aparece en el alta, con el de su empresa", () => {
    render(<Ficha nueva />);
    expect((screen.getByLabelText("Entrada en el reloj") as HTMLInputElement).value).toBe("08:00");
    expect(screen.getByText(/Almuerzo: 60 minutos/)).toBeTruthy();
  });

  it("«Marcación desde el teléfono» nace apagado; prendido pide la contraseña inicial y lo dice al faltar", () => {
    let ultimo: BorradorFicha | null = null;
    render(<Ficha nueva sugerido="308" visto={(b) => { ultimo = b; }} />);
    fireEvent.click(screen.getByText("Usar 308"));
    const sw = screen.getByRole("switch", { name: "Marcación desde el teléfono" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByText("Contraseña inicial")).toBeNull();
    fireEvent.click(sw);
    expect(screen.getByText("Contraseña inicial")).toBeTruthy();
    expect(screen.getByText("Falta la contraseña inicial.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Guardar" }) as HTMLButtonElement).disabled).toBe(true);
    expect(ultimo!.codigo).toBe("308");
    expect(ultimo!.accesoMarcacion).toBe(true);
  });

  it("el interruptor es solo del administrador y solo del alta", () => {
    render(<Ficha nueva admin={false} />);
    expect(screen.queryByRole("switch")).toBeNull();
    cleanup();
    render(<Ficha nueva={false} />);
    expect(screen.queryByRole("switch")).toBeNull();
  });

  it("la página manda `alta` y guarda el horario siempre", () => {
    const src = leer("src", "app", "asistencia", "colaboradores", "PersonaPagina.tsx");
    expect(src).toContain("alta: true");
    expect(src).toContain("accesoMarcacion: b.accesoMarcacion ?");
    expect(src).toMatch(/if \(nueva && horarioDelFormulario\)[\s\S]{0,200}\/api\/asistencia\/horarios/);
  });
});

describe("🔴 «Dar de baja» ofrece desactivar el usuario, marcado", () => {
  it("con usuario activo: la casilla sale marcada y se puede quitar", () => {
    let ultimo: BorradorFicha | null = null;
    render(<Ficha nueva={false} usuario={{ name: "siney", active: true }} visto={(b) => { ultimo = b; }} />);
    expect(screen.queryByText("Desactivación del usuario Siney")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    const casilla = screen.getByLabelText(/Desactivación del usuario Siney/) as HTMLInputElement;
    expect(casilla.checked).toBe(true);
    fireEvent.click(casilla);
    expect(ultimo!.desactivarUsuario).toBe(false);
  });

  it("sin usuario, o con el usuario ya inactivo, no hay casilla", () => {
    render(<Ficha nueva={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(screen.queryByText(/Desactivación del usuario/)).toBeNull();
    cleanup();
    render(<Ficha nueva={false} usuario={{ name: "siney", active: false }} />);
    fireEvent.click(screen.getByRole("button", { name: "Dar de baja" }));
    expect(screen.queryByText(/Desactivación del usuario/)).toBeNull();
  });
});

describe("🔴 Usuarios tiene el campo «Colaborador»", () => {
  it("lo dibuja, ofrece «Sin vincular» y lo manda al guardar", () => {
    const src = leer("src", "app", "admin", "usuarios", "page.tsx");
    expect(src).toContain('data-testid="usuario-colaborador"');
    expect(src).toContain("Sin vincular");
    expect(src).toContain("empleado_codigo: uColaborador || null");
  });
});
