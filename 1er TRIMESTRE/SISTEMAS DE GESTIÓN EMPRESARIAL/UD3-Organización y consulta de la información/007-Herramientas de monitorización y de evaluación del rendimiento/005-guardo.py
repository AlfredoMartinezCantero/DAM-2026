import os

ruta = "/var/www/html/DAM-2026/"
salida = open("/home/alfredo/Escritorio/guarda.md", "w", encoding="utf-8")

def formato_tamano(bytes):
    for unidad in ["B", "KB", "MB", "GB", "TB"]:
        if bytes < 1024:
            return f"{bytes:.2f} {unidad}"
        bytes /= 1024
    return f"{bytes:.2f} PB"


# Calcular tamaños de todas las carpetas
tamanos = {}

for carpeta, carpetas, archivos in os.walk(ruta, topdown=False):
    total = 0

    for archivo in archivos:
        ruta_archivo = os.path.join(carpeta, archivo)
        try:
            total += os.path.getsize(ruta_archivo)
        except OSError:
            pass

    for subcarpeta in carpetas:
        ruta_subcarpeta = os.path.join(carpeta, subcarpeta)
        total += tamanos.get(ruta_subcarpeta, 0)

    tamanos[carpeta] = total


# Mostrar árbol
print(
    os.path.basename(os.path.normpath(ruta)) + "/ "
    + f"({formato_tamano(tamanos[ruta])})",
    file=salida
)

for carpeta, carpetas, archivos in os.walk(ruta):
    carpetas.sort()
    archivos.sort()

    nivel = os.path.relpath(carpeta, ruta).count(os.sep)

    if carpeta == ruta:
        nivel = 0
    else:
        nivel += 1

    prefijo = "│   " * nivel

    elementos = [(nombre, True) for nombre in carpetas]
    elementos += [(nombre, False) for nombre in archivos]

    for i, (nombre, es_carpeta) in enumerate(elementos):
        esquina = "└── " if i == len(elementos) - 1 else "├── "

        ruta_elemento = os.path.join(carpeta, nombre)

        if es_carpeta:
            tamano = tamanos.get(ruta_elemento, 0)
        else:
            try:
                tamano = os.path.getsize(ruta_elemento)
            except OSError:
                tamano = 0

        print(
            prefijo
            + esquina
            + nombre
            + ("/" if es_carpeta else "")
            + f" ({formato_tamano(tamano)})",
            file=salida
        )

salida.close()
