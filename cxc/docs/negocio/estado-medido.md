# El negocio, medido

> **Medido contra producción el 5-sep-2026.**
>
> Corte de datos: **4 de septiembre de 2026** (el último día con ventas cargadas). Todo lo que dice
> «vs 2025» compara contra **los mismos días** del año pasado — del 1 de enero al 4 de septiembre —
> nunca contra el año entero.
>
> Las notas de crédito **restan** en todos los números de venta. Las retenciones **no** cuentan como
> cobro. Cada bloque trae abajo la consulta exacta que lo produjo, para que cualquiera pueda repetirlo.

---

## Los diez números que Daniel debería saber hoy

| # | El número | Cuánto | Qué significa |
|---|---|---|---|
| 1 | **Venta del grupo en 2026** | **$6.267.955,39** | +2,4% contra los mismos días de 2025. Incluye Boston y Multifashion. |
| 2 | **Utilidad de las seis empresas** | **$1.477.781,04** | Margen del **27,7%** sobre $5.337.236,50 de venta con utilidad medida. |
| 3 | **Lo que te deben** | **$3.872.444,80** | $3.676.935,55 del grupo (211 clientes) + $195.509,25 de Boston (279 clientes). |
| 4 | **De esa deuda, lo viejo** | **$2.275.041,62 = 59%** | Tiene **más de 90 días**. Es la mitad larga de tu cartera. |
| 5 | **El que más debe y no paga** | **$380.732,79** | La Frontera Duty Free. El **100%** tiene más de 91 días, y encima te compró $233.056 menos que el año pasado. |
| 6 | **Lo que cobraste en 2026** | **$7.416.867,03** | Cobraste **$1,15 millones más de lo que vendiste**: estás bajando cartera vieja. Buena noticia. |
| 7 | **Joystep** | **$30.624,96** | −76,5% contra 2025. Una sola llegada de mercancía en todo el año, en enero. |
| 8 | **Inventario en bodega** | **$2.956.530,82** | 207.943 piezas en 4.924 artículos, valuadas al costo. |
| 9 | **Comisiones por pagar 2026** | **$81.931,70** | El 89% es de una sola persona: Reynaldo Espinosa, $72.701,81. |
| 10 | **Planilla** | **$10.672,33 por quincena** | 36 personas activas. Boston solo es 20 de ellas ($5.885,40). |

---

## Ventas

### Por empresa: 2026 contra los mismos días de 2025

| Empresa | 2026 | 2025 (mismos días) | Cambio |
|---|---:|---:|---:|
| Fashion Wear | 2.094.651,05 | 2.196.112,88 | **−4,6%** |
| Vistana | 1.243.834,19 | 1.167.004,57 | +6,6% |
| Fashion Shoes | 1.227.303,71 | 1.142.764,86 | +7,4% |
| Confecciones Boston | 472.856,97 | 468.893,59 | +0,8% |
| Active Shoes | 463.436,25 | 479.786,64 | −3,4% |
| Multifashion | 394.154,96 | 343.053,08 | **+14,9%** |
| Active Wear | 341.093,30 | 191.458,33 | **+78,2%** |
| Joystep | 30.624,96 | 130.559,87 | **−76,5%** |
| **Total del grupo** | **6.267.955,39** | **6.119.633,82** | **+2,4%** |

Las seis empresas de Fashion Group solas suman **$5.400.943,46** (+1,8%). Boston y Multifashion
aportan los otros $867.011,93.

**Ningún comprobante quedó sin clasificar** (0 tipos desconocidos): no hay venta perdida en silencio.

<details><summary>Consulta</summary>

```sql
with v as (
  select empresa_key,
    (fecha at time zone 'America/Panama')::date as d,
    case when tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito') then subtotal_descuento
         when tipo_comprobante='Nota de Crédito' then -subtotal_descuento else 0 end as neto,
    case when tipo_comprobante not in ('Factura','Tiquete','Transacción','Nota de Débito','Nota de Crédito')
         then 1 else 0 end as desconocido
  from switch_facturas
  where fecha >= ('2025-01-01'::timestamp at time zone 'America/Panama')
    and fecha <  ('2026-09-05'::timestamp at time zone 'America/Panama')
)
select empresa_key,
  round(sum(neto) filter (where d between '2026-01-01' and '2026-09-04'),2) as v2026,
  round(sum(neto) filter (where d between '2025-01-01' and '2025-09-04'),2) as v2025,
  round(100*(sum(neto) filter (where d between '2026-01-01' and '2026-09-04')
    / nullif(sum(neto) filter (where d between '2025-01-01' and '2025-09-04'),0) - 1),1) as pct,
  sum(desconocido) as tipos_desconocidos
from v group by empresa_key order by 2 desc;
```
</details>

