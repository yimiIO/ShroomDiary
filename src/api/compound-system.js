const COMPOUND_OWNER_USER_ID = '75fea8f4-9731-44c4-bf61-767a0ee34b04';
const compoundToday = '/compound/v1/today';
const compoundCheckIn = '/compound/v1/check-in';
const compoundUndo = '/compound/v1/undo';
const compoundHome = '/compound/v2/home';
const compoundDirections = '/compound/v2/directions';
const compoundStarter = '/compound/v2/starter';
const compoundThreads = '/compound/v2/threads';
const compoundThread = id => `/compound/v2/threads/${id}`;
const compoundThreadPrimary = id => `/compound/v2/threads/${id}/primary`;
const compoundContinue = id => `/compound/v2/threads/${id}/continue`;
const compoundBlocker = id => `/compound/v2/threads/${id}/blocker`;
const compoundResultDraft = id => `/compound/v2/threads/${id}/results/draft`;
const compoundResultConfirm = (id, eventId) => `/compound/v2/threads/${id}/results/${eventId}/confirm`;
const compoundThreadState = id => `/compound/v2/threads/${id}/state`;
const compoundDiaryReview = (id, linkId) => `/compound/v2/threads/${id}/diary-links/${linkId}/review`;
const compoundDiaryDismiss = (id, linkId) => `/compound/v2/threads/${id}/diary-links/${linkId}/dismiss`;
const compoundDiaryReviewConfirm = (id, eventId) => `/compound/v2/threads/${id}/diary-reviews/${eventId}/confirm`;
const compoundReviews = '/compound/v2/reviews';
const compoundReviewDraft = '/compound/v2/reviews/draft';
const compoundReviewConfirm = id => `/compound/v2/reviews/${id}/confirm`;
const compoundExport = '/compound/v2/export';
const compoundBodyPractice = '/compound/v2/body-practice';
const compoundBodyPracticeCheckIn = '/compound/v2/body-practice/check-in';

export {
	COMPOUND_OWNER_USER_ID,
	compoundBodyPractice,
	compoundBodyPracticeCheckIn,
	compoundBlocker,
	compoundCheckIn,
	compoundContinue,
	compoundDiaryDismiss,
	compoundDiaryReview,
	compoundDiaryReviewConfirm,
	compoundDirections,
	compoundExport,
	compoundHome,
	compoundResultConfirm,
	compoundResultDraft,
	compoundReviewConfirm,
	compoundReviewDraft,
	compoundReviews,
	compoundStarter,
	compoundThread,
	compoundThreadPrimary,
	compoundThreadState,
	compoundThreads,
	compoundToday,
	compoundUndo
};
