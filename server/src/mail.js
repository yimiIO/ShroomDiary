'use strict';

const nodemailer = require('nodemailer');
const config = require('./config');

let transport = null;

function isMailConfigured() {
  const authComplete = (!config.mail.smtpUser && !config.mail.smtpPassword)
    || Boolean(config.mail.smtpUser && config.mail.smtpPassword);
  return Boolean(config.mail.smtpHost && config.mail.smtpPort && config.mail.from && authComplete);
}

function mailTransport() {
  if (!isMailConfigured()) {
    throw Object.assign(new Error('每日总结邮件尚未配置'), { code: 'SHROOM_MAIL_UNAVAILABLE' });
  }
  if (!transport) {
    transport = nodemailer.createTransport({
      host: config.mail.smtpHost,
      port: config.mail.smtpPort,
      secure: config.mail.smtpSecure,
      auth: config.mail.smtpUser ? {
        user: config.mail.smtpUser,
        pass: config.mail.smtpPassword
      } : undefined
    });
  }
  return transport;
}

async function sendMail({ to, subject, text, html }) {
  return mailTransport().sendMail({ from: config.mail.from, to, subject, text, html });
}

function setMailTransportForTest(value) {
  transport = value;
}

module.exports = { isMailConfigured, sendMail, setMailTransportForTest };
