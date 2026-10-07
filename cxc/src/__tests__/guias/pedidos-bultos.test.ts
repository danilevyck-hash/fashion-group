// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — GUÍAS › PEDIDOS: TRES ESTADOS Y LOS BULTOS (6-oct-2026)
//
// Las decisiones de Daniel del 6-oct-2026, que REEMPLAZAN las del 5-oct. Cada
// una tiene su prueba, y la nota de arriba dice qué cambió y cuándo:
//
//   1. 🔴 LOS ESTADOS SON TRES, no dos, y con NOMBRES DE ERP:
//      Pendiente → **Preparado** → **Verificado** → Etiquetas. Daniel cambia a
//      propósito su decisión del 5-oct-2026 («SOLO 2 estados»), y el porqué
//      queda escrito: *«no se puede confiar solo en bodega»*.
//      🔑 «Preparado» es el MISMO nombre y el MISMO valor de siempre: no se
//      renombra nada en la base. «Verificado» es el término de ERP para la
//      segunda revisión — ni «Recibido» ni «Terminado», que eran inventos míos.
//   2. 🔴 «VERIFICADO» NO LO MARCA BODEGA. Lo marcan la secretaria y admin.
//      «Preparado» lo marcan bodega Y la secretaria.
//   3. 🔴 NADIE HACE LOS DOS PASOS DEL MISMO PEDIDO, NI SIQUIERA ADMIN
//      (6-oct-2026, corrige la regla del mismo día: antes admin era excepción).
//      Vale también si lo preparó la secretaria: siempre dos pares de ojos.
//  3b. 🔴 QUEDA REGISTRADO QUIÉN Y CUÁNDO, por paso, en pantalla y en el papel.
//   4. 🔴 NO SE SALTA UN PASO: de Pendiente no se va directo a Verificado.
//   5. 🔴 EL RECORTE POR EMPRESA ES POR PERSONA Y ES DURO, como el de Boston:
//      Julio no ve Vistana; Rodrigo y Jorman SOLO ven Vistana; admin, LA
//      SECRETARIA y los que no están en la lista ven las 6 (falla ABIERTA).
//   6. 🔑 NINGUNA FILA SE RENOMBRA: `pendiente` y `preparado` siguen valiendo y
//      la migración solo AGREGA `verificado`.
//   7. 🔴 EL RESUMEN CUENTA ARTÍCULOS Y BULTOS: «18 de 24 artículos asignados ·
//      6 bultos».
//   8. 🔴 EL PAPEL NO CALLA LO QUE FALTA: lo que no tiene bulto sale aparte.
//   9. 🔑 416 BULTOS Y 56 LÍNEAS medidos: nada acá puede ser O(bultos).
//  10. 🔴 EL INTERRUPTOR NACE APAGADO y apagado nada de esto existe.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  EMPRESAS_POR_PERSONA,
  ESTADOS_BULTOS,
  MAX_BULTO,
  PEDIDOS_BULTOS_EN_CODIGO,
  ROLES_PREPARADO,
  ROLES_VERIFICADO,
  ROTULO_ESTADO_BULTOS,
  bultosDelPapel,
  COLUMNAS_DETALLE,
  COLUMNAS_DETALLE_SIN_PLATA,
  ROLES_VEN_PRECIO,
  cuantosBultos,
  descripcionCompleta,
  empresasQueVe,
  esEstadoBultos,
  estadoAnterior,
  estadoLeido,
  mismaPersona,
  notaDelPedido,
  firmaDelPaso,
  firmaEnColumna,
  firmasEnOrden,
  puedeMover,
  resumenAsignacion,
  siguienteEstado,
  sinBulto,
  todoAsignado,
  renglonesDelPie,
  tituloDeFirmas,
  totalesDelPedido,
  ultimaFirma,
  validarBulto,
  veLaEmpresa,
  veLaPlata,
  type LineaPedido,
} from "@/lib/guias/pedidos-bultos";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { ESTADOS_PEDIDO } from "@/lib/guias/pedidos-bodega";

const linea = (p: Partial<LineaPedido> & { codigo_barra_id: number }): LineaPedido => ({
  codigo: "NB2570001",
  descripcion: "Men-T-Shirts S/S",
  talla: null,
  color: null,
  cantidad: 12,
  precio: 15.05,
  total: 180.6,
  bulto: null,
  ...p,
});

describe("🔴 10 · el interruptor nace apagado", () => {
  it("`PEDIDOS_BULTOS_EN_CODIGO` es false hasta el «sí» de Daniel", () => {
    expect(PEDIDOS_BULTOS_EN_CODIGO).toBe(false);
  });
});

