// server.js
const express = require('express');
const cors = require('cors');
const mqtt = require('mqtt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, 'config.env') });

const PUBLIC_DIR = path.join(__dirname, 'public');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(PUBLIC_DIR)); // serve frontend assets

// ---------- 1) ค่า NETPIE ของคุณ ----------
// รองรับทั้งชื่อแปรแบบ username/password และ token/secret ให้ตรงกับไฟล์ netpiestm32.txt
const NETPIE_CLIENT_ID = process.env.NETPIE_CLIENT_ID;
const NETPIE_USERNAME  = process.env.NETPIE_USERNAME;
const NETPIE_PASSWORD  = process.env.NETPIE_PASSWORD;
const NETPIE_HOST      = process.env.NETPIE_HOST || 'mqtts://mqtt.netpie.io:8883';

const requiredValues = {
  'NETPIE_CLIENT_ID': NETPIE_CLIENT_ID,
  'NETPIE_USERNAME': NETPIE_USERNAME,
  'NETPIE_PASSWORD': NETPIE_PASSWORD,
  'NETPIE_HOST': NETPIE_HOST,
};

const missingEnv = Object.entries(requiredValues)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missingEnv.length) {
  console.error('Missing required NETPIE env vars:', missingEnv.join(', '));
  process.exit(1);
}

// topic ที่ ESP32 publish อยู่ (กำหนดให้ตรงกับที่ใช้จริง)
const SUB_TOPIC = '@msg/stm32';

// ---------- 2) ตัวแปรเก็บสถานะล่าสุด ----------
let lastStatus = null;   // เก็บ object แปลงจากข้อความ STATUS/JSON
let lastRawMessage = ''; // เก็บข้อความดิบไว้ debug

// ---------- 3) เชื่อม MQTT ไป NETPIE ----------
const mqttClient = mqtt.connect(NETPIE_HOST, {
  clientId: NETPIE_CLIENT_ID,
  username: NETPIE_USERNAME,
  password: NETPIE_PASSWORD,
  protocolVersion: 4, // MQTT 3.1.1 (ตรงกับที่ ESP32 ใช้)
});

mqttClient.on('connect', () => {
  console.log('Connected to NETPIE MQTT');
  mqttClient.subscribe(SUB_TOPIC, (err) => {
    if (!err) {
      console.log('Subscribed to topic:', SUB_TOPIC);
    } else {
      console.error('Subscribe error:', err);
    }
  });
});

mqttClient.on('error', (err) => {
  console.error('MQTT Error:', err);
});

// เมื่อมีข้อความจาก STM32 ผ่าน NETPIE มา
mqttClient.on('message', (topic, message) => {
  const msgStr = message.toString().trim();
  lastRawMessage = msgStr;
  console.log('[MQTT]', topic, msgStr);

  const parsed = parseIncomingPayload(msgStr);
  if (parsed) {
    lastStatus = parsed;
  }
});

// แปลง payload ให้เป็น object เดียวกัน ไม่ว่าจะมาจาก STATUS;... หรือ JSON string
function parseIncomingPayload(payload) {
  if (!payload) return null;

  // กรณีส่งรูปแบบ "STATUS;KEY=VAL;..."
  if (payload.startsWith('STATUS;')) {
    return parseStatusLine(payload);
  }

  // กรณีส่ง JSON (ตรงกับโค้ด ESP32 ใน netpiestm32.txt)
  try {
    const json = JSON.parse(payload);
    if (typeof json === 'string') {
      // ถ้าด้านในเป็นสตริง STATUS;... ก็แปลงอีกชั้น
      if (json.startsWith('STATUS;')) {
        return parseStatusLine(json);
      }
      return { message: json };
    }
    if (json && typeof json === 'object') {
      return json;
    }
  } catch (e) {
    console.error('parseIncomingPayload JSON error:', e.message);
  }

  return null;
}

// ฟังก์ชันแปลง "STATUS;KEY=VAL;KEY=VAL" → object
function parseStatusLine(line) {
  try {
    // ตัดคำว่า STATUS; ออก
    const parts = line.replace(/^STATUS;/, '').split(';');
    const obj = {};
    parts.forEach((p) => {
      const [k, v] = p.split('=');
      if (!k) return;
      // แปลงตัวเลข
      if (!isNaN(v)) {
        obj[k] = Number(v);
      } else {
        obj[k] = v;
      }
    });
    return obj;
  } catch (e) {
    console.error('parseStatus error:', e);
    return null;
  }
}

// ---------- 4) REST API ให้ Frontend เรียก ----------

// ดูสถานะล่าสุด
app.get('/status', (req, res) => {
  if (!lastStatus) {
    return res.status(200).json({
      ok: false,
      message: 'No data yet',
      raw: lastRawMessage,
    });
  }
  res.json({
    ok: true,
    data: lastStatus,
    raw: lastRawMessage,
    updatedAt: new Date().toISOString(),
  });
});

// health check
app.get('/health', (req, res) => {
  res.send('Smart Light Backend is running.');
});

// serve dashboard
app.get('/', (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
});

// ---------- 5) Start server ----------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('Backend server listening on port', PORT);
});
