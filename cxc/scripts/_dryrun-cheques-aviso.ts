/**
 * DRY-RUN del aviso de cheques por vencer Y RECORDATORIOS — NO manda NADA a
 * Telegram.
 *
 * Imprime el mensaje tal como lo vería Daniel en el celular, para cada día de
 * la semana, con cheques y recordatorios de ejemplo. Sirve para revisar la
 * redacción sin spamear el chat real.
 *
 *   npx tsx scripts/_dryrun-cheques-aviso.ts
 *
 * Ojo: NO importa `runChequesAlert` (eso tocaría la base y mandaría Telegram).
 * Usa las funciones PURAS, que son las mismas que arman el mensaje real —
 * incluido `unirAviso`, que es lo que decide que los cheques van PRIMERO.
 */
import {
  ventanaAviso,
  construirMensaje,
  nombreDia,
  type ChequePorVencer,
} from "../src/lib/cheques-aviso-ventana";
import {
  construirAvisoRecordatorios,
  ocurrenciasEnFechas,
  unirAviso,
  type Recordatorio,
} from "../src/lib/recordatorios/recordatorio";

const linea = "─".repeat(66);

// Cheques de ejemplo repartidos en la semana (jue 30-jul → mar 4-ago de 2026).
const CHEQUES: ChequePorVencer[] = [
  { cliente: "XTREME SHOES", empresa: "vistana", monto: 5000, fecha_deposito: "2026-07-31", vendedor: "" },
  { cliente: "PLAZA LOS ANGELES", empresa: "active_shoes", monto: 15824.95, fecha_deposito: "2026-08-01", vendedor: "Edwin" },
  { cliente: "COMERCIAL EL SOL", empresa: "fashion_wear", monto: 2400, fecha_deposito: "2026-08-02", vendedor: "" },
  { cliente: "ZAPATERIA CENTRAL", empresa: "joystep", monto: 980.5, fecha_deposito: "2026-08-03", vendedor: "Rey" },
  { cliente: "BOUTIQUE MARIA", empresa: "fashion_shoes", monto: 1200, fecha_deposito: "2026-08-04", vendedor: "" },
];

// Recordatorios de ejemplo, con las tres repeticiones y con/sin cliente.
// El mensual del 31 es el caso que se saltearía 5 meses del año si nadie
// escribiera la regla de fin de mes.
const RECORDATORIOS: Recordatorio[] = [
  { id: "1", fecha: "2026-07-31", texto: "Recordar cobrar", cliente: "City Mall Paso Canoa", clienteCodigo: "D-25", repeticion: "una_vez", creadoPor: "Daniel", createdAt: "" },
  { id: "2", fecha: "2026-08-01", texto: "Llamar al contador", cliente: "", clienteCodigo: null, repeticion: "una_vez", creadoPor: "Daniel", createdAt: "" },
  { id: "3", fecha: "2026-07-03", texto: "Revisar los cheques de la semana", cliente: "", clienteCodigo: null, repeticion: "semanal", creadoPor: "Daniel", createdAt: "" },
  { id: "4", fecha: "2026-01-31", texto: "Pagar el alquiler", cliente: "", clienteCodigo: null, repeticion: "mensual", creadoPor: "Daniel", createdAt: "" },
];

console.log(`\n${linea}`);
console.log("📊 CANAL NEGOCIO — cheques por vencer + RECORDATORIOS");
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
  const ocurrencias = ocurrenciasEnFechas(RECORDATORIOS, fechas);

  // Los cheques PRIMERO (es la plata y es lo que se lee en la notificación sin
  // abrirla), los recordatorios debajo. UN solo mensaje.
  const mensaje = unirAviso(
    enVentana.length ? construirMensaje(enVentana, hoy) : "",
    construirAvisoRecordatorios(ocurrencias, hoy),
  );

  if (!mensaje) {
    console.log("  (nada por vencer ni por recordar → NO se manda nada, un 'no hay nada' diario es ruido)\n");
    continue;
  }
  console.log("");
  console.log(mensaje.split("\n").map((l) => `    ${l}`).join("\n"));
  console.log("");
}

console.log(linea);
console.log("Sin cheques Y sin recordatorios NO se manda mensaje. Sábado y domingo tampoco.");
console.log("Un recordatorio del SÁBADO se avisa el VIERNES: si no, no sonaría nunca.");
console.log("Correr dos veces el mismo día manda UN solo aviso (candado por heartbeat).");
console.log(`${linea}\n`);
