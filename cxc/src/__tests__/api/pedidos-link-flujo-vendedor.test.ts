// ─────────────────────────────────────────────────────────────────────────────
// EL FLUJO COMPLETO DEL PEDIDO DEL LINK ES DE LOS TRES ROLES — BODEGA NO
// (14-ago-2026)
//
// Daniel, preguntado explícitamente por los roles: ***"los 3, bodega no"*** —
// admin, secretaria y vendedor. El vendedor es quien comparte el link y a quien
// le llega el pedido por WhatsApp, así que tiene que poder hacer el trabajo
// ENTERO, no una versión recortada: convertir · ver la lista · abrir el detalle
// · editar precio · agregar/quitar líneas · elegir cliente · elegir vendedor ·
// mandarlo a Switch.
//
// De todo eso, lo ÚNICO que le faltaba era CONVERTIR (`pedidos-publicos/
// [short_id]/convertir` era admin+secretaria). El resto ya lo aceptaba desde
// antes; este archivo lo fija para que nadie se lo quite sin querer.
//
// 🔴 LO QUE **NO** SE ABRIÓ, y se prueba que sigue cerrado:
//   · BODEGA: 403 en todas las que ESCRIBEN. ⚠️ El 25-ago-2026 ganó UNA sola
//     —ver la lista (*"Dale acceso a bodega a la lista de pedidos."*)— y nada
//     más: convertir, editar, asignar cliente y mandar a Switch le siguen
//     contestando 403, y este archivo lo prueba paso por paso.
//   · Borrar un pedido (orders DELETE) y borrar/editar la fila pública
//     (pedidos-publicos DELETE/PUT) siguen siendo admin+secretaria: no son
//     parte de este flujo y son destructivos.
//   · La lista unificada del admin y el Excel siguen siendo admin+secretaria.
//
// 🔴 CANDADO DE CONDUCTA: se llaman los handlers REALES con cookies FIRMADAS
// rol por rol. Un barrido de texto sobre los `requireRole` no prueba quién
// entra — y en este repo un `allowedRoles` decorativo ya dejó pasar a todo el
// mundo por URL mientras el archivo decía otra cosa.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";
import { makeDb, type MockDb } from "../helpers/catalogo-mock-db";

let reebokDb: MockDb;
vi.mock("@/lib/reebok-supabase-server", () => ({
  reebokServer: { from: (t: string) => reebokDb.from(t), rpc: (...a: unknown[]) => reebokDb.rpc(...a) },
}));
let joybeesDb: MockDb;
vi.mock("@/lib/joybees-supabase-server", () => ({
  joybeesServer: { from: (t: string) => joybeesDb.from(t), rpc: (...a: unknown[]) => joybeesDb.rpc(...a) },
}));
let mainDb: MockDb;
vi.mock("@/lib/supabase-server", () => ({
  supabaseServer: { from: (t: string) => mainDb.from(t), rpc: (...a: unknown[]) => mainDb.rpc(...a) },
}));
vi.mock("@/lib/reebok-category-lookup", () => ({
  fetchReebokCategoryMap: vi.fn(async () => new Map<string, string>()),
}));
vi.mock("@/lib/catalogo/switch-envio", () => ({
  enviarPedidoSwitch: vi.fn(async () => ({ kind: "ok", numeroInterno: "16-1", pedidoSwitchId: 1, verificado: true, warnings: [] })),
}));
vi.mock("@/lib/switch-api/client", () => ({
  logoutAllSwitchSessions: vi.fn(async () => {}),
}));
vi.mock("@/lib/alertas/canal", () => ({
  enviarNegocio: vi.fn(async () => {}),
  enviarSistema: vi.fn(async () => {}),
}));

import type { NextRequest, NextResponse } from "next/server";
import { POST as convertirPost } from "@/app/api/catalogo/[marca]/pedidos-publicos/[short_id]/convertir/route";
import { DELETE as publicoDelete } from "@/app/api/catalogo/[marca]/pedidos-publicos/[short_id]/route";
import { GET as ordersGet } from "@/app/api/catalogo/[marca]/orders/route";
import { GET as ordenGet, PUT as ordenPut, DELETE as ordenDelete } from "@/app/api/catalogo/[marca]/orders/[id]/route";
import { PATCH as itemPatch } from "@/app/api/catalogo/[marca]/orders/[id]/item/route";
import { POST as envioPost } from "@/app/api/catalogo/[marca]/orders/[id]/enviar-switch/route";
import { GET as clientesGet, PATCH as clientesPatch } from "@/app/api/catalogo/[marca]/clientes-switch/route";
import { GET as vendedoresGet } from "@/app/api/catalogo/[marca]/vendedores-switch/route";
import { GET as unificadoGet } from "@/app/api/catalogo/[marca]/pedidos-unificado/route";
import { makeReq, TEST_SECRET } from "../helpers/catalogo-request";

beforeAll(() => {
  process.env.SESSION_SECRET = TEST_SECRET;
});

const OID = "33333333-3333-4333-8333-333333333333";
const SID = "ab12cd34";
const MARCA = "reebok";

/** Cada paso del flujo, con la llamada que le corresponde. `bodegaVe` marca el
 *  único que bodega también puede cruzar (leer la lista, 25-ago-2026). */
