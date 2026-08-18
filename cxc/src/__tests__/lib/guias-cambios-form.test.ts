/**
 * "¿De verdad cambió algo?" — el módulo PURO que reemplazó al contador de renders.
 *
 * El bug que estos casos existen para que no vuelva: el formulario decidía que
 * estaba sucio contando cuántas veces había corrido un `useEffect`, así que
 * TERMINAR DE CARGAR LOS DATOS contaba como cambio y a los 1,5 s salía un
 * `PUT /api/guias/[id]` — que REEMPLAZA los renglones (los borra e inserta otros
 * con ids nuevos). Abrir la pantalla y arrepentirse le cambiaba el id a cada
 * línea.
 *
 * Acá se prueba la regla nueva: cambió = lo que se mandaría es DISTINTO de lo
 * último que el servidor tiene. La conducta (que abrir no escriba) vive en
 * `components/guias-editar-no-guarda-sola.test.tsx`, porque un test de función
 * pura no puede ver una petición de red.
 */
import { describe, it, expect } from "vitest";
import {
  hayCambios,
  instantaneaCabecera,
  instantaneaGuia,
  instantaneaRenglones,
  renglonesCambiaron,
  renglonTieneAlgo,
} from "@/lib/guias/cambios-form";

// Los renglones REALES de GT-204 (producción, 17-ago-2026), tal como los
// devuelve `GET /api/guias/[id]`: con `cliente_codigo` puesto y el N° del
// transportista en "0".
const CABECERA = {
  fecha: "2026-08-17",
  modoEntrega: "transportista",
  transportistaId: "9249cb14-442d-41ca-aec3-32fe8ab7abfa",
  entregadoPor: "Rodrigo",
  observaciones: "",
  numeroGuiaTransp: "0",
};
const RENGLONES = [
  { cliente: "Sportsam Centro Atletico", cliente_codigo: "D-143", direccion: "David", empresa: "Fashion Wear", facturas: "3183", bultos: 3, numero_guia_transp: "0" },
  { cliente: "City Mall David", cliente_codigo: "D-24", direccion: "David", empresa: "Fashion Wear", facturas: "3192, 3193", bultos: 9, numero_guia_transp: "0" },
  { cliente: "Jerusalem De Panama", cliente_codigo: "D-80", direccion: "Paso Canoas", empresa: "Fashion Shoes", facturas: "2492", bultos: 20, numero_guia_transp: "0" },
];

describe("cargar la guía NO es un cambio", () => {
  it("la misma guía contra sí misma no tiene cambios", () => {
    const cargada = instantaneaGuia(CABECERA, RENGLONES);
    const actual = instantaneaGuia(CABECERA, RENGLONES);
    expect(hayCambios(cargada, actual)).toBe(false);
    expect(renglonesCambiaron(cargada, actual)).toBe(false);
  });

  it("dos objetos DISTINTOS con los mismos datos tampoco", () => {
    // Es el caso exacto del formulario: lo que se carga se copia a `useState`
    // (`{...item, uid, orden}`), así que la identidad del objeto cambia SIEMPRE.
    // Comparar por referencia habría dado "cambió" en cada carga.
    const cargada = instantaneaGuia({ ...CABECERA }, RENGLONES.map((r) => ({ ...r })));
    const actual = instantaneaGuia({ ...CABECERA }, RENGLONES.map((r) => ({ ...r, uid: "x", orden: 9 } as never)));
    expect(hayCambios(cargada, actual)).toBe(false);
  });

  it("null / undefined / \"\" son el MISMO estado", () => {
    // La base devuelve `cliente_codigo: null` y el formulario lo muestra como
    // "". Si dieran instantáneas distintas, el formulario nacería sucio.
    const a = instantaneaGuia(
      { ...CABECERA, observaciones: null },
      [{ cliente: "City Mall David", cliente_codigo: null, direccion: "David", empresa: "Fashion Wear", facturas: "3192", bultos: 9, numero_guia_transp: null }],
    );
    const b = instantaneaGuia(
      { ...CABECERA, observaciones: "" },
      [{ cliente: "City Mall David", cliente_codigo: "", direccion: "David", empresa: "Fashion Wear", facturas: "3192", bultos: 9, numero_guia_transp: "" }],
    );
    expect(hayCambios(a, b)).toBe(false);
  });

  it("sin referencia de lo guardado NO se afirma un cambio", () => {
    // Mientras la guía no terminó de cargar no hay contra qué comparar, y sin
    // cambio no hay autoguardado. Es la mitad que apaga el PUT del arranque.
    expect(hayCambios(null, instantaneaGuia(CABECERA, RENGLONES))).toBe(false);
  });

  it("…pero ante la duda los RENGLONES sí viajan", () => {
    // Al revés que lo anterior: perder un renglón es peor que reescribirlo igual.
    expect(renglonesCambiaron(null, instantaneaGuia(CABECERA, RENGLONES))).toBe(true);
  });
});

