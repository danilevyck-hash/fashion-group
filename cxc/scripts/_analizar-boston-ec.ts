/**
 * Analiza el volcado de estado de cuenta de Boston OFFLINE (/tmp/boston-ec.jsonl,
 * lo baja `_dump-boston-ec.ts`). No llama al API ni a la base.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────
 * El 27-jul-2026 se midió mal la cartera de Boston: **$399.817,62**. Estaba MAL.
 * El error fue sumar `saldo` crudo. El API entrega `saldo` como MAGNITUD SIEMPRE
 * POSITIVA — un recibo de $77 mil viene como +77 mil — así que sumarlo de frente
 * cuenta los cobros como si fueran deuda. Infla la cartera en 2× el crédito:
 * en Boston, 268 recibos ($77.169,16) y 8 notas de crédito ($11.801,37) →
 * $177.941,06 de más.
 *
 * Lo correcto es la firma de `switch_estadocuenta_aging` (20260530000300):
 * Nota de Crédito / Recibo / Recibo Saldo Anterior RESTAN; Factura / Nota de
 * Débito / Saldo Anterior / Transacción / Tiquete SUMAN. Con eso: **$229.435,64**.
 *
 * ── LA VERIFICACIÓN QUE HACE ESTE SCRIPT ────────────────────────────────────
 * No alcanza con arreglar el signo y creerse el número. El API trae TRES fuentes
 * de signo independientes y las tres tienen que dar lo mismo:
 *   1. la firma por `tipoComprobante` (la del repo)
 *   2. `debito - credito` (el API lo dice explícito)
 *   3. `saldoOriginal` (ya viene con signo)
 *   4. el `saldoConsecutivo` del último documento de cada cliente
 * Medido: las cuatro dan $229.435,64, con 0 discrepancias en 1.009 documentos.
 *
 * ⚠️ QUEDA ABIERTO: el panel de Switch (Reportes → Estado de cuenta → "Saldos",
 * sucursal Todas) dice **$224.749,88** — $4.685,76 menos (2,04%). No es signo
 * (las 4 medidas coinciden) ni sucursal (Daniel verificó que "Todas" da igual
 * que PRINCIPAL) ni los 21 clientes que el API rechaza (devuelven "NO SE
 * ENCUENTRA INFORMACIÓN", o sea sin cartera). El patrón por tramo tampoco es el
 * del paso del tiempo: 181-270 da +4.707,90 y 271-365 da −3.662,86, o sea
 * documentos en tramos DISTINTOS, no corridos hacia arriba. Sospecha principal:
 * la pestaña "Saldos" no es la misma magnitud que el estado de cuenta por
 * cliente (ya pasó con Fashion Shoes, donde las dos pestañas del panel diferían
 * entre sí y era una diferencia de definición). SIN RESOLVER — no escribir
 * saldos hasta cerrarlo.
 */
import fs from "node:fs";
const num=(v:unknown)=>{const n=parseFloat(String(v??"").replace(/,/g,""));return Number.isFinite(n)?n:0;};
// MISMA firma que switch_estadocuenta_aging (20260530000300). No inventar otra.
const CREDITO=new Set(["Nota de Crédito","Recibo","Recibo Saldo Anterior"]);
const DEBITO=new Set(["Factura","Nota de Débito","Saldo Anterior","Transacción","Tiquete"]);
function signed(tipo:string, saldo:number):number{
  if(CREDITO.has(tipo)) return -saldo;
  if(DEBITO.has(tipo))  return  saldo;
  return 0; // desconocido → NEUTRAL (vigilado)
}
const B=[[0,30,"0-30"],[31,60,"31-60"],[61,90,"61-90"],[91,120,"91-120"],
         [121,180,"121-180"],[181,270,"181-270"],[271,365,"271-365"],[366,1e9,"+365"]] as const;
function tramo(d:number){ for(const [a,b,n] of B) if(d>=a&&d<=b) return n; return "+365"; }

const lineas=fs.readFileSync("/tmp/boston-ec.jsonl","utf8").trim().split("\n").filter(Boolean);
const bucket=new Map<string,number>(); B.forEach(([,,n])=>bucket.set(n,0));
const porTipo=new Map<string,{n:number;bruto:number;firmado:number}>();
let total=0, docsConSaldo=0, clientesConSaldo=0, fallos=0, sinClasificar=0;
let negativosCrudos=0, sumaNegCrudos=0;
const porCliente:{nombre:string;total:number}[]=[];

