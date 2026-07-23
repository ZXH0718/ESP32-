# 纯手机编译 APK 教程 —— 使用 GitHub Actions 云端自动构建

> 完全不需要电脑，只用手机浏览器就能完成全部操作。

---

## 原理

把 Android 项目代码上传到 GitHub 仓库，GitHub 的云端服务器会自动帮你编译出 APK 文件，编译完成后你可以直接在手机上下载安装。

---

## 第一步：注册 GitHub 账号

1. 打开手机浏览器，访问 https://github.com
2. 点击「Sign up」（注册）
3. 输入邮箱地址 → 设置密码 → 创建用户名
4. 按提示完成验证（可能需要邮箱验证码）
5. 注册成功后登录

---

## 第二步：创建代码仓库

1. 登录 GitHub 后，点击右上角 **+** 号 → 选择 **New repository**（新建仓库）
2. Repository name 填写：`music-sender`
3. Description 可填：`ESP32 音乐传送安卓客户端`
4. 选择 **Public**（公开）
5. 勾选 **Add a README file**
6. 点击底部绿色按钮 **Create repository**

---

## 第三步：上传项目文件

### 方法一：使用 GitHub App（推荐，最简单）

1. 在应用商店搜索并安装 **GitHub** App（官方应用）
2. 用刚才注册的账号登录
3. 进入你创建的 `music-sender` 仓库
4. 点击底部 **Files** 标签
5. 点击右上角 **+** 号 → **Upload files**
6. 先创建一个文件夹结构：
   - 点击 **Create new file**
   - 文件名输入 `.github/workflows/build-apk.yml`
   - 把项目中的 `build-apk.yml` 文件内容复制粘贴进去
   - 滚动到底部，点击 **Commit new file**

7. 继续上传其他文件，按照以下目录结构逐个创建：

```
music-sender/
├── .github/
│   └── workflows/
│       └── build-apk.yml      ← 已上传
├── build.gradle
├── settings.gradle
├── gradle.properties
└── app/
    ├── build.gradle
    └── src/
        └── main/
            ├── AndroidManifest.xml
            ├── java/com/esp32/musicbox/
            │   └── MainActivity.kt
            └── res/
                ├── drawable/
                │   └── bg_status_dot.xml
                ├── layout/
                │   └── activity_main.xml
                └── values/
                    ├── colors.xml
                    ├── strings.xml
                    └── themes.xml
```

> 提示：GitHub App 中上传文件时，先点 **+** → **Create new file**，然后输入完整路径（如 `app/build.gradle`），再粘贴内容。

### 方法二：使用浏览器（不用安装 App）

1. 手机浏览器打开 https://github.com 并登录
2. 进入 `music-sender` 仓库
3. 点击 **Add file** → **Create new file**
4. 按照上面的目录结构，逐个创建文件

---

## 第四步：触发自动编译

所有文件上传完成后：

1. 在 GitHub App 或浏览器中，进入仓库主页
2. 点击顶部 **Actions** 标签
3. 你会看到工作流 **编译APK**
4. 点击它，然后点击右侧 **Run workflow** → **Run workflow**
5. 等待约 3-5 分钟（云端服务器在自动编译）

> 如果没看到 Actions 标签，先确保 `.github/workflows/build-apk.yml` 文件已正确上传。

---

## 第五步：下载 APK

编译完成后：

1. 回到 **Actions** 页面
2. 点击最新的一次运行记录（绿色勾号表示成功）
3. 页面底部 **Artifacts** 区域会显示 **音乐传送APK**
4. 点击下载，得到一个 ZIP 压缩包
5. 用手机的文件管理器解压 ZIP
6. 里面就是 `app-release-unsigned.apk`

---

## 第六步：安装 APK

1. 找到下载的 APK 文件
2. 点击安装
3. 如果提示「未知来源应用」，去设置中允许该来源安装
4. 安装完成后，桌面会出现「音乐传送」图标

---

## 常见问题

### Q1: GitHub Actions 编译失败怎么办？

点击失败的运行记录，查看红色报错信息。常见原因：
- 某个文件没上传完整 → 重新检查并补传
- 文件名大小写不对 → Android 文件系统区分大小写

### Q2: 为什么 APK 是 "unsigned"（未签名）？

未签名的 APK 在大部分手机上可以正常安装。如果需要签名版本，可以在 GitHub Actions 配置中添加签名步骤（需要创建密钥库）。

### Q3: 文件太多，手机上一个个上传太麻烦？

可以只传关键文件，GitHub Actions 会自动处理依赖。最少需要上传的文件：
- `.github/workflows/build-apk.yml`
- `build.gradle`
- `settings.gradle`
- `gradle.properties`
- `app/build.gradle`
- `app/src/main/AndroidManifest.xml`
- `app/src/main/java/com/esp32/musicbox/MainActivity.kt`
- `app/src/main/res/` 下的所有 XML 文件

### Q4: 编译完成后在哪里找 APK？

在 Actions 运行记录的底部 **Artifacts** 区域，点击「音乐传送APK」下载。

---

## 更简单的替代方案：让朋友帮忙

如果上面的步骤你觉得太麻烦，可以：

1. 把 `ESP32_Audio_Player/AndroidApp/` 这个文件夹通过微信/QQ 发给有电脑的朋友
2. 让他按教程用 Android Studio 编译
3. 他把 APK 发回给你

---

## 文件速查

所有需要上传到 GitHub 的文件内容都在项目目录中，分别是：

| 文件路径 | 用途 |
|---|---|
| `.github/workflows/build-apk.yml` | GitHub Actions 自动编译配置 |
| `build.gradle` | 项目级构建配置 |
| `settings.gradle` | 项目设置 |
| `gradle.properties` | Gradle 属性 |
| `app/build.gradle` | 应用级构建配置 |
| `app/src/main/AndroidManifest.xml` | 应用清单 |
| `app/src/main/java/com/esp32/musicbox/MainActivity.kt` | 主程序代码 |
| `app/src/main/res/drawable/bg_status_dot.xml` | 状态圆点 |
| `app/src/main/res/layout/activity_main.xml` | 主界面布局 |
| `app/src/main/res/values/colors.xml` | 颜色定义 |
| `app/src/main/res/values/strings.xml` | 字符串（中文） |
| `app/src/main/res/values/themes.xml` | 主题 |
