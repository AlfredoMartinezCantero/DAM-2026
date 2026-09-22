import json
import os

NOMBRE_FICHERO = "biblioteca.dat"


def leer_fichero():
    ruta = os.path.join(os.path.dirname(__file__), NOMBRE_FICHERO)
    with open(ruta, "r", encoding="utf-8") as archivo:
        return archivo.read()


def deserializar_libros(linea):
    return json.loads(linea)


def main():
    texto = leer_fichero()
    libros = deserializar_libros(texto)

    for libro in libros:
        print(f"{libro['titulo']} - {libro['autor']} ({libro['anio']}), {libro['paginas']} páginas")


if __name__ == "__main__":
    main()