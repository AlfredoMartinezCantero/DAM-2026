import json

NOMBRE_FICHERO = "biblioteca.dat"

def crear_lista_libros():
    '''
    Crea y devuelve una lista con tres diccionarios que representan libros.
    Cada diccionario contiene: 'titulo', 'autor', 'anio' y 'paginas'.
    '''
    libros = [
        {
            "titulo": "Cien años de soledad",
            "autor": "Gabriel García Márquez",
            "anio": 1967,
            "paginas": 471
        },
        {
            "titulo": "Don Quijote de la Mancha",
            "autor": "Miguel de Cervantes",
            "anio": 1605,
            "paginas": 863
        },
        {
            "titulo": "El principito",
            "autor": "Antoine de Saint-Exupéry",
            "anio": 1943,
            "paginas": 96
        }
    ]
    return libros

def serializar_libros(libros):
    '''
    Convierte la lista de diccionarios en una cadena JSON mediante json.dumps().
    Muestra la cadena resultante, su tipo con type() y la devuelve.
    '''
    cadena = json.dumps(libros)
    print("Cadena serializada en JSON:")
    print(cadena)
    print("Tipo de la cadena serializada:", type(cadena))
    return cadena

def guardar_en_fichero(cadena):
    '''
    Abre 'biblioteca.dat' en modo escritura ('w') y escribe la cadena completa.
    '''
    with open(NOMBRE_FICHERO, "w", encoding="utf-8") as f:
        f.write(cadena)

def main():
    # 1. Crear y mostrar la lista original de libros y su tipo (list)
    libros = crear_lista_libros()
    print("Lista original de libros:")
    print(libros)
    print("Tipo de dato original:", type(libros))
    print("-" * 50)

    # 2. Serializar la lista a texto JSON (str)
    cadena_json = serializar_libros(libros)
    print("-" * 50)

    # 3. Guardar la cadena en el fichero
    guardar_en_fichero(cadena_json)
    print(f"Archivo '{NOMBRE_FICHERO}' generado correctamente.")

if __name__ == "__main__":
    main()