/**
 * DRY-RUN del aviso de hueco del reloj de asistencia — NO manda nada a Telegram.
 *
 * Imprime, tal como los vería Daniel en el celular, los dos mensajes de la
 * 4ª alerta de sistema (pedida por él el 12-ago-2026): el hueco fuera del
 * alcance del agente y su "ya se arregló". Sirve para revisar redacción sin
 * spamear el chat real.
 *
 *   npx tsx scripts/_dryrun-vigia-hueco.ts
 */
import {
  DIAS_RECUPERACION_AGENTE,
  DISPOSITIVO_FG,
  textoHuecoViejo,
  textoHuecoCerrado,
} from "../src/lib/asistencia/agente";
import { PREFIJO_SISTEMA } from "../src/lib/alertas/canal";

const linea = "─".repeat(64);
const sis = (s: string) => `${PREFIJO_SISTEMA}${s}`;

console.log(`\n${linea}\n🔧 VIGÍA DE ASISTENCIA — el hueco que el programa ya no alcanza\n${linea}`);
console.log(`(umbral derivado del agente: ${DIAS_RECUPERACION_AGENTE} días)\n`);

console.log("── Al abrirse el episodio (una sola vez, no por pasada) ──\n");
console.log(`  ${sis(textoHuecoViejo(DISPOSITIVO_FG, DIAS_RECUPERACION_AGENTE)).replace(/\n/g, "\n  ")}\n`);

console.log("── Al cerrarse (solo si hubo alerta previa) ──\n");
console.log(`  ${sis(textoHuecoCerrado(DISPOSITIVO_FG)).replace(/\n/g, "\n  ")}\n`);
