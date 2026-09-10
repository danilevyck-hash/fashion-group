#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// LA CARTERA DE CONFECCIONES BOSTON — ANTES Y DESPUÉS DE PRENDER EL CORREO.
//
// Prender un botón no puede mover un número. Este script mide contra producción
// (SOLO LECTURA, Management API) las cuatro cifras que el cambio podría tocar
// sin querer:
//
//   · cuántos clientes tienen saldo en Boston,
//   · cuánto suma su cartera,
//   · cuántos de ellos tienen correo cargado en Switch,
//   · cuántos tienen teléfono.
//
// Y una quinta que es la razón por la que el rastro del correo de Boston se
// acota por empresa: cuántos códigos de cliente existen en las DOS carteras.
// Hoy es UNO —`TCKCTA`, el mostrador— y con eso alcanza: un envío de Boston
// anotado sin decir de qué cartera es pintaría su marca en el CXC del grupo.
//
//   node scripts/_medir-boston-correo.mjs
// ─────────────────────────────────────────────────────────────────────────────
import fs from "node:fs";
import path from "node:path";

const RAIZ = path.resolve(new URL("..", import.meta.url).pathname);
const env = fs.readFileSync(path.join(RAIZ, ".env.local"), "utf8");
const TOKEN = (env.match(/^SUPABASE_ACCESS_TOKEN=(.*)$/m)?.[1] ?? "").trim().replace(/^["']|["']$/g, "");
if (!TOKEN) throw new Error("falta SUPABASE_ACCESS_TOKEN en .env.local");
const PROYECTO = "rspocgqhtpveytgbtler";

async function sql(query) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${PROYECTO}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

const money = (n) => `$${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CARTERA = `
with cartera as (select codigo, total from switch_estadocuenta_aging_boston),
     c as (
       select codigo,
              nullif(trim(email), '')    as email,
              nullif(trim(telefono), '') as tel,
              nullif(trim(celular), '')  as cel
       from switch_clientes
       where empresa_key = 'confecciones_boston'
     )
select count(*)                                                        as clientes,
       round(sum(a.total)::numeric, 2)                                 as total,
       count(*) filter (where c.email is not null)                     as con_correo,
       count(*) filter (where coalesce(c.cel, c.tel) is not null)      as con_telefono
from cartera a
left join c on c.codigo = a.codigo;`;

const CRUCE = `
select count(*) as codigos_en_las_dos_carteras
from (select distinct cliente_codigo from switch_estadocuenta where empresa_key = 'confecciones_boston') b
where exists (
  select 1 from switch_estadocuenta g
  where g.empresa_key <> 'confecciones_boston' and g.cliente_codigo = b.cliente_codigo
);`;

// El rastro de lo que se mandó, separado por cartera. El de Boston se reconoce
// porque su fila lleva `confecciones_boston` en la columna `empresas`.
const RASTRO = `
select
  count(*) filter (where 'confecciones_boston' = any(empresas))     as envios_de_boston,
  count(*) filter (where not ('confecciones_boston' = any(empresas))) as envios_del_grupo
from cxc_emails_enviados;`;

const [cartera] = await sql(CARTERA);
const [cruce] = await sql(CRUCE);
const [rastro] = await sql(RASTRO);

console.log("\nCONFECCIONES BOSTON — la cartera");
console.log(`  clientes con saldo .......... ${cartera.clientes}`);
console.log(`  total de la cartera ......... ${money(cartera.total)}`);
console.log(`  con correo cargado .......... ${cartera.con_correo}`);
console.log(`  con teléfono cargado ........ ${cartera.con_telefono}`);
console.log("\nPor qué el rastro se acota por cartera");
console.log(`  códigos que están en las DOS  ${cruce.codigos_en_las_dos_carteras}`);
console.log("\nEl rastro de envíos (cxc_emails_enviados)");
console.log(`  anotados de Boston .......... ${rastro.envios_de_boston}`);
console.log(`  anotados del grupo .......... ${rastro.envios_del_grupo}`);
console.log("");
