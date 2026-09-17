const lifeOsConfig = '/life-os/v1/config';
const lifeOsHistory = '/life-os/v1/config/history';
const lifeOsDraft = '/life-os/v1/draft';
const lifeOsDraftStatus = '/life-os/v1/draft/status';
const lifeOsWorkspace = '/life-os/v1/workspace';
const lifeOsReviewDraft = '/life-os/v1/review/draft';
const lifeOsReviewManual = '/life-os/v1/review/manual';
const lifeOsReviewPublish = id => `/life-os/v1/review/${id}/publish`;
const lifeOsReviewReject = id => `/life-os/v1/review/${id}/reject`;
const lifeOsPlanHome = '/life-os/v1/plan/home';
const lifeOsPlanFocus = '/life-os/v1/plan/focus';
const lifeOsPlanItem = key => `/life-os/v1/plan/items/${key}`;
const lifeOsPlanLink = id => `/life-os/v1/plan/links/${id}`;
const lifeOsPlanReferences = key => `/life-os/v1/plan/items/${key}/references`;
const lifeOsPlanReference = id => `/life-os/v1/plan/references/${id}`;
const lifeOsPlanReviews = '/life-os/v1/plan/reviews';
const lifeOsPlanReviewDraft = '/life-os/v1/plan/reviews/draft';
const lifeOsPlanReviewConfirm = id => `/life-os/v1/plan/reviews/${id}/confirm`;
const lifeOsPlanExport = '/life-os/v1/plan/export';
const reminderRules = '/reminders/v1/rules';
const reminderOverview = '/reminders/v1/overview';
const reminderReview = '/reminders/v1/run/monthly-review';
const dataExport = '/export/v1/all';
const aiStatus = '/ai/v1/status';
const aiAnalyze = '/ai/v1/analyze';
const aiAnalysis = '/ai/v1/analysis';
const aiTask = '/ai/v1/diary-flow';
const aiExperience = '/ai/v1/experience';
const aiInsightFeedback = taskId => `/ai/v1/diary-flow/${taskId}/insight-feedback`;
const aiObservers = '/ai/v1/observers';
const aiObserver = id => `/ai/v1/observers/${id}`;

export {
	aiAnalysis,
	aiAnalyze,
	aiExperience,
	aiInsightFeedback,
	aiObserver,
	aiObservers,
	aiStatus,
	aiTask,
	dataExport,
	lifeOsConfig,
	lifeOsDraft,
	lifeOsDraftStatus,
	lifeOsHistory,
	lifeOsPlanExport,
	lifeOsPlanFocus,
	lifeOsPlanHome,
	lifeOsPlanItem,
	lifeOsPlanLink,
	lifeOsPlanReference,
	lifeOsPlanReferences,
	lifeOsPlanReviewConfirm,
	lifeOsPlanReviewDraft,
	lifeOsPlanReviews,
	lifeOsReviewDraft,
	lifeOsReviewManual,
	lifeOsReviewPublish,
	lifeOsReviewReject,
	lifeOsWorkspace,
	reminderOverview,
	reminderReview,
	reminderRules
};
