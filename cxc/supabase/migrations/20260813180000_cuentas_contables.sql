-- =============================================================================
-- CATALOGO DE CUENTAS CONTABLES de Switch (Contabilidad -> Catalogo de cuentas)
-- =============================================================================
-- Aplicar A MANO en Supabase Dashboard -> SQL Editor.
-- ADITIVA e IDEMPOTENTE. CERO DELETE/DROP de tablas ni de datos.
--
-- La pantalla /gastos-contabilidad FUNCIONA ANTES de que esto corra: la lectura
-- reconoce "la tabla no existe" (PostgREST 42P01 / PGRST205) y cae al unico
-- nombre que hoy existe -- el que el CSV del mayor trae pegado a cada linea
-- (`mayor_lineas.cuenta_nombre`). Y el sync se omite LIMPIO sin pedirle nada a
-- Switch (`cuentasInstalado()`), asi que tampoco expulsa a nadie del panel.
--
-- ── POR QUE HACE FALTA ───────────────────────────────────────────────────────
--
-- El reporte de EGRESOS VARIOS trae el CODIGO de la cuenta y NO su nombre. En
-- pantalla eso son renglones como `6.02.01 - $63,938.43`: un numero al lado de
-- otro numero. Medido el 13-ago-2026 sobre los 378 renglones reales de Vistana
-- (42 cuentas distintas), cruzando contra los nombres que ya estaban en
-- `mayor_lineas`: 22 cuentas tenian nombre y 20 no, y esas 20 valen $55,463.70.
--
-- Y el nombre NO se deduce del codigo: `6.02.01.00.00` parece "salarios" por
-- vecindad con 6.01 y en realidad es SERVICIOS PROFESIONALES -- el gasto mas
-- grande de Vistana. Un nombre inventado encima de una cifra de plata es peor
-- que el codigo pelado.
--
-- ── POR QUE UNA TABLA APARTE Y NO UNA COLUMNA EN `egresos_varios` ────────────
--
--  1. El nombre es de la CUENTA, no del renglon. Repetirlo en cada renglon lo
--     deja desincronizado en cuanto la contadora renombre una cuenta en Switch:
--     los renglones viejos conservarian el nombre viejo para siempre.
--  2. El catalogo tiene cuentas que todavia no se usaron en ningun egreso, y son
--     justamente las que hacen falta el dia que aparezca un pago nuevo.
--  3. `mayor_lineas` ya guarda su `cuenta_nombre` (viene DENTRO de su CSV) y esa
--     columna NO se toca: es el dato tal como llego, y es lo que sostiene la
--     pantalla mientras este catalogo no se haya bajado.
--
-- ── POR QUE SE GUARDAN TODOS LOS NIVELES ────────────────────────────────────
--
-- Switch devuelve un nodo por cuenta de los 5 niveles (grupo, cuenta, subcuenta,
-- auxiliar), todos con el codigo COMPLETO de 5 segmentos y su nombre. Un egreso
-- puede venir cargado en cualquiera de ellos (`6.02.01.00.00` es de nivel 3;
-- `2.01.04.02.00`, de nivel 4), asi que quedarse con un solo nivel dejaria sin
-- nombre justo a la mitad de los renglones.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cuentas_contables (
  empresa_key text NOT NULL CHECK (empresa_key IN (
                'vistana', 'fashion_wear', 'fashion_shoes', 'active_shoes',
                'active_wear', 'joystep', 'confecciones_boston',
                'american_classic'
              )),
  -- Codigo COMPLETO de 5 segmentos ("6.02.01.00.00"). No se aplana nunca: es la
  -- llave con la que se cruza contra `egresos_varios.cuenta`, que tambien lo
  -- guarda completo.
  cuenta      text NOT NULL CHECK (cuenta ~ '^[0-9]+(\.[0-9]+){4}'),
  -- Tal como lo escribio la contadora en Switch. NUNCA vacio: un nombre vacio
  -- pintaria "6.02.01 - " (un guion colgando, que se lee como un error de la
  -- app) y ademas taparia el nombre que si pueda traer el mayor.
  nombre      text NOT NULL CHECK (btrim(nombre) <> ''),
  -- El nombre TAL COMO vino de Switch. Los nombres del panel traen espacios de
  -- mas (" SERVICIOS    PROFESIONALES ", y hasta el encabezado del CSV dice
  -- " NOMBRE  CUENTA "), asi que lo que se PINTA es `nombre` -- el normalizado.
  -- El crudo se guarda para poder auditar contra el panel: sin el, el dia que un
  -- nombre no cuadre no habria con que comparar.
  nombre_switch text,
  -- 1..5 segun Switch. Es lo que dice cuantos segmentos del codigo significan
  -- algo; puede venir nulo si el panel no lo manda.
  nivel       int CHECK (nivel IS NULL OR nivel BETWEEN 1 AND 5),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Una cuenta por empresa. El catalogo NO es global a proposito: cada empresa
  -- tiene el suyo en Switch y los nombres difieren.
  PRIMARY KEY (empresa_key, cuenta)
);

