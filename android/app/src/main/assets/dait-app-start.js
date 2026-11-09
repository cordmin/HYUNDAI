// 다잇 화면: 시작 인트로와 첫 화면 그리기. 맨 마지막에 불러온다.
// ========================================================
// 시그니처 인트로 스플래시 애니메이션 엔진
// ========================================================
let isIntroPlaying = false;
let homeStale = false; // 인트로 중에 바뀐 첫 화면은 인트로가 끝난 뒤 다시 그린다
let introTimers = [];

function clearIntroTimers() {
  introTimers.forEach(t => clearTimeout(t));
  introTimers = [];
}

let splashAudioContext = null;
function getIntroAudioContext() {
  if (isDrivingMode) return null;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return null;
  try {
    if (!splashAudioContext || splashAudioContext.state === 'closed') splashAudioContext = new AudioCtx();
    return splashAudioContext;
  } catch (e) { return null; }
}

function playDotPopSound() {
  if (isDrivingMode) return;
  try {
    const ctx = getIntroAudioContext();
    if (!ctx || ctx.state !== 'running') return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    // 점이 찍힐 때 짧게 올라갔다 내려오는 뿅 소리.
    const now = ctx.currentTime;
    osc.frequency.setValueAtTime(520, now);
    osc.frequency.exponentialRampToValueAtTime(1500, now + 0.06);
    osc.frequency.exponentialRampToValueAtTime(750, now + 0.2);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.stop(now + 0.24);
  } catch (e) {
    // 브라우저 자동 재생 정책 제한 시 안전 패스
  }
}

