(() => {
  const stack = document.getElementById('cardsStack');
  const region = document.getElementById('carousel');
  const live = document.getElementById('carousel-live');
  if (!stack || !region) return;

  const cards = Array.from(stack.querySelectorAll('.card'));
  const total = cards.length;
  let active = 0; // 初始显示第一张
  let startX = 0;
  let dragging = false;
  let deltaX = 0;
  let lastTs = 0;
  let velocity = 0;

  const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 倒计时：默认设定为 48 小时后截止，可自行替换目标时间
  const countdownEl = document.getElementById('countdown');
  const deadline = Date.now() + 48 * 3600 * 1000;
  if (countdownEl){
    const tick = () => {
      const diff = Math.max(0, deadline - Date.now());
      const d = Math.floor(diff/86400000);
      const h = Math.floor(diff%86400000/3600000);
      const m = Math.floor(diff%3600000/60000);
      const s = Math.floor(diff%60000/1000);
      countdownEl.textContent = `新版本售卖：${d}天${h}时${m}分${s}秒`;
    };
    tick();
    setInterval(tick, 1000);
  }

  function updatePositions() {
    cards.forEach((card, i) => {
      const offset = ((i - active) + total) % total; // 0..n-1，0 表示激活卡
      const rel = offset === 0 ? 0 : -offset; // 其他卡全部映射到 -1..-(n-1)
      card.setAttribute('data-pos', String(rel));
    });
    region.setAttribute('data-active-index', String(active));
    live && (live.textContent = `第 ${active + 1} 张，共 ${total} 张`);
  }

  function clampBetween(min, val, max){ return Math.max(min, Math.min(max, val)); }

  function go(step){
    active = (active + step + total) % total;
    updatePositions();
  }

  // 拖拽
  const threshold = 60; // 位移阈值
  const fastVel = 0.6; // 速度阈值(px/ms)
  // 滚轮/触控板：一次手势（连续滚动）触发一次；若出现轻微“安静段”或方向改变，可在短间隔再次触发
  const wheelGestureIdleMs = 90;  // 认为手势结束的空闲时间（更跟手）
  const wheelMinTriggerAbs = 7;   // 首次触发的最小单事件位移，避免极轻微误触
  const wheelRearmAbs = 24;       // 再次触发所需的强脉冲阈值（需配合安静段）
  const wheelQuietEpsilon = 2;    // 判定为“安静段”的极小位移阈值
  let wheelGestureTimer = 0;      // 手势空闲计时器
  let wheelGestureActive = false; // 当前是否处于一次滚动手势中
  let wheelLastDir = 0;           // 最近一次触发的方向
  let wheelHadQuiet = true;       // 自上次触发后是否出现过“安静段”
  let hoveringCarousel = false;   // 鼠标是否悬停在轮播区域上方

  function onPointerDown(e){
    // 若始于可交互元素（链接/按钮/表单等），不进入拖拽，避免拦截点击打开新标签页
    const interactiveEl = e.target && (e.target.closest && e.target.closest('a,button,input,textarea,select,label,[role="link"],[role="button"],[data-no-drag="true"]'));
    if (interactiveEl) return;
    region.classList.add('grabbing');
    region.classList.remove('grabbable');
    dragging = true;
    // pointer capture，保证释放事件
    if (region.setPointerCapture) try { region.setPointerCapture(e.pointerId); } catch(_){ }
    startX = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
    lastTs = performance.now();
    deltaX = 0; velocity = 0;
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp, { once:true });
  }

  function onPointerMove(e){
    if (!dragging) return;
    const x = e.clientX ?? (e.touches ? e.touches[0].clientX : 0);
    const now = performance.now();
    const dt = now - lastTs || 16;
    const dx = x - (startX + deltaX);
    deltaX += dx;
    velocity = dx / dt;
    lastTs = now;

    // 拖拽中位移 -> 轻微 3D 插值（不叠加，写入 CSS 变量）
    const progress = clampBetween(-1, deltaX / 200, 1);
    stack.style.setProperty('--drag-x', String(progress * 30));
    stack.style.setProperty('--drag-r', String(progress * 4));
  }

  function onPointerUp(e){
    region.classList.remove('grabbing');
    region.classList.add('grabbable');
    dragging = false;
    if (region.releasePointerCapture) try { region.releasePointerCapture(e.pointerId); } catch(_){ }
    const shouldNext = deltaX < -threshold || velocity < -fastVel;
    const shouldPrev = deltaX > threshold || velocity > fastVel;
    if (shouldNext) go(1); else if (shouldPrev) go(-1); else updatePositions();
    // 清理拖拽变量
    requestAnimationFrame(() => {
      stack.style.removeProperty('--drag-x');
      stack.style.removeProperty('--drag-r');
    });
  }

  // 滚轮（横向或 Shift+滚）
  function onWheel(e){
    const isHorizontalIntent = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
    if (!isHorizontalIntent) return;
    e.preventDefault();

    // 选择主轴的 delta（横向优先，其次 Shift+纵向）
    const primaryDelta = Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (!primaryDelta) return;
    const dir = primaryDelta > 0 ? 1 : -1;
    const absDelta = Math.abs(primaryDelta);

    // 记录“安静段”
    if (absDelta <= wheelQuietEpsilon) {
      wheelHadQuiet = true;
    }

    // 首次触发：开始一个手势
    if (!wheelGestureActive && absDelta >= wheelMinTriggerAbs){
      go(dir);
      wheelGestureActive = true;
      wheelLastDir = dir;
      wheelHadQuiet = false;
    } else if (wheelGestureActive) {
      // 已在手势中：
      // 1) 方向改变，立即再次触发
      if (dir !== wheelLastDir){
        go(dir);
        wheelLastDir = dir;
        wheelHadQuiet = false;
      } else if (wheelHadQuiet && absDelta >= wheelRearmAbs){
        // 2) 同向但出现过“安静段”后再来强脉冲，允许再次触发
        go(dir);
        wheelHadQuiet = false;
      }
    }

    // 重置/启动手势空闲计时器：空闲一段时间后认为本次手势结束
    if (wheelGestureTimer) clearTimeout(wheelGestureTimer);
    wheelGestureTimer = setTimeout(() => {
      wheelGestureActive = false;
      wheelLastDir = 0;
      wheelHadQuiet = true;
    }, wheelGestureIdleMs);
  }

  // 全局监听滚轮，但仅在鼠标位于轮播区域上方时响应
  function onGlobalWheel(e){
    if (!hoveringCarousel) return;
    onWheel(e);
  }

  // 键盘左右
  function onKeydown(e){
    if (e.key === 'ArrowRight') { go(1); }
    if (e.key === 'ArrowLeft') { go(-1); }
  }

  // 初始
  updatePositions();
  region.classList.add('grabbable');

  // 事件
  region.addEventListener('pointerdown', onPointerDown);
  region.addEventListener('mouseenter', () => { hoveringCarousel = true; });
  region.addEventListener('mouseleave', () => { hoveringCarousel = false; });
  window.addEventListener('wheel', onGlobalWheel, { passive:false });
  region.addEventListener('keydown', onKeydown);

  // 减少动效时：禁用过度 3D，只做淡入位移
  if (prefersReduced){
    cards.forEach(c => c.style.transition = 'opacity 260ms ease');
  }
})();


