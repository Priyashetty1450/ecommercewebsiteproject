const express = require('express');
const Razorpay = require('razorpay');
const crypto = require('crypto');

const router = express.Router();

const PLACEHOLDER_RAZORPAY_KEY_ID = 'rzp_test_XXXXXXXXXXXXXXXXXXXX';
const PLACEHOLDER_RAZORPAY_KEY_SECRET = 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

function isConfiguredValue(value, placeholder) {
  return Boolean(
    value &&
      value.trim() &&
      value.trim() !== placeholder &&
      !/^X+$/i.test(value.trim())
  );
}

const hasLiveRazorpayKeys =
  isConfiguredValue(process.env.RAZORPAY_KEY_ID, PLACEHOLDER_RAZORPAY_KEY_ID) &&
  isConfiguredValue(
    process.env.RAZORPAY_KEY_SECRET,
    PLACEHOLDER_RAZORPAY_KEY_SECRET
  );

const isMockPayment =
  process.env.MOCK_PAYMENT === 'true' || !hasLiveRazorpayKeys;

const razorpay = hasLiveRazorpayKeys
  ? new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    })
  : null;

function createMockOrderPayload(amount, currency, receipt) {
  return {
    success: true,
    orderId: `mock_order_${Date.now()}`,
    amount: Math.round(amount * 100),
    currency: currency || 'INR',
    receipt: receipt || `order_${Date.now()}`,
    isMock: true
  };
}

router.get('/mode', (req, res) => {
  res.json({
    success: true,
    isMockPayment,
    message: isMockPayment
      ? hasLiveRazorpayKeys
        ? 'Mock payment mode is enabled for testing'
        : 'Razorpay keys are missing, so mock payment mode is enabled for testing'
      : 'Live payment mode is enabled'
  });
});

router.post('/create-order', async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt } = req.body;

    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({
        success: false,
        message: 'A valid amount is required'
      });
    }

    if (isMockPayment) {
      const mockOrder = createMockOrderPayload(amount, currency, receipt);
      console.log('MOCK PAYMENT: Creating mock order:', mockOrder.orderId);
      return res.json(mockOrder);
    }

    if (!razorpay) {
      return res.status(500).json({
        success: false,
        message: 'Razorpay is not configured'
      });
    }

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100),
      currency,
      receipt: receipt || `order_${Date.now()}`,
      payment_capture: 1
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      isMock: false
    });
  } catch (error) {
    console.error('Razorpay order creation error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create payment order',
      error: error.message
    });
  }
});

router.post('/verify-payment', async (req, res) => {
  try {
    const {
      razorpay_order_id,
      razorpay_payment_id,
      razorpay_signature,
      isMock
    } = req.body;

    if (isMockPayment || isMock) {
      console.log('MOCK PAYMENT: Verifying mock payment');

      const mockPaymentId = `mock_pay_${Date.now()}`;
      const mockSignature = crypto
        .createHmac('sha256', 'mock_secret')
        .update(`${razorpay_order_id}|${mockPaymentId}`)
        .digest('hex');

      return res.json({
        success: true,
        message: 'Mock payment verified successfully',
        paymentId: mockPaymentId,
        orderId: razorpay_order_id,
        signature: mockSignature,
        isMock: true
      });
    }

    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'All payment verification fields are required'
      });
    }

    const generatedSignature = crypto
      .createHmac(
        'sha256',
        process.env.RAZORPAY_KEY_SECRET || 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'
      )
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest('hex');

    if (generatedSignature !== razorpay_signature) {
      return res.status(400).json({
        success: false,
        message: 'Invalid payment signature'
      });
    }

    res.json({
      success: true,
      message: 'Payment verified successfully',
      paymentId: razorpay_payment_id,
      orderId: razorpay_order_id,
      signature: razorpay_signature,
      isMock: false
    });
  } catch (error) {
    console.error('Payment verification error:', error);

    if (isMockPayment) {
      return res.json({
        success: true,
        message: 'Mock payment verified (error handled)',
        paymentId: `mock_pay_${Date.now()}`,
        isMock: true
      });
    }

    res.status(500).json({
      success: false,
      message: 'Payment verification failed',
      error: error.message
    });
  }
});

router.get('/key', (req, res) => {
  if (isMockPayment) {
    return res.json({
      success: true,
      key: PLACEHOLDER_RAZORPAY_KEY_ID,
      isMock: true
    });
  }

  res.json({
    success: true,
    key: process.env.RAZORPAY_KEY_ID || 'rzp_test_XXXXXXXXXXXXXXXXXXXX',
    isMock: false
  });
});

module.exports = router;
