// ─────────────────────────────────────────────────────────────────────────────
// LOS TRES MÓDULOS SE ENLAZAN, PERO NO SE FUSIONAN (5-sep-2026).
//
// 🔴 Cuentas por Cobrar (`/cxc`) y Ventas › Clientes NO SE TOCARON: cada lista
// es un trabajo distinto —cobrar · analizar la venta · arreglar los datos— y
// juntarlas habría dado una pantalla que no sirve para ninguno. Lo que se
// unificó es la PÁGINA a la que se llega al tocar el nombre de un cliente:
// `/clientes/[codigo]`, la única superficie sobre un cliente que abren todos
// los roles (solo admin ve Ventas; bodega no ve Cuentas por Cobrar).
//
// Este archivo vigila los enlaces que las cosen y las puertas que no se abren.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { clienteParaCobrar } from "@/lib/clientes/cliente-para-cobrar";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const sinComentarios = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n").map((l) => l.replace(/(^|[^:])\/\/.*$/, "$1")).join("\n");

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 EL QUE YA NO ESTÁ EN SWITCH NO SALE EN LA LISTA NI EN LA BÚSQUEDA", () => {
  // Daniel: «si en switch no esta, aqui no debe de aparecer». Hoy son dos:
  // D-30 (City Moda Chorrera) y D-135 (Rey Store).
  it("la lista entra por la puerta SIN pedir los ausentes", () => {
    const src = sinComentarios(leer("src/app/clientes/page.tsx"));
    expect(src).toContain("leerClientesDelGrupo(");
    // El default de esa puerta es «solo lo que se puede ofrecer»: pedir de más
    // tiene que ser una decisión escrita, y acá no se pide.
    expect(src).not.toContain("incluirAusentes");
  });

  it("la búsqueda global tampoco los ofrece", () => {
    const src = sinComentarios(leer("src/app/api/search/route.ts"));
    expect(src).toContain('.is("ausente_desde", null)');
  });

  it("⚠️ PERO su ficha sigue abriendo, y lo dice con fecha", () => {
    // Sus guías y facturas viejas apuntan a ellos por código: esconderlos de la
    // lista y borrarlos son dos cosas distintas.
    const ficha = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    expect(ficha).toContain("textoYaNoEstaEnSwitch");
    // La página NO rechaza a un ausente: el único 404 es el de mundo (Boston).
    const pagina = sinComentarios(leer("src/app/clientes/[codigo]/page.tsx"));
    expect(pagina).toContain("soloClientesDelGrupo");
    expect(pagina).not.toMatch(/ausente_desde[\s\S]{0,80}notFound/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 BOSTON CONTESTA 404, NO 403", () => {
  it("la ficha usa la MISMA puerta de mundo de siempre", () => {
    const src = sinComentarios(leer("src/app/clientes/[codigo]/page.tsx"));
    // 🩸 NO ALCANZA CON QUE EL NOMBRE APAREZCA: está también en el `import`, así
    // que borrar la guarda entera dejaba el candado en verde. Se exige la
    // LLAMADA, y que termine en `notFound()`.
    expect(src).toMatch(/soloClientesDelGrupo\(\[cliente\][\s\S]{0,120}notFound\(\)/);
    expect(src).toContain("mundosDeClientes()");
    // Un 403 diferenciado sería un oráculo: confirmaría desde afuera qué
    // códigos existen en la cartera de Boston.
    expect(src).not.toContain("403");
  });

  it("la ruta por dirección también, y sin cambiar", () => {
    const src = sinComentarios(leer("src/app/api/clientes/[codigo]/route.ts"));
    expect(src).toContain("esCodigoDelGrupo");
    expect(src).toContain('{ status: 404 }');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("«Ver en Ventas ›» — el parámetro que Ventas tuvo que aprender", () => {
  const VENTAS = leer("src/components/ventas/ClientesView.tsx");

  it("la ficha manda el CÓDIGO, no el nombre", () => {
    // La identidad del cliente es el código: `D-24` es City Mall en las 6
    // empresas. Pasar el nombre sería atar por parecido.
    const ficha = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    expect(ficha).toContain("/ventas?tab=clientes&cliente=${encodeURIComponent(cliente.codigo)}");
  });

  it("Ventas lo lee y preselecciona a ese cliente", () => {
    expect(VENTAS).toContain('get("cliente")');
    expect(VENTAS).toContain("useState(() => codigoDeLaUrl())");
  });

  it("y RESALTA su fila, sin esconder a los demás", () => {
    expect(VENTAS).toContain('aria-current={resaltado ? "true" : undefined}');
    expect(VENTAS).toContain("resaltado={!!resaltado && c.id === resaltado}");
  });

  it("⚠️ se lee UNA sola vez, al montar: de ahí en más manda el buscador", () => {
    // Re-aplicarlo en cada render haría que borrar la búsqueda a mano volviera
    // a escribir el código, y la pantalla se pelearía con quien la usa.
    expect(VENTAS).not.toMatch(/useEffect\([^)]*setSearch\(codigoDeLaUrl/);
  });

  it("⚠️ y NADA MÁS de esa pantalla cambió: sigue sin depender de la ficha", () => {
    // El resto de Ventas › Clientes se queda como está — es otro trabajo.
    expect(VENTAS).not.toContain("clientes/ficha");
    expect(VENTAS).toContain('href={`/clientes/${encodeURIComponent(c.id)}`}');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("«Cobrar» reusa la hoja del CXC — no se dibuja una segunda", () => {
  const COBRAR = leer("src/app/clientes/[codigo]/CobrarEnFicha.tsx");

  it("importa los DOS componentes del CXC, no unos propios", () => {
    expect(COBRAR).toContain('from "@/app/cxc/components/HojaCobrar"');
    expect(COBRAR).toContain('from "@/app/cxc/components/EstadoCuentaDrawer"');
  });

  it("el correo conserva su DESHACER de 5 segundos", () => {
    // El POST real ocurre recién al vencer el plazo: «Deshacer» no cancela un
    // correo que ya salió, impide que salga.
    expect(COBRAR).toContain("useUndoAction");
    expect(COBRAR).toContain("scheduleAction({");
    expect(COBRAR).toContain("UndoToast");
  });

  it("🔴 el mensaje que lee el CLIENTE no dice «vencido»", () => {
    // `dias` es la EDAD del documento desde su emisión, no días de mora: no
    // sabemos el plazo de crédito de cada factura. Es la misma regla del correo
    // de estado de cuenta.
    // 🩸 SIN LOS COMENTARIOS: este archivo EXPLICA la regla y por lo tanto
    // nombra la palabra prohibida. Con el archivo entero, el candado se caza a
    // sí mismo y no mira una sola línea de código.
    const codigo = sinComentarios(COBRAR);
    expect(codigo.toLowerCase()).not.toContain("vencid");
  });

  it("🔴 el CXC no se tocó: sigue teniendo su propia hoja y su propio cajón", () => {
    const cxc = leer("src/app/cxc/page.tsx");
    expect(cxc).toContain("<HojaCobrar");
    expect(cxc).toContain("<EstadoCuentaDrawer");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 «ÚLTIMOS PAGOS» REUSA EL AGRUPADOR DEL CXC", () => {
  it("la ficha importa `agruparPagosPorFecha`, no escribe otro", () => {
    // Dos agrupadores son dos que un día dicen cosas distintas sobre la misma
    // plata. El del CXC ya existía.
    const src = leer("src/lib/clientes/ficha-datos.ts");
    expect(src).toContain('from "@/lib/cxc/pagos-por-fecha"');
    expect(src).toContain("agruparPagosPorFecha(");
    expect(src).not.toContain("function agruparPagos");
  });

  it("y la pantalla usa el mismo formateador de fecha corta", () => {
    const src = leer("src/app/clientes/[codigo]/ClienteDetail.tsx");
    expect(src).toContain("fechaCortaPago");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("🔴 LA HOJA «COBRAR» SE ARMA CON LO QUE LA FICHA YA TIENE", () => {
  const DATOS = {
    codigo: "D-25",
    nombre: "City Mall Paso Canoa",
    email: "contabilidad@citymall.com.pa",
    telefono: "727-7247",
    celular: "727-7247",
    contacto: "Narimy",
  };

  it("🔴 el CÓDIGO viaja en TODAS las empresas", () => {
    // `HojaCobrar` y `EstadoCuentaDrawer` lo sacan con
    // `Object.values(companies).find(c => c?.codigo)`: una entrada sin código
    // haría que el cajón pidiera el estado de cuenta de `null`.
    const c = clienteParaCobrar(DATOS, [
      { company_key: "vistana", total: 300_000, d0_30: 300_000 },
      { company_key: "fashion_wear", total: 80_000, d121_180: 80_000 },
    ]);
    const codigos = Object.values(c.companies).map((e) => e.codigo);
    expect(codigos.length).toBeGreaterThan(0);
    expect(codigos.every((x) => x === "D-25")).toBe(true);
  });

  it("🔴 una fila que no es de las 6 NO entra (Boston comparte tabla)", () => {
    const c = clienteParaCobrar(DATOS, [
      { company_key: "vistana", total: 100, d0_30: 100 },
      { company_key: "confecciones_boston", total: 999_999, d0_30: 999_999 },
      { company_key: "american_classic", total: 12_345, d0_30: 12_345 },
    ]);
    expect(Object.keys(c.companies)).toEqual(["vistana"]);
    expect(c.total).toBe(100);
    expect(c.current).toBe(100);
  });

  it("los tramos son los MISMOS del CXC: 0-90 · 91-120 · 121+", () => {
    const c = clienteParaCobrar(DATOS, [{
      company_key: "vistana", total: 100,
      d0_30: 10, d31_60: 20, d61_90: 30, d91_120: 15,
      d121_180: 5, d181_270: 10, d271_365: 5, mas_365: 5,
    }]);
    expect(c.current).toBe(60);
    expect(c.watch).toBe(15);
    expect(c.overdue).toBe(25);
    expect(c.total).toBe(100);
  });

  it("sin una sola fila de aging la hoja igual puede abrirse, con el código", () => {
    const c = clienteParaCobrar(DATOS, []);
    expect(Object.keys(c.companies).sort()).toEqual([...B2B_EMPRESA_KEYS].sort());
    expect(Object.values(c.companies).every((e) => e.codigo === "D-25" && e.total === 0)).toBe(true);
    expect(c.total).toBe(0);
  });

  it("el contacto viaja: el mensaje saluda por su nombre", () => {
    expect(clienteParaCobrar(DATOS, []).contacto).toBe("Narimy");
    expect(clienteParaCobrar({ ...DATOS, contacto: null }, []).contacto).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe("⚠️ `db-max-rows` = 1000 y corta EN SILENCIO", () => {
  it("las dos lecturas grandes de la ficha van paginadas", () => {
    // Medido el 5-sep-2026: D-25 tiene **921 facturas en dos años** — a un pelo
    // del corte, y el año que viene lo pasa.
    const src = leer("src/lib/clientes/ficha-datos.ts");
    expect(src).toContain("leerTodoPaginado");
    expect((src.match(/leerTodoPaginado</g) ?? []).length).toBeGreaterThanOrEqual(2);
    // Con orden ESTABLE, que es lo que hace que la paginación no repita ni
    // se salte filas.
    expect((src.match(/\.order\("id", \{ ascending: true \}\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
  });
});
