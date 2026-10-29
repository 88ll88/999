const fs = require('fs');
const axios = require('axios');

// 改用完全不鎖 IP、反應速度極快的公開台彩 API 端點
const API_URL = "https://timetable.tw";
const JS_FILE_PATH = "./7788.js";

function addDays(dateStr, days) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

function getTaiwanTodayStr() {
    const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('zh-TW', options);
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
}

function isSunday(dateStr) {
    return new Date(dateStr).getDay() === 0;
}

async function run() {
    try {
        const todayStr = getTaiwanTodayStr();
        console.log(`[系統通知] 當前台灣日期：${todayStr}`);

        if (!fs.existsSync(JS_FILE_PATH)) {
            console.error("錯誤：找不到 7788.js 檔案！");
            return;
        }
        let jsContent = fs.readFileSync(JS_FILE_PATH, 'utf-8');

        // 1. 精準抓取 7788.js 目前首列的日期
        const dateRegex = /['"](\d{4}-\d{2}-\d{2})['"]/;
        const match = jsContent.match(dateRegex);
        if (!match) {
            console.error("錯誤：7788.js 裡找不到任何日期格式！");
            return;
        }

        const latestDateInJs = match[1];
        console.log(`[步驟驗證] 7788.js 目前首列最新日期是：${latestDateInJs}`);

        // 精準定位首列整行內容，用於步驟 3 覆蓋
        const firstRowRegex = /(\[\s*['"]\d{4}-\d{2}-\d{2}['"]\s*,\s*\[[\s\S]*?\]\s*\]\s*,)/;
        const firstRowMatch = jsContent.match(firstRowRegex);
        const firstRowString = firstRowMatch ? firstRowMatch[1] : null;

        let nextTargetDate = addDays(latestDateInJs, 1);
        if (isSunday(nextTargetDate)) {
            nextTargetDate = addDays(nextTargetDate, 1);
        }

        console.log(`正在請求 API 獲取最新開獎資料...`);
        const response = await axios.get(API_URL, { timeout: 10000 });
        const apiData = response.data;

        // 檢查 API 的開獎日期是否符合我們要找的 nextTargetDate
        const apiDate = apiData.drawDate; // 格式通常為 YYYY-MM-DD
        if (apiDate !== nextTargetDate) {
            console.log(`[通知] 目前 API 最新日期為 ${apiDate}，尚無 ${nextTargetDate} 的開獎紀錄。今日提早結束。`);
            return;
        }

        // 原始號碼（即為最真實的【落球順序】）
        const rawDrop = apiData.winningNumbers; 
        if (!rawDrop || rawDrop.length !== 5) {
            console.error("[異常] API 回傳的號碼數量異常。");
            return;
        }

        // 自動將落球排序，產生【順球順序】
        const rawOrder = [...rawDrop].sort((a, b) => a - b);

        // 嚴格確保「無空格」緊密字串格式，自動補零
        const formatBalls = (arr) => `[${arr.map(n => `'${String(n).padStart(2, '0')}'`).join(',')}]`;
        const dropBallsStr = formatBalls(rawDrop);
        const orderBallsStr = formatBalls(rawOrder);

        // ==========================================
        // 【邏輯 1】：補更昨天的落球
        // ==========================================
        if (nextTargetDate !== todayStr) {
            console.log(`[執行步驟 1] 正在補更 ${nextTargetDate} 的【落球】。`);
            const newRowStr = `['${nextTargetDate}',${dropBallsStr}],`;
            let newJsContent = jsContent.replace(/(\[\s*\n?)/, `$1  ${newRowStr}\n`);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 補更完畢！`);
            return;
        }

        // ==========================================
        // 【邏輯 2 與 3】：處理今天的最新開獎
        // ==========================================
        if (latestDateInJs !== todayStr) {
            // 20:40 第一棒：插入【順球】
            console.log(`[執行步驟 2] 正在置入今日 ${todayStr} 的【順球】。`);
            const newRowStr = `['${todayStr}',${orderBallsStr}],`;
            let newJsContent = jsContent.replace(/(\[\s*\n?)/, `$1  ${newRowStr}\n`);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 今日【順球】已成功插入首列。`);
        } else {
            // 21:30 第二棒：直接將今天原本的順球那行覆蓋替換成【落球】
            if (!firstRowString) {
                console.error("錯誤：無法定位舊首列，無法進行覆蓋。");
                return;
            }
            console.log(`[執行步驟 3] 正在將今日首列覆蓋替換為最新【落球】。`);
            const targetDropRowStr = `['${todayStr}',${dropBallsStr}],`;
            let newJsContent = jsContent.replace(firstRowString, targetDropRowStr);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 今日首列已完美替換為【落球】！`);
        }

    } catch (error) {
        console.error("自動更新過程中發生系統錯誤:", error.message);
    }
}

run();
