-- ============================================================================
-- ARREGLO DE UN DATO: a la factura #145 no se le cobra a ninguna marca
-- (6-oct-2026)
-- ============================================================================
--
-- 🔴 🔴 ESCRITA Y **SIN APLICAR**. ESPERA EL "SI" DE DANIEL.
--    Esto NO es un cambio de esquema: TOCA UNA FILA DE PLATA REAL.
--    Se corrio con `-- --dry-run` y nada mas.
--
--    npm run migrar supabase/migrations/20270101130000_factura_145_sin_marca.sql
--
-- ⚠️ DEPENDE de `20270101120000_mkt_proveedores.sql`, que tampoco esta
--    aplicada. Primero esa, despues esta.
--
-- ----------------------------------------------------------------------------
-- QUE DIJO DANIEL (6-oct-2026)
-- ----------------------------------------------------------------------------
--   Primero: "la factura #145 esta mal, son inventario mio. Quitale Tommy y
--   marcala como inventario, sin cambiar el monto ni borrarla."
--
--   Despues, al ver el mockup: "no es algo de siempre, que lo pueda poner como
--   gasto y en Mobiliario yo pongo la cantidad y listo para saber cuanto
--   tengo", y la #145 queda como gasto SIN MARCA. Y sobre crear el producto
--   «Barras planas» en Mobiliario: **"no"**.
--
--   Y la aclaracion final: "algunas se registran para cobrar la mitad y
--   algunas muy pocas no, como el caso de la barra" — la #145 es de esas
--   pocas: no se le cobra a ninguna marca y queda A CARGO DE LA EMPRESA, sin
--   elegir cual.
--
--   Por eso esta migracion NO toca Mobiliario: no crea producto, no suma
--   stock, no engancha nada. Solo le quita Tommy a la factura y dice que es
--   mi costo.
--
-- ----------------------------------------------------------------------------
-- QUE DICE LA BASE (medido contra produccion el 6-oct-2026, solo lectura)
-- ----------------------------------------------------------------------------
--   mk_facturas.id         = ecb36131-a3a8-44fe-9baf-31d361f337a6
--   numero_factura         = '0000000145'
--   fecha_factura          = 2026-10-05
--   proveedor              = 'Krysthel Yanneth Morales Martinez'
--   concepto               = 'Barras Planas (60 unidades a 8.50 c/u)'
--   subtotal / itbms/total = 510.00 / 35.70 / **545.70**
--   anulado_en             = NULL     (esta viva)
--   tienda_codigo          = NULL     (cajon "General")
--   mk_factura_marcas      = 1 fila: Tommy Hilfiger (TH) al 100 %
--   mk_periodo_documentos  = 1 sello: periodo f1ac9b37-61af-4d84-8fc1-fe8bb3fc4d86
--                            (TH, "Periodo 2026", estado = **ABIERTO**)
--
-- 🔑 LO QUE HACE QUE ESTO SEA SEGURO: el periodo de Tommy esta **ABIERTO**.
--    O sea, la factura TODAVIA NO SE LE PASO a Tommy en ningun ZIP cerrado.
--    Es exactamente lo contrario del caso del mueble de $4.630 de D-118
--    (`docs/postmortems/marketing-rediseno.md`), que SI estaba en un ZIP
--    cerrado y por eso no se movio. Aqui sacarla del periodo abierto es
--    quitarla del PROXIMO ZIP, que es lo que Daniel quiere.
--
-- ----------------------------------------------------------------------------
-- QUE TOCA, EN PALABRAS SIMPLES
-- ----------------------------------------------------------------------------
--   1. `mk_factura_marcas`: se BORRA 1 fila (Tommy al 100 % de esa factura).
--      Es la tabla de amarre; borrar ahi no borra la factura ni su plata.
--   2. `mk_periodo_documentos`: se BORRA 1 sello (el de TH, periodo abierto),
--      para que la factura no salga en el proximo ZIP de Tommy.
--   3. `mk_facturas`: se escribe `pct_a_la_marca = 0` (no se le cobra a
--      ninguna marca) y se le agrega una nota.
--
--   🔴 NO se toca el monto (510.00 / 35.70 / 545.70), NO se anula, NO se borra
--      la factura, NO se cambia el proveedor ni la fecha, y NO se toca
--      Mobiliario. Total de filas tocadas: 2 borradas + 1 actualizada.
-- ============================================================================

BEGIN;

-- --- 0. Candados: si algo no es como se midio, esto se cae y no toca nada ---
DO $$
DECLARE
  v_total NUMERIC;
  v_anulado TIMESTAMPTZ;
  v_marcas INT;
  v_cerrados INT;
