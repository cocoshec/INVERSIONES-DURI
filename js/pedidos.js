// ============================================
// INVERSIONES DURI C.A - MÓDULO DE PEDIDOS Y MAPA
// Lógica desacoplada y modular
// ============================================

// Habilitar contexto seguro para que el navegador active el GPS sin bloqueos
if (!window.isSecureContext && location.hostname.endsWith('.test')) {
    const targetUrl = location.href.replace(location.host, 'localhost/inversiones-duri');
    location.replace(targetUrl);
}

document.addEventListener('DOMContentLoaded', async function() {
    const API = '../backend/api';
    let allProducts = [];

    try {
        const isGH = window.location.hostname.includes('github.io');
        let res = null;
        if (!isGH) {
            try {
                res = await fetch(API + '/productos.php');
                if (res && res.ok) {
                    const data = await res.json();
                    if (data && data.status === 'success' && Array.isArray(data.data)) {
                        allProducts = data.data.filter(p => (parseInt(p.stock_actual, 10) > 0 || parseFloat(p.stock_actual) > 0));
                    }
                }
            } catch(e) {
                console.warn('Backend PHP no disponible, usando respaldo local:', e);
            }
        }
        if (!allProducts.length) {
            try {
                const resStatic = await fetch('../data/productos.json');
                if (resStatic.ok) {
                    const staticData = await resStatic.json();
                    allProducts = staticData.filter(p => (parseInt(p.stock_actual, 10) > 0 || parseFloat(p.stock_actual) > 0));
                }
            } catch(e) {
                console.warn('No se pudo cargar data/productos.json:', e);
            }
        }
    } catch(err) { console.error('Error cargando productos:', err); }

    const searchInput = document.getElementById('productSearch');
    const resultsBox = document.getElementById('productResults');

    function displayProductResults(query = '') {
        const q = (query || '').toLowerCase().trim();
        const matches = q
            ? allProducts.filter(p =>
                p.nombre.toLowerCase().includes(q) ||
                (p.descripcion && p.descripcion.toLowerCase().includes(q)) ||
                (p.categoria_nombre && p.categoria_nombre.toLowerCase().includes(q))
            )
            : allProducts;

        if (!matches.length) {
            resultsBox.innerHTML = '<div class="pr-empty">No se encontraron productos disponibles</div>';
        } else {
            resultsBox.innerHTML = matches.map(p => `
                <div class="pr-item" onmousedown="quickAdd(${p.id},'${p.nombre.replace(/'/g,"\\'").replace(/"/g,"&quot;")}',${p.precio_venta},${p.stock_actual})">
                    <div class="pr-item-info">
                        <strong>${p.nombre}</strong>
                        <span>${p.categoria_nombre} · Stock: ${p.stock_actual}</span>
                    </div>
                    <span class="pr-item-price">$${parseFloat(p.precio_venta).toFixed(2)}</span>
                </div>`).join('');
        }
        resultsBox.classList.add('show');
    }

    let searchDebounceTimer = null;
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            clearTimeout(searchDebounceTimer);
            searchDebounceTimer = setTimeout(() => {
                displayProductResults(this.value);
            }, 120);
        });

        searchInput.addEventListener('focus', function() {
            displayProductResults(this.value);
        });

        searchInput.addEventListener('click', function() {
            displayProductResults(this.value);
        });

        searchInput.addEventListener('blur', function() {
            setTimeout(() => resultsBox.classList.remove('show'), 250);
        });
    }

    // Escuchar cambios y pegado de texto en Dirección con debounce para evitar cálculos repetitivos
    const deliveryInput = document.getElementById('deliveryAddress');
    let addrDebounceTimer = null;
    if (deliveryInput) {
        deliveryInput.addEventListener('input', function() {
            clearTimeout(addrDebounceTimer);
            addrDebounceTimer = setTimeout(() => {
                analizarTextoDireccion(this.value);
            }, 200);
        });
        deliveryInput.addEventListener('paste', function() {
            setTimeout(() => {
                analizarTextoDireccion(deliveryInput.value);
            }, 80);
        });
    }
});

function quickAdd(id, name, price, stock) {
    const s = document.getElementById('productSearch');
    if (s) s.value = '';
    const r = document.getElementById('productResults');
    if (r) r.classList.remove('show');
    if (typeof addToCartById === 'function') addToCartById(id, name, price, stock);
    renderChips();
}

function renderChips() {
    const box = document.getElementById('productChips');
    if (!box) return;
    const cartList = (typeof cart !== 'undefined' && Array.isArray(cart)) ? cart : [];
    box.innerHTML = cartList.map((it, i) => `
        <span class="product-chip">
            ${it.name} ×${it.qty}
            <button type="button" onclick="removeChip(${i})">&times;</button>
        </span>
    `).join('');
}

function removeChip(i) {
    if (typeof removeFromCart === 'function') removeFromCart(i);
    renderChips();
}

// Render chips cuando cambia el carrito
const origUpdateCart = window.updateCart;
window.updateCart = function() {
    if (origUpdateCart) origUpdateCart();
    renderChips();
};

