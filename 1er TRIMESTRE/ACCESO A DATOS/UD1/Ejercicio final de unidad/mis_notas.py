# mis_notas.py
# Mi cuaderno de notas: repaso de todo lo visto con ficheros.

# Módulos que vamos a necesitar
import csv      # para leer ficheros CSV (paso 6)
import json     # para serializar y deserializar (pasos 7 y 8)
import os       # para ver los ficheros de la carpeta (paso 11)

# Nombres de los ficheros (en MAYÚSCULAS porque no cambian nunca)
NOMBRE_NOTAS = "notas.csv"
NOMBRE_JSON = "notas.json"
NOMBRE_BINARIO = "total.bin"


# AQUÍ IRÁS PEGANDO LAS FUNCIONES DE CADA PASO (una debajo de otra)


def main():
    print("=== MI CUADERNO DE NOTAS ===")
    # AQUÍ IRÁS AÑADIENDO LAS LLAMADAS DE CADA PASO
    crear_fichero_notas()

def crear_fichero_notas():
    # 1. Lista con las tres líneas (fíjate en el \n del final de cada una)
    lineas = ["Ana,8\n", "Luis,6\n", "Marta,9\n"]
    # 2. Abre NOMBRE_NOTAS en modo escritura
    fichero = open(NOMBRE_NOTAS, "w")
    # 3. Escribe la lista entera de golpe
    fichero.writelines(lineas)
    # 4. Cierra el fichero
    fichero.close()
    print("Fichero", NOMBRE_NOTAS, "creado con 3 alumnos.")

class Cuaderno:
    # Constructor: se ejecuta al crear el objeto
    def __init__(self, archivo):
        # Guarda el nombre del archivo dentro del objeto
        self.archivo = archivo

    # Añade UN alumno al final del archivo, sin borrar lo que había
    def anadir(self, nombre, nota):
        # 1. Abre self.archivo en modo añadir
        fichero = open(self.archivo, "a")
        # 2. Escribe nombre, coma, nota (como texto) y salto de línea
        fichero.write(nombre + "," + str(nota) + "\n")
        # 3. Cierra el fichero
        fichero.close()
        print("Añadido:", nombre, "con un", nota)

# Solo se ejecuta main() si lanzamos este archivo directamente
if __name__ == "__main__":
    main()

    print("\n--- PASO 1: crear el fichero ---")
    crear_fichero_notas()

    print("\n--- PASO 2: añadir alumnos con la clase Cuaderno ---")
    cuaderno = Cuaderno(NOMBRE_NOTAS)
    cuaderno.anadir("Pablo", 7)
    cuaderno.anadir("Lucia", 10)