describe("🔴 1 · los estados son TRES, y reemplazan los dos de hoy", () => {
  it("son exactamente pendiente · preparado · verificado, en el orden del flujo", () => {
    expect([...ESTADOS_BULTOS]).toEqual(["pendiente", "preparado", "verificado"]);
  });

  it("🔑 «preparado» SIGUE SIENDO un estado válido: la base no se renombra", () => {
    expect(esEstadoBultos("preparado")).toBe(true);
    expect(estadoLeido("preparado")).toBe("preparado");
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../../supabase/migrations/20261231120000_pedidos_bultos.sql"),
      "utf8",
    );
    expect(sql).toContain("'pendiente', 'preparado', 'verificado'");
    // 🔴 Ninguna fila cambia de estado: solo se ensancha el CHECK.
    expect(sql).not.toContain("SET estado =");
  });

  it("🔴 nada de nombres inventados: ni «Terminado» ni «Recibido» (docs/nombres-erp.md)", () => {
    const rotulos = Object.values(ROTULO_ESTADO_BULTOS);
    expect(rotulos).toEqual(["Pendiente", "Preparado", "Verificado"]);
    expect(rotulos).not.toContain("Terminado");
    expect(rotulos).not.toContain("Recibido");
  });

  it("los dos de hoy siguen siendo dos: esta decisión no los reescribió", () => {
    expect([...ESTADOS_PEDIDO]).toEqual(["pendiente", "preparado"]);
  });

  it("los rótulos son los de un ERP, sin inventos", () => {
    expect(ROTULO_ESTADO_BULTOS).toEqual({
      pendiente: "Pendiente",
      preparado: "Preparado",
      verificado: "Verificado",
    });
  });

  it("el flujo avanza de uno en uno y Verificado es el final", () => {
    expect(siguienteEstado("pendiente")).toBe("preparado");
    expect(siguienteEstado("preparado")).toBe("verificado");
    expect(siguienteEstado("verificado")).toBeNull();
  });

  it("y se puede deshacer un paso, nunca dos", () => {
    expect(estadoAnterior("verificado")).toBe("preparado");
    expect(estadoAnterior("preparado")).toBe("pendiente");
    expect(estadoAnterior("pendiente")).toBeNull();
  });

  it("y «terminado»/«recibido» NO son estados: fueron nombres descartados", () => {
    expect(esEstadoBultos("terminado")).toBe(false);
    expect(esEstadoBultos("recibido")).toBe(false);
  });
});

describe("🔑 6 · la base no se renombra: lo guardado hoy sigue valiendo", () => {
  it("sin fila, pendiente; y un valor raro no inventa un estado", () => {
    expect(estadoLeido(null)).toBe("pendiente");
    expect(estadoLeido(undefined)).toBe("pendiente");
    expect(estadoLeido("despachado")).toBe("pendiente");
    expect(estadoLeido(7)).toBe("pendiente");
  });
});

describe("🔴 2 y 3 · quién marca qué", () => {
  const pedido = { empresa_key: "vistana", preparado_por: null as string | null };

  it("«Preparado» lo marcan BODEGA y LA SECRETARIA (Daniel, 6-oct-2026)", () => {
    expect([...ROLES_PREPARADO]).toEqual(["admin", "secretaria", "bodega"]);
    expect(puedeMover({ desde: "pendiente", hasta: "preparado", ...pedido }, { role: "bodega", userName: "rodrigo" }).ok).toBe(true);
    expect(puedeMover({ desde: "pendiente", hasta: "preparado", ...pedido }, { role: "secretaria", userName: "ana" }).ok).toBe(true);
    // ⚠️ El vendedor no es ninguno de los dos oficios.
    expect(ROLES_PREPARADO).not.toContain("vendedor");
  });

  it("🔴 bodega NO verifica, ni aunque lo pida: «no se puede confiar solo en bodega»", () => {
    expect(ROLES_VERIFICADO).not.toContain("bodega");
    expect(ROLES_VERIFICADO).not.toContain("vendedor");
    const v = puedeMover(
      { desde: "preparado", hasta: "verificado", empresa_key: "vistana", preparado_por: "alguien" },
      { role: "bodega", userName: "rodrigo" },
    );
    expect(v).toEqual({ ok: false, error: "«Verificado» lo marca la secretaria" });
  });

  it("la secretaria sí verifica lo que preparó otra persona", () => {
    expect(ROLES_VERIFICADO).toEqual(["admin", "secretaria"]);
    const v = puedeMover(
      { desde: "preparado", hasta: "verificado", empresa_key: "vistana", preparado_por: "rodrigo" },
      { role: "secretaria", userName: "ana" },
    );
    expect(v.ok).toBe(true);
  });

  it("🔴 pero si LA SECRETARIA lo preparó, NO puede verificarlo ella misma", () => {
    // El caso que Daniel nombró al dejar que la secretaria también prepare.
    const v = puedeMover(
      { desde: "preparado", hasta: "verificado", empresa_key: "vistana", preparado_por: "Ana" },
      { role: "secretaria", userName: "ana" },
    );
    expect(v).toEqual({ ok: false, error: "«Verificado» lo marca otra persona, no quien lo preparó" });
  });

  it("🔴 NI SIQUIERA SIENDO ADMIN (6-oct-2026: «nadie hace los dos pasos»)", () => {
    const v = puedeMover(
      { desde: "preparado", hasta: "verificado", empresa_key: "vistana", preparado_por: "daniel" },
      { role: "admin", userName: "daniel" },
    );
    expect(v).toEqual({ ok: false, error: "«Verificado» lo marca otra persona, no quien lo preparó" });
  });

  it("pero admin sí verifica lo que preparó OTRA persona", () => {
    const v = puedeMover(
      { desde: "preparado", hasta: "verificado", empresa_key: "vistana", preparado_por: "julio" },
      { role: "admin", userName: "daniel" },
    );
    expect(v.ok).toBe(true);
  });

  it("la comparación de personas es EXACTA normalizada, nunca por parecido", () => {
    expect(mismaPersona("Ana Gómez", "  ana   gómez ")).toBe(true);
    expect(mismaPersona("Ana", "Ana María")).toBe(false);
    expect(mismaPersona("", "")).toBe(false);
    expect(mismaPersona(null, null)).toBe(false);
  });
});

