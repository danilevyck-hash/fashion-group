/**
 * DRY-RUN del aviso de cheques por vencer — NO manda NADA a Telegram.
 *
 * Imprime el mensaje tal como lo vería Daniel en el celular, para cada día de
 * la semana, con cheques de ejemplo. Sirve para revisar la redacción sin
 * spamear el chat real.
 *
 *   npx tsx scripts/_dryrun-cheques-aviso.ts
 *
 * Ojo: NO importa `runChequesAlert` (eso tocaría la base y mandaría Telegram).
 * Usa las funciones PURAS, que son las mismas que arman el mensaje real.
 */
import {
  ventanaAviso,
  construirMensaje,
  nombreDia,
  type ChequePorVencer,
} from "../src/lib/cheques-aviso-ventana";

const linea = "─".repeat(66);

// Cheques de ejemplo repartidos en la semana (jue 30-jul → mar 4-ago de 2026).
const CHEQUES: ChequePorVencer[] = [
  { cliente: "XTREME SHOES", empresa: "vistana", monto: 5000, fecha_deposito: "2026-07-31", vendedor: "" },
  { cliente: "PLAZA LOS ANGELES", empresa: "active_shoes", monto: 15824.95, fecha_deposito: "2026-08-01", vendedor: "Edwin" },
  { cliente: "COMERCIAL EL SOL", empresa: "fashion_wear", monto: 2400, fecha_deposito: "2026-08-02", vendedor: "" },
  { cliente: "ZAPATERIA CENTRAL", empresa: "joystep", monto: 980.5, fecha_deposito: "2026-08-03", vendedor: "Rey" },
  { cliente: "BOUTIQUE MARIA", empresa: "fashion_shoes", monto: 1200, fecha_deposito: "2026-08-04", vendedor: "" },
];

console.log(`\n${linea}`);
console.log("📊 CANAL NEGOCIO — aviso de cheques por vencer");
console.log("   Sale 14:15 UTC = 9:15 a.m. Panamá, todos los días.");
console.log(linea);

for (const hoy of ["2026-07-30", "2026-07-31", "2026-08-01", "2026-08-02", "2026-08-03"]) {
  const dia = nombreDia(hoy);
  const { habil, fechas } = ventanaAviso(hoy);

  console.log(`\n▸ Corre el ${dia.toUpperCase()} ${hoy}`);

  if (!habil) {
    console.log("  (fin de semana → NO se manda nada; esos cheques ya se avisaron el viernes)\n");
    continue;
  }

  console.log(`  cubre: ${fechas.join(", ")}`);
  const enVentana = CHEQUES.filter((c) => fechas.includes(c.fecha_deposito));
  if (enVentana.length === 0) {
    console.log("  (sin cheques por vencer → NO se manda nada, un 'no hay nada' diario es ruido)\n");
    continue;
  }
  console.log("");
  console.log(
    construirMensaje(enVentana, hoy)
      .split("\n")
      .map((l) => `    ${l}`)
      .join("\n"),
  );
  console.log("");
}

console.log(linea);
console.log("Sin cheques por vencer NO se manda mensaje. Sábado y domingo tampoco.");
console.log("Correr dos veces el mismo día manda UN solo aviso (candado por heartbeat).");
console.log(`${linea}\n`);
