const inquiryList = '/inquiries/v1';
const inquirySummary = '/inquiries/v1/summary';
const inquiryDetail = id => `/inquiries/v1/${id}`;
const inquiryEvidence = id => `/inquiries/v1/${id}/evidence`;
const inquiryReview = id => `/inquiries/v1/${id}/review`;
const inquiryDiaryLinks = diaryId => `/inquiries/v1/diary-links/${diaryId}`;
const inquiryCandidateAccept = candidateId => `/inquiries/v1/candidates/${candidateId}/accept`;
const inquiryCandidateIgnore = candidateId => `/inquiries/v1/candidates/${candidateId}/ignore`;
const inquiryCandidates = '/inquiries/v1/candidates';

export {
	inquiryCandidateAccept,
	inquiryCandidateIgnore,
	inquiryCandidates,
	inquiryDetail,
	inquiryDiaryLinks,
	inquiryEvidence,
	inquiryList,
	inquiryReview,
	inquirySummary
};
