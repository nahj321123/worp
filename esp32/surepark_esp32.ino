/**
 * SurePark Baguio — ESP32 Firmware
 * ==================================
 * Handles one parking slot per board.
 *
 * Hardware per slot:
 *   - HC-SR04 ultrasonic sensor  → detects car presence
 *   - SG90 / MG996R servo motor  → raises / lowers bollard
 *   - Green LED (GPIO 25)         → slot available
 *   - Red LED   (GPIO 26)         → slot occupied / bollard up
 *
 * Libraries required (install via Arduino Library Manager):
 *   - ArduinoJson   by Benoit Blanchon   (v6.x)
 *   - ESP32Servo    by Kevin Harrington
 *
 * Board: "ESP32 Dev Module"  (Tools → Board → ESP32 Arduino)
 *
 * ─────────────────────────────────────────────────────────────
 *  WIRING DIAGRAM
 * ─────────────────────────────────────────────────────────────
 *
 *  HC-SR04 Ultrasonic
 *  ┌──────────┐
 *  │ VCC  ────┼──── 5V
 *  │ GND  ────┼──── GND
 *  │ TRIG ────┼──── GPIO 5
 *  │ ECHO ────┼──── GPIO 18  (use a 1kΩ / 2kΩ voltage divider
 *  └──────────┘              to bring 5V echo → 3.3V for ESP32)
 *
 *  SG90 Servo (bollard motor)
 *  ┌──────────┐
 *  │ VCC  ────┼──── 5V  (external 5V supply recommended)
 *  │ GND  ────┼──── GND (shared with ESP32)
 *  │ PWM  ────┼──── GPIO 13
 *  └──────────┘
 *
 *  Status LEDs
 *  Green LED  anode ─ 220Ω ─ GPIO 25 ─ GND
 *  Red   LED  anode ─ 220Ω ─ GPIO 26 ─ GND
 *
 * ─────────────────────────────────────────────────────────────
 *  CONFIGURATION  (edit the four lines below before flashing)
 * ─────────────────────────────────────────────────────────────
 */

// =============================================================
//  STEP 1 — CHANGE THESE 4 VALUES BEFORE UPLOADING
//  (everything else can stay as-is for first test)
// =============================================================
#define WIFI_SSID        "YOUR_WIFI_NAME"       // your WiFi network name
#define WIFI_PASSWORD    "YOUR_WIFI_PASSWORD"   // your WiFi password
#define SERVER_IP        "192.168.1.100"        // PC IP running npm run dev
                                                // Windows: run ipconfig
                                                // Mac/Linux: run ifconfig
#define SLOT_ID          1                      // 1 to 5, one per ESP32 board
// =============================================================

// =============================================================
//  STEP 2 — CHECK YOUR PIN WIRING MATCHES THESE
//  Change the numbers if you used different GPIO pins
// =============================================================
#define TRIG_PIN         5    // HC-SR04 TRIG  → GPIO 5
#define ECHO_PIN         18   // HC-SR04 ECHO  → GPIO 18 (via voltage divider!)
#define SERVO_PIN        13   // SG90 signal   → GPIO 13
#define LED_GREEN_PIN    25   // Green LED     → GPIO 25 (via 220 ohm resistor)
#define LED_RED_PIN      26   // Red LED       → GPIO 26 (via 220 ohm resistor)
// =============================================================

// =============================================================
//  STEP 3 — TUNE THESE IF NEEDED AFTER FIRST TEST
// =============================================================
#define SERVER_PORT      3000   // Next.js default port — do not change
#define SERVO_UP_DEG     90     // Servo angle when bollard is RAISED (blocking)
#define SERVO_DOWN_DEG   0      // Servo angle when bollard is LOWERED (open)
#define CAR_DISTANCE_CM  50     // If sensor reads below this → car is present
                                // Increase if sensor triggers too early
                                // Decrease if car is not being detected
#define SENSOR_INTERVAL  200    // Read sensor every 200 ms
#define POLL_INTERVAL    2000   // Ask server for bollard command every 2 s
#define DEBOUNCE_COUNT   3      // Need 3 same readings in a row to confirm change
                                // Prevents false triggers from sensor noise
