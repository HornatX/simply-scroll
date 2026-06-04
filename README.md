# Simply Scroll (记住阅读位置,切换文件滚轮位置记忆)

Simply Scroll is a lightweight scroll state preservation plugin for Obsidian. It restores your exact reading scroll position when switching between Markdown files with **zero layout shifting, zero focus fighting, and absolutely zero visual flashing**.

插件还在测试当中,如果有bug或错误,加群讨论
QQ交流群:1094620986

[简体中文说明](#简体中文)

---

## 🌟 Key Features

### 1. Seamless Scroll Recovery
- Remembers where you left off. When you switch back to any Markdown document, it instantly takes you back to your last scrolled position (reading or editing view).

### 2. Zero-Flash UI Cloaking (Anti-Flicker)
- **The Problem**: Standard Obsidian often briefly displays the top of the file, then violently jumps to the saved scroll position, causing an annoying white/dark flash.
- **The Solution**: Simply Scroll temporarily sets the transition to `none` and cloaks the editor opacity to `0` during view states. It then gracefully fades the fully positioned editor back in (`opacity: 1`) via a fast 50ms transition, creating a seamless, flicker-free visual experience.

### 3. Anti-Shift Focus Protection
- Restoring scroll positions often fights with editor cursor autofocus, causing layout shifting on load. 
- This plugin continuously blurs aggressive focus elements and enforces precise scroll offsets within a critical 40ms "fight window," ensuring your document stays perfectly still on load.

### 4. Smart Self-Cleaning & Vault Sync
- **Vault Rename/Delete Tracking**: Automatically updates saved scroll keys when a file is renamed, and discards data when a file is deleted.
- **Orphan Cleanup**: On startup, it scans your vault and automatically purges saved scroll states of files that no longer exist, keeping your plugin data lightweight and clean.

---

## ⚙️ How It Works (Technical Overview)

Simply Scroll monkey-patches (`around`) `WorkspaceLeaf.prototype.setViewState` to intercept Markdown state transitions. When a leaf changes, it calculates the target viewport, applies a micro-cloaking mask to hide calculation jumps, stabilizes the view scrolling via a debounced micro-interval, and then reveals the fully settled interface.

---

## 📥 Installation

### Method 1: Community Plugins (Recommended)
Once listed on the community store, you can install it directly:
1. Go to **Settings** > **Community plugins** > **Browse**.
2. Search for `Simply Scroll`.
3. Click **Install**, then **Enable**.

### Method 2: Manual Installation
1. Download the latest release (`main.js` and `manifest.json`) from the [Releases](https://github.com/hornatx/simply-scroll/releases) page.
2. Open your Obsidian vault directory in your file manager.
3. Move the files to `<your-vault>/.obsidian/plugins/simply-scroll/`.
4. Open Obsidian **Settings** > **Community plugins**, and turn on **Simply Scroll**.

---

## 简体中文

**Simply Scroll（极简无缝滚动恢复）** 是一款为 Obsidian 打造的无感滚动位置记忆插件。它在切换 Markdown 文档时，能以**零画面抖动、零焦点夺取、零视觉闪烁**的方式，完美恢复您上一次的阅读或编辑视口。

---

## 🌟 核心功能

### 1. 无感滚动恢复
- 记住您的每一次停留。当您返回任何曾经阅读或编辑过的 Markdown 文档时，插件会瞬间恢复至上次停留的视口高度。

### 2. 极简无缝遮罩（解决晃眼闪烁）
- **痛点**：Obsidian 原生在切换文件时，经常会短暂渲染文档顶部，再猛烈跳转至历史位置。这在夜间或高对比度主题下会造成极其刺眼的“白屏/画面闪烁”。
- **解决办法**：插件在检测到视图切换时，会瞬时将编辑器不透明度（Opacity）设为 `0` 进行无感遮罩。待滚动目标定位稳妥后，再以 `50ms` 的极快淡入动效平滑呈现，带来如同单页应用般的丝滑视觉体验。

### 3. 抗位移焦点抑制
- 原生的滚动恢复常常由于编辑器强行夺取焦点（Focus）或自动定位光标，导致页面加载完毕时产生二次跳动。
- 插件在加载的前 `40毫秒` 黄金保护期内，会高频抑制异常焦点，并持续应用历史滚动高度，让页面在呈现的瞬间即处于绝对静止状态。

### 4. 智能数据库自动清洗
- **路径重命名/删除同步**：文件重命名时自动顺延滚动记忆，文件彻底删除时自动销毁对应数据。
- **孤立数据清洗**：每次启动插件时，系统会自动对比当前的库文件，自动剔除那些由于库外删除等原因残留的无用滚动数据，防止配置文件冗余。

---

## 📥 安装方法

### 方法一：社区插件安装（推荐）
待插件通过审核并上架社区市场后：
1. 打开 Obsidian **设置** > **社区插件** > **浏览**。
2. 搜索并选择 `Simply Scroll`。
3. 点击 **安装** 并选择 **启用**。

### 方法二：手动安装
1. 前往 [Releases](https://github.com/hornatx/simply-scroll/releases) 页面下载最新的 `main.js` 和 `manifest.json` 文件。
2. 打开您的 Obsidian 库所在的本地文件夹。
3. 进入 `.obsidian/plugins/` 目录，并创建一个名为 `simply-scroll` 的文件夹。
4. 将下载的两个文件放入该文件夹中。
5. 在 Obsidian **设置** > **社区插件** 中重新加载并开启该插件。