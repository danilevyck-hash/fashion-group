// ─────────────────────────────────────────────────────────────────────────────
// 🔴 EL USUARIO QUE APRUEBA HORAS EXTRA NO VE NINGÚN SUELDO — CONDUCTA
//
// Daniel, 26-ago-2026, textual: *«julio usa el usuario bodega, asi que ponlo
// ahi»*. Julio Garay reporta las horas extra; el usuario con el que entra es
// `Bodega`, que además es COMPARTIDO.
//
// La pestaña Aprobaciones necesita las HORAS de cada persona, y las horas se
// calculan en `/api/asistencia/planilla` — el mismo cuadro que trae el SUELDO,
// la rata, las deducciones y el neto de las 38 personas.
//
// 🩸 POR QUÉ ESTE ARCHIVO Y NO UN BARRIDO DE TEXTO. Esconder la columna en la
// pantalla no esconde nada: el sueldo viajaría igual en el JSON, a un «ver
// código fuente» de distancia. Y un barrido sobre el `route.ts` se cumple con
// el comentario que explica el recorte — en este repo ya pasó cuatro veces.
// Acá se LLAMA a la ruta real y se mira, campo por campo, qué salió.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextRequest, NextResponse } from "next/server";

let ROL = "bodega";
// 🩸 El rechazo tiene que ser un `NextResponse`, no un `Response` pelado: la
// ruta lo reconoce con `instanceof NextResponse`. Con el objeto equivocado el
// 403 se ignora y la petición sigue de largo — o sea que un mock flojo acá
// habría dejado pasar a CUALQUIER rol sin que ningún test se pusiera rojo.
vi.mock("@/lib/requireRole", () => ({
  requireRole: (_r: unknown, roles: string[]) =>
    roles.includes(ROL)
      // `modules`: en producción la cookie SIEMPRE lo trae (lo escribe el
      // login) y `requireAsistencia` lo exige. `bodega` tiene `asistencia` en
      // `role_permissions` desde 20260830120000.
      ? { role: ROL, userName: "Bodega", userId: "9", sessionToken: "t", modules: ["asistencia"] }
      : NextResponse.json({ error: "Sin permiso." }, { status: 403 }),
}));

const HORARIOS = [{ empleado_codigo: "11", entrada: "08:00:00", salida: "17:00:00", almuerzo_minutos: 30 }];
vi.mock("@/lib/supabase-server", () => ({
  HAS_SERVICE_ROLE: true,
  supabaseServer: {
    from: (t: string) => {
      // 🔑 El reparto por empresa (31-ago-2026): Julio entra con la cuenta
      // `Bodega` y es de VISTANA, que es la empresa del código 11 de abajo. Sin
      // estas filas el cuadro le sale VACÍO —fail-closed, que es lo correcto— y
      // este archivo mediría cero en vez de medir el recorte del dinero.
      const res =
        t === "asistencia_horarios" ? HORARIOS
        : t === "asistencia_aprobador_empresa" ? [{ usuario: "Bodega", empresa: "vistana" }]
        : [];
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "gte", "lte", "order", "in"]) q[m] = () => q;
      // Se resuelve como promesa al await-earlo.
      (q as { then: unknown }).then = (ok: (v: unknown) => unknown) => ok({ data: res, error: null });
      return q;
    },
  },
}));

// Dos marcaciones REALES de un día: entra 08:00, sale 18:00 → hay hora extra.
vi.mock("@/lib/supabase-paginado", () => ({
  leerTodoPaginado: async () => [
    { id: "m1", empleado_codigo: "11", empleado_nombre: "JULIO GARAY", ocurrio_en: "2026-08-03T13:00:00.000Z" },
    { id: "m2", empleado_codigo: "11", empleado_nombre: "JULIO GARAY", ocurrio_en: "2026-08-03T23:00:00.000Z" },
  ],
}));
vi.mock("@/lib/asistencia/correcciones-server", () => ({
  leerCorrecciones: async () => ({ correcciones: [], porDia: new Map(), faltaTabla: true }),
}));
vi.mock("@/lib/asistencia/aprobaciones-server", () => ({
  leerAprobaciones: async () => ({ filas: [], faltaTabla: false }),
}));
vi.mock("@/lib/asistencia/planilla-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  leerManuales: async () => ({ porCodigo: new Map(), faltaMigracion: false }),
}));
vi.mock("@/lib/asistencia/config-server", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  leerReglas: async () => {
    const { REGLAS_DEFAULT } = await import("@/lib/asistencia/config");
    return { reglas: REGLAS_DEFAULT, faltaMigracion: false };
  },
  leerPersonas: async () => ({
    filas: [{
      empleado_codigo: "11", nombre: "JULIO GARAY", salario_mensual: 1000,
      jornada_semanal: 48, empresa: "vistana", activo: true,
    }],
    faltaMigracion: false, faltaColumnasBajas: false,
    faltaColumnaServicioProfesional: false, faltaColumnaBaseSeguros: false,
  }),
  leerJustificaciones: async () => ({ filas: [], faltaTabla: false }),
  leerVacaciones: async () => ({ filas: [], faltaTabla: false }),
}));

