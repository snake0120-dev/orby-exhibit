/* ═══════════════════════════════════════════
   ORBY 전시용 자동재생
   전시장에서 몇 시간을 틀어놓는 화면이다.
   setTimeout을 꼬리물기로 이으면 오차가 쌓이므로,
   매 프레임 "지금 몇 초째인가"를 절대 시각으로 다시 계산한다.
   상태를 누적하지 않으니 어긋날 여지가 없다.
   ═══════════════════════════════════════════ */
(function () {
  'use strict';

  var PAGE_W = 1920;
  var PAGE_H = 1080;

  var HOLD  = 8000;   // 한 장이 머무는 시간
  var OUT   = 600;    // 퇴장에 쓰는 시간 — 머무는 시간의 끝자락을 쓴다
  var STEP  = 100;    // 요소 사이 간격
  var COL   = 180;    // 2장 컬럼 사이 간격

  var stage  = document.getElementById('stage');
  var slides = Array.prototype.slice.call(document.querySelectorAll('.slide'));
  var total  = slides.length;
  var CYCLE  = HOLD * total;

  /* ── 화면에 맞추기 ───────────────────────── */
  function fit() {
    var s = Math.min(window.innerWidth / PAGE_W, window.innerHeight / PAGE_H);
    stage.style.setProperty('--scale', s);
  }
  fit();
  window.addEventListener('resize', fit);
  window.addEventListener('orientationchange', fit);

  /* ── 등장 순서 정하기 ─────────────────────
     라벨 → 제목 → 본문 순으로 밀리게 지연을 심어둔다.
     2장은 컬럼이 셋이라 컬럼 단위로 한 번 더 밀린다. */
  var ORDER = { logo: 0, label: 0, sym: 0, title: 1, body: 2 };

  slides.forEach(function (sl) {
    var cols = sl.querySelectorAll('[data-col]');

    Array.prototype.forEach.call(sl.querySelectorAll('[data-e]'), function (el) {
      var rank = ORDER[el.getAttribute('data-e')];
      if (rank === undefined) rank = 2;

      var base = 150;
      var host = el.closest('[data-col]');
      if (host) base += COL * (+host.getAttribute('data-col') + 1);

      el.style.setProperty('--d', (base + STEP * rank) + 'ms');
    });

    // 본문이 여러 줄이면 줄마다 조금씩 더 밀어 흐르듯 올라오게 한다
    Array.prototype.forEach.call(sl.querySelectorAll('.col__list li'), function (li, i) {
      li.style.transitionDelay = (60 * i) + 'ms';
    });
  });

  /* ── 타임라인 ─────────────────────────────
     경과 시간만 보고 "지금 몇 번째 장의 몇 초째인가"를 계산한다.
     탭이 가려졌다 돌아와도, 몇 시간이 지나도 늘 제자리를 찾는다. */
  var t0   = 0;
  var cur  = -1;
  var out  = false;
  var beat = 0;      // 마지막으로 프레임이 돈 시각 — 감시용

  /* 자리를 넘겨준 장을 뒤로 물리고, 다 덮인 뒤에 치운다 */
  function retire(el) {
    el.style.zIndex = 1;
    clearTimeout(el._bye);
    el._bye = setTimeout(function () {
      if (el !== slides[cur]) {
        el.classList.remove('is-live', 'is-in', 'is-out');
        el.style.zIndex = '';
      }
    }, 900);
  }

  function frame(now) {
    if (!t0) t0 = now;
    beat = now;

    var at   = (now - t0) % CYCLE;
    var idx  = Math.floor(at / HOLD);
    var into = at - idx * HOLD;

    if (idx !== cur) {
      // 앞 장은 바로 치우지 않는다. 글자는 이미 물러났고 그림만 남아 있는데,
      // 새 장의 그림이 그 위로 떠올라 자리를 넘겨받을 때까지 깔려 있어야
      // 넘어가는 순간 배경이 비쳐 깜빡이지 않는다.
      if (cur >= 0) retire(slides[cur]);

      cur = idx;
      out = false;

      var sl = slides[cur];
      sl.style.zIndex = 2;
      sl.classList.add('is-live');
      // 한 프레임 쉬었다 올려야 전환이 처음부터 재생된다
      void sl.offsetWidth;
      sl.classList.add('is-in');
    }

    if (!out && into >= HOLD - OUT) {
      out = true;
      slides[cur].classList.remove('is-in');
      slides[cur].classList.add('is-out');
    }

    requestAnimationFrame(frame);
  }

  /* ── 사진을 전부 받아둔 뒤에 시작한다 ──────
     첫 바퀴부터 매끄럽게 돌게 하려는 것이다.
     img.decode()는 쓰지 않는다 — 아직 화면에 뜨지 않은 장의 사진은
     브라우저가 디코드를 미루기 때문에 약속이 영영 안 끝날 수 있다.
     load 이벤트는 보이든 말든 반드시 온다. */
  function loaded() {
    var jobs = Array.prototype.map.call(document.images, function (im) {
      return new Promise(function (ok) {
        if (im.complete && im.naturalWidth > 0) return ok();
        im.addEventListener('load',  ok, { once: true });
        im.addEventListener('error', ok, { once: true });
      });
    });
    return Promise.all(jobs);
  }

  /* 전시장에서는 무슨 일이 있어도 화면이 떠야 한다.
     준비가 늦어지면 더 기다리지 않고 그냥 시작한다. */
  function ready(cap) {
    return new Promise(function (ok) {
      var fired = false;
      var go = function () { if (!fired) { fired = true; ok(); } };
      setTimeout(go, cap);
      var fonts = (document.fonts && document.fonts.ready) || Promise.resolve();
      Promise.all([loaded(), fonts]).then(go, go);
    });
  }

  ready(4000).then(function () {
    requestAnimationFrame(frame);

    /* 감시 — 화면 프레임이 끊기면 다시 깨운다.
       절전이나 창 가림으로 브라우저가 프레임을 멈추는 일이 있는데,
       무인 전시라 멈춘 걸 알아차릴 사람이 없다. */
    setInterval(function () {
      if (performance.now() - beat > 2000) requestAnimationFrame(frame);
    }, 2000);
  });

  /* ── 화면이 꺼지지 않게 ─────────────────── */
  var lock = null;
  function hold() {
    if (!navigator.wakeLock) return;
    navigator.wakeLock.request('screen').then(function (l) {
      lock = l;
      l.addEventListener('release', function () { lock = null; });
    }).catch(function () { /* 브라우저가 막으면 조용히 넘어간다 */ });
  }
  hold();
  document.addEventListener('visibilitychange', function () {
    if (!document.hidden && !lock) hold();
  });
})();
