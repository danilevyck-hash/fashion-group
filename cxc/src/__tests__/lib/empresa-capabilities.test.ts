/**
 * CANDADO de coherencia entre las listas de empresas.
 *
 * El 27-jul-2026 la certificación contra Switch encontró que `joystep` estaba
 * fuera del sync de RECIBOS y del de UTILIDAD desde el origen de cada módulo,
 * mientras `B2B_EMPRESA_KEYS` sí lo incluía (o sea: tenía CXC y pestaña de
 * comisiones). Nada en el sistema notó la contradicción porque eran tres arrays
 * escritos a mano en tres archivos distintos. Costo medido: $15.262,00 de cobros
 * de julio invisibles, comisión de julio en $0,00 con 0 vendedores y $60.606,37
 * de cartera cuyos clientes nunca mostraban "último pago".
 *
 * La cura estructural es EMPRESA_SYNC_CAPABILITIES como fuente única: los syncs
 * DERIVAN sus empresas de ahí. Este archivo es lo que impide que la contradicción
 * vuelva:
 *
 *   1. Las listas derivadas tienen que seguir derivadas (nadie las re-escribe
 *      a mano "por conveniencia").
 *   2. `B2B_EMPRESA_KEYS` no puede apartarse de las empresas con `cxc: true`.
 *      Vive en empresa-mapping.ts y NO puede derivarse en código sin crear un
 *      import circular (empresas.ts importa el tipo EmpresaKey de ahí), así que
 *      la coherencia se sostiene con este test — que es justamente lo que
 *      faltaba.
 *   3. Toda empresa con cartera (`cxc: true`) tiene que sincronizar recibos.
 *      ESTE es el invariante que habría cazado el agujero de joystep el día que
 *      se creó: una cartera abierta sin recibos es una ficha de cliente que
 *      nunca puede decir cuándo pagó.
 *   4. Las exclusiones que SÍ son intencionales quedan afirmadas por nombre, no
 *      implícitas: si alguien enciende Boston en recibos, este test lo frena y
 *      lo obliga a justificar el cambio.
 */
import { describe, it, expect, vi } from "vitest";

// Los módulos de sync crean el cliente de Supabase al importarse; este test solo
// mira sus listas de empresas, así que no necesita base.
vi.mock("@/lib/supabase-server", () => ({ supabaseServer: {} }));

import {
  EMPRESA_SYNC_CAPABILITIES,
  empresasConCxc,
  empresasConFacturas,
  empresasConRecibos,
  empresasConUtilidad,
} from "@/lib/switch-api/empresas";
import { ALL_EMPRESA_KEYS, B2B_EMPRESA_KEYS, type EmpresaKey } from "@/lib/empresa-mapping";
import { RECIBOS_EMPRESA_KEYS } from "@/lib/switch-api/sync-recibos";
import { B2B_COMISION_KEYS } from "@/lib/switch-api/sync-utilidad";
import {
  SYNC_NOW_FACTURAS_OPCIONES,
  SYNC_NOW_RECIBOS_OPCIONES,
} from "@/components/shared/syncNowOpciones";

const orden = (xs: readonly string[]) => [...xs].sort();

describe("EMPRESA_SYNC_CAPABILITIES es la fuente única", () => {
  it("cubre exactamente las 8 empresas del grupo", () => {
    expect(orden(Object.keys(EMPRESA_SYNC_CAPABILITIES))).toEqual(orden(ALL_EMPRESA_KEYS));
  });

  it("RECIBOS_EMPRESA_KEYS deriva de la capability `recibos`", () => {
    expect(orden(RECIBOS_EMPRESA_KEYS)).toEqual(orden(empresasConRecibos()));
  });

  it("B2B_COMISION_KEYS deriva de la capability `utilidad`", () => {
    expect(orden(B2B_COMISION_KEYS)).toEqual(orden(empresasConUtilidad()));
  });

  it("B2B_EMPRESA_KEYS no puede contradecir a las empresas con cxc:true", () => {
    // No se puede derivar en código (import circular): se cierra acá.
    expect(orden(B2B_EMPRESA_KEYS)).toEqual(orden(empresasConCxc()));
  });

  it("el menú de 'Actualizar ahora' ofrece exactamente las empresas que el server acepta", () => {
    // Era la CUARTA copia de estas listas y la única sin test: `RECIBOS_KEYS`
    // en syncNowOpciones.ts también omitía joystep, así que el menú ni siquiera
    // ofrecía la empresa. El comentario del archivo se consolaba con que "un
    // desfase solo produciría un 400 visible" — falso: no hay 400 que ver
    // cuando la opción no aparece en el menú.
    expect(orden(SYNC_NOW_RECIBOS_OPCIONES.map((o) => o.empresa!))).toEqual(orden(RECIBOS_EMPRESA_KEYS));
    expect(orden(SYNC_NOW_FACTURAS_OPCIONES.map((o) => o.empresa!))).toEqual(orden(empresasConFacturas()));
  });
});

