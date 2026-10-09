# Usuarios, Inicio y teclado — el porqué

> Post-mortem de lo que se regalaba y no servía (11-sep-2026): los módulos ofrecibles en `/admin/usuarios`, los atajos de teclado que no corrían y las promesas del Inicio. Nació el 14-sep-2026 al mover acá, verbatim, lo que CLAUDE.md decía.


---

## Lo que decía CLAUDE.md hasta el 14-sep-2026 (movido acá, verbatim)

> El 14-sep-2026 CLAUDE.md pasaba de 333 mil caracteres (el tope del harness es 150 mil) y las instrucciones se cortaban a la mitad. Se dejó ahí un resumen de las reglas vigentes y el texto completo —mediciones, citas de Daniel, candados y mutaciones— se movió acá sin cambiar una palabra.

### Usuarios, Inicio y teclado — lo que se regalaba y no servía (11-sep-2026)

- 🔴 **NO SE PUEDE REGALAR UN MÓDULO QUE LA PANTALLA REBOTA.** El editor de «permisos personalizados» de `/admin/usuarios` ofrecía las **20 keys** del catálogo para cualquier rol, pero el `modulos_override` no decide solo: cada módulo tiene su guard y ese guard mira el **ROL**. Medido: **andrea (secretaria) tenía `multifashion`** — la ficha se le pintaba en el Inicio y en el sidebar, la tocaba y `/multifashion` la devolvía a `/home` sin decirle nada. Daniel: *«a Andrea quita Multifashion, porque ahora lo verá en Comisiones»*. Ahora la lista de ofrecibles **se deriva** (`src/lib/modulos-ofrecibles.ts`): un módulo se ofrece a un rol solo si `ALL_MODULES` se lo da a ese rol — la MISMA lista que dibuja el Inicio y de la que salen los `allowedRoles` de las pantallas, comprobado uno por uno por el candado. **El servidor también lo rechaza** (`/api/admin/users`), que es lo que importa cuando la casilla vuelva por cualquier motivo. ⚠️ Consecuencia dicha en voz alta: **el override QUITA módulos, no inventa accesos**; medido, de los 10 módulos de Angela y los 11 de andrea el único que deja de ofrecerse es ese `multifashion`. Migración `20261118120000_andrea_sin_multifashion.sql` (**aplicada y verificada**), por `name` exacto y con `array_remove`. Candado: `usuarios-modulos-ofrecibles.test.ts`.
- ⚠️ **Lo que NO cambió y sigue pendiente**: el override **REEMPLAZA** la lista del rol en vez de sumarla, y la pantalla no lo dice — por eso Angela y andrea, que tienen override sin `asistencia`, no ven Asistencia aunque su rol sí la trae. Es una decisión de Daniel, no un defecto que se pueda arreglar solo.
- 🔴 **El teclado y el Inicio dejaron de prometer lo que no existe.** Ver los bloques *Teclado* y *Smart Features* más abajo: se retiraron `useKeyboardShortcuts` (ningún atajo corría desde el 11-abr-2026), `useBadges`, `useSmartSuggestions`, `SuggestionCard` y la ruta `/api/home-stats` (**cero lectores**). Daniel: *«quita lo que no funciona»*. Candados: `atajos-de-teclado-retirados.test.ts` · `inicio-sin-promesas.test.ts` · `ganchos-sin-uso.test.ts` (cambió de dirección con nota fechada: de los tres ganchos vigilados queda **uno**, `useSessionCheck`, que se conserva desenchufado a propósito).



---

## Registro de overrides por usuario — quién y por qué (7-oct-2026)

> No vivía documentado en ningún lado fuera del código: `fg_users.modulos_override` se podía leer en la base, pero nadie había escrito en un solo lugar quién tiene uno y por qué. Esta tabla es esa deuda, pagada el 7-oct-2026. Medido contra producción ese día — es el estado REAL, no lo que debería ser.

