// SOLO LECTURA: lo que hay en producción para la 2ª quincena de agosto 2026.
import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
const env = Object.fromEntries(fs.readFileSync(".env.local","utf8").split("\n").filter(l=>/^[A-Z_0-9]+=/.test(l)).map(l=>{const i=l.indexOf("=");return [l.slice(0,i), l.slice(i+1).replace(/^"|"$/g,"")];}));
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const j = (x)=>JSON.stringify(x);
const q = async (t, f) => { const { data, error } = await f(db.from(t)); if (error) throw new Error(t+": "+error.message); return data; };
const D="2026-08-16", H="2026-08-31";
console.log("FERIADOS ago", j(await q("asistencia_feriados", x=>x.select("*").gte("fecha",D).lte("fecha",H))));
console.log("JUSTIFICACIONES ago", j(await q("asistencia_justificaciones", x=>x.select("*").lte("desde",H).gte("hasta",D))));
console.log("VACACIONES ago", j(await q("asistencia_vacaciones", x=>x.select("*").lte("desde",H).gte("hasta",D))));
console.log("MANUAL 2026-08-2", j(await q("asistencia_planilla_manual", x=>x.select("*").eq("quincena","2026-08-2"))));
const apr = await q("asistencia_horas_extra_aprobadas", x=>x.select("*").gte("fecha",D).lte("fecha",H).order("fecha"));
const by={}; for (const r of apr){(by[r.empleado_codigo]??=[]).push(`${r.fecha.slice(5)}${r.aprobado?"":"✗"}(${r.minutos_vistos})`)}
console.log("EXTRAS APROBADAS ago por código:"); for(const k of Object.keys(by).sort((x,y)=>+x-+y)) console.log("  ",k.padEnd(5),by[k].length,by[k].join(" "));
console.log("  marcado_en:", [...new Set(apr.map(r=>r.marcado_en.slice(0,10)))].join(", "), "por:", [...new Set(apr.map(r=>r.marcado_por))].join(","));
const aprJ = await q("asistencia_horas_extra_aprobadas", x=>x.select("*").gte("fecha","2026-07-16").lte("fecha","2026-07-31").order("fecha"));
const byJ={}; for (const r of aprJ){(byJ[r.empleado_codigo]??=[]).push(`${r.fecha.slice(5)}${r.aprobado?"":"✗"}(${r.minutos_vistos})`)}
console.log("EXTRAS APROBADAS jul por código:"); for(const k of Object.keys(byJ).sort((x,y)=>+x-+y)) console.log("  ",k.padEnd(5),byJ[k].length,byJ[k].join(" "));
console.log("  marcado_en:", [...new Set(aprJ.map(r=>r.marcado_en.slice(0,10)))].join(", "), "por:", [...new Set(aprJ.map(r=>r.marcado_por))].join(","));
console.log("CORRECCIONES ago", j(await q("asistencia_correcciones", x=>x.select("*").gte("fecha",D).lte("fecha",H))));
console.log("CORRECCIONES todas (fecha, cod, motivo)", j((await q("asistencia_correcciones", x=>x.select("empleado_codigo, fecha, hora_original, hora_corregida, motivo, anulada_en, marcacion_id").order("fecha"))).map(c=>[c.empleado_codigo,c.fecha,c.hora_original,c.hora_corregida,c.motivo,c.anulada_en?"ANULADA":"", c.marcacion_id?"":"AGREGADA"].join("|"))));
console.log("PRESTAMO APROBADO 08-2", j(await q("asistencia_prestamo_aprobado", x=>x.select("*").eq("quincena","2026-08-2"))));
console.log("APROBADOR EMPRESA", j(await q("asistencia_aprobador_empresa", x=>x.select("*"))));
const { count } = await db.from("asistencia_marcaciones").select("id",{count:"exact",head:true}).gte("ocurrio_en","2026-08-16T05:00:00Z").lt("ocurrio_en","2026-09-01T05:00:00Z");
console.log("MARCACIONES 16-31 ago (hora Panamá):", count);
const { count: c31 } = await db.from("asistencia_marcaciones").select("id",{count:"exact",head:true}).gte("ocurrio_en","2026-07-31T05:00:00Z").lt("ocurrio_en","2026-08-01T05:00:00Z");
const { count: c31a } = await db.from("asistencia_marcaciones").select("id",{count:"exact",head:true}).gte("ocurrio_en","2026-08-31T05:00:00Z").lt("ocurrio_en","2026-09-01T05:00:00Z");
console.log("MARCACIONES del 31-jul:", c31, " del 31-ago:", c31a);
