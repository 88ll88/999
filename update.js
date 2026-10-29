const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// 設定目標網頁
const LOTTO_URL = "https://9800.com.tw";
const JS_FILE_PATH = "./7788.js"; // 讀寫本地倉庫中的 7788.js

// 日期工具：加 N 天 (回傳 YYYY-MM-DD)
function addDays(dateStr, days) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
}

// 獲取今天的台灣時間日期 (格式為 YYYY-MM-DD)
function getTaiwanTodayStr() {
    const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('zh-TW', options);
    const parts = formatter.formatToParts(new Date());
    const year = parts.find(p => p.type === 'year').value;
    const month = parts.find(p => p.type === 'month').value;
    const day = parts.find(p => p.type === 'day').value;
    return `${year}-${month}-${day}`;
}

// 檢查是否為週日
function isSunday(dateStr) {
    return new Date(dateStr).getDay() === 0;
}

async function run() {
    try {
        const todayStr = getTaiwanTodayStr();
        console.log(`[系統通知] 當前台灣日期：${todayStr}`);

        // 讀取本地目前的 7788.js 內容
        if (!fs.existsSync(JS_FILE_PATH)) {
            console.error("錯誤：找不到 7788.js 檔案！");
            return;
        }
        let jsContent = fs.readFileSync(JS_FILE_PATH, 'utf-8');

        // 正則表達式抓取首列：['日期',['球','球','球','球','球']]
        const rowRegex = /\[\s*'(\d{4}-\d{2}-\d{2})'\s*,\s*\[\s*'(\d{2})'\s*,\s*'(\d{2})'\s*,\s*'(\d{2})'\s*,\s*'(\d{2})'\s*,\s*'(\d{2})'\s*\]\s*\]/;
        const match = jsContent.match(rowRegex);
        if (!match) {
            console.error("錯誤：7788.js 格式不相符，無法解析首列日期！");
            return;
        }

        const latestDateInJs = match[1];
        const firstRowString = match[0]; // 完整的首列字串內容
        console.log(`[步驟驗證] 7788.js 目前首列最新日期是：${latestDateInJs}`);

        // 計算下一期應該開獎的日期
        let nextTargetDate = addDays(latestDateInJs, 1);
        if (isSunday(nextTargetDate)) {
            nextTargetDate = addDays(nextTargetDate, 1); // 週日休息，再加一天
        }

        // 爬取樂透堂網頁
        console.log("正在抓取樂透堂最新網頁資料...");
        const response = await axios.get(LOTTO_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
        const $ = cheerio.load(response.data);

        // 尋找網頁表格中符合 nextTargetDate 這一天的列
        let targetTr = null;
        $('table tr').each((i, row) => {
            if ($(row).text().includes(nextTargetDate)) {
                targetTr = row;
            }
        });

        if (!targetTr) {
            console.log(`[通知] 樂透堂網頁上目前還找不到 ${nextTargetDate} 的資料，今日提早結束。`);
            return;
        }

        // 解析開獎資料
        const tds = $(targetTr).find('td');
        // 假設欄位順序：期次(0)、開獎日期(1)、週幾(2)、落球序(3)、順序排序(4)
        const rawDrop = $(tds.get(3)).text().trim().split(/\s+/);
        const rawOrder = $(tds.get(4)).text().trim().split(/\s+/);

        if (rawOrder.length !== 5) {
            console.error(`[異常] 查找到 ${nextTargetDate} 的號碼數量不等於 5 顆，網頁結構可能異常。`);
            return;
        }

        // 格式化為沒有多餘空格的精簡陣列： ['06','11','13','19','35']
        const dropBallsStr = `[${rawDrop.map(n => `'${n}'`).join(',')}]`;
        const orderBallsStr = `[${rawOrder.map(n => `'${n}'`).join(',')}]`;

        // ==========================================
        // 【邏輯 1】：之前漏更新 (首列日期 + 1 天 不是今天) -> 100% 抓落球補上
        // ==========================================
        if (nextTargetDate !== todayStr) {
            console.log(`[執行步驟 1] 發現歷史斷層！正在補更 ${nextTargetDate} 的【落球】。`);
            const newRowStr = `['${nextTargetDate}',${dropBallsStr}],`;
            
            // 精準塞到 var 7788 = [ 的下一行
            let newJsContent = jsContent.replace(/(var\s+7788\s*=\s*\[)/, `$1\n${newRowStr}`);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 補更完畢！已成功置入落球資料。`);
            return;
        }

        // ==========================================
        // 【邏輯 2 與 3】：推算日期就是今天 (nextTargetDate === todayStr)
        // ==========================================
        
        // 檢查當前 7788.js 首列是不是已經是今天的日期了
        if (latestDateInJs !== todayStr) {
            // 代表此時是 20:40 左右，今天的第一棒：抓【順球】插入首列
            console.log(`[執行步驟 2] 偵測到今日新開獎！正在為您置入 ${todayStr} 的【順球】。`);
            const newRowStr = `['${todayStr}',${orderBallsStr}],`;
            
            let newJsContent = jsContent.replace(/(var\s+7788\s*=\s*\[)/, `$1\n${newRowStr}`);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 今日新開獎【順球】已成功插入首列。`);
        } else {
            // 代表首列已經是今天，此時是 21:30 之後的第二棒：要把現有的首列（順球）「替換覆蓋」成【落球】
            console.log(`[執行步驟 3] 今日首列已存在，正在將其覆蓋並替換更新為【落球】。`);
            const targetDropRowStr = `['${todayStr}',${dropBallsStr}],`;
            
            // 用剛剛正則匹配到的第一列舊字串，直接完全替換成最新的落球字串
            let newJsContent = jsContent.replace(firstRowString, targetDropRowStr);
            fs.writeFileSync(JS_FILE_PATH, newJsContent, 'utf-8');
            console.log(`[成功] 今日首列已完美覆蓋為最新【落球】序列！`);
        }

    } catch (error) {
        console.error("自動更新過程中發生系統錯誤:", error.message);
    }
}

run();
