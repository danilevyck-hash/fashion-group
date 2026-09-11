const XLSX=require("xlsx-js-style");
const f=process.argv[2]; const only=process.argv[3];
const wb=XLSX.readFile(f,{cellDates:true});
console.log("SHEETS:",wb.SheetNames.join(" | "));
for (const sn of wb.SheetNames){
  if(only && sn!==only) continue;
  const ws=wb.Sheets[sn]; if(!ws["!ref"]) {console.log("--- sheet",sn,"(vacía)");continue;}
  console.log("--- sheet",sn, ws["!ref"]);
  const rows=XLSX.utils.sheet_to_json(ws,{header:1,raw:true,defval:null});
  rows.forEach((r,i)=>{ const cells=[]; r.forEach((c,j)=>{ if(c!==null && c!=="") cells.push(XLSX.utils.encode_col(j)+"="+(c instanceof Date? c.toISOString().slice(0,10): JSON.stringify(typeof c==="number"?+c.toFixed(4):c))); }); if(cells.length) console.log((i+1)+": "+cells.join("  ")); });
}