// ============================================
// SELECTOR DE UBICACIÓN GOOGLE MAPS (ADAPTATIVO PARA MÓVIL)
// ============================================
let gmap = null;
let gmarker = null;
let selectedCoords = null;
let selectedAddressText = '';
const DEFAULT_COORD = [10.2502976, -67.5961389]; // Feria Escolar Inversiones Duri, Maracay
const SECTORES_MARACAY = {
    // =========================================================================
    // TRAMO 0: 0 a 1.5 km de la Sede Central — ¡DELIVERY GRATIS ($0.00)!
    // =========================================================================
    'duri': { nombre: 'Sede Inversiones Duri (Centro)', coords: [10.2502976, -67.5961389], zona: 'centro', tarifa: 0 },
    'centro': { nombre: 'Casco Central de Maracay', coords: [10.2469, -67.5958], zona: 'centro', tarifa: 0 },
    'casco central': { nombre: 'Casco Central de Maracay', coords: [10.2469, -67.5958], zona: 'centro', tarifa: 0 },
    'plaza bolivar': { nombre: 'Plaza Bolívar / Centro, Maracay', coords: [10.2465, -67.5955], zona: 'centro', tarifa: 0 },
    'plaza bolívar': { nombre: 'Plaza Bolívar / Centro, Maracay', coords: [10.2465, -67.5955], zona: 'centro', tarifa: 0 },
    'plaza girardot': { nombre: 'Plaza Girardot / Catedral, Maracay', coords: [10.2468, -67.5988], zona: 'centro', tarifa: 0 },
    'calicanto': { nombre: 'Urb. Calicanto, Maracay (0.8 km)', coords: [10.2492, -67.5912], zona: 'centro', tarifa: 0 },
    'floresta': { nombre: 'Urb. La Floresta, Maracay (1.0 km)', coords: [10.2554, -67.5901], zona: 'centro', tarifa: 0 },
    'san isidro': { nombre: 'Urb. San Isidro, Maracay (1.2 km)', coords: [10.2515, -67.5852], zona: 'centro', tarifa: 0 },
    'barraca': { nombre: 'Barrio La Barraca, Maracay (1.1 km)', coords: [10.2465, -67.5882], zona: 'centro', tarifa: 0 },
    'miranda': { nombre: 'Av. Miranda, Centro de Maracay (0.5 km)', coords: [10.2475, -67.5975], zona: 'centro', tarifa: 0 },
    'constitucion': { nombre: 'Av. Constitución Centro, Maracay (0.7 km)', coords: [10.2440, -67.5980], zona: 'centro', tarifa: 0 },
    'constitución': { nombre: 'Av. Constitución Centro, Maracay (0.7 km)', coords: [10.2440, -67.5980], zona: 'centro', tarifa: 0 },
    'santos michelena': { nombre: 'Calle Santos Michelena, Maracay (0.6 km)', coords: [10.2480, -67.5930], zona: 'centro', tarifa: 0 },
    'pichincha': { nombre: 'Calle Pichincha / Páez, Centro (0.8 km)', coords: [10.2455, -67.5960], zona: 'centro', tarifa: 0 },
    'bolivar oeste': { nombre: 'Av. Bolívar Centro-Oeste, Maracay (1.3 km)', coords: [10.2485, -67.6065], zona: 'centro', tarifa: 0 },
    'bolívar oeste': { nombre: 'Av. Bolívar Centro-Oeste, Maracay (1.3 km)', coords: [10.2485, -67.6065], zona: 'centro', tarifa: 0 },

    // =========================================================================
    // TRAMO 1: 1.5 a 3.0 km — Barrios Cercanos al Centro (+$1.50 USD)
    // =========================================================================
    'soledad': { nombre: 'Urb. La Soledad, Maracay (1.6 km)', coords: [10.2612, -67.5968], zona: 'cercanas_15', tarifa: 1.5 },
    'base aragua': { nombre: 'Urb. Base Aragua, Maracay (1.7 km)', coords: [10.2575, -67.5895], zona: 'cercanas_15', tarifa: 1.5 },
    'parque aragua': { nombre: 'Parque Aragua, Maracay (1.7 km)', coords: [10.2471, -67.5815], zona: 'cercanas_15', tarifa: 1.5 },
    'bosque': { nombre: 'Urb. El Bosque, Maracay (1.8 km)', coords: [10.2625, -67.5902], zona: 'cercanas_15', tarifa: 1.5 },
    'arboleda': { nombre: 'Urb. La Arboleda, Maracay (1.8 km)', coords: [10.2589, -67.5950], zona: 'cercanas_15', tarifa: 1.5 },
    'barrio sucre': { nombre: 'Barrio Sucre, Maracay (1.6 km)', coords: [10.2530, -67.6085], zona: 'cercanas_15', tarifa: 1.5 },
    'san jose': { nombre: 'Barrio San José, Maracay (1.7 km)', coords: [10.2401, -67.6025], zona: 'cercanas_15', tarifa: 1.5 },
    'san josé': { nombre: 'Barrio San José, Maracay (1.7 km)', coords: [10.2401, -67.6025], zona: 'cercanas_15', tarifa: 1.5 },
    'madre maria': { nombre: 'Urb. Madre María de San José (1.8 km)', coords: [10.2415, -67.5990], zona: 'cercanas_15', tarifa: 1.5 },
    'madre maría': { nombre: 'Urb. Madre María de San José (1.8 km)', coords: [10.2415, -67.5990], zona: 'cercanas_15', tarifa: 1.5 },
    'santa ana': { nombre: 'Barrio Santa Ana, Maracay (1.7 km)', coords: [10.2420, -67.5875], zona: 'cercanas_15', tarifa: 1.5 },
    'acacias': { nombre: 'Urb. Las Acacias, Maracay (1.9 km)', coords: [10.2370, -67.5960], zona: 'cercanas_15', tarifa: 1.5 },
    'san ignacio': { nombre: 'Barrio San Ignacio, Maracay (2.1 km)', coords: [10.2335, -67.6010], zona: 'cercanas_15', tarifa: 1.5 },
    'hipodromo': { nombre: 'Urb. El Hipódromo, Maracay (2.2 km)', coords: [10.2360, -67.6080], zona: 'cercanas_15', tarifa: 1.5 },
    'hipódromo': { nombre: 'Urb. El Hipódromo, Maracay (2.2 km)', coords: [10.2360, -67.6080], zona: 'cercanas_15', tarifa: 1.5 },
    'andres bello': { nombre: 'Urb. Andrés Bello, Maracay (2.1 km)', coords: [10.2675, -67.5985], zona: 'cercanas_15', tarifa: 1.5 },
    'andrés bello': { nombre: 'Urb. Andrés Bello, Maracay (2.1 km)', coords: [10.2675, -67.5985], zona: 'cercanas_15', tarifa: 1.5 },
    'olivos': { nombre: 'Los Olivos Nuevos / Viejos, Maracay (2.4 km)', coords: [10.2705, -67.5815], zona: 'cercanas_15', tarifa: 1.5 },
    'san agustin': { nombre: 'Barrio San Agustín, Maracay (2.0 km)', coords: [10.2470, -67.5800], zona: 'cercanas_15', tarifa: 1.5 },
    'san agustín': { nombre: 'Barrio San Agustín, Maracay (2.0 km)', coords: [10.2470, -67.5800], zona: 'cercanas_15', tarifa: 1.5 },
    'los caobos': { nombre: 'Urb. Los Caobos, Maracay (2.2 km)', coords: [10.2495, -67.5775], zona: 'cercanas_15', tarifa: 1.5 },
    'caobos': { nombre: 'Urb. Los Caobos, Maracay (2.2 km)', coords: [10.2495, -67.5775], zona: 'cercanas_15', tarifa: 1.5 },
    'fundacion mendoza': { nombre: 'Urb. Fundación Mendoza, Maracay (2.5 km)', coords: [10.2445, -67.5760], zona: 'cercanas_15', tarifa: 1.5 },
    'fundación mendoza': { nombre: 'Urb. Fundación Mendoza, Maracay (2.5 km)', coords: [10.2445, -67.5760], zona: 'cercanas_15', tarifa: 1.5 },
    'romana': { nombre: 'La Romana, Maracay (2.2 km)', coords: [10.2550, -67.6150], zona: 'cercanas_15', tarifa: 1.5 },
    'lourdes': { nombre: 'Barrio Lourdes, Maracay (1.8 km)', coords: [10.2450, -67.6050], zona: 'cercanas_15', tarifa: 1.5 },
    'el carmen': { nombre: 'Barrio El Carmen, Maracay (1.8 km)', coords: [10.2430, -67.6040], zona: 'cercanas_15', tarifa: 1.5 },
    'libertad': { nombre: 'Barrio La Libertad, Maracay (2.0 km)', coords: [10.2410, -67.6060], zona: 'cercanas_15', tarifa: 1.5 },
    'el trebol': { nombre: 'Urb. El Trébol, Maracay (2.4 km)', coords: [10.2330, -67.5990], zona: 'cercanas_15', tarifa: 1.5 },
    'el trébol': { nombre: 'Urb. El Trébol, Maracay (2.4 km)', coords: [10.2330, -67.5990], zona: 'cercanas_15', tarifa: 1.5 },
    'centro hispano': { nombre: 'Zona Centro Hispano / Av. Aragua (2.6 km)', coords: [10.2375, -67.5790], zona: 'cercanas_15', tarifa: 1.5 },

    // =========================================================================
    // TRAMO 2: 3.0 a 5.5 km — Barrios Urbanos de Maracay (+$2.00 USD)
    // =========================================================================
    'delicias': { nombre: 'Las Delicias, Maracay (3.2 km)', coords: [10.2721, -67.6015], zona: 'cercanas', tarifa: 2 },
    'el toro': { nombre: 'Barrio El Toro, Las Delicias (3.8 km)', coords: [10.2790, -67.5995], zona: 'cercanas', tarifa: 2 },
    'camoruco': { nombre: 'Sector Camoruco, Las Delicias (3.6 km)', coords: [10.2760, -67.5980], zona: 'cercanas', tarifa: 2 },
    'cooperativa': { nombre: 'Barrio La Cooperativa, Maracay (3.1 km)', coords: [10.2690, -67.5880], zona: 'cercanas', tarifa: 2 },
    'pedrera': { nombre: 'Barrio La Pedrera, Maracay (4.2 km)', coords: [10.2810, -67.5810], zona: 'cercanas', tarifa: 2 },
    'las olivas': { nombre: 'Sector Las Olivas, Maracay (3.5 km)', coords: [10.2740, -67.5850], zona: 'cercanas', tarifa: 2 },
    'san jacinto': { nombre: 'Urb. San Jacinto, Maracay (3.4 km)', coords: [10.2395, -67.5685], zona: 'cercanas', tarifa: 2 },
    'la placera': { nombre: 'Urb. La Placera, Maracay (3.6 km)', coords: [10.2465, -67.5650], zona: 'cercanas', tarifa: 2 },
    'piñonal': { nombre: 'Barrio Piñonal, Maracay (3.1 km)', coords: [10.2351, -67.5862], zona: 'cercanas', tarifa: 2 },
    'jardines de aragua': { nombre: 'Urb. Los Jardines de Aragua (3.3 km)', coords: [10.2360, -67.5750], zona: 'cercanas', tarifa: 2 },
    'samanes': { nombre: 'Urb. Los Samanes, Maracay (3.8 km)', coords: [10.2185, -67.5912], zona: 'cercanas', tarifa: 2 },
    'mata redonda': { nombre: 'Urb. Mata Redonda / Palma Real (4.4 km)', coords: [10.2110, -67.5950], zona: 'cercanas', tarifa: 2 },
    'la esmeralda': { nombre: 'Urb. La Esmeralda, Maracay (4.2 km)', coords: [10.2145, -67.5930], zona: 'cercanas', tarifa: 2 },
    'la mulera': { nombre: 'Urb. La Mulera, Maracay (3.9 km)', coords: [10.2210, -67.5880], zona: 'cercanas', tarifa: 2 },
    'san carlos': { nombre: 'Barrio San Carlos, Maracay (3.3 km)', coords: [10.2280, -67.6080], zona: 'cercanas', tarifa: 2 },
    'campo alegre': { nombre: 'Barrio Campo Alegre, Maracay (3.5 km)', coords: [10.2241, -67.6052], zona: 'cercanas', tarifa: 2 },
    '23 de enero': { nombre: 'Barrio 23 de Enero, Maracay (3.1 km)', coords: [10.2425, -67.6152], zona: 'cercanas', tarifa: 2 },
    'coromoto': { nombre: 'Barrio La Coromoto, Maracay (3.2 km)', coords: [10.2520, -67.6180], zona: 'cercanas', tarifa: 2 },
    'santa rosa': { nombre: 'Barrio Santa Rosa, Maracay (3.1 km)', coords: [10.2380, -67.6150], zona: 'cercanas', tarifa: 2 },
    '12 de febrero': { nombre: 'Barrio 12 de Febrero, Maracay (3.4 km)', coords: [10.2410, -67.6210], zona: 'cercanas', tarifa: 2 },
    'milagro': { nombre: 'Barrio El Milagro, Maracay (3.5 km)', coords: [10.2505, -67.6250], zona: 'cercanas', tarifa: 2 },
    'jose felix ribas': { nombre: 'Barrio José Félix Ribas, Maracay (3.9 km)', coords: [10.2570, -67.6260], zona: 'cercanas', tarifa: 2 },
    'josé félix ribas': { nombre: 'Barrio José Félix Ribas, Maracay (3.9 km)', coords: [10.2570, -67.6260], zona: 'cercanas', tarifa: 2 },
    'caña de azucar': { nombre: 'Urb. Caña de Azúcar, MBI (4.5 km)', coords: [10.2642, -67.6338], zona: 'cercanas', tarifa: 2 },
    'azucar': { nombre: 'Urb. Caña de Azúcar, MBI (4.5 km)', coords: [10.2642, -67.6338], zona: 'cercanas', tarifa: 2 },
    'azúcar': { nombre: 'Urb. Caña de Azúcar, MBI (4.5 km)', coords: [10.2642, -67.6338], zona: 'cercanas', tarifa: 2 },
    'montaña fresca': { nombre: 'Urb. Montaña Fresca, Maracay (4.8 km)', coords: [10.2442, -67.5521], zona: 'cercanas', tarifa: 2 },
    'guasimal': { nombre: 'Urb. Guasimal, Maracay (5.1 km)', coords: [10.2315, -67.5452], zona: 'cercanas', tarifa: 2 },
    'los cocos': { nombre: 'Barrio Los Cocos, Sur de Maracay (4.2 km)', coords: [10.2150, -67.6050], zona: 'cercanas', tarifa: 2 },
    'la punta': { nombre: 'Sector La Punta / Río Blanco (4.5 km)', coords: [10.2120, -67.6010], zona: 'cercanas', tarifa: 2 },
    'rio blanco': { nombre: 'Barrio Río Blanco I y II, Maracay (4.3 km)', coords: [10.2165, -67.6020], zona: 'cercanas', tarifa: 2 },
    'río blanco': { nombre: 'Barrio Río Blanco I y II, Maracay (4.3 km)', coords: [10.2165, -67.6020], zona: 'cercanas', tarifa: 2 },
    'san luis': { nombre: 'Barrio San Luis / Aguacatal (4.4 km)', coords: [10.2200, -67.6120], zona: 'cercanas', tarifa: 2 },
    'aguacatal': { nombre: 'Barrio Aguacatal, Maracay (4.5 km)', coords: [10.2190, -67.6150], zona: 'cercanas', tarifa: 2 },

    // =========================================================================
    // TRAMO 3: 5.5 a 9.5 km — Barrios Periféricos / MBI / Castaño / Morita (+$3.00 USD)
    // =========================================================================
    'limon': { nombre: 'El Limón, Mario B. Iragorry (6.0 km)', coords: [10.2798, -67.6322], zona: 'limon', tarifa: 3 },
    'limón': { nombre: 'El Limón, Mario B. Iragorry (6.0 km)', coords: [10.2798, -67.6322], zona: 'limon', tarifa: 3 },
    'paseo': { nombre: 'Urb. El Paseo, El Limón (6.1 km)', coords: [10.2820, -67.6300], zona: 'limon', tarifa: 3 },
    'niño jesus': { nombre: 'Sector Niño Jesús, El Limón (6.4 km)', coords: [10.2850, -67.6310], zona: 'limon', tarifa: 3 },
    'niño jesús': { nombre: 'Sector Niño Jesús, El Limón (6.4 km)', coords: [10.2850, -67.6310], zona: 'limon', tarifa: 3 },
    'alma mater': { nombre: 'Urb. Alma Mater, El Limón (6.8 km)', coords: [10.2880, -67.6280], zona: 'limon', tarifa: 3 },
    'mata seca': { nombre: 'Barrio Mata Seca, El Limón (6.6 km)', coords: [10.2865, -67.6350], zona: 'limon', tarifa: 3 },
    'los rauseos': { nombre: 'Urb. Los Rauseos, El Limón (6.9 km)', coords: [10.2910, -67.6310], zona: 'limon', tarifa: 3 },
    'candelaria': { nombre: 'Urb. La Candelaria, MBI (6.3 km)', coords: [10.2845, -67.6385], zona: 'limon', tarifa: 3 },
    'valle verde': { nombre: 'Barrio Valle Verde, El Limón (6.8 km)', coords: [10.2890, -67.6350], zona: 'limon', tarifa: 3 },
    'arias blanco': { nombre: 'Barrio Arias Blanco, El Limón (5.9 km)', coords: [10.2760, -67.6360], zona: 'limon', tarifa: 3 },
    'arsenal': { nombre: 'Urb. Arsenal, Mario B. Iragorry (5.8 km)', coords: [10.2715, -67.6425], zona: 'limon', tarifa: 3 },
    'base sucre': { nombre: 'Urb. Base Sucre / Los Aviadores (6.5 km)', coords: [10.2685, -67.6512], zona: 'limon', tarifa: 3 },
    'san vicente': { nombre: 'Barrio San Vicente, Maracay Oeste (5.8 km)', coords: [10.2312, -67.6415], zona: 'limon', tarifa: 3 },
    'brisas del lago': { nombre: 'Barrio Brisas del Lago, Maracay (5.7 km)', coords: [10.2280, -67.6250], zona: 'limon', tarifa: 3 },
    'castaño': { nombre: 'Urb. El Castaño, Norte de Maracay (6.2 km)', coords: [10.2985, -67.6012], zona: 'limon', tarifa: 3 },
    'palmarito': { nombre: 'Sector Palmarito, El Castaño (7.2 km)', coords: [10.3080, -67.5950], zona: 'limon', tarifa: 3 },
    'corozal': { nombre: 'Barrio Corozal, El Castaño (6.8 km)', coords: [10.3040, -67.5980], zona: 'limon', tarifa: 3 },
    'ojo de agua': { nombre: 'Barrio Ojo de Agua, El Castaño (6.0 km)', coords: [10.2940, -67.5990], zona: 'limon', tarifa: 3 },
    'morita': { nombre: 'La Morita I y II, FLA (7.4 km)', coords: [10.2152, -67.5385], zona: 'limon', tarifa: 3 },
    'las cayenas': { nombre: 'Urb. Las Cayenas / La Morita (7.2 km)', coords: [10.2220, -67.5360], zona: 'limon', tarifa: 3 },
    'santa ines': { nombre: 'Barrio Santa Inés, La Morita (8.2 km)', coords: [10.2050, -67.5350], zona: 'limon', tarifa: 3 },
    'santa inés': { nombre: 'Barrio Santa Inés, La Morita (8.2 km)', coords: [10.2050, -67.5350], zona: 'limon', tarifa: 3 },
    'saman de guere': { nombre: 'Barrio Samán de Güere, Mariño (9.1 km)', coords: [10.2215, -67.5125], zona: 'limon', tarifa: 3 },
    'guere': { nombre: 'Barrio Samán de Güere, Mariño (9.1 km)', coords: [10.2215, -67.5125], zona: 'limon', tarifa: 3 },
    'güere': { nombre: 'Barrio Samán de Güere, Mariño (9.1 km)', coords: [10.2215, -67.5125], zona: 'limon', tarifa: 3 },
    'macaro': { nombre: 'Sector El Mácaro, Mariño (9.3 km)', coords: [10.2260, -67.5080], zona: 'limon', tarifa: 3 },
    'mácaro': { nombre: 'Sector El Mácaro, Mariño (9.3 km)', coords: [10.2260, -67.5080], zona: 'limon', tarifa: 3 },

    // =========================================================================
    // TRAMO 4: 9.5 a 14.0 km — Santa Rita / Coropo / Paraparal / Ovallera (+$4.00 USD)
    // =========================================================================
    'santa rita': { nombre: 'Santa Rita, Municipio Linares Alcántara (10.2 km)', coords: [10.2015, -67.5612], zona: 'santa_rita', tarifa: 4 },
    'francisco de miranda': { nombre: 'Barrio Francisco de Miranda, FLA (10.5 km)', coords: [10.1980, -67.5680], zona: 'santa_rita', tarifa: 4 },
    'paraparal': { nombre: 'Urb. Paraparal I y II, FLA (11.2 km)', coords: [10.1920, -67.5720], zona: 'santa_rita', tarifa: 4 },
    'coropo': { nombre: 'Barrio Coropo, FLA / Libertador (11.0 km)', coords: [10.1885, -67.5512], zona: 'santa_rita', tarifa: 4 },
    'ovallera': { nombre: 'Urb. La Ovallera, Libertador (12.2 km)', coords: [10.1810, -67.5480], zona: 'santa_rita', tarifa: 4 },
    'los hornos': { nombre: 'Barrio Los Hornos, Palo Negro (12.8 km)', coords: [10.1780, -67.5350], zona: 'santa_rita', tarifa: 4 },
    'camburito': { nombre: 'Sector Camburito, Santa Rita (10.8 km)', coords: [10.1960, -67.5590], zona: 'santa_rita', tarifa: 4 },
    'intercomunal': { nombre: 'Av. Intercomunal Maracay-Turmero (11.5 km)', coords: [10.2250, -67.5010], zona: 'santa_rita', tarifa: 4 },

    // =========================================================================
    // TRAMO 5: 14.0 a 19.0 km — Turmero / Palo Negro / Santa Cruz (+$5.00 USD)
    // =========================================================================
    'turmero': { nombre: 'Turmero Centro, Municipio Mariño (14.5 km)', coords: [10.2285, -67.4746], zona: 'turmero', tarifa: 5 },
    'valle lindo': { nombre: 'Urb. Valle Lindo, Turmero (14.2 km)', coords: [10.2310, -67.4820], zona: 'turmero', tarifa: 5 },
    'la julia': { nombre: 'Urb. La Julia, Turmero (14.0 km)', coords: [10.2340, -67.4880], zona: 'turmero', tarifa: 5 },
    'san pablo': { nombre: 'Urb. San Pablo, Turmero (15.2 km)', coords: [10.2380, -67.4680], zona: 'turmero', tarifa: 5 },
    'rosario de paya': { nombre: 'Rosario de Paya, Turmero (17.5 km)', coords: [10.2580, -67.4520], zona: 'turmero', tarifa: 5 },
    'paya': { nombre: 'Sector Paya / Payita, Turmero (17.5 km)', coords: [10.2580, -67.4520], zona: 'turmero', tarifa: 5 },
    'palo negro': { nombre: 'Palo Negro Centro, Municipio Libertador (14.8 km)', coords: [10.1742, -67.5412], zona: 'turmero', tarifa: 5 },
    'bael': { nombre: 'Urb. BAEL / Base Libertador, Palo Negro (15.5 km)', coords: [10.1680, -67.5490], zona: 'turmero', tarifa: 5 },
    'las vegas': { nombre: 'Barrio Las Vegas de Palo Negro (15.2 km)', coords: [10.1710, -67.5380], zona: 'turmero', tarifa: 5 },
    'la croquera': { nombre: 'Urb. La Croquera, Palo Negro (16.0 km)', coords: [10.1650, -67.5320], zona: 'turmero', tarifa: 5 },
    'santa cruz': { nombre: 'Santa Cruz de Aragua, Municipio Lamas (16.5 km)', coords: [10.1812, -67.5185], zona: 'turmero', tarifa: 5 },

    // =========================================================================
    // TRAMO 6: 19.0 a 25.0 km — Cagua / La Encrucijada / San Mateo (+$6.00 USD)
    // =========================================================================
    'encrucijada': { nombre: 'La Encrucijada de Cagua / Turmero (19.2 km)', coords: [10.2052, -67.4615], zona: 'cagua', tarifa: 6 },
    'cagua': { nombre: 'Cagua Centro, Municipio Sucre (20.5 km)', coords: [10.1856, -67.4589], zona: 'cagua', tarifa: 6 },
    'corinsa': { nombre: 'Urb. Corinsa, Cagua (21.0 km)', coords: [10.1785, -67.4652], zona: 'cagua', tarifa: 6 },
    'segundera': { nombre: 'Urb. La Segundera, Cagua (22.0 km)', coords: [10.1720, -67.4480], zona: 'cagua', tarifa: 6 },
    'bella vista': { nombre: 'Barrio Bella Vista, Cagua (22.8 km)', coords: [10.1650, -67.4420], zona: 'cagua', tarifa: 6 },
    'ciudad jardin': { nombre: 'Urb. Ciudad Jardín, Cagua (21.5 km)', coords: [10.1750, -67.4520], zona: 'cagua', tarifa: 6 },
    'ciudad jardín': { nombre: 'Urb. Ciudad Jardín, Cagua (21.5 km)', coords: [10.1750, -67.4520], zona: 'cagua', tarifa: 6 },
    'san mateo': { nombre: 'San Mateo, Municipio Bolívar (23.8 km)', coords: [10.2152, -67.4215], zona: 'cagua', tarifa: 6 },

    // =========================================================================
    // TRAMO 7: 25.0 a 33.0 km — Villa de Cura / Magdaleno / Tocorón (+$8.00 USD)
    // =========================================================================
    'magdaleno': { nombre: 'Magdaleno, Municipio Zamora (26.0 km)', coords: [10.1020, -67.6250], zona: 'villadecura', tarifa: 8 },
    'tocoron': { nombre: 'Tocorón, Municipio Zamora (26.5 km)', coords: [10.1250, -67.5750], zona: 'villadecura', tarifa: 8 },
    'tocorón': { nombre: 'Tocorón, Municipio Zamora (26.5 km)', coords: [10.1250, -67.5750], zona: 'villadecura', tarifa: 8 },
    'san francisco de asis': { nombre: 'San Francisco de Asís, Zamora (27.5 km)', coords: [10.0833, -67.5167], zona: 'villadecura', tarifa: 8 },
    'san francisco de asís': { nombre: 'San Francisco de Asís, Zamora (27.5 km)', coords: [10.0833, -67.5167], zona: 'villadecura', tarifa: 8 },
    'villa de cura': { nombre: 'Villa de Cura, Municipio Zamora (30.5 km)', coords: [10.0385, -67.4885], zona: 'villadecura', tarifa: 8 },
    'zamora': { nombre: 'Villa de Cura / Municipio Zamora (30.5 km)', coords: [10.0385, -67.4885], zona: 'villadecura', tarifa: 8 },

    // =========================================================================
    // TRAMO 8: 33.0 a 43.0 km — La Victoria / Zuata / El Consejo (+$10.00 USD)
    // =========================================================================
    'zuata': { nombre: 'Zuata, Municipio Ribas (34.0 km)', coords: [10.2100, -67.3600], zona: 'victoria', tarifa: 10 },
    'victoria': { nombre: 'La Victoria, Municipio Ribas (36.5 km)', coords: [10.2268, -67.3323], zona: 'victoria', tarifa: 10 },
    'la mora': { nombre: 'Urb. La Mora I y II, La Victoria (37.5 km)', coords: [10.2380, -67.3250], zona: 'victoria', tarifa: 10 },
    'soco': { nombre: 'Sector Soco / Castor Nieves Ríos, La Victoria (36.0 km)', coords: [10.2210, -67.3410], zona: 'victoria', tarifa: 10 },
    'el consejo': { nombre: 'El Consejo, Municipio Revenga (41.5 km)', coords: [10.2310, -67.2750], zona: 'victoria', tarifa: 10 },

    // =========================================================================
    // TRAMO 9: 43.0 a 55.0 km — Zonas Foráneas de Aragua (+$12.00 USD)
    // =========================================================================
    'tejerias': { nombre: 'Las Tejerías, Santos Michelena (47.5 km)', coords: [10.2520, -67.1750], zona: 'lejana', tarifa: 12 },
    'tejerías': { nombre: 'Las Tejerías, Santos Michelena (47.5 km)', coords: [10.2520, -67.1750], zona: 'lejana', tarifa: 12 },
    'colonia tovar': { nombre: 'Colonia Tovar, Municipio Tovar (48.0 km)', coords: [10.4056, -67.2889], zona: 'lejana', tarifa: 12 },
    'ocumare': { nombre: 'Ocumare de la Costa de Oro (46.0 km)', coords: [10.4560, -67.7710], zona: 'lejana', tarifa: 12 },
    'choroni': { nombre: 'Choroní / Puerto Colombia, Girardot (45.0 km)', coords: [10.4780, -67.6050], zona: 'lejana', tarifa: 12 },
    'choroní': { nombre: 'Choroní / Puerto Colombia, Girardot (45.0 km)', coords: [10.4780, -67.6050], zona: 'lejana', tarifa: 12 },
    'san sebastian': { nombre: 'San Sebastián de los Reyes (51.0 km)', coords: [9.9612, -67.1785], zona: 'lejana', tarifa: 12 },
    'san sebastián': { nombre: 'San Sebastián de los Reyes (51.0 km)', coords: [9.9612, -67.1785], zona: 'lejana', tarifa: 12 },
    'san casimiro': { nombre: 'San Casimiro, Sur de Aragua (52.0 km)', coords: [10.0000, -67.0167], zona: 'lejana', tarifa: 12 },

    // =========================================================================
    // FUERA DEL ESTADO ARAGUA — Bloqueado / No cotizable
    // =========================================================================
    'valencia': { nombre: 'Valencia, Carabobo (Fuera de Aragua)', coords: [10.1700, -68.0004], zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    'mariara': { nombre: 'Mariara, Carabobo (Fuera de Aragua)', coords: [10.2893, -67.7033], zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    'diego ibarra': { nombre: 'Municipio Diego Ibarra (Fuera de Aragua)', coords: [10.2893, -67.7033], zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    'san joaquin': { nombre: 'San Joaquín, Carabobo (Fuera de Aragua)', coords: [10.2600, -67.7850], zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    'san joaquín': { nombre: 'San Joaquín, Carabobo (Fuera de Aragua)', coords: [10.2600, -67.7850], zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    'aguas calientes': { nombre: 'Aguas Calientes, Carabobo (Fuera de Aragua)', coords: [10.2980, -67.7120], zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    'caracas': { nombre: 'Caracas, Dto. Capital (Fuera de Aragua)', coords: [10.4806, -66.9036], zona: 'fuera_aragua', tarifa: -1, bloqueado: true }
};

const CIUDADES_VE = {
    duri: { nombre: 'Sede Inversiones Duri (0 km • Centro)', coords: [10.2502976, -67.5961389], zoom: 17, zona: 'centro', tarifa: 0 },
    maracay: { nombre: 'Maracay Centro / Calicanto (0 a 1.5 km)', coords: [10.2469, -67.5958], zoom: 15, zona: 'centro', tarifa: 0 },
    soledad: { nombre: 'La Soledad / Base Aragua (1.5 a 3 km)', coords: [10.2612, -67.5968], zoom: 16, zona: 'cercanas_15', tarifa: 1.5 },
    acacias: { nombre: 'Las Acacias / San José (1.5 a 3 km)', coords: [10.2370, -67.5960], zoom: 16, zona: 'cercanas_15', tarifa: 1.5 },
    olivos: { nombre: 'Los Olivos / La Romana (1.5 a 3 km)', coords: [10.2705, -67.5815], zoom: 16, zona: 'cercanas_15', tarifa: 1.5 },
    delicias: { nombre: 'Las Delicias / La Cooperativa (3 a 5.5 km)', coords: [10.2721, -67.6015], zoom: 16, zona: 'cercanas', tarifa: 2 },
    sanjacinto: { nombre: 'San Jacinto / Piñonal (3 a 5.5 km)', coords: [10.2395, -67.5685], zoom: 16, zona: 'cercanas', tarifa: 2 },
    coromoto: { nombre: 'La Coromoto / 23 de Enero (3 a 5.5 km)', coords: [10.2520, -67.6180], zoom: 16, zona: 'cercanas', tarifa: 2 },
    samanes: { nombre: 'Los Samanes / Campo Alegre (3 a 5.5 km)', coords: [10.2185, -67.5912], zoom: 15, zona: 'cercanas', tarifa: 2 },
    canadeazucar: { nombre: 'Caña de Azúcar / Guasimal (3 a 5.5 km)', coords: [10.2642, -67.6338], zoom: 15, zona: 'cercanas', tarifa: 2 },
    limon: { nombre: 'El Limón / La Candelaria (5.5 a 9.5 km)', coords: [10.2798, -67.6322], zoom: 15, zona: 'limon', tarifa: 3 },
    morita: { nombre: 'La Morita I y II / El Castaño (5.5 a 9.5 km)', coords: [10.2152, -67.5385], zoom: 15, zona: 'limon', tarifa: 3 },
    santarita: { nombre: 'Santa Rita / Coropo / Paraparal (9.5 a 14 km)', coords: [10.2015, -67.5612], zoom: 15, zona: 'santa_rita', tarifa: 4 },
    turmero: { nombre: 'Turmero / Palo Negro / Santa Cruz (14 a 19 km)', coords: [10.2285, -67.4746], zoom: 14, zona: 'turmero', tarifa: 5 },
    cagua: { nombre: 'Cagua / La Encrucijada / San Mateo (19 a 25 km)', coords: [10.1856, -67.4589], zoom: 14, zona: 'cagua', tarifa: 6 },
    villadecura: { nombre: 'Villa de Cura / Magdaleno (25 a 33 km)', coords: [10.0380, -67.4890], zoom: 15, zona: 'villadecura', tarifa: 8 },
    magdaleno: { nombre: 'Magdaleno / Tocorón (25 a 33 km)', coords: [10.1020, -67.6250], zoom: 15, zona: 'villadecura', tarifa: 8 },
    victoria: { nombre: 'La Victoria / El Consejo (33 a 43 km)', coords: [10.2268, -67.3323], zoom: 13, zona: 'victoria', tarifa: 10 },
    tejerias: { nombre: 'Las Tejerías / Colonia Tovar (43 a 55 km)', coords: [10.2520, -67.1750], zoom: 14, zona: 'lejana', tarifa: 12 },
    mariara: { nombre: 'Mariara, Carabobo (Fuera de Aragua)', coords: [10.2893, -67.7033], zoom: 14, zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    valencia: { nombre: 'Valencia, Carabobo (Fuera de Aragua)', coords: [10.1700, -68.0004], zoom: 14, zona: 'fuera_aragua', tarifa: -1, bloqueado: true },
    caracas: { nombre: 'Caracas, Dto. Capital (Fuera de Aragua)', coords: [10.4806, -66.9036], zoom: 13, zona: 'fuera_aragua', tarifa: -1, bloqueado: true }
};

const googlePinIcon = (typeof L !== 'undefined') ? L.icon({
    iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
}) : null;

function moverMapaYMarcador(lat, lon, zoom = 16) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    if (!isNaN(latNum) && !isNaN(lonNum)) {
        if (gmap) {
            gmap.flyTo([latNum, lonNum], zoom, { animate: true, duration: 1.0 });
        }
        if (gmarker) {
            gmarker.setLatLng([latNum, lonNum]);
        }
    }
}

function centrarEnCiudad(clave) {
    const info = CIUDADES_VE[clave];
    if (!info) return;
    moverMapaYMarcador(info.coords[0], info.coords[1], info.zoom);
    actualizarPuntoSeleccionado(info.coords[0], info.coords[1], info.nombre, info.zona);
    if (typeof showToast === 'function') {
        if (info.bloqueado || info.zona === 'fuera_aragua') {
            showToast(`🚫 ${info.nombre}: Solo cotizamos y entregamos dentro del Estado Aragua.`, 'error');
        } else {
            const tarifaTxt = info.tarifa === 0 ? '¡Delivery GRATIS ($0.00)!' : `Tarifa Delivery: +$${info.tarifa.toFixed(2)} USD`;
            showToast(`📍 ${info.nombre} — ${tarifaTxt}`, 'info');
        }
    }
}

function obtenerSectorMasCercano(lat, lon) {
    let masCercano = null;
    let minDist = Infinity;
    if (typeof SECTORES_MARACAY !== 'undefined') {
        for (const [key, sec] of Object.entries(SECTORES_MARACAY)) {
            if (sec.coords) {
                const d = calcularDistanciaKm(lat, lon, sec.coords[0], sec.coords[1]);
                if (d < minDist) {
                    minDist = d;
                    masCercano = sec;
                }
            }
        }
    }
    if (masCercano && minDist <= 1.8) {
        return masCercano.nombre;
    }
    return null;
}

function reverseGeocodeReal(lat, lon, callback) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);
        fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`, { signal: controller.signal })
            .then(res => res.json())
            .then(data => {
                clearTimeout(timeoutId);
                if (data && data.address) {
                    const addr = data.address;
                    const calle = addr.road || addr.pedestrian || addr.street || addr.footway || '';
                    const sector = addr.neighbourhood || addr.suburb || addr.residential || addr.quarter || '';
                    const ciudad = addr.city || addr.town || addr.municipality || 'Maracay';
                    const partes = [calle, sector, ciudad].filter(p => p && p.trim().length > 0);
                    const desc = partes.length > 0 ? partes.join(', ') : (data.display_name ? data.display_name.split(',').slice(0, 3).join(',').trim() : '');
                    if (desc && callback) callback(desc);
                } else if (data && data.display_name) {
                    const parts = data.display_name.split(',');
                    const desc = parts.slice(0, 3).join(',').trim();
                    if (callback) callback(desc);
                }
            })
            .catch(() => {});
    } catch(e) {}
}

let mapTileLayerRoad = null;
let mapTileLayerSat = null;
let currentMapTileMode = 'road';

function cambiarCapaMapa(tipo) {
    if (!gmap) return;
    const btnRoad = document.getElementById('btnMapStyleRoad');
    const btnSat = document.getElementById('btnMapStyleSat');

    if (tipo === 'sat') {
        if (mapTileLayerRoad && gmap.hasLayer(mapTileLayerRoad)) {
            gmap.removeLayer(mapTileLayerRoad);
        }
        if (!mapTileLayerSat) {
            mapTileLayerSat = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
                maxZoom: 20,
                subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
                attribution: '&copy; Google Maps Satelital'
            });
        }
        mapTileLayerSat.addTo(gmap);
        currentMapTileMode = 'sat';
        if (btnRoad) { btnRoad.style.background = '#f1f3f4'; btnRoad.style.color = '#3c4043'; }
        if (btnSat) { btnSat.style.background = '#ea4335'; btnSat.style.color = '#fff'; }
    } else {
        if (mapTileLayerSat && gmap.hasLayer(mapTileLayerSat)) {
            gmap.removeLayer(mapTileLayerSat);
        }
        if (mapTileLayerRoad && !gmap.hasLayer(mapTileLayerRoad)) {
            mapTileLayerRoad.addTo(gmap);
        }
        currentMapTileMode = 'road';
        if (btnRoad) { btnRoad.style.background = '#1a73e8'; btnRoad.style.color = '#fff'; }
        if (btnSat) { btnSat.style.background = '#f1f3f4'; btnSat.style.color = '#3c4043'; }
    }
}

function initGoogleMap(coords = DEFAULT_COORD, zoom = 15) {
    if (gmap) {
        gmap.setView(coords, zoom);
        if (gmarker) gmarker.setLatLng(coords);
        actualizarPuntoSeleccionado(coords[0], coords[1]);
        setTimeout(() => gmap.invalidateSize(), 250);
        return;
    }

    const container = document.getElementById('gmapsCanvas');
    if (!container || typeof L === 'undefined') return;

    gmap = L.map('gmapsCanvas', {
        zoomControl: true
    }).setView(coords, zoom);

    // Capa oficial de Calles de Google Maps
    mapTileLayerRoad = L.tileLayer('https://{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '&copy; Google Maps'
    }).addTo(gmap);

    const iconOpts = googlePinIcon || L.icon({
        iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
        iconSize: [25, 41],
        iconAnchor: [12, 41],
        popupAnchor: [1, -34],
        shadowSize: [41, 41]
    });

    // Marcador rojo arrastrable
    gmarker = L.marker(coords, {
        draggable: true,
        icon: iconOpts,
        autoPan: true
    }).addTo(gmap);

    // Evento al arrastrar el marcador
    gmarker.on('dragend', function(e) {
        const pos = e.target.getLatLng();
        actualizarPuntoSeleccionado(pos.lat, pos.lng);
    });

    // Evento al hacer clic o tocar en cualquier parte del mapa
    gmap.on('click', function(e) {
        if (gmarker) gmarker.setLatLng(e.latlng);
        actualizarPuntoSeleccionado(e.latlng.lat, e.latlng.lng);
    });

    actualizarPuntoSeleccionado(coords[0], coords[1]);
    setTimeout(() => { if (gmap) gmap.invalidateSize(); }, 250);
}

function calcularDistanciaKm(lat1, lon1, lat2, lon2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

function autoDetectarZonaDelivery(lat, lon, texto = '', zonaForzada = null) {
    let zonaDetectada = 'centro';
    window._barrioDetectadoNombre = null;

    // Calcular siempre la distancia GPS desde la sede cuando existan coordenadas
    let dKm = null;
    const latNum = lat !== null && lat !== undefined ? parseFloat(lat) : NaN;
    const lonNum = lon !== null && lon !== undefined ? parseFloat(lon) : NaN;
    if (!isNaN(latNum) && !isNaN(lonNum) && typeof DEFAULT_COORD !== 'undefined') {
        dKm = calcularDistanciaKm(DEFAULT_COORD[0], DEFAULT_COORD[1], latNum, lonNum);
        window._distanciaDeliveryKm = dKm.toFixed(1);
    }

    const t = (texto || '').toLowerCase();
    // Buscar barrio específico en SECTORES_MARACAY por texto o cercanía GPS
    if (typeof SECTORES_MARACAY !== 'undefined') {
        for (const [key, sec] of Object.entries(SECTORES_MARACAY)) {
            if (t && t.includes(key)) {
                window._barrioDetectadoNombre = sec.nombre.split('(')[0].trim();
                break;
            }
        }
        if (!window._barrioDetectadoNombre && !isNaN(latNum) && !isNaN(lonNum)) {
            const secCercano = obtenerSectorMasCercano(latNum, lonNum);
            if (secCercano) {
                window._barrioDetectadoNombre = secCercano.split('(')[0].trim();
            }
        }
    }

    if (zonaForzada) {
        zonaDetectada = zonaForzada;
    } else {
        let matchedByText = false;

        // 1. Detección de zonas FUERA DEL ESTADO ARAGUA (No cotizables)
        const lugaresFueraAragua = [
            'valencia', 'carabobo', 'mariara', 'diego ibarra', 'san joaquin', 'san joaquín', 
            'guacara', 'naguanagua', 'san diego', 'puerto cabello', 'moron', 'morón', 'los guayos', 'tocuyito',
            'caracas', 'distrito capital', 'dto capital', 'miranda', 'los teques', 'san antonio', 'guarenas', 'guatire', 
            'chacao', 'baruta', 'petare', 'guarico', 'guárico', 'san juan de los morros', 'cojedes', 'san carlos de cojedes', 
            'yaracuy', 'san felipe', 'maracaibo', 'zulia', 'barquisimeto', 'lara', 'falcon', 'falcón', 
            'tachira', 'táchira', 'merida', 'mérida', 'anzoategui', 'anzoátegui', 'bolivar', 'bolívar'
        ];

        if (lugaresFueraAragua.some(p => t.includes(p))) {
            zonaDetectada = 'fuera_aragua';
            matchedByText = true;
        } else if (typeof SECTORES_MARACAY !== 'undefined') {
            for (const [key, sec] of Object.entries(SECTORES_MARACAY)) {
                if (t.includes(key)) {
                    zonaDetectada = sec.zona;
                    matchedByText = true;
                    break;
                }
            }
        }

        // 2. Si hay coordenadas GPS, asignar el rango progresivo por distancia exacta en km (A PARTIR DE 1.5 KM)
        if (dKm !== null) {
            if (lonNum <= -67.67 || lonNum >= -67.10 || latNum <= 9.75 || latNum >= 10.60 || dKm > 55.0) {
                zonaDetectada = 'fuera_aragua';
            } else if (dKm <= 1.5) {
                zonaDetectada = 'centro'; // 0 a 1.5 km: ¡GRATIS ($0.00)!
            } else if (dKm <= 3.0) {
                zonaDetectada = 'cercanas_15'; // 1.5 a 3.0 km: +$1.50 USD
            } else if (dKm <= 5.5) {
                zonaDetectada = 'cercanas'; // 3.0 a 5.5 km: +$2.00 USD
            } else if (dKm <= 9.5) {
                zonaDetectada = 'limon'; // 5.5 a 9.5 km: +$3.00 USD
            } else if (dKm <= 14.0) {
                zonaDetectada = 'santa_rita'; // 9.5 a 14.0 km: +$4.00 USD
            } else if (dKm <= 19.0) {
                zonaDetectada = 'turmero'; // 14.0 a 19.0 km: +$5.00 USD
            } else if (dKm <= 25.0) {
                zonaDetectada = 'cagua'; // 19.0 a 25.0 km: +$6.00 USD
            } else if (dKm <= 33.0) {
                zonaDetectada = 'villadecura'; // 25.0 a 33.0 km: +$8.00 USD
            } else if (dKm <= 43.0) {
                zonaDetectada = 'victoria'; // 33.0 a 43.0 km: +$10.00 USD
            } else {
                zonaDetectada = 'lejana'; // 43.0 a 55.0 km: +$12.00 USD
            }
        } else if (!matchedByText) {
            if (t.length > 5) {
                zonaDetectada = 'otra';
            } else {
                zonaDetectada = 'centro';
            }
        }
    }

    const sel = document.getElementById('selectZonaDelivery');
    if (sel) {
        if (sel.value !== zonaDetectada) {
            sel.value = zonaDetectada;
        }
        if (typeof cambiarZonaDelivery === 'function') {
            cambiarZonaDelivery(false);
        }
    }
    if (typeof sincronizarMontosUbicacion === 'function') {
        sincronizarMontosUbicacion();
    }
}

function aplicarUbicacionFijada(lat, lon, texto = '', zonaForzada = null) {
    if (typeof seleccionarModalidadEntrega === 'function') {
        seleccionarModalidadEntrega('delivery');
    }
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    const formatted = `${latNum.toFixed(6)},${lonNum.toFixed(6)}`;
    
    const geoInput = document.getElementById('geoCoords');
    if (geoInput) geoInput.value = formatted;
    selectedCoords = [latNum, lonNum];

    // Si no se proporcionó texto explícito, buscar sector conocido más cercano
    let defaultText = texto;
    if (!defaultText || defaultText.startsWith('Ubicación GPS') || defaultText.startsWith('Punto GPS')) {
        const secCercano = (typeof obtenerSectorMasCercano === 'function') ? obtenerSectorMasCercano(latNum, lonNum) : null;
        defaultText = secCercano || `Ubicación GPS (${latNum.toFixed(5)}, ${lonNum.toFixed(5)})`;
    }
    selectedAddressText = defaultText;

    // Actualizar el campo de texto en la página donde el usuario escribe su dirección
    const addrInput = document.getElementById('deliveryAddress');
    if (addrInput) {
        addrInput.value = defaultText;
    }

    // Mostrar tarjeta de confirmación de ubicación con link directo a Google Maps
    const card = document.getElementById('ubicacionConfirmadaCard');
    const coordsText = document.getElementById('ubicacionConfirmadaCoords');
    const testLink = document.getElementById('ubicacionTestMapsLink');

    if (card) card.style.display = 'flex';
    if (coordsText) coordsText.textContent = `${defaultText} (GPS: ${formatted})`;
    if (testLink) testLink.href = `https://www.google.com/maps/search/?api=1&query=${formatted}`;

    // Actualizar botón de vista externa en el modal si está abierto
    const extModalBtn = document.getElementById('btnGmapsExternalView');
    if (extModalBtn) extModalBtn.href = `https://www.google.com/maps/search/?api=1&query=${formatted}`;

    autoDetectarZonaDelivery(latNum, lonNum, defaultText, zonaForzada);
    if (typeof sincronizarMontosUbicacion === 'function') {
        sincronizarMontosUbicacion();
    }
}

let gpsWatchTrackerId = null;
let gpsAccuracyCircle = null;

function detenerRastreoGps() {
    if (gpsWatchTrackerId !== null) {
        try { navigator.geolocation.clearWatch(gpsWatchTrackerId); } catch(e) {}
        gpsWatchTrackerId = null;
    }
}

function dibujarCirculoPrecision(lat, lon, accuracy) {
    if (!gmap || typeof L === 'undefined') return;
    if (gpsAccuracyCircle) {
        try { gmap.removeLayer(gpsAccuracyCircle); } catch(e) {}
        gpsAccuracyCircle = null;
    }
    if (accuracy && accuracy < 2000) {
        gpsAccuracyCircle = L.circle([lat, lon], {
            radius: Math.min(accuracy, 250),
            color: '#1a73e8',
            fillColor: '#1a73e8',
            fillOpacity: 0.15,
            weight: 1.5
        }).addTo(gmap);
    }
}

let yaIntentoConPermiso = false;

function mostrarInstruccionesPermisoGps() {
    const modal = document.getElementById('modalPedirPermisoGps');
    if (modal) modal.style.display = 'flex';
}

function cerrarModalPermisoGps() {
    const modal = document.getElementById('modalPedirPermisoGps');
    if (modal) modal.style.display = 'none';
}

function intentarGpsConPermiso() {
    cerrarModalPermisoGps();
    yaIntentoConPermiso = true;
    abrirModalMapa(true, false);
    setTimeout(() => { yaIntentoConPermiso = false; }, 6000);
}

async function pegarEnlaceGoogleMaps() {
    let texto = '';
    try {
        if (navigator.clipboard && navigator.clipboard.readText) {
            texto = await navigator.clipboard.readText();
        }
    } catch(e) {}

    if (!texto || !texto.trim()) {
        texto = prompt('Pega aquí el enlace de Google Maps o tus coordenadas (ej: 10.2503, -67.5961):');
    }

    if (texto && texto.trim()) {
        const addrInput = document.getElementById('deliveryAddress');
        if (addrInput) addrInput.value = texto.trim();
        analizarTextoDireccion(texto.trim());
        if (typeof showToast === 'function') {
            showToast('📍 Enlace o coordenadas de Google Maps procesadas', 'success');
        }
    }
}

function analizarTextoDireccion(val) {
    if (!val || typeof val !== 'string') return;
    const text = val.trim();

    // 1. Enlace o texto con parámetros de Google Maps: ?q=lat,lon o query=lat,lon
    const qMatch = text.match(/[?&](?:q|query)=(-?\d{1,2}\.\d{2,12}),(-?\d{1,3}\.\d{2,12})/i);
    if (qMatch) {
        const lat = parseFloat(qMatch[1]);
        const lon = parseFloat(qMatch[2]);
        aplicarUbicacionFijada(lat, lon);
        moverMapaYMarcador(lat, lon, 17);
        if (typeof showToast === 'function') showToast('📍 Enlace de Google Maps fijado con éxito', 'success');
        return;
    }

    // 2. Enlace de Google Maps con @lat,lon
    const atMatch = text.match(/@(-?\d{1,2}\.\d{2,12}),(-?\d{1,3}\.\d{2,12})/);
    if (atMatch) {
        const lat = parseFloat(atMatch[1]);
        const lon = parseFloat(atMatch[2]);
        aplicarUbicacionFijada(lat, lon);
        moverMapaYMarcador(lat, lon, 17);
        if (typeof showToast === 'function') showToast('📍 Ubicación de Google Maps fijada con éxito', 'success');
        return;
    }

    // 3. Formato geo:lat,lon
    const geoMatch = text.match(/geo:(-?\d{1,2}\.\d{2,12}),(-?\d{1,3}\.\d{2,12})/i);
    if (geoMatch) {
        const lat = parseFloat(geoMatch[1]);
        const lon = parseFloat(geoMatch[2]);
        aplicarUbicacionFijada(lat, lon);
        moverMapaYMarcador(lat, lon, 17);
        if (typeof showToast === 'function') showToast('📍 Coordenadas fijadas con éxito', 'success');
        return;
    }

    // 4. Formato Grados, Minutos y Segundos (DMS): ej: 10°15'01.1"N 67°35'46.1"W
    const dmsMatch = text.match(/(\d{1,2})[°\s]+(\d{1,2})['\s]+([\d.]+)"?\s*([NSns])[\s,]+(\d{1,3})[°\s]+(\d{1,2})['\s]+([\d.]+)"?\s*([EWewOo])/);
    if (dmsMatch) {
        let lat = parseFloat(dmsMatch[1]) + parseFloat(dmsMatch[2])/60 + parseFloat(dmsMatch[3])/3600;
        if (dmsMatch[4].toUpperCase() === 'S') lat = -lat;
        let lon = parseFloat(dmsMatch[5]) + parseFloat(dmsMatch[6])/60 + parseFloat(dmsMatch[7])/3600;
        if (dmsMatch[8].toUpperCase() === 'W' || dmsMatch[8].toUpperCase() === 'O') lon = -lon;
        aplicarUbicacionFijada(lat, lon);
        moverMapaYMarcador(lat, lon, 17);
        if (typeof showToast === 'function') showToast('📍 Coordenadas DMS convertidas y fijadas', 'success');
        return;
    }

    // 5. Coordenadas directas: ej. 10.258136, -68.012099
    const coordMatch = text.match(/(-?\d{1,2}\.\d{2,12})\s*,\s*(-?\d{1,3}\.\d{2,12})/);
    if (coordMatch) {
        const lat = parseFloat(coordMatch[1]);
        const lon = parseFloat(coordMatch[2]);
        if (lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180) {
            aplicarUbicacionFijada(lat, lon);
            moverMapaYMarcador(lat, lon, 17);
            if (typeof showToast === 'function') showToast('📍 Coordenadas fijadas con éxito', 'success');
            return;
        }
    }

    // 6. Texto normal: comprobar contra la base de datos de sectores de Maracay
    const tLower = text.toLowerCase();
    let sectorEncontrado = null;
    if (typeof SECTORES_MARACAY !== 'undefined') {
        for (const [key, sec] of Object.entries(SECTORES_MARACAY)) {
            if (tLower.includes(key)) {
                sectorEncontrado = sec;
                break;
            }
        }
    }

    const infoSector = document.getElementById('infoSectorDetectado');
    if (sectorEncontrado) {
        autoDetectarZonaDelivery(null, null, text, sectorEncontrado.zona);
        if (infoSector) {
            infoSector.style.display = 'flex';
            infoSector.style.background = '#eff6ff';
            infoSector.style.borderColor = '#bfdbfe';
            infoSector.style.color = '#1e40af';
            const tarifaStr = sectorEncontrado.tarifa === 0 ? '¡Delivery GRATIS ($0.00)!' : `+$${sectorEncontrado.tarifa.toFixed(2)} USD`;
            infoSector.innerHTML = `<i class="fas fa-check-circle" style="color:#059669; font-size:1.05rem;"></i> <span>Sector detectado: <strong>${sectorEncontrado.nombre}</strong> — Tarifa: <strong style="color:#1d4ed8;">${tarifaStr}</strong></span>`;
        }
    } else {
        autoDetectarZonaDelivery(null, null, text);
        const selZona = document.getElementById('selectZonaDelivery');
        if (selZona && selZona.value === 'fuera_aragua') {
            if (infoSector) {
                infoSector.style.display = 'flex';
                infoSector.style.background = '#fef2f2';
                infoSector.style.borderColor = '#fecaca';
                infoSector.style.color = '#991b1b';
                infoSector.innerHTML = `<i class="fas fa-ban" style="color:#dc2626; font-size:1.15rem; flex-shrink:0;"></i> <span><strong>Zona Fuera del Estado Aragua:</strong> Solo realizamos cotizaciones y despachos dentro del Estado Aragua. No es posible cotizar fuera del estado.</span>`;
            }
        } else if (infoSector) {
            if (text.length > 5) {
                infoSector.style.display = 'flex';
                infoSector.style.background = '#eff6ff';
                infoSector.style.borderColor = '#bfdbfe';
                infoSector.style.color = '#1e40af';
                const opt = selZona ? selZona.options[selZona.selectedIndex] : null;
                const costo = opt ? parseFloat(opt.getAttribute('data-costo') || 0) : 3;
                const tarifaStr = costo === 0 ? '¡Delivery GRATIS ($0.00)!' : `+$${costo.toFixed(2)} USD`;
                infoSector.innerHTML = `<i class="fas fa-map-marker-alt" style="color:#2563eb; font-size:1.05rem;"></i> <span>Ubicación personalizada (Edo. Aragua) — Tarifa asignada: <strong style="color:#1d4ed8;">${tarifaStr}</strong> (Toca "Mi GPS Actual" para distancia exacta).</span>`;
            } else {
                infoSector.style.display = 'none';
            }
        }
    }
}

function capturarGpsTiempoReal(onSuccess, onError) {
    detenerRastreoGps();

    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        if (onError) onError('El navegador exige HTTPS para activar el GPS. Abre el enlace seguro.');
        return;
    }

    if (!navigator.geolocation) {
        if (onError) onError('Tu navegador o dispositivo no soporta geolocalización GPS. Toca directamente tu casa en el mapa 📍');
        return;
    }

    let resuelto = false;

    const safetyTimer = setTimeout(() => {
        if (!resuelto) {
            resuelto = true;
            detenerRastreoGps();
            if (onError) onError('Señal de satélite lenta. Toca tu casa directamente en el mapa o usa los botones de ciudad 📍');
        }
    }, 14000);

    navigator.geolocation.getCurrentPosition(
        (pos) => {
            if (pos && pos.coords && pos.coords.latitude) {
                resuelto = true;
                onSuccess(pos, 'red');
            }
        },
        (err) => {
            console.warn('Geolocation rápido aviso:', err.code, err.message);
            if (err.code === 1) { // PERMISSION_DENIED
                resuelto = true;
                clearTimeout(safetyTimer);
                detenerRastreoGps();
                if (!yaIntentoConPermiso) {
                    mostrarInstruccionesPermisoGps();
                }
                if (onError) onError('Safari tiene la ubicación bloqueada en este iPhone. Toca directamente tu casa en el mapa 📍');
            }
        },
        { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
    );

    try {
        gpsWatchTrackerId = navigator.geolocation.watchPosition(
            (pos) => {
                if (pos && pos.coords && pos.coords.latitude) {
                    resuelto = true;
                    clearTimeout(safetyTimer);
                    onSuccess(pos, 'satelite');
                    const acc = pos.coords.accuracy || 15;
                    if (acc < 20) {
                        setTimeout(detenerRastreoGps, 2500);
                    }
                }
            },
            (err) => {
                console.warn('Geolocation watch aviso:', err.code, err.message);
                if (err.code === 1) { // PERMISSION_DENIED
                    resuelto = true;
                    clearTimeout(safetyTimer);
                    detenerRastreoGps();
                    if (!yaIntentoConPermiso) {
                        mostrarInstruccionesPermisoGps();
                    }
                    if (onError) onError('Safari tiene la ubicación bloqueada en este iPhone. Toca directamente tu casa en el mapa 📍');
                }
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
        );
    } catch(e) {
        console.error('Error iniciando watchPosition:', e);
    }
}

function obtenerGpsDirecto() {
    if (typeof seleccionarModalidadEntrega === 'function') {
        seleccionarModalidadEntrega('delivery');
    }
    const btn = document.getElementById('btnGpsDirect');
    const originalHtml = btn ? btn.innerHTML : '';
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abriendo GPS...';
    abrirModalMapa(true, false);
    setTimeout(() => {
        if (btn) btn.innerHTML = originalHtml;
    }, 800);
}

function abrirModalMapa(usarGpsAutomatico = false, mensajeAlerta = false) {
    if (typeof seleccionarModalidadEntrega === 'function') {
        seleccionarModalidadEntrega('delivery');
    }
    const modal = document.getElementById('modalGoogleMaps');
    if (!modal) return;
    modal.style.display = 'flex';

    const selZona = document.getElementById('selectZonaDelivery');
    const zonaActual = selZona ? selZona.value : 'centro';

    const currentCoordsVal = document.getElementById('geoCoords') ? document.getElementById('geoCoords').value : '';
    let coordsToUse = DEFAULT_COORD;
    if (currentCoordsVal && currentCoordsVal.includes(',')) {
        const parts = currentCoordsVal.split(',');
        coordsToUse = [parseFloat(parts[0]), parseFloat(parts[1])];
    } else if (selectedCoords && Array.isArray(selectedCoords)) {
        coordsToUse = selectedCoords;
    } else if (zonaActual && CIUDADES_VE[zonaActual]) {
        coordsToUse = CIUDADES_VE[zonaActual].coords;
    } else if (zonaActual === 'cercanas') {
        coordsToUse = CIUDADES_VE.delicias.coords;
    } else if (zonaActual === 'lejana') {
        coordsToUse = CIUDADES_VE.victoria.coords;
    }

    initGoogleMap(coordsToUse);
    const extModalBtn = document.getElementById('btnGmapsExternalView');
    if (extModalBtn) {
        extModalBtn.href = `https://www.google.com/maps/search/?api=1&query=${coordsToUse[0]},${coordsToUse[1]}`;
    }
    setTimeout(() => {
        if (gmap && typeof gmap.invalidateSize === 'function') gmap.invalidateSize();
    }, 200);

    if (typeof sincronizarMontosUbicacion === 'function') {
        sincronizarMontosUbicacion();
    }

    const alertBox = document.getElementById('gmapsPromptNotice');
    if (alertBox) {
        alertBox.style.display = mensajeAlerta ? 'flex' : 'none';
    }

    if (usarGpsAutomatico) {
        centrarGpsModal(true);
    }
}

function cerrarModalMapa() {
    const modal = document.getElementById('modalGoogleMaps');
    if (modal) modal.style.display = 'none';
    detenerRastreoGps();
}

function centrarGpsModal(mostrarAlertaSiFalla = true) {
    const btn = document.getElementById('btnGpsInsideModal');
    if (btn) btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    const restaurar = () => {
        if (btn) btn.innerHTML = '<i class="fas fa-crosshairs"></i>';
    };

    const alertBox = document.getElementById('gmapsPromptNotice');
    if (alertBox) {
        alertBox.style.display = 'flex';
        alertBox.innerHTML = '<i class="fas fa-satellite-dish fa-spin" style="color:#007bff; font-size:1.05rem;"></i> <span><b>Localizando tu posición en tiempo real...</b> Por favor espera un momento.</span>';
    }

    if (typeof showToast === 'function') {
        showToast('📡 Localizando tu ubicación GPS...', 'info');
    }

    capturarGpsTiempoReal(
        (pos, tipo) => {
            restaurar();
            const lat = pos.coords.latitude;
            const lon = pos.coords.longitude;
            const acc = pos.coords.accuracy || 20;

            const zoomNivel = (acc < 30 ? 18 : 16);
            moverMapaYMarcador(lat, lon, zoomNivel);
            dibujarCirculoPrecision(lat, lon, acc);
            actualizarPuntoSeleccionado(lat, lon);

            aplicarUbicacionFijada(lat, lon);
            reverseGeocodeReal(lat, lon, (desc) => {
                aplicarUbicacionFijada(lat, lon, desc);
            });

            if (alertBox) {
                alertBox.style.display = 'flex';
                alertBox.innerHTML = '<i class="fas fa-check-circle" style="color:#28a745; font-size:1.1rem;"></i> <span><b>¡Ubicación encontrada!</b> Si deseas afinar tu puerta, arrastra el marcador naranja.</span>';
            }

            if (typeof showToast === 'function') {
                showToast('📍 ¡Ubicación exacta fijada con éxito!', 'success');
            }
        },
        (msgError) => {
            restaurar();
            if (alertBox) {
                alertBox.style.display = 'flex';
                alertBox.innerHTML = '<i class="fas fa-exclamation-circle" style="color:#ea4335; font-size:1.1rem;"></i> <span>' + (msgError || 'No pudimos conectar con el GPS.') + ' <b>Toca en el mapa donde está tu casa</b> para marcar la entrega.</span>';
            }
            if (mostrarAlertaSiFalla && typeof showToast === 'function') {
                showToast(msgError || 'Toca tu casa en el mapa 📍', 'warning');
            }
        }
    );
}

function buscarSectorEnMapa() {
    const input = document.getElementById('mapSearchInput');
    if (!input || !input.value.trim()) return;
    const q = input.value.trim();
    const qLower = q.toLowerCase();

    if (typeof SECTORES_MARACAY !== 'undefined') {
        for (const [key, sec] of Object.entries(SECTORES_MARACAY)) {
            if (qLower.includes(key) || key.includes(qLower)) {
                moverMapaYMarcador(sec.coords[0], sec.coords[1], 16);
                actualizarPuntoSeleccionado(sec.coords[0], sec.coords[1], sec.nombre, sec.zona);
                const tarifaTxt = sec.tarifa === 0 ? '¡Delivery GRATIS ($0.00)!' : `Tarifa Delivery: +$${sec.tarifa.toFixed(2)} USD`;
                if (typeof showToast === 'function') showToast(`📍 ${sec.nombre} — ${tarifaTxt}`, 'success');
                return;
            }
        }
    }

    if (typeof showToast === 'function') showToast('🔍 Buscando "' + q + '" en Maracay / Aragua...', 'info');

    fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=ve&q=${encodeURIComponent(q + ', Aragua, Venezuela')}&limit=1`)
        .then(r => r.json())
        .then(data => {
            if (data && data.length > 0) {
                const lat = parseFloat(data[0].lat);
                const lon = parseFloat(data[0].lon);
                moverMapaYMarcador(lat, lon, 16);
                const partes = data[0].display_name.split(',');
                const nombreCorto = partes.slice(0, 3).join(',').trim();
                actualizarPuntoSeleccionado(lat, lon, nombreCorto);
                if (typeof showToast === 'function') showToast('📍 Encontrado: ' + nombreCorto, 'success');
            } else {
                fetch(`https://nominatim.openstreetmap.org/search?format=json&countrycodes=ve&q=${encodeURIComponent(q + ', Venezuela')}&limit=1`)
                    .then(r2 => r2.json())
                    .then(d2 => {
                        if (d2 && d2.length > 0) {
                            const lat2 = parseFloat(d2[0].lat);
                            const lon2 = parseFloat(d2[0].lon);
                            moverMapaYMarcador(lat2, lon2, 16);
                            const partes2 = d2[0].display_name.split(',');
                            const nombreCorto2 = partes2.slice(0, 3).join(',').trim();
                            actualizarPuntoSeleccionado(lat2, lon2, nombreCorto2);
                            if (typeof showToast === 'function') showToast('📍 Encontrado: ' + nombreCorto2, 'success');
                        } else {
                            actualizarPuntoSeleccionado(DEFAULT_COORD[0], DEFAULT_COORD[1], q, 'otra');
                            if (typeof showToast === 'function') {
                                showToast('📍 "' + q + '": Tarifa $3.00 USD asignada. Toca en el mapa donde está tu casa para afinarla.', 'info');
                            }
                        }
                    })
                    .catch(() => {
                        actualizarPuntoSeleccionado(DEFAULT_COORD[0], DEFAULT_COORD[1], q, 'otra');
                        if (typeof showToast === 'function') showToast('📍 Tarifa $3.00 USD asignada. Toca en el mapa donde está tu casa.', 'info');
                    });
            }
        })
        .catch(() => {
            actualizarPuntoSeleccionado(DEFAULT_COORD[0], DEFAULT_COORD[1], q, 'otra');
            if (typeof showToast === 'function') showToast('📍 Tarifa $3.00 USD asignada. Toca en el mapa donde está tu casa.', 'info');
        });
}

function actualizarPuntoSeleccionado(lat, lon, textoManual = '', zonaManual = null) {
    const latNum = parseFloat(lat);
    const lonNum = parseFloat(lon);
    selectedCoords = [latNum, lonNum];
    const formatted = `${latNum.toFixed(5)}, ${lonNum.toFixed(5)}`;

    let nombreInmediato = textoManual;
    if (!nombreInmediato) {
        const secCercano = (typeof obtenerSectorMasCercano === 'function') ? obtenerSectorMasCercano(latNum, lonNum) : null;
        nombreInmediato = secCercano ? `${secCercano}` : `Ubicación GPS (${formatted})`;
    }
    selectedAddressText = nombreInmediato;

    const addressBox = document.getElementById('gmapsDetectedAddress');
    if (addressBox) addressBox.innerHTML = `<strong>${nombreInmediato}</strong> <small style="color:#64748b;">(${formatted})</small>`;

    aplicarUbicacionFijada(latNum, lonNum, nombreInmediato, zonaManual);

    if (!textoManual) {
        reverseGeocodeReal(latNum, lonNum, (desc) => {
            if (desc && desc.trim()) {
                selectedAddressText = desc;
                if (addressBox) addressBox.innerHTML = `<strong>${desc}</strong> <small style="color:#64748b;">(${formatted})</small>`;
                aplicarUbicacionFijada(latNum, lonNum, desc, zonaManual);
            }
        });
    }
}

function confirmarUbicacionDesdeModal() {
    if (!selectedCoords || !selectedCoords.length) {
        alert('Por favor toca un punto en el mapa para marcar tu dirección.');
        return;
    }

    if (typeof seleccionarModalidadEntrega === 'function') {
        seleccionarModalidadEntrega('delivery');
    }

    aplicarUbicacionFijada(selectedCoords[0], selectedCoords[1], selectedAddressText);
    cerrarModalMapa();

    setTimeout(() => {
        const card = document.getElementById('ubicacionConfirmadaCard');
        if (card) {
            card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, 120);

    if (typeof showToast === 'function') {
        showToast('📍 Ubicación fijada con éxito en tu pedido', 'success');
    }
}
