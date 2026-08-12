// ============================================================================
// CANDADO — el inicio de Marketing tiene que ENSEÑAR el proyecto que existe.
//
// 🩸 El bug (11-ago-2026): Daniel creó el proyecto "Apertura" para
// Nova Lux, S.a., le registró una entrega de muebles de $1.040 asignada a
// Calvin Klein y CERO facturas. El proyecto no aparecía en ninguna parte del
// inicio. Textual: *"puse generar un proyecto nuevo y no lo veo en calvin
// klein… no veo nova lux, dónde lo encuentro?"*. Las tarjetas de marca y el
// filtro de la lista se armaban SOLO desde `mk_factura_marcas`.
//
// Lo que este archivo defiende:
//   1. Una entrega de muebles mete al proyecto en la tarjeta de SU marca.
//   2. Los montos de FACTURAS por marca no se movieron ni un centavo: los
//      muebles van en su propio bucket, nunca sumados encima.
//   3. El contador de la tarjeta cuenta el MISMO conjunto que abre la lista
//      (barrido estático: `proyectos-lista` tiene que usar el módulo puro).
//   4. Multifashion y el archivo Tommy/Calvin siguen separados como estaban.
//
// Los números de los casos "producción" son los MEDIDOS el 11-ago-2026 contra
// la base real, no inventados.
// ============================================================================
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  agregarResumenInicio,
  marcasDeEntrega,
  marcasDeProyecto,
  porcionEntregaParaMarca,
  type EntradaResumen,
} from "@/lib/marketing/resumen-inicio";

// --- Catálogo de marcas, tal cual producción -------------------------------
const TH = "1673d8a7-582c-4568-8608-34c88b4b6ec6";
const CK = "6dc27cc7-c061-440e-9dc9-915198852a47";
const J = "4ae69377-2426-45fe-8a18-d7466c5e9781";
const MARCAS = [
  { id: TH, empresa_codigo: "fashion_wear" },
  { id: CK, empresa_codigo: "vistana" },
  { id: J, empresa_codigo: "joystep" },
];

function correr(p: Partial<EntradaResumen>) {
  return agregarResumenInicio({
    facturas: [],
    facturaMarcas: [],
    entregas: [],
    marcas: MARCAS,
    proyectosVivos: new Set<string>(),
    proyectosMultifashion: new Set<string>(),
    ...p,
  });
}

describe("Nova Lux — un proyecto SOLO con entrega de muebles", () => {
  const NOVA = "f0c57078-281c-4e34-8225-106eda59dce7";
  const base = {
    entregas: [
      { proyecto_id: NOVA, total: 1040, total_por_marca: { [CK]: 1040 } },
    ],
    proyectosVivos: new Set([NOVA]),
  };

  it("aparece en la tarjeta de Calvin Klein", () => {
    const r = correr(base);
    expect(r.proyectosPorMarca[CK]).toBe(1);
  });

  it("sus $1.040 se ven, pero como MUEBLES, no como facturas", () => {
    const r = correr(base);
    expect(r.mueblesPorMarca[CK]).toEqual({ count: 1, total: 1040 });
    expect(r.porMarca[CK]).toBeUndefined();
  });

  it("no se cuela en las otras marcas", () => {
    const r = correr(base);
    expect(r.proyectosPorMarca[TH]).toBeUndefined();
    expect(r.mueblesPorMarca[TH]).toBeUndefined();
  });
});

describe("los montos de FACTURAS no cambian por sumar entregas", () => {
  // Reparto real: una factura de $1.000 al 50/50 entre Tommy y Calvin.
  const facturas = [
    { id: "f1", proyecto_id: "p1", total: 1000 },
  ];
  const facturaMarcas = [
    { factura_id: "f1", marca_id: TH, porcentaje: 50 },
    { factura_id: "f1", marca_id: CK, porcentaje: 50 },
  ];
  const proyectosVivos = new Set(["p1"]);

  it("sin entregas da el reparto de siempre", () => {
    const r = correr({ facturas, facturaMarcas, proyectosVivos });
    expect(r.porMarca[TH]).toEqual({ count: 1, total: 500 });
    expect(r.porMarca[CK]).toEqual({ count: 1, total: 500 });
  });

  it("CON entregas gigantes encima, `porMarca` sigue IDÉNTICO", () => {
    const r = correr({
      facturas,
      facturaMarcas,
      proyectosVivos,
      entregas: [
        {
          proyecto_id: "p1",
          total: 40565,
          total_por_marca: { [TH]: 40565 },
        },
      ],
    });
    expect(r.porMarca[TH]).toEqual({ count: 1, total: 500 });
    expect(r.porMarca[CK]).toEqual({ count: 1, total: 500 });
    // …y los muebles viven aparte.
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 1, total: 40565 });
  });
});

