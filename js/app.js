// ============================================
// INVERSIONES DURI C.A - JavaScript Principal
// ============================================

const isInPages = window.location.pathname.includes('/pages/');
const API_BASE = isInPages ? '../backend/api' : 'backend/api';

// ============================================
// VALIDACIONES
// ============================================
const Validator = {
    email: (val) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
    phone: (val) => !val || /^\+?[\d\s-]{7,15}$/.test(val),
    minLength: (val, min) => val.length >= min,
    required: (val) => val.trim().length > 0,
    number: (val) => !isNaN(val) && parseFloat(val) > 0,
    
    showError: (input, msg) => {
        input.style.borderColor = '#dc3545';
        let error = input.parentElement.querySelector('.field-error');
        if (!error) {
            error = document.createElement('span');
            error.className = 'field-error';
            error.style.cssText = 'color:#dc3545;font-size:0.8rem;margin-top:4px;display:block';
            input.parentElement.appendChild(error);
        }
        error.textContent = msg;
    },
    
    clearError: (input) => {
        input.style.borderColor = '';
        const error = input.parentElement.querySelector('.field-error');
        if (error) error.remove();
    },
    
    validateForm: (fields) => {
        let valid = true;
        fields.forEach(({input, rules}) => {
            Validator.clearError(input);
            for (const [rule, params] of Object.entries(rules)) {
                let isValid = true;
                if (rule === 'required') isValid = Validator.required(input.value);
                else if (rule === 'email') isValid = Validator.email(input.value);
                else if (rule === 'phone') isValid = Validator.phone(input.value);
                else if (rule === 'minLength') isValid = Validator.minLength(input.value, params);
                else if (rule === 'number') isValid = Validator.number(input.value);
                
                if (!isValid) {
                    valid = false;
                    const msgs = {
                        required: 'Este campo es obligatorio',
                        email: 'Ingresa un email válido',
                        phone: 'Teléfono no válido',
                        minLength: `Mínimo ${params} caracteres`,
                        number: 'Debe ser un número mayor a 0'
                    };
                    Validator.showError(input, msgs[rule]);
                    break;
                }
            }
        });
        return valid;
    }
};

// ============================================
// USUARIO / SESIÓN
// ============================================
function getUser() {
    const data = localStorage.getItem('userDuri');
    return data ? JSON.parse(data) : null;
}

function isLoggedIn() {
    return getUser() !== null;
}

function isSuperUsuario() {
    const user = getUser();
    return user && user.rol === 'super_usuario';
}



function logout() {
    localStorage.removeItem('userDuri');
    window.location.reload();
}

// ============================================
// NAVBAR
// ============================================
document.addEventListener('DOMContentLoaded', function() {
    initNav();
    initPage();
    showUserBadge();
});

function showUserBadge() {
    const user = JSON.parse(localStorage.getItem('userDuri') || 'null');
    const nav = document.querySelector('.nav-menu');
    if (!nav) return;

    const existing = document.getElementById('userBadge');
    if (existing) existing.remove();

    if (user) {
        const rolLabels = { super_usuario: 'Super Admin', operador: 'Operador', usuario: 'Usuario' };
        const rolColors = { super_usuario: '#EF7E26', operador: '#28a745', usuario: '#6c757d' };
        const rolEmoji = { super_usuario: '👑', operador: '⚙️', usuario: '👤' };
        
        // Badge en navbar
        const badge = document.createElement('li');
        badge.id = 'userBadge';
        badge.style.cssText = 'display:flex;align-items:center;gap:8px;margin-left:10px;padding:6px 14px;border-radius:10px;font-size:0.82rem;font-weight:600;color:white;background:' + rolColors[user.rol] + ';cursor:pointer;list-style:none';
        badge.innerHTML = '<i class="fas fa-user-circle"></i> ' + user.nombre.split(' ')[0] + ' <span style="background:rgba(255,255,255,0.25);padding:2px 8px;border-radius:8px;font-size:0.7rem">' + rolLabels[user.rol] + '</span>';
        badge.title = 'Click para cerrar sesión';
        badge.onclick = function() {
            if (confirm('¿Cerrar sesión de ' + user.nombre + '?')) {
                localStorage.removeItem('userDuri');
                window.location.reload();
            }
        };
        nav.appendChild(badge);

        // Banner de bienvenida
        const welcome = document.createElement('div');
        welcome.style.cssText = 'position:fixed;top:0;left:0;right:0;background:' + rolColors[user.rol] + ';color:white;padding:16px 20px;font-family:Rubik,sans-serif;font-size:1rem;font-weight:500;z-index:1500;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2)';
        welcome.innerHTML = '<span style="font-size:1.4rem">' + rolEmoji[user.rol] + '</span> ¡Bienvenido <strong>' + rolLabels[user.rol] + '</strong>! — ' + user.nombre + ' <span onclick="this.parentElement.remove()" style="margin-left:20px;cursor:pointer;opacity:0.7;font-size:1.2rem">&times;</span>';
        document.body.appendChild(welcome);
        document.body.style.paddingTop = '60px';
        setTimeout(() => { welcome.style.opacity = '0'; welcome.style.transition = 'opacity 0.5s'; setTimeout(() => { welcome.remove(); document.body.style.paddingTop = ''; }, 500); }, 5000);
    } else {
        const isInPages = window.location.pathname.includes('/pages/');
        const loginLink = document.createElement('li');
        loginLink.id = 'userBadge';
        loginLink.innerHTML = '<a href="' + (isInPages ? '../login.html' : 'login.html') + '" class="nav-link" style="background:var(--orange);color:white;display:flex;align-items:center;gap:6px"><i class="fas fa-lock"></i> Admin</a>';
        nav.appendChild(loginLink);
    }
}

