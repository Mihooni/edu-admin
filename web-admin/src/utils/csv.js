// 轻量 CSV 解析（兼容 BOM / 引号字段 / 换行）
export const parseCsv = (text) => {
  const src = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n')
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += ch
      }
    } else if (ch === '"') {
      inQuotes = true
    } else if (ch === ',') {
      row.push(field.trim())
      field = ''
    } else if (ch === '\n') {
      row.push(field.trim())
      if (row.some((c) => c !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += ch
    }
  }
  row.push(field.trim())
  if (row.some((c) => c !== '')) rows.push(row)
  return rows
}

// 按表头行映射为对象数组（表头匹配中文列名）
export const csvToObjects = (rows, columns) => {
  if (!rows.length) return { objects: [], errors: ['文件为空'] }
  const header = rows[0]
  const indexMap = columns.map((col) => {
    const idx = header.findIndex((h) => h === col.label || h === col.key)
    return idx
  })
  const objects = []
  const errors = []
  rows.slice(1).forEach((cells, ri) => {
    const obj = {}
    columns.forEach((col, ci) => {
      const idx = indexMap[ci]
      obj[col.key] = idx >= 0 ? (cells[idx] ?? '') : ''
    })
    const required = columns.filter((c) => c.required)
    const missing = required.filter((c) => !obj[c.key]?.trim())
    if (missing.length) {
      errors.push(`第 ${ri + 2} 行：缺少必填列「${missing.map((m) => m.label).join('、')}」`)
    } else {
      objects.push(obj)
    }
  })
  return { objects, errors }
}
