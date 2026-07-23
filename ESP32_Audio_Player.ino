/*
  ESP32 带屏幕音频播放器
  硬件: ESP32 + ST7735 1.8" TFT + MAX98357A I2S功放 + SD卡模块 + 旋转编码器
  支持格式: MP3, WAV, FLAC, AAC (取决于所用库)
  功能: 浏览文件、播放/暂停、上一首/下一首、音量调节、进度显示
*/

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <TFT_eSPI.h>
#include <Audio.h>

// ===================== 引脚定义 =====================
// TFT SPI 屏幕 (已配置在 TFT_eSPI 库中)
// 默认: MOSI=23, SCK=18, CS=5, DC=16, RST=17

// I2S 音频输出 -> MAX98357A
#define I2S_DOUT      22
#define I2S_BCLK      26
#define I2S_LRC       25

// SD 卡 SPI (独立CS，与屏幕共享SPI总线)
#define SD_CS         4

// 旋转编码器
#define ENCODER_CLK   32    // A相
#define ENCODER_DT    33    // B相
#define ENCODER_SW    27    // 按键

// 独立控制按键
#define BTN_PLAY      35    // 播放/暂停
#define BTN_PREV      34    // 上一首

// ===================== 全局对象 =====================
TFT_eSPI tft = TFT_eSPI();
Audio audio;

File root;
String fileList[50];      // 文件列表
int fileCount = 0;        // 文件总数
int currentIndex = 0;     // 当前选中索引
int playingIndex = -1;    // 正在播放的索引

// 播放状态
bool isPlaying = false;
bool isPaused = false;
int volume = 15;          // 音量 0-21

// 编码器状态
int lastClkState;
unsigned long lastEncoderTime = 0;
unsigned long lastBtnTime = 0;

// UI 颜色
#define BG_COLOR        TFT_BLACK
#define TEXT_COLOR      TFT_WHITE
#define HIGHLIGHT_COLOR TFT_BLUE
#define PLAYING_COLOR   TFT_GREEN
#define PROGRESS_COLOR  TFT_CYAN

// 屏幕尺寸 (根据实际屏幕修改)
#define SCREEN_W        128
#define SCREEN_H        160
#define ROW_HEIGHT      16
#define VISIBLE_ROWS    8

