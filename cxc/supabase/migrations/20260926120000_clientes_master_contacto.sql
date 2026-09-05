-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_master — la casilla «Contacto» de la ficha del cliente.
--
-- QUÉ ES: el NOMBRE DE LA PERSONA con quien se habla en ese cliente. No es un
-- teléfono ni un correo: es «con quién pregunto» al llamar a cobrar. Se edita
-- a mano en la ficha (`/clientes/[codigo]`), arriba de Correo.
--
-- POR QUÉ UNA COLUMNA NUEVA (medido el 5-sep-2026):
--   · `clientes_master` NO tiene dónde guardarlo. Las guías, los pedidos y el
--     CXC ya arrastran un campo `contacto` en sus tipos, y el aging del CXC lo
--     devuelve como `''::text` HARDCODEADO en la vista, justamente porque no
--     hay de dónde sacarlo.
--   · Existe en Switch (`switch_clientes.raw_data->>'nombreContacto'`) pero
--     está VACÍO: lleno en **3 de 847** filas de las 6 empresas del grupo, y en
--     **1 solo** de los 100 clientes que deben. O sea: el campo existe, nadie
--     lo llena allá, y de acá en adelante se llena acá.
--
-- QUÉ SE RESCATA (los 5 que ya existían, escritos a mano en otros lados):
--   · 3 de `cxc_client_overrides` (cartera 'grupo'):
--       «Alberto levy» → CONFECCIONES BOSTON
--       «Mohamed»      → ZONA SUR DUTTY FREE SA
--       «emad»         → INTERNACIONAL BELEN
--   · 2 que Switch sí manda:
--       «Victor Rodriguez» → D-170 (Nova Lux)
--       «Narimy»           → D-202 (Gazzini Plaza)
--
-- 🔴 EL SYNC NO LA PISA. `sync-clientes-master.ts` hace `upsert(onConflict=codigo)`
-- con una lista EXPLÍCITA de columnas fiscales que NO incluye
-- telefono/celular/email/notas — `contacto` entra a esa misma familia: lo
-- escribe la gente, no Switch. Hay candado que pone el build ROJO si `contacto`
-- aparece en el payload de ese upsert.
--
-- 🔴 EL BACKFILL DE SWITCH SOLO MIRA LAS 6 DEL GRUPO. `clientes_master` es el
-- directorio del GRUPO y solo del grupo; un `nombreContacto` de
-- confecciones_boston o american_classic no tiene por qué entrar acá.
--
-- ⚠️ El backfill NO PISA lo que ya haya: `WHERE contacto IS NULL`. Se corre una
-- vez y volver a correrla no cambia nada de lo que alguien haya editado.
--
-- El código ya deployado es TOLERANTE a la ausencia de esta columna (la ficha
-- no muestra la casilla y el PATCH la ignora) — correr esta DDL cuando se
-- pueda, sin coordinar con el deploy.
--
-- Aplicar con: npm run migrar supabase/migrations/20260926120000_clientes_master_contacto.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clientes_master
  ADD COLUMN IF NOT EXISTS contacto text;

COMMENT ON COLUMN clientes_master.contacto IS
  'Nombre de la persona con quien se habla en este cliente. Lo escribe la gente desde la ficha (/clientes/[codigo]); el sync de Switch NUNCA lo pisa (misma familia que telefono/celular/email/notas).';

-- ── Rescate 1: los contactos escritos en las notas del CXC del GRUPO ─────────
-- Se cruza por `nombre_normalized`, que es la ÚNICA llave que tiene
-- `cxc_client_overrides` (una anotación es de una CARTERA, no de una empresa).
-- Acotado a la cartera 'grupo' a propósito: una nota de Boston no entra al
-- directorio del grupo.
UPDATE clientes_master cm
   SET contacto = btrim(o.contacto)
  FROM cxc_client_overrides o
 WHERE o.cartera = 'grupo'
   AND o.contacto IS NOT NULL
   AND btrim(o.contacto) <> ''
   AND cm.nombre_normalized = o.nombre_normalized
   AND cm.deleted = false
   AND cm.contacto IS NULL;

-- ── Rescate 2: el `nombreContacto` que Switch sí manda, de las 6 del grupo ───
-- Por CÓDIGO, nunca por nombre. Si dos empresas mandan grafías distintas para
-- el mismo código se toma la primera alfabéticamente: es determinista y son
-- 3 filas en total, todas iguales entre sí.
UPDATE clientes_master cm
   SET contacto = sc.contacto
  FROM (
    SELECT codigo, min(btrim(raw_data->>'nombreContacto')) AS contacto
      FROM switch_clientes
     WHERE empresa_key IN ('vistana','fashion_wear','fashion_shoes',
                           'active_wear','active_shoes','joystep')
       AND raw_data->>'nombreContacto' IS NOT NULL
       AND btrim(raw_data->>'nombreContacto') <> ''
     GROUP BY codigo
  ) sc
 WHERE cm.codigo = sc.codigo
   AND cm.deleted = false
   AND cm.contacto IS NULL;
