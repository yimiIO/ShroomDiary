module.exports = {
	devServer: {
		hot: true,
		clientLogLevel: 'warning',
		proxy: {
			'/api': {
				target: 'https://shroom.surfplus.xyz',
				changeOrigin: true
			}
		},
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