function initNav() {
    const nav = document.querySelector('.navbar');
    if (nav) {
        window.addEventListener('scroll', () => {
            nav.classList.toggle('scrolled', window.scrollY > 50);
        });
    }
    const toggle = document.getElementById('navToggle');
    const menu = document.getElementById('navMenu');
    if (toggle && menu) {
        toggle.addEventListener('click', () => {
            menu.classList.toggle('active');
        });
        menu.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => menu.classList.remove('active'));
        });
    }
}

function initPage() {
    const page = document.body.dataset.page;
    if (page === 'productos') loadProductos();
    if (page === 'inventario') loadInventario();
    if (page === 'pedidos') { loadClientesSelect(); loadPedidosRecientes(); }
}

// ============================================
// PRODUCTOS
// ============================================
async function loadProductos(categoria = null) {
    try {
        let url = `${API_BASE}/productos.php`;
        if (categoria && categoria !== 'all') url += `?categoria=${categoria}`;
        const res = await fetch(url);
        const data = await res.json();
        if (data.status === 'success') renderProductos(data.data);
    } catch (err) { console.error('Error:', err); }
}

function renderProductos(productos) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    const colores = ['gradient-orange', 'gradient-yellow', 'gradient-brown', 'gradient-green'];
    const icons = {'Útiles Escolares':'fa-pencil','Papelería':'fa-book','Tecnología':'fa-print','Accesorios':'fa-paperclip'};
    
    grid.innerHTML = productos.map((p, i) => {
        const stockClass = p.stock_actual <= 0 ? 'out' : (p.stock_actual <= p.stock_minimo ? 'low' : '');
        const badge = p.stock_actual <= 0 ? '<div class="product-badge out">Agotado</div>' : 
                     (p.stock_actual <= p.stock_minimo ? '<div class="product-badge low">Stock Bajo</div>' : 
                     (i < 3 ? '<div class="product-badge popular">Popular</div>' : ''));
        
        return `
        <div class="product-card" data-category="${p.categoria_nombre}">
            ${badge}
            <div class="product-image ${colores[i % colores.length]}"><i class="fas ${icons[p.categoria_nombre] || 'fa-box'}"></i></div>
            <div class="product-content">
                <span class="product-category">${p.categoria_nombre}</span>
                <h3>${p.nombre}</h3>
                <p>${p.descripcion || ''}</p>
                <div class="product-footer">
                    <span class="product-price">$${parseFloat(p.precio_venta).toFixed(2)}</span>
                    <span class="product-stock ${stockClass}"><i class="fas ${p.stock_actual <= 0 ? 'fa-times-circle' : (p.stock_actual <= p.stock_minimo ? 'fa-exclamation-triangle' : 'fa-check')}"></i> ${p.stock_actual} u</span>
                </div>
                <a href="pedidos.html" class="btn btn-primary btn-block" ${p.stock_actual <= 0 ? 'disabled' : ''}>
                    <i class="fas fa-cart-plus"></i> ${p.stock_actual <= 0 ? 'No Disponible' : 'Pedir Ahora'}
                </a>
            </div>
        </div>`;
    }).join('');
}

function filterProducts(cat, btn) {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');
    loadProductos(cat);
}

