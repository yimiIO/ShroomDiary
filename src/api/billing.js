const billingOverview = '/billing/v1/overview';
const billingLedger = '/billing/v1/ledger';
const billingLegal = '/billing/v1/legal';
const billingLegalDocument = key => `/billing/v1/legal/${key}`;
const billingAcceptAgreements = '/billing/v1/agreements/accept';
const billingSevenDayClaim = '/billing/v1/activity/seven-day/claim';
const billingFeatureUnlock = key => `/billing/v1/features/${key}/unlock`;
const billingPaymentOrders = '/billing/v1/payments/orders';
const billingPaymentOrder = id => `/billing/v1/payments/orders/${id}`;
const billingWechatJsapiAuthUrl = '/billing/v1/payments/wechat-jsapi/auth-url';
const billingWechatJsapiPayer = '/billing/v1/payments/wechat-jsapi/payer';
const billingRefundRequests = '/billing/v1/refund-requests';

export {
	billingAcceptAgreements,
	billingFeatureUnlock,
	billingLedger,
	billingLegal,
	billingLegalDocument,
	billingOverview,
	billingPaymentOrder,
	billingPaymentOrders,
	billingWechatJsapiAuthUrl,
	billingWechatJsapiPayer,
	billingRefundRequests,
	billingSevenDayClaim
};
