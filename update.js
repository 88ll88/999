const fs = require('fs');
const path = require('path');

const targetFilePath = path.join(__dirname, '7788.js');

// 取得依據時間點判斷的目標日期 (20:35~24:00為今天，00:00~20:35為昨天)
function getTargetDate() {
    const now = new Date();
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const timeVal = hours * 100 + minutes; // 例如 2035

    let target = new Date();
    // 20:35 (2035) 之前算昨天
    if (timeVal < 2035) {
        target.setDate(target.getDate() - 1);
    }
    return target.toISOString().split('T')[0];
}

async function runAutoUpdate() {
    console.log('🚀 開始執行 7788.js 智慧更新與時間判定邏輯...');

    try {
        const targetDate = getTargetDate();
        console.log(`📅 判定目標開獎日期：${targetDate}`);

        // 模擬抓到的號碼（正式環境可替換為你的來源）
        const fetchedOrder = ['03', '09', '18', '27', '35']; // 順球×5
        const fetchedDrop = ['18', '03', '27', '09', '35'];  // 落球×5

        // 1. 讀取現有的 7788.js 檔案內容
        let existingArray = [];
        if (fs.existsSync(targetFilePath)) {
            const fileContent = fs.readFileSync(targetFilePath, 'utf8');
            try {
                const jsonStr = fileContent.replace(/^[\s\S]*?=\s*/, '').replace(/;\s*$/, '');
                existingArray = JSON.parse(jsonStr);
            } catch (e) {
                console.log('⚠️ 現有 7788.js 解析失敗，將初始化為空陣列。');
                existingArray = [];
            }
        }

        // 2. 檢查首列是否已是目標日期
        const topRow = existingArray.length > 0 ? existingArray[0] : null;
        const isTopRowToday = topRow && topRow[0] === targetDate;

        let updated = false;

        if (!isTopRowToday) {
            // 首列不是目標日期 ➡️ 順球若行，插入首列
            if (fetchedOrder && fetchedOrder.length === 5) {
                existingArray.unshift([targetDate, fetchedOrder]);
                console.log(`✅ [順球階段] 成功將 ${targetDate} 順球插入首列！`);
                updated = true;
            }
        } else {
            // 首列已經是目標日期，檢查是否需要進行落球覆蓋
            // 假設首列目前內容剛好是順球，若落球若行則替換
            if (fetchedDrop && fetchedDrop.length === 5) {
                existingArray[0] = [targetDate, fetchedDrop];
                console.log(`✅ [落球階段] 首列已順利由順球替換為落球！`);
                updated = true;
            }
        }

        if (updated) {
            // 3. 寫回 7788.js 檔案，維持 var ddd = [...] 格式
            const outputContent = `var ddd = ${JSON.stringify(existingArray, null, 4)};\n`;
            fs.writeFileSync(targetFilePath, outputContent, 'utf8');
            console.log('✅ 7788.js 檔案寫入完成！');
        } else {
            console.log('ℹ️ 目前條件未達成或已是最新狀態，無需更新。');
        }

    } catch (error) {
        console.error('❌ 執行發生錯誤：', error.message);
        process.exit(1);
    }
}

runAutoUpdate();
