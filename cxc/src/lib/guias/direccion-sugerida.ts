// ─────────────────────────────────────────────────────────────────────────────
// LA DIRECCIÓN DEL CLIENTE, COMO PRIMERA OPCIÓN.
//
// Daniel, textual: *«Ponerla sola, pero sí como primera opción.»* — o sea que la
// última dirección de ese cliente aparezca ARRIBA DE TODO en la lista de
// sugerencias, lista para tomarla de un toque. ~~No se escribe sola en el
// campo~~, y el campo sigue siendo editable sin trabar nada.
//
// ⚠️ La regla tachada la quitó DANIEL el 4-sep-2026: *«"la dirección no se
// escribe sola" me refería a que el usuario no lo haga para no escribirlo mal
// como lo vimos, quita esa regla. Que se autollene como lo discutimos
// antes.»* El autollenado (UN solo destino → se llena al elegir el cliente)
// vive en `destinoParaAutollenar` (`destinos-clientes.ts`); este módulo sigue
// alimentando el datalist de sugerencias y no cambió.
//
// EL DATO, medido contra producción el 14-ago-2026 (491 envíos vivos, 200
// guías desde el 25-mar):
//   · 380 envíos están atados a un cliente del directorio (cliente_codigo D-XXX)
//   · 47 clientes atados · **37 de ellos tienen UNA SOLA dirección** en toda su
//     historia
//   · "la dirección anterior de ese cliente acierta": **267 de 333 = 80,2%**
//   · 78 direcciones distintas en 491 envíos, y 5 cubren la mayoría:
//     Paso Canoas 192 · David 98 · Santiago 26 · Changinola 21 · Guabito 11
//
// ⚠️ ESTO NO APLICA A LA EMPRESA, Y ESTÁ MEDIDO. Con el mismo método, "la
// empresa anterior de ese cliente acierta" da **114 de 333 = 34,2%**:
// autocompletarla metería el dato equivocado en dos de cada tres envíos. La
// empresa es POR ENVÍO, no por cliente ni por guía. No se toca.
//
// ⚠️ SOLO POR `cliente_codigo`, no por nombre escrito a mano. Por nombre
// normalizado el acierto baja a 67,2% (252/375) y además el mismo negocio se
// escribe de varias formas ("City Mall" / "City Mall Paso Canoa"). El código lo
// pone el selector del directorio: cuando está, es inequívoco.
// ─────────────────────────────────────────────────────────────────────────────

export interface EnvioParaDireccion {
  guia_id: string;
  cliente_codigo?: string | null;
  direccion?: string | null;
  deleted?: boolean | null;
}

export interface GuiaParaDireccion {
  id: string;
  fecha?: string | null;
  numero?: number | null;
  deleted?: boolean | null;
}

/**
 * Para cada cliente del directorio, la ÚLTIMA dirección a la que se le despachó.
 *
 * ⚠️ "Última" es cronológica, y `guia_items` no tiene fecha propia (sus columnas
 * son id, guia_id, orden, cliente, direccion, empresa, facturas, bultos,
 * numero_guia_transp, deleted, cliente_codigo). La fecha vive en la GUÍA, así
 * que se ordena por `fecha` y se desempata por `numero` — dos guías del mismo
 * día se ordenan por el número, que es correlativo. Ordenar por `id` sería
 * ordenar por un uuid, o sea por nada.
 */
export function ultimaDireccionPorCliente(
  envios: readonly EnvioParaDireccion[],
  guias: readonly GuiaParaDireccion[],
): Record<string, string> {
  const orden = new Map<string, number>();
  const fecha = new Map<string, string>();
  for (const g of guias) {
    if (g.deleted) continue;
    fecha.set(g.id, String(g.fecha ?? "").slice(0, 10));
    orden.set(g.id, Number(g.numero ?? 0));
  }

  // codigo → { direccion, fecha, numero } del envío más reciente visto.
  const mejor = new Map<string, { direccion: string; f: string; n: number }>();
  for (const e of envios) {
    if (e.deleted) continue;
    const codigo = String(e.cliente_codigo ?? "").trim();
    const direccion = String(e.direccion ?? "").trim();
    if (!codigo || !direccion) continue;
    // Una guía borrada (o inexistente) no aporta: su envío no se despachó nunca.
    if (!fecha.has(e.guia_id)) continue;
    const f = fecha.get(e.guia_id) as string;
    const n = orden.get(e.guia_id) ?? 0;
    const actual = mejor.get(codigo);
    if (!actual || f > actual.f || (f === actual.f && n >= actual.n)) {
      mejor.set(codigo, { direccion, f, n });
    }
  }

  const salida: Record<string, string> = {};
  for (const [codigo, v] of mejor) salida[codigo] = v.direccion;
  return salida;
}

const clave = (s: string) => s.trim().toUpperCase().replace(/\s+/g, " ");

/**
 * La lista de sugerencias con la dirección del cliente PRIMERA, sin repetirla
 * más abajo. Sin dirección conocida devuelve la lista de siempre, tal cual.
 *
 * 🔴 Devuelve una LISTA, no un valor elegido: quien la usa no tiene de dónde
 * deducir "escribí esto en el campo". Lo que Daniel pidió es que aparezca
 * primera, no que se escriba sola.
 */
export function sugerenciasDireccion(
  ultimaDelCliente: string | null | undefined,
  listaBase: readonly string[],
): string[] {
  const primera = String(ultimaDelCliente ?? "").trim();
  const base = listaBase.map((d) => String(d ?? "").trim()).filter(Boolean);
  if (!primera) return dedupe(base);
  return dedupe([primera, ...base]);
}

function dedupe(lista: readonly string[]): string[] {
  const vistas = new Set<string>();
  const salida: string[] = [];
  for (const d of lista) {
    const k = clave(d);
    if (!k || vistas.has(k)) continue;
    vistas.add(k);
    salida.push(d);
  }
  return salida;
}
