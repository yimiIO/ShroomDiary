<template>
  <main v-if="booting" class="center-state"><div class="brand-mark">S</div><p>正在确认管理会话…</p></main>
  <main v-else-if="!session" class="login-shell">
    <section class="login-story">
      <p class="eyebrow">SHROOM OPERATIONS</p>
      <h1>让每一次运营操作<br><em>有边界，有记录。</em></h1>
      <p>正式管理后台与用户端分离，用于用户运营、功能发布、公司 Agent 和审计治理。</p>
      <ul><li>不读取用户日记正文</li><li>高影响操作需二次验证</li><li>变更进入不可覆盖的审计记录</li></ul>
    </section>
    <form class="login-card" @submit.prevent="login">
      <div class="brand-mark">S</div><p class="eyebrow">PRIVATE CONSOLE</p><h2>管理员登录</h2>
      <label>手机号<input v-model.trim="credentials.mobile" autocomplete="username" inputmode="tel" required /></label>
      <label>密码<input v-model="credentials.password" type="password" autocomplete="current-password" required /></label>
      <p v-if="error" class="alert">{{ error }}</p>
      <button class="primary" :disabled="busy">{{ busy ? '正在验证…' : '进入管理后台' }}</button>
    </form>
  </main>
  <div v-else class="app-shell">
    <aside>
      <div class="identity"><div class="brand-mark small">S</div><div><strong>Shroom</strong><span>Operations</span></div></div>
      <nav>
        <button v-for="item in visibleNavigation" :key="item.key" :class="{ active: active === item.key }" @click="active = item.key">
          <span>{{ item.index }}</span>{{ item.label }}
        </button>
      </nav>
      <div class="operator"><span>{{ session.admin.nickname || session.admin.mobile }}</span><small>{{ session.admin.role }}</small><button @click="logout">退出</button></div>
    </aside>
    <section class="workspace">
      <header><div><p class="eyebrow">{{ current.index }} / {{ current.english }}</p><h1>{{ current.label }}</h1></div><button class="ghost" @click="viewKey += 1">刷新</button></header>
      <component :is="current.component" :key="`${active}-${viewKey}`" />
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue';
import { readableError, request } from './api';
import DashboardView from './views/DashboardView.vue';
import UsersView from './views/UsersView.vue';
import FeaturesView from './views/FeaturesView.vue';
import AgentsView from './views/AgentsView.vue';
import MembersView from './views/MembersView.vue';
import AuditView from './views/AuditView.vue';

const navigation = [
  { key: 'dashboard', index: '01', label: '总览', english: 'OVERVIEW', component: DashboardView },
  { key: 'users', index: '02', label: '用户管理', english: 'USERS', component: UsersView },
  { key: 'features', index: '03', label: '功能管理', english: 'FEATURES', component: FeaturesView },
  { key: 'agents', index: '04', label: '公司 Agent', english: 'AGENT COMPANY', component: AgentsView },
  { key: 'members', index: '05', label: '管理员', english: 'ACCESS', component: MembersView, permission: 'members.read' },
  { key: 'audit', index: '06', label: '审计日志', english: 'AUDIT', component: AuditView, permission: 'audit.read' }
];
const booting = ref(true);
const busy = ref(false);
const error = ref('');
const session = ref(null);
const active = ref('dashboard');
const viewKey = ref(0);
const credentials = reactive({ mobile: '', password: '' });
const visibleNavigation = computed(() => navigation.filter(item => !item.permission
  || (session.value?.admin.permissions || []).includes(item.permission)));
const current = computed(() => visibleNavigation.value.find(item => item.key === active.value) || visibleNavigation.value[0]);

async function boot() {
  try { session.value = await request('/session'); } catch (_) { session.value = null; }
  finally { booting.value = false; }
}
async function login() {
  busy.value = true; error.value = '';
  try { session.value = await request('/session/login', { method: 'POST', body: credentials }); credentials.password = ''; }
  catch (caught) { error.value = readableError(caught); }
  finally { busy.value = false; }
}
async function logout() {
  try { await request('/session/logout', { method: 'POST', body: {} }); } catch (_) { /* expire locally */ }
  session.value = null;
}
function unauthorized() { session.value = null; }
onMounted(() => { window.addEventListener('shroom-admin-unauthorized', unauthorized); boot(); });
onUnmounted(() => window.removeEventListener('shroom-admin-unauthorized', unauthorized));
</script>
