INSERT INTO clientes (nombre,email,telefono,ciudad,estado) VALUES
('Luna Café','hola@luna.example','910 234 501','Madrid','Activo'),
('Norte Creativo','equipo@norte.example','944 123 876','Bilbao','Activo'),
('Marta Soler','marta@soler.example','620 114 228','Valencia','Potencial'),
('La Huerta Digital','contacto@huerta.example','968 221 460','Murcia','Activo'),
('Órbita Cowork','hola@orbita.example','933 402 900','Barcelona','Activo');
INSERT INTO productos (nombre,categoria,precio,stock,stock_minimo) VALUES
('Mini PC Grape','Equipos',649,8,3),('Teclado mecánico Tinta','Periféricos',89,15,5),('Monitor Estudio 27','Pantallas',279,2,3),('Kit de red Local','Redes',149,6,3),('SSD Impulso 1 TB','Almacenamiento',79,3,5),('Dock USB-C Mesa','Periféricos',59,12,4);
INSERT INTO proveedores (nombre,email,telefono,especialidad) VALUES
('Circuito Local','ventas@circuito.example','911 100 200','Equipos y componentes'),('Mesa Abierta','pedidos@mesa.example','960 700 500','Periféricos y pantallas');
INSERT INTO componentes (nombre,proveedor_id,precio,stock) VALUES ('Memoria RAM 16 GB',1,39,20),('Fuente 450 W',1,49,9),('Cable HDMI 2 m',2,8,30);
INSERT INTO empleados (nombre,email,departamento,puesto,salario) VALUES
('Alfredo','alfredo@purplegrape.example','Desarrollo','Desarrollador ERP',28000),('Lucía Martín','lucia@purplegrape.example','Comercial','Responsable de clientes',27000),('Diego Ruiz','diego@purplegrape.example','Taller','Técnico de sistemas',25000);
INSERT INTO pedidos (cliente_id,fecha,estado,notas) VALUES (1,'2026-10-01','Entregado','Renovación de puestos del café'),(2,'2026-10-06','Confirmado','Equipo para el estudio de diseño'),(4,'2026-10-10','Pendiente','Preparar instalación en tienda'),(5,'2026-10-13','Confirmado','Ampliación de la zona de trabajo');
INSERT INTO lineaspedido (pedido_id,producto_id,cantidad,precio_unitario) VALUES (1,1,2,649),(1,2,2,89),(2,3,2,279),(2,6,2,59),(3,4,3,149),(4,1,1,649),(4,5,2,79);
INSERT INTO facturas (numero,pedido_id,fecha,vencimiento,estado) VALUES ('DO-2026-001',1,'2026-10-02','2026-10-16','Pagada'),('DO-2026-002',2,'2026-10-07','2026-10-21','Pendiente');
INSERT INTO actividad (accion,entidad,detalle) VALUES ('Instalación','sistema','Datos de demostración del Estudio Alfredo. Todos los contactos son ficticios.');
