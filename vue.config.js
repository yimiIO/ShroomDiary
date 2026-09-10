module.exports = {
	devServer: {
		hot: true,
		clientLogLevel: 'warning',
		overlay: {
			warnings: true,
			errors: true
		}
	},
	productionSourceMap: false,
	configureWebpack: {
		optimization: {
			minimize: true
			}
	}
};
