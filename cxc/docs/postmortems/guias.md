# Post-mortems — Guías

> Movido de `cxc/CLAUDE.md` el 31-ago-2026 para bajar lo que se inyecta en cada sesión.
> **Nada se resumió ni se borró: el contenido es verbatim**, con sus «Daniel, textual»,
> sus mediciones, sus «Candados», sus «Verificado por mutación» y sus 🩸.
> La REGLA vigente (sin la historia) vive en «Invariantes por módulo» de `cxc/CLAUDE.md`.

---

## Notas de «Guías — máquina de estados»

> **EL CLIENTE DE UNA GUÍA VIVE EN LAS LÍNEAS, y atarlo NO es editar la guía (8-ago-2026).**
>
> Una guía sale con VARIOS destinos: la real GT-189 lleva America Clasic, Jerusalem, City Mall Paso Canoa y City Mall David en el mismo viaje. Por eso el cliente es `guia_items.cliente_codigo` (D-XXX), uno por renglón. ⚠️ **`guia_transporte.receptor_nombre` NO es el cliente** — es quien FIRMA el recibido, y son choferes ("Nicolás guillen", "Reynel", "Walter arauz"): de 109 guías con receptor, **0 coinciden** con el nombre de un cliente. Daniel, textual: *"en guía el cliente es a dónde se despachó, no el nombre del transportista"*. Candado en `src/__tests__/api/guias.test.ts`.
>
> **El estado del arte, medido contra producción:** 441 líneas vivas · **441 con el nombre escrito (100%)** · 120 con código (27%). El cliente SÍ se anota siempre, pero **a mano**, y cada quien lo escribe distinto: `"City Mall"` / `"City Mall "` / `"City Mall Paso Canoa"`, `"Jerusalem Panama"` vs `"Jerusalem De Panamá"`.
>
> 🩸 **`PATCH /api/guias/[id]/cliente` existe PORQUE el 98% de las guías están cerradas.** 174 de 177 guías vivas están **Completada**, y el PUT y el PATCH de `/api/guias/[id]` las rechazan con *"Guía ya despachada, no se puede editar"* — un candado que protege el DESPACHO (bultos, facturas, firmas, placa) y que **sigue intacto**. Anotar a qué cliente fue un renglón no es editar el despacho: no cambia el texto que escribió bodega, ni un bulto, ni una firma. Si atar el cliente pasara por el PUT, el 98% de las guías serían inatables para siempre. Por eso el endpoint **toca UNA columna de UNA línea y ni siquiera consulta el estado** — candado en `src/__tests__/api/guias-atar-cliente-route.test.ts`.
>
> **En pantalla:** en el acordeón de `/guias`, cada renglón muestra debajo del nombre o el chip verde `D-XXX` o el enlace *"Atar cliente"*. **Los dos abren la misma ventana** — el chip también es un botón, y eso no es cosmético: sin él, una línea atada al cliente EQUIVOCADO no se podría corregir nunca (y hay una así, ver abajo). El texto escrito a mano **se conserva siempre** como display; solo se guarda el código. Mismo patrón que `mk_proyectos.tienda` + `tienda_codigo` y que `cheques.cliente_codigo`.
>
> **Elegir cliente NO es obligatorio para crear una guía, y es una decisión de Daniel, no del código.** La pantalla la usa bodega todos los días y **272 de las 441 líneas (62%) tienen un destino que hoy NO existe en el directorio** — volverlo obligatorio de un día para otro les traba el trabajo. El selector cerrado (`ClientePicker`, con su opción "Otro") ya hace que elegir de la lista sea el camino cómodo.
>
> ⚠️ **`clientes_master.nombre_normalized` NO es único entre los D-XXX vivos.** El comentario de la migración de jun-2026 afirmaba que un índice UNIQUE parcial lo garantizaba; **es falso**, medido: `"CITY MODA CHORRERA"` → D-30 **y** D-26, `"METRO SHOES PANAMA SA"` → D-103 y D-173, `"EL MACHETAZO SAN MIGUELITO"` → D-171 y D-101. Un `UPDATE … FROM` con dos candidatos elige uno EN SILENCIO y sin determinismo. Cualquier pareo automático por nombre necesita el `NOT EXISTS` que exige **un solo** código vivo.
>
> **LA DIRECCIÓN es lo que desambigua "City Mall", y el chip ahora dice el NOMBRE (9-ago-2026).**
>
> Estado medido: 441 líneas vivas · **169 atadas** · 272 sin atar. Las sin atar estaban concentradas en 4 destinos, y la mitad se resuelve con un dato que la línea ya tenía: **`guia_items.direccion`**.
>
> 🩸 **`D-200 "City Mall"` está borrado y está BIEN borrado: es ambiguo porque hay DOS tiendas.** Las buenas están vivas — `D-24 "City Mall David"` y `D-25 "City Mall Paso Canoa"` — y la dirección las separa sin adivinar nada: `paso canoas`/`pasocanoas`/`paso canoa` → D-25 (62 líneas), `david` → D-24 (27). Los otros tres van por nombre: `Sporting Shoes`/`Sporting Shoes N4` → **D-142** (38), `American`/`America Clasic` → **D-108** (15), `Jerusalem Panama` → **D-80** (8).
>
> **El pareo es EXACTO y normalizado — nada por parecido ni por distancia de edición.** Por eso quedan afuera `Sporting Shoes N7/N8/N9` y `tienda 7/8/9` (son OTRAS tiendas, no la N4) y `american clasicc` con tres c.
>
> 🔴 **`City Mall · Guabito` (GUÍA 36, 15-abr-2026) SÍ se ata a D-25 — Daniel: *"era paso canoas"*— pero como CORRECCIÓN PUNTUAL DE UNA FILA, no como regla.** `guabito` **NO** entra en la tabla de equivalencias, y la diferencia no es cosmética: Guabito es la frontera con Costa Rica y ahí despachan los **duty free** (La Frontera, Outlet Duty Free N2, Jerusalem Duty Free, Wolf Mall). Hay **12 líneas más** con esa dirección que son de esos clientes; como regla general, la próxima que alguien cargue se ataría a City Mall. Por eso vive en su propio paso (`PASO 3B`), acotada por **número de guía**, y la vista previa la muestra aparte de las 99. ⚠️ **La dirección sigue diciendo "Guabito" y se queda así**: esa guía está Completada y firmada, y cambiarle el texto impreso a un documento ya entregado es otra cosa que lo que se aprobó. Con esto City Mall queda **100 de 100**.
>
> ⚠️ **`D-201 "American Classics"` es un DUPLICADO** — no existe en Switch, 0 facturas, 0 CXC — y tenía **13 líneas atadas**: se **remapean a D-108**, el American Classics real del grupo. Es el ÚNICO caso de reescritura. **D-201 NO se borra del maestro**: eso es decisión de Daniel. Y `111380` (Boston) ya no tiene ninguna línea viva: se corrigió desde la pantalla, como decía la nota de arriba.
>
> **Resultado medido:** 150 por reglas + 1 puntual + 13 remapeadas → **320 de 441 (73%)**, 121 sin atar. Las 121 son destinos que hoy no existen en el directorio (City Moda, los duty free de Guabito, las otras Sporting Shoes) y se atan a mano desde `/guias`.
>
> 🔴 **EL TEXTO ESCRITO NO SE TOCA. Solo se escribe `cliente_codigo`.** La guía tiene que seguir imprimiendo `"City Mall | Paso Canoas"` tal cual — Daniel: *"el código es plomería invisible"*. Reemplazarlo por el nombre oficial dejaría `"City Mall Paso Canoa | Paso Canoas"`, la redundancia que él mismo detectó. El backfill va en `supabase/migrations/20260809120000_guias_atar_city_mall_y_remapeo_d201.sql`, **lo corre Daniel A MANO**, y el **PASO 1 es una vista previa que no escribe**: si los conteos no dan, se para ahí.
> - **Las reglas viven en el SQL y NADIE las copia.** `src/lib/guias/reglas-city-mall.ts` las LEE del archivo de migración, así que la verificación contra producción mide la migración que va a correr y no una segunda lista. El mismo módulo exige que la copia del PASO 1 y la del UPDATE sean idénticas — si difirieran, **la vista previa estaría mintiendo**, que es la peor forma de fallar acá.
> - Verificación read-only contra producción, antes de correrla: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-migracion-guias-city-mall.ts` (compara los 8 conteos, exige que la **GUÍA 36 quede en D-25** y que los **otros de Guabito NO se toquen** — que es lo que prueba que la corrección puntual no se volvió una regla).
>
> **EL CHIP DICE EL NOMBRE, y el código va de apoyo.** Antes decía `D-108` a secas; Daniel, textual: *"quiero que se llame american classics store en guia porque sino el personal no va a saber"*.
> - **El alias de display vive en UN lugar: `src/lib/clientes/nombre-display.ts`.** D-108 se llama **"Multi Fashion Holding"** en `clientes_master` (la razón social) y bodega no la reconoce. El alias es de DISPLAY: la base no se toca y el sync sigue trayendo el nombre oficial.
> - 🩸 **El alias TAMBIÉN tiene que ser buscable, y eso no es un detalle.** Medido antes del cambio con el matcher real: `"american classics store"` → **0 coincidencias**. Sin agregarlo a los campos de búsqueda, el chip enseñaría un nombre que tecleado en el selector no encuentra nada — **una pantalla que se contradice a sí misma es peor que la que solo mostraba el código**. Por eso `camposDeBusquedaCliente()` vive al lado del alias y la usan **los dos** caminos (`useBusquedaClientes` en el navegador y `/api/clientes` en el servidor): no puede haber dos resultados para la misma consulta.
> - **El buscador ya encontraba "City Mall" y ofrecía las dos** (medido: `"City Mall"`, `"CITY MALL"`, `"citymall"`, `"Cíty Máll"` → D-24 y D-25 siempre). Lo que faltaba era que el chip dijera de quién se trata. `"city"` ofrece las dos City Mall más las City Moda, por coincidencia parcial desde 3 caracteres.
> - ⚠️ **El nombre NO se trunca: baja de línea.** Esconderlo sería deshacer lo que el cambio vino a arreglar. El peor caso REAL —medido sobre los 148 clientes D-XXX vivos— son **47 caracteres**: `"Sistema Nacional De Proteccion Civil (Sinaproc)"` (D-138), no `"City Mall Paso Canoa"`. Y la jerarquía va por **color y tipografía, nunca por tamaño**: en guías nada baja de 12 px (candado `iphone-targets-guias`).
>
> **En una guía Completada la pantalla DICE qué se puede tocar:** `Solo se puede cambiar el cliente`, **una vez en la cabecera** de la guía abierta — no por línea, que en GT-189 lo repetiría cinco veces. Sin eso, un chip tocable sobre una guía cerrada se lee como si el despacho entero fuera editable. **El candado del PUT no se toca** y el endpoint de atar sigue sin mirar el estado.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… node scripts/_medir-guias-chip-anchos.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre de página en los tres, y el scroller de la tabla de ítems da 255 / 83 / 0 px — EXACTAMENTE lo mismo que main**. O sea que meterle el nombre al chip **no ensanchó nada**: crece hacia abajo (62 px de alto con el peor caso de 47 caracteres, texto entero). Los recortes de 16 / 190 / 35 px y el blanco de 39 px son **PRE-EXISTENTES, medidos idénticos en main** (`w-40 truncate` del resumen de la fila colapsada y el `swipeable-row`). Contrato visual: `node scripts/_verif-guias-contrato-visual.mjs`.
>
> Candados: `src/__tests__/lib/guias-city-mall-reglas.test.ts` (el SQL no puede escribir el texto, ni borrar, ni usar LIKE; `guabito` no puede ser regla y la corrección puntual tiene que ir acotada por número de guía), `clientes-nombre-display.test.ts` y `guias-chip-nombre-y-candado.test.ts`. **Verificado por mutación: 22 de 22 cazadas** — meter Guabito como regla, sacarle el `numero = 36` a la corrección puntual, que ésta pise líneas ya atadas o reescriba la dirección, que la vista previa difiera del UPDATE, que un UPDATE pise líneas atadas o toque el texto, parear con LIKE, un `translate` desbalanceado, quitar el alias, volverlo no buscable, truncar el nombre, poner el código adelante, repetir el aviso por línea o mostrárselo a quien no puede atar.

> **LO QUE SE ESCRIBE SOLO Y LO QUE NECESITA OJOS — la pantalla SUGIERE, la migración no adivina (10-ago-2026).**
>
> Punto de partida medido: **441 líneas vivas · 320 atadas (73%) · 121 sin atar en 68 nombres distintos**. Esas 121 son dos cosas que se ven iguales y **se resuelven distinto**, y mezclarlas es el error caro:
>
> **(A) 35 líneas / 12 nombres se escriben solas, porque no hay nada que adivinar.** El nombre escrito ES el del cliente salvo la coletilla jurídica y la puntuación: `GRUPO HANNA` → `Grupo Hanna, S.A.` (D-68), `Wolf Mall Center` → `Wolf Mall Center Int` (D-156), `City Moda Calidonia` → `City Moda / Calidonia` (D-27), y al revés `Dollar Mall S, A` → `Dollar Mall` (D-46). Backfill en `supabase/migrations/20260810120000_guias_atar_nombres_exactos.sql`, **lo corre Daniel A MANO**, aditivo, con **vista previa que no escribe** en el PASO 1. Solo filas con `cliente_codigo IS NULL`. **Resultado: 320 → 355 de 441 (80,5%)**, quedan 86.
> - 🔴 **LA REGLA ES IGUALDAD EXACTA TRAS QUITAR EL SUFIJO LEGAL, Y NO SE TOCA UN SOLO DÍGITO.** `Outlet Duty Free N2` (D-117), `N3` (D-118) y `Sporting Shoes N 4` (D-142) son **TIENDAS DISTINTAS**. Una normalización que borre o ignore los números las vuelve el mismo nombre y mete el despacho de una en la cuenta de otra — sin dejar rastro, porque el texto escrito sigue diciendo "N2", y sin que nadie se entere hasta que el cliente reclame mercancía que nunca pidió. `src/lib/clientes/nombre-normalizado.ts` (módulo PURO) compara los dígitos **sobre el texto crudo**, aparte de las letras, para que un cambio futuro en el quita-sufijos no pueda comérselos en silencio.
> - ⚠️ **La coletilla se quita UNA vez y como PATRÓN COMPLETO, no token por token.** `S` y `A` sueltas son letras normales: quitarlas en bucle desde el final convierte `R.J.A.S.A.` (→ "r j a s a") en **"r j"**, o sea se come la J y la R. Sacando `s a` una sola vez queda "r j a", que es lo que permite reconocer a **RJA**.
> - **Verificación read-only contra producción, antes de correrla:** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_verif-migracion-guias-nombres-exactos.ts`. Chequea regla por regla que el destino esté VIVO, que la pareja sea exacta, que los dígitos coincidan y —lo que más importa— que haya **UN SOLO** cliente D-XXX vivo que la cumpla, mirando nombre **y razón social**: `clientes_master.nombre_normalized` NO es único ("City Moda Chorrera" es D-26 **y** D-30). Medido el 9-ago: 12/12 únicos, 35 líneas, 🟢.
> - Las reglas **NO se copian a TypeScript**: `src/lib/guias/reglas-nombres-exactos.ts` las LEE del .sql (mismo mecanismo que `reglas-city-mall`, cuyo `normalizarComoSql` se **reusa** en vez de escribir un segundo normalizador) y exige que la vista previa y el UPDATE sean idénticos — si difirieran, la vista previa estaría mintiendo. La migración **tampoco redefine `fg_norm_guia_texto`**: la exige y para con `RAISE EXCEPTION` si falta.
>
> **(B) 86 líneas / 56 nombres NO se adivinan: la pantalla SUGIERE y una persona confirma.** Son tipeos (`Hanna Calzado` por `Hanna Calzados`, `Jerusalem Dutty Free`, `American Clasicc` con tres c, `Sporsam` por `Sportsam`) y tiendas que no existen en el directorio. Al abrir "Atar cliente" de una línea sin código, arriba del selector aparece **"¿Quisiste decir…?"** con hasta 3 candidatos. Motor PURO: `src/lib/clientes/sugerencias.ts`; UI: `src/app/guias/components/SugerenciasCliente.tsx`.
> - 🔴 **LA SUGERENCIA NUNCA ATA SOLA. NI CON UN ÚNICO CANDIDATO CLAVADO.** Tocarla solo la copia al selector; se escribe recién al apretar **Guardar**. `Sporting Shoes N7` y `Sporting Shoes N 4` comparten TODAS las palabras y son tiendas distintas: un auto-atado "cuando el parecido es altísimo" habría metido el despacho en el negocio equivocado. La función devuelve una LISTA y no expone ningún `elegido`/`auto` del que un consumidor pueda deducir una decisión.
> - 🔴 **Una diferencia de NÚMERO se ve, no se esconde.** Cada candidato lleva su aviso — *"los números no son los mismos"*, *"uno lleva número y el otro no"*, *"los nombres no son iguales del todo"* — y además **pesa en el orden**. Medido con el texto real `Outle Dutty Free # 3`: por letras, `Outlet Duty Free` (sin número, D-119) puntuaba **0,93** y el correcto `…N3` (D-118) **0,90**, así que la lista arrancaba con el equivocado. El número penaliza el orden ×0,8 (distinto) / ×0,9 (falta), pero **no saca a nadie de la lista**: eso sería decidir por la persona.
> - 🔴 **Cuando no hay nada parecido, la pantalla LO DICE**: *"No hay ningún cliente parecido en el directorio — hay que darlo de alta en Switch"*. Sin eso alguien se queda buscando algo que no está. Medido: **7 nombres / 10 líneas** están así (`ALMACEN JORDANIA` 4, `Almacen Amin`, `Almacen Lutty Lui`, `Business display`, `DUCASA`, `HOTEL GRAN DAVID`, `Punto Maravilloso`).
> - 🩸 **Sin directorio, la ventana se CALLA.** `useClientesDelGrupo` devuelve `[]` mientras no lo haya leído COMPLETO (incluido el caso `completo:false`, la lista recortada), y con `[]` no se dibuja ni el "¿quisiste decir?" ni el aviso. Decir "no hay ninguno" sin haber podido mirar mandaría a dar de alta en Switch un cliente que ya existe. Reusa el **MISMO caché de módulo** que el selector y `useNombresDeClientes`: abrir la ventana no dispara ni una lectura extra.
> - **Cómo decide que algo se parece:** cuatro puertas (basta una) y después un puntaje. (a) comparten una palabra **idéntica** de 4+ letras · (b) una casi idéntica de 6+ (`sporsam`≈`sportsam`) · (c) las letras pegadas son las mismas (`LUTY LUI` ≡ `Lutylui`, `Rja` ≡ `R.J.A.S.A.`) · (d) el texto escrito ES el código (`d-35` → D-35). Esa puerta es la que deja afuera a lo que no existe sin necesidad de umbrales finos. **También se compara contra la RAZÓN SOCIAL**, y no es un lujo: `City Moda Chorrera` factura como *"Inversiones Z15, S.A."*, así que sin ella `City Moda Inversiones Z15` no encontraría a su cliente, que SÍ está. Cuando pega por ahí, la tarjeta lo dice (*"factura como …"*) — si no, la sugerencia parecería sacada de la nada.
> - 🩸 **D-201 NO se sugiere** (`CODIGOS_QUE_NO_SE_SUGIEREN`). Es el duplicado sin respaldo en Switch del que la migración de #444 sacó 13 líneas: por parecido a secas, `American Clasicc` pegaba **mejor** contra el duplicado (0,94) que contra el bueno D-108 (0,83), o sea que la pantalla habría recomendado, primero en la lista, deshacer lo que se acababa de arreglar. **No se lo saca del directorio ni del selector** — quien lo busque a propósito lo encuentra; borrarlo del maestro es decisión de Daniel. Se le quita solo la RECOMENDACIÓN.
> - **Cobertura medida contra producción** (`DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-sugerencias-guias.ts`, solo lectura, corre el motor REAL contra el directorio REAL): **61 de los 68 nombres (111 de 121 líneas) reciben al menos un candidato**.
> - ⚠️ **Hallazgos que contradicen el punto de partida y que Daniel tiene que decidir** (no se atan solos): `King Sport` (5 líneas) → **D-86 "Kings Sport"**, `Rja` (5) → **D-131 "R.J.A.S.A."**, `Xtreme Shos` → D-159, `LUTY LUI` → D-98, `BOUTI SHOPPING CENTER` → D-14. **Sí existen en el directorio.** Y hay 3 parejas EXACTAS más que quedaron fuera del grupo A porque no estaban en la lista aprobada: `Boutique Chez moi` → D-20, `COMERCIAL LA NUEVA REINA` → D-88, `Rja` → D-131 (las tres pegan por razón social).
>
> **Los 3 anchos, medidos en el navegador contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-guias-sugerencias-anchos.mjs`, solo lectura), en los DOS estados —con sugerencias (`GRUPO HANNA` → D-68) y sin parecidos (`DUCASA`)—: **390 · 834 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px, en los seis casos.** Y **CONTRA `origin/main`, la misma ventana y la misma línea: 0 / 0 / 0 / 0 también** — o sea que el bloque nuevo **no ensanchó nada**: la ventana pasa de **344 px de alto a 470** (con sugerencias) o **447** (sin parecidos) y sigue entrando entera en los tres anchos. Crece hacia abajo, que es lo único que un modal puede regalar. (El `sr-only` de `ClientePicker` mide 1 px de ancho a propósito y se excluye del conteo: contarlo sería ruido.)
>
> Candados: `src/__tests__/lib/guias-reglas-nombres-exactos.test.ts` (18), `clientes-sugerencias.test.ts` (45, todos con TEXTOS REALES de `guia_items` contra CLIENTES REALES) y **`src/__tests__/components/guias-sugerencias-cliente.test.tsx` (11), que RENDERIZA la ventana y toca los botones** — el riesgo de verdad no es la matemática sino que la sugerencia se convierta en un atado, y eso un test de función pura no lo puede ver. **Verificado por mutación: 6 de 6 cazadas** — borrar los dígitos al normalizar (3 tests), cruzar `N2 → D-118` (2), que la vista previa difiera del UPDATE (el archivo entero se pone rojo), dejar de excluir D-201 (3), sacarle al número su peso en el orden (1) y hacer que tocar una sugerencia guarde (3).

---

## 🔴 ABRIR UNA GUÍA PARA EDITARLA NO ESCRIBE NADA — el formulario contaba renders, no cambios (17-ago-2026)

> Daniel abrió `/guias/[id]/editar` de **GT-204** para sacarle una captura, no tocó una tecla, y la guía **se guardó sola dos veces**. Su instrucción, textual: ***"quita el guardado automático si hace fricción"***.
>
> 🩸 **EL BUG: "¿cambió algo?" se contestaba contando cuántas veces había corrido un `useEffect`** (`changeCount.current > 1` en `GuiaForm.tsx`). Eso no mide que alguien haya cambiado algo: mide que el efecto corrió dos veces, y corre dos veces por motivos que no tienen nada que ver con la persona — que terminen de cargar los datos de la guía, que React vuelva a montar el árbol, que cambie la identidad del router. A los ~1,5 s salía un `PUT /api/guias/[id]`.
>
> 🔴 **Y ESE PUT MANDA `items`, QUE EN EL SERVIDOR ES UN REEMPLAZO COMPLETO**: borra los renglones de `guia_items` e inserta otros con **ids NUEVOS**. O sea que **abrir la pantalla y arrepentirse ya le había cambiado el id a cada línea** — exactamente lo que este archivo venía advirtiendo desde el 10-ago (*"usarlo en pleno despacho le cambiaría el id a cada línea y tiraría el trabajo de atar clientes"*), solo que ahora pasaba sin que nadie tocara nada.
>
> ### La regla nueva: cambió = lo que se mandaría es DISTINTO de lo que el servidor ya tiene
>
> Módulo PURO **`src/lib/guias/cambios-form.ts`**. Se arma una **instantánea** con EXACTAMENTE los campos que el PUT escribe, en el mismo orden y con la misma normalización que usa `saveGuia` al armar el cuerpo, y se compara contra la instantánea de **lo último que el servidor ya tiene**. Esa referencia se toma UNA vez —con los mismos valores que se acaban de poner en el formulario al cargar la guía— y se renueva con lo que se acaba de mandar cada vez que un guardado **sale bien**.
> - 🔑 **Cargar la guía no puede producir una diferencia contra sí misma**, así que el número de veces que corra el efecto dejó de importar. Es lo que hace que el arreglo no dependa de adivinar por qué corría dos veces.
> - **Sin referencia, NO se afirma un cambio** (`hayCambios(null, x) === false`): mientras la guía no terminó de cargar no hay contra qué comparar, y sin cambio no hay autoguardado. **Al revés con los renglones**: sin referencia SÍ viajan (`renglonesCambiaron(null, x) === true`) — perder un renglón es peor que reescribirlo igual.
> - **`null`, `undefined` y `""` son el MISMO estado** (la base devuelve `cliente_codigo: null` y la pantalla muestra ""), y **el transportista guardado no cuenta mientras el modo sea entrega directa** (el PUT manda `transportista_id: null`). Sin esas dos, el formulario nacería sucio igual.
> - **Una fila en blanco no cuenta**: es el MISMO filtro que ya aplicaba `validItems`, así que tocar "+ Agregar envío" antes de escribir nada no dispara nada.
> - ⚠️ **Un espacio de más SÍ cuenta.** El PUT escribe el texto tal cual: `"David "` y `"David"` son dos filas distintas en la base.
>
> ### 🔑 EL AUTOGUARDADO SE QUEDA — pero solo después de un cambio de verdad
>
> Daniel dijo *"si hace fricción"*, y la fricción era abrir-y-guardar, no guardar. **Bodega despacha desde el celular** y una pestaña que se cierra no puede llevarse los renglones que ya se escribieron; el borrador de `localStorage` es la red de `/guias/nueva`, no la de editar. Lo que sí se recortó es **cuánto** escribe:
> - 🔴 **Los renglones solo viajan cuando cambió un renglón.** Anotar una observación, corregir la fecha o cambiar el transportista **ya no le rota el id a cada línea**: el PUT sale sin `items` y `guia_items` no se toca. Medido sobre el doble: cambiar las observaciones dejó los dos uuid **idénticos**.
> - **El mismo guardado no se reintenta.** Un PUT que el servidor RECHAZA (una guía ya despachada → 400) deja "hay cambios" en true —y está bien, porque de verdad no se guardó—, así que sin freno el temporizador dispararía cada 1,5 s para siempre. Se reintenta recién cuando algo vuelve a cambiar.
> - **"Listo, guardado" sale de un guardado ACEPTADO.** Antes se ponía apenas se disparaba el pedido: una guía despachada mostraba "Listo, guardado" con el servidor contestando 400.
> - ⚠️ **`/guias/nueva` NO cambió**: ahí no hay PUT que pise nada, el borrador de `localStorage` se sigue escribiendo cada 5 s sin mirar esto, y el banner de restaurar sigue igual. Medido en el navegador: abrir `/guias/nueva` = **0 escrituras**, y tras escribir una fila el borrador queda en `localStorage` como siempre.
> - ⚠️ **El candado del PUT sobre una guía despachada y el `PATCH …/cliente` que ata sin mirar el estado NO se tocaron.**
>
> ### La medición, contra el LOG DEL SERVIDOR y con un DOBLE
>
> 🔴 **No se usó ninguna guía real para escribir.** GT-204 ya había pagado dos veces. El doble es **GT-205**, creado y borrado el mismo día (mismo procedimiento que GT-192 el 10-ago), con dos envíos completos.
>
> | | abrir y esperar | tocar una observación | tocar los bultos |
> |---|---|---|---|
> | **ANTES** | **1 PUT** (`200` en el log) · los **dos uuid de `guia_items` ROTARON** (`6cdd457d…`→`40506ebd…`, `20c49d34…`→`078cf5a6…`) | 1 PUT, con `items` | — |
> | **DESPUÉS** | **0 PUT — ni una línea en el log** | 1 PUT **sin `items`** · uuid **intactos** | 1 PUT con `items`, bultos 7→8 guardados |
>
> `BASE=… GUIA=<uuid> [NAVEGACION=suave] [DEJAR_PASAR=1] node scripts/_medir-guias-editar-sin-escrituras.mjs`. **Por defecto ABORTA toda escritura en el navegador**, así que se puede correr contra una guía real sin tocarle un renglón; `DEJAR_PASAR=1` es solo para el doble, y sirve para que el PUT quede en el **log del servidor** y la prueba no dependa de lo que diga el navegador. Mide las tres fases (abrir · cabecera · renglón) **y los cuatro anchos**.
> - 🩸 **GT-204 es un objetivo SEGURO y por eso se midió también ahí:** está `Completada`, y el PUT la rechaza con 400 **antes** de tocar una fila. En el log del servidor: **antes 1 PUT al abrir, después 0**.
> - **Los 3 anchos (+ el iPad acostado), contra el build de producción y con datos de producción:** **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px.** El cambio es de conducta, no de dibujo: lo único que cambia de texto es el rótulo de estado.
> - ⚠️ **Dónde SÍ se reproduce y dónde no, dicho de frente.** En `next dev` (React monta el árbol dos veces) el bug sale **siempre**: abrir = 1 PUT. En un build de producción con red local rápida **no se pudo reproducir** el PUT espontáneo, ni recargando la URL ni entrando por "Cambiar los envíos de esta guía". O sea que el disparo depende de que ese efecto corra una segunda vez, y eso pasa por caminos que cambian con el navegador y la red. **Lo que se retiró es el mecanismo entero**, así que la pregunta de por qué corría dos veces deja de tener consecuencias.
>
> ### Candados
>
> **`src/__tests__/components/guias-editar-no-guarda-sola.test.tsx` (7) MONTA LA PANTALLA REAL** —la página de editar, con su hook— y **cuenta lo que sale por `fetch`**, que es lo único que la base llega a ver. Con `GuiaForm` suelto habría que pasarle a mano el "hay cambios" que calcula el hook, y el candado probaría el mock en vez del producto. Se monta también dentro de `<StrictMode>`, que es la configuración en la que el bug se dispara siempre. Más `src/__tests__/lib/guias-cambios-form.test.ts` (30), sobre los renglones REALES de GT-204.
> - 🩸 **DOS GOTCHAS DE MEDICIÓN, y los dos daban VERDE sin haber mirado nada.** (a) El `fetch` simulado contestaba **al instante**: React nunca llegaba a renderizar con el guardado en curso, así que un autoguardado en bucle se veía igual que uno que dispara una sola vez — el candado del bucle pasaba con la mutación puesta. Ahora el doble del servidor **tarda 60 ms**, como en la vida real (medido: 866-2412 ms). (b) Dejar pasar el tiempo en UN tramo de 3,2 s acumula los cambios de estado hasta el final y produce el mismo espejismo: ahora se avanza en tramos de 100 ms.
> - **Verificado por mutación, 8 de 8 cazadas** (`bash scripts/_mutar-candados-guia-autoguardado.sh`): el formulario vuelve a nacer sucio · sin referencia se declara sucio · los renglones viajan siempre · los renglones no viajan nunca · el autoguardado deja de mirar si hubo cambios · se cae el freno anti-bucle · al cargar no se guarda la referencia · la pantalla dice "Listo, guardado" apenas abre.
> - 🩸 **La restauración del script va por COPIA, no por `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada, así que las mutaciones se apilan y ninguna se prueba por separado. Ya pasó en este repo.


