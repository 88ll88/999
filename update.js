const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始執行 7788.js 自動更新檢查...`);

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

    // 判斷首列狀態：長度為 2 代表只有 [日期, [順球]]，還缺落球
    let needsLuoQiu = (topRecord.length === 2);

    let targetDate = topDate;
    if (!needsLuoQiu) {
        targetDate = getNextDrawDate(topDate);
    }

    console.log(`目標日期: ${targetDate}，目前狀態: ${needsLuoQiu ? '補抓落球(複製順球)' : '抓取新一期順球'}`);

    if (needsLuoQiu) {
        // 第二階段：直接複製當前首列的順球作為落球
        let existingShun = topRecord[1];
        topRecord.push([...existingShun]);
        console.log(`成功將順球複製並補上落球: [${existingShun.join(',')}]`);
    } else {
        // 第一階段：抓取新一期順球
        let shun = await fetch9800Shun(targetDate);
        if (!shun || shun.length !== 5) {
            console.log(`[${targetDate}] 9800 順球尚未更新或資料不完全，放棄寫入。`);
            return;
        }
        records.unshift([targetDate, shun]);
        console.log(`成功寫入順球首列: [${shun.join(',')}]`);
    }

    // 嚴格格式化輸出
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

function getNextDrawDate(dateStr) {
    let d = new Date(dateStr);
    d.setDate(d.getDate() + 1);
    if (d.getDay() === 0) d.setDate(d.getDate() + 1);
    let yyyy = d.getFullYear();
    let mm = String(d.getMonth() + 1).padStart(2, '0');
    let dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

async function fetch9800Shun(targetDate) {
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

        if (dateIdx === -1) {
            console.log(`找不到目標日期: ${targetDate}`);
            return null;
        }

        const subText = text.substring(dateIdx, dateIdx + 500);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);

        if (!matches || matches.length < 8) return null;

        let mIdx = matches.indexOf(m);
        let dIdx = matches.indexOf(d, mIdx + 1);

        if (dIdx !== -1 && matches.length >= dIdx + 6) {
            // 只抓取日期後緊接著的 5 個順球
            let shun = matches.slice(dIdx + 1, dIdx + 6);
            console.log(`成功抓取順球: [${shun.join(',')}]`);

            if (shun.length === 5 && !shun.includes('00')) {
                return shun;
            }
        }
    } catch (e) {
        console.error('9800 抓取發生錯誤:', e.message);
    }
    return null;
}

main();
