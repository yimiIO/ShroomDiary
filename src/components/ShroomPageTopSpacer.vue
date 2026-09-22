<template>
	<view
		class="shroom-page-top-spacer"
		:style="{ height: height + 'px', backgroundColor: background }"
		aria-hidden="true"
	></view>
</template>

<script>
/* global wx */

function resolveTopInset() {
	let statusBarHeight = 0;
	try {
		const systemInfo = uni.getSystemInfoSync();
		statusBarHeight = Number(systemInfo.statusBarHeight) || 0;
	} catch (error) {
		return 0;
	}

	let topInset = statusBarHeight;
	// #ifdef MP-WEIXIN
	try {
		const menuButton = wx.getMenuButtonBoundingClientRect();
		const verticalGap = Math.max(0, Number(menuButton.top) - statusBarHeight);
		topInset = Math.max(statusBarHeight + 44, Number(menuButton.bottom) + verticalGap);
	} catch (error) {
		topInset = statusBarHeight + 44;
	}
	// #endif

	return Math.ceil(topInset);
}

export default {
	name: 'ShroomPageTopSpacer',
	props: {
		background: {
			type: String,
			default: 'transparent'
		}
	},
	data() {
		return { height: resolveTopInset() };
	}
};
</script>

<style scoped>
.shroom-page-top-spacer {
	display: block;
	box-sizing: border-box;
	width: 100%;
	flex: 0 0 auto;
}
</style>