const pedir = (rol: string) => {
  ROL = rol;
  return new NextRequest(
    "http://localhost/api/asistencia/planilla?desde=2026-08-01&hasta=2026-08-15&aprobaciones=1",
  );
};

/** Todo string que aparezca en el JSON, por profundo que esté. */
function clavesProfundas(v: unknown, acc = new Set<string>()): Set<string> {
  if (Array.isArray(v)) { for (const x of v) clavesProfundas(x, acc); return acc; }
  if (v && typeof v === "object") {
    for (const [k, x] of Object.entries(v)) { acc.add(k); clavesProfundas(x, acc); }
  }
  return acc;
}

beforeEach(() => { ROL = "bodega"; });

describe("🔴 bodega entra a Aprobaciones y NO recibe un solo número de sueldo", () => {
  it("la respuesta trae EXACTAMENTE cuatro campos, y ninguno es el cuadro", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const res = await GET(pedir("bodega"));
    expect(res.status).toBe(200);
    const j = await res.json();
    // 🔑 La lista exacta, no un "no contiene": un campo nuevo que alguien
    // agregue mañana tiene que hacer fallar esto y obligarlo a pensarlo.
    expect(Object.keys(j).sort()).toEqual(["aprobaciones", "avisos", "periodo", "puedeAprobar"]);
  });

  it("⛔ ni «lineas», ni «totales», ni un solo campo de plata en TODO el JSON", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = await (await GET(pedir("bodega"))).json();
    const claves = clavesProfundas(j);
    for (const prohibida of [
      "lineas", "totales", "dinero", "salarioMensual", "salarioQuincenal",
      "rataHora", "valorMinuto", "netoPagar", "seguroSocial", "seguroEducativo",
      "bruto", "deducciones", "manuales", "reglas",
    ]) {
      expect(claves.has(prohibida), `«${prohibida}» viajó en el JSON`).toBe(false);
    }
  });

  it("⛔ NINGÚN MONTO llega a la pantalla de aprobar — la plata no vive ahí", async () => {
    // 🔑 Desde el 27-ago-2026 la unidad es el DÍA, y un día trae gente con sus
    // MINUTOS. El monto de las extras salió del contrato entero: es una
    // división que da el sueldo (5,5 h a 1,25 por $43,45 dice rata $6,32).
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = await (await GET(pedir("bodega"))).json();
    expect(Array.isArray(j.aprobaciones)).toBe(true);
    expect(j.aprobaciones.length).toBeGreaterThan(0);
    for (const d of j.aprobaciones) {
      for (const g of d.gente) {
        expect(Object.keys(g), `${g.etiqueta} trae un campo de plata`).not.toContain("monto");
      }
    }
  });

  it("✅ pero SÍ recibe lo que necesita para aprobar: el día, la persona y sus minutos", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = await (await GET(pedir("bodega"))).json();
    const d = j.aprobaciones[0];
    expect(d.fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(d.etiqueta).toBeTruthy();
    expect(d.semana).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const g = d.gente[0];
    expect(g.codigo).toBe("11");
    expect(g.etiqueta).toContain("JULIO");
    expect(g.minutos).toBeGreaterThan(0);
    expect(typeof g.aprobado).toBe("boolean");
    expect(j.puedeAprobar).toBe(true);
  });

  it("🔴 al ADMIN no se le recortó nada — el cuadro de siempre sigue entero", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = await (await GET(pedir("admin"))).json();
    expect(Array.isArray(j.lineas)).toBe(true);
    expect(j.totales).toBeTruthy();
    const linea = j.lineas.find((l: { codigo: string }) => l.codigo === "11");
    expect(linea.dinero.netoPagar).toBeGreaterThan(0);
    // Y el monto de las extras vuelve a viajar para quien sí puede verlo.
    expect(j.aprobaciones[0].monto).not.toBeNull();
  });

  it("🔴 la contadora tampoco pierde nada", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const j = await (await GET(pedir("contabilidad"))).json();
    expect(Array.isArray(j.lineas)).toBe(true);
    expect(j.lineas[0].dinero).toBeTruthy();
  });

  it("⛔ un rol ajeno sigue rebotando con 403", async () => {
    const { GET } = await import("@/app/api/asistencia/planilla/route");
    const res = await GET(pedir("vendedor"));
    expect(res.status).toBe(403);
  });
});

