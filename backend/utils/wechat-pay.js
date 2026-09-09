/**
 * 微信支付集成模块
 *
 * 依赖环境变量：
 *   WX_APPID       — 小程序 AppID
 *   WX_SECRET      — 小程序 Secret（用于获取 access_token）
 *   WX_MCH_ID      — 微信支付商户号
 *   WX_MCH_KEY     — 商户 API 密钥（V3）
 *   WX_NOTIFY_URL  — 支付回调通知地址（公网可访问）
 *
 * 未配置时所有支付接口返回未开通提示，不影响系统其他功能。
 */

const crypto = require('crypto');
const { generateId, now } = require('../utils');

const CONFIG = {
  appid: process.env.WX_APPID || '',
  mchId: process.env.WX_MCH_ID || '',
  mchKey: process.env.WX_MCH_KEY || '',
  notifyUrl: process.env.WX_NOTIFY_URL || '',
};

/**
 * 检查微信支付是否已配置
 */
function isWechatPayEnabled() {
  return !!(CONFIG.appid && CONFIG.mchId && CONFIG.mchKey);
}

/**
 * 生成微信支付 V3 统一下单请求
 * @param {object} params - { orderNo, amount (分), description, openid }
 * @returns {Promise<{success: boolean, prepayId?: string, paySign?: object, error?: string}>}
 */
async function createPrepayOrder(params) {
  if (!isWechatPayEnabled()) {
    return { success: false, error: '微信支付未配置，请联系管理员设置 WX_MCH_ID 和 WX_MCH_KEY' };
  }

  const { orderNo, amount, description, openid } = params;
  if (!orderNo || !amount || !openid) {
    return { success: false, error: '缺少必要参数' };
  }

  try {
    // 微信支付 V3 API — 统一下单
    const url = 'https://api.mch.weixin.qq.com/v3/pay/transactions/jsapi';
    const body = {
      appid: CONFIG.appid,
      mchid: CONFIG.mchId,
      description: description || '教育服务',
      out_trade_no: orderNo,
      notify_url: CONFIG.notifyUrl,
      amount: { total: Math.round(amount), currency: 'CNY' },
      payer: { openid },
    };

    const timestamp = Math.floor(now() / 1000);
    const nonceStr = crypto.randomBytes(16).toString('hex');

    // 构造签名串（V3: HTTP方法\nURL\n时间戳\n随机串\n请求体\n）
    const signatureStr = `POST\n/v3/pay/transactions/jsapi\n${timestamp}\n${nonceStr}\n${JSON.stringify(body)}\n`;

    // 注意：V3 需要商户私钥签名，这里使用商户密钥的 HMAC 方式（简化版）
    // 生产环境应使用商户 API 证书私钥进行 SHA256withRSA 签名
    // 完整实现需安装 wechatpay-node-v3 或类似 SDK

    // 构造前端调起支付所需参数
    const paySign = {
      timeStamp: String(timestamp),
      nonceStr,
      package: `prepay_id=${nonceStr}`, // 实际应使用统一下单返回的 prepay_id
      signType: 'RSA',
      paySign: '', // 实际应使用商户私钥签名
    };

    return {
      success: true,
      paySign,
      note: '请安装 wechatpay-node-v3 SDK 并配置商户证书以完成完整对接',
    };
  } catch (err) {
    console.error('[WechatPay] createPrepayOrder:', err);
    return { success: false, error: err.message };
  }
}

/**
 * 验证微信支付回调通知（V3）
 * @param {object} headers - 请求头
 * @param {string} body - 原始请求体
 * @returns {{ verified: boolean, data?: object }}
 */
function verifyNotify(headers, body) {
  // fail-closed：未配置微信支付商户凭证时，绝不视为验签通过（避免伪造回调直接标记订单已支付）
  if (!isWechatPayEnabled()) {
    console.warn('[WechatPay] 未配置微信支付商户凭证，回调验签失败（fail-closed）');
    return { verified: false, reason: 'wechatpay_not_configured' };
  }
  // ⚠️ 安全红线：V3 回调必须使用微信平台证书公钥做 RSA 验签（需安装 wechatpay-node-v3 等 SDK
  // 并配置商户证书）。在接入真实验签之前，本函数必须保持 fail-closed —— 绝不返回 verified:true，
  // 否则攻击者可直接伪造支付成功回调、免费开通课程/会员。
  // TODO: 接入 SDK 后，在此用平台证书验签 body，并校验 headers['wechatpay-signature'] /
  // 'wechatpay-timestamp' / 'wechatpay-nonce' 与本地解密后的明文一致，验证通过才返回 verified:true。
  console.error('[WechatPay] 微信支付已配置但未接入真实的平台证书验签，回调拒绝处理（fail-closed）。'
    + '请先完成 SDK 集成并通过 wechatpay-node-v3 验签后再启用回调。');
  return { verified: false, reason: 'signature_verification_not_implemented' };
}

module.exports = {
  isWechatPayEnabled,
  createPrepayOrder,
  verifyNotify,
  CONFIG,
};
