const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '7788.js');

// 依時間判定目標日期 (20:35~24:00 為今天，00:00~20:35 為昨天)
function getTargetDate() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeVal = hours * 100 + minutes;

    let target = new Date();
    if (timeVal < 2035) {
        target.setDate(target.getDate() - 1);
    }
    return target.toISOString().split('T')[0];
}

async function runAutoUpdate() {
    console.log('🚀 開始執行 7788.js 安全更新邏輯...');

    try {
        const targetDate = getTargetDate();
        console.log(`📅 判定目標日期：${targetDate}`);

        // 模擬抓到的號碼
        const fetchedOrder = ['03', '09', '18', '27', '35']; // 順球×5
        const fetchedDrop = ['18', '03', '27', '09', '35'];  // 落球×5

        if (!fs.existsSync(targetFilePath)) {
            throw new Error('找不到 7788.js 檔案！');
        }

        const fileContent = fs.readFileSync(targetFilePath, 'utf8');
        
        // 嚴格解析：把 var ddd = 裡面的內容抓出來
        const match = fileContent.match(/var\s+ddd\s*=\s*(\[[\s\S]*\]);?/);
        if (!match || !match[1]) {
            throw new Error('嚴重錯誤：無法安全解析現有 7788.js 格式，為防洗掉資料，中止執行！');
        }

        let existingArray = JSON.parse(match[1]);
        if (!Array.isArray(existingArray)) {
            throw new Error('現有資料不是陣列格式，中止執行！');
        }

        console.log(`✅ 成功載入舊資料，目前共有 ${existingArray.length} 筆歷史紀錄。`);

        // 檢查首列是否已是目標日期
        const topRow = existingArray.length > 0 ? existingArray[0] : null;
        const isTopRowToday = topRow && topRow[0] === targetDate;

        let updated = false;

        if (!isTopRowToday) {
            // 【順球】：首列不是目標日期，插入新首列，其餘舊資料全部往後排
            if (fetchedOrder && fetchedOrder.length === 5) {
                existingArray.unshift([targetDate, fetchedOrder]);
                console.log(`✅ [順球] 成功將 ${targetDate} 插入首列，舊資料完美保留！`);
                updated = true;
            }
        } else {
            // 【落球】：首列已經是目標日期，直接原地替換成落球
            if (fetchedDrop && fetchedDrop.length === 5) {
                existingArray[0] = [targetDate, fetchedDrop];
                console.log(`✅ [落球] 首列已順利由順球替換為落球！`);
                updated = true;
            }
        }

        if (updated) {
            const outputContent = `var ddd = ${JSON.stringify(existingArray, null, 4)};\n`;
            fs.writeFileSync(targetFilePath, outputContent, 'utf8');
            console.log('✅ 7788.js 安全寫入完成！');
        } else {
            console.log('ℹ️ 無需更新。');
        }

    } catch (error) {
        console.error('❌ 執行失敗:', error.message);
        process.exit(1);
    }
}

runAutoUpdate();
