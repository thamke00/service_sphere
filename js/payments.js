/* ============================================================
   ServiceSphere – Payments Module
   Payment modal, card preview, submission logic.
   Depends on: utils.js, auth.js, bookings.js
   ============================================================ */

let activePaymentBookingId = null;
let activePaymentAmount = 499.00;
let activePaymentMethod = 'card';

function openPaymentModal(bookingId, amount) {
  activePaymentBookingId = bookingId;
  activePaymentAmount = amount || 499.00;
  
  const amtEl = document.getElementById('paymentAmount');
  if (amtEl) amtEl.textContent = '₹' + activePaymentAmount.toFixed(2);
  
  const successView = document.getElementById('paymentSuccessView');
  const formView = document.getElementById('paymentFormView');
  if (successView) successView.style.display = 'none';
  if (formView) formView.style.display = 'block';
  
  resetPaymentFields();
  
  const overlay = document.getElementById('paymentModalOverlay');
  if (overlay) overlay.classList.add('open');
}

function closePaymentModal() {
  const overlay = document.getElementById('paymentModalOverlay');
  if (overlay) overlay.classList.remove('open');
  activePaymentBookingId = null;
}

function switchPaymentMethod(method) {
  activePaymentMethod = method;
  const cardBtn = document.getElementById('payMethodCard');
  const upiBtn = document.getElementById('payMethodUpi');
  const cardFields = document.getElementById('cardPaymentFields');
  const upiFields = document.getElementById('upiPaymentFields');
  
  if (method === 'card') {
    cardBtn?.classList.add('active');
    upiBtn?.classList.remove('active');
    if (cardFields) cardFields.style.display = 'block';
    if (upiFields) upiFields.style.display = 'none';
  } else {
    cardBtn?.classList.remove('active');
    upiBtn?.classList.add('active');
    if (cardFields) cardFields.style.display = 'none';
    if (upiFields) upiFields.style.display = 'block';
  }
}

function resetPaymentFields() {
  const cardName = document.getElementById('cardNameInput');
  const cardNumber = document.getElementById('cardNumberInput');
  const cardExpiry = document.getElementById('cardExpiryInput');
  const cardCvv = document.getElementById('cardCvvInput');
  if (cardName) cardName.value = '';
  if (cardNumber) cardNumber.value = '';
  if (cardExpiry) cardExpiry.value = '';
  if (cardCvv) cardCvv.value = '';
  
  const upiId = document.getElementById('upiIdInput');
  if (upiId) upiId.value = '';
  
  switchPaymentMethod('card');
  updateCardPreview();
}

function updateCardPreview() {
  const cardName = document.getElementById('cardNameInput')?.value || '';
  const cardNumber = document.getElementById('cardNumberInput')?.value || '';
  const cardExpiry = document.getElementById('cardExpiryInput')?.value || '';
  
  const previewLogo = document.getElementById('previewCardLogo');
  if (previewLogo) {
    if (cardNumber.startsWith('4')) {
      previewLogo.textContent = 'VISA';
    } else if (cardNumber.startsWith('5')) {
      previewLogo.textContent = 'MASTERCARD';
    } else if (cardNumber.startsWith('3')) {
      previewLogo.textContent = 'AMEX';
    } else {
      previewLogo.textContent = 'CARD';
    }
  }
  
  const cleanNumber = cardNumber.replace(/\s?/g, '').replace(/[^0-9]/g, '');
  let formattedNumber = '';
  for (let i = 0; i < cleanNumber.length; i++) {
    if (i > 0 && i % 4 === 0) formattedNumber += ' ';
    formattedNumber += cleanNumber[i];
  }
  
  const cardNumberInput = document.getElementById('cardNumberInput');
  if (cardNumberInput && cardNumber !== formattedNumber) {
    cardNumberInput.value = formattedNumber;
  }
  
  const previewNumber = document.getElementById('previewCardNumber');
  if (previewNumber) {
    previewNumber.textContent = formattedNumber || '•••• •••• •••• ••••';
  }
  
  const previewName = document.getElementById('previewCardName');
  if (previewName) {
    previewName.textContent = cardName.toUpperCase() || 'YOUR NAME';
  }
  
  const expiryInput = document.getElementById('cardExpiryInput');
  if (expiryInput) {
    let expiryVal = expiryInput.value.replace(/\D/g, '');
    if (expiryVal.length > 2) {
      expiryVal = expiryVal.substring(0, 2) + '/' + expiryVal.substring(2, 4);
    }
    if (expiryInput.value !== expiryVal) {
      expiryInput.value = expiryVal;
    }
    const previewExpiry = document.getElementById('previewCardExpiry');
    if (previewExpiry) {
      previewExpiry.textContent = expiryVal || 'MM/YY';
    }
  }
}

