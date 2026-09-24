// ─────────────────────────────────────────────────────────────────────────────
// RECLAMOS EN EL CELULAR (24-sep-2026) — el mockup que Daniel aprobó letra por
// letra: 1b · 2c · 2e · 3b · 3e · 5b · 6b · 7b · 8b · 9 · 10c · 11c.
//
// 🩸 QUÉ REEMPLAZA (medido el 24-sep-2026 contra producción y sobre las fotos
// del iPhone de Daniel, 390 px):
//   · portada de 1.055 px, con el buscador cortado a media palabra;
//   · la lista de una empresa con 45 cosas tocables y 2,5 reclamos por pantalla;
//   · en «Cobrados», los días seguían corriendo («350 días» en uno ya cobrado);
//   · buscar devolvía una tabla de 560 px dentro de 358: la PLATA quedaba fuera;
//   · el reclamo abierto: cuatro botones en dos filas y dos menús que no se
//     conocían; un reclamo cobrado repartía el mismo hecho en tres cajas.
//
// 🔴 LO QUE ESTE CANDADO SOSTIENE:
//   1. La portada es una fila por empresa, con el chip rojo del más viejo y lo
//      cobrado en un renglón; el número grande es EXACTO, con centavos.
//   2. La fila de la lista NO tiene botones (2c): se toca y abre el reclamo.
//   3. Las otras acciones viven en el «···» de arriba (2e/11c).
//   4. El reclamo abierto tiene UN botón negro fijo, «Marcar como cobrado» (3b),
//      y Fotos y Seguimiento son dos renglones (3e).
//   5. La hoja de cobro trae el monto puesto y editable y dice que se deshace
//      por 5 s (7b) — y manda las MISMAS filas que la ventana de siempre.
//   6. En «Cobrados» sale el visto verde y la fecha del cobro, sin días (5b).
//   7. El correo manda EL MISMO cuerpo a la MISMA ruta que la computadora (8b).
//   8. Con el interruptor apagado, la pantalla de antes queda intacta.
//   9. En el celular no hay una sola `<table>` ni un deslizamiento de lado.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";
import React from "react";

import PortadaCelular from "@/app/reclamos/components/celular/PortadaCelular";
import ListaEmpresaCelular from "@/app/reclamos/components/celular/ListaEmpresaCelular";
import DetalleCelular from "@/app/reclamos/components/celular/DetalleCelular";
import { HojaCobrar, HojaCorreo } from "@/app/reclamos/components/celular/HojasReclamosCelular";
import { rutaDelCorreo } from "@/app/reclamos/components/descargas";
import { asuntoPorDefecto, loQueVaAdjunto, mensajePorDefecto } from "@/lib/reclamos/correo-proveedor";
import {
  RECLAMOS_CELULAR,
  lineaCobrado,
  lineaEmpresa,
  lineaReclamo,
  montoCel,
  subtituloPortada,
  tituloSeleccion,
} from "@/lib/reclamos/celular";
import { MARCAR_COBRADO } from "@/lib/reclamos/rotulos";
import { reclamoTaxes } from "@/lib/reclamos/tax";
import type { Contacto, Reclamo } from "@/app/reclamos/components/types";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

afterEach(cleanup);
beforeEach(() => {
  vi.useRealTimers();
  if (!("localStorage" in window) || !window.localStorage) {
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      value: { getItem: () => null, setItem: () => {}, removeItem: () => {} },
    });
  }
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: () => {}, replace: () => {} }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/reclamos",
}));

// ─────────────────────────────────────────────────────────────────────────────
// El fixture: los reclamos REALES de Fashion Wear del 24-sep-2026
// ─────────────────────────────────────────────────────────────────────────────

function item(referencia: string, cantidad: number, precio: number) {
  return {
    referencia,
    descripcion: "Camiseta para dama",
    talla: "TODAS",
    cantidad,
    precio_unitario: precio,
    subtotal: cantidad * precio,
    motivo: "Mercancía manchada",
    genero: "Women",
    nro_factura: "",
    nro_orden_compra: "",
  };
}

