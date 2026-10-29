const axios = require('axios');
const cheerio = require('cheerio');

async function updateLotteryData() {
  try {
    const url = 'https://ctbcbank.com';
    
    // 1. 發送請求取得網頁 HTML（設定回應編碼，避免中文字亂碼）
    const { data } = await axios.get(url, { responseType: 'text' });
    const $ = cheerio.load(data);

    // ====== 範例：抓取「今彩539」（對應網頁中的區塊） ======
    // 依據中信網頁結構，尋找包含 "今彩539" 文本的表格或元素
    let lotteryData = {
      game: '今彩539',
      issue: '',        // 期別
      date: '',         // 開獎日期
      sizeOrder: [],    // 依大小順序
      drawOrder: []     // 依開出順序
    };

    // 尋找包含今彩539的表格（此處以文字定位作為保險手段）
    $('table').each((index, element) => {
      const tableText = $(element).text();
      
      if (tableText.includes('今彩539') && tableText.includes('依大小順序排列')) {
        // 提取期別 (例如：第 115000262 期)
        const issueMatch = tableText.match(/第\s*(\d+)\s*期/);
        if (issueMatch) lotteryData.issue = issueMatch[1];

        // 提取開獎日期 (例如：民國 115 年 10 月 29 日)
        const dateMatch = tableText.match(/民國\s*(\d+\s*年\s*\d+\s*月\s*\d+\s*日)/);
        if (dateMatch) lotteryData.date = `民國 ${dateMatch[1].replace(/\s+/g, '')}`;

        // 精準抓取號碼欄位
        // 依大小順序排列的號碼
        $(element).find('td:contains("依大小順序排列")').nextAll('td').each((i, td) => {
          const num = $(td).text().trim();
          if (num && !isNaN(num) && lotteryData.sizeOrder.length < 5) {
            lotteryData.sizeOrder.push(num);
          }
        });

        // 依開出順序排列的號碼
        $(element).find('td:contains("依開出順序排列")').nextAll('td').each((i, td) => {
          const num = $(td).text().trim();
          if (num && !isNaN(num) && lotteryData.drawOrder.length < 5) {
            lotteryData.drawOrder.push(num);
          }
        });
      }
    });

    console.log('--- 抓取成功結果 ---');
    console.log(`遊戲：${lotteryData.game}`);
    console.log(`期別：第 ${lotteryData.issue} 期`);
    console.log(`日期：${lotteryData.date}`);
    console.log(`依大小順序：`, lotteryData.sizeOrder);
    console.log(`依開出順序：`, lotteryData.drawOrder);

    // 2. 在這裡可以接著把 lotteryData 寫入你的 7788.js 或 data.json
    // const fs = require('fs');
    // fs.writeFileSync('7788.json', JSON.stringify(lotteryData, null, 2));

  } catch (error) {
    console.error('更新資料時發生錯誤:', error.message);
  }
}

updateLotteryData();
