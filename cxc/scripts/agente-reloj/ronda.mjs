// ─────────────────────────────────────────────────────────────────────────────
// UNA RONDA: la vuelta de CADA reloj, uno tras otro.
//
// 🔴 UN RELOJ CAÍDO NO PUEDE FRENAR AL OTRO.
//
// Desde el 10-sep-2026 la misma PC lee dos aparatos: el de Confecciones Boston,
// que está en la red de la oficina, y el de Multifashion, que se ve por un túnel
// WireGuard. El túnel se cae; la red de la oficina no. Si la ronda se cortara en
// el primer error, un túnel caído dejaría a Boston SIN traer marcaciones — un
// reloj sano apagado por el problema del otro.
//
// Por eso cada reloj va en su propio `try`, con:
//   · su propio `dispositivo` (la mitad de la llave anti-duplicado del servidor);
//   · su propio "hasta dónde leí" (vive en la base, por dispositivo);
//   · su propio castigo de espera cuando rechaza la contraseña (`espera.mjs`);
//   · su propia línea en el log.
//
// Separado de `agente.mjs` (el del bucle infinito) para poder probarlo entero
// sin relojes, sin red y sin esperar tres minutos.
// ─────────────────────────────────────────────────────────────────────────────

import { configDeReloj } from "./config.mjs";
import { darVuelta } from "./vuelta.mjs";
import { nuevoEstadoReloj } from "./espera.mjs";

/**
 * La memoria entre vueltas, UNA por reloj.
 *
 * 🔑 No se comparte: si el reloj de Multifashion rechaza la contraseña y queda
 * en penitencia 45 minutos, el de Boston tiene que seguir preguntando como
 * siempre. Un solo estado para los dos castigaría al sano por el enfermo.
 */
export function nuevosEstados(relojes) {
  const m = new Map();
  for (const r of relojes) m.set(r.dispositivo, nuevoEstadoReloj());
  return m;
}

/**
 * Con un solo reloj el log queda EXACTAMENTE como siempre (sin prefijo). Con
 * dos, cada línea dice de cuál habla — si no, dos relojes escriben el mismo log
 * y no se sabe cuál falló.
 */
export function etiqueta(relojes, dispositivo) {
  return relojes.length > 1 ? `[${dispositivo}] ` : "";
}

/**
 * Da una vuelta por cada reloj. NUNCA lanza: devuelve un resultado por reloj,
 * en el mismo orden de la lista.
 *
 * `vuelta` entra por parámetro para poder probar la ronda sin tocar un aparato.
 */
export async function darRonda({ config, deps, estados, log = () => {}, vuelta = darVuelta }) {
  const resultados = [];
  for (const reloj of config.relojes) {
    const pre = etiqueta(config.relojes, reloj.dispositivo);
    const anotar = (m) => log(`${pre}${m}`);
    try {
      const r = await vuelta({
        config: configDeReloj(config, reloj),
        deps,
        estado: estados.get(reloj.dispositivo) ?? null,
        log: anotar,
      });
      resultados.push({ dispositivo: reloj.dispositivo, ...r });
    } catch (e) {
      // `darVuelta` promete no lanzar. Si igual lanzara (un bug nuestro), el
      // reloj siguiente TIENE que seguir: es la razón de que esta ronda exista.
      anotar(`Error inesperado en la vuelta: ${e?.message ?? e}`);
      resultados.push({
        dispositivo: reloj.dispositivo,
        ok: false,
        motivo: "error-inesperado",
        error: String(e?.message ?? e),
      });
    }
  }
  return resultados;
}
