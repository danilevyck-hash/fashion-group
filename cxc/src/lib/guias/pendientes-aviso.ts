// ─────────────────────────────────────────────────────────────────────────────
// Aviso: guías que llevan días sin despachar.
//
// 🩸 POR QUÉ EXISTE. El 3-ago-2026 Daniel preguntó por qué no le llegó el aviso
// de un despacho. La respuesta fue que la guía nunca se cerró — y al mirar la
// lista aparecieron **55 guías en "Pendiente Bodega"**, algunas desde el 24 de
// julio, con la mercancía ya entregada físicamente. El aviso de despacho sale
// solo al pasar a "Completada", así que una guía que nadie cierra es un aviso
// que nadie recibe, en silencio y para siempre.
//
// La causa de fondo (la placa obligatoria en entrega directa) se arregló en el
// mismo día. Esto es la RED: si vuelve a acumularse, que se note en 2 días y no
// en dos semanas.
//
// Módulo PURO (sin imports): recibe las guías y el instante, devuelve el plan.
// Se testea con fechas FIJAS, nunca con `new Date()`.
// ─────────────────────────────────────────────────────────────────────────────

/** Panamá es UTC−5 fijo, sin horario de verano. */
const PANAMA_OFFSET_MS = 5 * 60 * 60 * 1000;

/** Días que una guía puede quedarse pendiente antes de que se avise. */
export const DIAS_PARA_AVISAR = 2;

/** Máximo de guías listadas en el mensaje; el resto se resume como "y N más". */
export const MAX_EN_MENSAJE = 10;

export interface GuiaPendiente {
  numero: number;
  /** Día de la guía (YYYY-MM-DD), que es lo que el usuario ve en la lista. */
  fecha: string | null;
  modo_entrega?: string | null;
  /** Nombre del transportista ya resuelto, o null en entrega directa. */
  transportista?: string | null;
}

export interface GuiaVencida extends GuiaPendiente {
  /** Días completos que lleva sin despacharse, en calendario de Panamá. */
  dias: number;
}

/** El día-calendario de Panamá para un instante dado. */
export function diaPanama(ahora: Date): string {
  return new Date(ahora.getTime() - PANAMA_OFFSET_MS).toISOString().slice(0, 10);
}

/** Días completos entre dos días-calendario `YYYY-MM-DD`. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86_400_000);
}

/**
 * Las guías que ya cruzaron el umbral, de la más vieja a la más nueva.
 *
 * ⚠️ Una guía SIN fecha no se cuenta: no se puede saber si está vencida y
 * suponerlo la metería en el aviso todos los días para siempre.
 */
export function guiasVencidas(
  pendientes: readonly GuiaPendiente[],
  ahora: Date,
  diasUmbral: number = DIAS_PARA_AVISAR,
): GuiaVencida[] {
  const hoy = diaPanama(ahora);
  const out: GuiaVencida[] = [];
  for (const g of pendientes) {
    if (!g.fecha) continue;
    const dias = diasEntre(g.fecha.slice(0, 10), hoy);
    if (dias >= diasUmbral) out.push({ ...g, dias });
  }
  return out.sort((a, b) => b.dias - a.dias || a.numero - b.numero);
}

function etiquetaDias(dias: number): string {
  return dias === 1 ? "1 día" : `${dias} días`;
}

function destino(g: GuiaVencida): string {
  const t = (g.transportista ?? "").trim();
  if (t) return t;
  return g.modo_entrega === "entrega_directa" ? "Entrega directa" : "—";
}

/**
 * El mensaje, o `null` si no hay nada que avisar.
 *
 * Devuelve `null` en vez de un "todas las guías al día ✅" por pedido explícito
 * de Daniel el mismo día, sobre el resumen de fotos: *"solo dime si me faltan
 * fotos, no si no me faltan fotos"*. Mismo criterio acá.
 */
export function buildAvisoPendientes(vencidas: readonly GuiaVencida[]): string | null {
  if (vencidas.length === 0) return null;

  const lineas = vencidas
    .slice(0, MAX_EN_MENSAJE)
    .map((g) => `• GT-${String(g.numero).padStart(3, "0")} · ${destino(g)} · ${etiquetaDias(g.dias)}`);
  const extra = vencidas.length > MAX_EN_MENSAJE ? `\n…y ${vencidas.length - MAX_EN_MENSAJE} más.` : "";

  const titulo =
    vencidas.length === 1
      ? "📋 1 guía sin despachar"
      : `📋 ${vencidas.length} guías sin despachar`;

  return (
    `${titulo}\n${lineas.join("\n")}${extra}\n\n` +
    `Si ya salieron, márcalas como despachadas en Guías para que queden cerradas.`
  );
}