describe("🔴 3b · queda registrado quién y cuándo, por paso", () => {
  const EN = "2026-10-06T10:42:00-05:00";

  it("«Preparado por Julio · 10:42 a. m.» — tal como lo pidió Daniel", () => {
    expect(firmaDelPaso("preparado", "Julio", EN)).toBe("Preparado por Julio · 10:42 a. m.");
  });

  it("y «Verificado por Angela · 11:15 a. m.»", () => {
    expect(firmaDelPaso("verificado", "Angela", "2026-10-06T11:15:00-05:00"))
      .toBe("Verificado por Angela · 11:15 a. m.");
  });

  it("🔴 un paso que NO ocurrió no se firma: nunca se inventa una firma", () => {
    expect(firmaDelPaso("preparado", null, EN)).toBeNull();
    expect(firmaDelPaso("preparado", "Julio", null)).toBeNull();
    expect(firmaDelPaso("preparado", "   ", EN)).toBeNull();
  });

  it("salen en el orden del flujo: primero quien preparó, después quien verificó", () => {
    expect(
      firmasEnOrden({
        preparado_por: "Julio",
        preparado_en: EN,
        verificado_por: "Angela",
        verificado_en: "2026-10-06T11:15:00-05:00",
      }),
    ).toEqual(["Preparado por Julio · 10:42 a. m.", "Verificado por Angela · 11:15 a. m."]);
  });

  it("con el pedido solo preparado, sale UNA sola línea", () => {
    const f = { preparado_por: "Julio", preparado_en: EN, verificado_por: null, verificado_en: null };
    expect(firmasEnOrden(f)).toHaveLength(1);
  });

  it("🔑 la hora es la de PANAMÁ, no la del servidor (Vercel corre en UTC)", () => {
    // Las 15:42 UTC son las 10:42 a. m. de Panamá (UTC−5 fijo).
    expect(firmaDelPaso("preparado", "Julio", "2026-10-06T15:42:00Z")).toContain("10:42");
  });

  it("🔴 y las dos firmas quedan GUARDADAS, una columna por paso", () => {
    const sql = fs.readFileSync(
      path.resolve(__dirname, "../../../supabase/migrations/20261231120000_pedidos_bultos.sql"),
      "utf8",
    );
    for (const col of ["preparado_por", "preparado_en", "verificado_por", "verificado_en"]) {
      expect(sql).toContain(col);
    }
  });
});

describe("🔴 4 · no se salta un paso", () => {
  it("de Pendiente no se va directo a Verificado, ni siendo admin", () => {
    const v = puedeMover(
      { desde: "pendiente", hasta: "verificado", empresa_key: "vistana", preparado_por: null },
      { role: "admin", userName: "daniel" },
    );
    expect(v).toEqual({ ok: false, error: "Ese pedido tiene que pasar primero por Preparado" });
  });

  it("y marcar lo que ya está no es un cambio", () => {
    const v = puedeMover(
      { desde: "preparado", hasta: "preparado", empresa_key: "vistana", preparado_por: null },
      { role: "admin", userName: "daniel" },
    );
    expect(v.ok).toBe(false);
  });
});

describe("🔴 5 · el recorte por empresa es POR PERSONA y es duro", () => {
  it("Julio ve sus cinco y NUNCA Vistana", () => {
    const suyas = empresasQueVe("julio", "bodega");
    expect([...suyas]).toEqual(["fashion_wear", "fashion_shoes", "active_shoes", "active_wear", "joystep"]);
    expect(suyas).not.toContain("vistana");
    expect(veLaEmpresa("vistana", "julio", "bodega")).toBe(false);
  });

  it("Rodrigo y Jorman SOLO ven Vistana", () => {
    for (const quien of ["rodrigo", "jorman"]) {
      expect([...empresasQueVe(quien, "bodega")]).toEqual(["vistana"]);
      expect(veLaEmpresa("fashion_wear", quien, "bodega")).toBe(false);
    }
  });

  it("🔴 y si piden otra empresa, no la ven: `puedeMover` la rechaza", () => {
    const v = puedeMover(
      { desde: "pendiente", hasta: "preparado", empresa_key: "vistana", preparado_por: null },
      { role: "bodega", userName: "julio" },
    );
    expect(v).toEqual({ ok: false, error: "Ese pedido no es de una de tus empresas" });
  });

  it("admin ve las 6, aunque estuviera en la lista", () => {
    expect([...empresasQueVe("julio", "admin")]).toEqual([...B2B_EMPRESA_KEYS]);
    expect([...empresasQueVe("daniel", "admin")]).toEqual([...B2B_EMPRESA_KEYS]);
  });

  it("🔴 LA SECRETARIA VE LAS 6 (Daniel, 6-oct-2026), como todo el que no esté en la lista", () => {
    expect([...empresasQueVe("ana", "secretaria")]).toEqual([...B2B_EMPRESA_KEYS]);
    expect(Object.keys(EMPRESAS_POR_PERSONA)).toEqual(["julio", "rodrigo", "jorman"]);
    expect([...empresasQueVe(null, "bodega")]).toEqual([...B2B_EMPRESA_KEYS]);
  });

  it("el nombre de usuario se compara en minúsculas y sin espacios de más", () => {
    expect([...empresasQueVe("  JULIO ", "bodega")]).not.toContain("vistana");
  });

  it("toda empresa de la lista es una de las 6 del grupo: ni Boston ni Multifashion", () => {
    for (const [quien, empresas] of Object.entries(EMPRESAS_POR_PERSONA)) {
      for (const e of empresas) {
        expect(B2B_EMPRESA_KEYS, `${quien} pide una empresa que no es del grupo: ${e}`).toContain(e);
      }
    }
  });
});