| Usuario | Rol | `modulos_override` | Motivo y fecha |
|---|---|---|---|
| **rodrigo** | bodega | `{guias,catalogos,referencia,marcacion}` | **14-sep-2026**, migración `20261125120000_rol_marcacion_y_rodrigo.sql`. Daniel aprobó el reloj del teléfono para cuatro personas que trabajan afuera (textual: *«ponle marcación al módulo»*, *«rodrigo es bodega con marcacion»*). Rodrigo pasó de `vendedor` a `bodega` + el módulo `marcacion` por override: un rol solo no alcanzaba para las dos cosas, y agregarle `bodega` al `roles[]` de Marcación se lo habría abierto a TODOS los bodega. Pierde CXC y el directorio de Clientes (los tenía por ser vendedor); gana Guías con despacho y Marcación. |
| **angel** | bodega | `{guias,catalogos,referencia,marcacion}` | **Sin migración ni commit que lo documenten por nombre.** Medido en producción: la fila nace el **15-sep-2026** (un día después de la de Rodrigo) ya con este mismo override. Mismo patrón exacto — bodega + `marcacion` —, así que todo indica que es parte del mismo rollout del reloj del teléfono, pero no hay una cita de Daniel ni un archivo que lo confirme. Queda señalado para que quien lo audite no lo tome por inventado ni por documentado: es lo que la base dice, sin más respaldo escrito. |
| **julio** | bodega | `{guias,catalogos,referencia}` | **7-oct-2026**, migración `20270107200000_julio_sin_asistencia.sql`. Mismo pedido y mismo motivo que Jorman: Daniel pidió quitarle Asistencia y planilla también a Julio, que tampoco tiene ninguna fila en `asistencia_aprobador_empresa` — la pantalla «Aprobaciones» le salía vacía. El override le quita exactamente `asistencia` y conserva el resto de lo que `bodega` trae (leído de `role_permissions` al correr la migración, no copiado a mano). No se le agregó `marcacion`: no se pidió y no corresponde a su caso. |
| **jorman** | bodega | `{guias,catalogos,referencia}` | **7-oct-2026**, migración `20270102120000_jorman_sin_asistencia.sql`. Daniel: *«Jorman no debería ver asistencia»*. Jorman no tiene ninguna fila en `asistencia_aprobador_empresa` (no es aprobador de ninguna empresa), así que el módulo «Asistencia y planilla › Aprobaciones» que el rol `bodega` le daba se le abría **vacío y sin uso**. El override le quita exactamente `asistencia` y conserva el resto de lo que `bodega` trae (leído de `role_permissions` al correr la migración, no copiado a mano — mismo patrón que Rodrigo). No se le agregó `marcacion`: no se pidió y no corresponde a su caso. |

⚠️ **Dato aparte, sin tocar nada**: la cuenta compartida `Bodega` (rol `bodega`, sin override) SÍ tiene filas en `asistencia_aprobador_empresa` — aprueba por `fashion_wear` y `vistana` desde el 1-sep-2026. A diferencia de Jorman y Julio, para esa cuenta el módulo Asistencia **sí tiene uso real** (es aprobadora de dos empresas), así que no es un caso igual al de Jorman/Julio y no se tocó.

---

## Data Health se fue de la pantalla (movido desde CLAUDE.md el 14-sep-2026, verbatim)

- **Administración:** Usuarios (🩸 **Data Health se fue de la pantalla el 11-sep-2026** — la ficha ya se había retirado el 13-ago para volverse pestaña de Usuarios, y ese día se retiró también la pestaña. Daniel: *«data health quiero que el sistema o tú mida todo pero no verlo… no lo uso y no lo quiero usar»*. 🔴 **La medición se quedó ENTERA** — ver `docs/donde-vive-cada-dato.md` › `data_integrity_checks`)


## Lo que el Inicio prometía y no existía — el texto que vivía en CLAUDE.md (movido el 19-sep-2026)

