const { Octokit } = require("@octokit/rest");

// 只保留 88ll88 的授權
const octokit = new Octokit({ auth: process.env.PAT_88LL88 });

// 目標只剩兩個倉庫
const TARGET_FILES = [
  { owner: '88ll88', repo: '999', path: 'vvv.js', varName: 'vvv' },
  { owner: '88ll88', repo: '888', path: 'ddd.js', varName: 'ddd' }
];

async function main() {
    const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    console.log(`[${timestamp}] 開始執行即時開獎號碼抓取與同步更新...`);
    
    const today = getTaiwanTodayStr();
    
    // 抓取即時落球號碼
    let shun = await fetchLiveDrawBall();
    if (!shun || shun.length === 0) {
        console.log(`[${timestamp}] [${today}] 尚未取得即時開獎號碼，跳過。`);
        return;
    }

    console.log(`[${timestamp}] [${today}] 成功抓取到即時落球號碼:`, shun);

    for (const target of TARGET_FILES) {
        await updateSingleRepository(target, today, shun, timestamp);
    }
}

async function updateSingleRepository(target, targetDate, shun, timestamp) {
    const { owner, repo, path, varName } = target;

    try {
        const res = await octokit.repos.getContent({ owner, repo, path });
        const content = Buffer.from(res.data.content, 'base64').toString('utf-8');
        const sha = res.data.sha;

        const regex = new RegExp(`var\\s+${varName}\\s*=\\s*(\\[[\\s\\S]*\\]);?`);
        const match = content.match(regex);
        if (!match) {
            console.error(`[${timestamp}] [錯誤] 找不到變數 ${varName} 於 ${owner}/${repo}/${path}`);
            return;
        }

        let records = eval('(' + match[1] + ')');
        let topRecord = records[0];
        let topDate = topRecord[0];

        // 依照規則：若最上面一列是今天，直接用最新的 shun 陣列替換；若小於今天則新增
        if (topDate === targetDate) {
            topRecord[1] = shun;
            console.log(`[${timestamp}] [更新] ${owner}/${repo}/${path} 今日號碼已替換為:`, shun);
        } else if (topDate < targetDate) {
            records.unshift([targetDate, shun]);
            console.log(`[${timestamp}] [新增] ${owner}/${repo}/${path} 新增今日記錄:`, shun);
        } else {
            return;
        }

        let rows = records.map(r => {
            let dateStr = r[0];
            let shunStr = r[1].map(n => `'${n}'`).join(',');
            return `  ['${dateStr}',[${shunStr}]]`;
        }).join(',\n');

        let newContent = `var ${varName} = [\n${rows}\n];\n`;
        let encodedContent = Buffer.from(newContent, 'utf-8').toString('base64');

        await octokit.repos.createOrUpdateFileContents({
            owner,
            repo,
            path,
            message: `auto: live update ${path} for ${targetDate} at ${timestamp}`,
            content: encodedContent,
            sha: sha
        });
        console.log(`[${timestamp}] [成功寫入] ${owner}/${repo}/${path}`);
    } catch (e) {
        console.error(`[${timestamp}] [錯誤] 更新 ${owner}/${repo}/${path} 失敗:`, e.message);
    }
}

async function fetchLiveDrawBall() {
    try {
        const res = await fetch('https://www.pilio.idv.tw/Live/DrawLiveRead.asp?ltotype=lto539');
        const text = await res.text();
        const matches = text.match(/\b(0[1-9]|[12][0-9]|3[0-9])\b/g);
        if (matches && matches.length > 0) {
            return matches.slice(0, 5);
        }
    } catch (e) {
        console.error("抓取即時號碼失敗:", e.message);
    }
    return null;
}

function getTaiwanTodayStr() {
    let now = new Date();
    let utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    let twTime = new Date(utc + (3600000 * 8));
    let y = twTime.getFullYear();
    let m = String(twTime.getMonth() + 1).padStart(2, '0');
    let d = String(twTime.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

main();
