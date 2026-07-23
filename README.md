# ESP32 带屏幕音频播放器

## 硬件清单

| 模块 | 推荐型号 | 数量 | 说明 |
|---|---|---|---|
| 主控 | ESP32-DevKitC | 1 | 双核240MHz，带Wi-Fi/蓝牙 |
| 屏幕 | ST7735 1.8" TFT 128x160 | 1 | SPI接口，也可用ILI9341 2.4" |
| 音频功放 | MAX98357A I2S模块 | 1 | 3W单声道功放，接喇叭即可 |
| SD卡模块 | SPI TF卡模块 | 1 | 用于存储音频文件 |
| 旋转编码器 | EC11 | 1 | 带按键，用于选曲和调音量 |
| 按键 | 轻触开关 | 2 | 播放/暂停、上一首/下一首 |
| 喇叭 | 4Ω 3W | 1 | 小喇叭或扬声器 |

## 依赖库安装

在 Arduino IDE 中通过 **库管理器** 安装：

1. **TFT_eSPI** by Bodmer - 屏幕驱动
2. **ESP32-audioI2S** by schreibfaul1 - 音频解码播放

### TFT_eSPI 配置

安装后需要修改 `TFT_eSPI/User_Setup.h`（或创建 `User_Setup_Select.h` 覆盖）：

```cpp
#define ST7735_DRIVER     // 驱动芯片型号
#define TFT_WIDTH  128
#define TFT_HEIGHT 160
#define ST7735_INITB      // 根据屏幕批次选择 INITB/INITR/GREENTAB/REDTAB/BLACKTAB

// 引脚定义 (ESP32)
#define TFT_MOSI 23
#define TFT_SCLK 18
#define TFT_CS   5
#define TFT_DC   16
#define TFT_RST  17

#define LOAD_GLCD
#define LOAD_FONT2
#define LOAD_FONT4
#define SPI_FREQUENCY  27000000
```

## 接线图

```
ESP32          ST7735屏幕        MAX98357A       SD卡模块        EC11编码器
-----          ----------        ---------       --------        ----------
3V3    ------  VCC               VCC             VCC             -
GND    ------  GND               GND             GND             C(中间脚)
GPIO23 ------  MOSI(DA)          -               MOSI            -
GPIO18 ------  SCK(CLK)          -               SCK             -
GPIO5  ------  CS                -               -               -
GPIO16 ------  DC(A0)            -               -               -
GPIO17 ------  RST               -               -               -
GPIO22 ------  -                 DIN             -               -
GPIO26 ------  -                 BCLK            -               -
GPIO25 ------  -                 LRC             -               -
GPIO4  ------  -                 -               CS              -
GPIO19 ------  -                 -               MISO            -
GPIO32 ------  -                 -               -               CLK(A)
GPIO33 ------  -                 -               -               DT(B)
GPIO27 ------  -                 -               -               SW(按键)
GPIO35 ------  -                 -               -               - (播放键)
GPIO34 ------  -                 -               -               - (切歌键)
```

## 使用方法

1. 将 MP3/WAV/FLAC 文件放入 SD 卡根目录
2. 上电后自动扫描并显示文件列表
3. **旋转编码器** 上下滚动选择歌曲
4. **按下编码器** 播放选中的歌曲
5. 播放时旋转编码器调节音量
6. 播放时按下编码器暂停/继续
7. 独立按键控制播放/暂停和切歌

## 进阶扩展建议

- **蓝牙音频**: 使用 ESP32 的 A2DP 协议，将手机音频投射到设备
- **网络电台**: 连接 Wi-Fi 后播放在线流媒体
- **歌词显示**: 解析 LRC 歌词文件同步显示
- **ID3封面**: 读取 MP3 内嵌封面图显示在屏幕上
- **Web控制**: 搭建简单Web服务器，通过手机浏览器控制
