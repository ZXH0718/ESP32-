/*
  ESP32-S3 按键式带屏幕音频播放器 (蓝牙版)
  硬件: 嘉顺 ESP32-S3 N16R8 + 1.54" ST7789 IPS 240x240 + MAX98357A + Mini SD卡模块 + 5按键
  支持格式: MP3, WAV, FLAC, AAC, OGG
  功能: 按键浏览文件、播放/暂停、上一首/下一首、音量调节、进度显示
        蓝牙接收文件（通过手机APP传输音乐到SD卡）

  ========== 接线表 ==========
  ESP32-S3      1.54" ST7789     MAX98357A     Mini SD模块     按键(5个)
  --------      -------------    ----------    -------------   ----------
  3.3V    -->   VCC              VIN           VCC              -
  GND     -->   GND              GND           GND              另一端全接GND
  GPIO11  -->   SDA (MOSI)
  GPIO12  -->   SCL (SCK)
  GPIO10  -->   CS
  GPIO9   -->   DC
  GPIO8   -->   RES (RST)
  3.3V    -->   BLK (背光,常亮)
  GPIO13  -->   -                -             MISO
  GPIO14  -->   -                -             CS
  GPIO4   -->   -                BCLK
  GPIO5   -->   -                LRCLK (LRC)
  GPIO6   -->   -                DIN
  GPIO15  -->   -                -             -                上键
  GPIO16  -->   -                -             -                下键
  GPIO17  -->   -                -             -                确认键
  GPIO18  -->   -                -             -                返回键
  GPIO21  -->   -                -             -                菜单键

  喇叭(28mm 4Ω3W) --> 接 MAX98357A 绿色端子 SPK+/SPK-

  ========== 开发环境 ==========
  Arduino IDE -> 开发板选 "ESP32S3 Dev Module"
  依赖库: TFT_eSPI (by Bodmer), ESP32-audioI2S (by schreibfaul1)
  蓝牙: 使用内置 BluetoothSerial 库（无需额外安装）
  重要: 工具 -> Partition Scheme -> 选 "Huge APP (3MB No OTA/1MB SPIFFS)"
        工具 -> PSRAM -> 选 "OPI PSRAM 8MB"

  ========== TFT_eSPI 配置 ==========
  修改 库目录 TFT_eSPI/User_Setup.h，用以下内容替换:

    #define USER_SETUP_INFO "ESP32-S3 ST7789 240x240"
    #define ST7789_DRIVER
    #define TFT_WIDTH  240
    #define TFT_HEIGHT 240

    #define TFT_MOSI 11
    #define TFT_SCLK 12
    #define TFT_CS   10
    #define TFT_DC    9
    #define TFT_RST   8

    // #define TFT_RGB_ORDER TFT_BGR

    #define LOAD_GLCD
    #define LOAD_FONT2
    #define LOAD_FONT4
    #define LOAD_FONT6
    #define LOAD_FONT7
    #define LOAD_FONT8
    #define LOAD_GFXFF
    #define SMOOTH_FONT

    #define SPI_FREQUENCY  40000000

  ========== 蓝牙文件传输协议 ==========
  手机 -> ESP32:
    [0xAB] [文件名 UTF-8] [0x00] [文件大小 4字节小端] [文件数据 N字节]

  ESP32 -> 手机:
    收到完整文件后发送 "OK\n"
    接收出错发送 "ERR\n"

  ========== 蓝牙遥控命令协议 ==========
  在 BT_IDLE 状态下（无文件传输时），手机发送单字节命令:
    0xC0 → 播放/暂停（togglePause，未播放则播放 currentIndex 指向歌曲）
    0xC1 → 上一首（playPrevious）
    0xC2 → 下一首（playNext）
    0xC3 → 音量+（最大21）
    0xC4 → 音量-（最小0）
    0xC5 → 获取状态（回复 JSON: {"playing":bool,"paused":bool,"vol":int,"song":"name","index":int,"total":int}）

  ESP32 -> 手机:
    0xC0-0xC4 命令执行后回复 "OK\n"
    0xC5 回复 JSON 状态字符串 + "\n"
*/

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <TFT_eSPI.h>
#include <Audio.h>
#include "BluetoothSerial.h"

