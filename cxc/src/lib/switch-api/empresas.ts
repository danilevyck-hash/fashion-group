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
  /** La cartera de esta empresa es CARTERA DEL GRUPO: entra al CXC consolidado,
   *  al aging del grupo, a los totales y a las comisiones. Es la lista que
   *  `B2B_EMPRESA_KEYS` tiene que espejar.
   *
   *  ⚠️ NO confundir con `estadoCuenta`. Desde el 27-jul-2026 son dos cosas
   *  distintas: `estadoCuenta` dice si TRAEMOS sus saldos a la base;
   *  `cxc` dice si esos saldos SE SUMAN a los del grupo. Boston tiene
   *  `estadoCuenta: true` y `cxc: false` — vemos su cartera, en su propia
   *  pestaña, y no se mezcla con nada. Ver `empresasCarteraAparte()`. */
  cxc: boolean;
  /** Sincroniza el estado de cuenta (saldos por documento) a switch_estadocuenta.
   *  INVARIANTE: `cxc: true` obliga a `estadoCuenta: true` — no se puede ser
   *  cartera del grupo sin traer los saldos. Al revés SÍ se puede y es el caso
   *  de Boston: traemos sus saldos para mostrarlos aparte, sin que cuenten como
   *  cartera del grupo. Lo hace cumplir un test. */
  estadoCuenta: boolean;
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
  american_classic: { facturas: true, cxc: false, estadoCuenta: false, cxp: true, recibos: true, utilidad: false },
  vistana: { facturas: true, cxc: true, estadoCuenta: true, cxp: true, recibos: true, utilidad: true },
  fashion_wear: { facturas: true, cxc: true, estadoCuenta: true, cxp: true, recibos: true, utilidad: true },
  fashion_shoes: { facturas: true, cxc: true, estadoCuenta: true, cxp: true, recibos: true, utilidad: true },
  active_shoes: { facturas: true, cxc: true, estadoCuenta: true, cxp: true, recibos: true, utilidad: true },
  active_wear: { facturas: true, cxc: true, estadoCuenta: true, cxp: true, recibos: true, utilidad: true },
  // joystep ENCENDIDO en recibos y utilidad el 27-jul-2026 (aprobado por Daniel:
  // "fue un olvido"). Es B2B con CXC (cxc:true, $60.606,37 de cartera abierta) y
  // con pestaña de comisiones, así que estar fuera de estos dos syncs nunca tuvo
  // una razón — no había ni un comentario que la explicara. Ver el encabezado.
  joystep: { facturas: true, cxc: true, estadoCuenta: true, cxp: true, recibos: true, utilidad: true },
  // ─── Boston: CARTERA APARTE (aprobado por Daniel, 27-jul-2026) ──────────────
  // `estadoCuenta: true` + `recibos: true` → traemos sus saldos y sus cobros.
  // `cxc: false` → esa plata NO es cartera del grupo: no se suma a ningún total,
  // no entra al aging consolidado ni a las comisiones. Se ve SOLO en su pestaña.
  //
  // Antes era `estadoCuenta/recibos: false` porque su cuenta corriente se lleva
  // en Brand It. Sigue siendo así — Brand It manda —, pero Daniel quiere PODER
  // VERLA sin que se mezcle. La regla que puso, textual: *"si un cliente esta en
  // el grupo de 6 empresas y mismo cliente en conf boston, quiero q no se toque"*.
  // No es hipotético: hay 10 clientes en los dos lados (CITY MALL DAVID, LA
  // FRONTERA DUTY FREE, EL MACHETAZO-CALIDONIA, GOLDEN MALL...) y el CXC agrupa
  // por NOMBRE, así que se sumarían solos si Boston entrara al grupo.
  //
  // Medido el 27-jul-2026 y CUADRADO al centavo contra el reporte "Estado de
  // cuenta - Antiguedad" de Switch (392 clientes, los 8 tramos, cliente por
  // cliente, 0 diferencias):
  //   cartera abierta $224.749,88 · 392 clientes con saldo
  //   0-90d $97.354,17 · 91-120d $8.843,93 · +121d $118.551,78 (53%)
  //   cobros 7.316 recibos desde oct-2022; julio 2026: 126 / $35.392,49
  //
  // ⚠️ Boston tiene 4.911 clientes en el maestro de Switch (contra 127 con saldo
  // en las 6 B2B juntas). El sync recorre cliente por cliente a ~604 ms → ~49 min,
  // muy por encima del techo de la función: va por TANDAS. No estimar este costo
  // a partir de los clientes con factura (1.951): 30 clientes tienen SOLO saldo a
  // favor, sin ninguna factura, y valen -$4.685,76.
  //
  // `cxp: false` y `utilidad: false` NO cambian: su CxP no se quiere, y no tiene
  // comisiones en este sistema (nunca las tuvo; encenderlas crearía de la nada
  // una liquidación de vendedores que Fashion Group no paga).
  confecciones_boston: { facturas: true, cxc: false, estadoCuenta: true, cxp: false, recibos: true, utilidad: false },
};