// ============================================
// INVENTARIO
// ============================================
async function loadInventario() {
    try {
        const [invRes, statsRes] = await Promise.all([
            fetch(`${API_BASE}/inventario.php`),
            fetch(`${API_BASE}/inventario.php?estadisticas=true`)
        ]);
        const invData = await invRes.json();
        const statsData = await statsRes.json();
        if (invData.status === 'success') renderInventarioTable(invData.data);
        if (statsData.status === 'success') renderInventarioStats(statsData.data);
    } catch (err) { console.error('Error:', err); }
}

function renderInventarioStats(stats) {
    const el = document.getElementById('invStats');
    if (!el) return;
    el.innerHTML = `
        <div class="stat-card"><div class="stat-card-icon orange"><i class="fas fa-box"></i></div><div><div class="stat-card-value">${stats.total_productos}</div><div class="stat-card-label">Total Productos</div></div></div>
        <div class="stat-card green"><div class="stat-card-icon green"><i class="fas fa-check-circle"></i></div><div><div class="stat-card-value">${stats.en_stock}</div><div class="stat-card-label">En Stock</div></div></div>
        <div class="stat-card yellow"><div class="stat-card-icon yellow"><i class="fas fa-exclamation-triangle"></i></div><div><div class="stat-card-value">${stats.stock_bajo}</div><div class="stat-card-label">Stock Bajo</div></div></div>
        <div class="stat-card red"><div class="stat-card-icon red"><i class="fas fa-times-circle"></i></div><div><div class="stat-card-value">${stats.agotados}</div><div class="stat-card-label">Agotados</div></div></div>
    `;
}

function renderInventarioTable(productos) {
    const tbody = document.getElementById('invBody');
    if (!tbody) return;
    tbody.innerHTML = productos.map(p => {
        const stockClass = p.stock_actual <= 0 ? 'out-stock' : (p.stock_actual <= p.stock_minimo ? 'low-stock' : '');
        let statusClass = 'available', statusText = 'Disponible';
        if (p.stock_actual <= 0) { statusClass = 'out'; statusText = 'Agotado'; }
        else if (p.stock_actual <= p.stock_minimo) { statusClass = 'low'; statusText = 'Stock Bajo'; }
        return `<tr>
            <td><strong>${p.codigo}</strong></td><td>${p.nombre}</td><td>${p.categoria_nombre}</td>
            <td>$${parseFloat(p.precio_venta).toFixed(2)}</td><td class="${stockClass}">${p.stock_actual}</td><td>${p.stock_minimo}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td>${p.stock_actual > 0 ? `<a href="pedidos.html" class="btn btn-sm btn-primary"><i class="fas fa-cart-plus"></i></a>` : `<button class="btn btn-sm" disabled><i class="fas fa-ban"></i></button>`}</td>
        </tr>`;
    }).join('');
}

function filterInventory(val) {
    val = val.toLowerCase();
    document.querySelectorAll('#invBody tr').forEach(row => {
        row.style.display = row.textContent.toLowerCase().includes(val) ? '' : 'none';
    });
}

// ============================================
// PEDIDOS
// ============================================
let cart = [];

async function loadClientesSelect() {
    try {
        const res = await fetch(`${API_BASE}/clientes.php`);
        const data = await res.json();
        if (data.status === 'success') {
            const select = document.getElementById('clientSelect');
            if (select) {
                select.innerHTML = '<option value="">Seleccionar cliente...</option>' +
                    data.data.map(c => `<option value="${c.id}">${c.nombre} - ${c.telefono || ''}</option>`).join('');
            }
        }
    } catch (err) { console.error(err); }
}

async function loadPedidosRecientes() {
    try {
        const res = await fetch(`${API_BASE}/pedidos.php`);
        const data = await res.json();
        if (data.status === 'success') renderPedidosRecientes(data.data.slice(0, 5));
    } catch (err) { console.error(err); }
}

function renderPedidosRecientes(pedidos) {
    const container = document.getElementById('recentOrders');
    if (!container) return;
    const estadoClass = {'pendiente':'pending','procesando':'processing','completado':'completed','cancelado':'out'};
    const estadoText = {'pendiente':'Pendiente','procesando':'En Proceso','completado':'Completado','cancelado':'Cancelado'};
    container.innerHTML = pedidos.map(p => `
        <div class="order-row">
            <div class="order-row-info"><strong>${p.codigo}</strong><span>${p.cliente_nombre}</span></div>
            <div class="order-row-details"><span>$${parseFloat(p.total).toFixed(2)}</span></div>
            <span class="status ${estadoClass[p.estado] || 'pending'}">${estadoText[p.estado] || p.estado}</span>
        </div>
    `).join('');
}

