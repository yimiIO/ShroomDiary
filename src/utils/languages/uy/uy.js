/* eslint-disable */
const files = require.context('@/utils/languages/uy', true, /\.json$/)
let uy = {};
files.keys().forEach(key => {
	const data = require('' + key);
	uy = { ...uy, ...data }
})
export default uy;
