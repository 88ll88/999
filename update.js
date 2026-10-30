const https = require('https');
const fs = require('fs');
const path = require('path');

const API_URL = 'https://taiwanlottery.com';
const OUTPUT_FILE = path.join(__dirname, 'daily_cash_result.json');

console.log('正在從台灣彩券擷取最新資料...');

https.get(API_URL, {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    }
}, (res) => {
    let data = '';

    res.on('data', (chunk) => { data += chunk; });

    res.on('end', () => {
        try {
            const json = JSON.parse(data);
            if (json && json.lottoResult) {
                // 整理成乾淨的 JSON 結構
                const formattedData = json.lottoResult.map(item => ({
                    period: item.period,
                    drawDate: item.drawDate,
                    numbers: item.resultOrder,
                    salesAmount: item.salesAmount,
                    categories: {
                        grandPrize: { winners: item.g1Winner, prize: item.g1Prize },
                        secondPrize: { winners: item.g2Winner, prize: item.g2Prize }
                    }
                }));

                fs.writeFileSync(OUTPUT_FILE, JSON.stringify(formattedData, null, 2), 'utf-8');
                console.log('✅ 資料更新成功，已寫入 daily_cash_result.json');
            } else {
                console.error('❌ 官方 API 資料格式改變');
            }
        } catch (e) {
            console.error('❌ 解析 JSON 失敗:', e.message);
        }
    });

}).on('error', (err) => {
    console.error('❌ 網路請求失敗:', err.message);
});