### Mes a mes en 2026

| Mes | Vistana | F. Wear | F. Shoes | A. Wear | A. Shoes | Joystep | Boston | Multifashion | **Total** |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Enero | 87.654 | 326 | 121.760 | — | 3.001 | — | 33.783 | 33.272 | **279.797,54** |
| Febrero | 152.562 | 360.661 | 75.077 | 12.820 | 11.797 | 1.484 | 62.027 | 38.382 | **714.809,50** |
| Marzo | 155.201 | 211.780 | 237.140 | 1.910 | 17.812 | 13.297 | 90.169 | 38.326 | **765.633,69** |
| Abril | 113.419 | 248.104 | 84.521 | 1.450 | 135.259 | 60 | 36.714 | 72.182 | **691.708,25** |
| Mayo | 381.378 | 665.708 | 262.312 | 252.023 | 7.890 | 7.377 | 62.891 | 42.446 | **1.682.026,28** |
| Junio | 82.409 | 162.589 | 91.066 | 59.681 | 161.307 | 48 | 55.388 | 65.853 | **678.340,27** |
| Julio | 132.925 | 203.295 | 119.448 | 6.255 | 42.429 | 4.310 | 71.909 | 42.998 | **623.569,42** |
| Agosto | 131.648 | 235.113 | 228.573 | 6.954 | 83.815 | 4.027 | 45.153 | 53.194 | **788.475,49** |
| Sep (1-4) | 6.639 | 7.076 | 7.406 | — | 126 | 23 | 14.823 | 7.503 | **43.594,95** |

**Mayo fue el mes grande del año**: $1,68 millones, 2,7 veces un mes normal. Enero fue el más flojo
($279.797), y en enero Fashion Wear prácticamente no facturó ($326).

<details><summary>Consulta</summary>

```sql
with v as (
  select empresa_key, to_char((fecha at time zone 'America/Panama')::date,'YYYY-MM') as mes,
    case when tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito') then subtotal_descuento
         when tipo_comprobante='Nota de Crédito' then -subtotal_descuento else 0 end as neto
  from switch_facturas
  where fecha >= ('2026-01-01'::timestamp at time zone 'America/Panama')
    and fecha <  ('2026-09-05'::timestamp at time zone 'America/Panama')
)
select mes,
 round(sum(neto) filter (where empresa_key='vistana'),0) vistana,
 round(sum(neto) filter (where empresa_key='fashion_wear'),0) f_wear,
 round(sum(neto) filter (where empresa_key='fashion_shoes'),0) f_shoes,
 round(sum(neto) filter (where empresa_key='active_wear'),0) a_wear,
 round(sum(neto) filter (where empresa_key='active_shoes'),0) a_shoes,
 round(sum(neto) filter (where empresa_key='joystep'),0) joystep,
 round(sum(neto) filter (where empresa_key='confecciones_boston'),0) boston,
 round(sum(neto) filter (where empresa_key='american_classic'),0) multifashion,
 round(sum(neto),2) total
from v group by mes order by mes;
```
</details>

---

## Utilidad y margen

El dato de utilidad **solo existe para las seis empresas del grupo, y solo desde enero de 2026**
(la primera factura medida es del 3 de enero). Boston y Multifashion no tienen este dato: para
ellas hay venta pero no margen.

| Empresa | Venta con utilidad medida | Costo | Utilidad | Margen | Desde |
|---|---:|---:|---:|---:|---|
| Fashion Wear | 2.073.410,93 | 1.423.791,31 | 649.619,63 | **31,3%** | 5-ene |
| Vistana | 1.235.250,22 | 891.769,31 | 343.480,95 | 27,8% | 3-ene |
| Fashion Shoes | 1.200.962,26 | 892.234,40 | 308.727,87 | 25,7% | 5-ene |
| Active Shoes | 461.065,05 | 365.919,10 | 95.145,95 | **20,6%** | 5-ene |
| Active Wear | 337.379,30 | 263.555,36 | 73.823,94 | 21,9% | 12-feb |
| Joystep | 29.168,74 | 22.186,04 | 6.982,70 | 23,9% | 27-feb |
| **Las seis** | **5.337.236,50** | **3.859.455,52** | **1.477.781,04** | **27,7%** | |

Este dato cubre el **98,8%** de la venta de las seis, así que el margen es confiable.
**Fashion Wear es la que mejor margen deja (31,3%) y Active Shoes la que peor (20,6%)** — casi 11
puntos de diferencia entre una y otra.

> ⚠️ Al medir esto hay una trampa: las notas de crédito ya vienen guardadas en negativo en la fuente
> de utilidad. Volver a restarlas infla la venta un 18%. Aquí se sumó tal cual viene.