// ===================== 初始化 =====================
void setup() {
  Serial.begin(115200);
  delay(500);

  // 引脚初始化
  pinMode(ENCODER_CLK, INPUT_PULLUP);
  pinMode(ENCODER_DT, INPUT_PULLUP);
  pinMode(ENCODER_SW, INPUT_PULLUP);
  pinMode(BTN_PLAY, INPUT_PULLUP);
  pinMode(BTN_PREV, INPUT_PULLUP);

  lastClkState = digitalRead(ENCODER_CLK);

  // 初始化 TFT 屏幕
  tft.init();
  tft.setRotation(0);
  tft.fillScreen(BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(1);

  showMessage("初始化中...");

  // 初始化 SD 卡
  SPI.begin(18, 19, 23, SD_CS); // SCK, MISO, MOSI, CS
  if (!SD.begin(SD_CS)) {
    showMessage("SD卡初始化失败!\n请检查连接");
    while (1) delay(100);
  }
  showMessage("SD卡已就绪");
  delay(300);

  // 扫描音频文件
  scanAudioFiles();
  if (fileCount == 0) {
    showMessage("SD卡中无音频文件!\n支持: mp3/wav/flac");
    while (1) delay(100);
  }

  // 初始化 I2S 音频
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(volume);

  // 显示文件列表
  drawFileList();
  drawStatusBar();
}

// ===================== 主循环 =====================
void loop() {
  audio.loop();

  handleEncoder();
  handleButtons();
  updateProgress();
}

// ===================== 编码器处理 =====================
void handleEncoder() {
  int clkState = digitalRead(ENCODER_CLK);

  // 旋转检测
  if (clkState != lastClkState) {
    if (millis() - lastEncoderTime > 50) {
      if (digitalRead(ENCODER_DT) != clkState) {
        // 顺时针 - 向下移动或增加音量
        if (isPlaying) {
          if (volume < 21) {
            volume++;
            audio.setVolume(volume);
            drawStatusBar();
          }
        } else {
          if (currentIndex < fileCount - 1) {
            currentIndex++;
            drawFileList();
          }
        }
      } else {
        // 逆时针 - 向上移动或减小音量
        if (isPlaying) {
          if (volume > 0) {
            volume--;
            audio.setVolume(volume);
            drawStatusBar();
          }
        } else {
          if (currentIndex > 0) {
            currentIndex--;
            drawFileList();
          }
        }
      }
      lastEncoderTime = millis();
    }
  }
  lastClkState = clkState;

  // 编码器按键 (确认/暂停切换)
  if (digitalRead(ENCODER_SW) == LOW) {
    if (millis() - lastBtnTime > 300) {
      if (isPlaying) {
        togglePause();
      } else {
        playFile(currentIndex);
      }
      lastBtnTime = millis();
      while (digitalRead(ENCODER_SW) == LOW) delay(5);
    }
  }
}

// ===================== 按键处理 =====================
void handleButtons() {
  // 播放/暂停键
  if (digitalRead(BTN_PLAY) == LOW) {
    if (millis() - lastBtnTime > 300) {
      if (isPlaying || isPaused) {
        togglePause();
      } else {
        playFile(currentIndex);
      }
      lastBtnTime = millis();
    }
  }

  // 上一首/下一首 (短按上一首，长按可扩展)
  if (digitalRead(BTN_PREV) == LOW) {
    if (millis() - lastBtnTime > 300) {
      playNext();
      lastBtnTime = millis();
    }
  }
}

// ===================== 音频控制 =====================
void playFile(int index) {
  if (index < 0 || index >= fileCount) return;

  String path = "/" + fileList[index];
  Serial.println("Playing: " + path);

  audio.stopSong();
  audio.connecttoFS(SD, path.c_str());

  playingIndex = index;
  isPlaying = true;
  isPaused = false;

  drawFileList();
  drawStatusBar();
  drawPlayScreen();
}

void togglePause() {
  if (!isPlaying && !isPaused) return;

  isPaused = !isPaused;
  if (isPaused) {
    audio.pauseSong();
    isPlaying = false;
  } else {
    audio.pauseSong(); // 再次调用恢复播放
    isPlaying = true;
  }
  drawStatusBar();
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

// ===================== 扫描音频文件 =====================
void scanAudioFiles() {
  fileCount = 0;
  root = SD.open("/");

  while (true) {
    File entry = root.openNextFile();
    if (!entry) break;

    if (!entry.isDirectory()) {
      String name = entry.name();
      name.toLowerCase();
      if (name.endsWith(".mp3") || name.endsWith(".wav") ||
          name.endsWith(".flac") || name.endsWith(".aac") ||
          name.endsWith(".ogg")) {
        if (fileCount < 50) {
          fileList[fileCount] = String(entry.name());
          fileCount++;
        }
      }
    }
    entry.close();
  }
  root.close();

  // 按文件名排序
  for (int i = 0; i < fileCount - 1; i++) {
    for (int j = i + 1; j < fileCount; j++) {
      if (fileList[i] > fileList[j]) {
        String temp = fileList[i];
        fileList[i] = fileList[j];
        fileList[j] = temp;
      }
    }
  }
}

// ===================== UI 绘制 =====================
void showMessage(const char* msg) {
  tft.fillScreen(BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextDatum(MC_DATUM);
  tft.drawString(msg, SCREEN_W / 2, SCREEN_H / 2);
  tft.setTextDatum(TL_DATUM);
}

void drawFileList() {
  tft.fillScreen(BG_COLOR);

  // 标题栏
  tft.fillRect(0, 0, SCREEN_W, 14, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setCursor(2, 3);
  tft.print("音乐列表 (");
  tft.print(fileCount);
  tft.print(")");

  // 文件列表
  int startIdx = currentIndex / VISIBLE_ROWS * VISIBLE_ROWS;
  for (int i = 0; i < VISIBLE_ROWS; i++) {
    int idx = startIdx + i;
    if (idx >= fileCount) break;

    int y = 16 + i * ROW_HEIGHT;

    // 高亮背景
    if (idx == currentIndex && !isPlaying) {
      tft.fillRect(0, y, SCREEN_W, ROW_HEIGHT, HIGHLIGHT_COLOR);
      tft.setTextColor(TFT_WHITE, HIGHLIGHT_COLOR);
    } else if (idx == playingIndex) {
      tft.fillRect(0, y, SCREEN_W, ROW_HEIGHT, 0x2200); // 深蓝背景
      tft.setTextColor(PLAYING_COLOR, 0x2200);
    } else {
      tft.setTextColor(TEXT_COLOR, BG_COLOR);
    }

    // 显示序号和文件名
    tft.setCursor(2, y + 3);
    if (idx < 9) tft.print("0");
    tft.print(idx + 1);
    tft.print(" ");

    // 截断显示文件名
    String displayName = fileList[idx];
    if (displayName.length() > 18) {
      displayName = displayName.substring(0, 15) + "...";
    }
    tft.print(displayName);
  }
}

void drawPlayScreen() {
  tft.fillScreen(BG_COLOR);

  // 标题
  tft.setTextColor(PROGRESS_COLOR, BG_COLOR);
  tft.setTextDatum(TC_DATUM);
  tft.drawString("正在播放", SCREEN_W / 2, 5);

  // 文件名
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextDatum(MC_DATUM);
  String name = fileList[playingIndex];
  if (name.length() > 20) {
    name = name.substring(0, 17) + "...";
  }
  tft.drawString(name.c_str(), SCREEN_W / 2, 40);

  // 状态
  tft.setTextDatum(MC_DATUM);
  tft.setTextColor(isPaused ? TFT_YELLOW : PLAYING_COLOR, BG_COLOR);
  tft.drawString(isPaused ? "|| 已暂停" : "> 播放中", SCREEN_W / 2, 65);

  // 进度条背景
  tft.drawRect(10, 90, SCREEN_W - 20, 10, TFT_DARKGREY);

  tft.setTextDatum(TL_DATUM);
}

void drawStatusBar() {
  if (!isPlaying) return;

  // 仅在播放界面更新
  // 音量显示
  tft.fillRect(5, 115, SCREEN_W - 10, 25, BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setCursor(10, 118);
  tft.print("音量: ");
  tft.print(volume);
  tft.print("/21");

  // 音量条
  int barWidth = map(volume, 0, 21, 0, SCREEN_W - 30);
  tft.drawRect(10, 132, SCREEN_W - 20, 8, TFT_DARKGREY);
  tft.fillRect(12, 134, barWidth, 4, PROGRESS_COLOR);

  // 操作提示
  tft.setTextColor(TFT_DARKGREY, BG_COLOR);
  tft.setCursor(5, 148);
  tft.print("旋转:音量  按键:暂停");
}

void updateProgress() {
  if (!isPlaying || isPaused) return;

  uint32_t total = audio.getAudioFileDuration();
  uint32_t current = audio.getAudioCurrentTime();

  if (total > 0) {
    int progress = map(current, 0, total, 0, SCREEN_W - 24);

    // 更新进度条
    tft.fillRect(12, 92, SCREEN_W - 24, 6, BG_COLOR); // 清除旧进度
    tft.fillRect(12, 92, progress, 6, PROGRESS_COLOR);

    // 时间显示
    tft.fillRect(10, 105, SCREEN_W - 20, 10, BG_COLOR);
    tft.setTextColor(TFT_DARKGREY, BG_COLOR);
    tft.setCursor(10, 105);
    tft.print(formatTime(current));
    tft.setCursor(SCREEN_W - 40, 105);
    tft.print(formatTime(total));
  }

  // 检测播放结束
  if (!audio.isRunning() && isPlaying && !isPaused) {
    delay(500);
    if (!audio.isRunning()) {
      playNext();
    }
  }
}

String formatTime(uint32_t seconds) {
  int m = seconds / 60;
  int s = seconds % 60;
  char buf[8];
  sprintf(buf, "%02d:%02d", m, s);
  return String(buf);
}

// ===================== 音频回调 (可选) =====================
void audio_info(const char *info) {
  Serial.print("info: ");
  Serial.println(info);
}

void audio_id3data(const char *info) {
  Serial.print("id3: ");
  Serial.println(info);
}

void audio_eof_mp3(const char *info) {
  Serial.println("播放结束");
}