for(const l of lineas){
  const r=JSON.parse(l);
  if(r.error){fallos++;continue;}
  let tc=0;
  for(const e of (r.elements??[])){
    const s=num(e.saldo);
    if(Math.abs(s)<0.005) continue;
    if(s<0){negativosCrudos++;sumaNegCrudos+=s;}
    docsConSaldo++;
    const tipo=String(e.tipoComprobante??"");
    const f=signed(tipo,s);
    if(!CREDITO.has(tipo)&&!DEBITO.has(tipo)) sinClasificar++;
    const p=porTipo.get(tipo)??{n:0,bruto:0,firmado:0};
    p.n++; p.bruto+=s; p.firmado+=f; porTipo.set(tipo,p);
    bucket.set(tramo(Number(e.dias??0)), (bucket.get(tramo(Number(e.dias??0)))??0)+f);
    tc+=f; total+=f;
  }
  if(Math.abs(tc)>=0.01){clientesConSaldo++;porCliente.push({nombre:r.nombre??String(r.clienteId),total:tc});}
}
const f2=(x:number)=>x.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2});
console.log(`clientes leidos: ${lineas.length} · fallos ${fallos}`);
console.log(`documentos con saldo: ${docsConSaldo} · clientes con saldo != 0: ${clientesConSaldo}`);
console.log(`saldos crudos NEGATIVOS: ${negativosCrudos} (suma ${f2(sumaNegCrudos)})`);
console.log(`docs de tipo NO clasificado: ${sinClasificar}`);
console.log("\n=== POR TRAMO (firmado) ===");
const PANEL:Record<string,number>={"0-30":41414.55,"31-60":36559.50,"61-90":19380.12,"91-120":8843.93,
  "121-180":30975.09,"181-270":10408.82,"271-365":19084.19,"+365":58083.68};
for(const [,,n] of B){
  const mio=bucket.get(n)??0, p=PANEL[n];
  const d=mio-p;
  console.log(`  ${n.padEnd(9)} mio ${f2(mio).padStart(13)}  panel ${f2(p).padStart(13)}  dif ${f2(d).padStart(12)}${Math.abs(d)<0.01?"  OK":"  <<<"}`);
}
console.log(`  ${"TOTAL".padEnd(9)} mio ${f2(total).padStart(13)}  panel ${f2(224749.88).padStart(13)}  dif ${f2(total-224749.88).padStart(12)}${Math.abs(total-224749.88)<0.01?"  OK":"  <<<"}`);
console.log("\n=== TRAMOS DE PANTALLA (0-90 / 91-120 / 121+) ===");
const g0_90=(bucket.get("0-30")??0)+(bucket.get("31-60")??0)+(bucket.get("61-90")??0);
const g91=(bucket.get("91-120")??0);
const g121=(bucket.get("121-180")??0)+(bucket.get("181-270")??0)+(bucket.get("271-365")??0)+(bucket.get("+365")??0);
for(const [n,mio,esp] of [["0-90",g0_90,97354.17],["91-120",g91,8843.93],["121+",g121,118551.78]] as const)
  console.log(`  ${n.padEnd(7)} mio ${f2(mio).padStart(13)}  esperado ${f2(esp).padStart(13)}  ${Math.abs(mio-esp)<0.01?"OK":"<<<"}`);
console.log("\n=== POR TIPO DE COMPROBANTE ===");
for(const [t,p] of [...porTypeSorted()]) console.log(`  ${t.padEnd(24)} n=${String(p.n).padStart(5)}  bruto ${f2(p.bruto).padStart(13)}  firmado ${f2(p.firmado).padStart(13)}`);
function porTypeSorted(){ return [...porTipo.entries()].sort((a,b)=>Math.abs(b[1].firmado)-Math.abs(a[1].firmado)); }
const brutoTotal=[...porTipo.values()].reduce((s,p)=>s+p.bruto,0);
console.log(`\nSUMA CRUDA (sin signos, lo que hice mal antes): ${f2(brutoTotal)}`);
console.log(`SUMA FIRMADA (correcta):                        ${f2(total)}`);
console.log(`diferencia = 2x el credito:                     ${f2(brutoTotal-total)}`);
porCliente.sort((a,b)=>a.total-b.total);
console.log("\nclientes con saldo NEGATIVO (a favor):", porCliente.filter(c=>c.total<0).length);
for(const c of porCliente.filter(c=>c.total<0).slice(0,6)) console.log(`   ${f2(c.total).padStart(12)}  ${c.nombre}`);
