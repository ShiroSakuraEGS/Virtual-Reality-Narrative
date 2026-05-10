import React, { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db, googleProvider } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, Heart, Wrench, ShoppingCart, Lock, Briefcase, X, Package, Settings } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo?: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

interface InventoryItem {
  itemName: string;
  quantity: number;
  description: string;
}

interface CompanionData {
  name: string;
  personality: string;
  occupation: string;
  intimacyLevel: number;
  chatCount: number;
  isDefined: boolean;
  chatHistory: { role: 'user' | 'npc', content: string }[];
}

interface PlayerData {
  uid: string;
  displayName?: string;
  gameName?: string;
  gender?: 'male' | 'female';
  appearance?: string;
  credits?: number;
  totalWorks?: number;
  dailyWorks?: number;
  lastWorkDate?: string;
  jobTitle?: string;
  workHistory?: string[];
  inventory?: InventoryItem[];
  npcRelationships?: {
    [npcId: string]: { tradeCount: number };
  };
  companions?: {
    [companionId: string]: CompanionData;
  };
  userGeminiApiKey?: string;
  createdAt: any;
  lastLoginAt: any;
}

const getTaiwanDateString = () => {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
};

const InventoryModal = ({ playerData, onClose }: { playerData: PlayerData, onClose: () => void }) => {
  const inventory = playerData.inventory || [];

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="cyber-panel p-4 md:p-8 max-w-3xl w-full bg-white relative max-h-[90vh] flex flex-col"
      >
        <button onClick={onClose} className="absolute top-2 right-2 md:top-4 md:right-4 text-black hover:text-[#ff003c] transition-colors z-10">
          <X size={32} />
        </button>
        
        <h2 className="text-3xl font-bold mb-6 uppercase tracking-tighter glitch-text shrink-0" data-text="物品持有">
          物品持有
        </h2>
        
        <div className="overflow-y-auto pr-2 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {inventory.length === 0 ? (
              <div className="col-span-full text-center py-12 text-gray-500 font-mono font-bold border-2 border-dashed border-gray-300">
                背包空無一物
              </div>
            ) : (
              inventory.map((item, idx) => (
                <div key={idx} className="border-2 border-black p-4 bg-gray-50 relative group hover:border-[#00f0ff] transition-colors">
                  <div className="absolute top-0 right-0 bg-black text-[#00f0ff] font-mono font-bold text-lg px-3 py-1">
                    x{item.quantity}
                  </div>
                  <h3 className="text-xl font-bold text-[#ff003c] mb-2 pr-12">{item.itemName}</h3>
                  <p className="text-sm font-mono text-gray-600">{item.description}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const CraftingModal = ({ playerData, onClose, onUpdate }: { playerData: PlayerData, onClose: () => void, onUpdate: (data: Partial<PlayerData>) => void }) => {
  const [itemName, setItemName] = useState('');
  const [isEstimating, setIsEstimating] = useState(false);
  const [quote, setQuote] = useState<{item_name: string, cost: number, description: string} | null>(null);
  const [error, setError] = useState('');

  const handleEstimate = async () => {
    if (!itemName.trim()) return;
    setIsEstimating(true);
    setError('');
    setQuote(null);
    
    try {
      const ai = getAIClient(playerData);
      const prompt = `
      你是一個賽博龐克世界中的「黑市製造終端 AI」。
      玩家想要製造一項物品：「${itemName}」。
      請嚴格且誠實地根據賽博龐克世界觀（如義體、晶片、武器、黑客軟體等），評估這個物品的合理製造成本（Credits，下限為 10，上限為 10000，請依據物品的實際價值與強度嚴格判斷），並給予一段符合世界觀的物品描述（50字以內）。
      請務必只回傳 JSON 格式，不要包含其他文字（如 markdown 標記）：
      {
        "item_name": "物品名稱(可加上賽博龐克風格的修飾詞)",
        "cost": 1500,
        "description": "物品描述..."
      }
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      const aiResult = JSON.parse(response.text || '{}');
      if (!aiResult.item_name || !aiResult.cost) throw new Error("AI 估價失敗");
      
      setQuote(aiResult);
    } catch (err) {
      console.error(err);
      setError("終端連線不穩定，無法取得估價。");
    } finally {
      setIsEstimating(false);
    }
  };

  const handleCraft = async () => {
    if (!quote) return;
    if ((playerData.credits || 0) < quote.cost) {
      setError(`餘額不足！需要 ${quote.cost} Credits。`);
      return;
    }

    try {
      const newCredits = (playerData.credits || 0) - quote.cost;
      const currentInventory = playerData.inventory || [];
      
      const existingItemIndex = currentInventory.findIndex(item => item.itemName === quote.item_name);
      let newInventory = [...currentInventory];
      
      if (existingItemIndex >= 0) {
        newInventory[existingItemIndex] = {
          ...newInventory[existingItemIndex],
          quantity: newInventory[existingItemIndex].quantity + 1
        };
      } else {
        newInventory.push({
          itemName: quote.item_name,
          quantity: 1,
          description: quote.description
        });
      }

      const updateData = {
        credits: newCredits,
        inventory: newInventory
      };

      const playerRef = doc(db, 'players', playerData.uid);
      await setDoc(playerRef, updateData, { merge: true });
      
      onUpdate(updateData);
      setQuote(null);
      setItemName('');
      alert(`成功製造：${quote.item_name}！\n已存入背包。`);
    } catch (err) {
      console.error(err);
      setError("製造過程發生錯誤。");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="cyber-panel p-4 md:p-8 max-w-2xl w-full bg-white relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-2 right-2 md:top-4 md:right-4 text-black hover:text-[#ff003c] transition-colors z-10">
          <X size={32} />
        </button>
        
        <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 uppercase tracking-tighter glitch-text" data-text="創新製造系統">
          創新製造系統
        </h2>

        <div className="mb-6 border-2 border-black p-3 bg-gray-100 flex justify-between items-center">
          <div className="text-xs font-mono font-bold text-gray-500">帳戶餘額 (Credits)</div>
          <div className="text-xl font-bold text-[#00f0ff]">{playerData.credits || 0}</div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-black text-[#ff003c] font-mono font-bold text-sm border-l-4 border-[#ff003c]">
            [錯誤] {error}
          </div>
        )}

        {!quote ? (
          <>
            <div className="mb-6">
              <label className="block font-mono text-sm font-bold uppercase mb-2">
                輸入欲製造之物品名稱
              </label>
              <input
                type="text"
                value={itemName}
                onChange={(e) => setItemName(e.target.value)}
                disabled={isEstimating}
                className="cyber-input w-full p-4 text-lg font-bold"
                placeholder="例如：賽博義體潤滑油、非法記憶晶片..."
              />
            </div>
            
            <button 
              onClick={handleEstimate}
              disabled={isEstimating || !itemName.trim()}
              className={`cyber-button px-8 py-4 text-lg w-full ${(!itemName.trim() || isEstimating) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isEstimating ? '終端 AI 估價中...' : '請求 AI 估價'}
            </button>
          </>
        ) : (
          <div className="border-4 border-[#00f0ff] p-6 bg-black text-white mb-6 shadow-[4px_4px_0px_#00f0ff]">
            <h3 className="text-xl font-bold mb-4 text-[#00f0ff]">製造終端報價單</h3>
            <div className="mb-4">
              <div className="text-xs text-gray-400 font-mono mb-1">物品名稱</div>
              <div className="text-lg font-bold text-[#ff003c]">{quote.item_name}</div>
            </div>
            <div className="mb-4">
              <div className="text-xs text-gray-400 font-mono mb-1">物品描述</div>
              <div className="text-sm font-mono">{quote.description}</div>
            </div>
            <div className="mb-6">
              <div className="text-xs text-gray-400 font-mono mb-1">生產費用</div>
              <div className="text-2xl font-bold text-[#00f0ff]">{quote.cost} Credits</div>
            </div>
            
            <div className="flex gap-4">
              <button 
                onClick={() => setQuote(null)} 
                className="flex-1 border-2 border-gray-500 text-gray-400 hover:text-white hover:border-white font-bold py-3 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleCraft} 
                className="flex-1 bg-[#00f0ff] text-black font-bold py-3 hover:bg-white transition-colors"
              >
                確認製造
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const WorkModal = ({ playerData, onClose, onUpdate }: { playerData: PlayerData, onClose: () => void, onUpdate: (data: Partial<PlayerData>) => void }) => {
  const [description, setDescription] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<{reward: number, comment: string, newTitle?: string} | null>(null);

  const today = getTaiwanDateString();
  const isNewDay = playerData.lastWorkDate !== today;
  const dailyWorks = isNewDay ? 0 : (playerData.dailyWorks || 0);
  const canWork = dailyWorks < 3;
  const remainingWorks = 3 - dailyWorks;

  const handleSubmit = async () => {
    if (!description.trim() || !canWork) return;
    setIsSubmitting(true);
    
    try {
      const ai = getAIClient(playerData);
      const newTotalWorks = (playerData.totalWorks || 0) + 1;
      
      const prompt = `
      你是一個賽博龐克世界中的「企業主機 AI」。
      玩家提交了一份工作報告。請根據內容的豐富度、合理性與辛勞程度，給予評價等級 (1, 2, 或 3)。
      1 = 普通/基礎工作
      2 = 良好/進階工作
      3 = 優秀/核心工作
  
      玩家目前總工作次數即將達到：${newTotalWorks} 次。
      ${newTotalWorks === 30 ? '這是一個重要里程碑！請根據玩家過去的工作記錄與本次報告，授予一個「管理層級」的職稱（10個字以內，例如：資深數據分析主管、夜城物流經理）。' : ''}
      ${newTotalWorks === 90 ? '這是一個傳奇里程碑！請根據玩家過去的工作記錄與本次報告，授予一個「霸氣且獨一無二」的頂級職稱（10個字以內，例如：神域網絡總裁、暗網傳奇駭客）。' : ''}
  
      玩家過去的工作記錄摘要：
      ${(playerData.workHistory || []).slice(-10).join(' | ') || '無'}
  
      本次工作報告：
      ${description}
  
      請務必只回傳 JSON 格式，不要包含其他文字（如 markdown 標記）：
      {
        "level": 1,
        "comment": "以企業主機 AI 的口吻給予的一句簡短評語",
        "newTitle": "如果有達到里程碑才提供，否則留空"
      }
      `;
      
      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      const aiResult = JSON.parse(response.text || '{}');
      const level = aiResult.level || 1;
      
      let reward = 0;
      if (newTotalWorks < 30) {
        reward = level === 1 ? 50 : level === 2 ? 100 : 150;
      } else if (newTotalWorks < 90) {
        reward = level === 1 ? 5000 : level === 2 ? 10000 : 15000;
      } else {
        reward = 30000;
      }
      
      const newCredits = (playerData.credits || 0) + reward;
      const newTitle = aiResult.newTitle || playerData.jobTitle || '無業';
      const newHistory = [...(playerData.workHistory || []), description].slice(-100);
      
      const updateData = {
        credits: newCredits,
        totalWorks: newTotalWorks,
        dailyWorks: dailyWorks + 1,
        lastWorkDate: today,
        jobTitle: newTitle,
        workHistory: newHistory
      };
      
      const playerRef = doc(db, 'players', playerData.uid);
      await setDoc(playerRef, updateData, { merge: true });
      
      onUpdate(updateData);
      setResult({ reward, comment: aiResult.comment, newTitle: aiResult.newTitle });
      
    } catch (err) {
      console.error(err);
      alert("系統錯誤，請稍後再試。");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="cyber-panel p-4 md:p-8 max-w-2xl w-full bg-white relative max-h-[90vh] overflow-y-auto"
      >
        <button onClick={onClose} className="absolute top-2 right-2 md:top-4 md:right-4 text-black hover:text-[#ff003c] transition-colors z-10">
          <X size={32} />
        </button>
        
        <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 uppercase tracking-tighter glitch-text" data-text="工作系統">
          工作系統
        </h2>
        
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 md:gap-4 mb-6">
          <div className="border-2 border-black p-3 bg-gray-100">
            <div className="text-xs font-mono font-bold text-gray-500">當前職稱</div>
            <div className="text-lg font-bold text-[#ff003c]">{playerData.jobTitle || '無業'}</div>
          </div>
          <div className="border-2 border-black p-3 bg-gray-100">
            <div className="text-xs font-mono font-bold text-gray-500">帳戶餘額 (Credits)</div>
            <div className="text-lg font-bold text-[#00f0ff]">{playerData.credits || 0}</div>
          </div>
          <div className="border-2 border-black p-3 bg-gray-100">
            <div className="text-xs font-mono font-bold text-gray-500">總工作次數</div>
            <div className="text-lg font-bold">{playerData.totalWorks || 0}</div>
          </div>
          <div className="border-2 border-black p-3 bg-gray-100">
            <div className="text-xs font-mono font-bold text-gray-500">今日剩餘次數</div>
            <div className="text-lg font-bold">{remainingWorks} / 3</div>
          </div>
        </div>

        {result ? (
          <div className="border-4 border-[#00f0ff] p-6 bg-black text-white mb-6 shadow-[4px_4px_0px_#00f0ff]">
            <h3 className="text-xl font-bold mb-4 text-[#00f0ff]">工作結算報告</h3>
            <p className="font-mono text-sm mb-4">"{result.comment}"</p>
            <div className="text-lg font-bold mb-2">獲得報酬: <span className="text-[#00f0ff]">+{result.reward} Credits</span></div>
            {result.newTitle && (
              <div className="text-lg font-bold text-[#ff003c] animate-pulse">
                職稱晉升: {result.newTitle}
              </div>
            )}
            <button onClick={() => setResult(null)} className="cyber-button px-6 py-2 mt-4 w-full">
              確認
            </button>
          </div>
        ) : (
          <>
            <div className="mb-6">
              <label className="block font-mono text-sm font-bold uppercase mb-2">
                工作日誌輸入
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={!canWork || isSubmitting}
                className="cyber-input w-full p-4 text-sm font-bold min-h-[120px] resize-none"
                placeholder={canWork ? "描述你今天做了什麼工作..." : "今日工作次數已達上限，請明日再來。"}
              />
            </div>
            
            <button 
              onClick={handleSubmit}
              disabled={!canWork || isSubmitting || !description.trim()}
              className={`cyber-button px-8 py-4 text-lg w-full ${(!canWork || isSubmitting || !description.trim()) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              {isSubmitting ? '處理中...' : canWork ? '提交工作報告' : '今日額度已滿'}
            </button>
          </>
        )}
      </motion.div>
    </motion.div>
  );
};

const NPC_TRAITS = ['淫蕩', '貪慾', '機智', '善意', '好客', '穩重', '傲嬌', '溫柔'];
const NPC_GENDERS = ['male', 'female'];
const FIRST_NAMES_MALE = ['雷', '傑克', 'V', '強尼', '大衛', '亞當', '史密斯', '尼歐', '墨菲斯', '凱恩', '洛克', '里昂', '克里斯', '艾登', '馬可'];
const FIRST_NAMES_FEMALE = ['露西', '蕾貝卡', '莎夏', '艾莉絲', '崔妮蒂', '吉兒', '克萊兒', '艾達', '莎拉', '凱特', '安娜', '茱莉亞', '瑪莉', '艾瑪', '克洛伊'];
const LAST_NAMES = ['史特林', '銀手', '馬丁尼茲', '安德森', '威斯卡', '甘迺迪', '雷德菲爾', '皮爾斯', '沃克', '布萊克', '懷特', '格林', '布朗', '泰勒', '史密斯'];

const getDeterministicRandom = (seed: number) => {
  let t = seed += 0x6D2B79F5;
  t = Math.imul(t ^ t >>> 15, t | 1);
  t ^= t + Math.imul(t ^ t >>> 7, t | 61);
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

interface NPC {
  id: string;
  name: string;
  gender: string;
  trait: string;
}

const ALL_NPCS: NPC[] = Array.from({ length: 150 }, (_, i) => {
  const seed = i + 1;
  const gender = getDeterministicRandom(seed) > 0.5 ? 'male' : 'female';
  const firstNameList = gender === 'male' ? FIRST_NAMES_MALE : FIRST_NAMES_FEMALE;
  const firstName = firstNameList[Math.floor(getDeterministicRandom(seed + 100) * firstNameList.length)];
  const lastName = LAST_NAMES[Math.floor(getDeterministicRandom(seed + 200) * LAST_NAMES.length)];
  const trait = NPC_TRAITS[Math.floor(getDeterministicRandom(seed + 300) * NPC_TRAITS.length)];
  return {
    id: (i + 1).toString().padStart(3, '0'),
    name: `${firstName}·${lastName}`,
    gender,
    trait
  };
});

const TradeModal = ({ npc, playerData, onClose, onUpdate }: { npc: NPC, playerData: PlayerData, onClose: () => void, onUpdate: (data: Partial<PlayerData>) => void }) => {
  const [selectedItem, setSelectedItem] = useState<InventoryItem | null>(null);
  const [price, setPrice] = useState<number | ''>('');
  const [isTrading, setIsTrading] = useState(false);
  
  const [messages, setMessages] = useState<{role: 'user'|'npc', text: string}[]>([]);
  const [inputMsg, setInputMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  
  const tradeCount = playerData.npcRelationships?.[npc.id]?.tradeCount || 0;
  const [resistance, setResistance] = useState(Math.max(10, 100 - (tradeCount * 2)));
  const [isAgreed, setIsAgreed] = useState(false);
  const [error, setError] = useState('');

  const handleStartTrade = () => {
    if (!selectedItem || !price || price <= 0) return;
    setIsTrading(true);
    setMessages([{
      role: 'npc',
      text: `（打量著你手上的東西）你想賣多少？`
    }]);
  };

  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isSending || isAgreed) return;
    
    const userText = inputMsg.trim();
    const newMessages = [...messages, { role: 'user' as const, text: userText }];
    setMessages(newMessages);
    setInputMsg('');
    setIsSending(true);
    setError('');

    try {
      const ai = getAIClient(playerData);
      const prompt = `
      你是一個【${npc.trait}】的黑市商人，名叫 ${npc.name}。
      玩家目前想用 ${price} Credits 賣你【${selectedItem!.itemName}】(描述: ${selectedItem!.description})。
      你目前的防禦值（拒絕購買的意願）是 ${resistance} / 100。
      
      過往對話紀錄：
      ${newMessages.map(m => `${m.role === 'user' ? '玩家' : '你'}: ${m.text}`).join('\n')}
      
      請根據玩家的說服力、價格合理性以及你的性格，決定扣除多少防禦值（0 到 30 之間）。
      如果防禦值扣除後 <= 0，代表你同意成交。
      請用你的性格回應玩家，並且在防禦值 > 0 時不要輕易答應。
      
      請務必只回傳 JSON 格式：
      {
        "reply": "你的對話回應...",
        "resistance_reduction": 15
      }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: prompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      const aiResult = JSON.parse(response.text || '{}');
      const reduction = aiResult.resistance_reduction || 0;
      const newResistance = Math.max(0, resistance - reduction);
      
      setResistance(newResistance);
      setMessages(prev => [...prev, { role: 'npc', text: aiResult.reply }]);
      
      if (newResistance <= 0) {
        setIsAgreed(true);
      }
    } catch (err) {
      console.error(err);
      setError("通訊受到干擾，請再試一次。");
      setMessages(prev => prev.slice(0, -1));
      setInputMsg(userText);
    } finally {
      setIsSending(false);
    }
  };

  const handleConfirmTrade = async () => {
    if (!selectedItem || !price || !isAgreed) return;
    
    try {
      const currentInventory = playerData.inventory || [];
      const itemIndex = currentInventory.findIndex(i => i.itemName === selectedItem.itemName);
      
      if (itemIndex === -1) {
        setError("物品不存在！");
        return;
      }

      let newInventory = [...currentInventory];
      if (newInventory[itemIndex].quantity > 1) {
        newInventory[itemIndex] = {
          ...newInventory[itemIndex],
          quantity: newInventory[itemIndex].quantity - 1
        };
      } else {
        newInventory.splice(itemIndex, 1);
      }

      const newCredits = (playerData.credits || 0) + Number(price);
      const newNpcRelationships = { ...(playerData.npcRelationships || {}) };
      newNpcRelationships[npc.id] = {
        tradeCount: (newNpcRelationships[npc.id]?.tradeCount || 0) + 1
      };

      const updateData = {
        inventory: newInventory,
        credits: newCredits,
        npcRelationships: newNpcRelationships
      };

      const playerRef = doc(db, 'players', playerData.uid);
      await setDoc(playerRef, updateData, { merge: true });
      
      onUpdate(updateData);
      alert(`交易成功！獲得 ${price} Credits。`);
      onClose();
    } catch (err) {
      console.error(err);
      setError("交易過程發生錯誤。");
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="cyber-panel p-4 md:p-8 max-w-3xl w-full bg-white relative max-h-[90vh] flex flex-col"
      >
        <button onClick={onClose} className="absolute top-2 right-2 md:top-4 md:right-4 text-black hover:text-[#ff003c] transition-colors z-10">
          <X size={32} />
        </button>
        
        <div className="flex items-center gap-4 mb-6 shrink-0 border-b-2 border-black pb-4">
          <div>
            <h2 className="text-2xl font-bold">{npc.name}</h2>
            <div className="flex gap-2 mt-1">
              <span className="text-xs font-bold px-2 py-1 bg-black text-white">ID: {npc.id}</span>
              <span className="text-xs font-bold px-2 py-1 border border-[#ff003c] text-[#ff003c]">{npc.trait}</span>
              <span className="text-xs font-bold px-2 py-1 border border-gray-400 text-gray-600">交易次數: {tradeCount}</span>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-black text-[#ff003c] font-mono font-bold text-sm border-l-4 border-[#ff003c] shrink-0">
            [錯誤] {error}
          </div>
        )}

        {!isTrading ? (
          <div className="flex-1 overflow-y-auto">
            <h3 className="font-mono font-bold uppercase mb-4">選擇要推銷的物品</h3>
            {(!playerData.inventory || playerData.inventory.length === 0) ? (
              <div className="text-center py-8 text-gray-500 font-mono border-2 border-dashed border-gray-300">
                背包空無一物，無法進行交易。
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                {playerData.inventory.map((item, idx) => (
                  <div 
                    key={idx} 
                    onClick={() => setSelectedItem(item)}
                    className={`border-2 p-3 cursor-pointer transition-colors ${selectedItem?.itemName === item.itemName ? 'border-[#00f0ff] bg-black text-white' : 'border-black bg-gray-50 hover:border-[#00f0ff]'}`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="font-bold truncate pr-2">{item.itemName}</div>
                      <div className="text-xs font-mono">x{item.quantity}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {selectedItem && (
              <div className="mb-6">
                <label className="block font-mono text-sm font-bold uppercase mb-2">
                  設定售價 (Credits)
                </label>
                <input
                  type="number"
                  value={price}
                  onChange={(e) => setPrice(Number(e.target.value))}
                  className="cyber-input w-full p-3 text-lg font-bold"
                  placeholder="輸入金額..."
                  min="1"
                />
              </div>
            )}

            <button 
              onClick={handleStartTrade}
              disabled={!selectedItem || !price || price <= 0}
              className={`cyber-button px-8 py-4 text-lg w-full ${(!selectedItem || !price || price <= 0) ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              開始交涉
            </button>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-4 shrink-0 bg-gray-100 p-2 border-2 border-black">
              <div className="font-mono text-sm font-bold">
                推銷: <span className="text-[#ff003c]">{selectedItem?.itemName}</span> @ <span className="text-[#00f0ff]">{price} Credits</span>
              </div>
              <div className="font-mono text-sm font-bold flex items-center gap-2">
                防禦值: 
                <div className="w-32 h-4 bg-gray-300 relative overflow-hidden border border-black">
                  <div 
                    className="absolute top-0 left-0 h-full bg-[#ff003c] transition-all duration-500"
                    style={{ width: `${Math.min(100, Math.max(0, (resistance / 100) * 100))}%` }}
                  ></div>
                </div>
                <span>{resistance}</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-2 border-black p-4 mb-4 bg-gray-50 flex flex-col gap-4">
              {messages.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 font-mono text-sm ${msg.role === 'user' ? 'bg-black text-white border-l-4 border-[#00f0ff]' : 'bg-white border-2 border-black border-r-4 border-[#ff003c]'}`}>
                    <div className="text-xs text-gray-400 mb-1">{msg.role === 'user' ? '你' : npc.name}</div>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-3 font-mono text-sm bg-white border-2 border-black border-r-4 border-[#ff003c] animate-pulse">
                    對方正在思考...
                  </div>
                </div>
              )}
            </div>

            {isAgreed ? (
              <div className="shrink-0 animate-pulse">
                <button 
                  onClick={handleConfirmTrade}
                  className="cyber-button px-8 py-4 text-lg w-full bg-[#00f0ff] text-black hover:bg-white"
                >
                  確認成交 (+{price} Credits)
                </button>
              </div>
            ) : (
              <div className="flex gap-2 shrink-0">
                <input
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  disabled={isSending}
                  className="cyber-input flex-1 p-3 font-bold"
                  placeholder="輸入說服對方的訊息..."
                />
                <button 
                  onClick={handleSendMessage}
                  disabled={!inputMsg.trim() || isSending}
                  className="cyber-button px-6 py-3"
                >
                  發送
                </button>
              </div>
            )}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const MarketModal = ({ playerData, onClose, onUpdate }: { playerData: PlayerData, onClose: () => void, onUpdate: (data: Partial<PlayerData>) => void }) => {
  const [currentNPCs, setCurrentNPCs] = useState<NPC[]>([]);
  const [selectedNPC, setSelectedNPC] = useState<NPC | null>(null);
  
  const refreshNPCs = () => {
    const shuffled = [...ALL_NPCS].sort(() => 0.5 - Math.random());
    setCurrentNPCs(shuffled.slice(0, 10));
  };

  useEffect(() => {
    refreshNPCs();
  }, []);

  if (selectedNPC) {
    return <TradeModal npc={selectedNPC} playerData={playerData} onClose={() => setSelectedNPC(null)} onUpdate={onUpdate} />;
  }

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="cyber-panel p-4 md:p-8 max-w-4xl w-full bg-white relative max-h-[90vh] flex flex-col"
      >
        <button onClick={onClose} className="absolute top-2 right-2 md:top-4 md:right-4 text-black hover:text-[#ff003c] transition-colors z-10">
          <X size={32} />
        </button>
        
        <div className="flex justify-between items-center mb-6 shrink-0">
          <h2 className="text-3xl font-bold uppercase tracking-tighter glitch-text" data-text="市場交易系統">
            市場交易系統
          </h2>
          <button onClick={refreshNPCs} className="cyber-button px-4 py-2 text-sm">
            刷新市場名單
          </button>
        </div>
        
        <div className="overflow-y-auto pr-2 flex-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {currentNPCs.map(npc => {
              const tradeCount = playerData.npcRelationships?.[npc.id]?.tradeCount || 0;
              return (
                <div 
                  key={npc.id} 
                  onClick={() => setSelectedNPC(npc)}
                  className="border-2 border-black p-4 bg-gray-50 relative group hover:border-[#00f0ff] hover:bg-black hover:text-white transition-all cursor-pointer flex flex-col"
                >
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="text-xl font-bold group-hover:text-[#00f0ff] transition-colors">{npc.name}</h3>
                    <span className="font-mono text-xs bg-black text-white px-2 py-1 group-hover:bg-white group-hover:text-black transition-colors">
                      ID: {npc.id}
                    </span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    <span className="text-xs font-bold px-2 py-1 border border-gray-400 group-hover:border-gray-600">
                      {npc.gender === 'male' ? '男' : '女'}
                    </span>
                    <span className="text-xs font-bold px-2 py-1 border border-[#ff003c] text-[#ff003c] group-hover:bg-[#ff003c] group-hover:text-white transition-colors">
                      {npc.trait}
                    </span>
                  </div>
                  <div className="mt-auto text-sm font-mono text-gray-600 group-hover:text-gray-400">
                    交易成功次數: <span className="font-bold text-black group-hover:text-white">{tradeCount}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const CompanionModal = ({ playerData, onClose, onUpdate }: { playerData: PlayerData, onClose: () => void, onUpdate: (data: Partial<PlayerData>) => void }) => {
  const companions = playerData.companions || {};
  const [activeCompanionId, setActiveCompanionId] = useState<string | null>(null);
  
  const [inputMsg, setInputMsg] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState('');

  const handleCreateCompanion = async () => {
    const newId = `comp_${Date.now()}`;
    const newCompanion: CompanionData = {
      name: '未知個體',
      personality: '尚未定型',
      occupation: '未知',
      intimacyLevel: 0,
      chatCount: 0,
      isDefined: false,
      chatHistory: [{ role: 'npc', content: '（一個模糊的身影出現在你的終端機前，似乎在等待你的第一句話...）' }]
    };

    const newCompanions = { ...companions, [newId]: newCompanion };
    
    try {
      const playerRef = doc(db, 'players', playerData.uid);
      await setDoc(playerRef, { companions: newCompanions }, { merge: true });
      onUpdate({ companions: newCompanions });
      setActiveCompanionId(newId);
    } catch (err) {
      console.error(err);
      setError("建立連線失敗。");
    }
  };

  const handleSendMessage = async () => {
    if (!inputMsg.trim() || isSending || !activeCompanionId) return;
    
    const companion = companions[activeCompanionId];
    const userText = inputMsg.trim();
    const newHistory = [...companion.chatHistory, { role: 'user' as const, content: userText }];
    
    setInputMsg('');
    setIsSending(true);
    setError('');

    // Optimistic update for UI
    const tempCompanions = {
      ...companions,
      [activeCompanionId]: { ...companion, chatHistory: newHistory }
    };
    onUpdate({ companions: tempCompanions });

    try {
      const ai = getAIClient(playerData);
      
      let systemPrompt = `
      你是一個在賽博龐克世界中生活的平常人，你將與玩家建立深厚的感情。
      玩家正在與你互動。這是一個可以帶有浪漫、曖昧甚至擦邊球色彩的互動。
      請使用「隱喻、擦邊球、浪漫氛圍渲染」來取代直接的性器官描寫（拉燈寫法），保持色氣但遵守安全規範。
      `;

      if (!companion.isDefined) {
        systemPrompt += `
        目前你的「名字」、「性格」和「職業」都還未定型。
        請根據玩家的對話內容，逐漸展現出一種獨特的性格。
        如果這是第 ${companion.chatCount + 1} 次對話，且對話次數達到 5 次以上，請在回覆的 JSON 中，根據之前的互動，正式定義你的 name, personality, occupation。
        如果還沒達到，請保持這三個欄位為 null。
        `;
      } else {
        systemPrompt += `
        你的名字是：${companion.name}
        你的性格是：${companion.personality}
        你的職業是：${companion.occupation}
        `;
      }

      if (companion.intimacyLevel >= 3) {
        systemPrompt += `\n你現在與玩家是「同居關係」，說話語氣要非常親暱、依賴，甚至帶點佔有慾或日常的甜蜜。`;
      } else if (companion.intimacyLevel >= 2) {
        systemPrompt += `\n你現在與玩家是「約會對象」，說話語氣要充滿曖昧與期待。`;
      } else if (companion.intimacyLevel >= 1) {
        systemPrompt += `\n你現在與玩家是「熟識的朋友」，說話語氣輕鬆自然，帶點好感。`;
      }

      systemPrompt += `
      過往對話紀錄：
      ${newHistory.map(m => `${m.role === 'user' ? '玩家' : '你'}: ${m.content}`).join('\n')}
      
      請務必只回傳 JSON 格式：
      {
        "reply": "你的對話回應...",
        "intimacy_increase": 1, // 根據玩家的對話決定是否增加親密度 (0 或 1)
        "name": "如果決定了名字就填寫，否則 null",
        "personality": "如果決定了性格就填寫，否則 null",
        "occupation": "如果決定了職業就填寫，否則 null"
      }
      `;

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents: systemPrompt,
        config: {
          responseMimeType: "application/json",
        }
      });
      
      const aiResult = JSON.parse(response.text || '{}');
      
      const updatedHistory = [...newHistory, { role: 'npc' as const, content: aiResult.reply }];
      const newChatCount = companion.chatCount + 1;
      let newIntimacy = companion.intimacyLevel + (aiResult.intimacy_increase || 0);
      
      // Cap intimacy levels based on chat count to pace the progression
      if (newChatCount < 10 && newIntimacy > 10) newIntimacy = 10;
      if (newChatCount < 20 && newIntimacy > 20) newIntimacy = 20;

      // Determine level (0: Stranger, 1: Friend(10+), 2: Dating(20+), 3: Cohabitation(30+))
      let level = 0;
      if (newIntimacy >= 30) level = 3;
      else if (newIntimacy >= 20) level = 2;
      else if (newIntimacy >= 10) level = 1;

      const updatedCompanion: CompanionData = {
        ...companion,
        chatHistory: updatedHistory,
        chatCount: newChatCount,
        intimacyLevel: level,
        isDefined: companion.isDefined || (aiResult.name && aiResult.personality && aiResult.occupation) ? true : false,
        name: companion.isDefined ? companion.name : (aiResult.name || companion.name),
        personality: companion.isDefined ? companion.personality : (aiResult.personality || companion.personality),
        occupation: companion.isDefined ? companion.occupation : (aiResult.occupation || companion.occupation),
      };

      const finalCompanions = { ...companions, [activeCompanionId]: updatedCompanion };
      
      const playerRef = doc(db, 'players', playerData.uid);
      await setDoc(playerRef, { companions: finalCompanions }, { merge: true });
      onUpdate({ companions: finalCompanions });

    } catch (err) {
      console.error(err);
      setError("神經網路連線不穩定，伴侶暫時無法回應。");
      // Revert optimistic update on error
      onUpdate({ companions });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="cyber-panel p-4 md:p-8 max-w-4xl w-full bg-white relative max-h-[90vh] flex flex-col"
      >
        <button onClick={onClose} className="absolute top-2 right-2 md:top-4 md:right-4 text-black hover:text-[#ff003c] transition-colors z-10">
          <X size={32} />
        </button>
        
        <h2 className="text-2xl md:text-3xl font-bold mb-4 md:mb-6 uppercase tracking-tighter glitch-text shrink-0 text-[#ff003c]" data-text="伴侶系統">
          伴侶系統
        </h2>

        {error && (
          <div className="mb-4 p-3 bg-black text-[#ff003c] font-mono font-bold text-sm border-l-4 border-[#ff003c] shrink-0">
            [錯誤] {error}
          </div>
        )}

        {!activeCompanionId ? (
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div 
                onClick={handleCreateCompanion}
                className="border-4 border-dashed border-[#ff003c] p-8 flex flex-col items-center justify-center cursor-pointer hover:bg-[#ff003c]/10 transition-colors min-h-[200px]"
              >
                <div className="text-4xl text-[#ff003c] mb-2">+</div>
                <div className="font-bold font-mono text-[#ff003c]">建立新連結</div>
                <div className="text-xs text-gray-500 mt-2 text-center">透過互動塑造專屬伴侶</div>
              </div>

              {Object.entries(companions).map(([id, comp]) => (
                <div 
                  key={id}
                  onClick={() => setActiveCompanionId(id)}
                  className="border-2 border-black p-4 bg-gray-50 hover:border-[#ff003c] cursor-pointer transition-colors relative group flex flex-col"
                >
                  <div className="absolute top-2 right-2 flex gap-1">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Heart key={i} size={16} className={i < comp.intimacyLevel ? "text-[#ff003c] fill-[#ff003c]" : "text-gray-300"} />
                    ))}
                  </div>
                  <h3 className="text-xl font-bold mb-1 text-[#ff003c]">{comp.name}</h3>
                  <div className="text-xs font-mono text-gray-500 mb-2">
                    {comp.isDefined ? `${comp.occupation} | ${comp.personality}` : '資料建構中...'}
                  </div>
                  <div className="mt-auto pt-4 border-t border-gray-200 text-xs font-mono flex justify-between">
                    <span>互動次數: {comp.chatCount}</span>
                    <span className="text-[#ff003c] font-bold">
                      {comp.intimacyLevel === 3 ? '同居中' : comp.intimacyLevel === 2 ? '約會中' : comp.intimacyLevel === 1 ? '熟識' : '初識'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            <div className="flex justify-between items-center mb-4 shrink-0 bg-gray-100 p-3 border-2 border-black">
              <div className="flex items-center gap-3">
                <button onClick={() => setActiveCompanionId(null)} className="text-gray-500 hover:text-black font-bold">
                  &lt; 返回
                </button>
                <div>
                  <div className="font-bold text-[#ff003c]">{companions[activeCompanionId].name}</div>
                  <div className="text-xs font-mono text-gray-500">
                    {companions[activeCompanionId].isDefined ? `${companions[activeCompanionId].occupation} | ${companions[activeCompanionId].personality}` : '人格塑型中...'}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Heart key={i} size={20} className={i < companions[activeCompanionId].intimacyLevel ? "text-[#ff003c] fill-[#ff003c]" : "text-gray-300"} />
                ))}
              </div>
            </div>

            <div className="flex-1 overflow-y-auto border-2 border-black p-4 mb-4 bg-gray-50 flex flex-col gap-4">
              {companions[activeCompanionId].chatHistory.map((msg, idx) => (
                <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] p-3 font-mono text-sm ${msg.role === 'user' ? 'bg-black text-white border-l-4 border-[#ff003c]' : 'bg-white border-2 border-black border-r-4 border-[#ff003c]'}`}>
                    <div className="text-xs text-gray-400 mb-1">{msg.role === 'user' ? '你' : companions[activeCompanionId].name}</div>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isSending && (
                <div className="flex justify-start">
                  <div className="max-w-[80%] p-3 font-mono text-sm bg-white border-2 border-black border-r-4 border-[#ff003c] animate-pulse">
                    正在輸入...
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-2 shrink-0">
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                disabled={isSending}
                className="cyber-input flex-1 p-3 font-bold"
                placeholder="傳送訊息..."
              />
              <button 
                onClick={handleSendMessage}
                disabled={!inputMsg.trim() || isSending}
                className="cyber-button px-6 py-3 border-[#ff003c] text-[#ff003c] hover:bg-[#ff003c] hover:text-white"
              >
                發送
              </button>
            </div>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

const getAIClient = (playerData: PlayerData | null) => {
  const apiKey = playerData?.userGeminiApiKey;
  if (!apiKey) {
    throw new Error("系統偵測到 AI 模組未初始化。請點擊右上角⚙️圖示設置您的 Gemini API Key 以啟用完整功能。");
  }
  return new GoogleGenAI({ apiKey });
};

const SettingsModal = ({ playerData, onClose, onUpdate }: { playerData: PlayerData, onClose: () => void, onUpdate: (data: Partial<PlayerData>) => void }) => {
  const [apiKey, setApiKey] = useState(playerData.userGeminiApiKey || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showKey, setShowKey] = useState(false);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const playerRef = doc(db, 'players', playerData.uid);
      await setDoc(playerRef, { userGeminiApiKey: apiKey }, { merge: true });
      onUpdate({ userGeminiApiKey: apiKey });
      alert("系統設定已更新。");
      onClose();
    } catch (err) {
      console.error(err);
      alert("儲存失敗，請檢查網路連線。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
    >
      <motion.div 
        initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }}
        className="cyber-panel p-6 md:p-10 max-w-lg w-full bg-white relative"
      >
        <button onClick={onClose} className="absolute top-4 right-4 text-black hover:text-[#ff003c] transition-colors">
          <X size={24} />
        </button>
        
        <h2 className="text-2xl font-bold mb-6 uppercase tracking-tighter glitch-text text-[#ff003c]" data-text="系統核心設定">
          系統核心設定
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block font-mono text-sm font-bold uppercase mb-2">
              Gemini API Key
            </label>
            <div className="relative">
              <input
                type={showKey ? "text" : "password"}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                className="cyber-input w-full p-3 font-mono text-sm"
                placeholder="在此輸入您的 API Key..."
              />
              <button 
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-500 hover:text-black"
              >
                {showKey ? "隱藏" : "顯示"}
              </button>
            </div>
            <p className="mt-2 text-[10px] font-mono text-gray-600">
              * 請前往 Google AI Studio (aistudio.google.com) 獲取 API Key 以驅動本遊戲的 AI 對話與生成模組。
            </p>
          </div>

          <button 
            onClick={handleSave}
            disabled={isSaving}
            className={`cyber-button px-8 py-3 text-lg w-full ${isSaving ? 'opacity-50' : ''}`}
          >
            {isSaving ? "更新資料庫中..." : "確認變更"}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};

const NetworkMap = ({ playerData, onUpdatePlayerData }: { playerData: PlayerData, onUpdatePlayerData: (data: Partial<PlayerData>) => void }) => {
  const [activeNode, setActiveNode] = useState<string | null>(null);
  const center = { x: '50%', y: '50%' };
  const nodes = [
    { id: 'companion', label: '伴侶系統', icon: Heart, x: '20%', y: '25%', color: '#ff003c', active: true },
    { id: 'crafting', label: '創新製造系統', icon: Wrench, x: '80%', y: '25%', color: '#00f0ff', active: true },
    { id: 'market', label: '市場交易系統', icon: ShoppingCart, x: '80%', y: '80%', color: '#000000', active: true },
    { id: 'work', label: '工作系統', icon: Briefcase, x: '20%', y: '80%', color: '#ffaa00', active: true },
    { id: 'inventory', label: '物品持有', icon: Package, x: '50%', y: '15%', color: '#00ff00', active: true },
  ];

  return (
    <div className="w-full max-w-5xl mx-auto flex flex-col gap-4 md:gap-6 relative">
      <div className="bg-white border-2 md:border-4 border-black p-3 md:p-4 shadow-[4px_4px_0px_#ff003c] flex flex-col md:flex-row justify-between items-start md:items-center gap-2 md:gap-4">
        <div>
          <div className="font-mono text-xs md:text-sm font-bold">
            節點代號: <span className="text-base md:text-lg">{playerData.gameName}</span> 
            <span className="text-[10px] md:text-xs text-gray-500 ml-2">({playerData.gender === 'male' ? '男' : '女'})</span>
          </div>
          <div className="font-mono text-[10px] md:text-xs text-gray-600 mt-1 max-w-2xl line-clamp-2 md:line-clamp-none">
            <span className="font-bold text-black">特徵記錄:</span> {playerData.appearance}
          </div>
        </div>
        <div className="text-left md:text-right shrink-0 flex flex-row md:flex-col items-center md:items-end gap-2 md:gap-1 w-full md:w-auto justify-between md:justify-start">
          <div className="font-mono text-[10px] md:text-xs font-bold text-[#00f0ff] bg-black px-2 md:px-3 py-1 md:py-2 inline-block border border-[#00f0ff] shadow-[0_0_10px_rgba(0,240,255,0.3)]">
            網路狀態: 已連線
          </div>
          <div className="font-mono text-xs md:text-sm font-bold">
            Credits: <span className="text-[#ff003c]">{playerData.credits || 0}</span>
          </div>
        </div>
      </div>

      <div className="relative w-full h-[450px] md:h-[600px] border-2 md:border-4 border-black bg-white shadow-[4px_4px_0px_#000] md:shadow-[8px_8px_0px_#000] overflow-hidden cyber-panel">
        {/* Grid Background */}
        <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'linear-gradient(#000 1px, transparent 1px), linear-gradient(90deg, #000 1px, transparent 1px)', backgroundSize: '40px 40px' }}></div>

        {/* SVG Lines */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {nodes.map(node => (
            <motion.line
              key={`line-${node.id}`}
              x1={center.x} y1={center.y}
              x2={node.x} y2={node.y}
              stroke={node.color}
              strokeWidth="3"
              strokeDasharray={node.active ? "none" : "8 8"}
              initial={{ strokeDashoffset: 0, opacity: 0 }}
              animate={{ strokeDashoffset: -100, opacity: 1 }}
              transition={{ 
                strokeDashoffset: { duration: 5, repeat: Infinity, ease: "linear" }, 
                opacity: { duration: 1 } 
              }}
            />
          ))}
        </svg>

        {/* Center Node (Player) */}
        <motion.div
          className="absolute transform -translate-x-1/2 -translate-y-1/2 z-10"
          style={{ left: center.x, top: center.y }}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", bounce: 0.5 }}
        >
          <div className="bg-black text-white p-4 md:p-6 border-2 border-[#00f0ff] shadow-[0_0_15px_rgba(0,240,255,0.4)] flex flex-col items-center relative min-w-[120px] md:min-w-[160px]">
            <div className="absolute -top-2 -left-2 md:-top-3 md:-left-3 w-4 h-4 md:w-6 md:h-6 border-t-4 border-l-4 border-[#ff003c]"></div>
            <div className="absolute -bottom-2 -right-2 md:-bottom-3 md:-right-3 w-4 h-4 md:w-6 md:h-6 border-b-4 border-r-4 border-[#00f0ff]"></div>
            <Cpu className="mb-2 md:mb-3 text-[#00f0ff] w-8 h-8 md:w-10 md:h-10" />
            <span className="font-mono font-bold text-lg md:text-xl glitch-text" data-text={playerData.gameName}>{playerData.gameName}</span>
            <span className="text-[10px] md:text-xs text-gray-400 mt-1 md:mt-2 tracking-widest">{playerData.jobTitle || '核心節點'}</span>
          </div>
        </motion.div>

        {/* System Nodes */}
        {nodes.map((node, i) => (
          <motion.div
            key={node.id}
            className={`absolute transform -translate-x-1/2 -translate-y-1/2 z-10 ${node.active ? 'cursor-pointer' : 'cursor-not-allowed'} group`}
            style={{ left: node.x, top: node.y }}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 + i * 0.2 }}
            whileHover={{ scale: 1.05 }}
            onClick={() => node.active && setActiveNode(node.id)}
          >
            <div className={`bg-white border-2 md:border-4 border-black p-3 md:p-6 shadow-[4px_4px_0px_#000] md:shadow-[6px_6px_0px_#000] group-hover:shadow-[4px_4px_0px_var(--hover-color)] md:group-hover:shadow-[6px_6px_0px_var(--hover-color)] transition-all flex flex-col items-center gap-2 md:gap-3 relative min-w-[110px] md:min-w-[180px] ${node.active ? 'border-[var(--hover-color)]' : ''}`}
                 style={{ '--hover-color': node.color } as any}>
              {!node.active && (
                <div className="absolute top-1 right-1 md:top-2 md:right-2">
                  <Lock className="text-gray-400 w-3 h-3 md:w-4 md:h-4" />
                </div>
              )}
              <node.icon className="w-6 h-6 md:w-9 md:h-9" color={node.color} />
              <span className="font-bold font-sans text-sm md:text-xl tracking-tight whitespace-nowrap">{node.label}</span>
              <span className={`text-[9px] md:text-xs px-1 md:px-2 py-0.5 md:py-1 font-mono font-bold border whitespace-nowrap ${node.active ? 'bg-[#ffaa00]/20 text-[#ffaa00] border-[#ffaa00]' : 'bg-gray-200 text-gray-600 border-gray-400'}`}>
                {node.active ? '模組已啟用' : '模組未啟用'}
              </span>
            </div>
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {activeNode === 'companion' && (
          <CompanionModal playerData={playerData} onClose={() => setActiveNode(null)} onUpdate={onUpdatePlayerData} />
        )}
        {activeNode === 'work' && (
          <WorkModal playerData={playerData} onClose={() => setActiveNode(null)} onUpdate={onUpdatePlayerData} />
        )}
        {activeNode === 'crafting' && (
          <CraftingModal playerData={playerData} onClose={() => setActiveNode(null)} onUpdate={onUpdatePlayerData} />
        )}
        {activeNode === 'inventory' && (
          <InventoryModal playerData={playerData} onClose={() => setActiveNode(null)} />
        )}
        {activeNode === 'market' && (
          <MarketModal playerData={playerData} onClose={() => setActiveNode(null)} onUpdate={onUpdatePlayerData} />
        )}
      </AnimatePresence>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [playerData, setPlayerData] = useState<PlayerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isSettingProfile, setIsSettingProfile] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [genderInput, setGenderInput] = useState<'male' | 'female'>('male');
  const [appearanceInput, setAppearanceInput] = useState('');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      
      if (currentUser) {
        try {
          const playerRef = doc(db, 'players', currentUser.uid);
          const playerSnap = await getDoc(playerRef);
          
          if (!playerSnap.exists()) {
            const newData = {
              uid: currentUser.uid,
              displayName: currentUser.displayName || 'Anonymous Player',
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp()
            };
            await setDoc(playerRef, newData);
            setPlayerData(newData as any);
            setIsSettingProfile(true);
          } else {
            const data = playerSnap.data() as PlayerData;
            try {
              await setDoc(playerRef, {
                lastLoginAt: serverTimestamp()
              }, { merge: true });
            } catch (updateErr) {
              console.warn("Failed to update lastLoginAt:", updateErr);
            }
            
            setPlayerData(data);
            if (!data.gameName || !data.gender || !data.appearance) {
              setIsSettingProfile(true);
            }
          }
        } catch (err) {
          try {
            handleFirestoreError(err, OperationType.WRITE, `players/${currentUser.uid}`);
          } catch (handledErr: any) {
            setError(handledErr.message);
          }
        }
      } else {
        setPlayerData(null);
        setIsSettingProfile(false);
      }
      
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    setError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: any) {
      console.error("Login failed:", err);
      setError(err.message);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err: any) {
      console.error("Logout failed:", err);
      setError(err.message);
    }
  };

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    const trimmedName = nameInput.trim();
    const trimmedAppearance = appearanceInput.trim();
    
    if (trimmedName.length < 1 || trimmedName.length > 20) {
      setError("遊戲名稱必須在 1 到 20 個字元之間。");
      return;
    }
    if (trimmedAppearance.length > 500) {
      setError("外貌描述過長（最多 500 字元）。");
      return;
    }

    try {
      const playerRef = doc(db, 'players', user!.uid);
      const updateData = {
        gameName: trimmedName,
        gender: genderInput,
        appearance: trimmedAppearance
      };
      await setDoc(playerRef, updateData, { merge: true });
      setPlayerData(prev => prev ? { ...prev, ...updateData } : null);
      setIsSettingProfile(false);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.UPDATE, `players/${user!.uid}`);
      } catch (handledErr: any) {
        setError(handledErr.message);
      }
    }
  };

  const handleUpdatePlayerData = (newData: Partial<PlayerData>) => {
    setPlayerData(prev => prev ? { ...prev, ...newData } : null);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="font-mono text-xl font-bold tracking-widest uppercase glitch-text" data-text="系統初始化中...">
          系統初始化中...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen font-sans flex flex-col relative overflow-hidden">
      <header className="border-b-2 md:border-b-4 border-black p-3 md:p-4 flex justify-between items-center bg-white z-10">
        <h1 className="text-xl md:text-2xl font-bold tracking-tighter uppercase glitch-text" data-text="虛實：敘事">
          虛實：敘事
        </h1>
        {user ? (
          <div className="flex items-center gap-4 md:gap-6">
            <div className="text-right hidden sm:block">
              <div className="text-[10px] md:text-xs font-mono font-bold text-gray-500 uppercase">當前使用者</div>
              <div className="text-xs md:text-sm font-bold uppercase">{playerData?.gameName || user.email}</div>
            </div>
            <button 
              onClick={() => setIsSettingsOpen(true)}
              className="cyber-button p-2 md:p-2.5 flex items-center justify-center"
              title="系統設定"
            >
              <Settings size={20} />
            </button>
            <button 
              onClick={handleLogout}
              className="cyber-button px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm"
            >
              中斷連線
            </button>
          </div>
        ) : (
          <button 
            onClick={handleLogin}
            className="cyber-button px-6 py-2 text-sm"
          >
            身份驗證_登入
          </button>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-8 z-10 w-full">
        {error && (
          <div className="mb-8 p-4 border-4 border-black bg-white shadow-[4px_4px_0px_#ff003c] max-w-2xl w-full break-words">
            <strong className="block mb-2 font-mono text-[#ff003c] uppercase text-xl">系統錯誤</strong>
            <p className="font-mono text-sm">{error}</p>
          </div>
        )}

        {!user ? (
          <div className="cyber-panel p-12 max-w-md w-full text-center bg-white">
            <h2 className="text-4xl font-bold mb-6 uppercase tracking-tighter glitch-text" data-text="拒絕存取">
              拒絕存取
            </h2>
            <p className="font-mono text-sm mb-8 font-bold text-gray-600">
              請進行身份驗證以存取主機。
            </p>
            <button 
              onClick={handleLogin}
              className="cyber-button px-8 py-4 text-lg w-full"
            >
              啟動登入程序
            </button>
          </div>
        ) : isSettingProfile ? (
          <div className="cyber-panel p-10 max-w-md w-full bg-white">
            <h2 className="text-3xl font-bold mb-2 uppercase tracking-tighter glitch-text" data-text="註冊身份">
              註冊身份
            </h2>
            <p className="font-mono text-xs mb-8 font-bold text-gray-500 uppercase">
              請輸入您在網格中的專屬代號與特徵。
            </p>
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">
                  遊戲名稱 (1-20字元)
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="cyber-input w-full p-3 text-lg font-bold"
                  placeholder="例如：霓虹幽靈"
                  maxLength={20}
                  required
                />
              </div>
              
              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">
                  性別
                </label>
                <div className="flex gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="gender" 
                      value="male" 
                      checked={genderInput === 'male'}
                      onChange={() => setGenderInput('male')}
                      className="accent-[#ff003c] w-4 h-4"
                    />
                    <span className="font-bold">男</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input 
                      type="radio" 
                      name="gender" 
                      value="female" 
                      checked={genderInput === 'female'}
                      onChange={() => setGenderInput('female')}
                      className="accent-[#ff003c] w-4 h-4"
                    />
                    <span className="font-bold">女</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block font-mono text-sm font-bold uppercase mb-2">
                  外貌描述
                </label>
                <textarea
                  value={appearanceInput}
                  onChange={(e) => setAppearanceInput(e.target.value)}
                  className="cyber-input w-full p-3 text-sm font-bold min-h-[100px] resize-none"
                  placeholder="描述你的角色外觀特徵..."
                  maxLength={500}
                  required
                />
              </div>

              <button 
                type="submit"
                className="cyber-button px-8 py-4 text-lg w-full"
              >
                確認身份
              </button>
            </form>
          </div>
        ) : playerData ? (
          <NetworkMap playerData={playerData} onUpdatePlayerData={handleUpdatePlayerData} />
        ) : (
          <div className="cyber-panel p-12 max-w-md w-full text-center bg-white">
            <h2 className="text-2xl font-bold mb-6 uppercase tracking-tighter glitch-text text-[#ff003c]" data-text="資料載入失敗">
              資料載入失敗
            </h2>
            <p className="font-mono text-sm mb-8 font-bold text-gray-600">
              無法取得玩家資料，請檢查網路連線或重新整理頁面。
            </p>
          </div>
        )}
      </main>
      <AnimatePresence>
        {isSettingsOpen && playerData && (
          <SettingsModal playerData={playerData} onClose={() => setIsSettingsOpen(false)} onUpdate={handleUpdatePlayerData} />
        )}
      </AnimatePresence>
    </div>
  );
}