function addProductToCart() {
    const sel = document.getElementById('productSelect');
    if (!sel || !sel.value) { showToast('Selecciona un producto', 'error'); return; }
    const [name, price, stock, id] = sel.value.split('|');
    if (parseInt(stock) <= 0) { showToast('Producto agotado', 'error'); return; }
    const existing = cart.find(i => i.id === id);
    if (existing) {
        if (existing.qty >= parseInt(stock)) { showToast('No hay más stock (máx: ' + stock + ')', 'error'); return; }
        existing.qty++;
    } else {
        cart.push({ id, name, price: parseFloat(price), qty: 1, maxStock: parseInt(stock) });
    }
    updateCart();
    showToast(name + ' agregado');
    sel.value = '';
}

function removeFromCart(i) { cart.splice(i, 1); updateCart(); }

function updateQty(i, d) {
    cart[i].qty += d;
    if (cart[i].qty <= 0) removeFromCart(i);
    else if (cart[i].qty > cart[i].maxStock) { showToast('Stock máximo: ' + cart[i].maxStock, 'error'); cart[i].qty = cart[i].maxStock; updateCart(); }
    else updateCart();
}

function updateCart() {
    const items = document.getElementById('orderItems');
    const total = document.getElementById('orderTotal');
    const btn = document.getElementById('submitBtn');
    if (!items) return;
    if (!cart.length) {
        items.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-basket"></i><p>Tu pedido está vacío</p></div>';
        if (total) total.textContent = '$0.00';
        if (btn) btn.disabled = true;
        return;
    }
    let html = '', sum = 0;
    cart.forEach((it, i) => {
        const t = it.price * it.qty; sum += t;
        html += `<div class="cart-item">
            <div class="cart-item-info"><div class="cart-item-name">${it.name}</div><div class="item-price">$${it.price.toFixed(2)} c/u</div></div>
            <div class="cart-item-qty"><button onclick="updateQty(${i},-1)">-</button><span>${it.qty}</span><button onclick="updateQty(${i},1)">+</button></div>
            <div class="cart-item-total">$${t.toFixed(2)}</div>
            <button class="cart-item-remove" onclick="removeFromCart(${i})"><i class="fas fa-trash"></i></button>
        </div>`;
    });
    items.innerHTML = html;
    if (total) total.textContent = '$' + sum.toFixed(2);
    if (btn) btn.disabled = false;
}

async function submitOrder() {
    const clientSelect = document.getElementById('clientSelect');
    const address = document.getElementById('deliveryAddress');
    const notes = document.getElementById('orderNotes');
    
    if (!clientSelect || !clientSelect.value) { showToast('Selecciona un cliente', 'error'); return; }
    if (!cart.length) { showToast('Agrega productos al pedido', 'error'); return; }
    if (address && address.value && address.value.length < 10) { showToast('Dirección muy corta', 'error'); return; }
    
    const orderData = {
        cliente_id: clientSelect.value,
        direccion_entrega: address ? address.value : '',
        notas: notes ? notes.value : '',
        productos: cart.map(it => ({ producto_id: it.id, cantidad: it.qty, precio_unitario: it.price }))
    };
    
    try {
        const res = await fetch(`${API_BASE}/pedidos.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
        });
        const data = await res.json();
        if (data.status === 'success') {
            showToast('¡Pedido ' + data.codigo + ' creado! Total: $' + parseFloat(data.total).toFixed(2));
            cart = []; updateCart();
            document.getElementById('orderForm').reset();
            loadPedidosRecientes();
        } else { showToast('Error: ' + data.message, 'error'); }
    } catch (err) { showToast('Error de conexión', 'error'); }
}

// ============================================
// TOAST
// ============================================
function showToast(msg, type = 'success') {
    let toast = document.querySelector('.toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = '<i class="fas fa-check-circle"></i><span></span>';
        document.body.appendChild(toast);
    }
    toast.querySelector('span').textContent = msg;
    toast.querySelector('i').className = type === 'error' ? 'fas fa-exclamation-circle' : 'fas fa-check-circle';
    toast.querySelector('i').style.color = type === 'error' ? '#dc3545' : '#28a745';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

document.addEventListener('submit', function(e) {
    if (e.target.id === 'contactForm' || e.target.id === 'clientForm') {
        e.preventDefault();
        showToast('¡Enviado correctamente!');
        e.target.reset();
    }
});
