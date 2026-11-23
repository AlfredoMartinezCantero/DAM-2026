# Procedimiento almacenado nativo: MySQL 8

El ERP conserva SQLite para mantener la continuidad de UD3. El segundo sistema contable admite un backend MySQL real. En ese modo cada sincronización ejecuta CALL sp_contabilizar_factura y la operación contable se resuelve dentro del motor.

## Preparar una base dedicada

Utiliza una base nueva y un usuario propio del proyecto. Ejecuta este ejemplo desde una sesión administrativa MySQL y sustituye la contraseña:

~~~sql
CREATE DATABASE grape_contabilidad CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'grape_app'@'localhost' IDENTIFIED BY 'elige-una-clave-local';
GRANT SELECT, INSERT, UPDATE, EXECUTE ON grape_contabilidad.* TO 'grape_app'@'localhost';
~~~

Importa el esquema como administrador con permiso para crear rutinas en esa base:

~~~bash
mysql -u root -p grape_contabilidad < sql/mysql/contabilidad.sql
~~~

El script crea documentos y movimientos si no existen y sustituye exclusivamente la rutina sp_contabilizar_factura dentro de la base seleccionada. No lo ejecutes en bases ajenas al proyecto.

PHP necesita pdo_mysql. Inicia el segundo servidor con las variables adecuadas:

~~~bash
CONTABILIDAD_MYSQL_DSN='mysql:host=localhost;dbname=grape_contabilidad;charset=utf8mb4' \
CONTABILIDAD_MYSQL_USUARIO='grape_app' \
CONTABILIDAD_MYSQL_CLAVE='elige-una-clave-local' \
php -S 127.0.0.1:8085 router.php
~~~

El servidor principal puede seguir usando el arranque normal. Si cambias INTEGRACION_CLAVE, configura el mismo valor en ambos procesos.

En **Integración contable** deben aparecer **mysql** y **sp_contabilizar_factura**. Emite y sincroniza una factura. El receptor guardará un documento y los movimientos de las cuentas 430, 700 y 477.

El modo MySQL utiliza un almacenamiento distinto del SQLite de demostración. No migra automáticamente documentos ya sincronizados en el receptor SQLite. Si cambias de motor, vuelve a sincronizar las facturas que quieras incorporar al nuevo receptor.

## Qué hace la rutina

1. Valida origen, número, cliente, fecha e importes no negativos y equilibrados.
2. Abre una transacción.
3. Inserta el documento o recupera el existente por su clave única.
4. Bloquea la fila y compara los datos para impedir cambios en un documento contabilizado.
5. Si es nuevo, inserta los tres movimientos.
6. Confirma y devuelve identificador e indicación de duplicado.
7. Ante una excepción ejecuta rollback y propaga el error al adaptador.

Los importes son enteros BIGINT en céntimos. Usa SQL SECURITY INVOKER: se ejecuta con los privilegios del usuario configurado en PHP.

## Prueba aislada

Con mysqld y el cliente mysql de MySQL 8 disponibles:

~~~bash
python3 -u tests/verificar_mysql.py
~~~

El script inicializa una instancia temporal con socket Unix y red desactivada, importa el SQL, ejecuta los casos de la rutina y después la batería HTTP con ese motor. Verifica rechazo de conflictos, descuadres, nulos y cinco envíos simultáneos sin duplicados. La instancia se detiene y elimina al terminar. No usa ni cambia la instancia MySQL del equipo.

La cuenta root sin clave existe únicamente en la instancia temporal, accesible mediante el socket temporal del usuario.

