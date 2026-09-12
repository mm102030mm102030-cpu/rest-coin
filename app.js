let userAuth = null;
let cart = [];
let productsList = [];
let categoriesList = [];
let hasCheckedStreak = false;

setInterval(() => {
    if (userAuth && userAuth.loggedIn) {
        checkAuth(false);
    }
}, 10000);

async function checkAuth(updateUIOnly = true) {
    try {
        const res = await fetch('/api/auth/status');
        const data = await res.json();
        userAuth = data;
        
        if (data.loggedIn) {
            if (!hasCheckedStreak) {
                hasCheckedStreak = true;
                checkStreak();
            }
            document.getElementById('userProfile').innerHTML = `
                <img src="https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png" alt="User" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                <span>${data.user.username}</span>
                <span style="color:var(--accent); display: inline-flex; align-items: center; gap: 5px;"><img src="/assets/coin.png" alt="Coin" style="height: 30px; width: auto; object-fit: contain;"> ${data.user.coins}</span>
                <a href="/api/auth/logout" style="color:red; margin-right:10px;"><i class="fas fa-sign-out-alt"></i></a>
            `;
            
            if (data.user.isAdmin) {
                document.getElementById('adminLink').style.display = 'inline-block';
            }
            
            // Show profile link
            document.getElementById('profileLink').style.display = 'inline-block';
            if (data.user.isOwner) {
                document.getElementById('manageAdminsSection').style.display = 'block';
                document.getElementById('manageSeasonSection').style.display = 'block';
            }
            
            if (!data.user.inGuild) {
                document.getElementById('notInGuildOverlay').style.display = 'flex';
            } else {
                document.getElementById('notInGuildOverlay').style.display = 'none';
            }
        } else {
            document.getElementById('userProfile').innerHTML = `
                <a href="/auth/discord" class="btn btn-primary">تسجيل الدخول</a>
            `;
        }
    } catch(e) {
        console.error(e);
    }
}

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.getElementById('page-' + pageId).classList.add('active');
    
    if (pageId === 'home') {
        loadLatestOrders();
        loadSeason();
        if (userAuth && userAuth.loggedIn) {
            document.getElementById('streakFab').style.display = 'flex';
        }
    } else {
        document.getElementById('streakFab').style.display = 'none';
    }

    if (pageId === 'store') loadStore();
    if (pageId === 'top') loadTop10();
    if (pageId === 'profile') loadProfile();
    if (pageId === 'admin') loadAdminData();
}

async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();
        const onlineCountEl = document.getElementById('onlineCount');
        if (onlineCountEl) onlineCountEl.innerText = data.totalMembers || 0;
    } catch(e) {
        console.error('Error in loadStats:', e);
    }
}

function timeAgo(dateString) {
    if (!dateString) return 'مؤخراً';
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'مؤخراً';
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) return `منذ ${diffInSeconds} ثانية`;
    const diffInMinutes = Math.floor(diffInSeconds / 60);
    if (diffInMinutes < 60) return `منذ ${diffInMinutes} دقيقة`;
    const diffInHours = Math.floor(diffInMinutes / 60);
    if (diffInHours < 24) return `منذ ${diffInHours} ساعة`;
    const diffInDays = Math.floor(diffInHours / 24);
    return `منذ ${diffInDays} يوم`;
}

