import os

# Constantes definidas según el esqueleto del ejercicio
NOMBRE_FICHERO_NOTAS = "notas.csv"
CARPETA_PRACTICAS = "practicas"
NOMBRE_FICHERO_ESTRUCTURA = "estructura_practicas.txt"


def guardar_notas(): 
    
    #Abre o crea 'notas.csv' en modo añadida ("a") y escribe las tres notas de ejemplo separando los campos por comas.
    
    notas = [
        ("Lucia", "Matematicas", "8.5"),
        ("Marcos", "Matematicas", "6.0"),
        ("Sofia", "Lengua", "9.0")
    ]
    with open(NOMBRE_FICHERO_NOTAS, "a", encoding="utf-8") as f:
        for alumno in notas:
            # Pista 1: ",".join(...) une los elementos de la tupla separados por comas
            linea = ",".join(alumno) + "\n"
            f.write(linea)


def leer_notas():
    '''
    Abre 'notas.csv' en modo lectura, recorre línea por línea, reconstruye
    cada fila como tupla, las guarda en una lista, la imprime y la devuelve.
    '''
    lista_notas = []
    with open(NOMBRE_FICHERO_NOTAS, "r", encoding="utf-8") as f:
        for linea in f:
            # Eliminamos saltos de línea y separamos por comas (Pista 3)
            campos = linea.strip().split(",")
            if campos and campos != ['']:
                lista_notas.append(tuple(campos))
    
    # Mostramos la lista resultante por pantalla y la retornamos
    print("Notas leídas:")
    print(lista_notas)
    return lista_notas


def crear_carpetas_de_prueba():
    '''
    Crea la estructura de carpetas y archivos dentro de 'practicas'
    para poder visualizarla posteriormente.
    '''
    rutas_archivos = [
        os.path.join(CARPETA_PRACTICAS, "tema1", "apuntes.txt"),
        os.path.join(CARPETA_PRACTICAS, "tema1", "ejercicios", "ejercicio1.py"),
        os.path.join(CARPETA_PRACTICAS, "tema2", "resumen.txt")
    ]
    
    for ruta_completa in rutas_archivos:
        carpeta = os.path.dirname(ruta_completa)
        os.makedirs(carpeta, exist_ok=True)
        # Escribimos contenido de prueba en cada archivo
        with open(ruta_completa, "w", encoding="utf-8") as f:
            f.write("# Archivo de prueba\n")


def dibujar_estructura_practicas(ruta):
    '''
    Recorre la carpeta usando os.walk(), calcula el nivel de profundidad
    y genera una lista con las líneas formateadas en árbol.
    No imprime en pantalla, devuelve la lista con return.
    '''
    lineas = []
    
    for carpeta_actual, subcarpetas, archivos in os.walk(ruta):
        # Pista 5: Cálculo del nivel de profundidad contando los separadores de ruta
        nivel = carpeta_actual.replace(ruta, "").count(os.sep)
        sangria = "  " * nivel
        nombre_carpeta = os.path.basename(carpeta_actual) or carpeta_actual
        lineas.append(f"{sangria}{nombre_carpeta}/")
        
        # Archivos en el nivel actual con una sangría adicional
        sangria_archivos = "  " * (nivel + 1)
        for archivo in archivos:
            lineas.append(f"{sangria_archivos}{archivo}")
            
    return lineas


def guardar_estructura_practicas(ruta, archivo_salida=NOMBRE_FICHERO_ESTRUCTURA):
    '''
    Llama a dibujar_estructura_practicas, une las líneas con saltos de línea,
    guarda el texto en 'archivo_salida' en modo 'w' y devuelve la lista.
    '''
    lineas = dibujar_estructura_practicas(ruta)
    contenido = "\n".join(lineas)
    
    with open(archivo_salida, "w", encoding="utf-8") as f:
        f.write(contenido + "\n")
        
    return lineas


def main():
    '''
    Ejecuta en orden todas las funciones del ejercicio y muestra por pantalla
    el resultado devuelto por guardar_estructura_practicas().
    '''
    # 1. Guardar las notas en el archivo CSV
    guardar_notas()
    
    # 2. Leer las notas y mostrarlas
    leer_notas()
    
    # 3. Crear las carpetas y archivos de prueba
    crear_carpetas_de_prueba()
    
    # 4. Generar y guardar la estructura de carpetas
    print("\nEstructura de prácticas generada:")
    resultado_estructura = guardar_estructura_practicas(CARPETA_PRACTICAS)
    
    # Mostrar el árbol devuelto por pantalla
    for linea in resultado_estructura:
        print(linea)


if __name__ == "__main__":
    main()