// ===================== 引脚定义 =====================
#define I2S_DOUT      6
#define I2S_BCLK      4
#define I2S_LRC       5

#define SD_MISO       13
#define SD_CS         14

#define BTN_UP        15
#define BTN_DOWN      16
#define BTN_OK        17
#define BTN_BACK      18
#define BTN_MENU      21

// ===================== 全局对象 =====================
TFT_eSPI tft = TFT_eSPI();
Audio audio;
BluetoothSerial SerialBT;

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

unsigned long lastBtnTime = 0;
const unsigned long DEBOUNCE_MS = 200;

// ===================== 蓝牙接收状态机 =====================
enum BtState { BT_IDLE, BT_RECV_NAME, BT_RECV_SIZE, BT_RECV_DATA };
BtState btState = BT_IDLE;

File btFile;            // 当前接收的文件
String btFileName = ""; // 接收中的文件名
uint32_t btFileSize = 0;
uint32_t btReceived = 0;
uint8_t btSizeBuf[4];
int btSizeIdx = 0;
bool btConnected = false;

// ===================== UI 参数 =====================
#define BG_COLOR        TFT_BLACK
#define TEXT_COLOR      TFT_WHITE
#define HIGHLIGHT_COLOR TFT_BLUE
#define PLAYING_COLOR   TFT_GREEN
#define PROGRESS_COLOR  TFT_CYAN
#define ACCENT_COLOR    TFT_MAGENTA
#define BT_COLOR        TFT_ORANGE

#define SCREEN_W        240
#define SCREEN_H        240
#define ROW_HEIGHT      22
#define HEADER_H        24
#define FOOTER_H        18
#define VISIBLE_ROWS    9

// ===================== 蓝牙回调 =====================
void btCallback(esp_spp_cb_event_t event, esp_spp_cb_param_t *param) {
  if (event == ESP_SPP_SRV_OPEN_EVT) {
    btConnected = true;
    Serial.println("[BT] 手机已连接");
  } else if (event == ESP_SPP_CLOSE_EVT) {
    btConnected = false;
    Serial.println("[BT] 手机断开");
    // 断开时清理未完成的接收
    if (btState != BT_IDLE && btFile) {
      btFile.close();
      btState = BT_IDLE;
    }
  }
}

