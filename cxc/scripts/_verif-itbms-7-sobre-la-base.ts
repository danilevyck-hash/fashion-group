// SOLO LECTURA contra producción. Mide, centavo a centavo, si cambiar el ITBMS
// de «7.7% del subtotal» a «7% de (subtotal + importación)» mueve plata en los
// reclamos que ya existen. Es la misma cuenta en álgebra (1,10 × 0,07 = 0,077),
// pero en punto flotante y con redondeo a centavos podía diferir, y esos
// papeles ya se le mandaron al proveedor.
//
// Corre:  npx tsx scripts/_verif-itbms-7-sobre-la-base.ts
//
// Medido el 1-sep-2026: 47 reclamos (13 borrados), 46 con ITBMS, 142 renglones
// → 0 diferencias de ITBMS, 0 de total, 0 de texto, y los 5 snapshots
// congelados siguen cuadrando. La mayor diferencia sin redondear fue 5,7e-14.
//
// 🩸 Fuera de los datos de hoy SÍ puede moverse un centavo: barriendo los 20
// millones de subtotales de $0.01 a $200,000.00, 1.407 (0,007%) cambian, y
// siempre HACIA ARRIBA, siempre en un empate exacto de medio centavo (ej. $105
// → $8.085, que la forma vieja bajaba a $8.08 y la nueva sube a $8.09). En un
// empate el redondeo comercial va hacia arriba: donde difieren, gana la nueva.

import fs from "fs";
import { reclamoTaxes, esActiveShoes } from "../src/lib/reclamos/tax";

const env: Record<string,string> = Object.fromEntries(
  fs.readFileSync(".env.local","utf8").split("\n")
    .filter((l)=>l.includes("=")&&!l.trim().startsWith("#"))
    .map((l)=>{const i=l.indexOf("=");return [l.slice(0,i).trim(), l.slice(i+1).trim().replace(/^["']|["']$/g,"")];}));

async function getAll(p: string): Promise<any[]> {
  const out: any[] = []; let from = 0; const step = 1000;
  for(;;){
    const r = await fetch(`${env.NEXT_PUBLIC_SUPABASE_URL}/rest/v1/${p}`, {
      headers: { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`, Range: `${from}-${from+step-1}`, "Range-Unit": "items" } });
    if(!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    const j = await r.json(); out.push(...j);
    if(j.length < step) break; from += step;
  }
  return out;
}

async function main() {
  const viejo = (sub: number) => sub * 0.077;
  const cent = (n: number) => Math.round(n*100)/100;
  const reclamos = await getAll("reclamos?select=id,nro_reclamo,empresa,estado,deleted,monto_reclamado_snapshot&order=id.asc");
  const items = await getAll("reclamo_items?select=id,reclamo_id,cantidad,precio_unitario&order=id.asc");
  const porRec = new Map<string, any[]>();
  for(const it of items){ if(!porRec.has(it.reclamo_id)) porRec.set(it.reclamo_id, []); porRec.get(it.reclamo_id)!.push(it); }

  let nRec=0, nItem=0, dif=0, difTot=0, difTexto=0, difSnap=0, nSnap=0, maxAbs=0;
  const detalle: string[] = [];
  const chequear = (empresa: string, sub: number, quien: string) => {
    const tx = reclamoTaxes(empresa, sub);
    const v = viejo(sub), totV = sub + sub*0.10 + v;
    maxAbs = Math.max(maxAbs, Math.abs(tx.itbms - v));
    if(cent(tx.itbms)!==cent(v)) { dif++; detalle.push(`${quien} sub=${sub} itbms ${cent(v)} → ${cent(tx.itbms)}`); }
    if(cent(tx.total)!==cent(totV)) { difTot++; detalle.push(`${quien} sub=${sub} total ${cent(totV)} → ${cent(tx.total)}`); }
    if(tx.itbms.toFixed(2)!==v.toFixed(2)) difTexto++;
  };
  for(const r of reclamos){
    if(esActiveShoes(r.empresa)) continue;
    const its = porRec.get(r.id) ?? [];
    const sub = its.reduce((s: number,i: any)=>s+(Number(i.cantidad)||0)*(Number(i.precio_unitario)||0),0);
    nRec++; chequear(r.empresa, sub, `reclamo ${r.nro_reclamo}`);
    for(const it of its){ nItem++; chequear(r.empresa, (Number(it.cantidad)||0)*(Number(it.precio_unitario)||0), `item ${r.nro_reclamo}`); }
  }
  for(const r of reclamos){
    if(r.monto_reclamado_snapshot==null) continue;
    const its = porRec.get(r.id) ?? [];
    const sub = its.reduce((s: number,i: any)=>s+(Number(i.cantidad)||0)*(Number(i.precio_unitario)||0),0);
    nSnap++;
    if(Math.abs(Number(r.monto_reclamado_snapshot) - cent(reclamoTaxes(r.empresa, sub).total)) > 0.005) difSnap++;
  }
  console.log({ reclamos_totales: reclamos.length, borrados: reclamos.filter((r: any)=>r.deleted).length,
    reclamos_con_itbms: nRec, renglones: nItem,
    dif_itbms_al_centavo: dif, dif_total_al_centavo: difTot, dif_texto_toFixed2: difTexto,
    max_dif_absoluta: maxAbs, snapshots_revisados: nSnap, snapshots_que_cambiarian: difSnap, detalle });
}
main().catch((e)=>{ console.error(e); process.exit(1); });