function rec(over: Partial<Reclamo> & { id: string; nro_reclamo: string }): Reclamo {
  return {
    empresa: "Fashion Wear",
    proveedor: "American Fashion Wear",
    marca: "Tommy Hilfiger",
    nro_factura: "200004329",
    nro_orden_compra: "80174924",
    fecha_reclamo: "2026-09-11",
    fecha_factura: "2026-08-26",
    reclamado_en: "2026-09-11",
    estado: "Creado",
    notas: "",
    created_at: "2026-09-11T09:00:00Z",
    reclamo_items: [item("76J4869YCI", 120, 9.6), item("76J4818YCI", 120, 9.6)],
    reclamo_fotos: [],
    reclamo_seguimiento: [],
    reclamo_settlements: [],
    ...over,
  } as Reclamo;
}

/** FW-2026-0007: 2 renglones de 120 × $9.60 → $2,711.81 con impuestos. */
const FW0007 = rec({ id: "a", nro_reclamo: "FW-2026-0007" });
/** REC-2026-0001: el más viejo de Fashion Wear (599 días). */
const VIEJO = rec({
  id: "b",
  nro_reclamo: "REC-2026-0001",
  nro_factura: "200007286",
  fecha_factura: "2025-02-02",
  reclamo_items: [item("X1", 1, 790)],
});
/** REC-2026-0015: cobrado el 17-sept-2026, $134.65. */
const COBRADO = rec({
  id: "c",
  nro_reclamo: "REC-2026-0015",
  estado: "Pagado",
  nro_factura: "2000012356",
  fecha_factura: "2026-05-11",
  reclamo_items: [item("XB0XB01848DW5", 1, 114.4)],
  monto_reclamado_snapshot: 134.65,
  comprobante_url: "https://x/comprobante.jpg",
  comprobante_path: "c/comprobante.jpg",
  reclamo_settlements: [
    { id: "s1", reclamo_id: "c", monto: 134.65, nota_credito: null, nota_credito_ccte_id: null, fecha: "2026-09-17" },
  ],
});

const CONTACTOS: Contacto[] = [
  { id: "1", empresa: "Fashion Wear", nombre: "Isaac Amar", nombre_contacto: "Isaac Amar", correo: "iamar@aswgr.com" },
];

const noop = () => {};

// ─────────────────────────────────────────────────────────────────────────────
// Las reglas puras
// ─────────────────────────────────────────────────────────────────────────────

