PHP se puede configurar
/etc/php/8.3/apache2/php.ini

sudo nano /etc/php/8.3/apache2/php.ini

o bien editarlo con gedit

- Error handling and logging +- linea 501
error_reporting
display_errors = On

sudo service apache2 restart

analizar el acces.log
analizar el error.log

var/log/apache2/acces.log

PHP en Ubuntu no lleva SQLite incorporado:
sudo apt install php-sqlite3