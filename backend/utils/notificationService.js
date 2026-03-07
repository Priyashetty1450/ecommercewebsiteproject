/**
 * ============================================================
 * Notification Service
 * Handles Email & SMS notifications
 * Production Ready
 * ============================================================
 */

const nodemailer = require("nodemailer");
require("dotenv").config();

/* ============================================================
   CONFIG CHECK
============================================================ */

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
    console.warn("⚠️ EMAIL credentials missing in .env");
}

/* ============================================================
   TRANSPORTER (RENDER FIXED)
============================================================ */

const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    pool: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 10000
});

/* ============================================================
   VERIFY CONNECTION
============================================================ */

transporter.verify()
    .then(() => console.log("✅ Email server ready"))
    .catch(err => console.error("❌ Email transporter failed:", err.message));

/* ============================================================
   EMAIL CONFIG
============================================================ */

const EMAIL_CONFIG = {
    from: `"Shri Manjunatha Shamiyana Works & Events" <${process.env.EMAIL_USER}>`,
    companyName: "Shri Manjunatha Shamiyana Works & Events"
};

/* ============================================================
   HELPERS
============================================================ */

function formatCurrency(amount) {
    return `₹${Number(amount).toLocaleString("en-IN")}`;
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
                © ${new Date().getFullYear()} ${EMAIL_CONFIG.companyName}
            </p>
        </div>
    `;
}

/* ============================================================
   GENERIC EMAIL SENDER
============================================================ */

async function sendEmail({ to, subject, htmlContent, textContent }) {

    try {

        console.log("📧 Sending email to:", to);

        const info = await transporter.sendMail({
            from: EMAIL_CONFIG.from,
            to,
            subject,
            html: generateBaseTemplate(htmlContent),
            text: textContent
        });

        console.log("📧 Message ID:", info.messageId);

        return {
            success: true,
            messageId: info.messageId
        };

    } catch (error) {

        console.error("❌ Email sending failed:", error.message);

        return {
            success: false,
            error: error.message
        };
    }
}

/* ============================================================
   ORDER CONFIRMATION EMAIL
============================================================ */

async function sendOrderConfirmationEmail(order) {

    const htmlContent = `
        <h2 style="color:#28a745;">Order Confirmed ✅</h2>

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

/* ============================================================
   STATUS UPDATE EMAIL
============================================================ */

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

/* ============================================================
   REFUND EMAIL
============================================================ */

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

/* ============================================================
   SMS MOCK
============================================================ */

async function sendOrderConfirmationSMS(order) {

    if (!order.phone) {
        return;
    }

    console.log(`📱 SMS sent to ${order.phone}`);
}

async function sendShippingNotificationSMS(order) {

    if (!order.phone) {
        return;
    }

    console.log(`📦 Shipping SMS sent to ${order.phone}`);
}

/* ============================================================
   DELIVERY EMAIL
============================================================ */

async function sendDeliveryNotification(order) {

    await sendStatusUpdateEmail(order, "Delivered");

    if (order.phone) {
        await sendOrderConfirmationSMS(order);
    }
}

/* ============================================================
   EXPORTS
============================================================ */

module.exports = {
    sendOrderConfirmationEmail,
    sendStatusUpdateEmail,
    sendRefundConfirmationEmail,
    sendOrderConfirmationSMS,
    sendShippingNotificationSMS,
    sendDeliveryNotification
};