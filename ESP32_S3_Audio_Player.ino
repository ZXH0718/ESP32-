/*
  ESP32-S3 触摸屏音频播放器 (BLE蓝牙版)
  硬件: ESP32-S3 N16R8 + 2.4" ST7789 TFT 240x320 (带XPT2046触摸) + MAX98357A + Mini SD卡模块
  支持格式: MP3, WAV, FLAC, AAC, OGG
  功能: 触摸浏览文件、播放/暂停、上一首/下一首、音量调节、进度显示
        BLE蓝牙接收文件（通过手机APP传输音乐到SD卡）
        BLE蓝牙遥控、时间同步

  ========== 接线表 ==========
  ESP32-S3      2.4" TFT(屏幕)   MAX98357A     Mini SD模块
  --------      --------------    ----------    -------------
  3V3     -->   VCC + LED         VIN           VCC (3V3)
  GND     -->   GND               GND           GND
  GPIO11  -->   SDI (MOSI)
  GPIO12  -->   SCK
  GPIO13  -->   SDO (MISO)
  GPIO10  -->   CS
  GPIO9   -->   DC (RS)
  GPIO8   -->   RESET
  GPIO7   -->   T_CS (触摸片选)
  GPIO6   -->   T_CLK (触摸时钟)
  GPIO5   -->   T_DIN (触摸输入)
  GPIO4   -->   T_DO (触摸输出)
  GPIO14  -->   -                  -             CS
  GPIO15  -->   -                  BCLK
  GPIO16  -->   -                  LRC
  GPIO17  -->   -                  DIN

  喇叭(28mm 4Ω3W) --> 接 MAX98357A 绿色端子 SPK+/SPK-
  注意: T_IRQ 引脚不接

  ========== 开发环境 ==========
  Arduino IDE -> 开发板选 "ESP32S3 Dev Module"
  依赖库: TFT_eSPI (by Bodmer), ESP32-audioI2S (by schreibfaul1), XPT2046_Touchscreen (by Paul Stoffregen)
  BLE: 使用内置 BLEDevice 库（ESP32-S3自带，无需额外安装）
  重要: 工具 -> Partition Scheme -> 选 "Huge APP (3MB No OTA/1MB SPIFFS)"
        工具 -> PSRAM -> 选 "OPI PSRAM 8MB"

  ========== TFT_eSPI 配置 ==========
  修改 库目录 TFT_eSPI/User_Setup.h，用以下内容替换:

    #define USER_SETUP_INFO "ESP32-S3 ST7789 240x320"
    #define ST7789_DRIVER
    #define TFT_WIDTH  240
    #define TFT_HEIGHT 320
    #define TFT_MOSI 11
    #define TFT_SCLK 12
    #define TFT_CS   10
    #define TFT_DC    9
    #define TFT_RST   8
    #define USE_HSPI_PORT
    #define TFT_SPI_MODE SPI_MODE0
    // #define TFT_RGB_ORDER TFT_BGR
    #define LOAD_GLCD
    #define LOAD_FONT2
    #define LOAD_FONT4
    #define LOAD_FONT6
    #define LOAD_FONT7
    #define LOAD_FONT8
    #define LOAD_GFXFF
    #define SMOOTH_FONT
    #define SPI_FREQUENCY  20000000

  ========== BLE 文件传输协议 ==========
  使用 BLE GATT 透传服务，手机写入数据到 RX 特征值
  手机 -> ESP32 (通过BLE写入):
    [0xAB] [文件名 UTF-8] [0x00] [文件大小 4字节小端] [文件数据 N字节]
  ESP32 -> 手机 (通过BLE通知):
    收到完整文件后发送 "OK\n"，接收出错发送 "ERR\n"

  ========== BLE 遥控命令协议 ==========
    0xC0 → 播放/暂停
    0xC1 → 上一首
    0xC2 → 下一首
    0xC3 → 音量+
    0xC4 → 音量-
    0xC5 → 获取状态 (回复 JSON)

  ========== BLE 时间同步协议 ==========
    [0xD0] [Unix时间戳 4字节大端序]
*/

#include <Arduino.h>
#include <SPI.h>
#include "SD.h"
#include <TFT_eSPI.h>
#include <Audio.h>
#include <XPT2046_Touchscreen.h>

// ===================== BLE 蓝牙配置 =====================
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>

// BLE 服务和特征值 UUID
// 使用 Nordic UART Service 的标准 UUID，兼容大多数 BLE 串口APP
#define BLE_SERVICE_UUID           "6e400001-b5a3-f393-e0a9-e50e24dcca9e"
#define BLE_CHARACTERISTIC_RX_UUID "6e400002-b5a3-f393-e0a9-e50e24dcca9e"  // 手机写入
#define BLE_CHARACTERISTIC_TX_UUID "6e400003-b5a3-f393-e0a9-e50e24dcca9e"  // ESP32通知

