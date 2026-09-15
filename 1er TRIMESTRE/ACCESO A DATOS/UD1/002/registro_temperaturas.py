NOMBRE_FICHERO_TEMPERATURAS = "temperaturas.txt"
NOMBRE_FICHERO_CONTADOR = "contador.bin"

def escribir_temperaturas():
    # tu código aquí
    with open(NOMBRE_FICHERO_TEMPERATURAS, "w") as flujo:
        flujo.write("18.5\n")
        flujo.write("21.0 \n")
        flujo.write("19.2\n")

def leer_temperaturas():
    # tu código aquí
    print("\n--- Flujo de entrada: leyendo todo el fichero ---")
    flujo = open(NOMBRE_FICHERO_TEMPERATURAS, "r")
    contenido = flujo.read()
    flujo.close()
    print(contenido)

def saltar_primera_temperatura():
    # tu código aquí
    print("--- Moviendo el puntero con seek() ---")
    flujo = open(NOMBRE_FICHERO_TEMPERATURAS, "r")
    flujo.readline()             # leemos la primera línea, el puntero avanza
    posicion = flujo.tell()      # guardamos dónde ha quedado el puntero
    flujo.seek(0)                # volvemos al principio del fichero
    flujo.seek(posicion)         # y saltamos otra vez a esa posición guardada
    resto = flujo.read()         # leemos desde ahí hasta el final
    flujo.close()
    print("Nos saltamos la primera línea y leemos el resto:")
    print(resto)

def comprobar_fichero_configuracion():
    # tu código aquí
    print("--- Manejo de excepciones ---")
    try:
        flujo = open("configuración.txt", "r")
        flujo.close()
    except FileNotFoundError:
        print("Error controlado, el fichero no existe pero el programa sigue funcionando...")

def guardar_numero_registros():
    # tu código aquí
    print("\n --- Trabajando con un fichero binario ---")
    datos = bytes([3])

    flujo_salida = open(NOMBRE_FICHERO_CONTADOR, "wb")
    flujo_salida.write(datos)
    flujo_salida.close()

    print(f"Bytes escritos: {list(datos)}")
    print(f"Bytes leídos: {list(open(NOMBRE_FICHERO_CONTADOR, 'rb').read())}")
    print(f"Como texto: {open(NOMBRE_FICHERO_CONTADOR, 'rb').read().decode('utf-8')}")


def main():
    # llama aquí a las cinco funciones, en orden
    escribir_temperaturas()
    leer_temperaturas()
    saltar_primera_temperatura()
    comprobar_fichero_configuracion()
    guardar_numero_registros()

if __name__ == "__main__":
    main()