const compoundToday = '/compound/v1/today';
const compoundCheckIn = '/compound/v1/check-in';
const compoundUndo = '/compound/v1/undo';
const compoundHome = '/compound/v2/home';
const compoundArchetypes = '/compound/v2/archetypes';
const compoundDirections = '/compound/v2/directions';
const compoundStarter = '/compound/v2/starter';
const compoundThreads = '/compound/v2/threads';
const compoundPlan = id => `/compound/v2/plans/${id}`;
const compoundPlanValidation = id => `/compound/v2/plans/${id}/validation`;
const compoundPlanWeek = id => `/compound/v2/plans/${id}/week`;
const compoundPlanWeekAction = (id, actionId) => `/compound/v2/plans/${id}/week/actions/${encodeURIComponent(actionId)}`;
const compoundThread = id => `/compound/v2/threads/${id}`;
const compoundThreadPrimary = id => `/compound/v2/threads/${id}/primary`;
const compoundContinue = id => `/compound/v2/threads/${id}/continue`;
const compoundSuggestionAdopt = (id, eventId) => `/compound/v2/threads/${id}/suggestions/${eventId}/adopt`;
const compoundBlocker = id => `/compound/v2/threads/${id}/blocker`;
const compoundQuietDay = '/compound/v2/quiet-day';
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
const financialPlan = id => `/compound/v2/financial/plans/${id}`;
const financialPlanProfile = id => `/compound/v2/financial/plans/${id}/profile`;
const financialRecords = id => `/compound/v2/financial/plans/${id}/records`;
const financialRecord = (id, recordId) => `/compound/v2/financial/plans/${id}/records/${recordId}`;
const financialSnapshots = id => `/compound/v2/financial/plans/${id}/snapshots`;
const financialSnapshot = (id, snapshotId) => `/compound/v2/financial/plans/${id}/snapshots/${snapshotId}`;
const financialHoldings = id => `/compound/v2/financial/plans/${id}/holdings`;
const financialHolding = (id, holdingId) => `/compound/v2/financial/plans/${id}/holdings/${holdingId}`;
const financialAliases = id => `/compound/v2/financial/plans/${id}/aliases`;
const financialRules = id => `/compound/v2/financial/plans/${id}/rules`;
const financialNotes = id => `/compound/v2/financial/plans/${id}/notes`;
const financialReviews = id => `/compound/v2/financial/plans/${id}/reviews`;
const financialImportDrafts = id => `/compound/v2/financial/plans/${id}/import-drafts`;
const financialImportConfirm = (id, draftId) => `/compound/v2/financial/plans/${id}/import-drafts/${draftId}/confirm`;
const financialAiConsent = id => `/compound/v2/financial/plans/${id}/ai-consent`;
const financialExport = id => `/compound/v2/financial/plans/${id}/export`;
const financialDelete = id => `/compound/v2/financial/plans/${id}/data`;

export {
	compoundBodyPractice,
	compoundBodyPracticeCheckIn,
	compoundBlocker,
	compoundCheckIn,
	compoundContinue,
	compoundDiaryDismiss,
	compoundDiaryReview,
	compoundDiaryReviewConfirm,
	compoundDirections,
	compoundArchetypes,
	compoundExport,
	compoundHome,
	compoundPlan,
	compoundPlanValidation,
	compoundPlanWeek,
	compoundPlanWeekAction,
	compoundQuietDay,
	compoundResultConfirm,
	compoundResultDraft,
	compoundReviewConfirm,
	compoundReviewDraft,
	compoundReviews,
	compoundStarter,
	compoundSuggestionAdopt,
	compoundThread,
	compoundThreadPrimary,
	compoundThreadState,
	compoundThreads,
	compoundToday,
	compoundUndo,
	financialAliases,
	financialAiConsent,
	financialDelete,
	financialExport,
	financialHolding,
	financialHoldings,
	financialImportConfirm,
	financialImportDrafts,
	financialNotes,
	financialPlan,
	financialPlanProfile,
	financialRecord,
	financialRecords,
	financialReviews,
	financialRules,
	financialSnapshot,
	financialSnapshots
};
