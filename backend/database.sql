-- ============================================
-- BASE DE DATOS: Inversiones Duri C.A
-- Sistema de Gestión de Pedidos e Inventario
-- ============================================

CREATE DATABASE IF NOT EXISTS inversiones_duri;
USE inversiones_duri;

-- ============================================
-- TABLA: usuarios
-- ============================================
CREATE TABLE usuarios (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    email VARCHAR(150) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    rol ENUM('admin', 'vendedor', 'inventario') DEFAULT 'vendedor',
    telefono VARCHAR(20),
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: categorias
-- ============================================
CREATE TABLE categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    descripcion TEXT,
    activa TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: productos
-- ============================================
CREATE TABLE productos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(50) UNIQUE NOT NULL,
    nombre VARCHAR(200) NOT NULL,
    descripcion TEXT,
    categoria_id INT NOT NULL,
    precio_compra DECIMAL(10,2) DEFAULT 0,
    precio_venta DECIMAL(10,2) NOT NULL,
    stock_actual INT DEFAULT 0,
    stock_minimo INT DEFAULT 10,
    unidad_medida VARCHAR(20) DEFAULT 'unidad',
    imagen VARCHAR(255),
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias(id)
);

-- ============================================
-- TABLA: clientes
-- ============================================
CREATE TABLE clientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(150) NOT NULL,
    email VARCHAR(150),
    telefono VARCHAR(20),
    direccion TEXT,
    ci_rif VARCHAR(20),
    tipo_cliente ENUM('regular', 'vip', 'empresa') DEFAULT 'regular',
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- ============================================
-- TABLA: pedidos
-- ============================================
CREATE TABLE pedidos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    codigo VARCHAR(20) UNIQUE NOT NULL,
    cliente_id INT NOT NULL,
    cliente_nombre VARCHAR(150),
    cliente_telefono VARCHAR(50),
    cliente_ci VARCHAR(50),
    usuario_id INT,
    subtotal DECIMAL(10,2) NOT NULL,
    impuesto DECIMAL(10,2) DEFAULT 0,
    total DECIMAL(10,2) NOT NULL,
    estado ENUM('pendiente', 'procesando', 'completado', 'cancelado') DEFAULT 'pendiente',
    forma_pago ENUM('efectivo', 'transferencia', 'pago_movil', 'tarjeta') DEFAULT 'efectivo',
    direccion_entrega TEXT,
    notas TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (cliente_id) REFERENCES clientes(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ============================================
-- TABLA: detalle_pedido
-- ============================================
CREATE TABLE detalle_pedido (
    id INT AUTO_INCREMENT PRIMARY KEY,
    pedido_id INT NOT NULL,
    producto_id INT NOT NULL,
    cantidad INT NOT NULL,
    precio_unitario DECIMAL(10,2) NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL,
    FOREIGN KEY (pedido_id) REFERENCES pedidos(id) ON DELETE CASCADE,
    FOREIGN KEY (producto_id) REFERENCES productos(id)
);

-- ============================================
-- TABLA: movimientos_inventario
-- ============================================
CREATE TABLE movimientos_inventario (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT NOT NULL,
    tipo_movimiento ENUM('entrada', 'salida', 'ajuste') NOT NULL,
    cantidad INT NOT NULL,
    motivo VARCHAR(200),
    referencia VARCHAR(100),
    usuario_id INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (producto_id) REFERENCES productos(id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Categorías
INSERT INTO categorias (nombre, descripcion) VALUES
('Útiles Escolares', 'Artículos para uso escolar y académico'),
('Papelería', 'Productos de papelería general'),
('Tecnología', 'Artículos tecnológicos y electrónicos'),
('Accesorios', 'Accesorios varios de oficina');

-- Productos de ejemplo
INSERT INTO productos (codigo, nombre, descripcion, categoria_id, precio_venta, stock_actual, stock_minimo) VALUES
('PRD-001', 'Lápices de Color (12-pack)', 'Set de 12 lápices de colores vibrantes', 1, 12.50, 45, 20),
('PRD-002', 'Marcadores Permanentes', 'Pack de 8 marcadores permanentes', 1, 8.75, 8, 15),
('PRD-003', 'Cuadernos Universitarios', 'Cuaderno de 100 hojas rayadas', 2, 3.25, 120, 25),
('PRD-004', 'Cartuchos de Tinta', 'Cartuchos negra y color para impresoras', 3, 24.99, 32, 10),
('PRD-005', 'Tijeras de Oficina', 'Tijeras ergonómicas de acero inoxidable', 2, 5.50, 28, 15),
('PRD-006', 'Clips Metálicos (100u)', 'Caja con 100 clips metálicos', 4, 2.00, 0, 50),
('PRD-007', 'Borradores Premium', 'Borrador blanco de alta calidad', 1, 1.25, 89, 30),
('PRD-008', 'Carpetas Archivador', 'Carpeta de cartón tamaño carta', 2, 4.75, 56, 20),
('PRD-009', 'Resaltadores Fluorescentes', 'Set de 6 resaltadores neón', 2, 7.50, 38, 15),
('PRD-010', 'Organizador de Escritorio', 'Organizador multi-función', 4, 15.99, 12, 15);

-- Clientes de ejemplo
INSERT INTO clientes (nombre, email, telefono, direccion) VALUES
('María González', 'maria@email.com', '0414-5559876', 'Maracay, Aragua'),
('Carlos López', 'carlos@email.com', '+58 414-7654321', 'Maracay, Aragua'),
('Ana Martínez', 'ana@email.com', '+58 424-9876543', 'La Victoria, Aragua'),
('Pedro Rodríguez', 'pedro@email.com', '+58 412-5551234', 'Maracay, Aragua'),
('Laura Díaz', 'laura@email.com', '+58 416-3334567', 'Turmero, Aragua');

-- Usuario admin por defecto (contraseña: admin123)
INSERT INTO usuarios (nombre, email, password, rol) VALUES
('Administrador', 'admin@inversionesduri.com', '$2y$10$8K1p/a0dL1LXMIgoEDFrwOfMQkLSjqWP3m/xbymwMxE5bP1K5yH6', 'admin');

-- Pedidos de ejemplo
INSERT INTO pedidos (codigo, cliente_id, subtotal, total, estado, direccion_entrega) VALUES
('PED-001', 1, 245.00, 245.00, 'completado', 'Maracay, Aragua'),
('PED-002', 2, 189.50, 189.50, 'procesando', 'Maracay, Aragua'),
('PED-003', 3, 432.00, 432.00, 'pendiente', 'La Victoria, Aragua');

-- Detalle de pedidos
INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES
(1, 1, 10, 12.50, 125.00),
(1, 3, 25, 3.25, 81.25),
(1, 7, 30, 1.25, 37.50),
(2, 2, 15, 8.75, 131.25),
(2, 5, 10, 5.50, 55.00),
(3, 4, 10, 24.99, 249.90),
(3, 8, 30, 4.75, 142.50);

-- ============================================
-- VISTA DE CONTROL DE PEDIDOS Y PAGOS
-- ============================================
CREATE OR REPLACE VIEW vista_control_pedidos AS
SELECT 
    p.id AS pedido_id,
    p.codigo AS codigo_pedido,
    c.nombre AS nombre_cliente,
    c.ci_rif AS cedula_rif,
    c.telefono AS telefono,
    GROUP_CONCAT(CONCAT(dp.cantidad, 'x ', pr.nombre) SEPARATOR ', ') AS productos_pedidos,
    p.forma_pago AS metodo_pago,
    p.total AS total_usd,
    CASE 
        WHEN p.estado IN ('procesando', 'completado') THEN 'SÍ (VALIDADO)'
        WHEN p.estado = 'cancelado' THEN 'CANCELADO'
        ELSE 'NO (PENDIENTE)'
    END AS pago_validado,
    p.estado AS estado_actual,
    p.created_at AS fecha_pedido
FROM pedidos p
LEFT JOIN clientes c ON p.cliente_id = c.id
LEFT JOIN detalle_pedido dp ON p.id = dp.pedido_id
LEFT JOIN productos pr ON dp.producto_id = pr.id
GROUP BY p.id
ORDER BY p.id DESC;

