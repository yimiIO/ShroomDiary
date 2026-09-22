<template>
  <p v-if="error" class="alert">{{ error }}</p>
  <p v-if="secret" class="secret"><strong>Runner Token 只显示一次</strong><code>{{ secret }}</code><button @click="copySecret">复制</button><button @click="secret = ''">已保存</button></p>
  <div v-if="company" class="agent-layout">
    <section class="panel agent-list">
      <div class="panel-head"><div><p class="eyebrow">ORGANIZATION</p><h2>部门与 Agent</h2></div><button class="ghost compact" @click="createAgent">新增 Agent</button></div>
      <div v-for="department in company.departments" :key="department.key" class="department">
        <h3>{{ department.name }}</h3><p>{{ department.mission }}</p>
        <button v-for="agent in department.agents" :key="agent.key" :class="['agent-item', { selected: selected?.key === agent.key }]" @click="select(agent)">
          <span :class="['dot', agent.runtimeState === 'ERROR' ? 'off' : agent.runtimeState === 'DISCONNECTED' ? '' : 'on']"></span>
          <strong>{{ agent.name }}</strong><small>{{ agent.status }} · {{ agent.runtimeState }}</small>
        </button>
      </div>
    </section>
    <section v-if="selected" class="panel agent-editor">
      <p class="eyebrow">{{ selected.key }}</p><div class="panel-head"><h2>{{ selected.name }}</h2><span :class="['pill', selected.status.toLowerCase()]">{{ selected.status }}</span></div>
      <div class="form-grid">
        <label>名称<input v-model="selected.name" /></label><label>级别<input v-model="selected.level" /></label>
        <label>状态<select v-model="selected.status"><option>ACTIVE</option><option>PAUSED</option><option>BLOCKED</option><option>ARCHIVED</option></select></label>
        <label>执行器<select v-model="selected.executorType"><option>MANUAL</option><option>CODEX_AUTOMATION</option><option>SERVICE_WORKER</option></select></label>
        <label class="wide">当前焦点<textarea v-model="selected.currentFocus" rows="3"></textarea></label>
        <label class="wide">调度说明<input v-model="selected.schedule" placeholder="例：每天 09:00 Asia/Shanghai" /></label>
      </div>
      <div class="button-row"><button class="primary" @click="saveAgent">保存配置</button><button class="ghost" @click="command('RUN')">立即运行</button><button class="ghost" @click="command(selected.status === 'ACTIVE' ? 'PAUSE' : 'RESUME')">{{ selected.status === 'ACTIVE' ? '暂停' : '恢复' }}</button><button class="ghost" @click="createCredential">创建 Runner 凭据</button></div>
      <dl><dt>运行状态</dt><dd>{{ selected.runtimeState }}</dd><dt>最近心跳</dt><dd>{{ date(selected.lastHeartbeatAt) }}</dd><dt>最近结果</dt><dd>{{ selected.lastResultState || '—' }}</dd><dt>版本</dt><dd>{{ selected.version }}</dd></dl>
      <h3>Runner 凭据</h3><div class="rows"><div v-for="item in credentials" :key="item.id" class="row"><strong>{{ item.name }}</strong><small>{{ item.revoked_at ? '已撤销' : `最近使用 ${date(item.last_used_at)}` }}</small><button v-if="!item.revoked_at" class="link" @click="revokeCredential(item)">撤销</button></div><p v-if="!credentials.length" class="empty">尚未创建 Runner 凭据</p></div>
    </section>
  </div>
  <section v-if="company" class="panel execution-panel">
    <div class="panel-head"><div><p class="eyebrow">EXECUTION TRACE</p><h2>最近执行</h2></div></div>
    <table><thead><tr><th>Agent</th><th>触发</th><th>状态</th><th>结果证据</th><th>开始时间</th></tr></thead><tbody><tr v-for="run in company.executions" :key="run.id"><td>{{ run.agent_key }}</td><td>{{ run.trigger_type }}</td><td><span :class="['pill', run.status === 'SUCCEEDED' ? 'active' : run.status === 'FAILED' ? 'paused' : 'beta']">{{ run.status }}</span></td><td>{{ run.result_state || '—' }}</td><td><small>{{ date(run.started_at) }}</small></td></tr></tbody></table>
  </section>
  <div v-if="company" class="split-grid">
    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">DEPARTMENT EVIDENCE</p><h2>部门日报</h2></div><button class="ghost compact" @click="recordRun">记录日报</button></div>
      <div class="rows"><div v-for="run in company.departmentRuns.slice(0, 12)" :key="run.id" class="row"><div><strong>{{ departmentName(run.department_key) }}</strong><small>{{ String(run.run_date).slice(0, 10) }} · {{ run.completed_work || '未记录完成事项' }}</small></div><span :class="['pill', run.safety_status === 'STOP' ? 'paused' : 'active']">{{ run.result_state }}</span><small>{{ run.safety_status }}</small></div></div>
    </section>
    <section class="panel">
      <div class="panel-head"><div><p class="eyebrow">CEO DECISIONS</p><h2>待决策事项</h2></div><button class="ghost compact" @click="createDecision">新建决策</button></div>
      <div class="rows"><div v-for="item in company.decisions.slice(0, 12)" :key="item.id" class="row"><div><strong>{{ item.title }}</strong><small>{{ item.recommendation || item.why_now }}</small></div><span :class="['pill', item.status === 'PENDING' ? 'beta' : 'active']">{{ item.status }}</span><button v-if="item.status === 'PENDING'" class="link" @click="resolveDecision(item)">处理</button></div></div>
    </section>
  </div>
  <section v-if="company" class="panel execution-panel" data-testid="acquisition-funnel">
    <div class="panel-head"><div><p class="eyebrow">ACQUISITION</p><h2>获客与首次价值激活</h2></div><small>只显示聚合数，不读取日记正文</small></div>
    <table><thead><tr><th>活动</th><th>访客 / 访问</th><th>注册</th><th>首次日记</th><th>首次反思</th><th>首次价值激活</th><th>七日回访</th></tr></thead><tbody><tr v-for="campaign in company.acquisition" :key="campaign.content_code"><td><strong>{{ campaign.name }}</strong><small>{{ campaign.content_code }}</small></td><td>{{ campaign.visitors }} / {{ campaign.visits }}</td><td>{{ campaign.registrations }}</td><td>{{ campaign.first_diaries }}</td><td>{{ campaign.first_reflections }}</td><td>{{ campaign.activations }}</td><td>{{ campaign.seven_day_returns }}</td></tr></tbody></table>
  </section>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue';
