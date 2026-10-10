# GitHub › `main` exige los chequeos también a los administradores

## Qué se activó

`enforce_admins` en la protección de la rama `main` del repo
`danilevyck-hash/fashion-group`. Antes estaba en `false`: la rama exigía los
dos chequeos obligatorios (`Vercel` y `pruebas`) pero las cuentas
administradoras —la de Daniel— se los saltaban al publicar directo. Con
`enforce_admins = true`, un push o un merge directo a `main` necesita que
`Vercel` y `pruebas` estén en verde, **también si lo hace un administrador**.

## Cuándo

7-oct-2026.

## Por qué

Daniel lo autorizó: quiere que su propia cuenta cumpla los mismos chequeos
que le exige a cualquier otra. Antes, al ser administrador, su push se
publicaba aunque las pruebas o el deploy de Vercel fallaran — el candado
existía pero no protegía nada en la práctica.

## Qué comprobé antes de prenderlo

- No había ningún Pull Request a medio revisar en los últimos días (el único
  PR abierto, #633, es de agosto y está inactivo).
- No había cambios locales sin publicar en el checkout principal, fuera de
  las 3 líneas sin commitear de `cxc/docs/diseno.md` que ya se sabía que
  había que dejar quietas.
- Sí había un push reciente a `main` con las pruebas todavía corriendo
  (`pruebas` en `in_progress`, `Vercel` en `pending`). Eso no corre riesgo:
  esa pasada ya estaba adentro de `main` antes de prender el candado, y
  termina sola, sin que la protección de rama la toque — la protección
  gobierna el PRÓXIMO push, no los que ya se aceptaron.

## Verificado después de prenderlo

Lectura independiente (`GET`, no el resultado del propio `POST`) contra
`repos/danilevyck-hash/fashion-group/branches/main/protection/enforce_admins`:

```json
{ "enabled": true }
```

Leído de nuevo el 9-oct-2026 (solo `GET`): sigue en `true`, con `Vercel` y
`pruebas` como chequeos obligatorios.

## ⚠️ Cómo cambia el comportamiento del push de ahora en adelante

Antes de este cambio, el repo publicaba empujando commits DIRECTO a `main`,
docenas de veces por hora entre Daniel y los agentes que trabajan bajo su
cuenta. Con `enforce_admins` prendido **el push directo ya no entra**: un
commit recién empujado no tiene todavía resultado de chequeos para ese SHA, así
que GitHub no tiene cómo saber si pasa, y lo rechaza.

Desde el 7-oct-2026 se publica **por solicitud de cambio**: rama propia →
`gh pr create --base main` → `gh pr merge <n> --auto --squash` en el acto →
GitHub la integra sola cuando `pruebas` y `Vercel` estén en verde. El camino
completo está en
[`publicar-por-solicitud-de-cambio.md`](./publicar-por-solicitud-de-cambio.md).

Si algo se traba:

- **No fuerces nada**: nunca `--force`, nunca `gh pr merge --admin`.
- **Nunca apagar `enforce_admins`** —ni «un minutito»— para publicar. No es
  una salida de emergencia: es volver al estado que no protegía nada.
- Si algo está tan urgente que parece justificarlo, **se le avisa a Daniel con
  el mensaje exacto de GitHub y decide él**.

> 🔁 Corregido el 7-oct-2026: la primera versión de este documento decía que
> «la salida de emergencia es apagar `enforce_admins`» y traía los pasos para
> desmarcarlo. Eso contradecía la regla de
> [`publicar-por-solicitud-de-cambio.md`](./publicar-por-solicitud-de-cambio.md)
> y se quitó.
