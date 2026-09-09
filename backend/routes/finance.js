/**
 * 财务报表路由
 *
 * GET /api/finance/summary     — 收支汇总（总收入、退款、净收入、订单数）
 * GET /api/finance/monthly     — 月度收支明细
 * GET /api/finance/by-product  — 按产品/卡类型统计收入
 * GET /api/finance/by-sales    — 按销售人员统计业绩
 * GET /api/finance/trend       — 收入趋势（按月/按周）
 */
const express = require('express');
const router = express.Router();
const db = require('../db');
const { success, safeFail, isAdminReq } = require('../utils');

// 所有财务接口仅管理员可访问
router.use((req, res, next) => {
  if (!isAdminReq(req)) return res.status(403).json({ code: 403, data: null, message: '仅管理员可查看财务报表' });
  next();
});

/**
 * GET /api/finance/summary — 收支汇总
 * Query: { startDate?, endDate? } 默认本月
 */
// 校验并转换 YYYY-MM-DD 日期；非法值返回 NaN，由调用方回退默认区间
function parseDateParam(v) {
  if (typeof v !== 'string') return NaN;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return NaN;
  const t = new Date(v + 'T00:00:00').getTime();
  return Number.isFinite(t) ? t : NaN;
}

router.get('/summary', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let start, end;
    const startT = startDate ? parseDateParam(startDate) : NaN;
    const endT = endDate ? parseDateParam(endDate) : NaN;
    if (Number.isFinite(startT) && Number.isFinite(endT)) {
      start = startT;
      end = new Date(endDate + 'T23:59:59.999').getTime();
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
    }

    // 已支付订单
    const paidOrders = db.prepare(`
      SELECT COUNT(*) as order_count,
             COALESCE(SUM(payable_amount), 0) as total_revenue,
             COALESCE(SUM(discount_amount), 0) as total_discount,
             COALESCE(SUM(refunded_amount), 0) as total_refunded
      FROM orders
      WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?
    `).get(start, end);

    // 退款总额
    const refunded = db.prepare(`
      SELECT COUNT(*) as refund_count,
             COALESCE(SUM(refunded_amount), 0) as refund_amount
      FROM orders
      WHERE refunded_amount > 0 AND updated_at >= ? AND updated_at <= ?
    `).get(start, end);

    // 按订单类型分组
    const byType = db.prepare(`
      SELECT order_type,
             COUNT(*) as count,
             COALESCE(SUM(payable_amount), 0) as revenue,
             COALESCE(SUM(refunded_amount), 0) as refunded
      FROM orders
      WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?
      GROUP BY order_type
    `).all(start, end);

    // 教师课时费支出（payroll_logs 表可能为空/不存在，需容错）
    // 注意：payroll_logs 当前无任何写入方（师资成本未被计入），netProfit 因此被高估。
    // 以下仅作兜底读取，不改计算逻辑；真实师资成本待 payroll_logs 打通后才会影响净利润。
    let coachPay = { total_pay: 0 };
    try {
      coachPay = db.prepare(`
        SELECT COALESCE(SUM(amount), 0) as total_pay
        FROM payroll_logs
        WHERE paid_at >= ? AND paid_at <= ?
      `).get(start, end) || { total_pay: 0 };
    } catch (e) { /* payroll_logs 表不存在时跳过 */ }

    const netRevenue = (paidOrders.total_revenue || 0) - (refunded.refund_amount || 0);
    const netProfit = netRevenue - (coachPay.total_pay || 0);

    res.json(success({
      period: { start, end },
      revenue: {
        gross: paidOrders.total_revenue || 0,
        discount: paidOrders.total_discount || 0,
        refunded: refunded.refund_amount || 0,
        net: netRevenue,
      },
      orders: {
        paid: paidOrders.order_count || 0,
        refunded: refunded.refund_count || 0,
      },
      expense: {
        coachPay: coachPay.total_pay || 0,
      },
      // 缺口标注：payroll_logs 当前无任何写入方，师资成本尚未计入，净利润被高估
      expenseNote: '师资成本尚未计入（payroll_logs 待打通），当前净利润未扣除教师课时费',
      profit: netProfit,
      byType: byType.map(t => ({
        type: t.order_type || 'other',
        count: t.count,
        revenue: t.revenue,
        refunded: t.refunded,
        net: t.revenue - t.refunded,
      })),
    }));
  } catch (err) {
    console.error('[finance summary]', err);
    res.status(500).json(safeFail('获取财务汇总失败'));
  }
});

/**
 * GET /api/finance/monthly — 月度收支明细
 * Query: { year? } 默认当前年
 */