<details><summary>Consulta</summary>

```sql
select empresa_key, min(fecha) desde, max(fecha) hasta, count(*) filas,
 round(sum(subtotal_con_descuento),2) venta,
 round(sum(costo),2) costo,
 round(sum(utilidad),2) utilidad,
 round(100*sum(utilidad)/nullif(sum(subtotal_con_descuento),0),1) margen_pct
from switch_factura_utilidad
where fecha between '2026-01-01' and '2026-09-04'
group by empresa_key order by 7 desc;
```
</details>

---

## La cartera: lo que te deben

### El grupo, por antigüedad

| Empresa | 0-30 d | 31-60 d | 61-90 d | 91-120 d | 121-180 d | +180 d | **Total** | Clientes |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Fashion Wear | 233.214,82 | 179.704,43 | 79.680,02 | 357.737,90 | 85.623,61 | 263.910,93 | **1.199.871,71** | 49 |
| Fashion Shoes | 192.068,69 | 88.195,24 | 80.026,30 | 137.762,80 | 81.259,25 | 271.717,32 | **851.029,60** | 42 |
| Vistana | 136.184,59 | 136.150,07 | 55.601,64 | 129.665,43 | 67.761,35 | 312.182,78 | **837.545,86** | 64 |
| Active Shoes | 71.126,65 | 58.399,60 | 154.673,60 | −314,48 | 69.414,11 | 60.075,53 | **413.375,01** | 31 |
| Active Wear | 6.208,98 | 3.376,50 | 55.789,33 | 236.241,05 | 0,00 | 8.760,64 | **310.376,50** | 17 |
| Joystep | 4.130,50 | 4.259,90 | 0,00 | 7.362,00 | 5.784,00 | 43.200,47 | **64.736,87** | 8 |
| **Total** | **642.934,23** | **470.085,74** | **425.770,89** | **868.454,70** | **309.842,32** | **959.847,67** | **3.676.935,55** | **211** |

**El 58% de la cartera del grupo ($2.138.144,69) pasó los 90 días.** Solo el 17,5% está al día
(0-30 días).

### Boston, aparte

| Tramo | Monto |
|---|---:|
| 0-90 días | 58.612,32 |
| 91-120 días | 11.956,68 |
| **121 días o más** | **124.940,25** |
| **Total** | **195.509,25** |

279 clientes con saldo, de 390 en la lista. **El 64% de la cartera de Boston pasó los 120 días** —
proporcionalmente está peor que la del grupo.

### Los 15 que más deben (grupo, sin Boston)

| # | Cliente | Código | Debe | Con +91 días | % viejo |
|---|---|---|---:|---:|---:|
| 1 | City Mall Paso Canoa | D-25 | 472.675,56 | 59.185,67 | 13% |
| 2 | **La Frontera Duty Free** | D-87 | **380.732,79** | 380.732,79 | **100%** |
| 3 | City Mall David | D-24 | 260.904,99 | 115.553,63 | 44% |
| 4 | Outlet Duty Free N2 | D-117 | 217.238,41 | 101.536,41 | 47% |
| 5 | Jerusalem De Panama | D-80 | 198.292,96 | 1.086,04 | 1% |
| 6 | **City Moda Chorrera** | D-26 | **180.099,00** | 177.829,28 | **99%** |
| 7 | **Internacional Belen** | D-76 | **143.713,36** | 143.713,36 | **100%** |
| 8 | Jerusalem Duty Free | D-81 | 130.740,80 | 121.670,80 | 93% |
| 9 | Outlet Duty Free N3 | D-118 | 123.215,50 | 0,00 | 0% |
| 10 | **Grup M.E.L. International** | D-66 | **120.909,87** | 120.909,87 | **100%** |
| 11 | Plaza Los Angeles | D-126 | 120.698,90 | 70.022,62 | 58% |
| 12 | **Bouti, S.A.** | D-14 | **110.374,28** | 110.498,40 | **100%** |
| 13 | Multi Fashion Holding | D-108 | 105.572,46 | 23.487,51 | 22% |
| 14 | Golden Mall | D-168 | 57.852,91 | 22.543,12 | 39% |
| 15 | Grupo Hanna, S.A. | D-68 | 57.818,11 | 45.208,16 | 78% |

**Cinco clientes tienen el 100% (o casi) de su deuda vencida a más de 91 días**: La Frontera,
Internacional Belen, Grup M.E.L., Bouti y City Moda Chorrera. Entre los cinco: **$935.829,30**.

<details><summary>Consultas</summary>