// =============================================================

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <ESP32Servo.h>

// ---------- runtime state (do not edit) ----------------------
Servo  bollardServo;
bool   carPresent        = false;
bool   lastReportedState = false;
bool   bollardIsUp       = false;
int    debounceCounter   = 0;
unsigned long lastSensorMs = 0;
unsigned long lastPollMs   = 0;

// =============================================================
//  FUNCTION: readDistanceCm
//  Fires the HC-SR04 and returns distance in centimetres.
//  Returns 999.0 if nothing is detected (timeout).
// =============================================================
float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // wait max 30 ms for echo
  if (duration == 0) return 999.0;                // no echo returned
  return (duration * 0.0343f) / 2.0f;            // convert to cm
}

// =============================================================
//  FUNCTION: moveBollard
//  Moves the servo and updates the status LEDs.
//  raise = true  → servo goes to SERVO_UP_DEG,   red LED ON
//  raise = false → servo goes to SERVO_DOWN_DEG, green LED ON
// =============================================================
void moveBollard(bool raise) {
  int targetDeg = raise ? SERVO_UP_DEG : SERVO_DOWN_DEG;
  bollardServo.write(targetDeg);
  bollardIsUp = raise;

  digitalWrite(LED_RED_PIN,   raise ? HIGH : LOW);
  digitalWrite(LED_GREEN_PIN, raise ? LOW  : HIGH);

  Serial.print("[BOLLARD] ");
  Serial.println(raise ? "RAISED (blocking)" : "LOWERED (open)");
}

// =============================================================
//  FUNCTION: postSensorEvent
//  Sends car presence data to the web server.
//  The server then updates the parking slot status automatically.
//
//  Sends to: POST http://<SERVER_IP>:3000/api/sensor
//  Body:     { "slotId": 1, "carPresent": true/false }
// =============================================================
void postSensorEvent(bool presence) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[SENSOR] WiFi not connected, skipping POST");
    return;
  }

  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/sensor";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000); // 5 second timeout

  // Build JSON body
  StaticJsonDocument<64> doc;
  doc["slotId"]     = SLOT_ID;
  doc["carPresent"] = presence;
  String body;
  serializeJson(doc, body);

  int httpCode = http.POST(body);
  http.end();

  Serial.print("[SENSOR] POST to server → HTTP ");
  Serial.print(httpCode);
  Serial.print("  body: ");
  Serial.println(body);

  if (httpCode == 200) {
    Serial.println("[SENSOR] Server acknowledged. Slot status updated.");
    lastReportedState = presence;
  } else {
    Serial.println("[SENSOR] Server error or unreachable. Will retry next change.");
  }
}

// =============================================================
//  FUNCTION: pollBollardCommand
//  Asks the server what position the bollard should be in.
//  The web app dashboard controls this when user clicks
//  "Raise Bollard" or "Lower Bollard".
//
//  Calls: GET http://<SERVER_IP>:3000/api/bollard?slotId=1
//  Response: { "bollardUp": true/false }
// =============================================================
void pollBollardCommand() {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT
               + "/api/bollard?slotId=" + String(SLOT_ID);
  http.begin(url);
  http.setTimeout(5000);

  int httpCode = http.GET();

  if (httpCode == 200) {
    String payload = http.getString();
    StaticJsonDocument<128> doc;
    DeserializationError err = deserializeJson(doc, payload);

    if (!err) {
      bool serverWantsBollardUp = doc["bollardUp"].as<bool>();

      // Only move if the desired state is different from current state
      if (serverWantsBollardUp != bollardIsUp) {
        Serial.print("[BOLLARD] Server command received → ");
        Serial.println(serverWantsBollardUp ? "RAISE" : "LOWER");
        moveBollard(serverWantsBollardUp);
      }
    } else {
      Serial.println("[BOLLARD] Failed to parse server response");
    }
  } else {
    Serial.print("[BOLLARD] Server poll failed → HTTP ");
    Serial.println(httpCode);
  }

  http.end();
}

