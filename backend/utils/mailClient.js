const https = require("https");
const nodemailer = require("nodemailer");
require("dotenv").config();

const SMTP_BLOCKED_RENDER_PORTS = new Set([25, 465, 587]);
const COMPANY_NAME =
  process.env.EMAIL_COMPANY_NAME ||
  "Shri Manjunatha Shamiyana Works & Events";
const RESEND_TEST_FROM = "onboarding@resend.dev";

let smtpTransporter;
let startupNoticeLogged = false;

function parseBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }

  return ["true", "1", "yes", "on"].includes(String(value).toLowerCase());
}

function parseNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getMailTransport() {
  const configuredTransport = (process.env.EMAIL_TRANSPORT || "")
    .trim()
    .toLowerCase();

  if (configuredTransport) {
    return configuredTransport;
  }

  return process.env.RESEND_API_KEY ? "resend" : "smtp";
}

function formatMailbox(defaultName, value) {
  if (!value) {
    return undefined;
  }

  if (value.includes("<")) {
    return value;
  }

  return `"${defaultName}" <${value}>`;
}

function getSmtpConfig() {
  const port = parseNumber(process.env.SMTP_PORT, 587);

  return {
    service: process.env.SMTP_SERVICE || undefined,
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure: parseBoolean(process.env.SMTP_SECURE, port === 465),
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
    family: parseNumber(process.env.SMTP_FAMILY, 4),
    connectionTimeout: parseNumber(
      process.env.SMTP_CONNECTION_TIMEOUT,
      15000
    ),
    greetingTimeout: parseNumber(process.env.SMTP_GREETING_TIMEOUT, 10000),
    socketTimeout: parseNumber(process.env.SMTP_SOCKET_TIMEOUT, 20000),
    ignoreTlsErrors: parseBoolean(process.env.SMTP_IGNORE_TLS_ERRORS, false)
  };
}

function getFromAddress(defaultName = COMPANY_NAME) {
  const transport = getMailTransport();

  if (transport === "resend") {
    return (
      formatMailbox(defaultName, process.env.RESEND_FROM_EMAIL) ||
      formatMailbox(defaultName, process.env.EMAIL_FROM) ||
      formatMailbox(defaultName, RESEND_TEST_FROM)
    );
  }

  if (process.env.EMAIL_FROM) {
    return formatMailbox(defaultName, process.env.EMAIL_FROM);
  }

  const smtpConfig = getSmtpConfig();

  if (!smtpConfig.user) {
    return undefined;
  }

  return `"${defaultName}" <${smtpConfig.user}>`;
}

function getReplyToAddress() {
  return (
    process.env.EMAIL_REPLY_TO ||
    process.env.RESEND_REPLY_TO ||
    getSmtpConfig().user ||
    undefined
  );
}

function logStartupNotice() {
  if (startupNoticeLogged) {
    return;
  }

  startupNoticeLogged = true;

  const transport = getMailTransport();

  if (transport === "resend") {
    if (!process.env.RESEND_API_KEY) {
      console.warn("Email transport is set to Resend but RESEND_API_KEY is missing.");
    }

    if (!process.env.RESEND_FROM_EMAIL && !process.env.EMAIL_FROM) {
      console.warn(
        `Resend sender address is not configured. Falling back to ${RESEND_TEST_FROM}. Add RESEND_FROM_EMAIL for production delivery.`
      );
    }

    return;
  }

  const smtpConfig = getSmtpConfig();

  if (!smtpConfig.user || !smtpConfig.pass) {
    console.warn("SMTP email credentials are missing. Email delivery is disabled.");
    return;
  }

  if (process.env.RENDER && SMTP_BLOCKED_RENDER_PORTS.has(smtpConfig.port)) {
    console.warn(
      `Render detected with SMTP port ${smtpConfig.port}. Free Render web services block outbound SMTP on ports 25, 465, and 587. Use an HTTP email API or a provider that supports an allowed port such as 2525.`
    );
  }
}

