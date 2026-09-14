"""
Gestor de contactos
-------------------
Lee datos.csv, los convierte en una lista de diccionarios,
los guarda en contactos.json, escribe un log.txt con una línea
por contacto procesado, y al final cuenta cuántas líneas tiene
ese log.txt.
"""

import csv
import json


def leer_csv(ruta_csv):
    """Paso 1 y 2: lee el CSV y devuelve una lista de diccionarios."""
    contactos = []

    with open(ruta_csv, mode="r", encoding="utf-8", newline="") as archivo_csv:
        lector = csv.DictReader(archivo_csv)  # ya usa la primera fila como claves

        for fila in lector:
            contacto = {
                "nombre": fila["nombre"],
                "apellidos": fila["apellidos"],
                "telefono": fila["telefono"],
            }
            contactos.append(contacto)

    return contactos


def guardar_json(contactos, ruta_json):
    """Paso 3: guarda la lista de diccionarios en un archivo JSON legible."""
    with open(ruta_json, mode="w", encoding="utf-8") as archivo_json:
        json.dump(contactos, archivo_json, indent=4, ensure_ascii=False)


def escribir_log(contactos, ruta_log):
    """Paso 4: escribe una línea de log por cada contacto procesado."""
    with open(ruta_log, mode="w", encoding="utf-8") as archivo_log:
        for contacto in contactos:
            linea = f"Contacto añadido: {contacto['nombre']} {contacto['apellidos']}\n"
            archivo_log.write(linea)


def contar_lineas_log(ruta_log):
    """Paso 5: abre el log.txt y cuenta cuántas líneas (contactos) tiene."""
    with open(ruta_log, mode="r", encoding="utf-8") as archivo_log:
        lineas = archivo_log.readlines()
    return len(lineas)


def main():
    ruta_csv = "datos.csv"
    ruta_json = "contactos.json"
    ruta_log = "log.txt"

    # 1 y 2. Leer el CSV y convertir cada fila en un diccionario
    contactos = leer_csv(ruta_csv)
    print(f"Se han leído {len(contactos)} contactos desde '{ruta_csv}'.")

    # 3. Guardar todos los contactos en contactos.json
    guardar_json(contactos, ruta_json)
    print(f"Contactos guardados en '{ruta_json}'.")

    # 4. Escribir log.txt con una línea por contacto
    escribir_log(contactos, ruta_log)
    print(f"Registro de actividad escrito en '{ruta_log}'.")

    # 5. Leer log.txt y mostrar cuántas líneas (contactos) se han procesado
    total = contar_lineas_log(ruta_log)
    print(f"\nTotal de contactos procesados según el log: {total}")


if __name__ == "__main__":
    main()