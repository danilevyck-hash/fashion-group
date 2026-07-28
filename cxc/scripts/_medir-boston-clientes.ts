import fs from "node:fs";
function env(){for(const l of fs.readFileSync(".env.local","utf8").split("\n")){if(!l.includes("=")||l.trim().startsWith("#"))continue;const i=l.indexOf("=");process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();}}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function main(){
  env();
  const {supabaseServer:db}=await import("../src/lib/supabase-server");
  const out:any[]=[];const P=1000;
  for(let f=0;;f+=P){
    const {data,error}=await db.from("switch_facturas")
      .select("cliente_switch_id,cliente_nombre,saldo,tipo_comprobante,fecha")
      .eq("empresa_key","confecciones_boston").order("id",{ascending:true}).range(f,f+P-1);
    if(error)throw new Error(error.message);
    if(!data||data.length===0)break;
    out.push(...data); if(data.length<P)break; await sleep(400);
  }
  const conSaldo=out.filter(r=>Number(r.saldo)!==0);
  const clientesConSaldo=new Set(conSaldo.map(r=>r.cliente_switch_id).filter(v=>v!=null));
  const todosClientes=new Set(out.map(r=>r.cliente_switch_id).filter(v=>v!=null));
  console.log(`Boston facturas: ${out.length}`);
  console.log(`Clientes distintos (todas las facturas): ${todosClientes.size}`);
  console.log(`Facturas con saldo != 0: ${conSaldo.length}`);
  console.log(`>>> CLIENTES con al menos una factura con saldo != 0: ${clientesConSaldo.size}`);
  // ¿cuántos de esos son recientes? (saldo viejo puede ser basura)
  const ahora=Date.now();
  const porAnio=new Map<string,Set<number>>();
  for(const r of conSaldo){const y=String(r.fecha).slice(0,4);if(!porAnio.has(y))porAnio.set(y,new Set());porAnio.get(y)!.add(r.cliente_switch_id);}
  console.log("Clientes con saldo por año de la factura:",JSON.stringify([...porAnio.entries()].map(([y,s])=>[y,s.size]).sort()));
  const ult12=conSaldo.filter(r=>ahora-new Date(r.fecha).getTime()<365*864e5);
  console.log(`Facturas con saldo de los ultimos 12 meses: ${ult12.length} · clientes: ${new Set(ult12.map(r=>r.cliente_switch_id)).size}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error(e.message??e);process.exit(1)});