```sql
-- Cartera del grupo por tramo
select company_key,
 round(sum(d0_30),2) d0_30, round(sum(d31_60),2) d31_60, round(sum(d61_90),2) d61_90,
 round(sum(d91_120),2) d91_120, round(sum(d121_180),2) d121_180,
 round(sum(d181_270+d271_365+mas_365),2) mas_180, round(sum(total),2) total, count(*) clientes
from switch_estadocuenta_aging group by company_key order by 8 desc;

-- Boston, aparte
select count(*) clientes, round(sum(d0_90),2) d0_90, round(sum(d91_120),2) d91_120,
 round(sum(d121_plus),2) d121_plus, round(sum(total),2) total,
 count(*) filter (where total>0) con_saldo
from switch_estadocuenta_aging_boston;

-- Los 15 que más deben
select nombre, codigo, count(*) empresas, string_agg(distinct company_key,', ') donde,
 round(sum(total),2) debe,
 round(sum(d91_120+d121_180+d181_270+d271_365+mas_365),2) vencido_91mas,
 round(100*sum(d91_120+d121_180+d181_270+d271_365+mas_365)/nullif(sum(total),0),0) pct_viejo
from switch_estadocuenta_aging group by nombre, codigo order by debe desc limit 15;
```
</details>

---

## Cobros

Sin contar retenciones. **Total cobrado en 2026: $7.416.867,03** — un 18% más de lo que vendiste
en el mismo período.

| Mes | Las seis del grupo | Boston | Multifashion | **Total** |
|---|---:|---:|---:|---:|
| Enero | 584.610,46 | 65.341,04 | 69.816,69 | **719.768,19** |
| Febrero | 873.571,30 | 75.916,41 | 41.286,00 | **990.773,71** |
| Marzo | 1.245.303,57 | 36.887,31 | 40.977,34 | **1.323.168,22** |
| Abril | 620.380,45 | 61.362,52 | 50.380,45 | **732.123,42** |
| Mayo | 519.216,05 | 52.504,76 | 46.050,66 | **617.771,47** |
| Junio | 998.888,82 | 54.463,20 | 71.248,28 | **1.124.600,30** |
| Julio | 1.075.722,72 | 56.911,96 | 48.214,54 | **1.180.849,22** |
| Agosto | 577.012,66 | 74.339,82 | 56.647,25 | **707.999,73** |
| Sep (1-4) | 6.442,16 | 5.420,26 | 7.950,35 | **19.812,77** |

### Por empresa

| Empresa | Cobrado | Retenciones (aparte) | Recibos |
|---|---:|---:|---:|
| Fashion Wear | 2.635.077,26 | 47.008,91 | 341 |
| Vistana | 1.684.543,10 | 22.486,44 | 319 |
| Fashion Shoes | 1.524.164,39 | 16.168,87 | 311 |
| Confecciones Boston | 483.147,28 | 2.142,76 | 1.558 |
| Multifashion | 432.571,56 | 12,73 | 7.491 |
| Active Shoes | 411.739,34 | 9.548,91 | 82 |
| Active Wear | 187.866,63 | 2.784,40 | 89 |
| Joystep | 57.757,47 | 601,04 | 81 |

Las retenciones suman **$100.754,06** en el año — plata que el cliente descontó y no entró a caja.

Marzo, junio y julio fueron los meses fuertes de cobro (más de un millón cada uno). Mayo fue el mes
de mayor venta pero el **más flojo de cobro** ($617.771): lo que se vendió en mayo se cobró después.

<details><summary>Consultas</summary>

```sql
-- Por mes
select to_char(fecha,'YYYY-MM') mes,
 round(sum(total) filter (where empresa_key not in ('confecciones_boston','american_classic')),2) seis_grupo,
 round(sum(total) filter (where empresa_key='confecciones_boston'),2) boston,
 round(sum(total) filter (where empresa_key='american_classic'),2) multifashion,
 round(sum(total),2) total
from switch_recibos
where fecha between '2026-01-01' and '2026-09-04' and coalesce(es_retencion,false)=false
group by 1 order by 1;

-- Por empresa, con retenciones aparte
select empresa_key,
 round(sum(total) filter (where coalesce(es_retencion,false)=false),2) cobrado,
 round(sum(total) filter (where es_retencion),2) retenciones,
 count(*) filter (where coalesce(es_retencion,false)=false) recibos
from switch_recibos where fecha between '2026-01-01' and '2026-09-04'
group by 1 order by 2 desc;
```
</details>

---

## Compras: lo que llegó de mercancía

**Llegó mercancía por $4.313.053,05 al costo (CIF) en 2026**, en 420 llegadas y 355.959 piezas.