const ALL_KEYS = Object.keys(EMPRESA_SYNC_CAPABILITIES) as EmpresaKey[];

/** Empresas cuyas facturas van a switch_facturas (incluye Multifashion/american_classic). */
export function empresasConFacturas(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].facturas);
}

/**
 * CARTERA DEL GRUPO: las 6 B2B. Es "qué suma en el CXC consolidado", NO "de
 * quién traemos saldos" — para eso está `empresasConEstadoCuenta()`.
 *
 * Todo total, aging, alerta o comisión del grupo se acota con ESTA lista.
 * `B2B_EMPRESA_KEYS` tiene que ser exactamente igual (lo fija un test).
 */
export function empresasConCxc(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].cxc);
}

/**
 * Empresas cuyos saldos se sincronizan a switch_estadocuenta: las 6 B2B +
 * confecciones_boston. Es la lista del SYNC, no la del grupo.
 */
export function empresasConEstadoCuenta(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].estadoCuenta);
}

/**
 * Empresas cuyo estado de cuenta NO se sincroniza por CRON, aunque su capability
 * `estadoCuenta` siga en true.
 *
 * 🔴 `confecciones_boston` — NO CABE en una función serverless (30-jul-2026).
 * `syncEmpresaEstadoCuenta` hace **una llamada HTTP por cliente** y boston tiene
 * **4.912 clientes** (las demás empresas: 136-139). Su ÚNICO run exitoso de la
 * historia tardó **3.240 s (54 min)** y fue un `triggered_by='backfill'` local;
 * el techo de la función es **800 s** (`FUNCTION_MAX_DURATION_S`). O sea que cada
 * corrida programada **muere siempre**, y un proceso matado no ejecuta `finally`:
 * no deja heartbeat NI alerta. Eso mataba el slot `switch-sync:all-0630`
 * (arrastrando a american_classic, que en el MISMO run sincronizaba bien) y
 * quemaba ~13 min de función 4 veces al día para nada.
 *
 * **Por qué una lista aparte y NO `estadoCuenta: false`:** la capability dice
 * "traemos sus saldos", y eso sigue siendo verdad — la pestaña de Boston lee las
 * 1.067 filas ya cargadas, y el sync manual y el arreglo definitivo la necesitan.
 * Apagar la bandera desharía lo que aprobó el #347. Esta lista dice algo más
 * chico y más honesto: *por cron, todavía no*.
 *
 * ✅ **RESUELTO por otro camino el 30-jul-2026: `/api/cron/boston-cartera`.**
 * Su cartera ya NO está congelada — se trae del **reporte WEB del panel**
 * (`Reportes → Estado de cuenta → Antigüedad`), que devuelve TODOS los
 * documentos abiertos en 2 llamadas (~3 s medidos) en vez de 4.912. Escribe la
 * misma tabla con la misma forma de fila, así que la pestaña y
 * `switch_estadocuenta_aging_boston` no cambian. Ver
 * `src/lib/switch-api/sync-estadocuenta-web.ts`.
 *
 * **Boston SIGUE en esta lista, y es correcto:** la lista dice "el estadocuenta
 * POR API no corre por cron para esta empresa", y eso no cambió — ese camino
 * sigue sin caber en la función. Sacarla de acá volvería a meter a Boston en el
 * bloque `all-0630` y en los pares de la reconciliación, que es exactamente lo
 * que mataba 4 corridas por día. El sync manual y el backfill la siguen
 * aceptando.
 *
 * 🩸 **EL DAÑO COLATERAL QUE NADIE VIO EN 37 DÍAS (5-sep-2026).** Sacar a Boston
 * de este cron no solo dejó su cartera afuera: el sync de estado de cuenta era
 * también el ÚNICO escritor del DIRECTORIO de clientes (`switch_clientes`), que
 * viajaba adentro. La cartera se rescató el 30-jul por el reporte web; el
 * directorio se quedó atrás en silencio. Medido: las 4.915 filas de Boston en
 * `switch_clientes` tenían todas el mismo `synced_at` —**2026-07-30
 * 06:31:07**—, que es el `runStamp` de la última corrida de este cron que
 * alcanzó a escribirlo antes de morir en el recorrido por cliente. El día que
 * Boston salió de acá es el día exacto en que su directorio se congeló.
 *
 * ✅ Resuelto por `/api/cron/sync-clientes-boston` (SEMANAL, domingos 07:10 UTC):
 * pide solo `/apicliente/lista` —99 páginas, no 4.912 llamadas— y escribe el
 * directorio con el MISMO código (`clientes-directorio.ts`, un solo escritor).
 * Y ahora sí se vigila: la alerta B de `silencio-de-datos.ts` mira
 * `switch_clientes` de Boston con umbral semanal.
 *
 * **El problema del reconcile que hacía imposible partirlo en tandas** —el
 * `saldo = 0` a TODA la empresa por `synced_at < runStamp`, que hacía que cada
 * tanda borrara lo que cargó la anterior— **desaparece por construcción** con el
 * reporte web: el universo llega COMPLETO en una sola respuesta, así que "no
 * vino en el reporte" sí significa "ya no debe". Las guardas que sostienen esa
 * premisa (reporte vacío ⇒ no se escribe ni se reconcilia; cuadre contra los
 * totales que publica Switch antes de escribir) están en ese archivo.
 */
