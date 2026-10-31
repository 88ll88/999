const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 7788.js 更新檢查...`);

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
    let topRecord = records[0];
    let topDate = topRecord[0];

    let targetDate = getTargetDrawDate();
    console.log(`目標日期: ${targetDate}，7788.js 首列日期: ${topDate}`);

    let lotteryData = await fetchLotteryRecord(targetDate);
    if (!lotteryData) {
        console.log(`[${targetDate}] 官方時尚未開獎或找不到資料。`);
        return;
    }

    let { drop, shun } = lotteryData;

    // 邏輯判斷：20:40 先用順球插入，21:00 用落球替換
    if (topDate < targetDate) {
        if (shun && shun.length === 5) {
            records.unshift([targetDate, shun]);
            console.log(`[20:40 階段] 插入順球新首列: ${targetDate} [${shun.join(',')}]`);
        } else {
            console.log(`[${targetDate}] 順球資料尚未備妥。`);
            return;
        }
    } else if (topDate === targetDate) {
        console.log(`[同日期] ${targetDate} 已存在於首列。`);
    } else {
        console.log('首列日期大於目標日期，無需更新。');
        return;
    }

    if (drop && drop.length === 5) {
        records[0][1] = drop;
        console.log(`[21:00 階段] 已將首列 ${targetDate} 替換為真正的落球序: [${drop.join(',')}]`);
    }

    let rows = records.map(r => {
        let dateStr = r[0];
        let ballsStr = r[1].map(n => `'${n}'`).join(',');
        return `['${dateStr}',[${ballsStr}]]`;
    }).join(',\n');

    let newContent = `var 7788 = [\n${rows}\n];\n`;
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log('7788.js 檔案更新完成！');
}

function getTargetDrawDate() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));

    let hours = twTime.getHours();
    let minutes = twTime.getMinutes();
    let totalMins = hours * 60 + minutes;

    if (totalMins < 1240) {
        twTime.setDate(twTime.getDate() - 1);
    }
    if (twTime.getDay() === 0) {
        twTime.setDate(twTime.getDate() - 1);
    }

    let yyyy = twTime.getFullYear();
    let mm = String(twTime.getMonth() + 1).padStart(2, '0');
    let dd = String(twTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchLotteryRecord(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();

        let dateIdx = text.indexOf(targetDate);
        if (dateIdx === -1) return null;

        const subText = text.substring(dateIdx, dateIdx + 1000);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        
        if (!matches || matches.length < 12) return null;

        let validBalls = matches.filter(n => {
            let num = parseInt(n, 10);
            return num >= 1 && num <= 39;
        });

        if (validBalls.length >= 10) {
            let drop = validBalls.slice(0, 5).map(n => n.padStart(2, '0'));
            let shun = validBalls.slice(5, 10).map(n => n.padStart(2, '0'));
            return { drop, shun };
        }
    } catch (e) {
        console.error('抓取發生錯誤:', e.message);
    }
    return null;
}

main();
