// =============================================================
//  SurePark Baguio — PURE HARDWARE TEST
//  =====================================
//  NO WiFi. NO server. NO app needed.
//  Tests every physical component one at a time.
//
//  COMPONENTS THIS TESTS:
//    1. Green LED
//    2. Red LED
//    3. HC-SR04 Ultrasonic Distance Sensor
//    4. SG90 Servo Motor (bollard)
//    5. All together — full slot simulation
//
//  HOW TO USE:
//    1. Wire up your components (see pin table below)
//    2. Upload this sketch to your ESP32
//    3. Open Serial Monitor (Tools > Serial Monitor)
//    4. Set baud rate to 115200 (bottom right of Serial Monitor)
//    5. Press the RST (EN) button on the ESP32
//    6. Watch the tests run and read the results
//
//  PIN WIRING TABLE:
//  -----------------
//  Component        ESP32 Pin   Notes
//  --------         ---------   -----
//  HC-SR04 VCC      5V (VIN)    Must be 5V, not 3.3V
//  HC-SR04 GND      GND
//  HC-SR04 TRIG     GPIO 5
//  HC-SR04 ECHO     GPIO 18     !!! Use voltage divider (see below) !!!
//  SG90 Red wire    External 5V Do NOT use ESP32 5V pin for servo
//  SG90 Brown wire  GND
//  SG90 Orange wire GPIO 13
//  Green LED +      GPIO 25     Via 220 ohm resistor
//  Green LED -      GND
//  Red LED +        GPIO 26     Via 220 ohm resistor
//  Red LED -        GND
//
//  VOLTAGE DIVIDER FOR ECHO PIN (REQUIRED):
//  -----------------------------------------
//  The HC-SR04 ECHO pin outputs 5V but ESP32 GPIO only tolerates 3.3V.
//  Without this, you will damage your ESP32 over time.
//
//  HC-SR04 ECHO → 1000 ohm resistor → GPIO 18
//                                   → 2000 ohm resistor → GND
//
//  This divides 5V down to 3.3V safely.
//  You can use 1k and 2k resistors, or 10k and 20k — same ratio.
//
//  LIBRARY NEEDED:
//  ---------------
//  ESP32Servo by Kevin Harrington
//  Install via: Sketch > Include Library > Manage Libraries
//  Search: ESP32Servo  →  Click Install
// =============================================================

#include <ESP32Servo.h>

// -------------------------------------------------------
// PIN DEFINITIONS
// Change these numbers if you used different GPIO pins
// -------------------------------------------------------
#define TRIG_PIN         5     // HC-SR04 TRIG
#define ECHO_PIN         18    // HC-SR04 ECHO (via voltage divider)
#define SERVO_PIN        13    // SG90 signal wire
#define LED_GREEN_PIN    25    // Green LED
#define LED_RED_PIN      26    // Red LED

// -------------------------------------------------------
// SERVO ANGLES
// Adjust if your bollard arm needs different angles
// -------------------------------------------------------
#define SERVO_LOWERED    0     // bollard down — car can enter
#define SERVO_RAISED     90    // bollard up   — blocks entry

// -------------------------------------------------------
// SENSOR THRESHOLD
// If sensor reads below this value (cm), car is present
// -------------------------------------------------------
#define CAR_DISTANCE_CM  50

// -------------------------------------------------------
// Internal
// -------------------------------------------------------
Servo myServo;

// =============================================================
//  HELPER FUNCTIONS
// =============================================================

// Read HC-SR04 and return distance in cm
// Returns 999.0 if no echo is received (nothing in front)
float readDistanceCm() {
  digitalWrite(TRIG_PIN, LOW);
  delayMicroseconds(2);
  digitalWrite(TRIG_PIN, HIGH);
  delayMicroseconds(10);
  digitalWrite(TRIG_PIN, LOW);

  long duration = pulseIn(ECHO_PIN, HIGH, 30000); // 30 ms timeout
  if (duration == 0) return 999.0;
  return (duration * 0.0343f) / 2.0f;
}

// Print a section divider to Serial Monitor
void printDivider() {
  Serial.println("------------------------------------------");
}

// Wait for user to press Enter in Serial Monitor before continuing
// (Not used in auto mode but good for manual stepping)
void waitSeconds(int sec, const char* msg) {
  Serial.print("  Waiting ");
  Serial.print(sec);
  Serial.print(" seconds");
  if (msg && msg[0]) {
    Serial.print(" — ");
    Serial.print(msg);
  }
  Serial.println("...");
  delay(sec * 1000);
}

