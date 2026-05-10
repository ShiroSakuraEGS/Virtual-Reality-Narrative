# 虛實：敘事 (Virtual/Reality: Narrative)

![Game Logo](https://img.shields.io/badge/Genre-Cyberpunk--RPG-ff003c?style=for-the-badge)
![Tech Stack](https://img.shields.io/badge/AI-Gemini--Pro-00f0ff?style=for-the-badge)
![Platform](https://img.shields.io/badge/Platform-Web-black?style=for-the-badge)

## 📖 背景小故事

> 「不知道為什麼就是喜歡用 AI 做小遊戲 🤣」

這是一個關於在霓虹廢墟與數據深淵中尋找「意義」的故事。

最初的動力來自於對生成式 AI 技術的狂熱，我享受那種與 AI 共同構築世界的隨機性與驚喜感。在《虛實：敘事》中，你面對的不再是死板的腳本，而是擁有性格、回憶與欲望的數據節點。

我一直以來都是默默地玩 AI TRPG（曾用過 NotebookLM 加 Gemini Gem），不喜歡公開給別人也是因為⋯⋯就想默默地玩就好了 🤣。對我而言，這不是一個賺錢的工具，而是一個鍛鍊設計 AI 遊戲應用能力的實驗場。這是關於我做遊戲的心態，歡迎任何想要諮詢或嘗試開發 AI 應用的朋友交流，反正，這就是生成式 AI 的世代。

---

## 🎮 遊戲核心功能

### 🤖 伴侶系統 (Companion System) - 「與 AI 共同創造靈魂」
*   **動態角色生成**：初始狀態為「未知個體」，透過早期對話互動，像捏泥巴一樣塑造成你喜歡的樣子。
*   **人格定型**：當交流深入後，AI 會自動鎖定角色的名稱、性格與職業，寫入資料庫成為永久存在。
*   **親密度養成**：隨著聊天次數與互動質量提升，解鎖不同的關係階段（熟識、約會、同居）。
*   **浪漫渲染**：支援曖昧與感性的對話，使用隱喻與氛圍描寫，打造極具沈浸感的文字體驗。

### 🏪 市場交易系統 (Market System) - 「性格驅動的博弈」
*   **150 位獨特 NPC**：內建大量具備編號、性別與「性格標籤」的買家（如：淫蕩、貪慾、機智、傲嬌等）。
*   **AI 交涉機制**：對話推銷時，買家會根據性格属性給出完全不同的反應。
*   **社交成長**：交易成功次數越多，買家的「防禦值」越低，交涉難度隨之下降。

### 🛠️ 創新製造系統 (Crafting System) - 「打破固定合成表」
*   **開放式輸入**：輸入「賽博義體潤滑油」或「非法記憶晶片」，AI 會根據賽博龐克世界觀自動評估生產成本與內容描述。
*   **即時估價**：動態生成物品 JSON 資料並存入 Firebase 背包。

### 💼 工作系統 (Work System) - 「現實與虛擬的交匯」
*   **時區同步**：基於港台時區的真實時間重新整理機制。
*   **績效評估**：玩家提交工作日誌，AI 根據內容合理性給予報酬。
*   **職業晉升**：累積工作次數可獲得「管理層」乃至「獨一無二」的霸氣職稱。

### ⚙️ 核心設定 (User API Control)
*   **主權回歸玩家**：支援玩家設置自有的 Gemini API Key，確保資源使用的隱私性與持續性。

---

## 🛠️ 技術架構

本遊戲採用現代 Web 技術棧構建，致力於提供流暢的「賽博」視覺體驗：

*   **前端框架**：[React 18+](https://reactjs.org/) + [Vite](https://vitejs.dev/)
*   **樣式處理**：[Tailwind CSS](https://tailwindcss.com/) (搭配自定義 Glitch 濾鏡與霓虹變色特效)
*   **動畫引擎**：[Framer Motion](https://www.framer.com/motion/)
*   **後端服務**：[Firebase](https://firebase.google.com/) (Firestore 即時資料庫 / Authentication 身份驗證)
*   **人工智慧**：[Google Generative AI SDK (Gemini API)](https://ai.google.dev/)
*   **圖標庫**：[Lucide React](https://lucide.dev/)

---

## 🎨 視覺風格

數位節點、霓虹排版與故障藝術（Glitch Art）的結合。所有的介面元素皆包含 `id` 屬性以便擴展開發，並針對手機與網頁顯示進行了深度適配。

---

## 📬 聯絡資訊

如果你對本遊戲的設計思路、AI 提示詞工程（Prompt Engineering）或技術實作有興趣，歡迎來信交流：

**虛實：敘事 遊戲設計者 - Clive Chan**
📧 [ai114364136@gmail.com](mailto:ai114364136@gmail.com)

---

> 「在虛實交錯的敘事中，你將寫下屬於自己的賽博篇章。」