function createSmtpTransporter() {
  const smtpConfig = getSmtpConfig();

  if (!smtpConfig.user || !smtpConfig.pass) {
    return null;
  }

  const options = {
    auth: {
      user: smtpConfig.user,
      pass: smtpConfig.pass
    },
    family: smtpConfig.family,
    connectionTimeout: smtpConfig.connectionTimeout,
    greetingTimeout: smtpConfig.greetingTimeout,
    socketTimeout: smtpConfig.socketTimeout
  };

  if (smtpConfig.service) {
    options.service = smtpConfig.service;
  } else {
    options.host = smtpConfig.host;
    options.port = smtpConfig.port;
    options.secure = smtpConfig.secure;
  }

  if (smtpConfig.ignoreTlsErrors) {
    options.tls = { rejectUnauthorized: false };
  }

  return nodemailer.createTransport(options);
}

function getSmtpTransporter() {
  if (!smtpTransporter) {
    smtpTransporter = createSmtpTransporter();
  }

  return smtpTransporter;
}

function withRenderSmtpHint(message) {
  const smtpConfig = getSmtpConfig();

  if (process.env.RENDER && SMTP_BLOCKED_RENDER_PORTS.has(smtpConfig.port)) {
    return `${message} Render free web services block outbound SMTP on ports 25, 465, and 587. Switch to EMAIL_TRANSPORT=resend or use an SMTP provider on an allowed port such as 2525.`;
  }

  return message;
}

function postJson(url, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...headers
        }
      },
      (response) => {
        let body = "";

        response.on("data", (chunk) => {
          body += chunk;
        });

        response.on("end", () => {
          let parsedBody = {};

          if (body) {
            try {
              parsedBody = JSON.parse(body);
            } catch {
              parsedBody = { raw: body };
            }
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsedBody);
            return;
          }

          const errorMessage =
            parsedBody.message ||
            parsedBody.error ||
            `HTTP ${response.statusCode} while sending email`;

          reject(new Error(errorMessage));
        });
      }
    );

    request.on("error", reject);
    request.write(JSON.stringify(payload));
    request.end();
  });
}

async function sendWithResend(message) {
  if (!process.env.RESEND_API_KEY) {
    return {
      success: false,
      provider: "resend",
      error: "RESEND_API_KEY is missing."
    };
  }

  try {
    const payload = {
      from: message.from || getFromAddress() || formatMailbox(COMPANY_NAME, RESEND_TEST_FROM),
      to: Array.isArray(message.to) ? message.to : [message.to],
      subject: message.subject
    };

    if (message.html) {
      payload.html = message.html;
    }

    if (message.text) {
      payload.text = message.text;
    }

    if (message.replyTo || getReplyToAddress()) {
      payload.reply_to = message.replyTo || getReplyToAddress();
    }

    const response = await postJson(
      "https://api.resend.com/emails",
      payload,
      {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`
      }
    );

    return {
      success: true,
      provider: "resend",
      messageId: response.id
    };
  } catch (error) {
    return {
      success: false,
      provider: "resend",
      error: error.message
    };
  }
}

async function sendWithSmtp(message) {
  const transporter = getSmtpTransporter();

  if (!transporter) {
    return {
      success: false,
      provider: "smtp",
      error: "SMTP email transport is not configured."
    };
  }

  try {
    const info = await transporter.sendMail(message);

    return {
      success: true,
      provider: "smtp",
      messageId: info.messageId
    };
  } catch (error) {
    return {
      success: false,
      provider: "smtp",
      error: withRenderSmtpHint(error.message || "SMTP send failed.")
    };
  }
}

async function sendMail(message) {
  logStartupNotice();

  const transport = getMailTransport();

  if (transport === "resend") {
    return sendWithResend(message);
  }

  return sendWithSmtp(message);
}

function getMailDiagnostics() {
  const smtpConfig = getSmtpConfig();

  return {
    transport: getMailTransport(),
    render: Boolean(process.env.RENDER),
    companyName: COMPANY_NAME,
    smtpHost: smtpConfig.host,
    smtpPort: smtpConfig.port,
    hasSmtpCredentials: Boolean(smtpConfig.user && smtpConfig.pass),
    hasResendApiKey: Boolean(process.env.RESEND_API_KEY),
    resendFromEmail: Boolean(process.env.RESEND_FROM_EMAIL || process.env.EMAIL_FROM),
    fromAddress: getFromAddress(),
    replyTo: getReplyToAddress()
  };
}

module.exports = {
  COMPANY_NAME,
  getFromAddress,
  getMailDiagnostics,
  getReplyToAddress,
  sendMail
};
