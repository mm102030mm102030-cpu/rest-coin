const express = require('express');
const session = require('express-session');
const passport = require('passport');
const DiscordStrategy = require('passport-discord').Strategy;
const path = require('path');
const db = require('./database/db');
const cors = require('cors');

module.exports = (client) => {
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  const GUILD_ID = process.env.GUILD_ID;
  const OWNER_ID = '760911731399589888';

  app.use(cors());
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));

  app.get('/favicon.ico', (req, res) => res.status(204).end());

  app.use(session({
    secret: 'rest-coin-secret-session-key',
    resave: false,
    saveUninitialized: false
  }));

  app.use(passport.initialize());
  app.use(passport.session());

  passport.serializeUser((user, done) => done(null, user));
  passport.deserializeUser((obj, done) => done(null, obj));

  passport.use(new DiscordStrategy({
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: 'http://localhost:3000/auth/discord/callback',
    scope: ['identify', 'guilds']
  }, (accessToken, refreshToken, profile, done) => {
    return done(null, profile);
  }));

  app.get('/auth/discord', passport.authenticate('discord'));
  
  app.get('/auth/discord/callback', passport.authenticate('discord', {
    failureRedirect: '/'
  }), (req, res) => {
    res.redirect('/');
  });

  app.get('/api/auth/status', async (req, res) => {
    if (!req.isAuthenticated()) return res.json({ loggedIn: false });
    
    const user = req.user;
    
    // Check if user is in guild
    let inGuild = false;
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(user.id);
      if (member) inGuild = true;
    } catch (err) {
      inGuild = false;
    }

    // Check if user is admin
    let isAdmin = user.id === OWNER_ID;
    if (!isAdmin) {
      const adminRow = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(user.id);
      if (adminRow) isAdmin = true;
    }

    // Get coins
    let coins = 0;
    const userRow = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(user.id);
    if (userRow) coins = userRow.coins;

    res.json({
      loggedIn: true,
      user: {
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        inGuild: inGuild,
        isAdmin: isAdmin,
        isOwner: user.id === OWNER_ID,
        coins: coins
      }
    });
  });

  app.get('/api/auth/logout', (req, res) => {
    req.logout(() => {
      res.redirect('/');
    });
  });

  // User Orders Ledger / Profile History
  app.get('/api/user/orders', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'غير مسجل الدخول' });
    
    const user = req.user;
    const filter = req.query.filter || 'all'; // 'all' or '24h'

    try {
      // Get all orders for stats
      const allOrders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(user.id);
      
      let totalSpentCoins = 0;
      let totalSpentUsd = 0;
      let totalOrders = allOrders.length;
      
      for (const order of allOrders) {
        if (order.status === 'completed') {
          if (order.currency === 'coins') totalSpentCoins += order.total_price;
          else totalSpentUsd += order.total_price;
        }
      }

      // Filter history
      let historyQuery = `
        SELECT orders.*, products.image as product_image 
        FROM orders 
        LEFT JOIN products ON orders.product_id = products.id 
        WHERE orders.user_id = ?
      `;
      if (filter === '24h') {
        historyQuery += " AND orders.created_at >= datetime('now', '-1 day')";
      }
      historyQuery += ' ORDER BY orders.created_at DESC';
      
      const history = db.prepare(historyQuery).all(user.id);

      // Get user coins
      const userRow = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(user.id);
      
      res.json({
        user: {
          id: user.id,
          username: user.username,
          globalName: user.global_name || user.username,
          avatar: user.avatar,
          banner: user.banner,
          coins: userRow ? userRow.coins : 0
        },
        totalOrders,
        totalSpentCoins,
        totalSpentUsd,
        history
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'خطأ في جلب السجل' });
    }
  });

  // Total members in guild
  app.get('/api/stats', async (req, res) => {
    let totalCount = 0;
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      if (guild) {
        totalCount = guild.memberCount;
      }
    } catch (err) {}
    res.json({ totalMembers: totalCount });
  });
  
  // Anti-Spam / Rate Limiting mechanisms for Streak
  const streakLocks = {};
  const streakRateLimits = {};

  // Streak System APIs
  app.get('/api/streak/status', (req, res) => {
    if (!req.isAuthenticated()) return res.json({ loggedIn: false });
    const userRow = db.prepare('SELECT streak_days, last_claim_timestamp FROM users WHERE user_id = ?').get(req.user.id);
    if (!userRow) return res.json({ loggedIn: false });
    
    const now = Date.now();
    const lastClaim = userRow.last_claim_timestamp || 0;
    const hoursSinceLastClaim = (now - lastClaim) / (1000 * 60 * 60);
    
    let isReady = false;
    let streakDays = userRow.streak_days || 0;
    let nextClaimMs = 0;
    
    if (lastClaim === 0) {
      isReady = true;
    } else if (hoursSinceLastClaim >= 24 && hoursSinceLastClaim < 48) {
      isReady = true;
    } else if (hoursSinceLastClaim >= 48) {
      // Missed streak
      isReady = true;
      streakDays = 0; // reset visually, will update DB on claim
    } else {
      isReady = false;
      nextClaimMs = (24 * 60 * 60 * 1000) - (now - lastClaim);
    }
    
    // Check dev privileges (STRICT OWNER ONLY)
    let isDev = req.user.id === OWNER_ID;

    res.json({
      loggedIn: true,
      streakDays: streakDays,
      isReady: isReady,
      nextClaimMs: nextClaimMs > 0 ? nextClaimMs : 0,
      isDev: isDev
    });
  });

  app.post('/api/streak/claim', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'الرجاء تسجيل الدخول أولاً' });
    const userId = req.user.id;
    
    // 1. Rate Limiting (Max 1 request per 3 seconds per user)
    const nowMs = Date.now();
    if (streakRateLimits[userId] && nowMs - streakRateLimits[userId] < 3000) {
      return res.status(429).json({ error: 'طلبات كثيرة جداً. الرجاء الانتظار.' });
    }
    streakRateLimits[userId] = nowMs;

    // 2. Double-Click Lock
    if (streakLocks[userId]) {
      return res.status(429).json({ error: 'جاري المعالجة، الرجاء الانتظار...' });
    }
    streakLocks[userId] = true;

    try {
      const userRow = db.prepare('SELECT streak_days, last_claim_timestamp FROM users WHERE user_id = ?').get(userId);
      if (!userRow) throw new Error('المستخدم غير موجود');
      
      const lastClaim = userRow.last_claim_timestamp || 0;
      const hoursSinceLastClaim = (nowMs - lastClaim) / (1000 * 60 * 60);
      
      let streakDays = userRow.streak_days || 0;
      
      if (lastClaim !== 0 && hoursSinceLastClaim < 24) {
        return res.status(400).json({ error: 'لم يحن وقت استلام المكافأة بعد' });
      }
      
      if (lastClaim !== 0 && hoursSinceLastClaim >= 48) {
        streakDays = 0; // Reset streak
      }
      
      streakDays += 1;
      
      // Determine Box Type and Reward
      let reward = 0;
      let boxType = 'bronze';
      
      if (streakDays >= 7) {
        boxType = 'legendary';
        reward = 350;
        streakDays = 0; // Reset after day 7
      } else if (streakDays >= 5) {
        boxType = 'gold';
        reward = 200;
      } else if (streakDays >= 3) {
        boxType = 'silver';
        reward = 100;
      } else {
        boxType = 'bronze';
        reward = 50;
      }
      
      db.transaction(() => {
        db.prepare('UPDATE users SET coins = coins + ?, streak_days = ?, last_claim_timestamp = ? WHERE user_id = ?').run(reward, streakDays, nowMs, userId);
      })();
      
      res.json({ success: true, reward, streakDays, boxType });
    } catch (e) {
      res.status(400).json({ error: e.message || 'حدث خطأ' });
    } finally {
      delete streakLocks[userId];
    }
  });

  // Dev Tools for Streak
  app.post('/api/streak/dev/skip', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.id !== OWNER_ID) return res.status(403).json({ error: 'Forbidden (Owner Only)' });
    
    const userRow = db.prepare('SELECT last_claim_timestamp FROM users WHERE user_id = ?').get(req.user.id);
    if (!userRow) return res.status(400).json({ error: 'User not found' });
    
    const hoursToSkip = parseInt(req.body.hours) || 24;
    const msToSkip = hoursToSkip * 60 * 60 * 1000;
    const newTimestamp = (userRow.last_claim_timestamp || Date.now()) - msToSkip;
    
    db.prepare('UPDATE users SET last_claim_timestamp = ? WHERE user_id = ?').run(newTimestamp, req.user.id);
    res.json({ success: true });
  });

  app.post('/api/streak/dev/reset', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.id !== OWNER_ID) return res.status(403).json({ error: 'Forbidden (Owner Only)' });
    
    db.prepare('UPDATE users SET streak_days = 0, last_claim_timestamp = 0 WHERE user_id = ?').run(req.user.id);
    res.json({ success: true });
  });

  app.post('/api/streak/dev/jump7', (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.id !== OWNER_ID) return res.status(403).json({ error: 'Forbidden (Owner Only)' });
    
    // Jump to day 6, and subtract 24 hours so day 7 is ready to claim
    const newTimestamp = Date.now() - (24 * 60 * 60 * 1000);
    db.prepare('UPDATE users SET streak_days = 6, last_claim_timestamp = ? WHERE user_id = ?').run(newTimestamp, req.user.id);
    res.json({ success: true });
  });

  // Top 10 API with live Discord data and timeout fix
  app.get('/api/top', async (req, res) => {
    const topUsers = db.prepare('SELECT user_id, coins FROM users ORDER BY coins DESC LIMIT 10').all();
    
    const fetchUserWithTimeout = (userId, timeoutMs = 2000) => {
      return Promise.race([
        client.users.fetch(userId),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeoutMs))
      ]);
    };

    const enrichedResults = await Promise.allSettled(topUsers.map(row => fetchUserWithTimeout(row.user_id)));

    const enrichedTopUsers = topUsers.map((row, index) => {
      const result = enrichedResults[index];
      if (result.status === 'fulfilled' && result.value) {
        const user = result.value;
        return {
          user_id: row.user_id,
          username: user.username,
          displayName: user.displayName || user.username,
          avatarUrl: user.displayAvatarURL({ extension: 'png', size: 128 }),
          coins: row.coins
        };
      } else {
        return {
          user_id: row.user_id,
          username: 'عضو Rest',
          displayName: 'عضو Rest',
          avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png',
          coins: row.coins
        };
      }
    });

    // Get user rank if logged in
    let userRank = null;
    let userCoins = 0;
    if (req.isAuthenticated()) {
      const rankRow = db.prepare(`
        SELECT rank, coins FROM (
          SELECT user_id, coins, ROW_NUMBER() OVER (ORDER BY coins DESC) as rank 
          FROM users
        ) WHERE user_id = ?
      `).get(req.user.id);
      
      if (rankRow) {
        userRank = rankRow.rank;
        userCoins = rankRow.coins;
      }
    }
    
    res.json({ top: enrichedTopUsers, userRank: userRank, userCoins: userCoins });
  });

  // Categories API
  app.get('/api/categories', (req, res) => {
    const categories = db.prepare('SELECT * FROM categories ORDER BY order_index ASC').all();
    res.json(categories);
  });

  // Products API
  app.get('/api/products', (req, res) => {
    const products = db.prepare('SELECT * FROM products').all();
    res.json(products);
  });

  // Latest Orders API
  app.get('/api/orders/latest', async (req, res) => {
    const orders = db.prepare('SELECT id, user_id, user_tag, user_avatar, product_name, quantity, currency, created_at FROM orders ORDER BY created_at DESC LIMIT 10').all();
    const enrichedOrders = await Promise.all(orders.map(async (o) => {
      let avatar = o.user_avatar;
      if (!avatar) {
        try {
          const u = await client.users.fetch(o.user_id);
          avatar = u.avatar;
          db.prepare('UPDATE orders SET user_avatar = ? WHERE id = ?').run(avatar, o.id);
        } catch(e) {}
      }
      return { ...o, user_avatar: avatar };
    }));
    res.json(enrichedOrders);
  });

  // Admin APIs (protected)
  const requireAdmin = (req, res, next) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'Unauthorized' });
    if (req.user.id !== OWNER_ID) {
      const adminRow = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(req.user.id);
      if (!adminRow) return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
  
  const requireOwner = (req, res, next) => {
    if (!req.isAuthenticated() || req.user.id !== OWNER_ID) {
      return res.status(403).json({ error: 'Forbidden. Owner only.' });
    }
    next();
  };

  // Admin: Products
  app.post('/api/admin/products', requireAdmin, (req, res) => {
    const { name, description, image, price_usd, price_coins, stock, category, discord_channel_id } = req.body;
    const stmt = db.prepare('INSERT INTO products (name, description, image, price_usd, price_coins, stock, category, discord_channel_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(name, description, image, price_usd, price_coins, stock, category, discord_channel_id);
    res.json({ success: true, id: info.lastInsertRowid });
  });

  app.put('/api/admin/products/:id', requireAdmin, (req, res) => {
    const { name, description, image, price_usd, price_coins, stock, category, discord_channel_id } = req.body;
    const stmt = db.prepare('UPDATE products SET name = ?, description = ?, image = ?, price_usd = ?, price_coins = ?, stock = ?, category = ?, discord_channel_id = ? WHERE id = ?');
    stmt.run(name, description, image, price_usd, price_coins, stock, category, discord_channel_id, req.params.id);
    res.json({ success: true });
  });

  app.delete('/api/admin/products/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Admin: Coupons
  app.get('/api/admin/coupons', requireAdmin, (req, res) => {
    const coupons = db.prepare('SELECT * FROM coupons ORDER BY created_at DESC').all();
    res.json(coupons);
  });

  app.get('/api/coupons/validate', (req, res) => {
    const { code } = req.query;
    if (!code) return res.json({ valid: false, message: 'كود الخصم مفقود' });
    const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(code.toUpperCase());
    
    if (!coupon) return res.json({ valid: false, message: 'الكود غير صالح' });
    if (coupon.max_uses && coupon.max_uses > 0 && coupon.current_uses >= coupon.max_uses) {
      return res.json({ valid: false, message: 'الكود تجاوز الحد الأقصى للاستخدام' });
    }
    
    res.json({ valid: true, discount_percent: coupon.discount_percent });
  });

  app.post('/api/admin/coupons', requireAdmin, (req, res) => {
    const { code, discount_percent, max_uses } = req.body;
    if (!code || !discount_percent) return res.status(400).json({ error: 'البيانات غير مكتملة' });
    try {
      db.prepare('INSERT INTO coupons (code, discount_percent, max_uses) VALUES (?, ?, ?)').run(code, discount_percent, max_uses || 0);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'الكود موجود مسبقاً' });
    }
  });

  app.delete('/api/admin/coupons/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Admin: Categories
  app.post('/api/admin/categories', requireAdmin, (req, res) => {
    const { name, order_index } = req.body;
    const stmt = db.prepare('INSERT INTO categories (name, order_index) VALUES (?, ?)');
    stmt.run(name, order_index || 0);
    res.json({ success: true });
  });

  app.delete('/api/admin/categories/:id', requireAdmin, (req, res) => {
    db.prepare('DELETE FROM categories WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Admin: View all orders
  app.get('/api/admin/orders', requireAdmin, (req, res) => {
    const orders = db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
    res.json(orders);
  });

  // Admin: Admins management
  // Season API
  app.get('/api/season/status', (req, res) => {
    try {
      const numRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('season_number');
      const activeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('season_is_active');
      const endRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('season_end_date');
      
      const number = numRow ? parseInt(numRow.value) : 1;
      const isActive = activeRow && activeRow.value === 'true';
      const endDate = endRow ? parseInt(endRow.value) : 0;
      
      let remainingDays = 0;
      if (isActive && endDate > 0) {
        remainingDays = Math.max(0, Math.ceil((endDate - Date.now()) / (1000 * 60 * 60 * 24)));
      }
      
      res.json({ success: true, number, isActive, remainingDays });
    } catch(e) {
      res.status(500).json({ error: 'Failed to fetch season status' });
    }
  });

  app.post('/api/season/start', requireOwner, (req, res) => {
    try {
      const activeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('season_is_active');
      if (activeRow && activeRow.value === 'true') {
        return res.status(400).json({ error: 'السيزون يعمل حالياً!' });
      }
      
      const endDate = Date.now() + (30 * 24 * 60 * 60 * 1000); // 30 days
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('true', 'season_is_active');
      db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(endDate.toString(), 'season_end_date');
      
      res.json({ success: true, message: 'تم بدء السيزون بنجاح' });
    } catch(e) {
      res.status(500).json({ error: 'Failed to start season' });
    }
  });

  app.post('/api/season/end', requireOwner, (req, res) => {
    try {
      const activeRow = db.prepare('SELECT value FROM settings WHERE key = ?').get('season_is_active');
      if (!activeRow || activeRow.value === 'false') {
        return res.status(400).json({ error: 'السيزون متوقف بالفعل!' });
      }

      const runTransaction = db.transaction(() => {
        // Stop season
        db.prepare('UPDATE settings SET value = ? WHERE key = ?').run('false', 'season_is_active');
        
        // Increment season number
        db.prepare('UPDATE settings SET value = CAST(value AS INTEGER) + 1 WHERE key = ?').run('season_number');
        
        // Reset ALL users coins and streak_days (NOT messages/voice)
        db.prepare('UPDATE users SET coins = 0, streak_days = 0, last_claim_timestamp = 0').run();
      });

      runTransaction();
      res.json({ success: true, message: 'تم إنهاء السيزون وتصفير البيانات بنجاح' });
    } catch(e) {
      console.error(e);
      res.status(500).json({ error: 'Failed to end season' });
    }
  });

  app.get('/api/admin/admins', requireOwner, async (req, res) => {
    const admins = db.prepare('SELECT * FROM admins').all();
    const enrichedAdmins = await Promise.all(admins.map(async (a) => {
      try {
        const dUser = await client.users.fetch(a.user_id);
        return { user_id: a.user_id, username: dUser.username, avatar: dUser.avatar };
      } catch(e) {
        return { user_id: a.user_id, username: 'Unknown', avatar: null };
      }
    }));
    res.json(enrichedAdmins);
  });

  app.post('/api/admin/admins', requireOwner, async (req, res) => {
    const { user_id } = req.body;
    if (!user_id) return res.status(400).json({ error: 'User ID required' });
    try {
      await client.users.fetch(user_id); // Validate discord user
      db.prepare('INSERT OR IGNORE INTO admins (user_id) VALUES (?)').run(user_id);
      res.json({ success: true });
    } catch (e) {
      res.status(400).json({ error: 'User not found in Discord' });
    }
  });

  app.delete('/api/admin/admins/:id', requireOwner, (req, res) => {
    if (req.params.id === OWNER_ID) return res.status(400).json({ error: 'Cannot remove owner' });
    db.prepare('DELETE FROM admins WHERE user_id = ?').run(req.params.id);
    res.json({ success: true });
  });

  // Purchase logic
  app.post('/api/purchase', async (req, res) => {
    if (!req.isAuthenticated()) return res.status(401).json({ error: 'الرجاء تسجيل الدخول أولاً' });
    
    const user = req.user;
    
    let inGuild = false;
    try {
      const guild = await client.guilds.fetch(GUILD_ID);
      const member = await guild.members.fetch(user.id);
      if (member) inGuild = true;
    } catch (err) {}
    
    if (!inGuild) return res.status(403).json({ error: 'not_in_guild' });
    
    const { cart, paymentMethod, couponCode } = req.body; 
    if (!cart || cart.length === 0) return res.status(400).json({ error: 'السلة فارغة' });

    let discount = 0;
    let couponId = null;
    if (couponCode) {
      const coupon = db.prepare('SELECT * FROM coupons WHERE code = ?').get(couponCode.toUpperCase());
      if (coupon && (!coupon.max_uses || coupon.max_uses === 0 || coupon.current_uses < coupon.max_uses)) {
        discount = coupon.discount_percent;
        couponId = coupon.id;
      } else {
        return res.status(400).json({ error: 'كود الخصم غير صالح أو انتهت مرات استخدامه' });
      }
    }

    const runTransaction = db.transaction(() => {
      let totalCoins = 0;
      let totalUsd = 0;
      let orderLogs = [];

      for (const item of cart) {
        const product = db.prepare('SELECT * FROM products WHERE id = ?').get(item.id);
        if (!product) throw new Error('المنتج غير موجود');
        if (product.stock < item.qty) throw new Error(`الكمية المطلوبة من ${product.name} غير متوفرة`);

        totalCoins += (product.price_coins * item.qty);
        totalUsd += (product.price_usd * item.qty);
        
        db.prepare('UPDATE products SET stock = stock - ? WHERE id = ?').run(item.qty, item.id);
        
        orderLogs.push({
          product,
          qty: item.qty
        });
      }

      if (discount > 0) {
        totalCoins = Math.floor(totalCoins * (1 - (discount/100)));
        totalUsd = totalUsd * (1 - (discount/100));
        if (couponId) db.prepare('UPDATE coupons SET current_uses = current_uses + 1 WHERE id = ?').run(couponId);
      }

      if (paymentMethod === 'coins') {
        const userRow = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(user.id);
        if (!userRow || userRow.coins < totalCoins) {
          throw new Error('⚠️ ليس لديك رصيد كافٍ من Rest Coin لإتمام العملية!');
        }
        db.prepare('UPDATE users SET coins = coins - ? WHERE user_id = ?').run(totalCoins, user.id);
      }

      const userTag = `${user.username}`;
      // Record orders
      for (const log of orderLogs) {
        const pricePaid = paymentMethod === 'coins' ? (log.product.price_coins * (1 - (discount/100))) : (log.product.price_usd * (1 - (discount/100)));
        
        db.prepare(`
          INSERT INTO orders (user_id, user_tag, user_avatar, product_id, product_name, quantity, total_price, currency, status) 
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(user.id, userTag, user.avatar, log.product.id, log.product.name, log.qty, pricePaid * log.qty, paymentMethod, 'completed');
      }
      
      return { totalCoins, totalUsd, orderLogs };
    });

    try {
      const result = runTransaction();
      
      // Notify Discord
      const embed = {
        title: '🛒 طلب جديد من الموقع',
        color: 0x00FF00,
        description: `<@${user.id}> قام بشراء منتجات جديدة!\n**طريقة الدفع:** ${paymentMethod === 'coins' ? 'الكوينز' : 'الدولار (يحتاج فتح تكت)'}`,
        fields: []
      };

      for (const log of result.orderLogs) {
        embed.fields.push({
          name: log.product.name,
          value: `الكمية: ${log.qty}`
        });
        
        if (log.product.discord_channel_id) {
          try {
            const channel = client.channels.cache.get(log.product.discord_channel_id);
            if (channel) {
              const baseCoins = log.product.price_coins * log.qty;
              const baseUsd = log.product.price_usd * log.qty;
              const discountedCoins = Math.floor(baseCoins * (1 - (discount/100)));
              const discountedUsd = baseUsd * (1 - (discount/100));
              
              const finalPrice = paymentMethod === 'coins' ? discountedCoins : discountedUsd;
              const currencyName = paymentMethod === 'coins' ? 'عملة Rest Coin' : 'الدولار $';
              const markdownMsg = `🛒 **طلب شراء جديد من المتجر**
━━━━━━━━━━━━━━━━━━━━
👤 **المشتري:** <@${user.id}>
🆔 **آيدي المشتري:** \`${user.id}\`
🏷️ **اسم الحساب:** ${user.username}
📦 **المنتج:** ${log.product.name}
🔢 **الكمية:** ${log.qty}
💳 **طريقة الدفع:** ${currencyName}
💰 **المبلغ الإجمالي:** ${finalPrice} ${discount > 0 ? `(بعد خصم ${discount}%)` : ''}
🕒 **الوقت:** ${new Date().toLocaleString('ar')}
━━━━━━━━━━━━━━━━━━━━
📌 **ملاحظة:** يرجى من المشتري فتح تكت لإتمام استلام الطلب.`;
              channel.send({ content: markdownMsg });
            }
          } catch(e) {}
        }
      }

      const logChannelId = '1548016648295030944'; // General Log
      try {
        const logChannel = client.channels.cache.get(logChannelId);
        if (logChannel) logChannel.send({ embeds: [embed] });
      } catch(e) {}

      res.json({ success: true, message: '✅ تم تسجيل طلبك بنجاح! الرجاء فتح تكت في السيرفر والانتظار من ساعة إلى 48 ساعة للتسليم.' });

    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.listen(PORT, () => {
    console.log(`✅ Web Server is running on http://localhost:${PORT}`);
  });
};
