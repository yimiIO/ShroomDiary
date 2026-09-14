<template>
	<view class="finance-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="page-shell">
			<view class="topbar">
				<button class="round-button" aria-label="返回" @tap="goBack">‹</button>
				<view><text class="kicker">FINANCIAL COMPOUND</text><text class="page-title">{{ data.thread.title || '财务本金复利' }}</text></view>
				<view class="private-mark"><view></view><text>仅自己</text></view>
			</view>

			<view v-if="loading" class="state-card"><view class="loading-dot"></view><text>正在读取私人台账</text></view>
			<view v-else-if="loadError" class="state-card error"><text>{{ loadError }}</text><button class="dark-button" @tap="load">重新读取</button></view>

			<template v-else>
				<view class="boundary-strip"><text>记录与核算，不是投资建议</text><text>{{ data.boundary }}</text></view>

				<view v-if="!data.profile || editor === 'PROFILE'" class="setup-card">
					<view class="section-head"><view><text class="kicker">{{ data.profile ? 'PLAN SETTINGS' : 'START CLEAR' }}</text><text>{{ data.profile ? '调整计划设置' : '先定义这笔长期资金' }}</text></view><button v-if="data.profile" @tap="closeEditor">×</button></view>
					<text class="setup-copy">先确定范围和记录起点。金额可以暂空，不完整时系统会明确显示“暂不能计算”。</text>
					<label class="field"><text>计划目的</text><textarea v-model="profileDraft.purpose" maxlength="600" auto-height placeholder="例如：为未来选择权积累一部分长期资金" /></label>

					<view class="choice-field"><text>计划范围</text><view><button :class="{ active: profileDraft.scopeType === 'PARTIAL' }" @tap="profileDraft.scopeType = 'PARTIAL'">一部分长期资金</button><button :class="{ active: profileDraft.scopeType === 'ALL_LONG_TERM' }" @tap="profileDraft.scopeType = 'ALL_LONG_TERM'">全部长期投资</button></view></view>
					<view class="choice-field"><text>从哪里开始记</text><view><button :class="{ active: profileDraft.trackingMode === 'FROM_NOW' }" @tap="profileDraft.trackingMode = 'FROM_NOW'">从现在开始</button><button :class="{ active: profileDraft.trackingMode === 'HISTORY' }" @tap="profileDraft.trackingMode = 'HISTORY'">补录历史</button><button :class="{ active: profileDraft.trackingMode === 'PLAN_ONLY' }" @tap="profileDraft.trackingMode = 'PLAN_ONLY'">先建计划</button></view></view>
					<view class="choice-field"><text>预计使用期限</text><view><button :class="{ active: profileDraft.horizonStatus === 'UNDECIDED' }" @tap="profileDraft.horizonStatus = 'UNDECIDED'; profileDraft.expectedUseOn = ''">尚未确定</button><button :class="{ active: profileDraft.horizonStatus === 'TARGET_DATE' }" @tap="profileDraft.horizonStatus = 'TARGET_DATE'">目标日期</button></view></view>
					<view v-if="profileDraft.horizonStatus === 'TARGET_DATE'" class="field"><text>预计使用日期</text><picker mode="date" :value="profileDraft.expectedUseOn" @change="setDate('profileDraft', 'expectedUseOn', $event)"><view class="date-input">{{ profileDraft.expectedUseOn || '选择日期' }}</view></picker></view>
					<label class="field"><text>主要记账币种</text><input v-model="profileDraft.baseCurrency" maxlength="3" placeholder="CNY" /></label>
					<view class="choice-field"><text>投入方式</text><view><button v-for="option in contributionOptions" :key="option.value" :class="{ active: profileDraft.contributionMethod === option.value }" @tap="profileDraft.contributionMethod = option.value">{{ option.label }}</button></view></view>
					<view class="choice-field"><text>生活与经营周转资金</text><view><button :class="{ active: profileDraft.reserveStatus === 'RESERVED' }" @tap="profileDraft.reserveStatus = 'RESERVED'">已预留</button><button :class="{ active: profileDraft.reserveStatus === 'PENDING' }" @tap="profileDraft.reserveStatus = 'PENDING'">待确认</button><button :class="{ active: profileDraft.reserveStatus === 'UNSPECIFIED' }" @tap="profileDraft.reserveStatus = 'UNSPECIFIED'">暂不填写</button></view></view>
					<label class="field"><text>第一项核对行动</text><textarea v-model="profileDraft.firstAction" maxlength="500" auto-height placeholder="例如：确认今天纳入计划的资产总额" /></label>

					<view class="privacy-box"><text>敏感财务数据处理说明</text><text>精确金额、持有名称和用户规则将使用加密字段保存，仅当前账号可访问，不进入发现。不要填写银行卡、证券账户、密码或验证码。</text></view>
					<checkbox-group v-if="!data.profile" class="consent" @change="changeSensitiveConsent"><label><checkbox value="accepted" :checked="profileDraft.sensitiveDataConsent" color="#172019" /><text>我单独同意 Shroom 为建立私人财务台账处理我主动填写的金额与持有信息。</text></label></checkbox-group>
					<button class="primary" :disabled="saving || !canSaveProfile" @tap="saveProfile">{{ saving ? '正在加密保存…' : (data.profile ? '保存计划设置' : '建立私人台账') }}</button>
				</view>

				<template v-if="data.profile && editor !== 'PROFILE'">
					<view class="tabs"><button v-for="tab in tabs" :key="tab.value" :class="{ active: activeTab === tab.value }" @tap="activeTab = tab.value; closeEditor()">{{ tab.label }}</button></view>

					<view v-if="activeTab === 'OVERVIEW'" class="tab-view">
						<view class="overview-hero">
							<text class="kicker">{{ data.overview.asOfDate ? 'DATA AS OF ' + data.overview.asOfDate : 'WAITING FOR BASELINE' }}</text>
							<text class="overview-title">{{ data.overview.canCalculate ? '资产变化，来自哪里' : '先补齐能核算的事实' }}</text>
							<text>{{ data.overview.canCalculate ? '投入和投资损益已经分开呈现。' : '至少需要两个日期的计划总资产快照，以及期间的外部资金进出。' }}</text>
							<text>本计划仅覆盖你主动纳入的资产，不代表你的全部财产。</text>
							<view v-if="data.overview.pendingCount" class="pending-pill">{{ data.overview.pendingCount }} 项待核对</view>
						</view>

						<view v-if="!data.overview.currencies.length" class="empty-card"><text>还没有金额记录</text><text>可以先录入今天的计划总资产，也可以只保留计划，稍后再补。</text><button @tap="openSnapshot">记录起点资产</button></view>
						<view v-for="item in data.overview.currencies" :key="item.currency" class="currency-card">
							<view class="currency-head"><view><text>{{ item.currency }}</text><text>{{ item.latest ? '截至 ' + item.latest.date : '暂无最新市值' }}</text></view><text v-if="item.investmentPnl === null">暂不能计算</text><text v-else :class="item.investmentPnlTone">{{ signedMoney(item.investmentPnl, item.currency) }}</text></view>
							<view class="metric-grid">
								<view><text>期初资产</text><text>{{ item.opening ? formatMoney(item.opening.amount, item.currency) : '待补' }}</text></view>
								<view><text>跟踪期净投入</text><text>{{ formatMoney(item.netContribution, item.currency) }}</text></view>
								<view><text>最新资产价值</text><text>{{ item.latest ? formatMoney(item.latest.amount, item.currency) : '待补' }}</text></view>
								<view><text>投资损益</text><text v-if="item.investmentPnl !== null" :class="item.investmentPnlTone">{{ signedMoney(item.investmentPnl, item.currency) }}</text><text v-else>暂不能计算</text></view>
							</view>
							<view v-if="item.annualizedReturn !== null" class="detail-metric"><text>资金加权年化（XIRR）</text><text>{{ item.annualizedReturn }}%</text><small v-if="item.annualizedShortPeriod">短期折算，不代表已实现一整年收益或未来预期</small></view>
							<view v-if="item.missing.length" class="missing-list"><text v-for="(missing, index) in item.missing" :key="index">— {{ missing }}</text></view>
						</view>

						<view class="execution-card" :class="executionClass"><view><text>按自己的规则执行</text><text v-if="data.execution.ruleVersion">规则 v{{ data.execution.ruleVersion }}</text></view><text>{{ data.execution.message }}</text><view v-if="data.execution.planned" class="execution-numbers"><text>本期计划 {{ formatMoney(data.execution.planned, data.execution.currency) }}</text><text>已确认 {{ formatMoney(data.execution.actual, data.execution.currency) }}</text><text>偏差 {{ signedMoney(data.execution.deviation, data.execution.currency) }}</text></view></view>

						<view class="quick-actions"><button @tap="openRecord"><text>＋</text><view><text>资金事件</text><text>投入、取出、转移或费用</text></view></button><button @tap="openSnapshot"><text>◎</text><view><text>市值快照</text><text>某一天整个计划值多少</text></view></button><button @tap="openReview"><text>↗</text><view><text>月度核对</text><text>事实、解释与待处理分开</text></view></button></view>
						<view v-if="data.reviews.length" class="section-card"><view class="section-head"><view><text class="kicker">LAST REVIEW</text><text>最近一次核对</text></view></view><view class="review-row"><text>{{ data.reviews[0].scopeStart }} — {{ data.reviews[0].scopeEnd }}</text><text>{{ data.reviews[0].userExplanation || '只保存了当期核算事实' }}</text></view></view>
					</view>

					<view v-if="activeTab === 'RECORDS'" class="tab-view">
						<view class="action-row"><button @tap="openRecord">记资金事件</button><button @tap="openSnapshot">记市值快照</button><button v-if="data.features.aiImportEnabled" @tap="openImport">粘贴旧表 / 文字</button></view>
						<view v-if="!data.features.aiImportEnabled" class="ai-disabled-note">AI 财务文本整理暂未开放；手动记录和核算不受影响。</view>
						<view class="definition-note"><text>资金事件 ≠ 市值快照</text><text>余额增加不等于新增投入；账户总额与下属产品明细也不会同时加总。</text></view>
						<view class="section-card"><view class="section-head"><view><text class="kicker">MONEY EVENTS</text><text>资金事件</text></view><text>{{ data.records.length }}</text></view><view v-if="!data.records.length" class="inline-empty">还没有资金事件</view><view v-for="item in data.records" :key="item.id" class="ledger-row"><view><text>{{ recordLabel(item.recordType) }}</text><text>{{ item.occurredOn }} · {{ statusLabel(item.status) }}</text><view v-if="editableStatus(item.status)" class="row-actions"><button @tap="editRecord(item)">{{ item.status === 'DRAFT' ? '核对' : '更正' }}</button><button @tap="voidRecord(item)">作废</button></view></view><view><text>{{ formatMoney(amountFrom(item), item.currency) }}</text><text>{{ item.payload.sourceCategory || item.payload.channelLabel || item.payload.note || '未填写来源' }}</text></view></view></view>
						<view class="section-card"><view class="section-head"><view><text class="kicker">VALUATION SNAPSHOTS</text><text>计划总资产快照</text></view><text>{{ data.snapshots.length }}</text></view><view v-if="!data.snapshots.length" class="inline-empty">还没有市值快照</view><view v-for="item in data.snapshots" :key="item.id" class="ledger-row"><view><text>{{ item.snapshotKind === 'PLAN_TOTAL' ? '计划总资产' : '持有明细' }}</text><text>{{ item.valuedOn }} · {{ statusLabel(item.status) }}</text><view v-if="editableStatus(item.status)" class="row-actions"><button @tap="editSnapshot(item)">{{ item.status === 'DRAFT' ? '核对' : '更正' }}</button><button @tap="voidSnapshot(item)">作废</button></view></view><view><text>{{ formatMoney(amountFrom(item), item.currency) }}</text><text>{{ item.payload.coverage || '按当日确认范围' }}</text></view></view></view>
						<view v-if="data.notes.length" class="section-card"><view class="section-head"><view><text class="kicker">DECISION CONTEXT</text><text>当时的判断与决定</text></view><button @tap="openNote">＋</button></view><view v-for="item in data.notes" :key="item.id" class="note-row"><text>{{ item.decidedOn }} · {{ item.noteType === 'DECISION' ? '决定' : '判断' }}</text><text>{{ item.body }}</text><small>这是用户当时的记录，不是系统验证结论</small></view></view>
					</view>

					<view v-if="activeTab === 'HOLDINGS'" class="tab-view">
						<view class="action-row"><button @tap="openHolding">增加持有明细</button><button @tap="openAlias">设置别名映射</button></view>
						<view class="definition-note"><text>渠道、产品和投资方向分开</text><text>基金或账户数量增加不等于风险已经分散；没有底层资料时，系统不会猜测产品方向或精确重叠率。</text></view>
						<view v-if="data.holdings.mixedDates" class="warning-card">当前明细来自不同日期，只能视为基于最近记录的结构估算。</view>
						<view class="holding-total"><view v-for="total in data.holdings.totals" :key="total.currency"><text>已分类持有</text><text>{{ formatMoney(total.amount, total.currency) }}</text></view></view>
						<view v-if="data.holdings.directions && data.holdings.directions.length" class="section-card"><view class="section-head"><view><text class="kicker">EXPOSURE DIRECTIONS</text><text>按投资方向合并</text></view></view><view v-for="item in data.holdings.directions" :key="item.key" class="direction-row"><view><text>{{ item.label }}</text><text>{{ item.itemCount }} 项 · {{ item.channelCount }} 个渠道</text></view><view><text>{{ formatMoney(item.amount, item.currency) }}</text><text>{{ item.percent }}%</text></view></view></view>
						<view v-if="data.holdings.products && data.holdings.products.length" class="section-card"><view class="section-head"><view><text class="kicker">PRODUCT VIEW</text><text>按实际产品合并</text></view></view><view v-for="item in data.holdings.products" :key="item.key" class="direction-row"><view><text>{{ item.label }}</text><text>{{ item.channels.length }} 个渠道{{ item.shareClassLabel }}</text></view><view><text>{{ formatMoney(item.amount, item.currency) }}</text><text>{{ item.percent }}%</text></view></view></view>
						<view class="section-card"><view class="section-head"><view><text class="kicker">WHAT YOU HOLD</text><text>当前持有结构</text></view><text>{{ data.holdings.items.length }}</text></view><view v-if="!data.holdings.items.length" class="inline-empty">还没有持有明细；可以只做计划级核算，不强迫逐笔记交易。</view><view v-for="item in data.holdings.items" :key="item.id" class="holding-row"><view class="holding-top"><view><text>{{ item.payload.productName || item.payload.directionName || '待识别产品' }}</text><text>{{ item.payload.channelLabel || '未填渠道' }} · {{ item.valuedOn }}</text></view><view><text>{{ formatMoney(item.amount, item.currency) }}</text><text v-if="item.percent !== null">{{ item.percent }}%</text></view></view><view class="holding-tags"><text>{{ item.payload.directionName || '方向待核实' }}</text><text v-if="item.payload.shareClass">{{ item.payload.shareClass }} 份额</text><text v-if="item.payload.category">{{ item.payload.category }}</text><text>{{ classificationLabel(item.classificationStatus) }}</text><text v-if="item.payload.userMaxPercent !== null && item.payload.userMaxPercent !== undefined">自设上限 {{ item.payload.userMaxPercent }}%</text><text v-if="item.limitDeviation !== null" class="limit-warning">超过自设上限 {{ item.limitDeviation }} 个百分点</text><button @tap="editHolding(item)">更正</button><button @tap="voidHolding(item)">作废</button></view></view></view>
						<view v-if="data.aliases.length" class="section-card"><view class="section-head"><view><text class="kicker">ALIASES</text><text>别名映射</text></view></view><view v-for="item in data.aliases" :key="item.id" class="alias-row"><text>{{ item.sourceAlias }}</text><text>→</text><text>{{ item.productName || item.directionName }}</text><small>{{ item.batchScope ? '仅批次 ' + item.batchScope : '本计划持续生效' }}</small></view></view>
					</view>

					<view v-if="activeTab === 'PLAN'" class="tab-view">
						<view class="plan-summary"><text class="kicker">LONG-TERM PLAN</text><text>{{ data.profile.purpose || data.thread.title }}</text><view><text>{{ scopeLabel(data.profile.scopeType) }}</text><text>{{ trackingLabel(data.profile.trackingMode) }}</text><text>{{ horizonLabel(data.profile) }}</text><text>{{ data.profile.baseCurrency }}</text></view><button @tap="editProfile">调整计划设置</button></view>
						<view class="action-row"><button @tap="openRule">{{ data.rules.length ? '修订投入规则' : '建立投入规则' }}</button><button @tap="openNote">记录当时判断</button></view>
						<view class="section-card"><view class="section-head"><view><text class="kicker">RULE VERSIONS</text><text>执行规则</text></view><text>{{ data.rules.length }}</text></view><view v-if="!data.rules.length" class="inline-empty">规则由你制定；系统不会预填收益率、仓位或品种建议。</view><view v-for="item in data.rules" :key="item.id" class="rule-row"><view><text>v{{ item.version }} · {{ contributionLabel(item.contributionMethod) }}</text><text>{{ item.effectiveOn }} 生效</text></view><text>{{ ruleDescription(item) }}</text><small v-if="item.changeReason">调整原因：{{ item.changeReason }}</small></view></view>
						<view v-if="data.notes.length" class="section-card"><view class="section-head"><view><text class="kicker">DECISION LOG</text><text>判断与决定</text></view></view><view v-for="item in data.notes" :key="item.id" class="note-row"><text>{{ item.decidedOn }} · {{ item.noteType === 'DECISION' ? '决定' : '判断' }}</text><text>{{ item.body }}</text><small>用户当时记录，不代表系统验证</small></view></view>
						<view v-if="data.legacy.recordCount" class="legacy-note"><text>旧版历史仍在</text><text>{{ data.legacy.note }} 共 {{ data.legacy.recordCount }} 条旧进展记录。</text></view>
						<view class="privacy-box"><text>隐私与数据权利</text><text>{{ data.privacy.notice }} {{ data.features.aiImportEnabled ? 'AI 只在你主动粘贴并授权整理时使用；普通核算不调用 AI。' : '当前不向第三方 AI 发送财务文本。' }}</text><view><button @tap="exportPlan">导出本计划</button><button v-if="data.profile.aiProcessingConsentAt" @tap="revokeAiConsent">撤回 AI 授权</button><button class="danger-link" @tap="openDelete">删除财务台账</button></view></view>
					</view>

					<view v-if="editor" class="editor-card">
						<view class="section-head"><view><text class="kicker">CONFIRM FACTS</text><text>{{ editorTitle }}</text></view><button @tap="closeEditor">×</button></view>

						<template v-if="editor === 'RECORD'">
							<view class="choice-field"><text>记录类型</text><view><button v-for="option in recordOptions" :key="option.value" :class="{ active: recordDraft.recordType === option.value }" @tap="recordDraft.recordType = option.value">{{ option.label }}</button></view></view>
							<view class="field"><text>发生日期</text><picker mode="date" :value="recordDraft.occurredOn" @change="setDate('recordDraft', 'occurredOn', $event)"><view class="date-input">{{ recordDraft.occurredOn }}</view></picker></view><view class="money-fields"><label class="field"><text>金额</text><input v-model="recordDraft.amount" type="digit" placeholder="0.00" /></label><label class="field currency"><text>币种</text><input v-model="recordDraft.currency" maxlength="3" /></label></view>
							<label class="field"><text>来源或性质</text><input v-model="recordDraft.sourceCategory" maxlength="80" placeholder="工资、经营结余、计划内现金、已有储蓄等" /></label><label class="field"><text>渠道简称（可选）</text><input v-model="recordDraft.channelLabel" maxlength="120" placeholder="只写自定义简称，不写账号" /></label><label class="field"><text>备注（可选）</text><textarea v-model="recordDraft.note" maxlength="1200" auto-height placeholder="只记录已发生事实" /></label>
							<checkbox-group class="consent" @change="recordDraft.paidOutsidePlan = checkboxValue($event)"><label><checkbox value="accepted" :checked="recordDraft.paidOutsidePlan" color="#172019" /><text>这笔费用或税费由计划外另行支付（仅费用/税费适用）</text></label></checkbox-group>
							<label v-if="recordDraft.editingId" class="field"><text>修改依据</text><textarea v-model="recordDraft.revisionReason" maxlength="600" auto-height placeholder="为什么需要更正原记录" /></label>
							<button class="primary" :disabled="saving || !recordDraft.amount || !recordDraft.sourceCategory" @tap="saveRecord">{{ recordDraft.recordType === 'UNCERTAIN' ? '保存为待核对记录' : '确认事实并入账' }}</button>
						</template>

						<template v-if="editor === 'SNAPSHOT'">
							<view class="field"><text>估值日期</text><picker mode="date" :value="snapshotDraft.valuedOn" @change="setDate('snapshotDraft', 'valuedOn', $event)"><view class="date-input">{{ snapshotDraft.valuedOn }}</view></picker></view><view class="money-fields"><label class="field"><text>计划总资产价值</text><input v-model="snapshotDraft.amount" type="digit" placeholder="0.00" /></label><label class="field currency"><text>币种</text><input v-model="snapshotDraft.currency" maxlength="3" /></label></view><label class="field"><text>覆盖范围</text><input v-model="snapshotDraft.coverage" maxlength="240" placeholder="例如：本计划全部已纳入资产及现金" /></label><label v-if="snapshotDraft.editingId" class="field"><text>修改依据</text><textarea v-model="snapshotDraft.revisionReason" maxlength="600" auto-height /></label><view class="warning-card">快照按当日结束时理解。同日发生的资金事件已包含在快照里，不会重复计入；下属持有明细也不会与总额相加。</view><button class="primary" :disabled="saving || snapshotDraft.amount === ''" @tap="saveSnapshot">确认这一天的总资产</button>
						</template>

						<template v-if="editor === 'HOLDING'">
							<view class="field"><text>数据日期</text><picker mode="date" :value="holdingDraft.valuedOn" @change="setDate('holdingDraft', 'valuedOn', $event)"><view class="date-input">{{ holdingDraft.valuedOn }}</view></picker></view><view class="money-fields"><label class="field"><text>当前金额</text><input v-model="holdingDraft.amount" type="digit" placeholder="0.00" /></label><label class="field currency"><text>币种</text><input v-model="holdingDraft.currency" maxlength="3" /></label></view><label class="field"><text>渠道简称</text><input v-model="holdingDraft.channelLabel" maxlength="120" placeholder="例如：mky；不要填写账号" /></label><label class="field"><text>产品名称</text><input v-model="holdingDraft.productName" maxlength="160" placeholder="不确定时可以留空" /></label><label class="field"><text>投资方向</text><input v-model="holdingDraft.directionName" maxlength="160" placeholder="例如：恒生科技相关资产；不确定时留空" /></label><label class="field"><text>份额类别 / 资产分类（可选）</text><input v-model="holdingDraft.shareClass" maxlength="80" placeholder="例如：A类" /><input v-model="holdingDraft.category" maxlength="120" placeholder="例如：权益类；由用户填写" /></label><label class="field"><text>你自己设定的占比上限（可选）</text><input v-model="holdingDraft.userMaxPercent" type="digit" placeholder="系统不会替你设值" /></label><label v-if="holdingDraft.editingId" class="field"><text>修改依据</text><textarea v-model="holdingDraft.revisionReason" maxlength="600" auto-height /></label><button class="primary" :disabled="saving || holdingDraft.amount === ''" @tap="saveHolding">确认持有明细</button>
						</template>

						<template v-if="editor === 'ALIAS'">
							<label class="field"><text>原始别名</text><input v-model="aliasDraft.sourceAlias" maxlength="120" placeholder="例如：mky" /></label><label class="field"><text>对应产品（可选）</text><input v-model="aliasDraft.productName" maxlength="160" /></label><label class="field"><text>对应投资方向（可选）</text><input v-model="aliasDraft.directionName" maxlength="160" /></label><label class="field"><text>仅作用于某次导入（可选）</text><input v-model="aliasDraft.batchScope" maxlength="80" placeholder="留空则在本计划持续生效" /></label><view class="warning-card">别名归类只改变展示，不改变原始金额，也不代表币种、重复关系已经确认。</view><button class="primary" :disabled="saving || !aliasDraft.sourceAlias || (!aliasDraft.productName && !aliasDraft.directionName)" @tap="saveAlias">保存别名映射</button>
						</template>

						<template v-if="editor === 'RULE'">
							<view class="choice-field"><text>投入方式</text><view><button v-for="option in contributionOptions" :key="option.value" :class="{ active: ruleDraft.contributionMethod === option.value }" @tap="ruleDraft.contributionMethod = option.value">{{ option.label }}</button></view></view><view class="field"><text>生效日期</text><picker mode="date" :value="ruleDraft.effectiveOn" @change="setDate('ruleDraft', 'effectiveOn', $event)"><view class="date-input">{{ ruleDraft.effectiveOn }}</view></picker></view><template v-if="ruleDraft.contributionMethod === 'FIXED'"><label class="field"><text>每期固定金额</text><input v-model="ruleDraft.fixedAmount" type="digit" placeholder="由你设定" /></label><view class="choice-field"><text>投入周期</text><view><button v-for="option in frequencyOptions" :key="option.value" :class="{ active: ruleDraft.frequency === option.value }" @tap="ruleDraft.frequency = option.value">{{ option.label }}</button></view></view></template><label v-if="ruleDraft.contributionMethod === 'SURPLUS_RATIO'" class="field"><text>可投资结余比例</text><input v-model="ruleDraft.surplusRatio" type="digit" placeholder="0—100" /></label><label v-if="ruleDraft.contributionMethod === 'BATCHED_LUMP_SUM'" class="field"><text>分批总预算</text><input v-model="ruleDraft.totalBudget" type="digit" placeholder="由你设定" /></label><label class="field"><text>收益实际如何处理</text><input v-model="ruleDraft.returnDisposition" maxlength="120" placeholder="基金内累积、计划内现金、再次买入、转出或待确认" /></label><label class="field"><text>你的使用约束或上限（可选）</text><textarea v-model="ruleDraft.userLimits" maxlength="800" auto-height placeholder="系统只核对你自己设定的规则" /></label><label v-if="data.rules.length" class="field"><text>本次调整原因</text><textarea v-model="ruleDraft.changeReason" maxlength="600" auto-height /></label><button class="primary" :disabled="saving || !canSaveRule" @tap="saveRule">保存为新规则版本</button>
						</template>

						<template v-if="editor === 'NOTE'">
							<view class="field"><text>记录日期</text><picker mode="date" :value="noteDraft.decidedOn" @change="setDate('noteDraft', 'decidedOn', $event)"><view class="date-input">{{ noteDraft.decidedOn }}</view></picker></view><view class="choice-field"><text>性质</text><view><button :class="{ active: noteDraft.noteType === 'JUDGMENT' }" @tap="noteDraft.noteType = 'JUDGMENT'">当时判断</button><button :class="{ active: noteDraft.noteType === 'DECISION' }" @tap="noteDraft.noteType = 'DECISION'">实际决定</button></view></view><label class="field"><text>内容</text><textarea v-model="noteDraft.body" maxlength="2400" auto-height placeholder="可以保存你自己的宏观、估值或资金流判断；系统不会把它变成买卖指令" /></label><label class="field"><text>当时依据（可选）</text><textarea v-model="noteDraft.evidence" maxlength="1200" auto-height /></label><button class="primary" :disabled="saving || !noteDraft.body" @tap="saveNote">保存当时记录</button>
						</template>

						<template v-if="editor === 'REVIEW'">
							<view class="choice-field"><text>回看频率</text><view><button :class="{ active: reviewDraft.reviewType === 'MONTHLY' }" @tap="reviewDraft.reviewType = 'MONTHLY'">月度核对</button><button :class="{ active: reviewDraft.reviewType === 'QUARTERLY' }" @tap="reviewDraft.reviewType = 'QUARTERLY'">季度回看</button></view></view><view class="money-fields"><view class="field"><text>开始日期</text><picker mode="date" :value="reviewDraft.scopeStart" @change="setDate('reviewDraft', 'scopeStart', $event)"><view class="date-input">{{ reviewDraft.scopeStart }}</view></picker></view><view class="field"><text>结束日期</text><picker mode="date" :value="reviewDraft.scopeEnd" @change="setDate('reviewDraft', 'scopeEnd', $event)"><view class="date-input">{{ reviewDraft.scopeEnd }}</view></picker></view></view><label class="field"><text>你对本期偏离或变化的解释</text><textarea v-model="reviewDraft.userExplanation" maxlength="1800" auto-height /></label><label class="field"><text>待确认问题（一行一项）</text><textarea v-model="reviewDraft.pendingQuestions" maxlength="1200" auto-height /></label><label class="field"><text>下一步最多 3 个核对行动</text><textarea v-model="reviewDraft.nextActions" maxlength="900" auto-height placeholder="核对记录、确认预算或补充资料；不要写交易指令" /></label><view class="warning-card">核算由确定性计算引擎完成，这一步不会调用 AI。</view><button class="primary" :disabled="saving" @tap="saveReview">确认本期核对</button>
						</template>

						<template v-if="editor === 'IMPORT'">
							<label class="field"><text>粘贴旧表或自然语言</text><textarea v-model="importText" maxlength="20000" auto-height placeholder="例如：2026-09-10 转入5000元；当日计划总资产86470元。请先删除账号、密码和验证码。" /></label><checkbox-group v-if="!data.features.aiConsentCurrent" class="consent" @change="importConsent = checkboxValue($event)"><label><checkbox value="accepted" :checked="importConsent" color="#172019" /><text>我单独同意将本次文本发送给 {{ data.features.aiProcessorName }} 生成待确认草稿；未经确认不会入账。我可以在“计划”中撤回后续授权。</text></label></checkbox-group><button v-if="!importDraft" class="primary" :disabled="saving || !importText || (!data.features.aiConsentCurrent && !importConsent)" @tap="prepareImport">{{ saving ? '正在整理…' : '生成待确认草稿' }}</button>
							<view v-if="importDraft" class="import-result"><view v-if="importDraft.ambiguities.length" class="warning-card"><text>需要你确认</text><text v-for="(item,index) in importDraft.ambiguities" :key="index">— {{ item }}</text></view><view v-if="importDraft.ignoredIntentions.length" class="ignored-box"><text>没有当作实际记录</text><text v-for="(item,index) in importDraft.ignoredIntentions" :key="index">— {{ item }}</text></view><checkbox-group class="candidate-list" @change="changeImportSelection"><label v-for="item in importDraft.candidates" :key="item.id"><checkbox :value="item.id" color="#172019" /><view><text>{{ candidateKind(item) }} · {{ item.recordType ? recordLabel(item.recordType) : '' }}</text><text>{{ item.valuedOn || item.occurredOn }} · {{ formatMoney(item.amount, item.currency) }}</text><small>{{ item.productName || item.channelLabel || item.note || '字段由你确认' }} · {{ confidenceLabel(item.confidence) }}</small></view></label></checkbox-group><view v-if="!importDraft.candidates.length" class="inline-empty">没有发现足以形成金额记录的已发生事实。你可以关闭后手动补录。</view><button v-if="importDraft.candidates.length" class="primary" :disabled="saving || !importCandidateIds.length" @tap="confirmImport">确认选中项并入账</button></view>
						</template>

						<template v-if="editor === 'DELETE'">
							<view class="danger-box"><text>这会删除什么</text><text>本计划下的财务设置、金额记录、市值快照、持有、别名、规则、AI 草稿和回看摘要都会删除；原复利计划本身和旧版历史进展保留。</text></view><label class="field"><text>输入“删除财务台账”确认</text><input v-model="deleteConfirm" maxlength="20" /></label><button class="primary danger" :disabled="saving || deleteConfirm !== '删除财务台账'" @tap="deleteLedger">确认永久删除</button>
						</template>
					</view>
				</template>
			</template>
		</view>
	</view>