async function loadLatestOrders() {
    try {
        const res = await fetch('/api/orders/latest');
        const orders = await res.json();
        const marquee = document.getElementById('latestOrdersMarquee');
        if(orders.length === 0) {
            marquee.innerHTML = '<span>لا توجد طلبات حديثة حتى الآن. كن أول المشتريين! 🚀</span>';
        } else {
            marquee.innerHTML = orders.map(o => {
                const avatarSrc = o.user_avatar && o.user_id ? `https://cdn.discordapp.com/avatars/${o.user_id}/${o.user_avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png';
                return `<span style="display:inline-flex; align-items:center; gap:8px; background:rgba(0,0,0,0.3); padding:5px 15px; border-radius:20px;"><img src="${avatarSrc}" alt="Avatar" style="width:24px; height:24px; border-radius:50%; object-fit:cover; border:1px solid var(--accent);"> <strong>${o.user_tag}</strong> اشترى ${o.quantity}x ${o.product_name} <span style="color:var(--text-muted); font-size:0.8em; margin-right:5px;">(${timeAgo(o.created_at)})</span> 🎉</span>`;
            }).join(' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ');
        }
    } catch(e) {}
}

async function loadStore() {
    try {
        const [catRes, prodRes] = await Promise.all([
            fetch('/api/categories'),
            fetch('/api/products')
        ]);
        categoriesList = await catRes.json();
        productsList = await prodRes.json();
        
        const container = document.getElementById('storeCategoriesContainer');
        container.innerHTML = '';
        
        if (productsList.length === 0) {
            container.innerHTML = '<p>المتجر فارغ حالياً.</p>';
            return;
        }

        // Group by category
        categoriesList.forEach(cat => {
            const catProds = productsList.filter(p => p.category === cat.name);
            if(catProds.length > 0) {
                let html = `
                <div class="category-section">
                    <h3 class="category-title">${cat.name}</h3>
                    <div class="products-grid">
                `;
                catProds.forEach(p => {
                    html += `
                        <div class="product-card glass-panel">
                            <img src="${p.image}" class="product-img" alt="${p.name}">
                            <h3>${p.name}</h3>
                            <p style="font-size:0.9em; color:var(--text-muted); margin:10px 0;">${p.description}</p>
                            <span class="price-tag" style="display:flex; justify-content:center; align-items:center; gap:5px;"><img src="/assets/coin.png" style="width:20px;height:auto;object-fit:contain;">${p.price_coins} <span style="margin:0 10px;color:var(--text-muted);font-size:0.8em;">أو</span> <i class="fas fa-dollar-sign" style="color:#2ecc71;"></i>${p.price_usd}</span>
                            <span class="stock-tag" style="${p.stock === 0 ? 'color:#e74c3c; font-weight:bold; background:rgba(231,76,60,0.1); border:1px solid #e74c3c; padding:3px 8px; border-radius:5px;' : 'color:#2ecc71;'}">${p.stock === 0 ? '⚠️ نفدت الكمية' : `الكمية المتوفرة: ${p.stock}`}</span>
                            <div style="display:flex; gap:10px; margin-top:15px;">
                                <input type="number" id="qty-${p.id}" value="1" min="1" max="${p.stock}" style="width:60px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:#fff; border-radius:8px; text-align:center;" ${p.stock === 0 ? 'disabled' : ''}>
                                <button class="btn btn-primary" style="flex:1; ${p.stock === 0 ? 'background:#555; color:#aaa; cursor:not-allowed;' : ''}" onclick="addToCartQty(${p.id})" ${p.stock === 0 ? 'disabled' : ''}><i class="fas ${p.stock === 0 ? 'fa-ban' : 'fa-cart-plus'}"></i> ${p.stock === 0 ? 'غير متوفر حالياً' : 'إضافة للسلة'}</button>
                            </div>
                        </div>
                    `;
                });
                html += `</div></div>`;
                container.innerHTML += html;
            }
        });
        
        // Products without category
        const uncategorized = productsList.filter(p => !categoriesList.find(c => c.name === p.category));
        if(uncategorized.length > 0) {
            let html = `
            <div class="category-section">
                <h3 class="category-title">أخرى</h3>
                <div class="products-grid">
            `;
            uncategorized.forEach(p => {
                html += `
                    <div class="product-card glass-panel">
                        <img src="${p.image}" class="product-img" alt="${p.name}">
                        <h3>${p.name}</h3>
                        <p style="font-size:0.9em; color:var(--text-muted); margin:10px 0;">${p.description}</p>
                        <span class="price-tag" style="display:flex; justify-content:center; align-items:center; gap:5px;"><img src="/assets/coin.png" style="width:20px;height:auto;object-fit:contain;">${p.price_coins} <span style="margin:0 10px;color:var(--text-muted);font-size:0.8em;">أو</span> <i class="fas fa-dollar-sign" style="color:#2ecc71;"></i>${p.price_usd}</span>
                        <span class="stock-tag" style="${p.stock === 0 ? 'color:#e74c3c; font-weight:bold; background:rgba(231,76,60,0.1); border:1px solid #e74c3c; padding:3px 8px; border-radius:5px;' : 'color:#2ecc71;'}">${p.stock === 0 ? '⚠️ نفدت الكمية' : `الكمية المتوفرة: ${p.stock}`}</span>
                        <div style="display:flex; gap:10px; margin-top:15px;">
                            <input type="number" id="qty-${p.id}" value="1" min="1" max="${p.stock}" style="width:60px; background:rgba(0,0,0,0.3); border:1px solid var(--glass-border); color:#fff; border-radius:8px; text-align:center;" ${p.stock === 0 ? 'disabled' : ''}>
                            <button class="btn btn-primary" style="flex:1; ${p.stock === 0 ? 'background:#555; color:#aaa; cursor:not-allowed;' : ''}" onclick="addToCartQty(${p.id})" ${p.stock === 0 ? 'disabled' : ''}><i class="fas ${p.stock === 0 ? 'fa-ban' : 'fa-cart-plus'}"></i> ${p.stock === 0 ? 'غير متوفر حالياً' : 'إضافة للسلة'}</button>
                        </div>
                    </div>
                `;
            });
            html += `</div></div>`;
            container.innerHTML += html;
        }

    } catch(e) {
        console.error(e);
    }
}

async function loadTop10() {
    try {
        const res = await fetch('/api/top');
        const data = await res.json();
        
        const podium = document.getElementById('podiumContainer');
        const list = document.getElementById('topListContainer');
        podium.innerHTML = '';
        list.innerHTML = '';
        
        if (data.top.length === 0) {
            podium.innerHTML = '<p>لا توجد بيانات حالياً.</p>';
            return;
        }

        const top3 = [data.top[1], data.top[0], data.top[2]];
        
        top3.forEach((user, index) => {
            if (!user) return;
            let realRank = index === 0 ? 2 : index === 1 ? 1 : 3;
            podium.innerHTML += `
                <div class="podium-item rank-${realRank}">
                    <img src="${user.avatarUrl}" class="podium-avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <p style="font-weight:bold; overflow:hidden; text-overflow:ellipsis;" title="${user.username}">${user.displayName}</p>
                    <div class="podium-rank">
                        <h2>${realRank === 1 ? '🥇' : realRank === 2 ? '🥈' : '🥉'} #${realRank}</h2>
                        <p style="display: flex; justify-content: center; align-items: center; gap: 5px;">${user.coins} <img src="/assets/coin.png" alt="Coin" style="height: 30px; width: auto; object-fit: contain;"></p>
                    </div>
                </div>
            `;
        });

        for (let i = 3; i < data.top.length; i++) {
            const user = data.top[i];
            list.innerHTML += `
                <div class="list-item">
                    <span class="list-item-rank">#${i + 1}</span>
                    <img src="${user.avatarUrl}" alt="avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                    <span style="margin-right:15px; font-weight:bold; flex:1;">${user.displayName} <small style="color:gray;">(@${user.username})</small></span>
                    <span style="color:var(--accent); font-weight:bold; display: inline-flex; align-items: center; gap: 5px;">${user.coins} <img src="/assets/coin.png" alt="Coin" style="height: 26px; width: auto; object-fit: contain;"></span>
                </div>
            `;
        }

        if (userAuth && userAuth.loggedIn && data.userRank) {
            // Check if user is already in top 10
            const inTop10 = data.top.find(u => u.user_id === userAuth.user.id);
            if (!inTop10) {
                list.innerHTML += `
                    <div class="user-rank-row">
                        <span class="list-item-rank">#${data.userRank}</span>
                        <img src="https://cdn.discordapp.com/avatars/${userAuth.user.id}/${userAuth.user.avatar}.png" alt="Avatar" onerror="this.src='https://cdn.discordapp.com/embed/avatars/0.png'">
                        <span style="margin-right:15px; font-weight:bold; flex:1;">${userAuth.user.username} <small style="color:var(--primary);">(أنت)</small></span>
                        <span style="color:var(--accent); font-weight:bold; display: inline-flex; align-items: center; gap: 5px;">${data.userCoins} <img src="/assets/coin.png" alt="Coin" style="height: 26px; width: auto; object-fit: contain;"></span>
                    </div>
                `;
            }
        }


    } catch(e) {
        console.error(e);
    }
}

function addToCartQty(id) {
    if (!userAuth || !userAuth.loggedIn) {
        showMessage('تنبيه', 'يجب تسجيل الدخول أولاً لإضافة منتجات للسلة.');
        return;
    }
    const product = productsList.find(p => p.id === id);
    if (!product) return;
    
    if (product.stock <= 0) {
        showMessage('تنبيه', '⚠️ نأسف، هذا المنتج نفد من المخزون حالياً!');
        return;
    }

    const qtyInput = document.getElementById(`qty-${id}`);
    let qtyToAdd = parseInt(qtyInput.value) || 1;
    
    if (qtyToAdd > product.stock) {
        showToast('الكمية المطلوبة تتجاوز المخزون المتوفر.');
        return;
    }

    const existing = cart.find(i => i.id === id);
    if (existing) {
        if (existing.qty + qtyToAdd <= product.stock) {
            existing.qty += qtyToAdd;
            showToast(`تمت زيادة كمية ${product.name} في السلة`);
        } else {
            showToast('الكمية الإجمالية في السلة تتجاوز المخزون المتوفر.');
        }
    } else {
        if (product.stock >= qtyToAdd) {
            cart.push({ id, qty: qtyToAdd, product });
            showToast(`تمت إضافة ${product.name} (${qtyToAdd}) إلى السلة 🛒`);
        } else {
            showToast('المنتج نفد من المخزون.');
            return;
        }
    }
    updateCartUI();
}

function updateCartUI() {
    document.getElementById('cartCount').innerText = cart.reduce((sum, item) => sum + item.qty, 0);
    const cartItems = document.getElementById('cartItems');
    cartItems.innerHTML = '';
    
    let totalC = 0;
    let totalU = 0;
    
    cart.forEach(item => {
        totalC += (item.product.price_coins * item.qty);
        totalU += (item.product.price_usd * item.qty);
        
        cartItems.innerHTML += `
            <div style="background:rgba(255,255,255,0.05); padding:15px; margin-bottom:10px; border-radius:10px; border:1px solid var(--glass-border); display:flex; gap:15px; align-items:center;">
                <img src="${item.product.image}" style="width:50px; height:50px; object-fit:cover; border-radius:8px; border:1px solid var(--primary);">
                <div style="flex:1;">
                    <h4 style="margin:0 0 5px 0;">${item.product.name}</h4>
                    <div style="display:flex; gap:10px; align-items:center; font-size:0.9em; color:var(--text-muted);">
                        <span style="display:flex; align-items:center; gap:3px;"><img src="/assets/coin.png" style="height:14px;width:auto;object-fit:contain;">${item.product.price_coins}</span>
                        <span>- أو -</span>
                        <span style="color:#2ecc71;"><i class="fas fa-dollar-sign"></i>${item.product.price_usd}</span>
                    </div>
                </div>
                <div style="display:flex; align-items:center; background:rgba(0,0,0,0.4); border-radius:5px; padding:2px;">
                    <button style="background:transparent; color:white; border:none; padding:5px 10px; cursor:pointer;" onclick="changeQty(${item.id}, -1)">-</button>
                    <span style="margin:0 5px; font-weight:bold;">${item.qty}</span>
                    <button style="background:transparent; color:white; border:none; padding:5px 10px; cursor:pointer;" onclick="changeQty(${item.id}, 1)">+</button>
                </div>
            </div>
        `;
    });
    
    document.getElementById('cartTotalCoins').innerText = totalC;
    document.getElementById('cartTotalUsd').innerText = totalU.toFixed(2);
    
    // Process Discount
    if (activeCouponDiscount > 0) {
        document.getElementById('cartTotalCoins').style.textDecoration = 'line-through';
        document.getElementById('cartTotalUsd').style.textDecoration = 'line-through';
        
        document.getElementById('coinsDiscountBox').style.display = 'block';
        document.getElementById('usdDiscountBox').style.display = 'block';
        
        const discountedCoins = Math.floor(totalC * (1 - (activeCouponDiscount / 100)));
        const discountedUsd = totalU * (1 - (activeCouponDiscount / 100));
        
        document.getElementById('cartTotalCoinsDiscount').innerText = discountedCoins + ` (-${activeCouponDiscount}%)`;
        document.getElementById('cartTotalUsdDiscount').innerText = discountedUsd.toFixed(2) + ` (-${activeCouponDiscount}%)`;
    } else {
        document.getElementById('cartTotalCoins').style.textDecoration = 'none';
        document.getElementById('cartTotalUsd').style.textDecoration = 'none';
        document.getElementById('coinsDiscountBox').style.display = 'none';
        document.getElementById('usdDiscountBox').style.display = 'none';
    }
}

function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    
    item.qty += delta;
    if (item.qty <= 0) {
        cart = cart.filter(i => i.id !== id);
    } else if (item.qty > item.product.stock) {
        item.qty = item.product.stock;
    }
    updateCartUI();
}

let activeCouponDiscount = 0;

async function applyCoupon() {
    const code = document.getElementById('couponCode').value.trim();
    const msg = document.getElementById('couponMessage');
    
    if (!code) {
        activeCouponDiscount = 0;
        msg.innerText = '';
        updateCartUI();
        return;
    }
    
    try {
        const res = await fetch('/api/coupons/validate?code=' + encodeURIComponent(code));
        const data = await res.json();
        
        if (data.valid) {
            activeCouponDiscount = data.discount_percent;
            msg.style.color = '#2ecc71';
            msg.innerText = `✅ تم تفعيل الكود بنجاح (خصم ${activeCouponDiscount}%)!`;
        } else {
            activeCouponDiscount = 0;
            msg.style.color = '#e74c3c';
            msg.innerText = `❌ ${data.message}`;
        }
        updateCartUI();
    } catch(e) {
        msg.style.color = '#e74c3c';
        msg.innerText = `❌ حدث خطأ أثناء التحقق`;
    }
}

function toggleCart() {
    const overlay = document.getElementById('cartOverlay');
    overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
    if(overlay.style.display === 'flex') updateCartUI();
}

async function checkout() {
    if (cart.length === 0) return showToast('السلة فارغة!');
    
    const methodInput = document.querySelector('input[name="paymentMethodRadio"]:checked');
    const method = methodInput ? methodInput.value : 'coins';
    const coupon = document.getElementById('couponCode').value;
    
    try {
        const res = await fetch('/api/purchase', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                cart: cart.map(i => ({id: i.id, qty: i.qty})),
                paymentMethod: method,
                couponCode: coupon
            })
        });
        const data = await res.json();
        
        if (data.error) {
            if (data.error === 'not_in_guild') {
                document.getElementById('notInGuildOverlay').style.display = 'flex';
                toggleCart();
            } else {
                showMessage('⚠️ فشل الشراء', data.error);
            }
        } else {
            cart = [];
            document.getElementById('couponCode').value = '';
            updateCartUI();
            toggleCart();
            showMessage('🎉 نجاح!', data.message);
            loadStore();
            checkAuth(false); // Update balance instantly without page refresh
            loadLatestOrders();
        }
    } catch(e) {
        showMessage('خطأ', 'حدث خطأ أثناء الاتصال بالخادم.');
    }
}

// Admin Loading
async function loadAdminData() {
    try {
        // Load Categories for dropdown
        const catRes = await fetch('/api/categories');
        const cats = await catRes.json();
        const catSelect = document.getElementById('pCategory');
        const epCategorySelect = document.getElementById('epCategory');
        const optionsHTML = cats.map(c => `<option value="${c.name}">${c.name}</option>`).join('');
        catSelect.innerHTML = optionsHTML;
        if(epCategorySelect) epCategorySelect.innerHTML = optionsHTML;

        // Load Orders Log
        const ordRes = await fetch('/api/admin/orders');
        const orders = await ordRes.json();
        const tbody = document.getElementById('ordersLogBody');
        tbody.innerHTML = orders.map(o => `
            <tr>
                <td>#${o.id}</td>
                <td><img src="${o.user_avatar && o.user_id ? `https://cdn.discordapp.com/avatars/${o.user_id}/${o.user_avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:20px;height:20px;border-radius:50%;margin-left:5px;vertical-align:middle;">${o.user_tag}</td>
                <td>${o.product_name}</td>
                <td>${o.quantity}</td>
                <td>${o.currency === 'coins' ? 'كوينز' : 'دولار'}</td>
                <td>${o.total_price}</td>
                <td>${new Date(o.created_at).toLocaleString('ar')}</td>
            </tr>
        `).join('');

        // Load Admin Products
        const prodRes = await fetch('/api/products');
        const prods = await prodRes.json();
        document.getElementById('adminProductsList').innerHTML = prods.map(p => `
            <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(0,0,0,0.3); padding:10px; border-radius:5px; border:1px solid var(--glass-border);">
                <div style="display:flex; align-items:center; gap:10px;">
                    <img src="${p.image}" style="width:40px;height:40px;object-fit:cover;border-radius:5px;" onerror="this.src='/assets/coin.png'">
                    <div>
                        <div style="font-weight:bold;">${p.name}</div>
                        <div style="font-size:0.8em; color:var(--text-muted);">${p.stock} حبة متوفرة | ${p.price_coins} كوينز</div>
                    </div>
                </div>
                <div>
                    <button onclick='openEditProduct(${JSON.stringify(p).replace(/'/g, "\\'")})' style="background:#f39c12; color:white; border:none; border-radius:3px; padding:5px 10px; cursor:pointer;"><i class="fas fa-edit"></i></button>
                    <button onclick="customConfirm('هل أنت متأكد من حذف هذا المنتج؟', () => removeProduct(${p.id}))" style="background:#e74c3c; color:white; border:none; border-radius:3px; padding:5px 10px; cursor:pointer;"><i class="fas fa-trash"></i></button>
                </div>
            </div>
        `).join('');

        // Load Coupons
        const coupRes = await fetch('/api/admin/coupons');
        const coupons = await coupRes.json();
        document.getElementById('couponsList').innerHTML = coupons.map(c => {
            const isExhausted = c.max_uses && c.max_uses > 0 && c.current_uses >= c.max_uses;
            return `
            <div style="display:flex; justify-content:space-between; margin-bottom:5px; background:rgba(0,0,0,0.3); padding:10px; border-radius:5px; ${isExhausted ? 'border:1px solid #e74c3c; opacity:0.8;' : ''}">
                <div>
                    <strong style="${isExhausted ? 'text-decoration:line-through; color:#e74c3c;' : ''}">${c.code}</strong> <span style="color:#2ecc71;">(${c.discount_percent}%)</span>
                    <div style="font-size:0.8em; color:var(--text-muted);">مستخدم: ${c.current_uses} / ${c.max_uses || 'مفتوح'} ${isExhausted ? '<span style="color:#e74c3c;font-weight:bold;margin-right:5px;">(انتهت صلاحيته)</span>' : ''}</div>
                </div>
                <button onclick="customConfirm('هل أنت متأكد من حذف هذا الكود؟', () => removeCoupon(${c.id}))" style="background:#e74c3c; color:white; border:none; border-radius:3px; padding:5px 10px; cursor:pointer;"><i class="fas fa-trash"></i></button>
            </div>
            `;
        }).join('');

        // Load Admins if owner
        if (userAuth && userAuth.user && userAuth.user.isOwner) {
            const admRes = await fetch('/api/admin/admins');
            const admins = await admRes.json();
            document.getElementById('adminsList').innerHTML = admins.map(a => `
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; background:rgba(0,0,0,0.3); padding:10px; border-radius:5px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <img src="${a.avatar && a.user_id ? `https://cdn.discordapp.com/avatars/${a.user_id}/${a.avatar}.png` : 'https://cdn.discordapp.com/embed/avatars/0.png'}" style="width:30px;height:30px;border-radius:50%;object-fit:cover;">
                        <div>
                            <div style="font-weight:bold;">${a.username}</div>
                            <div style="font-size:0.7em; color:var(--text-muted);">${a.user_id}</div>
                        </div>
                    </div>
                    ${a.user_id !== userAuth.user.id ? `<button onclick="customConfirm('هل أنت متأكد من إزالة هذا المسؤول؟', () => removeAdmin('${a.user_id}'))" style="background:#e74c3c; color:white; border:none; border-radius:3px; padding:5px 10px; cursor:pointer;"><i class="fas fa-trash"></i> إزالة</button>` : '<span style="color:#2ecc71; font-weight:bold;">المالك 👑</span>'}
                </div>
            `).join('');
        }
        
        // Populate Category Delete List
        const catListHTML = cats.map(c => `
            <div style="display:flex; justify-content:space-between; background:rgba(0,0,0,0.3); padding:8px; border-radius:5px; margin-bottom:5px;">
                <span>${c.name} (ترتيب: ${c.order_index})</span>
                <button onclick="customConfirm('هل أنت متأكد من حذف هذا التصنيف؟', () => removeCategory(${c.id}))" style="background:#e74c3c; color:white; border:none; border-radius:3px; padding:3px 8px; cursor:pointer;"><i class="fas fa-trash"></i></button>
            </div>
        `).join('');
        document.getElementById('categoriesListAdmin').innerHTML = catListHTML;
    } catch(e) {
        console.error(e);
    }
}

// Add Product
document.getElementById('addProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('pName').value,
        description: document.getElementById('pDesc').value,
        image: document.getElementById('pImage').value,
        price_usd: parseFloat(document.getElementById('pPriceUsd').value),
        price_coins: parseInt(document.getElementById('pPriceCoins').value),
        stock: parseInt(document.getElementById('pStock').value),
        category: document.getElementById('pCategory').value,
        discord_channel_id: document.getElementById('pChannel').value
    };

    try {
        const res = await fetch('/api/admin/products', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم إضافة المنتج للمتجر بنجاح!');
            e.target.reset();
        } else {
            showMessage('خطأ', 'ليس لديك صلاحية أو حدث خطأ ما.');
        }
    } catch(e) {
        showMessage('خطأ', 'حدث خطأ أثناء الإرسال.');
    }
});

// Add Category
document.getElementById('addCategoryForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        name: document.getElementById('cName').value,
        order_index: parseInt(document.getElementById('cOrder').value)
    };
    try {
        const res = await fetch('/api/admin/categories', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم إضافة التصنيف بنجاح!');
            e.target.reset();
            loadAdminData(); // Refresh dropdown
        }
    } catch(e) {}
});

async function removeCategory(id) {
    try {
        const res = await fetch('/api/admin/categories/' + id, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            showToast('تم حذف التصنيف!');
            loadAdminData();
        }
    } catch(e) {}
}

// Add Admin
document.getElementById('addAdminForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
        const res = await fetch('/api/admin/admins', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: document.getElementById('adminId').value })
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم إضافة المسؤول بنجاح!');
            e.target.reset();
            loadAdminData(); 
        }
    } catch(e) {}
});

async function removeAdmin(id) {
    try {
        const res = await fetch('/api/admin/admins/' + id, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            showToast('تمت الإزالة');
            loadAdminData();
        } else {
            showToast(result.error);
        }
    } catch(e) {}
}

async function removeProduct(id) {
    try {
        const res = await fetch('/api/admin/products/' + id, { method: 'DELETE' });
        const result = await res.json();
        if (result.success) {
            showToast('تم حذف المنتج!');
            loadAdminData();
            loadStore();
        }
    } catch(e) {}
}

function openEditProduct(p) {
    document.getElementById('epId').value = p.id;
    document.getElementById('epName').value = p.name;
    document.getElementById('epDesc').value = p.description;
    document.getElementById('epImage').value = p.image;
    document.getElementById('epPriceUsd').value = p.price_usd;
    document.getElementById('epPriceCoins').value = p.price_coins;
    document.getElementById('epStock').value = p.stock;
    document.getElementById('epCategory').value = p.category;
    document.getElementById('epChannel').value = p.discord_channel_id || '';
    document.getElementById('editProductOverlay').style.display = 'flex';
}

document.getElementById('editProductForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('epId').value;
    const data = {
        name: document.getElementById('epName').value,
        description: document.getElementById('epDesc').value,
        image: document.getElementById('epImage').value,
        price_usd: parseFloat(document.getElementById('epPriceUsd').value),
        price_coins: parseInt(document.getElementById('epPriceCoins').value),
        stock: parseInt(document.getElementById('epStock').value),
        category: document.getElementById('epCategory').value,
        discord_channel_id: document.getElementById('epChannel').value
    };
    try {
        const res = await fetch('/api/admin/products/' + id, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم تعديل المنتج بنجاح!');
            document.getElementById('editProductOverlay').style.display = 'none';
            loadAdminData();
            loadStore();
        }
    } catch(e) {}
});

document.getElementById('addCouponForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {
        code: document.getElementById('couponCodeInput').value,
        discount_percent: parseInt(document.getElementById('couponPercent').value),
        max_uses: parseInt(document.getElementById('couponMaxUses').value)
    };
    try {
        const res = await fetch('/api/admin/coupons', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        if (result.success) {
            showToast('تم إنشاء الكود بنجاح!');
            e.target.reset();
            loadAdminData();
        } else {
            showMessage('خطأ', result.error || 'حدث خطأ');
        }
    } catch(e) {}
});

async function removeCoupon(id) {
    try {
        const res = await fetch('/api/admin/coupons/' + id, { method: 'DELETE' });
        const result = await res.json();
        if(result.success) {
            showToast('تم الحذف');
            loadAdminData();
        }
    } catch(e) {}
}

// Custom Modal Confirm
let confirmActionCallback = null;
function customConfirm(message, callback) {
    document.getElementById('confirmMessage').innerText = message;
    confirmActionCallback = callback;
    document.getElementById('confirmModalOverlay').style.display = 'flex';
}

document.getElementById('confirmYesBtn').addEventListener('click', () => {
    document.getElementById('confirmModalOverlay').style.display = 'none';
    if(confirmActionCallback) confirmActionCallback();
    confirmActionCallback = null;
});

function closeConfirmModal() {
    document.getElementById('confirmModalOverlay').style.display = 'none';
    confirmActionCallback = null;
}

// Helpers
function showMessage(title, text) {
    try {
        document.getElementById('msgTitle').innerText = title;
        document.getElementById('msgBody').innerText = text; // Fix: was msgText, index.html uses msgBody
        document.getElementById('msgOverlay').style.display = 'flex';
    } catch (e) { console.error(e); }
}

function closeMsg() {
    try {
        document.getElementById('msgOverlay').style.display = 'none';
    } catch (e) { console.error(e); }
}

function showToast(message) {
    try {
        const container = document.getElementById('toastContainer');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerText = message;
        container.appendChild(toast);
        
        setTimeout(() => {
            if(toast.parentElement) toast.parentElement.removeChild(toast);
        }, 3000);
    } catch (e) { console.error(e); }
}

// Init
document.addEventListener('DOMContentLoaded', () => {
    try {
        checkAuth();
        loadStats();
        loadLatestOrders();
        setInterval(loadStats, 60000);
    } catch(e) {
        console.error('Error during initialization:', e);
    }
});

/* ================================
   Daily Streak & Roulette System
================================ */

let currentStreakDays = 0;
let isStreakReady = false;

async function checkStreak() {
    try {
        const res = await fetch('/api/streak/status');
        const data = await res.json();
        if (!data.loggedIn) return;

        currentStreakDays = data.streakDays || 0;
        isStreakReady = data.isReady || false;

        // Show dev toolbar if admin
        if (data.isDev) {
            document.getElementById('streakDevToolbar').style.display = 'block';
        }

        renderStreakDays();

        // Show FAB if logged in and on home page
        const isHome = document.getElementById('page-home').classList.contains('active');
        if (isHome) {
            document.getElementById('streakFab').style.display = 'flex';
        } else {
            document.getElementById('streakFab').style.display = 'none';
        }

        // If ready, show pulsing red badge
        if (isStreakReady) {
            document.getElementById('streakFabBadge').style.display = 'block';
        } else {
            document.getElementById('streakFabBadge').style.display = 'none';
        }
        
        if (!isStreakReady && data.nextClaimMs > 0) {
            const btn = document.getElementById('claimStreakBtn');
            btn.disabled = true;
            btn.style.background = '#555';
            btn.style.borderColor = '#555';
            btn.style.boxShadow = 'none';
            btn.style.color = 'white';
            btn.innerText = `عد غداً بعد ${Math.ceil(data.nextClaimMs / 3600000)} ساعة`;
        } else if (isStreakReady) {
            const btn = document.getElementById('claimStreakBtn');
            btn.disabled = false;
            btn.style.background = 'linear-gradient(45deg, #FFD700, #ff8c00)';
            btn.style.borderColor = '#FFD700';
            btn.style.boxShadow = '0 0 20px rgba(255,215,0,0.4)';
            btn.style.color = '#000';
            btn.innerText = 'استلم جائزتك 🎁';
        }
    } catch (e) { console.error(e); }
}

function renderStreakDays() {
    const container = document.getElementById('streakDaysContainer');
    container.innerHTML = '';
    
    for (let i = 1; i <= 7; i++) {
        const div = document.createElement('div');
        div.className = 'streak-day-icon';
        div.style.position = 'relative';
        div.style.width = '110px';
        div.style.height = '130px';
        div.style.borderRadius = '16px';
        div.style.background = 'linear-gradient(145deg, rgba(30,30,40,0.8), rgba(20,20,25,0.9))';
        div.style.border = '2px solid rgba(255,255,255,0.05)';
        div.style.boxShadow = '0 5px 15px rgba(0,0,0,0.3)';
        div.style.transition = 'all 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
        
        let boxType = 'bronze';
        if (i >= 7) boxType = 'legendary';
        else if (i >= 5) boxType = 'gold';
        else if (i >= 3) boxType = 'silver';
        else boxType = 'bronze'; // explicit 1 and 2

        if (i <= currentStreakDays) {
            div.style.background = 'linear-gradient(145deg, rgba(46, 204, 113, 0.1), rgba(20,20,25,0.9))';
            div.style.borderColor = 'rgba(46, 204, 113, 0.3)';
        } else if (i === currentStreakDays + 1 && isStreakReady) {
            div.style.background = 'linear-gradient(145deg, rgba(255, 215, 0, 0.2), rgba(30,30,40,0.9))';
            div.style.borderColor = '#FFD700';
            div.style.boxShadow = '0 0 25px rgba(255,215,0,0.6), inset 0 0 15px rgba(255,215,0,0.2)';
            div.style.transform = 'scale(1.1)';
            div.style.cursor = 'pointer';
            div.onclick = claimStreak;
            div.title = "اضغط لفتح الصندوق!";
        }

        const opacityFilter = (i <= currentStreakDays) ? 'opacity: 0.4; filter: grayscale(1);' : (i === currentStreakDays + 1 && isStreakReady ? 'opacity: 1; filter: drop-shadow(0 0 15px rgba(255,215,0,0.8));' : 'opacity: 0.8;');
        
        // Render box image and day number
        div.innerHTML = `
            <div style="position:absolute; top:8px; left:12px; font-size:1rem; color:var(--text-muted); font-weight:bold;">يوم ${i}</div>
            <img src="/assets/${boxType}-box.jpg" style="width: 80px; height: 80px; object-fit: contain; margin-top:30px; ${opacityFilter}" alt="${boxType} box">
        `;
        
        // Add checkmark if completed
        if (i <= currentStreakDays) {
            div.innerHTML += `<div style="position:absolute; bottom:5px; right:5px; font-size:1.2rem; background:#1e1e28; border:2px solid #2ecc71; border-radius:50%; width:25px; height:25px; display:flex; align-items:center; justify-content:center; color:#2ecc71;">✔️</div>`;
        }

        container.appendChild(div);
    }
}

async function claimStreak() {
    if (!isStreakReady) return;
    
    // 1. Debounce and Disable button immediately
    const btn = document.getElementById('claimStreakBtn');
    btn.disabled = true;
    btn.innerText = 'جاري الفتح... ⏳';
    btn.style.background = '#555';
    btn.style.borderColor = '#555';
    btn.style.boxShadow = 'none';
    btn.style.color = 'white';

    try {
        const res = await fetch('/api/streak/claim', { method: 'POST' });
        const data = await res.json();
        
        if (data.error) {
            showToast(data.error);
            btn.disabled = false;
            btn.innerText = 'استلم جائزتك 🎁';
            btn.style.background = 'linear-gradient(45deg, #FFD700, #ff8c00)';
            btn.style.borderColor = '#FFD700';
            btn.style.boxShadow = '0 0 20px rgba(255,215,0,0.4)';
            btn.style.color = '#000';
            return;
        }

        isStreakReady = false;
        document.getElementById('streakFabBadge').style.display = 'none';
        
        // Hide streak modal
        closeStreakModal();
        
        // Get old balance before checkAuth updates it
        const oldBalance = userAuth && userAuth.user ? userAuth.user.coins : 0;
        const newBalance = oldBalance + data.reward;
        
        currentStreakDays = data.streakDays;
        
        // Show celebration
        showCelebration(data.boxType, data.reward, oldBalance, newBalance);
        
        checkAuth(); // update balance in background
    } catch (e) {
        console.error(e);
        btn.disabled = false;
        btn.innerText = 'استلم جائزتك 🎁';
        btn.style.background = 'linear-gradient(45deg, #FFD700, #ff8c00)';
        btn.style.borderColor = '#FFD700';
        btn.style.boxShadow = '0 0 20px rgba(255,215,0,0.4)';
        btn.style.color = '#000';
    }
}

// ==========================================
// Profile Page Logic
// ==========================================
async function loadProfile() {
    if (!userAuth || !userAuth.loggedIn) {
        showToast('يجب تسجيل الدخول لعرض السجل');
        showPage('home');
        return;
    }

    const filter = document.getElementById('profileHistoryFilter').value || 'all';
    
    try {
        const res = await fetch(`/api/user/orders?filter=${filter}`);
        const data = await res.json();
        
        if (data.error) throw new Error(data.error);

        // Update Header
        document.getElementById('profileName').innerText = data.user.globalName || data.user.username;
        document.getElementById('profileAvatar').src = `https://cdn.discordapp.com/avatars/${data.user.id}/${data.user.avatar}.png?size=256`;
        document.getElementById('profileAvatar').onerror = function() { this.src = '/assets/coin.png'; };
        
        if (data.user.banner) {
            document.getElementById('profileBanner').style.background = `url(https://cdn.discordapp.com/banners/${data.user.id}/${data.user.banner}.png?size=512) center/cover no-repeat`;
        }

        // Update Stats
        document.getElementById('profileCurrentBalance').innerText = data.user.coins.toLocaleString();
        document.getElementById('profileTotalOrders').innerText = data.totalOrders.toLocaleString();
        document.getElementById('profileTotalSpent').innerText = data.totalSpentCoins.toLocaleString() + ' كوينز / ' + data.totalSpentUsd + '$';

        // Update List
        const list = document.getElementById('profileOrdersList');
        list.innerHTML = '';
        
        if (data.history.length === 0) {
            list.innerHTML = '<div class="text-center" style="padding:20px; color:#aaa;">لا توجد عمليات شراء</div>';
            return;
        }

        data.history.forEach(order => {
            const card = document.createElement('div');
            // Adding inline styles to guarantee it works immediately!
            card.style.cssText = "display: grid; grid-template-columns: 60px 2fr 1fr 1fr 1.5fr; gap: 10px; align-items: center; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px; padding: 12px 16px; margin-bottom: 10px; transition: 0.2s;";
            
            // Hover effect can be added via a tiny inline class or just onmouseover
            card.onmouseover = () => { card.style.background = 'rgba(255, 255, 255, 0.08)'; card.style.borderColor = 'rgba(255, 215, 0, 0.4)'; };
            card.onmouseout = () => { card.style.background = 'rgba(255, 255, 255, 0.04)'; card.style.borderColor = 'rgba(255, 255, 255, 0.1)'; };

            let amountDisplay = '';
            let iconColor = '';
            if (order.currency === 'coins') {
                amountDisplay = `<span style="color:#FFD700; font-weight:bold; font-size: 1.1rem;">${order.total_price} <i class="fas fa-coins"></i></span>`;
                iconColor = '#FFD700';
            } else {
                amountDisplay = `<span style="color:#2ecc71; font-weight:bold; font-size: 1.1rem;">${order.total_price} <i class="fas fa-dollar-sign"></i></span>`;
                iconColor = '#2ecc71';
            }

            let statusColor = order.status === 'completed' ? '#2ecc71' : '#f39c12';
            let statusText = order.status === 'completed' ? 'مكتمل' : order.status;
            let statusBadge = `<span style="background: rgba(0,0,0,0.3); padding: 4px 8px; border-radius: 6px; font-family: monospace; font-size: 0.9rem; border: 1px solid ${statusColor}; color: ${statusColor};">#${order.id} ${statusText}</span>`;

            let imageDisplay = `
                <div style="width: 40px; height: 40px; border-radius: 8px; background: rgba(255,255,255,0.1); display: flex; align-items: center; justify-content: center; font-size: 1.2rem; color: ${iconColor};">
                    <i class="fas fa-box-open"></i>
                </div>
            `;
            if (order.product_image) {
                imageDisplay = `<img src="${order.product_image}" style="width: 40px; height: 40px; border-radius: 8px; object-fit: cover; border: 1px solid rgba(255,255,255,0.2);" onerror="this.src='/assets/coin.png'">`;
            }

            const formattedDate = new Date(order.created_at).toLocaleString('ar-EG', { dateStyle: 'long', timeStyle: 'short' });

            card.innerHTML = `
                <div style="text-align: center; display: flex; justify-content: center;">
                    ${imageDisplay}
                </div>
                <div style="font-weight: bold; font-size: 1.05rem; color: #fff;">
                    ${order.product_name || 'منتج غير معروف'}
                </div>
                <div style="text-align: center;">
                    ${amountDisplay}
                </div>
                <div style="text-align: center;">
                    ${statusBadge}
                </div>
                <div style="text-align: left; color: rgba(255,255,255,0.5); font-size: 0.85rem;">
                    ${formattedDate}
                </div>
            `;
            list.appendChild(card);
        });

    } catch (e) {
        console.error(e);
        showToast('حدث خطأ أثناء جلب السجل');
    }
}