describe("los pagos de impulsadora suman plata pero NO son un proyecto", () => {
  it("factura suelta (proyecto_id null) no levanta el contador", () => {
    const r = correr({
      facturas: [
        { id: "f1", proyecto_id: null, total: 800, impulsadora_id: "i1" },
      ],
      facturaMarcas: [{ factura_id: "f1", marca_id: CK, porcentaje: 100 }],
    });
    expect(r.porMarca[CK]).toEqual({ count: 1, total: 800 });
    expect(r.impulsadoraPorMarca[CK]).toEqual({ count: 1, total: 800 });
    expect(r.proyectosPorMarca[CK]).toBeUndefined();
  });
});

describe("el archivo Tommy/Calvin y Multifashion siguen separados", () => {
  it("una factura legacy va al archivo y NO a la tarjeta de marca", () => {
    const r = correr({
      facturas: [
        { id: "f1", proyecto_id: "p1", total: 300, grupo_legacy: true },
      ],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.legacy).toEqual({ count: 1, total: 300 });
    expect(r.porMarca[TH]).toBeUndefined();
  });

  it("pero la ENTREGA de ese mismo proyecto sí entra en la marca", () => {
    // Medido: 11 de los 22 proyectos con entrega tienen además facturas
    // legacy. El archivo cuenta solo facturas legacy; la marca, solo
    // no-legacy + entregas → no hay doble conteo de plata en ningún lado.
    const r = correr({
      facturas: [
        { id: "f1", proyecto_id: "p1", total: 300, grupo_legacy: true },
      ],
      facturaMarcas: [{ factura_id: "f1", marca_id: TH, porcentaje: 100 }],
      entregas: [
        { proyecto_id: "p1", total: 3080, total_por_marca: { [TH]: 3080 } },
      ],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.legacy).toEqual({ count: 1, total: 300 });
    expect(r.proyectosPorMarca[TH]).toBe(1);
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 1, total: 3080 });
  });

  it("las entregas de un proyecto Multifashion NO tocan las marcas", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "mf", total: 500, total_por_marca: { [CK]: 500 } },
      ],
      proyectosVivos: new Set(["mf"]),
      proyectosMultifashion: new Set(["mf"]),
    });
    expect(r.mueblesPorMarca[CK]).toBeUndefined();
    expect(r.proyectosPorMarca[CK]).toBeUndefined();
    expect(r.multifashion.entregas).toBe(1);
    expect(r.multifashion.muebles).toBe(500);
  });
});

