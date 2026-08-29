<?php
// ============================================
// API: PRODUCTOS
// Inversiones Duri C.A
// ============================================

require_once '../config/database.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            // Obtener un producto
            $stmt = $db->prepare("SELECT p.*, c.nombre as categoria_nombre FROM productos p JOIN categorias c ON p.categoria_id = c.id WHERE p.id = ?");
            $stmt->execute([$_GET['id']]);
            $producto = $stmt->fetch();
            if ($producto) {
                echo json_encode(["status" => "success", "data" => $producto]);
            } else {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Producto no encontrado"]);
            }
        } elseif (isset($_GET['categoria'])) {
            // Filtrar por categoría
            $stmt = $db->prepare("SELECT p.*, c.nombre as categoria_nombre FROM productos p JOIN categorias c ON p.categoria_id = c.id WHERE p.categoria_id = ? AND p.activo = 1");
            $stmt->execute([$_GET['categoria']]);
            $productos = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $productos]);
        } else {
            // Obtener todos los productos
            $stmt = $db->query("SELECT p.*, c.nombre as categoria_nombre FROM productos p JOIN categorias c ON p.categoria_id = c.id WHERE p.activo = 1 ORDER BY p.nombre");
            $productos = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $productos]);
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);
        
        if (empty($data['nombre']) || empty($data['precio_venta'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Nombre y precio son requeridos"]);
            exit();
        }

        $stmt = $db->prepare("INSERT INTO productos (codigo, nombre, descripcion, categoria_id, precio_venta, stock_actual, stock_minimo) VALUES (?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([
            $data['codigo'] ?? 'PRD-' . str_pad(rand(1, 999), 3, '0', STR_PAD_LEFT),
            $data['nombre'],
            $data['descripcion'] ?? '',
            $data['categoria_id'] ?? 1,
            $data['precio_venta'],
            $data['stock_actual'] ?? 0,
            $data['stock_minimo'] ?? 10
        ]);

        $id = $db->lastInsertId();
        http_response_code(201);
        echo json_encode(["status" => "success", "message" => "Producto creado", "id" => $id]);
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $_GET['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        $stmt = $db->prepare("UPDATE productos SET nombre = ?, descripcion = ?, categoria_id = ?, precio_venta = ?, stock_actual = ?, stock_minimo = ? WHERE id = ?");
        $stmt->execute([
            $data['nombre'],
            $data['descripcion'] ?? '',
            $data['categoria_id'] ?? 1,
            $data['precio_venta'],
            $data['stock_actual'] ?? 0,
            $data['stock_minimo'] ?? 10,
            $id
        ]);

        echo json_encode(["status" => "success", "message" => "Producto actualizado"]);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        // Soft delete
        $stmt = $db->prepare("UPDATE productos SET activo = 0 WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(["status" => "success", "message" => "Producto eliminado"]);
        break;
}
?>
