<?php
declare(strict_types=1);
if(PHP_SAPI!=='cli'){http_response_code(403);exit('Solo CLI');}
require_once __DIR__.'/../api/procesos.php';
if (empty($argv[1]) || !is_file($argv[1])) exit("Uso: php data/importar-clientes.php /ruta/clientes.sqlite\n");
$origen=new PDO('sqlite:file:'.realpath($argv[1]).'?mode=ro',null,null,[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION,PDO::ATTR_DEFAULT_FETCH_MODE=>PDO::FETCH_ASSOC]);
$clientes=$origen->query('SELECT nombre,apellidos,email FROM clientes')->fetchAll();
$total=transaccion(function() use($clientes) {
    $total=0;
    foreach($clientes as $c) {
        $datos=validarDatos('clientes',$c,true);
        if (uno('SELECT 1 FROM clientes WHERE lower(trim(email))=lower(trim(?))',[$datos['email']])) continue;
        ejecutar('INSERT INTO clientes(nombre,apellidos,email,segmento,activo) VALUES(?,?,?,?,?)',
            [$datos['nombre'],$datos['apellidos'],$datos['email'],$datos['segmento'],$datos['activo']]); $total++;
    }
    auditar('importar_clientes','clientes',0,['insertados'=>$total]); return $total;
});
echo "Clientes importados: $total\n";

