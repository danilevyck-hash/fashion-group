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
//   3. `tipoComprobante`: los TRES chips —Pedidos · Cotizaciones · Borradores—
//      y su orden de decisión (borrador → cotización → pedido). «Borradores» es
//      `status = 'borrador'`, NO "nunca se envió".
//   4. 🔴 LOS TRES PARTICIONAN: suman el total y ninguna fila queda sin chip.
//      Es lo que permite que «Todos» se haya ido.
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
  esBorrador,
  FILTRO_COMPROBANTE_DEFAULT,
  FILTROS_COMPROBANTE,
  PANEL_COMPROBANTES,
  pasaFiltroComprobante,
  TAB_COMPROBANTES_KEY,
  textoEnSwitch,
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

const enSwitch = (doc: string | null, over: Partial<NumerosDePedido> = {}): NumerosDePedido => ({
  numeroPedido: "PED-017",
  switchNumero: "16-000000503",
  switchDocumento: doc,
  status: "confirmado",
  fuente: "orders",
  ...over,
});

describe("🔴 «Borradores» es el STATUS, no «nunca se envió»", () => {
  it("`status = 'borrador'` es borrador, y nada más lo es", () => {
    expect(esBorrador({ status: "borrador" })).toBe(true);
    expect(esBorrador({ status: "  BORRADOR " })).toBe(true);
    expect(esBorrador({ status: "confirmado" })).toBe(false);
    expect(esBorrador({ status: "enviado" })).toBe(false);
  });

  it("🩸 sin `status` NO es borrador — el pedido del LINK aún no tiene fila en orders", () => {
    expect(esBorrador({ fuente: "publicos" })).toBe(false);
    expect(esBorrador({ status: null })).toBe(false);
    expect(esBorrador({ status: "" })).toBe(false);
    expect(esBorrador({})).toBe(false);
  });

  it("🔴 EL CASO REAL DE PRODUCCIÓN: PED-018 está EN SWITCH y ES borrador", () => {
    // reebok PED-018 · Hafez, S.A. · $2.520 — salió al ERP y su `status` nunca
    // se cerró. Con el criterio viejo («nunca se envió») caía en «Pedidos»;
    // con el nuevo cae en «Borradores», que es lo que Daniel pidió ver.
    const ped018 = enSwitch("pedido", { numeroPedido: "PED-018", status: "borrador" });
    expect(esBorrador(ped018)).toBe(true);
    expect(tipoComprobante(ped018)).toBe("borrador");
    // Y el criterio viejo diría exactamente lo contrario.
    expect(ped018.switchNumero).not.toBeNull();
  });

  it("🔴 y al revés: un confirmado que NUNCA salió NO es borrador", () => {
    // reebok y calvin tienen uno cada uno en producción. Con el criterio viejo
    // caían en «Sin mandar»; ahora caen en «Pedidos», que es el balde de resto.
    const sinSalir: NumerosDePedido = { numeroPedido: "PED-030", switchNumero: null, status: "confirmado", fuente: "orders" };
    expect(esBorrador(sinSalir)).toBe(false);
    expect(tipoComprobante(sinSalir)).toBe("pedido");
  });
});

describe("🔴 el orden de decisión: borrador → cotización → pedido", () => {
  it("con documento 'cotizacion' y ya confirmado → cotizacion", () => {
    expect(tipoComprobante(enSwitch("cotizacion"))).toBe("cotizacion");
  });

  it("con documento 'pedido' → pedido", () => {
    expect(tipoComprobante(enSwitch("pedido"))).toBe("pedido");
  });

  it("🔴 el BORRADOR gana sobre la cotización: no está terminado", () => {
    expect(tipoComprobante(enSwitch("cotizacion", { status: "borrador" }))).toBe("borrador");
  });

  it("🩸 con el DDL pendiente (documento ausente) sigue siendo pedido, no basura", () => {
    // Escalón tolerante del DDL 20260824160000: sin la columna, todo lo que hay
    // en Switch es un pedido, que es lo único que el sistema sabía crear.
    expect(tipoComprobante(enSwitch(null))).toBe("pedido");
    expect(tipoComprobante({ switchNumero: "16-1" })).toBe("pedido");
    expect(tipoComprobante(enSwitch("PEDIDO"))).toBe("pedido");
    expect(tipoComprobante(enSwitch("factura"))).toBe("pedido");
  });

  it("🔴 «Pedidos» es el balde de RESTO: el del link sin convertir cae ahí", () => {
    // Sin «Todos», una fila que no cayera en ningún chip sería INVISIBLE. En
    // producción hay 6 pedidos del link sin convertir (5 reebok + 1 joybees).
    expect(tipoComprobante({ fuente: "publicos" })).toBe("pedido");
    expect(tipoComprobante({ numeroPedido: "PED-019", switchNumero: null })).toBe("pedido");
    // Y la FILA sigue diciendo la verdad, que es otra cosa que el chip.
    expect(textoEnSwitch({ fuente: "publicos" })).toBe("No se ha mandado a Switch");
  });
});

// ── 4. Los tres filtros, sus conteos y la PARTICIÓN ──────────────────────────

