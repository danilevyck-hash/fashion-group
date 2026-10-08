# Cómo se publica desde el 7-oct-2026: por solicitud de cambio, nunca por push directo

> **Esto reemplaza el flujo de siempre de este repo.** Hasta hoy se publicaba
> empujando commits DIRECTO a `main`, docenas de veces por hora. **Ya no entra.**
> Si un agente intenta el push directo, GitHub lo rechaza. Lo que sigue es el
> camino nuevo, completo.

---

## 1. Por qué cambió

El 7-oct-2026 se prendió `enforce_admins` en la protección de la rama `main`
(ver [`github-enforce-admins.md`](./github-enforce-admins.md) para el detalle de
ese cambio). `main` ya exigía dos chequeos obligatorios:

| Chequeo | Quién lo corre | Cuánto tarda |
|---|---|---|
| `pruebas` | GitHub Actions (las ~19.700 pruebas) | 6–11 min |
| `Vercel` | Vercel, al desplegar la vista previa | 3 min de build, **pero puede quedar en cola** |

Antes, la cuenta de Daniel —administradora— se los **saltaba**: el candado
existía pero no protegía nada. Ahora los cumple igual que cualquier otra. El
efecto práctico es que **el push directo a `main` ya no se acepta**: un commit
recién empujado no tiene todavía resultado de chequeos para ese SHA, así que
GitHub no tiene cómo saber si pasa, y lo rechaza.