- 🩸 **Tres cosas que esta lista prometía y NO EXISTÍAN EN NINGUNA PANTALLA** (retiradas el 11-sep-2026; Daniel: *«quita lo que no funciona»*): el **feed «Acciones pendientes»** —su ruta `/api/home-stats` seguía viva y consultando la base **sin un solo lector**—, los **contadores del 🔔** (`useBadges` quedó sin importadores en el rediseño del home del **29-abr-2026**) y las **💡 sugerencias proactivas** (`SuggestionCard` no se dibujaba en ningún lado y `useSmartSuggestions` solo se llamaba en `/cxc`, donde el propio código decía «SuggestionCard removed from render» y le pasaba una lista vacía). Se retiró el CÓDIGO MUERTO; no se construyó nada. ⚠️ La **campana 🔔 SÍ existe y funciona** — es el historial de avisos de `NotificationCenter`, que nunca usó ese gancho. ⚠️ `/api/notification-badges` **se queda sin llamadores** porque la nombran por su ruta tres candados de otros módulos (mismo trato que `/api/cxc/contact-log`). Candado: `inicio-sin-promesas.test.ts`.


---

## Lo que decía CLAUDE.md del teclado y de la búsqueda global, hasta el 19-sep-2026 (movido aquí, verbatim)

> Mismo motivo que el bloque de arriba: el 19-sep-2026 entró a CLAUDE.md la regla del conector de Supabase y había que hacerle sitio. Allá quedó la regla en una línea; el texto completo, con sus fechas y su 🩸, es éste.

### Teclado

- 🩸 **Todo lo demás se retiró el 11-sep-2026** (Daniel: *«quita lo que no funciona»*). Acá se prometían la `/` para buscar, la ayuda «?», los saltos `G+…` a inicio · CXC · guías · cheques · reclamos, el `J/K` para moverse por filas y la `E` para editar — y **ninguno corría**: `useKeyboardShortcuts` no tenía un solo importador desde el **11-abr-2026**, cuando se borró `KeyboardShortcutsProvider.tsx`, que además nunca se había montado en una pantalla. El costo real: el 5-sep-2026 alguien editó ese archivo y el cambio entero fue `q: "/cheques"` → `q: "/recordatorios"`, o sea que se corrigió con cuidado un atajo que no llevaba a nadie a ninguna parte. ⚠️ La `/` **tampoco existió nunca**: se quitó de la doc en vez de inventarla. Candado: `atajos-de-teclado-retirados.test.ts`.

### Búsqueda global — cada resultado lleva a donde dice (11-sep-2026)

- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja). 🔴 **Cada resultado LLEVA a donde dice** (11-sep-2026): una **guía** abre `/guias/<id>` —decía `/guias?id=`, que el middleware convierte en la HOJA DE IMPRIMIR—, un **cliente** abre su ficha `/clientes/<codigo>`, un resultado de **Ventas** abre `?tab=clientes&cliente=<CÓDIGO>` —decía `?search=`, que no lee nadie— y un gasto de **Caja** abre su período `/caja/<id>` —decía `?periodo=`, tampoco leído—. 🔴 El código del cliente de Ventas sale del **puente por ID** (`switch_facturas` → `switch_clientes` → `codigo`), **nunca del nombre**; sin código se abre la pestaña Clientes sin preseleccionar. ⚠️ El gasto de Caja no queda **resaltado** dentro de su período: eso pide que la pantalla de Caja lea un parámetro y hoy no lee ninguno — pendiente, no olvido. Candado: `busqueda-global-destinos.test.ts`.

---

## Lo que decía CLAUDE.md hasta el 22-sep-2026 (movido acá, verbatim)

### Usuarios, Inicio y teclado — lo que se regalaba y no servía (11-sep-2026)

> Detalle completo (mediciones, citas, candados, mutaciones): [docs/postmortems/usuarios-inicio-teclado.md](docs/postmortems/usuarios-inicio-teclado.md) › «Lo que decía CLAUDE.md hasta el 14-sep-2026».
> ⚠️ Las reglas de PANTALLA de este módulo (qué se dibuja, dónde, rótulos, tamaños) viven SOLO en ese postmortem: léelo antes de tocar una pantalla suya.

