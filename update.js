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

    // 判斷首列狀態：長度為 2 代表只有日期和順球，還缺落球
    let needsLuoQiu = (topRecord.length === 2);

    let targetDate = topDate;
    if (!needsLuoQiu) {
        targetDate = getNextDrawDate(topDate);
    }

    console.log(`目標日期: ${targetDate}，當前狀態: ${needsLuoQiu ? '準備補抓落球' : '準備抓取新一期順球'}`);

    // 從 9800 抓取資料
    let data = await fetch9800Data(targetDate);
    if (!data || !data.shun || !data.luo || data.shun.length !== 5 || data.luo.length !== 5) {
        console.log(`[${targetDate}] 9800 尚未更新或資料不完全，放棄寫入。`);
        return;
    }

    if (needsLuoQiu) {
        // 補上落球
        topRecord.push(data.luo);
        console.log(`成功補上落球: [${data.luo.join(',')}]`);
    } else {
        // 新增首列順球
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
        const mingGuoYear = parseInt(y) - 1911; // 例如 2026 -> 115
        
        // 建立可能的日期搜尋字串 (例如 115/10/26 或 2026-10-26)
        const targets = [
            `${mingGuoYear}/${m}/${d}`,
            `${targetDate}`,
            `${mingGuoYear}-${m}-${d}`,
            `${parseInt(m)}/${parseInt(d)}` // 簡寫防呆
        ];

        let dateIdx = -1;
        for (let t of targets) {
            dateIdx = text.indexOf(t);
            if (dateIdx !== -1) {
                console.log(`成功配對到日期字串: ${t}`);
                break;
            }
        }

        if (dateIdx === -1) {
            console.log(`在 9800 網頁中找不到目標日期: ${targetDate}`);
            return null;
        }

        // 截取該日期之後的 HTML 範圍
        const subText = text.substring(dateIdx, dateIdx + 800);
        
        // 抓出文字中所有兩位數號碼 (01~39)
        const matches = subText.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);

        if (!matches || matches.length < 10) {
            console.log('抓到的有效數字不足');
            return null;
        }

        console.log(`9800 該區段抓到的數字: ${matches.join(',')}`);

        // 過濾掉剛好等於年月日或民國年的數字，留下純開獎號碼
        let cleanNums = matches.filter(num => 
            num !== m && 
            num !== d && 
            num !== String(mingGuoYear) && 
            num !== y.slice(-2)
        );

        console.log(`過濾後的純號碼: ${cleanNums.join(',')}`);

        if (cleanNums.length >= 10) {
            let shun = cleanNums.slice(0, 5);
            let luo = cleanNums.slice(5, 10);
            return { shun, luo };
        }

    } catch (e) {
        console.error('9800 抓取發生錯誤:', e.message);
    }
    return null;
}

main();
