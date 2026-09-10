/**
 * CANDADO — EL CORREO DE COBRO DE CONFECCIONES BOSTON LO FIRMA BOSTON.
 *
 * Daniel, textual (9-sep-2026), al decidir prender el correo de esta cartera:
 * *«Firma Confecciones Boston»*.
 *
 * ─── QUÉ SE MIDIÓ ANTES DE PRENDERLO ────────────────────────────────────────
 * Contra producción, el mismo día: la cartera de Boston son **398 clientes con
 * saldo y $197.799,82**; de ellos **284 tienen teléfono y solo 119 correo**. Por
 * eso la fila de Correo sale APAGADA cuando el cliente no tiene, diciendo dónde
 * cargarlo, y por eso NO se estrenó el «mandar a varios»: el encargo era el
 * correo de UN cliente.
 *
 * ─── LAS TRES COSAS QUE ESTE ARCHIVO NO DEJA ROMPER ─────────────────────────
 *   1. **NADA de lo que recibe un cliente de Boston dice Fashion Group** — ni el
 *      remitente, ni el asunto, ni el cuerpo, ni la firma, ni el PDF adjunto
 *      (que además sale SIN el logo de Fashion Group: el papel de Boston no
 *      lleva el logo de otra casa, igual que no lleva su identificación).
 *   2. **Boston sigue APARTE**: su propia ruta, su propia consulta, sus correos
 *      de `switch_clientes` acotado a Boston y NUNCA de `clientes_master`. Y el
 *      rastro del envío dice de qué cartera es, así que su marca gris no puede
 *      aparecer en el CXC del grupo — medido: hay UN código en las dos carteras
 *      (`TCKCTA`, el mostrador).
 *   3. **El envío se anota DESPUÉS de que Resend confirma.** Anotar antes deja
 *      la marca puesta por un correo que no salió.
 *
 * ⚠️ Y la palabra «vencido» sigue prohibida hacia el cliente: `dias` es la EDAD
 * del documento, no días de mora.
 */
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { readFileSync } from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";
import { signSession } from "@/lib/session-cookie";

// ── Arnés: nada toca la base ni la red ──────────────────────────────────────
interface Fila { [k: string]: unknown }

/** Lo que cada tabla contesta y lo que se escribió en ella. */
const BASE: Record<string, Fila[]> = {};
const INSERTS: Array<{ tabla: string; fila: Fila }> = [];

function chain(tabla: string) {
  const self: Record<string, unknown> = {};
  const paso = () => () => self;
  const datos = () => ({ data: BASE[tabla] ?? [], error: null });
  Object.assign(self, {
    select: paso(), eq: paso(), neq: paso(), not: paso(), in: paso(), is: paso(),
    gte: paso(), lt: paso(), lte: paso(), gt: paso(), or: paso(), contains: paso(),
    ilike: paso(), range: paso(), order: paso(), limit: paso(),
    maybeSingle: async () => ({ data: (BASE[tabla] ?? [])[0] ?? null, error: null }),
    single: async () => ({ data: (BASE[tabla] ?? [])[0] ?? null, error: null }),
    insert: async (fila: Fila) => { INSERTS.push({ tabla, fila }); return { error: null }; },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) =>
      Promise.resolve(datos()).then(res, rej),
  });
  return self;
}

vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => chain(t), rpc: async () => ({ data: [], error: null }) },
  HAS_SERVICE_ROLE: true,
}));

import { GET as bostonCorreoGET, POST as bostonCorreoPOST } from "@/app/api/cxc/boston/enviar-email/route";
import { GET as enviosDelGrupoGET } from "@/app/api/cxc/envios/route";
import { CASA_BOSTON, CASA_GRUPO, casaDeEmpresa, casaDeEmpresas } from "@/lib/cxc/casa-del-papel";
import {
  asuntoBoston,
  composeCorreoBoston,
  cuerpoBoston,
  firmaBoston,
  resumenBoston,
} from "@/lib/cxc/boston-correo";
import { buildEstadoCuentaPDF } from "@/lib/pdf-estado-cuenta";
import { empresasCarteraAparte } from "@/lib/switch-api/empresas";
import { B2B_EMPRESA_KEYS } from "@/lib/empresa-mapping";
import { ROLES_BOSTON } from "@/lib/cxc/boston-roles";
import type { EstadoCuenta } from "@/lib/cxc/estado-cuenta-tipos";

