const inquiryList = '/inquiries/v1';
const inquirySummary = '/inquiries/v1/summary';
const inquiryDetail = id => `/inquiries/v1/${id}`;
const inquiryEvidence = id => `/inquiries/v1/${id}/evidence`;
const inquiryReview = id => `/inquiries/v1/${id}/review`;
const inquiryDiaryLinks = diaryId => `/inquiries/v1/diary-links/${diaryId}`;

export {
	inquiryDetail,
	inquiryDiaryLinks,
	inquiryEvidence,
	inquiryList,
	inquiryReview,
	inquirySummary
};
