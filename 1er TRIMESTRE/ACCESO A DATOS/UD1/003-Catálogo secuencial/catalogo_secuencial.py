NOMBRE_FICHERO_ALEATORIO = "peliculas_aleatorio.txt"
TAMANO_REGISTRO = 15

def escribir_registros_tamano_fijo():

    peliculas = [
        "Matrix",
        "Titanic",
        "Avatar",
        "Gladiator"
    ]

    flujo = open(NOMBRE_FICHERO_ALEATORIO, "w")

    for pelicula in peliculas:
        linea = pelicula.ljust(TAMANO_REGISTRO -1) + "\n"
        flujo.write(linea)

    flujo.close()

    print(f"Se ha escrito '{NOMBRE_FICHERO_ALEATORIO}' correctamente.")

def leer_registro_directo(numero_registro):
    flujo = open(NOMBRE_FICHERO_ALEATORIO, "r")

    posicion = numero_registro * TAMANO_REGISTRO
    flujo.seek(posicion)
    linea = flujo.readline()
    flujo.close()

    print(f"Registro {numero_registro}: {linea.strip()}")

def modificar_registro_directo(numero_registro, titulo_nuevo):
    flujo = open(NOMBRE_FICHERO_ALEATORIO, "r+")
    posicion = numero_registro * TAMANO_REGISTRO
    flujo.seek(posicion)
    linea_nueva = titulo_nuevo.ljust(TAMANO_REGISTRO -1) + "\n"
    flujo.write(linea_nueva)
    flujo.close()

    print(f"Registro {numero_registro} modificado correctamente.")
    

def main():
    escribir_registros_tamano_fijo()
    leer_registro_directo(2)
    modificar_registro_directo(1, "El Padrino")
    # Bucle para comprobar todos los registros (0 al 3)
    for i in range(4):
        leer_registro_directo(i)

if __name__ == "__main__":
    main()