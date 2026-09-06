# Asistencia y Planilla — el mapa

> Medido contra producción el **5-sep-2026** (Panamá, sábado). Solo lectura.
> Ningún número sale de la documentación: los que no cuadran con `CLAUDE.md` van con 🩸.
> Daniel, textual: *«Pero asistencia no se hizo con el enfoque que estamos teniendo con los otros módulos ya terminados»*.

## Lo primero, en cuatro líneas

| | |
|---|---|
| 🩸 **Quincenas cerradas en toda la historia** | **0** de 5 posibles. `asistencia_planilla_guardada` = 0 filas |
| 🩸 **Por qué no se puede cerrar** | Las **15** combinaciones empresa × período están frenadas por horas extra sin aprobar |
| 🩸 **Recargo de domingo que se descarta sin decir nada** | **$363,92** · 12 días-persona · imposible de aprobar hoy |
| 🩸 **Lo que el papel promete y la planilla no paga** | El Reporte, su Excel y su PDF dicen «las horas extra se pagan completas»; sin aprobación se pagan **$0** |

---

## Qué es, quién entra, cuánto se usa

### Qué es

Un reloj de huella en Boston (`reloj cboston`, único dispositivo) manda las marcaciones a `/api/asistencia/ingest`. Con eso el módulo hace **dos cosas**: el **Reporte** (tardanzas, ausencias, horas) y la **Planilla** (el cuadro quincenal que se firma y se paga).

**6 pestañas** + botón «?»: Reporte · Planilla · Justificaciones · Vacaciones · Aprobaciones · Configuración.
**15 rutas API**, **35 archivos** de lógica (12.557 líneas), **12 pantallas** (6.786 líneas).

### Quién entra — medido en `role_permissions` y `fg_users`

| Cuenta | Rol | Qué ve | ¿Entra de verdad? |
|---|---|---|---|
| daniel · alberto | admin | Las 6 pestañas | daniel sí (aprobó 298 días el 31-ago) |
| Contabilidad | contabilidad | Las 6 pestañas | **Sí — es quien lo usa.** 22 de 23 justificaciones, 8 de 8 correcciones, 13 de 13 préstamos, 26 de 26 montos a mano |
| Bodega (Julio Garay) | bodega | **Solo Aprobaciones** | Sí, una vez: 101 días el 30-ago |
| david | gerente_boston | Solo Aprobaciones, solo Boston | **No.** 0 filas suyas en todo el módulo |
| andrea · Angela | secretaria | — | **No.** El rol tiene `asistencia`, pero sus dos `modulos_override` no la traen |

🩸 **`asistencia` figura en `role_permissions.secretaria` y ninguna secretaria la tiene.** El módulo en la práctica lo usan **2 cuentas** (Contabilidad y daniel) + 1 que aprueba (Bodega).

⚠️ **Julio Garay no tiene usuario propio**: aprueba con la cuenta compartida `Bodega`. Está documentado en `src/lib/asistencia/roles.ts` y es decisión pendiente de Daniel.

### Cuánto se usa — todo medido

| Cosa | Cantidad | Desde → hasta | Quién |
|---|---:|---|---|
| Marcaciones del reloj | **6.081** | 1-jul → 4-sep-2026 | 40 códigos, 1 reloj |
| Días-persona medidos | **1.573** | 48 días hábiles | — |
| Correcciones de marcación | **8** (6 vivas) | 26 → 28-ago | Contabilidad |
| Justificaciones | **23** | 1-ago → 28-ago | Contabilidad 22 · Daniel 1 |
| Vacaciones cargadas | **2** | ambas de ELOYN MENDOZA | Contabilidad · Daniel |
| Aprobaciones de horas extra | **521** | días del 1-jul al 26-ago | daniel 298 · Contabilidad 122 · Bodega 101 |
| Aprobaciones de préstamo | **13** | todas el 27-ago, 19:18→19:27 | Contabilidad |
| Montos escritos a mano | **26** filas · 2 quincenas | 27 → 28-ago | Contabilidad |
| **Quincenas CERRADAS** | **0** | — | — |
| Descargas de Excel / PDF | **no medido** | — | 🩸 ver abajo |

🩸 **Asistencia no escribe ni una fila en `activity_logs`** (0 de 2.821; hay **21** `entity_type` distintos —guías 770, préstamos 168, reclamos 93, caja 39…— y ninguno es asistencia). No hay forma de saber cuántas veces se bajó el Excel de la planilla ni el PDF que se firma.

🩸 **El módulo se enfrió el 31-ago.** Última escritura por tabla:

| | Última vez |
|---|---|
| Reglas del cálculo | 2-sep |
| Fichas de personas | 2-sep |
| **Aprobar horas extra** | **31-ago** |
| Justificaciones · Correcciones · Montos a mano | 28-ago |
| Préstamos aprobados · Horarios | 27-ago |
| Vacaciones | 26-ago |
| **Cerrar quincena** | **nunca** |

---

## Los datos, medidos

### Las 16 tablas

| Tabla | Filas | Lo que hay que saber |
|---|---:|---|
| `asistencia_marcaciones` | **6.081** | Append-only. Ningún hueco: 6 lecturas, todas con `leerTodoPaginado` + `count` |
| `asistencia_horas_extra_aprobadas` | **521** | 389 aprobadas · 132 rechazadas |
| `asistencia_personas` | **40** | 37 activas · 3 dadas de baja |
| `asistencia_horarios` | **40** | Solo **2 horarios distintos** en toda la empresa |
| `asistencia_planilla_manual` | **26** | 2 quincenas (ago 1-15 y 16-31) |
| `asistencia_justificaciones` | **23** | 5 motivos |
| `asistencia_feriados` | **22** | 11 de 2026 + 11 de 2027. **2028 vacío** |
| `asistencia_prestamo_aprobado` | **13** | Solo la quincena 2026-08-2 |
| `asistencia_correcciones` | **8** | 6 vivas, 2 deshechas |
| `asistencia_aprobador_empresa` | **6** | david (Boston) · Bodega (2) · Contabilidad (3) |
| `asistencia_vacaciones` | **2** | Las dos de la misma persona |
| `asistencia_reparto_empresa` | **2** | Solo JULIO GARAY: $800 Vistana + $200 Fashion Wear |
| `asistencia_dispositivos` | **1** | `reloj cboston`, agente 1.1.0 |
| `asistencia_reglas` | **1** | Singleton, sin `empresa_key` |
| **`asistencia_planilla_guardada`** | **0** | 🩸 |
| **`..._guardada_linea`** | **0** | 🩸 |

