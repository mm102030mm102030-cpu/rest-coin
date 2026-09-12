const db = require('./database/db');

module.exports = (client) => {
  setInterval(() => {
    try {
      const isDoublePoint = !!client.isDoublePoint;
      const pointsToAdd = isDoublePoint ? 4 : 2;

      client.guilds.cache.forEach(guild => {
        guild.channels.cache.filter(c => c.isVoiceBased()).forEach(channel => {
          const members = channel.members.filter(m => !m.user.bot);
          
          if (members.size >= 2) {
            members.forEach(async member => {
              if (member.voice.mute || member.voice.deaf || member.voice.selfMute || member.voice.selfDeaf) {
                return;
              }

              const userId = member.user.id;
              
              db.prepare('INSERT OR IGNORE INTO users (user_id) VALUES (?)').run(userId);
              db.prepare('UPDATE users SET voice_minutes = voice_minutes + 1 WHERE user_id = ?').run(userId);

              const userRow = db.prepare('SELECT voice_minutes FROM users WHERE user_id = ?').get(userId);
              
              if (userRow.voice_minutes >= 10) {
                // Add points through the central helper to check milestones
                await client.addCoins(userId, pointsToAdd, 'فويس');
                // We do NOT reset voice_minutes to 0, we just subtract 10 so we don't lose leftover minutes if it spiked.
                db.prepare('UPDATE users SET voice_minutes = voice_minutes - 10 WHERE user_id = ?').run(userId);
              }
            });
          }
        });
      });
    } catch (error) {
      console.error('Error in Voice Tracker:', error);
    }
  }, 60000);
};