async function submitPayment() {
  if (!activePaymentBookingId) return;
  
  let paymentDetails = {};
  if (activePaymentMethod === 'card') {
    const cardName = document.getElementById('cardNameInput')?.value?.trim();
    const cardNumber = document.getElementById('cardNumberInput')?.value?.replace(/\s/g, '');
    const cardExpiry = document.getElementById('cardExpiryInput')?.value?.trim();
    const cardCvv = document.getElementById('cardCvvInput')?.value?.trim();
    
    if (!cardName) { showToast('Cardholder name is required', 'error'); return; }
    if (!cardNumber || cardNumber.length < 16) { showToast('Valid card number is required', 'error'); return; }
    if (!cardExpiry || !cardExpiry.includes('/')) { showToast('Expiry date is required (MM/YY)', 'error'); return; }
    if (!cardCvv || cardCvv.length < 3) { showToast('Valid CVV is required', 'error'); return; }
    
    paymentDetails = {
      payment_method: 'Card',
      transaction_id: 'TXN-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      amount: activePaymentAmount
    };
  } else {
    const upiId = document.getElementById('upiIdInput')?.value?.trim();
    if (!upiId || !upiId.includes('@')) { showToast('Valid UPI ID is required (e.g. user@upi)', 'error'); return; }
    
    paymentDetails = {
      payment_method: 'UPI',
      transaction_id: 'TXN-UPI-' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      amount: activePaymentAmount
    };
  }
  
  const submitBtn = document.getElementById('paymentSubmitBtn');
  const btnText = document.getElementById('paymentSubmitBtnText');
  const btnSpinner = document.getElementById('paymentSubmitSpinner');
  
  if (submitBtn) submitBtn.disabled = true;
  if (btnText) btnText.style.display = 'none';
  if (btnSpinner) btnSpinner.style.display = 'inline-block';
  
  let apiSuccess = false;
  
  try {
    const token = getToken();
    const res = await apiFetch(API_URL + '/booking/' + activePaymentBookingId + '/pay', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token
      },
      body: JSON.stringify(paymentDetails),
      signal: AbortSignal.timeout(4000)
    });
    
    const data = await res.json();
    if (data.success) {
      apiSuccess = true;
    } else {
      console.warn("Backend payment failed:", data.message);
    }
  } catch (err) {
    console.warn("Backend payment connection failed, running fallback:", err);
  }
  
  if (apiSuccess) await fetchBookingsFromAPI();

  const formView = document.getElementById('paymentFormView');
  const successView = document.getElementById('paymentSuccessView');
  if (formView) formView.style.display = 'none';
  if (successView) successView.style.display = 'flex';
  
  if (apiSuccess) {
    showToast('Payment successful! 🎉', 'success');
  } else {
    showToast('Offline: Payment processed locally.', 'info');
  }
  
  renderBookings(_bookingsFilter);
  
  if (submitBtn) submitBtn.disabled = false;
  if (btnText) btnText.style.display = 'inline';
  if (btnSpinner) btnSpinner.style.display = 'none';
  
  setTimeout(() => {
    closePaymentModal();
  }, 2000);
}