describe("Las palabras del celular", () => {
  it("la plata va EXACTA, con centavos: nada se redondea", () => {
    expect(montoCel(9408.68)).toBe("$9,408.68");
    expect(montoCel(2711.808)).toBe("$2,711.81");
  });

  it("la portada dice cuántos son y cuántos pasan del corte", () => {
    expect(subtituloPortada(19, 6)).toEqual({ texto: "19 por cobrar", viejos: "6 pasan de 120 días" });
    expect(subtituloPortada(1, 1)).toEqual({ texto: "1 por cobrar", viejos: "1 pasa de 120 días" });
    expect(subtituloPortada(3, 0).viejos).toBeNull();
  });

  it("la empresa dice cuántos y el más viejo", () => {
    expect(lineaEmpresa(11, 599)).toEqual({ texto: "11 reclamos", dias: "el más viejo 599 días" });
    expect(lineaEmpresa(1, null)).toEqual({ texto: "1 reclamo", dias: null });
  });

  it("el reclamo dice su factura, sus fotos y hace cuánto — y se pone rojo a los 120 días", () => {
    expect(lineaReclamo({ facturas: ["200004329"], fotos: 0, dias: 29 })).toEqual({
      texto: "factura 200004329 · hace 29 días",
      rojo: false,
    });
    expect(lineaReclamo({ facturas: ["a", "b", "c"], fotos: 3, dias: 65 }).texto).toBe(
      "3 facturas · 3 fotos · hace 65 días",
    );
    expect(lineaReclamo({ facturas: ["x"], fotos: 0, dias: 599 }).rojo).toBe(true);
    expect(lineaReclamo({ facturas: ["x"], fotos: 0, dias: null }).texto).toContain("sin fecha de factura");
  });

  it("🔴 5b · en un cobrado NO se cuentan los días: se dice CUÁNDO se cobró", () => {
    expect(lineaCobrado("2026-09-17", 5)).toBe("cobrado el 17 sept 2026 · 5 fotos");
    expect(lineaCobrado("2026-07-08", 0)).toBe("cobrado el 8 jul 2026");
    expect(lineaCobrado(null, 0)).toBe("cobrado");
    expect(lineaCobrado("2026-09-17", 0)).not.toContain("día");
  });

  it("🔴 10c · el título de la selección dice cuántos van Y cuánto suman", () => {
    expect(tituloSeleccion(2, 11, 2872.35, false)).toEqual({
      titulo: "2 elegidos",
      sub: "de 11 por cobrar · $2,872.35",
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 1b · La portada
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 1b · La portada del celular", () => {
  function pintar(over: Partial<React.ComponentProps<typeof PortadaCelular>> = {}) {
    return render(
      <PortadaCelular
        role="admin"
        reclamos={[FW0007, VIEJO, COBRADO]}
        loading={false}
        contactos={CONTACTOS}
        globalSearch=""
        setGlobalSearch={noop}
        onNewReclamo={noop}
        onSelectEmpresa={noop}
        onLoadDetail={noop}
        {...over}
      />,
    );
  }

  it("el número grande es la plata por cobrar, EXACTA", () => {
    pintar();
    const total = reclamoTaxes("Fashion Wear", 2304).total + reclamoTaxes("Fashion Wear", 790).total;
    expect(screen.getAllByText(montoCel(total)).length).toBeGreaterThan(0);
    expect(screen.getByText("por cobrar")).toBeTruthy();
  });

  it("hay UNA fila por empresa, y Fashion Wear trae el chip rojo del más viejo", () => {
    pintar();
    const filas = document.querySelectorAll('[data-lista="reclamos-empresas"] li');
    expect(filas.length).toBeGreaterThan(0);
    expect(document.body.textContent).toContain("2 reclamos");
    expect(document.body.textContent).toMatch(/el más viejo \d+ días/);
  });

  it("lo cobrado es UN renglón con su visto verde", () => {
    pintar();
    expect(document.body.textContent).toMatch(/Cobrado en \d{4}/);
    expect(screen.getAllByLabelText("cobrado").length).toBeGreaterThan(0);
  });

  it("«Nuevo reclamo» queda fijo abajo", () => {
    const onNewReclamo = vi.fn();
    pintar({ onNewReclamo });
    const btn = screen.getByRole("button", { name: "Nuevo reclamo" });
    expect(btn.closest("[data-cta]")?.className).toContain("fixed");
    fireEvent.click(btn);
    expect(onNewReclamo).toHaveBeenCalled();
  });

  it("🔴 9 · buscar devuelve FILAS con la plata a la vista, nunca una tabla", () => {
    pintar({ globalSearch: "200004329" });
    expect(document.querySelectorAll("table").length).toBe(0);
    const filas = document.querySelectorAll('[data-lista="reclamos-buscar"] li');
    expect(filas.length).toBe(1);
    expect(filas[0].textContent).toContain("FW-2026-0007");
    expect(filas[0].textContent).toContain("por cobrar");
    expect(filas[0].textContent).toContain("$2,711.81");
  });

  it("⚠️ en toda la portada no hay una sola tabla ni un deslizamiento de lado", () => {
    pintar();
    expect(document.querySelectorAll("table").length).toBe(0);
    expect(document.querySelectorAll(".overflow-x-auto").length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2c · 2e · 5b · 10c · La lista de una empresa
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 2c · La lista de una empresa no tiene botones en la fila", () => {
  function pintar(over: Partial<React.ComponentProps<typeof ListaEmpresaCelular>> = {}) {
    return render(
      <ListaEmpresaCelular
        role="admin"
        activeEmpresa="Fashion Wear"
        reclamos={[FW0007, VIEJO, COBRADO]}
        contactos={CONTACTOS}
        selectionMode={false}
        setSelectionMode={noop}
        selectedIds={[]}
        setSelectedIds={noop as never}
        onNewReclamo={noop}
        onLoadDetail={noop}
        onDeleteSelected={noop}
        onReload={noop}
        {...over}
      />,
    );
  }

  it("ni «Correo» ni «Descargar» ni «···» adentro de la fila", () => {
    pintar();
    const filas = document.querySelectorAll('[data-fila="reclamo"]');
    expect(filas.length).toBe(2); // los dos por cobrar
    for (const f of filas) {
      expect(f.querySelectorAll("button").length).toBe(1); // la fila ENTERA es el botón
      expect(f.textContent).not.toContain("Correo");
      expect(f.textContent).not.toContain("Descargar");
    }
  });

  it("tocar la fila abre el reclamo", () => {
    const onLoadDetail = vi.fn();
    pintar({ onLoadDetail });
    fireEvent.click(screen.getByText("FW-2026-0007"));
    expect(onLoadDetail).toHaveBeenCalledWith("a");
  });

  it("🔴 2e · lo demás vive en el «···» de arriba, en una hoja que sube", () => {
    pintar();
    fireEvent.click(screen.getByLabelText("Más opciones"));
    const hoja = document.querySelector('[data-hoja="opciones"]');
    expect(hoja).toBeTruthy();
    const texto = hoja!.textContent || "";
    expect(texto).toContain("al proveedor");
    expect(texto).toContain("Descargar en Excel");
    expect(texto).toContain("Descargar en PDF");
    expect(texto).toContain("Elegir algunos");
  });

  it("🔴 5b · en «Cobrados» sale el visto verde y la fecha del cobro, sin días", () => {
    pintar();
    fireEvent.click(screen.getByRole("button", { name: /Cobrados/ }));
    const fila = document.querySelector('[data-fila="reclamo"]')!;
    expect(fila.textContent).toContain("REC-2026-0015");
    expect(fila.textContent).toContain("cobrado el 17 sept 2026");
    expect(fila.textContent).not.toMatch(/hace \d+ días/);
    expect(within(fila as HTMLElement).getByLabelText("cobrado")).toBeTruthy();
  });

  it("🔴 10c · elegir se pide UNA vez desde arriba, y el título dice cuántos y cuánto", () => {
    pintar({ selectionMode: true, selectedIds: ["a"] });
    expect(screen.getByText("1 elegido")).toBeTruthy();
    expect(document.body.textContent).toContain("de 2 por cobrar · $2,711.81");
    expect(screen.getByRole("button", { name: /Mandar el reclamo al proveedor/ })).toBeTruthy();
  });

  it("⚠️ ni una tabla en toda la pantalla", () => {
    pintar();
    expect(document.querySelectorAll("table").length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3b · 3e · 6b · El reclamo abierto
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 3b · 3e · El reclamo abierto en el celular", () => {
  function pintar(over: Partial<React.ComponentProps<typeof DetalleCelular>> = {}) {
    return render(
      <DetalleCelular
        current={FW0007}
        role="admin"
        contacto={CONTACTOS[0]}
        nota=""
        setNota={noop}
        onStartEdit={noop}
        onDeleteReclamo={noop}
        onAddNota={noop}
        onVolverAPorCobrar={noop}
        onCobrar={noop}
        cobrando={false}
        onUploadFoto={noop}
        onDeleteFoto={noop}
        toast={null}
        showToast={noop}
        {...over}
      />,
    );
  }

  it("UN solo botón negro, fijo abajo, y dice «Marcar como cobrado»", () => {
    pintar();
    const btn = screen.getByRole("button", { name: MARCAR_COBRADO });
    expect(btn.closest("[data-cta]")?.className).toContain("fixed");
    expect(document.body.textContent).not.toContain("pagado");
  });

  it("🔴 11c · todo lo demás en UN solo «···», no en dos menús", () => {
    pintar();
    fireEvent.click(screen.getByLabelText("Más opciones del reclamo"));
    const hoja = document.querySelector('[data-hoja="opciones"]')!;
    const texto = hoja.textContent || "";
    expect(texto).toContain("Mandar al proveedor");
    expect(texto).toContain("Descargar en PDF");
    expect(texto).toContain("Descargar en Excel");
    expect(texto).toContain("Editar");
    expect(texto).toContain("Eliminar");
  });

  it("🔴 3e · Fotos y «Lo que ha pasado» son DOS renglones que se abren", () => {
    pintar();
    expect(screen.getByText("Fotos")).toBeTruthy();
    expect(screen.getByText("Lo que ha pasado")).toBeTruthy();
    fireEvent.click(screen.getByText("Fotos"));
    expect(document.querySelector('[data-hoja="fotos"]')).toBeTruthy();
  });

  it("los renglones y el total salen del MISMO cálculo de siempre", () => {
    pintar();
    const lista = document.querySelector('[data-lista="reclamo-renglones"]')!;
    expect(lista.textContent).toContain("76J4869YCI");
    expect(lista.textContent).toContain("$1,152.00");
    expect(lista.textContent).toContain("Total");
    expect(lista.textContent).toContain(montoCel(reclamoTaxes("Fashion Wear", 2304).total));
  });

  it("🔴 6b · un reclamo cobrado abre con UNA línea verde y las filas del cobro", () => {
    pintar({ current: COBRADO });
    expect(screen.getByText(/134\.65 cobrado/)).toBeTruthy();
    expect(document.body.textContent).toContain("17 sept 2026");
    expect(screen.getByText("Comprobante de pago")).toBeTruthy();
    expect(screen.getByText("Nota de crédito")).toBeTruthy();
    // Y ya no ofrece cobrar.
    expect(screen.queryByRole("button", { name: MARCAR_COBRADO })).toBeNull();
  });

  it("⚠️ ni una tabla ni un deslizamiento de lado", () => {
    pintar();
    expect(document.querySelectorAll("table").length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7b · La hoja de cobro
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 7b · Cobrar es una hoja que sube", () => {
  function pintar(over: Partial<React.ComponentProps<typeof HojaCobrar>> = {}) {
    return render(
      <HojaCobrar
        nroReclamo="FW-2026-0006"
        reclamado={153.01}
        requiereComprobante={false}
        guardando={false}
        onCerrar={noop}
        onCobrar={noop}
        {...over}
      />,
    );
  }

  it("el monto viene PUESTO y es el número grande", () => {
    pintar();
    const input = screen.getByLabelText("Cuánto entró") as HTMLInputElement;
    expect(input.value).toBe("153.01");
    expect(input.className).toContain("text-[40px]");
  });

  it("un solo botón negro, y DICE cuánto cobra", () => {
    pintar();
    expect(screen.getByRole("button", { name: "Cobrar $153.01" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
  });

  it("y dice que se deshace por 5 segundos", () => {
    pintar();
    expect(document.body.textContent).toContain("Se deshace por 5 segundos.");
  });

  it("🔴 manda las MISMAS filas que la ventana de la computadora", () => {
    const onCobrar = vi.fn();
    pintar({ onCobrar });
    fireEvent.click(screen.getByRole("button", { name: "Cobrar $153.01" }));
    expect(onCobrar).toHaveBeenCalledTimes(1);
    const [filas, comprobante] = onCobrar.mock.calls[0];
    expect(filas).toHaveLength(1);
    expect(filas[0].monto).toBe(153.01);
    expect(filas[0].nota_credito).toBe("");
    expect(filas[0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(comprobante).toBeNull();
  });

  it("🔴 ES EDITABLE: un cobro parcial se escribe encima y es lo que viaja", () => {
    const onCobrar = vi.fn();
    pintar({ onCobrar });
    fireEvent.change(screen.getByLabelText("Cuánto entró"), { target: { value: "100" } });
    fireEvent.click(screen.getByRole("button", { name: "Cobrar $100.00" }));
    expect(onCobrar.mock.calls[0][0][0].monto).toBe(100);
  });

  it("⚠️ el comprobante sigue siendo obligatorio cuando el reclamo no lo tiene", () => {
    const onCobrar = vi.fn();
    pintar({ requiereComprobante: true, onCobrar });
    fireEvent.click(screen.getByRole("button", { name: "Cobrar $153.01" }));
    expect(onCobrar).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("obligatorio para marcar cobrado");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8b · El correo
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 8b · El correo desde el teléfono manda lo MISMO", () => {
  it("«Para» viene puesto, el texto va plegado y dice qué va adjunto", () => {
    render(
      <HojaCorreo
        empresa="Fashion Wear"
        contactoNombre="Isaac Amar"
        correo="iamar@aswgr.com"
        cuantos={1}
        facturas={1}
        fotos={3}
        enviando={false}
        onCerrar={noop}
        onMandar={noop}
      />,
    );
    expect((screen.getByLabelText("Para") as HTMLInputElement).value).toBe("iamar@aswgr.com");
    expect(screen.queryByLabelText("Asunto")).toBeNull();
    expect(document.body.textContent).toContain(loQueVaAdjunto({ facturas: 1, fotos: 3 }));
    expect(document.body.textContent).toContain("Se deshace por 5 segundos.");
    fireEvent.click(screen.getByText("Ver el texto"));
    expect((screen.getByLabelText("Asunto") as HTMLInputElement).value).toBe(
      asuntoPorDefecto(1, "Fashion Wear"),
    );
  });

  it("🔴 el cuerpo es EL MISMO que arma la ventana de la computadora", () => {
    const onMandar = vi.fn();
    render(
      <HojaCorreo
        empresa="Fashion Wear"
        contactoNombre="Isaac Amar"
        correo="iamar@aswgr.com"
        cuantos={11}
        facturas={0}
        fotos={0}
        enviando={false}
        onCerrar={noop}
        onMandar={onMandar}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Mandar" }));
    expect(onMandar).toHaveBeenCalledWith({
      to: "iamar@aswgr.com",
      cc: "",
      subject: asuntoPorDefecto(11, "Fashion Wear"),
      message: mensajePorDefecto(11, "Fashion Wear", "Isaac Amar"),
    });
  });

  it("⚠️ y sale por la MISMA ruta de siempre", () => {
    expect(rutaDelCorreo("Fashion Wear")).toBe("/api/reclamos/proveedor/Fashion%20Wear/send-zip");
    const modal = leer("src/app/reclamos/components/EnviarProveedorModal.tsx");
    expect(modal).toContain("mandarAlProveedor(");
    expect(modal).toContain("asuntoPorDefecto(");
    expect(modal).toContain("mensajePorDefecto(");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Lo que no puede cambiar
// ─────────────────────────────────────────────────────────────────────────────

describe("🔴 NADA DE LO QUE SE GUARDA CAMBIA", () => {
  const cel = [
    "src/app/reclamos/components/celular/PortadaCelular.tsx",
    "src/app/reclamos/components/celular/ListaEmpresaCelular.tsx",
    "src/app/reclamos/components/celular/DetalleCelular.tsx",
    "src/app/reclamos/components/celular/HojasReclamosCelular.tsx",
    "src/app/reclamos/components/celular/piezas.tsx",
  ];

  it("ninguna pantalla del celular arma una ruta de la API a mano", () => {
    for (const rel of cel) {
      const src = leer(rel);
      expect(src, rel).not.toContain("/api/reclamos");
    }
  });

  it("las descargas y el correo salen de `descargas.ts`, el mismo módulo de la computadora", () => {
    expect(leer("src/app/reclamos/components/EmpresaList.tsx")).toContain('from "./descargas"');
    expect(leer("src/app/reclamos/components/celular/ListaEmpresaCelular.tsx")).toContain('from "../descargas"');
    expect(leer("src/app/reclamos/components/celular/DetalleCelular.tsx")).toContain('from "../descargas"');
  });

  it("el cobro del celular llama al MISMO `submitSettlement` del contenedor", () => {
    const cliente = leer("src/app/reclamos/ReclamosClient.tsx");
    expect(cliente).toContain("onCobrar={(filas, comprobante) => { void submitSettlement(filas, comprobante); }}");
    // Y `submitSettlement` sigue pegándole a la ruta de settlements con markPaid.
    expect(cliente).toContain("/settlements`");
    expect(cliente).toContain("markPaid: true");
  });
});

describe("⚠️ CON EL INTERRUPTOR APAGADO, LA PANTALLA DE ANTES QUEDA INTACTA", () => {
  it("hoy está prendido", () => {
    expect(RECLAMOS_CELULAR).toBe(true);
  });

  it("y todo el celular cuelga de él: el contenedor no dibuja nada nuevo sin el interruptor", () => {
    const cliente = leer("src/app/reclamos/ReclamosClient.tsx");
    for (const comp of ["PortadaCelular", "ListaEmpresaCelular", "DetalleCelular"]) {
      // Cada pantalla nueva aparece SOLO adentro de una guarda del interruptor.
      const i = cliente.indexOf(`<${comp}`);
      expect(i, comp).toBeGreaterThan(0);
      const antes = cliente.slice(Math.max(0, i - 600), i);
      expect(antes, comp).toContain("RECLAMOS_CELULAR");
    }
  });

  it("las tres pantallas de la computadora siguen ahí, y su encabezado solo se apaga con el interruptor", () => {
    for (const rel of [
      "src/app/reclamos/components/EmpresaSelector.tsx",
      "src/app/reclamos/components/EmpresaList.tsx",
      "src/app/reclamos/components/ReclamoDetail.tsx",
    ]) {
      const src = leer(rel);
      expect(src, rel).toContain("sinEncabezado");
      expect(src, rel).toContain("AppHeader");
    }
  });
});