describe("un cambio de verdad se ve", () => {
  const cargada = instantaneaGuia(CABECERA, RENGLONES);

  const casos: Array<[string, () => ReturnType<typeof instantaneaGuia>]> = [
    ["la fecha", () => instantaneaGuia({ ...CABECERA, fecha: "2026-08-18" }, RENGLONES)],
    ["el modo de entrega", () => instantaneaGuia({ ...CABECERA, modoEntrega: "entrega_directa" }, RENGLONES)],
    ["el transportista", () => instantaneaGuia({ ...CABECERA, transportistaId: "otro-uuid" }, RENGLONES)],
    ["quién despacha", () => instantaneaGuia({ ...CABECERA, entregadoPor: "Julio" }, RENGLONES)],
    ["las observaciones", () => instantaneaGuia({ ...CABECERA, observaciones: "va con hielo" }, RENGLONES)],
    ["el N° del transportista", () => instantaneaGuia({ ...CABECERA, numeroGuiaTransp: "TR-9" }, RENGLONES)],
    ["el cliente de una línea", () => instantaneaGuia(CABECERA, [{ ...RENGLONES[0], cliente: "Otro" }, ...RENGLONES.slice(1)])],
    ["el código del cliente", () => instantaneaGuia(CABECERA, [{ ...RENGLONES[0], cliente_codigo: "D-25" }, ...RENGLONES.slice(1)])],
    ["la dirección", () => instantaneaGuia(CABECERA, [{ ...RENGLONES[0], direccion: "Santiago" }, ...RENGLONES.slice(1)])],
    ["la empresa", () => instantaneaGuia(CABECERA, [{ ...RENGLONES[0], empresa: "Vistana International" }, ...RENGLONES.slice(1)])],
    ["las facturas", () => instantaneaGuia(CABECERA, [{ ...RENGLONES[0], facturas: "3184" }, ...RENGLONES.slice(1)])],
    ["los bultos", () => instantaneaGuia(CABECERA, [{ ...RENGLONES[0], bultos: 4 }, ...RENGLONES.slice(1)])],
    ["el N° del transportista de la línea", () => instantaneaGuia(CABECERA, [{ ...RENGLONES[0], numero_guia_transp: "TR-1" }, ...RENGLONES.slice(1)])],
    ["una línea nueva", () => instantaneaGuia(CABECERA, [...RENGLONES, { cliente: "Nuevo", direccion: "David", empresa: "Fashion Wear", facturas: "1111", bultos: 1 }])],
    ["una línea borrada", () => instantaneaGuia(CABECERA, RENGLONES.slice(1))],
    ["dos líneas en otro orden", () => instantaneaGuia(CABECERA, [RENGLONES[1], RENGLONES[0], RENGLONES[2]])],
  ];

  for (const [que, arma] of casos) {
    it(`cambiar ${que} cuenta como cambio`, () => {
      expect(hayCambios(cargada, arma())).toBe(true);
    });
  }
});

