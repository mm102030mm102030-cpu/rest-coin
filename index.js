require('dotenv').config();
const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField, AttachmentBuilder } = require('discord.js');
const db = require('./database/db');
const voiceTracker = require('./voiceTracker');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Message, Partials.Channel, Partials.Reaction]
});

client.isDoublePoint = false;
client.doublePointTimeout = null;

// Helper to get settings
const getSetting = (key) => {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : null;
};

const setSetting = (key, value) => {
  db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
};

// Format minutes to hours and minutes
const formatMinutes = (totalMinutes) => {
  if (!totalMinutes) return '0 دقيقة';
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0 && minutes > 0) return `${hours} ساعة و ${minutes} دقيقة`;
  if (hours > 0) return `${hours} ساعة`;
  return `${minutes} دقيقة`;
};

// Central helper to add coins and check milestones
client.addCoins = async (userId, amount, reason = 'عام') => {
  db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(userId);
  const oldCoinsRow = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(userId);
  const oldCoins = oldCoinsRow ? oldCoinsRow.coins : 0;
  
  const newCoins = oldCoins + amount;
  db.prepare('UPDATE users SET coins = ? WHERE user_id = ?').run(newCoins, userId);

  const milestone = Math.floor(newCoins / 100) * 100;
  if (milestone > 0 && Math.floor(oldCoins / 100) * 100 < milestone) {
    const chatChannelId = getSetting('chat_channel_id');
    if (chatChannelId) {
      const channel = client.channels.cache.get(chatChannelId);
      if (channel) {
        channel.send(`🔥 كفووو <@${userId}>! كسرت حاجز الـ 100 كوين جديدة، مجموع رصيدك وصل الآن: ${newCoins} كوين! استمر يا بطل 🚀`);
      }
    }
    
    const logChannelId = '1548016648295030944';
    const logChannel = client.channels.cache.get(logChannelId);
    if (logChannel) {
      const embed = new EmbedBuilder()
        .setTitle('🎉 إنجاز جديد')
        .setColor('Gold')
        .setDescription(`تخطى <@${userId}> حاجز المئة كوين!\nالرصيد الحالي: **${newCoins}**`)
        .setTimestamp();
      logChannel.send({ embeds: [embed] });
    }
  }
  return newCoins;
};

// Top 10 updater
const updateTopMessage = async () => {
  const topChannelId = getSetting('top_channel_id');
  const topMessageId = getSetting('top_message_id');
  if (!topChannelId || !topMessageId) return;

  const channel = client.channels.cache.get(topChannelId);
  if (!channel) return;

  try {
    const message = await channel.messages.fetch(topMessageId);
    if (message) {
      const topUsers = db.prepare('SELECT user_id, coins FROM users ORDER BY coins DESC LIMIT 10').all();
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 لوحة الصدارة - أفضل 10 أعضاء (Rest Coin) 🏆')
        .setColor('Gold')
        .setTimestamp();

      if (topUsers.length === 0) {
        embed.setDescription('لا يوجد أعضاء في القائمة حتى الآن.');
      } else {
        let desc = '';
        topUsers.forEach((user, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
          desc += `${medal} **المركز ${index + 1}**: <@${user.user_id}> - الرصيد: **${user.coins}** كوين\n`;
        });
        embed.setDescription(desc);
      }
      
      await message.edit({ content: null, embeds: [embed] });
    }
  } catch (err) {
    // Message might be deleted
  }
};

client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);
  
  voiceTracker(client);
  setInterval(updateTopMessage, 60000);
  
  // Register slash command
  try {
    await client.application.commands.create({
      name: 'سجل',
      description: 'عرض سجل مشتريات وحساب العضو',
      options: [
        {
          name: 'user',
          type: 6, // USER type
          description: 'العضو المطلوب',
          required: false
        }
      ]
    });
    console.log('Registered /سجل slash command.');
  } catch (err) {
    console.error('Failed to register slash command:', err);
  }

  // Start the web server
  require('./server')(client);
});

// Helper to remove emojis
const stripEmojis = (str) => {
  return str
    .replace(/<a?:.+?:\d+>/g, '') 
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, '') 
    .trim();
};

