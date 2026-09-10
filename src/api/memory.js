const memoryStatus = '/memory/v1/status';
const memoryConversations = '/memory/v1/conversations';
const memoryThemeOpen = key => `/memory/v1/themes/${encodeURIComponent(key)}/open`;

const memoryConversation = id => `/memory/v1/conversations/${id}`;
const memoryMessages = id => `/memory/v1/conversations/${id}/messages`;
const memoryFeedback = id => `/memory/v1/conversations/${id}/feedback`;
const memoryCard = id => `/memory/v1/conversations/${id}/cards`;
const memoryCancel = id => `/memory/v1/conversations/${id}/cancel`;
const memoryRetry = id => `/memory/v1/conversations/${id}/retry`;

export {
	memoryCancel,
	memoryCard,
	memoryConversation,
	memoryConversations,
	memoryFeedback,
	memoryMessages,
	memoryRetry,
	memoryStatus,
	memoryThemeOpen
};