Las **16** tablas del módulo están en el respaldo, una por una (`src/lib/backup/tablas.ts`).

### Las personas

| | |
|---|---:|
| Fichas | 40 (37 activas) |
| Por empresa | Boston 22 (21 activas) · Vistana 10 (9) · Fashion Wear 8 (7) |
| Con salario cargado | **36 de 37 activas**. La única sin salario es YULISSA JUAREZ, y es correcto: servicio profesional |
| Servicio profesional | 2 (YULISSA JUAREZ, DANIEL LEVY) |
| No marca reloj | 1 (EDWIN GOMEZ) |
| Sin `fecha_ingreso` | 3 |
| **Con saldo de vacaciones** | **2 de 40 — y las dos dicen 0,0 días** |
| Con base de seguros propia | **1 de 40** |
| Pagan seguros | 10 de 40 |
| Jornada | 40 h: 24 personas · 48 h: 13 |
| Horarios | 8:00→16:30: 27 personas · 8:00→17:00: 13. **Almuerzo 30 min en las 40** |

### Marcan y no tienen ficha — códigos **39** y **55**

| | 39 | 55 |
|---|---:|---:|
| Marcaciones | 4 | 7 |
| Desde → hasta | 1-sep → 2-sep | 1-sep → 2-sep |
| Nombre que manda el reloj | **vacío** | **vacío** |

Llevan **4 días** marcando sin ficha y **el reloj no manda el nombre**: no hay forma de saber quiénes son desde el sistema. Marcaron 2 días y pararon.
⚠️ Nada avisó: el aviso «N códigos marcaron y no tienen ficha» vive **dentro de la pestaña Planilla**, y la Planilla no se generó desde el 28-ago.

**Con ficha y sin marcar (30 días):** JENNIFER ARMAS (50) y EDWIN GOMEZ (V-EG, marcado `no_marca_reloj`, correcto).

### Cómo está marcando la gente

| Marcas en el día | Días-persona | % |
|---|---:|---:|
| 1 (entró y no salió) | 8 | 0,5% |
| 2 (sin almuerzo) | 92 | 5,8% |
| 3 (falta una) | 118 | 7,5% |
| **4 (completo)** | **1.251** | **79,5%** |
| 5+ (de más) | 104 | 6,6% |

🩸 **322 días-persona mal marcados (20,5%), 126 con número impar. Y hay 6 correcciones vivas: el 98% nunca se arregló.**

Y **está empeorando**:

| Período | Días-persona | Mal marcados | % |
|---|---:|---:|---:|
| jul 1-15 | 344 | 71 | 20,6% |
| jul 16-31 | 388 | 90 | 23,2% |
| ago 1-15 | 320 | 48 | 15,0% |
| ago 16-31 | 388 | 70 | 18,0% |
| **sep 1-15 (4 días)** | 133 | **43** | **32,3%** |

### 🩸 El reloj entra al día siguiente, y el viernes 4-sep quedó a medias

Medido en 12 días seguidos: la última marca del día cae entre **17:07 y 18:28**, y llega al sistema a las **8:13–8:53 a.m. del día siguiente**. La PC de la oficina se apaga a las 5 p.m. y la gente sale después.

El viernes **4-sep** el reloj se leyó hasta las **16:53:49** y la PC no volvió a prender: **104 marcas contra las 130-140 normales, 20 de 32 personas mal marcadas, 18 con número impar**. Esas salidas están en el aparato y todavía no entraron.

⚠️ Hoy, sábado 5-sep a las 10:00 a.m. de Panamá, el vigía avisó «el reloj lleva +6 h sin reportar» (`alertado_en` = 2026-09-05 15:00:49 UTC). Es cierto y no hay nada que hacer: es fin de semana. Con la PC apagada el viernes a las 5 y el vigía corriendo **todos los días** a las 10 a.m., ese aviso suena **todos los sábados**.

---

## 🩸 Lo que miente o está roto

### 1. El domingo y el feriado se descartan en silencio — **$363,92** medidos

`src/lib/asistencia/planilla.ts:780-798` · `src/lib/asistencia/aprobaciones.ts:169-170` · `src/app/api/asistencia/planilla/route.ts:461`

```ts
const pagaExtra = !aprob?.exigir || aprob.claves.has(`${aprob.codigo}|${d.fecha}`);
if (pagaExtra) { … h.domingoMin += c.domingoMin; h.feriadoMin += c.feriadoMin; }
else { h.extraNoAprobadaMin += c.extraDiurnoMin + c.extraNocturnoMin; }  // domingo y feriado NO se apartan
```

Desde el 3-sep `exigirAprobacionExtra = true` **siempre**. El domingo y el feriado ahora piden aprobación… y la pestaña Aprobaciones **no los ofrece**, porque solo lista días con hora extra:

```ts
const minutos = c.extraDiurnoMin + c.extraNocturnoMin;   // un domingo da 0 aquí
if (minutos <= 0) continue;
```