- 🔴 NO SE PUEDE REGALAR UN MÓDULO QUE LA PANTALLA REBOTA: los ofrecibles de «permisos personalizados» se derivan (`src/lib/modulos-ofrecibles.ts`) —a un rol solo se le ofrece lo que `ALL_MODULES` le da— y el servidor lo rechaza igual (`/api/admin/users`). Candado: `usuarios-modulos-ofrecibles.test.ts`.
- ⚠️ El override REEMPLAZA la lista del rol en vez de sumarla, y la pantalla no lo dice. Decisión pendiente de Daniel.
- 🔴 El teclado y el Inicio dejaron de prometer lo que no existe: se retiraron `useKeyboardShortcuts`, `useBadges`, `useSmartSuggestions`, `SuggestionCard` y `/api/home-stats`, sin lectores; queda `useSessionCheck`, desenchufado a propósito. Candados: `atajos-de-teclado-retirados.test.ts` · `inicio-sin-promesas.test.ts`.

## Smart Features
- **Búsqueda global:** 8 módulos (CXC, Reclamos, Guías, Directorio, Cheques, Ventas, Préstamos, Caja). 🔴 **Cada resultado LLEVA a donde dice** (11-sep-2026): la **guía** abre `/guias/<id>`, el **cliente** su ficha `/clientes/<codigo>`, el de **Ventas** `?tab=clientes&cliente=<CÓDIGO>` y el gasto de **Caja** su período `/caja/<id>`. 🔴 El código del cliente de Ventas sale del **puente por ID** (`switch_facturas` → `switch_clientes` → `codigo`), **nunca del nombre**. ⚠️ El gasto de Caja no queda resaltado dentro de su período: pendiente, no olvido. Candado: `busqueda-global-destinos.test.ts`. Detalle en [el postmortem](docs/postmortems/usuarios-inicio-teclado.md).
- **La caja de buscar del Inicio es de los mismos CINCO roles que en todo el sistema** (`SEARCH_ROLES`, 11-sep-2026): estaba escrita a mano como `["admin","secretaria"]`, así que contabilidad y vendedor entraban al Inicio sin caja de buscar y la encontraban arriba en cualquier módulo.
- **Spotlight:** "cheques que vencen mañana" → ⚡ quick action con deep link
- **Búsquedas recientes:** últimas 5 + "Ir a..." shortcuts de módulos
- **Smart defaults:** recuerda última categoría, empresa, banco, transportista (localStorage `fg_last_*`)
- 🩸 **Tres cosas que esta lista prometía y NO EXISTÍAN EN NINGUNA PANTALLA** (retiradas el 11-sep-2026): el feed «Acciones pendientes», los contadores del 🔔 y las 💡 sugerencias. Se retiró CÓDIGO MUERTO; no se construyó nada. ⚠️ La **campana 🔔 SÍ funciona** (`NotificationCenter`, que nunca usó ese gancho) y `/api/notification-badges` se queda sin llamadores porque la nombran tres candados. Detalle en [el postmortem](docs/postmortems/usuarios-inicio-teclado.md). Candado: `inicio-sin-promesas.test.ts`.
- **Draft auto-save:** formularios de reclamos, guías, cheques se guardan cada 5s en localStorage
- **Time grouping:** cheques y guías agrupados por "Hoy/Esta semana/Vencidos"- **Contextual color:** tinte rojo/ámbar ambient cuando hay datos urgentes
- **Inline previews:** último contacto, días para depósito, próxima deducción visibles sin expandir
- **Hover preview:** cards ricas al hover sobre el nombre de un cliente — vive en **Ventas › Clientes** (`ClienteHoverCard`), NO en Cuentas por Cobrar (verificado 3-sep-2026: el CXC no tiene hover; su detalle es la fila expandida, con desglose por empresa y «Últimos pagos»)
- **URL state:** filtros persisten en URL (?risk=vencido&empresa=fashion_wear) — deep links y back/forward funcionan
- **UI persistence:** filas expandidas y scroll position sobreviven navegación (sessionStorage)
- **Offline:** banner "Sin conexión" (informativo) + botones deshabilitados sin red. NO hay lectura offline: el Modo Viaje (snapshots localStorage + cache de páginas del SW) se eliminó en jul 2026

