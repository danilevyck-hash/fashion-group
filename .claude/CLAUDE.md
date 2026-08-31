# Fashion Group — monorepo

Este repo contiene **fashiongr.com**, el ERP interno del grupo (8 empresas, Panamá).
La aplicación vive en `cxc/` — Next.js 14 (App Router) + Supabase + Vercel.

## Dónde está lo importante

- **`cxc/CLAUDE.md`** — la referencia viva: stack, roles, módulos, crons, invariantes por módulo.
  Leerlo antes de tocar `cxc/`.
- **`cxc/docs/postmortems/*.md`** — el porqué de cada invariante, verbatim (mediciones, candados, 🩸).
- **`cxc/docs/historico/superado.md`** — módulos retirados y decisiones que ya no describen el sistema.

`.claude/rules/**` son reglas genéricas por lenguaje; ante un conflicto, manda `cxc/CLAUDE.md`.
