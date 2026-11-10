const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

async function updateLotto() {
    try {
        const url = 'https://lotto2.arclink.com.tw/539/539open-1.html';
        const response = await axios.get(url);
        const $ = cheerio.load(response.data);

        // 尋找包含開獎號碼的第一個 tr 內的 td
        const numbers = [];
        $('tr').first().find('td').each((i, el) => {
            const num = $(el).text().trim();
            if (num) numbers.push(num);
        });

        if (numbers.length !== 5) {
            console.log('無法正確取得 5 個開獎號碼');
            return;
        }

        // 取得今天的日期 (YYYY-MM-DD 格式)
        const today = new Date().toISOString().split('T')[0];
        const newEntry = `['${today}',['${numbers.join("','")}']]`;

        // 更新 vvv.js
        updateFile('vvv.js', newEntry, today);
        // 更新 ddd.js
        updateFile('ddd.js', newEntry, today);

    } catch (error) {
        console.error('更新失敗:', error);
    }
}

function updateFile(filePath, newEntry, today) {
    if (!fs.existsSync(filePath)) {
        console.log(`${filePath} 不存在`);
        return;
    }

    let content = fs.readFileSync(filePath, 'utf8');

    // 檢查今天是否已經更新過
    if (content.includes(today)) {
        console.log(`${filePath} 今天已經更新過了`);
        return;
    }

    // 將新資料插入到 var vvv = [ 之後的首列
    const target = 'var vvv = [';
    // 兼容 ddd.js 如果變數名稱不同，可自行調整或用正規表達式
    const targetDdd = 'var ddd = ['; 
    
    let updatedContent = '';
    if (content.includes('var vvv = [')) {
        updatedContent = content.replace('var vvv = [', `var vvv = [\n    ${newEntry},`);
    } else if (content.includes('var ddd = [')) {
        updatedContent = content.replace('var ddd = [', `var ddd = [\n    ${newEntry},`);
    } else {
        // 通用替換第一個陣列宣告
        updatedContent = content.replace(/=\s*\[/, `= [\n    ${newEntry},`);
    }

    fs.writeFileSync(filePath, updatedContent, 'utf8');
    console.log(`${filePath} 更新成功！`);
}

updateLotto();
