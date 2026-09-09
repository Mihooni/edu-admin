// 相对时间（借鉴 trycompai/crm 的 relativeTimeFromIso）
export const relativeTime = (ts) => {
  if (!ts) return '—'
  const n = Number(ts)
  if (Number.isNaN(n)) return String(ts)
  const diff = Date.now() - n
  const min = 60 * 1000
  const hour = 60 * min
  const day = 24 * hour
  if (diff < min) return '刚刚'
  if (diff < hour) return `${Math.floor(diff / min)} 分钟前`
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`
  if (diff < 7 * day) return `${Math.floor(diff / day)} 天前`
  const d = new Date(n)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export const relativeDue = (ts) => {
  if (!ts) return '—'
  const n = Number(ts)
  const diff = n - Date.now()
  const hour = 60 * 60 * 1000
  const day = 24 * hour
  if (diff < 0) return `已逾期 ${relativeTime(n)}`
  if (diff < hour) return `${Math.max(1, Math.round(diff / (60 * 1000)))} 分钟后`
  if (diff < day) return `${Math.round(diff / hour)} 小时后`
  if (diff < 7 * day) return `${Math.round(diff / day)} 天后`
  const d = new Date(n)
  return `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** 会员卡“不限有效期”哨兵时间戳（2100-01-01，次数卡无期限时使用） */
export const CARD_NO_EXPIRY_TS = 4102444800000

export const isCardNoExpiry = (ts) => !!ts && Number(ts) >= CARD_NO_EXPIRY_TS

export const formatCardExpiry = (ts) => {
  if (!ts) return '—'
  if (isCardNoExpiry(ts)) return '不限'
  const d = new Date(Number(ts))
  if (Number.isNaN(d.getTime())) return '—'
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
