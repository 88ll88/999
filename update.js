const { Octokit } = require("@octokit/rest");

const octokit = new Octokit({ auth: process.env.PAT_88LL88 });

const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    const timestamp = getTaiwanTimestamp();
    const today = getLotteryTodayStr(); // 20:35 換日基準
    console.log(`[${timestamp}] 檢查更新狀態，判定今天日期為: ${today}`);

    // 以 vvv.js 為基準檢查是否已更新
    const vvvData = await getRepositoryData(TARGET_FILES[0]);
    if (!vvvData) return;

    let records = vvvData.records;
    let topDate = records.length > 0 ? records[0][0] : '';

    if (topDate === today) {
        console.log(`[${timestamp}] vvv[0][0] (${topDate}) 已等於今天 (${today})，關閉結束。`);
        return;
    }

    // 若小於今天，開始抓取落球
    let luoQiu = await fetchArclinkDrawBall(timestamp);
    if (!luoQiu || luoQiu.length !== 5) {
        console.log(`[${timestamp}] 尚未取得完整的 5 顆落球，等待下一輪排程...`);
        return;
    }

    console.log(`[${timestamp}] 成功抓取今日落球:`, luoQiu);

    // 同步更新至雙倉庫
    for (const target of TARGET_FILES) {
        await insertTopRecord(target, today, luoQiu, timestamp);
    }
}

// 20:35 換日邏輯計算
function getLotteryTodayStr() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    
    // 若時間還沒到 20:35，則視為前一天
    let hours = twTime.getHours();
    let minutes = twTime.getMinutes();
    if (hours < 20 || (hours === 20 && minutes < 35)) {
        twTime.setDate(twTime.getDate() - 1);
    }
    
    let y = twTime.getFullYear();
    let m = String(twTime.getMonth() + 1).padStart(2, '0');
    let d = String(twTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

async function fetchArclinkDrawBall(timestamp) {
    try {
        const res = await fetch('https://lotto2.arclink.com.tw/539/539open-1.html');
        const text = await res.text();
        const matches = text.match(/<td[^>]*bgcolor=["']?#ffff99["']?[^>]*>(\d{2})<\/td>/gi);
        if (matches && matches.length >= 5) {
            return matches.slice(0, 5).map(td => {
                let m = td.match(/>(\d{2})</);
                return m ? m[1] : null;
            }).filter(Boolean);
        }
    } catch (e) {
        console.error(`[${timestamp}] 抓取網頁失敗:`, e.message);
    }
    return null;
}

async function getRepositoryData(target) {
    const { owner, repo, path, varName } = target;
    const res = await octokit.repos.getContent({ owner, repo, path });
    const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
    const match = content.match(new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*\\]);?`));
    if (!match) return null;
    return { records: eval('(' + match[1] + ')'), sha: res.data.sha };
}

async function insertTopRecord(target, targetDate, luoQiu, timestamp) {
    const { owner, repo, path, varName } = target;
    const data = await getRepositoryData(target);
    if (!data) return;

    let records = data.records;
    records.unshift([targetDate, luoQiu]);

    let rows = records.map(r => `  ['${r[0]}',[${r[1].map(n => `'${n}'`).join(',')}]]`).join(',\n');
    let newContent = `var ${varName} = [\n${rows}\n];\n`;

    await octokit.repos.createOrUpdateFileContents({
        owner,
        repo,
        path,
        message: `auto: insert ${targetDate} at ${timestamp}`,
        content: Buffer.from(newContent, 'utf-8').toString('base64'),
        sha: data.sha
    });
    console.log(`[${timestamp}] 成功寫入首列: ${owner}/${repo}/${path}`);
}

function getTaiwanTimestamp() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    return twTime.toISOString().replace('T', ' ').substring(0, 19);
}

main();
