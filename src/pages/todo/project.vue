<template>
	<view class="project-page">
		<view class="status-bar" :style="{ height: statusBarHeight + 'px' }"></view>
		<view class="navbar"><button @tap="goBack">‹</button><text>项目</text><button @tap="menu">···</button></view>
		<scroll-view v-if="project" class="content" scroll-y>
			<view class="header"><text class="name">{{ project.name }}</text><text class="goal">{{ project.goal || '还没有填写项目目标' }}</text><view class="counts"><text v-if="project.progressingCount">进行中 {{ project.progressingCount }}</text><text>未完成 {{ project.openCount }}</text></view></view>
			<button class="add" @tap="addTask">＋ 添加待办</button>
			<view v-for="group in groups" :key="group.key" class="group">
				<view class="group-heading"><text>{{ group.label }} · {{ group.items.length }}</text><button v-if="group.collapsible && group.items.length > 4" @tap="toggleGroup(group.key)">{{ expanded[group.key] ? '收起' : '展开' }}</button></view>
				<view v-for="task in groupItems(group)" :key="task.id" class="draggable-task" draggable="true" @dragstart="dragStart(task)" @dragover.prevent @drop="dropTask(task)">
					<todo-row :task="task" @toggle="toggleTask" @open="openTask" @more="taskMenu" />
				</view>
			</view>
			<view v-if="!groups.length" class="empty"><text>项目里还没有待办</text><text>添加第一步，不需要一次规划完所有行动。</text></view>
			<view class="bottom-space"></view>
		</scroll-view>

		<view v-if="showProjectEdit" class="mask" @tap="showProjectEdit = false"><view class="sheet" @tap.stop><view class="handle"></view><text>调整项目</text><input v-model="projectForm.name" maxlength="160" /><textarea v-model="projectForm.goal" maxlength="2000" auto-height placeholder="这个项目共同要做成什么？" /><button class="save" @tap="saveProject">保存</button></view></view>
	</view>
</template>