// ===================== 初始化 =====================
void setup() {
  Serial.begin(115200);
  delay(500);

  pinMode(BTN_UP,   INPUT_PULLUP);
  pinMode(BTN_DOWN, INPUT_PULLUP);
  pinMode(BTN_OK,   INPUT_PULLUP);
  pinMode(BTN_BACK, INPUT_PULLUP);
  pinMode(BTN_MENU, INPUT_PULLUP);

  tft.init();
  tft.setRotation(0);
  tft.fillScreen(BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(2);
  showMessage("初始化...");

  // SD 卡
  SPI.begin(12, SD_MISO, 11, SD_CS);
  if (!SD.begin(SD_CS)) {
    showMessage("SD卡失败!");
    while (1) delay(100);
  }
  showMessage("SD卡OK");
  delay(200);

  // 蓝牙初始化
  SerialBT.begin("ESP32_MusicBox");
  SerialBT.register_callback(btCallback);
  Serial.println("[BT] 蓝牙已启动，设备名: ESP32_MusicBox");
  delay(200);

  scanAudioFiles();

  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(volume);

  drawListScreen();
}

// ===================== 主循环 =====================
void loop() {
  audio.loop();
  handleButtons();
  handleBluetooth();
  if (screen == PLAYING && isPlaying && !isPaused) {
    updateProgress();
  }
}

// ===================== 蓝牙遥控命令处理 =====================
void handleBtCommand(uint8_t cmd) {
  switch (cmd) {
    case 0xC0: // 播放/暂停
      if (!isPlaying && !isPaused) {
        // 当前没有在播放，播放 currentIndex 指向的歌曲
        playFile(currentIndex);
      } else {
        togglePause();
      }
      SerialBT.write("OK\n");
      break;

    case 0xC1: // 上一首
      playPrevious();
      SerialBT.write("OK\n");
      break;

    case 0xC2: // 下一首
      playNext();
      SerialBT.write("OK\n");
      break;

    case 0xC3: // 音量+
      if (volume < 21) {
        volume++;
        audio.setVolume(volume);
        if (screen == PLAYING) drawVolumeBar();
      }
      SerialBT.write("OK\n");
      break;

    case 0xC4: // 音量-
      if (volume > 0) {
        volume--;
        audio.setVolume(volume);
        if (screen == PLAYING) drawVolumeBar();
      }
      SerialBT.write("OK\n");
      break;

    case 0xC5: // 获取状态
      {
        String song = "";
        if (playingIndex >= 0 && playingIndex < fileCount) {
          song = fileList[playingIndex];
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
        SerialBT.write(json.c_str());
      }
      break;

    default:
      break;
  }
}

// ===================== 蓝牙接收处理 =====================
void handleBluetooth() {
  if (!btConnected) return;

  int available = SerialBT.available();
  if (available <= 0) return;

  uint8_t buf[512];
  int len = SerialBT.readBytes(buf, min(available, 512));

  for (int i = 0; i < len; i++) {
    uint8_t b = buf[i];

    switch (btState) {
      case BT_IDLE:
        // 蓝牙遥控命令（0xC0-0xC5）
        if (b >= 0xC0 && b <= 0xC5) {
          handleBtCommand(b);
        }
        // 等待起始标记 0xAB
        else if (b == 0xAB) {
          btState = BT_RECV_NAME;
          btFileName = "";
          btFileSize = 0;
          btReceived = 0;
          btSizeIdx = 0;
        }
        break;

      case BT_RECV_NAME:
        // 读取文件名，直到遇到 0x00 分隔符
        if (b == 0x00) {
          btState = BT_RECV_SIZE;
          btSizeIdx = 0;
        } else {
          btFileName += (char)b;
        }
        break;

      case BT_RECV_SIZE:
        // 读取 4 字节文件大小（小端序）
        btSizeBuf[btSizeIdx++] = b;
        if (btSizeIdx >= 4) {
          btFileSize = btSizeBuf[0] | (btSizeBuf[1] << 8) |
                       (btSizeBuf[2] << 16) | (btSizeBuf[3] << 24);

          Serial.printf("[BT] 接收文件: %s (%u 字节)\n", btFileName.c_str(), btFileSize);

          // 检查文件名是否合法
          if (btFileName.length() == 0 || btFileSize == 0 || btFileSize > 50 * 1024 * 1024) {
            Serial.println("[BT] 无效的文件头");
            SerialBT.write("ERR\n");
            btState = BT_IDLE;
            break;
          }

          // 打开文件准备写入
          String path = "/" + btFileName;
          btFile = SD.open(path.c_str(), FILE_WRITE);
          if (!btFile) {
            Serial.printf("[BT] 无法创建文件: %s\n", path.c_str());
            SerialBT.write("ERR\n");
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
        // 写入 SD 卡
        btFile.write(&b, 1);
        btReceived++;

        // 每收到约 4KB 更新一次进度显示（避免刷屏太快）
        if (btReceived % 4096 == 0) {
          drawBtProgress();
        }

        // 接收完成
        if (btReceived >= btFileSize) {
          btFile.close();
          Serial.printf("[BT] 接收完成: %s\n", btFileName.c_str());
          SerialBT.write("OK\n");

          // 重新扫描文件列表
          scanAudioFiles();
          btState = BT_IDLE;

          // 短暂显示完成信息
          drawBtComplete();

          // 2秒后回到列表
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
}

// ===================== 蓝牙传输界面 =====================
void drawBtTransferScreen() {
  tft.fillScreen(BG_COLOR);

  tft.setTextColor(BT_COLOR, BG_COLOR);
  tft.setTextSize(2);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("BT Receiving", SCREEN_W / 2, 10);

  // 分隔线
  tft.drawFastHLine(10, 32, SCREEN_W - 20, TFT_DARKGREY);

  // 文件名
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(1);
  tft.setTextDatum(TC_DATUM);
  String name = btFileName;
  if (name.length() > 30) name = name.substring(0, 27) + "...";
  tft.drawString(name.c_str(), SCREEN_W / 2, 40);

  drawBtProgress();
}

void drawBtProgress() {
  int barX = 10, barY = 65, barW = SCREEN_W - 20, barH = 12;

  // 进度条
  tft.fillRoundRect(barX, barY, barW, barH, 3, TFT_DARKGREY);
  int progress = 0;
  if (btFileSize > 0) {
    progress = (int)((uint64_t)btReceived * barW / btFileSize);
  }
  if (progress > 0) {
    tft.fillRoundRect(barX + 1, barY + 1, progress, barH - 2, 3, BT_COLOR);
  }

  // 百分比
  tft.fillRect(0, barY + 16, SCREEN_W, 20, BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(2);
  tft.setTextDatum(TC_DATUM);
  int pct = 0;
  if (btFileSize > 0) {
    pct = (int)((uint64_t)btReceived * 100 / btFileSize);
  }
  tft.printf("%d%%", pct);

  // 已接收 / 总大小
  tft.setTextSize(1);
  tft.setTextColor(TFT_LIGHTGREY, BG_COLOR);
  tft.drawString(formatSize(btReceived), SCREEN_W / 4, barY + 42);
  tft.drawString(formatSize(btFileSize), SCREEN_W * 3 / 4, barY + 42);

  // 蓝牙图标
  tft.setTextSize(1);
  tft.setTextColor(btConnected ? BT_COLOR : TFT_DARKGREY, BG_COLOR);
  tft.drawString(btConnected ? "BT Connected" : "BT Disconnected", SCREEN_W / 2, barY + 60);

  // 提示
  drawBtFooter();
}

void drawBtComplete() {
  tft.fillScreen(BG_COLOR);

  tft.setTextColor(PLAYING_COLOR, BG_COLOR);
  tft.setTextSize(3);
  tft.setTextDatum(MC_DATUM);
  tft.drawString("DONE!", SCREEN_W / 2, SCREEN_H / 2 - 20);

  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(1);
  tft.drawString(btFileName.c_str(), SCREEN_W / 2, SCREEN_H / 2 + 15);
  tft.drawString(formatSize(btFileSize), SCREEN_W / 2, SCREEN_H / 2 + 30);

  tft.setTextColor(TFT_DARKGREY, BG_COLOR);
  tft.drawString("Returning to list...", SCREEN_W / 2, SCREEN_H / 2 + 55);
  tft.setTextDatum(TL_DATUM);
}

void drawBtFooter() {
  tft.fillRect(0, SCREEN_H - FOOTER_H, SCREEN_W, FOOTER_H, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setTextSize(1);
  tft.setTextDatum(TC_DATUM);
  if (btState == BT_RECV_DATA) {
    tft.drawString("Receiving... wait", SCREEN_W / 2, SCREEN_H - FOOTER_H + 5);
  } else {
    tft.drawString("Waiting for file...", SCREEN_W / 2, SCREEN_H - FOOTER_H + 5);
  }
  tft.setTextDatum(TL_DATUM);
}

String formatSize(uint32_t bytes) {
  if (bytes < 1024) return String(bytes) + " B";
  if (bytes < 1024 * 1024) return String(bytes / 1024) + " KB";
  return String(bytes / 1024 / 1024) + " MB";
}

// ===================== 按键处理 =====================
void handleButtons() {
  if (millis() - lastBtnTime < DEBOUNCE_MS) return;

  // 蓝牙接收中只允许返回键中断
  if (screen == BT_TRANSFER) {
    if (digitalRead(BTN_BACK) == LOW) {
      // 取消接收
      if (btFile) btFile.close();
      btState = BT_IDLE;
      screen = LIST;
      drawListScreen();
      lastBtnTime = millis();
    }
    return;
  }

  if (digitalRead(BTN_UP) == LOW) {
    if (screen == LIST) {
      if (currentIndex > 0) { currentIndex--; checkScroll(); drawListScreen(); }
    } else {
      if (volume < 21) { volume++; audio.setVolume(volume); drawVolumeBar(); }
    }
    lastBtnTime = millis(); return;
  }

  if (digitalRead(BTN_DOWN) == LOW) {
    if (screen == LIST) {
      if (currentIndex < fileCount - 1) { currentIndex++; checkScroll(); drawListScreen(); }
    } else {
      if (volume > 0) { volume--; audio.setVolume(volume); drawVolumeBar(); }
    }
    lastBtnTime = millis(); return;
  }

  if (digitalRead(BTN_OK) == LOW) {
    if (screen == LIST) playFile(currentIndex);
    else togglePause();
    lastBtnTime = millis(); return;
  }

  if (digitalRead(BTN_BACK) == LOW) {
    if (screen == LIST) { currentIndex = 0; scrollOffset = 0; drawListScreen(); }
    else playPrevious();
    lastBtnTime = millis(); return;
  }

  if (digitalRead(BTN_MENU) == LOW) {
    if (screen == PLAYING) { screen = LIST; drawListScreen(); }
    else if (screen == LIST && playingIndex >= 0) {
      currentIndex = playingIndex; checkScroll(); drawListScreen();
    }
    lastBtnTime = millis(); return;
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
  audio.pauseSong();
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
  tft.drawString(text, SCREEN_W / 2, SCREEN_H - FOOTER_H + 5);
  tft.setTextDatum(TL_DATUM);
}

void drawListScreen() {
  tft.fillScreen(BG_COLOR);

  tft.fillRect(0, 0, SCREEN_W, HEADER_H, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setTextSize(2);
  tft.setTextDatum(TL_DATUM);
  tft.setCursor(4, 4);
  tft.printf("Music %d/%d", currentIndex + 1, fileCount);

  if (playingIndex >= 0) {
    tft.setTextColor(PLAYING_COLOR, TFT_DARKGREY);
    tft.setTextDatum(TR_DATUM);
    tft.drawString("PLAY", SCREEN_W - 4, 4);
    tft.setTextDatum(TL_DATUM);
  }

  // 蓝牙状态指示
  tft.setTextSize(1);
  tft.setTextColor(btConnected ? BT_COLOR : TFT_DARKGREY, TFT_DARKGREY);
  tft.setCursor(4, 14);
  tft.print(btConnected ? "BT" : "");

  tft.setTextSize(1);
  for (int i = 0; i < VISIBLE_ROWS; i++) {
    int idx = scrollOffset + i;
    if (idx >= fileCount) break;
    int y = HEADER_H + i * ROW_HEIGHT;

    if (idx == currentIndex) {
      tft.fillRect(0, y, SCREEN_W, ROW_HEIGHT, HIGHLIGHT_COLOR);
      tft.setTextColor(TFT_WHITE, HIGHLIGHT_COLOR);
    } else if (idx == playingIndex) {
      tft.fillRect(0, y, SCREEN_W, ROW_HEIGHT, 0x0120);
      tft.setTextColor(PLAYING_COLOR, 0x0120);
    } else {
      tft.setTextColor(TEXT_COLOR, BG_COLOR);
    }

    tft.setCursor(4, y + 4);
    tft.printf("%02d ", idx + 1);

    String name = fileList[idx];
    if (name.length() > 28) name = name.substring(0, 25) + "...";
    tft.print(name);

    if (idx == playingIndex && idx != currentIndex) {
      tft.setTextColor(PLAYING_COLOR, BG_COLOR);
      tft.setTextDatum(TR_DATUM);
      tft.drawString(">", SCREEN_W - 4, y + 4);
      tft.setTextDatum(TL_DATUM);
    }
  }

  if (fileCount > VISIBLE_ROWS) {
    int barH = SCREEN_H - HEADER_H - FOOTER_H;
    int knobH = barH * VISIBLE_ROWS / fileCount;
    int knobY = HEADER_H + barH * scrollOffset / fileCount;
    tft.fillRect(SCREEN_W - 3, HEADER_H, 3, barH, TFT_DARKGREY);
    tft.fillRect(SCREEN_W - 3, knobY, 3, knobH, TFT_LIGHTGREY);
  }

  drawFooter("UP/DOWN select  OK play  BACK top  MENU jump");
}

void drawPlayScreen() {
  tft.fillScreen(BG_COLOR);

  tft.setTextColor(ACCENT_COLOR, BG_COLOR);
  tft.setTextSize(2);
  tft.setTextDatum(TC_DATUM);
  tft.drawString(">> Playing <<", SCREEN_W / 2, 8);

  tft.drawFastHLine(10, 30, SCREEN_W - 20, TFT_DARKGREY);

  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(2);
  tft.setTextDatum(TC_DATUM);
  String name = fileList[playingIndex];
  if (name.length() > 18) name = name.substring(0, 15) + "...";
  tft.drawString(name.c_str(), SCREEN_W / 2, 42);

  tft.setTextSize(3);
  tft.setTextColor(isPaused ? TFT_YELLOW : PLAYING_COLOR, BG_COLOR);
  tft.drawString(isPaused ? "|| PAUSE" : "> PLAY", SCREEN_W / 2, 72);

  tft.drawRoundRect(10, 112, SCREEN_W - 20, 10, 3, TFT_DARKGREY);

  tft.fillRect(8, 128, SCREEN_W - 16, 18, BG_COLOR);

  tft.setTextSize(1);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextDatum(TL_DATUM);
  tft.setCursor(10, 155);
  tft.printf("VOL: %d/21", volume);

  drawVolumeBar();

  drawFooter("UP/DOWN vol  OK pause  BACK prev  MENU list");
}

void drawVolumeBar() {
  int barX = 10, barY = 172, barW = SCREEN_W - 20, barH = 8;
  tft.fillRoundRect(barX, barY, barW, barH, 2, TFT_DARKGREY);
  int fillW = map(volume, 0, 21, 0, barW - 2);
  if (fillW > 0) {
    tft.fillRoundRect(barX + 1, barY + 1, fillW, barH - 2, 2, PROGRESS_COLOR);
  }

  tft.setTextSize(1);
  tft.setTextColor(TFT_DARKGREY, BG_COLOR);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("0", barX, barY + 12);
  tft.setTextDatum(TR_DATUM);
  tft.drawString("21", barX + barW, barY + 12);
  tft.setTextDatum(TL_DATUM);
}

void updateProgress() {
  static unsigned long lastProgressUpdate = 0;
  if (millis() - lastProgressUpdate < 500) return;
  lastProgressUpdate = millis();

  uint32_t total = audio.getAudioFileDuration();
  uint32_t current = audio.getAudioCurrentTime();

  if (total > 0) {
    int progress = map(current, 0, total, 0, SCREEN_W - 24);

    tft.fillRoundRect(12, 114, SCREEN_W - 24, 6, 2, BG_COLOR);
    if (progress > 0) {
      tft.fillRoundRect(12, 114, progress, 6, 2, PROGRESS_COLOR);
    }

    tft.fillRect(8, 128, SCREEN_W - 16, 18, BG_COLOR);
    tft.setTextColor(TFT_LIGHTGREY, BG_COLOR);
    tft.setTextSize(1);
    tft.setTextDatum(TL_DATUM);
    tft.drawString(formatTime(current), 10, 130);
    tft.setTextDatum(TR_DATUM);
    tft.drawString(formatTime(total), SCREEN_W - 10, 130);
    tft.setTextDatum(TL_DATUM);
  }

  if (!audio.isRunning() && isPlaying && !isPaused) {
    delay(500);
    if (!audio.isRunning()) playNext();
  }
}

String formatTime(uint32_t seconds) {
  int m = seconds / 60;
  int s = seconds % 60;
  char buf[8];
  sprintf(buf, "%02d:%02d", m, s);
  return String(buf);
}

// ===================== 音频回调 =====================
void audio_info(const char *info)    { Serial.printf("info: %s\n", info); }
void audio_id3data(const char *info) { Serial.printf("id3: %s\n", info); }
void audio_eof_mp3(const char *info) { Serial.println("播放结束"); }