import { readableError, request, requireReauth } from '../api';

const company = ref(null); const selected = ref(null); const error = ref(''); const secret = ref('');
const credentials = computed(() => (company.value?.runnerCredentials || []).filter(item => item.agent_key === selected.value?.key));
const date = value => value ? new Date(value).toLocaleString('zh-CN') : '—';
const departmentName = key => company.value?.departments.find(item => item.key === key)?.name || key;
function select(agent) { selected.value = agent ? { ...agent, capabilities: [...(agent.capabilities || [])], runtimeConfig: { ...(agent.runtimeConfig || {}) } } : null; }
async function load(keepKey) { try { company.value = await request('/company'); const all = company.value.departments.flatMap(d => d.agents); select(all.find(a => a.key === keepKey) || all[0] || null); } catch (caught) { error.value = readableError(caught); } }
async function saveAgent() { const reason = prompt('请填写 Agent 配置变更原因：'); if (!reason) return; try { const a = selected.value; await request(`/company/agents/${a.key}`, { method: 'PATCH', body: { name: a.name, level: a.level, status: a.status, executorType: a.executorType, currentFocus: a.currentFocus, schedule: a.schedule, version: a.version, reason } }); await load(a.key); } catch (caught) { error.value = readableError(caught); } }
async function command(value) { const reason = prompt(`请填写 ${value} 指令原因：`); if (!reason) return; try { await request(`/company/agents/${selected.value.key}/commands`, { method: 'POST', body: { command: value, reason } }); await load(selected.value.key); } catch (caught) { error.value = readableError(caught); } }
async function createCredential() { const reason = prompt('请填写创建 Runner 凭据的原因：'); if (!reason) return; try { await requireReauth(); const data = await request(`/company/agents/${selected.value.key}/credentials`, { method: 'POST', body: { name: `${selected.value.key} runner`, reason } }); secret.value = data.token; await load(selected.value.key); } catch (caught) { error.value = readableError(caught); } }
async function revokeCredential(item) { const reason = prompt('请填写撤销 Runner 凭据的原因：'); if (!reason) return; try { await requireReauth(); await request(`/company/agents/${selected.value.key}/credentials/${item.id}`, { method: 'DELETE', body: { reason } }); await load(selected.value.key); } catch (caught) { error.value = readableError(caught); } }
async function createAgent() { const key = prompt('Agent 唯一 key（小写字母、数字、连字符）：'); if (!key) return; const name = prompt('Agent 名称：'); if (!name) return; const departmentKey = prompt('所属部门 key：', company.value.departments[0]?.key || ''); if (!departmentKey) return; const reason = prompt('创建原因：'); if (!reason) return; try { await request('/company/agents', { method: 'POST', body: { key, name, departmentKey, reason } }); await load(key); } catch (caught) { error.value = readableError(caught); } }
async function recordRun() { const departmentKey = prompt('部门 key：', company.value.departments[0]?.key || ''); if (!departmentKey) return; const completedWork = prompt('本次完成了什么：') || ''; const evidence = prompt('可检查的证据：') || ''; const resultState = prompt('结果状态 OUTPUT / VERIFIED / REAL_WORLD / NONE：', 'OUTPUT') || 'NONE'; const reason = prompt('记录原因：'); if (!reason) return; try { await request('/company/runs', { method: 'POST', body: { departmentKey, completedWork, evidence, resultState: resultState.toUpperCase(), flywheelStage: 'PRIVATE_VALUE', safetyStatus: 'PASS', reason } }); await load(selected.value?.key); } catch (caught) { error.value = readableError(caught); } }
async function createDecision() { const departmentKey = prompt('部门 key：', company.value.departments[0]?.key || ''); if (!departmentKey) return; const title = prompt('需要 CEO 决定什么：'); if (!title) return; const recommendation = prompt('建议选择：') || ''; const reason = prompt('创建原因：'); if (!reason) return; try { await request('/company/decisions', { method: 'POST', body: { departmentKey, title, recommendation, reason } }); await load(selected.value?.key); } catch (caught) { error.value = readableError(caught); } }
async function resolveDecision(item) { const status = (prompt('决策结果 APPROVED / REJECTED / ADJUSTED / DEFERRED：', 'APPROVED') || '').toUpperCase(); if (!status) return; const resolutionNote = prompt('决策说明：') || ''; const reason = prompt('决策原因：'); if (!reason) return; try { await requireReauth(); await request(`/company/decisions/${item.id}`, { method: 'PATCH', body: { status, resolutionNote, reason } }); await load(selected.value?.key); } catch (caught) { error.value = readableError(caught); } }
async function copySecret() { await navigator.clipboard.writeText(secret.value); }
onMounted(() => load());
</script>
