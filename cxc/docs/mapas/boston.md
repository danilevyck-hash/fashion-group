# Mapa — Confecciones Boston (`/boston`)

> Medido contra producción el **6-sep-2026, 02:30-03:00 UTC** (PostgREST + SQL de solo lectura).
> Ningún número sale de la documentación. Lo que no coincide con `CLAUDE.md` va marcado 🩸.
> Diccionario aplicado: **Correo** (no Email) · nombre de empresa **corto** · **% sin decimal** ·
> plata negativa **−$100.00** · **con centavos**.

---

## Qué es, quién entra, cuánto se usa

**Qué es.** El módulo de la empresa de David: seis pestañas en una sola página
(`Inicio · Por cobrar · Ventas · Clientes · Planilla · Préstamos`). Ninguna cuenta se
reimplementó: la cartera es la misma vista de la pestaña de Boston del CXC, la planilla es el
mismo motor de Asistencia, las ventas salen del mismo resumen mensual.

**Quién entra — medido en `role_permissions` y `fg_users`:**

| | |
|---|---|
| Roles con el módulo | **admin** (daniel, alberto) y **gerente_boston** (david). Nadie más. |
| Módulos de `gerente_boston` en producción | `["boston", "catalogos", "asistencia"]` |
| Su casa al entrar | `/boston` (`MODULO_CASA_POR_ROL`) |
| Su cartera (`/api/cxc/boston`) | admin + gerente_boston. **Secretaria y vendedor: 403** |
| Aprueba horas extra de | **solo Boston** (`asistencia_aprobador_empresa`: 1 fila, `david → confecciones_boston`) |

🩸 **`CLAUDE.md` dice que David tiene DOS módulos (`boston` + `catalogos`). Producción dice
TRES: también `asistencia`.** No es un agujero —`ASISTENCIA_ROLES` no lo incluye, así que las
10 rutas de escritura de Asistencia le contestan 403 y solo entra a Aprobaciones, acotado a
Boston por `asistencia_aprobador_empresa`— pero la documentación no lo menciona y es un módulo
del grupo entero (40 fichas de planilla: Boston 22 · Vistana 10 · Fashion Wear 8).

**Cuánto se usa DE VERDAD:**

| Señal | Medido |
|---|---|
| Sesiones de david | **5**, primera 30-ago-2026, última **4-sep 17:01** |
| Entradas suyas en `activity_logs` | **5**, todas de `auth` (entrar). **Cero acciones.** |
| Vistas de pantalla | **no medido** — el sistema no registra lecturas (`recordModuleClick` guarda en el navegador, no en la base) |
| Comparación | secretaria 320 sesiones · bodega 144 · contabilidad 68 · jennifer (Multifashion) 42 |

Es el módulo menos usado del sistema con usuario propio: **5 entradas en 7 días** desde que
David tiene contraseña. No se puede afirmar qué pestaña abrió.

---

## Los datos, medidos

### La cartera — `switch_estadocuenta_aging_boston`

| | |
|---|---|
| Clientes en la vista | **390** |
| Total | **$195,509.25** |
| 0-90d · 91-120d · 121d+ | $58,612.32 · $11,956.68 · $124,940.25 |
| De ésos, **deben** | 279 clientes · **$213,884.52** |
| De ésos, **a favor del cliente** | **111 clientes** (28%) · **−$18,375.27** |
| Los 10 que más deben | $77,617.05 = **36%** de lo que se debe |
| Documentos detrás (`switch_estadocuenta`) | 990, de los cuales **919 con saldo ≠ 0** |
| Documentos sin `dias` | **0** (el corte fino se puede calcular) |
| Última actualización | 5-sep 08:10 UTC — al día |

**Cuadre verificado:** total = suma de los 3 tramos = suma de los 7 tramos finos = **$195,509.25**,
al centavo. Los 6 tipos de comprobante que llegan hoy están todos clasificados (Factura 632 ·
Recibo 249 · Transacción 28 · Nota de Crédito 5 · Saldo Anterior 3 · Nota de Débito 2).

🩸 **La migración `20260928120000` (tramos finos) YA ESTÁ APLICADA** — `CLAUDE.md` la da por
«pendiente». Las 7 columnas finas existen y la ruta ya las devuelve.

### El directorio de clientes — `switch_clientes` de Boston

