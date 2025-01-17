const express = require('express');
const QRCode = require('qrcode');
const { format } = require('date-fns');
const { id } = require('date-fns/locale');

const app = express();

function charCodeAt(str, i) {
  return str.charCodeAt(i);
}

function convertCRC16(str) {
  let crc = 0xFFFF;
  const strlen = str.length;
  
  for (let c = 0; c < strlen; c++) {
    crc ^= charCodeAt(str, c) << 8;
    for (let i = 0; i < 8; i++) {
      if (crc & 0x8000) {
        crc = (crc << 1) ^ 0x1021;
      } else {
        crc = crc << 1;
      }
    }
  }
  
  let hex = (crc & 0xFFFF).toString(16).toUpperCase();
  if (hex.length === 3) hex = "0" + hex;
  return hex;
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

app.get('/api/create', async (req, res) => {
  try {
    const { amount, qrisCode } = req.query;
    
    if (!amount || !qrisCode) {
      return res.status(400).json({
        status: 'error',
        message: 'Amount and QRIS code are required'
      });
    }

    // Remove last 4 characters (CRC16)
    const qrisWithoutCRC = qrisCode.slice(0, -4);
    
    // Replace static identifier with dynamic
    let step1 = qrisWithoutCRC.replace("010211", "010212");
    
    // Split at merchant country code
    const step2 = step1.split("5802ID");
    
    // Create amount field
    const amountField = "54" + String(amount).length.toString().padStart(2, '0') + amount;
    
    // Combine all parts
    const newQris = step2[0] + amountField + "5802ID" + step2[1];
    
    // Add CRC16
    const finalQris = newQris + convertCRC16(newQris);

    // Generate QR code
    const qrImageBuffer = await QRCode.toBuffer(finalQris);
    const qrBase64 = qrImageBuffer.toString('base64');
    
    // Get current timestamp
    const now = new Date();
    
    // Format the date in Indonesian
    const formattedDate = format(now, "EEEE, d MMMM yyyy 'pukul' HH.mm.ss 'WIB'", {
      locale: id
    });

    res.json({
      status: 'success',
      timestamp: now.toISOString(),
      data: {
        amount: parseInt(amount),
        formatted_amount: formatCurrency(amount),
        generated_at: formattedDate,
        qris_content: finalQris,
        qr_image: `data:image/png;base64,${qrBase64}`
      }
    });

  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: error.message
    });
  }
});

// For local development
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

module.exports = app;
