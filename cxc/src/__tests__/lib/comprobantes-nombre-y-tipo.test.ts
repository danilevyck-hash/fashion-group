// ─────────────────────────────────────────────────────────────────────────────
// EL PANEL SE LLAMA «COMPROBANTES» — Y LA LLAVE SIGUE SIENDO `pedidos`
// (25-ago-2026)
//
// Daniel, textual: *"debería de llamarse comprobantes, ya que dentro podrás ver
// las cotizaciones enviadas y los pedidos enviados"*. El nombre no es una
// ocurrencia: es el que usa Switch (su panel llama «Reportes de comprobantes» a
// esa pantalla y los separa en 8 tipos — ver `docs/switch-panel.md`).
//
// Lo que este archivo fija, todo en el módulo PURO:
//   1. El label visible dice «Comprobantes» y la `key` de la pestaña NO cambió.
//   2. Ninguna ficha del catálogo de módulos se llama parecido (choque de label).
//   3. `tipoComprobante` sale del ENVÍO, no del `status`, y el que no salió NO
//      es ninguno de los dos.
//   4. Los conteos suman exactamente el total y los tres baldes son disjuntos.
//   5. El destino de «ver la lista» depende del ROL — un vendedor NUNCA sale
//      apuntado al admin de catálogos.
//
// La CONDUCTA (montar las pantallas y tocar los botones) va aparte, en
// `components/comprobantes-panel.test.tsx`.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  contarComprobantes,
  FILTROS_COMPROBANTE,
  PANEL_COMPROBANTES,
  pasaFiltroComprobante,
  TAB_COMPROBANTES_KEY,
  tipoComprobante,
  VACIO_NINGUNO_COINCIDE,
  VACIO_SIN_COMPROBANTES,
  type FiltroComprobante,
  type NumerosDePedido,
} from "@/lib/catalogo/numeros-pedido";
import {
  BOTON_COMPROBANTES,
  BOTON_PEDIDOS,
  destinoLista,
} from "@/lib/catalogo/destino-comprobantes";
import { CATALOGO_ADMIN_ROLES, CATALOGO_ROLES } from "@/lib/catalogo/roles";
import { ALL_MODULES } from "@/lib/modules";
import { getMarcaTheme, type MarcaUiKey } from "@/lib/catalogo/marcas-ui";

const raiz = join(__dirname, "..", "..", "..");
const leer = (rel: string) => readFileSync(join(raiz, rel), "utf8");
/** Sin comentarios: cada cambio deja escrito en uno QUÉ se renombró y por qué. */
const soloCodigo = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^[ \t]*\/\/.*$/gm, " ");

const MARCAS: MarcaUiKey[] = ["reebok", "joybees", "tommy", "calvin"];

// ── 1. El nombre y la llave ──────────────────────────────────────────────────

