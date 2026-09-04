---
name: cerrar-sesion
description: Termina una sesión de trabajo en este repo, o Daniel pregunta «¿qué queda pendiente?», «¿en qué quedamos?», «¿qué hiciste hoy?». Deja docs/estado-actual.md al día (lo que se cerró, las decisiones de Daniel con su cita textual, los pendientes vivos), verifica que nada quedó sin commitear y reporta corto en el formato de Daniel: hecho · pendiente tuyo · pendiente mío. Usar también antes de un cambio de contexto largo o cuando la sesión va a quedar a medias.
---

# Cerrar la sesión

`docs/estado-actual.md` es lo primero que se lee al abrir el proyecto (`CLAUDE.md`, línea 3: *«léelo al empezar cualquier sesión»*). Si no se actualiza al cerrar, la próxima sesión arranca con una foto vieja y vuelve a descubrir lo mismo. El 31-ago se encontraron **6 crons corriendo en producción sin estar documentados** y una nota que afirmó lo contrario del código durante un mes: ese es el costo de no cerrar bien.

**Regla de oro:** el archivo dice lo que HAY, no lo que se quiso hacer. Cada fila se puede verificar con un commit o una medición.

---

## Paso 1 — Listar lo que se hizo, desde git, no de memoria

```bash
git status --short
git log --since="2026-09-03 00:00" --format="%h %ad %s" --date=format:%H:%M     # la fecha de inicio de la sesión
git log --since="…" --stat --format="%h %s" | grep -v "^ *$" | head -80         # qué archivos tocó cada commit
```

Si hubo PRs: `gh pr list --state merged --search "merged:>=2026-09-03"`.

De esa lista salen **temas**, no commits: «Asistencia: cerrar la quincena», «Ventas › Clientes: el cliente se identifica por código». Un tema = una fila.

---

## Paso 2 — Actualizar `docs/estado-actual.md`, sección «Lo que cambió después»

El archivo tiene dos partes: **la foto del 31-ago** tal cual la escribió Daniel (no se toca) y **«Lo que cambió después»**, que mantiene el asistente. Es un delta, no un diario: se edita en el lugar, no se agrega un bloque por día.

Tres cosas, en este orden:

### 2a · Tabla «Cerrado (ya en producción)» — una fila por tema cerrado

```markdown
| tema | qué quedó |
|---|---|
| **Ventas › Clientes** | Tres defectos. (1) Boston estaba dentro de `clientes_master` … City Mall David decía $227.872 y son **$113.936**. … |
```

Qué va en «qué quedó»: la regla vigente, el número medido antes/después, y si depende de algo de Daniel (una migración por aplicar, un dato en Switch). **Sin narrar el proceso.** Si un tema ya tenía fila y hoy avanzó, se edita esa fila.

⚠️ «Cerrado» = está en `main` y desplegado. Un cambio con migración **pendiente de aplicar** se anota con eso en negrita: hasta entonces la pantalla sigue como estaba.

### 2b · Tabla «Decisiones de Daniel» — con la cita textual

```markdown
| decisión | resultado |
|---|---|
| ¿El cliente se identifica por…? | **Código.** *«Todos los D-24 son de City Mall across mis 6 empresas.»* |
```

La cita va **verbatim, entre comillas y en cursiva**, con sus palabras exactas — es lo que el próximo va a necesitar para no reabrir la discusión. Una decisión sin cita es una decisión que alguien va a volver a preguntar. Si la decisión cambia un invariante, también se actualiza la sección «Invariantes por módulo» de `CLAUDE.md` y el post-mortem correspondiente en `docs/postmortems/`.

### 2c · Lista «Pendientes vivos» — quitar, marcar, agregar

- **Quitar** los que se cerraron hoy… o mejor, **marcar ✅** con una línea de qué lo cerró (commit o quién lo hizo) y dejarlos una sesión más para que se vea que se cerraron. En la siguiente sesión se quitan.
- **Agregar** los nuevos, con dueño implícito: los de Daniel dicen «tarea de Daniel» (aplicar una migración, un dato que solo él puede corregir en Switch); los del asistente dicen qué falta hacer y por qué no se hizo hoy.
- **Mantener** el resto tal cual, sin reescribirlos «mejor».

