const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 539 自動更新流程`);

    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        console.error('無法讀取 7788.js:', e.message);
        process.exit(1);
    }

    // 相容 var 7788 格式解析
    const match = content.match(/var\s+7788\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) {
        console.error('7788.js 格式解析失敗');
        process.exit(1);
    }

    let records = eval('(' + match[1] + ')');
    let topDateStr = records[0][0];

    // 取得台灣目前的最新小時 (定時排程判斷用)
    const twHour = new Date(new Date().getTime() + 8 * 60 * 60 * 1000).getUTCHours();
    
    // 計算下一個開獎日期
    let nextDate = getNextDrawDate(topDateStr);
    
    // 獲取今天台灣日期
    const options = { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' };
    const formatter = new Intl.DateTimeFormat('zh-TW', options);
    const parts = formatter.formatToParts(new Date());
    const todayStr = `${parts.find(p => p.type === 'year').value}-${parts.find(p => p.type === 'month').value}-${parts.find(p => p.type === 'day').value}`;

    let targetDate = '';
    let mode = 'luo'; // 預設走落球

    // ==========================================
    // 【流程判斷中心】完全符合 1、2、3 步驟邏輯
    // ==========================================
    if (nextDate !== todayStr) {
        // 【步驟 1】：發現歷史斷層 (首列日期+1不等於今天)，直接鎖定抓落球進行補課
        targetDate = nextDate;
        mode = 'luo';
        console.log(`[步驟 1 啟動] 偵測到歷史未更新日期，目標補更日期: ${targetDate}，鎖定抓取【落球】`);
    } else {
        // 推算日期就是今天 (nextDate === todayStr)
        targetDate = todayStr;
        
        // 判斷是要走【步驟 2 順球】還是【步驟 3 落球覆蓋】
        if (topDateStr !== todayStr) {
            // 今天第一棒 (通常為 20:40 觸發)：7788.js 首列還不是今天
            mode = 'shun';
            console.log(`[步驟 2 啟動] 今日開獎第一棒，目標更新日期: ${targetDate}，優先抓取【順球】插入首列`);
        } else {
            // 今天第二棒 (通常為 21:30 後觸發)：7788.js 首列已經是今天了
            mode = 'luo';
            console.log(`[步驟 3 啟動] 今日首列已存在，目標更新日期: ${targetDate}，將重新抓取【落球】完全覆蓋首列`);
        }
    }

    // 前往樂透堂獲取號碼
    let balls = await fetch9800Table(targetDate, mode);

    if (!balls || balls.length !== 5 || balls.includes('00')) {
        console.log(`[通知] 樂透堂網頁上目前尚未更新 ${targetDate} 的 [${mode === 'shun' ? '順球' : '落球'}] 資料，安全放棄寫入。`);
        return;
    }

    console.log(`[成功] 成功從樂透堂取得合法號碼: [${balls.join(',')}]`);

    // 比對日期並置入
    const idx = records.findIndex(r => r[0] === targetDate);
    if (idx !== -1) {
        // 如果是步驟 3，這裡會直接將原先的順球替換覆蓋成最新的落球
        records[idx] = [targetDate, balls];
        console.log(`[覆蓋] 已成功將 ${targetDate} 欄位內容覆蓋更新。`);
    } else {
        // 如果是步驟 1 或 2，直接在最前面新增一列
        records.unshift([targetDate, balls]);
        console.log(`[新增] 已成功在首列插入 ${targetDate} 的新紀錄。`);
    }

    // 嚴格落實您指定的「不得有空格」緊密字串格式
    let rows = records.map(r => `['${r[0]}',['${r[1].join("','")}']]`).join(',\n');
    let newContent = `var 7788 = [\n${rows}\n];\n`;

    try {
        fs.writeFileSync('./7788.js', newContent, 'utf8');
        console.log('【完美更新】7788.js 檔案緊密格式更新完成！');
    } catch (e) {
        console.error('寫入 7788.js 失敗:', e.message);
    }
}

function getNextDrawDate(dateStr) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    let yyyy = d.getFullYear();
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetch9800Table(targetDate, mode) {
    try {
        // 修正點 1：將原本的 http 改為加密安全的 https 連線，突破防火牆封鎖
        // 修正點 2：加上 10 秒超時限制防止卡死
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const res = await fetch('https://9800.com.tw', {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        clearTimeout(timeoutId);
        
        const text = await res.text();

        const dateIdx = text.indexOf(targetDate);
        if (dateIdx === -1) return null;

        const subText = text.substring(dateIdx, dateIdx + 500);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (!matches || matches.length < 10) return null;

        const [y, m, d] = targetDate.split('-');
        let validNums = [];
        
        for (let num of matches) {
            if (num !== m && num !== d && num !== y.slice(-2)) {
                validNums.push(num);
            }
        }

        if (validNums.length >= 10) {
            // 第四欄（落球）取前面 5 顆，第五欄（順球）取後面 5 顆
            const targetSet = mode === 'shun' ? validNums.slice(-5) : validNums.slice(-10, -5);
            if (targetSet.length === 5 && !targetSet.includes('00')) {
                return targetSet;
            }
        }

    } catch (e) {
        console.error('樂透堂連線或解析失敗:', e.message);
    }
    return null;
}

main();