<script>
import TodoRow from '@/components/TodoRow.vue';
import { todoOptions, todoProjects, todoStatus } from '@/api/todo';
export default {
	components: { TodoRow },
	data() { return { statusBarHeight: 0, projectId: '', project: null, projects: [], groups: [], expanded: {}, showProjectEdit: false, projectForm: { name: '', goal: '' }, dragTaskId: '', timeZone: this.localTimeZone() }; },
	onLoad(options) { this.statusBarHeight = uni.getSystemInfoSync().statusBarHeight || 0; this.projectId = options.id; }, onShow() { this.load(); },
	methods: {
		localTimeZone() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai'; } catch (_) { return 'Asia/Shanghai'; } },
		requestId() { return `project-action-${Date.now()}-${Math.random().toString(16).slice(2)}`; },
		async load() { try { const responses = await Promise.all([this.$http.get(`${todoProjects}/${this.projectId}`, { timeZone: this.timeZone }), this.$http.get(todoOptions)]); const res = responses[0]; if (res.code !== 200) throw new Error(res.message); this.project = res.data.project; this.groups = res.data.groups || []; this.projects = ((responses[1].data || {}).projects || []).filter(item => item.id !== this.projectId); } catch (e) { uni.showToast({ title: e.message || '项目加载失败', icon: 'none' }); } },
		groupItems(group) { return group.collapsible && !this.expanded[group.key] ? group.items.slice(0, 4) : group.items; },
		toggleGroup(key) { this.$set(this.expanded, key, !this.expanded[key]); },
		addTask() { uni.setStorageSync('todoPrefill', { projectId: this.projectId, sourceType: 'PROJECT' }); uni.navigateTo({ url: '/pages/todo/list' }); },
		openTask(task) { uni.navigateTo({ url: `/pages/todo/detail?id=${task.id}` }); },
		async toggleTask(task) { await this.status(task, task.status === 'completed' ? 'RESTORE' : 'COMPLETE'); },
		taskMenu(task) { const items = task.status === 'in_progress' ? ['打开详情', '向上移动', '向下移动'] : ['开始推进', '打开详情', '向上移动', '向下移动']; uni.showActionSheet({ itemList: items, success: ({ tapIndex }) => { const label = items[tapIndex]; if (label === '开始推进') this.status(task, 'START'); else if (label === '打开详情') this.openTask(task); else this.moveTask(task, label === '向上移动' ? -1 : 1); } }); },
		async status(task, action) { try { const res = await this.$http.patch(todoStatus, { id: task.id, action, version: task.version, operationId: this.requestId(), timeZone: this.timeZone }); if (res.code !== 200) throw new Error(res.message); this.load(); } catch (e) { uni.showToast({ title: e.message || '操作失败', icon: 'none' }); } },
		async moveTask(task, direction) { const group = this.groups.find(item => item.items.some(entry => entry.id === task.id)); if (!group) return; const index = group.items.findIndex(item => item.id === task.id); const next = index + direction; if (next < 0 || next >= group.items.length) return; const ordered = [...group.items]; [ordered[index], ordered[next]] = [ordered[next], ordered[index]]; try { await this.$http.post('/todos/v1/reorder', { ids: ordered.map(item => item.id) }); this.load(); } catch (_) { uni.showToast({ title: '调整顺序失败', icon: 'none' }); } },
		dragStart(task) { this.dragTaskId = task.id; },
		dropTask(target) { const source = this.groups.reduce((found, group) => found || group.items.find(item => item.id === this.dragTaskId), null); const sourceGroup = this.groups.find(group => group.items.some(item => item.id === this.dragTaskId)); const targetGroup = this.groups.find(group => group.items.some(item => item.id === target.id)); if (!source || !sourceGroup || sourceGroup.key !== targetGroup.key || source.id === target.id) return; const ordered = [...sourceGroup.items]; const from = ordered.findIndex(item => item.id === source.id); const to = ordered.findIndex(item => item.id === target.id); ordered.splice(to, 0, ordered.splice(from, 1)[0]); this.dragTaskId = ''; this.saveOrder(ordered); },
		async saveOrder(ordered) { try { const res = await this.$http.post('/todos/v1/reorder', { ids: ordered.map(item => item.id) }); if (res.code !== 200) throw new Error(res.message); this.load(); } catch (_) { uni.showToast({ title: '调整顺序失败', icon: 'none' }); } },
		menu() { uni.showActionSheet({ itemList: ['编辑名称与目标', '完成项目', '归档项目'], success: ({ tapIndex }) => { if (tapIndex === 0) { this.projectForm = { name: this.project.name, goal: this.project.goal }; this.showProjectEdit = true; } else if (tapIndex === 1) this.completeProject(); else this.archiveProject(); } }); },
		async saveProject() { try { const res = await this.$http.put(`${todoProjects}/${this.projectId}`, { ...this.projectForm, version: this.project.version }); if (res.code !== 200) throw new Error(res.message); this.showProjectEdit = false; this.load(); } catch (e) { uni.showToast({ title: e.message || '保存失败', icon: 'none' }); } },
		async completeProject() { try { const res = await this.$http.post(`${todoProjects}/${this.projectId}/complete`, {}); if (res.code !== 200) throw new Error(res.message); this.load(); } catch (e) { uni.showToast({ title: e.message || '还有未完成待办', icon: 'none' }); } },
		archiveProject() { if (this.project.openCount) { uni.showActionSheet({ itemList: ['待办保留到统一列表', '转移到其他项目', '取消所有未完成待办', '暂不归档'], success: ({ tapIndex }) => { if (tapIndex === 0) this.runArchive('KEEP'); else if (tapIndex === 1) this.chooseArchiveTarget(); else if (tapIndex === 2) this.runArchive('CANCEL'); } }); } else this.runArchive('KEEP'); },
		chooseArchiveTarget() { if (!this.projects.length) return uni.showToast({ title: '还没有其他可转移的项目', icon: 'none' }); uni.showActionSheet({ itemList: this.projects.map(item => item.name), success: ({ tapIndex }) => this.runArchive('MOVE', this.projects[tapIndex].id) }); },
		async runArchive(strategy, targetProjectId = '') { try { const res = await this.$http.post(`${todoProjects}/${this.projectId}/archive`, { strategy, targetProjectId }); if (res.code !== 200) throw new Error(res.message); uni.showToast({ title: '项目已归档', icon: 'none' }); setTimeout(() => uni.navigateBack(), 500); } catch (e) { uni.showToast({ title: e.message || '归档失败', icon: 'none' }); } },
		goBack() { uni.navigateBack(); }
	}
};
</script>