function hideStreakFab() {
    document.getElementById('streakFab').style.display = 'none';
}

function showCelebration(boxType, reward, oldBalance, newBalance) {
    const modal = document.getElementById('celebrationModal');
    const img = document.getElementById('celebrationBoxImage');
    const title = document.getElementById('celebrationTitle');
    
    // Set box image and title
    let boxName = 'صندوق برونزي';
    if (boxType === 'silver') boxName = 'صندوق فضي';
    else if (boxType === 'gold') boxName = 'صندوق ذهبي';
    else if (boxType === 'legendary') boxName = 'صندوق أسطوري 🌟';
    
    img.src = `/assets/${boxType}-box.jpg`;
    title.innerText = `لقد حصلت على ${boxName} يحتوي على ${reward} نقطة!`;
    
    // Show Modal
    modal.style.display = 'flex';
    
    // Fire Confetti
    if (typeof confetti === 'function') {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#FFD700', '#ff4757', '#2ecc71', '#3498db']
        });
    }
    
    // Animate Counter
    animateCounter(oldBalance, newBalance, 'newBalanceCount');
    document.getElementById('oldBalanceCount').innerText = oldBalance;
}

function animateCounter(start, end, elementId) {
    const el = document.getElementById(elementId);
    let current = start;
    const duration = 1500;
    const increment = (end - start) / (duration / 20); // 20ms steps
    
    const timer = setInterval(() => {
        current += increment;
        if (current >= end) {
            current = end;
            clearInterval(timer);
        }
        el.innerText = Math.floor(current);
    }, 20);
}