const RAIZ = process.cwd();
/** El archivo SIN comentarios: un barrido que lee comentarios se cumple a sí
 *  mismo con su propia explicación, y estos archivos CITAN lo que prohíben. */
const leer = (rel: string): string =>
  readFileSync(path.join(RAIZ, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^[ \t]*\/\/.*$/gm, " ");

const SECRET_PREV = process.env.SESSION_SECRET;
const RESEND_PREV = process.env.RESEND_API_KEY;
beforeAll(() => {
  process.env.SESSION_SECRET = "test-secret-boston-correo";
  process.env.RESEND_API_KEY = "re_test";
});
afterAll(() => {
  process.env.SESSION_SECRET = SECRET_PREV;
  process.env.RESEND_API_KEY = RESEND_PREV;
});

function req(url: string, role: string, body?: unknown): NextRequest {
  const cookie = signSession({ role, userId: "u1", userName: "daniel", sessionToken: "t1", modules: ["boston"] });
  return new NextRequest(`https://fashiongr.com${url}`, {
    method: body ? "POST" : "GET",
    headers: { cookie: `cxc_session=${cookie}`, "content-type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

/** Un cliente de Boston con documentos, tal como lo devuelve la base. */
function sembrarBoston(opts: { correo?: string } = {}) {
  BASE.switch_estadocuenta = [
    {
      ccte_id: 1, cliente_nombre: "Almacen La Fe", secuencial: "11-000000123",
      numero_fiscal: null, tipo_comprobante: "Factura", fecha_creacion: "2026-06-16",
      total: 1200, saldo: 1200, debito: 1200, credito: 0, dias: 85, plazo_credito: 30,
    },
    {
      ccte_id: 2, cliente_nombre: "Almacen La Fe", secuencial: "12-000000045",
      numero_fiscal: null, tipo_comprobante: "Recibo", fecha_creacion: "2026-07-01",
      total: 200, saldo: 200, debito: 0, credito: 200, dias: 70, plazo_credito: 0,
    },
  ];
  BASE.switch_clientes = [
    {
      nombre: "Almacen La Fe",
      email: opts.correo ?? "",
      telefono: "775-1234", celular: "", identificacion: "8-123-456",
      raw_data: { direccion: "David, Chiriquí", nombreContacto: "Marta" },
    },
  ];
  BASE.fg_users = [{ name: "daniel", nombre_completo: "Daniel Levy", email: "daniel@fashiongr.com" }];
  BASE.cxc_emails_enviados = [];
}

beforeEach(() => {
  for (const k of Object.keys(BASE)) delete BASE[k];
  INSERTS.length = 0;
  vi.unstubAllGlobals();
});

// ═════════════════════════════════════════════════════════════════════════════
// 1. 🔴 NADA DE LO QUE LEE EL CLIENTE DICE FASHION GROUP
// ═════════════════════════════════════════════════════════════════════════════

const DOCS = [
  { debito: 1200, credito: 0, dias: 85 },
  { debito: 0, credito: 200, dias: 70 },
  { debito: 500, credito: 0, dias: 200 },
];

/** Todo lo que el cliente lee, junto. */
function todoElCorreo(): string {
  return [
    asuntoBoston("Septiembre 2026"),
    cuerpoBoston("Septiembre 2026", "Marta"),
    cuerpoBoston("Septiembre 2026"),
    firmaBoston("Daniel Levy"),
    composeCorreoBoston({
      cuerpo: cuerpoBoston("Septiembre 2026", "Marta"),
      resumenHtml: resumenBoston(DOCS, "Almacen La Fe"),
      firma: firmaBoston("Daniel Levy"),
    }),
    CASA_BOSTON.remitente,
  ].join("\n");
}

describe("🔴 el correo de Boston lo firma Boston", () => {
  it("ni el asunto, ni el cuerpo, ni la firma, ni el HTML dicen Fashion Group", () => {
    const texto = todoElCorreo().toLowerCase();
    expect(texto).not.toContain("fashion group");
    expect(texto).not.toContain("fashiongr.com/");
  });

  it("y sí dicen Confecciones Boston, en el asunto, la firma y el membrete", () => {
    expect(asuntoBoston("Septiembre 2026")).toBe("Confecciones Boston — Estado de cuenta Septiembre 2026");
    expect(firmaBoston("Daniel Levy")).toBe("Daniel Levy\nConfecciones Boston");
    expect(CASA_BOSTON.remitente.startsWith("Confecciones Boston <")).toBe(true);
    expect(composeCorreoBoston({ cuerpo: "x", resumenHtml: "", firma: "y" })).toContain("CONFECCIONES BOSTON");
  });

  it("⚠️ nunca dice «vencido» — `dias` es EDAD, no mora", () => {
    expect(todoElCorreo().toLowerCase()).not.toMatch(/\bvencid[oa]s?\b/);
  });

  it("el resumen rotula los tramos por su RANGO, con la lista de siempre", () => {
    const html = resumenBoston(DOCS, "Almacen La Fe");
    expect(html).toContain("0 a 90 días");
    expect(html).toContain("91 a 120 días");
    expect(html).toContain("121 días y más");
    // 1.200 − 200 = 1.000 en el primer tramo; 500 en el último; total 1.500.
    expect(html).toContain("$1,000.00");
    expect(html).toContain("$500.00");
    expect(html).toContain("$1,500.00");
  });

  it("saluda por el nombre del contacto cuando hay, y genérico cuando no", () => {
    expect(cuerpoBoston("Septiembre 2026", "Marta").startsWith("Buen día Marta,")).toBe(true);
    expect(cuerpoBoston("Septiembre 2026").startsWith("Buen día,")).toBe(true);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. 🔴 EL PAPEL: LA CASA SE DERIVA DE LA EMPRESA, NO SE ELIGE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 quién firma el papel sale de la empresa acreedora", () => {
  it("Boston tiene su casa, y NO es la del grupo", () => {
    expect(casaDeEmpresa("confecciones_boston")).toBe(CASA_BOSTON);
    expect(CASA_BOSTON).not.toBe(CASA_GRUPO);
  });

  it("las 6 del grupo siguen firmando como Fashion Group", () => {
    for (const k of B2B_EMPRESA_KEYS) expect(casaDeEmpresa(k)).toBe(CASA_GRUPO);
  });

  it("🔴 el papel de Boston NO lleva el logo de otra casa: no lleva ninguno", () => {
    expect(CASA_BOSTON.logo).toBeNull();
    expect(CASA_GRUPO.logo).not.toBeNull();
  });

  it("🔴 su pie no lleva el dominio del grupo", () => {
    expect(CASA_BOSTON.pie).not.toContain("fashiongr.com");
    expect(CASA_GRUPO.pie).toContain("fashiongr.com");
  });

  it("toda empresa de cartera APARTE tiene su casa declarada a mano", () => {
    // Derivar la casa de `empresasCarteraAparte()` haría que una empresa nueva
    // heredara el membrete de Boston sin que nadie lo decida.
    for (const k of empresasCarteraAparte()) {
      expect(casaDeEmpresa(k), `${k} firmaría como Fashion Group`).not.toBe(CASA_GRUPO);
    }
  });

  it("un papel que mezcla NO se estampa con Fashion Group", () => {
    expect(casaDeEmpresas(["fashion_wear", "confecciones_boston"])).toBe(CASA_BOSTON);
    expect(casaDeEmpresas(["fashion_wear", "vistana"])).toBe(CASA_GRUPO);
  });
});

const ESTADO_BOSTON = {
  codigo: "B-1",
  clienteNombre: "Almacen La Fe",
  cliente: {
    nombre: "Almacen La Fe", identificacion: "8-123-456", telefono: "775-1234",
    email: "lafe@ejemplo.com", direccion: "David, Chiriquí", limiteCredito: 0, tiempoMorosidad: 0,
  },
  total: 1000,
  generadoEn: "2026-09-09T12:00:00.000Z",
  empresas: [
    {
      empresa_key: "confecciones_boston",
      empresa_nombre: "Confecciones Boston",
      subtotal: 1000,
      saldoSwitch: null,
      documentos: [
        { numero: "11-000000123", fecha: "2026-06-16", tipo: "Factura", monto: 1200, saldo: 1200, debito: 1200, credito: 0, dias: 85, plazoCredito: 30, numeroFiscal: null },
        { numero: "12-000000045", fecha: "2026-07-01", tipo: "Recibo", monto: 200, saldo: -200, debito: 0, credito: 200, dias: 70, plazoCredito: 0, numeroFiscal: null },
      ],
    },
  ],
} as unknown as EstadoCuenta;

async function textoDelPdf(doc: { output: (t: "arraybuffer") => ArrayBuffer }): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(doc.output("arraybuffer")), useSystemFonts: true }).promise;
  let texto = "";
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    texto += ((await page.getTextContent()).items as any[]).map((it) => it.str).join(" ") + "\n";
  }
  return texto.replace(/\s+/g, " ");
}

describe("🔴 el PDF adjunto de Boston", () => {
  it("es el papel de siempre —la forma de Switch— y no dice Fashion Group", async () => {
    const { doc } = buildEstadoCuentaPDF(ESTADO_BOSTON, "Almacen La Fe");
    const texto = await textoDelPdf(doc);
    expect(texto).toContain("ESTADO DE CUENTA");
    expect(texto).toContain("Total General");
    // 🔴 La cabeza trae las cuatro líneas que Daniel dictó de SU papel de Switch
    // (9-sep-2026) — y el correo es el suyo, no el del grupo.
    expect(texto).toContain("CONFECCIONES BOSTON S.A");
    expect(texto).toContain("Identificación: 655-544-133465");
    expect(texto).toContain("ventas@cboston.net");
    expect(texto).not.toContain("info@fashiongr.com");
    expect(texto.toLowerCase()).not.toContain("fashion group");
    expect(texto.toLowerCase()).not.toContain("fashiongr.com");
    expect(texto.toLowerCase()).not.toMatch(/\bvencid[oa]s?\b/);
  });

  it("va UNA sola hoja: Boston es UNA compañía, sin desglose por empresa", async () => {
    const { doc } = buildEstadoCuentaPDF(ESTADO_BOSTON, "Almacen La Fe");
    expect(doc.getNumberOfPages()).toBe(1);
  });

  it("CONTROL: el mismo papel de una empresa del grupo SÍ lo firma Fashion Group", async () => {
    const delGrupo = {
      ...ESTADO_BOSTON,
      empresas: [{ ...ESTADO_BOSTON.empresas[0], empresa_key: "fashion_wear", empresa_nombre: "Fashion Wear" }],
    } as unknown as EstadoCuenta;
    const texto = await textoDelPdf(buildEstadoCuentaPDF(delGrupo, "X").doc);
    expect(texto.toLowerCase()).toContain("fashiongr.com");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. 🔴 BOSTON SIGUE APARTE — SU RUTA, SU CONSULTA, SUS CORREOS
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 la ruta del correo de Boston no toca al grupo", () => {
  const ruta = leer("src/app/api/cxc/boston/enviar-email/route.ts");
  const lector = leer("src/lib/cxc/boston-estado-cuenta.ts");

  it("NO reusa el lector del grupo (`fetchEstadoCuentaData`)", () => {
    for (const src of [ruta, lector]) expect(src).not.toContain("fetchEstadoCuentaData");
  });

  it("NO llama a la ruta del grupo", () => {
    expect(ruta).not.toContain("/api/cxc/enviar-email");
    expect(ruta).not.toContain("/api/cxc/cobrar-lote");
  });

  it("🔴 sus correos salen de `switch_clientes` acotado a Boston, nunca del maestro", () => {
    for (const src of [ruta, lector]) {
      expect(src).not.toContain("clientes_master");
      // TODAS las lecturas, no la primera: el archivo tiene más de una y una
      // sola sin acotar se trae la ficha que ese código tiene en el grupo.
      const trozos = src.split('.from("switch_clientes")').slice(1);
      expect(trozos.length, "nadie lee switch_clientes acá — el barrido no está mirando nada").toBeGreaterThan(0);
      for (const t of trozos) {
        expect(t.slice(0, 300)).toContain('.eq("empresa_key", EMPRESA_BOSTON)');
      }
    }
  });

  it("el permiso sale de la MISMA lista que la pestaña", () => {
    expect(ruta).toContain("rolesBoston()");
    expect([...ROLES_BOSTON]).toEqual(["admin", "gerente_boston"]);
  });

  it("la empresa es una constante del servidor, nunca sale de la URL", () => {
    expect(ruta).not.toMatch(/searchParams\.get\(["']empresa["']\)/);
  });
});

describe("🔴 quién puede mandar este correo", () => {
  for (const rol of ["secretaria", "vendedor", "bodega", "contabilidad"]) {
    it(`${rol} recibe 403`, async () => {
      sembrarBoston({ correo: "lafe@ejemplo.com" });
      const res = await bostonCorreoPOST(
        req("/api/cxc/boston/enviar-email", rol, {
          codigo: "B-1", destinatario: "lafe@ejemplo.com", asunto: "Estado de cuenta", cuerpo: "x",
        }),
      );
      expect(res.status).toBe(403);
      expect(INSERTS).toHaveLength(0);
    });
  }

  it("admin y gerente_boston sí entran", async () => {
    for (const rol of ROLES_BOSTON) {
      sembrarBoston({ correo: "lafe@ejemplo.com" });
      const res = await bostonCorreoGET(req(`/api/cxc/boston/enviar-email?codigo=B-1`, rol));
      expect(res.status).toBe(200);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. 🔴 EL ENVÍO SE ANOTA DESPUÉS DE QUE RESEND CONFIRMA
// ═════════════════════════════════════════════════════════════════════════════

function stubResend(ok: boolean) {
  const llamadas: Array<Record<string, unknown>> = [];
  vi.stubGlobal("fetch", async (_url: string, init: { body: string }) => {
    llamadas.push(JSON.parse(init.body) as Record<string, unknown>);
    return {
      ok,
      status: ok ? 200 : 500,
      json: async () => (ok ? { id: "em_1" } : { message: "no anda" }),
    } as unknown as Response;
  });
  return llamadas;
}

const CUERPO_POST = {
  codigo: "B-1",
  destinatario: "lafe@ejemplo.com",
  asunto: "Confecciones Boston — Estado de cuenta Septiembre 2026",
  cuerpo: "Buen día Marta,",
};

describe("🔴 el rastro del envío", () => {
  it("con Resend OK se anota, con canal «correo» y diciendo que es de Boston", async () => {
    sembrarBoston({ correo: "lafe@ejemplo.com" });
    stubResend(true);
    const res = await bostonCorreoPOST(req("/api/cxc/boston/enviar-email", "admin", CUERPO_POST));
    expect(res.status).toBe(200);
    const anotados = INSERTS.filter((i) => i.tabla === "cxc_emails_enviados");
    expect(anotados).toHaveLength(1);
    expect(anotados[0].fila.canal).toBe("correo");
    expect(anotados[0].fila.empresas).toEqual(["confecciones_boston"]);
    expect(anotados[0].fila.cliente_codigo).toBe("B-1");
  });

  it("🩸 si Resend falla NO se anota nada: la marca sería de un correo que no salió", async () => {
    sembrarBoston({ correo: "lafe@ejemplo.com" });
    stubResend(false);
    const res = await bostonCorreoPOST(req("/api/cxc/boston/enviar-email", "admin", CUERPO_POST));
    expect(res.status).toBe(500);
    expect(INSERTS.filter((i) => i.tabla === "cxc_emails_enviados")).toHaveLength(0);
  });

  it("lo que sale por Resend lo firma Boston y lleva UN PDF adjunto", async () => {
    sembrarBoston({ correo: "lafe@ejemplo.com" });
    const llamadas = stubResend(true);
    await bostonCorreoPOST(req("/api/cxc/boston/enviar-email", "admin", CUERPO_POST));
    expect(llamadas).toHaveLength(1);
    const payload = llamadas[0] as { from: string; html: string; attachments: Array<{ filename: string }> };
    expect(payload.from).toBe(CASA_BOSTON.remitente);
    expect(payload.from.toLowerCase()).not.toContain("fashion group");
    expect(payload.html.toLowerCase()).not.toContain("fashion group");
    expect(payload.attachments).toHaveLength(1);
    expect(payload.attachments[0].filename).toContain("Confecciones Boston");
    expect(payload.attachments[0].filename.toLowerCase()).not.toContain("fashion group");
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. 🔴 SIN CORREO CARGADO, EL BOTÓN NO SE PRENDE
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 el cliente sin correo", () => {
  it("la ruta contesta destinatario vacío — no se inventa ninguno", async () => {
    sembrarBoston({ correo: "" });
    const res = await bostonCorreoGET(req("/api/cxc/boston/enviar-email?codigo=B-1", "admin"));
    const d = (await res.json()) as { destinatario: string };
    expect(d.destinatario).toBe("");
  });

  it("tampoco lo inventa cuando el cliente NO está en el directorio de Boston", async () => {
    // Es el caso real: la consulta pide `email is not null`, así que un cliente
    // sin correo no devuelve NINGUNA fila. Ahí es donde un valor por defecto
    // escrito a mano mandaría el estado de cuenta a una casilla nuestra.
    sembrarBoston({ correo: "" });
    BASE.switch_clientes = [];
    const res = await bostonCorreoGET(req("/api/cxc/boston/enviar-email?codigo=B-1", "admin"));
    const d = (await res.json()) as { destinatario: string };
    expect(d.destinatario).toBe("");
  });

  it("y la hoja apaga la fila de Correo diciendo dónde cargarlo", () => {
    const hoja = leer("src/components/cxc/BostonHojaCobrar.tsx");
    expect(hoja).toContain("disabled={!tieneCorreo || cargando}");
    expect(hoja).toContain("Este cliente no tiene correo — cárgalo en Switch");
  });

  it("el servidor rechaza un destinatario que no es un correo", async () => {
    sembrarBoston({ correo: "" });
    stubResend(true);
    const res = await bostonCorreoPOST(
      req("/api/cxc/boston/enviar-email", "admin", { ...CUERPO_POST, destinatario: "no-es-un-correo" }),
    );
    expect(res.status).toBe(400);
    expect(INSERTS).toHaveLength(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. 🔴 LA MARCA DE BOSTON NO SE PINTA EN EL CXC DEL GRUPO
// ═════════════════════════════════════════════════════════════════════════════

describe("🔴 un cobro de Boston no deja badge en el CXC del grupo", () => {
  it("la lectura del grupo SALTA las filas de Boston", async () => {
    // Medido el 9-sep-2026: `TCKCTA` existe en las dos carteras. Sin este
    // filtro, un correo de Boston pintaría su marca gris en el CXC del grupo.
    BASE.cxc_emails_enviados = [
      { cliente_codigo: "TCKCTA", canal: "correo", created_at: "2026-09-08T10:00:00Z", empresas: ["confecciones_boston"] },
      { cliente_codigo: "D-25", canal: "whatsapp", created_at: "2026-09-08T11:00:00Z", empresas: ["fashion_wear"] },
    ];
    const res = await enviosDelGrupoGET(req("/api/cxc/envios", "admin"));
    const d = (await res.json()) as { porCodigo: Record<string, unknown> };
    expect(Object.keys(d.porCodigo)).toEqual(["D-25"]);
  });

  it("CONTROL: las filas viejas sin `empresas` siguen siendo del grupo", async () => {
    BASE.cxc_emails_enviados = [
      { cliente_codigo: "D-30", canal: "correo", created_at: "2026-09-08T10:00:00Z" },
    ];
    const res = await enviosDelGrupoGET(req("/api/cxc/envios", "admin"));
    const d = (await res.json()) as { porCodigo: Record<string, unknown> };
    expect(Object.keys(d.porCodigo)).toEqual(["D-30"]);
  });
});
