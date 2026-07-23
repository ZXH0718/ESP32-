/*
  ESP32 按键式带屏幕音频播放器
  硬件: ESP32 + ST7735 1.8" TFT + MAX98357A I2S功放 + SD卡模块 + 5个按键
  支持格式: MP3, WAV, FLAC, AAC, OGG
  功能: 按键浏览文件、播放/暂停、上一首/下一首、音量调节、进度显示
*/

#include <Arduino.h>
#include <SPI.h>
#include <SD.h>
#include <TFT_eSPI.h>
#include <Audio.h>

// ===================== 引脚定义 =====================
// TFT SPI 屏幕 (STM7735, 配置在 TFT_eSPI User_Setup.h)
// 默认: MOSI=23, SCK=18, CS=5, DC=16, RST=17

// I2S 音频 -> MAX98357A
#define I2S_DOUT      22
#define I2S_BCLK      26
#define I2S_LRC       25

// SD 卡 SPI (与屏幕共享总线，独立CS)
#define SD_CS         4

// 五按键控制 (所有按键接 GND，按下为低电平)
#define BTN_UP        32    // 上移
#define BTN_DOWN      33    // 下移
#define BTN_OK        27    // 确认/播放
#define BTN_BACK      14    // 返回/上一首
#define BTN_MENU      13    // 菜单/音量键

// ===================== 全局对象 =====================
TFT_eSPI tft = TFT_eSPI();
Audio audio;

String fileList[50];      // 音频文件列表
int fileCount = 0;        // 文件总数
int currentIndex = 0;     // 当前选中索引
int playingIndex = -1;    // 正在播放的索引
int scrollOffset = 0;     // 列表滚动偏移

// 播放状态
bool isPlaying = false;
bool isPaused = false;
int volume = 12;          // 音量 0-21

// 界面状态
enum ScreenMode { LIST, PLAYING };
ScreenMode screen = LIST;

// 按键防抖
unsigned long lastBtnTime = 0;
const unsigned long DEBOUNCE_MS = 200;

// UI 参数
#define BG_COLOR        TFT_BLACK
#define TEXT_COLOR      TFT_WHITE
#define HIGHLIGHT_COLOR TFT_BLUE
#define PLAYING_COLOR   TFT_GREEN
#define PROGRESS_COLOR  TFT_CYAN
#define SCREEN_W        128
#define SCREEN_H        160
#define ROW_HEIGHT      16
#define HEADER_H        14
#define VISIBLE_ROWS    8

