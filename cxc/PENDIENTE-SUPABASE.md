# SQL pendiente en Supabase

**Censado contra producción el 25-ago-2026** (Management API, proyecto
`rspocgqhtpveytgbtler`): las 340 migraciones de `supabase/migrations/` se
compararon objeto por objeto —tablas, columnas, índices, constraints,
funciones, vistas, políticas, triggers— contra lo que la base tiene de verdad.

## Resultado: quedan 3 migraciones sin correr

Ninguna rompe nada hoy: las tres tienen escalera en el código y la pantalla
nombra el archivo que falta. Pero **una de las tres cuesta plata cada
quincena**.

| # | Migración | Qué falta en la base | Qué pasa hoy sin ella |
|---|---|---|---|
| 1 | `20260825120000_asistencia_paga_seguros.sql` | columna `asistencia_personas.paga_seguros` | 🔴 **La planilla le descuenta seguro social (9,75 %) y educativo (1,25 %) a las 31 personas.** El cuadro de la contadora dice que solo lo pagan 8. En la quincena del 16 al 31 de julio eso fueron **~$695 de más**, y se repite cada quincena hasta que la columna exista. La pantalla no se rompe: `leerPersonas` relee sin la columna y avisa qué archivo falta. |
| 2 | `20260825140000_asistencia_permiso_horas.sql` | columnas `asistencia_justificaciones.hora_desde` y `hora_hasta` + los CHECK `asistencia_just_horas_completas` y `asistencia_just_horas_en_orden` | No se puede justificar **unas horas** (el que llega tarde con permiso): toda justificación sigue siendo de día entero. Nada se rompe ni se descuenta mal — la función simplemente no está disponible y la pantalla lo dice. |
| 3 | `20260727180000_cheques_banco_default.sql` | `cheques.banco` sigue `NOT NULL` sin `DEFAULT ''` | **Nada.** `construirFilaCheque` (`src/lib/cheques-fila.ts`) escribe `banco: ''` a propósito justamente porque la columna es `NOT NULL`. Correrla es limpieza de deuda, no un arreglo. |

Correr 1 y 2 **no mueve un centavo por sí solo**: `paga_seguros` nace en
`true` (o sea, como está hoy) y las horas nacen en `NULL` (día entero, como
están hoy). Lo que cambia es que recién ahí se puede apagar el seguro persona
por persona en la pantalla, que es donde está los ~$695.

## Cómo se corre el SQL ahora

🔑 **Lo corre Claude por la Management API.** Ya no se le pasa a Daniel para
que lo pegue en el SQL Editor.

```bash
cd ~/Code/fashion-group/cxc && set -a && source .env.local && set +a
REF=rspocgqhtpveytgbtler
curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" -H "Content-Type: application/json" \
  --data "$(jq -Rn --arg q "$(cat supabase/migrations/ARCHIVO.sql)" '{query:$q}')"
```

Respuesta `[]` = corrió sin error. Un `{"message":"Failed to run sql query: ERROR…"}` es el fallo.

⚠️ La base es **compute Micro** y se cayó 3 veces en una semana por auditorías
en paralelo. Consultas **de a una**, sin fan-out.

---

# Lo que ya está aplicado (era la lista vieja de este archivo)

Los 6 puntos que este archivo listaba como «pendientes de ejecutar» **ya están
todos en producción**, medidos el 25-ago-2026. No queda nada que correr de acá.

| # | Qué era | Estado medido |
|---|---|---|
| 1 | `caja_gastos.empresa` | ✅ la columna existe |
| 2 | `guia_transporte.monto_total` + `estado` | ✅ las dos columnas existen |
| 3 | `directorio_clientes.whatsapp` | ✅ la columna existe |
| 4 | `prestamos_movimientos_concepto_check` | ✅ el CHECK está, con los 5 conceptos incluidos «Responsabilidad por daño» y «Pago de responsabilidad» |
| 5 | Borrar el empleado de prueba «Aaaa» | ✅ 0 filas en `prestamos_empleados` |
| 7 | `comisiones` para contabilidad — `supabase/migrations/20260825120000_comisiones_contabilidad.sql` | ✅ `role_permissions.contabilidad` ya lo tiene. Es el patrón bueno: `array_append` + guarda, aditivo e idempotente |

## ⛔ Punto 6 — NO SE CORRE NUNCA

```sql
-- supabase/update-contabilidad-permisos.sql
UPDATE role_permissions SET modulos = ARRAY['prestamos','ventas'] WHERE role = 'contabilidad';
```

**Esta línea PISA la lista entera, no agrega.** Ya corrió hace meses y quedó
escrita acá como si siguiera pendiente. Hoy contabilidad tiene:

```
asistencia, prestamos, proveedores, gastos-contabilidad, comisiones
```

Correrla haría dos daños a la vez:

1. **Le borra 3 módulos** — `asistencia`, `proveedores` y `gastos-contabilidad`
   desaparecen de un saque.
2. **Le devuelve `ventas`**, que se le sacó a propósito porque le mostraba una
   ficha que la página después le rebota.

Queda acá solo como historia, para que nadie la vuelva a copiar.

