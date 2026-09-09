/**
 * 续费提醒生成器
 * 按「推送规则 → 续期提醒」配置的提前天数（默认 15/7/1 天）扫描有效会员卡，
 * 到期当天所在的提醒档位向绑定家长发送站内通知；按 template_id 幂等去重。
 * @param {object} db better-sqlite3 实例
 * @returns {{ created: number, reminderDays: number[], message: string }}
 */
function generateRenewalNotifications(db) {
  const { generateId, now } = require('./index');
  let reminderDays = [15, 7, 1];
  let enabled = true;
  let template = '您的孩子{{studentName}}的会员卡即将到期（{{cardType}}），为避免影响正常训练，请及时续期。';
  try {
    const rulesJson = db.prepare("SELECT value FROM settings WHERE key = 'notification_rules'").get();
    const rules = rulesJson ? JSON.parse(rulesJson.value) : [];
    const renewalRule = rules.find((r) => r && r.name === '续期提醒');
    if (renewalRule) {
      enabled = renewalRule.enabled !== false;
      if (Array.isArray(renewalRule.reminderDays) && renewalRule.reminderDays.length) {
        reminderDays = renewalRule.reminderDays
          .map(Number)
          .filter((n) => Number.isFinite(n) && n > 0)
          .sort((a, b) => b - a);
      }
      if (renewalRule.template) template = String(renewalRule.template);
    }
  } catch (e) { /* 规则解析失败走默认 */ }

  if (!enabled || !reminderDays.length) {
    return { created: 0, reminderDays, message: '续期提醒规则未启用' };
  }

  const t = now();
  const DAY = 86400000;
  const daysLeftSet = new Set(reminderDays);
  const maxDays = Math.max(...reminderDays);
  const cards = db.prepare(`
    SELECT mc.id, mc.student_id, mc.student_name, mc.card_type_name, mc.expires_at
    FROM member_cards mc
    WHERE mc.status = 'active' AND mc.expires_at > ?
      AND mc.expires_at <= ? + ?
  `).all(t, t, maxDays * DAY);

  let created = 0;
  for (const card of cards) {
    const daysLeft = Math.ceil((card.expires_at - t) / DAY);
    if (daysLeft <= 0 || !daysLeftSet.has(daysLeft)) continue;
    const templateId = `renewal_mc_${card.id}_${daysLeft}`;
    const already = db.prepare('SELECT 1 FROM notifications WHERE template_id = ? LIMIT 1').get(templateId);
    if (already) continue;

    const parents = db.prepare(`
      SELECT DISTINCT pb.parent_openid, pb.parent_name
      FROM parent_bindings pb
      WHERE pb.student_id = ? AND pb.parent_openid != ''
    `).all(card.student_id);
    if (!parents.length) continue;

    const content = template
      .replace(/{{studentName}}/g, card.student_name || '孩子')
      .replace(/{{cardType}}/g, card.card_type_name || '会员卡')
      .replace(/{{days}}/g, String(daysLeft));
    const ins = db.prepare(`
      INSERT INTO notifications (id, user_id, student_id, template_id, title, content, summary, priority, category, channel, status, is_broadcast, sent_at, created_at)
      VALUES (?, ?, ?, ?, '会员即将到期提醒', ?, ?, 'important', 'system', 'inapp', 'sent', 0, ?, ?)
    `);
    for (const p of parents) {
      ins.run(generateId('NTF_RENEWAL_'), p.parent_openid, card.student_id, templateId, content,
        (content || '').slice(0, 60), t, t);
      created++;
    }
  }

  return { created, reminderDays, message: created ? `已发送 ${created} 条续费提醒` : '本次无新的续费提醒需发送' };
}

module.exports = { generateRenewalNotifications };
