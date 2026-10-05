-- ============================================
-- ACTUALIZACIÓN: Sistema de Roles y Seguridad
-- ============================================

USE inversiones_duri;

-- Actualizar tabla de usuarios con roles mejorados
ALTER TABLE usuarios 
    MODIFY COLUMN rol ENUM('super_usuario', 'operador', 'usuario') DEFAULT 'usuario',
    ADD COLUMN ultimo_acceso TIMESTAMP NULL AFTER activo,
    ADD COLUMN intentos_fallidos INT DEFAULT 0 AFTER ultimo_acceso,
    ADD COLUMN bloqueado TINYINT(1) DEFAULT 0 AFTER intentos_fallidos;

-- Tabla de permisos
CREATE TABLE IF NOT EXISTS permisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabla de relación rol-permisos
CREATE TABLE IF NOT EXISTS rol_permisos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    rol ENUM('super_usuario', 'operador', 'usuario') NOT NULL,
    permiso_id INT NOT NULL,
    FOREIGN KEY (permiso_id) REFERENCES permisos(id),
    UNIQUE KEY unique_rol_permiso (rol, permiso_id)
);

-- Tabla de registro de actividad (log de seguridad)
CREATE TABLE IF NOT EXISTS log_actividad (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT,
    accion VARCHAR(200) NOT NULL,
    tabla_afectada VARCHAR(100),
    registro_id INT,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- Insertar permisos
INSERT INTO permisos (nombre, descripcion) VALUES
('ver_productos', 'Ver catálogo de productos'),
('crear_producto', 'Crear nuevos productos'),
('editar_producto', 'Editar productos existentes'),
('eliminar_producto', 'Eliminar productos'),
('ver_inventario', 'Ver control de inventario'),
('editar_inventario', 'Modificar stock'),
('ver_pedidos', 'Ver pedidos'),
('crear_pedido', 'Crear nuevos pedidos'),
('editar_pedido', 'Editar estado de pedidos'),
('eliminar_pedido', 'Eliminar pedidos'),
('ver_clientes', 'Ver clientes'),
('crear_cliente', 'Crear clientes'),
('editar_cliente', 'Editar clientes'),
('ver_reportes', 'Ver reportes'),
('administrar_usuarios', 'Administrar usuarios del sistema'),
('ver_log_actividad', 'Ver registro de actividad');

-- Asignar todos los permisos al super_usuario
INSERT INTO rol_permisos (rol, permiso_id) 
SELECT 'super_usuario', id FROM permisos;

-- Asignar permisos al operador
INSERT INTO rol_permisos (rol, permiso_id)
SELECT 'operador', id FROM permisos WHERE nombre IN (
    'ver_productos', 'crear_producto', 'editar_producto',
    'ver_inventario', 'editar_inventario',
    'ver_pedidos', 'crear_pedido', 'editar_pedido',
    'ver_clientes', 'crear_cliente', 'editar_cliente'
);

-- Asignar permisos al usuario básico
INSERT INTO rol_permisos (rol, permiso_id)
SELECT 'usuario', id FROM permisos WHERE nombre IN (
    'ver_productos', 'ver_inventario', 'ver_pedidos', 'crear_pedido', 'ver_clientes'
);

-- Actualizar usuario admin existente
UPDATE usuarios SET rol = 'super_usuario' WHERE email = 'admin@inversionesduri.com';

-- Usuarios de ejemplo
INSERT INTO usuarios (nombre, email, password, rol, telefono) VALUES
('Operador Principal', 'operador@inversionesduri.com', '$2y$10$8K1p/a0dL1LXMIgoEDFrwOfMQkLSjqWP3m/xbymwMxE5bP1K5yH6', 'operador', '+58 412-0000000'),
('Usuario Demo', 'usuario@inversionesduri.com', '$2y$10$8K1p/a0dL1LXMIgoEDFrwOfMQkLSjqWP3m/xbymwMxE5bP1K5yH6', 'usuario', '+58 412-1111111');