function closeCelebration() {
    document.getElementById('celebrationModal').style.display = 'none';
}

function closeStreakModal() {
    document.getElementById('streakOverlay').style.display = 'none';
}

function openStreakModal() {
    document.getElementById('streakOverlay').style.display = 'flex';
    checkStreak();
}

// === Dev Tools ===
async function devSkipStreak() {
    try {
        const res = await fetch('/api/streak/dev/skip', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hours: 24 })
        });
        const data = await res.json();
        if(data.success) {
            showToast('تم تقديم الوقت 24 ساعة');
            checkStreak();
        }
    } catch(e) { console.error(e); }
}

async function devResetStreak() {
    try {
        const res = await fetch('/api/streak/dev/reset', { method: 'POST' });
        const data = await res.json();
        if(data.success) {
            showToast('تم تصفير الستريك');
            checkStreak();
        }
    } catch(e) { console.error(e); }
}

async function devJumpStreak7() {
    try {
        const res = await fetch('/api/streak/dev/jump7', { method: 'POST' });
        const data = await res.json();
        if(data.success) {
            showToast('تم القفز لليوم 7');
            checkStreak();
        }
    } catch(e) { console.error(e); }
}

// === Season Management ===
async function loadSeason() {
    try {
        const res = await fetch('/api/season/status');
        const data = await res.json();
        if (data.success) {
            const banner = document.getElementById('seasonBanner');
            const title = document.getElementById('seasonTitle');
            const countdown = document.getElementById('seasonCountdown');
            
            if (banner) banner.style.display = 'flex';
            
            if (data.isActive) {
                if (title) title.innerText = '🏆 الموسم ' + data.number;
                if (countdown) {
                    countdown.innerText = '⏳ متبقي ' + data.remainingDays + ' يوم على النهاية';
                    countdown.style.color = '#FFD700';
                }
            } else {
                if (title) title.innerText = 'الموسم متوقف حالياً';
                if (countdown) {
                    countdown.innerText = 'بانتظار انطلاق السيزون القادم...';
                    countdown.style.color = 'var(--text-muted)';
                }
            }
        }
    } catch(e) {
        console.error('Failed to load season:', e);
    }
}