</template>

<script>
import {
	financialAiConsent, financialAliases, financialDelete, financialExport, financialHoldings,
	financialHolding, financialImportConfirm, financialImportDrafts, financialNotes, financialPlan,
	financialPlanProfile, financialRecord, financialRecords, financialReviews, financialRules,
	financialSnapshot, financialSnapshots
} from '@/api/compound-system';

function pad(value) { return String(value).padStart(2, '0'); }
function localDate(value) { const date = value ? new Date(value) : new Date(); return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()); }
function monthStart() { return localDate().slice(0, 7) + '-01'; }
function requestId() { return Date.now() + '-' + Math.random().toString(36).slice(2, 12); }
function emptyData() { return { thread: { title: '' }, profile: null, overview: { asOfDate: null, pendingCount: 0, currencies: [], canCalculate: false }, execution: { status: 'NO_RULE', message: '' }, records: [], snapshots: [], holdings: { items: [], totals: [], products: [], directions: [], mixedDates: false }, aliases: [], rules: [], notes: [], reviews: [], legacy: { recordCount: 0, note: '' }, privacy: { notice: '' }, features: { aiImportEnabled: false, aiProcessorName: '', aiConsentCurrent: false }, boundary: '' }; }
function newProfile() { return { purpose: '', scopeType: 'PARTIAL', trackingMode: 'PLAN_ONLY', baseCurrency: 'CNY', horizonStatus: 'UNDECIDED', expectedUseOn: '', reserveStatus: 'UNSPECIFIED', contributionMethod: 'UNSET', firstAction: '', sensitiveDataConsent: false }; }
function newRecord(currency) { return { editingId: '', revisionReason: '', recordType: 'EXTERNAL_CONTRIBUTION', occurredOn: localDate(), amount: '', currency: currency || 'CNY', sourceCategory: '', channelLabel: '', note: '', paidOutsidePlan: false, clientRequestId: requestId() }; }
function newSnapshot(currency) { return { editingId: '', revisionReason: '', snapshotKind: 'PLAN_TOTAL', valuedOn: localDate(), amount: '', currency: currency || 'CNY', coverage: '本计划全部已纳入资产及现金', clientRequestId: requestId() }; }
function newHolding(currency) { return { editingId: '', revisionReason: '', valuedOn: localDate(), amount: '', currency: currency || 'CNY', channelLabel: '', productName: '', directionName: '', shareClass: '', category: '', userMaxPercent: '', classificationStatus: 'USER_ENTERED', clientRequestId: requestId() }; }
function newRule(method) { return { contributionMethod: method || 'UNSET', effectiveOn: localDate(), decidedOn: localDate(), currency: 'CNY', fixedAmount: '', frequency: 'MONTHLY', surplusRatio: '', totalBudget: '', returnDisposition: '尚未确认', userLimits: '', changeReason: '' }; }

