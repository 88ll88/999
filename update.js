const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 7788.js 規則更新檢查...`);

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

    // 依據時間規則判定最新已開獎日期
    let targetDate = getTargetDrawDate();
    console.log(`計算出的目標已開獎日期: ${targetDate}，7788.js 首列日期: ${topDate}`);

    // 從官方或 nfd 抓取資料
    let lottoData = await fetchLotteryData(targetDate);
    if (!lottoData) {
        console.log(`[${targetDate}] 官方尚未開獎或資料抓取失敗，放棄寫入。`);
        return;
    }

    // 判斷首列狀態
    // 若首列日期小於目標日期（落後兩期以上）
    if (topDate < targetDate) {
        // 插入完整資料 [日期, [順球], [落球]]
        records.unshift([targetDate, lottoData.shun, lottoData.luo]);
        console.log(`[兩期以上未更新] 成功插入新列: ${targetDate}`);
    } 
    else if (topDate === targetDate) {
        // 若首列剛好是目標日期，檢查是否缺落球（長度為 2 代表只有順球）
        if (topRecord.length === 2) {
            // 替換/補上落球
            topRecord.push(lottoData.luo);
            console.log(`[一期未更新-補落球] 成功為 ${targetDate} 補上落球: [${lottoData.luo.join(',')}]`);
        } else {
            console.log(`[${targetDate}] 該期已完整包含順落球，無需重複更新。`);
            return;
        }
    } else {
        console.log('首列日期大於目標日期，無需更新。');
        return;
    }

    // 嚴格格式化輸出（確保無多餘空格）
    let rows = records.map(r => {
        let dateStr = r[0];
        let shunStr = r[1].map(n => `'${n}'`).join(',');
        if (r.length === 3) {
            let luoStr = r[2].map(n => `'${n}'`).join(',');
            return `['${dateStr}',[${shunStr}],[${luoStr}]]`;
        } else {
            return `['${dateStr}',[${shunStr}]]`;
        }
    }).join(',\n');

    let newContent = `var 7788 = [\n${rows}\n];\n`;
    fs.writeFileSync('./7788.js', newContent, 'utf8');
    console.log('7788.js 檔案更新完成！');
}

// 時間判定邏輯：
// 20:40 至 00:00 -> 今天
// 00:00 至 20:40 -> 昨天 (若周日則往前推)
function getTargetDrawDate() {
    let now = new Date();
    // 轉換為台灣時間 (UTC+8)
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));

    let hours = twTime.getHours();
    let minutes = twTime.getMinutes();
    let totalMins = hours * 60 + minutes;

    // 20:40 = 20 * 60 + 40 = 1240 分鐘
    if (totalMins < 1240) {
        twTime.setDate(twTime.getDate() - 1);
    }

    // 周日休息，若剛好是周日則再往前一天 (依您的需求調整)
    if (twTime.getDay() === 0) {
        twTime.setDate(twTime.getDate() - 1);
    }

    let yyyy = twTime.getFullYear();
    let mm = String(twTime.getMonth() + 1).padStart(2, '0');
    let dd = String(twTime.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetchLotteryData(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();

        const [y, m, d] = targetDate.split('-');
        const mingGuoYear = parseInt(y) - 1911;
        
        const targets = [
            `${mingGuoYear}/${m}/${d}`,
            `${targetDate}`,
            `${mingGuoYear}-${m}-${d}`
        ];

        let dateIdx = -1;
        for (let t of targets) {
            dateIdx = text.indexOf(t);
            if (dateIdx !== -1) break;
        }

        if (dateIdx === -1) return null;

        const subText = text.substring(dateIdx, dateIdx + 700);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);

        if (!matches || matches.length < 12) return null;

        let mIdx = matches.indexOf(m);
        let dIdx = matches.indexOf(d, mIdx + 1);

        if (dIdx !== -1 && matches.length >= dIdx + 11) {
            let shun = matches.slice(dIdx + 1, dIdx + 6);
            let luo = matches.slice(dIdx + 6, dIdx + 11);

            if (shun.length === 5 && luo.length === 5 && !shun.includes('00') && !luo.includes('00')) {
                return { shun, luo };
            }
        }
    } catch (e) {
        console.error('抓取發生錯誤:', e.message);
    }
    return null;
}

main();
