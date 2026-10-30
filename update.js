const fs = require('fs');
const axios = require('axios');
const cheerio = require('cheerio');

// 設定資料檔名 (例如 zzz.js 或 ddd.js)
const DATA_FILE = './zzz.js';

async function fetchLatest539() {
  try {
    // 範例：從第三方資料源抓取 HTML 解析（可依實際目標網址調整 CSS selector）
    const response = await axios.get('https://9800.com.tw/lotto539/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'
      }
    });

    const $ = cheerio.load(response.data);
    
    // 假設抓取最新一期的日期與號碼（請依目標網頁結構調整 CSS Selector）
    const latestDate = $('.draw-date').first().text().trim(); // 例: "2026-10-30"
    const numbersText = $('.draw-numbers').first().text().trim(); // 例: "05, 12, 19, 23, 38"
    
    if (!latestDate || !numbersText) {
      console.log('未抓取到有效資料，請檢查 Selector');
      return null;
    }

    const numbers = numbersText.split(',').map(n => n.trim().padStart(2, '0'));

    return {
      date: latestDate,
      numbers: numbers // 順球或落球陣列
    };
  } catch (error) {
    console.error('抓取資料失敗:', error.message);
    return null;
  }
}

async function updateData() {
  const latestData = await fetchLatest539();
  if (!latestData) return;

  // 讀取現有 JS 資料檔
  let currentContent = '';
  if (fs.existsSync(DATA_FILE)) {
    currentContent = fs.readFileSync(DATA_FILE, 'utf-8');
  }

  // 判斷是否已經存在最新日期，避免重複寫入
  if (currentContent.includes(latestData.date)) {
    console.log(`[${latestData.date}] 資料已是最新，無需更新。`);
    return;
  }

  console.log(`發現新開獎資料 [${latestData.date}]:`, latestData.numbers);

  // 格式化新資料並追加/更新至檔案
  // 假設檔案格式為 var lottoData = [...]; 或純 JSON 陣列
  const newEntry = `  { "date": "${latestData.date}", "numbers": [${latestData.numbers.map(n => `"${n}"`).join(', ')}] },\n`;

  // 簡易寫入示範（若寫入 .js 檔頭，可根據你的變數宣告格式調整）
  if (currentContent.includes('[')) {
    const updatedContent = currentContent.replace('[', '[\n' + newEntry);
    fs.writeFileSync(DATA_FILE, updatedContent, 'utf-8');
  } else {
    fs.writeFileSync(DATA_FILE, `var lottoData = [\n${newEntry}];`, 'utf-8');
  }

  console.log('檔案更新成功！');
}

updateData();