describe("🔴 7 · el resumen cuenta artículos y bultos", () => {
  it("«18 de 24 artículos asignados · 6 bultos» — tal como lo pidió Daniel", () => {
    const lineas = Array.from({ length: 24 }, (_, i) =>
      linea({ codigo_barra_id: i + 1, bulto: i < 18 ? (i % 6) + 1 : null }),
    );
    expect(resumenAsignacion(lineas)).toBe("18 de 24 artículos asignados · 6 bultos");
  });

  it("en singular no dice «1 artículos»", () => {
    expect(resumenAsignacion([linea({ codigo_barra_id: 1, bulto: 3 })])).toBe("1 de 1 artículo asignado · 1 bulto");
  });

  it("sin nada asignado lo dice, no se calla", () => {
    expect(resumenAsignacion([linea({ codigo_barra_id: 1 })])).toBe("0 de 1 artículo asignados · 0 bultos");
  });

  it("«todo asignado» es lo que habilita Recibido, y una lista vacía no cuenta", () => {
    expect(todoAsignado([])).toBe(false);
    expect(todoAsignado([linea({ codigo_barra_id: 1, bulto: 1 })])).toBe(true);
    expect(todoAsignado([linea({ codigo_barra_id: 1, bulto: 1 }), linea({ codigo_barra_id: 2 })])).toBe(false);
  });

  it("los bultos se cuentan DISTINTOS: dos líneas en el bulto 4 son un bulto", () => {
    expect(cuantosBultos([linea({ codigo_barra_id: 1, bulto: 4 }), linea({ codigo_barra_id: 2, bulto: 4 })])).toBe(1);
  });
});

describe("🔴 8 y 9 · el papel, y lo medido", () => {
  it("los bultos salen del 1 al último, ordenados por NÚMERO y no por texto", () => {
    const lineas = [2, 10, 1, 416].map((b, i) => linea({ codigo_barra_id: i + 1, bulto: b }));
    expect(bultosDelPapel(lineas).map((g) => g.bulto)).toEqual([1, 2, 10, 416]);
  });

  it("🔴 lo que no tiene bulto NO desaparece del papel", () => {
    const lineas = [linea({ codigo_barra_id: 1, bulto: 1 }), linea({ codigo_barra_id: 2 })];
    expect(bultosDelPapel(lineas).flatMap((g) => g.lineas).map((l) => l.codigo_barra_id)).toEqual([1]);
    expect(sinBulto(lineas).map((l) => l.codigo_barra_id)).toEqual([2]);
  });

  it("🩸 la cantidad se dice UNA sola vez: el texto del artículo no la repite", () => {
    // El primer borrador escribía «artículo · 12» Y la columna Cantidad: el 12
    // salía dos veces en el mismo renglón (docs/diseno.md, regla 8).
    const papel = fs.readFileSync(path.resolve(__dirname, "../../lib/guias/pdf-pedido-bultos.ts"), "utf8");
    expect(papel).toContain("descripcionCompleta(l)");
    expect(papel).not.toContain("renglonDelPapel");
  });

  it("🔴 y el papel lleva al pie quién preparó y quién verificó", () => {
    const papel = fs.readFileSync(path.resolve(__dirname, "../../lib/guias/pdf-pedido-bultos.ts"), "utf8");
    expect(papel).toContain("firmasEnOrden");
  });

  it("🔑 416 bultos y 56 líneas: el papel se arma de una pasada por las LÍNEAS", () => {
    // 416 bultos, 56 líneas repartidas: el caso real medido el 6-oct-2026.
    const lineas = Array.from({ length: 56 }, (_, i) => linea({ codigo_barra_id: i + 1, bulto: (i % 416) + 1 }));
    const t0 = Date.now();
    const grupos = bultosDelPapel(lineas);
    expect(grupos.length).toBe(56);
    expect(grupos.flatMap((g) => g.lineas).length).toBe(56);
    // Con un algoritmo por BULTO esto no cerraría; con uno por línea, sobra.
    expect(Date.now() - t0).toBeLessThan(200);
  });
});