| Empresa | Llegadas | Piezas | Costo CIF | FOB calculado | Última llegada |
|---|---:|---:|---:|---:|---|
| Fashion Wear | 184 | 132.566 | 1.924.007,76 | 1.749.097,96 | 4-sep |
| Vistana | 167 | 88.480 | 1.298.332,46 | 1.180.302,23 | 4-sep |
| Active Shoes | 20 | 23.270 | 505.694,80 | 459.722,55 | 1-sep |
| Active Wear | 10 | 14.543 | 256.022,30 | 232.747,54 | 20-ago |
| Fashion Shoes | 38 | 86.013 | 227.637,04 | 206.942,76 | 4-sep |
| **Joystep** | **1** | 11.087 | 101.358,69 | 92.144,26 | **27-ene** |

### Por mes

| Mes | Piezas | Costo CIF |
|---|---:|---:|
| Enero | 31.777 | 266.266,21 |
| Febrero | 39.429 | 521.391,78 |
| Marzo | 48.823 | 529.650,46 |
| Abril | 38.614 | 587.491,64 |
| Mayo | 56.071 | 550.383,92 |
| Junio | 51.811 | 552.979,72 |
| Julio | 31.223 | 594.856,49 |
| Agosto | 44.139 | 433.469,07 |
| Sep (1-4) | 14.072 | 276.563,75 |

> ⚠️ El costo por unidad viene guardado por pieza, no por renglón. Hay que multiplicarlo por la
> cantidad o el total sale 1.000 veces más chico. El FOB de la columna no es confiable (llega igual
> al CIF en casi todas las líneas): el FOB de arriba está **calculado** como CIF ÷ 1,10.

<details><summary>Consulta</summary>

```sql
select empresa_key, count(distinct n_interno) llegadas,
 round(sum(cantidad),0) piezas,
 round(sum(cantidad*costo_cif),2) cif_total,
 round(sum(cantidad*costo_cif)/1.10,2) fob_calculado,
 max(fecha) ultima
from switch_ingresos_mercancia where fecha between '2026-01-01' and '2026-09-04'
group by 1 order by 4 desc;
```
</details>

---

## Gastos

**Los gastos de las empresas no se suman entre sí** — cada una se mira por separado.

| Empresa | Gasto 2026 | Renglones | Cargado hasta |
|---|---:|---:|---|
| Fashion Shoes | 362.193,60 | 123 | **julio** |
| Vistana | 243.342,48 | 378 | **julio** |
| Fashion Wear | 151.962,66 | 135 | **mayo** ⚠️ |
| Active Wear | 54.387,22 | 26 | **julio** |
| Active Shoes | 16.048,75 | 47 | **julio** |
| Joystep | — | 0 | (no tiene gastos cargados, y es normal) |

Boston y Multifashion no tienen gastos cargados en este módulo.

### Mes a mes

| Mes | Vistana | F. Wear | F. Shoes | A. Shoes | A. Wear |
|---|---:|---:|---:|---:|---:|
| Enero | 41.420 | 62.688 | 44.754 | 4.510 | 552 |
| Febrero | 17.472 | 85.149 | 92.383 | 2.804 | 50.765 |
| Marzo | 67.795 | **3.841** | 83.304 | 480 | 219 |
| Abril | 39.886 | **27** | 16.015 | 1.611 | 284 |
| Mayo | 24.855 | **257** | 52.944 | 963 | 124 |
| Junio | 32.153 | **—** | 39.724 | 3.125 | 1.683 |
| Julio | 19.763 | **—** | 33.069 | 2.555 | 760 |

**Fashion Wear está a medio cargar.** Venía en $62.688 y $85.149 en enero-febrero, y de marzo en
adelante cae a $3.841, $27, $257 y después nada. Eso no es que dejó de gastar: es que el reporte no
se cargó. Ver «Lo que llama la atención».

<details><summary>Consulta</summary>

```sql
select empresa_key, count(*) renglones, round(sum(total),2) gasto_2026,
 to_char(min(mes),'YYYY-MM') desde, to_char(max(mes),'YYYY-MM') cargado_hasta
from egresos_varios where mes >= '2026-01-01' group by 1 order by 3 desc;
```
</details>

---

## Inventario

**4.924 artículos con existencia, 207.943 piezas, $2.956.530,82 al costo.**

| Empresa | Artículos con existencia | Del catálogo | Piezas | Valor al costo | Valor a etiqueta |
|---|---:|---:|---:|---:|---:|
| Fashion Wear | 2.628 | 5.111 | 92.527 | 1.420.117,95 | 2.155.057,20 |
| Fashion Shoes | 463 | 712 | 47.957 | 675.918,42 | 953.150,50 |
| Vistana | 1.540 | 8.273 | 50.427 | 635.460,91 | 904.306,00 |
| Active Shoes | 187 | 1.763 | 8.266 | 145.516,82 | 195.953,80 |
| Joystep | 85 | 207 | 8.699 | 78.157,52 | 93.266,00 |
| Active Wear | 21 | 592 | 67 | 1.359,21 | 1.556,00 |
| **Total** | **4.924** | **16.658** | **207.943** | **2.956.530,82** | **4.303.289,50** |

