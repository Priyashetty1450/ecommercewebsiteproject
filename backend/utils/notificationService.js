const nodemailer = require("nodemailer");
require("dotenv").config();

/* ================= CHECK ENV ================= */

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.warn("⚠️ EMAIL credentials missing in .env");
}

/* ================= EMAIL TRANSPORTER ================= */

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  }
});

/* ================= VERIFY TRANSPORTER ================= */

transporter.verify((error) => {
  if (error) {
    console.error("❌ Email transporter failed:", error.message);
  } else {
    console.log("✅ Email transporter ready");
  }
});

/* ================= SEND ORDER EMAIL ================= */

async function sendOrderConfirmationEmail(order) {
  try {

    console.log("📧 Sending email to:", order.email);

    const info = await transporter.sendMail({
      from: `"Shri Manjunatha Shamiyana Works & Events" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: `Order Confirmed - ${order.orderId}`,
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>Order Confirmed ✅</h2>

          <p>Dear ${order.customer},</p>

          <p>Your order has been placed successfully.</p>

          <p><strong>Order ID:</strong> ${order.orderId}</p>
          <p><strong>Total:</strong> ₹${order.total}</p>
          <p><strong>Payment Method:</strong> ${order.paymentMethod}</p>

          <p>Thank you for shopping with us.</p>
        </div>
      `
    });

    console.log("✅ Email sent:", info.messageId);

    return true;

  } catch (err) {
    console.error("❌ Email failed:", err.message);
    return false;
  }
}

/* ================= STATUS UPDATE EMAIL ================= */

async function sendStatusUpdateEmail(order, status) {
  try {

    await transporter.sendMail({
      from: `"Shri Manjunatha Shamiyana Works & Events" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: `Order Status Updated - ${order.orderId}`,
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>Order Status Update</h2>

          <p>Dear ${order.customer},</p>

          <p>Your order status is now:</p>

          <h3>${status}</h3>

          <p><strong>Order ID:</strong> ${order.orderId}</p>
        </div>
      `
    });

    console.log("✅ Status email sent");

    return true;

  } catch (err) {
    console.error("❌ Status email failed:", err.message);
    return false;
  }
}

/* ================= REFUND EMAIL ================= */

async function sendRefundConfirmationEmail(order, refundAmount) {
  try {

    await transporter.sendMail({
      from: `"Shri Manjunatha Shamiyana Works & Events" <${process.env.EMAIL_USER}>`,
      to: order.email,
      subject: `Refund Processed - ${order.orderId}`,
      html: `
        <div style="font-family:Arial;padding:20px">
          <h2>Refund Processed</h2>

          <p>Dear ${order.customer},</p>

          <p>Your refund has been processed successfully.</p>

          <p><strong>Order ID:</strong> ${order.orderId}</p>
          <p><strong>Refund Amount:</strong> ₹${refundAmount}</p>
        </div>
      `
    });

    console.log("✅ Refund email sent");

    return true;

  } catch (err) {
    console.error("❌ Refund email failed:", err.message);
    return false;
  }
}

/* ================= SMS MOCK ================= */

async function sendOrderConfirmationSMS(order) {
  if (!order.phone) return false;

  console.log(`📱 SMS sent to ${order.phone}`);
  return true;
}

async function sendShippingNotificationSMS(order) {
  if (!order.phone) return false;

  console.log(`📦 Shipping SMS sent to ${order.phone}`);
  return true;
}

/* ================= DELIVERY ================= */

async function sendDeliveryNotification(order) {
  await sendStatusUpdateEmail(order, "Delivered");

  if (order.phone) {
    await sendOrderConfirmationSMS(order);
  }

  return true;
}

/* ================= EXPORT ================= */

module.exports = {
  sendOrderConfirmationEmail,
  sendStatusUpdateEmail,
  sendRefundConfirmationEmail,
  sendOrderConfirmationSMS,
  sendShippingNotificationSMS,
  sendDeliveryNotification
};