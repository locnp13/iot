#include <Wire.h>
#include <Adafruit_ADS1X15.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClientSecure.h>
#include <Preferences.h>
#include <ArduinoJson.h>
#include "driver/rtc_io.h"

// ================= CẤU HÌNH CHÂN =================
#define BUTTON_PIN       4   // Nút nhấn (D4) - Wakeup pin (Kéo lên HIGH, nhấn xuống LOW)
#define RELAY_PIN        12  // Điều khiển Relay (GPIO 12)

// ================= THÔNG TIN WIFI & API =================
const char* ssid = "Binh Mai";
const char* password = "08050193";
const char* serverUrl = "https://your-project.vercel.app/api/readings";
// Token thiết bị: lấy 1 lần khi bấm "Add device" trên dashboard, dán vào đây.
// KHÔNG dùng user/pass tài khoản — token này chỉ định danh riêng thiết bị.
const char* deviceToken = "REPLACE_WITH_DEVICE_TOKEN_FROM_DASHBOARD";

// ================= THÔNG SỐ CẤU HÌNH =================
const float VOLTAGE_MULTIPLIER = 4.99;
const float ACS758_OFFSET = 0.325;
const float ACS758_SENSITIVITY = 0.16;

// Sử dụng biến RTC để lưu số lần đo trong bộ nhớ siêu tiết kiệm điện (không bị mất khi Deep Sleep)
// Nếu mất nguồn hoàn toàn, nó sẽ đọc lại từ bộ nhớ Flash (Preferences)
RTC_DATA_ATTR int rtc_test_cycles = -1;

Adafruit_ADS1115 ads;
Preferences preferences;

float readVoltage() {
  return ads.computeVolts(ads.readADC_SingleEnded(0)) * VOLTAGE_MULTIPLIER;
}

float readCurrent() {
  float volts = ads.computeVolts(ads.readADC_SingleEnded(1));
  return (volts - ACS758_OFFSET) / ACS758_SENSITIVITY;
}

// ================= UPLOAD & RETRY KHI MẤT MẠNG (FR5, FR6) =================
// Chỉ giữ ĐÚNG 1 slot "pending" trong Flash, không phải hàng đợi đầy đủ nhiều reading.
// Nếu 2 chu kỳ liên tiếp đều mất mạng, reading cũ hơn trong 2 lần đó sẽ bị ghi đè bởi cái mới.
// Đánh đổi này chấp nhận được ở quy mô thiết bị nội bộ (xem NFR5: best-effort, không SLA).

