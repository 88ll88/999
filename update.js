const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

async function updateLotto() {
    const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    console.log(`\n========================================`);
    console.log(`[${timestamp}] 🚀 開始執行今彩539自動更新作業`);
    console.log(`========================================`);

    try {
        const url = 'https://lotto2.arclink.com.tw/539/539open-1.html';
        console.log(`[步驟 1/3] 正在連線至開獎網站: ${url}`);
        
        // 設定 maxRedirects: 0 以便捕捉 307 轉址的真實去向
        const response = await axios.get(url, {
            maxRedirects: 0,
            validateStatus: function (status) {
                return status >= 200 && status < 400; // 允許 2xx 與 3xx
            }
        });

        console.log(`[步驟 1/3] 連線成功！伺服器回應狀態碼: ${response.status}`);

        const $ = cheerio.load(response.data);
        const numbers = [];
        
        // 尋找開獎號碼
        $('tr').first().find('td').each((i, el) => {
            const num = $(el).text().trim();
            if (num) numbers.push(num);
        });

        console.log(`[步驟 2/3] 解析網頁完成，抓到的號碼陣列:`, numbers);

        if (numbers.length !== 5) {
            console.log(`❌ 【更新失敗】找不到 5 個號碼（目前抓到 ${numbers.length} 個），可能網頁結構有變或尚未開獎。`);
            return;
        }

        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
        const newEntry = `['${today}',['${numbers.join("','")}']]`;
        console.log(`[步驟 2/3] 今日日期: ${today}，組合資料格式: ${newEntry}`);

        // 寫入 vvv.js
        console.log(`[步驟 3/3] 正在寫入 vvv.js...`);
        updateFile('vvv.js', newEntry, today);

        console.log(`========================================`);
        console.log(`[${timestamp}] 🎉 全部更新作業圓滿完成！`);
        console.log(`========================================\n`);

    } catch (error) {
        console.error(`\n❌ 【錯誤發生】無法順利取得網頁：`, error.message);
        
        // 如果遇到 307 或其他轉址錯誤，印出轉址目標
        if (error.response) {
            console.error(`伺服器回應狀態碼: ${error.response.status}`);
            if (error.response.headers && error.response.headers.location) {
                console.error(`📍 發現轉址目標 (Location): ${error.response.headers.location}`);
            }
        }
    }
}

function updateFile(filePath, newEntry, today) {
    if (!fs.existsSync(filePath)) {
        console.log(`⚠️ 提示：找不到 ${filePath} 檔案，跳過寫入。`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');

    if (content.includes(today)) {
        console.log(`✨ 檢查：${filePath} 已經包含今天的日期 (${today})，不需要重複更新。`);
        return;
    }

    let updatedContent = '';
    if (content.includes('var vvv = [')) {
        updatedContent = content.replace('var vvv = [', `var vvv = [\n    ${newEntry},`);
    } else {
        updatedContent = content.replace(/=\s*\[/, `= [\n    ${newEntry},`);
    }

    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`✅ 成功：${filePath} 已成功將今日開獎號碼寫入首列！`);
}

updateLotto();
