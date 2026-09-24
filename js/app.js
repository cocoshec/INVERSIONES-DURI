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
    try { initNav(); } catch(e) {}
    try { initPage(); } catch(e) {}
    try { showUserBadge(); } catch(e) {}
    try { showInventoryLink(); } catch(e) {}
    try { initCinematicEffects(); } catch(e) {}
    try { initFloatingCart(); } catch(e) {}
    try { initWhatsApp(); } catch(e) {}
});

function initWhatsApp() {
    const div = document.createElement('div');
    div.className = 'whatsapp-float';
    div.innerHTML = '<a href="https://wa.me/584121234567?text=Hola%2C%20me%20interesa%20hacer%20un%20pedido%20en%20Inversiones%20Duri" target="_blank"><i class="fab fa-whatsapp"></i> Escríbenos</a><div class="wa-tooltip">¿Necesitas ayuda? Chatea con nosotros</div>';
    document.body.appendChild(div);
}

function initFloatingCart() {
    const html = `
    <div class="floating-cart">
        <div class="cart-panel" id="cartPanel">
            <div class="cart-panel-header">
                <h4><i class="fas fa-shopping-cart"></i> Mi Pedido</h4>
                <button onclick="toggleCartPanel()">&times;</button>
            </div>
            <div class="cart-panel-body" id="cartPanelBody">
                <div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Tu carrito está vacío</p></div>
            </div>
            <div class="cart-panel-footer">
                <div class="cart-panel-total"><span>Total:</span><strong id="cartPanelTotal">$0.00</strong></div>
                <a href="pedidos.html" class="btn btn-primary btn-block"><i class="fas fa-paper-plane"></i> Ver Pedido</a>
            </div>
        </div>
        <button class="floating-cart-btn" onclick="toggleCartPanel()">
            <i class="fas fa-shopping-cart"></i>
            <span class="cart-count" id="floatingCartCount" style="display:none">0</span>
        </button>
    </div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    updateFloatingCart();
}

function toggleCartPanel() {
    const panel = document.getElementById('cartPanel');
    if (panel) panel.classList.toggle('show');
}

function updateFloatingCart() {
    const count = cart.reduce((sum, it) => sum + it.qty, 0);
    const total = cart.reduce((sum, it) => sum + (it.price * it.qty), 0);
    const countEl = document.getElementById('floatingCartCount');
    const body = document.getElementById('cartPanelBody');
    const totalEl = document.getElementById('cartPanelTotal');
    
    if (countEl) {
        countEl.style.display = count > 0 ? 'flex' : 'none';
        countEl.textContent = count;
    }
    
    if (!body) return;
    
    if (cart.length === 0) {
        body.innerHTML = '<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Tu carrito está vacío</p></div>';
    } else {
        body.innerHTML = cart.map((it, i) => `
            <div class="cart-panel-item">
                <div class="cart-panel-item-info">
                    <div class="cart-panel-item-name">${it.name}</div>
                    <div class="cart-panel-item-price">$${it.price.toFixed(2)} c/u</div>
                </div>
                <div class="cart-panel-item-qty">
                    <button onclick="updateQty(${i},-1)">-</button>
                    <span>${it.qty}</span>
                    <button onclick="updateQty(${i},1)">+</button>
                </div>
            </div>
        `).join('');
    }
    
    if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
}

function initCinematicEffects() {
    // Scroll Reveal - observer para elementos existentes Y futuros
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('active');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    
    function observeReveals() {
        document.querySelectorAll('.feature-card, .service-card, .stat-card, .contact-item, .order-row, .category-card').forEach(el => {
            if (!el.classList.contains('reveal')) {
                el.classList.add('reveal');
                observer.observe(el);
            }
        });
    }
    
    observeReveals();
    // Re-observar cada 500ms por si se cargan contenido dinámico
    setInterval(observeReveals, 500);
    
    // Particles in hero
    const hero = document.querySelector('.hero');
    if (hero && !hero.querySelector('.particles')) {
        const particlesDiv = document.createElement('div');
        particlesDiv.className = 'particles';
        for (let i = 0; i < 20; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + '%';
            p.style.animationDuration = (Math.random() * 10 + 8) + 's';
            p.style.animationDelay = Math.random() * 5 + 's';
            p.style.width = p.style.height = (Math.random() * 4 + 3) + 'px';
            particlesDiv.appendChild(p);
        }
        hero.appendChild(particlesDiv);
    }
    
    // Smooth parallax for hero shapes
    window.addEventListener('scroll', () => {
        const shapes = document.querySelectorAll('.shape');
        const scrollY = window.scrollY;
        shapes.forEach((shape, i) => {
            const speed = (i + 1) * 0.15;
            shape.style.transform = 'translateY(' + (scrollY * speed) + 'px)';
        });
    });
}

function showInventoryLink() {
    const user = JSON.parse(localStorage.getItem('userDuri') || 'null');
    const nav = document.querySelector('.nav-menu');
    if (!nav || !user) return;
    
    // Agregar link de inventario solo para super_usuario
    if (user.rol === 'super_usuario') {
        const existing = document.getElementById('invNavLink');
        if (existing) return;
        const isInPages = window.location.pathname.includes('/pages/');
        const li = document.createElement('li');
        li.id = 'invNavLink';
        const a = document.createElement('a');
        a.href = isInPages ? 'inventario.html' : 'pages/inventario.html';
        a.className = 'nav-link';
        a.innerHTML = '<i class="fas fa-warehouse"></i> Inventario';
        if (window.location.pathname.includes('inventario')) a.classList.add('active');
        li.appendChild(a);
        // Insertar después de Pedidos
        const pedidosLink = nav.querySelector('a[href*="pedidos"]');
        if (pedidosLink) pedidosLink.parentElement.after(li);
        else nav.appendChild(li);
    }
}

function showUserBadge() {
    const raw = localStorage.getItem('userDuri');
    const user = raw ? JSON.parse(raw) : null;
    const nav = document.querySelector('.nav-menu');
    if (!nav) return;

    const existing = document.getElementById('userBadge');
    if (existing) existing.remove();

    if (user && user.rol) {
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
                sessionStorage.removeItem('welcomeShown');
                window.location.reload();
            }
        };
        nav.appendChild(badge);

        // Banner solo 1 vez por sesión
        if (!sessionStorage.getItem('welcomeShown')) {
            sessionStorage.setItem('welcomeShown', '1');
            const welcome = document.createElement('div');
            welcome.id = 'welcomeBanner';
            welcome.style.cssText = 'position:fixed;top:0;left:0;right:0;background:' + rolColors[user.rol] + ';color:white;padding:16px 20px;font-family:Rubik,sans-serif;font-size:1rem;font-weight:500;z-index:1500;display:flex;align-items:center;justify-content:center;gap:10px;box-shadow:0 4px 20px rgba(0,0,0,0.2)';
            welcome.innerHTML = '<span style="font-size:1.4rem">' + rolEmoji[user.rol] + '</span> ¡Bienvenido <strong>' + rolLabels[user.rol] + '</strong>! — ' + user.nombre + ' <span onclick="this.parentElement.remove()" style="margin-left:20px;cursor:pointer;opacity:0.7;font-size:1.2rem">&times;</span>';
            document.body.appendChild(welcome);
            document.body.style.paddingTop = '60px';
            setTimeout(function() { 
                var w = document.getElementById('welcomeBanner');
                if (w) { w.style.opacity = '0'; w.style.transition = 'opacity 0.5s'; setTimeout(function(){ w.remove(); document.body.style.paddingTop = ''; }, 500); }
            }, 5000);
        }
    }
    // NO agregar botón Admin al público - solo se accede desde footer
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
    if (page === 'pedidos') { loadPedidosRecientes(); updateCart(); }
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

function getUser() {
    try { return JSON.parse(localStorage.getItem('userDuri')); } catch(e) { return null; }
}

function renderProductos(productos) {
    const grid = document.getElementById('productsGrid');
    if (!grid) return;
    
    const user = getUser();
    const canEdit = user && (user.rol === 'super_usuario' || user.rol === 'operador');
    const colores = ['gradient-orange', 'gradient-yellow', 'gradient-brown', 'gradient-green'];
    const icons = {'Útiles Escolares':'fa-pencil','Papelería':'fa-book','Tecnología':'fa-print','Accesorios':'fa-paperclip'};
    
    grid.innerHTML = productos.map((p, i) => {
        const stockClass = p.stock_actual <= 0 ? 'out' : (p.stock_actual <= p.stock_minimo ? 'low' : '');
        const badge = p.stock_actual <= 0 ? '<div class="product-badge out">Agotado</div>' : 
                     (p.stock_actual <= p.stock_minimo ? '<div class="product-badge low">Stock Bajo</div>' : 
                     (i < 3 ? '<div class="product-badge popular">Popular</div>' : ''));
        
        let actions = '';
        if (canEdit) {
            actions = '<div style="display:flex;gap:6px;margin-top:8px"><button onclick="editProduct(\'' + p.id + '\')" class="btn btn-sm btn-outline-primary" style="flex:1"><i class="fas fa-edit"></i> Editar</button><button onclick="deleteProduct(\'' + p.id + '\')" class="btn btn-sm" style="flex:0;background:rgba(220,53,69,0.1);color:#dc3545;border:1px solid rgba(220,53,69,0.3)"><i class="fas fa-trash"></i></button></div>';
        } else if (!user) {
            actions = '<a href="pedidos.html" class="btn btn-primary btn-block" style="margin-top:8px"' + (p.stock_actual <= 0 ? ' disabled' : '') + '><i class="fas fa-cart-plus"></i> ' + (p.stock_actual <= 0 ? 'No Disponible' : 'Pedir Ahora') + '</a>';
        } else {
            actions = '<a href="pedidos.html" class="btn btn-primary btn-block" style="margin-top:8px"' + (p.stock_actual <= 0 ? ' disabled' : '') + '><i class="fas fa-cart-plus"></i> Pedir</a>';
        }
        
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
                ${actions}
            </div>
        </div>`;
    }).join('');
    
    if (canEdit) {
        const header = document.querySelector('.page-hero .container');
        if (header && !document.getElementById('addProductBtn')) {
            const btn = document.createElement('a');
            btn.id = 'addProductBtn';
            btn.href = '#';
            btn.className = 'btn btn-accent';
            btn.style.cssText = 'margin-top:15px';
            btn.innerHTML = '<i class="fas fa-plus"></i> Agregar Producto';
            btn.onclick = function(e) { e.preventDefault(); showToast('Formulario de agregar producto - Próximamente'); };
            header.appendChild(btn);
        }
    }
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
    const user = getUser();
    const canEdit = user && (user.rol === 'super_usuario' || user.rol === 'operador');
    const canOrder = user && user.rol !== 'super_usuario';
    
    tbody.innerHTML = productos.map(p => {
        const stockClass = p.stock_actual <= 0 ? 'out-stock' : (p.stock_actual <= p.stock_minimo ? 'low-stock' : '');
        let statusClass = 'available', statusText = 'Disponible';
        if (p.stock_actual <= 0) { statusClass = 'out'; statusText = 'Agotado'; }
        else if (p.stock_actual <= p.stock_minimo) { statusClass = 'low'; statusText = 'Stock Bajo'; }
        
        let actionBtn = '';
        if (canEdit) {
            actionBtn = '<button onclick="showToast(\'Editar: ' + p.nombre + '\')" class="btn btn-sm btn-outline-primary"><i class="fas fa-edit"></i></button>';
        } else if (canOrder && p.stock_actual > 0) {
            actionBtn = '<a href="pedidos.html" class="btn btn-sm btn-primary"><i class="fas fa-cart-plus"></i></a>';
        } else if (p.stock_actual <= 0) {
            actionBtn = '<button class="btn btn-sm" disabled><i class="fas fa-ban"></i></button>';
        } else {
            actionBtn = '<a href="pedidos.html" class="btn btn-sm btn-primary"><i class="fas fa-cart-plus"></i></a>';
        }
        
        return `<tr>
            <td><strong>${p.codigo}</strong></td><td>${p.nombre}</td><td>${p.categoria_nombre}</td>
            <td>$${parseFloat(p.precio_venta).toFixed(2)}</td><td class="${stockClass}">${p.stock_actual}</td><td>${p.stock_minimo}</td>
            <td><span class="status ${statusClass}">${statusText}</span></td>
            <td>${actionBtn}</td>
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

// Cargar carrito guardado (sobrevive recargas)
try {
    const savedCart = sessionStorage.getItem('cartDuri');
    if (savedCart) cart = JSON.parse(savedCart);
} catch(e) {}

function saveCart() {
    try { sessionStorage.setItem('cartDuri', JSON.stringify(cart)); } catch(e) {}
}

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
    const [id, name, price, stock] = sel.value.split('|');
    if (parseInt(stock) <= 0) { showToast('Producto agotado', 'error'); return; }
    addToCartById(id, name, price, stock);
    sel.value = '';
}

function addToCartById(id, name, price, stock) {
    const existing = cart.find(i => i.id === String(id));
    if (existing) {
        if (existing.qty >= parseInt(stock)) { showToast('No hay más stock (máx: ' + stock + ')', 'error'); return; }
        existing.qty++;
    } else {
        cart.push({ id: String(id), name, price: parseFloat(price), qty: 1, maxStock: parseInt(stock) });
    }
    saveCart();
    updateCart();
    showToast(name + ' agregado');
}

function removeFromCart(i) { cart.splice(i, 1); saveCart(); updateCart(); }

function updateQty(i, d) {
    cart[i].qty += d;
    if (cart[i].qty <= 0) removeFromCart(i);
    else if (cart[i].qty > cart[i].maxStock) { showToast('Stock máximo: ' + cart[i].maxStock, 'error'); cart[i].qty = cart[i].maxStock; saveCart(); updateCart(); }
    else { saveCart(); updateCart(); }
}

function updateCart() {
    const items = document.getElementById('orderItems');
    const total = document.getElementById('orderTotal');
    const btn = document.getElementById('submitBtn');
    const btnForm = document.getElementById('submitBtnForm');
    
    // Actualizar carrito flotante siempre
    try { updateFloatingCart(); } catch(e) {}
    
    if (!items) return;
    if (!cart.length) {
        items.innerHTML = '<div class="empty-cart"><i class="fas fa-shopping-basket"></i><p>Tu pedido está vacío</p></div>';
        if (total) total.textContent = '$0.00';
        if (btn) btn.disabled = true;
        if (btnForm) btnForm.disabled = true;
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
    if (btnForm) btnForm.disabled = false;
}

async function submitOrder() {
    const clientSelect = document.getElementById('clientSelect');
    const address = document.getElementById('deliveryAddress');
    const notes = document.getElementById('orderNotes');
    const payment = document.getElementById('paymentMethod');
    const newName = document.getElementById('newClientName');
    const newPhone = document.getElementById('newClientPhone');
    
    if (!clientSelect || !clientSelect.value) { showToast('Selecciona o escribe tu nombre', 'error'); return; }
    if (!cart.length) { showToast('Agrega productos al pedido', 'error'); return; }
    if (address && address.value && address.value.length < 10) { showToast('Dirección muy corta', 'error'); return; }
    
    // Obtener nombre del cliente para el mensaje
    let clientName = '';
    if (clientSelect.value === 'nuevo') {
        if (!newName || !newName.value.trim()) { showToast('Escribe tu nombre', 'error'); return; }
        clientName = newName.value.trim();
    } else {
        clientName = newName ? newName.value.trim() : '';
    }
    
    const paymentLabels = { efectivo: 'Efectivo', pago_movil: 'Pago Móvil', transferencia: 'Transferencia Bancaria', tarjeta: 'Tarjeta' };
    const paymentLabel = payment ? (paymentLabels[payment.value] || payment.value) : 'Efectivo';
    const addr = address ? address.value : '';
    
    // Calcular total
    let subtotal = 0;
    cart.forEach(it => { subtotal += it.price * it.qty; });
    const iva = subtotal * 0.16;
    const total = subtotal + iva;
    
    // Construir lista de productos
    let prodLines = '';
    cart.forEach(it => {
        prodLines += `📦 ${it.name} x${it.qty} — $${(it.price * it.qty).toFixed(2)}\n`;
    });
    
    // Mensaje predeterminado
    const msg = `✅ ¡Hola! Quiero confirmar mi pedido en Inversiones Duri\n\n👤 Cliente: ${clientName}\n${prodLines}\n💰 Subtotal: $${subtotal.toFixed(2)}\n🧾 IVA (16%): $${iva.toFixed(2)}\n\n🔥 TOTAL: $${total.toFixed(2)}\n💳 Pago: ${paymentLabel}\n📍 Dirección: ${addr || 'Por confirmar'}\n\n¿Sigue disponible el producto? Confirma para proceder ✔`;
    
    // Guardar datos temporalmente para el modal
    window._pendingOrder = {
        cliente_id: clientSelect.value,
        direccion_entrega: addr,
        notas: notes ? notes.value : '',
        forma_pago: payment ? payment.value : 'efectivo',
        productos: cart.map(it => ({ producto_id: it.id, cantidad: it.qty, precio_unitario: it.price })),
        clientName,
        msg
    };
    
    // Mostrar modal de confirmación
    showConfirmModal(subtotal, iva, total, prodLines, clientName, paymentLabel, addr, msg);
}

function showConfirmModal(subtotal, iva, total, prodLines, clientName, paymentLabel, addr, msg) {
    // Remover modal anterior si existe
    const old = document.getElementById('confirmModal');
    if (old) old.remove();
    
    const modal = document.createElement('div');
    modal.id = 'confirmModal';
    modal.className = 'modal show';
    modal.innerHTML = `
        <div style="width:480px;max-width:95%;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 24px 64px rgba(0,0,0,0.3)">
            <div style="background:linear-gradient(135deg,var(--dark),#2a1a4a);color:#fff;padding:24px 28px">
                <h3 style="margin:0 0 4px;font-size:1.2rem"><i class="fas fa-clipboard-check" style="color:var(--accent)"></i> Confirmar Pedido</h3>
                <p style="margin:0;font-size:0.85rem;opacity:0.7">Revisa tu pedido antes de enviarlo</p>
            </div>
            <div style="padding:24px 28px;max-height:50vh;overflow-y:auto">
                <div style="margin-bottom:16px">
                    <div style="font-size:0.8rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Cliente</div>
                    <div style="font-weight:600">${clientName}</div>
                </div>
                <div style="margin-bottom:16px">
                    <div style="font-size:0.8rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">Productos</div>
                    <div style="background:#f8f8f8;border-radius:8px;padding:14px;font-size:0.9rem;line-height:1.8;white-space:pre-line">${prodLines}</div>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.9rem;border-bottom:1px solid #eee">
                    <span>Subtotal</span><span>$${subtotal.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:8px 0;font-size:0.9rem;border-bottom:1px solid #eee">
                    <span>IVA (16%)</span><span>$${iva.toFixed(2)}</span>
                </div>
                <div style="display:flex;justify-content:space-between;padding:12px 0;font-size:1.2rem;font-weight:700;color:var(--accent)">
                    <span>TOTAL</span><span>$${total.toFixed(2)}</span>
                </div>
                <div style="display:flex;gap:12px;margin-top:6px;font-size:0.85rem;color:#666">
                    <span><i class="fas fa-credit-card"></i> ${paymentLabel}</span>
                    <span><i class="fas fa-map-marker-alt"></i> ${addr || 'Por confirmar'}</span>
                </div>
                <div style="margin-top:18px;background:#e8f5e9;border:1px solid #c8e6c9;border-radius:8px;padding:14px;font-size:0.82rem;line-height:1.6;color:#2e7d32">
                    <strong><i class="fab fa-whatsapp"></i> Mensaje que se enviará:</strong>
                    <div style="margin-top:8px;white-space:pre-line;font-family:monospace;font-size:0.78rem">${msg.replace(/</g, '&lt;')}</div>
                </div>
            </div>
            <div style="padding:16px 28px 24px;display:flex;gap:10px;border-top:1px solid #eee">
                <button onclick="closeConfirmModal()" style="flex:1;padding:14px;border:2px solid #ddd;background:#fff;border-radius:10px;font-size:0.95rem;font-weight:600;cursor:pointer;color:#666">
                    <i class="fas fa-arrow-left"></i> Volver
                </button>
                <button onclick="confirmAndSend()" id="confirmSendBtn" style="flex:2;padding:14px;background:linear-gradient(135deg,#25D366,#128C7E);color:#fff;border:none;border-radius:10px;font-size:0.95rem;font-weight:600;cursor:pointer">
                    <i class="fab fa-whatsapp"></i> Confirmar y Enviar
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e) { if (e.target === modal) closeConfirmModal(); });
}

