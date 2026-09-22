const dataSourceConnections = '/data-sources/v1/connections';
const createCodexConnection = '/data-sources/v1/codex/connections';
const dataSourceActivities = '/data-sources/v1/activities';

function dataSourceActivityDetail(id) {
	return `/data-sources/v1/activities/${encodeURIComponent(id)}`;
}

export { createCodexConnection, dataSourceActivities, dataSourceActivityDetail, dataSourceConnections };
