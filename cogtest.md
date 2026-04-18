**1.熟悉现有的openscope项目框架和逻辑**
2.你现在需要将认知状态评估（cogtest）作为一个模块集成到现有的opencope项目中。

3..这个模块会在QuestionnaireConstants弹出后出现

4..以下是需要添加的模块，仅供你参考！以openscope现有的项目框架为主，包括语法，样式等，先让项目能跑起来，再丰富样式的细节。

# 认知状态评估

## 一、整体架构

1. **页面阶段管理**：5个核心页面（介绍页 → PVT测试 → 2-Back测试 → Stroop测试 → 结果页），同一时间只显示一个页面
2. **全局数据**：统一存储三项测试的所有结果，最终用于展示和导出
3. **核心流程**：初始化 → 依次完成三项认知测试 → 数据统计 → 展示结果 → 导出数据/重新开始

---

## 二、全局核心变量与页面切换

```javascript
// 全局状态
let currentStage = 'intro'; // 当前显示的页面
const experimentData = { pvt: null, nback: null, stroop: null }; // 存储所有测试结果
const stages = ['intro','pvt','2back','stroop','results']; // 所有页面

// 页面切换函数：隐藏所有页面，显示目标页面，触发对应测试初始化
function goToStage(stageName);
```

---

## 三、三项测试核心逻辑

### 1. PVT 精神运动警觉性测试

**核心目标**：测试用户反应速度，共10次

- **规则**：随机延迟后圆形变红，用户点击；<120ms=抢答，>2000ms=超时，均判定失误
- **核心流程**：
  1. 初始化：重置次数、结果、状态
  2. 触发测试：随机延迟2-6秒后变红，开始计时
  3. 响应处理：计算反应时间，记录结果（正常/抢答/超时）
  4. 循环10次后，计算**平均反应时间、错误次数、正确率**
- **关键函数**：
  ```javascript
  initPVT()        // 初始化测试
  triggerPvtStart()// 开始一轮测试
  handlePvtResponse() // 处理用户点击
  recordPvtResult()  // 记录单次结果
  finishPVT()       // 测试结束，统计数据
  ```

### 2. 空管版 2-Back 工作记忆测试

**核心目标**：测试工作记忆，共12个航班呼号+高度

- **规则**：
  - 前2个数据仅用于记忆
  - 从第3个开始：判断**当前高度**与**该呼号2次前的高度**是否相同
  - 按Y/点击是=相同，N/点击否=不同
- **核心流程**：
  1. 生成12组测试数据（固定2个呼号交替，35%概率高度匹配）
  2. 每组数据显示3秒，用户按键/点击作答
  3. 记录正确率、正确次数、平均反应时间
- **关键函数**：
  ```javascript
  generateATC2BackSeq() // 生成测试序列
  initNBack()       // 初始化
  startNBack()      // 开始测试
  runNBackStep()    // 执行单步测试
  handleNBackResponse() // 处理用户回答
  endNBack()        // 结束测试，统计数据
  finishNBack()     // 切换到下一项测试
  ```

### 3. 航向指令冲突测试（Stroop）

**核心目标**：测试抗干扰能力，共10题

- **规则**：
  - 忽略文字，只判断箭头方向
  - 每题仅显示1秒，制造时间压力
  - 支持键盘方向键/鼠标点击作答
- **核心流程**：
  1. 随机生成箭头+文字（75%概率文字与箭头冲突）
  2. 计时，用户作答后记录结果
  3. 1秒未作答自动判错
  4. 统计正确率、平均反应时间
- **关键函数**：
  ```javascript
  initStroop()    // 初始化
  startStroop()   // 开始测试
  runStroopStep() // 执行单题测试
  handleStroopResponse() // 处理回答
  endStroop()     // 结束测试，统计数据
  ```

---

## 四、结果与工具函数

### 1. 结果展示

`renderResults()`：从全局数据 `experimentData`中读取三项测试结果，渲染到结果页面