🩸 Lo que costó entenderlo: el mismo día quedaron **cuatro cambios ya aprobados
frenados** en solicitudes abiertas (#663, #664, #665, #666), porque los agentes
seguían asumiendo el push directo.

## 2. El camino nuevo, paso a paso

```
rama propia  →  solicitud de cambio  →  integración automática  →  verde  →  entra sola
```

1. **Rama aparte, en un worktree aparte.** Nunca se trabaja sobre `main`, y
   nunca `git stash` (ver regla en la skill `asi-se-construye`).
2. **Se abre la solicitud de cambio** contra `main`:
   ```bash
   gh pr create --base main --title "…" --body "…"
   ```
3. **Se prende la integración automática en el acto**, sin esperar el verde:
   ```bash
   gh pr merge <n> --auto --squash
   ```
   A partir de ahí **GitHub la integra solo cuando los dos chequeos estén en
   verde**. Nadie tiene que vigilarla. Si se queda roja, simplemente no entra.
4. **Se comprueba de verdad que entró**, nunca se asume:
   ```bash
   gh pr checks <n>                  # estado de los dos chequeos
   git branch -r --contains <sha>    # ¿está el commit en origin/main?
   vercel ls fashion-group --limit 5 # ¿quedó un deploy de producción en Ready?
   ```

**La integración automática a nivel de repositorio ya está prendida**
(`allow_auto_merge = true`, 7-oct-2026). No hay que volver a activarla.

## 3. Lo que NUNCA se hace

- ❌ **Nunca `--force`**, de ninguna forma, sobre `main`.
- ❌ **Nunca `gh pr merge --admin`** para saltarse un chequeo. Existe, funciona,
  y es exactamente el agujero que `enforce_admins` vino a cerrar.
- ❌ **Nunca apagar `enforce_admins`** —ni «un minutito»— para publicar. No es
  una salida de emergencia: es volver al estado que no protegía nada. Si algo
  está tan urgente que parece justificarlo, **se le avisa a Daniel y decide él**.
- ❌ **Nunca arreglar una prueba roja a lo loco** para que pase el chequeo. Si
  queda en rojo: se dice **cuál** y **por qué**.
- ❌ **Nunca `gh run watch`**: bloquea la sesión durante minutos. Se consulta
  cada tanto con `gh pr checks <n>` o
  `gh run list --workflow pruebas --limit 5`.

## 4. Varias solicitudes a la vez: el orden importa

Cuando dos solicitudes tocan los mismos archivos, se integran **de a una**, y
primero la que menos choque. Se mira el solapamiento antes de decidir:

```bash
comm -12 <(git diff --name-only $(git merge-base origin/main origin/<rama-a>) origin/<rama-a> | sort) \
         <(git diff --name-only $(git merge-base origin/main origin/<rama-b>) origin/<rama-b> | sort)
```

- La que **no solapa con nadie** va primero.
- La que solapa con varias va **al final**, y se rebasa sobre `main` cuando las
  otras ya entraron.
- **Rebasar cuesta una pasada entera de chequeos** (y un turno nuevo en la cola
  de Vercel). Así que **solo se rebasa si GitHub reporta conflicto de verdad**
  (`mergeable: CONFLICTING`), no «por si acaso».
- Después de cada integración se comprueba que `main` **siga en verde**.

## 5. La cola de Vercel es el cuello de botella real

Este proyecto construye **una vista previa a la vez**. Las vistas previas de las
demás solicitudes esperan en fila, y cada build toma ~3 min —pero una que se
cuelga en `Linting and checking validity of types` puede retener el turno
**media hora o más**, y detrás no avanza nada.

Por eso el chequeo `Vercel` puede quedar en `pending` mucho después de que
`pruebas` ya esté en verde. **Eso no es una falla y no se fuerza:**

```bash
vercel ls fashion-group --limit 8   # ¿cuántas Queued, cuál está Building?
vercel inspect <url> --logs         # ¿en qué paso se quedó?
```

🩸 **Una vista previa colgada de otra rama no se cancela por cuenta propia.**
Puede ser el trabajo de otro agente. Se reporta y decide Daniel. La integración
automática ya está prendida: cuando la cola drene, las solicitudes entran solas.

### 5.1 Por qué se colgaba, y qué se hizo (7-oct-2026)

🩸 **El síntoma.** Ese día 6 vistas previas se quedaron en
`Linting and checking validity of types` **sin una línea de salida** hasta el
límite de 45 min (`BUILD_EXCEEDED_MAXIMUM_TIME`). Otras 4 vistas previas y
2 construcciones de producción de `main` se cancelaron colgadas en ese mismo
paso, y 2 más murieron por memoria (`SIGKILL`). Lo normal de ese paso es
1 a 1,5 min. No
dependía del código: el mismo commit (`6f6ddf0`) pasó en producción y se colgó
como vista previa.

**La causa más probable:** memoria. La máquina de build es la estándar
(4 núcleos, 8 GB). `next build` corre el chequeo de tipos en un proceso aparte
que necesita ~3,3 GB por sí solo, mientras el proceso principal sigue con la
memoria de webpack. Cuando el sistema mata ese proceso, Next se queda
esperándolo para siempre. Cada vez pasaba más seguido, a medida que crece el
código.

**Lo que se hizo:** el chequeo de tipos **salió del build de Vercel y pasó a
«pruebas»** (#670).

| Dónde | Qué |
|---|---|
| `cxc/next.config.js` | `typescript: { ignoreBuildErrors: true }`: Vercel ya no chequea tipos. |
| `cxc/tsconfig.typecheck.json` | Extiende `tsconfig.json` y deja fuera `__tests__`, `__mocks__`, `*.test.*` y `*.spec.*`, **lo mismo que filtraba `next build`** (`regexIgnoredFile` de Next 14.2). Las pruebas traen ~330 errores de tipos viejos (mocks de `fetch`, `@ts-expect-error` sin uso) que el build nunca miró. |
| `cxc/package.json` | `npm run typecheck` = `tsc --noEmit -p tsconfig.typecheck.json` (~12 s, ~2,3 GB). |
| `.github/workflows/pruebas.yml` | Paso «Chequeo de tipos», antes de las pruebas. |

**No se perdió ningún control.** «pruebas» es chequeo obligatorio de `main`:
un error de tipos no entra. Se comprobó metiendo a propósito
`const x: number = "texto"` en `src/lib/pdf-tabla.ts`. «pruebas» se puso en
rojo (`error TS2322`, run 37701968001) y después se sacó.

**Lo que cambió en el build:** se ahorra el paso entero de tipos, que eran
56 a 95 s cuando terminaba y 45 min cuando se colgaba. El build de la vista
previa de #670 tardó 2 min y el chequeo de tipos ya no aparece en el log.

⚠️ **Lo único que `tsc` no ve:** `.next/types/**`, los tipos que Next genera
en el build para comprobar los exports de `page.tsx` y `layout.tsx`. Ahí solo
caen errores como exportar de una página algo que Next no permite. Si alguna
vez hace falta, se cubre corriendo `next build` en «pruebas».

🔑 **Para una rama vieja** (creada antes de #670): su vista previa todavía
chequea tipos y se puede colgar. Se arregla con `gh pr update-branch <n>`, que
le trae `main` sin tocar su código. Su vista previa vieja queda obsoleta y se
puede cancelar.


## 6. Por qué conviene, además de ser obligatorio

- Lo roto **se queda afuera de `main`**, no adentro esperando que alguien mire.
- Cada cambio llega con su vista previa desplegada, para capturas reales del
  «hoy vs propuesta» **antes** de publicar.
- Nadie tiene que vigilar un chequeo: la integración automática lo hace.
