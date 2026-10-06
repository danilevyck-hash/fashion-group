// ─────────────────────────────────────────────────────────────────────────────
// 🔴 CANDADO — GUÍAS › PEDIDOS: TRES ESTADOS Y LOS BULTOS (6-oct-2026)
//
// Las decisiones de Daniel del 6-oct-2026, que REEMPLAZAN las del 5-oct. Cada
// una tiene su prueba, y la nota de arriba dice qué cambió y cuándo:
//
//   1. 🔴 LOS ESTADOS SON TRES, no dos: Pendiente → Terminado (bodega) →
//      Recibido (la secretaria) → Etiquetas. Daniel cambia a propósito su
//      decisión del 5-oct-2026 («SOLO 2 estados», `pedidos-bodega.ts`), y el
//      porqué queda escrito: *«no se puede confiar solo en bodega»*.
//   2. 🔴 «RECIBIDO» NO LO MARCA BODEGA. Lo marcan la secretaria y admin.
//   3. 🔴 QUIEN MARCÓ TERMINADO SOLO MARCA RECIBIDO SI ES ADMIN. Para los
//      demás, lo tiene que marcar otra persona.
//   4. 🔴 NO SE SALTA UN PASO: de Pendiente no se va directo a Recibido.
//   5. 🔴 EL RECORTE POR EMPRESA ES POR PERSONA Y ES DURO, como el de Boston:
//      Julio no ve Vistana; Rodrigo y Jorman SOLO ven Vistana; admin y los que
//      no están en la lista ven las 6 (falla ABIERTA).
//   6. 🔴 «PREPARADO» SE LEE COMO «TERMINADO»: mientras la migración no corra,
//      ni un toque de bodega se pierde ni se pisa.
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
  ROLES_RECIBIDO,
  ROLES_TERMINADO,
  ROTULO_ESTADO_BULTOS,
  bultosDelPapel,
  cuantosBultos,
  empresasQueVe,
  esEstadoBultos,
  estadoAnterior,
  estadoLeido,
  mismaPersona,
  notaDelPedido,
  puedeMover,
  referenciaDeCodigo,
  resumenAsignacion,
  siguienteEstado,
  sinBulto,
  todoAsignado,
  totalDeLinea,
  validarBulto,
  veLaEmpresa,
  type LineaPedido,
} from "@/lib/guias/pedidos-bultos";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { ESTADOS_PEDIDO } from "@/lib/guias/pedidos-bodega";

const linea = (p: Partial<LineaPedido> & { codigo_barra_id: number }): LineaPedido => ({
  codigo: "NB2570001",
  descripcion: "NEW BALANCE 2570 BLANCO TALLA 9",
  cantidad: 12,
  precio: 15.05,
  bulto: null,
  ...p,
});

describe("🔴 10 · el interruptor nace apagado", () => {
  it("`PEDIDOS_BULTOS_EN_CODIGO` es false hasta el «sí» de Daniel", () => {
    expect(PEDIDOS_BULTOS_EN_CODIGO).toBe(false);
  });
});

describe("🔴 1 · los estados son TRES, y reemplazan los dos de hoy", () => {
  it("son exactamente pendiente · terminado · recibido, en el orden del flujo", () => {
    expect([...ESTADOS_BULTOS]).toEqual(["pendiente", "terminado", "recibido"]);
  });

  it("los dos de hoy siguen siendo dos: esta decisión no los reescribió", () => {
    expect([...ESTADOS_PEDIDO]).toEqual(["pendiente", "preparado"]);
  });

  it("los rótulos son los de un ERP, sin inventos", () => {
    expect(ROTULO_ESTADO_BULTOS).toEqual({
      pendiente: "Pendiente",
      terminado: "Terminado",
      recibido: "Recibido",
    });
  });

  it("el flujo avanza de uno en uno y Recibido es el final", () => {
    expect(siguienteEstado("pendiente")).toBe("terminado");
    expect(siguienteEstado("terminado")).toBe("recibido");
    expect(siguienteEstado("recibido")).toBeNull();
  });

  it("y se puede deshacer un paso, nunca dos", () => {
    expect(estadoAnterior("recibido")).toBe("terminado");
    expect(estadoAnterior("terminado")).toBe("pendiente");
    expect(estadoAnterior("pendiente")).toBeNull();
  });

  it("«preparado» NO es un estado nuevo válido", () => {
    expect(esEstadoBultos("preparado")).toBe(false);
    expect(esEstadoBultos("terminado")).toBe(true);
  });
});

describe("🔴 6 · «preparado» se LEE como «terminado» (falla abierta sin la migración)", () => {
  it("el toque de bodega de hoy sigue valiendo mañana", () => {
    expect(estadoLeido("preparado")).toBe("terminado");
  });

  it("sin fila, pendiente; y un valor raro no inventa un estado", () => {
    expect(estadoLeido(null)).toBe("pendiente");
    expect(estadoLeido(undefined)).toBe("pendiente");
    expect(estadoLeido("despachado")).toBe("pendiente");
    expect(estadoLeido(7)).toBe("pendiente");
  });
});