---

## 🔴 UN SOLO SELECTOR DE CLIENTE EN TODO EL SISTEMA — y la salida a mano se llama con todas las letras (17-ago-2026)

> Daniel vio una guía donde alguien **escribió a mano el nombre de un cliente que SÍ estaba en la lista** y el renglón quedó sin atar. Su propuesta, textual: *"que se escriba como un buscador los clientes y solo texto libre si ponen la opción de otros (debería de haber 'un cliente' como otro)"* — *"sin hacer fricción ni complicarlo"*. Y sobre el alcance: ***"sí, todos deben de tener mismo selector, tiene que hacer sentido con el sistema"***.
>
> ### 1. La salida a mano dice que es LA SALIDA
>
> ```
> ANTES                                  AHORA
> Otro — guardar "City Mal" a mano       ➕ No está en la lista — escribir a mano
>                                           Se guarda "City Mal"
> chip del campo:  Otro                  chip del campo:  A mano
> ```
>
> 🩸 **"Otro" a secas SE LEE COMO UN CLIENTE MÁS DEL SISTEMA**, y por eso alguien la tocó sin buscar primero. El rótulo nuevo dice lo que es —la salida, no una opción equivalente— y el texto tecleado sigue a la vista, porque es lo que se va a guardar. El distintivo del campo pasó de `Otro` (ámbar) a **`A mano`**, por lo mismo.
>
> 🔴 **ELEGIR CLIENTE NO SE VOLVIÓ OBLIGATORIO, y no puede volverse.** Es decisión escrita de Daniel y hay un dato que la sostiene: **272 de los 441 renglones (62%) van a un destino que hoy NO existe en el directorio**. Volverlo obligatorio le traba el trabajo a bodega todos los días. **Lo que cambia es que escribir a mano sea DELIBERADO, no un accidente.**
>
> ### 2. La red de seguridad: si escriben a mano algo que SÍ está
>
> ```
> ¿Es Hanna Calzados (D-71)?            ← un solo parecido: se pregunta con todas las letras
> [ Sí, es Hanna Calzados ] [ No, es otro ]
>
> ¿Es alguno de estos?                  ← varios: la lista, con sus avisos
> City Mall Paso Canoa            D-25
> City Mall David                 D-24
> [ No, es otro ]
> Tocar una solo la elige. Nada se guarda hasta que aprietes Guardar.
> ```
>
> 🔑 **NO SE CONSTRUYÓ UN BUSCADOR NUEVO.** El motor ya existía y se REUSA tal cual: `src/lib/clientes/sugerencias.ts` + `SugerenciasCliente.tsx`, el mismo "¿quisiste decir…?" que se usaba al atar clientes en guías viejas. Lo único que cambió es **quién lo dibuja**: ahora lo dibuja **`ClientePicker`**, o sea que aparece en TODAS las pantallas donde se puede escribir un cliente a mano, y no solo en la ventana de atar. Por eso el componente se mudó de `app/guias/components/` a `src/components/`.
>
> **Las reglas del motor NO se tocaron, y hay candado de mutación para cada una:** la sugerencia **NUNCA ata sola** (ni con un único candidato clavado: tocarla solo copia al selector y se escribe recién al apretar Guardar) · **D-201 no se sugiere** (es el duplicado sin respaldo en Switch) · **las diferencias de número se avisan y pesan en el orden** (`Outlet Duty Free N2` y `N3` son tiendas DISTINTAS) · **sin directorio cargado se calla** (decir "no hay ninguno parecido" sin haber podido mirar mandaría a dar de alta un cliente que ya existe).
>
> ⚠️ **El "no hay ningún cliente parecido" SOLO lo dice la ventana "Atar cliente"** (`avisarSinParecidos`), donde la tarea entera es encontrar al cliente. En el formulario de una guía va apagado a propósito: con 272 renglones a destinos que no existen, un cartel por fila sería gritarle a bodega lo que acaba de declarar al elegir "escribir a mano" — la fricción que Daniel pidió no meter. Cuando no hay candidatos, se calla.
>
> ⚠️ **En la ventana de atar, la sugerencia se MUDÓ de arriba del campo a debajo** — es el mismo bloque, ahora dibujado por el selector. Nada se perdió: los candidatos, sus avisos y el mensaje de "no hay ninguno" siguen ahí.
>
> ### 3. El inventario: dónde se elige cliente en todo el sistema
>
> | Dónde | Control | ¿Salida a mano? |
> |---|---|---|
> | Guías › crear/editar (`GuiaForm`) | **ClientePicker** | **SÍ** — bodega despacha a destinos que no existen |
> | Guías › "Atar cliente" | **ClientePicker** (+ avisa cuando no hay parecidos) | SÍ |
> | Cheques › nuevo/editar | **ClientePicker** | SÍ |
> | Marketing › Registrar gasto | **ClientePicker** `permitirOtro={false}` | **NO** — el cliente amarra sí o sí |
> | Marketing › Editar proyecto | **ClientePicker** `permitirOtro={false}` | **NO** (antes era texto libre, ver abajo) |
> | Catálogo › pedidos (detalle, duplicar) | `ClienteSwitchPicker` | otro universo: clientes de **Switch** por empresa, con "Contado" |
> | Catálogo › checkout del carrito | **`ClienteSwitchPicker`** (era una lista propia — unificado el 17-ago-2026, ver abajo) | mismo universo de Switch |
> | Catálogo PÚBLICO › "Tu nombre" | `<input>` libre | **SÍ, a propósito** — el visitante escribe su nombre (#556) |
>
> 🩸 **EL HALLAZGO QUE SE ARREGLÓ: `ClienteTypeahead` (Marketing › Editar proyecto).** Era la SEGUNDA forma de elegir cliente que quedaba en pie, y con `onFreeText`: tecleando cualquier cosa y saliéndose, el proyecto quedaba con `tienda` escrita a mano y `tienda_codigo` VACÍO — en el MISMO campo que "Registrar gasto" ya amarraba con `permitirOtro={false}`. **El componente se BORRÓ** (era su único consumidor). ⚠️ Un proyecto viejo con la tienda a mano NO se rompe: el selector solo cambia el valor cuando alguien ELIGE, así que el texto que ya estaba se conserva y se guarda igual; lo que se cierra es escribir uno NUEVO a mano.
>
> ✅ **EL HALLAZGO QUE QUEDABA, YA UNIFICADO (17-ago-2026, ver el bloque de abajo).** `CheckoutClient` tenía su propia lista de clientes sobre el MISMO universo de Switch que `ClienteSwitchPicker`, con su propia ruta. Se dejó anotado como excepción explícita del candado y Daniel decidió, textual: ***"si unificalo"***. Hoy el checkout **delega en `ClienteSwitchPicker`**, la excepción se quitó del barrido y la ruta paralela se retiró.
>
> ### 4. El candado: un barrido que pone el build ROJO si aparece otro selector
>
> **`src/__tests__/un-solo-selector-de-cliente.test.ts`.** No es una lista de pantallas a revisar a mano —eso caza lo que ya se conoce y no puede cazar lo que alguien escriba mañana—: es un **detector PURO** sobre el código, con tres señales (llamar al motor de búsqueda del directorio · guardar un cliente elegido con un control propio ofreciendo una lista, sin delegar en el selector compartido · un `<datalist>` de clientes) y **excepciones explícitas con el motivo escrito**, más un test que las declara zombis si el archivo ya no existe o dejó de ser un hallazgo.
> - ⚠️ **El barrido BORRA LOS COMENTARIOS PRIMERO** — este repo ya pagó cuatro veces el candado que se cumple con su propia explicación, y este archivo nombra `ClienteTypeahead` y `setCliente(` en su encabezado.
> - 🔑 **El detector se prueba con fuentes SINTÉTICAS**: si solo corriera contra el repo de hoy, un detector roto devolvería cero hallazgos y todo pasaría en verde sin haber mirado nada. Distingue "elegir" de "buscar": un buscador que solo FILTRA una lista (el directorio, la cartera, las ventas) no ata a nadie y no entra.
>
> **Los otros candados, todos de CONDUCTA (renderizan y tocan los botones):** `components/cliente-red-de-seguridad.test.tsx` (12), `guia-cliente-desplegable.test.tsx`, `guias-form.test.tsx`, `guias-sugerencias-cliente.test.tsx` y `marketing-registrar-gasto.test.tsx`.
> - **Verificado por mutación, 11 de 11 cazadas** (`bash scripts/_mutar-candados-selector-cliente.sh`): el rótulo vuelve a "Otro" · el chip vuelve a "Otro" · el selector deja de dibujar la red · la sugerencia ATA SOLA con un único candidato · D-201 vuelve a sugerirse · la diferencia de número deja de avisarse · el "no hay ninguno parecido" se enciende en TODAS las filas · elegir cliente se vuelve obligatorio por defecto · las guías apagan la salida a mano · aparece un segundo selector en el sistema · vuelve `ClienteTypeahead`.
> - 🩸 **La restauración del script va por COPIA, no por `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada, así que las mutaciones se apilan y ninguna se prueba por separado. Ya pasó en este repo.
>
> ### 5. Medición
>
> **Los 3 anchos, en el navegador contra el build de producción y con datos de producción** (`BASE=… node scripts/_medir-selector-cliente.mjs`, solo lectura, nunca toca "Guardar Guía"): **390 · 834 · 1440 → 0 px de arrastre de página, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los dos estados (la lista desplegable con el rótulo nuevo, y la red de seguridad dentro de una fila del formulario). La caja crece **hacia abajo**: 137 px de alto con un candidato y 234-252 con dos. Con el texto real `Hanna Calzado` la pantalla dice **"¿Es Hanna Calzados (D-71)?"** con sus dos botones de 44 px.
> - La ventana de atar, medida con el script de siempre (`_medir-guias-sugerencias-anchos.mjs`) contra una línea REAL sin atar: `City Shoes` → **"¿Es City Shoes (D-35)?"**, 0 px de arrastre, 0 táctiles bajo 44 y 0 textos bajo 12 en los tres anchos.
> - 🩸 **Dos gotchas de medición, y los dos daban verde sin haber mirado nada:** a 1440 el formulario dibuja **los DOS layouts** (tarjeta y tabla) y esconde uno con CSS, así que el primer selector del DOM es el INVISIBLE —hay que quedarse con el visible o se mide una caja de 0×0—; y contar los tocables de TODA la pantalla acusa a este cambio de los campos de 34 px que el formulario usa a propósito en escritorio con mouse (`pointer:fine`, ver `CTRL_BASE`).


---

> ## 🔴 ENTREGA DIRECTA NO LLEVA PLACA NI TRANSPORTISTA — y `tipo_despacho` NO dice cómo sale una guía (14-ago-2026)
>
> Daniel, textual: *«Entrega directa no debería de llevar placa, ya que es directo con nuestro propio camión.»*
>
> 🩸 **EL BUG, Y POR QUÉ UN `??` NO LO ARREGLABA.** `useDespachoGuia` arrancaba con `(g.tipo_despacho as TipoDespacho) || "externo"` y **nunca miraba `modo_entrega`**, que es lo que la persona ya eligió al crear la guía. La trampa: **`guia_transporte.tipo_despacho` tiene DEFAULT `'externo'` en la base**, así que esa rama de respaldo es **inalcanzable** — medido el 14-ago-2026, las **186 guías vivas** traen la columna con valor, incluida la única PENDIENTE (GT-201, sin placa ni chofer). Un `g.tipo_despacho ?? derivado` habría sido un no-op perfecto.
>
> **El daño, medido:** de **51 guías creadas como entrega directa, 50 quedaron grabadas como transportista externo** (la única bien es GT-186). Y seguía pasando: **GT-194, GT-195 y GT-196 (11-ago)** tienen `placa = "0"` y `numero_guia_transp = "0"` —alguien tecleó ceros para poder apretar el botón— y son **las únicas tres placas "0" de toda la base**. El papel firmado salía diciendo `TIPO: Transportista externo · PLACA: 0 · N GUIA TRANSP.: 0`.
>
> ### 🔴 LA REGLA, y las dos mitades importan (`src/lib/guias/modo-despacho.ts`, módulo PURO)
>
> - **Guía SIN despachar → manda `modo_entrega`**, que es lo único que alguien decidió a propósito.
> - **Guía YA despachada (Completada/Rechazada) → manda `tipo_despacho`**, que es lo que realmente pasó y quedó firmado.
>
> ⚠️ **La segunda mitad es la que evita una mentira NUEVA.** Con el botón "Cambiar", alguien puede crear una guía como entrega directa y despacharla con el camión de un tercero. Si `modo_entrega` ganara siempre, ESA guía saldría impresa como "Entrega directa" con una placa ajena al lado: se cambiaría un papel que miente por otro que miente distinto. Hay candado en las dos direcciones.
>
> ### Qué cambió en pantalla
>
> - **El modo arranca en lo que se eligió al crear la guía**, y **no se vuelve a preguntar: se MUESTRA, con un "Cambiar" al lado.** Preguntarlo de nuevo con "Transportista externo" preseleccionado es lo que produjo las 50 guías mal grabadas.
> - **En entrega directa NO se piden placa ni N° de guía del transportista.** No son "opcionales": no existe un transportista. **Se esconden.** Cuando eran opcionales pero visibles, alguien tecleó "0" en los dos.
> - **Y tampoco se ESCRIBEN**: el despacho manda `placa: ""`, `numero_guia_transp: ""` y limpia el número de cada línea. **Se mandan vacíos a propósito, no se omiten** — omitirlos dejaría pegada la placa de un tercero si alguien empezó en modo externo y después tocó "Cambiar".
> - **Las MISMAS palabras en las dos pantallas.** Al crear decía "Transportista" y al despachar "Transportista externo". Fuente única: `ETIQUETA_TIPO_DESPACHO`. Gana "Transportista externo" porque ya es lo que dicen el papel, el PDF, la lista y la ficha — y "externo" es justo lo que lo distingue de nuestro camión.
> - **Los DOS papeles dicen la verdad**: `PrintDocument.tsx` y `pdf-guia.ts` derivan el modo del mismo módulo, y en entrega directa no imprimen PLACA, ni el N° de la cabecera, ni la columna "N GUIA TRANSP." de la tabla.
> - 🔴 **Un "0" pelado se trata como vacío EN EL PAPEL** (`sinCeroPelado`). No toca la base: ninguna placa de Panamá es "0", e imprimirlo en un documento que alguien firma es afirmar algo falso. **Nada que CONTENGA un 0 se pierde** (`EK0700`, `TR-0`, `00` quedan intactos) — hay candado.
>
> ⚠️ **LAS 50 GUÍAS YA GRABADAS MAL NO SE TOCAN.** Son Completada con `tipo_despacho='externo'` y su papel las sigue mostrando así: reinterpretarlas es otra decisión de Daniel. Lo único que se limpia en su papel es el "0".
>
> ### 🔴 La dirección del cliente, como PRIMERA OPCIÓN
>
> Daniel, textual: *«Ponerla sola, pero sí como primera opción.»* — **aparece arriba de todo en la lista de sugerencias; NO se escribe sola en el campo**, y el campo sigue editable. `src/lib/guias/direccion-sugerida.ts` devuelve una LISTA y no expone ningún "elegido" del que alguien pueda deducir un auto-completado.
>
> **Medido contra producción (491 envíos vivos, 200 guías desde el 25-mar):** 380 envíos atados a un cliente del directorio · **47 clientes atados, 37 con UNA SOLA dirección** en toda su historia · *"la anterior acierta"* **267/333 = 80,2%** · 78 direcciones distintas (Paso Canoas 192 · David 98 · Santiago 26 · Changinola 21 · Guabito 11).
>
> ⚠️ **ESTO NO APLICA A LA EMPRESA, y está medido con el mismo método: acierta 114/333 = 34,2%.** Autocompletarla metería el dato equivocado en dos de cada tres envíos. La empresa es POR ENVÍO. Hay candado que impide que la ruta empiece a devolverla.
> - **Solo por `cliente_codigo`**, no por nombre a mano: por nombre normalizado el acierto baja a 67,2%.
> - **"Última" es cronológica**, y `guia_items` no tiene fecha propia: se ordena por la `fecha` de la GUÍA y se desempata por `numero` (correlativo). Ordenar por `id` sería ordenar por un uuid.
> - Viaja en `/api/guias/frecuencias` (campo `direcciones`), **sin consulta nueva de ítems**: se le agregaron columnas a la lectura que ya existía, más una lectura de ~200 guías para tener la fecha.
>
> ### El botón de la fila dice «Despachar»
>
> **185 de las 186 guías terminaron despachadas.** Despachar es *la* acción del día para bodega; editar es el camino secundario y vive un nivel más adentro ("Cambiar los envíos de esta guía"). En "Pendiente Bodega" el botón dice **Despachar** con un camión; en los demás estados sigue diciendo **Editar** con el lápiz. ⚠️ **Sigue siendo UN SOLO botón** (un solo `onEdit`): lo que Daniel pidió sacar era tener "Despachar" Y "Editar" uno al lado del otro, y eso no se aflojó.
>
>
> ### 🔴 LA MEMORIA DE LA GUÍA: los juegos MÁS FRECUENTES de este transportista
>
> Daniel: *«Si quiero»* a recordar placa y cédula por transportista, y después precisando cómo: *«normalmente mandamos con las mismas 3/4 compañías. Y los que varían a veces son los choferes. **Que tenga memoria guía para mostrar los más frecuentes.**»*
>
> Al despachar con transportista externo se ofrecen **los 3 juegos más usados** (recibido por + cédula + placa) **con ESE transportista**; **un toque llena los tres** y quedan editables.
>
> 🔴 **LOS MÁS FRECUENTES, NO LOS ÚLTIMOS — y no es un matiz.** Medido sobre las 185 guías despachadas de producción (14-ago-2026), ordenar por frecuencia da un resultado **DISTINTO** que ordenar por fecha **en los 6 transportistas**. El caso más claro es Boston: el juego que se usó **10 veces** (`Eric · 8-930 · Ek0700`) **no** es el de la guía más reciente. En Transporte Sol, `Nicolás guillen · 172744 · 961885` se repite **7 de 12 veces**.
>
> 🩸 **NORMALIZAR PARA AGRUPAR ES LA MITAD DEL VALOR: sin eso, el más usado aparece PARTIDO y ninguno llega arriba.** Medido:
> - un mismo juego de RedNblue está escrito de **4 formas**: `Jocsan murillo · 8918246 · DG7115` + `Jocsan murillo · 8-918-246 · DG7115` + `Jocsan · 8-918-246 · DG7115` + **`Jocnsa · 8918246 · Dg7115`** (un tipeo)
> - uno de Sanjur, también de 4: `Elaeric Sanjur` / `Adrián sanjur` / `Adrian sanjur` / `Elaeric sanjur`, los cuatro con cédula `9-764-2287`
> - `Nicolás guillen · 172744 · 961885` ×3 + `… · 1-727-44 · 961885` ×3 + `Nicolas · 172744 · 961885` ×1 → es **UN juego de 7**, no tres de 3/3/1
> - las cédulas: **72 valores crudos → 52** agrupados · los receptores 69 → 59 · las placas 56 → 47 (`DG7115`+`Dg7115`, `EL6433`+`El6433`, `Ek7003`+`EK7003`…)
>
> 🔑 **LA IDENTIDAD DE UN JUEGO ES LA CÉDULA + LA PLACA, NO EL NOMBRE.** `Jocsan murillo`, `Jocsan` y `Jocnsa` son la misma persona, y **ninguna** normalización de mayúsculas/tildes/guiones los junta: son textos distintos. Lo que sí los junta es el documento de identidad.
>
> ⚠️ **SE MUESTRA LA FORMA MÁS USADA, Y ES UN VALOR ORIGINAL.** De las formas del juego se ofrece la que más veces se escribió (desempata la más reciente): en Boston gana `Eric` (10) sobre `Erick` (1). **Nunca se ofrece el valor normalizado** — inventar `JOCSAN MURILLO` estrenaría una forma MÁS de escribir lo mismo, que es justo lo que esto vino a evitar. El botón dice cuántas veces (`· 10 veces`), y con una sola no dice nada.
>
> - Solo de guías **ya despachadas** y solo juegos **completos** (el valor es llenar los tres de un toque). **En entrega directa no aparece** — no hay transportista ni placa.
> - `GET /api/guias/despachos-frecuentes?transportista=<uuid>`, acotada en el servidor y **fail-ABIERTA**: si falla, los campos se escriben a mano como siempre. 🔴 **Se trae TODA la historia del transportista, no una ventana**: contar frecuencias sobre las N más recientes daría un "más usado" que depende de dónde se corte — o sea ordenar por fecha disfrazado. El más cargado tiene 47 guías.
>
> ⚠️ **LO QUE ESTO NO ARREGLA, Y NO DEBE INTENTAR:** en la columna de texto vieja conviven **`Boston` ×19 y `C. BOSTON` ×9** — la misma empresa escrita de dos formas. La normalización **no** los junta (`BOSTON` ≠ `C. BOSTON`) y está bien que no lo haga: juntarlos pide adivinar por prefijo, que es lo que este repo tiene prohibido con nombres (la lección de `Outlet Duty Free N2` vs `N3`). Además no afecta a esto: los juegos se agrupan por `transportista_id` —el catálogo tiene **6 filas**— y no por ese texto. **Es un arreglo de datos en Switch, y es decisión de Daniel.**
>
> 🩸 **REGISTRO DE UN ERROR MÍO, para que nadie lo lea al revés en el historial de git.** Esta funcionalidad se construyó (#554), se **revirtió por error** (#555) y se restauró (#556). El revert estuvo MAL: al releer el encargo original —que decía *"Daniel dijo NO explícito"*— concluí que la había construido sin permiso y que había inventado las estadísticas, y lo escribí así en el commit y en el PR. **Las dos cosas eran falsas**: Daniel había cambiado de opinión en un mensaje posterior (*«Si quiero»*) y los datos me los habían pasado medidos. **La lección no es "no auditarse": es que una confesión falsa cuesta lo mismo que un dato falso.** Antes de escribir "inventé esto" y borrar código aprobado, hay que correr la consulta y comprobarlo — acá era UNA consulta, y es la que produjo todos los números de arriba.
>
> **Candados:** `guias-juegos-despacho.test.ts` (30, **todos los fixtures son valores REALES de producción**, con las 4 formas de RedNblue y el caso de Boston donde frecuencia ≠ fecha) y `components/guias-direccion-y-juegos.test.tsx`, que **pinta la pantalla** y verifica que el más usado quede primero. Diagnóstico read-only: `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-juegos-frecuencia.ts`.
> ### Medición y candados
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con datos de producción** (`BASE=… GUIA_PENDIENTE=… node scripts/_medir-guias-entrega-directa.mjs`, solo lectura, **nunca toca "Despachar"**): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página y 0 textos bajo 12 px** en los 20 casos (lista con la pendiente abierta · guía con transportista · la misma cambiada a entrega directa · los renglones con el cliente atado · guía nueva). Los recortes y los blancos táctiles que quedan son **PRE-EXISTENTES**: los 8 px del `-mx-2` de `SignatureCanvas`, el `w-40 truncate` del resumen de la fila, el input de búsqueda de 39 px y los campos densos de `pointer:fine` en escritorio. El script **falla** si no encuentra el botón "Despachar", el bloque de los juegos más usados, la explicación de la entrega directa o la dirección sugerida primera.
> - 🩸 **Gotcha de medición, y daba verde sin haber mirado nada:** el encabezado del bloque de juegos lleva `uppercase` **por CSS**, así que `innerText` lo devuelve en MAYÚSCULAS y compararlo tal cual daba SIEMPRE `false` — o sea que el chequeo de "los juegos NO aparecen en entrega directa" habría pasado con el bloque a la vista.
>
> **Candados:** `guias-modo-despacho.test.ts` (17 + el PDF **generado de verdad** y leído), `guias-direccion-sugerida.test.ts`, `guias-juegos-despacho.test.ts`, **`guias-frecuencias-ruta.test.ts`** (llama al handler REAL) y **dos de CONDUCTA que PINTAN la pantalla**: `components/guias-entrega-directa.test.tsx` y `components/guias-direccion-y-juegos.test.tsx`.
> - 🩸 **Dos candados de texto pasaban en verde con la mutación puesta, y los dos por lo de siempre: leían sus propios comentarios.** El barrido de `guia-pdf-compartir` veía `g.tipo_despacho` dentro de la nota que documenta que el papel DEJÓ de mirarlo, y exigía al PDF dibujar un campo que ninguno de los dos dibuja ya. Y sacarle la placa al PDF, o sacar `direcciones` del `return` de la ruta, **no ponía rojo NADA**. Por eso los barridos borran los comentarios primero, el PDF se genera y se lee, y la ruta se ejecuta.
> - **Verificado por mutación, 29 de 29 cazadas** (`bash scripts/_mutar-candados-guias.sh`): el modo vuelve a salir de `tipo_despacho` · `modo_entrega` gana siempre y le pisa la historia a una despachada · sin `modo_entrega` inventa una directa · el "0" vuelve a imprimirse · `sinCeroPelado` se come cualquier cosa con un 0 · la hoja y el PDF vuelven a imprimir PLACA en directa · el PDF se separa del papel · vuelve a pedir placa o N° de transportista en directa · vuelve a PREGUNTAR el modo · el despacho vuelve a mandar la placa · el alta vuelve a decir "Transportista" · el botón vuelve a decir "Editar" con la guía pendiente · la dirección deja de ir primera · la sugerencia se ESCRIBE SOLA · la última dirección sale de la guía más vieja · la ruta deja de mandar las direcciones · la identidad del juego vuelve a ser el nombre · los juegos dejan de normalizar guiones y mayúsculas · se ordenan por fecha en vez de por frecuencia · se ofrece la forma menos usada · entran juegos de guías que no salieron · entran juegos incompletos · se guarda el valor normalizado · los juegos aparecen en entrega directa · la ruta deja de acotar por transportista · la ruta cuenta sobre una ventana de las N más recientes.
>
> **Diagnóstico read-only contra producción:** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-entrega-directa.ts`.


---

> ## 🔴 LAS OBSERVACIONES SE LEEN DONDE SE CARGA EL CAMIÓN (14-ago-2026)
>
> La observación se escribe al crear la guía y **no aparecía en `/guias/[id]`, la pantalla donde se despacha**: vivía solo en el acordeón de la lista y en el papel impreso, así que quien carga el camión tenía que volver a la lista y abrir la guía ahí para leerla. **El dato ya viajaba a esa pantalla — solo no se dibujaba** (`GET /api/guias/[id]` hace `select("*")`).
>
> **Va pegada a los envíos y ARRIBA de los campos que se llenan al despachar** (placa, recibido por, cédula): se lee antes de trabajar, no después. Hay candado de posición en las dos direcciones.
>
> **El nombre es «Observaciones».** Daniel, textual: *«Nota de entrega sí cambia a observaciones»* — 🩸 se lo habían mockeado como «Nota de entrega» y **corrigió**: no es un campo de dirección.
>
> ### 🔑 EL DISEÑO SALIÓ DE MEDIR EL CAMPO, NO DE SUPONERLO
>
> Medido contra producción el 14-ago-2026 (`scripts/_diag-guias-observaciones.ts`, solo lectura) sobre las **186 guías vivas**:
> - **36 notas de trabajo reales** · **96 guías sin nada** · **54 con el texto administrativo** *"Cerrada en bloque el 3-ago-2026…"*
> - **mediana 32 caracteres · la más larga 83** (GT-137) · **máximo 2 líneas**, y una sola nota tiene salto de línea
> - o sea: **es texto CORTO y variado, no un párrafo.** Se lee de un vistazo y **no se trunca** (`whitespace-pre-wrap break-words`, sin `truncate` ni `line-clamp`). Hay candado que lee las clases del DOM.
>
> **Qué dicen de verdad** — el campo está haciendo **tres trabajos**: qué va adentro del bulto (`"Keriddine son muebles"`, `"1 TANQUE DE PINTURA PARA AMERICAN CLASSICS"`, `"NOVA LUX 17 PANELES - PLAZA LOS ANGELES 3 MUEBLES DE CALVIN KLEIN"`), dónde entregar (`"TIENDA 9 ALBROK MALL PASILLO DEL DELFIN"`, `"Pasillo del dinosaurio"`) y **quién retira** (`"RETIRO EN BODEGA POR PARTE DEL CLIENTE."`, `"EL CLIENTE RETIRA EN BODEGA"`, 2 guías).
>
> 🔑 **HALLAZGO PARA DANIEL, NO CONSTRUIDO: ese tercer uso es un MODO DE ENTREGA que no tiene campo propio** y por eso se escribe en la nota. Hoy esas dos guías salen con un transportista que no existe. **Es decisión de negocio** — no se construyó nada.
>
> ### Lo que NO hace
>
> - ⚠️ **Si la guía no tiene observación, NO se dibuja nada.** Nada de una caja vacía diciendo "sin observaciones": son **96 de 186**. Texto de solo espacios cuenta como vacío.
> - ⚠️ **Es de SOLO LECTURA acá.** La observación se edita donde se editaba; esta pantalla la muestra, no la cambia. Candado: dentro de la caja no puede haber `input`, `textarea` ni `button`.
> - ⚠️ **Se muestra TAL CUAL está guardada.** Hay basura en el campo (**GT-124 = `"|"`**, **GT-001 = `"S1373259"`**) y **no se filtra ni se "limpia"**: limpiar datos es decisión de Daniel. Hay candado — un `replace` que se coma la basura pone el build rojo.
> - **También se ve en una guía YA despachada**, que es donde viven las 36 notas reales (las 36 son de guías `Completada`).
>
> ### Medición y candados
>
> **Los 3 anchos (+ el iPad acostado), en el navegador contra el build de producción y con guías REALES** (`BASE=… node scripts/_medir-guias-observaciones.mjs`, solo lectura, **nunca toca "Despachar"**): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 recortados, 0 blancos táctiles bajo 44 px y 0 textos bajo 12 px** en los **20 casos** (GT-137 la más larga · GT-188 Nova Lux · GT-194 corta · GT-124 la basura · GT-201 sin nota). La caja **crece hacia abajo**: 98 px de alto a 390 con la nota más larga (2 líneas) y 77 px cuando entra en una. Los 3 recortes de GT-201 son los 8 px del `-mx-2` de `SignatureCanvas`, **PRE-EXISTENTES** (solo salen ahí porque es la única guía pendiente, o sea la única que dibuja las firmas). El script **falla** si la caja no aparece donde debe, si el texto no coincide carácter por carácter, si sale cortado, si es editable, o si aparece en la guía sin observación.
> - 🩸 **Gotcha de medición, el de siempre:** el rótulo lleva `uppercase` **por CSS**, así que `innerText` lo devuelve en MAYÚSCULAS y compararlo tal cual da SIEMPRE `false` — el chequeo pasaría en verde sin haber mirado nada.
>
> **Candado: `src/__tests__/components/guias-observaciones-despacho.test.tsx` (16).** **RENDERIZA la página real y lee el DOM** — un barrido de texto sobre el archivo se cumple con su propio comentario, que en este repo ya falló cuatro veces. Los fixtures son las notas REALES de producción.
> - **Verificado por mutación, 6 de 6 cazadas** (dentro de `bash scripts/_mutar-candados-guias.sh`, que sube a **35 de 35**): la observación deja de dibujarse · se dibuja la caja aunque no haya observación · el texto se trunca a una línea · vuelve el rótulo «Nota de entrega» · la pantalla filtra la basura · la observación se vuelve editable acá.
>
> **Diagnóstico read-only contra producción:** `DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/_diag-guias-observaciones.ts`.


---

## 🔴 Guías — UNA SOLA LISTA DE ENVÍOS, bodega corrige ahí mismo, y el N° del transportista deja de bloquear (17-ago-2026)

> El flujo, con las palabras de Daniel. **La secretaria, en la mañana:** crea la guía (transportista + envíos) y **la imprime — ese papel se lo lleva el chofer**. **Bodega, cuando llega el camión** (desde el celular de quien entrega o el iPad de la empresa): abre la guía, **corrige lo que esté mal**, pone placa / quién recibe / cédula, escribe el número del transportista **si lo tiene**, firman los dos, y **Despachar**.
>
> Textual sobre bodega: *"la parte de bodega es firmar más que nada para que quede registrado, y si hay algún cambio que hacer por error por ejemplo nombre, dirección, cantidad de bultos, que lo pueda arreglar"* · *"bodega puede corregir"* · *"a veces el transportista lo da, a veces no"*.
>
> ### 1. 🩸 LOS 7 ENVÍOS APARECÍAN DOS VECES EN LA MISMA PANTALLA
>
> Una vez en el bloque `ENVÍOS` (solo lectura) y otra vez COMPLETOS —cliente, dirección, empresa y bultos— dentro de `N° DE GUÍA DEL TRANSPORTISTA · UNO POR LÍNEA`, cada uno en su cajita. Había que bajar por la misma lista dos veces.
>
> **Ahora es UNA lista** (`src/app/guias/components/ListaEnvios.tsx`): cada renglón dice cliente · dirección · empresa · facturas · bultos **y trae su caja del N° del transportista ahí mismo**, con su botón "Corregir" al lado.
>
> **Medido en el navegador contra el build de producción y CONTRA `origin/main`**, con una guía de 7 envíos (`BASE=… ETAPA=antes|despues node scripts/_medir-guias-lista-unica.mjs`, solo lectura):
>
> | | 390 px | 1440 px |
> |---|---:|---:|
> | antes (`origin/main`) | **3.392 px** de alto | 2.753 px |
> | después | **2.596 px** | 1.996 px |
> | | **−796 px (−23%)** | −757 px (−27%) |
>
> Y cada cliente pasa de aparecer **2 veces a 1** (medido contando los nodos de texto, no a ojo). **0 px de arrastre, 0 tocables bajo 44 px y 0 textos bajo 12 px** en los dos anchos, antes y después.
> - ⚠️ **El rótulo `N° GUÍA TRANSPORTISTA` de cada renglón pasó a `sr-only` + placeholder.** Repetido 7 veces sumaba **154 px** —media pantalla de celular— y arriba de la lista ya está explicado. Quien no ve la pantalla lo sigue teniendo.
> - 🩸 **Gotcha de medición:** "ENVÍOS" aparece **dos veces** en la pantalla y siempre lo hará — el segundo es el rótulo del CONTADOR en la tarjeta de arriba. El recorte hay que anclarlo a la caja que tiene la `<ul>` adentro, si no se mide la tarjeta equivocada.
> - 🩸 **Y no hay ninguna guía pendiente en producción** (las 187 están Completadas), así que la guía de 7 envíos es un **DOBLE**: se intercepta `GET /api/guias/<id>` y **se aborta cualquier pedido que no sea GET**. No se fabricó ni se despachó una guía real.
>
> ### 2. 🔴 BODEGA CORRIGE SIN SALIR DE LA PANTALLA — y corregir un campo NO reemplaza la lista
>
> Antes, arreglar un nombre, una dirección o los bultos obligaba a irse a `/guias/[id]/editar` y volver. Con el camión esperando, eso es tiempo. Ahora "Corregir" abre el renglón ahí mismo (cliente, dirección, empresa, bultos, facturas) y **Guardar cambios** lo escribe.
>
> ⚠️ **`items` en el PUT es un REEMPLAZO COMPLETO**: borra todos los renglones e inserta otros nuevos, o sea **les cambia el id**, y eso *"tiraría el trabajo de atar clientes"*. Por eso la corrección va por **`PATCH /api/guias/[id]/item`**, que escribe **los campos tocados de UNA fila** con `.eq("id", itemId).eq("guia_id", id)` — el resto de los renglones ni se lee. Mismo mecanismo que ya usaba `items_guia_transp`.
> - **Solo los campos que vinieron.** Un cuerpo con `{ bultos: 5 }` escribe `bultos` y nada más: mandar el objeto entero borraría la dirección con un `""` que nadie escribió (el error de `items`, en chico). Regla en `src/lib/guias/correccion-item.ts` (módulo PURO).
> - 🔴 **EL CANDADO DE LA GUÍA YA DESPACHADA SIGUE INTACTO**, y acá es al revés que en `/api/guias/[id]/cliente`: ese endpoint no mira el estado a propósito (atar un cliente no es editar el despacho, y el 98% de las guías está cerrada). Esto SÍ cambia el despacho, así que una **Completada** se rechaza con el MISMO mensaje que el PUT.
> - **El cliente se elige con `ClientePicker`, el único selector del sistema.** Un `<input>` libre acá sería estrenar el segundo selector el día después de que se retirara el último (#567). La empresa va por `<select>` cerrado a las 8 del grupo **más el valor sucio que esa línea ya tenía** (una guía vieja se corrige en otro campo sin pelear).
> - **El código del cliente pasa por la puerta única** (`leerClientesDelGrupo` + `validarCodigoParaAtar`): un `D-XXX` que no existe, o un código de Boston, se rechazan. Desatar guarda **NULL**, nunca `""`.
> - **Las escrituras que no cambian nada no se hacen** (`hayCambioReal`).
> - **El camino viejo NO se perdió**: "Cambiar los envíos de esta guía" sigue llevando a `/guias/[id]/editar` para AGREGAR o QUITAR renglones.
> - **Los bultos de la cabecera se suman de los renglones, siempre**, para que el total se mueva con la corrección (`guia_transporte` no tiene columna de total; el listado ya la calculaba igual).
>
> ### 3. 🔴 EL N° DEL TRANSPORTISTA DEJA DE BLOQUEAR — y lo que SÍ bloquea no se aflojó
>
> | campo | ¿bloquea? |
> |---|---|
> | **N° de guía del transportista** | **NO** — *"a veces el transportista lo da, a veces no"* |
> | Placa (salvo entrega directa) · quién recibe · cédula | **SÍ** |
> | **Las dos firmas** | **SÍ** |
>
> 🔴 **LAS FIRMAS Y LOS TRES CAMPOS NO SE TOCARON, y no es negociable.** Cuando nada bloqueaba se cerraron **65 guías sin firma**; el bloqueo se puso el 10-ago-2026 y desde entonces son **0 de 15**. Preguntado explícito, Daniel: *"Placa · quién recibe · cédula debería de bloquear no?"* — sí.
> - **Se sacó de LOS DOS lados a la vez**: del módulo puro (`falta-para-despachar`) y del PUT. Si el servidor lo siguiera pidiendo, el botón se pondría verde y el PUT rechazaría igual — peor que el botón apagado.
> - 🔑 **`EstadoDespacho` ya no RECIBE los números, y su ausencia ES el candado**: mientras vivieran adentro, volver a exigirlos era agregar dos líneas. Para saber si quedó pendiente está `pendienteNumeroTransp`, que es otra pregunta y otra función.
> - **Lo que falta queda MARCADO** (`guiaSinNumeroTransp`, en `modo-despacho.ts`): chip ámbar **"Falta N° transportista"** en la lista de guías (escritorio y celular) y una línea en la guía abierta. Mira lo mismo que imprime el papel — el modo EFECTIVO, el `"0"` pelado como vacío, y la herencia línea → cabecera. **Una guía PENDIENTE no se marca** (todavía se está llenando) y **en entrega directa nunca** (no hay transportista a quien pedírselo).
> - 🔴 **NO se ofrece anotarlo desde la guía despachada, y es a propósito**: esa guía está cerrada a edición y ese candado no se toca. **Abrirle una puerta de escritura a una guía firmada es decisión de Daniel** — queda anotado, no construido.
>
> ### Lo que NO se tocó
>
> **Una sola puerta al despacho** (la lista no despacha, ni por swipe ni por formulario) · **el candado de la guía YA DESPACHADA** y que **atar cliente vaya por su propio endpoint sin mirar el estado** · **el papel impreso** (`HojaEscalada` + `PrintDocument` + `pdf-guia`: el encabezado solo anuncia un N° cuando hay UNO SOLO, el `"0"` pelado se trata como vacío, y en entrega directa no se imprimen placa ni transportista) · **"Los que más usa este transportista"** · **la empresa por envío, no por guía**.
>
> ### Candados
>
> `src/__tests__/lib/guias-numero-transp-no-bloquea.test.ts` (16), **`src/__tests__/components/guias-lista-unica-envios.test.tsx` (8, RENDERIZA la página real con el hook real y toca los botones)** y **`src/__tests__/api/guias-corregir-item-route.test.ts` (17, LLAMA al handler y mira qué se escribió)**.
> - 🩸 **Ninguno busca texto en un archivo para lo que importa.** Que la lista quedó una sola no lo puede ver un barrido —y en este repo esos barridos ya pasaron **estando mutados** cuatro veces, porque el comentario que explica el cambio contiene el texto que el barrido busca—; los pocos barridos que quedan **borran los comentarios primero**.
> - **Verificado por mutación, 9 de 9 cazadas** (`bash scripts/_mutar-candados-lista-envios.sh`): el N° vuelve a bloquear el botón · el servidor vuelve a exigirlo · lo que falta deja de marcarse · la caja del N° desaparece del renglón · corregir vuelve a mandar `items` por el PUT · se puede corregir una guía YA despachada · la corrección pisa los campos que nadie tocó · el UPDATE deja de acotar a las líneas de ESTA guía · vuelve la segunda copia de la lista.
> - 🩸 **El script de mutación restaura por COPIA, no con `git checkout`**: hay archivos NUEVOS en la rama y git aborta el comando entero sin restaurar nada, así que las mutaciones se apilarían y ninguna se probaría por separado. Ya pasó en este repo.
> - **Candados que CAMBIARON DE DIRECCIÓN**: `guias-placa-entrega-directa.test.ts` exigía `tipo_despacho === "externo" && !numero_guia_transp` en el servidor —o sea, fijaba justo lo que Daniel pidió sacar— y `guias-despacho-una-sola-puerta.test.ts` exigía que faltando todos los números el botón se apagara.


---

## 🔴 Guías — LA EXCEPCIÓN: el N° del transportista SÍ se anota en una guía ya despachada (18-ago-2026)

> Daniel, al aprobar lo de arriba, textual: ***"si publicalo y hazle la excepcion para ese numero"***.
>
> **El problema que quedaba abierto.** Desde el 17-ago el número **no bloquea** el despacho —*"a veces el transportista lo da, a veces no"*—, así que hay guías que salen sin él y quedan con el chip ámbar *"Falta N° transportista"*. Una marca que nadie puede apagar es una marca inútil: la guía queda cerrada y el número, cuando llega, no tenía dónde entrar.
>
> ### 🔑 EL MOLDE ES `PATCH /api/guias/[id]/cliente`, Y SE COPIA — no se inventó uno nuevo
>
> Ese endpoint existe **precisamente por esto**: **174 de 177 guías vivas están Completada**, el PUT las rechaza, y anotar un dato sobre un renglón **no es editar el despacho**. `PATCH /api/guias/[id]/numero-transp` aplica el mismo criterio, palabra por palabra:
> - **UNA columna** (`guia_items.numero_guia_transp`) **de UNA línea**, acotada con `.eq("id", itemId).eq("guia_id", id)` — sin el segundo, el id de cualquier renglón del sistema serviría para escribirle encima;
> - **el estado ni se mira**: no es una condición. Comprueba que la guía exista y no esté borrada, y nada más;
> - **no escribe en `guia_transporte`**, ni siquiera el N° de la cabecera;
> - **queda quién y cuándo**: `activity_log` con `guia_item_numero_transp`, el usuario, el rol, el valor viejo y el nuevo — el mismo patrón que usa `…/cliente` para atar un cliente sobre una guía cerrada.
>
> 🔴 **EL CANDADO DEL PUT NO SE TOCÓ.** En una guía Completada siguen bloqueados **bultos, facturas, empresa, dirección, el cliente escrito, placa, receptor, cédula, firmas y estado** — el PUT, el PATCH de la guía y `/api/guias/[id]/item` (la corrección de bodega, que SÍ mira el estado, al revés que éste) los rechazan igual que antes. La excepción es **una sola** y el candado lo prueba: el único `.update({…})` del archivo nombra `numero_guia_transp` y nada más.
>
> ### 🔴 UN "0" NO SE PUEDE GUARDAR, y no es una manía
>
> El papel trata el `"0"` pelado como vacío (`sinCeroPelado`) y la marca ámbar también. Si se dejara escribir, la pantalla diría *"guardado"* y el aviso de que FALTA el número seguiría ahí — **una pantalla que se contradice a sí misma**. Se dice con todas las letras: *"Un 0 no es un N° de guía. Déjalo vacío si el transportista no dio ninguno."* ⚠️ **Nada que CONTENGA un cero se pierde**: `EK0700`, `TR-0` y `00` se guardan tal cual. Regla en `src/lib/guias/numero-transp-tarde.ts` (módulo PURO). **Borrarlo sí es válido**: alguien pudo anotar el número equivocado.
>
> ### El papel sigue diciendo la verdad
>
> Completar un número tarde **no rompe las dos reglas del impreso**, y hay candado para las dos: con **una sola** línea completada el encabezado la anuncia (hay un solo número en la guía — es exactamente lo que pasa hoy al despachar llenando una sola línea); al completar una **segunda distinta**, el encabezado **se calla**. Cada línea imprime el suyo y la vacía no hereda el del vecino.
>
> ### En pantalla
>
> - En la guía despachada, cada renglón tiene **"Anotar el N°"** al lado del número (o **"Cambiar el N°"** si ya tiene uno). Un toque abre **UN campo** y un botón, con el pie *"Es lo único que se puede cambiar de una guía ya despachada."*
> - **El aviso ámbar se apaga solo** al guardar, sin recargar. En `/guias` también: por eso el listado ahora **lee `guia_items.numero_guia_transp`**.
> - 🩸 **Sin ese campo en el SELECT del listado, el chip no se apagaría NUNCA.** La cabecera `guia_transporte.numero_guia_transp` **no se reescribe** al anotar tarde (este endpoint toca UNA columna de UNA línea), así que el listado tenía que mirar las líneas. Es un TEXT corto; las firmas base64 siguen fuera.
> - **En entrega directa no se ofrece**: no hay transportista a quien pedírselo. Y **vendedor no lo ve**: es escritura.
>
> **Los 3 anchos, medidos en el navegador contra el build de producción** (`BASE=… node scripts/_medir-guias-anotar-numero.mjs`, solo lectura): **390 · 834 · 1440 → 0 px de arrastre, 0 recortados, 0 tocables bajo 44 px y 0 textos bajo 12 px**, en los tres estados (aviso / renglón abierto / número guardado). En los tres anchos se midió además que el aviso ámbar **se apaga** al anotar, que el renglón abierto tiene **exactamente 1 campo**, y que **no hay ni un "Corregir" ni un campo del despacho** en la guía cerrada.
> - 🩸 **La guía despachada sin número es un DOBLE.** Se intercepta el GET y **se aborta todo lo que no sea GET**; el PATCH del N° lo contesta el propio script y nunca sale al servidor. No se escribió sobre ninguna guía real.
> - 🩸 **Gotcha que costó una vuelta:** el `-mr-2` del botón para pegarlo al borde **desbordaba 8 px** el contenedor — 7 elementos recortados en los tres anchos. Salió en la medición, no a ojo.
>
> ### Candados
>
> `src/__tests__/api/guias-numero-transp-tarde-route.test.ts` (17, **llama al handler y mira qué se escribió**) y `src/__tests__/components/guias-anotar-numero-tarde.test.tsx` (10, **renderiza la página real y toca los botones**), más 7 casos nuevos en `guias-numero-transp-no-bloquea.test.ts`.
> - **Verificado por mutación, 10 de 10 cazadas** (`bash scripts/_mutar-candados-numero-transp-tarde.sh`): el endpoint escribe también los bultos · el UPDATE deja de acotar a las líneas de ESTA guía · se puede guardar un "0" pelado · se rechaza cualquier número que contenga un cero · la pantalla deja de ofrecerlo · se ofrece en entrega directa · se cuela un segundo campo en el renglón abierto · la corrección de bodega deja de mirar el estado · el listado deja de leer el número por línea · guardar no apaga el aviso ámbar.



---

## 🔴 Guías — «EDITAR» ABRE EL MISMO FORMULARIO CON EL QUE SE CREÓ LA GUÍA (23-ago-2026)

> Daniel, textual: ***"veo algo raro en guias, al editar una, tengo que poner despachar para editar en vez de editar, quiero botón de editar y que se me abra la guía para editar así mismo como si estuviese haciendo la guía, no algo diferente"***.
>
> 🩸 **Para corregir una guía pendiente había que entrar por «Despachar»** —que lleva a `/guias/[id]`, una pantalla DISTINTA de la del alta— **y desde ahí tocar *"Cambiar los envíos de esta guía"*, o sea un nivel MÁS adentro y a una tercera pantalla.**
>
> **Ahora el botón dice «Editar» y el formulario se abre ACÁ MISMO, sin cambiar de URL**: es literalmente el `GuiaForm` de `/guias/nueva`, con la fecha, el modo, el transportista, quién despacha, los envíos (agregar y quitar incluidos) y las observaciones editables. Y **«Despachar» sigue en ESTA misma pantalla**, debajo.
>
> ### 🔑 NO SE CONSTRUYÓ UN FORMULARIO NUEVO
>
> `src/app/guias/components/EdicionGuia.tsx` monta el MISMO `GuiaForm` con el MISMO `useGuiaFormState` que usa el alta. Un segundo formulario "parecido" sería exactamente el *"algo diferente"* que Daniel pidió sacar, y el día que al alta se le agregue un campo, el otro quedaría viejo.
> - 🩸 **Es un COMPONENTE aparte y no un `useGuiaFormState` más en la página, y no es cosmético:** ese hook carga la guía, el catálogo de transportistas y las frecuencias. Tenerlo montado siempre le cobraría **tres pedidos a CADA apertura de una guía**, incluidas las 174 despachadas que nadie va a editar. Un hook no se puede llamar condicionalmente; un componente sí se puede no renderizar.
> - **Guardar NO te saca de la guía.** El hook ganó la opción `alGuardar`: sin ella hace `router.push("/guias")` —lo correcto cuando el formulario ES la pantalla entera— y quien estaba por despachar terminaba en el listado. Al guardar bien, se cierra la edición y **se relee la guía** (el PUT reemplaza los renglones, así que los ids que el despacho tiene en la mano para el N° del transportista cambiaron).
> - **El camino viejo NO se pierde: `/guias/[id]/editar` REDIRIGE** a `/guias/[id]?editar=1` (`replace`, no `push`: con `push` el "atrás" del navegador volvería a redirigir y dejaría a la persona encerrada). Borrar la ruta habría dejado un 404 donde antes había trabajo.
>
> ### 🔴 LO QUE NO SE TOCÓ, y es la mitad de esto
>
> - **Una guía Completada/Rechazada NO se edita.** No hay botón «Editar», el formulario no se monta, y **la pantalla lo DICE**: *"Esta guía ya se despachó: no se puede editar. Lo único que se puede cambiar es el N° del transportista de cada envío."* Campos que parecen editables y no dejan escribir son peor que no mostrarlos. El candado del PUT no se tocó y **las dos excepciones de siempre siguen igual** (`PATCH …/cliente` y `PATCH …/numero-transp`).
> - **UNA SOLA PUERTA para despachar.** La lista sigue sin despachar (ni por swipe ni desplegando nada) y sigue teniendo **UN SOLO botón por fila**, que en las pendientes se llama **«Despachar»** con su camión. No se tocó.
> - **Mientras se edita, la lista de envíos es UNA SOLA**: la del formulario. El resumen de solo lectura con su "Corregir" **no se dibuja al mismo tiempo** — eso serían los mismos envíos dos veces en la misma pantalla, lo que se sacó el 17-ago-2026. En lectura, el "Corregir" por renglón sigue exactamente igual.
> - **Quién puede editar es el MISMO conjunto que ya decidía si la fila mostraba el botón** (`canEdit` en `GuiasList`: admin · secretaria · bodega). Este cambio mueve el formulario de lugar, **no reparte permisos nuevos**; vendedor sigue mirando sin tocar.
> - La placa que no se pide en entrega directa · el cliente en las líneas · que elegir cliente no sea obligatorio · las sugerencias que nunca atan solas · la memoria de placas y choferes.
>
> ### ⚠️ Tres defectos REALES de la misma pantalla, arreglados en el mismo PR
>
> **A · El botón se quedaba en «Guardando…» PARA SIEMPRE si se caía el internet.** El `fetch` de `saveGuia` no tenía `try`, así que al reventar la conexión la excepción se llevaba puesto el `setSaving(false)` de más abajo: sin aviso, sin poder reintentar sin recargar, y **con bodega creyendo que guardó**. La pantalla de despachar sí avisaba ("Sin conexión…"); ésta no. Ahora hay `try/catch/finally` — el `finally` es lo que destraba el botón salga bien, salga mal o reviente— y se dice *"Sin conexión. No se guardó nada — revisa el internet y vuelve a intentar."*, **también cuando el guardado era automático**: "no se guardó" es exactamente lo que hay que enterarse.
>
> **B · El formulario se ponía rojo solo, mientras la persona escribía.** Al empezar el SEGUNDO envío, a segundo y medio aparecían *"Completa todos los campos obligatorios"* y la fila entera en rojo **sin que nadie hubiera apretado Guardar**: lo disparaba el guardado automático, que llamaba a `validate()` y ésta pintaba. Es el "rojo prematuro" que ya se había eliminado a propósito (*un campo no puede quedar en error por haberlo mirado*) y que volvió por la puerta del autoguardado. **El autoguardado SE QUEDA** —bodega despacha desde el celular y una pestaña que se cierra no puede llevarse los renglones—; lo que no puede es pintar. `validate({ pintar: false })` valida igual y frena el guardado igual, pero se calla. Al apretar «Guardar» se pinta todo lo que falte, como siempre.
>
> **C · El botón «Guardar Guía» aparecía apagado y no decía por qué.** Se apagaba con `!items.some(i => i.cliente)` —una regla PROPIA, más floja que la que de verdad decide—, así que también pasaba lo contrario: el botón se veía encendido, se tocaba, y el formulario entero se ponía rojo de golpe. Ahora usa el patrón que la pantalla de despachar ya tenía: **apagado Y explicado**, con las mismas palabras (*"Falta: la fecha, el transportista y quién despacha"*, *"Falta: el cliente, la empresa, la factura y los bultos del envío 2"*).
> - 🔑 **Las reglas NO se copian: `faltaParaGuardar` LLAMA a `validarGuia`**, la misma función que rechaza el guardado. Con dos listas, el día que una cambiara el botón se pondría negro y el guardado rechazaría igual — peor que el botón apagado, porque miente. El unidor del "y" antes del último se extrajo (`unirEnHumano`) para que los dos botones hablen el mismo idioma.
> - **Los envíos van AGRUPADOS, no campo por campo**: con 7 envíos a los que les falta el cliente, una lista plana daría 7 renglones diciendo lo mismo. Con un solo envío ni siquiera se lo numera.
> - **El aviso va en los DOS lugares donde hay un botón de guardar** —la barra pegajosa (la única que se ve en el celular mientras se llena la guía) y el final—: apagar el botón en un lado y explicarlo solo en el otro es la mitad del arreglo.
>
> ### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-guias-editar-en-la-guia.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre de página y 0 textos bajo 12 px en los 12 casos** (guía pendiente en lectura · la misma con la edición abierta · guía despachada), antes y después.
> - **Los tocables bajo 44 px salen IDÉNTICOS a main: 0 · 19 · 19 · 19** en el formulario y **0** en todo lo demás. Los 19 son los campos densos de `pointer:fine` que `GuiaForm` usa a propósito en escritorio (`CTRL_BASE`) y que `origin/main` ya medía igual en `/guias/[id]/editar` — por eso el baseline de "editando" es ESA pantalla: es el mismo componente.
> - **Recortados: la guía pendiente 3 y la despachada 0, IDÉNTICOS a main.** Editando da 7/6/15/13 contra 4/3/12/10 de main: **+3 exactos en los cuatro anchos**, y son los 3 del `-mx-2` de `SignatureCanvas` que la pantalla de la guía ya medía — o sea el bloque de despacho, que ahora convive con el formulario. **Crece hacia abajo** (3.540 px de alto a 390).
> - 🩸 **La guía pendiente es un DOBLE.** En producción no hay ninguna (las 187 están Completadas): se intercepta el GET y **se aborta cualquier pedido que no sea GET**. No se tocó ninguna guía real y nunca se apretó «Despachar» ni «Guardar Cambios». Las únicas escrituras bloqueadas son los POST de Sentry, **idénticos en main**.
> - 🩸 **Dos gotchas de medición, y los dos daban ROJO por nada:** el formulario dibuja los DOS layouts (tarjeta y tabla) y esconde uno con CSS, así que contar el DOM entero da el doble de campos; y el rótulo del formulario lleva `uppercase` **por CSS**, así que `innerText` lo devuelve en mayúsculas. El script **falla** si no encuentra el botón, el formulario, el «Despachar» de la misma pantalla o el aviso de la guía bloqueada.
>
> ### Candados
>
> **`src/__tests__/components/guias-editar-en-la-misma-pantalla.test.tsx` (13) RENDERIZA la página real y toca los botones** — un barrido de texto sobre `page.tsx` se cumple con el comentario que explica el cambio (en este repo ya pasó CUATRO veces) y además no puede ver lo único que importa: que al tocar «Editar» aparezcan los envíos EDITABLES y que en una despachada NO. Más `guias-falta-para-guardar.test.ts` (16) y `guias-editar-no-guarda-sola.test.tsx`, que **se MUDÓ con el formulario**: ahora monta la página de la guía y entra POR EL BOTÓN, que es el camino que la gente usa.
> - **Verificado por mutación, 17 de 17 cazadas** (`bash scripts/_mutar-candados-guia-editar.sh`): la guía pendiente deja de ofrecer «Editar» · se puede editar una YA DESPACHADA · la pantalla deja de decir que está bloqueada · la lista de solo lectura se dibuja además del formulario · «Despachar» desaparece mientras se edita · guardar vuelve a sacarte de la guía · el hook ignora `alGuardar` · `/guias/[id]/editar` deja de redirigir · vuelve el botón atascado en «Guardando…» · la caída de red no avisa nada · el autoguardado vuelve a pintar en rojo · `validate` ignora `pintar` · el botón vuelve a la regla vieja · queda apagado y NO dice por qué · `faltaParaGuardar` no encuentra nunca nada · la lista de faltantes se separa de `validarGuia` · el unidor deja de decir «y».
> - 🩸 **DOS mutaciones sobrevivieron en la primera corrida y las dos eran candados flojos, no producto sano.** (a) El defecto B no se cazaba porque el test escribía en el CLIENTE del segundo envío, y ése es el `ClientePicker`: teclear ahí no le mueve el estado al formulario, así que el autoguardado nunca se disparaba — se cambió por la DIRECCIÓN, que es un `<input>` pelado. (b) La mutación del `finally` no reproducía nada porque **el `catch` ya destraba el botón**: la mutación fiel devuelve el código a como estaba, sin red de seguridad.
> - 🩸 **El script de mutación restaura por COPIA, no con `git checkout`** (hay archivos NUEVOS y git aborta el comando entero), **y exige encontrar el resumen de vitest antes de creerle a un cero**: con `pipefail`, un `head -1` cortando el pipe hacía que la corrida se leyera como muerta al azar.


---

## 🔴 Guías — CUATRO DEFECTOS DE LA MISMA AUDITORÍA (25-ago-2026)

> ### 1. 🩸 EL N° DEL TRANSPORTISTA SE COPIABA A TODOS LOS ENVÍOS
>
> El número que la secretaria escribe **una vez** al crear la guía se **prellenaba en los 7 renglones**: bodega abría la guía y los encontraba todos llenos con el mismo, así que tenía que borrarlos y corregirlos uno por uno — o el papel salía mal. **Es exactamente lo contrario de lo que se decidió el 10-ago-2026** (Daniel: *"la info de guia de transp, debe de ser por linea, no por guia porque nos hacen varias guias el transportista por guia"*).
>
> La línea era `items.map((it) => it.numero_guia_transp || cabecera || "")` en `useDespachoGuia`. Ahora **cada caja arranca con el número de SU línea y con nada más**.
> - ⚠️ **LA HERENCIA NO SE FUE**: sigue viva donde siempre estuvo, que es al IMPRIMIR y al MOSTRAR (`numeroTranspDeLinea` / `numeroTranspImpreso`). Una guía histórica sale en el papel igual que siempre. Lo que se quitó es prellenar un campo EDITABLE con un valor que después se **ESCRIBE** en las 7 líneas como si alguien lo hubiera puesto ahí.
> - 🔴 **Y ESO ABRÍA UN EFECTO COLATERAL QUE HABÍA QUE TAPAR EN EL MISMO PR.** Con las cajas vacías, lo normal pasa a ser despachar sin ningún número —*"a veces el transportista lo da, a veces no"*— y `numeroGuiaDeCabecera` devuelve `""`. Escribir ese `""` **borraría el número que la secretaria anotó al crear la guía**, en el momento del despacho y sin que nadie lo pidiera. Regla nueva con nombre: **`numeroCabeceraAlDespachar(numerosTransp, cabeceraActual)`** — si ninguna línea trae número, se conserva el que ya estaba; si alguna trae, gana la línea (es el dato más específico y es el que el papel imprime).
> - **El número anotado al crear la guía SE DICE, no se copia**: arriba de la lista, *"Al crear la guía se anotó **TR-4471** para toda la guía: si el transportista dio uno por envío, escríbelo acá."* Escondido del todo, quien despacha no sabría que ya hay uno.
>
> ### 2. «IMPRIMIR TODAS» NO IMPRIMÍA NADA
>
> Abría **una pestaña por guía** y adentro de cada una había que apretar Imprimir; el navegador bloquea todas menos la primera. Se seleccionaban 8 guías esperando 8 papeles y salía **una pestaña**.
>
> **Ahora baja UN solo PDF con todas, una por página**, listo para la impresora.
> - 🔑 **NO se escribió un segundo generador.** `construirPdfGuia` se partió en `dibujarGuiaEnPdf(doc, g)` **sin tocar una línea de lo que dibuja** —solo se le sacaron el `new jsPDF()` del principio y el `return` del final— y `construirPdfGuias(guias)` lo llama una vez por guía. Con UNA sola guía el documento es **byte por byte el mismo** que el de siempre (hay candado que compara los dos, salvo la fecha de creación): no existe un "modo lote" que dibuje distinto.
> - **La primera guía va en la página que el documento ya trae**: un `addPage()` de más deja una hoja en blanco al principio de todo lo que se imprima.
> - **El detalle de los envíos se pide guía por guía** (`GET /api/guias/[id]`), igual que hace la pantalla de imprimir: el listado no lo trae y sin eso el papel saldría sin renglones.
> - Las guías salen **en el orden en que se ven en la lista** (`Set` conserva el orden de inserción), no en el que se fueron tocando: un papel salteado es imposible de encontrar en una pila de ocho.
>
> ### 3. EL EXCEL DECÍA «—» EN EL N° DEL TRANSPORTISTA AUNQUE ESTUVIERA ANOTADO
>
> `excel-guias.ts` leía `g.numero_guia_transp` —la CABECERA—, y desde el 18-ago-2026 el número **se puede anotar tarde**: eso escribe UNA columna de UNA línea y **no toca la cabecera**. O sea que **el reporte que sirve justo para reclamarle al transportista mostraba vacío lo que sí estaba cargado**. Y el buscador de la lista tenía el mismo defecto: esa guía **no se podía encontrar nunca más** (el chip ámbar sí se apagaba bien, ése ya se había arreglado).
>
> **Fuente única: `numerosTranspDeLaGuia(g)`** (`modo-despacho.ts`) — el número de CADA renglón, con la herencia de la cabecera para las guías viejas y el `"0"` pelado tratado como vacío, sin repetidos y sin vacíos. **Las mismas dos reglas que ya aplican el papel y el chip ámbar**, porque las delega en `numeroTranspImpreso` en vez de reescribirlas.
> - **Con varios números distintos, el Excel los lista TODOS** (`TR-4471, TR-9999`): poner uno solo sería elegir por el lector. Sin ninguno sigue diciendo «—».
> - ⚠️ **No mira el modo de entrega a propósito**: en entrega directa los números se escriben VACÍOS al despachar, así que no hay nada que ocultar acá y meter la regla otra vez sería una tercera copia de algo que ya se decide al guardar.
>
> ### 4. SE IMPRIMÍA `__other__` EN EL PAPEL QUE FIRMA EL TRANSPORTISTA
>
> El desplegable «Despachado por» tiene una opción `Otro…` cuyo `value` es el centinela `__other__`. Al elegirla aparece un campo para escribir el nombre y recién ahí se reemplaza — pero **si nadie escribe nada, la guía se guarda con el centinela y así sale IMPRESO**: `DESPACHADO POR: __other__`. La validación solo miraba que el campo no estuviera vacío.
>
> ✅ **Medido contra producción el 25-ago-2026 sobre las 212 guías vivas: `Julio ×178 · Rodrigo ×31 · vacío ×3` — CERO con `__other__`.** Era un defecto **LATENTE**: la puerta estaba abierta y nadie había pasado, así que **no hay nada que corregir hacia atrás**.
>
> 🔴 **SE TAPA POR LOS DOS LADOS, y hacen falta los dos** (`src/lib/guias/despachado-por.ts`, módulo PURO):
> 1. **El formulario no deja guardarlo** — `validarGuia` lo trata como "sin elegir", así que el botón se apaga y dice *"Falta: quién despacha"*, y el campo de texto queda en rojo con *"Escribe el nombre de quien despacha"*. Se dice ANTES de guardar, no después de imprimir.
> 2. **El papel no lo imprime NUNCA** (`nombreDespachadoPor`, en `PrintDocument` y en `pdf-guia`): es la red para cualquier fila que ya estuviera guardada así, y para el día que alguien escriba una tercera pantalla que guarde este campo. Con el centinela devuelve `""` — la línea queda en blanco para escribirla a mano, que es lo único honesto.
>
> El módulo vive en `lib/` y no junto al formulario porque **los DOS papeles lo necesitan**, y `lib/` no puede importar de `app/`.
>
> ### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción** (`BASE=… node scripts/_medir-guias-numero-por-linea.mjs`, solo lectura): **390 · 834 · 1024 · 1440 → 0 px de arrastre, 0 textos bajo 12 px, 0 tocables bajo 44 px** en la guía, y las **3 cajas del N° VACÍAS** con el número de la cabecera DICHO arriba. Con «Otro…» elegido y sin nombre: el aviso a la vista, el botón apagado y el *"Falta: … quién despacha"*.
> - 🩸 **La guía pendiente es un DOBLE** (en producción no hay ninguna): se intercepta el GET y **se aborta cualquier pedido que no sea GET**. El script **falla** si no encuentra las cajas, si alguna viene con el número copiado, si no se dice la cabecera, o si «Otro…» no avisa.
>
> ### Candados
>
> `src/__tests__/lib/guias-numero-por-linea-y-papel.test.ts` (25) y **`src/__tests__/components/guias-numero-transp-no-se-copia.test.tsx` (4), que RENDERIZA la página real y lee el `value` de cada caja** — un barrido sobre el hook ve la expresión, pero no lo único que importa: qué encuentra bodega escrito en los campos. El PDF se **genera de verdad** y se lee (páginas y contenido), y el Excel se arma y se leen sus celdas.
> - ⚠️ **Un candado viejo CAMBIÓ DE DIRECCIÓN**: `guias-modo-despacho.test.ts` fijaba `payload.numero_guia_transp = numeroGuiaDeCabecera(numerosTransp)` — correcto mientras las cajas nacían prellenadas, y **la línea exacta que ahora borraría el número**. Hoy exige lo que siempre quiso decir: que la cabecera se mande (no se omita).
> - **Verificado por mutación, 17 de 17 cazadas** (`bash scripts/_mutar-candados-numero-por-linea.sh`).
> - 🩸 **TRES mutaciones sobrevivieron en la primera corrida y las tres enseñaron algo distinto.** Dos eran del SCRIPT (un em-dash y un ` ` que el patrón de perl no matcheaba, o sea que la mutación nunca se aplicó y el verde era falso). **La tercera era código REDUNDANTE**: `numerosTranspDeLaGuia` volvía a aplicar `sinCeroPelado` a la cabecera cuando `numeroTranspImpreso` ya lo hace adentro — quitarlo no rompía nada porque no hacía nada. Se borró la redundancia y la mutación pasó a atacar lo que de verdad sostiene la regla.
> - 🩸 **La restauración va por COPIA, no con `git checkout`** (hay archivos NUEVOS) **y `probar()` exige encontrar el resumen de vitest** antes de creerle a un cero.


---

## 🔴 Guías — DOS BOTONES EN LA FILA, y la poda del workflow (25-ago-2026)

> Daniel, textual: ***"quiero (c) Dos botones en la fila: «Editar» y «Despachar», pero que haga sentido, siento que de TANTOS CAMBIOS no se entiende el workflow, revisa bien porfa que no quiero fricción, tiene que ser un módulo simple, no complicado."*** Y sobre los textos: ***"no siempre hay q estar explicando todo, se vuelve tedioso"***.
>
> ### 1. Los dos botones
>
> 🩸 **La fila tenía UN botón que decía «Despachar», así que corregir un nombre obligaba a tocar «Despachar» primero** y buscar «Editar» adentro — la queja del 23-ago, sin resolver. El 10-ago se había sacado el par «Despachar»+«Editar» porque convivía con el **formulario de despacho desplegado en la misma tarjeta**; el 14-ago el único botón pasó a llamarse «Despachar» (185 de 186 guías terminan despachadas). **Lo que sobraba era el formulario en la fila, no el segundo botón.**
>
> **Ahora, en una guía `Pendiente Bodega`: «Editar» · «Despachar» · «Imprimir» · «···».** Los dos primeros **NAVEGAN**: `«Editar» → /guias/[id]?editar=1` (el MISMO query por el que entra el camino viejo `/guias/[id]/editar`, así que sigue habiendo una sola puerta) y `«Despachar» → /guias/[id]`.
> - 🔴 **LA LISTA SIGUE SIN DESPACHAR**, ni por swipe ni desplegando nada. Los dos botones son un `router.push` y nada más — candado de conducta que **toca los dos y verifica que no salió ni un `fetch`**.
> - ⚠️ **Una guía `Completada`/`Rechazada` no muestra ninguno de los dos** (sigue con «Imprimir» y «···»): el candado del PUT no se tocó. **`Confirmada`** —estado legacy, ya salió— muestra solo «Editar»: no hay nada que despachar.
> - **Toques para corregir un nombre en una pendiente: 4 → 3.** Despachar sigue en 3, imprimir en 2, atar un cliente en 4, crear una guía en 2.
>
> ### 2. 🩸 EL MODO DE ENTREGA SE PREGUNTABA DOS VECES EN LA MISMA PANTALLA
>
> Con la edición abierta convivían **dos controles del mismo campo**: el «Modo de entrega» del `GuiaForm` y el bloque «Cómo sale» + «Cambiar» del `DespachoForm`. Y no era cosmético: **son dos estados distintos** (`useGuiaFormState.modoEntrega` y `useDespachoGuia.tipoDespacho`), así que mover uno no movía el otro. En entrega directa la MISMA frase —*"Sale en nuestro propio camión: no lleva placa ni N° de guía de transportista"*— salía **dos veces**.
>
> **Mientras se edita, manda el formulario** (`mostrarModo={!enEdicion}`). ⚠️ **En LECTURA el bloque no se tocó**: es lo que evitó que **50 de 51 entregas directas quedaran grabadas como transportista externo** (14-ago-2026).
>
> ### 3. 🩸 EL ACORDEÓN DE UNA DESPACHADA LEÍA LA CABECERA, NO LOS RENGLONES
>
> El mismo defecto que el 25-ago se arregló en el Excel y en el buscador, **vivo en la lista**: `sinCeroPelado(g.numero_guia_transp)`. Desde el 18-ago el N° se anota TARDE y eso escribe UNA columna de UNA línea **sin tocar `guia_transporte`**. Medido contra producción con **GT-229, una guía REAL**: main muestra `725`; con los renglones muestra **`725, 724, 726`**. Fuente única `numerosTranspDeLaGuia`, la misma del Excel — con varios distintos **los lista TODOS**, porque elegir uno sería elegir por el que lee.
>
> ### 4. La poda de textos
>
> | Qué se sacó | Dónde | Por qué |
> |---|---|---|
> | *"Se abre igual que cuando se crea la guía, sin salir de acá."* | `/guias/[id]`, bajo «Editar» | Explicaba el mecanismo. Con «Editar» en la fila ya se entra al formulario de una. |
> | El párrafo de 3 frases del N° del transportista | `ListaEnvios` | Quedó **una línea**: *"Anota el N° que te dio el transportista; si no dio ninguno, se despacha igual."* + el dato de la cabecera, que **se dice y no se copia** (candado y medición del 25-ago intactos). |
> | El prop `onPrint` | `GuiasList` | **Muerto**: declarado, exigido, pasado desde `page.tsx` y nunca usado — «Imprimir» abre la pestaña él mismo. |
> | El segundo control del modo | ver punto 2 | Duplicado con estado propio. |
>
> **Lo que se dejó a propósito:** *"Solo se puede cambiar el cliente"* · *"Esta guía ya se despachó: no se puede editar…"* · el aviso ámbar de la guía sin N° · *"Un 0 no es un N° de guía"* · *"Sale en nuestro propio camión…"* (una vez). **Protegen plata o evitan un error**, no explican un mecanismo.
>
> ### 5. 🔴 LO QUE **NO** SE TOCÓ
>
> El PUT rechaza una guía despachada · `PATCH …/cliente` y `PATCH …/numero-transp` son las DOS excepciones y no miran el estado · el N° del transportista **no** bloquea el despacho · las firmas y placa/receptor/cédula **sí** · una sola lista de envíos · el papel impreso · entrega directa sin placa ni transportista · **nadie gana permisos** (`canEdit` es el mismo conjunto de siempre; vendedor mira sin tocar).
>
> ### Medición
>
> **Los 3 anchos + el iPad acostado, contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-guias-dos-botones.mjs`, solo lectura), en cuatro pantallas: la lista con una guía **PENDIENTE REAL** abierta (GT-230), la lista con una **DESPACHADA REAL** (GT-229), la guía en lectura y la misma con `?editar=1`:
>
> | | main | después |
> |---|---|---|
> | arrastre de página | 0 · 0 · 0 · 0 | **0 · 0 · 0 · 0** |
> | textos <12 px | 0 | **0** |
> | tocables <44 px (listas) | 0 · 1 · 1 · 1 | **idéntico** (el `<input>` del buscador, 39 px, PRE-EXISTENTE) |
> | tocables <44 px (editando) | 0 · 14 · 14 · 14 | **idéntico** (`pointer:fine` de `GuiaForm`) |
> | recortados | 0/15/19/4 · 3/3/3/3 · 5/5/12/10 | **idénticos, los tres casos** |
> | fila pendiente | Despachar 1 · Editar 0 | **Editar 1 · Despachar 1** |
> | N° transp de GT-229 | `725` | **`725, 724, 726`** |
> | «Cómo sale» editando | SÍ, con su «Cambiar» | **NO** |
> | alto a 390 (editando) | 3.035 px | **2.915 px** |
>
> - 🔴 **NO SE TOCÓ NINGUNA GUÍA REAL.** La guía de (3) y (4) es un **DOBLE** servido por el script; se **aborta cualquier pedido que no sea GET** y nunca se aprieta «Despachar» ni «Guardar». Los POST de Sentry se abortan igual pero no se cuentan: main los hace idénticos.
> - 🩸 **GOTCHA DE MEDICIÓN QUE DABA ROJO POR NADA:** el acordeón **no desmonta las filas cerradas**, las aplasta con `grid-rows-[0fr]` + `overflow-hidden`. Sus botones conservan caja propia, así que contar el DOM entero devolvía **los botones de las CINCO pendientes** (`Editar 5 · Despachar 5`) en vez de los de la fila abierta. Hay que subir por los padres y descartar lo que esté dentro de un contenedor de alto 0.
>
> ### Candados
>
> Todos de **CONDUCTA** (renderizan y tocan los botones): `components/guias-entrega-directa.test.tsx` (la fila pendiente da los DOS, los dos llaman a lo suyo y **no sale ni un `fetch`**; el acordeón lee el N° de los renglones, lista varios y sigue diciendo «—» sin ninguno), `guias-sin-rechazo.test.tsx` (una `Completada` sigue con solo «Imprimir»), `guias-editar-en-la-misma-pantalla.test.tsx` (llegar con `?editar=1` **aterriza con el formulario abierto**; el modo se pregunta una sola vez y la frase de entrega directa no sale dos veces). Más `lib/guias-despacho-una-sola-puerta.test.ts`, cuyo candado **cambió de dirección**: ya no exige UN botón, exige que **los dos NAVEGUEN**.
> - **Verificado por mutación, 13 de 13 cazadas** (`bash scripts/_mutar-candados-guias-dos-botones.sh`): la fila vuelve a un solo botón (los dos sentidos) · «Despachar» llama a lo mismo que «Editar» · «Despachar» aparece en una guía que ya salió · una DESPACHADA vuelve a ofrecer los dos · «Editar» cae en la pantalla de despachar · la guía ignora `?editar=1` · vuelve el segundo control del modo · «Cómo sale» desaparece de la lectura · el acordeón vuelve a la cabecera · el acordeón muestra uno solo · las cajas del N° vuelven a nacer prellenadas · el N° de la cabecera deja de decirse.
> - 🩸 **EL SCRIPT DENUNCIA EL PATRÓN QUE NO MUTA NADA**, en vez de cantarlo como "SOBREVIVIÓ" — un rojo inventado sobre un candado que nunca se puso a prueba. Ya pasó dos veces acá (un em-dash, un espacio fino) **y una tercera en este mismo PR**: con `perl -0pi -e 's|…|…|'`, el `||` del código real hacía que la mutación **se pegara al principio del archivo**. Por eso el reemplazo es **LITERAL** (`scripts/_mutar-guias-aplicar.py`) y exige que el texto viejo aparezca las veces que se le dicen. El script trae además **una mutación de control que no matchea a propósito**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro.
>
> ### ✅ Los tres «Abiertos» de este PR se CERRARON al día siguiente
>
> Los tres entraron en la tanda de 15 puntos que Daniel aprobó el 25-ago-2026 (ver la sección de abajo):
> - **A una guía DESPACHADA no se llegaba desde la pantalla** → ahora la fila ofrece «Editar» (punto 9). El candado `guias-sin-rechazo` cambió de dirección: exige «Editar» y sigue prohibiendo «Despachar».
> - **«Corregir» por renglón vs «Editar»** → se retiró el «Corregir» (punto 1). El endpoint por columna no se retiró: pasó a ser el único camino para escribir en una guía firmada.
> - *"Es lo único que se puede cambiar de una guía ya despachada."* → podado, junto con los otros dos textos que se contradecían (punto 14).


---

## 🔴 Guías — «QUE SE SIENTA COMO UN PAPEL»: UN SOLO FORMULARIO, DE PUNTA A PUNTA (25-ago-2026)

> Daniel, textual: ***"la guía se que sentir como un papel al entrar… debe de ser un formulario al crearlo, al editarlo, etc."*** · ***"se debe de poder crear una guía, todos los usuarios pueden abrirla, editarla etc, y cuando se complete marcarla como despachada y ya listo."***
>
> 🩸 **EL DIAGNÓSTICO: el módulo recibió ~10 cambios en 15 días y cada uno dejó su puerta.** Para corregir un renglón había DOS caminos en la misma pantalla («Corregir» por línea y «Editar»); el N° del transportista se pedía arriba **y** por línea; una guía despachada no se podía abrir desde ningún lado; y **tres textos distintos** decían tres cosas incompatibles sobre qué se podía tocar. Las 15 decisiones de abajo las aprobó Daniel punto por punto.
>
> ### 1 · UNA SOLA FORMA DE EDITAR
>
> Se retiró el **«Corregir» por renglón** de `ListaEnvios`. Abría una cajita con cliente, dirección, empresa, bultos y facturas — **exactamente los mismos campos** que el formulario de «Editar», con su propio botón de guardar, su propia validación y su propio idioma. Queda el formulario: el MISMO `GuiaForm` al crear, al editar y al corregir una guía firmada.
> - ⚠️ **Las cajas del N° del transportista de `ListaEnvios` SE QUEDAN** y no son una tercera forma de editar: son parte de **DESPACHAR**. Se llenan con el papel del chofer en la mano y se confirman con las firmas, en el mismo acto. Por eso solo aparecen en una guía pendiente y solo para quien puede despachar.
> - El endpoint por columna (`PATCH /api/guias/[id]/item`) **no se retiró**: pasó a ser el único camino para escribir en una guía FIRMADA (punto 4).
>
> ### 2, 3 y 9 · EL FLUJO, Y QUE A UNA DESPACHADA SE ENTRA
>
> Crear → cualquiera de los tres (admin · secretaria · bodega) la abre y la edita → cuando está completa, se marca despachada. **Nadie gana permisos**: `EDICION_ROLES` es el mismo conjunto de siempre y **vendedor sigue mirando sin tocar**.
> - 🩸 **A una guía DESPACHADA no se llegaba desde la pantalla**: `/guias/[id]` de una `Completada` **solo se abría escribiendo la URL a mano**, y ahí adentro vive el N° del transportista. O sea que el chip ámbar marcaba **143 guías que nadie podía destildar desde la interfaz**. Ahora la fila de una despachada ofrece «Editar» como cualquier otra.
> - ⚠️ **«Despachar» NO aparece en una guía que ya salió.** Una guía se despacha una sola vez, y ese candado cambió de nombre pero no de fuerza (`guias-sin-rechazo.test.tsx`).
>
> ### 4, 5 y 6 · 🔴 LA GUÍA DESPACHADA: **TRES COSAS**, Y LOS BULTOS NO
>
> Daniel: *"Se puede corregir **N° del transportista · cliente · facturas**"* · *"los **bultos** de una despachada **NO se tocan** — es lo que el transportista firmó"* · *"la **firma** queda la vieja. No se vuelve a firmar"*.
>
> Se abre el MISMO formulario, con esas tres cosas como campos y **todo lo demás como TEXTO** — la fecha, el modo, el transportista, quién despachó, las observaciones, la dirección, la empresa y los bultos. Un campo que parece editable y no deja escribir es peor que no mostrarlo.
> - 🔑 **La regla vive en UN módulo, `src/lib/guias/campos-editables.ts`, y la LEEN los tres lugares que la aplican**: el formulario (qué dibuja), el endpoint (qué acepta) y el candado. Con tres copias, el día que una cambiara la pantalla ofrecería un campo que el servidor rechaza — o peor, al revés.
> - 🔴 **EL CANDADO DEL PUT NO SE TOCÓ.** Una guía `Completada` lo sigue rechazando entero. Las tres correcciones van por **escrituras POR COLUMNA**: `PATCH …/numero-transp` para el N° y `PATCH …/item` para cliente y facturas — el molde que ya existía **por exactamente esta razón**: `items` en el PUT es un reemplazo completo (borra e inserta con **ids nuevos**) y con eso se pierden el cliente atado y el N° anotado tarde. Corregir una factura no puede costar eso.
> - **El endpoint filtra POR CAMPO, no por estado.** Un cuerpo con `bultos` sobre una guía firmada se rechaza con 400 **y no escribe nada**; un cuerpo MIXTO (`{facturas, bultos}`) se rechaza **entero** — media escritura sería peor que ninguna.
> - **No se agregan ni se quitan envíos** de una guía que ya viajó: sería inventar (o borrar) mercancía.
> - ⚠️ **Y NO AUTOGUARDA.** El autoguardado de 1,5 s vive para que bodega no pierda renglones en el celular; sobre un papel ya firmado sería una escritura que nadie pidió. Se tapa por los dos lados: el formulario no dispara el temporizador y el hook ignora los guardados silenciosos en ese modo.
> - **Las escrituras que no cambian nada no se hacen**: abrir una guía firmada, mirarla y guardar no manda un solo pedido — el botón ni se enciende.
>
> ### 7 · 🔴 EL N° DEL TRANSPORTISTA, **POR LÍNEA Y AL LADO DE LOS BULTOS**
>
> El campo de CABECERA salió del formulario. El transportista arma VARIAS guías suyas por cada guía nuestra (*"nos hacen varias guias el transportista por guia"*, 10-ago-2026): preguntarlo una sola vez arriba era pedir el dato equivocado. Ahora se pide **renglón por renglón**, pegado a los bultos, en móvil y en escritorio — y sale así en el acordeón, el papel, el PDF y el Excel.
> - 🩸 **Y ACÁ ESTABA LA TRAMPA: la columna `guia_transporte.numero_guia_transp` NO se retira.** La leen el buscador de la lista, el Excel, el chip ámbar y el encabezado del papel, y **las guías viejas heredan de ella**. Si el formulario dejara de mandarla, el PUT escribiría `null` y **le borraría el número a toda guía que alguien editara**. Se sigue escribiendo, **DERIVADA** de los renglones con la MISMA función que usa el despacho (`numeroCabeceraAlDespachar`): gana la línea si alguna trae número, y si ninguna trae **se conserva el que ya estaba**.
> - 🩸 **Y ESO ABRÍA UN SEGUNDO AGUJERO, que costó un arreglo aparte: el formulario NACÍA SUCIO.** Desde el 18-ago el N° se puede anotar tarde, y eso escribe UNA columna de UNA línea **sin tocar la cabecera** — o sea que hay guías con la cabecera vacía y `725` en un renglón. Con el N° derivado, la referencia (`""`, lo guardado) y lo actual (`"725"`, lo derivado) diferían **apenas se abría la guía**: la pantalla decía *"Sin guardar"* sin que nadie tocara una tecla, y en una guía firmada eso además **encendía el botón de guardar**. Es exactamente lo que `cambios-form.ts` vino a matar: *cargar la guía no puede producir una diferencia contra sí misma*. La instantánea de referencia usa ahora la misma derivación (`instantaneaDeLoGuardado`).
> - **El Excel pasó a UNA FILA POR ENVÍO.** Antes GT-229 salía en una fila con `725, 724, 726` amontonados en una celda, los clientes resumidos como *"America Clasic y 3 mas"* y las cuatro facturas pegadas con comas. Este reporte sirve justo para **reclamarle al transportista**, y para eso hay que poder cruzar **su** número con **esa** factura y **ese** cliente. Columnas: `N° Guía · Fecha · Transportista · Envío · Cliente · Destino · Empresa · Facturas · Bultos · N° Guía Transp. · Estado`; la columna «Envío» dice `"2 de 4"`. **Las columnas viejas están todas** y el total de bultos no se movió (se sigue sumando `total_bultos` por guía: una guía sin renglones conserva el suyo).
> - ⚠️ **Y el listado tuvo que traer tres columnas más** (`direccion`, `empresa`, `orden`): el Excel se arma con lo que trae `/api/guias`, y sin ellas las columnas «Destino» y «Empresa» salían vacías — **«Empresa» ya salía vacía antes**, y nadie lo había notado porque el resumen por guía las juntaba en una celda.
>
> ### 8 · Nuestro N° (GT-230) sigue siendo general, por guía. No se tocó.
>
> ### 10 y 11 · IMPRIMIR IMPRIME, Y COMPARTIR MANDA EL PDF
>
> 🩸 Había **un** botón y no hacía ninguna de las dos cosas: abría una PESTAÑA con la vista previa y adentro había que buscar «Imprimir» o «Compartir». Ahora son dos botones, y cada uno hace lo suyo **de un toque**, en la fila de la lista y en la pantalla de la guía.
> - 🔑 **El documento es el MISMO para las dos y es el de siempre** (`construirPdfGuia`): el papel impreso y el PDF que se manda por WhatsApp son el mismo archivo, salvo la orden de imprimirse que `autoPrint()` le agrega al que va a la impresora. **No hay dos papeles.**
> - 🩸 **Y hay dos caminos porque hay dos mundos, no por gusto** (`src/lib/imprimir-pdf.ts`): en **escritorio** el PDF se carga en un `<iframe>` escondido y el propio documento pide imprimirse — el diálogo aparece encima de la guía, sin cambiar de pantalla; en **iPhone y iPad** Safari **no ejecuta esa orden dentro de un iframe**, así que se abre el visor del sistema, que trae su propio botón de AirPrint. Es un toque igual, y es el único camino que de verdad llega a la impresora. El iPad moderno se anuncia como "Macintosh": se lo distingue por `maxTouchPoints`.
> - ⚠️ **El PDF se arma SIN un solo `await` en el medio.** Safari en iOS solo deja abrir la hoja de compartir (y una pestaña) DENTRO del gesto del toque. Por eso el módulo del papel **se pide al ABRIR el acordeón**, no al tocar el botón: una descarga de red en el medio hace que el navegador deje de contarlo como gesto y lo bloquee **con un `catch` silencioso**, sin decir por qué.
>
> ### 12 · GUARDAR UNA GUÍA NUEVA TE DEJA **EN LA GUÍA**
>
> 🩸 Se terminaba de cargar la guía, se apretaba «Guardar Guía» y la pantalla saltaba a `/guias` — justo cuando lo siguiente que hace la secretaria es **imprimirla para dársela al chofer**. Había que buscarla en la lista, abrir el acordeón y recién ahí imprimir. Ahora aterriza en `/guias/<id>`, con «Imprimir» y «Compartir» a la vista.
> - ⚠️ Si el servidor no devolviera el id (no debería: el POST responde la guía insertada), se vuelve al listado como siempre. Quedarse quieto sin decir nada sería peor.
>
> ### 13 · LO QUE FALTÓ AL DESPACHAR, **MARCADO**
>
> Medido contra producción: de las **207 guías despachadas**, **143 sin N° de transportista · 68 sin placa · 65 sin «Recibido por» · 190 de 207 (92%) con al menos uno**. Se cerraron así porque durante meses nada bloqueaba: el bloqueo de placa/receptor/cédula se puso el 10-ago-2026 y desde entonces son **0 de 15** — es una deuda del pasado, no un agujero abierto.
> - En la lista, un chip **«Salió incompleta»**; adentro, la frase con nombre: *"Salió sin la placa y la cédula"*.
> - 🔴 **MARCA, NO ABRE.** Placa, quién recibió y cédula **NO** están entre las tres cosas que se pueden corregir, y el candado del PUT las rechaza igual. Hay un candado que lo prueba al revés: ninguno de los tres puede aparecer en `CAMPOS_DESPACHADA`. **Completarlas es otra decisión y no se tomó** — ver *Abiertos*.
> - ⚠️ Solo se marca lo que **YA SALIÓ**: en una pendiente todavía se está llenando el dato, y acusarla sería ruido en la única pantalla donde bodega mira el trabajo del día. Y **a una entrega directa no se le pide placa**: es nuestro propio camión.
> - ⚠️ Para esto el listado tuvo que traer `cedula` (un TEXT de 13 caracteres; las firmas base64 siguen fuera). Sin ella marcaría a TODAS las guías.
>
> ### 14 · 🔴 LOS TRES TEXTOS QUE SE CONTRADECÍAN, FUERA LOS TRES
>
> Sobre la MISMA guía despachada, tres frases decían tres cosas distintas:
>
> | Dónde | Qué decía |
> |---|---|
> | `/guias/[id]` | *"Esta guía ya se despachó: no se puede editar. Lo único que se puede cambiar es el **N° del transportista** de cada envío."* |
> | El renglón (`ListaEnvios`) | *"Es lo único que se puede cambiar de una guía ya despachada."* |
> | El acordeón (`GuiasList`) | *"Solo se puede cambiar **el cliente**"* |
>
> Y desde el punto 4 las tres son además **FALSAS**. **Lo que las reemplaza no es un cuarto texto: es que se VEA** — el formulario dibuja como campo solo lo que se puede tocar. El candado hace el barrido **sobre el código SIN comentarios** y además prohíbe que la promesa vuelva disfrazada (*"lo único que se puede…"*, *"solo se puede cambiar…"*), porque en este repo un barrido de texto ya se cumplió **cuatro veces** con el comentario que explicaba el cambio.
>
> ### 15 · 🔴 EL PARPADEO AL TOCAR «EDITAR»
>
> 🩸 **Tres causas, y hacían falta las tres:**
> 1. La pantalla nacía en modo LECTURA (`useState(false)`) y un `useEffect` leía `?editar=1` **después del primer dibujo** → se pintaba la guía entera (datos, envíos, bloque de despacho) y un instante después se reemplazaba por el formulario. **Ahora se lee en el inicializador perezoso** (`abrirEnEdicion`, módulo puro y por eso probable sin navegador). En el servidor no hay `window`, y da igual: hasta que `authChecked` sea true la página devuelve `null`, así que el HTML del servidor y el primer dibujo del navegador son los dos vacíos — no hay hidratación que pueda diferir.
> 2. `enEdicion` exigía **que la guía ya estuviera cargada** (`&& !!g`) → mientras viajaba, la pantalla caía en lectura y dibujaba SU esqueleto. Ahora el modo lo decide quien apretó el botón, y lo que se muestra mientras carga es **el esqueleto del formulario**.
> 3. `<EdicionGuia>` **volvía a pedir la misma guía**. Eran **6 llamadas** para abrir «Editar», con la guía viajando **dos veces**. Ahora se le pasa ya cargada (`guia={g}`) y el hook no la vuelve a pedir (`yaSembrada`).
>
> 🩸 **Y al cerrar, la URL seguía diciendo `?editar=1`**: recargar, compartir el enlace o darle "atrás" reabría el formulario que la persona acababa de cerrar. `urlDeLaGuia` la limpia con `replace` (con `push`, el "atrás" reabriría el formulario) y **conserva los demás parámetros**.
>
> ### 🔴 LO QUE **NO** SE TOCÓ
>
> El **candado del PUT** sobre una guía despachada · `PATCH …/cliente` sigue sin mirar el estado · **placa, receptor, cédula y las DOS firmas siguen bloqueando el despacho** y el N° del transportista **no** · **la lista NO despacha** (ni por swipe ni desplegando nada) y «Despachar» sigue teniendo **una sola puerta** · **entrega directa** no lleva placa ni transportista y el `"0"` pelado se trata como vacío · el **papel impreso conserva su formato y su pie legal** · **nadie gana permisos**.
>
> ### Verificación
>
> **PDF y papel, generados de verdad y leídos con `pdftotext`** (`npx tsx scripts/_verif-guias-papel-pdf.ts`, **33 ✅ / 0 🔴**): con **varios N° distintos** el encabezado **no anuncia ninguno** y cada número sale en la fila de su envío; con **uno solo** el encabezado sí lo anuncia; la **herencia** funciona; el `"0"` pelado no se imprime; `__other__` no aparece nunca; el pie legal está completo y textual. `construirPdfGuias([g])` es **byte por byte** el mismo documento que `construirPdfGuia(g)` salvo `/CreationDate` y `/ID` (19.957 bytes los dos) y **sin hoja en blanco al principio**; con 3 guías, 3 páginas exactas.
>
> **Excel, escrito a disco y leído con DOS parsers** (`npx tsx scripts/_verif-guias-excel.ts`, **44 ✅ / 0 🔴**): `xlsx-js-style` y **openpyxl 3.1.5** dan `A1:K14`, 14×11, y la comparación **celda por celda da 154 celdas, 0 distintas**. Los dos confirman: 4 envíos = **4 filas** con su cliente/factura/N° cada una; **ninguna celda amontona dos N° distintos**; «Envío» dice `1 de 4 … 4 de 4`; bultos **numéricos**; totales `4 guías · 7 envíos · 36 bultos`; la guía **sin renglones sigue apareciendo**; el `"0"` pelado sale `«—»`.
> - Los dos verificadores traen **controles de mutación en memoria** (5 de 5 y 6 de 6 cazadas) y un **guard anti-vacuo** que revienta si el lector no ve una guía — un verificador que no puede fallar no verifica nada.
>
> ### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción y CONTRA `origin/main`** (`BASE=… ETAPA=antes|despues node scripts/_medir-guias-formulario-unico-anchos.mjs`, solo lectura), en **seis pantallas**: la lista con una **pendiente REAL** abierta (GT-230) · la lista con una **despachada REAL** (GT-227) · la guía pendiente en lectura · la misma con el formulario abierto · **la despachada con el formulario abierto** (la pantalla nueva) · `/guias/nueva`.
>
> | | main | después |
> |---|---|---|
> | arrastre de página (24 casos) | **0** | **0** |
> | textos < 12 px (24 casos) | **0** | **0** |
> | tocables < 44 px | 0 · 1 · 9 según pantalla | **idénticos**, salvo la despachada-editar (ver abajo) |
> | recortados, lista (390·834·1024·1440) | 0 · 15 · 19 · 4 | **2** · 15 · 19 · 4 |
> | recortados, pendiente editando | 3 · 3 · 4 · 3 | 3 · 3 · **5** · 3 |
> | recortados, resto | 3 · 3 · 3 · 3 · 0 · 0 · 1 · 0 | **idénticos** |
>
> - 🔴 **LAS DOS DIFERENCIAS, DICHAS DE FRENTE:**
>   - **La despachada con el formulario abierto pasa de 0 a 12 tocables bajo 44 px** a 834/1024/1440 (a 390 sigue en **0**). Son los campos densos de `pointer:fine` que `GuiaForm` usa a propósito en escritorio (`CTRL_BASE`) — **los mismos que main ya mide en `/guias/nueva` y en la guía pendiente editando (9)**. En main ese caso daba 0 porque **la pantalla no existía**: una guía despachada no se podía abrir. Es el formulario, no un defecto nuevo.
>   - **La lista a 390 pasa de 0 a 2 recortados**, y son los dos resúmenes `«Cliente · Destino»` de la fila colapsada (`City Mall Paso Canoa y 3 más · Paso Canoas`). 🩸 **Es un texto que main NUNCA pudo mostrar**: `destinosSummary` lee `guia_items.direccion`, y el listado **no seleccionaba esa columna** — o sea que el destino estaba escrito en el código y salía **siempre vacío**. Ahora viaja (lo necesita el Excel por envío) y el `truncate` que lo corta **ya estaba escrito para eso**.
>   - **+1 recortado a 1024 editando una pendiente** (4 → 5): el `<select>` de empresa y los campos de cliente del formulario, con puntos suspensivos. Los tres son `truncate`, no dato inalcanzable.
> - **Crece hacia abajo, que es lo único que una pantalla puede regalar**: la despachada a 390 pasa de 1.294 px (lectura) a 3.152 px con el formulario abierto.
> - 🔴 **NO SE TOCÓ NINGUNA GUÍA REAL.** El navegador **aborta todo pedido que no sea GET**; nunca se apretó «Despachar» ni «Guardar». Las únicas escrituras bloqueadas son los POST de Sentry, **idénticos en main**.
>
> **EL PARPADEO, y las llamadas** (`BASE=… ETAPA=antes|despues [MODO=clic] [FINO=1] node scripts/_medir-guias-parpadeo-editar.mjs`, capturas a 0 / 100 / 300 / 1000 ms **y un muestreo cada 40 ms** — cuatro instantes sueltos pueden caer justo en el hueco):
>
> | | main | después |
> |---|---|---|
> | por la URL (`?editar=1`, recarga) | vacío → esqueleto 372 ms → formulario **947 ms** | vacío → esqueleto 367 ms → formulario **595 ms** |
> | por el CLIC de la fila (el camino real) | la fila no tenía «Editar» | lista → esqueleto **232 ms** → formulario **541 ms** |
> | cuadros en modo LECTURA | ninguno | **ninguno** |
> | llamadas para abrir «Editar» | **6** | **5** (4 entrando por el clic) |
> | veces que viaja la guía | **2** | **1** |
> | la URL al CERRAR la edición | sigue diciendo `?editar=1` | **`/guias/<id>` limpia** |
>
> - 🩸 **Y EL DEFECTO QUE LA MEDICIÓN CAZÓ, que ningún test de jsdom podía ver:** con solo el inicializador perezoso, **llegar por «Editar» DESDE LA LISTA aterrizaba en LECTURA y no abría nunca** — corregir un nombre costaba **3 toques en vez de 2**, y corregir una factura de una despachada era **imposible**. Recargando esa MISMA URL sí abría, que es lo que lo hacía invisible. La causa: `router.push` de Next actualiza `window.location` y renderiza la ruta nueva **sin garantizar el orden**, así que el inicializador leía la dirección VIEJA. En jsdom la URL ya está puesta antes de montar, así que el candado pasaba en verde. Se tapó con un `useLayoutEffect` —**antes del pintado**, no un `useEffect`— y **el script ahora muere con `exit≠0` si `?editar=1` no abre el formulario**: ese defecto no se puede volver a colar en silencio.
>
> **TOQUES POR TAREA** (`BASE=… node scripts/_medir-guias-toques-por-tarea.mjs`, tocando de verdad, no estimando):
>
> | Tarea | main | después |
> |---|---|---|
> | crear una guía | 1 | **1** |
> | corregir un nombre (pendiente) | 3 | **2** |
> | despachar | 2 | **2** |
> | **imprimir** | **3** (2 hasta la pestaña + otro «Imprimir» adentro) | **2, y sale el papel** — 0 pestañas nuevas, 1 PDF armado, 1 iframe |
> | **compartir** | **3** (no está en la fila: vive dentro de esa vista previa) | **2** desde la fila |
> | **corregir una factura (despachada)** | ⛔ **imposible desde la pantalla** | **2** |
>
> **Y el peso, que no podía subir**: `/guias` **196 kB** y `/guias/[id]` **203 kB** de carga inicial — main mide **196** y **204**. 🩸 La primera versión los dejaba en **344 y 351 kB**: importar `papel-de-la-guia` de arriba arrastraba **jsPDF (~148 kB)** a las dos pantallas que bodega abre desde el celular todo el día. El generador se pide con `await import(…)` y **se precarga al abrir el acordeón / al entrar a la guía**, para que el toque no espere red — en iOS, un `await` de red en el medio hace que el navegador deje de contarlo como gesto y **no abra la hoja de compartir, en silencio**. La pregunta barata («¿esta guía trae renglones?») se mudó a `lib/guias/tiene-renglones.ts` justamente para que hacerla no cueste el PDF.
>
> ### Candados
>
> Casi todos de **CONDUCTA** — montan la pantalla real y tocan los botones. Un barrido de texto sobre el `.tsx` **no puede ver** lo único que importa acá (que los bultos de una guía firmada no se dejen escribir, que lo que se guarda salga por columna, que el papel salga de un toque), y en este repo ya se cumplió **cuatro veces** con el comentario que explicaba el cambio.
>
> | Archivo | Qué prueba |
> |---|---|
> | `components/guias-anotar-numero-tarde.test.tsx` (21) | 🔴 **el corazón**: una guía firmada abre los TRES campos y **NO** los bultos, la dirección, la empresa ni la cabecera; no se firma de nuevo; no se agregan envíos; lo que se corrige sale por `PATCH …/numero-transp` y `PATCH …/item` con su `itemId`; **NUNCA un PUT ni `items`**; solo se escribe el renglón que cambió; mirar y guardar no escribe; esperar no autoguarda; el error del servidor se ve en pantalla |
> | `components/guias-papel-y-marcas.test.tsx` (11) | «Imprimir» imprime y **no abre una pestaña**; «Compartir» es OTRO botón y no imprime; la guía sin renglones no se imprime; el chip «Salió incompleta» y la frase con nombre; una pendiente **no** se marca; **marca, no abre**; y guardar una guía nueva **aterriza en la guía** |
> | `components/guias-lista-unica-envios.test.tsx` (9) | el «Corregir» por renglón **ya no existe**; el camino que queda abre los 7 envíos editables; la lista de solo lectura no convive con el formulario; abrir y no tocar nada **no escribe** |
> | `components/guias-editar-en-la-misma-pantalla.test.tsx` (21) | una despachada ofrece «Editar» y el formulario abre, pero **no** se le agregan envíos ni se le tocan los bultos ni se vuelve a despachar |
> | `components/guias-sin-rechazo.test.tsx` (11) | `Completada` → Editar + Imprimir + Compartir, **nunca Despachar** |
> | `lib/guias-campos-editables.test.ts` (22) | la regla sola: antes de salir todo, después las tres; nada del despacho se cuela; las escrituras que no cambian nada no se hacen |
> | `lib/guias-abrir-en-edicion.test.ts` (10) | solo `?editar=1` abre; un query roto no tumba la pantalla; la URL se limpia al cerrar y conserva los demás parámetros |
> | `lib/guias-faltantes-despacho.test.ts` (12) | qué se marca y **a quién no**; el `"0"` pelado no es placa; y —al revés— que ninguno de los tres marcados esté en `CAMPOS_DESPACHADA` |
> | `api/guias-corregir-item-route.test.ts` | sobre una `Completada` y una `Rechazada`: facturas y cliente **SÍ**, bultos/dirección/empresa **400 sin escribir**, y un cuerpo MIXTO se rechaza **entero** |
> | `lib/guias-chip-nombre-y-candado.test.ts` (10) | los tres textos se fueron **y no vuelven disfrazados** — el barrido va sobre el código **sin comentarios** |
> | `excel-exports-operacion.test.ts` · `iphone-targets-guias.test.ts` · `lib/guias-numero-por-linea-y-papel.test.ts` | el Excel por envío, leído celda por celda; y que la tabla densa siga detrás de `lg:` y su ancho contenido por el `ScrollableTable` |
>
> ### ⚠️ Abiertos, para que los decida Daniel (no se construyeron)
>
> - 🔴 **Las 68 sin placa y las 65 sin «Recibido por» quedan MARCADAS, no completables.** Daniel escribió *"marcadas para completarlas"*, y marcar es lo que se construyó: **abrirlas contradiría el punto 4**, que nombra exactamente tres campos (N° del transportista · cliente · facturas) y no incluye placa ni receptor, y el punto 5 sobre lo que el transportista firmó. Si además quiere poder ESCRIBIRLAS en una guía cerrada, es una decisión nueva: son 133 documentos ya firmados y hay que decidir si se anota "lo que faltó" o se corrige "lo que dice el papel".
> - **`/guias/[id]/imprimir` sigue existiendo** con su vista previa y sus botones. Ya no se llega desde ninguna parte (los dos botones hacen la tarea de una), pero la ruta no se borró: un enlace guardado seguiría abriendo lo que abría. Retirarla es una poda aparte.
> - **El «Corregir» retirado dejaba de rotar los ids**, y el formulario de una guía PENDIENTE sí los rota (usa el PUT). No se pierde nada —el formulario reenvía `cliente_codigo` y el N° de cada línea, y el borrador del despacho guarda los N° tecleados por posición— pero si algún día una guía pendiente llegara a tener otro dato atado por `guia_items.id`, esto habría que revisarlo.


---

## 🔴 Guías — LA DESPACHADA SE VE COMO AL CREAR, Y LO BLOQUEADO SE VE BLOQUEADO (25-ago-2026)

> Daniel probó el #610 en el iPhone y mandó dos capturas con tres pedidos, más uno que salió del mismo repaso. Textual: ***"Editar guía despachada, debe de verse igual que al crear una guía para mantener consistencia y uso fácil"*** · ***"que se vea desbloqueado solo las editables así el usuario no adivina"*** · ***"lo de poner transporte frecuente no le gusta, quita espacio, que sea solo al escribir primeras 2 o 3 letras que aparezca las opciones"*** · ***"Sobre dirección. Muévelo"***.
>
> 🔴 **TODO ESTE PR ES DE PRESENTACIÓN. LO QUE SE PUEDE ESCRIBIR NO CAMBIÓ NI UN CAMPO.** Siguen siendo los tres de siempre (**N° del transportista · cliente · facturas**), siguen saliendo **por columna** (`PATCH …/item` y `PATCH …/numero-transp`), **el candado del PUT sigue intacto**, los **bultos siguen cerrados** y el servidor sigue rechazando **entero** un cuerpo con un campo no permitido. `campos-editables.ts` no se tocó, y sus candados (`lib/guias-campos-editables.test.ts`, `api/guias-corregir-item-route.test.ts`) tampoco.
>
> ### 1 y 2 · 🩸 LOS CINCO ASTERISCOS DE UNA GUÍA FIRMADA
>
> Sobre **GT-229**, ya despachada, la pantalla decía `CLIENTE *` · `DIRECCIÓN *` · `EMPRESA *` · `FACTURA(S) *` · `BULTOS *` — **los cinco con el asterisco rojo de obligatorio, como si los cinco se pudieran tocar**, cuando solo tres se corrigen. Y los tres cerrados salían como **texto suelto**, con otra tipografía y sin la caja del campo: la guía firmada no se parecía a la que se acababa de crear. Había que TOCAR para descubrir cuál era cuál.
>
> ```
> ANTES (GT-229)                          AHORA
> FECHA          2026-08-24               FECHA 🔒        ┌────────────────┐
> CÓMO SALIÓ     Transportista externo                    │ 2026-08-24     │  ← apagado
> TRANSPORTISTA  Edwin                    MODO DE ENTREGA 🔒
> DESPACHADO POR Julio                    …
>
> CLIENTE *      [Outlet Duty Free N3]    CLIENTE         [Outlet Duty Free N3]  ← blanco
> DIRECCIÓN *    Paso Canoas              DIRECCIÓN 🔒    │ Paso Canoas    │  ← apagado
> EMPRESA *      Fashion Shoes            EMPRESA 🔒      │ Fashion Shoes  │  ← apagado
> FACTURA(S) *   [2520]                   FACTURA(S)      [2520]                 ← blanco
> BULTOS *       128                      BULTOS 🔒       │ 128            │  ← apagado
> ```
>
> - **La cabecera pasó a la MISMA grilla del alta** (`grid-cols-1 sm:grid-cols-2`, mismos rótulos, mismo orden) con las cajas apagadas. Antes era otra grilla con otro aspecto, y esa era la mitad de la queja.
> - **En una guía firmada no queda UN SOLO asterisco** —ni en los tres que sí se tocan: ahí no se valida el alta, así que pedir algo "obligatorio" a quien no puede escribir era la otra mitad de la confusión— y **el asterisco NO desapareció del sistema**: al crear sigue exactamente igual. Hay candado en las dos direcciones.
> - **Lo bloqueado se muestra, no se esconde**: misma caja, mismo alto, mismo rótulo, con **fondo apagado, subrayado punteado, texto gris y un candado al lado del rótulo**. Se lee de un vistazo qué se puede cambiar.
> - 🩸 **Y NO ES UN `<input disabled>`**: es un elemento que **no es un campo**. Un input apagado sigue siendo un input —se enfoca con el tabulador, algunos navegadores dejan pegar— y acá el punto es que no haya ningún camino para escribir lo que el servidor va a rechazar. Hay candado que lee el `tagName`.
> - **Quien no ve la pantalla también se entera**: el candado es un dibujo (`aria-hidden`) y al lado va un `sr-only` con *"bloqueado, no se puede cambiar"*. Medido: **17 veces** en GT-229.
> - **Las observaciones se dibujan SIEMPRE**, bloqueadas, aunque estén vacías (dicen "—"). Antes desaparecían: es justo lo que hacía que la guía firmada tuviera otra forma.
> - ⚠️ **ESTO REVIERTE UN CRITERIO PROPIO, y se dice de frente.** El 25-ago se había elegido texto suelto con el argumento de que *"un campo gris que no deja escribir invita a pelearse con él"*. Daniel midió lo contrario en el iPhone. El argumento no era falso: lo que faltaba era que el campo apagado **DIJERA** que está apagado, y eso es el candado.
>
> ### 3 · 🩸 «LOS QUE MÁS USA ESTE TRANSPORTISTA» SE COMÍA MEDIA PANTALLA
>
> Era un bloque **FIJO** con 3 tarjetas (`Álvaro ábrego · Aníbal Arauz · Walter Arauz`) siempre desplegado arriba de «Recibido por», en la única pantalla donde bodega despacha — todos los días, también cuando el chofer era uno nuevo y ninguna de las tres servía. **Ahora es un AUTOCOMPLETADO**: aparece al escribir **2 letras** en «Recibido por» y se esconde solo.
>
> 🔑 **NO SE PERDIÓ NADA DE LO QUE HACÍA, y son las dos cosas que valían:**
> - **Tocar una opción llena LOS TRES campos de una vez** (recibido por · cédula · placa) y los tres quedan editables. Medido en el navegador, en los 4 anchos.
> - 🔴 **EL ORDEN SIGUE SIENDO POR FRECUENCIA, NO POR FECHA.** `juegosQueCoinciden` **FILTRA y conserva el orden que recibe** — reordenar acá (por parecido, por fecha, alfabético) desharía lo medido el 14-ago sobre las 185 guías despachadas: **en los 6 transportistas el orden por frecuencia difiere del orden por fecha**, y en Boston el juego de **10 veces** no es el de la guía más reciente. Medido en pantalla con los juegos REALES de Edwin: `ar` → **`Anibal arauz · 4 veces`** y después **`Walter Arauz · 3 veces`**.
> - **La identidad de un juego sigue siendo cédula + placa, no el nombre** (`juegosMasFrecuentes` no se tocó): acá solo se BUSCA por el nombre, que es lo que se teclea en ese campo.
>
> **Cómo pega:** por el principio del nombre entero (`joc` → `Jocsan murillo`) **o de cualquiera de sus palabras** (`mur` → `Jocsan murillo`, porque el mismo chofer se busca por el apellido). **No pega por el medio** (`osa` no trae a `Jocsan`): con dos letras eso abriría media lista, que es lo que se vino a sacar.
> - ⚠️ **DOS LETRAS ES EL PISO** (`MIN_LETRAS_JUEGO`), y no es un número al azar: con una sola letra la lista de un transportista con muchos juegos se abre casi entera y vuelve a tapar la pantalla. **Con 0 y con 1 letra no se ofrece NADA**, y tampoco se abre al ENFOCAR el campo — solo al escribir.
> - 🔑 **El desplegable es el de la casa** (`DesplegableFlotante`: portal a `<body>` + `fixed`), no un `absolute` colgado del campo. Este formulario vive dentro de contenedores con `overflow`, y ahí un panel absoluto lo recorta el primer ancestro que lo tenga — **subir el z-index NO lo arregla** (30-jul-2026). Cierra con click afuera y con Escape.
> - **Se fue la línea** *"Tócalo y se llenan los tres campos. Puedes cambiarlos después."* — **y NO tenía candado que la exigiera en pantalla**: se buscó en `poda-textos-ayuda`, `marketing-reclamos-toques` y en todo `src/__tests__` antes de tocarla, y no aparece en ninguno. Lo que sí quedó fijado es lo contrario: hay candado que exige que ni ella ni el rótulo del bloque fijo vuelvan.
>
> ### 4 · El aviso que salía DOS VECES
>
> En **GT-230**, *«Falta: el transportista»* aparecía **dos veces en la misma pantalla**: una pegada al encabezado (la barra pegajosa) y otra junto a «Guardar Cambios». Daniel: *"Dejá una sola, la de abajo, que es donde está el botón"*.
> - ⚠️ **ESTO TAMBIÉN REVIERTE UN CRITERIO PROPIO** (23-ago: *"apagar el botón en un lado y explicarlo solo en el otro es la mitad del arreglo"*). Con las dos barras a la vista al mismo tiempo, ese argumento se vuelve el defecto contrario.
> - **El botón de la barra pegajosa NO quedó mudo**: sigue apagado y conserva el mismo texto en su `title`.
> - 🔴 **El invariante del candado es que NINGÚN aviso se repita**, no que haya uno solo en pantalla: el *«Falta: placa, recibido por y cédula»* del bloque de DESPACHO es **otro** aviso, de otro botón, y **no se tocó**.
>
> ### 5 · «Agregar destino» salió del TÍTULO de la sección
>
> Daniel lo abrió en el iPhone y no entendió qué era: un **"＋" pelado pegado al título «Detalle de Envío»** se lee como si fuera a renombrar la sección. Textual: ***"Sobre dirección. Muévelo"***.
> - Ahora vive **debajo de la lista de envíos** —donde se acaba de escribir la dirección— y **DICE qué hace**: `＋ Agregar destino a la lista`. `AddNewInline` ganó un prop OPCIONAL (`textoBoton`); **sin él sale exactamente como siempre**, que es el "＋" a secas de «Despachado por», donde el campo de al lado ya lo explica.
> - ⚠️ **NO vuelve al `<th>` de la tabla** (en móvil ese `<th>` no existe — la razón por la que salió de ahí en su momento) y **sigue siendo UNA sola instancia** para todo el formulario. Alimenta el MISMO `<datalist id="direcciones-list">`; medido en el navegador que la ciudad tecleada aparece en las sugerencias.
> - **En una guía firmada no se ofrece**: la dirección está bloqueada.
>
> ### 🔴 LO QUE **NO** SE TOCÓ
>
> El candado del PUT sobre una guía despachada · `PATCH …/cliente` y `PATCH …/numero-transp` siguen sin mirar el estado · **los bultos de una despachada siguen cerrados** y un cuerpo mixto se rechaza entero · no se agregan ni se quitan envíos de una guía firmada · **no autoguarda** · placa, receptor, cédula y las dos firmas siguen bloqueando el despacho y el N° del transportista **no** · la lista NO despacha · entrega directa sin placa ni transportista · el papel impreso · **nadie gana permisos**.
>
> ### Medición
>
> **Los 4 anchos, en el navegador contra el build de producción, con datos de producción y CONTRA `origin/main` corriendo EL MISMO ARCHIVO** (`BASE=… ETAPA=antes|despues node scripts/_medir-guias-consistencia-anchos.mjs`, solo lectura), en tres pantallas: la **pendiente REAL GT-230** con el formulario abierto · la **despachada REAL GT-229** (la de la captura) · `/guias/nueva`.
>
> | ALTO de la pantalla | 390 | 834 | 1024 | 1440 |
> |---|---:|---:|---:|---:|
> | pendiente editando · main | 2.649 | 2.376 | 1.669 | 1.557 |
> | pendiente editando · **después** | **2.406** | **2.216** | **1.574** | **1.462** |
> | | **−243 (−9,2%)** | −160 | −95 | −95 |
> | despachada editando · main | 2.695 | 2.375 | 1.194 | 1.122 |
> | despachada editando · **después** | **2.949** | **2.452** | **1.277** | **1.214** |
> | | **+254** | +77 | +83 | +92 |
> | `/guias/nueva` · main | 1.542 | 1.342 | 1.194 | 994 |
> | `/guias/nueva` · **después** | 1.530 | 1.348 | 1.194 | 1.000 |
>
> - 🔴 **LA PENDIENTE SE ACORTÓ, que es el punto del encargo**: sacar el bloque fijo de frecuentes le quitó **243 px en el iPhone**. `/guias/nueva` no se movió (±6 px: el "＋" que se mudó de la fila del título a una fila propia).
> - 🔴 **Y LA DESPACHADA CRECIÓ +254 px a 390, DICHO DE FRENTE.** Es el precio de lo que Daniel pidió: la cabecera pasó de 2 columnas compactas a la grilla de una sola columna del alta (4 rótulos + 4 cajas en vez de 4 pares apretados) y las observaciones se dibujan siempre. **Crece hacia ABAJO, que es lo único que una pantalla puede regalar** — arrastre 0 en los cuatro anchos.
> - **0 px de arrastre de página · 0 textos <12 px · 0 asteriscos en la despachada · 14 cajas apagadas** (4 de cabecera + 3×3 de los tres envíos + observaciones) en los 4 anchos. Los **tocables <44 px son IDÉNTICOS a main** (0 · 9 · 9 · 9) y son los campos densos de `pointer:fine` que `GuiaForm` usa a propósito en escritorio. Los **recortados también son idénticos a main** (los `-mx-2` de `SignatureCanvas` y los `truncate` del `<select>` de empresa y del cliente a 1024).
> - **EL AUTOCOMPLETADO, TOCADO DE VERDAD en los 4 anchos**: sin escribir nada → **0 opciones**; escribiendo `ar` → **2 opciones, `Anibal arauz · 4 veces` primero y `Walter Arauz · 3 veces` después**; al tocar la primera los tres campos quedan en `Anibal arauz` / `3-746-1142` / `DG3779` y **la lista se cierra**.
> - 🔴 **NO SE TOCÓ NINGUNA GUÍA REAL.** El navegador **aborta todo pedido que no sea GET**; las únicas escrituras bloqueadas son **2 POST de Sentry**, idénticos en main. Nunca se apretó «Despachar» ni «Guardar Cambios».
> - 🩸 **DOS GOTCHAS DE MEDICIÓN QUE DABAN VERDE (O ROJO) SIN HABER MIRADO NADA.** (a) El asterisco vive en **DOS sitios** —el `<label>` de la tarjeta (que manda bajo `lg`) y el `<th>` de la tabla (que manda desde `lg`)—: contar solo los `label` devolvía **0 asteriscos en escritorio** aunque la tabla los tuviera todos. (b) `innerText` **NO devuelve el texto de un `sr-only`** (está clipeado), así que preguntarle por el candado daba siempre 0 — un rojo del medidor sobre algo que sí estaba puesto; va por `textContent`.
>
> ### Candados
>
> De **CONDUCTA**: **`src/__tests__/components/guias-consistencia-despachada.test.tsx` (18) MONTA la página real** —qué rótulo lleva asterisco y qué caja se puede escribir no lo puede ver un barrido, y en este repo ya se cumplió CUATRO veces con el comentario que explicaba el cambio— y cuenta además **lo que sale por `fetch`**. Más `lib/guias-juegos-autocompletado.test.ts` (19, la regla sola con los juegos REALES de Boston) y `components/guias-direccion-y-juegos.test.tsx`, que **CAMBIÓ DE DIRECCIÓN**: exigía el bloque FIJO —o sea, fijaba lo que Daniel pidió sacar— y hoy exige que nada aparezca antes de las dos letras, que el orden siga siendo por frecuencia y que tocar una opción llene los tres campos.
> - `lib/guias-juegos-despacho.test.ts` también cambió de dirección en un caso: exigía `{externo && juegos.length > 0 && onUsarJuego && (` (el bloque fijo) y hoy exige lo que siempre quiso decir — que en entrega directa no se ofrezca ningún juego.
> - 🩸 **Y un candado de la casa habría dejado de vigilar en silencio:** `iphone-targets-guias.test.ts` buscaba los botones de `AddNewInline` con `className="…"` entre comillas dobles. El "＋" pasó a `className={\`…\`}` al ganar su rótulo, así que el barrido habría bajado de 3 botones a 2 **sin ponerse rojo** — dejando sin vigilar justo el botón que se acababa de tocar. Ahora mira las dos formas.
> - **Verificado por mutación, 28 de 28 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-guias-consistencia.sh`): los bultos / la dirección / la empresa de una guía firmada vuelven a ser campos escribibles · la caja apagada vuelve a ser un input · vuelve el asterisco en la firmada · el asterisco desaparece también al crear · el candado de la fila desaparece · el candado se pone siempre · la cabecera pierde su candado · el candado deja de decirse para quien no ve la pantalla · las observaciones vuelven a esconderse vacías · el autocompletado se abre con 0 letras · y con 1 · el filtro pega por el medio · el filtro no ofrece nunca nada · tocar una opción ya no llena los tres campos · la lista queda abierta al elegir · la opción baja de 44 px · el desplegable no se abre jamás · el filtro reordena y pierde la frecuencia · el filtro se ordena alfabéticamente · **vuelve el «Falta: …» repetido** · el de abajo desaparece · el botón pierde su `title` · «Agregar destino» desaparece · vuelve a pegarse al TÍTULO · el "＋" vuelve a quedarse sin rótulo · el "＋" con rótulo baja de 44 px.
> - 🩸 **El script trae una mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro. **Restaura por COPIA** (hay archivos NUEVOS y `git checkout` aborta el comando entero sin restaurar nada), **denuncia el patrón muerto**, **no usa perl** (así que no hay delimitador `|` que se des-escape y se coma el archivo) y **falla si vitest corrió 0 archivos** — de ahí que la lista vaya como ARRAY (`"${TESTS[@]}"`) y no como un string: en **zsh** una variable sin comillas NO se parte por espacios (`${=TESTS}` sería el equivalente), le llegaría a vitest como UN argumento, correría 0 archivos y todo saldría verde sin haber probado nada.
> - 🩸 **DOS mutaciones fallaron en la primera corrida y las dos eran del SCRIPT, no del producto**: los backticks del nombre de una mutación, **dentro de comillas dobles, los ejecuta el shell** (`absolute: command not found`); y cambiar solo la etiqueta de apertura de `<span>` a `<input>` deja un `</span>` huérfano, el módulo no compila y la mutación prueba que un archivo roto rompe, no el candado.
> - ⚠️ **Una mutación NO se puede hacer desde acá, y se dice:** *"el desplegable vuelve a ser un `absolute`"*. El barrido de `desplegables-flotan.test.ts` exime a todo archivo que MENCIONE `DesplegableFlotante`, así que la mutación fiel tiene que borrar el import **y** el uso — dos ediciones no contiguas, y el aplicador hace UNA literal por corrida a propósito.


---

## 🔴 Guías — BORRAR NO OBLIGA A ABRIR LA GUÍA: el «···» está en la FILA (27-ago-2026)

> Daniel, textual: ***"y darle acceso a secretaria de poder eliminar guias"***.
>
> 🩸 **EL PERMISO YA LO TENÍA, Y ESTÁ MEDIDO.** `DELETE /api/guias/[id]` exige `["admin","secretaria"]` desde siempre y `DELETE_ROLES` de `GuiasList` dice lo mismo; `andrea` y `Angela` son secretaria. **Lo que faltaba era ENCONTRAR el botón**: «Eliminar guía» era el ÚNICO ítem del «···» de la guía **EXPANDIDA**, al lado de «Compartir» — o sea que había que abrir la guía primero.
>
> ### 🔴 SE MOVIÓ, NO SE DUPLICÓ — y «Eliminar» NO salió como botón suelto
>
> El «···» sube a la fila y el de adentro **se retiró en el mismo cambio**: era su único ítem, y dejarlo en los dos lados sería otra vez *«cada cambio deja su puerta»*, que es lo que este módulo viene podando desde el 25-ago. **No se pierde ninguna puerta**: al abrir la guía la fila no desaparece, así que el menú sigue a la vista en la misma pantalla (hay candado que lo prueba con la guía abierta).
> - 🔴 **NO se sacó «Eliminar» a la fila como botón suelto.** La fila ya tiene Editar · Despachar · Imprimir · Compartir, y en un celular un botón de borrar al lado de «Imprimir» es un toque equivocado esperando pasar sobre un documento **firmado**. Queda detrás del menú y detrás de la ventana que exige escribir **ELIMINAR**.
> - **Sigue siendo SOFT DELETE** (`deleted = true`) y la confirmación no se aflojó: el botón rojo nace apagado hasta que la palabra esté escrita.
> - ⚠️ **Solo se dibuja para quien puede borrar** (`canDelete` = admin · secretaria, y **nunca** en `readOnly`): a bodega y a vendedor no les aparece ni el «···». Y **no aparece en modo selección**, que tiene su propia barra de acciones y donde borrar no es una acción de lote.
> - **El rótulo lleva el N° de la guía** (`Más opciones de la guía GT-231`): hay un «···» por fila y *"Más opciones"* a secas no diría de cuál.
> - 🩸 **El «···» va FUERA del `<button>` de la fila.** Un botón dentro de otro es HTML inválido y, peor, el toque abriría el acordeón además del menú — el atajo se convertiría en un toque MÁS. La fila pasó de `w-full` a `flex-1 min-w-0` dentro de un `flex items-stretch`.
>
> ### Toques, contados TOCANDO en el navegador (no estimados)
>
> | | main | esta rama |
> |---|---:|---:|
> | hasta la ventana de confirmación (secretaria) | **3** (abrir la guía · «···» · «Eliminar guía») | **2** |
> | «···» visibles en la fila cerrada | 0 | **1 por fila (15 de 15)** |
>
> ### 🔴 LO QUE **NO** SE TOCÓ
>
> **La lista sigue sin despachar** (ni por swipe ni desplegando nada) y «Editar»/«Despachar» siguen siendo `router.push` — el candado de conducta que toca los dos y verifica que **no salió ni un `fetch`** sigue verde · una `Completada`/`Rechazada` **no muestra «Despachar»** (sí «Editar», desde el 25-ago) · el **candado del PUT** sobre una guía despachada y las **DOS excepciones** que no miran el estado (`PATCH …/cliente` y `PATCH …/numero-transp`) · **nadie gana permisos**: `DELETE_ROLES` es el conjunto de siempre.
>
> ### Medición
>
> **Los 3 anchos + el iPad acostado, en el navegador contra el build de producción, con datos de producción y CONTRA `origin/main` corriendo EL MISMO ARCHIVO** (`BASE=… ETAPA=antes|despues node scripts/_medir-guias-eliminar-fila.mjs`, solo lectura), en **dos roles** (secretaria y bodega) y con la lista **CERRADA**:
>
> | | main | esta rama |
> |---|---|---|
> | arrastre de página (16 casos) | **0** | **0** |
> | textos <12 px | **0** | **0** |
> | tocables <44 px · secretaria | 0 · 1 · 1 · 1 | **idéntico** (el `<input>` del buscador, 39 px, PRE-EXISTENTE) |
> | tocables <44 px · bodega | 0 · 1 · 1 · 1 | **idéntico** |
> | alto de la página | 2.142 · 2.102 · 1.337 · 1.337 | **idéntico** — el «···» no empuja nada hacia abajo |
> | recortados · **bodega** | 2 · 0 · 11 · 0 | **idéntico** |
> | recortados · secretaria | 2 · 0 · 11 · 0 | **4 · 0 · 12 · 2** |
>
> - 🔴 **LA ÚNICA DIFERENCIA, DICHA DE FRENTE: +2 recortes a 390, +1 a 1024 y +2 a 1440, y solo para quien VE el menú.** Son los 44 px que el «···» le quita a la fila, y **los recortados son todos `truncate`** — el resumen `«Cliente · Destino»` de la tarjeta (`Outlet Duty Free N3, S.A. y 1 más`, de 32 a 80 px de puntos suspensivos) y la columna de clientes del escritorio (`flex-[2_1_0] min-w-0 truncate`, 3 px a 1440). **Puntos suspensivos ES el mecanismo, no dato inalcanzable**, y la prueba de que el costo es exactamente el menú es que **bodega —que no lo ve— mide IDÉNTICO a main en los cuatro anchos**.
> - **El «···» mide 44×44 px en los cuatro anchos.**
> - 🔴 **NO SE TOCÓ NINGUNA GUÍA REAL.** El navegador **aborta cualquier pedido que no sea GET** (escrituras bloqueadas: 0), y el script nunca escribe la palabra ELIMINAR ni aprieta el botón rojo.
> - 🩸 **La cookie hay que MINTEARLA** (`scripts/_cookie-medicion-rol.ts <rol>`): el middleware valida el `sessionToken` contra `user_sessions`, así que una cookie firmada a mano muere ahí y lo que se mediría sería la pantalla de LOGIN — verde sin haber mirado nada. Por eso el script **falla si no encuentra ninguna fila**, si la fila cerrada no trae su «···», si el rótulo no dice de qué guía es, si el menú no ofrece «Eliminar guía», si borrar no cuesta 2 toques, si la confirmación no aparece con su campo y su botón apagado, o si a bodega se le dibuja un menú.
> - 🩸 **El acordeón recuerda la fila abierta en `sessionStorage`**: hay que limpiar `guias:expanded` antes de navegar o lo que se mide no es la lista cerrada.
>
> ### Candados
>
> **`src/__tests__/components/guias-eliminar-en-la-fila.test.tsx` (14) MONTA LA PÁGINA REAL de `/guias`**, toca el «···» de una fila **cerrada** y cuenta lo que sale por `fetch`. Un barrido de texto no puede ver lo único que importa —que el menú esté en la fila y no adentro— y en este repo ya se cumplió **cuatro veces** con el comentario que explicaba el cambio.
> - 🩸 **EL MENÚ NO PINTA SUS ÍTEMS HASTA QUE SE ABRE** (`{open && …}` en `ui/OverflowMenu`) y salen por un **PORTAL**: hay que abrirlo y buscarlos en el documento, no en el container.
> - **Verificado por mutación, 13 de 13 cazadas y 0 sobrevivientes** (`bash scripts/_mutar-candados-guias-eliminar-fila.sh`): el «···» se va de la fila · vuelve a quedar **ANIDADO** dentro del botón de la fila · se le dibuja a CUALQUIER rol · `DELETE_ROLES` se abre a bodega · **la SECRETARIA pierde el permiso** · el menú deja de mirar `readOnly` · se queda puesto en modo selección · el ítem apunta siempre a la PRIMERA guía · el rótulo deja de decir de qué guía es · **el menú BORRA DE UNA, sin la ventana** · la ventana acepta confirmar sin escribir la palabra · «Compartir» se cae de la guía abierta · la fila abierta pierde «Editar».
> - 🩸 **UNA sobrevivió en la primera corrida y era un candado FLOJO: `closest()` ARRANCA EN EL PROPIO ELEMENTO**, así que `trigger.closest("button") === trigger` es cierto **con el menú anidado y sin él**. Hay que preguntarle a los PADRES (`trigger.parentElement?.closest("button")`).
> - 🩸 **Y la mutación del anidado tuvo que MOVER el `</button>`, no borrarlo**: borrándolo el JSX queda desbalanceado, el módulo no compila y lo que se probaría es que un archivo roto rompe.
> - 🩸 **El script restaura por COPIA, no con `git checkout`** (hay archivos NUEVOS y git aborta el comando entero sin restaurar nada), **denuncia el patrón muerto** en vez de cantarlo como "SOBREVIVIÓ", **no usa `perl`** (el `||` del código real se des-escapa dentro del patrón y se come el archivo) y trae **una mutación de CONTROL que a propósito no matchea**: si no sale ⛔, el denunciador está roto y todos los ✅ valen lo mismo que un barrido con el comentario adentro.
