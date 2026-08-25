// ─────────────────────────────────────────────────────────────────────────────
// ¿CUÁNTO DEL TAB PRODUCTOS QUEDA CUBIERTO POR EL DETALLE DE CLIENTES?
//
// Es la medición que decidió el diseño de «Quién lo compra», y se puede
// reproducir cuando se quiera. Compara, empresa por empresa y sobre la MISMA
// ventana de 12 meses:
//
//   PATH A  switch_articulo_diario   → lo que la pantalla muestra hoy
//   PATH B  switch_factura_lineas    → el detalle con el cliente pegado
//
// y lo hace con las DOS llaves posibles de cruce, que es el punto:
//
//   · por CÓDIGO      → cobertura 98,3%–99,9%, y lo que falta son las
//                       TRANSACCIONES de mostrador (tipo 'CNF'), que no tienen
//                       endpoint de detalle en Switch.
//   · por el TEXTO de la descripción → 39 de 136 descripciones de vistana se
//                       quedan SIN UN SOLO CLIENTE ($184.164,23 = 7,66%),
//                       porque las dos tablas nombran distinto al mismo
//                       producto ("Men-Shirts / Woven Tops L/S" contra
//                       "Men-Shirts Woven Tops L/S").
//
// 🔴 EL SIGNO: las notas de crédito RESTAN. Si alguien lo saca, la diferencia
// da EXACTO el doble de las NC.
//
// Solo lectura.
//   DOTENV no hace falta: lee .env.local directo.
//   node scripts/_diag-productos-clientes-cobertura.mjs
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
const env={}; for (const l of readFileSync("/Users/daniellevy/Code/fashion-group/cxc/.env.local","utf8").split("\n")){const m=l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);if(m)env[m[1]]=m[2].replace(/^["']|["']$/g,"");}
const sb=createClient(env.NEXT_PUBLIC_SUPABASE_URL,env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const signo=(t)=>(t==="Nota de Crédito"?-1:1);
async function pag(t,b){const o=[];let e=null;for(let p=0;p<200;p++){const{data,error,count}=await b(p===0,p*1000,p*1000+999);if(error)throw new Error(t+": "+error.message);if(p===0)e=count;o.push(...(data??[]));if((data??[]).length<1000)break;if(e!=null&&o.length>=e)break;}if(e!=null&&o.length!==e)throw new Error(`${t}:${o.length}/${e}`);return o;}

for (const EMP of ["vistana","fashion_shoes","active_shoes","active_wear","joystep","fashion_wear"]) {
const DESDE="2025-09-01", HASTA="2026-08-24";
const {data:n1}=await sb.rpc("switch_top_descripciones",{p_empresa_key:EMP,p_desde:DESDE,p_hasta:HASTA});
const ad=await pag("ad",(c,d,h)=>sb.from("switch_articulo_diario").select("tipo, descripcion, codigo, cantidad_total, venta_total",c?{count:"exact"}:{}).eq("empresa_key",EMP).gte("fecha",DESDE).lte("fecha",HASTA).order("id").range(d,h));
const lin=await pag("lin",(c,d,h)=>sb.from("switch_factura_lineas").select("tipo_comprobante, descripcion, codigo, cantidad, subtotal_con_descuento",c?{count:"exact"}:{}).eq("empresa_key",EMP).gte("fecha",DESDE).lt("fecha","2026-08-25").order("id").range(d,h));

// mapa codigo -> descripcion CANÓNICA (la de la pantalla, path A)
const codDesc=new Map();
for(const r of ad){ if(r.codigo) codDesc.set(r.codigo, r.descripcion??"(sin descripcion)"); }

// B agrupado por la descripción canónica del código
const bPorDesc=new Map(); let huerfanas=0, vHuerf=0;
for(const l of lin){
  const d=l.codigo!=null?codDesc.get(l.codigo):undefined;
  if(d===undefined){huerfanas++;vHuerf+=signo(l.tipo_comprobante)*Number(l.subtotal_con_descuento);continue;}
  const e=bPorDesc.get(d)??{v:0,u:0}; e.v+=signo(l.tipo_comprobante)*Number(l.subtotal_con_descuento); e.u+=signo(l.tipo_comprobante)*Number(l.cantidad); bPorDesc.set(d,e);
}
const vA=n1.reduce((s,p)=>s+Number(p.venta),0);
const vB=[...bPorDesc.values()].reduce((s,e)=>s+e.v,0);
const vacias=n1.filter(p=>!bPorDesc.has(p.descripcion));
const vVacias=vacias.reduce((s,p)=>s+Number(p.venta),0);
const cnf=ad.filter(r=>r.tipo==="CNF").reduce((s,r)=>s+Number(r.venta_total),0);
console.log(`\n=== ${EMP} ===`);
console.log(`  A=$${vA.toFixed(2)}  B(por código)=$${vB.toFixed(2)}  cobertura ${vA?(vB/vA*100).toFixed(2):"–"}%`);
console.log(`  CNF/Transacción en A: $${cnf.toFixed(2)} (${vA?(cnf/vA*100).toFixed(2):"–"}%)   líneas huérfanas (código no está en A): ${huerfanas} → $${vHuerf.toFixed(2)}`);
console.log(`  descripciones SIN clientes: ${vacias.length}/${n1.length}  = $${vVacias.toFixed(2)} (${vA?(vVacias/vA*100).toFixed(2):"–"}%)`);
// comparar contra el join por descripción cruda
const bCrudo=new Map(); for(const l of lin){const d=l.descripcion??"(sin descripcion)";const e=bCrudo.get(d)??{v:0};e.v+=signo(l.tipo_comprobante)*Number(l.subtotal_con_descuento);bCrudo.set(d,e);}
const vaciasCrudo=n1.filter(p=>!bCrudo.has(p.descripcion));
console.log(`  (por TEXTO de descripción serían ${vaciasCrudo.length} vacías = $${vaciasCrudo.reduce((s,p)=>s+Number(p.venta),0).toFixed(2)})`);
}