describe("🔴 la lista de «solo aprueba» se DERIVA, no se escribe a mano", () => {
  it("bodega aprueba y NO tiene Asistencia; admin tiene las dos y no queda acá", async () => {
    const { soloApruebaRoles, soloAprueba, ASISTENCIA_ROLES, APROBACIONES_ROLES } =
      await import("@/lib/asistencia/roles");
    expect(APROBACIONES_ROLES).toContain("bodega");
    expect(ASISTENCIA_ROLES).not.toContain("bodega");
    // 🔑 Solo bodega: contabilidad aprueba PERO ya tenía Asistencia, así que no
    // se le recorta nada. Es el matiz que la derivación evita tener que recordar.
    expect(soloApruebaRoles()).toEqual(["bodega"]);
    expect(APROBACIONES_ROLES).toContain("contabilidad");
    expect(soloAprueba("contabilidad")).toBe(false);
    expect(soloAprueba("bodega")).toBe(true);
    // 🔑 admin aprueba PERO tiene Asistencia: no se le recorta nada.
    expect(soloAprueba("admin")).toBe(false);
    for (const r of ASISTENCIA_ROLES) expect(soloAprueba(r)).toBe(false);
  });
});

describe("🔴 QUÉ PESTAÑAS VE CADA UNO — bodega entra a UNA, no a seis", () => {
  // 🔴 CAMBIÓ DE DIRECCIÓN (1-sep-2026). «Vacaciones» sigue en el catálogo de
  // pestañas pero está APAGADA para todos —admin incluido— por
  // `PESTANAS_OCULTAS` en `lib/asistencia/roles.ts`. Daniel: *«olvida lo de las
  // vacaciones por ahora, quitalo del ERP para no enrredar»*.
  //
  // 🔑 Se deja en esta lista A PROPÓSITO: es el universo de lo que se PREGUNTA,
  // y que el resultado no la traiga es justamente lo que hay que comprobar. Si
  // se sacara de acá, el día que se vuelva a encender nadie se enteraría de que
  // este candado dejó de mirarla.
  const TODAS = ["planilla", "reporte", "justificaciones", "vacaciones", "aprobaciones", "configuracion"];
  /** Lo que de verdad se ve hoy. Reactivar Vacaciones tiene que romper esto. */
  const VISIBLES = TODAS.filter((t) => t !== "vacaciones");
  const ve = async (rol: string) => {
    const { vePestana } = await import("@/lib/asistencia/roles");
    return TODAS.filter((t) => vePestana(rol, t));
  };

  it("⛔ bodega ve SOLO Aprobaciones — nunca la Planilla, que trae los 38 sueldos", async () => {
    expect(await ve("bodega")).toEqual(["aprobaciones"]);
  });

  it("admin las ve todas MENOS la apagada — consecuencia de la regla, no un caso a mano", async () => {
    expect(await ve("admin")).toEqual(VISIBLES);
  });

  it("la CONTADORA las ve todas — desde el 27-ago-2026 también aprueba", async () => {
    // Daniel: «que contabilidad tambien pueda aprobar». Es quien arma la
    // planilla y ya veía el aviso de lo que quedó sin aprobar; ahora puede
    // destrabarlo sin buscar a nadie.
    expect(await ve("contabilidad")).toEqual(VISIBLES);
  });

  it("⛔ la SECRETARIA no gana Aprobaciones — ella no arma la planilla", async () => {
    const suyas = await ve("secretaria");
    expect(suyas).toEqual(["planilla", "reporte", "justificaciones", "configuracion"]);
    expect(suyas).not.toContain("aprobaciones");
  });

  it("⛔ un rol ajeno no ve ninguna", async () => {
    expect(await ve("vendedor")).toEqual([]);
  });

  it("🔑 la pestaña por defecto de bodega es una que SÍ puede cargar", async () => {
    // Aterrizar en «planilla» le daría un 403 en la cara en vez de su trabajo.
    expect((await ve("bodega"))[0]).toBe("aprobaciones");
  });
});
