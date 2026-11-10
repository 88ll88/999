const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');
const iconv = require('iconv-lite');

async function updateLotto() {
    const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    console.log(`\n[${timestamp}] 🚀 開始執行今彩539自動更新作業...`);

    try {
        const url = 'https://lotto2.arclink.com.tw/539/539open-1.html';
        
        const response = await axios.get(url, {
            responseType: 'arraybuffer',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        });

        const html = iconv.decode(Buffer.from(response.data), 'big5');
        const $ = cheerio.load(html);

        const numbers = [];
        $('td').each((i, el) => {
            const num = $(el).text().trim();
            if (/^\d{2}$/.test(num)) {
                numbers.push(num);
            }
        });

        if (numbers.length < 5) {
            console.log(`❌ 【失敗】抓到的號碼不足 5 個（目前 ${numbers.length} 個）`);
            return;
        }

        const finalNumbers = numbers.slice(0, 5);
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
        const newEntry = `['${today}',['${finalNumbers.join("','")}']]`;
        
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