BLEServer *pServer = NULL;
BLECharacteristic *pTxCharacteristic = NULL;
BLECharacteristic *pRxCharacteristic = NULL;
bool deviceConnected = false;
bool oldDeviceConnected = false;

// ===================== 引脚定义 =====================
#define I2S_DOUT      17
#define I2S_BCLK      15
#define I2S_LRC        16

#define SD_MISO       13
#define SD_CS         14

// 触摸引脚 (XPT2046)
#define XPT2046_CS    7
#define XPT2046_IRQ   -1  // 不使用中断

// 触摸使用独立的 SPI 引脚
#define TOUCH_SCLK    6
#define TOUCH_MOSI    5
#define TOUCH_MISO    4

// ===================== 全局对象 =====================
TFT_eSPI tft = TFT_eSPI();
Audio audio;

// 触摸使用独立 SPI
SPIClass touchSPI = SPIClass(FSPI);
XPT2046_Touchscreen ts(XPT2046_CS, XPT2046_IRQ);

String fileList[60];
int fileCount = 0;
int currentIndex = 0;
int playingIndex = -1;
int scrollOffset = 0;

bool isPlaying = false;
bool isPaused = false;
int volume = 12;

enum ScreenMode { LIST, PLAYING, BT_TRANSFER };
ScreenMode screen = LIST;

unsigned long lastTouchTime = 0;
const unsigned long TOUCH_DEBOUNCE = 250;

// ===================== BLE 接收状态机 =====================
enum BtState { BT_IDLE, BT_RECV_NAME, BT_RECV_SIZE, BT_RECV_DATA };
BtState btState = BT_IDLE;

File btFile;
String btFileName = "";
uint32_t btFileSize = 0;
uint32_t btReceived = 0;
uint8_t btSizeBuf[4];
int btSizeIdx = 0;

// ===================== 时间同步 =====================
unsigned long syncedTime = 0;
unsigned long syncMillis = 0;
bool timeSynced = false;
uint8_t btTimeBuf[4];
int btTimeBufIdx = 0;
bool btRecvTime = false;

// ===================== UI 参数 =====================
#define BG_COLOR        TFT_BLACK
#define TEXT_COLOR      TFT_WHITE
#define HIGHLIGHT_COLOR TFT_BLUE
#define PLAYING_COLOR   TFT_GREEN
#define PROGRESS_COLOR  TFT_CYAN
#define ACCENT_COLOR    TFT_MAGENTA
#define BT_COLOR        TFT_ORANGE
#define BTN_COLOR       TFT_DARKGREY
#define BTN_ACTIVE      TFT_BLUE

#define SCREEN_W        240
#define SCREEN_H        320
#define ROW_HEIGHT      24
#define HEADER_H        36
#define FOOTER_H        28
#define VISIBLE_ROWS    10
#define LIST_AREA_Y     HEADER_H
#define LIST_AREA_H     (SCREEN_H - HEADER_H - FOOTER_H)
#define LIST_AREA_X     0
#define LIST_AREA_W     SCREEN_W

// 触摸按钮区域定义 (播放界面)
#define PLAY_BTN_Y     220
#define BTN_SIZE        50
#define BTN_GAP         10
#define BTN_PREV_X      30
#define BTN_VOL_DOWN_X  80
#define BTN_PLAY_X      120
#define BTN_VOL_UP_X    160
#define BTN_NEXT_X      210
#define BTN_BACK_X      120

// ===================== BLE 发送数据缓冲 =====================
// BLE 通知每次最多发 20 字节，需要分批发送
String bleTxBuffer = "";
bool bleTxPending = false;

// ===================== 前向声明 (必须在BLE回调类之前) =====================
void processBtByte(uint8_t b);
void handleBtCommand(uint8_t cmd);
void bleSendData(const char* data);
void bleSendData(const String& data);
void drawListScreen();
void drawPlayScreen();
void drawBtTransferScreen();
void drawBtProgress();
void drawBtComplete();
void drawBtFooter();
void drawVolumeBar();
void updateProgress();
void showMessage(const char* msg);
void scanAudioFiles();
String removeExtension(const String& filename);
String formatSize(uint32_t bytes);
void playFile(int index);
void playNext();
void playPrevious();
void togglePause();
unsigned long getCurrentTime();

// ===================== BLE 服务器回调 =====================
class MyServerCallbacks: public BLEServerCallbacks {
    void onConnect(BLEServer* pServer) {
      deviceConnected = true;
      Serial.println("[BLE] 手机已连接");
      if (screen == LIST) drawListScreen();
    }