Casi todo el inventario tiene costo cargado: solo **7 artículos con existencia** no lo tienen.

El inventario vale **$2,96 millones al costo y $4,30 millones a precio de etiqueta** — un
sobreprecio de 45,6% si se vendiera todo a etiqueta.

<details><summary>Consulta</summary>

```sql
select empresa_key,
 count(*) filter (where existencia>0) articulos_con_existencia,
 count(*) catalogo_total,
 round(sum(existencia) filter (where existencia>0),0) piezas,
 round(sum(existencia*costo_api) filter (where existencia>0 and costo_api>0),2) valor_costo_cif,
 count(*) filter (where existencia>0 and coalesce(costo_api,0)=0) sin_costo,
 round(sum(existencia*precio_etiqueta) filter (where existencia>0),2) valor_etiqueta
from switch_articulo_info group by 1 order by 5 desc nulls last;
```
</details>

---

## Clientes

En el directorio del grupo hay **150 clientes vivos**, de los cuales **148 siguen apareciendo en
Switch** y 2 ya no (quedan guardados, pero dejaron de ofrecerse al escoger).

Mirando quién realmente compró (las seis empresas, sin el mostrador):

| | Cantidad |
|---|---:|
| Compraron en 2026 | **89** |
| Compraron en el mismo período de 2025 | 86 |
| **Dejaron de comprar** (compraron en 2025, nada en 2026) | **14** |
| **Nuevos en 2026** (no compraron en 2025) | **19** |

Ganaste 19 clientes y perdiste 14: saldo neto **+5**.

### Los que más crecieron

| Cliente | Código | 2025 | 2026 | Creció |
|---|---|---:|---:|---:|
| Outlet Duty Free N2 | D-117 | 23.892,00 | 278.416,27 | **+254.524,27** |
| City Mall Paso Canoa | D-25 | 1.058.099,58 | 1.256.848,89 | +198.749,31 |
| Outlet Duty Free N3 | D-118 | 46.513,50 | 238.799,00 | **+192.285,50** |
| Jerusalem De Panama | D-80 | 483.775,09 | 560.826,94 | +77.051,85 |
| Multi Fashion Holding | D-108 | 175.147,02 | 248.396,10 | +73.249,08 |
| Distribuidora Karen Viva Panama | D-45 | 0,00 | 53.156,00 | +53.156,00 |
| City Moda Chorrera | D-26 | 44.664,74 | 89.004,00 | +44.339,26 |
| Active Shoes, S.A. | 12188 | 0,00 | 40.940,28 | +40.940,28 |

**Los dos Outlet Duty Free (N2 y N3) juntos crecieron $446.809,77** — son la explicación principal
de que el año esté arriba.

### Los que más cayeron

| Cliente | Código | 2025 | 2026 | Cayó |
|---|---|---:|---:|---:|
| La Frontera Duty Free | D-87 | 621.888,50 | 388.832,00 | **−233.056,50** |
| Plaza Los Angeles | D-126 | 452.435,79 | 241.300,05 | **−211.135,74** |
| Golden Mall | D-168 | 318.079,14 | 148.214,09 | **−169.865,05** |
| Ismora, S.A. (City Moda) | D-78 | 57.228,00 | **0,00** | −57.228,00 |
| Viva Panama Dutty Free | D-139 | 111.041,50 | 74.731,50 | −36.310,00 |
| Boutique I - Fashion | D-74 | 34.759,00 | 3.324,00 | −31.435,00 |
| Grupo Tova | D-69 | 24.508,40 | **0,00** | −24.508,40 |
| Sporting Shoes N 4 | D-142 | 189.398,50 | 164.900,35 | −24.498,15 |

**Los tres grandes que cayeron (La Frontera, Plaza Los Angeles y Golden Mall) perdieron
$614.057,29 entre los tres.** Sin esa caída el año cerraría muy distinto.

<details><summary>Consulta</summary>

```sql
with base as (
 select sc.codigo, (f.fecha at time zone 'America/Panama')::date d, sc.nombre nom,
  case when f.tipo_comprobante='Nota de Crédito' then -f.subtotal_descuento else f.subtotal_descuento end neto
 from switch_facturas f
 join switch_clientes sc on sc.empresa_key=f.empresa_key and sc.cliente_switch_id=f.cliente_switch_id
 where f.empresa_key not in ('confecciones_boston','american_classic')
  and f.tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito','Nota de Crédito')
  and f.fecha >= ('2025-01-01'::timestamp at time zone 'America/Panama')
  and f.fecha <  ('2026-09-05'::timestamp at time zone 'America/Panama')
  and sc.codigo <> 'TCKCTA'
), agg as (
 select codigo, min(nom) nombre,
  round(coalesce(sum(neto) filter (where d between '2026-01-01' and '2026-09-04'),0),2) c26,
  round(coalesce(sum(neto) filter (where d between '2025-01-01' and '2025-09-04'),0),2) c25
 from base group by codigo
)
select codigo, nombre, c25, c26, round(c26-c25,2) delta from agg order by delta desc;
```

