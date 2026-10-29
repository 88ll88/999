// 不用 require('axios') 和 require('cheerio')，改用內建功能

async function updateLotteryData() {
  try {
    const url = 'https://ctbcbank.com';
    
    // 使用 Node.js 20 內建的 fetch 抓取網頁
    const response = await fetch(url);
    const htmlText = await response.text();

    let lotteryData = {
      game: '39樂合彩',
      issue: '',
      date: '',
      sizeOrder: [],
      drawOrder: []
    };

    // 尋找 39樂合彩 或 今彩539 的資料區塊（以文字特徵做簡單正規表達式切開）
    // 找出包含該期號碼的關鍵表格段落
    if (htmlText.includes('39樂合彩')) {
      // 提取期別 (例如：第 115000262 期)
      const issueMatch = htmlText.match(/第\s*(\d+)\s*期/);
      if (issueMatch) lotteryData.issue = issueMatch[1];

      // 提取開獎日期
      const dateMatch = htmlText.match(/民國\s*(\d+)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
      if (dateMatch) lotteryData.date = `民國 ${dateMatch[1]} 年 ${dateMatch[2]} 月 ${dateMatch[3]} 日`;

      // 使用 Regex 精準抓取大小順序的五個號碼
      const sizeBlock = htmlText.match(/依大小順序排列：[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})/);
      if (sizeBlock) {
        lotteryData.sizeOrder = [sizeBlock[1], sizeBlock[2], sizeBlock[3], sizeBlock[4], sizeBlock[5]];
      }

      // 使用 Regex 精準抓取開出順序的五個號碼
      const drawBlock = htmlText.match(/依開出順序排列：[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})[\s\S]*?(\d{2})/);
      if (drawBlock) {
        lotteryData.drawOrder = [drawBlock[1], drawBlock[2], drawBlock[3], drawBlock[4], drawBlock[5]];
      }
    }

    console.log('--- 抓取成功結果 ---');
    console.log(lotteryData);

    // 在這裡把資料寫入你的 7788.js 檔案
    const fs = require('fs');
    // 將資料打包成 JavaScript 模組寫入檔案中
    const fileContent = `module.exports = ${JSON.stringify(lotteryData, null, 2)};`;
    fs.writeFileSync('7788.js', fileContent);
    console.log('已成功寫入 7788.js');

  } catch (error) {
    console.error('更新資料時發生錯誤:', error.message);
    process.exit(1); // 讓 GitHub Actions 知道出錯了
  }
}

updateLotteryData();
