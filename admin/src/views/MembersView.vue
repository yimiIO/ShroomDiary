<template><p v-if="error" class="alert">{{ error }}</p><section class="panel"><div class="panel-head"><div><p class="eyebrow">ROLE-BASED ACCESS</p><h2>管理员成员</h2></div><button class="primary compact" @click="addMember">添加成员</button></div><table><thead><tr><th>成员</th><th>角色</th><th>状态</th><th>有效会话</th><th></th></tr></thead><tbody><tr v-for="member in members" :key="member.userId"><td><strong>{{ member.nickname || member.mobile }}</strong><small>{{ member.userId }}</small></td><td><select v-model="member.role"><option>OWNER</option><option>OPERATOR</option><option>SUPPORT</option><option>VIEWER</option></select></td><td><select v-model="member.status"><option>ACTIVE</option><option>SUSPENDED</option></select></td><td>{{ member.activeSessions }}</td><td><button class="ghost compact" @click="save(member)">保存</button></td></tr></tbody></table></section></template>
<script setup>
import { onMounted, ref } from 'vue'; import { readableError, request, requireReauth } from '../api';
const members = ref([]); const error = ref('');
async function load() { try { members.value = await request('/members'); } catch (caught) { error.value = readableError(caught); } }
async function persist(userId, role, status) { const reason = prompt('请填写管理员权限变更原因：'); if (!reason) return; try { await requireReauth(); await request(`/members/${userId}`, { method: 'PUT', body: { role, status, reason } }); await load(); } catch (caught) { error.value = readableError(caught); } }
function save(member) { return persist(member.userId, member.role, member.status); }
async function addMember() { const userId = prompt('请输入已有 Shroom 用户的 User ID：'); if (!userId) return; return persist(userId, 'VIEWER', 'ACTIVE'); }
onMounted(load);
</script>
