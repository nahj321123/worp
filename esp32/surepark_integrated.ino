#include <ESP32Servo.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>

// =====================================================
//   CHANGE THESE 3 VALUES BEFORE UPLOADING
// =====================================================
#define WIFI_SSID      "YOUR_WIFI_NAME"
#define WIFI_PASSWORD  "YOUR_WIFI_PASSWORD"
#define SERVER_IP      "192.168.1.100"
#define SERVER_PORT    3000
// =====================================================

// =====================================================
//   LED BEHAVIOUR — matches exact user request
//   ─────────────────────────────────────────────────
//   App State       LED      Bollard     Sensor
//   ─────────────────────────────────────────────────
//   Available     → GREEN    Closed      Off
//   Reserved      → BLUE     Closed      Off
//   Reserved+Paid → BLUE     Closed      Off
//   Bollard Open  → BLUE     Open        Watching
//   Car Parked    → RED      Open        Detecting
//   Car Left      → GREEN    Closed      Off (reset)
//   ─────────────────────────────────────────────────
//   GREEN = available / empty
//   BLUE  = reserved (with or without payment)
//   RED   = occupied / car is parked
// =====================================================

struct ParkingSystem {
  int slotId;
  int trig, echo;
  int servoPin;
  int ledGreen;  // available — slot is empty and free
  int ledBlue;   // reserved  — slot is booked
  int ledRed;    // occupied  — car is parked

  Servo servo;

  int openAngle  = 0;   // servo angle = bollard LOWERED (car can enter)
  int closeAngle = 90;  // servo angle = bollard RAISED  (blocking)

  // ---- runtime state ----
  bool bollardOpen     = false;
  bool lastReportedCar = false;
  unsigned long lastSensor = 0;
  unsigned long lastPoll   = 0;
  int distance = 0;

  // ---- flags from /api/command (polled every 2 s) ----
  bool appReserved  = false;  // slot.status === "reserved"
  bool appPaid      = false;  // slot.paid === true
  bool appBollardUp = true;   // true = closed, false = open
  bool appOccupied  = false;  // slot.status === "occupied"

  enum State {
    AVAILABLE,   // green LED, bollard closed, sensor off
    RESERVED,    // blue LED,  bollard closed, sensor off
    GATE_OPEN,   // blue LED,  bollard open,   sensor watching
    OCCUPIED,    // red LED,   bollard open,   sensor detecting
  };

  State state = AVAILABLE;
};

// =====================================================
//   ULTRASONIC READ
// =====================================================
int readDistance(int trig, int echo) {
  digitalWrite(trig, LOW);
  delayMicroseconds(2);
  digitalWrite(trig, HIGH);
  delayMicroseconds(10);
  digitalWrite(trig, LOW);
  long dur = pulseIn(echo, HIGH, 25000);
  return dur * 0.034 / 2;
}

// =====================================================
//   SET LEDS — only one on at a time
// =====================================================
void setLEDs(ParkingSystem &s, bool green, bool blue, bool red) {
  digitalWrite(s.ledGreen, green ? HIGH : LOW);
  digitalWrite(s.ledBlue,  blue  ? HIGH : LOW);
  digitalWrite(s.ledRed,   red   ? HIGH : LOW);
}

// =====================================================
//   WIFI
// =====================================================
void connectWiFi() {
  Serial.print("[WiFi] Connecting to: ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
    if (++attempts >= 40) {
      Serial.println("\n[WiFi] Failed — check SSID/password.");
      return;
    }
  }
  Serial.println();
  Serial.print("[WiFi] Connected. IP: ");
  Serial.println(WiFi.localIP());
}

// =====================================================
//   POLL /api/command  (every 2 seconds)
//   Returns: reserved, paid, bollardUp, occupied
// =====================================================
void pollCommand(ParkingSystem &s) {
  if (WiFi.status() != WL_CONNECTED) return;
  if (millis() - s.lastPoll < 2000) return;
  s.lastPoll = millis();

  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT
               + "/api/command?slotId=" + String(s.slotId);
  http.begin(url);
  http.setTimeout(4000);
  int code = http.GET();

  if (code == 200) {
    String payload = http.getString();
    StaticJsonDocument<128> doc;
    if (!deserializeJson(doc, payload)) {
      s.appReserved  = doc["reserved"].as<bool>();
      s.appPaid      = doc["paid"].as<bool>();
      s.appBollardUp = doc["bollardUp"].as<bool>();
      s.appOccupied  = doc["occupied"].as<bool>();
    }
  }
  http.end();
}

