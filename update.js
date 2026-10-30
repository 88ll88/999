async function run() {
  const targetDate = getTargetDate();
  const { data } = read7788();
  const topRow = data[0]; // 取得目前首列 [日期, [號碼]]
  const topDate = topRow[0];

  console.log(`目標日期: ${targetDate}, 7788.js 首列日期: ${topDate}`);

  const drawInfo = await fetchDrawData(targetDate);
  if (!drawInfo) {
    console.log('尚未獲取到開獎數據');
    return;
  }

  let updated = false;

  // 1. 首列插入：若首列日期小於目標日期，代表今天還沒記錄，直接在首列插入順球
  if (topDate < targetDate) {
    console.log(`[首列插入] 插入 ${targetDate} 順球：`, drawInfo.orderBalls);
    data.unshift([targetDate, drawInfo.orderBalls]);
    updated = true;
  }
  // 2. 首列替換：若首列日期已經是目標日期，但內容還不是落球，直接替換首列為落球
  else if (topDate === targetDate) {
    if (JSON.stringify(topRow[1]) !== JSON.stringify(drawInfo.dropBalls)) {
      console.log(`[首列替換] 將首列替換為落球：`, drawInfo.dropBalls);
      data[0] = [targetDate, drawInfo.dropBalls];
      updated = true;
    } else {
      console.log('首列已經是最新落球數據，無需變更');
    }
  }

  if (updated) {
    write7788(data);
    console.log('7788.js 更新完成');
  }
}