### 2. 数据导出

`exportData()`：将所有实验结果转为JSON文件，自动下载到本地

### 3. 重新开始

`restartExperiment()`：清空所有计时器，重置状态，返回介绍页

### 4. 键盘监听

- 2-Back：监听**Y/N键**快速作答
- Stroop：监听**方向键**快速作答

---

## 五、完整极简核心逻辑代码

```javascript
// ==================== 全局状态与页面切换 ====================
let currentStage = 'intro';
const experimentData = { pvt: null, nback: null, stroop: null };
const stages = ['intro','pvt','2back','stroop','results'];

function goToStage(stageName) {
  stages.forEach(s => {
    document.getElementById(`stage-${s}`).classList.add('hidden-stage');
  });
  document.getElementById(`stage-${stageName}`).classList.remove('hidden-stage');
  currentStage = stageName;

  // 触发对应测试初始化
  if(stageName === 'pvt') initPVT();
  if(stageName === '2back') initNBack();
  if(stageName === 'stroop') initStroop();
  if(stageName === 'results') renderResults();
}

// ==================== 1. PVT 测试 ====================
const PVT_TOTAL = 10;
let pvtTrial = 0, pvtState = 'idle', pvtResults = [];
let pvtTimer = null, pvtTimeout = null, pvtStartTime = 0;

function initPVT() {
  pvtTrial = 0;
  pvtResults = [];
  pvtState = 'idle';
}

function triggerPvtStart() {
  pvtState = 'waiting';
  const delay = Math.random() * 4000 + 2000;
  pvtTimer = setTimeout(() => {
    pvtState = 'running';
    pvtStartTime = performance.now();
    pvtTimeout = setTimeout(() => handlePvtResponse(true), 2000);
  }, delay);
}

function handlePvtResponse(isTimeout = false) {
  if (currentStage !== 'pvt' || pvtState === 'idle') {
    triggerPvtStart();
    return;
  }
  if (pvtState === 'waiting') {
    clearTimeout(pvtTimer);
    recordPvtResult(0, '提前抢答');
  }
  if (pvtState === 'running') {
    clearTimeout(pvtTimeout);
    const rt = performance.now() - pvtStartTime;
    if (isTimeout || rt > 2000) recordPvtResult(2000, '反应迟缓');
    else if (rt < 120) recordPvtResult(rt, '提前抢答');
    else recordPvtResult(rt, '正常');
  }
}

function recordPvtResult(rt, type) {
  const isError = type !== '正常';
  pvtResults.push({ rt, type, isError });
  setTimeout(() => {
    if (pvtTrial + 1 < PVT_TOTAL) {
      pvtTrial++;
      triggerPvtStart();
    } else {
      finishPVT();
    }
  }, 1500);
}

function finishPVT() {
  const validRTs = pvtResults.filter(r => !r.isError).map(r => r.rt);
  const avgRT = validRTs.length ? validRTs.reduce((a,b)=>a+b)/validRTs.length : 0;
  const errors = pvtResults.filter(r => r.isError).length;
  const accuracy = ((PVT_TOTAL - errors)/PVT_TOTAL)*100;
  experimentData.pvt = { avgRT, errors, accuracy };
  goToStage('2back');
}

// 绑定点击事件
document.getElementById('pvt-box').addEventListener('mousedown', ()=>handlePvtResponse(false));

// ==================== 2. 2-Back 测试 ====================
const NBACK_TOTAL = 12, NBACK_DURATION = 3000;
let nbackSeq = [], nbackIndex = -1, nbackPlaying = false, nbackTimer = null;
let nbackStats = { correct:0, rts:[], totalValid:10 };
const CALLSIGNS = ["CCA101","CES538","CSN312","CHH779"];
const ALTITUDES = ["7200m","7500m","7800m","8100m","8400m","8700m","9000m"];

function generateATC2BackSeq(len) {
  const picked = CALLSIGNS.sort(()=>0.5-Math.random()).slice(0,2);
  const seq = [];
  for(let i=0;i<len;i++){
    const callsign = picked[i%2];
    if(i>=2 && Math.random()<0.35){
      seq.push({ callsign, altitude:seq[i-2].altitude, isMatch:true });
    }else{
      let alt = ALTITUDES[Math.floor(Math.random()*ALTITUDES.length)];
      seq.push({ callsign, altitude:alt, isMatch:false });
    }
  }
  return seq;
}

function initNBack() {
  clearTimeout(nbackTimer);
  nbackSeq = generateATC2BackSeq(NBACK_TOTAL);
  nbackStats = { correct:0, rts:[], totalValid:10 };
}

function startNBack() {
  nbackPlaying = true;
  nbackIndex = 0;
  runNBackStep();
}

function runNBackStep() {
  if(nbackIndex >= NBACK_TOTAL) { endNBack(); return; }
  nbackTimer = setTimeout(()=>{ nbackIndex++; runNBackStep(); }, NBACK_DURATION);
}

function handleNBackResponse(ans) {
  if(!nbackPlaying) return;
  const rt = performance.now() - nbackStartTime;
  if(nbackIndex >=2){
    const isCorrect = (nbackSeq[nbackIndex].isMatch && ans==='Y') || (!nbackSeq[nbackIndex].isMatch && ans==='N');
    if(isCorrect) { nbackStats.correct++; nbackStats.rts.push(rt); }
  }
}

function endNBack() {
  const acc = (nbackStats.correct/10*100).toFixed(1);
  const avgRT = nbackStats.rts.length ? Math.round(nbackStats.rts.reduce((a,b)=>a+b)/nbackStats.rts.length) : 0;
  experimentData.nback = { accuracy:acc, correct:nbackStats.correct, totalTargets:10, avgRT };
}

function finishNBack() { goToStage('stroop'); }

// 键盘监听 Y/N
document.addEventListener('keydown',(e)=>{
  if(currentStage!=='2back') return;
  if(e.key==='y'||e.key==='Y') handleNBackResponse('Y');
  if(e.key==='n'||e.key==='N') handleNBackResponse('N');
});

// ==================== 3. Stroop 测试 ====================
const STROOP_TOTAL = 10, STROOP_DURATION = 1000;
let stroopTrial = -1, stroopTimer = null, stroopResults = [];
let stroopTargetDir = '';

function initStroop() { clearTimeout(stroopTimer); }
function startStroop() { stroopTrial=0; runStroopStep(); }

function runStroopStep() {
  if(stroopTrial >= STROOP_TOTAL) { endStroop(); return; }
  stroopTimer = setTimeout(()=>{
    stroopResults.push({ rt:1000, isCorrect:false });
    stroopTrial++; runStroopStep();
  }, STROOP_DURATION);
}

function handleStroopResponse(val) {
  const rt = performance.now() - stroopStartTime;
  const isCorrect = val === stroopTargetDir;
  stroopResults.push({ rt, isCorrect });
}

function endStroop() {
  const correctNum = stroopResults.filter(r=>r.isCorrect).length;
  const accuracy = correctNum/STROOP_TOTAL*100;
  const avgRT = correctNum ? stroopResults.filter(r=>r.isCorrect).reduce((s,r)=>s+r.rt,0)/correctNum : 0;
  experimentData.stroop = { accuracy, avgRT };
  goToStage('results');
}

// 键盘监听方向键
document.addEventListener('keydown',(e)=>{
  if(currentStage!=='stroop') return;
  const dirs = ['ArrowLeft','ArrowUp','ArrowRight'];
  if(dirs.includes(e.code)) handleStroopResponse(e.code);
});

// ==================== 结果与工具函数 ====================
function renderResults() { /* 渲染结果到页面 */ }
function exportData() { /* 导出JSON数据 */ }
function restartExperiment() { /* 重置所有状态，重新开始 */ }

// 初始化
goToStage('intro');
```

---