-- El uso real es "dame todas las cuentas de esta empresa" (para armar el
-- diccionario de una pantalla), que la PK ya sirve. No se agregan indices que
-- nadie consulta.

-- ── sync_type 'cuentas_contables' --------------------------------------------
-- Un CHECK no se extiende: se reescribe entero. Sin esto el logger es
-- degradable (se traga el error del INSERT y devuelve logId null), asi que la
-- corrida NO deja fila ni de exito ni de error. Ya paso DOS veces
-- (catalogo_tommy y articulo_marca), por eso va en la MISMA migracion.
-- La lista tiene que ser identica a SYNC_LOG_TYPES (src/lib/switch-api/
-- sync-log-tipos.ts); lo verifica sync-log-tipos-check.test.ts.

ALTER TABLE switch_sync_log DROP CONSTRAINT IF EXISTS switch_sync_log_sync_type_check;

ALTER TABLE switch_sync_log
  ADD CONSTRAINT switch_sync_log_sync_type_check
  CHECK (sync_type IN (
    'facturas',
    'estadocuenta',
    'costo',
    'utilidad',
    'recibos',
    'proveedores',
    'articulos',
    'articulo_marca',
    'articulo_info',
    'multifashion',
    'catalogo_reebok',
    'catalogo_joybees',
    'catalogo_tommy',
    'catalogo_calvin',
    'mayor',
    'egresos_varios',
    'cuentas_contables'
  ));


-- ── SIEMBRA: el catalogo REAL de vistana, 13-ago-2026 ------------------------
--
-- Daniel bajo el catalogo del panel (Contabilidad -> Catalogo de cuentas ->
-- Excel) y lo mando por WhatsApp. Se siembra ACA para que el modulo Gastos
-- muestre `codigo - NOMBRE` **hoy**, sin esperar a que el cron abra sesion en
-- Switch (corre 10:35 UTC = 05:35 a.m. de Panama, o sea manana).
--
-- Cruce medido contra el reporte de Egresos Varios del MISMO dia: estas 147
-- cuentas cubren **41 de las 42** que usa vistana. La unica que falta es
-- `5.03.00.00.00` ($923.82), que no esta en el catalogo que mando Daniel; sale
-- con su codigo pelado, nunca con un nombre inventado.
--
-- 🔴 `ON CONFLICT DO NOTHING` a proposito: la siembra NO pisa nada. El sync web
-- hace UPSERT, asi que en cuanto el cron traiga el catalogo vivo, EL manda --
-- que es lo correcto: este archivo es una foto de un dia y de UNA empresa.
--
-- ⚠️ SOLO VISTANA. Los codigos podrian diferir por empresa y eso NO se asumio:
-- las otras siete reciben su catalogo del cron, cada una del suyo.
--
-- Generado con `npx tsx scripts/_generar-seed-cuentas.ts vistana`; el candado
-- `cuentas-catalogo-csv.test.ts` vuelve a parsear el CSV y exige que estas
-- filas sean IDENTICAS -- una siembra editada a mano se pondria roja.

