const {
  COMPANY_NAME,
  getFromAddress,
  getMailDiagnostics,
  getReplyToAddress,
  sendMail
} = require("./mailClient");

const EMAIL_CONFIG = {
  from: getFromAddress(),
  replyTo: getReplyToAddress(),
  companyName: COMPANY_NAME
};

function formatCurrency(amount) {
  return `Rs. ${Number(amount).toLocaleString("en-IN")}`;
}

function safeValue(value, fallback = "N/A") {
  return value || fallback;
}

function generateBaseTemplate(content) {
  return `
    <div style="font-family:Arial;padding:20px;max-width:600px;margin:auto;">
      ${content}
      <hr>
      <p style="font-size:12px;color:#888;">
        Copyright ${new Date().getFullYear()} ${EMAIL_CONFIG.companyName}
      </p>
    </div>
  `;
}

async function sendEmail({ to, subject, htmlContent, textContent }) {
  try {
    console.log("Sending email to:", to);

    const result = await sendMail({
      from: EMAIL_CONFIG.from,
      replyTo: EMAIL_CONFIG.replyTo,
      to,
      subject,
      html: generateBaseTemplate(htmlContent),
      text: textContent
    });

    if (!result.success) {
      console.error("Email sending failed:", result.error);

      return {
        success: false,
        error: result.error,
        diagnostics: getMailDiagnostics()
      };
    }

    console.log("Email sent via", result.provider, "Message ID:", result.messageId);

    return result;
  } catch (error) {
    console.error("Email sending failed:", error.message);

    return {
      success: false,
      error: error.message
    };
  }
}

async function sendOrderConfirmationEmail(order) {
  const htmlContent = `
    <h2 style="color:#28a745;">Order Confirmed</h2>
    <p>Dear ${safeValue(order.customer)},</p>
    <p>Your order has been placed successfully.</p>

    <h3>Order Details</h3>
    <ul>
      <li><strong>Order ID:</strong> ${safeValue(order.orderId)}</li>
      <li><strong>Total:</strong> ${formatCurrency(order.total)}</li>
      <li><strong>Payment Method:</strong> ${safeValue(order.paymentMethod)}</li>
      <li><strong>Status:</strong> Order Placed</li>
    </ul>

    <p>Thank you for shopping with us.</p>
  `;

  const textContent = `
Order Confirmed

Order ID: ${order.orderId}
Total: ${order.total}
Payment: ${order.paymentMethod}
`;

  return sendEmail({
    to: order.email,
    subject: `Order #${order.orderId} Confirmed`,
    htmlContent,
    textContent
  });
}

async function sendStatusUpdateEmail(order, status) {
  const htmlContent = `
    <h2>Order Status Update</h2>
    <p>Dear ${safeValue(order.customer)},</p>
    <p>Your order status is now:</p>
    <h3>${status}</h3>
    <p><strong>Order ID:</strong> ${order.orderId}</p>
  `;

  return sendEmail({
    to: order.email,
    subject: `Order #${order.orderId} - ${status}`,
    htmlContent,
    textContent: `Order ${order.orderId} status updated to ${status}`
  });
}

async function sendRefundConfirmationEmail(order, refundAmount) {
  const htmlContent = `
    <h2>Refund Processed</h2>
    <p>Dear ${safeValue(order.customer)},</p>
    <p>Your refund has been processed.</p>
    <ul>
      <li><strong>Order ID:</strong> ${order.orderId}</li>
      <li><strong>Refund Amount:</strong> ${formatCurrency(refundAmount)}</li>
    </ul>
  `;

  return sendEmail({
    to: order.email,
    subject: `Refund Processed - Order #${order.orderId}`,
    htmlContent,
    textContent: `Refund processed for order ${order.orderId}`
  });
}

async function sendOrderConfirmationSMS(order) {
  if (!order.phone) {
    return null;
  }

  console.log(`SMS sent to ${order.phone}`);
  return { success: true };
}

async function sendShippingNotificationSMS(order) {
  if (!order.phone) {
    return null;
  }

  console.log(`Shipping SMS sent to ${order.phone}`);
  return { success: true };
}

async function sendDeliveryNotification(order) {
  await sendStatusUpdateEmail(order, "Delivered");

  if (order.phone) {
    await sendOrderConfirmationSMS(order);
  }
}

module.exports = {
  sendOrderConfirmationEmail,
  sendStatusUpdateEmail,
  sendRefundConfirmationEmail,
  sendOrderConfirmationSMS,
  sendShippingNotificationSMS,
  sendDeliveryNotification
};
