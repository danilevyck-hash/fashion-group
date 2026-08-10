/**
 * El ⓘ compartido, RENDERIZADO de verdad.
 *
 * 🔴 EL RIESGO QUE ESTE ARCHIVO EXISTE PARA CAZAR: que "pasar un texto a un ⓘ"
 * termine siendo lo mismo que borrarlo. Si el disparador no se alcanza con el
 * dedo (44 px), no llega por teclado, o el contenido nunca aparece al tocarlo,
 * la metodología quedó escondida para siempre y nadie se entera.
 *
 * Y el otro lado: el panel NO puede quedar renderizado cuando está cerrado —
 * si estuviera, la "poda" no habría podado nada, solo movido el texto de lugar.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { Ayuda } from "@/components/shared/Ayuda";
import { readFileSync } from "fs";
import { join } from "path";

const FUENTE = readFileSync(join(process.cwd(), "src/components/shared/Ayuda.tsx"), "utf8");

afterEach(() => cleanup());

function montar() {
  return render(
    <Ayuda titulo="Cómo se calcula" etiqueta="Cómo se calcula">
      <p>Las devoluciones ya están restadas.</p>
    </Ayuda>,
  );
}

describe("el ⓘ se toca y se alcanza", () => {
  it("el disparador es un <button> de verdad — así llega por Tab y abre con Enter sin código extra", () => {
    montar();
    const b = screen.getByRole("button", { name: "Cómo se calcula" });
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("type")).toBe("button");
  });

  it("mide 44×44 px como mínimo (regla de la casa)", () => {
    montar();
    const cls = screen.getByRole("button", { name: "Cómo se calcula" }).className;
    expect(cls).toContain("min-h-[44px]");
    expect(cls).toContain("min-w-[44px]");
  });

  it("cerrado NO deja el texto en pantalla — si lo dejara, no se habría podado nada", () => {
    montar();
    expect(screen.queryByText(/devoluciones ya están restadas/)).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("al tocarlo aparece la metodología", () => {
    montar();
    fireEvent.click(screen.getByRole("button", { name: "Cómo se calcula" }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(/devoluciones ya están restadas/)).toBeTruthy();
  });

  it("segundo toque lo cierra", () => {
    montar();
    const b = screen.getByRole("button", { name: "Cómo se calcula" });
    fireEvent.click(b);
    fireEvent.click(b);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Escape cierra y DEVUELVE el foco al botón (si no, el teclado queda perdido)", () => {
    montar();
    const b = screen.getByRole("button", { name: "Cómo se calcula" });
    fireEvent.click(b);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(b);
  });

  it("dice si está abierto o cerrado (aria-expanded) — un lector de pantalla también tiene que saberlo", () => {
    montar();
    const b = screen.getByRole("button", { name: "Cómo se calcula" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(b);
    expect(b.getAttribute("aria-expanded")).toBe("true");
  });

  it("la etiqueta se esconde en celular pero el nombre accesible NO depende de ella", () => {
    render(
      <Ayuda titulo="Cómo se calcula">
        <p>solo ícono</p>
      </Ayuda>,
    );
    // Sin `etiqueta` el botón sigue teniendo nombre: el aria-label es el título.
    expect(screen.getByRole("button", { name: "Cómo se calcula" })).toBeTruthy();
  });
});

describe("candado: el ⓘ es para METODOLOGÍA, nunca para un aviso", () => {
  it("el archivo deja escrito que un aviso no va acá", () => {
    expect(FUENTE).toMatch(/NUNCA se puede hacer con este componente/i);
  });

  it("no acepta ninguna prop de severidad — no hay forma de convertirlo en una alerta escondida", () => {
    for (const prohibida of ["severidad", "variante", "tono", "alerta", "peligro"]) {
      expect(FUENTE).not.toMatch(new RegExp(`^\\s*${prohibida}\\??:`, "m"));
    }
  });

  it("🩸 el panel FLOTA con <DesplegableFlotante>, nunca con un `absolute` que un overflow pueda recortar", () => {
    // Estos ⓘ viven al pie de tablas y dentro de Cards: el ancestro con
    // overflow es la norma, no la excepción. Un ⓘ recortado convierte la poda
    // en pérdida de información. El barrido `desplegables-flotan.test.ts`
    // vigila esto en todo src/; acá se fija para ESTE archivo.
    expect(FUENTE).toContain("DesplegableFlotante");
    expect(FUENTE).not.toMatch(/className=\{?["'`][^"'`]*\babsolute\b/);
  });
});