describe("invariantes de negocio entre capabilities", () => {
  it("toda empresa con cartera (cxc:true) sincroniza recibos", () => {
    // Sin esto, sus clientes nunca muestran 'último pago' y su comisión sobre
    // cobro sale $0 — el agujero exacto de joystep. La implicación es en UN solo
    // sentido: american_classic es cxc:false y recibos:true a propósito (retail
    // sin cuenta corriente, pero con cobros de mostrador reales).
    const sinRecibos = empresasConCxc().filter((k) => !EMPRESA_SYNC_CAPABILITIES[k].recibos);
    expect(sinRecibos).toEqual([]);
  });

  it("toda empresa con utilidad también sincroniza facturas y recibos", () => {
    // La comisión se calcula sobre los tres insumos a la vez (utilidad, facturas
    // y recibos): encender uno solo produce números a medias, que es peor que
    // no tener el módulo.
    for (const k of empresasConUtilidad()) {
      expect(EMPRESA_SYNC_CAPABILITIES[k].facturas, `${k}.facturas`).toBe(true);
      expect(EMPRESA_SYNC_CAPABILITIES[k].recibos, `${k}.recibos`).toBe(true);
    }
  });
});

describe("qué está encendido y qué está apagado, por nombre", () => {
  it("joystep sincroniza recibos y utilidad (arreglo del 27-jul-2026)", () => {
    expect(RECIBOS_EMPRESA_KEYS).toContain("joystep" as EmpresaKey);
    expect(B2B_COMISION_KEYS).toContain("joystep" as EmpresaKey);
    expect(EMPRESA_SYNC_CAPABILITIES.joystep.recibos).toBe(true);
    expect(EMPRESA_SYNC_CAPABILITIES.joystep.utilidad).toBe(true);
  });

  it("confecciones_boston queda EXCLUIDO de recibos y utilidad, a propósito", () => {
    // Su CXC entera se lleva fuera de este sistema (cxc:false, va por Brand It).
    // Traer sus 125 recibos/mes acá poblaría un 'último pago' que no le
    // corresponde a ninguna cartera nuestra. Es coherencia, no olvido.
    expect(EMPRESA_SYNC_CAPABILITIES.confecciones_boston.cxc).toBe(false);
    expect(EMPRESA_SYNC_CAPABILITIES.confecciones_boston.recibos).toBe(false);
    expect(EMPRESA_SYNC_CAPABILITIES.confecciones_boston.utilidad).toBe(false);
    expect(RECIBOS_EMPRESA_KEYS).not.toContain("confecciones_boston" as EmpresaKey);
    expect(B2B_COMISION_KEYS).not.toContain("confecciones_boston" as EmpresaKey);
  });

  it("american_classic sincroniza recibos pero NO utilidad (retail)", () => {
    expect(RECIBOS_EMPRESA_KEYS).toContain("american_classic" as EmpresaKey);
    expect(B2B_COMISION_KEYS).not.toContain("american_classic" as EmpresaKey);
  });

  it("recibos = 7 empresas, utilidad = 6 (las B2B)", () => {
    expect(RECIBOS_EMPRESA_KEYS).toHaveLength(7);
    expect(B2B_COMISION_KEYS).toHaveLength(6);
  });
});
