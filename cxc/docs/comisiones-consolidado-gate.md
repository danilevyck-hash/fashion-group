# GATE — Comisiones consolidado (vista "Todas las empresas")

Verificación obligatoria **antes** de construir la vista consolidada vendedor × empresa.

## Pregunta del gate

¿Los nombres de vendedor que devuelve `comision_b2b_v4` **casan EXACTO** entre las 5
empresas que comisionan (vistana, fashion_wear, fashion_shoes, active_shoes,
active_wear) en 2 meses reales? Como `comision_b2b_v4` **no trae `vendedor_id`**, la
única clave de pivote sería el **nombre**. Si un mismo vendedor aparece escrito
distinto entre empresas, el pivot por nombre lo parte en **filas duplicadas** y el
TOTAL por vendedor queda mal.

## Cómo reproducir

```bash
node scripts/gate-comisiones-consolidado.mjs
# lee credenciales de ~/Code/fashion-group/cxc/.env.local (worktree principal)
```

## Resultado — ❌ FALLA (abril y mayo 2026)

```
❌ 1 par MISMO vendedor con grafía divergente entre empresas:
   d=1: "REINALDO ESPINOSA" [fashion_wear, fashion_shoes, active_shoes]
        <≈> "REYNALDO ESPINOSA" [active_wear]
```

**Reinaldo Espinosa** — el vendedor B2B principal — está escrito **REINALDO** en 3
empresas y **REYNALDO** (i→y) en active_wear. Un pivot por nombre exacto lo divide en
**dos filas** para una sola persona, repartiendo mal su comisión total. El chequeo de
igualdad estricta (caso/espacios) NO lo detecta porque normalizan a claves distintas;
solo lo captura la comparación fuzzy (Levenshtein ≤ 2 cruzando empresas).

### Observaciones secundarias

- **DEFAULT** (centinela "cliente sin dueño") aparece en varias empresas. No es una
  persona; hay que decidir si la vista lo consolida en una fila "Sin dueño" o lo oculta.
- **AGUAS** vs **REY STOUTE AGUAS** conviven dentro de vistana (no cruzan empresas, así
  que no afectan el pivot, pero podrían ser la misma persona — revisar aparte).

## Veredicto

El pivot **client-side por nombre exacto (V1) NO es seguro**. Per la decisión cerrada
en el plan, el fallback es promover a una **RPC `comision_b2b_consolidado(p_year, p_mes)`
con identidad de vendedor estable**. Pero ⚠️ en Switch el `vendedorId` **ES el nombre**
(no hay id numérico), así que la RPC tampoco resuelve la identidad por sí sola: hace
falta un **mapa de alias canónico** (ej. `REYNALDO ESPINOSA → REINALDO ESPINOSA`).

**Construcción PAUSADA** a la espera de la decisión de identidad de Daniel.
