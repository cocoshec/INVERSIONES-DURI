<?php
// ============================================
// API: PEDIDOS
// Inversiones Duri C.A
// ============================================

require_once '../config/database.php';

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            // Obtener un pedido con sus detalles
            $stmt = $db->prepare("SELECT p.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?");
            $stmt->execute([$_GET['id']]);
            $pedido = $stmt->fetch();

            if ($pedido) {
                // Obtener detalles
                $stmt2 = $db->prepare("SELECT dp.*, pr.nombre as producto_nombre FROM detalle_pedido dp JOIN productos pr ON dp.producto_id = pr.id WHERE dp.pedido_id = ?");
                $stmt2->execute([$_GET['id']]);
                $pedido['detalles'] = $stmt2->fetchAll();
                echo json_encode(["status" => "success", "data" => $pedido]);
            } else {
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Pedido no encontrado"]);
            }
        } else {
            // Obtener todos los pedidos
            $stmt = $db->query("SELECT p.*, c.nombre as cliente_nombre FROM pedidos p JOIN clientes c ON p.cliente_id = c.id ORDER BY p.created_at DESC");
            $pedidos = $stmt->fetchAll();
            echo json_encode(["status" => "success", "data" => $pedidos]);
        }
        break;

    case 'POST':
        $data = json_decode(file_get_contents("php://input"), true);

        if (empty($data['cliente_id']) || empty($data['productos'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Cliente y productos son requeridos"]);
            exit();
        }

        try {
            $db->beginTransaction();

            // Calcular total
            $subtotal = 0;
            foreach ($data['productos'] as $prod) {
                $subtotal += $prod['cantidad'] * $prod['precio_unitario'];
            }
            $impuesto = $subtotal * 0.16; // IVA 16%
            $total = $subtotal + $impuesto;

            // Generar código del pedido
            $stmt = $db->query("SELECT MAX(id) as max_id FROM pedidos");
            $row = $stmt->fetch();
            $codigo = 'PED-' . str_pad(($row['max_id'] ?? 0) + 1, 3, '0', STR_PAD_LEFT);

            // Insertar pedido
            $stmt = $db->prepare("INSERT INTO pedidos (codigo, cliente_id, subtotal, impuesto, total, estado, direccion_entrega, notas) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?)");
            $stmt->execute([
                $codigo,
                $data['cliente_id'],
                $subtotal,
                $impuesto,
                $total,
                $data['direccion_entrega'] ?? '',
                $data['notas'] ?? ''
            ]);

            $pedido_id = $db->lastInsertId();

            // Insertar detalles y actualizar stock
            foreach ($data['productos'] as $prod) {
                $sub = $prod['cantidad'] * $prod['precio_unitario'];
                
                $stmt = $db->prepare("INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$pedido_id, $prod['producto_id'], $prod['cantidad'], $prod['precio_unitario'], $sub]);

                // Actualizar stock
                $stmt = $db->prepare("UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?");
                $stmt->execute([$prod['cantidad'], $prod['producto_id']]);

                // Registrar movimiento
                $stmt = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, 'salida', ?, 'Venta', ?)");
                $stmt->execute([$prod['producto_id'], $prod['cantidad'], $codigo]);
            }

            $db->commit();

            http_response_code(201);
            echo json_encode(["status" => "success", "message" => "Pedido creado", "id" => $pedido_id, "codigo" => $codigo, "total" => $total]);

        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Error: " . $e->getMessage()]);
        }
        break;

    case 'PUT':
        $data = json_decode(file_get_contents("php://input"), true);
        $id = $_GET['id'] ?? null;

        if (!$id || empty($data['estado'])) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID y estado son requeridos"]);
            exit();
        }

        $stmt = $db->prepare("UPDATE pedidos SET estado = ? WHERE id = ?");
        $stmt->execute([$data['estado'], $id]);

        echo json_encode(["status" => "success", "message" => "Pedido actualizado"]);
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        // Restaurar stock antes de eliminar
        $stmt = $db->prepare("SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ?");
        $stmt->execute([$id]);
        $detalles = $stmt->fetchAll();

        foreach ($detalles as $det) {
            $stmt = $db->prepare("UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?");
            $stmt->execute([$det['cantidad'], $det['producto_id']]);
        }

        $stmt = $db->prepare("DELETE FROM pedidos WHERE id = ?");
        $stmt->execute([$id]);

        echo json_encode(["status" => "success", "message" => "Pedido eliminado"]);
        break;
}
?>
