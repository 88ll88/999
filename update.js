const fs = require('fs');

// 自動判斷目前要抓 順球 還是 落球
// 也可以由外部帶參數 node update.js shun 或 node update.js luo
const mode = process.argv[2] || 'luo';

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行更新，模式: ${mode}`);

    // 1. 讀取現有 7788.js
    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        console.error('無法讀取 7788.js:', e.message);
        process.exit(1);
    }

    // 解析歷史資料
    const match = content.match(/var\s+7788\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) {
        console.error('7788.js 格式解析失敗');
        process.exit(1);
    }

    let records = eval('(' + match[1] + ')');
    let topDateStr = records[0][0];

    // 2. 計算目標日期（最上方日期的下一天，若是週日則自動順延到週一）
    let targetDate = getNextDrawDate(topDateStr);
    console.log(`現有最新日期: ${topDateStr}，目標更新日期: ${targetDate}`);

    // 3. 抓取開獎號碼
    let balls = null;
    if (mode === 'shun') {
        console.log('正在從 pilio 抓取順球...');
        balls = await fetchPilioShunQiu(targetDate);
    } else {
        console.log('正在從 台灣彩券 / 9800 抓取落球...');
        balls = await fetchLuoQiu(targetDate);
    }

    if (!balls || balls.length !== 5) {
        console.log(`[${targetDate}] 尚未抓到號碼，可能尚未開獎。`);
        return;
    }

    console.log(`成功取得號碼: [${balls.join(',')}]`);

    // 4. 更新歷史資料（若該日期已存在則覆蓋，不存在則插在最上方）
    const idx = records.findIndex(r => r[0] === targetDate);
    if (idx !== -1) {
        records[idx] = [targetDate, balls];
        console.log(`覆蓋原有 ${targetDate} 資料`);
    } else {
        records.unshift([targetDate, balls]);
        console.log(`新增 ${targetDate} 資料至最上方`);
    }

    // 5. 寫回 7788.js 檔案
    let rows = records.map(r => `['${r[0]}',['${r[1].join("','")}']]`).join(',\n');
    let newContent = `var 7788 = [\n${rows}\n];\n`;

    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log('7788.js 檔案更新完成！');
}

function getNextDrawDate(dateStr) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // 週日跳過
    let yyyy = d.getFullYear();
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchPilioShunQiu(targetDate) {
    try {
        const res = await fetch('https://www.pilio.idv.tw/lto539/');
        const text = await res.text();
        // 解析 pilio 網頁邏輯
        const cleanText = text.replace(/\s+/g, '');
        const dateMatch = targetDate.replace(/-/g, '/');
        if (cleanText.includes(dateMatch)) {
            // 從包含該日期的區塊擷取 5 個號碼
            const regex = new RegExp(dateMatch + '[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})');
            const m = text.match(regex);
            if (m) return [m[1], m[2], m[3], m[4], m[5]];
        }
    } catch (e) {
        console.error('抓取 pilio 失敗:', e.message);
    }
    return null;
}

async function fetchLuoQiu(targetDate) {
    // 優先從 9800 抓取落球
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();
        if (text.includes(targetDate)) {
            const regex = new RegExp(targetDate + '[\\s\\S]*?(\\d{2}),(\\d{2}),(\\d{2}),(\\d{2}),(\\d{2})');
            const m = text.match(regex);
            if (m) return [m[1], m[2], m[3], m[4], m[5]];
        }
    } catch (e) {
        console.error('抓取 9800 失敗:', e.message);
    }
    return null;
}

main();