// =============================================================
//  FUNCTION: connectWifi
//  Connects to WiFi. Blinks red LED while connecting.
//  Will keep retrying forever until connected.
// =============================================================
void connectWifi() {
  Serial.print("[WIFI] Connecting to: ");
  Serial.println(WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int dots = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    dots++;

    // Blink red LED while connecting
    digitalWrite(LED_RED_PIN, dots % 2 == 0 ? HIGH : LOW);

    if (dots >= 40) {
      Serial.println();
      Serial.println("[WIFI] Still trying...");
      dots = 0;
    }
  }

  digitalWrite(LED_RED_PIN, LOW);
  Serial.println();
  Serial.print("[WIFI] Connected! ESP32 IP address: ");
  Serial.println(WiFi.localIP());
}

// =============================================================
//  SETUP — runs once when ESP32 powers on or resets
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(500); // give Serial Monitor time to open
  Serial.println("========================================");
  Serial.println("  SurePark Baguio — ESP32 Firmware");
  Serial.print  ("  Slot ID: ");
  Serial.println(SLOT_ID);
  Serial.println("========================================");

  // Configure GPIO pins
  pinMode(TRIG_PIN,      OUTPUT);
  pinMode(ECHO_PIN,      INPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN,   OUTPUT);

  // Start LEDs off
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN,   LOW);

  // Attach servo and start in LOWERED (open) position
  bollardServo.attach(SERVO_PIN);
  Serial.println("[BOLLARD] Starting in LOWERED position...");
  moveBollard(false);
  delay(500);

  // Connect to WiFi
  connectWifi();

  // Flash green LED 3 times = ready
  for (int i = 0; i < 3; i++) {
    digitalWrite(LED_GREEN_PIN, HIGH); delay(200);
    digitalWrite(LED_GREEN_PIN, LOW);  delay(200);
  }

  Serial.println("[SYSTEM] Ready. Monitoring slot...");
  Serial.println();
}

// =============================================================
//  LOOP — runs repeatedly forever
// =============================================================
void loop() {
  unsigned long now = millis();

  // -----------------------------------------------------------
  //  TASK 1: Read ultrasonic sensor every SENSOR_INTERVAL ms
  // -----------------------------------------------------------
  if (now - lastSensorMs >= SENSOR_INTERVAL) {
    lastSensorMs = now;

    float distanceCm = readDistanceCm();
    bool  carDetected = (distanceCm < CAR_DISTANCE_CM);

    Serial.print("[SENSOR] Distance: ");
    Serial.print(distanceCm);
    Serial.print(" cm  →  Car: ");
    Serial.println(carDetected ? "DETECTED" : "none");

    // Debounce: require DEBOUNCE_COUNT same readings before acting
    if (carDetected == carPresent) {
      debounceCounter = 0; // reading matches current state, reset
    } else {
      debounceCounter++;
      Serial.print("[SENSOR] State change candidate (");
      Serial.print(debounceCounter);
      Serial.print("/");
      Serial.print(DEBOUNCE_COUNT);
      Serial.println(")");

      if (debounceCounter >= DEBOUNCE_COUNT) {
        carPresent      = carDetected;
        debounceCounter = 0;
        Serial.print("[SENSOR] CONFIRMED: car is now ");
        Serial.println(carPresent ? "PRESENT" : "GONE");

        // Only POST to server if the state actually changed from last report
        if (carPresent != lastReportedState) {
          postSensorEvent(carPresent);
        }

        // If car just arrived, raise bollard immediately (local response)
        // Server will also confirm this via bollard poll below
        if (carPresent && !bollardIsUp) {
          moveBollard(true);
        }
      }
    }
  }

  // -----------------------------------------------------------
  //  TASK 2: Poll server for bollard command every POLL_INTERVAL ms
  //  This lets the web dashboard remotely raise/lower the bollard
  // -----------------------------------------------------------
  if (now - lastPollMs >= POLL_INTERVAL) {
    lastPollMs = now;
    pollBollardCommand();
  }

  // -----------------------------------------------------------
  //  TASK 3: Reconnect WiFi if connection drops
  // -----------------------------------------------------------
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WIFI] Connection lost. Reconnecting...");
    WiFi.reconnect();
    delay(2000);
  }
}