BEGIN
  SELECT total, anulado_en INTO v_total, v_anulado
    FROM mk_facturas WHERE id = 'ecb36131-a3a8-44fe-9baf-31d361f337a6';
  IF v_total IS NULL THEN
    RAISE EXCEPTION 'La factura #145 no esta donde se midio. No se toca nada.';
  END IF;
  IF v_total <> 545.70 THEN
    RAISE EXCEPTION 'El total de #145 cambio (ahora %). Hay que volver a medir.', v_total;
  END IF;
  IF v_anulado IS NOT NULL THEN
    RAISE EXCEPTION 'La factura #145 ya esta anulada. No se toca nada.';
  END IF;
  SELECT count(*) INTO v_marcas FROM mk_factura_marcas
    WHERE factura_id = 'ecb36131-a3a8-44fe-9baf-31d361f337a6';
  IF v_marcas <> 1 THEN
    RAISE EXCEPTION 'Se esperaba 1 marca en #145 y hay %. Hay que volver a medir.', v_marcas;
  END IF;
  -- 🔴 EL CANDADO QUE IMPORTA: si el sello cayera en un periodo CERRADO, la
  -- factura ya se le paso a Tommy y quitarla seria mentirle a un ZIP enviado.
  SELECT count(*) INTO v_cerrados
    FROM mk_periodo_documentos d
    JOIN mk_periodos p ON p.id = d.periodo_id
   WHERE d.documento_id = 'ecb36131-a3a8-44fe-9baf-31d361f337a6'
     AND p.estado = 'cerrado';
  IF v_cerrados > 0 THEN
    RAISE EXCEPTION
      'La #145 esta sellada en % periodo(s) CERRADO(s): ya se le reporto a la marca. Pregunta a Daniel antes de moverla.', v_cerrados;
  END IF;
END $$;

-- --- 1. Se le quita Tommy -----------------------------------------------------
DELETE FROM mk_factura_marcas
 WHERE factura_id = 'ecb36131-a3a8-44fe-9baf-31d361f337a6';

-- --- 2. Se le quita el sello del periodo ABIERTO de Tommy ---------------------
-- Solo los abiertos: el `WHERE` repite el candado por si acaso.
DELETE FROM mk_periodo_documentos d
 WHERE d.documento_id = 'ecb36131-a3a8-44fe-9baf-31d361f337a6'
   AND EXISTS (SELECT 1 FROM mk_periodos p
                WHERE p.id = d.periodo_id AND p.estado = 'abierto');

-- --- 3. A la factura no se le cobra a ninguna marca ---------------------------
-- 🔴 El monto no se toca: `pct_a_la_marca = 0` dice que los mismos $545.70
--    quedan a cargo de la empresa.
UPDATE mk_facturas f
   SET pct_a_la_marca = 0,
       nota = COALESCE(NULLIF(f.nota, ''), '')
              || CASE WHEN COALESCE(f.nota, '') = '' THEN '' ELSE ' · ' END
              || 'A cargo de la empresa (Daniel, 6-oct-2026): se le quito Tommy Hilfiger.',
       updated_at = NOW()
 WHERE f.id = 'ecb36131-a3a8-44fe-9baf-31d361f337a6';

-- --- 4. Rastro: quien lo hizo y por que --------------------------------------
INSERT INTO activity_logs (role, action, module, details, user_name)
VALUES (
  'admin',
  'factura_sin_marca',
  'marketing',
  jsonb_build_object(
    'facturaId',     'ecb36131-a3a8-44fe-9baf-31d361f337a6',
    'numeroFactura', '0000000145',
    'total',         545.70,
    'marcaQuitada',  'Tommy Hilfiger (TH), 100 %',
    'porque',        'Daniel, 6-oct-2026: no se le cobra a ninguna marca',
    'montoSinTocar', true,
    'mobiliario',    'no se toca: Daniel escribe la cantidad a mano'
  ),
  'Daniel Levy'
);

COMMIT;

-- ============================================================================
-- COMO SE DESHACE (si Daniel cambia de opinion)
-- ============================================================================
-- BEGIN;
-- UPDATE mk_facturas SET pct_a_la_marca = NULL
--  WHERE id = 'ecb36131-a3a8-44fe-9baf-31d361f337a6';
-- INSERT INTO mk_factura_marcas (factura_id, marca_id, porcentaje)
-- VALUES ('ecb36131-a3a8-44fe-9baf-31d361f337a6',
--         '1673d8a7-582c-4568-8608-34c88b4b6ec6', 100);
-- -- el sello lo vuelve a poner `setMarcasDeFactura` en la proxima edicion.
-- COMMIT;
-- ============================================================================