<style lang="scss" scoped>
button { margin: 0; padding: 0; border: 0; background: transparent; line-height: 1; } button::after { border: 0; }
.project-page { min-height: 100vh; background: #f3f1e9; color: #28342c; }
.navbar { display: flex; align-items: center; padding: 22rpx 30rpx; } .navbar text { flex: 1; text-align: center; font: 700 29rpx/1.2 Georgia, 'Songti SC', serif; } .navbar button { width: 65rpx; color: #637067; font-size: 32rpx; } .navbar button:last-child { text-align: right; }
.content { height: calc(100vh - 120rpx - env(safe-area-inset-top)); }
.header { display: flex; flex-direction: column; margin: 12rpx 30rpx 20rpx; padding: 29rpx; border-radius: 28rpx; background: #25352a; color: #fff; } .name { font: 700 34rpx/1.35 Georgia, 'Songti SC', serif; } .goal { margin-top: 17rpx; color: #c8d1c6; font-size: 22rpx; line-height: 1.58; } .counts { display: flex; gap: 19rpx; margin-top: 22rpx; color: #aebaae; font-size: 18rpx; }
.add { display: flex; height: 70rpx; align-items: center; justify-content: center; margin: 0 30rpx; border: 1rpx dashed #aeb8aa; border-radius: 21rpx; color: #526057; font-size: 22rpx; }
.group { margin: 25rpx 30rpx 0; padding: 0 24rpx; border: 1rpx solid rgba(39,52,42,.08); border-radius: 24rpx; background: rgba(255,253,247,.76); } .group-heading { display: flex; justify-content: space-between; padding: 22rpx 0 8rpx; color: #667169; font-size: 20rpx; font-weight: 700; } .group-heading button { color: #758069; font-size: 19rpx; }
.empty { display: flex; flex-direction: column; align-items: center; padding: 100rpx 30rpx; color: #7b857e; font-size: 21rpx; } .empty text:first-child { margin-bottom: 12rpx; color: #3b483f; font-size: 27rpx; }
.bottom-space { height: 100rpx; }
.mask { position: fixed; z-index: 500; inset: 0; display: flex; align-items: flex-end; background: rgba(18,26,20,.34); } .sheet { width: 100%; padding: 14rpx 30rpx calc(28rpx + env(safe-area-inset-bottom)); box-sizing: border-box; border-radius: 30rpx 30rpx 0 0; background: #fbfaf4; } .handle { width: 62rpx; height: 6rpx; margin: 0 auto 22rpx; background: #c7cdc5; } .sheet > text { font: 700 29rpx/1.3 Georgia, serif; } .sheet input, .sheet textarea { width: 100%; margin-top: 17rpx; padding: 18rpx; box-sizing: border-box; border-radius: 17rpx; background: #fff; font-size: 23rpx; } .sheet textarea { min-height: 120rpx; line-height: 1.5; } .save { display: flex; width: 100%; height: 78rpx; align-items: center; justify-content: center; margin-top: 20rpx; border-radius: 21rpx; background: #26372b; color: #fff; font-size: 22rpx; }
@media (min-width: 900px) { .project-page { width: 760px; margin: 36px auto; border-radius: 28px; } .sheet { max-width: 700px; margin: 0 auto 30px; border-radius: 28px; } }
</style>