function closeConfirmModal() {
    const modal = document.getElementById('confirmModal');
    if (modal) modal.remove();
}

async function confirmAndSend() {
    const data = window._pendingOrder;
    if (!data) { closeConfirmModal(); return; }
    
    const btn = document.getElementById('confirmSendBtn');
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...'; }
    
    let clienteId = data.cliente_id;
    
    // Crear cliente nuevo si aplica
    if (clienteId === 'nuevo') {
        const newName = document.getElementById('newClientName');
        const newPhone = document.getElementById('newClientPhone');
        try {
            const resCli = await fetch(`${API_BASE}/clientes.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ nombre: newName ? newName.value.trim() : data.clientName, telefono: newPhone ? newPhone.value.trim() : '' })
            });
            const cliData = await resCli.json();
            if (cliData.status !== 'success') { showToast('Error al crear cliente: ' + cliData.message, 'error'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Confirmar y Enviar'; } return; }
            clienteId = cliData.id;
        } catch (err) { showToast('Error de conexión', 'error'); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Confirmar y Enviar'; } return; }
    }
    
    // Enviar pedido a la BD
    try {
        const res = await fetch(`${API_BASE}/pedidos.php`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cliente_id: clienteId,
                direccion_entrega: data.direccion_entrega,
                notas: data.notas,
                forma_pago: data.forma_pago,
                productos: data.productos
            })
        });
        const result = await res.json();
        if (result.status === 'success') {
            // Abrir WhatsApp con el mensaje
            const waUrl = 'https://wa.me/584121234567?text=' + encodeURIComponent(data.msg);
            window.open(waUrl, '_blank');
            
            showToast('¡Pedido ' + result.codigo + ' creado! Total: $' + parseFloat(result.total).toFixed(2));
            
            // Limpiar
            cart = []; saveCart(); updateCart();
            document.getElementById('orderForm').reset();
            loadPedidosRecientes();
            closeConfirmModal();
            window._pendingOrder = null;
        } else {
            showToast('Error: ' + result.message, 'error');
            if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Confirmar y Enviar'; }
        }
    } catch (err) {
        showToast('Error de conexión', 'error');
        if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fab fa-whatsapp"></i> Confirmar y Enviar'; }
    }
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
