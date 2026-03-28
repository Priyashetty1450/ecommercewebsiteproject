const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');

const Cart = require('../models/Cart');
const Order = require('../models/Order');
const Product = require('../models/Product');
const { calculateShipping, determineZone } = require('../utils/shippingCalculator');
const { calculateTax } = require('../utils/taxCalculator');
const {
  sendOrderConfirmationEmail,
  sendOrderConfirmationSMS,
  sendStatusUpdateEmail,
  sendRefundConfirmationEmail
} = require('../utils/notificationService');

const router = express.Router();

const authMiddleware = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ message: 'Login required' });
  }

  try {
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || 'your-secret-key'
    );

    req.userId = decoded.id;
    req.userEmail = decoded.email || '';

    next();
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

function verifyRazorpayPayment({
  paymentMethod,
  paymentId,
  razorpayOrderId,
  razorpaySignature,
  isMockPayment
}) {
  if (paymentMethod !== 'razorpay') {
    return {
      paymentStatus: 'pending',
      paymentId: null,
      transactionId: null,
      paidAt: null
    };
  }

  if (process.env.MOCK_PAYMENT === 'true' || isMockPayment) {
    return {
      paymentStatus: 'completed',
      paymentId,
      transactionId: razorpayOrderId || paymentId,
      paidAt: new Date()
    };
  }

  if (!paymentId || !razorpayOrderId || !razorpaySignature) {
    throw new Error('Missing Razorpay payment verification details');
  }

  if (!process.env.RAZORPAY_KEY_SECRET) {
    throw new Error('Razorpay secret is not configured');
  }

  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${paymentId}`)
    .digest('hex');

  if (expectedSignature !== razorpaySignature) {
    throw new Error('Invalid Razorpay payment signature');
  }

  return {
    paymentStatus: 'completed',
    paymentId,
    transactionId: razorpayOrderId,
    paidAt: new Date()
  };
}

router.get('/', async (req, res) => {
  try {
    const orders = await Order.find().sort({ createdAt: -1 });
    res.json(orders);
  } catch {
    res.status(500).json({ message: 'Failed to fetch orders' });
  }
});

router.post('/calculate-totals', async (req, res) => {
  const { items, shippingAddress, shippingMethod, couponCode } = req.body;

  let subtotal = 0;

  items.forEach((item) => {
    subtotal += item.price * item.quantity;
  });

  const zone = determineZone(shippingAddress?.state || 'KA');
  const shippingData = calculateShipping(subtotal, items.length, zone);

  let shippingCharge = shippingData.shippingCharge;

  if (shippingMethod === 'express') shippingCharge *= 1.5;
  if (shippingMethod === 'overnight') shippingCharge *= 2.5;

  const tax = calculateTax(subtotal).taxAmount;

  let discount = 0;

  if (couponCode === 'SAVE10') {
    discount = subtotal * 0.1;
  }

  const total = subtotal + shippingCharge + tax - discount;

  res.json({
    subtotal,
    shippingCharge,
    taxAmount: tax,
    discount,
    total
  });
});

router.post('/checkout', authMiddleware, async (req, res) => {
  try {
    const cart = await Cart.findOne({ userId: req.userId });

    if (!cart || cart.items.length === 0) {
      return res.status(400).json({ message: 'Cart is empty' });
    }

    const {
      customer,
      email,
      phone,
      shippingAddress,
      shippingMethod,
      paymentMethod = 'cash_on_delivery',
      paymentId: incomingPaymentId,
      razorpayOrderId,
      razorpaySignature,
      isMockPayment
    } = req.body;

    const items = cart.items;
    const subtotal = cart.totalBill;

    const zone = determineZone(shippingAddress?.state || 'KA');
    const shippingData = calculateShipping(subtotal, items.length, zone);
    const tax = calculateTax(subtotal).taxAmount;
    const total = subtotal + shippingData.shippingCharge + tax;

    const orderId = `ORD-${Date.now()}`;
    const paymentDetails = verifyRazorpayPayment({
      paymentMethod,
      paymentId: incomingPaymentId,
      razorpayOrderId,
      razorpaySignature,
      isMockPayment
    });

    const order = new Order({
      orderId,
      customer,
      email,
      phone,
      items,
      subtotal,
      shippingCharge: shippingData.shippingCharge,
      taxAmount: tax,
      total,
      paymentMethod,
      paymentStatus: paymentDetails.paymentStatus,
      paymentId: paymentDetails.paymentId,
      transactionId: paymentDetails.transactionId,
      paidAt: paymentDetails.paidAt,
      shippingAddress,
      shippingMethod,
      status: 'Order Placed',
      statusHistory: [
        {
          status: 'Order Placed',
          timestamp: new Date()
        }
      ]
    });

    const savedOrder = await order.save();

    for (const item of items) {
      await Product.findByIdAndUpdate(item.productId, {
        $inc: { stock: -item.quantity }
      });
    }

    await Cart.findOneAndDelete({ userId: req.userId });

    res.status(201).json({
      success: true,
      order: savedOrder
    });

    sendOrderConfirmationEmail(savedOrder)
      .then((result) => {
        if (result?.success) {
          console.log('Email sent:', result);
          return;
        }

        console.error('Email failed:', result?.error || 'Unknown email error');
      })
      .catch((err) => console.error('Email failed:', err));

    if (phone) {
      sendOrderConfirmationSMS(savedOrder)
        .then((result) => console.log('SMS sent:', result))
        .catch((err) => console.error('SMS failed:', err));
    }
  } catch (err) {
    console.error(err);
    res.status(400).json({
      message: err.message,
      success: false
    });
  }
});

router.get('/track/:orderId', async (req, res) => {
  try {
    const order = await Order.findOne({
      orderId: req.params.orderId
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    res.json(order);
  } catch {
    res.status(500).json({
      message: 'Server error'
    });
  }
});

router.put('/status/:orderId', async (req, res) => {
  try {
    const { status, note } = req.body;

    const order = await Order.findOne({
      orderId: req.params.orderId
    });

    if (!order) {
      return res.status(404).json({
        message: 'Order not found'
      });
    }

    order.status = status;

    if (!order.statusHistory) {
      order.statusHistory = [];
    }

    order.statusHistory.push({
      status,
      note: note || '',
      timestamp: new Date()
    });

    await order.save();

    sendStatusUpdateEmail(order, status);

    res.json({
      success: true,
      message: 'Order status updated',
      order
    });
  } catch {
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await Order.findByIdAndDelete(req.params.id);
    res.json({ message: 'Order deleted' });
  } catch {
    res.status(500).json({ message: 'Delete failed' });
  }
});

router.put('/cancel/:orderId', async (req, res) => {
  const order = await Order.findOne({
    orderId: req.params.orderId
  });

  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  order.status = 'Cancelled';
  order.paymentStatus = 'cancelled';

  await order.save();

  res.json({
    success: true,
    order
  });
});

router.post('/:orderId/refund', async (req, res) => {
  const order = await Order.findOne({
    orderId: req.params.orderId
  });

  if (!order) {
    return res.status(404).json({ message: 'Order not found' });
  }

  order.status = 'Refunded';
  order.paymentStatus = 'refunded';

  await order.save();

  sendRefundConfirmationEmail(order, order.total);

  res.json({
    success: true,
    order
  });
});

module.exports = router;
