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

    // 如果最上面那一筆包含 00 或 NaN，就把它當作錯誤資料覆蓋掉；否則計算下一天
    let targetDate = topDateStr;
    if (!records[0][1].includes('00') && !records[0][1].includes('NaN')) {
        targetDate = getNextDrawDate(topDateStr);
    }

    console.log(`現有最新日期: ${topDateStr}，目標更新日期: ${targetDate}`);

    let balls = null;
    if (mode === 'shun') {
        balls = await fetchShunQiu(targetDate);
    } else {
        balls = await fetchLuoQiu(targetDate);
    }

    // 嚴格檢查：必須剛好 5 個號碼，且絕對不能包含 '00' 或空值
    if (!balls || balls.length !== 5 || balls.includes('00') || balls.includes('NaN')) {
        console.log(`[${targetDate}] 抓到的號碼不合法或包含 00，放棄寫入以保護資料。`);
        return;
    }

    console.log(`成功取得合法號碼: [${balls.join(',')}]`);

    const idx = records.findIndex(r => r[0] === targetDate);
    if (idx !== -1) {
        records[idx] = [targetDate, balls];
    } else {
        records.unshift([targetDate, balls]);
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

async function fetchShunQiu(targetDate) {
    try {
        const res = await fetch('https://www.pilio.idv.tw/lto539/');
        const text = await res.text();
        return extractValidBalls(text, targetDate);
    } catch (e) {}
    return null;
}

async function fetchLuoQiu(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();
        const balls = extractValidBalls(text, targetDate);
        if (balls) return balls;
    } catch (e) {}

    try {
        const res = await fetch('https://www.taiwanlottery.com/lotto/result/daily_cash');
        const text = await res.text();
        const balls = extractValidBalls(text, targetDate);
        if (balls) return balls;
    } catch (e) {}

    return null;
}

// 超嚴格過濾：只接受 01~39，且過濾掉 00 和日期數字
function extractValidBalls(htmlText, dateStr) {
    const dateIdx = htmlText.indexOf(dateStr);
    if (dateIdx === -1) return null;

    const subText = htmlText.substring(dateIdx, dateIdx + 400);
    const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
    
    if (!matches) return null;

    let validBalls = [];
    const [y, m, d] = dateStr.split(/[-/]/);

    for (let num of matches) {
        // 絕對排除 '00'、年、月、日
        if (num !== '00' && num !== m && num !== d && num !== y.slice(-2)) {
            if (!validBalls.includes(num)) {
                validBalls.push(num);
            }
        }
        if (validBalls.length === 5) break;
    }

    return validBalls.length === 5 ? validBalls : null;
}

main();
