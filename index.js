const express = require('express');
const moment = require('moment-timezone');
const QRCode = require('qrcode');

// Fungsi untuk menghitung CRC16
function convertCRC16(str) {
  let crc = 0xFFFF;
  for (let c = 0; c < str.length; c++) {
    crc ^= str.charCodeAt(c) << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  return (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// Fungsi untuk mengganti % menjadi spasi setelah decoding URL
const replacePercentWithSpace = (str) => {
  const decodedStr = decodeURIComponent(str);
  return decodedStr.replace(/%/g, ' ');
};

// Fungsi untuk memperbarui jumlah dalam QRIS
const updateQRISAmount = (qrisCode, amount) => {
  const amountIndex = qrisCode.indexOf('54');
  if (amountIndex === -1) {
    throw new Error("Invalid QRIS format: '54' tag not found.");
  }

  const amountTagLength = 6; // '54' tag length + 2 for its length (e.g., '5408')
  const newAmount = amount.toFixed(2).toString().replace('.', '');
  const updatedQRIS = qrisCode.substring(0, amountIndex + amountTagLength) + newAmount + qrisCode.substring(amountIndex + amountTagLength + newAmount.length);

  // Hapus CRC16 lama jika ada
  const crcIndex = updatedQRIS.lastIndexOf('6304');
  if (crcIndex === -1) {
    throw new Error("Invalid QRIS format: '6304' tag not found.");
  }

  const qrisWithoutCRC = updatedQRIS.substring(0, crcIndex + 4);
  const crc16 = convertCRC16(qrisWithoutCRC);
  return qrisWithoutCRC + crc16;
};

// Format jumlah menjadi format IDR
const formatIDR = (amount) => {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
};

// Format tanggal ke bahasa Indonesia
const formatIndonesianDateTime = (date) => {
  moment.locale('id');
  return moment(date).tz('Asia/Jakarta').format('dddd, D MMMM YYYY [pukul] HH.mm.ss [WIB]');
};

const app = express();
const port = process.env.PORT || 3000;
const qrStorage = new Map();

// Interval untuk menghapus QR yang telah kadaluarsa
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of qrStorage.entries()) {
    if (now >= value.expiresAt) {
      qrStorage.delete(key);
    }
  }
}, 60000);

app.get('/api/create', async (req, res) => {
  try {
    let { amount, qrisCode } = req.query;

    if (amount) amount = replacePercentWithSpace(amount);
    if (qrisCode) qrisCode = replacePercentWithSpace(qrisCode);

    if (!amount || !qrisCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Amount and QRIS code are required'
      });
    }

    const numericAmount = parseFloat(amount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid amount'
      });
    }

    const dynamicQRIS = updateQRISAmount(qrisCode, numericAmount);
    const qrBase64 = await QRCode.toDataURL(dynamicQRIS);

    const qrId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    const expiresAt = Date.now() + 5 * 60 * 1000;

    qrStorage.set(qrId, { data: qrBase64, expiresAt });

    const now = new Date();
    res.json({
      status: 'success',
      timestamp: now.toISOString(),
      data: {
        amount: numericAmount,
        formatted_amount: formatIDR(numericAmount).replace('Rp\u00a0', 'Rp '),
        generated_at: formatIndonesianDateTime(now),
        download_url: `https://memek-gamma.vercel.app/api/download/${qrId}`
      }
    });
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      status: 'error',
      message: error.message
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

  const base64Data = qrData.data.replace(/^data:image\/png;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename=qris_${id}.png`);
  res.send(imageBuffer);
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});

