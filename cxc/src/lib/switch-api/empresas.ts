/**
 * Configuración multi-empresa del sync Switch.
 *
 * Dos cosas:
 *   1. SWITCH_EMPRESA_ENV_MAP — empresa_key canónica (empresa-mapping.ts) →
 *      namespace de env vars SWITCH_<X>_API_*. Preserva los nombres que armó
 *      Daniel (Vistana queda VISTANA_INTERNATIONAL; Multifashion queda
 *      MULTIFASHION aunque su empresa_key sea american_classic). El cliente
 *      resuelve vía esta tabla en vez de derivar el env key del empresa_key.
 *   2. EMPRESA_SYNC_CAPABILITIES — qué sincroniza cada empresa:
 *      - facturas → switch_facturas. Multifashion=true: alimenta switch_facturas,
 *        ÚNICA fuente viva del tab Multifashion (vía _multifashion_sf_vw). Su
 *        tabla legacy multifashion_tickets quedó CONGELADA el 26-jul-2026.
 *      - cxc → switch_estadocuenta. Boston=false (su CXC se maneja por otro lado,
 *        probablemente Brand It).
 *      - recibos → switch_recibos.
 *      - utilidad → switch_factura_utilidad.
 *
 * ESTA TABLA ES LA FUENTE ÚNICA. Antes cada sync llevaba su propio array de
 * empresas escrito a mano (`RECIBOS_EMPRESA_KEYS` en sync-recibos.ts,
 * `B2B_COMISION_KEYS` en sync-utilidad.ts) y esos arrays se contradecían con
 * `B2B_EMPRESA_KEYS` sin que nada lo notara: `joystep` estaba en B2B_EMPRESA_KEYS
 * (o sea, tenía CXC y pestaña de comisiones) pero NO en el sync de recibos ni en
 * el de utilidad, desde el commit que creó cada sync. Resultado medido el
 * 27-jul-2026: $15.262,00 de cobros de julio invisibles, comisión de julio en
 * $0,00 con 0 vendedores, y $60.606,37 de cartera cuyos clientes nunca mostraban
 * "último pago". Una contradicción silenciosa entre dos listas paralelas es
 * exactamente el defecto que esta tabla elimina: ahora los syncs DERIVAN sus
 * empresas de acá, y `empresa-capabilities.test.ts` hace fallar el build si
 * alguna lista vuelve a apartarse (ver los invariantes ahí).
 */

import type { EmpresaKey } from "@/lib/empresa-mapping";

export const SWITCH_EMPRESA_ENV_MAP: Record<EmpresaKey, string> = {
  american_classic: "MULTIFASHION",
  vistana: "VISTANA_INTERNATIONAL",
  fashion_wear: "FASHION_WEAR",
  fashion_shoes: "FASHION_SHOES",
  active_shoes: "ACTIVE_SHOES",
  active_wear: "ACTIVE_WEAR",
  joystep: "JOYSTEP",
  confecciones_boston: "CONFECCIONES_BOSTON",
};

export interface EmpresaSyncCapability {
  /** Sincroniza facturas a switch_facturas. */
  facturas: boolean;
  /** Sincroniza estado de cuenta (CXC) a switch_estadocuenta. */
  cxc: boolean;
  /** Sincroniza CxP (proveedores + estado de cuenta) a switch_proveedor_estadocuenta.
   *  SEPARADO de cxc: Multifashion paga proveedores en Switch (cxp:true) pero es
   *  retail sin CXC central (cxc:false); Boston no tiene ninguno de los dos. */
  cxp: boolean;
  /** Sincroniza recibos (cobros) a switch_recibos.
   *  Alimenta el "último pago" del CXC y la base de comisión sobre cobro.
   *  INVARIANTE: toda empresa con `cxc: true` tiene que tener `recibos: true` —
   *  una cartera abierta sin recibos es una ficha de cliente que nunca puede
   *  decir cuándo pagó. Multifashion es el caso al revés y es legítimo
   *  (cxc:false, recibos:true): es retail, no lleva cuenta corriente, pero sus
   *  cobros de mostrador sí se registran. Lo hace cumplir un test. */
  recibos: boolean;
  /** Sincroniza el reporte de utilidad por documento a switch_factura_utilidad.
   *  Es el insumo de la comisión sobre VENTA (solo comisionan los documentos con
   *  utilidad > 20%). Requiere credenciales del login WEB de Switch
   *  (SWITCH_<ENVKEY>_WEB_USER / _WEB_PASSWORD): sin ellas el sync falla en el
   *  paso de config, NO en silencio. */
  utilidad: boolean;
}