async function buildProfileMessage(targetUserId, filterType, context, isButton = false) {
  try {
    const targetUser = await client.users.fetch(targetUserId).catch(() => null);
    if (!targetUser) {
      if (isButton) return context.reply({ content: '❌ لم يتم العثور على العضو.', ephemeral: true });
      else return context.reply('❌ لم يتم العثور على العضو.');
    }

    const userRow = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(targetUser.id);
    const currentCoins = userRow ? userRow.coins : 0;

    const allOrders = db.prepare('SELECT * FROM orders WHERE user_id = ?').all(targetUser.id);
    let totalSpentCoins = 0;
    let totalSpentUsd = 0;
    for (const order of allOrders) {
      if (order.status === 'completed') {
        if (order.currency === 'coins') totalSpentCoins += order.total_price;
        else totalSpentUsd += order.total_price;
      }
    }

    let historyQuery = 'SELECT * FROM orders WHERE user_id = ?';
    if (filterType === '24h') {
      historyQuery += " AND created_at >= datetime('now', '-1 day') ORDER BY created_at DESC LIMIT 10";
    } else {
      historyQuery += ' ORDER BY created_at DESC LIMIT 50';
    }
    const history = db.prepare(historyQuery).all(targetUser.id);

    const embed = new EmbedBuilder()
      .setTitle(`سجل الحساب: ${targetUser.username}`)
      .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
      .setColor('Blue')
      .addFields(
        { name: '💰 الرصيد الحالي', value: `${currentCoins} كوينز`, inline: true },
        { name: '🛒 إجمالي الطلبات', value: `${allOrders.length}`, inline: true },
        { name: '💸 إجمالي المصروفات', value: `${totalSpentCoins} كوينز / ${totalSpentUsd}$`, inline: false }
      );

    if (history.length === 0) {
      embed.addFields({ name: 'سجل المشتريات', value: 'لا توجد عمليات شراء' });
    } else {
      let historyText = '';
      let fieldCount = 1;
      
      history.forEach((order, index) => {
        const priceStr = order.currency === 'coins' ? `${order.total_price} كوين` : `${order.total_price}$`;
        const line = `**#${order.id}** - ${order.product_name} (${priceStr}) - <t:${Math.floor(new Date(order.created_at).getTime() / 1000)}:d>\n`;
        
        if (historyText.length + line.length > 1000) {
            embed.addFields({ name: `سجل المشتريات (${filterType === '24h' ? 'آخر 24 ساعة' : 'السجل الكامل (آخر 50)'}) [جزء ${fieldCount}]`, value: historyText });
            historyText = '';
            fieldCount++;
        }
        historyText += line;
      });
      
      if (historyText.length > 0) {
          const title = fieldCount > 1 ? `سجل المشتريات [جزء ${fieldCount}]` : `سجل المشتريات (${filterType === '24h' ? 'آخر 24 ساعة' : 'السجل الكامل (آخر 50)'})`;
          embed.addFields({ name: title, value: historyText });
      }
    }

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`history_24h_${targetUser.id}`)
        .setLabel('سجل آخر 24 ساعة')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(filterType === '24h'),
      new ButtonBuilder()
        .setCustomId(`history_all_${targetUser.id}`)
        .setLabel('السجل الكامل')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(filterType === 'all')
    );

    if (isButton) {
      await context.update({ embeds: [embed], components: [row] });
    } else {
      await context.reply({ embeds: [embed], components: [row] });
    }
  } catch (e) {
    console.error(e);
    if (!isButton) context.reply('❌ حدث خطأ أثناء جلب السجل.');
  }
}

