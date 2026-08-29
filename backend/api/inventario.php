<?php
// ============================================
// API: INVENTARIO
// Inversiones Duri C.A
// ============================================

require_once '../config/database.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        if (isset($_GET['estadisticas'])) {
            // Obtener estadísticas del inventario
            $stats = [];
            
            $stmt = $db->query("SELECT COUNT(*) as total FROM productos WHERE activo = 1");
            $stats['total_productos'] = $stmt->fetch()['total'];

            $stmt = $db->query("SELECT COUNT(*) as total FROM productos WHERE activo = 1 AND stock_actual > stock_minimo");
            $stats['en_stock'] = $stmt->fetch()['total'];

            $stmt = $db->query("SELECT COUNT(*) as total FROM productos WHERE activo = 1 AND stock_actual <= stock_minimo AND stock_actual > 0");
            $stats['stock_bajo'] = $stmt->fetch()['total'];

            $stmt = $db->query("SELECT COUNT(*) as total FROM productos WHERE activo = 1 AND stock_actual = 0");
            $stats['agotados'] = $stmt->fetch()['total'];

            $stmt = $db->query("SELECT SUM(stock_actual * precio_venta) as valor FROM productos WHERE activo = 1");
            $stats['valor_inventario'] = $stmt->fetch()['valor'] ?? 0;

            echo json_encode(["status" => "success", "data" => $stats]);

        } elseif (isset($_GET['movimientos'])) {
            // Obtener movimientos de inventario
            $limit = $_GET['limit'] ?? 50;
            $stmt = $db->prepare("SELECT mi.*, p.nombre as producto_nombre, p.codigo as producto_codigo FROM movimientos_inventario mi JOIN productos p ON mi.producto_id = p.id ORDER BY mi.created_at DESC LIMIT ?");
            $stmt->execute([$limit]);
            $movimientos = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $movimientos]);

        } else {
            // Obtener todo el inventario con info de categoría
            $stmt = $db->query("SELECT p.*, c.nombre as categoria_nombre, 
                CASE 
                    WHEN p.stock_actual = 0 THEN 'agotado'
                    WHEN p.stock_actual <= p.stock_minimo THEN 'bajo'
                    ELSE 'disponible'
                END as estado_stock
                FROM productos p 
                JOIN categorias c ON p.categoria_id = c.id 
                WHERE p.activo = 1 
                ORDER BY p.nombre");
            $inventario = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $inventario]);
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);

        if (empty($data['producto_id']) || empty($data['tipo_movimiento']) || empty($data['cantidad'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Datos incompletos"]);
            exit();
        }

        try {
            $db->beginTransaction();

            // Registrar movimiento
            $stmt = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, ?, ?, ?, ?)");
            $stmt->execute([
                $data['producto_id'],
                $data['tipo_movimiento'],
                $data['cantidad'],
                $data['motivo'] ?? '',
                $data['referencia'] ?? ''
            ]);

            // Actualizar stock según tipo de movimiento
            if ($data['tipo_movimiento'] === 'entrada') {
                $stmt = $db->prepare("UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?");
            } elseif ($data['tipo_movimiento'] === 'salida') {
                $stmt = $db->prepare("UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?");
            } else {
                // Ajuste directo
                $stmt = $db->prepare("UPDATE productos SET stock_actual = ? WHERE id = ?");
                $data['cantidad'] = $data['nuevo_stock'] ?? $data['cantidad'];
            }
            $stmt->execute([$data['cantidad'], $data['producto_id']]);

            $db->commit();

            http_response_code(201);
            echo json_encode(["status" => "success", "message" => "Movimiento registrado"]);

        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'PUT':
        // Actualizar stock mínimo o precio
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $_GET['id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        $fields = [];
        $values = [];

        if (isset($data['stock_minimo'])) {
            $fields[] = "stock_minimo = ?";
            $values[] = $data['stock_minimo'];
        }
        if (isset($data['precio_venta'])) {
            $fields[] = "precio_venta = ?";
            $values[] = $data['precio_venta'];
        }

        if (!empty($fields)) {
            $values[] = $id;
            $stmt = $db->prepare("UPDATE productos SET " . implode(', ', $fields) . " WHERE id = ?");
            $stmt->execute($values);
        }

        echo json_encode(["status" => "success", "message" => "Inventario actualizado"]);
        break;
}
?>