export default {
	data() {
		return {
			statusBarHeight: 0, threadId: '', loading: true, saving: false, loadError: '', data: emptyData(),
			activeTab: 'OVERVIEW', editor: '', profileDraft: newProfile(), recordDraft: newRecord(), snapshotDraft: newSnapshot(), holdingDraft: newHolding(), aliasDraft: { sourceAlias: '', productName: '', directionName: '', batchScope: '' }, ruleDraft: newRule(), noteDraft: { decidedOn: localDate(), noteType: 'JUDGMENT', body: '', evidence: '' }, reviewDraft: { reviewType: 'MONTHLY', scopeStart: monthStart(), scopeEnd: localDate(), userExplanation: '', pendingQuestions: '', nextActions: '' }, importText: '', importConsent: false, importDraft: null, importCandidateIds: [], deleteConfirm: '',
			tabs: [{ value: 'OVERVIEW', label: '概览' }, { value: 'RECORDS', label: '记录' }, { value: 'HOLDINGS', label: '持有' }, { value: 'PLAN', label: '计划' }],
			contributionOptions: [{ value: 'FIXED', label: '固定金额' }, { value: 'SURPLUS_RATIO', label: '按结余比例' }, { value: 'BATCHED_LUMP_SUM', label: '一次资金分批' }, { value: 'FLEXIBLE', label: '自主不定期' }, { value: 'UNSET', label: '暂不设金额' }],
			frequencyOptions: [{ value: 'MONTHLY', label: '每月' }, { value: 'QUARTERLY', label: '每季度' }, { value: 'YEARLY', label: '每年' }],
			recordOptions: [{ value: 'EXTERNAL_CONTRIBUTION', label: '外部投入' }, { value: 'EXTERNAL_WITHDRAWAL', label: '外部取出' }, { value: 'INTERNAL_TRANSFER', label: '内部转移' }, { value: 'BUY', label: '买入' }, { value: 'SELL', label: '卖出' }, { value: 'DIVIDEND', label: '分红' }, { value: 'INTEREST', label: '利息' }, { value: 'RETURN_REINVESTMENT', label: '收益再投入' }, { value: 'FEE', label: '费用' }, { value: 'TAX', label: '税费' }, { value: 'EXISTING_ASSET_INCLUSION', label: '存量资产纳入' }, { value: 'UNCERTAIN', label: '金额性质待确认' }]
		};
	},
	computed: {
		canSaveProfile() { return Boolean(this.profileDraft.purpose.trim() && this.profileDraft.firstAction.trim() && (this.data.profile || this.profileDraft.sensitiveDataConsent) && (this.profileDraft.horizonStatus !== 'TARGET_DATE' || this.profileDraft.expectedUseOn)); },
		canSaveRule() {
			if (!this.ruleDraft.effectiveOn || (this.data.rules.length && !this.ruleDraft.changeReason.trim())) return false;
			if (this.ruleDraft.contributionMethod === 'FIXED') return Boolean(this.ruleDraft.fixedAmount && this.ruleDraft.frequency);
			if (this.ruleDraft.contributionMethod === 'SURPLUS_RATIO') return this.ruleDraft.surplusRatio !== '';
			if (this.ruleDraft.contributionMethod === 'BATCHED_LUMP_SUM') return Boolean(this.ruleDraft.totalBudget);
			return true;
		},
		editorTitle() { return { RECORD: '记录资金事件', SNAPSHOT: '记录市值快照', HOLDING: '增加持有明细', ALIAS: '确认别名映射', RULE: '保存一版自己的规则', NOTE: '留下当时判断', REVIEW: '完成一次低频核对', IMPORT: 'AI 生成可确认草稿', DELETE: '删除本计划的财务数据' }[this.editor] || ''; },
		executionClass() { return String(this.data.execution.status || '').toLowerCase(); }
	},
	onLoad(query) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.threadId = query.id || ''; this.load(); },
	methods: {
		async load() { if (!this.threadId) { this.loading = false; this.loadError = '缺少财务计划标识'; return; } this.loading = true; this.loadError = ''; try { const response = await this.$http.get(financialPlan(this.threadId)); this.data = { ...emptyData(), ...(response.data || {}) }; if (!this.data.profile) this.profileDraft = { ...newProfile(), purpose: this.data.thread.desiredOutcome || this.data.thread.title || '', firstAction: this.data.thread.currentStep || '' }; } catch (error) { this.loadError = error.message || '私人台账暂时没有读到'; } finally { this.loading = false; } },
		editProfile() { const item = this.data.profile; this.profileDraft = { ...newProfile(), ...item, sensitiveDataConsent: true }; this.editor = 'PROFILE'; this.scrollTop(); },
		changeSensitiveConsent(event) { this.profileDraft.sensitiveDataConsent = this.checkboxValue(event); },
			checkboxValue(event) { return Boolean(event.detail && event.detail.value && event.detail.value.includes('accepted')); },
			setDate(draftName, fieldName, event) { if (this[draftName] && event.detail && event.detail.value) this[draftName][fieldName] = event.detail.value; },
		async saveProfile() { if (this.saving || !this.canSaveProfile) return; this.saving = true; try { await this.$http.put(financialPlanProfile(this.threadId), this.profileDraft); this.editor = ''; await this.load(); uni.showToast({ title: '私人台账已建立', icon: 'success' }); } catch (error) { uni.showToast({ title: error.message || '计划设置没有保存', icon: 'none' }); } finally { this.saving = false; } },
		baseCurrency() { return (this.data.profile && this.data.profile.baseCurrency) || 'CNY'; },
		openRecord() { this.recordDraft = newRecord(this.baseCurrency()); this.editor = 'RECORD'; this.scrollTop(); },
		openSnapshot() { this.snapshotDraft = newSnapshot(this.baseCurrency()); this.editor = 'SNAPSHOT'; this.scrollTop(); },
		openHolding() { this.holdingDraft = newHolding(this.baseCurrency()); this.editor = 'HOLDING'; this.scrollTop(); },
		openAlias() { this.aliasDraft = { sourceAlias: '', productName: '', directionName: '', batchScope: '' }; this.editor = 'ALIAS'; this.scrollTop(); },
		openRule() { this.ruleDraft = { ...newRule(this.data.profile.contributionMethod), currency: this.baseCurrency() }; this.editor = 'RULE'; this.scrollTop(); },
		openNote() { this.noteDraft = { decidedOn: localDate(), noteType: 'JUDGMENT', body: '', evidence: '' }; this.editor = 'NOTE'; this.scrollTop(); },
		openReview() { this.reviewDraft = { reviewType: 'MONTHLY', scopeStart: monthStart(), scopeEnd: localDate(), userExplanation: '', pendingQuestions: '', nextActions: '' }; this.editor = 'REVIEW'; this.scrollTop(); },
			openImport() { if (!this.data.features.aiImportEnabled) return uni.showToast({ title: '财务 AI 整理尚未开放', icon: 'none' }); this.importText = ''; this.importConsent = false; this.importDraft = null; this.importCandidateIds = []; this.editor = 'IMPORT'; this.scrollTop(); },
		openDelete() { this.deleteConfirm = ''; this.editor = 'DELETE'; this.scrollTop(); },
		closeEditor() { this.editor = ''; this.importDraft = null; this.importCandidateIds = []; },
		editRecord(item) { this.recordDraft = { ...newRecord(item.currency), ...item.payload, editingId: item.id, revisionReason: '', recordType: item.recordType, occurredOn: item.occurredOn, amount: this.amountFrom(item), currency: item.currency }; this.editor = 'RECORD'; this.scrollTop(); },
		editSnapshot(item) { this.snapshotDraft = { ...newSnapshot(item.currency), ...item.payload, editingId: item.id, revisionReason: '', snapshotKind: item.snapshotKind, valuedOn: item.valuedOn, amount: this.amountFrom(item), currency: item.currency }; this.editor = 'SNAPSHOT'; this.scrollTop(); },
		editHolding(item) { this.holdingDraft = { ...newHolding(item.currency), ...item.payload, editingId: item.id, revisionReason: '', valuedOn: item.valuedOn, amount: item.amount, currency: item.currency, classificationStatus: item.classificationStatus }; this.editor = 'HOLDING'; this.scrollTop(); },
		async saveRecord() { await this.submit(this.recordDraft.editingId ? financialRecord(this.threadId, this.recordDraft.editingId) : financialRecords(this.threadId), { ...this.recordDraft, confirmed: true }, '资金记录已确认', this.recordDraft.editingId ? 'patch' : 'post'); },
		async saveSnapshot() { await this.submit(this.snapshotDraft.editingId ? financialSnapshot(this.threadId, this.snapshotDraft.editingId) : financialSnapshots(this.threadId), { ...this.snapshotDraft, confirmed: true }, '市值快照已确认', this.snapshotDraft.editingId ? 'patch' : 'post'); },
		async saveHolding() { await this.submit(this.holdingDraft.editingId ? financialHolding(this.threadId, this.holdingDraft.editingId) : financialHoldings(this.threadId), { ...this.holdingDraft, confirmed: true }, '持有明细已确认', this.holdingDraft.editingId ? 'patch' : 'post'); },
		async saveAlias() { await this.submit(financialAliases(this.threadId), this.aliasDraft, '别名映射已保存'); },
		async saveRule() { await this.submit(financialRules(this.threadId), this.ruleDraft, '规则版本已保存'); },
		async saveNote() { await this.submit(financialNotes(this.threadId), this.noteDraft, '当时判断已保存'); },
		async saveReview() { await this.submit(financialReviews(this.threadId), this.reviewDraft, '本期核对已保存'); },
		async submit(url, payload, success, method) { if (this.saving) return; this.saving = true; try { if (method === 'patch') await this.$http.patch(url, payload); else await this.$http.post(url, payload); this.editor = ''; await this.load(); uni.showToast({ title: success, icon: 'success' }); } catch (error) { uni.showToast({ title: error.message || '没有保存成功', icon: 'none' }); } finally { this.saving = false; } },
		voidRecord(item) { this.confirmVoid('资金记录', financialRecord(this.threadId, item.id)); },
		voidSnapshot(item) { this.confirmVoid('市值快照', financialSnapshot(this.threadId, item.id)); },
		voidHolding(item) { this.confirmVoid('持有明细', financialHolding(this.threadId, item.id)); },
		confirmVoid(label, url) { uni.showModal({ title: '作废' + label, content: '不会物理删除，原记录和作废原因会继续保留，并立即重算统计。', confirmText: '确认作废', confirmColor: '#8a4b43', success: async result => { if (!result.confirm || this.saving) return; this.saving = true; try { await this.$http.delete(url, { reason: '用户在财务台账页面主动作废' }); await this.load(); } catch (error) { uni.showToast({ title: error.message || '没有作废成功', icon: 'none' }); } finally { this.saving = false; } } }); },
		async prepareImport() { if (this.saving) return; this.saving = true; try { const response = await this.$http.post(financialImportDrafts(this.threadId), { text: this.importText, aiProcessingConsent: this.importConsent }); if (response.data.draft.status !== 'DRAFT') { this.editor = ''; await this.load(); return uni.showToast({ title: '相同内容已处理，没有重复入账', icon: 'none' }); } this.importDraft = response.data.draft; if (response.data.duplicate) uni.showToast({ title: '相同内容没有重复分析', icon: 'none' }); } catch (error) { uni.showToast({ title: error.message || 'AI 草稿没有生成', icon: 'none' }); } finally { this.saving = false; } },
		changeImportSelection(event) { this.importCandidateIds = event.detail.value || []; },
		async confirmImport() { if (!this.importDraft || !this.importCandidateIds.length || this.saving) return; this.saving = true; try { await this.$http.post(financialImportConfirm(this.threadId, this.importDraft.id), { candidateIds: this.importCandidateIds }); this.editor = ''; this.importDraft = null; await this.load(); uni.showToast({ title: '选中事实已入账', icon: 'success' }); } catch (error) { uni.showToast({ title: error.message || '草稿没有确认成功', icon: 'none' }); } finally { this.saving = false; } },
		async exportPlan() {
			if (this.saving) return;
			this.saving = true;
			try {
				const response = await this.$http.get(financialExport(this.threadId));
				const content = JSON.stringify(response.data, null, 2);
				const filename = 'shroom-financial-' + localDate() + '.json';
				// #ifdef H5
				const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
				const url = URL.createObjectURL(blob);
				const link = document.createElement('a');
				link.href = url;
				link.download = filename;
				link.click();
				URL.revokeObjectURL(url);
				// #endif
				// #ifdef MP-WEIXIN
				const filePath = wx.env.USER_DATA_PATH + '/' + filename;
				wx.getFileSystemManager().writeFile({ filePath, data: content, encoding: 'utf8', success: () => { if (wx.shareFileMessage) wx.shareFileMessage({ filePath, fileName: filename }); else uni.showToast({ title: '文件已保存，当前微信版本不支持分享', icon: 'none' }); } });
				// #endif
				// #ifdef APP-PLUS
				plus.io.requestFileSystem(plus.io.PRIVATE_DOC, fs => fs.root.getFile(filename, { create: true }, entry => entry.createWriter(writer => { writer.onwrite = () => uni.showToast({ title: '已保存到应用文档', icon: 'none' }); writer.write(content); })));
				// #endif
			} catch (error) {
				uni.showToast({ title: error.message || '暂时无法导出', icon: 'none' });
			} finally {
				this.saving = false;
			}
		},
			async deleteLedger() { if (this.saving || this.deleteConfirm !== '删除财务台账') return; this.saving = true; try { await this.$http.delete(financialDelete(this.threadId), { confirmText: this.deleteConfirm }); this.editor = ''; await this.load(); uni.showToast({ title: '财务台账已删除', icon: 'success' }); } catch (error) { uni.showToast({ title: error.message || '没有删除成功', icon: 'none' }); } finally { this.saving = false; } },
			revokeAiConsent() { uni.showModal({ title: '撤回 AI 处理授权', content: '撤回后不再允许新的财务文本发送给 AI；已经确认的台账记录不会删除。', confirmText: '确认撤回', confirmColor: '#8a4b43', success: async result => { if (!result.confirm || this.saving) return; this.saving = true; try { await this.$http.put(financialAiConsent(this.threadId), { enabled: false }); await this.load(); uni.showToast({ title: 'AI 授权已撤回', icon: 'success' }); } catch (error) { uni.showToast({ title: error.message || '暂时无法撤回', icon: 'none' }); } finally { this.saving = false; } } }); },
			amountFrom(item) { return item.amount || this.minorMoney(item.payload && item.payload.amountMinor); },
			minorMoney(value) { const raw = String(value === undefined || value === null ? '0' : value); const negative = raw.startsWith('-'); const digits = (negative ? raw.slice(1) : raw).padStart(3, '0'); return (negative ? '-' : '') + digits.slice(0, -2) + '.' + digits.slice(-2); },
			formatMoney(value, currency) { if (value === null || value === undefined || value === '') return '待补'; const raw = String(value).trim().replace(/,/g, ''); const match = raw.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/); if (!match) return String(value); const grouped = match[2].replace(/\B(?=(\d{3})+(?!\d))/g, ','); return (currency || '') + ' ' + match[1] + grouped + '.' + String(match[3] || '').padEnd(2, '0'); },
			signedMoney(value, currency) { const raw = String(value); if (!/^-?\d+(?:\.\d{1,2})?$/.test(raw)) return '暂不能计算'; return (!raw.startsWith('-') && !/^0(?:\.0+)?$/.test(raw) ? '+' : '') + this.formatMoney(raw, currency); },
		recordLabel(value) { const item = this.recordOptions.find(option => option.value === value); return item ? item.label : value; },
			statusLabel(value) { return { DRAFT: '待核对', CONFIRMED: '已核对', SUPERSEDED: '已修订', VOID: '已作废' }[value] || value; },
			editableStatus(value) { return value !== 'SUPERSEDED' && value !== 'VOID'; },
		classificationLabel(value) { return { USER_ENTERED: '用户填写', SOURCE_VERIFIED: '资料确认', UNVERIFIED: '待核实' }[value] || '待核实'; },
			contributionLabel(value) { const item = this.contributionOptions.find(option => option.value === value); return item ? item.label : '暂不设金额'; },
			frequencyLabel(value) { const item = this.frequencyOptions.find(option => option.value === value); return item ? item.label : '每期'; },
		scopeLabel(value) { return value === 'ALL_LONG_TERM' ? '全部长期投资' : '一部分长期资金'; },
		trackingLabel(value) { return { FROM_NOW: '从现在跟踪', HISTORY: '补录历史', PLAN_ONLY: '先建计划' }[value] || value; },
		horizonLabel(profile) { return profile.horizonStatus === 'TARGET_DATE' && profile.expectedUseOn ? '预计使用 ' + profile.expectedUseOn : '期限尚未确定'; },
			ruleDescription(item) { if (item.fixedAmount) return this.frequencyLabel(item.frequency) + ' ' + this.formatMoney(this.minorMoney(item.fixedAmount.amountMinor), item.fixedAmount.currency); if (item.surplusRatio !== null && item.surplusRatio !== undefined) return '按可投资结余的 ' + item.surplusRatio + '%'; if (item.totalBudget) return '分批总预算 ' + this.formatMoney(this.minorMoney(item.totalBudget.amountMinor), item.totalBudget.currency); return '不设固定金额，逐次记录决定和理由'; },
		candidateKind(item) { return { RECORD: '资金事件', SNAPSHOT: '计划总资产', HOLDING: '持有明细' }[item.kind] || item.kind; },
		confidenceLabel(value) { return { HIGH: '字段较明确，仍需确认', MEDIUM: '存在不确定', LOW: '需要仔细核对' }[value] || '需要确认'; },
		scrollTop() { setTimeout(() => uni.pageScrollTo({ scrollTop: 260, duration: 220 }), 40); },
		goBack() { const pages = getCurrentPages(); if (pages.length > 1) uni.navigateBack(); else uni.navigateTo({ url: '/pages/shroom/compound' }); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1.25; }
