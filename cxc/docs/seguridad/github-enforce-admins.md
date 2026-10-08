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

## ⚠️ Cómo cambia el comportamiento del push de ahora en adelante

Este repo publica empujando commits DIRECTO a `main` (no por Pull Request),
docenas de veces por hora entre Daniel y los agentes que trabajan bajo su
cuenta. Los chequeos (`Vercel`, `pruebas`) corren DESPUÉS de que el commit ya
está en GitHub, nunca antes.

Con `enforce_admins` prendido, es posible que un push directo a un commit
TOTALMENTE NUEVO —que todavía no tiene ningún resultado de chequeo registrado
para ese SHA exacto— **se trabe o se rechace**, porque GitHub no tiene cómo
saber todavía si ese commit pasa. Si eso pasa:

- **No fuerces nada** (nunca `--force`, nunca saltar el candado a mano).
- Avísale a Daniel con el mensaje exacto de GitHub.
- La salida de emergencia es apagar `enforce_admins` (los tres pasos de
  abajo), publicar, y volver a prenderlo cuando se entienda el patrón nuevo.

## Los tres pasos para apagarlo en una emergencia, desde la web de GitHub

Daniel, esto es para que puedas desbloquearte SOLO, sin depender de nadie:

1. Entra a `github.com/danilevyck-hash/fashion-group` → pestaña **Settings**
   → en el menú de la izquierda, **Branches**.
2. En la fila de la regla de `main`, toca **Edit**.
3. Busca la casilla **«Do not allow bypassing the above settings»** (es la
   que dice que los chequeos también aplican a los administradores) y
   **desmárcala**. Baja al final y toca **Save changes**.

Con eso, tu cuenta vuelve a poder publicar en `main` aunque algún chequeo
esté en rojo o pendiente — exactamente como funcionaba antes del 7-oct-2026.
