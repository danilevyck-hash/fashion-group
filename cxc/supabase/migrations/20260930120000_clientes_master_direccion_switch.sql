-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: clientes_master — la DIRECCIÓN QUE MANDA SWITCH.
--
-- QUÉ ES: la dirección fiscal del cliente tal como la tiene Switch
-- (`switch_clientes.raw_data->>'direccion'`). Se guarda para poder MOSTRARLA en
-- la ficha del cliente, que hasta hoy no la tenía en ningún lado.
--
-- CUÁNTO HAY (medido contra producción el 5-sep-2026): **702 de las 847** filas
-- de `switch_clientes` de las 6 empresas del grupo la traen.
--
-- 🔴 NO ALIMENTA GUÍAS. Ni los destinos definidos, ni los botones de destino,
-- ni el autollenado. La razón está medida contra los destinos que Daniel definió
-- a mano y se contradicen con Switch:
--
--   · City Moda Chorrera (D-26) — Switch dice «Chorrera». Daniel marcó como «el
--     de siempre» **Sport Corner Calidonia**, que es a donde de verdad va la
--     mercancía.
--   · Sporting Shoes (D-142) — Switch dice «Los Andes, Panama», UNA línea.
--     Daniel le tiene **8 destinos definidos**, con tienda opcional.
--
-- La dirección de Switch es la del CLIENTE. El destino de una guía es a dónde va
-- ESE envío — es el invariante de Guías, y confundirlos haría salir cada guía de
-- esos dos clientes con el destino equivocado. Candado:
-- `clientes-direccion-no-alimenta-guias.test.ts` barre el módulo de Guías entero.
--
-- 🔴 SOLO LAS 6 DEL GRUPO. `clientes_master` es el directorio del GRUPO y solo
-- del grupo: no tiene columna de empresa, así que adentro un cliente de Boston
-- sería indistinguible de uno del grupo. Se pide por INCLUSIÓN, nunca excluyendo.
--
-- ⚠️ EL SYNC SÍ LA REFRESCA — al revés que `contacto`, `telefono` o `notas`.
-- Esta columna es un ESPEJO de Switch, no un dato que escriba la gente: si
-- Switch cambia la dirección del cliente, la ficha tiene que decir la nueva.
-- Por eso `direccion_switch` (y no `direccion` a secas): el nombre dice de dónde
-- viene y que nadie la edita a mano.
--
-- El código ya deployado es TOLERANTE a la ausencia de esta columna: la ficha
-- no muestra la línea y el upsert del sync reintenta sin ella. Correr esta DDL
-- cuando se pueda, sin coordinar con el deploy.
--
-- Aplicar con: npm run migrar supabase/migrations/20260930120000_clientes_master_direccion_switch.sql
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE clientes_master
  ADD COLUMN IF NOT EXISTS direccion_switch text;

COMMENT ON COLUMN clientes_master.direccion_switch IS
  'Dirección fiscal del cliente, espejo de switch_clientes.raw_data->>direccion. La refresca sync-clientes-master. 🔴 NO alimenta los destinos de Guías: el destino de una guía es a dónde va ESE envío, no la dirección del cliente (ver 20260930120000 y clientes-direccion-no-alimenta-guias.test.ts).';

-- ── Backfill: lo que Switch ya tiene, de las 6 del grupo y por CÓDIGO ────────
-- Si dos empresas mandan grafías distintas para el mismo código se toma la
-- primera alfabéticamente: es determinista, y el sync la reescribe con el mismo
-- criterio en cada corrida.
UPDATE clientes_master cm
   SET direccion_switch = sc.direccion
  FROM (
    SELECT codigo,
           min(btrim(regexp_replace(raw_data->>'direccion', '\s+', ' ', 'g'))) AS direccion
      FROM switch_clientes
     WHERE empresa_key IN ('vistana','fashion_wear','fashion_shoes',
                           'active_wear','active_shoes','joystep')
       AND raw_data->>'direccion' IS NOT NULL
       AND btrim(raw_data->>'direccion') <> ''
     GROUP BY codigo
  ) sc
 WHERE cm.codigo = sc.codigo
   AND cm.deleted = false;
