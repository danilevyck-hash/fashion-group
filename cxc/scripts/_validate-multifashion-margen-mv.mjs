import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
const env = readFileSync('/Users/daniellevy/Code/fashion-group/cxc/.env.local','utf8');
const url=(env.match(/^NEXT_PUBLIC_SUPABASE_URL=(.+)$/m))[1].trim();
const key=(env.match(/^SUPABASE_SERVICE_ROLE_KEY=(.+)$/m))[1].trim();
const s=createClient(url,key,{auth:{persistSession:false}});
const AC='american_classic';
const now=new Date(); const NOW_Y=now.getFullYear(), NOW_M=now.getMonth()+1;

// monthly maps
async function pageAll(tbl, cols){ let out=[],from=0; for(;;){const {data,error}=await s.from(tbl).select(cols).eq('empresa_key',AC).range(from,from+999); if(error)throw new Error(tbl+': '+error.message); out.push(...data); if(data.length<1000)break; from+=1000;} return out; }
const mvRows = await pageAll('ventas_rollup_mensual_mv','anio,mes_num,ventas_netas,costo_total');
const vRows  = await pageAll('switch_ventas_unificado_vw','mes,ventas_netas');
const cRows  = await pageAll('switch_costo_unificado_vw','mes,costo_total');
const mv=new Map(), lv=new Map(), lc=new Map();
for(const r of mvRows) mv.set(`${r.anio}-${r.mes_num}`, {v:Number(r.ventas_netas||0), c:Number(r.costo_total||0)});
const ym=(d)=>{const [y,m]=String(d).slice(0,7).split('-'); return `${+y}-${+m}`;};
for(const r of vRows) lv.set(ym(r.mes), Number(r.ventas_netas||0));
for(const r of cRows) lc.set(ym(r.mes), Number(r.costo_total||0));

const r2=(n)=>Math.round(n*100)/100;
// margen replicando v6: FILTER costo>0, meses 1..pMes del año Y. mode: 'live' | 'mv' | 'hybrid'
function margen(Y, pMes, mode){
  let sV=0,sC=0;
  for(let m=1;m<=pMes;m++){
    let v,c;
    const useLive = mode==='live' || (mode==='hybrid' && Y===NOW_Y && m===NOW_M);
    if(useLive){ v=lv.get(`${Y}-${m}`)||0; c=lc.get(`${Y}-${m}`)||0; }
    else { const r=mv.get(`${Y}-${m}`); v=r?r.v:0; c=r?r.c:0; }
    if(c>0){ sV+=v; sC+=c; }
  }
  return { ventas:r2(sV), costo:r2(sC), margen: sV>0 ? (sV-sC)/sV : null };
}

const cases=[[2026,6],[2025,12],[2024,12]];
let fail=0;
for(const [Y,M] of cases){
  const t0=Date.now();
  const {data:v6,error}=await s.rpc('multifashion_mensual_v6',{p_year:Y,p_mes:M});
  const ms=Date.now()-t0;
  if(error){ console.log(`v6(${Y},${M}) ERROR ${error.message}`); fail++; continue; }
  const liveCur=margen(Y,M,'live'), hybCur=margen(Y,M,'hybrid'), mvCur=margen(Y,M,'mv');
  const livePrev=margen(Y-1,M,'live'), hybPrev=margen(Y-1,M,'hybrid');
  const dM=(a,b)=> (a==null&&b==null)?0 : Math.abs((a??0)-(b??0));
  // 1) mi replicación 'live' debe == v6 (sanity)
  const sanity = dM(liveCur.margen, v6.total.margen) + dM(livePrev.margen, v6.total.margenPrev);
  // 2) hybrid debe == v6 live (lo que hará v7)
  const dHyb = dM(hybCur.margen, v6.total.margen) + dM(hybPrev.margen, v6.total.margenPrev);
  // 3) all-mv vs live (gap de frescura informativo)
  const dMv = dM(mvCur.margen, v6.total.margen);
  if(sanity>1e-9 || dHyb>1e-9) fail++;
  const pct=(x)=> x==null?'—':(x*100).toFixed(4)+'%';
  console.log(`v6(${Y},${M}) ${ms}ms  margen=${pct(v6.total.margen)} prev=${pct(v6.total.margenPrev)}`);
  console.log(`   sanity(replica live vs v6)=${sanity.toExponential(2)}  HYBRID vs v6 Δ=${dHyb.toExponential(2)} ${dHyb<1e-9?'✅':'❌'}  | all-MV vs live Δ=${dMv.toExponential(2)} ${dMv<1e-9?'(MV fresca)':'(MV stale en mes curso)'}`);
  console.log(`   hybrid: ventas=$${hybCur.ventas.toLocaleString('en-US')} costo=$${hybCur.costo.toLocaleString('en-US')}`);
}
console.log(fail===0 ? '\n✅ PARTE C SEGURA: el margen MV-híbrido == v6 en vivo al límite numérico (Δ=0).' : `\n❌ ${fail} caso(s) difieren — NO aplicar Parte C.`);
process.exit(fail===0?0:1);