INSERT INTO cuentas_contables (empresa_key, cuenta, nombre, nombre_switch, nivel) VALUES
  ('vistana', '1.00.00.00.00', 'ACTIVO', 'ACTIVO', 1),
  ('vistana', '1.01.00.00.00', 'CAJA', ' CAJA   ', 2),
  ('vistana', '1.01.01.00.00', 'CAJA MENUDA', ' CAJA    MENUDA ', 3),
  ('vistana', '1.01.02.00.00', 'CAJA GENERAL', ' CAJA  GENERAL ', 3),
  ('vistana', '1.02.00.00.00', 'BANCO', 'BANCO', 2),
  ('vistana', '1.02.01.00.00', 'BANCO GENERAL CORRIENTE', ' BANCO  GENERAL  CORRIENTE ', 3),
  ('vistana', '1.02.02.00.00', 'BANCO GENERAL AHORRO', ' BANCO  GENERAL  AHORRO ', 3),
  ('vistana', '1.02.03.00.00', 'BANCO ALIADO', ' BANCO  ALIADO ', 3),
  ('vistana', '1.03.00.00.00', 'CUENTAS POR COBRAR', ' CUENTAS    POR    COBRAR ', 2),
  ('vistana', '1.03.01.00.00', 'CUENTAS POR COBRAR CLIENTES', ' CUENTAS    POR    COBRAR    CLIENTES ', 3),
  ('vistana', '1.03.03.00.00', 'RESERVA PARA CUENTAS MALAS', ' RESERVA    PARA    CUENTAS    MALAS ', 3),
  ('vistana', '1.03.04.00.00', 'CUENTAS POR COBRAR COLABORADORES', ' CUENTAS    POR    COBRAR    COLABORADORES ', 3),
  ('vistana', '1.03.05.00.00', 'CUENTAS POR COBRAR ACCIONISTAS', ' CUENTAS    POR    COBRAR    ACCIONISTAS ', 3),
  ('vistana', '1.03.05.01.00', 'CUENTAS POR COBRAR MIRIAM CH. DE LEVY', ' CUENTAS  POR  COBRAR  MIRIAM  CH.  DE  LEVY ', 4),
  ('vistana', '1.03.05.02.00', 'CUENTAS POR COBRAR ACCIONISTA', ' CUENTAS  POR  COBRAR  ACCIONISTA ', 4),
  ('vistana', '1.03.06.00.00', 'CUENTAS POR COBRAR RELACIONADAS', ' CUENTAS  POR  COBRAR  RELACIONADAS ', 3),
  ('vistana', '1.03.06.01.00', 'CONFECCIONES BOSTON', ' CONFECCIONES  BOSTON ', 4),
  ('vistana', '1.03.06.02.00', 'VISTANA INTERNATIONAL,', ' VISTANA    INTERNATIONAL, ', 4),
  ('vistana', '1.03.06.03.00', 'FASHION SHOES', ' FASHION  SHOES ', 4),
  ('vistana', '1.03.06.04.00', 'MULTIFASHION HOLDING', ' MULTIFASHION  HOLDING ', 4),
  ('vistana', '1.03.06.05.00', 'ACTIVE SHOES', ' ACTIVE  SHOES ', 4),
  ('vistana', '1.03.06.06.00', 'ACTIVE WEAR', ' ACTIVE  WEAR ', 4),
  ('vistana', '1.03.06.07.00', 'CUENTAS POR COBRAR PH', ' CUENTAS  POR  COBRAR  PH ', 4),
  ('vistana', '1.03.06.08.00', 'JOYSTEP CORP', ' JOYSTEP  CORP ', 4),
  ('vistana', '1.03.09.00.00', 'CUENTAS POR COBRAR OTRAS', ' CUENTAS    POR    COBRAR    OTRAS ', 3),
  ('vistana', '1.04.00.00.00', 'INVENTARIO', 'INVENTARIO', 2),
  ('vistana', '1.04.01.00.00', 'INVENTARIO DE MERCANCIA', ' INVENTARIO    DE    MERCANCIA ', 3),
  ('vistana', '1.04.09.00.00', 'INVENTARIO EN TRANSITO', ' INVENTARIO    EN    TRANSITO ', 3),
  ('vistana', '1.05.00.00.00', 'PROPIEDADES Y EQUIPO', ' PROPIEDADES    Y    EQUIPO ', 2),
  ('vistana', '1.05.01.00.00', 'MOBILIARIO Y ENSERES', ' MOBILIARIO    Y    ENSERES ', 3),
  ('vistana', '1.05.02.00.00', 'EQUIPO DE OFICINA', ' EQUIPO    DE    OFICINA ', 3),
  ('vistana', '1.05.03.00.00', 'AUTOMOVILES', 'AUTOMOVILES', 3),
  ('vistana', '1.05.04.00.00', 'MEJORAS AL LOCAL', ' MEJORAS    AL    LOCAL ', 3),
  ('vistana', '1.05.05.00.00', 'DEP. MOBILIARIO Y ENSERES', ' DEP.    MOBILIARIO    Y    ENSERES ', 3),
  ('vistana', '1.05.06.00.00', 'DEP. ACUM. EQUIPO DE OFICINA', ' DEP.    ACUM.    EQUIPO    DE    OFICINA ', 3),
  ('vistana', '1.05.07.00.00', 'DEP. ACUM.AUTOMOVILES', ' DEP.    ACUM.AUTOMOVILES ', 3),
  ('vistana', '1.05.08.00.00', 'DEP.ACUM, MEJORAS AL LOCAL', ' DEP.ACUM,    MEJORAS    AL    LOCAL ', 3),
  ('vistana', '1.06.00.00.00', 'OTROS ACTIVOS', ' OTROS    ACTIVOS ', 2),
  ('vistana', '1.06.01.00.00', 'ADELANTO DE IMP./RENTA', ' ADELANTO    DE    IMP./RENTA ', 3),
  ('vistana', '1.06.02.00.00', 'SEGUROS PAG. POR ADELANTADO', ' SEGUROS    PAG.    POR    ADELANTADO ', 3),
  ('vistana', '1.06.03.00.00', 'ANTICIPO A PROVEEDORES', ' ANTICIPO    A    PROVEEDORES ', 3),
  ('vistana', '1.06.04.00.00', 'GASTOS PAG. POR ADELANTADO', ' GASTOS    PAG.    POR    ADELANTADO ', 3),
  ('vistana', '1.06.05.00.00', 'OTROS ACTIVOS', ' OTROS  ACTIVOS ', 3),
  ('vistana', '2.00.00.00.00', 'PASIVO', 'PASIVO', 1),
  ('vistana', '2.01.00.00.00', 'CUENTAS POR PAGAR', ' CUENTAS    POR    PAGAR ', 2),
  ('vistana', '2.01.01.00.00', 'CUENTAS POR PAGAR PROVEEDORES', ' CUENTAS    POR    PAGAR    PROVEEDORES ', 3),
  ('vistana', '2.01.03.00.00', 'CUENTAS POR PAGAR BANCOS', ' CUENTAS    POR    PAGAR    BANCOS ', 3),
  ('vistana', '2.01.04.00.00', 'CUENTAS POR PAGAR GOBIERNO', ' CUENTAS    POR    PAGAR    GOBIERNO ', 3),
  ('vistana', '2.01.04.01.00', 'ITBMS POR PAGAR', ' ITBMS    POR    PAGAR ', 4),
  ('vistana', '2.01.04.02.00', 'IMPUESTO SOBRE/RENTA POR PAGAR', ' IMPUESTO    SOBRE/RENTA    POR    PAGAR ', 4),
  ('vistana', '2.01.04.03.00', 'CAJA DE SEGURO SOCIAL POR PAGAR', ' CAJA    DE    SEGURO    SOCIAL    POR    PAGAR ', 4),
  ('vistana', '2.01.04.05.00', 'IMP. MUNICIPAL POR PAGAR', ' IMP.    MUNICIPAL    POR    PAGAR ', 4),
  ('vistana', '2.01.04.06.00', 'ARREGLO DE PAGO DGI', ' ARREGLO  DE  PAGO  DGI ', 4),
  ('vistana', '2.01.05.00.00', 'CUENTAS POR PAGAR COLABORADORES Y TERCEROS', ' CUENTAS    POR    PAGAR    COLABORADORES    Y    TERCEROS ', 3),
  ('vistana', '2.01.05.01.00', 'SALARIOS POR PAGAR', ' SALARIOS    POR    PAGAR ', 4),
  ('vistana', '2.01.05.02.00', 'COMISIONES POR PAGAR', ' COMISIONES  POR  PAGAR ', 4),
  ('vistana', '2.01.05.05.00', 'RETENCIONES A COLABORADORES POR PAGAR', ' RETENCIONES        A    COLABORADORES    POR    PAGAR ', 4),
  ('vistana', '2.01.07.00.00', 'DEPOSITO DE CLIENTE POR IDENTIFICAR', ' DEPOSITO  DE  CLIENTE  POR  IDENTIFICAR ', 3),
  ('vistana', '2.01.09.00.00', 'OTRAS CUENTAS POR PAGAR', ' OTRAS    CUENTAS    POR    PAGAR ', 3),
  ('vistana', '2.02.00.00.00', 'CUENTAS POR PAGAR ACCIONISTAS', ' CUENTAS    POR    PAGAR    ACCIONISTAS ', 2),
  ('vistana', '2.03.00.00.00', 'CUENTAS POR PAGAR EMPRESAS RELACIONADAS', ' CUENTAS  POR  PAGAR  EMPRESAS  RELACIONADAS ', 2),
  ('vistana', '2.03.01.00.00', 'CUENTAS POR PAGAR MULTI FASHION HOLDING', ' CUENTAS  POR  PAGAR  MULTI  FASHION  HOLDING ', 3),
  ('vistana', '2.03.02.00.00', 'CUENTAS POR PAGAR C. BOSTON', ' CUENTAS  POR  PAGAR  C.  BOSTON ', 3),
  ('vistana', '2.03.03.00.00', 'CUENTAS POR PAGAR FASHION SHOES', ' CUENTAS  POR  PAGAR    FASHION  SHOES ', 3),
  ('vistana', '2.03.04.00.00', 'CUENTAS POR PAGAR VISTANA', ' CUENTAS  POR  PAGAR  VISTANA ', 3),
  ('vistana', '2.03.05.00.00', 'CUENTAS POR PAGAR ACTIVE SHOES', ' CUENTAS  POR  PAGAR  ACTIVE  SHOES ', 3),
  ('vistana', '2.03.06.00.00', 'CUENTAS POR PAGAR ACTIVE WEAR', ' CUENTAS  POR  PAGAR  ACTIVE  WEAR ', 3),
  ('vistana', '2.03.07.00.00', 'CUENTAS POR PAGAR PH', ' CUENTAS  POR  PAGAR  PH ', 3),
  ('vistana', '2.03.08.00.00', 'CUENTAS POR PAGAR JOYSTEP CORP', ' CUENTAS  POR  PAGAR  JOYSTEP  CORP ', 3),
  ('vistana', '2.05.00.00.00', 'PRESTAMO POR PAGAR', ' PRESTAMO  POR  PAGAR ', 2),
  ('vistana', '2.09.00.00.00', 'OTROS PASIVOS', ' OTROS  PASIVOS ', 2),
  ('vistana', '3.00.00.00.00', 'PATRIMONIO', 'PATRIMONIO', 1),
  ('vistana', '3.01.00.00.00', 'CAPITAL SOCIAL AUTORIZADO', ' CAPITAL    SOCIAL    AUTORIZADO ', 2),
  ('vistana', '3.01.01.00.00', 'CAPITAL SOCIAL', ' CAPITAL  SOCIAL ', 3),
  ('vistana', '3.01.02.00.00', 'UTILIDADES ACUMULADAS', ' UTILIDADES  ACUMULADAS ', 3),
  ('vistana', '3.01.03.00.00', 'IMPUESTO COMPLEMENTARIO', ' IMPUESTO  COMPLEMENTARIO ', 3),
  ('vistana', '3.02.00.00.00', 'UTILIDADES DEL PERIODO', ' UTILIDADES    DEL  PERIODO ', 2),
  ('vistana', '3.03.00.00.00', 'RESUMEN DE GANANCIAS Y PRDIDAS', ' RESUMEN  DE  GANANCIAS  Y  PRDIDAS ', 2),
  ('vistana', '4.00.00.00.00', 'INGRESOS', 'INGRESOS', 1),
  ('vistana', '4.01.00.00.00', 'VENTAS AL CONTADO', ' VENTAS  AL  CONTADO ', 2),
  ('vistana', '4.02.00.00.00', 'VENTA AL CREDITO', ' VENTA  AL  CREDITO ', 2),
  ('vistana', '4.05.00.00.00', 'DEV. Y DESCUENTO EN VENTAS', ' DEV.    Y    DESCUENTO    EN    VENTAS ', 2),
  ('vistana', '4.09.00.00.00', 'OTROS INGRESOS', ' OTROS    INGRESOS ', 2),
  ('vistana', '4.09.01.00.00', 'SOBRANTES DE INVENTARIO', ' SOBRANTES    DE    INVENTARIO ', 3),
  ('vistana', '4.09.08.00.00', 'INGRESOS POR VENTA DE ACTIVO FIJO', ' INGRESOS    POR    VENTA    DE    ACTIVO    FIJO ', 3),
  ('vistana', '4.09.09.00.00', 'INGRESOS VARIOS', ' INGRESOS    VARIOS ', 3),
  ('vistana', '5.00.00.00.00', 'COSTOS', 'COSTOS', 1),
  ('vistana', '5.01.00.00.00', 'COSTOS DE VENTAS LOCALES', ' COSTOS    DE    VENTAS    LOCALES ', 2),
  ('vistana', '5.02.00.00.00', 'COSTO DE VENTAS IMPORTADAS', ' COSTO    DE    VENTAS    IMPORTADAS ', 2),
  ('vistana', '5.05.00.00.00', 'DEV. Y DESC. EN COMPRAS', ' DEV.    Y    DESC.    EN    COMPRAS ', 2),
  ('vistana', '6.00.00.00.00', 'GASTOS', 'GASTOS', 1),
  ('vistana', '6.01.00.00.00', 'GASTOS SALARIALES', ' GASTOS    SALARIALES ', 2),
  ('vistana', '6.01.01.00.00', 'SALARIOS', 'SALARIOS', 3),
  ('vistana', '6.01.02.00.00', 'COMISIONES', 'COMISIONES', 3),
  ('vistana', '6.01.03.00.00', 'VACACIONES', 'VACACIONES', 3),
  ('vistana', '6.01.04.00.00', 'XIII MES', ' XIII    MES ', 3),
  ('vistana', '6.01.05.00.00', 'CUOTA PATRONAL', ' CUOTA    PATRONAL ', 3),
  ('vistana', '6.01.06.00.00', 'PRIMA DE ANTIGUEDAD', ' PRIMA    DE    ANTIGUEDAD ', 3),
  ('vistana', '6.01.07.00.00', 'INDEMNIZACION', 'INDEMNIZACION', 3),
  ('vistana', '6.02.00.00.00', 'HONORARIOS POR SERV. PROFESIONALES', ' HONORARIOS    POR    SERV.    PROFESIONALES ', 2),
  ('vistana', '6.02.01.00.00', 'SERVICIOS PROFESIONALES', ' SERVICIOS    PROFESIONALES ', 3),
  ('vistana', '6.02.02.00.00', 'SERVICIOS PROF. SERV. DE CONTABILIDAD', ' SERVICIOS    PROF.    SERV.    DE    CONTABILIDAD ', 3),
  ('vistana', '6.02.03.00.00', 'HONORARIOS PROF. SERV. SISTEMAS DE COMPUTO', ' HONORARIOS    PROF.    SERV.    SISTEMAS    DE    COMPUTO ', 3),
  ('vistana', '6.02.05.00.00', 'HONORARIOS SERV. PROF. LEGALES', ' HONORARIOS    SERV.    PROF.    LEGALES ', 3),
  ('vistana', '6.03.00.00.00', 'GASTOS GENERALES', ' GASTOS    GENERALES ', 2),
  ('vistana', '6.03.01.00.00', 'ALQUILER DE LOCAL', ' ALQUILER    DE    LOCAL ', 3),
  ('vistana', '6.03.02.00.00', 'ALQUILER DE AUTOMOVIL', ' ALQUILER    DE    AUTOMOVIL ', 3),
  ('vistana', '6.03.03.00.00', 'GASTO DE ELECTRICIDAD', ' GASTO    DE    ELECTRICIDAD ', 3),
  ('vistana', '6.03.04.00.00', 'GASTO DE AGUA', ' GASTO    DE    AGUA ', 3),
  ('vistana', '6.03.05.00.00', 'GASTO DE TELEFONO', ' GASTO    DE    TELEFONO ', 3),
  ('vistana', '6.03.06.00.00', 'GASTO DE INTERNET', ' GASTO    DE    INTERNET ', 3),
  ('vistana', '6.03.07.00.00', 'FLETES Y ACARREO', ' FLETES    Y    ACARREO ', 3),
  ('vistana', '6.03.08.00.00', 'PUBLICIDAD Y PROMOCIONES', ' PUBLICIDAD  Y  PROMOCIONES ', 3),
  ('vistana', '6.03.09.00.00', 'MUEBLES Y ESTANTERIA', ' MUEBLES  Y  ESTANTERIA ', 3),
  ('vistana', '6.03.10.00.00', 'PAPELERIA Y UTILES DE OFICINA', ' PAPELERIA    Y    UTILES    DE    OFICINA ', 3),
  ('vistana', '6.03.11.00.00', 'MATERIALES DE EMPAQUE', ' MATERIALES  DE  EMPAQUE ', 3),
  ('vistana', '6.03.12.00.00', 'REPARACION Y MANT. DE OFICINA', ' REPARACION    Y    MANT.    DE    OFICINA ', 3),
  ('vistana', '6.03.13.00.00', 'REPARACION Y MANT. DE VEHICULO', ' REPARACION    Y    MANT.    DE    VEHICULO ', 3),
  ('vistana', '6.03.14.00.00', 'COMBUSTIBLE Y LUBRICANTES', ' COMBUSTIBLE    Y    LUBRICANTES ', 3),
  ('vistana', '6.03.15.00.00', 'CORREOS', 'CORREOS', 3),
  ('vistana', '6.03.16.00.00', 'GASTOS LEGALES Y NOTARIALES', ' GASTOS    LEGALES        Y    NOTARIALES ', 3),
  ('vistana', '6.03.18.00.00', 'GASTO DE SEGUROS', ' GASTO    DE    SEGUROS ', 3),
  ('vistana', '6.03.19.00.00', 'DONACIONES', 'DONACIONES', 3),
  ('vistana', '6.03.20.00.00', 'GASTOS DE VIAJES', ' GASTOS    DE    VIAJES ', 3),
  ('vistana', '6.03.21.00.00', 'CAPACITACIONES', 'CAPACITACIONES', 3),
  ('vistana', '6.03.22.00.00', 'EQUIPO DE TRABAJO Y SEGURIDAD', ' EQUIPO    DE    TRABAJO    Y    SEGURIDAD ', 3),
  ('vistana', '6.03.23.00.00', 'ATENCION A COLABORADORES', ' ATENCION    A    COLABORADORES ', 3),
  ('vistana', '6.03.24.00.00', 'GASTOS DE CAFETERIA', ' GASTOS    DE    CAFETERIA ', 3),
  ('vistana', '6.03.25.00.00', 'LIMPIEZA Y ASEO', ' LIMPIEZA  Y  ASEO ', 3),
  ('vistana', '6.03.27.00.00', 'TASA UNICA', ' TASA    UNICA ', 3),
  ('vistana', '6.03.28.00.00', 'LICENCIA COMERCIAL', ' LICENCIA    COMERCIAL ', 3),
  ('vistana', '6.03.29.00.00', 'IMPUESTO MUNICIPAL', ' IMPUESTO    MUNICIPAL ', 3),
  ('vistana', '6.03.31.00.00', 'ATENCION A CLIENTES', ' ATENCION  A  CLIENTES ', 3),
  ('vistana', '6.03.32.00.00', 'MUESTRAS', 'MUESTRAS', 3),
  ('vistana', '6.03.38.00.00', 'DEPRECIACION', 'DEPRECIACION', 3),
  ('vistana', '6.03.39.00.00', 'CUENTAS MALAS', ' CUENTAS    MALAS ', 3),
  ('vistana', '6.03.40.00.00', 'SOBRANTES Y FALTANTES', ' SOBRANTES    Y    FALTANTES ', 3),
  ('vistana', '6.03.41.00.00', 'FALTANTES DE INVENTARIO', ' FALTANTES    DE    INVENTARIO ', 3),
  ('vistana', '6.03.42.00.00', 'GASTO DE PERIODOS ANTERIORES', ' GASTO    DE    PERIODOS    ANTERIORES ', 3),
  ('vistana', '6.03.97.00.00', 'MULTAS Y RECARGOS', ' MULTAS  Y  RECARGOS ', 3),
  ('vistana', '6.03.98.00.00', 'TARJETA DE CREDITO', ' TARJETA  DE  CREDITO ', 3),
  ('vistana', '6.03.99.00.00', 'GASTOS VARIOS', ' GASTOS    VARIOS ', 3),
  ('vistana', '6.04.00.00.00', 'GASTOS FINANCIEROS', ' GASTOS    FINANCIEROS ', 2),
  ('vistana', '6.04.01.00.00', 'CARGOS BANCARIOS', ' CARGOS    BANCARIOS ', 3),
  ('vistana', '6.04.02.00.00', 'INTERESES BANCARIOS', ' INTERESES    BANCARIOS ', 3),
  ('vistana', '6.05.00.00.00', 'IMPUESTO SOBRE LA RENTA', ' IMPUESTO  SOBRE  LA  RENTA ', 2),
  ('vistana', '6.05.01.00.00', 'Impuesto sobre la renta', ' Impuesto  sobre  la  renta ', 3)
ON CONFLICT (empresa_key, cuenta) DO NOTHING;

-- ── RLS: patron estandar service_role only -----------------------------------

ALTER TABLE cuentas_contables ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS service_role_all ON cuentas_contables;
CREATE POLICY service_role_all ON cuentas_contables
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Refrescar schema cache de PostgREST.
NOTIFY pgrst, 'reload schema';