// =====================================================
//   POST /api/sensor
//   car arrived → status becomes occupied (red LED)
//   car left    → status resets to available (green LED)
// =====================================================
void postSensorEvent(int slotId, bool carPresent) {
  if (WiFi.status() != WL_CONNECTED) return;

  HTTPClient http;
  String url = String("http://") + SERVER_IP + ":" + SERVER_PORT + "/api/sensor";
  http.begin(url);
  http.addHeader("Content-Type", "application/json");
  http.setTimeout(5000);

  StaticJsonDocument<64> doc;
  doc["slotId"]     = slotId;
  doc["carPresent"] = carPresent;
  String body;
  serializeJson(doc, body);

  int code = http.POST(body);
  http.end();

  Serial.print("[Sensor] Slot ");
  Serial.print(slotId);
  Serial.print(carPresent ? " → CAR ARRIVED  HTTP " : " → CAR LEFT  HTTP ");
  Serial.println(code);
}

// =====================================================
//   MOVE BOLLARD — skips if already in position
// =====================================================
void moveBollard(ParkingSystem &s, bool open) {
  if (open == s.bollardOpen) return;
  s.servo.write(open ? s.openAngle : s.closeAngle);
  s.bollardOpen = open;
  Serial.print("[Bollard] Slot "); Serial.print(s.slotId);
  Serial.println(open ? " → OPEN" : " → CLOSED");
}

// =====================================================
//   UPDATE SYSTEM — called every loop() per slot
//
//   FULL STATE MACHINE:
//
//   AVAILABLE ─(app reserves)─────────────► RESERVED
//     green LED on                           blue LED on
//     bollard closed                         bollard closed
//     sensor off                             sensor off
//
//   RESERVED ─(app pays + lowers bollard)─► GATE_OPEN
//                                            blue LED on
//                                            bollard OPEN
//                                            sensor watching
//
//   GATE_OPEN ─(sensor detects car ≤20cm)─► OCCUPIED
//                                            RED LED on
//                                            post carPresent=true
//
//   OCCUPIED ─(sensor reads >20cm)─────────► AVAILABLE
//                                             green LED on
//                                             bollard closed
//                                             post carPresent=false
//
//   Any state ─(app cancels)───────────────► AVAILABLE
// =====================================================
void updateSystem(ParkingSystem &s) {

  pollCommand(s);

  switch (s.state) {

    // ── AVAILABLE ──────────────────────────────────────────
    // Green LED. Slot is empty and ready to be reserved.
    case ParkingSystem::AVAILABLE:
      setLEDs(s, true, false, false);  // GREEN on
      moveBollard(s, false);           // closed

      if (s.appReserved) {
        s.state = ParkingSystem::RESERVED;
        Serial.print("[State] Slot "); Serial.print(s.slotId);
        Serial.println(" → RESERVED (blue LED)");
      }
      break;

    // ── RESERVED ───────────────────────────────────────────
    // Blue LED. User has reserved. Bollard stays CLOSED.
    // User must complete payment in the app first,
    // then press Lower Bollard to open the gate.
    case ParkingSystem::RESERVED:
      setLEDs(s, false, true, false);  // BLUE on
      moveBollard(s, false);           // stays closed regardless

      // Paid + app lowered bollard → open gate, start sensor
      if (s.appPaid && !s.appBollardUp) {
        moveBollard(s, true);
        s.state = ParkingSystem::GATE_OPEN;
        Serial.print("[State] Slot "); Serial.print(s.slotId);
        Serial.println(" → GATE OPEN (paid + bollard lowered)");
      }

      // Reservation cancelled → back to available (green)
      if (!s.appReserved) {
        s.state = ParkingSystem::AVAILABLE;
        Serial.print("[State] Slot "); Serial.print(s.slotId);
        Serial.println(" → AVAILABLE (reservation cancelled)");
      }
      break;

    // ── GATE OPEN ──────────────────────────────────────────
    // Blue LED. Bollard is open. Sensor watches for the car.
    // Car must enter within the reservation window.
    case ParkingSystem::GATE_OPEN:
      setLEDs(s, false, true, false);  // BLUE on (waiting for car)
      moveBollard(s, true);            // open

      if (millis() - s.lastSensor >= 60) {
        s.lastSensor = millis();
        s.distance   = readDistance(s.trig, s.echo);

        Serial.print("[Sensor] Slot "); Serial.print(s.slotId);
        Serial.print("  dist: "); Serial.println(s.distance);

        // Car entered → RED LED, notify server
        if (s.distance > 0 && s.distance <= 20) {
          s.state = ParkingSystem::OCCUPIED;
          if (!s.lastReportedCar) {
            postSensorEvent(s.slotId, true);
            s.lastReportedCar = true;
          }
          Serial.print("[State] Slot "); Serial.print(s.slotId);
          Serial.println(" → OCCUPIED (red LED — car detected)");
        }
      }

      // App raised bollard back (user changed mind) → back to reserved
      if (s.appBollardUp && s.appReserved) {
        moveBollard(s, false);
        s.state = ParkingSystem::RESERVED;
      }

      // Reservation cancelled entirely
      if (!s.appReserved) {
        moveBollard(s, false);
        s.state = ParkingSystem::AVAILABLE;
      }
      break;

    // ── OCCUPIED ───────────────────────────────────────────
    // RED LED. Car is parked. Sensor keeps watching.
    // When car leaves, reset to AVAILABLE (green LED).
    case ParkingSystem::OCCUPIED:
      setLEDs(s, false, false, true);  // RED on
      moveBollard(s, true);            // keep open while car is inside

      if (millis() - s.lastSensor >= 60) {
        s.lastSensor = millis();
        s.distance   = readDistance(s.trig, s.echo);

        // Car left → notify server, green LED, close bollard
        if (s.distance > 20) {
          postSensorEvent(s.slotId, false);
          s.lastReportedCar = false;
          moveBollard(s, false);
          s.state = ParkingSystem::AVAILABLE;
          Serial.print("[State] Slot "); Serial.print(s.slotId);
          Serial.println(" → AVAILABLE (green LED — car left)");
        }
      }
      break;
  }
}

