<?php
// ========================================================
// CONFIGURACIÓN DE CORREO SMTP - INVERSIONES DURI C.A
// ========================================================
// Para usar Gmail:
// 1. Ve a tu cuenta de Google -> Seguridad -> Verificación en 2 pasos (debe estar activada).
// 2. Busca "Contraseñas de aplicaciones" (App Passwords).
// 3. Crea una para "Correo" / "Inversiones Duri" y Google te dará una clave de 16 letras.
// 4. Pega esa clave en 'smtp_pass' abajo.
// ========================================================

return [
    // Activar o desactivar envío por SMTP real
    'smtp_active' => true,

    // Servidor SMTP (Gmail por defecto)
    'smtp_host'   => 'smtp.gmail.com',
    'smtp_port'   => 465,             // 465 para SSL (recomendado) o 587 para TLS
    'smtp_secure' => 'ssl',           // 'ssl' o 'tls'

    // Correo remitente (tu cuenta de Gmail)
    'smtp_user'   => 'inversionesdurica@gmail.com',

    // Contraseña de Aplicación de Google (16 letras sin espacios)
    'smtp_pass'   => '',

    // Nombre que verá el cliente al recibir el correo
    'from_email'  => 'inversionesdurica@gmail.com',
    'from_name'   => 'Inversiones Duri C.A',
    'reply_to'    => 'inversionesdurica@gmail.com'
];
