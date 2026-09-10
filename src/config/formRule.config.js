const mobileRules = [
	{
		name: 'mobile',
		checkType: 'notnull',
		checkRule: '',
		errorMsg: '手机号不能为空'
	},
	{
		name: 'mobile',
		checkType: 'phoneno',
		checkRule: '',
		errorMsg: '手机号格式不正确'
	}
];

export default {
	loginByPassRule: mobileRules.concat({
		name: 'password',
		checkType: 'string',
		checkRule: '6,18',
		errorMsg: '请输入 6–18 位密码'
	}),
	registerRule: mobileRules.concat([
		{
			name: 'password',
			checkType: 'string',
			checkRule: '6,18',
			errorMsg: '请输入 6–18 位密码'
		}
	])
};
