#include <WiFi.h>
#include <PubSubClient.h>
#include <HardwareSerial.h>



// ===== WiFi =====
const char* WIFI_SSID = "BESTWIFI  2.4G";
const char* WIFI_PASS = "00812345";

// ===== NETPIE MQTT =====
const char* MQTT_SERVER     = "mqtt.netpie.io";
const int   MQTT_PORT     = 1883;

// ใช้ ClientID / Token / Secret จาก Device “B” ใน NETPIE
const char* NETPIE_CLIENT_ID = "461806bc-f235-4670-93c4-cb33577639f8";   // Client ID
const char* NETPIE_TOKEN  = "ufYvNyt3CvVPjANSJqLkkyLe7mCgua2R";       // Token
const char* NETPIE_SECRET  = "oz286XbiPeM94p582Uooxc9LRc35PWxP";       // Secret

// Topic ที่จะ Publish ไป (ให้ตรงกับที่ใช้ใน MQTT Explorer)
const char* MQTT_TOPIC_PUB   = "@msg/stm32";
const char* MQTT_TOPIC_CMD   = "@msg/stm32/cmd"; // Topic รับคำสั่งจากเว็บ

//==================== MQTT Client ====================
WiFiClient espClient;
PubSubClient mqttClient(espClient);

//==================== UART กับ STM32 =================
#define STM_RX_PIN 18   // ESP32 RX  ต่อกับ STM32 TX (PA9)
#define STM_TX_PIN 17   // ESP32 TX  ต่อกับ STM32 RX (PA10)
HardwareSerial stmSerial(1);   // ใช้ UART1 ของ ESP32

//==================== Helper Functions ===============
void mqttCallback(char* topic, byte* payload, unsigned int length) {
  // แปลง payload เป็นสตริง
  String msg;
  msg.reserve(length + 1);
  for (unsigned int i = 0; i < length; i++) {
    msg += static_cast<char>(payload[i]);
  }
  msg.trim();

  Serial.print("MQTT msg [");
  Serial.print(topic);
  Serial.print("] => ");
  Serial.println(msg);

  // รับเฉพาะ topic คำสั่ง แล้วส่งต่อไป STM32 ผ่าน UART6
  if (strcmp(topic, MQTT_TOPIC_CMD) == 0 && msg.length() > 0) {
    // ถ้าเว็บส่งมาแบบ LIGHT=ON ตรง ๆ ให้เติม CMD; ให้ STM32 เข้าใจ
    if (!msg.startsWith("CMD;") && !msg.startsWith("cmd;")) {
      msg = "CMD;" + msg;
    }
    msg.toUpperCase();

    stmSerial.print(msg);
    stmSerial.print("\n");
    Serial.print("Forward CMD to STM32: ");
    Serial.println(msg);
  }
}

void connectWiFi() {
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("Connecting WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  Serial.print("WiFi connected. IP = ");
  Serial.println(WiFi.localIP());
}

void connectMQTT() {
  while (!mqttClient.connected()) {
    Serial.print("Connecting NETPIE...");
    // clientId, username(token), password(secret)
    if (mqttClient.connect(NETPIE_CLIENT_ID, NETPIE_TOKEN, NETPIE_SECRET)) {
      Serial.println("connected");
      mqttClient.subscribe(MQTT_TOPIC_CMD);
      // ถ้าจะ subscribe topic อื่นเพิ่ม ก็ทำที่นี่
      // mqttClient.subscribe("@msg/xxx");
    } else {
      Serial.print("failed, rc=");
      Serial.println(mqttClient.state());
      Serial.println("Retry in 2 seconds...");
      delay(2000);
    }
  }
}

/**
 * แปลงสตริงจาก STM32:
 *   (ฟิลด์ MODE / INTR ไม่ได้ใช้งานแล้ว)
 *   STATUS;LIGHT=1;LDR=1250;DIST=225;NOISE=LOW
 * ให้กลายเป็น JSON:
 *   {"LIGHT":1,"LDR":1250,"DIST":225.0,"NOISE":"LOW"}
 */
String statusToJson(const String &line) {
  char noise[16];
  int  light;
  unsigned int ldr;
  float dist;

  int matched = sscanf(
    line.c_str(),
    "STATUS;LIGHT=%d;LDR=%u;DIST=%f;NOISE=%15[^;]",
    &light, &ldr, &dist, noise
  );

  // ถ้า parse ไม่ครบ 4 ตัว แสดงว่า format เพี้ยน → ส่ง string ดิบไปแทน
  if (matched != 4) {
    Serial.println("Parse failed, publish raw string");
    return "\"" + line + "\"";
  }

  String json = "{";
  json += "\"LIGHT\":"  + String(light) + ",";
  json += "\"LDR\":"    + String(ldr)   + ",";
  json += "\"DIST\":"   + String(dist, 1) + ",";
  json += "\"NOISE\":\""+ String(noise) + "\"";
  json += "}";

  return json;
}

//==================== Arduino Setup ==================
void setup() {
  Serial.begin(115200);
  delay(1000);

  // UART ไป STM32
  stmSerial.begin(115200, SERIAL_8N1, STM_RX_PIN, STM_TX_PIN);
  Serial.println("ESP32 ready, waiting for STM32...");

  // WiFi + MQTT
  connectWiFi();
  mqttClient.setServer(MQTT_SERVER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
  connectMQTT();
}

//==================== Arduino Loop ===================
void loop() {
  // ดูแลการเชื่อมต่อ MQTT
  if (!mqttClient.connected()) {
    connectMQTT();
  }
  mqttClient.loop();

  // ถ้ามีข้อมูลจาก STM32 ทาง UART
  if (stmSerial.available()) {
    String line = stmSerial.readStringUntil('\n');
    line.trim();          // ตัด \r \n และช่องว่างท้ายข้อความออก

    if (line.length() == 0) return;

    Serial.print("From STM32: ");
    Serial.println(line);

    String json = statusToJson(line);

    Serial.print("Publish JSON: ");
    Serial.println(json);

    mqttClient.publish(MQTT_TOPIC_PUB, json.c_str());
  }
}
