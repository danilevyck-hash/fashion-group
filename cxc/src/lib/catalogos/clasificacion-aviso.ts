// ─────────────────────────────────────────────────────────────────────────────
// EL CENTINELA DE LA CLASIFICACIÓN DEL CATÁLOGO
//
// Hermano de `src/lib/ventas/centinela-tipos.ts` (mismo problema, otra familia):
// un valor que Switch estrena y que ningún mapa clasifica **no puede valer un
// default en silencio**. Allá era un tipo de comprobante que caía al `ELSE 0`;
// acá es un `rubro`/`subrubro`/`marca` nuevo que mandaría el producto al cajón
// neutro. En los dos casos el sistema NO adivina: guarda lo honesto y AVISA.
//
// ═══ 🔑 POR QUÉ EL AVISO QUE HABÍA NO SERVÍA ═════════════════════════════════
// `reebok-gender.ts` tenía un `console.warn` para el género no contemplado. Ese
// código corre en el NAVEGADOR DEL CLIENTE que abre el catálogo público: el
// mensaje sale en una consola que nadie abre jamás. Un aviso que no llega a
// nadie no es un aviso, es una coartada. Este sale por 🔧 SISTEMA, al Telegram
// de Daniel, desde el servidor.
//
// ═══ 🔑 Y POR QUÉ UN CENTINELA DE "VALORES RAROS" NO ALCANZABA ═══════════════
// El bug que esto viene a cerrar **no escribía ningún valor raro**: escribía
// `footwear` y `male`, dos valores perfectamente válidos, en el 100% de las
// altas. Una mentira bien formada no la caza un centinela que busca lo
// desconocido. Por eso el candado de verdad no es este archivo sino el cajón
// neutro (`reebok-clasificacion.ts`) y su test: este centinela cubre el OTRO
// caso —Switch estrena un vocabulario— que es el que sí produce desconocidos.
//
// ═══ NO ESTRENA UNA ALERTA NUEVA ════════════════════════════════════════════
// La lista de alertas de SISTEMA es CERRADA. Esto entra en la **regla 2 — algo
// se rompió y no se arregló solo**: el producto se publica con el bulto y los
// filtros equivocados y **no se arregla solo** hasta que alguien toque Switch.
// Sale por `enviarSistema` (nadie llama `sendTelegramAlert` directo) y el texto
// dice qué pasó / qué significa / qué hacer, sin nombres de tabla ni HTTP.
//
// ═══ ANTI-LOOP ══════════════════════════════════════════════════════════════
// El catálogo corre 4×/día. Sin anti-loop, un rubro mal cargado que Daniel
// decida no corregir sonaría 4 veces por día para siempre — la alerta que suena
// para siempre que la poda de julio vino a eliminar. Se reusa
// `clavesYaAvisadasPorCampo` (`monto-guard-io.ts`), la MISMA lectura de
// `switch_sync_log.skip_details` que ya usan el guard de montos y el descarte de
// renglones ilegibles. Una sola forma de recordar lo ya avisado; dos se separan.
//
// NUNCA lanza: un centinela que puede tumbar el sync que vigila es peor que no
// tenerlo.
// ─────────────────────────────────────────────────────────────────────────────

import { enviarSistema } from "@/lib/alertas/canal";
import { clavesYaAvisadasPorCampo } from "@/lib/switch-api/monto-guard-io";
import { mapEmpresaName } from "@/lib/empresa-mapping";

/**
 * El `campo` con el que estos descartes viven en `switch_sync_log.skip_details`.
 * SIN DDL: la columna ya existe y cada familia la usa con su propio `campo`.
 */
export const CAMPO_SKIP_CLASIFICACION = "catalogo_clasificacion";

/** Cuántos valores distintos se nombran en el mensaje antes de resumir. */
const MAX_EN_MENSAJE = 5;

export interface ValorSinClasificar {
  campo: "rubro" | "subrubro" | "marca";
  valor: string;
  /** SKUs afectados (para poder ir a corregirlos en Switch). */
  skus: string[];
}

/**
 * Junta los desconocidos de TODA la corrida en una lista por (campo, valor).
 * PURA — para poder revisar la redacción y el agrupado sin base ni Telegram.
 *
 * Se agrupa por VALOR y no por producto a propósito: un rubro nuevo llega con
 * decenas de artículos encima y el trabajo a hacer en Switch es UNO, no
 * cuarenta. El mensaje tiene que decir "arreglá este rubro", no listar 40 SKUs.
 */
export function agruparSinClasificar(
  hallazgos: readonly { sku: string; campo: ValorSinClasificar["campo"]; valor: string }[],
): ValorSinClasificar[] {
  const porClave = new Map<string, ValorSinClasificar>();
  for (const h of hallazgos) {
    const k = `${h.campo}|${h.valor}`;
    const e = porClave.get(k) ?? { campo: h.campo, valor: h.valor, skus: [] };
    if (!e.skus.includes(h.sku)) e.skus.push(h.sku);
    porClave.set(k, e);
  }
  // Orden estable: primero lo que más productos afecta, y a igualdad por clave
  // — sin esto el mensaje cambia de forma entre corridas idénticas.
  return [...porClave.values()].sort(
    (a, b) => b.skus.length - a.skus.length || `${a.campo}|${a.valor}`.localeCompare(`${b.campo}|${b.valor}`),
  );
}