    void onDisconnect(BLEServer* pServer) {
      deviceConnected = false;
      Serial.println("[BLE] 手机断开");
      if (btState != BT_IDLE && btFile) {
        btFile.close();
        btState = BT_IDLE;
      }
      // 重新开始广播
      BLEDevice::startAdvertising();
      if (screen == LIST) drawListScreen();
    }
};

// ===================== BLE 接收回调 =====================
class MyRxCallbacks: public BLECharacteristicCallbacks {
    void onWrite(BLECharacteristic *pCharacteristic) {
      String rxValue = pCharacteristic->getValue();
      int len = rxValue.length();
      if (len <= 0) return;

      // 将收到的数据放入状态机处理
      for (int i = 0; i < len; i++) {
        uint8_t b = (uint8_t)rxValue[i];
        processBtByte(b);
      }
    }
};

// ===================== BLE 发送函数 =====================
void bleSendData(const char* data) {
  if (!deviceConnected) return;
  int len = strlen(data);
  int offset = 0;
  while (offset < len) {
    int chunk = (len - offset < 20) ? (len - offset) : 20;
    pTxCharacteristic->setValue((uint8_t*)(data + offset), chunk);
    pTxCharacteristic->notify();
    offset += chunk;
    delay(10);  // BLE通知需要间隔
  }
}

void bleSendData(const String& data) {
  bleSendData(data.c_str());
}

// ===================== BLE 数据处理 =====================
void processBtByte(uint8_t b) {
  switch (btState) {
    case BT_IDLE:
      if (b >= 0xC0 && b <= 0xC5) {
        handleBtCommand(b);
      }
      else if (b == (uint8_t)0xD0) {
        btRecvTime = true;
        btTimeBufIdx = 0;
      }
      else if (btRecvTime) {
        btTimeBuf[btTimeBufIdx++] = b;
        if (btTimeBufIdx >= 4) {
          uint32_t ts = ((uint32_t)btTimeBuf[0] << 24) | ((uint32_t)btTimeBuf[1] << 16) |
                       ((uint32_t)btTimeBuf[2] << 8) | btTimeBuf[3];
          syncedTime = ts;
          syncMillis = millis();
          timeSynced = true;
          btRecvTime = false;
          Serial.printf("[BLE] 时间已同步: %u\n", ts);
          bleSendData("OK\n");
          if (screen == LIST) drawListScreen();
        }
      }
      else if (b == 0xAB) {
        btState = BT_RECV_NAME;
        btFileName = "";
        btFileSize = 0;
        btReceived = 0;
        btSizeIdx = 0;
      }
      break;

    case BT_RECV_NAME:
      if (b == 0x00) {
        btState = BT_RECV_SIZE;
        btSizeIdx = 0;
      } else {
        btFileName += (char)b;
      }
      break;

    case BT_RECV_SIZE:
      btSizeBuf[btSizeIdx++] = b;
      if (btSizeIdx >= 4) {
        btFileSize = btSizeBuf[0] | (btSizeBuf[1] << 8) |
                     (btSizeBuf[2] << 16) | (btSizeBuf[3] << 24);

        Serial.printf("[BLE] 接收文件: %s (%u 字节)\n", btFileName.c_str(), btFileSize);

        if (btFileName.length() == 0 || btFileSize == 0 || btFileSize > 50 * 1024 * 1024) {
          Serial.println("[BLE] 无效的文件头");
          bleSendData("ERR\n");
          btState = BT_IDLE;
          break;
        }

        String path = "/" + btFileName;
        btFile = SD.open(path.c_str(), FILE_WRITE);
        if (!btFile) {
          Serial.printf("[BLE] 无法创建文件: %s\n", path.c_str());
          bleSendData("ERR\n");
          btState = BT_IDLE;
          break;
        }

        btReceived = 0;
        btState = BT_RECV_DATA;
        screen = BT_TRANSFER;
        drawBtTransferScreen();
      }
      break;

    case BT_RECV_DATA:
      btFile.write(&b, 1);
      btReceived++;

      if (btReceived % 4096 == 0) {
        drawBtProgress();
      }

      if (btReceived >= btFileSize) {
        btFile.close();
        Serial.printf("[BLE] 接收完成: %s\n", btFileName.c_str());
        bleSendData("OK\n");

        scanAudioFiles();
        btState = BT_IDLE;

        drawBtComplete();

        delay(2000);
        if (screen == BT_TRANSFER) {
          screen = LIST;
          if (currentIndex >= fileCount) currentIndex = 0;
          drawListScreen();
        }
      }
      break;
  }
}