describe("bordes del dato", () => {
  it("una marca con monto 0 en la entrega no mete al proyecto en su tarjeta", () => {
    const r = correr({
      entregas: [
        {
          proyecto_id: "p1",
          total: 100,
          total_por_marca: { [TH]: 100, [CK]: 0 },
        },
      ],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.proyectosPorMarca[TH]).toBe(1);
    expect(r.proyectosPorMarca[CK]).toBeUndefined();
  });

  it("una entrega sin proyecto vivo se ignora del todo", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "borrado", total: 999, total_por_marca: { [TH]: 999 } },
        { proyecto_id: null, total: 999, total_por_marca: { [TH]: 999 } },
      ],
      proyectosVivos: new Set<string>(),
    });
    expect(r.mueblesPorMarca[TH]).toBeUndefined();
    expect(r.mobiliario).toEqual({ entregas: 0, total: 0 });
  });

  it("el mismo proyecto con dos entregas cuenta UNA vez como proyecto", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "p1", total: 100, total_por_marca: { [TH]: 100 } },
        { proyecto_id: "p1", total: 200, total_por_marca: { [TH]: 200 } },
      ],
      proyectosVivos: new Set(["p1"]),
    });
    expect(r.proyectosPorMarca[TH]).toBe(1);
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 2, total: 300 });
  });

  it("el 'otro 50%' de la empresa interna suma a la porción de la marca", () => {
    const e = {
      proyecto_id: "p1",
      total: 200,
      total_por_marca: { [TH]: 100 },
      total_por_empresa_interna: { fashion_wear: 100 },
    };
    expect(porcionEntregaParaMarca(e, TH, "fashion_wear")).toBe(200);
    const r = correr({ entregas: [e], proyectosVivos: new Set(["p1"]) });
    expect(r.mueblesPorMarca[TH]).toEqual({ count: 1, total: 200 });
  });

  it("marcasDeEntrega solo devuelve las marcas con plata", () => {
    expect(
      marcasDeEntrega({
        proyecto_id: "p",
        total: 1,
        total_por_marca: { [TH]: 5, [CK]: 0, [J]: -3 },
      }),
    ).toEqual([TH]);
    expect(
      marcasDeEntrega({ proyecto_id: "p", total: 1, total_por_marca: null }),
    ).toEqual([]);
  });

  it("marcasDeProyecto une facturas y entregas sin repetir", () => {
    expect(
      [...marcasDeProyecto({ porFacturas: [TH, CK], porEntregas: [CK, J] })].sort(),
    ).toEqual([TH, CK, J].sort());
  });
});

describe("mobiliario global (la tarjeta de Herramientas)", () => {
  it("cuenta TODAS las entregas de proyectos vivos, Multifashion incluida", () => {
    const r = correr({
      entregas: [
        { proyecto_id: "p1", total: 100, total_por_marca: { [TH]: 100 } },
        { proyecto_id: "mf", total: 400, total_por_marca: { [CK]: 400 } },
      ],
      proyectosVivos: new Set(["p1", "mf"]),
      proyectosMultifashion: new Set(["mf"]),
    });
    expect(r.mobiliario).toEqual({ entregas: 2, total: 500 });
  });
});

// ---------------------------------------------------------------------------
// BARRIDOS ESTÁTICOS — la tarjeta y la lista no pueden divergir.
// ---------------------------------------------------------------------------
const SRC = path.join(process.cwd(), "src");
const leer = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