const PASOS: {
  nombre: string;
  llamar: (rol: string) => Promise<NextResponse>;
  bodegaVe?: boolean;
}[] = [
  {
    nombre: "convertir el pedido del link",
    llamar: (role) => convertirPost(makeReq("/x", { method: "POST", role }), { params: { marca: MARCA, short_id: SID } }),
  },
  {
    nombre: "ver la lista de pedidos",
    llamar: (role) => ordersGet(makeReq("/x", { role }), { params: { marca: MARCA } }),
    // 🔴 25-ago-2026: la ÚNICA puerta de este flujo que bodega también cruza.
    // Daniel: *"Dale acceso a bodega a la lista de pedidos."* Es LEER, y solo
    // eso — los otros 7 pasos escriben y le siguen contestando 403.
    bodegaVe: true,
  },
  {
    nombre: "editar el pedido (agregar/quitar líneas, precio)",
    llamar: (role) => ordenPut(makeReq("/x", { method: "PUT", role, body: { comment: "x" } }), { params: { marca: MARCA, id: OID } }),
  },
  {
    nombre: "cambiar la cantidad/precio de una línea",
    llamar: (role) => itemPatch(makeReq("/x", { method: "PATCH", role, body: { itemId: "i1", quantity: 2 } }), { params: { marca: MARCA, id: OID } }),
  },
  {
    nombre: "ver el directorio de clientes de Switch",
    llamar: (role) => clientesGet(makeReq("/x", { role }), { params: { marca: MARCA } }),
  },
  {
    nombre: "asignarle el cliente al pedido",
    llamar: (role) => clientesPatch(makeReq("/x", { method: "PATCH", role, body: { orderId: OID, clienteSwitchId: 1 } }), { params: { marca: MARCA } }),
  },
  {
    nombre: "elegir el vendedor",
    llamar: (role) => vendedoresGet(makeReq("/x", { role }), { params: { marca: MARCA } }),
  },
  {
    nombre: "mandarlo a Switch",
    llamar: (role) => envioPost(makeReq("/x", { method: "POST", role }), { params: { marca: MARCA, id: OID } }),
  },
];

/** Lo que NO se abrió: destructivo o del panel del admin. */
const NO_ABIERTOS: { nombre: string; llamar: (rol: string) => Promise<NextResponse> }[] = [
  {
    nombre: "borrar un pedido interno",
    llamar: (role) => ordenDelete(makeReq("/x", { method: "DELETE", role }), { params: { marca: MARCA, id: OID } }),
  },
  {
    nombre: "borrar la fila del link",
    llamar: (role) => publicoDelete(makeReq("/x", { method: "DELETE", role }), { params: { marca: MARCA, short_id: SID } }),
  },
  {
    nombre: "la lista unificada del panel de admin",
    llamar: (role) => unificadoGet(makeReq("/x", { role }), { params: { marca: MARCA } }),
  },
];

beforeEach(() => {
  vi.clearAllMocks();
  reebokDb = makeDb();
  joybeesDb = makeDb();
  mainDb = makeDb();
});

describe("el flujo del pedido del link, rol por rol", () => {
  for (const paso of PASOS) {
    it(`🔴 VENDEDOR puede: ${paso.nombre}`, async () => {
      const res = await paso.llamar("vendedor");
      // Lo que se prueba es que NO lo frena el rol. Sin datos sembrados el
      // handler puede contestar 404/400/500 — eso es otro asunto y lo cubren
      // los arneses de paridad.
      expect([401, 403]).not.toContain(res.status);
    });

    if (paso.bodegaVe) {
      it(`🔴 BODEGA sí puede (solo mirar): ${paso.nombre}`, async () => {
        const res = await paso.llamar("bodega");
        expect([401, 403]).not.toContain(res.status);
      });
    } else {
      it(`🔴 BODEGA no puede: ${paso.nombre}`, async () => {
        const res = await paso.llamar("bodega");
        expect(res.status).toBe(403);
      });
    }

    it(`sin sesión no se puede: ${paso.nombre}`, async () => {
      const res = await paso.llamar("");
      expect([401, 403]).toContain(res.status);
    });

    for (const rol of ["admin", "secretaria"]) {
      it(`${rol} puede: ${paso.nombre}`, async () => {
        const res = await paso.llamar(rol);
        expect([401, 403]).not.toContain(res.status);
      });
    }
  }

  // ⚠️ HALLAZGO PRE-EXISTENTE, NO SE TOCÓ Y SE DEJA ESCRITO.
  //
  // `GET /orders/[id]` (el detalle) NO mira el rol: le alcanza con que haya
  // sesión (`if (!session) → 401`). O sea que bodega y contabilidad pueden
  // LEER un pedido por URL, aunque la lista les responda 403 y no tengan de
  // dónde sacar el id.
  //
  // NO se cerró en este PR a propósito: es anterior a este cambio, cerrarlo es
  // QUITAR un permiso que nadie pidió quitar, y este PR es sobre quién puede
  // trabajar un pedido del link. **Bodega no gana nada acá: ya lo tenía.**
  // Queda escrito para que se decida aparte, y el test fija el estado real —
  // si mañana alguien lo cierra, este test se lo dice.
  it("⚠️ el detalle GET solo exige sesión (hallazgo pre-existente, sin tocar)", async () => {
    expect((await ordenGet(makeReq("/x"), { params: { marca: MARCA, id: OID } })).status).toBe(401);
    for (const rol of ["admin", "secretaria", "vendedor", "bodega", "contabilidad"]) {
      const res = await ordenGet(makeReq("/x", { role: rol }), { params: { marca: MARCA, id: OID } });
      expect([401, 403]).not.toContain(res.status);
    }
  });

  for (const paso of NO_ABIERTOS) {
    it(`🔴 el VENDEDOR sigue SIN poder: ${paso.nombre}`, async () => {
      expect((await paso.llamar("vendedor")).status).toBe(403);
    });
    it(`🔴 BODEGA sigue sin poder: ${paso.nombre}`, async () => {
      expect((await paso.llamar("bodega")).status).toBe(403);
    });
    it(`admin sí puede: ${paso.nombre}`, async () => {
      const res = await paso.llamar("admin");
      expect([401, 403]).not.toContain(res.status);
    });
  }
});
