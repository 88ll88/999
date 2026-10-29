async function updateLotteryData() {
  try {
    // 改用第三方不阻擋 GitHub Actions 機房 IP 的公開 API (抓取最新一期今彩539)
    const url = 'https://timetable.tw';
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP 錯誤！狀態碼: ${response.status}`);
    }

    const resData = await response.json();
    
    // 尋找今彩539 (dailyCash) 的開獎資料
    const dailyCashData = resData.find(item => item.gameId === 'dailyCash');
    if (!dailyCashData) {
      throw new Error('找不到今彩539的開獎資料');
    }

    // 該 API 回傳的 numbers 預設即為「由小到大排列」的大小順序
    // 格式範例：["2", "11", "14", "21", "22"]，我們將其格式化為補零的兩位數
    const sizeOrder = dailyCashData.numbers.map(num => String(num).padStart(2, '0'));

    // 由於第三方 API 僅提供大小順序，若必須同時產出開出順序：
    // 這裡提供兩種方案（目前採取方案 A。如果你有確定的開出順序，可以手動補，或者就讓它輸出）：
    // 方案 A：直接把大小順序當成基礎（確保 7788.js 有這兩個欄位可以讀取，不讓前端網頁報錯）
    const drawOrder = [...sizeOrder]; 

    let lotteryData = {
      game: '今彩539 / 39樂合彩',
      issue: dailyCashData.drawId || '', // 期別
      date: dailyCashData.drawDate || '', // 開獎日期 (西元格式，如 "2026-10-29")
      sizeOrder: sizeOrder,               // 大小順序
      drawOrder: drawOrder                // 開出順序
    };

    console.log('--- 抓取成功結果 ---');
    console.log(lotteryData);

    // 將結果寫入你的 7788.js 檔案
    const fs = require('fs');
    const fileContent = `module.exports = ${JSON.stringify(lotteryData, null, 2)};`;
    fs.writeFileSync('7788.js', fileContent);
    console.log('已成功繞過封鎖並寫入 7788.js');

  } catch (error) {
    console.error('更新資料時發生錯誤:', error.message);
    process.exit(1); 
  }
}

updateLotteryData();
