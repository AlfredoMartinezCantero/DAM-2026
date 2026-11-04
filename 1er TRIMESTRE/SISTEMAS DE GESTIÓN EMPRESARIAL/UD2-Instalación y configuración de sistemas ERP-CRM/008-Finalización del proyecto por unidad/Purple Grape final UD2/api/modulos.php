<?php
// El núcleo consulta este catálogo: cada módulo define sus propias entidades.
function catalogo(): array {
    $texto = fn($label, $type = 'text', $required = true) => ['label'=>$label,'type'=>$type,'required'=>$required];
    $numero = fn($label, $type = 'number', $min = 0) => ['label'=>$label,'type'=>$type,'min'=>$min,'required'=>true];
    $opciones = fn($label, $values) => ['label'=>$label,'type'=>'select','options'=>$values,'required'=>true];
    $relacion = fn($label, $table) => ['label'=>$label,'type'=>'relation','table'=>$table,'required'=>true];
    return [
        'crm'=>['nombre'=>'Clientes','icono'=>'◎','descripcion'=>'Relaciones que hacen crecer el estudio.', 'entidades'=>[
            'clientes'=>['nombre'=>'Clientes','singular'=>'cliente','campos'=>['nombre'=>$texto('Nombre'),'email'=>$texto('Correo','email'),'telefono'=>$texto('Teléfono','tel',false),'ciudad'=>$texto('Ciudad','text',false),'estado'=>$opciones('Estado',['Activo','Potencial','Inactivo'])]]]],
        'ventas'=>['nombre'=>'Ventas','icono'=>'↗','descripcion'=>'Del primer pedido a la entrega.', 'entidades'=>[
            'pedidos'=>['nombre'=>'Pedidos','singular'=>'pedido','campos'=>['cliente_id'=>$relacion('Cliente','clientes'),'fecha'=>$texto('Fecha','date'),'estado'=>$opciones('Estado',['Pendiente','Confirmado','Entregado','Cancelado']),'notas'=>$texto('Notas','textarea',false)]],
            'lineaspedido'=>['nombre'=>'Líneas de pedido','singular'=>'línea','campos'=>['pedido_id'=>$relacion('Pedido','pedidos'),'producto_id'=>$relacion('Producto','productos'),'cantidad'=>$numero('Cantidad','integer',1),'precio_unitario'=>$numero('Precio unitario (€)')]]]],
        'inventario'=>['nombre'=>'Inventario','icono'=>'▦','descripcion'=>'Equipos y existencias bajo control.', 'entidades'=>[
            'productos'=>['nombre'=>'Productos','singular'=>'producto','campos'=>['nombre'=>$texto('Nombre'),'categoria'=>$texto('Categoría'),'precio'=>$numero('Precio (€)'),'stock'=>$numero('Existencias','integer'),'stock_minimo'=>$numero('Stock mínimo','integer')]]]],
        'compras'=>['nombre'=>'Compras','icono'=>'◇','descripcion'=>'Proveedores y piezas para el taller.', 'entidades'=>[
            'proveedores'=>['nombre'=>'Proveedores','singular'=>'proveedor','campos'=>['nombre'=>$texto('Nombre'),'email'=>$texto('Correo','email'),'telefono'=>$texto('Teléfono','tel',false),'especialidad'=>$texto('Especialidad')]],
            'componentes'=>['nombre'=>'Componentes','singular'=>'componente','campos'=>['nombre'=>$texto('Nombre'),'proveedor_id'=>$relacion('Proveedor','proveedores'),'precio'=>$numero('Precio (€)'),'stock'=>$numero('Existencias','integer')]]]],
        'rrhh'=>['nombre'=>'Equipo','icono'=>'◉','descripcion'=>'Las personas detrás de Purple Grape.', 'entidades'=>[
            'empleados'=>['nombre'=>'Empleados','singular'=>'empleado','campos'=>['nombre'=>$texto('Nombre'),'email'=>$texto('Correo','email'),'departamento'=>$texto('Departamento'),'puesto'=>$texto('Puesto'),'salario'=>$numero('Salario anual (€)')]]]],
        'facturacion'=>['nombre'=>'Facturación','icono'=>'€','descripcion'=>'Facturas e importes con IVA del 21 %.', 'entidades'=>[
            'facturas'=>['nombre'=>'Facturas','singular'=>'factura','campos'=>['numero'=>$texto('Número de factura'),'pedido_id'=>$relacion('Pedido','pedidos'),'fecha'=>$texto('Emisión','date'),'vencimiento'=>$texto('Vencimiento','date'),'estado'=>$opciones('Estado',['Pendiente','Pagada'])]]]],
    ];
}
function perfiles(): array {
    return ['completo'=>array_keys(catalogo()), 'comercial'=>['crm','ventas','inventario','facturacion'], 'taller'=>['crm','inventario','compras','rrhh']];
}
function entidad(string $tabla): array {
    foreach(catalogo() as $id=>$modulo) if(isset($modulo['entidades'][$tabla])) return $modulo['entidades'][$tabla] + ['modulo'=>$id];
    throw new InvalidArgumentException('Entidad no válida.');
}
