const API_ROOT = '/api/admin/v2';

function cookie(name) {
  const prefix = `${name}=`;
  const item = document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
  return item ? decodeURIComponent(item.slice(prefix.length)) : '';
}

export async function request(path, options = {}) {
  const method = options.method || 'GET';
  const headers = { Accept: 'application/json', ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (!['GET', 'HEAD'].includes(method)) headers['x-shroom-admin-csrf'] = cookie('shroom_admin_csrf');
  const response = await fetch(`${API_ROOT}${path}`, {
    ...options,
    method,
    credentials: 'same-origin',
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const payload = await response.json().catch(() => ({ message: '服务响应格式不正确' }));
  if (!response.ok) {
    const error = new Error(payload.message || '请求失败');
    error.status = response.status;
    error.data = payload.data;
    if (response.status === 401) window.dispatchEvent(new CustomEvent('shroom-admin-unauthorized'));
    throw error;
  }
  return payload.data;
}

export async function requireReauth() {
  const password = window.prompt('这是高影响操作，请输入当前管理员密码：');
  if (!password) throw new Error('操作已取消');
  return request('/session/reauth', { method: 'POST', body: { password } });
}

export function readableError(error) {
  return error instanceof Error ? error.message : '操作失败';
}
