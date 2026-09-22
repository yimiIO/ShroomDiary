<template>
  <div v-if="error" class="alert">{{ error }}</div>
  <div v-else-if="!data" class="loading">正在读取运营摘要…</div>
  <template v-else>
    <section class="metric-grid">
      <article class="metric hero"><span>总用户</span><strong>{{ number(data.users.total) }}</strong><small>近 7 日新增 {{ number(data.users.new_7d) }}</small></article>
      <article class="metric"><span>7 日活跃</span><strong>{{ number(data.users.active7d) }}</strong><small>被暂停 {{ number(data.users.suspended) }}</small></article>
      <article class="metric"><span>Agent 运行</span><strong>{{ number(data.agents.running) }}<i>/{{ number(data.agents.active) }}</i></strong><small>连接异常 {{ number(data.agents.disconnected) }}</small></article>
      <article class="metric"><span>AI 调用 · 30D</span><strong>{{ number(data.aiUsage.calls30d) }}</strong><small>估算成本 ¥{{ money(data.aiUsage.costCny30d) }}</small></article>
    </section>
    <section class="split-grid">
      <article class="panel"><div class="panel-head"><div><p class="eyebrow">RELEASE CONTROL</p><h2>功能发布状态</h2></div></div>
        <div class="rows"><div v-for="feature in data.features" :key="feature.feature_key" class="row"><strong>{{ feature.feature_key }}</strong><span :class="['pill', feature.status.toLowerCase()]">{{ feature.status }}</span><small>v{{ feature.version }}</small></div></div>
      </article>
      <article class="panel"><div class="panel-head"><div><p class="eyebrow">SYSTEM SIGNALS</p><h2>服务状态</h2></div></div>
        <div class="signal-grid"><div v-for="(value, key) in data.services" :key="key"><span :class="['dot', value && value !== 'disabled' ? 'on' : 'off']"></span><strong>{{ key }}</strong><small>{{ String(value) }}</small></div></div>
      </article>
    </section>
  </template>
</template>
<script setup>
import { onMounted, ref } from 'vue';
import { readableError, request } from '../api';
const data = ref(null); const error = ref('');
const number = value => Number(value || 0).toLocaleString('zh-CN');
const money = value => Number(value || 0).toFixed(2);
onMounted(async () => { try { data.value = await request('/dashboard'); } catch (caught) { error.value = readableError(caught); } });
</script>
