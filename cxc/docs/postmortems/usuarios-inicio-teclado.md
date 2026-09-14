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
