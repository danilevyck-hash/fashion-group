// Servidor de producción para MEDIR, arrancado por la API programática de Next
// en vez de `next start`.
//
// 🩸 POR QUÉ: cuando hay varios agentes trabajando en paralelo, alguno corre
// `pkill -f "next start"` para limpiar SU servidor y se lleva puestos los de
// los demás a mitad de una medición (pasó: la corrida murió en el 4º ancho con
// ERR_CONNECTION_REFUSED). Arrancado así, la línea de comando es
// `node scripts/_srv-medicion.mjs` y ese pkill no lo toca.
//
//   PORT=3169 node scripts/_srv-medicion.mjs

import { createServer } from "http";
import next from "next";

const port = Number(process.env.PORT ?? 3169);
const app = next({ dev: false, dir: process.cwd() });
const handle = app.getRequestHandler();

await app.prepare();
createServer((req, res) => handle(req, res)).listen(port, () => {
  console.log(`listo en http://localhost:${port}`);
});
