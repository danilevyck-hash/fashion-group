const XLSX=require("xlsx-js-style");const f=process.argv[2];const want=process.argv[3];
const wb=XLSX.readFile(f,{cellStyles:false});
console.log("HOJAS:",JSON.stringify(wb.SheetNames));
const names = want? wb.SheetNames.filter(n=>n.trim().toUpperCase().includes(want.toUpperCase())) : wb.SheetNames;
for(const n of names){
 console.log("\n===== HOJA:",JSON.stringify(n));
 const rows=XLSX.utils.sheet_to_json(wb.Sheets[n],{header:1,raw:true,defval:null});
 rows.slice(0,80).forEach((r,i)=>{
  const c=r.map(v=>v===null?"":(typeof v==="number"?Math.round(v*10000)/10000:String(v).replace(/\s+/g," ").trim()));
  while(c.length&&c[c.length-1]==="")c.pop();
  if(c.length)console.log(i,JSON.stringify(c));
 });
}
