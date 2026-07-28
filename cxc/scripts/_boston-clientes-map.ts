/** SOLO LECTURA: baja el directorio de clientes de Boston (id, codigo, nombre). */
import fs from "node:fs";
function env(){for(const l of fs.readFileSync(".env.local","utf8").split("\n")){if(!l.includes("=")||l.trim().startsWith("#"))continue;const i=l.indexOf("=");process.env[l.slice(0,i).trim()]=l.slice(i+1).trim();}}
async function main(){
  env();
  const cm=await import("../src/lib/switch-api/client");
  const c=cm.createSwitchClient("confecciones_boston");
  const out:any[]=[];
  try{
    for(let p=1;p<=200;p++){
      const d:any=await c.listClientes({porPagina:500,paginaActual:p});
      const arr=d?.clientes??[]; out.push(...arr.map((x:any)=>({id:x.id,codigo:x.codigo,nombre:x.nombre})));
      const total=Number(d?.paginacion?.total??0);
      if(arr.length===0||(total>0&&out.length>=total))break;
    }
  } finally { await cm.logoutAllSwitchSessions(); }
  fs.writeFileSync("/tmp/boston-clientes.json",JSON.stringify(out));
  console.log("clientes:",out.length);
}
main().then(()=>process.exit(0)).catch(e=>{console.error("ERROR:",e?.message??e);process.exit(1)});