> El cruce cliente↔factura va siempre **por código**, nunca por nombre: unir por nombre multiplica
> las facturas de los homónimos y duplica el total.
</details>

---

## Multifashion

| | |
|---|---|
| Venta de septiembre (1 al 4) | **$7.502,90** |
| Mismos días de 2025 | $3.786,44 |
| Venta del año (a 4-sep) | $394.154,96 (**+14,9%**) |
| Meta vigente | **«Viaje playa»** — $420.000 del 1-sep al 31-dic |
| Ritmo que tocaba a esta altura | $4.585,96 |
| **Cómo va** | **+63,6% ARRIBA del ritmo** ▲ |

El cálculo del ritmo: la venta del mismo rango un año antes fue $346.777,05, así que para llegar a
$420.000 hay que crecer un factor de **1,2112**. Aplicado a lo que se vendió del 1 al 4 de
septiembre del año pasado ($3.786,44), tocaba llevar **$4.585,96**. Van $7.502,90.

**Multifashion es la empresa que mejor viene del grupo**, y arrancó la meta de fin de año muy
por delante del ritmo. Ojo: son solo 4 días, es muy temprano para cantar victoria.

<details><summary>Consulta</summary>

```sql
with n as (
 select (fecha at time zone 'America/Panama')::date d,
  case when tipo_comprobante='Nota de Crédito' then -subtotal_descuento else subtotal_descuento end neto
 from switch_facturas
 where empresa_key='american_classic'
  and tipo_comprobante in ('Factura','Tiquete','Transacción','Nota de Débito','Nota de Crédito')
), corte as (select max(d) c from n where d <= (now() at time zone 'America/Panama')::date)
select (select c from corte) corte,
 round((select sum(neto) from n where d between '2026-09-01' and (select c from corte)),2) vendido_sep,
 round((select sum(neto) from n where d between '2025-09-01' and (select c from corte) - interval '1 year'),2) mismo_periodo_2025,
 round((select sum(neto) from n where d between '2025-09-01' and '2025-12-31'),2) rango_completo_2025;

select * from multifashion_metas where not coalesce(deleted,false) and activa;
```
</details>

---

## Comisiones 2026

De enero a septiembre, en las seis empresas del grupo.

| Vendedor | Por venta | Por cobro | **Total** | |
|---|---:|---:|---:|---|
| Reynaldo Espinosa | 29.564,39 | 43.137,42 | **72.701,81** | |
| Edwin | 4.703,03 | 4.292,37 | **8.995,40** | |
| Rodrigo | 234,49 | 0,00 | **234,49** | |
| Oficina (DEFAULT) | 2.323,45 | 2.877,45 | 5.200,90 | *no se paga* |
| Daniel Levy | 555,92 | 2.333,15 | 2.889,07 | *no se paga* |
| **Total a pagar** | | | **$81.931,70** | |

**Reynaldo se lleva el 89% de las comisiones del grupo.** Y algo notable: **cobra más comisión por
cobrar ($43.137) que por vender ($29.564)** — es el único con esa relación invertida.

Rey Stoute Aguas y «Colaborador» están retirados y no aparecen. Es el monto **bruto**: los descuentos
fijos se restan aparte al liquidar.

<details><summary>Consulta</summary>

```sql
-- Se llama la función oficial por empresa y mes, y se suma por vendedor
-- (excluyendo REY STOUTE AGUAS, AGUAS y COLABORADOR, que están retirados)
with e as (select unnest(array['vistana','fashion_wear','fashion_shoes',
                              'active_wear','active_shoes','joystep']) k),
     m as (select generate_series(1,9) mm)
select e.k empresa, m.mm mes, comision_b2b_v8(e.k, 2026, m.mm) j from e, m;
```
</details>

---

## Planilla

| Empresa | Personas activas | Sueldo mensual | **Costo por quincena** |
|---|---:|---:|---:|
| Confecciones Boston | 20 | 11.770,80 | **5.885,40** |
| Vistana | 9 | 5.866,52 | **2.933,26** |
| Fashion Wear | 7 | 3.707,34 | **1.853,67** |
| **Total** | **36** | **21.344,66** | **10.672,33** |

