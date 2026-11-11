/* 웰컴 드링크 API 클라이언트 — Apps Script 웹 앱과 통신 */
(function () {
  const cfg = window.DRINK_CONFIG || {};
  const API = (cfg.API_URL || '').trim();
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  async function post(payload) {
    // text/plain 으로 보내야 브라우저가 CORS 사전요청(OPTIONS)을 보내지 않아 Apps Script와 바로 통신됩니다.
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                                   body: JSON.stringify(payload), redirect: 'follow' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return res.json();
  }

  /** 접속이 몰려 실패하면(네트워크 오류·BUSY) 잠깐 기다렸다 최대 retries번 다시 시도 */
  async function call(action, data, retries) {
    if (!API) return MOCK.handle(action, data || {});
    const tries = (retries == null ? 2 : retries) + 1;
    let lastErr;
    for (let i = 0; i < tries; i++) {
      try {
        const out = await post(Object.assign({ action }, data || {}));
        if (out && out.code === 'BUSY' && i < tries - 1) { await sleep(800 + i * 900 + Math.random() * 600); continue; }
        return out;
      } catch (e) {
        lastErr = e;
        if (i < tries - 1) await sleep(700 + i * 900 + Math.random() * 600);
      }
    }
    throw lastErr || new Error('network');
  }

  /* ───────── 미리보기용 가짜 서버 (API_URL이 비어 있을 때만) ───────── */
  const MOCK = (() => {
    const KEY = 'wd_mock_db';
    const load = () => { try { return JSON.parse(localStorage.getItem(KEY)); } catch (e) { return null; } };
    const save = db => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} };
    function db() {
      let d = load();
      if (!d) {
        d = { seq: 37, open: true, grades: [{ name: '1학년', capacity: 30 }, { name: '2학년', capacity: 30 }, { name: '3학년', capacity: 30 }], rows: [] };
        const names = ['김민지', '이서준', '박지우', '최하은', '정도윤', '강서연', '조예준', '윤지민', '장시우', '임수아', '한유준', '오하린'];
        names.forEach((n, i) => d.rows.push({ id: 'm' + i, no: i + 1, grade: ['1학년', '2학년', '3학년'][i % 3], name: n,
          phone: '010-' + (1000 + i * 37) + '-' + (5000 + i * 91), time: '11/18 10:' + String(i * 4).padStart(2, '0'),
          exchanged: i % 3 === 0, exchangedAt: i % 3 === 0 ? '11/20 13:02' : '', received: i % 6 === 0, receivedAt: i % 6 === 0 ? '11/20 17:05' : '' }));
        // 3학년은 마감 상태로 보이도록 채워 둠
        for (let i = 0; i < 26; i++) d.rows.push({ id: 'f' + i, no: 13 + i, grade: '3학년', name: '예시' + i, phone: '010-9' + String(i).padStart(3, '0') + '-0000', time: '11/18 11:00', exchanged: false, exchangedAt: '', received: false, receivedAt: '' });
        save(d);
      }
      return d;
    }
    const digits = s => String(s || '').replace(/\D/g, '');
    const ticket = r => ({ number: r.no, grade: r.grade, name: r.name, exchanged: r.exchanged, exchangedAt: r.exchangedAt, received: r.received, receivedAt: r.receivedAt });
    function stats(d) {
      const grades = d.grades.map(g => { const c = d.rows.filter(r => r.grade === g.name).length; return { name: g.name, capacity: g.capacity, count: c, remaining: Math.max(0, g.capacity - c) }; });
      return { ok: true, open: d.open, grades, capacity: d.grades.reduce((a, g) => a + g.capacity, 0), count: d.rows.length, remaining: grades.reduce((a, g) => a + g.remaining, 0) };
    }
    async function handle(action, b) {
      await sleep(350);
      const d = db();
      const admin = () => { if (b.pw !== 'change-me-1234') throw new Error('AUTH'); };
      try {
        switch (action) {
          case 'status': return stats(d);
          case 'register': {
            const p = digits(b.phone);
            const ex = d.rows.find(r => digits(r.phone) === p);
            if (ex) return Object.assign({ ok: false, code: 'DUPLICATE' }, ticket(ex));
            const g = d.grades.find(x => x.name === b.grade);
            if (d.rows.filter(r => r.grade === b.grade).length >= g.capacity) return { ok: false, code: 'GRADE_FULL', message: b.grade + ' 선착순 등록이 마감되었습니다.' };
            const r = { id: 'n' + Date.now(), no: ++d.seq, grade: b.grade, name: b.name, phone: p.replace(/(\d{3})(\d{3,4})(\d{4})/, '$1-$2-$3'), time: '방금', exchanged: false, exchangedAt: '', received: false, receivedAt: '' };
            d.rows.push(r); save(d); return Object.assign({ ok: true }, ticket(r));
          }
          case 'lookup': {
            const p = digits(b.phone);
            if (!/^01\d{8,9}$/.test(p)) return { ok: false, code: 'INVALID', message: '휴대폰 번호를 다시 확인해 주세요.' };
            const r = d.rows.find(x => digits(x.phone) === p);
            return r ? Object.assign({ ok: true }, ticket(r)) : { ok: false, code: 'NOT_FOUND' };
          }
          case 'adminLogin': return { ok: b.pw === 'change-me-1234' };
          case 'adminData': admin(); { const s = stats(d); return { ok: true, capacity: s.capacity, grades: s.grades, open: d.open,
            rows: d.rows.map(r => Object.assign(ticket(r), { no: r.no, time: r.time, phone: r.phone, id: r.id })),
            url: location.href.replace(/admin\.html.*$/, ''), sheetUrl: '#', updated: new Date().toTimeString().slice(0, 8) }; }
          case 'adminSettings': admin(); if (b.settings.grades) d.grades = b.settings.grades.map(g => ({ name: g.name, capacity: +g.capacity })); if (b.settings.open !== undefined) d.open = !!b.settings.open; save(d); return { ok: true };
          case 'adminStage': admin(); { const r = d.rows.find(x => x.id === b.id); r[b.stage] = !!b.value; r[b.stage + 'At'] = b.value ? new Date().toTimeString().slice(0, 5) : ''; save(d); return { ok: true }; }
          case 'adminDelete': admin(); d.rows = d.rows.filter(x => x.id !== b.id); save(d); return { ok: true };
        }
      } catch (e) { return { ok: false, code: e.message === 'AUTH' ? 'AUTH' : 'ERROR', message: e.message }; }
      return { ok: false, code: 'UNKNOWN' };
    }
    return { handle };
  })();

  /* 이 기기에서 등록/조회한 번호 기억 (같은 기기 재방문 시 바로 결과 표시) */
  const PHONE_KEY = 'wd_phone';
  const mine = {
    get() { try { return localStorage.getItem(PHONE_KEY) || ''; } catch (e) { return ''; } },
    set(p) { try { localStorage.setItem(PHONE_KEY, p); } catch (e) {} },
    clear() { try { localStorage.removeItem(PHONE_KEY); } catch (e) {} }
  };

  function fmtPhone(v) {
    const d = String(v || '').replace(/\D/g, '').slice(0, 11);
    if (d.length < 4) return d;
    if (d.length < 8) return d.slice(0, 3) + '-' + d.slice(3);
    if (d.length === 10) return d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6);
    return d.slice(0, 3) + '-' + d.slice(3, 7) + '-' + d.slice(7);
  }
  const validPhone = v => /^01\d{8,9}$/.test(String(v || '').replace(/\D/g, ''));

  /** 393px 기준 디자인을 화면 폭에 맞춰 비율 그대로 확대/축소 */
  function fitToWidth() {
    const set = () => document.documentElement.style.setProperty('--z', Math.min(window.innerWidth, 480) / 393);
    set(); window.addEventListener('resize', set);
  }

  window.Drink = { call, mine, fmtPhone, validPhone, fitToWidth, isMock: !API };
})();
