const LAST_NOTICE_KEY = 'shroomLastInboxNoticeId';

function setInboxBadge(count) {
	const value = Math.max(0, Number(count || 0));
	try {
		if (value) {
			uni.setTabBarBadge({ index: 3, text: value > 99 ? '99+' : String(value) });
		} else {
			uni.removeTabBarBadge({ index: 3 });
		}
	} catch (error) {
		// 非 tabBar 页面或旧运行时不支持角标时，收件箱内的未读状态仍然有效。
	}
}

function browserNotificationPermission() {
	// #ifdef H5
	if (typeof window !== 'undefined' && window.Notification) return window.Notification.permission;
	// #endif
	return 'unsupported';
}

async function requestBrowserNotificationPermission() {
	// #ifdef H5
	if (typeof window !== 'undefined' && window.Notification) {
		return window.Notification.requestPermission();
	}
	// #endif
	return 'unsupported';
}

function showSystemNotice(latestUnreadId) {
	const payload = {
		title: '菇每日总结已送达',
		content: '打开 Shroom 收件箱，看看今天留下了什么。',
		payload: { type: 'DAILY_REVIEW', route: '/pages/shroom/inbox', id: latestUnreadId }
	};
	// #ifdef H5
	if (typeof window !== 'undefined' && window.Notification && window.Notification.permission === 'granted') {
		const notice = new window.Notification(payload.title, { body: payload.content, tag: `shroom-${latestUnreadId}` });
		notice.onclick = () => {
			window.focus();
			uni.navigateTo({ url: payload.payload.route });
			notice.close();
		};
	}
	// #endif
	// #ifdef APP-PLUS
	if (typeof uni.createPushMessage === 'function') {
		uni.createPushMessage({ ...payload, fail: () => {} });
	}
	// #endif
}

function handleInboxSnapshot(snapshot, options = {}) {
	const count = Number(snapshot && snapshot.unreadCount || 0);
	const latestUnreadId = snapshot && snapshot.latestUnreadId || '';
	setInboxBadge(count);
	const previous = uni.getStorageSync(LAST_NOTICE_KEY);
	if (!latestUnreadId) {
		uni.setStorageSync(LAST_NOTICE_KEY, '__none__');
		return;
	}
	uni.setStorageSync(LAST_NOTICE_KEY, latestUnreadId);
	if (options.notify && previous && previous !== latestUnreadId) {
		uni.showToast({ title: '新总结已送达收件箱', icon: 'none' });
		showSystemNotice(latestUnreadId);
	}
}

export {
	browserNotificationPermission,
	handleInboxSnapshot,
	requestBrowserNotificationPermission,
	setInboxBadge
};
