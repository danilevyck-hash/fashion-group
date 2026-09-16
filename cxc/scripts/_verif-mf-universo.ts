// ─────────────────────────────────────────────────────────────────────────────
// SOLO LECTURA. ¿El refactor de /api/multifashion/fidelizacion cambió algo?
//
// Corre la cuenta VIEJA (copiada verbatim del handler antes del 16-sep-2026) y
// la NUEVA (`clientes-universo.ts`) sobre las MISMAS filas de producción, y
// compara las cuatro tarjetas y cliente por cliente.
// ─────────────────────────────────────────────────────────────────────────────
import { createClient } from "@supabase/supabase-js";
import * as fs from "fs";
import { armarUniverso } from "../src/lib/multifashion/clientes-universo";
import { waLink } from "../src/lib/phone-wa";

const env = fs.readFileSync("/Users/daniellevy/Code/fashion-group/cxc/.env.local", "utf8");
const get = (k: string) => env.match(new RegExp(`^${k}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "") ?? "";
const sb = createClient(get("NEXT_PUBLIC_SUPABASE_URL"), get("SUPABASE_SERVICE_ROLE_KEY"), { auth: { persistSession: false } });

const EMPRESA_KEY = "american_classic";
const MOSTRADOR_ID = 1;
const GENERICOS = new Set(["CONTADO", "CONSUMIDOR FINAL", "VENTAS", "VENTAS LOCALES"]);
const normNombre = (s: unknown): string => String(s ?? "").normalize("NFKC").replace(/\s+/g, " ").trim().toUpperCase();
const addDays = (isoDay: string, days: number): string =>
  new Date(new Date(`${isoDay}T00:00:00Z`).getTime() + days * 86400000).toISOString().slice(0, 10);

async function todo<T>(tabla: string, sel: string, filtra: (q: any) => any): Promise<T[]> {
  const out: T[] = []; let esperadas: number | null = null;
  for (let p = 0; p < 200; p++) {
    let q = sb.from(tabla).select(sel, p === 0 ? { count: "exact" } : {});
    q = filtra(q).order("id", { ascending: true }).range(p * 1000, p * 1000 + 999);
    const { data, error, count } = await q;
    if (error) throw new Error(`${tabla}: ${error.message}`);
    if (p === 0) esperadas = count ?? null;
    out.push(...((data ?? []) as T[]));
    if ((data ?? []).length < 1000) break;
    if (esperadas != null && out.length >= esperadas) break;
  }
  if (esperadas == null || out.length !== esperadas) throw new Error(`${tabla}: incompleta ${out.length}/${esperadas}`);
  return out;
}

/** LA CUENTA VIEJA, verbatim del handler anterior. */
function viejo(registrados: any[], facturas: any[], hoy: string) {
  const corte90 = addDays(hoy, -90), corte60 = addDays(hoy, -60), mesActual = hoy.slice(0, 7);
  const porCliente = new Map<number, any>();
  for (const f of facturas) {
    const dia = String(f.fecha).slice(0, 10);
    const a = porCliente.get(f.cliente_switch_id) ?? { dias: new Set(), ultima: "", uso5: false, nombreFactura: null };
    a.dias.add(dia);
    if (dia > a.ultima) a.ultima = dia;
    if (Number(f.descuento_global_pct) === 5) a.uso5 = true;
    if (!a.nombreFactura && f.cliente_nombre) a.nombreFactura = f.cliente_nombre;
    porCliente.set(f.cliente_switch_id, a);
  }
  const clientes: any[] = []; const vistos = new Set<number>();
  for (const r of registrados) {
    const nombre = String(r.nombre ?? "").trim();
    if (!nombre || GENERICOS.has(normNombre(nombre))) continue;
    vistos.add(r.cliente_switch_id);
    const a = porCliente.get(r.cliente_switch_id);
    const visitas = a?.dias.size ?? 0;
    const visitas90 = a ? [...a.dias].filter((d: string) => d >= corte90).length : 0;
    const ultima = a?.ultima || null;
    const fechaRegistro = String(r.raw_data?.fechaCreacion ?? "").slice(0, 10) || null;
    const uso5 = a?.uso5 ?? false;
    clientes.push({ cliente_switch_id: r.cliente_switch_id, nombre, nombre_norm: normNombre(nombre),
      telefono_wa: waLink(r.telefono, r.celular), registrado: true, fecha_registro: fechaRegistro,
      visitas, visitas_90d: visitas90, ultima_compra: ultima, estado5: uso5 ? "usado" : "disponible",
      frecuente: visitas90 >= 2, dormido: visitas > 0 && ultima !== null && ultima < corte60,
      nuevo_mes: fechaRegistro !== null && fechaRegistro.slice(0, 7) === mesActual,
      cinco_pendiente: visitas <= 1 && !uso5 });
  }
  for (const [cid, a] of porCliente) {
    if (vistos.has(cid)) continue;
    const nombre = String(a.nombreFactura ?? "").trim();
    if (!nombre || GENERICOS.has(normNombre(nombre))) continue;
    const visitas90 = [...a.dias].filter((d: string) => d >= corte90).length;
    clientes.push({ cliente_switch_id: cid, nombre, nombre_norm: normNombre(nombre), telefono_wa: null,
      registrado: false, fecha_registro: null, visitas: a.dias.size, visitas_90d: visitas90,
      ultima_compra: a.ultima || null, estado5: null, frecuente: visitas90 >= 2,
      dormido: a.dias.size > 0 && a.ultima < corte60, nuevo_mes: false, cinco_pendiente: false });
  }
  const cards = {
    frecuentes: clientes.filter((c) => c.frecuente).length,
    nuevos_mes: clientes.filter((c) => c.nuevo_mes).length,
    dormidos: clientes.filter((c) => c.dormido).length,
    cinco_pendiente: clientes.filter((c) => c.registrado && c.cinco_pendiente).length,
  };
  return { clientes, cards };
}

async function main() {
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Panama" }).format(new Date());
  const registrados = await todo<any>("switch_clientes", "cliente_switch_id, nombre, telefono, celular, raw_data",
    (q) => q.eq("empresa_key", EMPRESA_KEY).neq("cliente_switch_id", MOSTRADOR_ID));
  // Lo que leía ANTES: solo «Factura».
  const facturasViejas = await todo<any>("switch_facturas", "cliente_switch_id, cliente_nombre, fecha, descuento_global_pct",
    (q) => q.eq("empresa_key", EMPRESA_KEY).eq("tipo_comprobante", "Factura").not("cliente_switch_id", "is", null).neq("cliente_switch_id", MOSTRADOR_ID));
  // Lo que lee AHORA: todos los tipos.
  const facturasNuevas = await todo<any>("switch_facturas",
    "cliente_switch_id, cliente_nombre, fecha, tipo_comprobante, subtotal_descuento, is_wholesale, descuento_global_pct",
    (q) => q.eq("empresa_key", EMPRESA_KEY).not("cliente_switch_id", "is", null).neq("cliente_switch_id", MOSTRADOR_ID));
  console.log(`hoy=${hoy} · registrados=${registrados.length} · facturas viejas=${facturasViejas.length} · nuevas=${facturasNuevas.length}`);

  const a = viejo(registrados, facturasViejas, hoy);
  const b = armarUniverso(registrados, facturasNuevas, hoy);

  console.log("\n— LAS CUATRO TARJETAS —");
  console.log("  antes :", JSON.stringify(a.cards));
  console.log("  ahora :", JSON.stringify(b.cards));
  const cardsIguales = JSON.stringify(a.cards) === JSON.stringify(b.cards);
  console.log("  ", cardsIguales ? "✅ IDÉNTICAS" : "❌ CAMBIARON");

  console.log("\n— CLIENTE POR CLIENTE —");
  const mapB = new Map(b.clientes.map((c) => [c.cliente_switch_id, c]));
  const CAMPOS = ["nombre","nombre_norm","telefono_wa","registrado","fecha_registro","visitas","visitas_90d","ultima_compra","estado5","frecuente","dormido","nuevo_mes","cinco_pendiente"] as const;
  let dif = 0; const ejemplos: string[] = [];
  for (const x of a.clientes) {
    const y = mapB.get(x.cliente_switch_id);
    if (!y) { dif++; ejemplos.push(`falta ${x.cliente_switch_id} (${x.nombre})`); continue; }
    for (const k of CAMPOS) {
      if (JSON.stringify((x as any)[k]) !== JSON.stringify((y as any)[k])) {
        dif++; ejemplos.push(`${x.cliente_switch_id} ${x.nombre} · ${k}: ${JSON.stringify((x as any)[k])} → ${JSON.stringify((y as any)[k])}`);
        break;
      }
    }
  }
  const sobran = b.clientes.filter((y) => !a.clientes.some((x) => x.cliente_switch_id === y.cliente_switch_id));
  console.log(`  antes ${a.clientes.length} filas · ahora ${b.clientes.length}`);
  console.log(`  filas con alguna diferencia: ${dif} · filas nuevas que antes no estaban: ${sobran.length}`);
  for (const e of ejemplos.slice(0, 10)) console.log("   ·", e);
  for (const s of sobran.slice(0, 10)) console.log("   · sobra:", s.cliente_switch_id, s.nombre, `visitas=${s.visitas}`);

  const conCompras = b.clientes.filter((c) => c.visitas > 0);
  console.log("\n— LA LISTA DE SEGUIMIENTO —");
  console.log(`  con compras: ${conCompras.length}`);
  console.log(`  chip «No vuelven» (dormidos): ${conCompras.filter((c) => c.dormido).length}`);
  console.log(`  chip «Nuevos»: ${conCompras.filter((c) => c.nuevo_mes).length}`);
  console.log(`  sin teléfono (sin botón): ${conCompras.filter((c) => !c.telefono_wa).length}`);
  // ⚠️ A PROPÓSITO NO SE IMPRIME UNA SUMA DE «cuánto compró». Este universo y
  // el del ranking de la pantalla NO son el mismo conjunto —el ranking excluye
  // VENTAS MAHER y las empresas del grupo— así que un total de acá no se puede
  // comparar con ningún total de la pantalla, y publicarlo invita a cuadrarlo
  // contra algo que nunca fue lo mismo. El monto se verificó donde SÍ es
  // comparable, cliente por cliente: `scripts/_medir-mf-clientes.ts`.
  console.log(`  con monto en 0 o negativo (compró y devolvió): ${conCompras.filter((c) => c.total_comprado <= 0).length}`);
  const ok = cardsIguales && dif === 0 && sobran.length === 0;
  console.log(`\n${ok ? "✅ El refactor no cambió NADA de lo que ya se veía." : "❌ HAY DIFERENCIAS — revisar antes de commitear."}`);
  if (!ok) process.exit(1);
}
main().catch((e) => { console.error(e); process.exit(1); });
