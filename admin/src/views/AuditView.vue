<template><section class="toolbar"><input v-model.trim="action" placeholder="按 action 精确筛选" @keyup.enter="load" /><input v-model.trim="targetType" placeholder="按 target type 筛选" @keyup.enter="load" /><button class="primary compact" @click="load">筛选</button></section><p v-if="error" class="alert">{{ error }}</p><section class="panel table-panel"><table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>对象</th><th>原因</th></tr></thead><tbody><tr v-for="item in items" :key="item.id"><td><small>{{ date(item.createdAt) }}</small></td><td><strong>{{ item.actorName || '系统' }}</strong><small>{{ item.actorRole }}</small></td><td><code>{{ item.action }}</code></td><td><strong>{{ item.targetType }}</strong><small>{{ item.targetId }}</small></td><td>{{ item.reason || '—' }}</td></tr></tbody></table><p v-if="!items.length" class="empty">暂无审计记录</p></section></template>
<script setup>
import { onMounted, ref } from 'vue'; import { readableError, request } from '../api';
const items = ref([]); const action = ref(''); const targetType = ref(''); const error = ref('');
const date = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
async function load() { try { const data = await request(`/audit?action=${encodeURIComponent(action.value)}&targetType=${encodeURIComponent(targetType.value)}&pageSize=100`); items.value = data.items; } catch (caught) { error.value = readableError(caught); } }
onMounted(load);
</script>