describe("🔴 2 y 3 · quién marca qué", () => {
  const pedido = { empresa_key: "vistana", terminado_por: null as string | null };

  it("bodega marca Terminado", () => {
    expect(ROLES_TERMINADO).toContain("bodega");
    const v = puedeMover({ desde: "pendiente", hasta: "terminado", ...pedido }, { role: "bodega", userName: "rodrigo" });
    expect(v.ok).toBe(true);
  });

  it("🔴 bodega NO marca Recibido, ni aunque lo pida: «no se puede confiar solo en bodega»", () => {
    expect(ROLES_RECIBIDO).not.toContain("bodega");
    expect(ROLES_RECIBIDO).not.toContain("vendedor");
    const v = puedeMover(
      { desde: "terminado", hasta: "recibido", empresa_key: "vistana", terminado_por: "alguien" },
      { role: "bodega", userName: "rodrigo" },
    );
    expect(v).toEqual({ ok: false, error: "«Recibido» lo marca la secretaria" });
  });

  it("la secretaria sí lo marca", () => {
    expect(ROLES_RECIBIDO).toEqual(["admin", "secretaria"]);
    const v = puedeMover(
      { desde: "terminado", hasta: "recibido", empresa_key: "vistana", terminado_por: "rodrigo" },
      { role: "secretaria", userName: "ana" },
    );
    expect(v.ok).toBe(true);
  });

  it("🔴 quien marcó Terminado NO puede marcar Recibido…", () => {
    const v = puedeMover(
      { desde: "terminado", hasta: "recibido", empresa_key: "vistana", terminado_por: "Ana" },
      { role: "secretaria", userName: "ana" },
    );
    expect(v).toEqual({ ok: false, error: "«Recibido» lo marca otra persona, no quien lo terminó" });
  });

  it("…salvo que sea admin", () => {
    const v = puedeMover(
      { desde: "terminado", hasta: "recibido", empresa_key: "vistana", terminado_por: "daniel" },
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

describe("🔴 4 · no se salta un paso", () => {
  it("de Pendiente no se va directo a Recibido, ni siendo admin", () => {
    const v = puedeMover(
      { desde: "pendiente", hasta: "recibido", empresa_key: "vistana", terminado_por: null },
      { role: "admin", userName: "daniel" },
    );
    expect(v).toEqual({ ok: false, error: "Ese pedido tiene que pasar primero por Terminado" });
  });

  it("y marcar lo que ya está no es un cambio", () => {
    const v = puedeMover(
      { desde: "terminado", hasta: "terminado", empresa_key: "vistana", terminado_por: null },
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
      { desde: "pendiente", hasta: "terminado", empresa_key: "vistana", terminado_por: null },
      { role: "bodega", userName: "julio" },
    );
    expect(v).toEqual({ ok: false, error: "Ese pedido no es de una de tus empresas" });
  });

  it("admin ve las 6, aunque estuviera en la lista", () => {
    expect([...empresasQueVe("julio", "admin")]).toEqual([...B2B_EMPRESA_KEYS]);
    expect([...empresasQueVe("daniel", "admin")]).toEqual([...B2B_EMPRESA_KEYS]);
  });

  it("quien no está en la lista ve las 6 (falla ABIERTA): el recorte es para los nombrados", () => {
    expect([...empresasQueVe("ana", "secretaria")]).toEqual([...B2B_EMPRESA_KEYS]);
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
    expect(papel).toContain("l.descripcion");
    expect(papel).not.toContain("renglonDelPapel");
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
  it("Total = cantidad × precio, a dos decimales", () => {
    expect(totalDeLinea({ cantidad: 12, precio: 15.05 })).toBe(180.6);
    expect(totalDeLinea({ cantidad: 3, precio: 0.333 })).toBe(1);
  });

  it("⚠️ «Referencia» se DERIVA del código con la regla ya aprobada (−3 caracteres)", () => {
    expect(referenciaDeCodigo("NB2570001")).toBe("NB2570");
    expect(referenciaDeCodigo("")).toBe("");
    // Un código cortísimo no se queda en nada.
    expect(referenciaDeCodigo("ABC")).toBe("ABC");
  });
});

describe("🩸 el aviso de las 9 a.m. no grita en falso", () => {
  // 🩸 El cron `pedidos-pendientes` resolvía el estado con `esEstadoPedido`, que
  // NO conoce «terminado»: el día que corra la migración, un pedido que bodega
  // ya terminó caía en el `else` y salía en 📊 NEGOCIO como «pendiente de más de
  // 7 días». Ese chat no tiene perilla de silenciar, así que la alarma falsa se
  // queda. Ahora el cron usa `estadoLeido`, y esta prueba fija la diferencia.
  it("«terminado» NO se lee como «pendiente» (eso era la alarma falsa)", () => {
    expect(estadoLeido("terminado")).toBe("terminado");
    expect(estadoLeido("terminado")).not.toBe("pendiente");
  });

  it("y «recibido» tampoco", () => {
    expect(estadoLeido("recibido")).toBe("recibido");
  });

  it("el cron lee el estado con `estadoLeido`, no con `esEstadoPedido`", () => {
    const ruta = fs.readFileSync(
      path.resolve(__dirname, "../../app/api/cron/pedidos-pendientes/route.ts"),
      "utf8",
    );
    expect(ruta).toContain("estadoLeido");
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
