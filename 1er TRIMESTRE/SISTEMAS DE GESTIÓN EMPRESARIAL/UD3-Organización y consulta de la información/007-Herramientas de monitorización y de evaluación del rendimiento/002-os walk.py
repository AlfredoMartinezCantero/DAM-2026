import os

for archivo,carpeta,carpetas in os.walk("/var/www/html/DAM-2026/"):
    print(archivo)
    print(carpeta)
    print(carpetas)