describe("🔴 lo que Daniel pidió al APROBAR (6-oct-2026)", () => {
  const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8");

  it("1 · el BULTO es la PRIMERA columna: «es lo que bodega llena, así que manda»", () => {
    expect(COLUMNAS_DETALLE[0]).toBe("Bulto");
    expect([...COLUMNAS_DETALLE]).toEqual(["Bulto", "Código", "Descripción", "Cantidad", "Precio", "Total"]);
    // 🔴 Ni «Código barra» ni «Referencia»: Switch no manda la segunda (medido).
    expect(COLUMNAS_DETALLE).not.toContain("Código barra");
    expect(COLUMNAS_DETALLE).not.toContain("Referencia");
  });

  it("1b · y el PAPEL lleva el mismo orden, para poder comparar los dos", () => {
    const papel = leer("lib/guias/pdf-pedido-bultos.ts");
    expect(papel).toMatch(/COLUMNAS_PAPEL_BULTOS = \[\s*\n\s*"Bulto",/);
    expect(papel).not.toContain('"Código barra"');
    expect(papel).not.toContain('"Referencia"');
  });

  it("2 · la firma es UNA columna angosta con el ÚLTIMO paso, no dos anchas", () => {
    const lista = leer("app/guias/components/PedidosView.tsx");
    // 🔴 Daniel, 6-oct-2026: «Verificado por» ocupaba demasiado y se comía el
    // ancho del cliente. Quedó una columna «Firma» con el último paso.
    expect(lista).toContain("Firma</th>");
    expect(lista).not.toContain("Verificado por</th>");
    expect(lista).toContain("ultimaFirma");
    // Lo que no entra, al tocar: las DOS firmas en el `title`.
    expect(lista).toContain("tituloDeFirmas");
  });

  it("2c · la columna muestra el último paso dado, y el anterior queda al tocar", () => {
    const f = {
      preparado_por: "Julio",
      preparado_en: "2026-10-06T10:42:00-05:00",
      verificado_por: "Angela",
      verificado_en: "2026-10-06T16:15:00-05:00",
    };
    expect(ultimaFirma(f)).toBe("Verificado · Angela · 4:15 p. m.");
    expect(tituloDeFirmas(f)).toContain("Preparado por Julio");
    expect(tituloDeFirmas(f)).toContain("Verificado por Angela");
    // Con un solo paso dado, se muestra ese.
    expect(ultimaFirma({ ...f, verificado_por: null, verificado_en: null })).toBe("Preparado · Julio · 10:42 a. m.");
    // Sin ninguno, nada — no se inventa una firma.
    expect(ultimaFirma({ preparado_por: null, preparado_en: null, verificado_por: null, verificado_en: null })).toBeNull();
    expect(tituloDeFirmas({ preparado_por: null, preparado_en: null, verificado_por: null, verificado_en: null })).toBeUndefined();
  });

  it("1c · el VENDEDOR baja debajo del cliente y su columna la toma Bultos", () => {
    const lista = leer("app/guias/components/PedidosView.tsx");
    // Daniel, 6-oct-2026: el vendedor no merece columna propia en el celular.
    expect(lista).toContain(">Bultos</th>");
    expect(lista).toMatch(/\{!BULTOS && <ThOrden col="vendedor"/);
    // Y el dato lo cuenta el SERVIDOR, no el navegador.
    expect(leer("app/api/guias/pedidos/route.ts")).toContain("leerCuentaDeBultos");
  });

  it("2b · la columna dice «quién · hora»; el rótulo ya lo pone el encabezado", () => {
    expect(firmaEnColumna("Julio", "2026-10-06T10:42:00-05:00")).toBe("Julio · 10:42 a. m.");
    // Sin el paso dado, no se inventa nada.
    expect(firmaEnColumna(null, "2026-10-06T10:42:00-05:00")).toBeNull();
    expect(firmaEnColumna("Julio", null)).toBeNull();
    expect(firmaEnColumna("  ", "2026-10-06T10:42:00-05:00")).toBeNull();
  });

  it("3 · el bulto se ESCRIBE en la celda, sin abrir ninguna ventana", () => {
    const detalle = leer("app/guias/components/PedidoBultos.tsx");
    // Una casilla por línea que guarda al salir o con Enter — no en cada tecla.
    expect(detalle).toContain("guardarUna");
    expect(detalle).toContain("onBlur");
    expect(detalle).toContain('e.key !== "Enter"');
    // 🔴 Y las casillas con «Asignar bulto» SIGUEN existiendo.
    expect(detalle).toContain("Asignar bulto");
    expect(detalle).toContain("marcarTodas");
  });

  it("3b · en el CELULAR no cambia: ahí mandan las casillas y el botón", () => {
    const detalle = leer("app/guias/components/PedidoBultos.tsx");
    // La casilla de escribir solo aparece desde `sm`; en el celular, el chip.
    expect(detalle).toContain('className="hidden h-9 w-16 rounded-md border border-gray-300 px-2 text-right tabular-nums focus:border-gray-900 focus:outline-none sm:block"');
    expect(detalle).toContain('<span className="sm:hidden">{chip}</span>');
  });
});

describe("🔴 EL PAPEL: EL TOTAL AL PIE Y LAS DOS FORMAS (6-oct-2026)", () => {
  // Daniel, al ver el papel: falta el total de unidades y el total en dinero,
  // en negrita con raya arriba; y «a veces el cliente pide con precio y sin
  // precio», las dos a la vista y para todos.
  const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8");
  const L = (cant: number, total: number | null) =>
    linea({ codigo_barra_id: cant, cantidad: cant, total, precio: total == null ? null : 1 });

  it("el pie va como el de SWITCH: Subtotal · ITBMS · Total, en ese orden", () => {
    // Los tres montos los MANDA Switch; acá solo se acomodan.
    const pie = totalesDelPedido([L(12, 180.6), L(6, 90.3)], { subtotal: 271, impuesto: 18.97, total: 289.97 });
    expect(pie).toEqual({ subtotal: 271, impuesto: 18.97, total: 289.97, unidades: 18 });
    expect(renglonesDelPie(pie).map((r) => r.rotulo)).toEqual(["Subtotal:", "ITBMS:", "Total:"]);
  });

  it("🔴 SIN el dato de Switch, el ITBMS no se inventa: ese renglón no sale", () => {
    // Mientras el sync no pase, subtotal e impuesto llegan vacíos. Un
    // «ITBMS: 0.00» inventado sería un número fiscal falso.
    const pie = totalesDelPedido([L(12, 180.6), L(6, 90.3)]);
    expect(pie.impuesto).toBeNull();
    expect(pie.subtotal).toBeNull();
    expect(renglonesDelPie(pie).map((r) => r.rotulo)).toEqual(["Total:"]);
    // El total cae a la suma de las líneas solo si Switch no lo mandó.
    expect(pie.total).toBe(270.9);
  });

  it("🔴 el ITBMS nunca se deriva de una resta nuestra: sale tal cual de Switch", () => {
    // 43,620.00 + 3,053.40 = 46,673.40 (el PDF real de Switch). Si el total que
    // manda Switch no cuadrara con sus partes, se reportan las tres como vinieron.
    const pie = totalesDelPedido([L(1, 1)], { subtotal: 43620, impuesto: 3053.4, total: 99999 });
    expect(pie.impuesto).toBe(3053.4);
    expect(pie.total).toBe(99999);
  });

  it("🔴 sin precios va SOLO el de unidades: un cero en dinero no diría nada", () => {
    expect(totalesDelPedido([L(12, null), L(6, null)]).total).toBeNull();
    expect(totalesDelPedido([L(12, null), L(6, null)]).unidades).toBe(18);
  });

  it("el papel escribe «Cantidad de artículos», el mismo rótulo que Switch", () => {
    expect(leer("lib/guias/pdf-pedido-bultos.ts")).toContain("Cantidad de artículos:");
  });

  it("🔴 el subtotal y el ITBMS se GUARDAN de Switch, no se calculan", () => {
    const sync = leer("lib/switch-api/sync-pedidos.ts");
    expect(sync).toContain("subtotal: dinero(r.subTotal)");
    expect(sync).toContain("impuesto: dinero(r.impuesto)");
    // Y la ruta del papel falla ABIERTA si la migración todavía no corrió.
    expect(leer("app/api/guias/pedidos/detalle/papel/route.ts")).toContain("leerPedido");
  });

  it("3 · «Imprimir» es UN botón; las dos formas aparecen al tocarlo", () => {
    const pant = leer("app/guias/components/PedidoBultos.tsx");
    expect(pant).toContain("imprimirAbierto");
    expect(pant).toContain("Con precios");
    expect(pant).toContain("Sin precios");
    // Una sola acción a la vista: el botón no repite el texto de las opciones.
    expect(pant.match(/<Printer size=\{15\}/g) ?? []).toHaveLength(1);
  });

  it("4 · la descripción no se queda con todo el ancho sobrante", () => {
    // Medido en el pedido real: «REEBOK BASE TRAIL MID» es lo más largo.
    expect(leer("app/guias/components/PedidoBultos.tsx")).toContain('sm:w-[26%]');
    expect(leer("lib/guias/pdf-pedido-bultos.ts")).toMatch(/2: \{ cellWidth: \d+ \}/);
  });

  it("las unidades admiten decimales (Switch manda 4.5) y no se redondean a entero", () => {
    expect(totalesDelPedido([L(4.5, null)]).unidades).toBe(4.5);
  });

  it("el pie es un BLOQUE aparte, como el de Switch, no un renglón de la tabla", () => {
    const papel = leer("lib/guias/pdf-pedido-bultos.ts");
    expect(papel).toContain("bloqueDeTotales");
    expect(papel).toContain("totalesDelPedido");
    // 🔴 El total de unidades va UNA sola vez: con `foot:` salía también dentro
    // de la tabla y quedaba el mismo número dos veces en la misma hoja.
    expect(papel).not.toContain("foot:");
  });

  it("🔴 y existen las DOS formas, con y sin precios", () => {
    const papel = leer("lib/guias/pdf-pedido-bultos.ts");
    expect(papel).toContain("COLUMNAS_PAPEL_SIN_PRECIOS");
    expect(papel).toContain("conPrecios");
    // La ruta las sirve por `?precios=`, y por omisión CON precios.
    const ruta = leer("app/api/guias/pedidos/detalle/papel/route.ts");
    expect(ruta).toContain('q.get("precios") !== "no"');
  });

  it("🔴 las dos están A LA VISTA, ninguna escondida en un «···»", () => {
    const detalle = leer("app/guias/components/PedidoBultos.tsx");
    expect(detalle).toContain("Con precios");
    expect(detalle).toContain("Sin precios");
    // Y las dos las puede pedir cualquiera que entre a Pedidos: la ruta del
    // papel se autoriza con `PEDIDOS_VER_ROLES`, no con quien ve la plata.
    const ruta = leer("app/api/guias/pedidos/detalle/papel/route.ts");
    expect(ruta).toContain("PEDIDOS_VER_ROLES");
    expect(ruta).not.toContain("veLaPlata");
  });

  it("🔴 nombres de ERP, no palabras de la casa (docs/nombres-erp.md)", () => {
    const detalle = leer("app/guias/components/PedidoBultos.tsx");
    expect(detalle).toContain("Asignar bulto");
    expect(detalle).not.toContain("Poner en bulto");
    expect(detalle).not.toContain("artículos marcados");
    expect(detalle).toContain("Seleccionar todos los artículos");
  });
});

describe("🔴 LA PLATA DEPENDE DE QUIÉN MIRA, Y LO DECIDE EL SERVIDOR (6-oct-2026)", () => {
  // Daniel: «bodega NO ve Precio ni Total, ni en la lista ni en el detalle; la
  // secretaria y admin SÍ; el papel SIEMPRE sale con Precio y Total, lo imprima
  // quien lo imprima». 🔴 Y: «decídelo en el SERVIDOR, no escondiendo columnas
  // en el navegador, para que a bodega no le viajen los precios».
  const leer = (f: string) => fs.readFileSync(path.resolve(__dirname, "../..", f), "utf8");

  it("bodega NO ve la plata; la secretaria y admin SÍ", () => {
    expect(veLaPlata("bodega")).toBe(false);
    expect(veLaPlata("vendedor")).toBe(false);
    expect(veLaPlata("secretaria")).toBe(true);
    expect(veLaPlata("admin")).toBe(true);
    expect(veLaPlata(null)).toBe(false);
    expect([...ROLES_VEN_PRECIO]).toEqual(["admin", "secretaria"]);
  });

  it("🔴 y el precio NO VIAJA: el servidor lo deja en null antes de mandarlo", () => {
    // La lectura recibe `conPlata` y pone `null` ahí mismo, no en la pantalla.
    const servidor = leer("lib/guias/pedido-detalle-server.ts");
    expect(servidor).toContain("conPlata ? num(f.precio) : null");
    expect(servidor).toContain("conPlata ? num(f.total) : null");
    // Y la ruta lo decide con el ROL de la cookie firmada.
    const ruta = leer("app/api/guias/pedidos/detalle/route.ts");
    expect(ruta).toContain("veLaPlata(auth.role)");
    // 🔴 Las dos lecturas que contestan al navegador lo pasan.
    expect(ruta).toContain("leerLineas(claves.empresa, claves.id, conPlata)");
    expect(ruta).toContain("leerLineas(empresa, id, veLaPlata(auth.role))");
  });

  it("🔴 el PAPEL siempre lleva plata, y por eso se dibuja en el SERVIDOR", () => {
    // 🔑 Si el papel se armara en el navegador, para dibujar los precios habría
    // que mandárselos a bodega — y «no los ve» sería mentira.
    const papel = leer("app/api/guias/pedidos/detalle/papel/route.ts");
    expect(papel).toContain("leerLineas(empresa, id, true)");
    expect(papel).toContain("application/pdf");
    // Y la pantalla ya NO arma el PDF: lo pide.
    const detalle = leer("app/guias/components/PedidoBultos.tsx");
    expect(detalle).toContain("/api/guias/pedidos/detalle/papel");
    expect(detalle).not.toContain("construirPdfPedidoBultos");
  });

  it("la pantalla dibuja las columnas de plata SOLO si llegaron", () => {
    const detalle = leer("app/guias/components/PedidoBultos.tsx");
    expect(detalle).toContain("const conPlata = !!lineas?.some((l) => l.precio != null)");
    expect([...COLUMNAS_DETALLE_SIN_PLATA]).toEqual(["Bulto", "Código", "Descripción", "Cantidad"]);
  });
});

describe("🔴 el bulto se ESCRIBE: validación del número", () => {
  it("entero de 1 a 9999, porque 416 fue real", () => {
    expect(MAX_BULTO).toBeGreaterThanOrEqual(416);
    expect(validarBulto("4")).toEqual({ ok: true, valor: 4 });
    expect(validarBulto(416)).toEqual({ ok: true, valor: 416 });
    expect(validarBulto(" 12 ")).toEqual({ ok: true, valor: 12 });
  });

  it("y nada más: ni cero, ni negativo, ni decimal, ni texto, ni vacío", () => {
    for (const malo of ["0", "-1", "1.5", "abc", "", null, undefined, 10_000]) {
      expect(validarBulto(malo).ok, `${String(malo)} no puede ser un bulto`).toBe(false);
    }
  });
});

describe("el total y la referencia", () => {
  it("⚠️ «Referencia» se QUITÓ: el API de Switch no la manda (Daniel, 6-oct-2026)", () => {
    // 🩸 Un borrador la derivaba con `modeloDe` (quitar 3 caracteres). El PDF de
    // Switch prueba que estaba MAL: ahí la referencia es más LARGA que el código
    // (`4RG822G200` → `4RG822G200-HMT`). Medido contra el API real: no viene con
    // ningún nombre, así que la columna se fue entera.
    const fuente = fs.readFileSync(path.resolve(__dirname, "../../lib/guias/pedidos-bultos.ts"), "utf8");
    expect(fuente).not.toMatch(/^import .*modeloDe/m);
    expect(fuente).not.toContain("referencia:");
  });

  it("🔑 talla y color vienen SEPARADOS, y «-» es el «sin dato» de Switch", () => {
    expect(descripcionCompleta({ descripcion: "Men-T-Shirts S/S", talla: "-", color: "-" }))
      .toBe("Men-T-Shirts S/S");
    expect(descripcionCompleta({ descripcion: "Men-T-Shirts S/S", talla: "M", color: "Azul" }))
      .toBe("Men-T-Shirts S/S · M · Azul");
  });

  it("🔑 el total de la línea es el de SWITCH, no uno recalculado", () => {
    const fuente = fs.readFileSync(path.resolve(__dirname, "../../lib/guias/pedidos-bultos.ts"), "utf8");
    expect(fuente).not.toContain("totalDeLinea");
    // Switch lo manda con sus descuentos: 12 × 15.05 sin descuento = 180.60.
    expect(linea({ codigo_barra_id: 1 }).total).toBe(180.6);
  });
});

describe("🩸 «terminado» no se lee como «pendiente»", () => {
  // 🩸 Nació con el cron `pedidos-pendientes`, que resolvía el estado con
  // `esEstadoPedido` — que NO conoce «terminado» — y mandaba a 📊 NEGOCIO como
  // «pendiente de más de 7 días» un pedido que bodega ya había terminado.
  // El aviso de las 9 a.m. se retiró el 6-oct-2026 («quita el aviso de pedidos
  // de las 9 am»), pero la diferencia entre los dos lectores queda fijada:
  // cualquier pantalla o reporte que lea el estado la necesita igual.
  it("«preparado» NO se lee como «pendiente» (eso era la alarma falsa)", () => {
    expect(estadoLeido("preparado")).toBe("preparado");
    expect(estadoLeido("preparado")).not.toBe("pendiente");
  });

  it("y «verificado» tampoco", () => {
    expect(estadoLeido("verificado")).toBe("verificado");
  });

});

describe("🩸 la lista NO se cae mientras la migración no esté aplicada", () => {
  // 🩸 MEDIDO CONTRA PRODUCCIÓN el 6-oct-2026: `pedidos_bodega_estado` tiene
  // hoy solo `empresa_key · pedido_switch_id · estado · cambiado_por ·
  // cambiado_en`. La ruta pedía además las cuatro columnas de firma a secas, así
  // que PostgREST devolvía error, el GET contestaba 500 y la pantalla entera se
  // iba al aviso rojo — justo en el estado en el que está producción. El
  // comentario decía «falla abierta» y era mentira. Ahora se piden, y si no
  // están se vuelve a pedir sin ellas.
  const ruta = () =>
    fs.readFileSync(path.resolve(__dirname, "../../app/api/guias/pedidos/route.ts"), "utf8");

  it("la lista pide las firmas con respaldo, nunca a secas", () => {
    const s = ruta();
    expect(s).toContain("COLUMNAS_BASE");
    expect(s).toContain("COLUMNAS_CON_FIRMAS");
    expect(s).toContain("leerEstadoDeBodega");
  });

  it("y si las columnas nuevas no están, hay un segundo intento sin ellas", () => {
    const s = ruta();
    // Las dos lecturas tolerantes: la de la lista y la del PATCH.
    expect(s).toContain("leerEstadoPrevio");
    expect(s.match(/COLUMNAS_BASE/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });
});

describe("🔴 6 · el envío de Etiquetas que nace al recibir", () => {
  it("la nota entra en las 15 letras que acepta una etiqueta", () => {
    expect(notaDelPedido("2732")).toBe("PEDIDO 2732");
    expect(notaDelPedido("2732").length).toBeLessThanOrEqual(15);
    expect(notaDelPedido("12345678901234567890").length).toBeLessThanOrEqual(15);
  });

  it("y va en mayúsculas, como las guarda Etiquetas", () => {
    expect(notaDelPedido("ab12")).toBe("PEDIDO AB12");
  });
});