🔴 **Nunca listar como pendiente algo que Daniel ya dijo que quiere olvidar.** Si él cerró un tema («eso déjalo», «no lo quiero», «se queda como está»), no vuelve a la lista bajo otro nombre, ni como «idea», ni como «mejora posible». Se anota, si acaso, en la tabla de decisiones con su cita, y ahí muere. Ejemplos ya cerrados así: el Modo Viaje offline (eliminado, nunca se usó), los presets de quincena (*«el corte es variable»*), fusionar Multifashion con Comisiones (*NO fusionar*).

Y también: `CLAUDE.md` → tabla de **Crons** si entró o salió una entrada de `vercel.json` (el candado `cron-registro.test.ts` protege el código, **no la tabla**), y la sección «Dónde vive cada dato» si nació una tabla o cambió un grano.

---

## Paso 3 — Verificar que nada quedó sin commitear

```bash
git status --short          # tiene que quedar limpio, o con SOLO lo que Daniel dijo que no se commitea
git log origin/main..HEAD --oneline   # commits locales sin pushear
npm test 2>&1 | tail -5     # verde antes de dar por cerrado
```

Si hay archivos sueltos: o entran en un commit con mensaje propio, o se dice explícitamente en el reporte por qué quedan afuera (p. ej. «la migración `20260909120000` queda en el repo pero sin aplicar hasta que la apruebes»). **Nunca «se me quedó»**: lo que queda sin commitear se pierde con la próxima compu robada.

Commit del cierre, separado del trabajo: `docs: estado-actual.md al <fecha>, con el delta de la sesión`. **Solo si Daniel pidió commitear**; si no, se deja listo y se dice.

---

## Paso 4 — Reportar en el formato de Daniel

Tres bloques, corto, con el nombre que él usa para cada pantalla. Sin nombres de tabla, sin narrar.

```
HECHO
· Ventas › Clientes: el cliente se identifica por código; City Mall David $227.872 → $113.936 (= Switch).
· Gastos: un renglón ilegible ya no desaparece; se ve en pantalla y avisa.

PENDIENTE TUYO
· Aplicar la migración «vs 2025 mismos días» — hasta entonces Multi Fashion Holding sigue en +3%.
· Configurar el reloj de ACS (no hay reloj ahí todavía).

PENDIENTE MÍO
· Bajar «Recibos por comprobantes» de Switch para cobros contra factura (sin urgencia, cuando me des la ventana).
```

Reglas del reporte:
- **Hecho** = está en producción o en `main`. Lo que quedó a medias va en «pendiente mío» con qué falta.
- **Pendiente tuyo** = solo lo que **él** puede hacer (aplicar DDL, un dato en Switch, una decisión). Nunca tareas que el asistente podría hacer solo.
- **Pendiente mío** = con la razón por la que no se hizo hoy (falta una definición, una ventana horaria, una aprobación).
- Sin la lista de lo que **no** se va a hacer: lo que Daniel cerró no aparece.

---

## Errores que no hay que repetir

- ❌ Escribir el estado de memoria en vez de desde `git log`.
- ❌ Agregar un bloque «Día N» al final en vez de editar el delta en su lugar.
- ❌ Anotar una decisión de Daniel parafraseada, sin la cita textual.
- ❌ Marcar «cerrado» algo que depende de una migración que él todavía no aplicó.
- ❌ Resucitar como «mejora» un tema que Daniel dijo que quiere olvidar.
- ❌ Poner en «pendiente tuyo» algo que el asistente puede hacer solo.
- ❌ Cerrar con `git status` sucio sin decir qué queda afuera y por qué.
- ❌ Actualizar `estado-actual.md` y dejar `CLAUDE.md` (crons, «Dónde vive cada dato», invariantes) contradiciéndolo.