client.on('interactionCreate', async (interaction) => {
  if (interaction.isCommand() && interaction.commandName === 'سجل') {
    const OWNER_ID = process.env.OWNER_ID || '760911731399589888';
    let isAdmin = interaction.user.id === OWNER_ID || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!isAdmin) {
      const adminRow = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(interaction.user.id);
      if (adminRow) isAdmin = true;
    }
    if (!isAdmin) return interaction.reply({ content: '❌ هذا الأمر مخصص للإدارة.', ephemeral: true });

    const targetUser = interaction.options.getUser('user') || interaction.user;
    await buildProfileMessage(targetUser.id, 'all', interaction);
    return;
  }

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('history_')) {
      const OWNER_ID = process.env.OWNER_ID || '760911731399589888';
      let isAdmin = interaction.user.id === OWNER_ID || interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!isAdmin) {
        const adminRow = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(interaction.user.id);
        if (adminRow) isAdmin = true;
      }
      if (!isAdmin) return interaction.reply({ content: '❌ هذا الزر مخصص للإدارة.', ephemeral: true });

      const parts = interaction.customId.split('_');
      const filterType = parts[1]; 
      const targetUserId = parts[2];
      
      await buildProfileMessage(targetUserId, filterType, interaction, true);
      return;
    }
  }

  if (interaction.customId === 'show_rules') {
    return interaction.reply({ 
      content: '⚖️ **قوانين واقتصاد سيرفر Rest**\n1. مسموح التواجد والتأفيك في الرومات الصوتية لجمع النقاط بشكل طبيعي.\n2. مسموح بيع واستبدال عملة Rest Coin بمقابل حقيقي أو نقدي بين الأعضاء تحت مسؤوليتهم.\n3. استغلال أي ثغرة أو قلتش في البوت دون إبلاغ الإدارة يعرض حسابك لتصفير الرصيد نهائياً والحظر.', 
      ephemeral: true 
    });
  }

  if (interaction.customId === 'about_coin') {
    return interaction.reply({ 
      content: '💎 **ما هي عملة Rest Coin وكيف تستفيد منها؟**\nهي العملة الرسمية لسيرفر Rest، تجمعها مجاناً عبر تفاعلك الصوتي والكتابي، وتستطيع استبدالها عبر موقعنا ومتجرنا بـ:\n• شحن روبلوكس (Robux)\n• أرصدة مالية ودولارات حقيقية\n• بطاقات وفيزا رقمية\n• اشتراكات ديسكورد نيترو وبوستات للسيرفر\n• رتب ومزايا حصرية داخل السيرفر!', 
      ephemeral: true 
    });
  }

  if (interaction.customId === 'stop_double_event') {
    if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return interaction.reply({ content: '⚠️ هذا الزر مخصص للمسؤولين (Administrators) فقط!', ephemeral: true });
    }

    if (client.doublePointTimeout) {
      clearTimeout(client.doublePointTimeout);
      client.doublePointTimeout = null;
    }
    client.isDoublePoint = false;

    const embed = EmbedBuilder.from(interaction.message.embeds[0]);
    embed.setDescription(`🛑 **تم إيقاف حدث الدبل بوينت مبكراً بواسطة الإدارة (<@${interaction.user.id}>).**`);
    
    const row = ActionRowBuilder.from(interaction.message.components[0]);
    row.components[0].setDisabled(true);

    await interaction.update({ embeds: [embed], components: [row] });
    
    interaction.channel.send('🛑 **عادت النقاط لمعدلها الطبيعي وتم إيقاف المضاعفة.**');

    const logChannelId = '1548016648295030944';
    const logChannel = client.channels.cache.get(logChannelId);
    if (logChannel) {
      const logEmbed = new EmbedBuilder()
        .setTitle('🛑 إيقاف دبل بوينت')
        .setColor('Red')
        .setDescription(`قام المسؤول <@${interaction.user.id}> بإيقاف الحدث مبكراً.`)
        .setTimestamp();
      logChannel.send({ embeds: [logEmbed] });
    }
  }
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '-';

  if (message.content.startsWith(prefix)) {
    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    if (command === 'اوامر') {
      const embed = new EmbedBuilder()
        .setTitle('📜 قائمة أوامر السيرفر')
        .setColor('Blurple')
        .addFields(
          { name: '👥 أوامر الأعضاء', value: '`-ضريبه [المبلغ]` : حاسبة ضريبة التحويل.\n`-تحويل [@عضو] [المبلغ]` : تحويل الكوينز (مخصص لرتبة معينة فقط).' },
          { name: '🛡️ أوامر الإدارة', value: '`-سجل` أو `-سجل [@عضو]` : عرض سجل مشتريات وملف العضو.\n`-اضف [@عضو] [الكمية]` : إضافة رصيد لعضو.\n`-ازل [@عضو] [الكمية]` : إزالة رصيد من عضو.\n`-رصيد` أو `-رصيد [@عضو]` : عرض رصيد عضو.\n`-اعدادات` : قائمة تحكم بإعدادات الرومات.' },
          { name: '👑 أوامر المالك', value: '`-ترسيت` : تصفير رصيد السيرفر بالكامل.\n`-تخطي-الوقت` : لتخطي وقت المطالبة اليومية.' }
        );
      return message.reply({ embeds: [embed] });
    }

    if (command === 'سجل') {
      const OWNER_ID = process.env.OWNER_ID || '760911731399589888';
      let isAdmin = message.author.id === OWNER_ID || message.member.permissions.has(PermissionsBitField.Flags.Administrator);
      if (!isAdmin) {
        const adminRow = db.prepare('SELECT id FROM admins WHERE user_id = ?').get(message.author.id);
        if (adminRow) isAdmin = true;
      }
      if (!isAdmin) return message.reply('❌ هذا الأمر مخصص للإدارة فقط.');

      const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]) || message.author;
      await buildProfileMessage(targetUser.id, 'all', message);
      return;
    }

    if (command === 'تخطي-الوقت') {
      const OWNER_ID = process.env.OWNER_ID || '760911731399589888';
      
      if (message.author.id !== OWNER_ID) {
        return message.reply('❌ هذا الأمر مخصص للإدارة العليا (المالك) فقط.');
      }

      const hours = parseInt(args[0]) || 24;
      const msToSkip = hours * 60 * 60 * 1000;
      
      const userRow = db.prepare('SELECT last_claim_timestamp FROM users WHERE user_id = ?').get(message.author.id);
      if (!userRow) {
        return message.reply('❌ حسابك غير مسجل في قاعدة البيانات، يرجى تسجيل الدخول أولاً عبر الموقع.');
      }

      const newTimestamp = (userRow.last_claim_timestamp || Date.now()) - msToSkip;
      db.prepare('UPDATE users SET last_claim_timestamp = ? WHERE user_id = ?').run(newTimestamp, message.author.id);
      
      const replyMsg = await message.reply(`✅ تم تقديم الوقت ${hours} ساعة بنجاح! يمكنك الآن فتح الموقع وتجربة اليوم التالي للستريك.`);
      
      // Delete user's command and bot's reply after 5 seconds to keep it secret/clean
      setTimeout(() => {
          message.delete().catch(() => {});
          replyMsg.delete().catch(() => {});
      }, 5000);
      return;
    }

    if (command === 'ضريبه') {
      const amount = parseInt(args[0]);
      if (isNaN(amount) || amount <= 0) {
        return message.reply('❌ يرجى إدخال مبلغ صحيح. مثال: `-ضريبه 100`');
      }
      
      const tax = Math.floor(amount * 0.16);
      const net = amount - tax;

      const requiredGross = Math.ceil(amount / 0.84);

      const replyContent = `📊 **حاسبة ضريبة التحويل (16%)**\n• المبلغ المدخل: ${amount}\n• قيمة الضريبة: ${tax} كوين\n• الصافي المستلم: ${net} كوين\n\n💡 **لإيصال (${amount}) صافية للمستلم:**\n• يجب عليك تحويل: ${requiredGross} كوين.`;
      return message.reply(replyContent);
    }

    if (command === 'تحويل') {
      const allowedRoleId = '1548019497871343636';
      if (!message.member.roles.cache.has(allowedRoleId)) {
        return message.reply('⚠️ عذراً، لا تمتلك الرتبة المخصصة لإجراء عمليات التحويل!');
      }

      const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]);
      const amount = parseInt(args[1]);

      if (!targetUser || targetUser.bot) {
        return message.reply('❌ يرجى منشنة العضو بشكل صحيح. الاستخدام: `-تحويل [@user] [المبلغ]`');
      }

      if (targetUser.id === message.author.id) {
        return message.reply('⚠️ لا يمكنك تحويل الكوينز لنفسك!');
      }

      if (isNaN(amount)) {
        return message.reply('❌ يرجى كتابة مبلغ صحيح للتحويل.');
      }

      if (amount < 50) {
        return message.reply('⚠️ الحد الأدنى للتحويل هو 50 Rest Coin!');
      }

      if (amount > 1000) {
        return message.reply('⚠️ الحد الأقصى للتحويل هو 1000 Rest Coin!');
      }

      const senderId = message.author.id;
      db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(senderId);
      const senderData = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(senderId);

      if (!senderData || senderData.coins < amount) {
        return message.reply('❌ رصيدك غير كافٍ لإتمام عملية التحويل.');
      }

      const tax = Math.floor(amount * 0.16);
      const netAmount = amount - tax;

      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      const captchaCode = randomNum;

      await message.reply(`🔐 لتأكيد التحويل، يرجى كتابة الكود التالي خلال 30 ثانية: **${captchaCode}**`);

      const filter = m => m.author.id === message.author.id;
      const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

      collector.on('collect', async m => {
        if (m.content === captchaCode) {
          const runTransaction = db.transaction(() => {
            db.prepare('UPDATE users SET coins = coins - ? WHERE user_id = ?').run(amount, senderId);
            db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(targetUser.id);
            db.prepare('UPDATE users SET coins = coins + ? WHERE user_id = ?').run(netAmount, targetUser.id);
          });

          try {
            runTransaction();
            
            // Re-check milestone manually for target user
            const receiverData = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(targetUser.id);
            const milestone = Math.floor(receiverData.coins / 100) * 100;
            const oldTargetCoins = receiverData.coins - netAmount;
            if (milestone > 0 && Math.floor(oldTargetCoins / 100) * 100 < milestone) {
              const chatChannelId = getSetting('chat_channel_id');
              if (chatChannelId) {
                const channel = client.channels.cache.get(chatChannelId);
                if (channel) channel.send(`🔥 كفووو <@${targetUser.id}>! كسرت حاجز الـ 100 كوين جديدة، مجموع رصيدك وصل الآن: ${receiverData.coins} كوين! استمر يا بطل 🚀`);
              }
            }

            const successMsg = `💸 **تم تأكيد عملية التحويل بنجاح**\n• المرسل: <@${senderId}>\n• المستلم: <@${targetUser.id}>\n• المبلغ الصافي: ${netAmount} كوين\n• قيمة الضريبة (16%): ${tax} كوين`;
            message.channel.send(successMsg);

            try {
              await targetUser.send(`📩 **إشعار وصول تحويل**\n• المرسل: <@${senderId}>\n• استلمت: ${netAmount} ريست كوين\n• رصيدك الإجمالي الآن: ${receiverData.coins} كوين`);
            } catch (err) {}

            const logChannelId = '1548016648295030944';
            const logChannel = client.channels.cache.get(logChannelId);
            if (logChannel) {
              const logEmbed = new EmbedBuilder()
                .setTitle('📝 تقرير عملية تحويل')
                .setColor('Blue')
                .addFields(
                  { name: 'المرسل', value: `<@${senderId}> (${senderId})` },
                  { name: 'المستلم', value: `<@${targetUser.id}> (${targetUser.id})` },
                  { name: 'المبلغ الأساسي', value: `${amount}` },
                  { name: 'الضريبة', value: `${tax}` },
                  { name: 'الصافي', value: `${netAmount}` }
                )
                .setTimestamp();
              logChannel.send({ embeds: [logEmbed] });
            }
          } catch (err) {
            console.error(err);
            message.channel.send('❌ حدث خطأ أثناء تنفيذ المعاملة.');
          }
        } else {
          message.reply('❌ كود خاطئ. تم إلغاء العملية.');
        }
      });

      collector.on('end', collected => {
        if (collected.size === 0) {
          message.reply('⏳ انتهى الوقت، تم إلغاء عملية التحويل');
        }
      });

      return;
    }

    // --- OWNER COMMANDS ---
    if (command === 'تصفير-الكل') {
      const ownerId = '760911731399589888';
      if (message.author.id !== ownerId) {
        return message.reply('❌ هذا الأمر مخصص لمالك البوت فقط.');
      }

      const randomNum = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`confirm_reset_${randomNum}`)
          .setLabel('تأكيد التصفير')
          .setStyle(ButtonStyle.Danger)
      );

      const msg = await message.reply({ 
        content: `⚠️ **تحذير خطير:** أنت على وشك تصفير أرصدة جميع الأعضاء في السيرفر دون استثناء!\n\nلتأكيد العملية، يرجى الضغط على الزر أدناه.`,
        components: [row]
      });

      const filter = i => i.user.id === ownerId && i.customId === `confirm_reset_${randomNum}`;
      try {
        const i = await msg.awaitMessageComponent({ filter, time: 60000 });
        await i.reply({ content: `الآن قم بكتابة الكود **${randomNum}** في الشات للتأكيد النهائي. (لديك 30 ثانية)`, ephemeral: true });

        const msgFilter = m => m.author.id === ownerId;
        const msgCollector = message.channel.createMessageCollector({ filter: msgFilter, time: 30000, max: 1 });

        msgCollector.on('collect', async m => {
          if (m.content === randomNum) {
            db.prepare('UPDATE users SET coins = 0').run();
            message.channel.send('✅ **تم تصفير جميع أرصدة الأعضاء بنجاح.**');
            
            const logChannelId = '1548016648295030944';
            const logChannel = client.channels.cache.get(logChannelId);
            if (logChannel) {
              logChannel.send('⚠️ **تنبيه:** قام المالك بتصفير جميع أرصدة الكوينز في السيرفر.');
            }
          } else {
            message.channel.send('❌ الكود غير صحيح، تم إلغاء العملية.');
          }
        });
      } catch (err) {
        msg.edit({ content: '⏳ انتهى الوقت وتم إلغاء عملية التصفير.', components: [] });
      }
      return;
    }

    // --- ADMIN COMMANDS ---
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (command === 'التوب') {
      const topUsers = db.prepare('SELECT user_id, coins FROM users ORDER BY coins DESC LIMIT 10').all();
      
      const embed = new EmbedBuilder()
        .setTitle('🏆 لوحة الصدارة - أفضل 10 أعضاء (Rest Coin) 🏆')
        .setColor('Gold')
        .setTimestamp();

      if (topUsers.length === 0) {
        embed.setDescription('لا يوجد أعضاء في القائمة حتى الآن.');
      } else {
        let desc = '';
        topUsers.forEach((user, index) => {
          const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '🏅';
          desc += `${medal} **المركز ${index + 1}**: <@${user.user_id}> - الرصيد: **${user.coins}** كوين\n`;
        });
        embed.setDescription(desc);
      }
      
      const sentMsg = await message.channel.send({ embeds: [embed] });
      setSetting('top_channel_id', sentMsg.channel.id);
      setSetting('top_message_id', sentMsg.id);
      return message.reply('✅ تم تثبيت رسالة التوب، سيتم تحديثها كل دقيقة تلقائياً.').then(m => setTimeout(() => m.delete().catch(()=>null), 5000));
    }

    if (command === 'تحديد-الشات') {
      setSetting('chat_channel_id', message.channel.id);
      return message.reply('✅ تم تحديد هذا الروم كشات رئيسي للعملة.');
    }

    if (command === 'تحديد-الاخبار') {
      setSetting('news_channel_id', message.channel.id);
      return message.reply('✅ تم تحديد هذا الروم كروم الأخبار والإعلانات.');
    }

    if (command === 'نقاط') {
      const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]);
      if (!targetUser) return message.reply('❌ يرجى منشنة العضو أو وضع الآيدي الخاص به.');

      db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(targetUser.id);
      const userStats = db.prepare('SELECT * FROM users WHERE user_id = ?').get(targetUser.id);
      const voiceTimeFormatted = formatMinutes(userStats.voice_minutes);

      const embed = new EmbedBuilder()
        .setTitle(`نقاط ${targetUser.username}`)
        .setColor('Blue')
        .addFields(
          { name: '💰 الرصيد', value: `${userStats.coins} Rest Coin`, inline: true },
          { name: '💬 عدد الرسائل', value: `${userStats.messages_count}`, inline: true },
          { name: '🎤 وقت الفويس', value: `${voiceTimeFormatted}`, inline: true }
        )
        .setTimestamp();

      try {
        await message.author.send({ embeds: [embed] });
        await message.delete().catch(() => {});
      } catch (err) {
        await message.reply('❌ لا يمكنني إرسال رسالة لك بالخاص، يرجى فتح الخاص.');
      }
      return;
    }

    if (command === 'اوامر') {
      const embed = new EmbedBuilder()
        .setTitle('قائمة الأوامر الإدارية والعامة')
        .setColor('Green')
        .setDescription(`
**الأوامر العامة:**
**-تحويل [@user] [المبلغ]**: تحويل كوينز (يتطلب رتبة).
**-ضريبه [المبلغ]**: حساب ضريبة التحويل.

**أوامر الإدارة:**
**-التوب**: إرسال لوحة الصدارة المتجددة لأعلى 10 أعضاء.
**-تحديد-الشات**: لتحديد روم الكتابة المعتمد للنقاط.
**-تحديد-الاخبار**: لتحديد روم إعلانات الدبل بوينت والأخبار.
**-نقاط [@user/id]**: إرسال نقاط العضو في الخاص ومسح رسالة الأمر.
**-اوامر**: عرض هذه القائمة المُحدثة.
**-لوحة**: إرسال رسالة ترحيبية فخمة للعملة مع أزرار تفاعلية.
**-دبل-بوينت**: تفعيل حدث المضاعفة لمدة ساعة بدقة.
**-اعطاء [@user/id] [الكمية]**: إعطاء كوينز لعضو مع إرسال إشعار لمنشنه وخاصه.
**-سحب [@user/id] [الكمية]**: سحب كوينز من رصيد عضو.
**-معلومات [@user/id]**: عرض الإحصائيات الكاملة للعضو.
**-تغيير-الاسم [الاسم]**: تغيير اسم البوت.
**-تغيير-الصورة [رابط]**: تغيير صورة البوت.
**-تغيير-الحالة [النص]**: تغيير حالة البوت.

**للمالك فقط:**
**-تصفير-الكل**: تصفير أرصدة السيرفر.
        `);
      return message.reply({ embeds: [embed] });
    }

    if (command === 'لوحة') {
      const embed = new EmbedBuilder()
        .setTitle('💎 **نظام اقتصاد Rest Coin** 💎')
        .setDescription('**مرحباً بك في النظام الاقتصادي الأفضل والأكثر تطوراً! 🚀**\n\n🎙️ | تواجد في الرومات الصوتية\n💬 | تفاعل في الشات الكتابي\n\n💰 **لتبدأ بجمع عملات Rest Coin مجاناً!**\n\n🛍️ **بماذا يمكنك استبدال الكوينز؟**\nاستخدم رصيدك لشراء جوائز قيمة، رتب حصرية، أو حتى استبدالها بمكافآت حقيقية!\n\n👇 **استكشف المزيد عبر الأزرار أدناه:**')
        .setColor('#FFD700'); 
        
      const bannerPathPng = path.join(__dirname, 'banner.png');
      const bannerPathJpg = path.join(__dirname, 'banner.jpg');
      let files = [];
      
      if (fs.existsSync(bannerPathPng)) {
        const file = new AttachmentBuilder(bannerPathPng, { name: 'banner.png' });
        embed.setImage('attachment://banner.png');
        files.push(file);
      } else if (fs.existsSync(bannerPathJpg)) {
        const file = new AttachmentBuilder(bannerPathJpg, { name: 'banner.jpg' });
        embed.setImage('attachment://banner.jpg');
        files.push(file);
      }

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel('🌐 زيارة الموقع')
          .setStyle(ButtonStyle.Link)
          .setURL(process.env.WEBSITE_URL || 'https://example.com'),
        new ButtonBuilder()
          .setCustomId('show_rules')
          .setLabel('📜 القوانين')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('about_coin')
          .setLabel('❓ ما هي Rest Coin؟')
          .setStyle(ButtonStyle.Primary)
      );

      return message.channel.send({ embeds: [embed], components: [row], files: files });
    }

    if (command === 'دبل-بوينت') {
      const endTime = Math.floor((Date.now() + 3600000) / 1000);
      client.isDoublePoint = true;

      const embed = new EmbedBuilder()
        .setTitle('🔥 **انطلاق حدث دبل البوينت (Double Points)!** 🔥')
        .setDescription(`🚀 **لقد بدأ الآن حدث مضاعفة النقاط في سيرفر Rest!**\nفرصتكم الذهبية لمضاعفة نقاط التفاعل الصوتي والكتابي، استغلوا الحدث وتفاعلوا الآن لتجمعوا كوينز أسرع وتصلوا لجوائز المتجر بأقصر وقت! 💰✨\n\n⏳ **الوقت المتبقي لانتهاء الحدث:** <t:${endTime}:R> (ينتهي عند <t:${endTime}:t>)`)
        .setColor('Orange');

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('stop_double_event')
          .setLabel('🛑 إيقاف حدث الدبل')
          .setStyle(ButtonStyle.Danger)
      );

      const newsChannelId = getSetting('news_channel_id');
      if (newsChannelId) {
        const newsChannel = client.channels.cache.get(newsChannelId);
        if (newsChannel) {
          const sentMsg = await newsChannel.send({ content: '@here', embeds: [embed], components: [row] });
          
          if (client.doublePointTimeout) clearTimeout(client.doublePointTimeout);
          
          client.doublePointTimeout = setTimeout(() => {
            if (!client.isDoublePoint) return; 
            
            client.isDoublePoint = false;
            client.doublePointTimeout = null;
            
            const updatedEmbed = EmbedBuilder.from(sentMsg.embeds[0]);
            updatedEmbed.setDescription('🛑 **انتهى حدث الدبل بوينت!**');
            
            const updatedRow = ActionRowBuilder.from(sentMsg.components[0]);
            updatedRow.components[0].setDisabled(true);
            
            sentMsg.edit({ embeds: [updatedEmbed], components: [updatedRow] });
            newsChannel.send('⏳ **انتهى حدث الدبل بوينت وعادت النقاط لوضعها الطبيعي.**');
          }, 3600000); 

          const logChannelId = '1548016648295030944';
          const logChannel = client.channels.cache.get(logChannelId);
          if (logChannel) {
            const logEmbed = new EmbedBuilder()
              .setTitle('▶️ تفعيل دبل بوينت')
              .setColor('Green')
              .setDescription(`قام المسؤول <@${message.author.id}> بتفعيل الحدث.`)
              .setTimestamp();
            logChannel.send({ embeds: [logEmbed] });
          }
          
          return message.reply('✅ تم إطلاق حدث الدبل بوينت بنجاح في روم الأخبار.');
        } else {
           return message.reply('❌ لم أتمكن من العثور على روم الأخبار المحدد.');
        }
      } else {
        return message.reply('❌ يرجى تحديد روم الأخبار أولاً عبر الأمر `-تحديد-الاخبار`.');
      }
    }

    if (command === 'اعطاء') {
      const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]);
      const amount = parseInt(args[1]);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ الاستخدام الصحيح: `-اعطاء [@user] [الكمية]`');

      await client.addCoins(targetUser.id, amount, 'إعطاء إداري');
      
      const successMsg = `✅ **عملية شحن رصيد ناجحة**\n• المستلم: <@${targetUser.id}>\n• الكمية: ${amount} كوين\n• بواسطة: الإدارة`;
      message.channel.send(successMsg);
      
      try {
        const receiverData = db.prepare('SELECT coins FROM users WHERE user_id = ?').get(targetUser.id);
        await targetUser.send(`🎁 **إشعار استلام رصيد**\n• لقد استلمت: ${amount} ريست كوين من الإدارة\n• رصيدك الحالي الآن: ${receiverData.coins} كوين`);
      } catch (err) {}

      const logChannelId = '1548016648295030944';
      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📝 تقرير إعطاء نقاط')
          .setColor('Purple')
          .addFields(
            { name: 'المسؤول', value: `<@${message.author.id}>` },
            { name: 'المستلم', value: `<@${targetUser.id}>` },
            { name: 'الكمية', value: `${amount}` }
          )
          .setTimestamp();
        logChannel.send({ embeds: [logEmbed] });
      }
      return;
    }

    if (command === 'سحب') {
      const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]);
      const amount = parseInt(args[1]);
      if (!targetUser || isNaN(amount) || amount <= 0) return message.reply('❌ الاستخدام الصحيح: `-سحب [@user] [الكمية]`');

      db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(targetUser.id);
      db.prepare('UPDATE users SET coins = MAX(0, coins - ?) WHERE user_id = ?').run(amount, targetUser.id);
      
      const logChannelId = '1548016648295030944';
      const logChannel = client.channels.cache.get(logChannelId);
      if (logChannel) {
        const logEmbed = new EmbedBuilder()
          .setTitle('📝 تقرير سحب نقاط')
          .setColor('Red')
          .addFields(
            { name: 'المسؤول', value: `<@${message.author.id}>` },
            { name: 'العضو', value: `<@${targetUser.id}>` },
            { name: 'الكمية المسحوبة', value: `${amount}` }
          )
          .setTimestamp();
        logChannel.send({ embeds: [logEmbed] });
      }

      return message.reply(`✅ تم سحب ${amount} كوين من <@${targetUser.id}>.`);
    }

    if (command === 'معلومات') {
      const targetUser = message.mentions.users.first() || client.users.cache.get(args[0]);
      if (!targetUser) return message.reply('❌ الاستخدام الصحيح: `-معلومات [@user]`');

      db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(targetUser.id);
      const userStats = db.prepare('SELECT * FROM users WHERE user_id = ?').get(targetUser.id);
      const voiceTimeFormatted = formatMinutes(userStats.voice_minutes);

      const embed = new EmbedBuilder()
        .setTitle(`معلومات ${targetUser.username}`)
        .setColor('Random')
        .addFields(
          { name: '💰 الرصيد', value: `${userStats.coins} كوين`, inline: true },
          { name: '💬 الرسائل', value: `${userStats.messages_count}`, inline: true },
          { name: '🎤 وقت الفويس', value: `${voiceTimeFormatted}`, inline: true }
        );
      return message.reply({ embeds: [embed] });
    }

    if (command === 'تغيير-الاسم') {
      const newName = args.join(' ');
      if (!newName) return message.reply('❌ يرجى كتابة الاسم الجديد.');
      try {
        await client.user.setUsername(newName);
        return message.reply('✅ تم تغيير الاسم بنجاح.');
      } catch (err) {
        return message.reply('❌ حدث خطأ، ربما غيرت الاسم قريباً جداً.');
      }
    }

    if (command === 'تغيير-الصورة') {
      const newAvatar = args[0];
      if (!newAvatar) return message.reply('❌ يرجى وضع رابط الصورة.');
      try {
        await client.user.setAvatar(newAvatar);
        return message.reply('✅ تم تغيير الصورة بنجاح.');
      } catch (err) {
        return message.reply('❌ حدث خطأ في تغيير الصورة.');
      }
    }

    if (command === 'تغيير-الحالة') {
      const newActivity = args.join(' ');
      if (!newActivity) return message.reply('❌ يرجى كتابة الحالة.');
      client.user.setActivity(newActivity);
      return message.reply('✅ تم تغيير الحالة بنجاح.');
    }

    return;
  }

  // --- MESSAGE COUNT LOGIC ---
  const chatChannelId = getSetting('chat_channel_id');
  if (message.channel.id !== chatChannelId) return; 

  if (message.content === '.') return;
  if (message.stickers.size > 0) return;
  if (message.attachments.size > 0 && !message.content) return;

  const strippedContent = stripEmojis(message.content);
  if (strippedContent.length < 3) return; 

  const userId = message.author.id;
  const now = Date.now();

  db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(userId);
  const userRow = db.prepare('SELECT coins, messages_count, last_message_time FROM users WHERE user_id = ?').get(userId);

  if (now - userRow.last_message_time < 60000) return;

  const isDoublePoint = !!client.isDoublePoint;
  const pointsToAdd = isDoublePoint ? 4 : 2;

  // Add coins via helper to trigger milestones
  await client.addCoins(userId, pointsToAdd, 'شات');
  
  db.prepare('UPDATE users SET messages_count = messages_count + 1, last_message_time = ? WHERE user_id = ?').run(now, userId);
});

client.login(process.env.DISCORD_TOKEN);