function playSplashIntro() {
  if (isIntroPlaying) return;
  isIntroPlaying = true;
  const ctx = getIntroAudioContext();
  // 오디오 자동재생이 막혀도 화면은 기다리지 않고 진행한다.
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  clearIntroTimers();

  const overlay = document.getElementById('splashOverlay');
  const brand = document.getElementById('splashBrandContainer');
  const ribbon = document.getElementById('splashRibbonPath');
  const crossbar = document.getElementById('splashCrossbarPath');
  const dotGroup = document.getElementById('splashDotGroup');
  const dotRipple = document.getElementById('splashDotRipple');
  const aura = document.querySelector('.splash-aura');

  if (!overlay || !ribbon) {
    isIntroPlaying = false;
    return;
  }

  // 오버레이 및 브랜드 상태 초기화 (전체 화면 상태로 리셋)
  overlay.style.transition = 'none';
  overlay.style.display = 'flex';
  overlay.style.opacity = '1';
  overlay.style.visibility = 'visible';

  if (aura) {
    aura.style.transition = 'none';
    aura.style.opacity = '0.9';
  }

  brand.style.transition = 'none';
  brand.style.transform = 'translate(0, 0) scale(1)';
  brand.style.opacity = '1';

  if (dotGroup) dotGroup.classList.remove('pop');
  if (dotRipple) dotRipple.classList.remove('expand');

  // 카드 초기화 (오른쪽에서 당겨져 들어올 준비)
  const cards = document.querySelectorAll('.home-card');
  cards.forEach((card) => {
    card.style.transition = 'none';
    card.style.transform = 'translateX(30px)';
    card.style.opacity = '0';
  });

  // Dait 필기체를 한 획씩 쓰고 상단 로고 자리로 이동한다.
  const at = (ms, fn) => introTimers.push(setTimeout(fn, ms));

  // SVG 스트로크 대시 설정 (전체 길이 측정)
  const ribbonLength = ribbon.getTotalLength ? ribbon.getTotalLength() : 380;
  ribbon.style.transition = 'none';
  ribbon.style.strokeDasharray = ribbonLength;
  ribbon.style.strokeDashoffset = ribbonLength;

  const crossbarLength = crossbar.getTotalLength ? crossbar.getTotalLength() : 20;
  crossbar.style.transition = 'none';
  crossbar.style.strokeDasharray = crossbarLength;
  crossbar.style.strokeDashoffset = crossbarLength;

  // 동기식 리플로우 강제 (트랜지션 보장)
  void ribbon.getBoundingClientRect();

  // 1. 손글씨 쓰듯 캘리그래피 스트로크 스르륵 써내려가기 (0 ~ 1.05s)
  requestAnimationFrame(() => {
    if (!isIntroPlaying) return;
    ribbon.style.transition = 'stroke-dashoffset 1.05s cubic-bezier(0.42, 0, 0.18, 1)';
    ribbon.style.strokeDashoffset = '0';
  });

  // 2. t 가로획 연결 (0.92s)
  at(920, () => {
    crossbar.style.transition = 'stroke-dashoffset 0.18s ease-out';
    crossbar.style.strokeDashoffset = '0';
  });

  // 3. i 위에 점(Dot) 하나 마지막으로 딱! 찍히며 충격파 확산 (1.12s)
  at(1120, () => {
    if (dotGroup) dotGroup.classList.add('pop');
    if (dotRipple) dotRipple.classList.add('expand');
    playDotPopSound();
  });

  // 4. 로고가 작아지며 화면 위쪽 제자리로 미끄러져 간다 (1.62s)
  at(1620, () => {
    const targetBadge = document.querySelector('.dait-brand-badge');
    if (targetBadge) {
      const from = brand.getBoundingClientRect();
      const to = targetBadge.getBoundingClientRect();
      const moveX = to.left + to.width / 2 - from.left - from.width / 2;
      const moveY = to.top + to.height / 2 - from.top - from.height / 2;
      brand.style.transition = 'transform 0.58s cubic-bezier(0.22, 1, 0.36, 1)';
      brand.style.transform = `translate(${moveX}px, ${moveY}px) scale(${to.width / from.width})`;
    }
    if (aura) {
      aura.style.transition = 'opacity 0.5s ease';
      aura.style.opacity = '0';
    }
  });

  // 5. 로고가 닿으면 덮개를 걷고 카드가 차례로 들어온다 (2.2s)
  at(2200, () => {
    overlay.style.transition = 'opacity 0.25s ease';
    overlay.style.opacity = '0';
    cards.forEach((card, idx) => {
      introTimers.push(setTimeout(() => {
        card.style.transition = 'transform 0.5s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.36s ease-out';
        card.style.transform = 'translateX(0)';
        card.style.opacity = '1';
      }, idx * 45));
    });
  });

  // 6. 카드 스타일과 스플래시 정리 (3s)
  at(3000, () => {
    cards.forEach((card) => {
      card.style.transition = '';
      card.style.transform = '';
      card.style.opacity = '';
    });
    overlay.style.display = 'none';
    finishIntro();
  });
}

function finishIntro() {
  isIntroPlaying = false;
  if (homeStale && !currentMode) render();
  homeStale = false;
}

function skipSplashIntro() {
  clearIntroTimers();
  ['splashRibbonPath', 'splashCrossbarPath'].forEach(id => { const el = document.getElementById(id); if (el) { el.style.opacity = ''; el.style.strokeDashoffset = '0'; } });
  const overlay = document.getElementById('splashOverlay');
  const cards = document.querySelectorAll('.home-card');
  cards.forEach((card) => {
    card.style.transition = 'opacity 0.2s ease';
    card.style.transform = '';
    card.style.opacity = '1';
    setTimeout(() => {
      card.style.transition = '';
    }, 200);
  });
  if (overlay) {
    overlay.style.transition = 'opacity 0.2s ease';
    overlay.style.opacity = '0';
    setTimeout(() => {
      overlay.style.display = 'none';
      finishIntro();
    }, 200);
  }
}

// 제출용 앱에는 시연 버튼 줄을 두지 않는다. 브라우저 미리보기와 개발용 앱에만 보인다.
if (window.AndroidBridge && (!window.AndroidBridge.isDebugBuild || !window.AndroidBridge.isDebugBuild())) document.body.classList.add('release');

// Initial render and signature splash intro
render();
setTimeout(() => {
  playSplashIntro();
}, 120);
