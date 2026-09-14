const dailyReview = date => `/daily-reviews/v1/${date}`;
const dailyReviewOpen = date => `/daily-reviews/v1/${date}/open`;
const dailyReviewPreferences = '/daily-reviews/v1/preferences';
const dailyReviewEmailRequest = '/daily-reviews/v1/preferences/email/request';
const dailyReviewEmailVerify = '/daily-reviews/v1/preferences/email/verify';

export {
	dailyReview,
	dailyReviewEmailRequest,
	dailyReviewEmailVerify,
	dailyReviewOpen,
	dailyReviewPreferences
};
