/* ¿Cuánto cambiaría la planilla si SOLO se descontara lo cargado como «Ausencia»?
 * Contrafactual: hoy no existe el motivo «Ausencia», así que la regla nueva
 * equivale a NO descontar ningún día sin marcar. Solo lectura. */
import { supabaseServer } from "@/lib/supabase-server";
import { leerTodoPaginado } from "@/lib/supabase-paginado";
import { armarReporte, type HorarioPersona } from "@/lib/asistencia/reporte";
import { aplicarCorrecciones, type MarcacionConId } from "@/lib/asistencia/correcciones";
import { leerCorrecciones } from "@/lib/asistencia/correcciones-server";
import { leerReglas, leerPersonas, vigenciasDeFilas, servicioProfesionalDeFila, leerJustificaciones, leerVacaciones } from "@/lib/asistencia/config-server";
import { codigosFueraDeRango, motivoPeriodoParcial } from "@/lib/asistencia/vigencia";
import { motivosDeQuienNoMarco } from "@/lib/asistencia/periodo";
import { hoyPanama } from "@/lib/fecha-panama";
import { armarPlanilla, jornadaDiariaMin, periodoDeQuincena, quincenaDesdeClave, separarSinFicha, totalizar, type FichaPlanilla } from "@/lib/asistencia/planilla";
import { leerManuales } from "@/lib/asistencia/planilla-server";
const PANAMA="-05:00"; const inst=(d:string,f:boolean)=>new Date(Date.parse(`${d}T${f?"23:59:59.999":"00:00:00.000"}${PANAMA}`)).toISOString();
const EMPRESAS=["confecciones_boston","vistana","fashion_wear"];
async function corre(clave:string){
  const q=periodoDeQuincena(quincenaDesdeClave(clave)!);
  const marc=await leerTodoPaginado<MarcacionConId>("m",(c,f,t)=>supabaseServer.from("asistencia_marcaciones").select("id, empleado_codigo, empleado_nombre, ocurrio_en",c?{count:"exact"}:{}).gte("ocurrio_en",inst(q.desde,false)).lte("ocurrio_en",inst(q.hasta,true)).order("ocurrio_en",{ascending:true}).order("id",{ascending:true}).range(f,t));
  const [{reglas},pdb,corr,man,hR,jR,vR,fR]=await Promise.all([leerReglas(),leerPersonas(),leerCorrecciones(q.desde,q.hasta),leerManuales(q.claveManuales!),
    supabaseServer.from("asistencia_horarios").select("empleado_codigo, entrada, salida, almuerzo_minutos"),
    leerJustificaciones(q.desde,q.hasta),
    // 🔴 Por la MISMA puerta que la ruta. Sin esto el contrafactual cuenta los
    // días de VACACIONES como ausencia — o sea que mide justo lo contrario de
    // lo que dice medir.
    leerVacaciones(q.desde,q.hasta),
    supabaseServer.from("asistencia_feriados").select("fecha, nombre").gte("fecha",q.desde).lte("fecha",q.hasta)]);
  const horarios=(hR.data??[]).map((h:any)=>({...h,entrada:String(h.entrada).slice(0,5),salida:String(h.salida).slice(0,5)})) as HorarioPersona[];
  const vig=vigenciasDeFilas(pdb.filas); const fuera=codigosFueraDeRango(vig,q.desde,q.hasta);
  const fichas=new Map<string,FichaPlanilla>();
  for(const f of pdb.filas as any[]){const c=String(f.empleado_codigo); if(fuera.has(c))continue;
    fichas.set(c,{codigo:c,nombre:f.nombre??null,salarioMensual:f.salario_mensual===null?null:Number(f.salario_mensual),jornadaSemanal:f.jornada_semanal??null,empresa:f.empresa??null,servicioProfesional:servicioProfesionalDeFila(f)});}
  const nombres=new Map<string,string>(); for(const [c,f] of fichas) if(f.nombre) nombres.set(c,f.nombre);
  const ef=aplicarCorrecciones(marc,corr.correcciones); const hoy=hoyPanama();
  const personas=armarReporte({marcaciones:ef.marcaciones,horarios,justificaciones:jR.filas,vacaciones:vR.filas,
    feriados:new Map((fR.data??[]).map((f:any)=>[String(f.fecha),String(f.nombre)])),desde:q.desde,hasta:q.hasta,reglas,nombres,
    incluirNoHabiles:true,diaEnCurso:hoy,correccionesPorDia:ef.porDia});
  const vigentes=personas.filter(p=>!fuera.has(p.codigo));
  // CONTRAFACTUAL: ningún día sin marcar cuenta como ausencia (nada cargado como «Ausencia»)
  const sinAus=vigentes.map(p=>({...p,dias:p.dias.map((d:any)=>({...d,ausente:false}))}));
  const decidir=new Map<string,string>(); for(const [c,v] of vig){ if(fuera.has(c))continue; const mo=motivoPeriodoParcial(v,q.desde,q.hasta); if(mo)decidir.set(c,mo);}
  const just=motivosDeQuienNoMarco({justificaciones:jR.filas,vacaciones:vR.filas});
  const hd=new Map(horarios.map(h=>[h.empleado_codigo,h]));
  const base={fichas,manuales:man.porCodigo,jornadaDiariaMin:(c:string)=>jornadaDiariaMin(hd.get(c) as any),reglas,factorBase:q.factorBase,decidirAMano:decidir,justificados:just};
  console.log(`\n### QUINCENA ${clave}  (${q.desde}→${q.hasta})`);
  let na=0,nb=0;
  const detalle:string[]=[];
  for(const empresa of EMPRESAS){
    const A=separarSinFicha(armarPlanilla({...base,personas:vigentes,empresa} as any)).lineas;
    const B=separarSinFicha(armarPlanilla({...base,personas:sinAus,empresa} as any)).lineas;
    const ta=totalizar(A), tb=totalizar(B); na+=ta.netoPagar; nb+=tb.netoPagar;
    console.log(`${empresa.padEnd(20)} ausencias $${ta.ausencias.toFixed(2).padStart(8)} → $${tb.ausencias.toFixed(2).padStart(6)}   NETO $${ta.netoPagar.toFixed(2).padStart(9)} → $${tb.netoPagar.toFixed(2).padStart(9)}  (+$${(tb.netoPagar-ta.netoPagar).toFixed(2)})`);
    const mb=new Map(B.map(l=>[l.codigo,l]));
    for(const a of A){const b=mb.get(a.codigo); if(!a.dinero||!b?.dinero)continue;
      if(a.dinero.ausencias===0)continue;
      const p=vigentes.find(z=>z.codigo===a.codigo);
      const dias=(p?.dias??[]).filter((d:any)=>d.ausente).map((d:any)=>d.fecha);
      detalle.push(`   ${a.etiqueta.slice(0,28).padEnd(28)} ${empresa.padEnd(20)} ausencia $${a.dinero.ausencias.toFixed(2).padStart(7)} (${a.horas.ausenciaDias}d: ${dias.join(",")}) neto $${a.dinero.netoPagar.toFixed(2)} → $${b.dinero.netoPagar.toFixed(2)}`);}
  }
  console.log(`TOTAL 3 empresas  NETO $${na.toFixed(2)} → $${nb.toFixed(2)}   (+$${(nb-na).toFixed(2)})`);
  detalle.forEach(d=>console.log(d));
}
async function main(){ for(const c of (process.argv.slice(2).length?process.argv.slice(2):["2026-07-1","2026-07-2","2026-08-1"])) await corre(c); }
void main().catch(e=>{console.error(e);process.exitCode=1;});
