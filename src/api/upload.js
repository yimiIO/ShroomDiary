/**
 * @des 文件上传接口
 * @author shroom-app
 * @date 2024/01/15
 */

// 上传图片
// POST /api/rf-diary/v1/upload/image
const uploadImage = '/media/v1/image/upload';

// 上传语音
// POST /api/rf-diary/v1/upload/voice
const uploadVoice = '/media/v1/voice/upload';

// 语音转写：POST /media/v1/voice/:mediaId/transcribe
const transcribeVoiceBase = '/media/v1/voice';

export {
	uploadImage,
	uploadVoice,
	transcribeVoiceBase
};