/** La clave con la que se recuerda un valor ya avisado (la que va a
 *  `skip_details.secuencial`). Una sola definición: el que escribe y el que
 *  lee tienen que coincidir o el anti-loop no recuerda nada. */
export const claveDeValor = (v: Pick<ValorSinClasificar, "campo" | "valor">): string =>
  `${v.campo}=${v.valor}`;

/** Los descartes listos para `switch_sync_log.skip_details` (mismo shape que
 *  los del guard de montos: `campo` + `secuencial` + `valorCrudo`). */
export function detallesDeClasificacion(valores: readonly ValorSinClasificar[]): unknown[] {
  return valores.map((v) => ({
    facturaId: null,
    secuencial: claveDeValor(v),
    campo: CAMPO_SKIP_CLASIFICACION,
    valorCrudo: { campo: v.campo, valor: v.valor, productos: v.skus.length, skus: v.skus.slice(0, 20) },
  }));
}

const NOMBRE_DEL_CAMPO: Record<ValorSinClasificar["campo"], string> = {
  rubro: "rubro",
  subrubro: "subrubro",
  marca: "marca",
};

/**
 * El texto del aviso. PURO — para poder revisar la redacción de un mensaje que
 * ojalá nunca salga. Habla de NEGOCIO: qué se ve mal en el catálogo y qué hay
 * que tocar en Switch.
 */
export function textoDelAviso(
  empresaKey: string,
  marca: string,
  valores: readonly ValorSinClasificar[],
): string {
  const aMostrar = valores.slice(0, MAX_EN_MENSAJE);
  const detalle = aMostrar
    .map((v) => `• ${NOMBRE_DEL_CAMPO[v.campo]} "${v.valor}" — ${v.skus.length} producto(s): ${v.skus.slice(0, 3).join(", ")}${v.skus.length > 3 ? "…" : ""}`)
    .join("\n");
  const extra = valores.length > MAX_EN_MENSAJE ? `\n…y ${valores.length - MAX_EN_MENSAJE} valor(es) más.` : "";
  return (
    `El catálogo de ${marca} recibió una clasificación que no conoce — ${mapEmpresaName(empresaKey)}\n${detalle}${extra}\n\n` +
    `Qué pasó: Switch mandó esos productos con un rubro, subrubro o marca que el catálogo no sabe traducir ` +
    `a una categoría o a un género.\n` +
    `Qué significa: esos productos quedan sin categoría y sin género. Se siguen viendo en "Todos", pero no ` +
    `salen bajo ningún filtro de Hombre/Mujer/Niños ni de Calzado/Ropa/Accesorios, y el bulto de un producto ` +
    `sin categoría se cobra de 6 y no de 12. Los que YA estaban clasificados conservan su clasificación.\n` +
    `Qué hacer: revisar esos artículos en Switch y ponerles el rubro y el subrubro que les corresponde.`
  );
}

/**
 * Avisa por 🔧 SISTEMA, UNA vez por valor nuevo. Nunca lanza.
 *
 * Fail-open igual que el guard de montos: si no se puede leer lo ya avisado, se
 * avisa — perder un aviso es peor que repetirlo.
 */
export async function avisarClasificacionDesconocida(opts: {
  empresaKey: string;
  syncType: string;
  marca: string;
  valores: readonly ValorSinClasificar[];
  logId: string | null;
}): Promise<void> {
  const { empresaKey, syncType, marca, valores, logId } = opts;
  if (valores.length === 0) return;

  // FAIL-OPEN, y en su propio try: si no se puede leer lo ya avisado, se avisa.
  // Perder un aviso es peor que repetirlo. Envolver la lectura junto con el
  // envío haría que un error de lectura CALLARA el aviso — el modo de fallo
  // opuesto al que este anti-loop viene a evitar.
  let ya = new Set<string>();
  try {
    ya = new Set(await clavesYaAvisadasPorCampo(CAMPO_SKIP_CLASIFICACION, empresaKey, syncType, logId));
  } catch (e) {
    console.error(`[clasificacion-aviso] ${empresaKey}: no pude leer lo ya avisado, aviso igual: ${String(e)}`);
  }

  const nuevos = valores.filter((v) => !ya.has(claveDeValor(v)));
  if (nuevos.length === 0) return; // ya se avisó por estos valores: no se repite

  try {
    await enviarSistema(textoDelAviso(empresaKey, marca, nuevos));
  } catch (e) {
    // El aviso es degradable; el sync sigue en success. Lo desconocido ya quedó
    // en skip_details, así que la auditoría no se pierde.
    console.error(`[clasificacion-aviso] ${empresaKey}: no pude avisar: ${String(e)}`);
  }
}