| | |
|---|---|
| Filas | **4,915** — todas con el MISMO `synced_at`: **30-jul-2026 06:31:07** |
| Días congelado | **38** |
| Sin correo | **3,914 de 4,915 = 80%** |
| Sin teléfono ni celular | 669 = 14% |
| Códigos y nombres | 4,915 distintos cada uno (sin duplicados) |

### Qué se puede hacer con los 390 de la cartera

| | clientes | % |
|---|---:|---:|
| Con teléfono o celular | **272** | 70% |
| Con correo | **113** | 29% |
| **Sin ninguna forma de contactarlo** | **95** | 24% |

### Ventas (sí suman en el grupo, a propósito)

| Año | Venta | Meses |
|---|---:|---:|
| 2026 | **$472,856.97** | 9 |
| 2025 | $687,474.79 | 12 |
| 2024 | $628,530.15 | 12 |
| 2023 | $694,693.70 | 12 |
| 2022 | $74,942.17 | 3 |

Boston = **7.54%** de los $6,271,319.57 que las 8 empresas vendieron en 2026.
Costo y utilidad: **0 filas** en `switch_factura_utilidad`. La pantalla lo dice.

### Planilla y préstamos

| | |
|---|---:|
| Fichas de planilla de Boston | 22 (20 activas) |
| Sin salario cargado | 1 |
| Sin saldo de vacaciones | **22 de 22 (100%)** |
| Servicio profesional / no marca reloj | 0 / 0 |
| Fichas de préstamo que David ve (las 3 empresas, excepción de Daniel) | **31**: Boston 21 · Vistana 5 · Fashion Wear 5 |

---

## 🔴 La regla de Boston — verificada en las DOS direcciones

**Dirección 1 — Boston NO se mezcla con el CXC del grupo. ✅ SANA.**

| | filas | de Boston | total |
|---|---:|---:|---:|
| `switch_estadocuenta_aging` (vista) | 211 | **0** | $3,676,935.55 |
| `switch_estadocuenta_aging_mv` (lo que lee la pantalla) | 211 | **0** | $3,676,935.55 |

La vista y su materializada dan **exactamente lo mismo**, fila por fila y centavo por centavo.
`clientes_master`: 150 filas vivas, 4,914 marcadas borradas (las de Boston). Ningún cliente de
Boston vivo adentro.

**Dirección 2 — su VENTA sí suma. ✅ SANA.** $472,856.97 en el resumen mensual, 7.54% de 2026.

**⚠️ El único punto de contacto vivo, y es deliberado:** `/api/cxc/boston` lee
`switch_estadocuenta_aging` (la vista del GRUPO) para pintar el chip **«también en el grupo»**
(`src/app/api/cxc/boston/route.ts:137`). Solo lee el nombre normalizado, **cero plata**. Hoy
marca a **5 clientes**: ALADDIN · CITY MALL DAVID · CITY MALL PASO CANOA · LA FRONTERA DUTY FREE ·
WOLF MALL CENTER INT. El comentario del código dice 10 (medido en julio); hoy son 5.
**David ve ese chip.** No le dice cuánto, pero le dice quién. Es una decisión de Daniel, no un bug.

---

## 🩸 Lo que miente o está roto

**1. El directorio de Boston lleva 38 días congelado y su pestaña Clientes no lo dice.**
`switch_clientes` de Boston: 4,915 filas, todas selladas el 30-jul-2026 06:31:07.
La pestaña **Clientes** (`src/app/boston/tabs/ClientesBoston.tsx`) muestra correo y teléfono de
esa foto **sin una sola palabra de cuándo es**. Es el defecto exacto que costó la caída de
19-ago-2026 («un número viejo presentado como actual es peor que no tener número»): la pestaña
**Por cobrar** sí monta `<SyncStatus />` (`BostonTab.tsx:192`) y la de **Inicio** también
(`InicioBoston.tsx:84`); Clientes, Ventas, Planilla y Préstamos, **no**.
- ✅ **La vigilancia SÍ funcionó**: la alerta de silencio disparó el **5-sep 10:00:28 UTC**
  (`cron_email_errors` → `silencio_de_datos:Confecciones Boston`, `confecciones_boston/switch_clientes:quieta`).
- ⚠️ **El cron que lo arregla todavía no corrió.** `sync-clientes-boston` está en `vercel.json`
  (`10 7 * * 0`) y su ruta existe, pero **no tiene fila en `cron_heartbeats`**. Su primera
  ocasión es hoy domingo 07:10 UTC. Hasta que corra, el dato sigue con 38 días.