describe("barrido estático", () => {
  it("proyectos-lista usa el MISMO módulo puro que la tarjeta", () => {
    // Si la lista escribiera su propia regla de "marca de una entrega", la
    // tarjeta podría decir "11 proyectos" y la lista enseñar 10 — que se lee
    // como si un proyecto se hubiera borrado.
    const src = leer("app/api/marketing/proyectos-lista/route.ts");
    expect(src).toContain('from "@/lib/marketing/resumen-inicio"');
    expect(src).toContain("marcasDeEntrega");
    expect(src).toContain("porcionEntregaParaMarca");
    // Y la entrega tiene que alimentar el bucket de marca, no solo el
    // desglose. El `^\s*` es a propósito: comentar la línea NO cuenta como
    // que sigue ahí (una mutación real que un `toContain` dejaba pasar).
    expect(src).toMatch(/^\s*nonLegacy\.add\(mid\);/m);
    expect(src).toMatch(/^\s*nonLegacyMarcasByProy\.set\(pid, nonLegacy\);/m);
  });

  it("marca-resumen no reescribe la cuenta a mano", () => {
    const src = leer("app/api/marketing/marca-resumen/route.ts");
    expect(src).toContain("agregarResumenInicio");
  });

  it("el bloque de la marca NO funde facturas y muebles en un solo monto", () => {
    // Los muebles eran $71.765 que no se contaban en ninguna tarjeta; fundirlos
    // en el mismo `$` sin decirlo triplicaba el número que Daniel ya conoce.
    // Ahora hay un "Total a reportar" —que es lo que se le manda al encargado
    // de la marca— pero las dos líneas que lo componen se siguen viendo.
    const src = leer("app/marketing/components/InicioMarketing.tsx");
    expect(src).toContain('etiqueta="Facturas"');
    expect(src).toContain('etiqueta="Mobiliario"');
    // Y el total NO se calcula acá: viene ya sumado del módulo puro.
    expect(src).not.toMatch(/facturas\.total\s*\+\s*muebles\.total/);
    expect(src).not.toMatch(/muebles\.total\s*\+\s*facturas\.total/);
    expect(src).toMatch(/formatearMonto\(b\.total\)/);
  });

  it("Multifashion es UN BLOQUE MÁS, y no se le reporta a nadie", () => {
    // Antes era un caso especial con su propio enlace suelto. Ahora es un
    // bloque igual que los demás, pero SIN período y SIN botón de cerrar:
    // es tienda propia, no hay marca a quien mandarle nada.
    const src = leer("app/marketing/components/InicioMarketing.tsx");
    expect(src).toContain("Tienda propia · sin período");
    expect(src).toMatch(
      /SIN_REPORTE\s*=\s*new Set<string>\(\[MULTIFASHION_KEY, SIN_BLOQUE\]\)/,
    );
    expect(src).toMatch(/const sinReporte = SIN_REPORTE\.has\(b\.key\)/);
    // El período y el botón de cerrar dependen de NO ser uno de esos bloques.
    expect(src).toMatch(/!sinReporte && datos\.conPeriodos/);
  });

  it("EL BLOQUE ES LA MARCA — el proveedor no se dibuja en ningún lado", () => {
    // 🔑 Daniel: *"ellos facturan a mi bajo compañia diferentes. una por marca.
    // cada marca tiene su encargado"*. El agrupador intermedio desapareció de
    // la pantalla; que vuelva a asomarse en un texto sería enseñar de nuevo una
    // entidad que ya no existe para el negocio.
    const src = leer("app/marketing/components/InicioMarketing.tsx");
    // Ni en los textos que ve el usuario ni en el nombre de los props. Los
    // COMENTARIOS sí pueden nombrarlo: explicar por qué se fue es justamente
    // lo que evita que alguien lo reponga sin querer.
    const sinComentarios = src
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
      .join("\n");
    expect(sinComentarios).not.toMatch(/proveedor/i);
    expect(src).toContain("onSelectBloque");
    // El nombre del bloque sale del módulo puro, no de una tabla escrita acá.
    expect(src).toContain('from "@/lib/marketing/bloques"');
    expect(src).toContain("nombreDeBloque");
    expect(src).not.toMatch(/["'](?:TH|CK|KL|RBK)["']\s*:/);
  });

  it("⛔ el cierre conjunto NO existe: cada marca cierra sola con su botón", () => {
    // Daniel, textual (11-ago-2026): *"que sea por separado mejor no?"*. La
    // cabecera "Tommy · Calvin · Karl se cierran juntas" y el atajo "Cerrar
    // las tres" se retiraron; que vuelvan a asomarse sería revivir un camino
    // que el negocio ya descartó.
    // Los COMENTARIOS sí pueden nombrarlo: explicar por qué se fue es
    // justamente lo que evita que alguien lo reponga sin querer.
    const sinComentarios = (src: string) =>
      src
        .split("\n")
        .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*"))
        .join("\n");
    const src = sinComentarios(leer("app/marketing/components/InicioMarketing.tsx"));
    expect(src).not.toMatch(/Cerrar las tres/);
    expect(src).not.toMatch(/se cierran juntas/);
    expect(src).not.toMatch(/esCabezaDeGrupo|grupoCierreDeMarca/);
    expect(src).not.toMatch(/PVH/);
    // El botón de cerrar de CADA marca sigue vivo.
    expect(src).toMatch(/setCerrando\(b\)/);

    // Y el modal solo conoce el cierre de UNA marca.
    const modal = sinComentarios(leer("app/marketing/components/CerrarPeriodoModal.tsx"));
    expect(modal).not.toMatch(/cerrar-grupo/);
    expect(modal).toContain("/cerrar");
  });

  it("el aviso de lo que falta son DOS papeles, y con 0 y 0 no se dibuja", () => {
    // 🔴 Daniel, textual: *"pero impulsadora tambien necesita comprobante, pero
    // no foto. aunq el comprobante sea una foto"*. Son dos cosas distintas y
    // confundirlas manda un reporte sin respaldo o pide una foto que nunca
    // existió. Y un aviso que dice "todo bien" es ruido: con los dos en cero no
    // se dibuja NADA.
    const inicio = leer("app/marketing/components/InicioMarketing.tsx");
    expect(inicio).toMatch(
      /if \(sinComprobante <= 0 && sinFoto <= 0\) return null;/,
    );
    expect(inicio).toContain("sin comprobante");
    expect(inicio).toContain("sin foto");
    // Los contadores VIENEN del API; no se recuentan en la pantalla.
    expect(inicio).toMatch(/b\.sinComprobante \?\? 0/);
    expect(inicio).toMatch(/b\.sinFoto \?\? 0/);

    // Y el modal de cierre avisa ANTES de confirmar, con lo ya contado por
    // bloque — nunca recontando.
    const modal = leer("app/marketing/components/CerrarPeriodoModal.tsx");
    expect(modal).toMatch(/sinComprobante: bloque\.sinComprobante \?\? 0/);
    expect(modal).toMatch(/sinFoto: bloque\.sinFoto \?\? 0/);
    expect(modal).toContain("Antes de cerrar, fíjate");
    // Puede cerrar igual: el botón no se apaga por tener pendientes.
    expect(modal).toMatch(
      /const puedeCerrar = nombreSiguiente\.trim\(\)\.length > 0 && !cerrando;/,
    );
  });

  it("los ZIP se bajan DE A UNO — nada de descargas múltiples", () => {
    // Safari en iPhone bloquea la segunda y la tercera descarga de una ráfaga,
    // así que un "bajar todos" se vería como que el sistema perdió archivos.
    const src = leer("app/marketing/components/InicioMarketing.tsx");
    expect(src).toContain("/api/marketing/zip-marca");
    // Un solo fetch por clic: ni bucles ni Promise.all sobre el endpoint.
    expect(src).not.toMatch(/Promise\.all[\s\S]{0,200}zip-marca/);
    expect(src).not.toMatch(/for \([\s\S]{0,200}zip-marca/);
    // Sin periodoId = la marca hoy; con periodoId = un período ya cerrado.
    expect(src).toMatch(/periodoId \? \{ marcaCodigo, periodoId \} : \{ marcaCodigo \}/);
  });

  it("la puerta única reemplazó al paso de crear un proyecto", () => {
    // Daniel: *"¿alguna vez creas un proyecto antes de tener un gasto?"* →
    // *"no"*. 18 de los 22 proyectos se llaman literalmente "Remodelacion".
    const inicio = leer("app/marketing/components/InicioMarketing.tsx");
    expect(inicio).toContain("+ Registrar gasto");
    expect(inicio).not.toMatch(/Nuevo proyecto/);
    const page = leer("app/marketing/page.tsx");
    expect(page).toContain("RegistrarGastoModal");
    expect(page).not.toMatch(/NuevoProyectoModal/);
  });

  it("el gasto SIN cliente no inventa un proyecto", () => {
    // `mk_proyectos` se conserva por debajo como contenedor y los 22 proyectos
    // actuales no se tocan — lo que se fue es el PASO. Sin cliente el gasto va
    // con `proyecto_id = null`, como ya viven los pagos de impulsadora.
    const src = leer("app/marketing/components/RegistrarGastoModal.tsx");
    expect(src).toMatch(/if \(!nombre\) return null;/);
    expect(src).toMatch(/proyectoId: proyecto\?\.id \?\? null/);
    // Con cliente: se busca el proyecto del cliente y solo si no hay se crea.
    // Desde el 11-ago-2026 se busca entre TODOS los vivos, sin `?estado=`:
    // "Cerrar proyecto" se retiró y filtrar por estado crearía un proyecto
    // duplicado para un cliente cuyo proyecto quedó en un estado legacy.
    expect(src).toContain('fetch("/api/marketing/proyectos"');
    expect(src).not.toContain("estado=abierto");
    // El pareo va PRIMERO por código del directorio — así los clientes
    // duplicados (D-87, D-25) caen en el mismo proyecto y se ven fusionados.
    expect(src).toMatch(/codigo\s*\n?\s*\? \(p\.tienda_codigo \?\? ""\) === codigo/);
  });

  it("UNA marca por gasto — nada de repartos en la puerta", () => {
    const src = leer("app/marketing/components/RegistrarGastoModal.tsx");
    expect(src).toMatch(/marcaId \? \[\{ marcaId, porcentaje: 100 \}\] : undefined/);
    expect(src).toContain("marcaFija");
    // Con la marca ya elegida, el formulario no vuelve a preguntarla.
    const form = leer("components/marketing/FacturaForm.tsx");
    expect(form).toMatch(/if \(marcaFija\) return \[\{ marcaId: marcaFija\.id, porcentajeStr: "100" \}\];/);
  });

  it("LA FOTO NO SE LIMITA POR TIPO DE GASTO", () => {
    // 🔴 Daniel, textual: *"te dije que no limites subir fotos de impulsadora
    // porque si hago un evento y quiero subir fotos del evento me lo va a
    // limitar, todo el modulo tiene que tener sentido"*. El botón está vivo en
    // los TRES caminos y con o sin cliente. Lo único que distingue a las
    // impulsadoras es el AVISO del cierre, que silencia un aviso — no apaga un
    // botón.
    const src = leer("app/marketing/components/RegistrarGastoModal.tsx");
    // El bloque de la foto está FUERA del if/else que separa los caminos.
    const bloqueFoto = src.indexOf("Subir foto");
    const finCondicional = src.indexOf("camino === \"impulsadora\" ? (");
    expect(bloqueFoto).toBeGreaterThan(finCondicional);
    expect(src).not.toMatch(/camino !== "impulsadora"[\s\S]{0,120}foto/i);
    // Y el pago de impulsadora la recibe y la sube.
    const pago = leer("app/marketing/components/RegistrarPagoModal.tsx");
    expect(pago).toContain("fotoOpcional");
    expect(pago).toMatch(/impulsadoraId: impulsadora\.id/);
  });

  it("sin la migración de períodos NO se dibuja píldora ni botón de cerrar", () => {
    // `conPeriodos: false` significa que las tablas todavía no existen. No es
    // un error y no se le muestra al usuario como tal: los números son los
    // mismos, pero no hay período al que atarlos ni nada que cerrar.
    const src = leer("app/marketing/components/InicioMarketing.tsx");
    expect(src).toMatch(/const periodo =\s*\n?\s*!sinReporte && datos\.conPeriodos \? b\.periodoAbierto : null;/);
    expect(src).toMatch(/const puedeCerrar =\s*\n?\s*!sinReporte && datos\.conPeriodos && !sinGasto && !!b\.periodoAbierto\?\.id;/);
  });

  it("un bloque sin gasto no ofrece cerrar un período vacío", () => {
    const src = leer("app/marketing/components/InicioMarketing.tsx");
    expect(src).toContain("Todavía no hay gasto en este período.");
    expect(src).toMatch(
      /const sinGasto = b\.facturas\.count === 0 && b\.muebles\.count === 0;/,
    );
  });

  it("la ficha del proyecto deriva sus marcas de los DOCUMENTOS", () => {
    // `mk_proyecto_marcas` está casi vacía (3 de 22 proyectos vivos, medido
    // 11-ago-2026; Nova Lux tiene cero). Leer solo esa tabla habría dejado el
    // bloque "Marcas" en blanco justo en el proyecto que originó el arreglo.
    const src = leer("app/marketing/components/ProyectoOverlay.tsx");
    expect(src).toContain("marcasDelProyecto");
    expect(src).toMatch(/total_por_marca/);
    expect(src).toMatch(/f\.marcas/);
    expect(src).toContain("no está duplicado");
  });

  it("Mobiliario e Impulsadoras se abren desde el inicio", () => {
    const src = leer("app/marketing/components/InicioMarketing.tsx");
    expect(src).toMatch(/onClick=\{onOpenInventario\}/);
    expect(src).toMatch(/onClick=\{onOpenImpulsadoras\}/);
  });

  it("proyectos-lista NO escribe un segundo mapa de marca → bloque", () => {
    // El reparto vive en UN solo lugar (`lib/marketing/bloques.ts`). Dos
    // copias es exactamente cómo un bloque termina diciendo "15 proyectos" y
    // su lista enseñando 12 — o peor, mandándole a Tommy una marca de Reebok.
    const src = leer("app/api/marketing/proyectos-lista/route.ts");
    expect(src).toContain('from "@/lib/marketing/bloques"');
    expect(src).toContain("indiceBloquePorMarcaId");
    // Nada de códigos de marca escritos a mano en la ruta.
    expect(src).not.toMatch(/["'](?:TH|CK|KL|RBK)["']\s*:/);
  });
});
