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
import MarcaAsistencia, {
  MARCA_APAGADA, cuerpoDeColaborador, faltaEnMarca, type EstadoMarca,
} from "@/app/admin/usuarios/MarcaAsistencia";

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

describe("🔴 Usuarios › «Marca asistencia»: una sola puerta", () => {
  function Bloque({ inicial, visto }: { inicial?: Partial<EstadoMarca>; visto?: (m: EstadoMarca) => void }) {
    const [m, setM] = useState<EstadoMarca>({ ...MARCA_APAGADA, ...inicial });
    visto?.(m);
    return <MarcaAsistencia valor={m} onCambio={setM} nombreDelUsuario="maria"
      fichasLibres={[{ codigo: "305", nombre: "Angel Pizza" }]} />;
  }

  it("apagado no pide nada; prendido ofrece «Nuevo colaborador» con sus datos y horario", () => {
    render(<Bloque />);
    const sw = screen.getByRole("switch", { name: "Marca asistencia" });
    expect(sw.getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Colaborador")).toBeNull();
    fireEvent.click(sw);
    expect((screen.getByLabelText("Colaborador") as HTMLSelectElement).value).toBe("");
    for (const campo of ["Empresa", "Código", "Nombre completo", "Cargo", "Cédula", "Salario mensual", "Entrada", "Salida"]) {
      expect(screen.getByLabelText(campo), campo).toBeTruthy();
    }
    expect(screen.getByText("Fecha de ingreso")).toBeTruthy();
    expect(screen.getByRole("group", { name: "Días que trabaja" })).toBeTruthy();
  });

  it("quien ya tiene ficha se selecciona de la lista, y no se le piden datos", () => {
    let ultimo: EstadoMarca | null = null;
    render(<Bloque inicial={{ prendido: true }} visto={(m) => { ultimo = m; }} />);
    fireEvent.change(screen.getByLabelText("Colaborador"), { target: { value: "305" } });
    expect(ultimo!.colaborador).toBe("305");
    expect(screen.queryByLabelText("Empresa")).toBeNull();
    expect(faltaEnMarca(ultimo!)).toEqual([]);
  });

  it("lo que falta se dice, y el cuerpo lleva los datos de la ficha nueva", () => {
    const m: EstadoMarca = { ...MARCA_APAGADA, prendido: true };
    expect(faltaEnMarca(m)).toEqual(["la empresa", "el código"]);
    expect(faltaEnMarca({ ...MARCA_APAGADA })).toEqual([]);
    const lleno = { ...m, empresa: "american_classic", codigo: " 308 ", salario: "650", entrada: "900", salida: "18:00", dias: [1, 2, 3, 4, 5, 6], jornada: 48 };
    expect(cuerpoDeColaborador(lleno)).toMatchObject({
      codigo: "308", empresa: "american_classic", salarioMensual: 650, jornadaSemanal: 48,
      horario: { entrada: "09:00", salida: "18:00", diasLaborables: [1, 2, 3, 4, 5, 6] },
    });
  });

  it("la pantalla lo usa al crear y al editar, suma el permiso de Marcación y ofrece la baja al desactivar", () => {
    const src = leer("src", "app", "admin", "usuarios", "page.tsx");
    expect(src).toContain("<MarcaAsistencia");
    expect(src).toContain("colaborador: cuerpoDeColaborador(uMarca)");
    expect(src).toContain("empleado_codigo: uMarca.prendido ? uMarca.colaborador : null");
    expect(src).toContain("MODULO_MARCACION");
    expect(src).toContain('if (e.target.value === "marcacion") setUMarca');
    expect(src).toContain('data-testid="desactivar-con-baja"');
    expect(src).toContain("baja: conBaja");
  });
});