🔑 **El patrón correcto para dar un módulo** es aditivo e idempotente, y no
pisa lo que ya está:

```sql
UPDATE role_permissions
   SET modulos = array_append(modulos, 'EL_MODULO'), updated_at = now()
 WHERE role = 'EL_ROL'
   AND NOT ('EL_MODULO' = ANY (COALESCE(modulos, '{}')));
NOTIFY pgrst, 'reload schema';
```

---

## Por qué el resto de las «⚠️ DDL PENDIENTE» no lo estaban

Las que se venían arrastrando como pendientes **ya están todas aplicadas**:

`20260812150000_calvin_catalogo` (las 6 tablas `calvin_*` y sus 4 políticas
existen) · `20260724120000_pedidos_publicos_confirmacion` ·
`20260709120000_cxc_email_estado_cuenta` (la tabla es `cxc_emails_enviados`) ·
`20260724130000_comision_b2b_detalle_v2_vendedor_factura` ·
`20260708160000_marketing_impulsadoras` · `20260725120000_acs_intercompania_no_retail` ·
`20260725120000_foto_manual` · `20260712120000_create_tienda_formulas`
(⚠️ **no crea `tienda_formulas`**: crea `tienda_marca_formulas` y
`tienda_rubro_formulas`, que sí están — buscar el nombre equivocado fue lo que
la hizo parecer pendiente durante semanas).

Otras 59 migraciones tienen algún objeto que no está en la base, pero eso **no
las vuelve pendientes**: la migración corrió y una posterior retiró el objeto a
propósito. Son
las funciones versionadas (`multifashion_mensual` v1→v6, `comision_b2b` v1→v5,
`ventas_proyeccion_cierre` v1→v7), las matviews `clientes_ytd_vw` y
`clientes_12m_vw`, las tablas `mk_cobranzas` / `mk_pagos` / `fg_user_modules`,
los 6 índices muertos que barrió `20260726210000_limpieza_indices_muertos_y_duplicados`,
y las políticas viejas (`open`, `allow all for anon`) que
`20260704120000_rls_hardening_service_role` reemplazó por `service_role_all`.

⛔ **`20260626120000_marca_formulas_public_read.sql` tampoco se corre.** Crea
`public_read` sobre `marca_formulas` y `carga_history`, y esas dos tablas se
leen solo desde rutas de servidor con la service-role key. Correrla no arregla
nada y abriría a lectura anónima las fórmulas de precio.

---

## Corridas DESPUÉS del censo (27-ago-2026) — el préstamo en la planilla

Estas tres **ya están aplicadas** y no son pendientes. Se anotan para que el
próximo censo no las vuelva a levantar:

| Migración | Qué dejó en la base | Verificado |
|---|---|---|
| `20260902120000_prestamos_amarre_codigo.sql` | `prestamos_empleados.empleado_codigo` + su índice parcial, y el amarre corrido | 21 de 30 fichas atadas · **las 14 con saldo, atadas** · 9 sin atar, todas en $0,00 |
| `20260902130000_planilla_prestamo_aprobado.sql` | tabla `asistencia_prestamo_aprobado` con RLS y su índice | los 3 candados frenan por CONDUCTA (quincena inválida, monto negativo y llave repetida rebotan) |
| `20260902140000_martha_mercancia_y_johana_baja.sql` | los $15 de MARTHA pasan de `prestamo` a `mercancia`; JOHANA VALLEJO queda archivada | 72 campos de `asistencia_planilla_manual` comparados, **2 distintos y los 2 son los pedidos**; el total de descuentos queda en **$385,00 antes y después** |

Las tres son **idempotentes**: se corrieron dos veces seguidas y la segunda no
cambió un solo campo.

## Pendientes NUEVAS al 3-sep-2026 — Comisiones

Dos DDL que el código ya sabe esperar (la pantalla cae sola a la versión
anterior de la RPC y lo dice en la respuesta). Van en este orden:

| Migración | Qué deja en la base | Cómo se ve mientras no corre |
|---|---|---|
| `20260911120000_comision_b2b_v6_cobro_quien_registro.sql` | `comision_b2b_v6` (el cobro a quien REGISTRÓ el recibo) + detalle v3 | Comisiones sigue con la v5 (cobro por cartera); `regla_cobro: "cartera"` |
| `20260912120000_comision_exclusion_v7.sql` | tabla `comision_exclusion` con las 17 filas de Daniel (11 clientes, Active Wear con las dos grafías de Reinaldo) + `comision_b2b_v7` + detalle v4 + Reinaldo en 1 %/1 % (ya estaba) | Comisiones sigue con la v6; `exclusiones_aplicadas: false`; en Configuración › «Clientes que no comisionan» sale «Falta correr la migración de comision_exclusion» |

Las dos son **idempotentes** (`IF NOT EXISTS`, `ON CONFLICT … DO NOTHING`, el
`UPDATE` de la tasa solo escribe si difiere) y **ninguna dropea nada**: la v5
y la v6 quedan para comparar. Medido antes de aplicar con el SQL real en
pglite: `scripts/_medir-comision-cobro-v6.mjs` y
`scripts/_medir-comision-exclusiones-v7.mjs`.