// =====================================================
//   SYSTEM INSTANCES
//
//   ParkingSystem { slotId, trig, echo, servoPin,
//                   ledGreen, ledBlue, ledRed }
//
//   Slot 1 pins (from your wiring diagram):
//     TRIG=5  ECHO=18  SERVO=23
//     GREEN=25  BLUE=27  RED=26
//
//   Slot 2 pins:
//     TRIG=33  ECHO=16  SERVO=13
//     GREEN=14  BLUE=2   RED=32
// =====================================================
ParkingSystem sys1 = { 1,  5, 18, 23, 25, 27, 26 };
ParkingSystem sys2 = { 2, 33, 16, 13, 14,  2, 32 };

// =====================================================
//   SETUP
// =====================================================
void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("============================================");
  Serial.println("  SurePark Baguio — ESP32 Integrated Code");
  Serial.println("  Green = Available | Blue = Reserved");
  Serial.println("  Red   = Occupied  | App controls all");
  Serial.println("============================================");

  ParkingSystem* systems[] = { &sys1, &sys2 };

  for (auto s : systems) {
    pinMode(s->trig,     OUTPUT);
    pinMode(s->echo,     INPUT);
    pinMode(s->ledGreen, OUTPUT);
    pinMode(s->ledBlue,  OUTPUT);
    pinMode(s->ledRed,   OUTPUT);

    s->servo.attach(s->servoPin);
    s->servo.write(s->closeAngle);    // start CLOSED
    setLEDs(*s, true, false, false);  // start GREEN — available
  }

  connectWiFi();

  // Flash all 3 LEDs once to confirm boot
  for (auto s : systems) setLEDs(*s, true, true, true);
  delay(600);
  for (auto s : systems) setLEDs(*s, true, false, false);

  Serial.println("[System] Ready. Polling server every 2 seconds.");
}

// =====================================================
//   LOOP
// =====================================================
void loop() {
  updateSystem(sys1);
  updateSystem(sys2);

  // Auto-reconnect if WiFi drops
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect();
    delay(500);
  }
}