## Teclado (lo único que corre)
- **`⌘K` / `Ctrl+K` — abrir la búsqueda global.** Tiene su propio listener dentro de `SearchBar.tsx` y nunca dependió de ningún gancho.
- 🩸 **Todo lo demás se retiró el 11-sep-2026** (Daniel: *«quita lo que no funciona»*): la `/` para buscar, la ayuda «?», los saltos `G+…`, el `J/K` por filas y la `E` para editar **nunca corrieron** —`useKeyboardShortcuts` estaba sin un solo importador desde el 11-abr-2026—. Candado: `atajos-de-teclado-retirados.test.ts`. Detalle en [el postmortem](docs/postmortems/usuarios-inicio-teclado.md).
- El **clic derecho** en filas de CXC y Recordatorios se había retirado antes, con el rediseño de esos dos módulos (ver sus bloques).

---

## Inicio estilo Apple — propuesta APAGADA (9-oct-2026, `INICIO_APPLE_2026_10`)

La pregunta de la pantalla: **«¿a qué módulo voy?»**. Medido 25-sep → 9-oct (`visitas_modulo`): a dónde va la gente después del Inicio es Despachos 169 · Catálogos 124 · Asistencia 104 · Plantilla Switch 48 · Multifashion 44 · Comisiones 43. Las secretarias ven 11 módulos; el admin, 21. **No se esconde ningún módulo.**

- **Celular**: lista agrupada como Ajustes del iPhone (renglón de 44 px, ícono a color, ›), la MISMA forma de la hoja «Más» y del menú.
- **Computadora**: ficha horizontal (ícono + nombre) de 56 px, ícono con el color del módulo (`getModuleColorByKey`, como la barra lateral), 4 columnas.
- **Buscador** al ancho del contenido (`<SearchBar alineado />`), no centrado.

`false` = el Inicio de hoy, byte por byte: candado `src/__tests__/components/inicio-apple-apagado.test.tsx` (foto del HTML tomada con el código de `origin/main` antes del cambio, admin y secretaria; prendido se pone rojo). Mockup con capturas reales: hoy vs recomendación. Se prende con el «sí» de Daniel.

---

## Usuarios estilo Apple — PRENDIDO (9-oct-2026, `USUARIOS_APPLE_2026_10`)

La pregunta de la pantalla: **«¿quién entra al sistema y con qué rol?»**. Medido el 9-oct-2026: 17 usuarios, los 17 activos; ninguna visita registrada en dos semanas (uso ocasional, solo admin).

1. **Agrupada por rol** en el orden de `SYSTEM_ROLES`, un renglón por persona (`ListaPorRol`), en vez de 17 tarjetas en orden de creación (celular: 3.300 px → 1.900).
2. **Sale «Activo»** de los 17; solo se dice «Inactivo». Segunda línea: empresa · permisos personalizados · última sesión.
3. **El nombre capitalizado en pantalla** (`capitalizarNombre`); el dato no se toca.
4. **Tocar el renglón abre «Editar usuario»** (sale el lápiz); «Desactivar» al final del renglón. Computadora: **«＋ Nuevo usuario» en la fila de las pestañas** (un solo botón en el archivo, `botonNuevoUsuario`).

**Prendido el 9-oct-2026** con el «sí» de Daniel. `false` = la pantalla de antes: candado `src/__tests__/components/usuarios-apple-apagado.test.tsx` (HTML de `origin/main` antes del cambio; prendido, rojo).
