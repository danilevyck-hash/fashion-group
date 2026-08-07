// ─────────────────────────────────────────────────────────────────────────────
// Hablar con fashiongr.com. Del otro lado está `/api/asistencia/ingest`.
//
// Todo lo que sabe interpretar una marcación vive EN EL SERVIDOR: el agente
// manda el evento tal como salió del reloj y no filtra nada. Es a propósito —
// el día que Hikvision cambie un nombre de campo hay UN archivo que tocar
// (`src/lib/asistencia/ingest.ts`) y no una PC en la oficina que actualizar.
//
// 🩸 EL 66% DE LOS EVENTOS NO TRAE `employeeNoString` (medido sobre los 8.785
// de julio: 5.845 son huellas no reconocidas y puertas abiertas por dentro). El
// agente los manda IGUAL. El servidor los descarta con motivo y los cuenta; si
// filtrara acá, el día que el reloj dejara de mandar el código de todo el mundo
// nadie se enteraría — la asistencia quedaría vacía sin explicación.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Cuántos eventos por envío. El servidor rechaza lotes de más de 5.000; 500
 * deja margen de sobra y hace que un backfill de un mes entero avance en
 * pedacitos que se pueden reintentar sin repetir todo.
 */
export const POR_LOTE = 500;

function encabezados(secret) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${secret}`,
  };
}

async function leerError(res) {
  try {
    const j = await res.json();
    return j?.error ?? `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Desde cuándo seguir y si hay un "Traer ahora" esperando. */
export async function leerEstado({ base, secret, dispositivo, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const url = `${base.replace(/\/+$/, "")}/api/asistencia/ingest?dispositivo=${encodeURIComponent(dispositivo)}`;
  const res = await fetchImpl(url, {
    headers: encabezados(secret),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`No se pudo leer el estado: ${await leerError(res)}`);
  return res.json();
}

/**
 * Manda las marcaciones, partidas en lotes.
 *
 * ⚠️ SECUENCIAL Y NO EN PARALELO. Los lotes chocan contra el mismo índice único
 * `(dispositivo, evento_id)`; mandarlos a la vez solo agrega presión sobre una
 * base que ya se cayó tres veces por saturación (ver `MEMORY.md`). Acá la
 * urgencia no existe: son marcaciones de asistencia, no una caja registradora.
 */
export async function mandarEventos({
  base,
  secret,
  dispositivo,
  eventos,
  atendioPedido = null,
  agenteVersion = null,
  fetchImpl = fetch,
  timeoutMs = 60_000,
  log = () => {},
}) {
  const url = `${base.replace(/\/+$/, "")}/api/asistencia/ingest`;
  const resumen = { lotes: 0, recibidos: 0, guardados: 0, descartados: 0, pedidoCerrado: false };

  // Con cero eventos SE MANDA IGUAL un lote vacío: es lo que marca `visto_en`
  // (la PC está viva), pone el contador de fallas en cero y cierra el pedido.
  // Sin esto, un día sin marcaciones se vería idéntico a la PC apagada.
  const tandas = eventos.length === 0 ? [[]] : [];
  for (let i = 0; i < eventos.length; i += POR_LOTE) tandas.push(eventos.slice(i, i + POR_LOTE));

  for (let i = 0; i < tandas.length; i++) {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: encabezados(secret),
      signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({
        dispositivo,
        eventos: tandas[i],
        // El pedido se cierra en el ÚLTIMO lote: hasta que no entró todo, el
        // "Traer ahora" no está cumplido y la pantalla debe seguir esperando.
        ...(atendioPedido && i === tandas.length - 1 ? { atendioPedido } : {}),
        ...(agenteVersion ? { agenteVersion } : {}),
      }),
    });
    if (!res.ok) throw new Error(`No se pudieron guardar las marcaciones: ${await leerError(res)}`);
    const d = await res.json();
    resumen.lotes += 1;
    resumen.recibidos += d.recibidos ?? 0;
    resumen.guardados += d.guardados ?? 0;
    resumen.descartados += d.descartados ?? 0;
    resumen.pedidoCerrado = resumen.pedidoCerrado || !!d.pedidoCerrado;
    log(`Lote ${i + 1}/${tandas.length}: ${d.guardados ?? 0} nuevas, ${d.descartados ?? 0} descartadas.`);
  }
  return resumen;
}

/**
 * Avisar que NO se pudo leer el reloj.
 *
 * Es tan importante como mandar los datos: el servidor lleva el contador de
 * fallas seguidas y avisa por Telegram a la tercera. Si el agente se comiera el
 * error en silencio, un reloj muerto se vería exactamente igual que un día sin
 * novedades hasta que alguien pidiera la planilla.
 */
export async function reportarError({ base, secret, dispositivo, error, fetchImpl = fetch, timeoutMs = 30_000 }) {
  const url = `${base.replace(/\/+$/, "")}/api/asistencia/ingest`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: encabezados(secret),
    signal: AbortSignal.timeout(timeoutMs),
    body: JSON.stringify({ dispositivo, error: String(error).slice(0, 500) }),
  });
  return res.ok;
}