- **Consecuencia medida:** **8 clientes con cartera abierta no tienen ficha en el directorio**
  (nacieron después del 30-jul). Deben **$748.08** entre todos, todo en 0-90d. En la pestaña
  Clientes salen sin correo ni teléfono, como si no los tuvieran.
  El mayor: PRIVIVIENDA S,A. $323.68.

**2. El texto que le llega al cliente de Boston tiene faltas de ortografía.**
`src/components/cxc/BostonHojaCobrar.tsx:57`:
> «Agradecemos su pronta **atencion** a este saldo. Quedamos a su **disposicion** para cualquier consulta.»

Sin tildes. Es el ÚNICO texto del sistema con ese defecto (barrido sobre `src/lib/cxc/`,
`src/components/cxc/` y `src/app/api/cxc/`). Lo lee un cliente de Boston por WhatsApp.

**3. «Cobrar» en Boston tiene 2 salidas; en el grupo tiene 5.**

| | grupo (`HojaCobrar`) | Boston (`BostonHojaCobrar`) |
|---|---|---|
| Salidas | Correo · WhatsApp · Copiar · PDF · Escribirlo yo | **WhatsApp · Copiar** |

El correo es la decisión pendiente y está bien documentada (el texto lo firma Fashion Group).
**Pero el PDF no tiene ese problema y tampoco está**: el cajón de documentos de Boston existe
(`/api/cxc/boston/estado-cuenta`) y de ahí no se puede sacar una hoja para mandar.
Con 113 clientes con correo y 272 con teléfono, hoy **272 clientes son alcanzables por WhatsApp
y 0 por correo o PDF**.

**4. El rótulo del módulo no usa el nombre corto del diccionario.**
El encabezado dice **«Confecciones Boston»** (`BostonShell.tsx:45`), y los mensajes de error de
las pestañas repiten el nombre largo 6 veces («No se pudieron leer los clientes de Confecciones
Boston»). El diccionario del 5-sep dice nombre **corto**: «Boston».

**5. Un tipo de comprobante que Switch estrene valdría $0.00 en silencio.**
La vista `switch_estadocuenta_aging_boston` tiene `ELSE 0` para todo tipo que no esté en sus dos
listas. Hoy los 6 tipos que llegan están clasificados, así que **el riesgo es latente, no activo**.
Ventas ya resolvió esto con un aviso (`tipos-comprobante.ts`); la cartera de Boston no lo tiene.

**6. Hay dos puertas a la misma pantalla de cartera.** `/boston?tab=cxc` y `/cxc?tab=boston`
montan el MISMO `<BostonTab />`. No hay riesgo de números distintos (es un componente), pero
admin ve la cartera de Boston desde dos lugares y David desde uno.

**Lo que NO está roto, y vale decirlo porque se buscó con saña:**
- Ni una lista se corta en N sin decirlo: las 4 lecturas de la cartera están paginadas
  (`db-max-rows` = 1000, hoy 390 filas).
- Ni un cálculo duplicado: cartera, planilla, ventas y saldo de préstamo salen de la misma
  función que usa el resto del sistema.
- Cero voseo en texto de pantalla (el único «acá» está en comentarios de código, que el candado ignora).
- Ningún `$0.00` en letra grande.
- El sync de la cartera: 14 corridas, 14 éxitos en 14 días.

---

## Cuánto cuesta hacer las cosas

Las tareas reales, contadas contra el código. Toques = clics/taps desde `/home`.

### 1. «¿Cuánto me deben y a quién le cobro hoy?» — la tarea principal

| Hoy | |
|---|---|
| Toques | **4** — Inicio → ficha Boston → pestaña «Por cobrar» → píldora del tramo |
| Pantallas | 2 |
| Campos a escribir | 0 |
| Lo que hay que recordar | nada: el aviso de frescura está a la vista |

**Está bien como está.** No propongo cambio.

### 2. «Le mando el estado de cuenta a este cliente»

| | Hoy | Más corto posible |
|---|---:|---:|
| Toques | **6** (Inicio → Boston → Por cobrar → buscar → Cobrar → WhatsApp) | **6** |
| Salidas disponibles | 2 de 5 | 3 de 5 (agregando el PDF) |
| Clientes alcanzables | **272 de 390** (70%) por WhatsApp | 272 + los 113 con correo, si Daniel define quién firma |

