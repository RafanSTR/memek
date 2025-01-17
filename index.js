const express = require('express');
const QRCode = require('qrcode');
const { format } = require('date-fns');
const { id } = require('date-fns/locale');
const fs = require('fs-extra');
const path = require('path');

const app = express();

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
fs.ensureDirSync(downloadsDir);

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

function cleanupFile(filePath) {
  setTimeout(async () => {
    try {
      await fs.remove(filePath);
      console.log(`Cleaned up file: ${filePath}`);
    } catch (error) {
      console.error(`Error cleaning up file: ${filePath}`, error);
    }
  }, 5 * 60 * 1000); // 5 minutes
}

// Serve static files from the downloads directory
app.use('/downloads', express.static(downloadsDir));

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

    // Generate unique filename
    const timestamp = Date.now();
    const filename = `qris_${timestamp}.png`;
    const filePath = path.join(downloadsDir, filename);

    // Generate QR code and save to file
    await QRCode.toFile(filePath, finalQris);

    // Schedule cleanup
    cleanupFile(filePath);
    
    // Get current timestamp
    const now = new Date();
    
    // Format the date in Indonesian
    const formattedDate = format(now, "EEEE, d MMMM yyyy 'pukul' HH.mm.ss 'WIB'", {
      locale: id
    });

    // Generate download URL
    const baseUrl = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}`
      : `http://localhost:${process.env.PORT || 3000}`;
    const downloadUrl = `${baseUrl}/downloads/${filename}`;

    res.json({
      status: 'success',
      timestamp: now.toISOString(),
      data: {
        amount: parseInt(amount),
        formatted_amount: formatCurrency(amount),
        generated_at: formattedDate,
        download_url: downloadUrl
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
