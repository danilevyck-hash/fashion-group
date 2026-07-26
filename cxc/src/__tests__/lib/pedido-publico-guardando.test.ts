// Indicador de guardado del pedido del link (/pedido-<marca>/[short_id]).
//
// Medido en la prueba real del 25-jul-2026: ~5 s entre crear el pedido y
// verificar el envío a Switch. Antes la pantalla no decía NADA en ese rato y
// el cliente podía cerrar la pestaña (y perder el pedido).
//
// PedidoPublicoClient es UN solo componente para las 3 marcas, así que la
// paridad se prueba por construcción: basta con verificar que las 3 páginas lo
// montan y que el componente trae el indicador. Se asserta sobre el CÓDIGO
// porque vitest.config solo incluye `*.test.ts` (no hay render de TSX).

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import path from "path";

function src(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const MARCAS = ["reebok", "joybees", "tommy"] as const;
const PAGINA = src("src/components/catalogo/PedidoPublicoClient.tsx");

describe("las 3 marcas comparten la MISMA página de pedido del link", () => {
  it("cada /pedido-<marca>/[id] monta PedidoPublicoClient con su marca", () => {
    for (const m of MARCAS) {
      const page = src(`src/app/pedido-${m}/[id]/page.tsx`);
      expect(page, m).toContain("PedidoPublicoClient");
      expect(page, m).toContain(`marca="${m}"`);
    }
  });
});

describe("indicador de guardado — el cliente sabe que no debe cerrar", () => {
  it("dice explícitamente que no cierre la pantalla mientras guarda", () => {
    expect(PAGINA).toContain("Guardando tu pedido, no cierres esta pantalla");
  });

  it("hay indicador de progreso visible además del texto", () => {
    // Barra que avanza (estado `progreso`) + spinner dentro del botón.
    expect(PAGINA).toContain("setProgreso");
    expect(PAGINA).toContain("width: `${progreso}%`");
    expect(PAGINA).toContain("animate-spin");
    // Nunca llega a 100% antes de que el servidor conteste.
    expect(PAGINA).toContain("setProgreso(92)");
    expect(PAGINA).toContain("setProgreso(100)");
  });

  it("el estado de guardado se anuncia a lectores de pantalla", () => {
    expect(PAGINA).toContain('role="status"');
    expect(PAGINA).toContain("aria-busy={confirming}");
  });

  it("el botón no se puede tocar dos veces", () => {
    // (1) deshabilitado mientras guarda y (2) candado de ref, porque el estado
    // `confirming` no se ve hasta el siguiente render: dos taps rápidos
    // entrarían los dos con un guard basado solo en estado.
    expect(PAGINA).toContain("disabled={confirming}");
    expect(PAGINA).toContain("confirmandoRef");
    expect(PAGINA).toContain("if (!order || confirmandoRef.current) return;");
    expect(PAGINA).not.toContain("if (!order || confirming) return;");
  });

  it("el navegador avisa si intentan cerrar la pestaña a mitad del guardado", () => {
    expect(PAGINA).toContain('window.addEventListener("beforeunload"');
    expect(PAGINA).toContain('window.removeEventListener("beforeunload"');
  });

  it("el texto de espera solo se muestra mientras guarda", () => {
    // Ternario sobre `confirming`: guardando → aviso; si no → el copy normal.
    expect(PAGINA).toContain("Al confirmar, tu pedido entra a proceso con Fashion Group.");
    const aviso = PAGINA.indexOf("Guardando tu pedido, no cierres");
    const normal = PAGINA.indexOf("Al confirmar, tu pedido entra a proceso");
    expect(aviso).toBeGreaterThan(-1);
    expect(normal).toBeGreaterThan(aviso); // rama else del mismo ternario
  });
});
