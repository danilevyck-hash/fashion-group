// Verifica el pedido con NÚMEROS: el Directorio pierde exactamente los 794
// exclusivos de Boston, y Ventas / Vista General / CXC Boston no se mueven.
// Solo lectura.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BASE="http://localhost:3185", COOKIE=readFileSync("/tmp/fg-cookie.txt","utf8").trim();
async function todo(v,cols,ord){let out=[],d=0;for(;;){const{data,error}=await sb.from(v).select(cols).order(ord).range(d,d+999);if(error){console.log(v,"ERR",error.message);return[];}out=out.concat(data||[]);if(!data||data.length<1000)break;d+=1000;}return out;}

const vw=await todo("clientes_empresa_12m_vw","cliente_id,empresa","cliente_norm");
const porCli=new Map();
for(const f of vw){ if(!f.cliente_id) continue; const e=f.empresa==="confecciones_boston";
  porCli.set(f.cliente_id, porCli.has(f.cliente_id)? (porCli.get(f.cliente_id)&&e) : e); }
const exclusivos=[...porCli].filter(([,s])=>s).map(([id])=>id);
const duales=[...porCli].filter(([,s])=>!s).map(([id])=>id)
  .filter(id=>vw.some(f=>f.cliente_id===id&&f.empresa==="confecciones_boston"));
const cm=await todo("clientes_master","id,deleted","id");
const vivos=cm.filter(c=>!c.deleted);
console.log("── DIRECTORIO ──");
console.log("  clientes_master vivos:", vivos.length);
console.log("  exclusivos de Boston (se van):", exclusivos.length);
console.log("  duales Boston+otra (SE QUEDAN):", duales.length);
console.log("  esperado en el Directorio:", vivos.length - exclusivos.filter(id=>vivos.some(c=>c.id===id)).length);

const r=await fetch(`${BASE}/api/clientes?limit=1`,{headers:{cookie:`cxc_session=${COOKIE}`}});
const j=await r.json();
console.log("  /api/clientes total REAL:", j.total);

console.log("── LO QUE NO SE TOCA ──");
const bos=vw.filter(f=>f.empresa==="confecciones_boston").length;
console.log("  Ventas › Clientes · filas de Boston en la vista:", bos);
const agg=await todo("clientes_agregado_12m_vw","cliente_id,compras_ytd","cliente_id");
console.log("  clientes_agregado_12m_vw:", agg.length, "filas · suma compras_ytd: $"+agg.reduce((s,x)=>s+Number(x.compras_ytd||0),0).toFixed(2));
// ⚠️ La pestaña Boston lee `switch_estadocuenta` (empresa_key), NO la MV de
// aging: el aging de Boston está en 0 porque su estadocuenta salió del cron
// (ver EMPRESAS_ESTADOCUENTA_FUERA_DE_CRON). Consultar la MV daría 0 y se
// leería como "se rompió", cuando es su estado normal desde antes.
const {count:cxcBos}=await sb.from("switch_estadocuenta").select("*",{count:"exact",head:true}).eq("empresa_key","confecciones_boston");
console.log("  CXC > pestaña Boston · documentos:", cxcBos);
