<template>
  <section class="toolbar"><input v-model.trim="query" placeholder="手机号、昵称或 User ID" @keyup.enter="load" /><select v-model="status" @change="load"><option value="">全部状态</option><option>ACTIVE</option><option>SUSPENDED</option></select><button class="primary compact" @click="load">查询</button></section>
  <p v-if="error" class="alert">{{ error }}</p>
  <div class="master-detail">
    <section class="panel table-panel"><table><thead><tr><th>用户</th><th>状态</th><th>记录</th><th>最近登录</th></tr></thead><tbody><tr v-for="user in users" :key="user.id" :class="{ selected: selected?.user.id === user.id }" @click="selectUser(user.id)"><td><strong>{{ user.nickname || '未设置昵称' }}</strong><small>{{ user.mobile }}</small></td><td><span :class="['pill', user.accountStatus.toLowerCase()]">{{ user.accountStatus }}</span></td><td><small>日记 {{ user.diaryCount }} · AI {{ user.aiCallCount }}</small></td><td><small>{{ date(user.lastLoginAt) }}</small></td></tr></tbody></table><p v-if="!users.length" class="empty">没有匹配用户</p></section>
    <aside v-if="selected" class="panel detail-panel"><p class="eyebrow">USER OPERATIONS</p><h2>{{ selected.user.nickname || '未设置昵称' }}</h2><code>{{ selected.user.id }}</code><dl><dt>手机号</dt><dd>{{ selected.user.mobile }}</dd><dt>账号状态</dt><dd>{{ selected.user.accountStatus }}</dd><dt>日记 / 菇卡</dt><dd>{{ selected.summary.diaries }} / {{ selected.summary.cards }}</dd><dt>AI 调用</dt><dd>{{ selected.summary.aiCalls }}</dd><dt>菇点</dt><dd>{{ selected.summary.paidPoints + selected.summary.rewardPoints }}</dd></dl>
      <div class="button-row"><button class="danger" @click="changeStatus(selected.user.accountStatus === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE')">{{ selected.user.accountStatus === 'ACTIVE' ? '暂停账号' : '恢复账号' }}</button><button class="ghost" @click="revokeSessions">注销会话</button></div>
      <h3>功能单用户授权</h3><div class="inline-form"><select v-model="grant.featureKey"><option value="compound">复利进度</option><option value="inquiries">问题发现</option><option value="wellbeing">生活状态</option></select><select v-model="grant.access"><option>ALLOW</option><option>DENY</option></select><button class="ghost" @click="saveGrant">应用</button></div>
      <div class="rows"><div v-for="item in selected.featureGrants" :key="item.id" class="row"><strong>{{ item.feature_key }}</strong><span :class="['pill', item.access === 'ALLOW' ? 'active' : 'paused']">{{ item.access }}</span><button class="link" @click="revokeGrant(item)">撤销</button></div></div>
    </aside>
  </div>
</template>
<script setup>
import { onMounted, reactive, ref } from 'vue';
import { readableError, request, requireReauth } from '../api';
const users = ref([]); const selected = ref(null); const query = ref(''); const status = ref(''); const error = ref('');
const grant = reactive({ featureKey: 'compound', access: 'ALLOW' });
const date = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
async function load() { try { error.value = ''; const data = await request(`/users?query=${encodeURIComponent(query.value)}&status=${status.value}&pageSize=50`); users.value = data.items; } catch (caught) { error.value = readableError(caught); } }
async function selectUser(id) { try { selected.value = await request(`/users/${id}`); } catch (caught) { error.value = readableError(caught); } }
async function highImpact(callback) { try { await requireReauth(); await callback(); } catch (caught) { error.value = readableError(caught); } }
async function changeStatus(nextStatus) { const reason = prompt(`请填写${nextStatus === 'ACTIVE' ? '恢复' : '暂停'}账号的原因：`); if (!reason) return; await highImpact(async () => { await request(`/users/${selected.value.user.id}/status`, { method: 'PATCH', body: { status: nextStatus, reason } }); await selectUser(selected.value.user.id); await load(); }); }
async function revokeSessions() { const reason = prompt('请填写注销用户会话的原因：'); if (!reason) return; await highImpact(async () => { await request(`/users/${selected.value.user.id}/sessions/revoke`, { method: 'POST', body: { reason } }); await selectUser(selected.value.user.id); }); }
async function saveGrant() { const reason = prompt('请填写单用户授权原因：'); if (!reason) return; await highImpact(async () => { await request(`/features/${grant.featureKey}/grants`, { method: 'POST', body: { userId: selected.value.user.id, access: grant.access, reason } }); await selectUser(selected.value.user.id); }); }
async function revokeGrant(item) { const reason = prompt('请填写撤销原因：'); if (!reason) return; await highImpact(async () => { await request(`/features/${item.feature_key}/grants/${item.id}`, { method: 'DELETE', body: { reason } }); await selectUser(selected.value.user.id); }); }
onMounted(load);
</script>
