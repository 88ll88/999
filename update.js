const fs = require('fs');

async function main() {
    console.log(`[${new Date().toISOString()}] 開始自動檢查 7788.js 更新...`);

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

    let needsLuoQiu = (topRecord.length === 2);

    let targetDate = topDate;
    if (!needsLuoQiu) {
        targetDate = getNextDrawDate(topDate);
    }

    console.log(`目標日期: ${targetDate}，當前狀態: ${needsLuoQiu ? '已有順球，準備補抓落球' : '準備抓取新一期順球'}`);

    let data = await fetch9800Data(targetDate);
    if (!data || !data.shun || !data.luo || data.shun.length !== 5 || data.luo.length !== 5) {
        console.log(`[${targetDate}] 9800 尚未更新或資料不完全，放棄寫入。`);
        return;
    }

    if (needsLuoQiu) {
        topRecord.push(data.luo);
        console.log(`成功補上落球: [${data.luo.join(',')}]`);
    } else {
        records.unshift([targetDate, data.shun]);
        console.log(`成功寫入順球首列: [${data.shun.join(',')}]`);
    }

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

async function fetch9800Data(targetDate) {
    try {
        const res = await fetch('http://www.9800.com.tw/lotto539/drop.html');
        const text = await res.text();

        const [y, m, d] = targetDate.split('-');
        const mingGuoYear = parseInt(y) - 1911;
        const targetStr1 = `${mingGuoYear}/${m}/${d}`;
        const targetStr2 = `${targetDate}`;

        let dateIdx = text.indexOf(targetStr1);
        if (dateIdx === -1) {
            dateIdx = text.indexOf(targetStr2);
        }
        if (dateIdx === -1) {
            console.log(`找不到目標日期: ${targetDate}`);
            return null;
        }

        const subText = text.substring(dateIdx, dateIdx + 600);
        // 抓出所有 2 位數號碼
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);

        if (!matches || matches.length < 15) return null;

        console.log(`9800 抓到的原始數字流: ${matches.join(',')}`);

        // 在 9800 的 drop.html 表格中：
        // 通常該行會有：期數、年、月、日，接著是 5 個順球，再接著 5 個落球
        let mIdx = matches.indexOf(m);
        let dIdx = matches.indexOf(d, mIdx + 1);

        if (dIdx !== -1 && matches.length >= dIdx + 11) {
            // 嚴格對應：順球為緊接日期的前 5 個有效號碼，落球為隨後的 5 個有效號碼
            let shun = matches.slice(dIdx + 1, dIdx + 6);
            let luo = matches.slice(dIdx + 6, dIdx + 11);

            console.log(`精準解析 -> 順球: [${shun.join(',')}] | 落球: [${luo.join(',')}]`);

            if (shun.length === 5 && luo.length === 5 && !shun.includes('00') && !luo.includes('00')) {
                return { shun, luo };
            }
        }
    } catch (e) {
        console.error('9800 抓取發生錯誤:', e.message);
    }
    return null;
}

main();
