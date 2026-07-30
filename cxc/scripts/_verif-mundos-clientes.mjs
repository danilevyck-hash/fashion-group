// Verifica los TRES mundos con números. Solo lectura.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env=Object.fromEntries(readFileSync(".env.local","utf8").split("\n").filter(l=>l.includes("=")&&!l.startsWith("#")).map(l=>{const i=l.indexOf("=");return [l.slice(0,i).trim(),l.slice(i+1).trim().replace(/^["']|["']$/g,"")]}));
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
const BASE="http://localhost:3185", COOKIE=readFileSync("/tmp/fg-cookie.txt","utf8").trim();
const H={cookie:`cxc_session=${COOKIE}`};
async function todo(v,cols,ord){let o=[],d=0;for(;;){const{data,error}=await sb.from(v).select(cols).order(ord).range(d,d+999);if(error){console.log(v,"ERR",error.message);return[];}o=o.concat(data||[]);if(!data||data.length<1000)break;d+=1000;}return o;}
const GRUPO=new Set(["vistana","fashion_wear","fashion_shoes","active_shoes","active_wear","joystep"]);

console.log("── DIRECTORIO (listas de clientes) ──");
const j=await (await fetch(`${BASE}/api/clientes?limit=1`,{headers:H})).json();
console.log("  /api/clientes total:", j.total, "(antes 5.063 · esperado 145 grupo + 4 sin rastro = 149)");

console.log("── VENTAS › CLIENTES ──");
const vw=await todo("clientes_empresa_12m_vw","empresa","cliente_norm");
const grupoVw=vw.filter(r=>GRUPO.has(r.empresa)).length;
console.log("  vista cruda:", vw.length, "· del grupo:", grupoVw, "· Boston:", vw.filter(r=>r.empresa==="confecciones_boston").length, "· MF:", vw.filter(r=>r.empresa==="american_classic").length);

console.log("── ⚠️ INTACTOS (la plata suma toda) ──");
const agg=await todo("clientes_agregado_12m_vw","compras_ytd","cliente_id");
console.log("  clientes_agregado_12m_vw:", agg.length, "filas · $"+agg.reduce((s,x)=>s+Number(x.compras_ytd||0),0).toFixed(2));
const {count:cxcBos}=await sb.from("switch_estadocuenta").select("*",{count:"exact",head:true}).eq("empresa_key","confecciones_boston");
console.log("  CXC > pestaña Boston · documentos:", cxcBos);
const {count:mfFact}=await sb.from("switch_facturas").select("*",{count:"exact",head:true}).eq("empresa_key","american_classic");
const {count:bosFact}=await sb.from("switch_facturas").select("*",{count:"exact",head:true}).eq("empresa_key","confecciones_boston");
console.log("  facturas que SIGUEN sumando · Multifashion:", mfFact, "· Boston:", bosFact);
