<?php
// ============================================
// API: PEDIDOS
// Inversiones Duri C.A
// ============================================

if (!class_exists('Database')) {
    $dbPath = 'C:\\laragon\\www\\inversiones-duri\\backend\\config\\database.php';
    if (!@file_exists($dbPath)) {
        $dbPath = __DIR__ . '/../config/database.php';
    }
    include $dbPath;
}

$database = new Database();
$db = $database->getConnection();

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        if (isset($_GET['id'])) {
            // Obtener un pedido con sus detalles
            $stmt = $db->prepare("SELECT p.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.ci_rif as cliente_ci FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?");
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
            $stmt = $db->query("SELECT p.*, c.nombre as cliente_nombre, c.telefono as cliente_telefono, c.ci_rif as cliente_ci FROM pedidos p LEFT JOIN clientes c ON p.cliente_id = c.id ORDER BY p.created_at DESC");
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
            $formaPago = $data['forma_pago'] ?? 'efectivo';
            $formasValidas = ['efectivo', 'transferencia', 'pago_movil', 'tarjeta'];
            if (!in_array($formaPago, $formasValidas)) $formaPago = 'efectivo';

            $stmt = $db->prepare("INSERT INTO pedidos (codigo, cliente_id, subtotal, impuesto, total, estado, forma_pago, direccion_entrega, notas) VALUES (?, ?, ?, ?, ?, 'pendiente', ?, ?, ?)");
            $stmt->execute([
                $codigo,
                $data['cliente_id'],
                $subtotal,
                $impuesto,
                $total,
                $formaPago,
                $data['direccion_entrega'] ?? '',
                $data['notas'] ?? ''
            ]);

            $pedido_id = $db->lastInsertId();

            // Insertar detalles del pedido (el stock NO se descuenta aquí porque el pedido queda 'pendiente' de pago)
            foreach ($data['productos'] as $prod) {
                $sub = $prod['cantidad'] * $prod['precio_unitario'];
                
                $stmt = $db->prepare("INSERT INTO detalle_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)");
                $stmt->execute([$pedido_id, $prod['producto_id'], $prod['cantidad'], $prod['precio_unitario'], $sub]);
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

        $nuevoEstado = $data['estado'];
        $estadosValidos = ['pendiente', 'procesando', 'completado', 'cancelado'];
        if (!in_array($nuevoEstado, $estadosValidos)) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "Estado no válido"]);
            exit();
        }

        // Validar que la acción provenga de un superusuario
        if (!empty($data['usuario_id'])) {
            $stmtUser = $db->prepare("SELECT rol FROM usuarios WHERE id = ? AND activo = 1");
            $stmtUser->execute([$data['usuario_id']]);
            $u = $stmtUser->fetch();
            if (!$u || !in_array($u['rol'], ['super_usuario', 'admin'])) {
                http_response_code(403);
                echo json_encode(["status" => "error", "message" => "Acceso restringido: solo el superusuario puede verificar pagos y modificar estados"]);
                exit();
            }
        }

        try {
            $db->beginTransaction();

            // Obtener estado actual y código del pedido
            $stmt = $db->prepare("SELECT estado, codigo FROM pedidos WHERE id = ?");
            $stmt->execute([$id]);
            $pedidoActual = $stmt->fetch();

            if (!$pedidoActual) {
                $db->rollBack();
                http_response_code(404);
                echo json_encode(["status" => "error", "message" => "Pedido no encontrado"]);
                exit();
            }

            $estadoAnterior = $pedidoActual['estado'];

            // Obtener productos del pedido
            $stmt = $db->prepare("SELECT producto_id, cantidad FROM detalle_pedido WHERE pedido_id = ?");
            $stmt->execute([$id]);
            $detalles = $stmt->fetchAll();

            // Si pasa de 'pendiente' a confirmado ('procesando' o 'completado'), descontamos stock
            if ($estadoAnterior === 'pendiente' && in_array($nuevoEstado, ['procesando', 'completado'])) {
                foreach ($detalles as $det) {
                    $stmtUp = $db->prepare("UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?");
                    $stmtUp->execute([$det['cantidad'], $det['producto_id']]);

                    $stmtMov = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, 'salida', ?, 'Venta confirmada', ?)");
                    $stmtMov->execute([$det['producto_id'], $det['cantidad'], $pedidoActual['codigo']]);
                }
            }
            // Si ya estaba confirmado y ahora se 'cancela', devolvemos el stock
            else if (in_array($estadoAnterior, ['procesando', 'completado']) && $nuevoEstado === 'cancelado') {
                foreach ($detalles as $det) {
                    $stmtUp = $db->prepare("UPDATE productos SET stock_actual = stock_actual + ? WHERE id = ?");
                    $stmtUp->execute([$det['cantidad'], $det['producto_id']]);

                    $stmtMov = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, 'entrada', ?, 'Cancelación de pedido', ?)");
                    $stmtMov->execute([$det['producto_id'], $det['cantidad'], $pedidoActual['codigo']]);
                }
            }
            // Si estaba 'cancelado' y se reactiva a 'procesando' o 'completado', volvemos a descontar
            else if ($estadoAnterior === 'cancelado' && in_array($nuevoEstado, ['procesando', 'completado'])) {
                foreach ($detalles as $det) {
                    $stmtUp = $db->prepare("UPDATE productos SET stock_actual = stock_actual - ? WHERE id = ?");
                    $stmtUp->execute([$det['cantidad'], $det['producto_id']]);

                    $stmtMov = $db->prepare("INSERT INTO movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia) VALUES (?, 'salida', ?, 'Reactivación de pedido', ?)");
                    $stmtMov->execute([$det['producto_id'], $det['cantidad'], $pedidoActual['codigo']]);
                }
            }

            // Actualizar estado del pedido
            $stmt = $db->prepare("UPDATE pedidos SET estado = ? WHERE id = ?");
            $stmt->execute([$nuevoEstado, $id]);

            $db->commit();

            echo json_encode(["status" => "success", "message" => "Estado de pedido actualizado a " . $nuevoEstado]);

        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Error al actualizar: " . $e->getMessage()]);
        }
        break;

    case 'DELETE':
        $id = $_GET['id'] ?? null;
        $usuario_id = $_GET['usuario_id'] ?? null;

        if (!$id) {
            http_response_code(400);
            echo json_encode(["status" => "error", "message" => "ID requerido"]);
            exit();
        }

        // Validar que el usuario sea superusuario
        if (!empty($usuario_id)) {
            $stmtUser = $db->prepare("SELECT rol FROM usuarios WHERE id = ? AND activo = 1");
            $stmtUser->execute([$usuario_id]);
            $u = $stmtUser->fetch();
            if (!$u || !in_array($u['rol'], ['super_usuario', 'admin'])) {
                http_response_code(403);
                echo json_encode(["status" => "error", "message" => "Acceso restringido: solo el superusuario puede eliminar pedidos del historial"]);
                exit();
            }
        }

        try {
            $db->beginTransaction();

            // Eliminar los detalles asociados al pedido
            $stmt = $db->prepare("DELETE FROM detalle_pedido WHERE pedido_id = ?");
            $stmt->execute([$id]);

            // Eliminar el pedido de la base de datos
            $stmt = $db->prepare("DELETE FROM pedidos WHERE id = ?");
            $stmt->execute([$id]);

            $db->commit();
            echo json_encode(["status" => "success", "message" => "Pedido eliminado del historial"]);

        } catch (Exception $e) {
            $db->rollBack();
            http_response_code(500);
            echo json_encode(["status" => "error", "message" => "Error al eliminar: " . $e->getMessage()]);
        }
        break;
}
?>
