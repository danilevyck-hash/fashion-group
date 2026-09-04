// Diagnóstico SOLO LECTURA contra producción — Guías / destinos por cliente.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-destinos-cliente.ts
//
// No escribe NADA. Corre el motor REAL (`destinosHistoricos` +
// `botonesDeDestino`) contra los renglones reales de `guia_items` y contesta:
//   1. ¿Cuántos clientes tienen historia de destinos? ¿Cuántos usan uno solo?
//   2. ¿Qué botones vería cada uno de los 9 definidos por Daniel (y qué dice
//      su histórico, que la definición pisa a propósito)?
//   3. ¿Las variantes reales se agrupan como se prometió?

import { createClient } from "@supabase/supabase-js";
import {
  DESTINOS_DEFINIDOS,
  botonesDeDestino,
  destinosHistoricos,
} from "../src/lib/guias/destinos-clientes";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY as string;
if (!url || !key) throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
const db = createClient(url, key, { auth: { persistSession: false } });

interface Envio {
  guia_id: string;
  cliente_codigo: string | null;
  direccion: string | null;
  deleted: boolean | null;
}
interface Guia {
  id: string;
  fecha: string | null;
  numero: number | null;
  deleted: boolean | null;
}

async function main() {
  const { data: guias, error: e1 } = await db
    .from("guia_transporte")
    .select("id, fecha, numero, deleted")
    .order("id");
  if (e1) throw e1;

  // Paginado a mano: db-max-rows = 1000 y corta EN SILENCIO.
  let envios: Envio[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db
      .from("guia_items")
      .select("guia_id, cliente_codigo, direccion, deleted")
      .order("id")
      .range(from, from + 999);
    if (error) throw error;
    envios = envios.concat((data ?? []) as Envio[]);
    if ((data ?? []).length < 1000) break;
  }

  const historicos = destinosHistoricos(envios, (guias ?? []) as Guia[]);
  const codigos = Object.keys(historicos);
  const conUno = codigos.filter((c) => historicos[c].length === 1).length;
  console.log(`renglones leídos: ${envios.length}`);
  console.log(`clientes con historia de destinos: ${codigos.length} · con UN solo destino agrupado: ${conUno}`);

  console.log("\n— Los 9 definidos por Daniel (botones = su tabla; histórico al lado) —");
  for (const cod of Object.keys(DESTINOS_DEFINIDOS)) {
    const botones = botonesDeDestino(cod, historicos[cod] ?? []);
    console.log(`${cod}: botones → [${botones.join(" | ")}]  · histórico → [${(historicos[cod] ?? []).join(" | ")}]`);
  }

  console.log("\n— Los demás clientes, por frecuencia (máx. 6) —");
  for (const cod of codigos.filter((c) => !DESTINOS_DEFINIDOS[c]).sort()) {
    console.log(`${cod}: [${historicos[cod].join(" | ")}]`);
  }
}

void main();