// ===================== BLE 遥控命令处理 =====================
void handleBtCommand(uint8_t cmd) {
  switch (cmd) {
    case 0xC0:
      if (!isPlaying && !isPaused) {
        playFile(currentIndex);
      } else {
        togglePause();
      }
      bleSendData("OK\n");
      break;

    case 0xC1:
      playPrevious();
      bleSendData("OK\n");
      break;

    case 0xC2:
      playNext();
      bleSendData("OK\n");
      break;

    case 0xC3:
      if (volume < 21) {
        volume++;
        audio.setVolume(volume);
        if (screen == PLAYING) drawVolumeBar();
      }
      bleSendData("OK\n");
      break;

    case 0xC4:
      if (volume > 0) {
        volume--;
        audio.setVolume(volume);
        if (screen == PLAYING) drawVolumeBar();
      }
      bleSendData("OK\n");
      break;

    case 0xC5:
      {
        String song = "";
        if (playingIndex >= 0 && playingIndex < fileCount) {
          song = removeExtension(fileList[playingIndex]);
        }
        String json = "{\"playing\":";
        json += isPlaying ? "true" : "false";
        json += ",\"paused\":";
        json += isPaused ? "true" : "false";
        json += ",\"vol\":";
        json += String(volume);
        json += ",\"song\":\"";
        json += song;
        json += "\",\"index\":";
        json += String(playingIndex >= 0 ? playingIndex + 1 : 0);
        json += ",\"total\":";
        json += String(fileCount);
        json += "}\n";
        bleSendData(json);
      }
      break;

    default:
      break;
  }
}

// ===================== 触摸辅助 =====================
bool getTouchPoint(int &tx, int &ty) {
  if (!ts.tirqTouched()) return false;
  if (!ts.touched()) return false;

  TS_Point p = ts.getPoint();

  tx = map(p.x, 200, 3700, 0, SCREEN_W);
  ty = map(p.y, 240, 3800, 0, SCREEN_H);

  if (tx < 0) tx = 0;
  if (tx >= SCREEN_W) tx = SCREEN_W - 1;
  if (ty < 0) ty = 0;
  if (ty >= SCREEN_H) ty = SCREEN_H - 1;

  return true;
}

bool pointInRect(int px, int py, int rx, int ry, int rw, int rh) {
  return (px >= rx && px < rx + rw && py >= ry && py < ry + rh);
}

bool pointInCircle(int px, int py, int cx, int cy, int radius) {
  int dx = px - cx;
  int dy = py - cy;
  return (dx * dx + dy * dy) <= radius * radius;
}

