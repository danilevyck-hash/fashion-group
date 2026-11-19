import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import React from "react";
import { AvisoDeAvisos, TEXTO_ABRE_DESDE_EL_ICONO, TEXTO_AVISOS_BLOQUEADOS } from "@/app/marcacion/AvisoActivarAvisos";
import { estadoDelAviso } from "@/lib/marcacion/push-cliente";

afterEach(cleanup);

describe("Activa los avisos: los tres estados", () => {
  it("decide el estado", () => {
    expect(estadoDelAviso({ puede: true, permiso: "default", suscrito: false })).toBe("falta");
    expect(estadoDelAviso({ puede: true, permiso: "granted", suscrito: false })).toBe("falta");
    expect(estadoDelAviso({ puede: true, permiso: "granted", suscrito: true })).toBe("activo");
    expect(estadoDelAviso({ puede: true, permiso: "denied", suscrito: false })).toBe("bloqueado");
    expect(estadoDelAviso({ puede: false, permiso: "default", suscrito: false })).toBe("no-puede");
  });

  it("falta: un botón; bloqueado y no-puede: solo el texto; activo: nada", () => {
    const { rerender, container } = render(<AvisoDeAvisos estado="falta" onActivar={() => {}} />);
    expect(screen.getByRole("button", { name: "Activa los avisos" })).toBeTruthy();
    rerender(<AvisoDeAvisos estado="bloqueado" onActivar={() => {}} />);
    expect(screen.getByText(TEXTO_AVISOS_BLOQUEADOS)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<AvisoDeAvisos estado="no-puede" onActivar={() => {}} />);
    expect(screen.getByText(TEXTO_ABRE_DESDE_EL_ICONO)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<AvisoDeAvisos estado="activo" onActivar={() => {}} />);
    expect(container.textContent).toBe("");
  });
});