function showCustomConfirm(title, message, confirmText, isDanger, onConfirm) {
    const modal = document.getElementById('customConfirmModal');
    document.getElementById('confirmModalTitle').innerText = title;
    document.getElementById('confirmModalMessage').innerText = message;
    const btn = document.getElementById('confirmModalBtn');
    btn.innerText = confirmText;
    
    if (isDanger) {
        btn.style.background = '#e74c3c';
        btn.style.borderColor = '#c0392b';
    } else {
        btn.style.background = 'var(--primary)';
        btn.style.borderColor = 'var(--primary)';
    }

    btn.onclick = () => {
        closeCustomConfirm();
        onConfirm();
    };

    if(modal) modal.style.display = 'flex';
}

function closeCustomConfirm() {
    const modal = document.getElementById('customConfirmModal');
    if(modal) modal.style.display = 'none';
}

function startSeason() {
    showCustomConfirm('بدء سيزون جديد', 'هل أنت متأكد من بدء سيزون جديد لمدة 30 يوماً؟', 'نعم، ابدأ', false, async () => {
        try {
            const res = await fetch('/api/season/start', { method: 'POST' });
            const data = await res.json();
            if (data.success) {
                showToast(data.message);
                loadSeason();
            } else {
                showToast(data.error || 'حدث خطأ');
            }
        } catch(e) {
            showToast('فشل الاتصال بالخادم');
        }
    });
}

function endSeason() {
    showCustomConfirm('تحذير خطير: إنهاء السيزون', 'إيقاف السيزون سيؤدي إلى تصفير كافة النقاط (الكوينز) والستريك لجميع الأعضاء استعداداً للسيزون القادم! هل أنت متأكد بنسبة 100%؟', 'نعم، قم بالإنهاء والتصفير', true, () => {
        setTimeout(() => {
            showCustomConfirm('تأكيد نهائي!', 'هل أنت متأكد نهائياً؟ هذا الإجراء لا يمكن التراجع عنه!', 'تأكيد أخير', true, async () => {
                try {
                    const res = await fetch('/api/season/end', { method: 'POST' });
                    const data = await res.json();
                    if (data.success) {
                        showToast(data.message);
                        loadSeason();
                    } else {
                        showToast(data.error || 'حدث خطأ');
                    }
                } catch(e) {
                    showToast('فشل الاتصال بالخادم');
                }
            });
        }, 300);
    });
}