Resultado: se pierden, **sin aviso ámbar, sin freno del cierre y sin línea en el PDF**. Y no hay forma de aprobarlos.

**Medido en producción — 12 días-persona de domingo trabajado, ninguno con fila de aprobación:**

| Domingo | Personas | Horas | Recargo 1,50 |
|---|---:|---:|---:|
| 26-jul-2026 | 5 | 15,54 | $83,81 |
| 23-ago-2026 | 7 | 58,02 | $280,11 |
| **Total** | **12 días-persona** | **73,56** | **$363,92** |

Feriados trabajados en toda la historia: **0**. Es el domingo el que duele.

### 2. El Reporte promete lo que la Planilla no paga

`src/app/asistencia/ReporteTab.tsx:288` · `src/lib/asistencia/exportar.ts:259`

> «…10 min y **se pagan completas**: el atraso del día se descuenta aparte, no se les resta.»

Está en la **pantalla**, en el **Excel** y en el **PDF que se firma**. Y la palabra «aprobar» no aparece **ni una vez** en ninguno de los tres archivos (`grep -ci aprob` → 0 y 0).

Mientras tanto: **396 días-persona con hora extra medida nunca fueron mirados** — el 44% de los 898 que existen — y esos minutos se pagan **$0**.

| | Días-persona | Horas |
|---|---:|---:|
| Con hora extra medida | 898 | 663,2 |
| Aprobados | 376 (42%) | — |
| Rechazados a mano | 126 (14%) | — |
| **Nunca mirados** | **396 (44%)** | **197,4** |

### 3. 🩸 No se puede cerrar NINGUNA quincena, en NINGUNA empresa

El servidor rechaza el cierre con 409 si queda alguien sin aprobar (`planilla-guardada.ts:488-503`). Medido, personas sin aprobar por empresa y período:

| Período | Boston | Vistana | Fashion Wear | ¿Se puede cerrar? |
|---|---:|---:|---:|:--:|
| jul 1-15 | 11 | 6 | 5 | no |
| jul 16-31 | 13 | 4 | 5 | no |
| ago 1-15 | 16 | 6 | 6 | no |
| ago 16-31 | 19 | 7 | 7 | no |
| **sep 1-15 (en curso)** | **11** | **6** | **7** | no |

**15 de 15 bloqueadas.** Los «24 clientes con horas extra sin aprobar» del encargo son exactos: **24 personas en la quincena en curso** (57 días-persona, 1.408 minutos, ~$100 de pago). Y la más grande es **ago 16-31: 33 personas, 220 días-persona, ~$747**.

⚠️ **El botón «Cerrar quincena» está encendido y el freno vive solo en el servidor** (`PlanillaTab.tsx:465` no mira los frenos). Se toca el botón, se confirma en el modal, y recién ahí llega el 409. En el resto del sistema el botón se apaga y dice qué falta.

### 4. Escribir un monto a mano pisa los otros cuatro

`src/app/asistencia/PlanillaTab.tsx:511-516` · `src/lib/asistencia/planilla-server.ts:80-91`

```js
quincena: data.periodo.claveManuales,
codigo,
...linea.manuales,     // ← foto de cuando se generó el cuadro
[campo]: limpio,
```

`guardarManuales` hace `upsert` de las **cinco** columnas, y la pantalla **no recarga** después de guardar (decisión del 4-sep). Caso real: se aprueba el préstamo de alguien (el servidor escribe $120 en la casilla) y después se le teclea el ISR → **el préstamo vuelve a $0**. La ruta de préstamos documenta esta misma trampa (`prestamos/route.ts:100-103`) y la Planilla no la esquiva.

**Además, borrar un monto recién escrito no borra nada** (`PlanillaTab.tsx:492`): se escribe 50, se vacía el campo, `limpio` = 0 y la foto también dice 0 → retorno temprano, no se manda nada. La casilla queda vacía y la base sigue con los 50.

Alcance: 26 filas, **$898,86** en montos a mano entre las dos quincenas de agosto.

### 5. Cuando el servidor dice que NO guardó, la pantalla dice «Listo»

`src/app/asistencia/PlanillaTab.tsx:558-572` — el `if (j.ok === false)` no corta el flujo: salen el toast de error **y** el de éxito, y el cuadro se marca desactualizado por un cambio que no ocurrió.

### 6. La ficha muestra los seguros en dólares con los seguros apagados

`src/app/asistencia/ConfiguracionTab.tsx:1156-1170` — no mira `pagaSeguros`. La misma tarjeta dice en `:1097` «Las dos columnas de seguros salen en $0,00 en su planilla» y dos renglones abajo «Seguro social $17.06 y educativo $2.19 por quincena».

### 7. Un error del servidor se ve como «no hay nada cargado»

`VacacionesTab.tsx:73-80` (sin `res.ok`, sin `try/catch`), `JustificacionesTab.tsx:57`, `FeriadosTab.tsx:30`. Un 500 cae en `?? []` y pinta el vacío. En Justificaciones además deja el desplegable de Motivo **sin opciones**. La ruta del servidor se cuidó de no hacer exactamente esto (`vacaciones/route.ts:44`).

### 8. Tres borrados sin confirmar, sin deshacer y sin firma — y los tres mueven plata