Solo tres empresas tienen gente en planilla. **Boston es el 56% de las personas y el 55% del costo**,
aunque aporta el 7,5% de la venta del grupo.

Una persona es servicio profesional y una no marca reloj (las dos en Vistana). El costo por quincena
es el sueldo base ÷ 2: no incluye horas extra, descuentos de préstamo ni seguros.

<details><summary>Consulta</summary>

```sql
select coalesce(empresa,'(sin empresa)') empresa,
 count(*) filter (where fecha_salida is null) activos,
 count(*) filter (where fecha_salida is null and servicio_profesional) servicio_prof,
 count(*) filter (where fecha_salida is null and no_marca_reloj) no_marca,
 round(sum(salario_mensual) filter (where fecha_salida is null),2) sueldo_mensual,
 round(sum(salario_mensual) filter (where fecha_salida is null)/2,2) costo_quincenal
from asistencia_personas group by 1 order by 5 desc;
```
</details>

---

## Lo que llama la atención

Solo lo que el número respalda.

### 1. Joystep prácticamente se apagó

Vendió **$30.624,96 contra $130.559,87** el año pasado: **−76,5%**, la caída más fuerte del grupo.
Y no es un problema de demanda solamente: **recibió una sola llegada de mercancía en todo el año, el
27 de enero**. Desde entonces no le ha entrado nada. Tiene $78.157,52 de inventario parado (8.699
piezas), le deben $64.736,87 —de los cuales $43.200 tienen más de 180 días— y cobró $57.757,47, casi
el doble de lo que vendió. Sigue facturando (última venta: 3 de septiembre), pero a un ritmo mínimo.
**Es la empresa que hay que decidir qué hacer con ella.**

### 2. La Frontera Duty Free: debe $380.732,79 y el 100% está vencido

Es el segundo que más debe del grupo, **y no tiene un solo dólar dentro de los 90 días**: los
$380.732,79 completos pasaron los 91 días. Al mismo tiempo **te compró $233.056,50 menos que el año
pasado** (de $621.888 bajó a $388.832): es la mayor caída de venta de todos tus clientes. Un cliente
que compra menos y no paga lo viejo es el patrón que precede a una pérdida.

Y no está solo: **Internacional Belen ($143.713,36), Grup M.E.L. ($120.909,87), Bouti ($110.374,28)
y City Moda Chorrera ($180.099,00) también tienen el 100% —o el 99%— de su deuda vencida a más de
91 días.** Entre los cinco: **$935.829,30 que no se ha movido en tres meses o más.**

### 3. Los gastos de Fashion Wear están a medio cargar desde marzo

Fashion Wear registró $62.688 en enero y $85.149 en febrero. Después: **$3.841 en marzo, $27 en
abril, $257 en mayo, y nada en junio ni julio.** Las otras empresas están cargadas hasta julio.

Una empresa que factura $2,09 millones al año no gasta $27 en un mes. El reporte de gastos de Fashion
Wear dejó de cargarse completo, así que **cualquier número de rentabilidad de Fashion Wear que reste
gastos está mal desde marzo** — y es justo la empresa que más vende y mejor margen bruto tiene
(31,3%). Es lo más urgente de corregir de esta lista, porque es un dato que se ve bien y está mal.

### Otras cosas que vale la pena mirar

- **La cartera de Boston está peor que la del grupo en proporción**: el 64% pasó los 120 días
  ($124.940 de $195.509), contra el 58% de más de 90 días del grupo.
- **Active Wear creció +78,2%** (de $191.458 a $341.093), pero le quedan **67 piezas en bodega**
  ($1.359,21) contra 592 artículos en catálogo. O vende todo lo que le llega, o le falta reponer.
  Además, $236.241 de sus $310.376 de cartera están parados en el tramo de 91-120 días: cobró
  $187.866 contra $341.093 vendidos.
- **Millenium Sports (D-104) tiene saldo negativo** en Active Shoes: **−$314,48**. Pagó de más o le
  quedó una nota de crédito sin aplicar.
- **Mayo vendió $1,68 millones pero fue el mes de peor cobro del año** ($617.771). El cobro de esa
  venta llegó en junio y julio. Es normal, pero explica por qué la cartera vieja pesa tanto.
- **La venta del grupo está arriba solo por dos clientes**: los Outlet Duty Free N2 y N3 aportaron
  **+$446.809,77**, más del triple del crecimiento total del grupo ($148.321,57). Sin ellos el año
  estaría en rojo.
- **Todo lo que sincroniza está al día.** Lo único con más de 26 horas sin correr son dos procesos
  que ya fueron retirados a propósito (el de Multifashion en julio y el del mayor contable en
  agosto). No hay ningún dato congelado sin querer.