El cuello no son los toques: son los **95 clientes (24%) que no tienen ni correo ni teléfono**,
y que hoy no se pueden cobrar desde la pantalla de ninguna manera.

### 3. «¿Este cliente cómo lo contacto?» — la pestaña Clientes

| | Hoy | Más corto posible |
|---|---:|---:|
| Toques | **4** + escribir ≥3 letras | 4 |
| Lo que la pantalla NO dice | **de cuándo es el dato (38 días)** | lo dice en una línea |
| Campos que el sistema ya sabe y no muestra | el saldo fino, la fecha del último pago | — |

**El arreglo es una línea**, el mismo `<SyncStatus />` que ya montan las otras dos pestañas.
No hay pantalla nueva.

### 4. «Aprobar las horas extra de la quincena»

| | Hoy |
|---|---:|
| Toques | **3** desde Inicio (Inicio → ficha Asistencia → pestaña Aprobaciones) |
| Pantallas | 2 |
| Personas que le aparecen | solo las de Boston (`asistencia_aprobador_empresa`) |

⚠️ **David tiene que salir de `/boston` para hacerlo**: Aprobaciones vive en el módulo Asistencia
del grupo, no en su pestaña Planilla. Es un salto de módulo que la pantalla no anuncia.

### 5. «Mirar la planilla de la quincena»

| | Hoy | Más corto posible |
|---|---:|---:|
| Toques | **3** | 3 |
| Columnas en pantalla | **23** (Persona + 18 de plata + 4 de horas) | 23 |
| Formas de sacarla | **ninguna** — no hay Excel ni PDF en `/boston` | 1 botón |
| Montos que puede corregir | **0** de 5 (el servidor los rechaza) | decisión de Daniel |

Es la única pantalla del módulo sin salida a papel. En el grupo, la misma planilla sí tiene Excel.

---

## Que se sienta más fácil — lo que quitaría y lo que dejaría

**Quitaría:**

| Qué | Dónde | Por qué |
|---|---|---|
| «Confecciones» del encabezado y de los 6 mensajes de error | `BostonShell.tsx:45` y las 5 pestañas | El diccionario dice nombre corto; ocupa 12 caracteres en una barra de 390 px |
| El chip **«también en el grupo»** | `BostonTab.tsx` | Marca a **5 de 390 clientes (1%)** y no dice cuánto ni permite hacer nada. Si Daniel lo quiere, que se quede; si no, es la única palabra del grupo en la pantalla de Boston |
| La frase «— busca por nombre para ver el resto» pegada al conteo | `ClientesBoston.tsx` | El buscador está justo arriba y ya lo dice |

**Dejaría:**

| Qué | Por qué |
|---|---|
| Las 4 píldoras de tramo con su plata | Es donde se decide a quién cobrar |
| El aviso de frescura de «Por cobrar» | Es lo que impide cobrar con un número viejo |
| Los 3 montos por tarjeta en el celular | Son los que se leen antes de tocar «Cobrar» |
| Las 18 columnas de plata de la planilla | Son las mismas que la contadora cuadró; recortarlas crearía una segunda verdad |

**Agregaría (una línea cada uno):**
- La fecha del dato en **Clientes** (el `<SyncStatus />` que ya existe).
- Las tildes de «atención» y «disposición» en el mensaje al cliente.

---

## El iPhone (390 px)

| | Medido contra el código |
|---|---|
| Las 6 pestañas | Entran: `text-xs` + `px-1` + `min-w-[44px]` bajo `lg`; la tira suma ≈336 px de 374 útiles |
| Las 6 pestañas tienen vista de tarjetas | **4 de 6** (`Por cobrar`, `Clientes`, `Planilla` con `data-vista`; `Inicio` son tarjetas por diseño). **Ventas y Préstamos: no medido** — no declaran `data-vista` ni `lg:hidden` |
| Cartera: la tabla se corta en `lg` (1024), no en `sm` | ✅ correcto — es lo que arregló los 184 px de arrastre del iPad |
| Planilla: **23 columnas** | Tiene tarjetas bajo `lg`, así que en el iPhone no se arrastra |
| Táctiles | Los botones «Cobrar» y «Documentos» son `min-h-[44px]`; las píldoras también |
| Nombre del cliente | `truncate` — se corta con puntos suspensivos, que es el mecanismo, no un defecto |