export const EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON: readonly EmpresaKey[] = [
  "confecciones_boston",
];

/**
 * Empresas cuyo estado de cuenta sí se sincroniza por CRON. Es la lista que
 * tienen que usar el cron `switch-sync` (tipo=all) y la reconciliación: pedir
 * trabajo que provablemente no puede terminar no es vigilancia, es ruido.
 */
export function empresasConEstadoCuentaEnCron(): EmpresaKey[] {
  return empresasConEstadoCuenta().filter(
    (k) => !EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON.includes(k),
  );
}

/**
 * Empresas cuyos EGRESOS VARIOS no se bajan por CRON.
 *
 * 🔴 `confecciones_boston` — LO PIDIÓ DANIEL, 13-ago-2026, textual: *"ve
 * avanzando con todas menos boston, ese usuario es mio y no entrare"*.
 *
 * El login web de Egresos Varios usa `changesession="SI"`, que TOMA la sesión y
 * EXPULSA a quien esté en el panel de esa empresa. En Boston el usuario
 * configurado es el de Daniel y él **sí** trabaja ahí, así que una corrida
 * automática le arrebataría la sesión sin que nadie se lo pida.
 *
 * ⚠️ **BOSTON NO SE RETIRA DEL MÓDULO.** Dos mensajes antes, Daniel dijo *"si
 * quiero ver gastos de boston"*: su pestaña sigue existiendo, sigue mostrando lo
 * que tenga del mayor, y `EGRESOS_EMPRESA_KEYS` sigue siendo las 8. Lo único que
 * se apaga es la DESCARGA automática — el sync MANUAL
 * (`/api/cron/sync-egresos-varios?empresas=confecciones_boston`) la sigue
 * aceptando, para el día que él quiera traerla a propósito.
 *
 * **Lista explícita y no un `if` suelto**, igual que
 * `EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON`: es una decisión de negocio con nombre y
 * motivo, no una condición perdida dentro de un route. Y por la misma razón NO
 * es una capability: la capability diría "de esta empresa no traemos egresos", y
 * eso es falso — se pueden traer, solo que no solos.
 *
 * **El vigía no la reporta como caída:** el heartbeat de `sync-egresos-varios`
 * es del CRON, no del par empresa; y `SWITCH_CRON_ENTRADAS` declara para esa
 * entrada exactamente las empresas que corre, así que Boston tampoco aparece en
 * el cronograma de sesión única.
 */
export const EMPRESAS_EGRESOS_FUERA_DE_CRON: readonly EmpresaKey[] = [
  "confecciones_boston",
];

/** Las empresas a las que el cron de egresos varios SÍ entra: las 7 que no son
 *  Boston. Es la lista por defecto del cron; el módulo sigue mostrando las 8. */
export function empresasConEgresosEnCron(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => !EMPRESAS_EGRESOS_FUERA_DE_CRON.includes(k));
}

/**
 * Empresas de las que traemos cartera pero que NO son cartera del grupo:
 * hoy, solo `confecciones_boston`. Su plata se muestra en su propia pestaña y
 * no se suma con nada.
 *
 * Es la lista que la vista `switch_estadocuenta_aging` EXCLUYE. La vista no
 * puede importar TypeScript, así que repite estas keys en su SQL y
 * `boston-no-se-mezcla.test.ts` compara las dos: si alguien agrega una empresa
 * acá y no toca la migración, el build se pone rojo (y al revés).
 */
export function empresasCarteraAparte(): EmpresaKey[] {
  return ALL_KEYS.filter(
    (k) => EMPRESA_SYNC_CAPABILITIES[k].estadoCuenta && !EMPRESA_SYNC_CAPABILITIES[k].cxc,
  );
}

/** Empresas cuyo CxP (proveedores) va a switch_proveedor_estadocuenta: las 6 B2B
 *  + Multifashion (american_classic). Excluye Boston. */
export function empresasConCxp(): EmpresaKey[] {
  return ALL_KEYS.filter((k) => EMPRESA_SYNC_CAPABILITIES[k].cxp);
}

/** Empresas cuyos recibos (cobros) van a switch_recibos: las 8 — las 6 B2B,
 *  Multifashion y Confecciones Boston (`recibos: true` desde el PR #347, cuando
 *  su cartera entró al sistema en pestaña aparte; este comentario dijo «excluye
 *  Boston» hasta el 3-sep-2026).
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
