// Servidor de desarrollo sin dependencias. Solo escucha en el equipo local.
const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const raiz = __dirname;
const tipos = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".md": "text/plain",
};
const puerto = Number(process.env.PORT || 8765);

http
  .createServer(async (peticion, respuesta) => {
    if (!["GET", "HEAD"].includes(peticion.method)) {
      respuesta.writeHead(405, { Allow: "GET, HEAD" });
      return respuesta.end();
    }
    try {
      const ruta = decodeURIComponent(
        new URL(peticion.url, "http://localhost").pathname,
      );
      const archivo = path.resolve(
        raiz,
        `.${ruta === "/" ? "/index.html" : ruta}`,
      );
      const tipo = tipos[path.extname(archivo)];
      if (
        !archivo.startsWith(raiz + path.sep) ||
        !tipo ||
        path
          .relative(raiz, archivo)
          .split(path.sep)
          .some((p) => p.startsWith("."))
      ) {
        respuesta.writeHead(404);
        return respuesta.end("Archivo no encontrado");
      }
      const contenido = await fs.readFile(archivo);
      respuesta.writeHead(200, {
        "Content-Type": `${tipo};charset=utf-8`,
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      respuesta.end(peticion.method === "HEAD" ? undefined : contenido);
    } catch (error) {
      respuesta.writeHead(error instanceof URIError ? 400 : 404);
      respuesta.end("Archivo no encontrado");
    }
  })
  .listen(puerto, "127.0.0.1", () =>
    console.log(`Alfredo: http://127.0.0.1:${puerto}`),
  );