// ===================== 初始化 =====================
void setup() {
  Serial.begin(115200);
  delay(500);

  // 触摸初始化 (使用独立 SPI)
  touchSPI.begin(TOUCH_SCLK, TOUCH_MISO, TOUCH_MOSI, XPT2046_CS);
  ts.begin(touchSPI);
  ts.setRotation(0);

  // 关键：先初始化主SPI总线 (ESP32-S3必须显式调用)
  SPI.begin(12, SD_MISO, 11, -1);  // SCK=12, MISO=13, MOSI=11, CS=-1
  delay(100);

  // 屏幕初始化
  tft.init();
  tft.invertDisplay(true);  // 修复反色问题
  tft.setRotation(0);
  tft.fillScreen(BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(2);
  showMessage("初始化...");

  // SD 卡初始化
  bool sdOK = false;
  for (int i = 0; i < 3; i++) {
    if (SD.begin(SD_CS, SPI)) {
      sdOK = true;
      break;
    }
    Serial.printf("SD卡初始化失败，重试 %d/3\n", i + 1);
    delay(500);
  }
  if (!sdOK) {
    showMessage("SD卡失败! 检查接线");
    Serial.println("[SD] 初始化失败！请检查：");
    Serial.println("  1. SD卡是否插入");
    Serial.println("  2. CS->GPIO14, SCK->GPIO12, MOSI->GPIO11, MISO->GPIO13");
    Serial.println("  3. SD卡是否FAT32格式");
    Serial.println("  4. VCC->3.3V, GND->GND");
  } else {
    showMessage("SD卡OK");
    Serial.println("[SD] 初始化成功");
  }
  delay(300);

  // BLE 蓝牙初始化 (ESP32-S3 支持 BLE)
  Serial.println("[BLE] 正在启动BLE...");
  BLEDevice::init("ESP32_MusicBox");

  // 创建BLE服务器
  pServer = BLEDevice::createServer();
  pServer->setCallbacks(new MyServerCallbacks());

  // 创建BLE服务
  BLEService *pService = pServer->createService(BLE_SERVICE_UUID);

  // 创建TX特征值 (ESP32发送，手机接收，使用通知)
  pTxCharacteristic = pService->createCharacteristic(
                         BLE_CHARACTERISTIC_TX_UUID,
                         BLECharacteristic::PROPERTY_NOTIFY
                       );
  pTxCharacteristic->addDescriptor(new BLE2902());

  // 创建RX特征值 (手机写入，ESP32接收)
  pRxCharacteristic = pService->createCharacteristic(
                        BLE_CHARACTERISTIC_RX_UUID,
                        BLECharacteristic::PROPERTY_WRITE
                      );
  pRxCharacteristic->setCallbacks(new MyRxCallbacks());

  // 启动服务
  pService->start();

  // 开始广播
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  pAdvertising->addServiceUUID(BLE_SERVICE_UUID);
  pAdvertising->setScanResponse(true);
  pAdvertising->setMinPreferred(0x06);  // 有助于连接稳定性
  pAdvertising->setMinPreferred(0x12);
  BLEDevice::startAdvertising();

  Serial.println("[BLE] BLE已启动，设备名: ESP32_MusicBox");
  Serial.println("[BLE] 等待手机连接...");
  showMessage("BLE Ready!");

  delay(500);

  scanAudioFiles();

  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(volume);

  drawListScreen();
}

// ===================== 主循环 =====================
void loop() {
  audio.loop();
  handleTouch();

  // BLE 断开重连处理
  if (!deviceConnected && oldDeviceConnected) {
    delay(500);
    pServer->getAdvertising()->start();
    oldDeviceConnected = deviceConnected;
  }
  if (deviceConnected && !oldDeviceConnected) {
    oldDeviceConnected = deviceConnected;
  }

  if (screen == PLAYING && isPlaying && !isPaused) {
    updateProgress();
  }
}

// ===================== 触摸处理 =====================
void handleTouch() {
  if (millis() - lastTouchTime < TOUCH_DEBOUNCE) return;

  int tx, ty;
  if (!getTouchPoint(tx, ty)) return;

  lastTouchTime = millis();
  Serial.printf("[Touch] x=%d y=%d\n", tx, ty);

  // 蓝牙传输界面: 点击任意位置取消
  if (screen == BT_TRANSFER) {
    if (btFile) btFile.close();
    btState = BT_IDLE;
    screen = LIST;
    if (currentIndex >= fileCount) currentIndex = 0;
    drawListScreen();
    return;
  }

  if (screen == LIST) {
    handleListTouch(tx, ty);
  } else if (screen == PLAYING) {
    handlePlayTouch(tx, ty);
  }
}

// 列表界面触摸处理
void handleListTouch(int tx, int ty) {
  // 点击列表区域: 选择歌曲
  if (ty >= LIST_AREA_Y && ty < LIST_AREA_Y + LIST_AREA_H) {
    int row = (ty - LIST_AREA_Y) / ROW_HEIGHT;
    int idx = scrollOffset + row;

    if (idx >= 0 && idx < fileCount) {
      if (idx == currentIndex) {
        playFile(idx);
      } else {
        currentIndex = idx;
        checkScroll();
        drawListScreen();
      }
    }
    return;
  }

  // 点击底部按钮区域
  if (ty >= SCREEN_H - FOOTER_H) {
    int btnW = SCREEN_W / 3;
    if (tx < btnW) {
      if (currentIndex > 0) { currentIndex--; checkScroll(); drawListScreen(); }
    } else if (tx < btnW * 2) {
      playFile(currentIndex);
    } else {
      if (currentIndex < fileCount - 1) { currentIndex++; checkScroll(); drawListScreen(); }
    }
    return;
  }

  // 上半部分空白区域: 上滑
  if (ty < LIST_AREA_Y + LIST_AREA_H / 2) {
    scrollOffset -= VISIBLE_ROWS;
    if (scrollOffset < 0) scrollOffset = 0;
    if (currentIndex > scrollOffset + VISIBLE_ROWS - 1)
      currentIndex = scrollOffset + VISIBLE_ROWS - 1;
    drawListScreen();
  } else {
    if (scrollOffset + VISIBLE_ROWS < fileCount) {
      scrollOffset += VISIBLE_ROWS;
      if (currentIndex < scrollOffset) currentIndex = scrollOffset;
      drawListScreen();
    }
  }
}

// 播放界面触摸处理
void handlePlayTouch(int tx, int ty) {
  // 返回按钮 (左上角)
  if (pointInRect(tx, ty, 0, 0, 60, 36)) {
    screen = LIST;
    drawListScreen();
    return;
  }

  int btnR = 22;

  if (pointInCircle(tx, ty, BTN_PREV_X, PLAY_BTN_Y, btnR)) {
    playPrevious();
    return;
  }

  if (pointInCircle(tx, ty, BTN_VOL_DOWN_X, PLAY_BTN_Y, btnR)) {
    if (volume > 0) { volume--; audio.setVolume(volume); drawVolumeBar(); }
    return;
  }

  if (pointInCircle(tx, ty, BTN_PLAY_X, PLAY_BTN_Y, btnR + 5)) {
    togglePause();
    return;
  }

  if (pointInCircle(tx, ty, BTN_VOL_UP_X, PLAY_BTN_Y, btnR)) {
    if (volume < 21) { volume++; audio.setVolume(volume); drawVolumeBar(); }
    return;
  }

  if (pointInCircle(tx, ty, BTN_NEXT_X, PLAY_BTN_Y, btnR)) {
    playNext();
    return;
  }
}

// ===================== 滚动控制 =====================
void checkScroll() {
  if (currentIndex < scrollOffset) scrollOffset = currentIndex;
  else if (currentIndex >= scrollOffset + VISIBLE_ROWS)
    scrollOffset = currentIndex - VISIBLE_ROWS + 1;
}

// ===================== 音频控制 =====================
void playFile(int index) {
  if (index < 0 || index >= fileCount) return;
  String path = "/" + fileList[index];
  audio.stopSong();
  audio.connecttoFS(SD, path.c_str());
  playingIndex = index;
  isPlaying = true;
  isPaused = false;
  screen = PLAYING;
  drawPlayScreen();
}

void togglePause() {
  if (!isPlaying && !isPaused) return;
  audio.pauseResume();
  isPaused = !isPaused;
  isPlaying = !isPaused;
  drawPlayScreen();
}

void playNext() {
  int next = playingIndex + 1;
  if (next >= fileCount) next = 0;
  currentIndex = next;
  playFile(next);
}

void playPrevious() {
  int prev = playingIndex - 1;
  if (prev < 0) prev = fileCount - 1;
  currentIndex = prev;
  playFile(prev);
}

// ===================== 文件扫描 =====================
void scanAudioFiles() {
  fileCount = 0;
  File root = SD.open("/");
  while (true) {
    File entry = root.openNextFile();
    if (!entry) break;
    if (!entry.isDirectory()) {
      String name = String(entry.name());
      name.toLowerCase();
      if (name.endsWith(".mp3") || name.endsWith(".wav") ||
          name.endsWith(".flac") || name.endsWith(".aac") ||
          name.endsWith(".ogg") || name.endsWith(".m4a")) {
        if (fileCount < 60) {
          fileList[fileCount] = String(entry.name());
          fileCount++;
        }
      }
    }
    entry.close();
  }
  root.close();

  for (int i = 0; i < fileCount - 1; i++) {
    for (int j = i + 1; j < fileCount; j++) {
      if (fileList[i] > fileList[j]) {
        String tmp = fileList[i]; fileList[i] = fileList[j]; fileList[j] = tmp;
      }
    }
  }
}

// ===================== UI 辅助 =====================
String removeExtension(const String& filename) {
  int dot = filename.lastIndexOf('.');
  if (dot > 0) return filename.substring(0, dot);
  return filename;
}

// ===================== UI 绘制 =====================
void showMessage(const char* msg) {
  tft.fillScreen(BG_COLOR);
  tft.setTextDatum(MC_DATUM);
  tft.setTextSize(2);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.drawString(msg, SCREEN_W / 2, SCREEN_H / 2);
  tft.setTextDatum(TL_DATUM);
}

void drawFooter(const char* text) {
  tft.fillRect(0, SCREEN_H - FOOTER_H, SCREEN_W, FOOTER_H, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setTextSize(1);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(text, SCREEN_W / 2, SCREEN_H - FOOTER_H + 8);
  tft.setTextDatum(TL_DATUM);
}

// 绘制圆形按钮
void drawCircleBtn(int cx, int cy, int r, const char* label, uint16_t color) {
  tft.fillCircle(cx, cy, r, color);
  tft.drawCircle(cx, cy, r, TFT_WHITE);
  tft.setTextColor(TFT_WHITE, color);
  tft.setTextSize(1);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(label, cx, cy);
  tft.setTextDatum(TL_DATUM);
}

// ===================== 列表界面 =====================
void drawListScreen() {
  tft.fillScreen(BG_COLOR);

  // 标题栏
  tft.fillRect(0, 0, SCREEN_W, HEADER_H, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setTextSize(1);
  tft.setTextDatum(TL_DATUM);

  char buf[32];
  sprintf(buf, "音乐 %d/%d", fileCount > 0 ? currentIndex + 1 : 0, fileCount);
  tft.drawString(buf, 4, 4);

  // 蓝牙状态
  if (deviceConnected) {
    tft.setTextColor(TFT_GREEN, TFT_DARKGREY);
    tft.drawString("BT", SCREEN_W / 2 - 10, 4);
  } else {
    tft.setTextColor(TFT_RED, TFT_DARKGREY);
    tft.drawString("BT", SCREEN_W / 2 - 10, 4);
  }

  // 播放指示
  if (playingIndex >= 0) {
    tft.setTextColor(PLAYING_COLOR, TFT_DARKGREY);
    tft.drawString("PLAY", SCREEN_W / 2 + 20, 4);
  }

  // 时钟显示
  if (timeSynced) {
    unsigned long now = getCurrentTime();
    unsigned long hours = (now % 86400) / 3600;
    unsigned long mins = (now % 3600) / 60;
    char timeBuf[16];
    sprintf(timeBuf, "%02lu:%02lu", hours, mins);
    tft.setTextColor(TFT_CYAN, TFT_DARKGREY);
    tft.setTextDatum(TR_DATUM);
    tft.drawString(timeBuf, SCREEN_W - 4, 2);
    tft.setTextDatum(TL_DATUM);
  }

  tft.setTextDatum(TL_DATUM);

  // 文件列表
  int y = LIST_AREA_Y;
  for (int i = 0; i < VISIBLE_ROWS; i++) {
    int idx = scrollOffset + i;
    if (idx >= fileCount) break;

    bool isCurrent = (idx == currentIndex);
    bool isPlaying = (idx == playingIndex);

    uint16_t bgColor = isCurrent ? HIGHLIGHT_COLOR : BG_COLOR;
    uint16_t fgColor = isCurrent ? TFT_WHITE : TEXT_COLOR;

    tft.fillRect(0, y, SCREEN_W, ROW_HEIGHT, bgColor);

    // 序号
    tft.setTextColor(fgColor, bgColor);
    tft.setTextSize(1);
    char num[8];
    sprintf(num, "%02d", idx + 1);
    tft.drawString(num, 4, y + 4);

    // 文件名 (不带后缀)
    String displayName = removeExtension(fileList[idx]);
    if (displayName.length() > 26) displayName = displayName.substring(0, 25) + "~";
    tft.drawString(displayName, 28, y + 4);

    // 播放标记
    if (isPlaying) {
      tft.setTextColor(PLAYING_COLOR, bgColor);
      tft.setTextDatum(TR_DATUM);
      tft.drawString(">", SCREEN_W - 4, y + 4);
      tft.setTextDatum(TL_DATUM);
    }

    y += ROW_HEIGHT;
  }

  // 底部按钮栏
  drawFooter("  UP   |  PLAY  | DOWN");
}

// ===================== 播放界面 =====================
void drawPlayScreen() {
  tft.fillScreen(BG_COLOR);

  // 顶部栏
  tft.fillRect(0, 0, SCREEN_W, HEADER_H, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setTextSize(1);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("< List", 4, 4);
  tft.setTextDatum(TR_DATUM);
  tft.drawString("Playing", SCREEN_W - 4, 4);
  tft.setTextDatum(TL_DATUM);

  // 歌曲名
  if (playingIndex >= 0) {
    String songName = removeExtension(fileList[playingIndex]);
    tft.setTextColor(TEXT_COLOR, BG_COLOR);
    tft.setTextSize(2);
    tft.setTextDatum(TC_DATUM);
    if (songName.length() > 14) songName = songName.substring(0, 13) + "~";
    tft.drawString(songName, SCREEN_W / 2, 60);
    tft.setTextDatum(TL_DATUM);
  }

  // 播放/暂停状态
  tft.setTextSize(3);
  tft.setTextDatum(TC_DATUM);
  if (isPlaying && !isPaused) {
    tft.setTextColor(PLAYING_COLOR, BG_COLOR);
    tft.drawString("> PLAY", SCREEN_W / 2, 110);
  } else {
    tft.setTextColor(TFT_YELLOW, BG_COLOR);
    tft.drawString("|| PAUSE", SCREEN_W / 2, 110);
  }
  tft.setTextDatum(TL_DATUM);
  tft.setTextSize(1);

  // 进度条
  updateProgress();

  // 音量
  drawVolumeBar();

  // 触摸按钮
  tft.setTextSize(1);
  drawCircleBtn(BTN_PREV_X, PLAY_BTN_Y, 22, "PREV", BTN_COLOR);
  drawCircleBtn(BTN_VOL_DOWN_X, PLAY_BTN_Y, 20, "V-", BTN_COLOR);
  drawCircleBtn(BTN_PLAY_X, PLAY_BTN_Y, 25, "P/P", BTN_ACTIVE);
  drawCircleBtn(BTN_VOL_UP_X, PLAY_BTN_Y, 20, "V+", BTN_COLOR);
  drawCircleBtn(BTN_NEXT_X, PLAY_BTN_Y, 22, "NEXT", BTN_COLOR);

  // 底部提示
  drawFooter("tap buttons to control");
}

// ===================== 进度更新 =====================
void updateProgress() {
  if (playingIndex < 0) return;

  uint32_t total = audio.getAudioFileDuration();
  uint32_t current = audio.getAudioCurrentTime();

  if (total > 0) {
    // 进度条
    int barX = 20, barY = 160, barW = 200, barH = 8;
    tft.fillRect(barX, barY, barW, barH, TFT_DARKGREY);
    int fillW = (int)((current * barW) / total);
    tft.fillRect(barX, barY, fillW, barH, PROGRESS_COLOR);

    // 时间显示
    char timeBuf[32];
    sprintf(timeBuf, "%02d:%02d   %02d:%02d",
            current / 60, current % 60,
            total / 60, total % 60);
    tft.setTextColor(TEXT_COLOR, BG_COLOR);
    tft.setTextSize(1);
    tft.setTextDatum(TC_DATUM);
    tft.drawString(timeBuf, SCREEN_W / 2, barY + 12);
    tft.setTextDatum(TL_DATUM);
  }
}

// ===================== 音量条 =====================
void drawVolumeBar() {
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(1);
  tft.setTextDatum(TL_DATUM);
  char volBuf[16];
  sprintf(volBuf, "VOL: %d/21", volume);
  tft.drawString(volBuf, 20, 195);

  // 音量条
  int barX = 20, barY = 210, barW = 200, barH = 6;
  tft.fillRect(barX, barY, barW, barH, TFT_DARKGREY);
  int fillW = (volume * barW) / 21;
  tft.fillRect(barX, barY, fillW, barH, ACCENT_COLOR);
}

// ===================== 蓝牙传输界面 =====================
void drawBtTransferScreen() {
  tft.fillScreen(BG_COLOR);

  // 标题
  tft.fillRect(0, 0, SCREEN_W, HEADER_H, BT_COLOR);
  tft.setTextColor(TFT_WHITE, BT_COLOR);
  tft.setTextSize(2);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("BLE 接收", SCREEN_W / 2, 10);
  tft.setTextDatum(TL_DATUM);

  // 文件名
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(1);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("文件:", 10, 50);
  if (btFileName.length() > 28) {
    tft.drawString(btFileName.substring(0, 27) + "~", 10, 65);
  } else {
    tft.drawString(btFileName, 10, 65);
  }

  drawBtProgress();
  drawBtFooter();
}

void drawBtProgress() {
  if (btFileSize == 0) return;

  int pct = (btReceived * 100) / btFileSize;

  // 进度条
  int barX = 20, barY = 130, barW = 200, barH = 16;
  tft.fillRect(barX, barY, barW, barH, TFT_DARKGREY);
  int fillW = (pct * barW) / 100;
  tft.fillRect(barX, barY, fillW, barH, PROGRESS_COLOR);

  // 百分比 (大号字体)
  char pctBuf[16];
  sprintf(pctBuf, "%d%%", pct);
  tft.setTextColor(PLAYING_COLOR, BG_COLOR);
  tft.setTextSize(4);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(pctBuf, SCREEN_W / 2, 170);
  tft.setTextDatum(TL_DATUM);

  // 已接收/总大小
  char sizeBuf[48];
  sprintf(sizeBuf, "%s / %s", formatSize(btReceived).c_str(), formatSize(btFileSize).c_str());
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(1);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(sizeBuf, SCREEN_W / 2, 210);
  tft.setTextDatum(TL_DATUM);
}

void drawBtComplete() {
  tft.fillScreen(BG_COLOR);
  tft.setTextColor(PLAYING_COLOR, BG_COLOR);
  tft.setTextSize(3);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("DONE!", SCREEN_W / 2, SCREEN_H / 2 - 20);

  tft.setTextSize(1);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.drawString(btFileName, SCREEN_W / 2, SCREEN_H / 2 + 20);
  tft.setTextDatum(TL_DATUM);
}

void drawBtFooter() {
  tft.fillRect(0, SCREEN_H - FOOTER_H, SCREEN_W, FOOTER_H, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setTextSize(1);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("touch to cancel", SCREEN_W / 2, SCREEN_H - FOOTER_H + 8);
  tft.setTextDatum(TL_DATUM);
}

// ===================== 辅助函数 =====================
String formatSize(uint32_t bytes) {
  char buf[32];
  if (bytes >= 1024 * 1024) {
    sprintf(buf, "%.1fMB", (float)bytes / (1024.0 * 1024.0));
  } else if (bytes >= 1024) {
    sprintf(buf, "%.1fKB", (float)bytes / 1024.0);
  } else {
    sprintf(buf, "%luB", bytes);
  }
  return String(buf);
}

unsigned long getCurrentTime() {
  if (!timeSynced) return 0;
  return syncedTime + (millis() - syncMillis) / 1000;
}
