const fs = require('fs');

async function updateLotto() {
    const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    console.log(`\n[${timestamp}] 🚀 開始執行今彩539更新作業...`);

    try {
        // 如果抓不到網頁，這裡可以先用固定的測試號碼或您自行指定的號碼寫入
        const numbers = ['33', '30', '07', '09', '28'];
        
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
        const newEntry = `['${today}',['${numbers.join("','")}']]`;
        
        console.log(`[成功] 今日日期: ${today}，號碼組合: ${newEntry}`);

        updateFile('vvv.js', newEntry, today);

    } catch (error) {
        console.error(`❌ 【錯誤】更新失敗：`, error.message);
    }
}

function updateFile(filePath, newEntry, today) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ 找不到 ${filePath} 檔案，跳過寫入。`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes(today)) {
        console.log(`✨ ${filePath} 今天已經更新過了，無需重複寫入。`);
        return;
    }

    let updatedContent = '';
    if (content.includes('var vvv = [')) {
        updatedContent = content.replace('var vvv = [', `var vvv = [\n    ${newEntry},`);
    } else {
        updatedContent = content.replace(/=\s*\[/, `= [\n    ${newEntry},`);
    }

    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✅ ${filePath} 寫入成功！`);
}

updateLotto();
```[cite: 5]

<ElicitationsGroup message="請選擇下一步操作：">
  <Elicitation label="使用這支直接寫入的程式碼來完成自動更新測試" query="請教如何將這支直接寫入的 update.js 部署到 GitHub 測試。"/>
  <Elicitation label="徹底放棄這個爬蟲，改用手動或別的方式" query="我想放棄這個自動爬蟲，請問有其他簡單的替代方案嗎？"/>
</ElicitationsGroup>
