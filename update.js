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

    // 如果最上面那一筆包含無效號碼(00)，就覆蓋今天；否則計算下一天
    let targetDate = topDateStr;
    if (!records[0][1].includes('00')) {
        targetDate = getNextDrawDate(topDateStr);
    }

    console.log(`現有最新日期: ${topDateStr}，目標更新日期: ${targetDate}`);

    let balls = null;

    if (mode === 'shun') {
        console.log('正在嘗試抓取順球...');
        balls = await fetchShunQiu(targetDate);
    } else {
        console.log('正在嘗試抓取落球...');
        balls = await fetchLuoQiu(targetDate);
    }

    if (!balls || balls.length !== 5) {
        console.log(`[${targetDate}] 目前尚未抓到正確號碼。`);
        return;
    }

    console.log(`成功取得正確號碼: [${balls.join(',')}]`);

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
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    let yyyy = d.getFullYear();
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

// 精準過濾 01~39 的兩位號碼
function extract5Balls(htmlText, dateStr) {
    const dateIdx = htmlText.indexOf(dateStr);
    if (dateIdx === -1) return null;

    const subText = htmlText.substring(dateIdx, dateIdx + 2000);
    const matches = subText.match(/(?:0[1-9]|[12][0-9]|3[0-9])/g);
    if (matches) {
        const dateNumbers = dateStr.split(/[-/]/);
        let filtered = [];
        for (let num of matches) {
            if (filtered.length === 5) break;
            if (num !== dateNumbers[1] && num !== dateNumbers[2]) {
                filtered.push(num);
            }
        }
        if (filtered.length === 5) return filtered;
    }
    return null;
}

async function fetchShunQiu(targetDate) {
    try {
        const res = await fetch('https://www.pilio.idv.tw/lto539/');
        const text = await res.text();
        const dateMatch = targetDate.replace(/-/g, '/');
        return extract5Balls(text, dateMatch);
    } catch (e) {
        console.error('pilio 抓取失敗:', e.message);
    }
    return null;
}

async function fetchLuoQiu(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();
        const balls = extract5Balls(text, targetDate);
        if (balls) return balls;
    } catch (e) {}

    try {
        const res = await fetch('https://www.taiwanlottery.com/lotto/result/daily_cash');
        const text = await res.text();
        const balls = extract5Balls(text, targetDate);
        if (balls) return balls;
    } catch (e) {}

    return null;
}

main();