router.get('/monthly', (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const startMs = new Date(year, 0, 1).getTime();
    const endMs = new Date(year, 11, 31, 23, 59, 59, 999).getTime();

    const months = db.prepare(`
      SELECT
        strftime('%m', datetime(paid_at/1000, 'unixepoch', 'localtime')) as month,
        COUNT(*) as order_count,
        COALESCE(SUM(payable_amount), 0) as revenue,
        COALESCE(SUM(discount_amount), 0) as discount,
        COALESCE(SUM(refunded_amount), 0) as refunded
      FROM orders
      WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?
      GROUP BY month
      ORDER BY month
    `).all(startMs, endMs);

    // 教师课时费支出按月统计（容错：表可能不存在）
    // 同上：payroll_logs 无写入方，coachPay 实际恒为 0，profit 被高估
    let coachPayByMonth = [];
    try {
      coachPayByMonth = db.prepare(`
        SELECT
          strftime('%m', datetime(paid_at/1000, 'unixepoch', 'localtime')) as month,
          COALESCE(SUM(amount), 0) as total_pay
        FROM payroll_logs
        WHERE paid_at >= ? AND paid_at <= ?
        GROUP BY month
      `).all(startMs, endMs);
    } catch (e) { /* payroll_logs 表不存在时跳过 */ }

    // 合并数据
    const payMap = {};
    coachPayByMonth.forEach(p => { payMap[p.month] = p.total_pay; });

    const result = [];
    for (let m = 1; m <= 12; m++) {
      const mm = String(m).padStart(2, '0');
      const data = months.find(d => d.month === mm) || { month: mm, order_count: 0, revenue: 0, discount: 0, refunded: 0 };
      const coachPay = payMap[mm] || 0;
      const net = data.revenue - data.refunded;
      result.push({
        month: mm,
        revenue: data.revenue || 0,
        discount: data.discount || 0,
        refunded: data.refunded || 0,
        netRevenue: net,
        coachPay,
        profit: net - coachPay,
        orderCount: data.order_count || 0,
      });
    }

    const totals = result.reduce((acc, r) => ({
      revenue: acc.revenue + r.revenue,
      discount: acc.discount + r.discount,
      refunded: acc.refunded + r.refunded,
      netRevenue: acc.netRevenue + r.netRevenue,
      coachPay: acc.coachPay + r.coachPay,
      profit: acc.profit + r.profit,
      orderCount: acc.orderCount + r.orderCount,
    }), { revenue: 0, discount: 0, refunded: 0, netRevenue: 0, coachPay: 0, profit: 0, orderCount: 0 });

    res.json(success({ year, months: result, totals, expenseNote: '师资成本尚未计入（payroll_logs 待打通），净利润未扣除教师课时费' }));
  } catch (err) {
    console.error('[finance monthly]', err);
    res.status(500).json(safeFail('获取月度报表失败'));
  }
});

/**
 * GET /api/finance/by-product — 按产品/卡类型统计收入
 * Query: { startDate?, endDate? }
 */
router.get('/by-product', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let start, end;
    const startT = startDate ? parseDateParam(startDate) : NaN;
    const endT = endDate ? parseDateParam(endDate) : NaN;
    if (Number.isFinite(startT) && Number.isFinite(endT)) {
      start = startT;
      end = new Date(endDate + 'T23:59:59.999').getTime();
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), 0, 1).getTime();
      end = now.getTime();
    }

    const list = db.prepare(`
      SELECT
        items,
        payable_amount,
        refunded_amount,
        order_type
      FROM orders
      WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?
    `).all(start, end);

    // 解析订单项目，按产品名聚合；收入按订单实付(payable_amount)分摊，退款按订单行比例分摊
    const productMap = {};
    for (const order of list) {
      let items = [];
      try { items = JSON.parse(order.items || '[]'); } catch (e) { continue; }
      if (!items.length) continue;

      const payable = Number(order.payable_amount) || 0;
      const refunded = Number(order.refunded_amount) || 0;
      const gross = items.reduce((s, it) => s + (Number(it.price) || 0) * (Number(it.quantity) || 1), 0);

      items.forEach((item) => {
        const name = item.itemName || item.name || '未命名';
        if (!productMap[name]) productMap[name] = { name, count: 0, revenue: 0, refunded: 0 };
        const qty = Number(item.quantity) || 1;
        productMap[name].count += qty;

        const itemValue = (Number(item.price) || 0) * qty;
        let revenueShare = 0, refundShare = 0;
        if (gross > 0) {
          const w = itemValue / gross;
          revenueShare = payable * w;
          refundShare = refunded * w;
        } else if (items.length > 0) {
          // 无标价时按项数均分
          revenueShare = payable / items.length;
          refundShare = refunded / items.length;
        }
        productMap[name].revenue += revenueShare;
        productMap[name].refunded += refundShare;
      });
    }

    const result = Object.values(productMap)
      .map(p => ({
        ...p,
        revenue: Math.round(p.revenue),
        refunded: Math.round(p.refunded),
        net: Math.round(p.revenue - p.refunded),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    res.json(success({ list: result, total: result.length }));
  } catch (err) {
    console.error('[finance by-product]', err);
    res.status(500).json(safeFail('获取产品收入统计失败'));
  }
});

/**
 * GET /api/finance/by-sales — 按销售人员统计业绩
 * Query: { startDate?, endDate? }
 */
router.get('/by-sales', (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    let start, end;
    const startT = startDate ? parseDateParam(startDate) : NaN;
    const endT = endDate ? parseDateParam(endDate) : NaN;
    if (Number.isFinite(startT) && Number.isFinite(endT)) {
      start = startT;
      end = new Date(endDate + 'T23:59:59.999').getTime();
    } else {
      const now = new Date();
      start = new Date(now.getFullYear(), 0, 1).getTime();
      end = now.getTime();
    }

    const list = db.prepare(`
      SELECT
        salesperson,
        COUNT(*) as order_count,
        COALESCE(SUM(payable_amount), 0) as revenue,
        COALESCE(SUM(refunded_amount), 0) as refunded,
        COALESCE(SUM(CASE WHEN is_1v1 = 1 THEN 1 ELSE 0 END), 0) as vip_count
      FROM orders
      WHERE status = 'paid' AND paid_at >= ? AND paid_at <= ?
      GROUP BY salesperson
      ORDER BY revenue DESC
    `).all(start, end);

    const result = list.map(s => ({
      salesperson: s.salesperson || '未分配',
      orderCount: s.order_count,
      revenue: s.revenue,
      refunded: s.refunded,
      net: s.revenue - s.refunded,
      vipCount: s.vip_count,
    }));

    res.json(success({ list: result, total: result.length }));
  } catch (err) {
    console.error('[finance by-sales]', err);
    res.status(500).json(safeFail('获取销售业绩失败'));
  }
});

module.exports = router;
