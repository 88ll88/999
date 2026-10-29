async function updateLotteryData() {
  try {
    const url = 'https://ctbcbank.com';
    
    // 加上常見的瀏覽器 User-Agent 標頭，防止被伺服器阻擋
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP 錯誤！狀態碼: ${response.status}`);
    }

    const htmlText = await response.text();

    let lotteryData = {
      game: '39樂合彩',
      issue: '',
      date: '',
      sizeOrder: [],
      drawOrder: []
    };

    // 檢查網頁內容是否包含關鍵字
    if (htmlText.includes('39樂合彩')) {
      // 1. 提取期別 (例如：第 115000262 期)
      const issueMatch = htmlText.match(/第\s*(\d+)\s*期/);
      if (issueMatch) lotteryData.issue = issueMatch[1];

      // 2. 提取開獎日期 (例如：民國 115 年 10 月 29 日)
      const dateMatch = htmlText.match(/民國\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
      if (dateMatch) lotteryData.date = `民國 ${dateMatch[1]} 年 ${dateMatch[2]} 月 ${dateMatch[3]} 日`;

      // 3. 提取依大小順序排列的 5 個號碼
      const sizeBlock = htmlText.match(/依大小順序排列：[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})/);
      if (sizeBlock) {
        lotteryData.sizeOrder = [sizeBlock[1], sizeBlock[2], sizeBlock[3], sizeBlock[4], sizeBlock[5]];
      }

      // 4. 提取依開出順序排列的 5 個號碼
      const drawBlock = htmlText.match(/依開出順序排列：[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})/);
      if (drawBlock) {
        lotteryData.drawOrder = [drawBlock[1], drawBlock[2], drawBlock[3], drawBlock[4], drawBlock[5]];
      }
    } else {
      throw new Error('網頁內容解析失敗，找不到 39樂合彩 區塊');
    }

    console.log('--- 抓取成功結果 ---');
    console.log(lotteryData);

    // 5. 將結果寫入 7788.js
    const fs = require('fs');
    const fileContent = `module.exports = ${JSON.stringify(lotteryData, null, 2)};`;
    fs.writeFileSync('7788.js', fileContent);
    console.log('已成功更新並寫入 7788.js');

  } catch (error) {
    console.error('更新資料時發生錯誤:', error.message);
    process.exit(1); // 確保 GitHub Actions 抓到錯誤
  }
}

updateLotteryData();
