const fs = require('fs');

const mode = process.argv[2] || 'luo';

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行更新，模式: ${mode}`);

    let content = '';
    try {
        content = fs.readFileSync('./7788.js', 'utf8');
    } catch (e) {
        console.error('無法讀取 7788.js:', e.message);
        process.exit(1);
    }

    const match = content.match(/var\s+7788\s*=\s*(\[[\s\S]*\]);?/);
    if (!match) {
        console.error('7788.js 格式解析失敗');
        process.exit(1);
    }

    let records = eval('(' + match[1] + ')');
    let topDateStr = records[0][0];

    let targetDate = getNextDrawDate(topDateStr);
    console.log(`現有最新日期: ${topDateStr}，目標更新日期: ${targetDate}`);

    let balls = null;

    if (mode === 'shun') {
        console.log('正在嘗試抓取順球...');
        balls = await fetchShunQiu(targetDate);
    } else {
        console.log('正在嘗試抓取落球 (以台彩官網為優先)...');
        balls = await fetchLuoQiu(targetDate);
    }

    if (!balls || balls.length !== 5) {
        console.log(`[${targetDate}] 目前所有備援網站都尚未抓到號碼，可能尚未開獎。`);
        return;
    }

    console.log(`成功取得號碼: [${balls.join(',')}]`);

    const idx = records.findIndex(r => r[0] === targetDate);
    if (idx !== -1) {
        records[idx] = [targetDate, balls];
        console.log(`覆蓋原有 ${targetDate} 資料`);
    } else {
        records.unshift([targetDate, balls]);
        console.log(`新增 ${targetDate} 資料至最上方`);
    }

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

// 順球網站
async function fetchShunQiu(targetDate) {
    try {
        console.log('嘗試來源: pilio (idv.tw)');
        const res = await fetch('https://www.pilio.idv.tw/lto539/');
        const text = await res.text();
        const cleanText = text.replace(/\s+/g, '');
        const dateMatch = targetDate.replace(/-/g, '/');
        if (cleanText.includes(dateMatch)) {
            const regex = new RegExp(dateMatch + '[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})');
            const m = text.match(regex);
            if (m) return [m[1], m[2], m[3], m[4], m[5]];
        }
    } catch (e) {
        console.error('pilio 抓取失敗:', e.message);
    }
    return null;
}

// 落球網站（已將台灣彩券官網改為第一優先）
async function fetchLuoQiu(targetDate) {
    // 優先站點 1: 台灣彩券官網 daily_cash
    try {
        console.log('嘗試來源 1: 台灣彩券官方');
        const res = await fetch('https://www.taiwanlottery.com/lotto/result/daily_cash');
        const text = await res.text();
        if (text.includes(targetDate)) {
            const regex = new RegExp(targetDate + '[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})[\\s\\S]*?(\\d{2})');
            const m = text.match(regex);
            if (m) return [m[1], m[2], m[3], m[4], m[5]];
        }
    } catch (e) {
        console.log('台灣彩券官網抓取失敗，切換備援...');
    }

    // 備援站點 2: 9800.com.tw
    try {
        console.log('嘗試來源 2: 9800.com.tw');
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();
        if (text.includes(targetDate)) {
            const regex = new RegExp(targetDate + '[\\s\\S]*?(\\d{2}),(\\d{2}),(\\d{2}),(\\d{2}),(\\d{2})');
            const m = text.match(regex);
            if (m) return [m[1], m[2], m[3], m[4], m[5]];
        }
    } catch (e) {
        console.log('9800 抓取失敗...');
    }

    return null;
}

main();
