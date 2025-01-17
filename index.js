const express = require('express');
const moment = require('moment-timezone');
const QRCode = require('qrcode');

const app = express();
const port = process.env.PORT || 3000;

const qrStorage = new Map();

// Fungsi untuk mengganti % dengan spasi
const replacePercentWithSpace = (str) => {
  return str.replace(/%/g, ' ');
};

// Menghapus QR yang sudah expired setiap menit
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of qrStorage.entries()) {
    if (now >= value.expiresAt) {
      qrStorage.delete(key);
    }
  }
}, 60000);

// Format IDR
const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

// Format tanggal dan waktu dalam bahasa Indonesia
const formatIndonesianDateTime = (date) => {
  moment.locale('id');
  return moment(date)
    .tz('Asia/Jakarta')
    .format('dddd, D MMMM YYYY [pukul] HH.mm.ss [WIB]');
};

// Update jumlah dalam QRIS code
const updateQRISAmount = (qrisCode, amount) => {
  const amountIndex = qrisCode.indexOf('5204') + 4;
  const formattedAmount = amount.toString().padStart(13, '0');
  return qrisCode.substring(0, amountIndex) + 
         formattedAmount + 
         qrisCode.substring(amountIndex + 13);
};

// Route untuk membuat QRIS dan QR Code
app.get('/api/create', async (req, res) => {
  try {
    let { amount, qrisCode } = req.query;

    // Ganti % dengan spasi
    if (amount) {
      amount = replacePercentWithSpace(amount);
    }

    if (qrisCode) {
      qrisCode = replacePercentWithSpace(qrisCode);
    }
    
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

    const dynamicQRIS = updateQRISAmount(qrisCode, numericAmount);
    
    const qrBase64 = await QRCode.toDataURL(dynamicQRIS);
    
    const qrId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
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
        download_url: `http://localhost:${port}/api/download/${qrId}` // URL untuk download
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

// Route untuk mendownload QR Code
app.get('/api/download/:id', (req, res) => {
  const { id } = req.params;
  const qrData = qrStorage.get(id);

  if (!qrData) {
    return res.status(404).json({
      status: 'error',
      message: 'QR code not found or expired'
    });
  }

  const base64Data = qrData.data.replace(/^data:image\/png;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename=qris_${id}.png`);
  res.send(imageBuffer);
});

// Mulai server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
