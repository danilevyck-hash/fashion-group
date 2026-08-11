// Diagnóstico READ-ONLY del inicio de Marketing: cuánta plata y cuántos
// proyectos le tocan a cada marca por FACTURAS y por ENTREGAS DE MUEBLES.
//
// Es el script que midió el antes/después del 11-ago-2026:
//   - "fact $ / fact#"  = lo que la tarjeta mostraba ANTES (solo facturas).
//   - "muebles $ / ent#" = lo que NO se contaba en ninguna tarjeta ($71.765).
//   - "proyectos(f)"    = proyectos que la tarjeta encontraba antes.
//   - "proyectos(f+e)"  = los que encuentra ahora (el arreglo de Nova Lux).
//
// No escribe NADA. Usa la misma regla que lib/marketing/resumen-inicio.ts.
//
//   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-marketing-inicio.ts
import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
function esMf(x: any) {
  const c = (x.tienda_codigo ?? "").trim().toUpperCase();
  if (c === "D-108") return true;
  return /multi[\s._-]*fashion/i.test(x.tienda ?? "");
}
const f2 = (n:number)=>n.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
(async () => {
  const [marcas, proy, fact, fm, ent, imp] = await Promise.all([
    db.from("mk_marcas").select("*"),
    db.from("mk_proyectos").select("id,nombre,tienda,tienda_codigo,estado,created_at,anulado_en"),
    db.from("mk_facturas").select("id,proyecto_id,total,grupo_legacy,anulado_en,impulsadora_id"),
    db.from("mk_factura_marcas").select("factura_id,marca_id,porcentaje"),
    db.from("mk_entregas_muebles").select("id,proyecto_id,total,total_por_marca,total_por_empresa_interna"),
    db.from("mk_impulsadoras").select("*"),
  ]);
  const M = marcas.data!, P = proy.data!, F = fact.data!.filter((f:any)=>!f.anulado_en), FM = fm.data!, E = ent.data!;
  const vivos = P.filter((p:any)=>!p.anulado_en);
  const pById = new Map(vivos.map((p:any)=>[String(p.id),p]));
  const mById = new Map(M.map((m:any)=>[String(m.id),m]));
  const mfSet = new Set(vivos.filter(esMf).map((p:any)=>String(p.id)));
  const fById = new Map(F.map((f:any)=>[String(f.id),f]));

  console.log("IMPULSADORAS tabla:", imp.data!.length, JSON.stringify(imp.data!.map((i:any)=>({n:i.nombre,a:i.activo}))));
  const factImp = F.filter((f:any)=>f.impulsadora_id);
  console.log("facturas con impulsadora:", factImp.length, "total $", f2(factImp.reduce((s:number,f:any)=>s+Number(f.total??0),0)));

  const rowsByF = new Map<string, any[]>();
  for (const r of FM) { const fid=String(r.factura_id); if(!fById.has(fid)) continue; const a=rowsByF.get(fid)??[]; a.push(r); rowsByF.set(fid,a); }

  // facturas por marca (no-legacy, no-mf)  === ANTES
  const factMarca: Record<string,{count:number,total:number,proy:Set<string>}> = {};
  for (const [fid,rows] of rowsByF) {
    const info = fById.get(fid)!;
    const pid = info.proyecto_id?String(info.proyecto_id):null;
    if (pid && mfSet.has(pid)) continue;
    if (info.grupo_legacy) continue;
    const sum = rows.reduce((s:number,x:any)=>s+Number(x.porcentaje??0),0)||1;
    for (const r of rows) { const mid=String(r.marca_id); const c=factMarca[mid]??{count:0,total:0,proy:new Set()}; c.count++; c.total+=Number(info.total??0)*(Number(r.porcentaje??0)/sum); if(pid) c.proy.add(pid); factMarca[mid]=c; }
  }
  // entregas por marca
  const entMarca: Record<string,{count:number,total:number,proy:Set<string>}> = {};
  for (const e of E) {
    const pid = e.proyecto_id?String(e.proyecto_id):null;
    if (pid && mfSet.has(pid)) continue;
    if (pid && !pById.has(pid)) continue;
    const tpm = e.total_por_marca ?? {};
    const tpe = e.total_por_empresa_interna ?? {};
    for (const [mid,mo] of Object.entries(tpm)) {
      const n = Number(mo); if(!Number.isFinite(n)||n<=0) continue;
      const emp = mById.get(mid)?.empresa_codigo;
      const interna = emp && tpe[emp] ? Number(tpe[emp]) : 0;
      const c = entMarca[mid]??{count:0,total:0,proy:new Set()};
      c.count++; c.total+=n+interna; if(pid) c.proy.add(pid); entMarca[mid]=c;
    }
  }
  // legacy: proyectos con facturas legacy
  const legacyProy = new Set<string>(); for(const f of F) if(f.grupo_legacy && f.proyecto_id) legacyProy.add(String(f.proyecto_id));
  console.log("\nproyectos con facturas legacy:", legacyProy.size);

  const proyConEntrega = new Set(E.map((e:any)=>String(e.proyecto_id)));
  const solape = [...proyConEntrega].filter(p=>legacyProy.has(p));
  console.log("proyectos con entrega que TAMBIEN tienen factura legacy:", solape.length, solape.map(p=>pById.get(p)?.tienda));

  console.log("\n=== TARJETAS: ANTES vs DESPUES ===");
  console.log("marca            | fact $        fact# | muebles $     ent# | proyectos(f) proyectos(f+e) | suma $");
  for (const m of M) {
    const f = factMarca[m.id]??{count:0,total:0,proy:new Set()};
    const e = entMarca[m.id]??{count:0,total:0,proy:new Set()};
    const union = new Set([...f.proy, ...e.proy]);
    console.log(`${m.nombre.padEnd(17)}| ${f2(f.total).padStart(12)} ${String(f.count).padStart(5)} | ${f2(e.total).padStart(12)} ${String(e.count).padStart(4)} | ${String(f.proy.size).padStart(11)} ${String(union.size).padStart(14)} | ${f2(f.total+e.total).padStart(12)}`);
  }
  const totF = Object.values(factMarca).reduce((s,x)=>s+x.total,0);
  const totE = Object.values(entMarca).reduce((s,x)=>s+x.total,0);
  console.log(`TOTAL marcas      | ${f2(totF).padStart(12)}       | ${f2(totE).padStart(12)}      |                            | ${f2(totF+totE).padStart(12)}`);
  console.log("\nDIFERENCIA si se sumara todo en un solo $: +" + f2(totE));

  // Nova Lux
  const nova = vivos.find((p:any)=>/nova lux/i.test(p.tienda));
  console.log("\nNOVA LUX:", nova?.id, nova?.tienda, "/", nova?.nombre);
  const ck = M.find((m:any)=>m.codigo==="CK");
  console.log("  ¿en proyectos de CK (f+e)?", new Set([...(factMarca[ck.id]?.proy??[]),...(entMarca[ck.id]?.proy??[])]).has(String(nova.id)));
  // Proyectos por marca listado CK
  const ckU = new Set([...(factMarca[ck.id]?.proy??[]),...(entMarca[ck.id]?.proy??[])]);
  console.log("  proyectos CK despues:", [...ckU].map(p=>pById.get(p)?.tienda).join(" | "));
  // Mobiliario global
  console.log("\nMOBILIARIO global: entregas", E.length, "$", f2(E.reduce((s:number,e:any)=>s+Number(e.total??0),0)));
})();