// ===================== 初始化 =====================
void setup() {
  Serial.begin(115200);
  delay(500);

  // 按键引脚初始化 (INPUT_PULLUP，按下为 LOW)
  pinMode(BTN_UP,    INPUT_PULLUP);
  pinMode(BTN_DOWN,  INPUT_PULLUP);
  pinMode(BTN_OK,    INPUT_PULLUP);
  pinMode(BTN_BACK,  INPUT_PULLUP);
  pinMode(BTN_MENU,  INPUT_PULLUP);

  // TFT 屏幕
  tft.init();
  tft.setRotation(0);
  tft.fillScreen(BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextSize(1);
  showMessage("初始化中...");

  // SD 卡
  SPI.begin(18, 19, 23, SD_CS);
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

  // I2S 音频
  audio.setPinout(I2S_BCLK, I2S_LRC, I2S_DOUT);
  audio.setVolume(volume);

  drawListScreen();
}

// ===================== 主循环 =====================
void loop() {
  audio.loop();
  handleButtons();
  if (screen == PLAYING && isPlaying && !isPaused) {
    updateProgress();
  }
}

// ===================== 按键处理 =====================
void handleButtons() {
  if (millis() - lastBtnTime < DEBOUNCE_MS) return;

  // 上键
  if (digitalRead(BTN_UP) == LOW) {
    if (screen == LIST) {
      if (currentIndex > 0) {
        currentIndex--;
        checkScroll();
        drawListScreen();
      }
    } else if (screen == PLAYING) {
      if (volume < 21) { volume++; audio.setVolume(volume); drawPlayScreen(); }
    }
    lastBtnTime = millis();
    return;
  }

  // 下键
  if (digitalRead(BTN_DOWN) == LOW) {
    if (screen == LIST) {
      if (currentIndex < fileCount - 1) {
        currentIndex++;
        checkScroll();
        drawListScreen();
      }
    } else if (screen == PLAYING) {
      if (volume > 0) { volume--; audio.setVolume(volume); drawPlayScreen(); }
    }
    lastBtnTime = millis();
    return;
  }

  // 确认键
  if (digitalRead(BTN_OK) == LOW) {
    if (screen == LIST) {
      playFile(currentIndex);
    } else if (screen == PLAYING) {
      // 播放界面按确认 = 暂停/继续
      togglePause();
    }
    lastBtnTime = millis();
    return;
  }

  // 返回键 (上一首)
  if (digitalRead(BTN_BACK) == LOW) {
    if (screen == LIST) {
      // 列表界面按返回 = 回到列表顶部
      currentIndex = 0;
      scrollOffset = 0;
      drawListScreen();
    } else if (screen == PLAYING) {
      playPrevious();
    }
    lastBtnTime = millis();
    return;
  }

  // 菜单键
  if (digitalRead(BTN_MENU) == LOW) {
    if (screen == PLAYING) {
      // 返回列表界面
      screen = LIST;
      drawListScreen();
    } else if (screen == LIST) {
      // 列表界面回到正在播放的歌曲
      if (playingIndex >= 0) {
        currentIndex = playingIndex;
        checkScroll();
        drawListScreen();
      }
    }
    lastBtnTime = millis();
    return;
  }
}

// ===================== 滚动控制 =====================
void checkScroll() {
  if (currentIndex < scrollOffset) {
    scrollOffset = currentIndex;
  } else if (currentIndex >= scrollOffset + VISIBLE_ROWS) {
    scrollOffset = currentIndex - VISIBLE_ROWS + 1;
  }
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

  // 排序
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
  tft.drawString(msg, SCREEN_W / 2, SCREEN_H / 2);
  tft.setTextDatum(TL_DATUM);
}

void drawListScreen() {
  tft.fillScreen(BG_COLOR);

  // 标题栏
  tft.fillRect(0, 0, SCREEN_W, HEADER_H, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setCursor(2, 3);
  tft.printf("音乐 %d/%d", currentIndex + 1, fileCount);

  // 文件列表
  for (int i = 0; i < VISIBLE_ROWS; i++) {
    int idx = scrollOffset + i;
    if (idx >= fileCount) break;

    int y = HEADER_H + 1 + i * ROW_HEIGHT;

    if (idx == currentIndex) {
      tft.fillRect(0, y, SCREEN_W, ROW_HEIGHT, HIGHLIGHT_COLOR);
      tft.setTextColor(TFT_WHITE, HIGHLIGHT_COLOR);
    } else if (idx == playingIndex) {
      tft.setTextColor(PLAYING_COLOR, BG_COLOR);
    } else {
      tft.setTextColor(TEXT_COLOR, BG_COLOR);
    }

    tft.setCursor(2, y + 3);
    tft.printf("%02d ", idx + 1);
    String name = fileList[idx];
    if (name.length() > 18) name = name.substring(0, 15) + "...";
    tft.print(name);

    if (idx == playingIndex) {
      tft.setCursor(SCREEN_W - 18, y + 3);
      tft.print(">");
    }
  }

  // 底部按键提示
  drawListFooter();
}

void drawListFooter() {
  tft.fillRect(0, SCREEN_H - 14, SCREEN_W, 14, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.drawString("^\x1F 选择 确认 返回 跳转", 2, SCREEN_H - 12);
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
  if (name.length() > 17) name = name.substring(0, 14) + "...";
  tft.drawString(name.c_str(), SCREEN_W / 2, 30);

  // 状态
  tft.setTextColor(isPaused ? TFT_YELLOW : PLAYING_COLOR, BG_COLOR);
  tft.drawString(isPaused ? "|| 已暂停" : "> 播放中", SCREEN_W / 2, 50);

  // 音量
  tft.fillRect(4, 65, SCREEN_W - 8, 20, BG_COLOR);
  tft.setTextColor(TEXT_COLOR, BG_COLOR);
  tft.setTextDatum(TL_DATUM);
  tft.setCursor(6, 67);
  tft.printf("音量: %d/21", volume);
  int barW = map(volume, 0, 21, 0, SCREEN_W - 16);
  tft.drawRect(4, 80, SCREEN_W - 8, 6, TFT_DARKGREY);
  tft.fillRect(6, 82, barW, 2, PROGRESS_COLOR);

  // 进度条背景
  tft.drawRect(4, 100, SCREEN_W - 8, 8, TFT_DARKGREY);

  // 底部按键提示
  tft.fillRect(0, SCREEN_H - 14, SCREEN_W, 14, TFT_DARKGREY);
  tft.setTextColor(TFT_WHITE, TFT_DARKGREY);
  tft.setTextDatum(TL_DATUM);
  tft.drawString("^\x1F 音量 暂停 上首 列表", 3, SCREEN_H - 12);
}

void updateProgress() {
  static unsigned long lastProgressUpdate = 0;
  if (millis() - lastProgressUpdate < 500) return;
  lastProgressUpdate = millis();

  uint32_t total = audio.getAudioFileDuration();
  uint32_t current = audio.getAudioCurrentTime();

  if (total > 0) {
    int progress = map(current, 0, total, 0, SCREEN_W - 16);
    tft.fillRect(6, 102, SCREEN_W - 16, 4, BG_COLOR);
    tft.fillRect(6, 102, progress, 4, PROGRESS_COLOR);

    tft.fillRect(4, 115, SCREEN_W - 8, 10, BG_COLOR);
    tft.setTextColor(TFT_DARKGREY, BG_COLOR);
    tft.setTextDatum(TL_DATUM);
    tft.setCursor(6, 115);
    tft.print(formatTime(current));
    tft.setTextDatum(TR_DATUM);
    tft.setCursor(SCREEN_W - 6, 115);
    tft.print(formatTime(total));
    tft.setTextDatum(TL_DATUM);
  }

  if (!audio.isRunning() && isPlaying && !isPaused) {
    delay(500);
    if (!audio.isRunning()) { playNext(); }
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