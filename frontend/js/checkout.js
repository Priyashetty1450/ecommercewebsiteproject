const API_BASE = '/api';

const state = {
  cart: [],
  totals: null,
  shippingMethod: 'standard',
  paymentMethod: 'cash_on_delivery',
  razorpayKey: null,
  paymentModeMessage: '',
  isMockPayment: false,
  isPlacingOrder: false
};

const $ = (id) => document.getElementById(id);

const getToken = () => localStorage.getItem('token');

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/pages/auth/login.html';
    throw new Error('Not authenticated');
  }
}

function setText(id, value) {
  const el = $(id);
  if (el) el.innerText = value;
}

function showToast(msg) {
  alert(msg);
}

function setLoading(show) {
  $('loadingOverlay')?.classList.toggle('active', show);
}

function createHandledError(message) {
  const error = new Error(message);
  error.isUserHandled = true;
  return error;
}

async function api(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${getToken()}`,
      ...options.headers
    },
    ...options
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || 'API Error');
  }

  return res.json();
}

document.addEventListener('DOMContentLoaded', init);

async function init() {
  try {
    requireAuth();
    setLoading(true);

    await Promise.all([loadPaymentConfig(), loadCart()]);

    renderSummary();
    await calculateTotals();
  } catch (err) {
    showToast(err.message);
  } finally {
    setLoading(false);
  }
}

async function loadPaymentConfig() {
  const [key, mode] = await Promise.all([
    fetch(`${API_BASE}/payment/key`).then((r) => r.json()),
    fetch(`${API_BASE}/payment/mode`).then((r) => r.json())
  ]);

  state.razorpayKey = key.key;
  state.isMockPayment = mode.isMockPayment;
  state.paymentModeMessage = mode.message || '';

  renderPaymentModeNotice();
}

function renderPaymentModeNotice() {
  const notice = $('paymentModeNotice');

  if (!notice) {
    return;
  }

  if (state.isMockPayment) {
    notice.hidden = false;
    notice.classList.remove('live');
    notice.innerText =
      'Razorpay is currently in mock/test mode because real Razorpay keys are not configured. No real UPI QR code or Razorpay popup will appear. Clicking Razorpay will simulate a successful payment for testing.';
    return;
  }

  notice.hidden = false;
  notice.classList.add('live');
  notice.innerText =
    'Razorpay live/test checkout is enabled. On desktop, choose UPI inside the Razorpay popup to see the QR code. On mobile, Razorpay may open available UPI apps directly instead of showing a QR.';
}

async function loadCart() {
  const data = await api('/cart');

  state.cart = data.items || [];

  if (!state.cart.length) {
    window.location.href = '/pages/cart/cart.html';
  }
}

function renderSummary() {
  const container = $('summaryItems');
  container.innerHTML = '';

  state.cart.forEach((item) => {
    const total = item.price * item.quantity;

    container.innerHTML += `
      <div class="summary-item">
        <img src="${item.image}">
        <div>
          <h4>${item.name}</h4>
          <p>Qty: ${item.quantity}</p>
        </div>
        <div>Rs. ${total}</div>
      </div>
    `;
  });
}

async function calculateTotals() {
  const items = state.cart.map((item) => ({
    productId: item.productId?._id || item.productId,
    quantity: item.quantity,
    price: item.price
  }));

  state.totals = await api('/orders/calculate-totals', {
    method: 'POST',
    body: JSON.stringify({
      items,
      shippingMethod: state.shippingMethod
    })
  });

  setText('summarySubtotal', state.totals.subtotal);
  setText(
    'summaryShipping',
    state.totals.shippingCharge ? `Rs. ${state.totals.shippingCharge}` : 'Free'
  );
  setText('summaryTax', state.totals.taxAmount);
  setText('summaryTotal', state.totals.total);
}

function getShippingData() {
  const data = {
    fullName: $('fullName').value.trim(),
    phone: $('phone').value.trim(),
    email: $('email').value.trim(),
    street: $('street').value.trim(),
    city: $('city').value.trim(),
    state: $('state').value.trim(),
    zipCode: $('zipCode').value.trim()
  };

  if (Object.values(data).some((value) => !value)) {
    throw new Error('All fields required');
  }

  return data;
}

function goToPayment() {
  try {
    getShippingData();

    $('paymentSection').style.display = 'block';

    window.scrollTo({
      top: $('paymentSection').offsetTop - 100,
      behavior: 'smooth'
    });
  } catch (err) {
    showToast(err.message);
  }
}

function selectPaymentMethod(el) {
  document
    .querySelectorAll('.payment-option')
    .forEach((item) => item.classList.remove('selected'));

  el.classList.add('selected');
  state.paymentMethod = el.dataset.method;
}

async function placeOrder() {
  if (state.isPlacingOrder) return;

  try {
    state.isPlacingOrder = true;

    const shipping = getShippingData();

    if (!state.totals?.total) {
      throw new Error('Invalid order amount');
    }

    if (state.paymentMethod === 'razorpay') {
      await startRazorpay(shipping);
      return;
    }

    await createOrder(shipping, {
      paymentMethod: 'cash_on_delivery'
    });
  } catch (err) {
    if (!err.isUserHandled) {
      showToast(err.message);
    }
  } finally {
    state.isPlacingOrder = false;
  }
}

async function startRazorpay(shipping) {
  if (!window.Razorpay) {
    throw new Error('Razorpay checkout failed to load');
  }

  setLoading(true);

  try {
    const order = await api('/payment/create-order', {
      method: 'POST',
      body: JSON.stringify({
        amount: state.totals.total,
        currency: 'INR',
        receipt: `receipt_${Date.now()}`
      })
    });

    if (!order.success) {
      throw new Error('Failed to initialize Razorpay payment');
    }

    if (order.isMock) {
      const verification = await api('/payment/verify-payment', {
        method: 'POST',
        body: JSON.stringify({
          razorpay_order_id: order.orderId,
          isMock: true
        })
      });

      if (!verification.success) {
        throw new Error('Mock payment verification failed');
      }

      await createOrder(shipping, {
        paymentMethod: 'razorpay',
        paymentId: verification.paymentId,
        razorpayOrderId: verification.orderId || order.orderId,
        razorpaySignature: verification.signature,
        isMockPayment: true
      });

      return;
    }

    await new Promise((resolve, reject) => {
      let flowHandled = false;

      const handleFailure = (message, details = {}) => {
        if (flowHandled) return;
        flowHandled = true;
        setLoading(false);
        redirectToPaymentFailure({
          amount: state.totals.total,
          errorCode: details.code || 'PAYMENT_FAILED',
          errorDescription: details.description || message
        });
        reject(createHandledError(message));
      };

      const rzp = new Razorpay({
        key: state.razorpayKey,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: 'Shri Manjunatha Shamiyana Works & Events',
        description: 'Order payment',
        prefill: {
          name: shipping.fullName,
          email: shipping.email,
          contact: shipping.phone
        },
        notes: {
          receipt: order.receipt
        },
        theme: {
          color: '#8B4513'
        },
        modal: {
          ondismiss: () => {
            handleFailure('Payment was cancelled before completion', {
              code: 'PAYMENT_CANCELLED',
              description: 'Payment was cancelled before completion'
            });
          }
        },
        handler: async (response) => {
          if (flowHandled) return;
          flowHandled = true;

          try {
            setLoading(true);

            const verification = await api('/payment/verify-payment', {
              method: 'POST',
              body: JSON.stringify({
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              })
            });

            if (!verification.success) {
              throw new Error('Payment verification failed');
            }

            await createOrder(shipping, {
              paymentMethod: 'razorpay',
              paymentId:
                verification.paymentId || response.razorpay_payment_id,
              razorpayOrderId:
                verification.orderId || response.razorpay_order_id,
              razorpaySignature:
                verification.signature || response.razorpay_signature
            });

            resolve();
          } catch (error) {
            redirectToPaymentFailure({
              amount: state.totals.total,
              errorCode: 'VERIFICATION_FAILED',
              errorDescription: error.message
            });
            reject(createHandledError(error.message));
          } finally {
            setLoading(false);
          }
        }
      });

      rzp.on('payment.failed', (response) => {
        handleFailure(
          response?.error?.description || 'Payment could not be completed',
          response?.error || {}
        );
      });

      setLoading(false);
      rzp.open();
    });
  } finally {
    setLoading(false);
  }
}

async function createOrder(shipping, payment = {}) {
  setLoading(true);

  try {
    const data = await api('/orders/checkout', {
      method: 'POST',
      body: JSON.stringify({
        customer: shipping.fullName,
        email: shipping.email,
        phone: shipping.phone,
        items: state.cart,
        shippingAddress: shipping,
        shippingMethod: state.shippingMethod,
        paymentMethod: payment.paymentMethod || 'cash_on_delivery',
        paymentId: payment.paymentId || null,
        razorpayOrderId: payment.razorpayOrderId || null,
        razorpaySignature: payment.razorpaySignature || null,
        isMockPayment: Boolean(payment.isMockPayment),
        ...state.totals
      })
    });

    if (!data.success) {
      throw new Error('Order failed');
    }

    window.location.href =
      `/pages/checkout/success.html?orderId=${data.order.orderId}`;
  } finally {
    setLoading(false);
  }
}

function redirectToPaymentFailure({
  orderId = '',
  amount = 0,
  errorCode = 'PAYMENT_FAILED',
  errorDescription = 'Transaction declined'
}) {
  const params = new URLSearchParams({
    amount: String(amount),
    errorCode,
    errorDescription
  });

  if (orderId) {
    params.set('orderId', orderId);
  }

  window.location.href = `/pages/checkout/failure.html?${params.toString()}`;
}
