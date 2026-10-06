export const previewCard = {
	id: 'preview',
	seedSentence: '在重要决定前，先核对事实，再处理情绪。',
	myUnderstanding: '情绪会放大不确定性，事实才是稳定的基础。',
	usageItems: ['先暂停，不做决定', '列出已确认的事实和未知的事实', '必要时咨询第三方意见', '至少等一晚再决定'],
	tags: ['情绪管理'],
	visibility: 'PRIVATE',
	isOwner: true,
	lastReviewedAt: null,
	practiceCases: [
		{ id: 'preview-one', createdAt: '2024-11-02T10:00:00Z', context: '冲浪组合的人选过程', action: '停下来核对事实', result: '正向结果', reflection: '没有立刻在情绪里作决定' },
		{ id: 'preview-two', createdAt: '2024-08-16T10:00:00Z', context: '前女友资金使用事件', action: '写下已知信息', result: '没有明显变化', reflection: '继续观察' },
		{ id: 'preview-three', createdAt: '2024-06-07T10:00:00Z', context: '是否继续投入某个项目', action: '多等了一晚', result: '正向结果', reflection: '决策更稳' }
	],
	stats: { practiceCount: 3, resonanceCount: 0, favoriteCount: 0, quoteCount: 0 },
	createdAt: '2024-06-07T10:00:00Z'
};

export const previewReviewCards = [previewCard,
	{ ...previewCard, id: 'preview-two', seedSentence: '情绪上头时，先暂停。', myUnderstanding: '不急着回应，也是一种选择。' },
	{ ...previewCard, id: 'preview-three', seedSentence: '每一次复盘，都是在让未来的自己更从容。', myUnderstanding: '把经历留下来，下一次就不必从零开始。' }
];
