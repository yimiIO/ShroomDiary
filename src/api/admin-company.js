const adminStatus = '/admin/v1/status';
const adminUnlock = '/admin/v1/unlock';
const adminCompanyOverview = '/admin/v1/company';
const adminCompanyAgent = key => `/admin/v1/agents/${encodeURIComponent(key)}`;
const adminCompanyDecision = id => `/admin/v1/decisions/${encodeURIComponent(id)}`;

export {
	adminStatus,
	adminUnlock,
	adminCompanyOverview,
	adminCompanyAgent,
	adminCompanyDecision
};