| Pantalla | Botón | Qué hace |
|---|---|---|
| `JustificacionesTab.tsx:250` | «Quitar» | `DELETE` real. El día vuelve a ser ausencia: **8 h × rata** |
| `FeriadosTab.tsx:119` | «Quitar» | `DELETE` real. 22 renglones seguidos, un «Quitar» cada 44 px |
| `VacacionesTab.tsx:270` | «Quitar` | Soft delete, pero sin confirmación |

**Cero usos de `ConfirmDeleteModal`, `UndoToast` o `useUndoAction` en todo el módulo.** Recordatorios usa los dos para lo mismo. Y dentro del propio módulo la incoherencia es evidente: la corrección de una marcación se **anula con firma**, la vacación tiene **soft delete**, la justificación y el feriado se **borran de verdad**.

### 9. El testigo de las horas aprobadas está roto en las dos direcciones

`aprobaciones-server.ts:115` guarda `Math.round(minutos)`; `aprobaciones.ts:337` compara contra el fraccionario. Con los minutos medidos al segundo, `cambio` se prende **en el mismo instante de aprobar**, y el aviso ámbar imprime *«se aprobaron 1,63 h y hoy son 1,63 h»*.
Y al revés: tocar la casilla del día o de la semana manda **toda** la gente del día (`AprobacionesTab.tsx:288`), y el upsert pisa `minutos_vistos`, `marcado_por` y `marcado_en` — borra el aviso real y al aprobador original. «Aprobar todo» sí filtra `!g.aprobado`; las otras dos no.

### 10. Julio rechazó 100 de 101

Medido en `asistencia_horas_extra_aprobadas`:

| Quién | Días tocados | Aprobó | Rechazó | Cuándo | Días de |
|---|---:|---:|---:|---|---|
| Contabilidad | 122 | 90 | 32 | 27-28 ago | 11→26 ago |
| **Bodega (Julio)** | **101** | **1** | **100** | 30-ago | 17→21 ago |
| daniel | 298 | 298 | 0 | 31-ago | todo julio |

No sé si es deliberado o si el botón se entendió al revés — **no medible desde los datos**. Pero los dos extremos (100% no · 100% sí) en la misma tabla merecen que alguien pregunte.

### 11. Otros defectos verificados en el código

| # | Qué | Dónde |
|---|---|---|
| a | `asistencia_horas_extra_aprobadas` se lee **sin paginar y sin `count`** — es la única lectura de plata así. Techo del rango: 366 días × 40 personas = 14.640 filas; el corte silencioso a 1.000 se lee como «nadie aprobó» | `aprobaciones-server.ts:60-66` |
| b | El Excel que se manda por correo dice que los seguros son «% del total bruto» **siempre**; para quien tiene base propia el monto es correcto y la explicación es falsa | `planilla-exportar.ts:350` |
| c | «Extra 1.25» y «Extra 1.50» están **escritos a mano** en el encabezado y el recargo es editable en Reglas. La hoja «Cómo se calcula» del mismo Excel sí lo pinta dinámico | `PlanillaTab.tsx:1258`, `planilla-exportar.ts:153` |
| d | «N personas» significa dos cosas en la misma pantalla: el banner del cierre dice 19 con un neto que sale de 12 | `planilla-guardada.ts:293` vs `PlanillaTab.tsx:1326` |
| e | El Reporte cuenta tardanza en un feriado que la Planilla no cobra | `reporte.ts:708` |
| f | Con 3 marcas, **la del medio no se pinta en ninguna columna** — «Sale almz.» y «Vuelve» muestran «—», y sin celda no hay botón para corregirla. Son **118 días-persona** (7,5%) | `ReporteTab.tsx:491-494` |
| g | Al abrir una corrección se recortan los segundos (`.slice(0,5)`): guardar sin tocar nada convierte `08:47:32` en `08:47:00` | `CorregirMarcacionModal.tsx:70` |
| h | Los totales del pie del Reporte salen **sin formatear**: imprime `43.28333333333333`. El PDF del mismo cuadro sí formatea | `ReporteTab.tsx:264` |
| i | Un monto negativo se guarda como 0 sin decirlo; la casilla sigue mostrando `-120` | `PlanillaTab.tsx:491` |
| j | `.limit(500)` pelado, sin `count` y sin aviso, en justificaciones. La ruta hermana de Vacaciones sí pide `count: "exact"` | `justificaciones/route.ts:38` |
| k | `/api/asistencia/reporte` **no tiene tope de rango**; la planilla sí (366 días) | `reporte/route.ts:51` |
| l | El POST de montos manuales no valida alcance por empresa ni que la persona exista; el GET de la misma ruta sí | `planilla/route.ts:789` |
| m | Quien no esté sembrado en `asistencia_aprobador_empresa` ve la planilla **vacía y en $0, sin un solo aviso**. `secretaria` no tiene ni una fila. Hoy no muerde porque ninguna secretaria tiene el módulo | `planilla/route.ts:493` |
| n | Dos errores tragados en el ingest del reloj: el upsert de respaldo no lee su error y contesta `ok: true`; un fallo de lectura se lee como «no hay fila» y `fallos_seguidos` vuelve a 0 → la alerta de reloj caído no dispara | `ingest/route.ts:62-78` |
| o | Si falla la consulta del cierre, una quincena cerrada **se ve como abierta** (`catch {}` deja `cierre` en `null`) | `PlanillaTab.tsx:406` |
| p | La ficha dice «Días de vacaciones que le quedan HOY» y muestra el saldo **al corte**. Configuración puede decir 12 donde Vacaciones dice 2 | `ConfiguracionTab.tsx:1255` |
| q | «Aprobado por X» muestra solo al **primer** aprobador, como si fuera el de todos | `AprobacionesTab.tsx:514` |
| r | «Cómo funciona» cae en silencio a los valores por defecto y los presenta como los configurados | `ComoFuncionaTab.tsx:63` |

**Falsos positivos descartados** (verificados, están bien): las 19 columnas de la Planilla cuadran una a una entre encabezado, celda y pie; `asistencia_marcaciones` no se corta en ningún lado (las 6 lecturas usan `leerTodoPaginado` + `count` + doble `.order()`); el invariante append-only se respeta; las 15 rutas llaman `requireAsistencia`; la rata por hora se muestra con la de centavos, no con la de 4 decimales; ningún `$0.00` grande es dato faltante.

---

## Cuánto cuesta hacer las cosas

Las cinco tareas que **los datos demuestran** que se hacen, no las que el código permite.

### 1. Cerrar la quincena de las 3 empresas — **hoy 25 toques, 0 veces logrado**

*Prueba de que es la tarea: 26 montos a mano en 2 quincenas, 13 préstamos aprobados. Y 0 cierres.*

| Paso | Toques |
|---|---:|
| Entrar (aterriza en Reporte) → Aprobaciones | 2 |
| Fijar el rango en el calendario | 2 |
| «Aprobar todo» | 1 |
| Ir a Planilla | 1 |
| **Fijar el rango otra vez** (no viaja entre pestañas) | 2 |
| Elegir empresa · «Generar» | 3 |
| «Aprobar N» préstamos | 1 |
| «Cerrar quincena» + confirmar | 2 |
| **× 2 empresas más** (empresa · Generar · préstamos · cerrar · confirmar) | 12 |
| **Total** | **25** |

- **3 pantallas** (Aprobaciones, Planilla, modal).
- **El mismo período se teclea 3 veces**: `RangoFechas` recuerda el rango en Reporte (`asistencia_reporte`) y en Aprobaciones (`asistencia_aprobaciones`), y **la Planilla no lo recuerda** (`PlanillaTab.tsx:778`, sin `recordarComo`).
- **El mismo período se «Genera» 3 veces**, una por empresa: cambiar de empresa invalida el cuadro y obliga a volver a generar.
- **De memoria**: en qué fecha terminó la quincena anterior de esa empresa (la pantalla lo dice, pero solo después de elegir la empresa) y **si quedó alguien sin aprobar** — eso solo se ve al chocar con el 409.
- Los 13 préstamos del 27-ago se aprobaron **uno por uno, en 9 minutos** (19:18:58 → 19:27:39). El botón «Aprobar N» solo aparece con más de un pendiente.

**La versión corta: una sola pantalla «Cerrar la quincena» — se elige el período UNA vez, y salen las 3 empresas con lo que le falta a cada una y su botón. → 25 toques a 8.**
⚠️ El período se sigue eligiendo a mano: **los presets de quincena están cerrados** (*«el corte es variable»*).

### 2. Aprobar las horas extra — **hoy 5 toques, y aun así 396 días sin mirar**

*Prueba: 521 filas en 4 sesiones (27, 28, 30 y 31 de agosto) y nada después.*

| Paso | Toques |
|---|---:|
| Entrar → Aprobaciones | 2 |
| Fijar el rango | 2 |
| «Aprobar todo» | 1 |
| **Total** | **5** |

🔑 **Acá el problema no es el costo: es que nada te dice que hay que hacerlo.**
- 0 avisos por Telegram sobre aprobaciones pendientes (el único cron del módulo, `asistencia-vigia`, solo mira si el reloj está caído).
- 0 contadores en el inicio: `useBadges` está sin uso desde el 29-abr-2026 y no incluiría asistencia igual.
- El aviso ámbar existe, pero **vive dentro de la pestaña Planilla**, y la pestaña que abre es **Reporte**.
- La Planilla no se genera desde el 28-ago → nadie vio el aviso en 8 días.

**La versión corta: una línea semanal por Telegram con el número y el enlace directo. → 5 toques a 2.**

### 3. Arreglar los días mal marcados — **hoy ~40 toques solo para encontrarlos**

*Prueba: 322 días mal marcados, 6 correcciones vivas. El 98% nunca se arregló.*

| Paso | Toques |
|---|---:|
| Entrar (ya aterriza en Reporte) | 1 |
| Fijar el rango | 2 |
| **Encontrar los días malos: no hay filtro.** Abrir a las 32-37 personas una por una y leer sus días | **~37** |
| Por cada arreglo: tocar la hora · escribir · motivo · Guardar | 4 |

- En septiembre hay **43 días a revisar repartidos entre 32 personas**: para encontrarlos hay que abrir 32 filas y leer **133 renglones**.
- La pantalla ya calcula el chip «Revisar» por día, pero **no hay forma de filtrar por él**.
- Y en 118 de esos días (los de 3 marcas) **la marca que falta no se puede ni tocar**: no se pinta en ninguna columna.

**La versión corta: un chip «43 días a revisar» arriba que filtre la tabla. → ~40 toques de búsqueda a 1.**

### 4. Cargar una justificación de grupo — **hoy 99 toques para 11 personas**

*Prueba: de las 23 justificaciones, **13 son del mismo día** (17-ago, motivo «Catástrofe», 11 personas distintas).*

| Paso | Toques |
|---|---:|
| Entrar → Justificaciones | 2 |
| Persona (desplegable de 40) | 2 |
| Motivo (desplegable) | 2 |
| Fechas | 2 |
| Nota | 1 |
| «Agregar» | 1 |
| **Por persona** | **9** |
| **× 11 personas** | **99** |

El motivo y la fecha se teclean **11 veces idénticos**. El campo Persona es un `<select>` de 40 nombres, sin buscador.

**La versión corta: elegir varias personas de una vez para el mismo motivo y las mismas fechas. → 99 toques a 16.**

### 5. Dar de alta a quien empezó a marcar — **hoy no arranca solo**

*Prueba: los códigos 39 y 55 llevan 4 días marcando sin ficha, y siguen sin ella.*

- **Nada avisa.** El aviso vive dentro de la Planilla, que no se genera desde el 28-ago.
- La ficha tiene **11 campos** (nombre, salario, jornada, empresa, ingreso, salida, motivo de salida, servicio profesional, paga seguros, base de seguros, no marca reloj, saldo de vacaciones) **+ 2 del horario**.
- De esos 13, el sistema ya sabe **1**: el código. **El reloj no manda el nombre** (medido: `empleado_nombre` = `null` en las 11 marcaciones de los dos códigos nuevos), así que el resto es tecleo obligado.
- **Pero 4 de los 13 son casi siempre lo mismo y podrían venir puestos**: jornada (24 de 37 en 40 h), horario de entrada (8:00 en las 40), almuerzo (30 en las 40) y horario de salida (2 valores en toda la empresa).

**La versión corta: un aviso en la barra («2 códigos marcan y no tienen ficha») + la ficha nueva abierta con los 4 valores por defecto puestos. → de «nadie se entera» a 1 toque + 7 campos.**

---

## Coherencia con el sistema

### Lo que Asistencia hace distinto

| Cosa | El resto del sistema | Asistencia |
|---|---|---|
| **Confirmar un borrado** | `ConfirmDeleteModal` (1 s de espera) + `UndoToast` 5 s | **Cero usos.** 3 botones «Quitar» que borran al primer toque; 2 son `DELETE` real |
| **Modales** | `ModalOverlay` (respeta el sidebar, cierre por fondo bien hecho) | **2 modales dibujados a mano** con `createPortal` propio. Arrastrar texto desde el `textarea` de motivo y soltar afuera **cierra el modal y pierde lo escrito** |
| **Cerrar con Escape** | `Modal`, `ConfirmDeleteModal` | **Ningún modal de Asistencia cierra con Escape** (`grep Escape` → 0) |
| **Excel** | `workbookBytes` → fila 1, filtro desde A1, encabezado fijo | 🩸 **El Excel del Reporte se salta el helper** (`exportar.ts` usa `aoa_to_sheet` + `XLSX.writeFile`): sale **sin encabezado fijo** y **sin filtro**. El `!freeze` que pone en la línea 168 es un no-op documentado. Es invisible para el candado de «los Excel empiezan en la fila 1». Los otros dos exports sí están bien |
| **Tablas anchas** | `ScrollableTable` con indicadores | 5 tablas con `overflow-x-auto` a mano |
| **Vacíos** | `EmptyState` | 5 `<p>` sueltos (los textos sí están bien escritos) |
| **Esqueleto de carga / pantalla de error** | `loading.tsx` + `error.tsx` (Clientes, Recordatorios, CXC) | **No tiene ninguno de los dos.** «Cargando…» en texto plano en las 8 pantallas |
| **Estado en la URL** | CXC lleva 4 filtros, Clientes 2 | Solo `tab` y `persona`. Se pierden al refrescar: el rango del Reporte, el rango y la empresa de la Planilla, y el filtro de Configuración |
| **Nombre de empresa** | corto (`EMPRESA_KEY_TO_NOMBRE_CORTO`) | largo: «Vistana International», «Confecciones Boston». Pendiente conocido, se aplica módulo por módulo |
| **Archivos < 800 líneas** | límite de la casa | `PlanillaTab.tsx` **2.035** · `ConfiguracionTab.tsx` **1.810** · `planilla.ts` **2.190** |

### Lo que ya está bien

- ✅ **Voseo: cero en pantalla.** `nada-de-voseo.test.ts` pasa (11 casos). El rótulo vivo dice **«Tú decides»**. ⚠️ Queda **un resto en un comentario**: `PlanillaTab.tsx:1293` arranca `{/* 🔴 DECIDILO VOS: …` usando el nombre retirado como si fuera el actual, a 140 líneas del bloque que explica el renombre. El candado no lo ve (borra los comentarios a propósito), pero es el comentario que hace que el próximo lo reescriba mal.
- ✅ Plata negativa con menos tipográfico y centavos (`PlanillaTab.tsx:1887`), y el PDF usa guion ASCII a propósito (la fuente de jsPDF no tiene el `−`). Documentado en `planilla.ts:2182`.
- ✅ Botón principal en el estilo de la casa, sin una sola excepción (9 lugares).
- ✅ La palabra «Email» no aparece.
- ✅ Los textos de vacío y de error siguen el patrón y ninguno escribe `$0.00`.
- ✅ La pestaña va en la URL con `replace` y una pestaña que el rol no ve cae en la primera que sí.

---

## El iPhone (390 px)

⚠️ **Asistencia no está en ninguna de las auditorías de iPhone del repo** (`iphone-tocables-y-letra.test.ts`, `iphone-targets-operacion.test.ts` cubren marketing, reclamos, clientes, caja, recordatorios y 5 más — asistencia no aparece en ninguna).

### Lo que se rompe

| # | Qué pasa a 390 px | Dónde |
|---|---|---|
| 1 | 🩸 **El Reporte no tiene vista de celular.** 11 columnas con `w-full` (no `w-max`): el navegador aplasta cada columna y los encabezados quedan en 2-3 líneas de 10,5 px. **Y la columna Persona no está congelada** — es la única tabla ancha del módulo sin `sticky left-0`: al arrastrar para ver «Extras» se pierde de quién son los números | `ReporteTab.tsx:234, 331` |
| 2 | 🩸 **Dos barras de scroll horizontal encajadas**: el detalle del día es una tabla de 9 columnas dentro de un `overflow-x-auto`, dentro de la celda de la tabla de 11 que ya tiene el suyo | `ReporteTab.tsx:376-387` |
| 3 | **Justificaciones (6 columnas) y Horarios (4)**: mismo patrón, `w-full` sin tarjeta de celular. La columna «Días» lleva `whitespace-nowrap` con «12 ago 2026 — 15 ago 2026» | `JustificacionesTab.tsx:224`, `HorariosTab.tsx:118` |
| 4 | **Los dos modales ignoran el `safe-area` de abajo**: los botones «Mejor no» y **«Cerrar quincena»** quedan pegados al borde, sobre la barra de gestos del iPhone. `grep safe-area-inset` en todo el módulo → **0**. Recordatorios lo resuelve en 4 archivos | `PlanillaTab.tsx:1593`, `CorregirMarcacionModal.tsx:236` |
| 5 | **17 textos por debajo de 12 px**, 12 de ellos visibles en el celular: los encabezados del Reporte (10,5 px), del detalle diario (10 px) y de Justificaciones y Horarios (10,5 px); el chip «Revisar» (11 px); «ver detalle» y las 5 etiquetas de montos de la tarjeta de la Planilla (11 px) | ver tabla abajo |
| 6 | **La barra de 6 pestañas arrastra pero no lo dice.** A 390 px el ancho útil es ~358 px y las seis etiquetas ocupan cerca del doble. Sin degradado, sin sangrado al borde, sin snap: **«Configuración» queda fuera de vista sin ninguna pista de que existe** | `AsistenciaClient.tsx:182` |

Textos < 12 px que sí se ven en el iPhone: `ReporteTab.tsx:237, 387, 518` · `JustificacionesTab.tsx:226` · `HorariosTab.tsx:120` · `ConfiguracionTab.tsx:914, 929, 1583, 1717` · `PlanillaTab.tsx:1771, 1914, 1959`.

### Lo que ya está bien

- ✅ **La Planilla resolvió el caso difícil.** La tabla de 19 columnas va en `hidden md:block`, con `w-max min-w-full` y **primera columna congelada**; a 390 px se muestra **una tarjeta por persona**. Cero desborde. Configuración y Aprobaciones también tienen su versión de celular.
- ✅ **54 blancos táctiles a 44 px** repartidos por los 12 archivos, incluidos los «Quitar» de listas largas y la casilla de Aprobaciones (19 px, envuelta en un `<label>` de 44).
- ✅ Inputs con `text-base sm:text-sm` → **no dispara el zoom de Safari**.
- ✅ Los 3 grids tienen variante de celular; ningún `w-[NNNpx]` duro; solo 7 `whitespace-nowrap`.
- ✅ Los modales llevan `max-h-[92vh]`, cuerpo con scroll propio, `useBodyScrollLock` y sin `autoFocus`.

---

## Lo que sobra · lo que falta

### Sobra (con la medición que lo prueba)

| Qué | La medición |
|---|---|
| **9 de los 10 bloques de aviso de migración de la Planilla** | La ruta los devuelve como **constantes `null`** desde el 3-sep (`planilla/route.ts:582-754`). Nunca se pintan. El único vivo es `faltaMigracionManual` |
| **4 de las 19 columnas del cuadro están siempre en $0,00** | `Excedente`: el motor escribe `excedenteMin: 0` **siempre** desde que la contadora lo cerró (`planilla.ts:736`). `Feriados`: **0 feriados trabajados** en toda la historia. `Terceros` y `Otros servicios`: **0 de 26 filas** |
| **2 casillas de «Reglas del cálculo»** | `excedente_horas_dia` (3,00) y `recargo_excedente_nocturna_mixta` (2,625) alimentan una columna que ya no puede ser distinta de cero |
| **El aviso «N personas trabajaron un sábado»** | **0 sábados trabajados** en 48 días hábiles medidos |
| **El aviso del vigía de los sábados** | La PC se apaga el viernes a las 5; el vigía corre todos los días a las 10 a.m. con umbral de 6 h → suena cada sábado |
| **La pestaña Vacaciones, como está hoy** | **2 filas**, las dos de la misma persona; **2 saldos cargados de 40, los dos en 0,0 días**. Detrás hay `saldo-vacaciones.ts` (667 líneas) y `VacacionesTab.tsx` (373). ⚠️ **No propongo apagarla** — Daniel ya la apagó y la volvió a encender el 1-sep (*«vacaciones quedamos que sí, dejalo, solo que haslo bien»*) |
| **`resumenPrestamos`** | Cero llamadores, y usa un criterio distinto al vivo (`prestamos-planilla.ts:433`) |
| **`rataPorHora` (4 decimales) y `valorMinuto`** | Sin lectores y siguen exportadas — es justo el número que `rata.ts` existe para no mostrar (`config.ts:601,614`) |
| **`CHIP_SIN_SEGUROS`** | **Cero usos en todo `src/`**, aunque su comentario dice que se usa en tres sitios (`seguros.ts:74`) |

### Falta

| Qué | Por qué, con el número |
|---|---|
| **Que algo avise fuera del módulo** | 396 días-persona sin aprobar y 0 quincenas cerradas, con el aviso escondido en una pestaña que no se abre desde el 28-ago |
| **Un filtro «días a revisar»** | 322 días mal marcados, 6 corregidos. El chip ya se calcula; no se puede filtrar por él |
| **Poder aprobar (o pagar) el domingo** | $363,92 que hoy desaparecen sin dejar rastro en ninguna pantalla, papel ni total |
| **Que el botón «Cerrar quincena» se apague y diga qué falta** | 15 de 15 combinaciones dan 409 después de confirmar |
| **Un aviso cuando un código nuevo empieza a marcar** | 39 y 55 llevan 4 días sin ficha |
| **Justificar a varias personas de una vez** | 11 personas × 9 toques con el mismo motivo y la misma fecha |
| **Que el módulo registre en `activity_logs`** | 0 filas de 2.821: no se sabe cuántas veces se bajó el Excel ni el PDF que se firma |
| **Que el rango viaje entre pestañas** | El mismo período se teclea 3 veces por cierre |

---

## Preguntas para Daniel

### 1. El domingo trabajado — hoy se pierde entero

Medido: **12 días-persona, $363,92** de recargo. Hoy pide aprobación y **la pestaña de aprobar no lo ofrece**, así que no se paga, no se avisa y no frena el cierre.

- **a)** El domingo se aprueba como la hora extra: sale en la pestaña Aprobaciones junto con lo demás.
- **b)** El domingo se paga siempre, sin aprobación (venir un domingo ya es una decisión de alguien).
- **c)** El domingo no se paga como recargo y se dice así en pantalla.

**Recomiendo (a).** Es la regla de la contadora aplicada igual a todo el recargo, y no cambia nada de lo que ya funciona: el mismo botón, la misma pantalla. **(b)** también es defendible —nadie viene un domingo sin que se lo pidan— pero rompe la regla de que solo se paga lo autorizado.

### 2. Nada te dice que hay 24 personas esperando

Aprobar cuesta **5 toques** y aun así hay **396 días-persona sin mirar** desde el 31-ago. El aviso existe pero vive dentro de una pestaña que nadie abre.

- **a)** Un mensaje **semanal** por Telegram: «24 personas tienen horas extra sin aprobar» + enlace directo.
- **b)** Un mensaje **el día antes de cada quincena** (el 14 y el 29).
- **c)** Nada nuevo por Telegram: un número rojo sobre la pestaña Aprobaciones cuando entras.

**Recomiendo (b).** El trabajo tiene fecha: la quincena. Un aviso semanal se vuelve rutina y se deja de leer; uno el día antes de que haga falta llega cuando se puede actuar. **(c)** solo funciona si alguien entra, y llevamos 8 días sin que nadie entre.
⚠️ Iría a **📊 NEGOCIO**: no es una avería del sistema, es trabajo de la empresa.

### 3. Cerrar la quincena de las 3 empresas cuesta 25 toques y nunca se logró

El período se teclea 3 veces, se «Genera» 3 veces y se cierra 3 veces.

- **a)** Una sola pantalla «Cerrar la quincena»: eliges el período una vez y salen las 3 empresas con lo que le falta a cada una y su botón. 25 toques → 8.
- **b)** Dejar 3 cierres pero que el período y la empresa se recuerden entre pestañas. 25 → 17.
- **c)** Un solo botón que cierre las 3 a la vez.

**Recomiendo (a).** Es el salto grande sin perder el control: cada empresa se sigue cerrando por separado con su firma —que es lo correcto, son 3 planillas distintas—, pero se decide en una sola pantalla. **(c)** no: un botón que congela 3 pagos de un toque es demasiado poder junto.

### 4. El botón «Cerrar quincena» está encendido y el servidor lo rechaza

Hoy tocas, confirmas en el modal, y recién ahí sale el error 409. **15 de 15 veces.**

- **a)** El botón se apaga y dice qué falta («faltan 11 personas por aprobar»), con el enlace a Aprobaciones. Es lo que hace el resto del sistema.
- **b)** El botón se queda encendido pero el aviso de lo que falta sube arriba de todo, en rojo.
- **c)** Se deja como está.

**Recomiendo (a).** «El botón se apaga y dice qué falta» ya es la regla de la casa (el checkout de catálogos, la descarga del Depurador). Y aquí el costo de no tenerla es alto: es exactamente por esto que hay 0 cierres.

### 5. Los 322 días mal marcados — 20,5%, y solo 6 corregidos

En septiembre van **43 de 133 días (32,3%)**. Para encontrarlos hay que abrir 32 personas una por una.

- **a)** Un chip arriba del Reporte: «43 días a revisar» que filtra la tabla a esos días.
- **b)** Además del chip, una lista de esos días en el mensaje de Telegram de la pregunta 2.
- **c)** Aceptar que se marca así y no hacer nada: el motor ya calcula igual.

**Recomiendo (a).** El chip ya se calcula por día; solo falta poder filtrar por él. **(c)** no me parece: un día con 3 marcas se calcula con la 3.ª marca como salida, y en 118 de esos días **esa marca ni siquiera se puede tocar** para corregirla.

### 6. Tres botones «Quitar» borran al primer toque, y dos borran de verdad

Quitar un feriado o una justificación convierte ese día en **una ausencia de 8 h × rata** en la planilla de esa persona. No hay confirmación, ni deshacer, ni queda registrado quién lo hizo.

- **a)** Los tres pasan al patrón de la casa: confirmación + deshacer de 5 s, y soft delete con firma (como ya hacen las correcciones y las vacaciones de este mismo módulo).
- **b)** Solo confirmación, sin cambiar cómo se guarda.
- **c)** Se deja: son pocas filas y las toca una sola persona.

**Recomiendo (a).** Es plata y no deja rastro, que es la combinación que este módulo ya decidió no permitir para la marcación del reloj. Y en Feriados es riesgo de dedo puro: 22 renglones seguidos con un «Quitar» cada 44 px.

---

## Decisiones ya cerradas — no se reabren

| Qué | Cita | Cuándo |
|---|---|---|
| **Presets de quincena** | *«el corte es variable»* | — |
| El prorrateo es `salario ÷ 2`, no `8 h × días hábiles` | *«me dijo mi contable que el cálculo dio exacto, solo le faltó elegir la fecha exacta y no redondear minutos»* | 13-ago-2026 |
| Las 13 personas de 48 h/semana **no** pasan a 40 | *«no»* | 13-ago-2026 |
| La media hora de los que salen a las 5 **no** es hora extra | *«eso es un reemplazo de sus horas para completar 48 mensuales»* | 13-ago-2026 |
| El almuerzo es fijo, 30 minutos | *«puedes quitar la opción de elegir tiempo de almuerzo»* | 13-ago-2026 |
| La pestaña Vacaciones **se queda** | *«vacaciones quedamos que sí, déjalo, solo que hazlo bien»* | 1-sep-2026 |
| El servicio profesional no genera horas extra | *«yulisa marca pero no debería de calcular ya que es salario fijo»* | 3-sep-2026 |
| Décimo tercer mes y vacaciones **no** se provisionan | *«se registran cuando se pagan»* | 13-ago-2026 |