export const EMPRESA_SYNC_CAPABILITIES: Record<EmpresaKey, EmpresaSyncCapability> = {
  // facturas:true → switch_facturas recibe facturas+NCs+NDs de Multifashion para
  // que las vistas unificadas cubran las 8 empresas (fase 2). cxc:false (retail,
  // sin CXC central).
  // La tabla legacy multifashion_tickets se CONGELÓ el 26-jul-2026 (su cron se
  // retiró; los datos quedan). Ya no hay dos fuentes vivas de MF, pero sigue
  // valiendo la regla del tab: el Resumen del grupo cuenta a american_classic UNA
  // vez. Ver el comentario en src/lib/ventas/queries.ts (RETAIL_KEYS).
  // MF: retail sin CXC central (cxc:false) PERO sí paga proveedores en Switch
  // (cxp:true, verificado: 13 proveedores / $77K en /apiproveedor) → su CxP entra a
  // switch_proveedor_estadocuenta como las B2B.
  // MF: recibos:true (sus cobros de mostrador sí se registran, 26.463 filas) pero
  // utilidad:false — es retail, no tiene vendedores con comisión sobre venta.
  american_classic: { facturas: true, cxc: false, cxp: true, recibos: true, utilidad: false },
  vistana: { facturas: true, cxc: true, cxp: true, recibos: true, utilidad: true },
  fashion_wear: { facturas: true, cxc: true, cxp: true, recibos: true, utilidad: true },
  fashion_shoes: { facturas: true, cxc: true, cxp: true, recibos: true, utilidad: true },
  active_shoes: { facturas: true, cxc: true, cxp: true, recibos: true, utilidad: true },
  active_wear: { facturas: true, cxc: true, cxp: true, recibos: true, utilidad: true },
  // joystep ENCENDIDO en recibos y utilidad el 27-jul-2026 (aprobado por Daniel:
  // "fue un olvido"). Es B2B con CXC (cxc:true, $60.606,37 de cartera abierta) y
  // con pestaña de comisiones, así que estar fuera de estos dos syncs nunca tuvo
  // una razón — no había ni un comentario que la explicara. Ver el encabezado.
  joystep: { facturas: true, cxc: true, cxp: true, recibos: true, utilidad: true },
  // Boston: solo ventas. CXC por otro lado (Brand It) y su CxP NO se quiere (cxp:false).
  // recibos:false y utilidad:false NO son un olvido, son la misma decisión: su
  // cuenta por cobrar entera vive fuera de este sistema, así que traer sus cobros
  // acá poblaría un "último pago" que no le corresponde a ninguna cartera nuestra
  // y una base de comisión de vendedores que este sistema no liquida. Tiene 125
  // recibos / $35.338,99 en julio 2026 que quedan fuera A PROPÓSITO.
  confecciones_boston: { facturas: true, cxc: false, cxp: false, recibos: false, utilidad: false },
};

const ALL_KEYS = Object.keys(EMPRESA_SYNC_CAPABILITIES) as EmpresaKey[];

/** Empresas cuyas facturas van a switch_facturas (incluye Multifashion/american_classic). */
export function empresasConFacturas(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].facturas);
}

/** Empresas cuyo estado de cuenta va a switch_estadocuenta (excluye Boston y MF). */
export function empresasConCxc(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].cxc);
}

/** Empresas cuyo CxP (proveedores) va a switch_proveedor_estadocuenta: las 6 B2B
 *  + Multifashion (american_classic). Excluye Boston. */
export function empresasConCxp(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].cxp);
}

/** Empresas cuyos recibos (cobros) van a switch_recibos: las 6 B2B +
 *  Multifashion. Excluye Boston (su CXC se lleva fuera de este sistema).
 *  Fuente de `RECIBOS_EMPRESA_KEYS` — no duplicar la lista. */
export function empresasConRecibos(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].recibos);
}

/** Empresas cuyo reporte de utilidad va a switch_factura_utilidad: las 6 B2B.
 *  Excluye Multifashion (retail, sin comisión sobre venta) y Boston.
 *  Fuente de `B2B_COMISION_KEYS` — no duplicar la lista. */
export function empresasConUtilidad(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].utilidad);
}

export function isEmpresaKey(s: string): s is EmpresaKey {
  return Object.prototype.hasOwnProperty.call(EMPRESA_SYNC_CAPABILITIES, s);
}

/**
 * Resuelve el namespace de env vars para una empresa.
 * Acepta tanto la empresa_key canónica ("american_classic", "vistana") como
 * un env key directo ("multifashion") por compatibilidad con llamadas viejas.
 */
export function resolveSwitchEnvKey(empresaKey: string): string {
  if (isEmpresaKey(empresaKey)) return SWITCH_EMPRESA_ENV_MAP[empresaKey];
  return empresaKey.toUpperCase().replace(/-/g, "_");
}