// =============================================================
//  SETUP — all tests run once here
// =============================================================
void setup() {
  Serial.begin(115200);
  delay(1500); // wait for Serial Monitor to open after pressing RST

  Serial.println();
  Serial.println("==========================================");
  Serial.println("  SurePark Baguio — Hardware Test");
  Serial.println("  NO WiFi  |  NO app  |  Hardware only");
  Serial.println("==========================================");
  Serial.println();
  Serial.println("Make sure Serial Monitor is set to 115200");
  Serial.println("Starting tests in 3 seconds...");
  delay(3000);

  // ---- Pin setup -------------------------------------------
  pinMode(TRIG_PIN,      OUTPUT);
  pinMode(ECHO_PIN,      INPUT);
  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_RED_PIN,   OUTPUT);

  // Make sure LEDs start OFF
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN,   LOW);

  // Attach servo — starts at LOWERED position
  myServo.attach(SERVO_PIN);
  myServo.write(SERVO_LOWERED);
  delay(500);


  // ==========================================================
  //  TEST 1: GREEN LED
  //  What to look for: Green LED turns ON then OFF
  // ==========================================================
  Serial.println();
  printDivider();
  Serial.println("TEST 1 of 5 — GREEN LED");
  printDivider();
  Serial.println("  Expected: Green LED turns ON for 2 seconds, then OFF");

  digitalWrite(LED_GREEN_PIN, HIGH);
  Serial.println("  >> Green LED is ON now");
  delay(2000);
  digitalWrite(LED_GREEN_PIN, LOW);
  Serial.println("  >> Green LED is OFF now");
  Serial.println();
  Serial.println("  Did the green LED light up?");
  Serial.println("  YES = wiring is correct");
  Serial.println("  NO  = check: resistor (220 ohm), correct GPIO pin,");
  Serial.println("        LED polarity (long leg = +, short leg = GND)");
  delay(1500);


  // ==========================================================
  //  TEST 2: RED LED
  //  What to look for: Red LED turns ON then OFF
  // ==========================================================
  Serial.println();
  printDivider();
  Serial.println("TEST 2 of 5 — RED LED");
  printDivider();
  Serial.println("  Expected: Red LED turns ON for 2 seconds, then OFF");

  digitalWrite(LED_RED_PIN, HIGH);
  Serial.println("  >> Red LED is ON now");
  delay(2000);
  digitalWrite(LED_RED_PIN, LOW);
  Serial.println("  >> Red LED is OFF now");
  Serial.println();
  Serial.println("  Did the red LED light up?");
  Serial.println("  YES = wiring is correct");
  Serial.println("  NO  = check: resistor (220 ohm), correct GPIO pin,");
  Serial.println("        LED polarity (long leg = +, short leg = GND)");
  delay(1500);


  // ==========================================================
  //  TEST 3: HC-SR04 ULTRASONIC SENSOR
  //  What to look for: Distance numbers in Serial Monitor
  // ==========================================================
  Serial.println();
  printDivider();
  Serial.println("TEST 3 of 5 — HC-SR04 ULTRASONIC SENSOR");
  printDivider();
  Serial.println("  ACTION NEEDED:");
  Serial.println("  Place your hand about 20 cm in front of");
  Serial.println("  the sensor. Keep it still.");
  Serial.println();
  Serial.println("  Reading 5 times in 5 seconds...");
  Serial.println();

  int passCount = 0;
  for (int i = 1; i <= 5; i++) {
    delay(1000);
    float dist = readDistanceCm();
    Serial.print("  Reading ");
    Serial.print(i);
    Serial.print(": ");

    if (dist == 999.0) {
      Serial.println("999.0 cm  <-- NO ECHO RECEIVED");
    } else {
      Serial.print(dist);
      Serial.println(" cm");
      if (dist > 2 && dist < 400) passCount++;
    }
  }

  Serial.println();
  if (passCount >= 3) {
    Serial.println("  RESULT: PASS — sensor is working correctly");
  } else {
    Serial.println("  RESULT: FAIL — sensor is not reading properly");
    Serial.println();
    Serial.println("  TROUBLESHOOTING:");
    Serial.println("  - All readings 999? ECHO pin not receiving signal.");
    Serial.println("    Check voltage divider wiring on ECHO pin.");
    Serial.println("    HC-SR04 must be powered by 5V not 3.3V.");
    Serial.println("  - Readings too small (<2cm)? TRIG and ECHO may be");
    Serial.println("    swapped. Double check wiring.");
    Serial.println("  - Erratic readings? Make sure nothing is right in");
    Serial.println("    front of the sensor and hand is flat and still.");
  }
  delay(1500);


  // ==========================================================
  //  TEST 4: SG90 SERVO MOTOR (BOLLARD)
  //  What to look for: Servo arm moves to 3 positions
  // ==========================================================
  Serial.println();
  printDivider();
  Serial.println("TEST 4 of 5 — SG90 SERVO MOTOR (BOLLARD)");
  printDivider();
  Serial.println("  The servo will move to 3 positions:");
  Serial.println("    Position 1:  0 degrees  = LOWERED  (car can enter)");
  Serial.println("    Position 2: 90 degrees  = RAISED   (blocks entry)");
  Serial.println("    Position 3:  0 degrees  = LOWERED  (back to start)");
  Serial.println();

  Serial.println("  >> Moving to 0 deg (LOWERED)...");
  myServo.write(SERVO_LOWERED);
  delay(1500);

  Serial.println("  >> Moving to 90 deg (RAISED)...");
  myServo.write(SERVO_RAISED);
  delay(1500);

  Serial.println("  >> Moving back to 0 deg (LOWERED)...");
  myServo.write(SERVO_LOWERED);
  delay(1500);

  Serial.println();
  Serial.println("  Did the servo arm move to all 3 positions?");
  Serial.println("  YES = servo is working correctly");
  Serial.println("  NO — TROUBLESHOOTING:");
  Serial.println("  - Servo does not move at all:");
  Serial.println("    Check signal wire is on GPIO 13.");
  Serial.println("    Make sure ESP32Servo library is installed.");
  Serial.println("  - Servo just jitters or buzzes:");
  Serial.println("    The ESP32 5V pin cannot power a servo.");
  Serial.println("    Use an EXTERNAL 5V supply for the servo.");
  Serial.println("    Connect servo GND to same GND as ESP32.");
  Serial.println("  - Servo moves but not to correct angle:");
  Serial.println("    Change SERVO_LOWERED and SERVO_RAISED values above.");
  delay(1500);


  // ==========================================================
  //  TEST 5: FULL SIMULATION — all components together
  //  Simulates: available → car arrives → car leaves
  // ==========================================================
  Serial.println();
  printDivider();
  Serial.println("TEST 5 of 5 — FULL SLOT SIMULATION");
  printDivider();
  Serial.println("  Simulates the complete parking slot lifecycle:");
  Serial.println("  Available → Car Detected → Car Left");
  Serial.println();

  // State: AVAILABLE
  Serial.println("  [STATE: AVAILABLE]");
  Serial.println("  Green LED ON, Red LED OFF, Bollard LOWERED");
  digitalWrite(LED_GREEN_PIN, HIGH);
  digitalWrite(LED_RED_PIN,   LOW);
  myServo.write(SERVO_LOWERED);
  delay(3000);

  // State: CAR DETECTED / OCCUPIED
  Serial.println();
  Serial.println("  [STATE: CAR DETECTED → OCCUPIED]");
  Serial.println("  Green LED OFF, Red LED ON, Bollard RAISED");
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN,   HIGH);
  myServo.write(SERVO_RAISED);
  delay(3000);

  // State: CAR LEFT → back to AVAILABLE
  Serial.println();
  Serial.println("  [STATE: CAR LEFT → AVAILABLE]");
  Serial.println("  Green LED ON, Red LED OFF, Bollard LOWERED");
  digitalWrite(LED_GREEN_PIN, HIGH);
  digitalWrite(LED_RED_PIN,   LOW);
  myServo.write(SERVO_LOWERED);
  delay(3000);

  // End state: all off
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_RED_PIN,   LOW);


  // ==========================================================
  //  FINAL SUMMARY
  // ==========================================================
  Serial.println();
  Serial.println("==========================================");
  Serial.println("  ALL TESTS COMPLETE");
  Serial.println("==========================================");
  Serial.println();
  Serial.println("  If all 5 tests passed:");
  Serial.println("  Your hardware is wired correctly.");
  Serial.println("  You are ready to upload the main");
  Serial.println("  surepark_esp32.ino sketch.");
  Serial.println();
  Serial.println("  If any test failed:");
  Serial.println("  Read the TROUBLESHOOTING notes printed");
  Serial.println("  above for that specific test.");
  Serial.println();
  Serial.println("  The loop below will now print live");
  Serial.println("  sensor readings every 500ms.");
  Serial.println("  Point sensor at objects to verify.");
  Serial.println("==========================================");
  Serial.println();
}


// =============================================================
//  LOOP — prints live sensor readings after tests finish
//  Useful for aiming and calibrating the sensor
// =============================================================
void loop() {
  float dist = readDistanceCm();

  Serial.print("[LIVE] Distance: ");

  if (dist == 999.0) {
    Serial.print("NO ECHO");
  } else {
    Serial.print(dist);
    Serial.print(" cm");
  }

  // Show car detection status based on threshold
  if (dist < CAR_DISTANCE_CM) {
    Serial.print("  -->  CAR DETECTED  (Red LED ON)");
    digitalWrite(LED_RED_PIN,   HIGH);
    digitalWrite(LED_GREEN_PIN, LOW);
    myServo.write(SERVO_RAISED);
  } else {
    Serial.print("  -->  empty         (Green LED ON)");
    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(LED_RED_PIN,   LOW);
    myServo.write(SERVO_LOWERED);
  }

  Serial.println();
  delay(500);
}