describe("🔴 el LABEL cambió, la KEY no", () => {
  it("el panel se llama «Comprobantes»", () => {
    expect(PANEL_COMPROBANTES).toBe("Comprobantes");
  });

  it("🔴 la key de la pestaña sigue siendo `pedidos` (`?tab=pedidos`)", () => {
    // Un marcador guardado tiene que seguir llegando. Misma decisión que
    // Cheques→«Recordatorios» y Asistencia→«Asistencia y Planilla».
    expect(TAB_COMPROBANTES_KEY).toBe("pedidos");
  });

  it("el shell del admin usa las constantes, no el texto a mano", () => {
    const src = soloCodigo(leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx"));
    expect(src).toContain("label: PANEL_COMPROBANTES");
    expect(src).toContain("key: TAB_COMPROBANTES_KEY");
    // Y no quedó una segunda copia escrita a mano.
    expect(src).not.toContain('label: "Pedidos"');
    expect(src).not.toContain('label: "Comprobantes"');
  });

  it("🔴 el tipo `Tab` sigue aceptando `pedidos` (la URL vieja no se rompe)", () => {
    const src = soloCodigo(leer("src/app/catalogos/admin/[marca]/AdminCatalogoClient.tsx"));
    expect(src).toMatch(/type Tab =[^;]*"pedidos"/);
    expect(src).toContain('tab === "pedidos"');
  });

  it("los vacíos del contenedor no dicen «pedidos»", () => {
    expect(VACIO_SIN_COMPROBANTES).toBe("No hay comprobantes aún");
    expect(VACIO_NINGUNO_COINCIDE).toBe("Ningún comprobante coincide");
    for (const t of [VACIO_SIN_COMPROBANTES, VACIO_NINGUNO_COINCIDE]) {
      expect(t.toLowerCase()).not.toContain("pedido");
    }
  });
});

// ── 2. El choque de labels ───────────────────────────────────────────────────

describe("🔴 «Comprobantes» no choca con ninguna ficha del catálogo de módulos", () => {
  it("ningún módulo se llama igual ni casi igual", () => {
    const normal = (s: string) =>
      s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const objetivo = normal(PANEL_COMPROBANTES);
    for (const m of ALL_MODULES) {
      expect(normal(m.label), `el módulo ${m.key} se llama igual`).not.toBe(objetivo);
      // Ni uno contiene al otro: "Comprobantes de X" también sería un choque.
      expect(normal(m.label).includes(objetivo), `${m.label} contiene ${PANEL_COMPROBANTES}`).toBe(false);
    }
  });

  it("y NO aparece un módulo nuevo `comprobantes` (sería un módulo sin permisos)", () => {
    expect(ALL_MODULES.some((m) => m.key === "comprobantes")).toBe(false);
  });

  it("el módulo Catálogos, que es el que lo aloja, no cambió", () => {
    const m = ALL_MODULES.find((x) => x.key === "catalogos");
    expect(m).toBeTruthy();
    expect(m!.label).toBe("Catálogos");
    expect([...m!.roles].sort()).toEqual([...CATALOGO_ROLES].sort());
  });
});

// ── 3. Qué es cada fila ──────────────────────────────────────────────────────

const enSwitch = (doc: string | null): NumerosDePedido => ({
  numeroPedido: "PED-017",
  switchNumero: "16-000000503",
  switchDocumento: doc,
  fuente: "orders",
});

describe("🔴 el tipo sale del ENVÍO, y el que no salió no es ninguno de los dos", () => {
  it("con documento 'pedido' → pedido", () => {
    expect(tipoComprobante(enSwitch("pedido"))).toBe("pedido");
  });

  it("con documento 'cotizacion' → cotizacion", () => {
    expect(tipoComprobante(enSwitch("cotizacion"))).toBe("cotizacion");
  });

  it("🩸 con el DDL pendiente (documento ausente) sigue siendo pedido, no basura", () => {
    // Escalón tolerante del DDL 20260824160000: sin la columna, todo lo que hay
    // en Switch es un pedido, que es lo único que el sistema sabía crear.
    expect(tipoComprobante(enSwitch(null))).toBe("pedido");
    expect(tipoComprobante({ switchNumero: "16-1" })).toBe("pedido");
    expect(tipoComprobante(enSwitch("PEDIDO"))).toBe("pedido");
    expect(tipoComprobante(enSwitch("factura"))).toBe("pedido");
  });

  it("🔴 sin envío NO se le inventa tipo: es «no-enviado»", () => {
    expect(tipoComprobante({ numeroPedido: "PED-019", switchNumero: null })).toBe("no-enviado");
    expect(tipoComprobante({ fuente: "publicos" })).toBe("no-enviado");
    // Y ojo: el que está en Switch SIN número tampoco es «no-enviado».
    expect(tipoComprobante({ switchNumero: "?", switchDocumento: "cotizacion" })).toBe("cotizacion");
  });
});

// ── 4. Los filtros y sus conteos ─────────────────────────────────────────────

describe("los cuatro filtros y sus conteos", () => {
  const FILAS: NumerosDePedido[] = [
    enSwitch("pedido"),
    enSwitch("pedido"),
    enSwitch("cotizacion"),
    { numeroPedido: "PED-019", switchNumero: null, fuente: "orders" },
    { fuente: "publicos" },
  ];

  it("el orden es Todos · Pedidos · Cotizaciones · Sin mandar", () => {
    expect(FILTROS_COMPROBANTE.map((f) => f.clave)).toEqual([
      "todos",
      "pedido",
      "cotizacion",
      "no-enviado",
    ]);
    expect(FILTROS_COMPROBANTE.map((f) => f.label)).toEqual([
      "Todos",
      "Pedidos",
      "Cotizaciones",
      "Sin mandar",
    ]);
  });

  it("los conteos son exactos", () => {
    const c = contarComprobantes(FILAS);
    expect(c).toEqual({ todos: 5, pedido: 2, cotizacion: 1, "no-enviado": 2 });
  });

  it("🔴 los tres baldes suman el total: nada se cuenta dos veces ni se pierde", () => {
    const c = contarComprobantes(FILAS);
    expect(c.pedido + c.cotizacion + c["no-enviado"]).toBe(c.todos);
    expect(c.todos).toBe(FILAS.length);
  });

  it("el filtro deja pasar exactamente lo que su conteo dice", () => {
    for (const { clave } of FILTROS_COMPROBANTE) {
      const pasan = FILAS.filter((f) => pasaFiltroComprobante(f, clave));
      expect(pasan).toHaveLength(contarComprobantes(FILAS)[clave]);
    }
  });

  it("«Todos» no filtra nada", () => {
    expect(FILAS.every((f) => pasaFiltroComprobante(f, "todos"))).toBe(true);
  });

  it("una lista vacía da cuatro ceros (no rompe ni inventa)", () => {
    expect(contarComprobantes([])).toEqual({ todos: 0, pedido: 0, cotizacion: 0, "no-enviado": 0 });
  });
});

// ── 5. El destino por ROL ────────────────────────────────────────────────────

describe("🔴 a dónde lleva el botón de la confirmación, por ROL", () => {
  const rutas = (m: MarcaUiKey) => getMarcaTheme(m)!;

  it("las 4 marcas tienen su adminHref, y es el del hub", () => {
    for (const m of MARCAS) {
      expect(rutas(m).adminHref).toBe(`/catalogos/admin/${m}`);
      // La MISMA dirección que el botón «Administrar» del hub de catálogos.
      expect(leer("src/app/catalogos/marcas/page.tsx")).toContain(`"/catalogos/admin/${m}"`);
    }
  });

  it("admin y secretaria van al panel de Comprobantes, con la key vieja", () => {
    for (const rol of CATALOGO_ADMIN_ROLES) {
      for (const m of MARCAS) {
        const d = destinoLista(rutas(m), rol);
        expect(d.href).toBe(`/catalogos/admin/${m}?tab=pedidos`);
        expect(d.label).toBe(BOTON_COMPROBANTES);
        expect(d.esPanelAdmin).toBe(true);
      }
    }
    expect(BOTON_COMPROBANTES).toBe("Ver comprobantes");
  });

  it("🔴 el VENDEDOR va a SU lista — nunca al admin (le daría 403)", () => {
    for (const m of MARCAS) {
      const d = destinoLista(rutas(m), "vendedor");
      expect(d.href).toBe(`/catalogo/${m}/pedidos`);
      expect(d.href).not.toContain("/catalogos/admin/");
      expect(d.label).toBe(BOTON_PEDIDOS);
      expect(d.esPanelAdmin).toBe(false);
    }
  });

  it("🩸 el default es la lista que NO rebota: rol vacío, nulo o desconocido", () => {
    for (const rol of ["", null, undefined, "bodega", "contabilidad", "cliente", "gerente_acs"]) {
      const d = destinoLista(rutas("reebok"), rol as string | null | undefined);
      expect(d.href, `rol ${String(rol)}`).not.toContain("/catalogos/admin/");
      expect(d.esPanelAdmin).toBe(false);
    }
  });

  it("ningún rol FUERA de CATALOGO_ADMIN_ROLES sale apuntado al admin", () => {
    const todos = ["admin", "secretaria", "vendedor", "bodega", "contabilidad", "gerente_acs"];
    for (const rol of todos) {
      const esAdmin = (CATALOGO_ADMIN_ROLES as readonly string[]).includes(rol);
      expect(destinoLista(rutas("tommy"), rol).esPanelAdmin, rol).toBe(esAdmin);
    }
  });

  it("el rótulo y la dirección salen del MISMO lugar (no se pueden separar)", () => {
    const src = soloCodigo(leer("src/components/catalogo/ConfirmacionClient.tsx"));
    expect(src).toContain("destinoLista(theme, role)");
    expect(src).toContain("href={destino.href}");
    expect(src).toContain("{destino.label}");
    // Ni la dirección ni el rótulo se escriben a mano en la pantalla.
    expect(src).not.toContain("/catalogos/admin/");
    expect(src).not.toContain("Ver comprobantes");
  });
});