describe("los TRES filtros — «Todos» se fue", () => {
  // Una muestra con la forma de producción (medida el 25-ago-2026): pedidos en
  // Switch, una cotización, un BORRADOR QUE SÍ SALIÓ (PED-018), un borrador que
  // no salió, un confirmado que nunca salió, y el del link sin convertir.
  const FILAS: NumerosDePedido[] = [
    enSwitch("pedido"),
    enSwitch("pedido", { numeroPedido: "PED-021" }),
    enSwitch("cotizacion", { numeroPedido: "PED-020" }),
    enSwitch("pedido", { numeroPedido: "PED-018", status: "borrador" }),
    { numeroPedido: "PED-019", switchNumero: null, status: "borrador", fuente: "orders" },
    { numeroPedido: "PED-030", switchNumero: null, status: "confirmado", fuente: "orders" },
    { fuente: "publicos" },
  ];

  it("🔴 son TRES y no hay «Todos»", () => {
    expect(FILTROS_COMPROBANTE).toHaveLength(3);
    expect(FILTROS_COMPROBANTE.map((f) => f.clave)).toEqual(["pedido", "cotizacion", "borrador"]);
    expect(FILTROS_COMPROBANTE.map((f) => f.label)).toEqual(["Pedidos", "Cotizaciones", "Borradores"]);
    expect(FILTROS_COMPROBANTE.some((f) => String(f.clave) === "todos")).toBe(false);
    expect(FILTROS_COMPROBANTE.some((f) => f.label === "Todos")).toBe(false);
    // Y el balde viejo tampoco vuelve por la ventana.
    expect(FILTROS_COMPROBANTE.some((f) => f.label === "Sin mandar")).toBe(false);
    expect(FILTROS_COMPROBANTE.some((f) => String(f.clave) === "no-enviado")).toBe(false);
  });

  it("🔴 abre en «Pedidos», que es lo que más se mira", () => {
    expect(FILTRO_COMPROBANTE_DEFAULT).toBe("pedido");
    expect(FILTROS_COMPROBANTE[0].clave).toBe(FILTRO_COMPROBANTE_DEFAULT);
  });

  it("los conteos son exactos", () => {
    expect(contarComprobantes(FILAS)).toEqual({ pedido: 4, cotizacion: 1, borrador: 2 });
  });

  it("🔴 LOS TRES PARTICIONAN: suman el total y ninguna fila queda sin chip", () => {
    // Es lo que hace que «Todos» pueda irse. Si algún día un criterio dejara una
    // fila afuera, esa fila sería INVISIBLE en el panel y este candado se pone
    // rojo antes de que llegue a producción.
    const c = contarComprobantes(FILAS);
    expect(c.pedido + c.cotizacion + c.borrador).toBe(FILAS.length);
    for (const f of FILAS) {
      const cae = FILTROS_COMPROBANTE.filter(({ clave }) => pasaFiltroComprobante(f, clave));
      expect(cae, `${f.numeroPedido ?? "del link"} cae en ${cae.length} chips`).toHaveLength(1);
    }
  });

  it("el filtro deja pasar exactamente lo que su conteo dice", () => {
    for (const { clave } of FILTROS_COMPROBANTE) {
      const pasan = FILAS.filter((f) => pasaFiltroComprobante(f, clave));
      expect(pasan).toHaveLength(contarComprobantes(FILAS)[clave]);
    }
  });

  it("🔴 «Borradores» trae los 2 borradores, uno de ellos EN Switch", () => {
    const b = FILAS.filter((f) => pasaFiltroComprobante(f, "borrador"));
    expect(b.map((f) => f.numeroPedido)).toEqual(["PED-018", "PED-019"]);
    expect(b.some((f) => f.switchNumero !== null)).toBe(true);
  });

  it("🩸 el criterio VIEJO («nunca se envió») daría OTRA cosa", () => {
    // La prueba de que son dos preguntas distintas: si «Borradores» volviera a
    // ser "no salió a Switch", traería 3 filas y NO traería PED-018.
    const viejo = FILAS.filter((f) => f.switchNumero === null || f.switchNumero === undefined);
    expect(viejo).toHaveLength(3);
    expect(viejo.map((f) => f.numeroPedido)).not.toContain("PED-018");
    expect(contarComprobantes(FILAS).borrador).toBe(2);
  });

  it("una lista vacía da tres ceros (no rompe ni inventa)", () => {
    expect(contarComprobantes([])).toEqual({ pedido: 0, cotizacion: 0, borrador: 0 });
  });

  it("🩸 los conteos salen de las filas QUE SE VEN, no de una segunda lista", () => {
    // 43 pedidos vivos y 67 borrados en la tabla: contar contra `orders` daría
    // 110. `contarComprobantes` recibe la MISMA lista que se pinta y no consulta
    // nada — el chip no puede desincronizarse de la tabla.
    const c = contarComprobantes(FILAS);
    expect(c.pedido + c.cotizacion + c.borrador).toBe(FILAS.length);
    expect(contarComprobantes(FILAS.slice(0, 3)).pedido + contarComprobantes(FILAS.slice(0, 3)).cotizacion).toBe(3);
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