bool uploadReading(int cycle, float vRest, float deltaV, float iMax, float rInt) {
  WiFiClientSecure client;
  client.setInsecure(); // Bỏ qua xác thực chứng chỉ để đơn giản hoá — payload vẫn được mã hoá qua HTTPS.

  HTTPClient http;
  if (!http.begin(client, serverUrl)) {
    Serial.println(F("[UPLOAD] Không khởi tạo được kết nối HTTPS."));
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  http.addHeader("Authorization", String("Bearer ") + deviceToken);

  StaticJsonDocument<200> doc;
  doc["cycle"] = cycle;
  doc["vRest"] = vRest;
  doc["deltaV"] = deltaV;
  doc["iMax"] = iMax;
  doc["rInt"] = rInt;

  String jsonPayload;
  serializeJson(doc, jsonPayload);

  int httpCode = http.POST(jsonPayload);
  bool success = (httpCode >= 200 && httpCode < 300);

  if (success) {
    Serial.printf("[UPLOAD] Cycle %d: thành công (Code: %d)\n", cycle, httpCode);
  } else if (httpCode > 0) {
    Serial.printf("[UPLOAD] Cycle %d: Server từ chối (Code: %d)\n", cycle, httpCode);
  } else {
    Serial.printf("[UPLOAD] Cycle %d: Lỗi kết nối (%s)\n", cycle, http.errorToString(httpCode).c_str());
  }

  http.end();
  return success;
}

void savePendingReading(int cycle, float vRest, float deltaV, float iMax, float rInt) {
  preferences.begin("bench_data", false);
  preferences.putBool("p_valid", true);
  preferences.putInt("p_cycle", cycle);
  preferences.putFloat("p_vrest", vRest);
  preferences.putFloat("p_deltav", deltaV);
  preferences.putFloat("p_imax", iMax);
  preferences.putFloat("p_rint", rInt);
  preferences.end();
  Serial.printf("[RETRY] Đã lưu reading (cycle %d) vào Flash để gửi lại lần sau.\n", cycle);
}

void clearPendingReading() {
  preferences.begin("bench_data", false);
  preferences.putBool("p_valid", false);
  preferences.end();
}

// true nếu có pending VÀ gửi thành công (đã xoá); false nếu không có pending hoặc gửi thất bại (vẫn giữ nguyên).
bool flushPendingReading() {
  preferences.begin("bench_data", true);
  bool valid = preferences.getBool("p_valid", false);
  int cycle = preferences.getInt("p_cycle", 0);
  float vRest = preferences.getFloat("p_vrest", 0);
  float deltaV = preferences.getFloat("p_deltav", 0);
  float iMax = preferences.getFloat("p_imax", 0);
  float rInt = preferences.getFloat("p_rint", 0);
  preferences.end();

  if (!valid) return false;

  Serial.printf("[RETRY] Đang gửi lại reading tồn đọng (cycle %d)...\n", cycle);
  if (uploadReading(cycle, vRest, deltaV, iMax, rInt)) {
    clearPendingReading();
    return true;
  }
  return false;
}

void setup() {
  Serial.begin(115200);
  delay(100);

  // 1. CẤU HÌNH CHÂN RELAY TỨC THÌ (Để tránh nhiễu khi vừa boot)
  pinMode(RELAY_PIN, OUTPUT);
  digitalWrite(RELAY_PIN, LOW);
  pinMode(BUTTON_PIN, INPUT_PULLUP);

  // Kiểm tra lý do thức dậy (Bật nguồn lần đầu hay do nhấn nút)
  esp_sleep_wakeup_cause_t wakeup_reason = esp_sleep_get_wakeup_cause();

  if (wakeup_reason == ESP_SLEEP_WAKEUP_EXT0) {
    Serial.println(F("\n[WAKEUP] Nút được nhấn! Bắt đầu chu trình đo ngay lập tức..."));

    // Khởi tạo I2C & ADC nhanh nhất có thể
    Wire.begin(21, 22);
    ads.setGain(GAIN_TWOTHIRDS);
    if (!ads.begin()) {
      Serial.println(F("Lỗi ADS1115!"));
      goToSleep(); // Lỗi thì đi ngủ lại
    }

    // --- BƯỚC 1: ĐO ĐẠC 3 GIÂY ---
    float v_rest = readVoltage();
    float v_min = v_rest;
    float i_max = 0.0;

    digitalWrite(RELAY_PIN, HIGH); // ĐÓNG TẢI
    unsigned long start_time = millis();

    while (millis() - start_time < 3000) { // ĐÚNG 3 GIÂY
      float v_now = readVoltage();
      float i_now = readCurrent();

      if (v_now < v_min) v_min = v_now;
      if (abs(i_now) > i_max) i_max = abs(i_now);

      delay(20); // Tốc độ lấy mẫu cực cao (khoảng 200 mẫu/giây)
    }

    digitalWrite(RELAY_PIN, LOW); // NGẮT TẢI NGAY LẬP TỨC
    Serial.println(F("[DONE] Đã ngắt tải giả. Đang xử lý dữ liệu..."));

    // --- BƯỚC 2: TÍNH TOÁN & LƯU TRỮ ---
    float delta_v = v_rest - v_min;
    float r_int = (i_max > 0.5) ? (delta_v / i_max) : 0.0;
    r_int*=1000;

    preferences.begin("bench_data", false);
    if (rtc_test_cycles == -1) { // Nếu vừa cấp nguồn lại, lấy data từ Flash
      rtc_test_cycles = preferences.getInt("cycles", 0);
    }
    rtc_test_cycles++;
    preferences.putInt("cycles", rtc_test_cycles);
    preferences.end();

    Serial.printf("Lần đo thứ: %d | V tĩnh: %.2fV | ΔV: %.2fV | Imax: %.2fA | Rint: %.4fmΩ\n",
                  rtc_test_cycles, v_rest, delta_v, i_max, r_int);

    // --- BƯỚC 3: KIỂM TRA WIFI NHANH & ĐẨY DỮ LIỆU (kèm retry reading tồn đọng) ---
    Serial.print(F("Kiểm tra kết nối WiFi..."));

    WiFi.mode(WIFI_STA); // Cấu hình rõ chế độ Station (Máy trạm) để kết nối nhanh hơn
    WiFi.begin(ssid, password);

    bool hasWifi = false;
    unsigned long wifi_start = millis();

    // Chỉ cho phép ESP32 tìm WiFi trong đúng 4 giây
    while (millis() - wifi_start < 4000) {
      if (WiFi.status() == WL_CONNECTED) {
        hasWifi = true;
        break; // Thoát vòng lặp ngay khi có mạng
      }
      delay(200);
      Serial.print(".");
    }

    if (hasWifi) {
      Serial.println(F("\n[WIFI] Có mạng! Đang đẩy dữ liệu lên Cloud..."));

      // Gửi lại reading tồn đọng từ lần trước (nếu có) trước khi gửi reading mới
      flushPendingReading();

      if (!uploadReading(rtc_test_cycles, v_rest, delta_v, i_max, r_int)) {
        savePendingReading(rtc_test_cycles, v_rest, delta_v, i_max, r_int);
      }

    } else {
      // KHÔNG CÓ WIFI -> LƯU LẠI TOÀN BỘ READING ĐỂ GỬI LẦN SAU
      Serial.println(F("\n[WIFI] Không tìm thấy WiFi. Lưu lại để gửi lần sau. Đi ngủ thôi!"));
      savePendingReading(rtc_test_cycles, v_rest, delta_v, i_max, r_int);
    }

    // Tắt hẳn module WiFi của ESP32 để không ngốn pin trong lúc làm mát
    WiFi.disconnect(true);
    WiFi.mode(WIFI_OFF);

    // --- BƯỚC 4: THỜI GIAN LÀM MÁT TẢI ---
    Serial.println(F("Đang làm mát tải (Cooldown) 5 giây trước khi ngủ..."));
    delay(5000);

  } else {
    Serial.println(F("[BOOT] Hệ thống vừa được cấp nguồn. Đang vào trạng thái ngủ..."));
    // Nếu rtc_test_cycles chưa có, đọc từ Flash 1 lần đầu
    if (rtc_test_cycles == -1) {
      preferences.begin("bench_data", true);
      rtc_test_cycles = preferences.getInt("cycles", 0);
      preferences.end();
    }
  }

  // Đi ngủ
  goToSleep();
}

void loop() {
  // Không bao giờ chạy tới đây
}

// Hàm xử lý vào chế độ Deep Sleep
void goToSleep() {
  // Đợi người dùng thả nút nhấn ra hẳn rồi mới ngủ (tránh vừa ngủ lại bị đánh thức ngay)
  while(digitalRead(BUTTON_PIN) == LOW) {
    delay(100);
  }

  Serial.println(F("Zzz... ESP32 đang vào Deep Sleep. Nhấn nút D4 để đo tiếp."));

  // Cấu hình Wake-up: Đánh thức khi chân D4 (GPIO4) xuống mức THẤP (LOW)
  esp_sleep_enable_ext0_wakeup(GPIO_NUM_4, 0);

  delay(200); // Tránh lỗi Serial bị cắt ngang
  esp_deep_sleep_start();
}
