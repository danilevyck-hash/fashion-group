// ============================================================================
// Candado — el menú "···" de cada proyecto y el retiro de "Cerrar proyecto"
// (11-ago-2026).
//
// Lo que protege:
//   1. El menú de la fila queda en TRES acciones: Editar · Descargar ZIP ·
//      "Registrado por error — eliminar" (el "anular" de siempre, renombrado,
//      en rojo y con Deshacer). "Cerrar proyecto" / "Reabrir proyecto" NO
//      pueden volver: eran un estado cosmético que al lado de "Cerrar período"
//      confundía — dos "cerrar" distintos en la misma pantalla.
//   2. Las rutas del estado se borraron y nadie las puede volver a llamar.
//   3. El contenedor del cliente se busca entre TODOS los proyectos vivos
//      (sin filtrar por estado): filtrar crearía un proyecto duplicado para
//      un cliente cuyo proyecto quedó en un estado legacy.
//   4. La carga masiva de facturas no rechaza por estado del proyecto: lo que
//      congela plata es el PERÍODO cerrado, no el proyecto.
//
// Verificado por mutación: devolver "Cerrar proyecto" al menú rompe 2 tests,
// resucitar el badge rompe 1, volver a filtrar por estado en resolverProyecto
// rompe 1, y reponer el guard de proyecto cerrado en bulk rompe 1.
// ============================================================================
import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

const RAIZ = path.join(__dirname, "..", "..");

function leer(rel: string): string {
  return readFileSync(path.join(RAIZ, rel), "utf8");
}

const VISTA = "app/marketing/components/ProyectosHomeView.tsx";
const MODAL_GASTO = "app/marketing/components/RegistrarGastoModal.tsx";
const BULK = "app/api/marketing/facturas/bulk/route.ts";
const MUTATIONS = "lib/marketing/mutations.ts";

describe("el menú ··· de la fila de proyecto", () => {
  const src = leer(VISTA);

  it("tiene exactamente las tres acciones aprobadas", () => {
    expect(src).toContain('label: "Editar"');
    expect(src).toContain('label: "Descargar ZIP"');
    expect(src).toContain('label: "Registrado por error — eliminar"');
  });

  it('"Cerrar proyecto" y "Reabrir proyecto" no pueden volver', () => {
    // Se busca el LABEL del menú (los comentarios pueden nombrar la historia).
    expect(src).not.toContain('label: "Cerrar proyecto"');
    expect(src).not.toContain('label: "Reabrir proyecto"');
    expect(src).not.toContain("cambiarEstado");
    expect(src).not.toMatch(/proyectos\/[^"'`]*\/(cerrar|reabrir)/);
  });

  it("la acción de eliminar sigue siendo la mecánica de anular (rojo + Deshacer)", () => {
    // Mismo endpoint de anular (esconde + los gastos dejan de contar)…
    expect(src).toMatch(/\/api\/marketing\/proyectos\/\$\{[^}]+\}\/anular/);
    // …misma vuelta atrás (papelera/restaurar desde el aviso)…
    expect(src).toContain("/api/marketing/papelera/restaurar");
    expect(src).toContain("Deshacer");
    // …y en rojo (destructive) dentro del menú.
    expect(src).toMatch(/label: "Registrado por error — eliminar",[\s\S]{0,400}?destructive: true/);
  });

  it("el badge 'Cerrado' y el filtro por estado se fueron con el estado", () => {
    expect(src).not.toMatch(/>\s*Cerrado\s*</);
    expect(src).not.toContain("filtro_estado");
    expect(src).not.toContain('estado === "cerrado"');
  });
});

describe("las rutas del estado de proyecto ya no existen", () => {
  it.each([
    "app/api/marketing/proyectos/[id]/cerrar",
    "app/api/marketing/proyectos/[id]/reabrir",
    "app/api/marketing/proyectos/[id]/marcar-enviado",
    "app/api/marketing/proyectos/[id]/marcar-cobrado",
  ])("%s se borró", (rel) => {
    expect(existsSync(path.join(RAIZ, rel))).toBe(false);
  });

  it("mutations.ts no vuelve a escribir el estado del proyecto", () => {
    const src = leer(MUTATIONS);
    // Las funciones no pueden volver (el comentario histórico sí las nombra).
    expect(src).not.toMatch(/function\s+(cerrarProyecto|reabrirProyecto)/);
    expect(src).not.toMatch(/estado:\s*["']cerrado["']/);
    expect(src).not.toMatch(/payload\.estado\s*=/);
  });
});

describe("el estado dejó de importar para operar", () => {
  it("resolverProyecto busca entre TODOS los proyectos vivos (sin ?estado=)", () => {
    const src = leer(MODAL_GASTO);
    expect(src).toContain('fetch("/api/marketing/proyectos"');
    expect(src).not.toContain("estado=abierto");
  });

  it("la carga masiva no rechaza facturas por estado del proyecto", () => {
    const src = leer(BULK);
    expect(src).not.toContain("proyecto cerrado");
    expect(src).not.toContain("normalizarEstadoProyecto");
    // El guard de anulado SÍ se queda.
    expect(src).toContain("El proyecto está anulado");
  });
});