⚠️ **No medido en el navegador.** Lo de arriba sale de leer las clases, no de abrir un iPhone.
Para afirmarlo hace falta correr `scripts/_medir-boston-anchos.mjs`, que ya existe.

---

## Lo que sobra · lo que falta

**Sobra:**

| Qué | La medición que lo prueba |
|---|---|
| El chip «también en el grupo» | 5 de 390 filas (1%) |
| La segunda puerta a la cartera (`/cxc?tab=boston`) | Mismo componente, dos rutas; solo la usa admin |
| El nombre largo «Confecciones Boston» en pantalla | 6 apariciones, 19 caracteres cada una |

**Falta:**

| Qué | La medición que lo prueba |
|---|---|
| Decir de cuándo es el directorio | **38 días** congelado, 4 pestañas sin aviso de frescura |
| Que el cron del directorio corra | **0 filas** en `cron_heartbeats` para `sync-clientes-boston` |
| Correo desde «Cobrar» | 113 clientes con correo hoy inalcanzables desde la pantalla |
| PDF desde «Cobrar» | El cajón de documentos existe y no se puede compartir |
| Excel o PDF de la planilla | 23 columnas, 0 formas de sacarla |
| Contacto para 95 clientes | 24% de la cartera no tiene ni correo ni teléfono |
| Un aviso si Switch estrena un tipo de comprobante | Hoy valdría $0.00 en silencio |

---

## Preguntas para Daniel

**1. La pestaña Clientes de Boston muestra correos y teléfonos de hace 38 días y no lo dice.
¿Le pongo la misma línea de «Actualizado: …» que ya tienen Inicio y Por cobrar?**
a) Sí, en Clientes · b) Sí, en las cuatro pestañas que no la tienen (Clientes, Ventas, Planilla,
Préstamos) · c) No, déjalo así.
→ **Recomiendo (a).** Es la pestaña donde el dato viejo engaña: las otras tres se alimentan de
tablas que sí están al día. Es una línea, sin pantalla nueva.

**2. «Cobrar» en Boston hoy solo manda por WhatsApp (272 de 390 clientes). El correo necesita
que decidas quién lo firma. ¿Qué hacemos primero?**
a) Agregar el **PDF** ya (no necesita decisión tuya: el cajón de documentos ya existe) ·
b) Esperar y hacer PDF y correo juntos cuando definas la firma · c) Dejarlo con WhatsApp.
→ **Recomiendo (a).** El PDF sube de 2 a 3 salidas sin pedirte nada, y deja el correo como una
decisión separada que no bloquea.

**3. Si agregamos correo, ¿quién firma el estado de cuenta de Boston?**
a) **Confecciones Boston — Departamento de Cobros** (lo que ya dice el WhatsApp) ·
b) Fashion Group, como el del grupo · c) No mandar correo desde Boston.
→ **Recomiendo (a).** Ya es el texto que el cliente de Boston recibe hoy por WhatsApp; usar otro
en el correo le diría al mismo cliente que son dos empresas distintas.

**4. El chip «también en el grupo» le dice a David cuáles de sus clientes también le compran a
Fashion Group. Hoy marca 5 de 390. ¿Se queda?**
a) Se queda como está · b) Se queda solo para admin, no para David · c) Se quita.
→ **Recomiendo (b).** No es plata, pero es información del grupo en la pantalla de David, y tu
regla dice «no quiero que vea info de fashion group». Para ti sí es útil al cobrar.

**5. La planilla de Boston tiene 23 columnas y ninguna forma de bajarla. ¿Le pongo el mismo
Excel que ya tiene la planilla del grupo?**
a) Sí, mismo Excel · b) Sí, pero solo para admin · c) No hace falta.
→ **Recomiendo (a).** Es el mismo motor y el mismo Excel; no se construye nada nuevo. David
aprueba las horas de 20 personas y hoy no puede sacar el papel.

**6. David tiene el módulo Asistencia del grupo (no está en la documentación). Ahí solo entra a
Aprobaciones y solo ve a la gente de Boston. ¿Lo dejamos?**
a) Se queda así · b) Movemos «Aprobaciones» adentro de `/boston` como séptima pestaña ·
c) Se le quita.
→ **Recomiendo (a) por ahora.** Funciona y está acotado. (b) es más limpio pero mueve una
pantalla que la contadora también usa, y con 5 sesiones en 7 días no hay evidencia de que le
moleste el salto.
