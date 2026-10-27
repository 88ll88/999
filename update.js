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

    // 判斷首列狀態：
    // 如果 topRecord 只有 2 個元素 [日期, [順球]]，代表還缺落球
    let needsLuoQiu = (topRecord.length === 2);

    let targetDate = topDate;
    if (!needsLuoQiu) {
        // 如果已經完整（有順有落），則計算下一期目標日期來寫「新的一期順球」
        targetDate = getNextDrawDate(topDate);
    }

    console.log(`目標日期: ${targetDate}，當前狀態: ${needsLuoQiu ? '已有順球，準備補抓落球' : '準備抓取新一期順球'}`);

    // 從 9800 抓取該日期的順球與落球
    let data = await fetch9800Data(targetDate);
    if (!data || !data.shun || !data.luo || data.shun.length !== 5 || data.luo.length !== 5) {
        console.log(`[${targetDate}] 9800 尚未更新或資料不完全，放棄寫入。`);
        return;
    }

    if (needsLuoQiu) {
        // 情況 2：已經有順球，把落球補進去，完成該日期的封口
        topRecord.push(data.luo);
        console.log(`成功補上落球: [${data.luo.join(',')}]`);
    } else {
        // 情況 1：還沒有當天資料，先將「順球」寫進首列
        records.unshift([targetDate, data.shun]);
        console.log(`成功寫入順球首列: [${data.shun.join(',')}]`);
    }

    // 組合輸出格式
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
    if (d.getDay() === 0) d.setDate(d.getDate() + 1); // 略過週日
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

        const subText = text.substring(dateIdx, dateIdx + 500);
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);

        if (!matches || matches.length < 10) return null;

        let mIdx = matches.indexOf(m);
        let dIdx = matches.indexOf(d, mIdx + 1);

        if (dIdx !== -1 && matches.length >= dIdx + 11) {
            let shun = matches.slice(dIdx + 1, dIdx + 6); // 順球
            let luo = matches.slice(dIdx + 6, dIdx + 11); // 落球
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
