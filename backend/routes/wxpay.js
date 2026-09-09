/**
 * 微信支付路由
 *
 * POST /api/wxpay/create    — 创建支付订单（前端调起微信支付）
 * POST /api/wxpay/notify    — 微信支付回调通知（公网可访问）
 * GET  /api/wxpay/status    — 检查微信支付配置状态
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, fail, safeFail, getOpenId, now } = require('../utils');
const { isWechatPayEnabled, createPrepayOrder, verifyNotify } = require('../utils/wechat-pay');
const ordersRoutes = require('./orders');

/**
 * GET /api/wxpay/status — 检查微信支付配置状态（已登录用户可查）
 */
router.get('/status', (req, res) => {
  try {
    res.json(success({ enabled: isWechatPayEnabled() }));
  } catch (err) {
    res.status(500).json(safeFail('查询失败'));
  }
});

/**
 * POST /api/wxpay/create — 创建支付订单
 * Body: { orderId }
 * 需要登录，用户只能支付自己的订单
 */
router.post('/create', async (req, res) => {
  try {
    const openid = getOpenId(req);
    if (!openid) return res.status(401).json(safeFail('未登录'));

    if (!isWechatPayEnabled()) {
      return res.json(fail('微信支付尚未开通，请联系机构线下支付或联系管理员配置'));
    }

    const { orderId } = req.body;
    if (!orderId) return res.json(fail('缺少订单 ID'));

    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    if (!order) return res.json(fail('订单不存在'));
    if (order.status === 'paid') return res.json(fail('订单已支付'));

    // 获取支付者 openid（微信登录的 openid）
    const user = db.prepare('SELECT openid FROM users WHERE openid = ?').get(openid);
    const wxOpenid = String(openid).startsWith('wx_') ? openid.substring(3) : openid;

    const result = await createPrepayOrder({
      orderNo: order.order_no,
      amount: order.payable_amount,
      description: order.items ? JSON.parse(order.items).map(i => i.itemName || i.name).join('、') : '教育服务',
      openid: wxOpenid,
    });

    if (result.success) {
      // 记录支付请求
      db.prepare(`
        INSERT OR REPLACE INTO payments (id, order_id, order_no, user_id, amount, channel, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'wechat', 'pending', ?)
      `).run(
        `pay_${order.order_no}`, order.id, order.order_no,
        openid, order.payable_amount, now()
      );
      res.json(success({ paySign: result.paySign, orderId: order.id }));
    } else {
      res.json(fail(result.error || '创建支付失败'));
    }
  } catch (err) {
    console.error('[wxpay create]', err);
    res.status(500).json(safeFail('创建支付失败'));
  }
});

/**
 * POST /api/wxpay/notify — 微信支付回调通知
 * 该路由需在 server.js 中加入 PUBLIC_PATHS
 */
router.post('/notify', (req, res) => {
  try {
    // fail-closed：未配置微信支付商户凭证时，拒绝处理回调，绝不标记订单为已支付
    if (!isWechatPayEnabled()) {
      console.warn('[wxpay notify] 微信支付未配置，拒绝回调（fail-closed），不修改订单状态');
      return res.status(400).json({ code: 'FAIL', message: '微信支付未配置，回调暂不处理' });
    }

    const { verified, data } = verifyNotify(req.headers, JSON.stringify(req.body));
    if (!verified) return res.status(400).json({ code: 'FAIL', message: '验签失败' });

    // 解析回调数据
    const outTradeNo = data?.resource?.out_trade_no || req.body?.out_trade_no;
    const transactionId = data?.resource?.transaction_id || req.body?.transaction_id;

    if (outTradeNo) {
      const order = db.prepare('SELECT * FROM orders WHERE order_no = ?').get(outTradeNo);
      if (order && order.status !== 'paid') {
        const t = now();
        db.transaction(() => {
          db.prepare('UPDATE orders SET status = ?, paid_at = ?, payment_id = ?, updated_at = ? WHERE id = ?')
            .run('paid', t, transactionId || '', t, order.id);
          db.prepare('UPDATE payments SET status = ?, transaction_id = ?, paid_at = ? WHERE order_id = ?')
            .run('success', transactionId || '', t, order.id);
          // 收款→开通：真实支付成功后必须授予会员卡 / 发放购买积分，
          // 否则家长付款后看不到卡、无法签到扣课（与模拟支付 / 建单即付路径保持一致）。
          if (ordersRoutes.grantOrderBenefits) ordersRoutes.grantOrderBenefits(order, t);
        })();
        console.log(`[WxPay] 订单 ${outTradeNo} 支付成功`);
      }
    }

    res.json({ code: 'SUCCESS', message: '成功' });
  } catch (err) {
    console.error('[wxpay notify]', err);
    res.status(500).json({ code: 'FAIL', message: '处理失败' });
  }
});

module.exports = router;
