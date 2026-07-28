/** SOLO LECTURA. Baja el estado de cuenta de TODOS los clientes de Boston y lo
 *  guarda crudo en /tmp/boston-ec.jsonl para analizarlo sin volver a llamar al API. */
import fs from "node:fs";
function env(){for(const l of fs.readFileSync(".env.local","utf8").split("\n")){if(!l.includes("=")||l.trim().startsWith("#"))continue;const i=l.indexOf("=");process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();}}
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
const SALIDA="/tmp/boston-ec.jsonl";
async function main(){
  env();
  const {supabaseServer:db}=await import("../src/lib/supabase-server");
  const all:any[]=[];const P=1000;
  for(let f=0;;f+=P){
    const {data,error}=await db.from("switch_facturas").select("cliente_switch_id,cliente_nombre")
      .eq("empresa_key","confecciones_boston").order("id",{ascending:true}).range(f,f+P-1);
    if(error)throw new Error(error.message);
    if(!data||data.length===0)break; all.push(...data); if(data.length<P)break; await sleep(300);
  }
  const nombre=new Map<number,string>();
  for(const r of all) if(r.cliente_switch_id!=null) nombre.set(r.cliente_switch_id, r.cliente_nombre??"");
  const ids=[...nombre.keys()];
  console.log(`clientes a consultar: ${ids.length}`);

  const cm=await import("../src/lib/switch-api/client");
  const c=cm.createSwitchClient("confecciones_boston");
  const out=fs.createWriteStream(SALIDA,{flags:"w"});
  let fallos=0, conDocs=0, docs=0;
  const t0=Date.now();
  try{
    // sucursales, por si el panel filtra PRINCIPAL y hay más de una
    try{
      const suc=await (c as any).listSucursales?.();
      console.log("SUCURSALES:", JSON.stringify(suc).slice(0,500));
    }catch(e:any){ console.log("SUCURSALES: no expuesto ("+(e?.message??e)+")"); }

    for(const [i,id] of ids.entries()){
      let els:any[]=[];
      try{ const ec=await c.getEstadoCuenta(id); els=(ec as any)?.estadocuenta?.elements??[]; }
      catch(e:any){ fallos++; out.write(JSON.stringify({clienteId:id,nombre:nombre.get(id),error:String(e?.message??e)})+"\n"); continue; }
      if(els.length){conDocs++;docs+=els.length;}
      out.write(JSON.stringify({clienteId:id,nombre:nombre.get(id),elements:els})+"\n");
      if(i%200===0)console.log(`  ${i}/${ids.length} · ${((Date.now()-t0)/1000).toFixed(0)}s · docs ${docs}`);
    }
  } finally { out.end(); await cm.logoutAllSwitchSessions(); console.log("Sesión cerrada",new Date().toISOString()); }
  console.log(`\nlisto: ${ids.length} clientes · ${conDocs} con documentos · ${docs} documentos · ${fallos} fallos · ${((Date.now()-t0)/1000).toFixed(0)}s`);
  console.log(`crudo en ${SALIDA}`);
}
main().then(()=>process.exit(0)).catch(e=>{console.error("ERROR:",e?.message??e);process.exit(1)});
