async function updateLotteryData() {
  try {
    // 改用台灣彩券新版官網的今彩539公開 API
    const url = 'https://taiwanlottery.com.tw';
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP 錯誤！狀態碼: ${response.status}`);
    }

    const resData = await response.json();
    
    // 檢查 API 是否成功回傳資料
    if (!resData || !resData.content || !resData.content.daily539Res) {
      throw new Error('台彩 API 回傳格式異常');
    }

    // 取得最新一期的開獎資料
    const latest = resData.content.daily539Res[0];

    // 台彩原始資料格式：
    // latest.drawOrderNumber -> 依開出順序 (通常是逗號分隔或陣列)
    // latest.sizeOrderNumber -> 依大小順序
    let lotteryData = {
      game: '今彩539 / 39樂合彩',
      issue: latest.period || '',                                  // 期別
      date: latest.drawDate ? latest.drawDate.split('T')[0] : '',  // 開獎日期 (西元格式，如 2026-10-29)
      sizeOrder: latest.sizeOrderNumber || [],                     // 大小順序
      drawOrder: latest.drawOrderNumber || []                      // 開出順序
    };

    console.log('--- 抓取成功結果 ---');
    console.log(lotteryData);

    // 將結果寫入你的 7788.js 檔案
    const fs = require('fs');
    const fileContent = `module.exports = ${JSON.stringify(lotteryData, null, 2)};`;
    fs.writeFileSync('7788.js', fileContent);
    console.log('已成功更新並寫入 7788.js');

  } catch (error) {
    console.error('更新資料時發生錯誤:', error.message);
    process.exit(1); // 確保 GitHub Actions 抓到錯誤並顯示紅燈
  }
}

updateLotteryData();
