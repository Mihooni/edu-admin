// 循环分页拉取全量数据（后端单页上限 100 条）
// requestFn 需接受 { page, pageSize, ...params } 并返回 { list, total }
export const fetchAllPages = async (requestFn, params = {}, pageSize = 100) => {
  const all = []
  let page = 1
  for (;;) {
    const res = await requestFn({ ...params, page, pageSize })
    const list = res?.list || []
    all.push(...list)
    const total = res?.total != null ? Number(res.total) : all.length
    if (all.length >= total || list.length === 0 || list.length < pageSize) break
    page += 1
  }
  return all
}

export default fetchAllPages
