const wellbeingList = '/wellbeing/v1';
const wellbeingSummary = '/wellbeing/v1/summary';
const wellbeingStatus = id => `/wellbeing/v1/${id}/status`;
const wellbeingHypotheses = '/wellbeing/v1/hypotheses';
const wellbeingHypothesesRefresh = '/wellbeing/v1/hypotheses/refresh';
const wellbeingHypothesisStatus = id => `/wellbeing/v1/hypotheses/${id}/status`;

export {
	wellbeingList,
	wellbeingHypotheses,
	wellbeingHypothesesRefresh,
	wellbeingHypothesisStatus,
	wellbeingSummary,
	wellbeingStatus
};