button::after { border: 0; }
button[disabled] { opacity: .4; }
input, textarea { box-sizing: border-box; width: 100%; color: #172019; font-size: 20rpx; line-height: 1.55; }
.finance-page { min-height: 100vh; background: #f0f6e9; color: #172019; }
.status-bar { background: #f0f6e9; }
.page-shell { box-sizing: border-box; padding: 25rpx 29rpx 150rpx; }
.topbar { display: flex; align-items: center; gap: 17rpx; }
.round-button { display: flex; width: 67rpx; height: 67rpx; flex: 0 0 67rpx; align-items: center; justify-content: center; border: 1rpx solid rgba(23,32,25,.1); border-radius: 50%; background: rgba(255,255,255,.72); font-size: 45rpx; }
.topbar > view:nth-child(2) { display: flex; min-width: 0; flex: 1; flex-direction: column; }
.kicker { color: #748078; font-size: 13rpx; font-weight: 760; letter-spacing: 2rpx; }
.page-title { max-width: 500rpx; margin-top: 4rpx; overflow: hidden; font-family: Georgia, 'Songti SC', serif; font-size: 32rpx; font-weight: 720; text-overflow: ellipsis; white-space: nowrap; }
.private-mark { display: flex; align-items: center; gap: 7rpx; color: #68756b; font-size: 14rpx; }.private-mark view { width: 8rpx; height: 8rpx; border-radius: 50%; background: #55715a; }
.state-card { display: flex; min-height: 300rpx; margin-top: 25rpx; align-items: center; justify-content: center; gap: 13rpx; border-radius: 32rpx; background: #fff; color: #738078; }.state-card.error { flex-direction: column; }.loading-dot { width: 12rpx; height: 12rpx; border-radius: 50%; background: #56715b; animation: pulse 1s infinite alternate; }@keyframes pulse { to { opacity: .25; transform: scale(.7); } }.dark-button { margin-top: 15rpx; padding: 15rpx 25rpx; border-radius: 999rpx; background: #172019; color: #fff; }
.boundary-strip { display: flex; margin-top: 25rpx; padding: 20rpx 22rpx; flex-direction: column; gap: 6rpx; border: 1rpx solid #dfd3b3; border-radius: 20rpx; background: #f8f1df; color: #675d45; }.boundary-strip text:first-child { font-size: 17rpx; font-weight: 730; }.boundary-strip text:last-child { font-size: 14rpx; line-height: 1.55; }
.setup-card, .editor-card, .section-card { margin-top: 22rpx; padding: 29rpx; border-radius: 31rpx; background: #fff; }.section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 15rpx; }.section-head > view { display: flex; flex-direction: column; gap: 5rpx; }.section-head > view text:last-child { font-family: Georgia, 'Songti SC', serif; font-size: 27rpx; font-weight: 700; }.section-head > button { padding: 0 4rpx; color: #748078; font-size: 32rpx; }.section-head > text { color: #7b867e; font-size: 14rpx; }
.setup-copy { display: block; margin-top: 18rpx; color: #657168; font-size: 17rpx; line-height: 1.6; }
.field { display: flex; margin-top: 21rpx; flex-direction: column; gap: 8rpx; }.field > text, .choice-field > text { color: #5e6b61; font-size: 16rpx; font-weight: 680; }.field input, .field textarea, .date-input { box-sizing: border-box; width: 100%; min-height: 68rpx; padding: 17rpx 19rpx; border: 1rpx solid #dfe6dc; border-radius: 17rpx; background: #f8faf6; color: #172019; font-size: 20rpx; line-height: 1.55; }.field textarea { min-height: 92rpx; }.field input + input { margin-top: 9rpx; }
.choice-field { display: flex; margin-top: 21rpx; flex-direction: column; gap: 10rpx; }.choice-field > view { display: flex; gap: 8rpx; flex-wrap: wrap; }.choice-field button { padding: 13rpx 16rpx; border: 1rpx solid #dbe2d9; border-radius: 999rpx; color: #68746b; font-size: 14rpx; }.choice-field button.active { border-color: #526b57; background: #e6eee1; color: #344a39; font-weight: 700; }
.privacy-box { display: flex; margin-top: 23rpx; padding: 20rpx; flex-direction: column; gap: 7rpx; border-radius: 19rpx; background: #edf3e9; color: #58665c; }.privacy-box > text:first-child { font-size: 17rpx; font-weight: 730; }.privacy-box > text:nth-child(2) { font-size: 15rpx; line-height: 1.6; }.privacy-box > view { display: flex; gap: 18rpx; margin-top: 10rpx; }.privacy-box button { color: #3e6046; font-size: 15rpx; font-weight: 700; }.privacy-box button.danger-link { color: #87564f; }
.consent { margin-top: 20rpx; }.consent label { display: flex; align-items: flex-start; gap: 10rpx; color: #5e685f; font-size: 15rpx; line-height: 1.55; }.consent checkbox { flex: 0 0 auto; transform: scale(.8); transform-origin: top left; }
.primary { display: flex; width: 100%; min-height: 72rpx; margin-top: 24rpx; align-items: center; justify-content: center; padding: 17rpx 23rpx; border-radius: 999rpx; background: #172019; color: #fff; font-size: 18rpx; font-weight: 730; }.primary.danger { background: #6f3c35; }
.tabs { display: flex; margin-top: 23rpx; padding: 6rpx; border-radius: 19rpx; background: #e3ebde; }.tabs button { display: flex; min-height: 59rpx; flex: 1; align-items: center; justify-content: center; border-radius: 15rpx; color: #667269; font-size: 16rpx; }.tabs button.active { background: #172019; color: #fff; font-weight: 700; }
.tab-view { margin-top: 21rpx; }.overview-hero { position: relative; display: flex; padding: 34rpx 31rpx; overflow: hidden; flex-direction: column; gap: 9rpx; border-radius: 31rpx; background: #172019; color: #fff; }.overview-hero .kicker { color: #9aa79b; }.overview-title { font-family: Georgia, 'Songti SC', serif; font-size: 31rpx; font-weight: 720; }.overview-hero > text:last-of-type { color: #c1cbc2; font-size: 16rpx; line-height: 1.55; }.pending-pill { align-self: flex-start; margin-top: 8rpx; padding: 8rpx 12rpx; border-radius: 999rpx; background: rgba(255,255,255,.12); color: #d9e0da; font-size: 13rpx; }
.empty-card { display: flex; margin-top: 18rpx; padding: 27rpx; flex-direction: column; gap: 8rpx; border-radius: 25rpx; background: #fff; }.empty-card text:first-child { font-size: 22rpx; font-weight: 720; }.empty-card text:nth-child(2) { color: #6f7a72; font-size: 16rpx; line-height: 1.55; }.empty-card button { align-self: flex-start; margin-top: 8rpx; color: #3d5c43; font-weight: 720; }
.currency-card { margin-top: 17rpx; padding: 27rpx; border-radius: 28rpx; background: #fff; }.currency-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 14rpx; }.currency-head > view { display: flex; flex-direction: column; gap: 5rpx; }.currency-head > view text:first-child { font-size: 22rpx; font-weight: 760; }.currency-head > view text:last-child { color: #818b83; font-size: 13rpx; }.currency-head > text { font-size: 20rpx; font-weight: 720; }
.metric-grid { display: grid; margin-top: 20rpx; grid-template-columns: 1fr 1fr; gap: 10rpx; }.metric-grid view { display: flex; min-width: 0; padding: 17rpx; flex-direction: column; gap: 7rpx; border-radius: 17rpx; background: #f2f6ef; }.metric-grid text:first-child { color: #768279; font-size: 13rpx; }.metric-grid text:last-child { overflow: hidden; font-size: 18rpx; font-weight: 700; text-overflow: ellipsis; white-space: nowrap; }.positive { color: #336943 !important; }.negative { color: #9a4d43 !important; }.neutral { color: #59645b !important; }
.detail-metric { display: grid; margin-top: 15rpx; padding-top: 15rpx; border-top: 1rpx solid #e8ece6; grid-template-columns: 1fr auto; gap: 6rpx 12rpx; }.detail-metric text:first-child { color: #647067; font-size: 14rpx; }.detail-metric text:nth-child(2) { font-size: 18rpx; font-weight: 700; }.detail-metric small { color: #8a918c; font-size: 12rpx; grid-column: 1 / -1; }.missing-list { display: flex; margin-top: 15rpx; flex-direction: column; gap: 5rpx; color: #8b7658; font-size: 14rpx; }
.execution-card { display: flex; margin-top: 17rpx; padding: 23rpx; flex-direction: column; gap: 10rpx; border-radius: 24rpx; background: #f7f1df; color: #655b46; }.execution-card > view:first-child { display: flex; justify-content: space-between; }.execution-card > view:first-child text:first-child { font-size: 18rpx; font-weight: 730; }.execution-card > view:first-child text:last-child { font-size: 13rpx; }.execution-card > text { font-size: 15rpx; line-height: 1.55; }.execution-card.on_plan { background: #e5efe1; color: #425d47; }.execution-card.deviated { background: #f5e8dd; color: #79584b; }.execution-numbers { display: flex; gap: 10rpx; flex-wrap: wrap; }.execution-numbers text { padding: 7rpx 10rpx; border-radius: 999rpx; background: rgba(255,255,255,.55); font-size: 12rpx; }
.quick-actions { display: grid; margin-top: 17rpx; grid-template-columns: 1fr 1fr; gap: 10rpx; }.quick-actions button { display: flex; min-height: 94rpx; align-items: center; gap: 12rpx; padding: 17rpx; border-radius: 21rpx; background: #fff; text-align: left; }.quick-actions button > text { display: flex; width: 35rpx; height: 35rpx; flex: 0 0 35rpx; align-items: center; justify-content: center; border-radius: 50%; background: #e8efe3; color: #4e6753; font-size: 20rpx; }.quick-actions button > view { display: flex; min-width: 0; flex-direction: column; gap: 4rpx; }.quick-actions button > view text:first-child { font-size: 16rpx; font-weight: 710; }.quick-actions button > view text:last-child { color: #778179; font-size: 12rpx; line-height: 1.4; }.quick-actions button:last-child { grid-column: 1 / -1; }
.action-row { display: flex; gap: 8rpx; overflow-x: auto; }.action-row button { flex: 0 0 auto; padding: 14rpx 18rpx; border-radius: 999rpx; background: #172019; color: #fff; font-size: 14rpx; }.ai-disabled-note { margin-top: 12rpx; color: #778179; font-size: 13rpx; }.definition-note, .warning-card, .legacy-note { display: flex; margin-top: 17rpx; padding: 19rpx 21rpx; flex-direction: column; gap: 6rpx; border-radius: 19rpx; background: #f7f1df; color: #6d624b; font-size: 14rpx; line-height: 1.55; }.definition-note text:first-child, .legacy-note text:first-child { font-size: 16rpx; font-weight: 730; }
.inline-empty { padding: 25rpx 0 8rpx; color: #7c867e; font-size: 15rpx; line-height: 1.55; }.ledger-row { display: flex; padding: 18rpx 0; align-items: flex-start; justify-content: space-between; gap: 15rpx; border-top: 1rpx solid #e8ede6; }.ledger-row:first-of-type { margin-top: 14rpx; }.ledger-row > view { display: flex; min-width: 0; flex-direction: column; gap: 5rpx; }.ledger-row > view:last-child { align-items: flex-end; text-align: right; }.ledger-row > view text:first-child { font-size: 16rpx; font-weight: 700; }.ledger-row > view text:last-child { max-width: 330rpx; overflow: hidden; color: #7a847c; font-size: 12rpx; text-overflow: ellipsis; white-space: nowrap; }
.row-actions { display: flex; gap: 12rpx; margin-top: 6rpx; }.row-actions button, .holding-tags button { color: #58705c; font-size: 12rpx; }.row-actions button:last-child, .holding-tags button:last-child { color: #8a5951; }
.holding-total { display: flex; gap: 10rpx; margin-top: 17rpx; }.holding-total view { display: flex; min-width: 0; padding: 18rpx; flex: 1; flex-direction: column; gap: 5rpx; border-radius: 19rpx; background: #172019; color: #fff; }.holding-total text:first-child { color: #99a69a; font-size: 12rpx; }.holding-total text:last-child { font-size: 18rpx; font-weight: 720; }.holding-row { padding: 19rpx 0; border-top: 1rpx solid #e7ece5; }.holding-top { display: flex; justify-content: space-between; gap: 14rpx; }.holding-top > view { display: flex; min-width: 0; flex-direction: column; gap: 5rpx; }.holding-top > view:last-child { align-items: flex-end; }.holding-top text:first-child { font-size: 17rpx; font-weight: 710; }.holding-top text:last-child { color: #7b857d; font-size: 12rpx; }.holding-tags { display: flex; gap: 7rpx; margin-top: 10rpx; flex-wrap: wrap; }.holding-tags text { padding: 6rpx 9rpx; border-radius: 999rpx; background: #edf2ea; color: #68746a; font-size: 11rpx; }.holding-tags text.limit-warning { background: #f4e5df; color: #875247; }.alias-row { display: grid; padding: 15rpx 0; align-items: center; border-top: 1rpx solid #e8ede6; grid-template-columns: 1fr auto 1fr; gap: 8rpx; }.alias-row text:first-child { font-weight: 700; }.alias-row small { color: #89918b; font-size: 11rpx; grid-column: 1 / -1; }
.direction-row { display: flex; padding: 17rpx 0; align-items: flex-start; justify-content: space-between; gap: 14rpx; border-top: 1rpx solid #e8ede6; }.direction-row > view { display: flex; flex-direction: column; gap: 5rpx; }.direction-row > view:last-child { align-items: flex-end; }.direction-row text:first-child { font-size: 16rpx; font-weight: 710; }.direction-row text:last-child { color: #7d877f; font-size: 12rpx; }
.plan-summary { display: flex; padding: 30rpx; flex-direction: column; gap: 9rpx; border-radius: 29rpx; background: #172019; color: #fff; }.plan-summary .kicker { color: #94a196; }.plan-summary > text:nth-child(2) { font-family: Georgia, 'Songti SC', serif; font-size: 27rpx; font-weight: 720; line-height: 1.4; }.plan-summary > view { display: flex; gap: 7rpx; flex-wrap: wrap; }.plan-summary > view text { padding: 7rpx 10rpx; border-radius: 999rpx; background: rgba(255,255,255,.1); color: #cad2cb; font-size: 12rpx; }.plan-summary button { align-self: flex-start; margin-top: 7rpx; color: #dce6dc; font-weight: 700; }
.rule-row, .note-row, .review-row { display: flex; padding: 18rpx 0; flex-direction: column; gap: 7rpx; border-top: 1rpx solid #e8ede6; }.rule-row > view { display: flex; justify-content: space-between; gap: 12rpx; }.rule-row > view text:first-child { font-size: 16rpx; font-weight: 710; }.rule-row > view text:last-child, .note-row text:first-child, .review-row text:first-child { color: #7d877f; font-size: 12rpx; }.rule-row > text, .note-row text:nth-child(2), .review-row text:nth-child(2) { color: #566259; font-size: 15rpx; line-height: 1.55; }.rule-row small, .note-row small { color: #8b938d; font-size: 11rpx; }
.money-fields { display: flex; gap: 10rpx; }.money-fields .field { flex: 1; }.money-fields .currency { flex: 0 0 150rpx; }.danger-box, .ignored-box { display: flex; margin-top: 19rpx; padding: 20rpx; flex-direction: column; gap: 7rpx; border-radius: 18rpx; background: #f4e5df; color: #76534b; font-size: 14rpx; line-height: 1.55; }.danger-box text:first-child, .ignored-box text:first-child, .warning-card text:first-child { font-weight: 730; }.candidate-list { display: flex; margin-top: 17rpx; flex-direction: column; }.candidate-list label { display: flex; align-items: flex-start; gap: 10rpx; padding: 16rpx 0; border-top: 1rpx solid #e7ece5; }.candidate-list checkbox { transform: scale(.8); }.candidate-list label > view { display: flex; min-width: 0; flex: 1; flex-direction: column; gap: 5rpx; }.candidate-list label > view text:first-child { font-size: 15rpx; font-weight: 710; }.candidate-list label > view text:nth-child(2) { font-size: 17rpx; }.candidate-list small { color: #7d877f; font-size: 11rpx; line-height: 1.4; }
/* #ifdef H5 */
@media (min-width: 980px) { .finance-page { box-sizing: border-box; padding-left: 96px; }.status-bar { display: none; }.page-shell { max-width: 980px; margin: 0 auto; padding: 52px 42px 120px; }.metric-grid { grid-template-columns: repeat(4,1fr); }.quick-actions { grid-template-columns: repeat(3,1fr); }.quick-actions button:last-child { grid-column: auto; }.setup-card, .editor-card, .section-card, .currency-card { padding: 34px; } }
/* #endif */
</style>
