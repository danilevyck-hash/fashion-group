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

## 6. Por qué conviene, además de ser obligatorio

- Lo roto **se queda afuera de `main`**, no adentro esperando que alguien mire.
- Cada cambio llega con su vista previa desplegada, para capturas reales del
  «hoy vs propuesta» **antes** de publicar.
- Nadie tiene que vigilar un chequeo: la integración automática lo hace.