describe("los RENGLONES solo viajan cuando cambiaron", () => {
  const cargada = instantaneaGuia(CABECERA, RENGLONES);

  it("cambiar SOLO la cabecera no manda los renglones", () => {
    // 🔴 Es lo que evita que anotar una observación le cambie el id a cada línea.
    const actual = instantaneaGuia({ ...CABECERA, observaciones: "va con hielo" }, RENGLONES);
    expect(hayCambios(cargada, actual)).toBe(true);
    expect(renglonesCambiaron(cargada, actual)).toBe(false);
  });

  it("cambiar un renglón sí los manda", () => {
    const actual = instantaneaGuia(CABECERA, [{ ...RENGLONES[0], bultos: 4 }, ...RENGLONES.slice(1)]);
    expect(renglonesCambiaron(cargada, actual)).toBe(true);
  });

  it("el orden de los renglones también cuenta", () => {
    // El PUT numera por posición del arreglo (`orden`), así que reordenar SÍ es
    // un cambio aunque los renglones sean los mismos.
    const actual = instantaneaGuia(CABECERA, [RENGLONES[1], RENGLONES[0], RENGLONES[2]]);
    expect(renglonesCambiaron(cargada, actual)).toBe(true);
  });
});

describe("las filas vacías no cuentan (es el mismo filtro que `saveGuia`)", () => {
  it("agregar una fila en blanco no es un cambio", () => {
    // "+ Agregar envío" antes de escribir nada no le manda nada distinto al
    // servidor, así que no puede disparar un guardado.
    const cargada = instantaneaGuia(CABECERA, RENGLONES);
    const actual = instantaneaGuia(CABECERA, [
      ...RENGLONES,
      { cliente: "", cliente_codigo: "", direccion: "", empresa: "", facturas: "", bultos: 0, numero_guia_transp: "" },
    ]);
    expect(hayCambios(cargada, actual)).toBe(false);
  });

  it("una fila con cualquier cosa escrita SÍ cuenta", () => {
    expect(renglonTieneAlgo({ cliente: "City" })).toBe(true);
    expect(renglonTieneAlgo({ direccion: "David" })).toBe(true);
    expect(renglonTieneAlgo({ facturas: "3183" })).toBe(true);
    expect(renglonTieneAlgo({ bultos: 1 })).toBe(true);
    // La empresa sola no alcanza — es el filtro que ya aplicaba `validItems`,
    // y cambiarlo acá haría que la instantánea y lo enviado dejaran de coincidir.
    expect(renglonTieneAlgo({ empresa: "Fashion Wear" })).toBe(false);
    expect(renglonTieneAlgo({})).toBe(false);
  });
});

describe("bordes que engañan", () => {
  it("el transportista guardado NO cuenta mientras el modo sea entrega directa", () => {
    // El PUT manda `transportista_id: null` en entrega directa, así que las dos
    // formas producen el MISMO renglón en la base. Si contara, tocar "Cambiar"
    // a directo y volver dejaría el formulario sucio para siempre.
    const a = instantaneaCabecera({ ...CABECERA, modoEntrega: "entrega_directa", transportistaId: "9249cb14" });
    const b = instantaneaCabecera({ ...CABECERA, modoEntrega: "entrega_directa", transportistaId: null });
    expect(a).toBe(b);
  });

  it("los espacios de más en el N° del transportista no cuentan (viaja con trim)", () => {
    expect(instantaneaCabecera({ ...CABECERA, numeroGuiaTransp: " 0 " }))
      .toBe(instantaneaCabecera({ ...CABECERA, numeroGuiaTransp: "0" }));
  });

  it("los bultos como texto y como número son lo mismo", () => {
    const a = instantaneaRenglones([{ ...RENGLONES[0], bultos: 3 }]);
    const b = instantaneaRenglones([{ ...RENGLONES[0], bultos: "3" as unknown as number }]);
    expect(a).toBe(b);
  });

  it("un espacio de más en la dirección SÍ cuenta", () => {
    // El PUT escribe el texto tal cual: "David " y "David" son dos filas
    // distintas en la base, así que no se pueden dar por iguales.
    expect(instantaneaRenglones([{ ...RENGLONES[0], direccion: "David " }]))
      .not.toBe(instantaneaRenglones([{ ...RENGLONES[0], direccion: "David" }]));
  });
});
