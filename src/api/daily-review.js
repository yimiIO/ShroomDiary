const dailyReview = date => `/daily-reviews/v1/${date}`;
const dailyReviewOpen = date => `/daily-reviews/v1/${date}/open`;
const dailyReviewPreferences = '/daily-reviews/v1/preferences';
const dailyReviewInbox = '/daily-reviews/v1/inbox';
const dailyReviewInboxUnread = '/daily-reviews/v1/inbox/unread-count';
const dailyReviewEmailRequest = '/daily-reviews/v1/preferences/email/request';
const dailyReviewEmailVerify = '/daily-reviews/v1/preferences/email/verify';

export {
	dailyReview,
	dailyReviewInbox,
	dailyReviewInboxUnread,
	dailyReviewEmailRequest,
	dailyReviewEmailVerify,
	dailyReviewOpen,
	dailyReviewPreferences
};
