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
