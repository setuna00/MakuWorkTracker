// 简单的 API 客户端封装
// 与后端同源部署，所以路径直接以 /api 开头

const BASE = ''

async function request(path, options = {}) {
  const res = await fetch(BASE + path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return null
  const ct = res.headers.get('content-type') || ''
  if (ct.includes('application/json')) return res.json()
  return res.text()
}

export const api = {
  // ---- meta ----
  getTypesMeta: () => request('/api/meta/types'),
  getStatuses: () => request('/api/meta/statuses'),

  // ---- works ----
  listWorks: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString()
    return request(`/api/works${q ? '?' + q : ''}`)
  },
  getWork: (id) => request(`/api/works/${id}`),
  createWork: (payload, coverFile) => {
    const fd = new FormData()
    fd.append('payload', JSON.stringify(payload))
    if (coverFile) fd.append('cover', coverFile)
    return fetch('/api/works', { method: 'POST', body: fd })
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t) }))
  },
  updateWork: (id, payload, coverFile) => {
    const fd = new FormData()
    fd.append('payload', JSON.stringify(payload))
    if (coverFile) fd.append('cover', coverFile)
    return fetch(`/api/works/${id}`, { method: 'PATCH', body: fd })
      .then(r => r.ok ? r.json() : r.text().then(t => { throw new Error(t) }))
  },
  deleteWork: (id) => request(`/api/works/${id}`, { method: 'DELETE' }),

  // ---- watchings ----
  createWatching: (workId, data) =>
    request(`/api/works/${workId}/watchings`, { method: 'POST', body: JSON.stringify(data) }),
  updateWatching: (id, data) =>
    request(`/api/watchings/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWatching: (id) =>
    request(`/api/watchings/${id}`, { method: 'DELETE' }),

  // ---- progress ----
  listEntries: (watchingId) => request(`/api/watchings/${watchingId}/entries`),
  createEntry: (watchingId, data) =>
    request(`/api/watchings/${watchingId}/entries`, { method: 'POST', body: JSON.stringify(data) }),
  updateEntry: (id, data) =>
    request(`/api/entries/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteEntry: (id) =>
    request(`/api/entries/${id}`, { method: 'DELETE' }),

  // ---- tags ----
  listTags: () => request('/api/tags'),
  createTag: (data) => request('/api/tags', { method: 'POST', body: JSON.stringify(data) }),
  updateTag: (id, data) => request(`/api/tags/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteTag: (id) => request(`/api/tags/${id}`, { method: 'DELETE' }),

  // ---- collections ----
  listCollections: () => request('/api/collections'),
  createCollection: (data) => request('/api/collections', { method: 'POST', body: JSON.stringify(data) }),
  updateCollection: (id, data) => request(`/api/collections/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteCollection: (id) => request(`/api/collections/${id}`, { method: 'DELETE' }),

  // ---- timeline ----
  getTimeline: (params = {}) => {
    const q = new URLSearchParams(
      Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ).toString()
    return request(`/api/timeline${q ? '?' + q : ''}`)
  },
  getMonthlyOverview: (year, month) =>
    request(`/api/stats/monthly-overview?year=${year}&month=${month}`),
  getRecentActivity: (days = 7, limit = 10) =>
    request(`/api/stats/recent-activity?days=${days}&limit=${limit}`),

  // ---- admin ----
  triggerBackup: () => request('/api/admin/backup', { method: 'POST' }),
  listBackups: () => request('/api/admin/backups'),
  exportJsonUrl: () => '/api/admin/export/json',
  exportCsvUrl: () => '/api/admin/export/csv',
  importJson: (zipFile) => {
    const fd = new FormData()
    fd.append('file', zipFile)
    return fetch('/api/admin/import/json', { method: 'POST', body: fd })
      .then(async (r) => {
        if (!r.ok) throw new Error(await r.text())
        const ct = r.headers.get('content-type') || ''
        return ct.includes('application/json') ? r.json() : null
      })
  },
  getInfo: () => request('/api/admin/info'),
}

// 把后端返回的 cover_path（如 "covers/abc.jpg"）转成可访问 URL
export function coverUrl(relPath) {
  if (!relPath) return null
  return `/data/${relPath}`
}

// 当前用户本地日期（ISO yyyy-mm-dd），用于提交进度记录
export function localToday() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
