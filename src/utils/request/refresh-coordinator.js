function createRefreshCoordinator(refreshOperation) {
	let inFlight = null;

	return function refreshOnce() {
		if (inFlight) return inFlight;

		let started;
		try {
			started = Promise.resolve(refreshOperation());
		} catch (error) {
			started = Promise.reject(error);
		}

		const coordinated = started.finally(() => {
			if (inFlight === coordinated) inFlight = null;
		});
		inFlight = coordinated;
		return coordinated;
	};
}

module.exports = createRefreshCoordinator;
