const wellbeingList = '/wellbeing/v1';
const wellbeingSummary = '/wellbeing/v1/summary';
const wellbeingDetail = id => `/wellbeing/v1/${id}`;
const wellbeingInquiryLink = (id, inquiryId) => `/wellbeing/v1/${id}/inquiries/${inquiryId}`;

export {
	wellbeingDetail,
	wellbeingInquiryLink,
	wellbeingList,
	wellbeingSummary
};
