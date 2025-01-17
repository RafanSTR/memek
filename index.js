const express = require('express');
const moment = require('moment-timezone');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

// In-memory storage for QR codes with TTL
const qrStorage = new Map();

// Cleanup expired QR codes every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of qrStorage.entries()) {
    if (now >= value.expiresAt) {
      qrStorage.delete(key);
    }
  }
}, 60000);

// Format currency to IDR
const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

// Format date in Indonesian
const formatIndonesianDateTime = (date) => {
  moment.locale('id');
  return moment(date)
    .tz('Asia/Jakarta')
    .format('dddd, D MMMM YYYY [pukul] HH.mm.ss [WIB]');
};

// Update QRIS amount
const updateQRISAmount = (qrisCode, amount) => {
  const amountIndex = qrisCode.indexOf('5204') + 4;
  const formattedAmount = amount.toString().padStart(13, '0');
  return qrisCode.substring(0, amountIndex) + 
         formattedAmount + 
         qrisCode.substring(amountIndex + 13);
};

app.get('/api/create', async (req, res) => {
  try {
    const { amount, qrisCode } = req.query;
    
    if (!amount || !qrisCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Amount and QRIS code are required'
      });
    }

    const numericAmount = parseInt(amount, 10);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid amount'
      });
    }

    // Generate dynamic QRIS
    const dynamicQRIS = updateQRISAmount(qrisCode, numericAmount);
    
    // Generate QR code as base64
    const qrBase64 = await QRCode.toDataURL(dynamicQRIS);
    
    // Generate unique ID for this QR code
    const qrId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    // Store QR code with 5-minute expiration
    const expiresAt = Date.now() + (5 * 60 * 1000); // 5 minutes
    qrStorage.set(qrId, {
      data: qrBase64,
      expiresAt
    });

    const now = new Date();
    
    res.json({
      status: 'success',
      timestamp: now.toISOString(),
      data: {
        amount: numericAmount,
        formatted_amount: formatIDR(numericAmount).replace('Rp\u00a0', 'Rp '),
        generated_at: formatIndonesianDateTime(now),
        download_url: `/api/download/${qrId}`
      }
    });
  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  }
});

app.get('/api/download/:id', (req, res) => {
  const { id } = req.params;
  const qrData = qrStorage.get(id);

  if (!qrData) {
    return res.status(404).json({
      status: 'error',
      message: 'QR code not found or expired'
    });
  }

  // Extract base64 data (remove data:image/png;base64, prefix)
  const base64Data = qrData.data.replace(/^data:image\/png;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename=qris_${id}.png`);
  res.send(imageBuffer);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});