(function () {
'use strict';

var CAT_NAMES = { bible: '聖書・神学', highschool: '高校', exam: '大学受験', daily: '日常会話' };
var LS_PROG = 'gogen.progress.v1';
var LS_SET = 'gogen.settings.v1';
var LS_SRS = 'gogen.srs.v1';
var LS_SRSMETA = 'gogen.srsmeta.v1';
var NEW_PER_DAY = 10;

var ALL = [], PACKS = [], ROOTS = {}, ROOTMAP = {};
var srs = {};                 // { 単語id: {ef, n, iv, due} } 間隔反復（簡易SM-2）
var srsMeta = { date: '', n: 0 }; // 今日出した新しい語の数
var rootSel = null;
var review = { mode: 'due', run: null };
var progress = {};            // { 単語id: 'known' | 'weak' }
var settings = { pack: 'all', cat: 'all', level: 0, speed: 'normal' };
var tab = 'home';
var cardList = [], cardIdx = 0, cardFlip = false;
var quiz = { dir: 'en2ja', run: null };
var searchQ = '';
var openHits = {};
var recMsg = '';

var $view = document.getElementById('view');

// ---------- 保存 ----------
function lsGet(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 保存不可でも動作は続ける */ } }
function loadState() {
  var p = lsGet(LS_PROG); if (p && typeof p === 'object') progress = p;
  var s = lsGet(LS_SET); if (s && typeof s === 'object') { for (var k in settings) if (k in s) settings[k] = s[k]; }
}
function saveProgress() { lsSet(LS_PROG, progress); }
function loadSrs() {
  var s = lsGet(LS_SRS); if (s && typeof s === 'object') srs = s;
  var m = lsGet(LS_SRSMETA); if (m && typeof m === 'object') srsMeta = m;
}
function saveSrs() { lsSet(LS_SRS, srs); lsSet(LS_SRSMETA, srsMeta); }
function fmtDate(d) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
function todayStr() { return fmtDate(new Date()); }
function addDays(n) { var d = new Date(); d.setDate(d.getDate() + n); return fmtDate(d); }
function saveSettings() { lsSet(LS_SET, settings); }

// ---------- 共通 ----------
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}
function shuffle(a) {
  a = a.slice();
  for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
  return a;
}
function byId(id) { for (var i = 0; i < ALL.length; i++) if (ALL[i].id === id) return ALL[i]; return null; }
function filtered() {
  return ALL.filter(function (w) {
    if (settings.pack !== 'all' && w._pack !== settings.pack) return false;
    if (settings.cat !== 'all' && w.category.indexOf(settings.cat) < 0) return false;
    if (settings.level && w.level !== settings.level) return false;
    return true;
  });
}
function meaningText(w, n) { return w.meaning.slice(0, n || 2).join('、'); }
function scopeText() {
  var parts = [];
  parts.push(settings.pack === 'all' ? '全パック' : (PACKS.filter(function (p) { return p.id === settings.pack; })[0] || { name: settings.pack }).name);
  if (settings.cat !== 'all') parts.push(CAT_NAMES[settings.cat]);
  if (settings.level) parts.push('Lv' + settings.level);
  return parts.join(' / ') + '：' + filtered().length + '語';
}
function statusTag(w) {
  var s = progress[w.id];
  return s === 'known' ? '<span class="tag known">覚えた</span>' : s === 'weak' ? '<span class="tag weak">苦手</span>' : '';
}
function unverifiedTag(w) { return w.verified ? '' : '<span class="tag unv">要確認</span>'; }

// ---------- 発音（Web Speech API） ----------
var voices = [];
function refreshVoices() { try { voices = window.speechSynthesis ? window.speechSynthesis.getVoices() : []; } catch (e) { voices = []; } }
function pickVoice() {
  var us = null, en = null;
  for (var i = 0; i < voices.length; i++) {
    var l = (voices[i].lang || '').replace('_', '-').toLowerCase();
    if (!us && l === 'en-us') us = voices[i];
    if (!en && l.indexOf('en') === 0) en = voices[i];
  }
  return us || en;
}
function notice(msg) {
  var el = document.getElementById('voiceNotice');
  if (!msg) { el.hidden = true; return; }
  el.textContent = msg; el.hidden = false;
}
var NO_VOICE = 'この端末には英語の音声データがありません。端末の設定（テキスト読み上げ）で英語（米国）の音声をインストールすると、🔊が使えます。';
function speak(text) {
  if (!('speechSynthesis' in window) || typeof SpeechSynthesisUtterance === 'undefined') {
    notice('このブラウザは読み上げに対応していません。Chrome などでお試しください。'); return;
  }
  refreshVoices();
  var v = pickVoice();
  if (voices.length > 0 && !v) { notice(NO_VOICE); return; }
  notice('');
  var synth = window.speechSynthesis;
  synth.cancel();
  var u = new SpeechSynthesisUtterance(text);
  u.lang = 'en-US';
  if (v) u.voice = v;
  u.rate = settings.speed === 'slow' ? 0.6 : 1;
  u.onerror = function (e) { if (e && (e.error === 'language-unavailable' || e.error === 'synthesis-unavailable' || e.error === 'voice-unavailable')) notice(NO_VOICE); };
  synth.speak(u);
}
function spk(text, cls) {
  return '<button class="speak ' + (cls || '') + '" data-speak="' + esc(text) + '" aria-label="発音を聞く">🔊</button>';
}

// ---------- 詳細表示 ----------
function pairs(list) {
  return list.map(function (x) { return esc(x.w) + '（' + esc(x.m) + '）'; }).join('、');
}
function rootMeaning(key) { return (ROOTS[key] && ROOTS[key].m) || ''; }
function backHtml(w, noRoot) {
  var h = '';
  h += '<div class="sec"><b>意味</b>' + esc(w.meaning.join('、')) + '</div>';
  h += '<div class="sec"><b>語源</b>' + esc(w.etymology);
  if (w.root) {
    h += '<br><span class="count">語根：' + esc(w.root) + (rootMeaning(w.root) ? '（' + esc(rootMeaning(w.root)) + '）' : '') + '</span>';
    var n = (ROOTMAP[w.root] || []).length;
    if (!noRoot && n > 1) h += '<br><button class="chip" data-root="' + esc(w.root) + '">この語根の仲間（' + n + '語）</button>';
  }
  h += '</div>';
  if (w.note) h += '<div class="sec"><b>覚え方</b>' + esc(w.note) + '</div>';
  if (w.synonyms.length) h += '<div class="sec"><b>類義語</b>' + pairs(w.synonyms) + '</div>';
  if (w.antonyms.length) h += '<div class="sec"><b>対義語</b>' + pairs(w.antonyms) + '</div>';
  if (w.related.length) h += '<div class="sec"><b>関連語</b>' + pairs(w.related) + '</div>';
  h += '<div class="sec"><b>例文</b>';
  w.examples.forEach(function (e) {
    h += '<div class="ex"><div class="exrow"><div><div class="en">' + esc(e.en) + '</div>' +
      (e.kjv ? '<div class="ref">KJV ' + esc(e.ref) + '</div>' : '') +
      '<div class="ja">' + esc(e.ja) + '</div></div>' + spk(e.en, 'sm') + '</div></div>';
  });
  h += '</div>';
  return h;
}
function frontHtml(w) {
  return '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><div class="word">' + esc(w.word) + '</div>' + spk(w.word) + '</div>' +
    '<div class="ipa">' + esc(w.ipa) + '</div>' +
    '<div class="pos">' + esc(w.pos) + '　' + w.category.map(function (c) { return '<span class="tag">' + esc(CAT_NAMES[c]) + '</span>'; }).join('') +
    '<span class="tag">Lv' + w.level + '</span>' + unverifiedTag(w) + statusTag(w) + '</div>';
}
function markHtml(w) {
  var s = progress[w.id];
  return '<div class="mark"><button class="btn ok ' + (s === 'known' ? 'on' : '') + '" data-mark="known" data-id="' + esc(w.id) + '">覚えた</button>' +
    '<button class="btn ng ' + (s === 'weak' ? 'on' : '') + '" data-mark="weak" data-id="' + esc(w.id) + '">苦手</button></div>';
}

// ---------- ホーム ----------
function chip(label, on, attrs) { return '<button class="chip ' + (on ? 'on' : '') + '" ' + attrs + '>' + esc(label) + '</button>'; }
function viewHome() {
  var h = '<h2>範囲</h2><div class="panel"><div class="chips">' +
    chip('全部', settings.pack === 'all', 'data-set="pack" data-v="all"') +
    PACKS.map(function (p) { return chip(p.name + '（' + p.count + '）', settings.pack === p.id, 'data-set="pack" data-v="' + esc(p.id) + '"'); }).join('') +
    '</div></div>';
  h += '<h2>分野</h2><div class="panel"><div class="chips">' +
    chip('全部', settings.cat === 'all', 'data-set="cat" data-v="all"') +
    Object.keys(CAT_NAMES).map(function (c) { return chip(CAT_NAMES[c], settings.cat === c, 'data-set="cat" data-v="' + c + '"'); }).join('') +
    '</div></div>';
  h += '<h2>レベル</h2><div class="panel"><div class="chips">' +
    chip('全部', !settings.level, 'data-set="level" data-v="0"') +
    chip('1 基礎', settings.level === 1, 'data-set="level" data-v="1"') +
    chip('2 標準', settings.level === 2, 'data-set="level" data-v="2"') +
    chip('3 発展', settings.level === 3, 'data-set="level" data-v="3"') + '</div></div>';
  h += '<h2>読み上げ速度</h2><div class="panel"><div class="chips">' +
    chip('ふつう', settings.speed === 'normal', 'data-set="speed" data-v="normal"') +
    chip('ゆっくり', settings.speed === 'slow', 'data-set="speed" data-v="slow"') +
    '<button class="chip" data-speak="Hello. This is a test of the voice.">🔊 試す</button></div></div>';
  h += '<p class="count">この条件に合う単語：' + filtered().length + '語</p>';
  var rs = reviewSummary();
  h += '<button class="btn" data-go="review">今日の復習（期限 ' + rs.due + '語・新しい語 ' + rs.fresh + '語）</button>';
  h += '<button class="btn sub" data-go="card">カードで学ぶ</button><button class="btn sub" data-go="quiz">クイズに挑戦</button><button class="btn sub" data-go="roots">語根でつながる語を見る</button>';
  h += '<p class="msg">語源・発音記号・訳は「要確認」の表示のあるものがあります。辞書で確かめてから使ってください。</p>';
  return h;
}

// ---------- カード ----------
function buildCards(keepOrder) {
  cardList = filtered();
  if (!keepOrder) cardList = cardList.slice();
  cardIdx = 0; cardFlip = false;
}
function viewCard() {
  if (!cardList.length) return '<p>この条件に合う単語がありません。ホームで条件を変えてください。</p>';
  if (cardIdx >= cardList.length) cardIdx = 0;
  var w = cardList[cardIdx];
  var h = '<div class="count">' + (cardIdx + 1) + ' / ' + cardList.length + '</div>';
  h += '<div class="panel flip" data-flip="1">' + frontHtml(w);
  if (cardFlip) h += backHtml(w); else h += '<div class="hint">カードをタップすると意味・語源・例文が出ます</div>';
  h += '</div>';
  h += markHtml(w);
  h += '<div class="nav"><button class="btn sub" data-card="prev">← 前</button><button class="btn" data-card="next">次 →</button></div>';
  h += '<button class="btn sub" data-card="shuffle">シャッフル</button>';
  return h;
}

// ---------- クイズ ----------
function startQuiz() {
  var pool = filtered();
  if (!pool.length) { quiz.run = { error: 'この条件に合う単語がありません。' }; return; }
  if (ALL.length < 4) { quiz.run = { error: '選択肢を作るには4語以上のデータが必要です。' }; return; }
  var picks = shuffle(pool).slice(0, 10);
  var qs = picks.map(function (w) { return makeQuestion(w, pool); });
  quiz.run = { qs: qs, i: 0, score: 0, answered: -1, wrong: [] };
}
function labelOf(w) { return quiz.dir === 'en2ja' ? meaningText(w, 2) : w.word; }
function makeQuestion(w, pool) {
  var correct = labelOf(w);
  var seen = {}; seen[correct] = 1;
  var opts = [{ id: w.id, label: correct }];
  var cands = shuffle(pool).concat(shuffle(ALL));
  for (var i = 0; i < cands.length && opts.length < 4; i++) {
    var c = cands[i]; var l = labelOf(c);
    if (c.id === w.id || seen[l]) continue;
    seen[l] = 1; opts.push({ id: c.id, label: l });
  }
  return { w: w, opts: shuffle(opts) };
}
function viewQuiz() {
  var r = quiz.run;
  var h = '';
  if (!r) {
    h += '<h2>出題の向き</h2><div class="panel"><div class="chips">' +
      chip('英語 → 日本語', quiz.dir === 'en2ja', 'data-qdir="en2ja"') +
      chip('日本語 → 英語', quiz.dir === 'ja2en', 'data-qdir="ja2en"') + '</div></div>';
    h += '<p class="count">範囲：' + esc(scopeText()) + '（最大10問）</p>';
    h += '<button class="btn" data-quiz="start">はじめる</button>';
    return h;
  }
  if (r.error) return '<p>' + esc(r.error) + '</p><button class="btn sub" data-quiz="reset">戻る</button>';
  if (r.i >= r.qs.length) {
    h += '<div class="panel"><div class="stat">' + r.score + ' / ' + r.qs.length + ' 正解</div></div>';
    if (r.wrong.length) {
      h += '<h2>間違えた語（「苦手」に入れました）</h2>';
      r.wrong.forEach(function (id) {
        var w = byId(id);
        h += '<div class="hit"><b>' + esc(w.word) + '</b> ' + esc(w.ipa) + '<br>' + esc(meaningText(w, 3)) + '</div>';
      });
    }
    h += '<button class="btn" data-quiz="start">もう一度</button><button class="btn sub" data-quiz="reset">向きを変える</button>';
    return h;
  }
  var q = r.qs[r.i];
  h += '<div class="count">' + (r.i + 1) + ' / ' + r.qs.length + '　正解 ' + r.score + '</div>';
  if (quiz.dir === 'en2ja') {
    h += '<div class="q" style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span>' + esc(q.w.word) + '</span>' + spk(q.w.word) + '</div><div class="ipa">' + esc(q.w.ipa) + '</div>';
  } else {
    h += '<div class="q ja">' + esc(meaningText(q.w, 3)) + '</div>';
  }
  q.opts.forEach(function (o, idx) {
    var cls = '';
    if (r.answered >= 0) {
      if (o.id === q.w.id) cls = 'ok'; else if (idx === r.answered) cls = 'ng';
    }
    h += '<button class="opt ' + cls + '" data-opt="' + idx + '"' + (r.answered >= 0 ? ' disabled' : '') + '>' + esc(o.label) + '</button>';
  });
  if (r.answered >= 0) {
    var ok = q.opts[r.answered].id === q.w.id;
    h += '<div class="panel"><b>' + (ok ? '正解！' : '残念…') + '</b><br>' + esc(q.w.word) + ' ' + esc(q.w.ipa) + ' ' + spk(q.w.word, 'sm') +
      '<br>' + esc(meaningText(q.w, 3)) + '<br><span class="count">' + esc(q.w.etymology) + '</span></div>';
    h += '<button class="btn" data-quiz="next">' + (r.i + 1 >= r.qs.length ? '結果を見る' : '次の問題') + '</button>';
  }
  return h;
}
function answerQuiz(idx) {
  var r = quiz.run;
  if (!r || r.answered >= 0) return;
  var q = r.qs[r.i];
  r.answered = idx;
  if (q.opts[idx].id === q.w.id) r.score++;
  else { r.wrong.push(q.w.id); progress[q.w.id] = 'weak'; saveProgress(); }
}

// ---------- 検索 ----------
function viewSearch() {
  var h = '<input type="search" id="q" placeholder="英語または日本語で検索" value="' + esc(searchQ) + '" autocomplete="off">';
  h += '<div id="hits">' + hitsHtml() + '</div>';
  return h;
}
function hitsHtml() {
  var q = searchQ.trim().toLowerCase();
  if (!q) return '<p class="msg">全パックから探します（分野・レベルの絞り込みは使いません）。</p>';
  var res = ALL.filter(function (w) {
    if (w.word.toLowerCase().indexOf(q) >= 0) return true;
    if (w.meaning.join(' ').toLowerCase().indexOf(q) >= 0) return true;
    return false;
  });
  if (!res.length) return '<p class="msg">見つかりませんでした。</p>';
  var h = '<p class="count">' + res.length + '件</p>';
  res.slice(0, 50).forEach(function (w) {
    h += '<div class="hit"><div class="t" data-hit="' + esc(w.id) + '"><b>' + esc(w.word) + '</b><span>' + esc(meaningText(w, 2)) + '</span></div>';
    if (openHits[w.id]) h += frontHtml(w) + backHtml(w) + markHtml(w);
    h += '</div>';
  });
  if (res.length > 50) h += '<p class="msg">先頭50件のみ表示しています。</p>';
  return h;
}

// ---------- 復習（間隔反復・簡易SM-2） ----------
function newAvailable() { return Math.max(0, NEW_PER_DAY - (srsMeta.date === todayStr() ? srsMeta.n : 0)); }
function dueWords() {
  var t = todayStr();
  return filtered().filter(function (w) { return srs[w.id] && srs[w.id].due <= t; })
    .sort(function (a, b) { return srs[a.id].due < srs[b.id].due ? -1 : 1; });
}
function freshWords() { return filtered().filter(function (w) { return !srs[w.id]; }); }
function weakWords() { return filtered().filter(function (w) { return progress[w.id] === 'weak'; }); }
function reviewSummary() {
  return { due: dueWords().length, fresh: Math.min(newAvailable(), freshWords().length), weak: weakWords().length };
}
function sm2(s, q) {   // q: 1=もう一度 3=むずかしい 4=ふつう 5=かんたん
  var ef = Math.max(1.3, s.ef + 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (q < 3) return { ef: ef, n: 0, iv: 0 };
  var n = s.n + 1;
  var iv = n === 1 ? 1 : n === 2 ? 3 : Math.round(s.iv * ef);
  return { ef: ef, n: n, iv: iv };
}
function srsOf(id) { return srs[id] || { ef: 2.5, n: 0, iv: 0, due: todayStr() }; }
function startReview() {
  var ids;
  if (review.mode === 'weak') ids = shuffle(weakWords()).map(function (w) { return w.id; });
  else ids = dueWords().concat(shuffle(freshWords()).slice(0, newAvailable())).map(function (w) { return w.id; });
  review.run = ids.length ? { queue: ids, i: 0, shown: false, seen: {}, cnt: { 1: 0, 3: 0, 4: 0, 5: 0 } } : { empty: true };
}
function gradeReview(q) {
  var r = review.run; if (!r || r.i >= r.queue.length) return;
  var id = r.queue[r.i];
  var isNew = !srs[id];
  var res = sm2(srsOf(id), q);
  srs[id] = { ef: res.ef, n: res.n, iv: res.iv, due: res.iv ? addDays(res.iv) : todayStr() };
  if (isNew && !r.seen[id]) {
    if (srsMeta.date !== todayStr()) srsMeta = { date: todayStr(), n: 0 };
    srsMeta.n++;
  }
  r.seen[id] = 1; r.cnt[q]++;
  if (q < 3) { progress[id] = 'weak'; r.queue.push(id); }
  else if (q === 5) progress[id] = 'known';
  saveSrs(); saveProgress();
  r.i++; r.shown = false;
}
function ivLabel(q) {
  var r = review.run, id = r.queue[r.i];
  var res = sm2(srsOf(id), q);
  return res.iv ? res.iv + '日後' : 'すぐ';
}
function viewReview() {
  var r = review.run, h = '';
  if (!r) {
    var rs = reviewSummary();
    h += '<h2>復習のしかた</h2><div class="panel"><div class="chips">' +
      chip('期限のきた語＋新しい語', review.mode === 'due', 'data-rmode="due"') +
      chip('苦手な語だけ', review.mode === 'weak', 'data-rmode="weak"') + '</div></div>';
    h += '<div class="statrow"><div><span class="stat">' + rs.due + '</span><small>期限のきた語</small></div>' +
      '<div><span class="stat">' + rs.fresh + '</span><small>新しい語（今日の枠）</small></div>' +
      '<div><span class="stat">' + rs.weak + '</span><small>苦手な語</small></div></div>';
    var n = review.mode === 'weak' ? rs.weak : rs.due + rs.fresh;
    h += '<p class="count">範囲：' + esc(scopeText()) + '（ホームで変えられます）</p>';
    h += n ? '<button class="btn" data-review="start">はじめる（' + n + '語）</button>' : '<p class="msg">今は復習する語がありません。ホームの範囲を変えるか、明日また来てください。</p>';
    h += '<p class="msg">答えを見たあとに4段階で選ぶと、次に出る日が決まります（忘れそうな頃に再出題）。「もう一度」は苦手に、「かんたん」は覚えたに自動で入ります。新しい語は1日' + NEW_PER_DAY + '語までです。</p>';
    return h;
  }
  if (r.empty) return '<p>復習する語がありません。</p><button class="btn sub" data-review="reset">戻る</button>';
  if (r.i >= r.queue.length) {
    h += '<div class="panel"><div class="stat">おつかれさまでした</div><p>' + Object.keys(r.seen).length + '語を復習しました。<br>' +
      'もう一度 ' + r.cnt[1] + '／むずかしい ' + r.cnt[3] + '／ふつう ' + r.cnt[4] + '／かんたん ' + r.cnt[5] + '</p></div>';
    h += '<button class="btn" data-review="reset">戻る</button>';
    return h;
  }
  var w = byId(r.queue[r.i]);
  h += '<div class="count">' + (r.i + 1) + ' / ' + r.queue.length + '</div>';
  h += '<div class="panel">' + frontHtml(w);
  if (r.shown) h += backHtml(w, true);
  h += '</div>';
  if (!r.shown) h += '<button class="btn" data-review="show">答えを見る</button>';
  else h += '<div class="grade">' +
    [[1, 'もう一度'], [3, 'むずかしい'], [4, 'ふつう'], [5, 'かんたん']].map(function (g) {
      return '<button class="btn g' + g[0] + '" data-grade="' + g[0] + '">' + g[1] + '<small>' + ivLabel(g[0]) + '</small></button>';
    }).join('') + '</div>';
  h += '<button class="btn sub" data-review="reset">やめる</button>';
  return h;
}

// ---------- 語根ネットワーク ----------
function viewRoots() {
  if (rootSel) return viewRootDetail(rootSel);
  var keys = Object.keys(ROOTMAP).sort(function (a, b) { return ROOTMAP[b].length - ROOTMAP[a].length || (a < b ? -1 : 1); });
  var multi = keys.filter(function (k) { return ROOTMAP[k].length > 1; });
  var single = keys.filter(function (k) { return ROOTMAP[k].length === 1; });
  var h = '<p class="msg">同じ語根でつながる単語を、全パックまたいで探せます。語根をタップしてください。</p>';
  function row(k) {
    return '<div class="hit"><div class="t" data-root="' + esc(k) + '"><b>' + esc(k) + '</b><span>' + esc(rootMeaning(k)) + '・' + ROOTMAP[k].length + '語</span></div>' +
      '<div class="count">' + ROOTMAP[k].slice(0, 6).map(function (w) { return esc(w.word); }).join('、') + (ROOTMAP[k].length > 6 ? ' …' : '') + '</div></div>';
  }
  h += '<h2>仲間のいる語根（' + multi.length + '）</h2>' + multi.map(row).join('');
  if (single.length) h += '<h2>いまは1語だけの語根（' + single.length + '）</h2>' + single.map(row).join('');
  return h;
}
function viewRootDetail(key) {
  var list = (ROOTMAP[key] || []).slice().sort(function (a, b) { return a.word < b.word ? -1 : 1; });
  var h = '<button class="btn sub sm" data-rootback="1">← 語根一覧</button>';
  h += '<div class="panel"><div class="word">' + esc(key) + '</div><div>' + esc(rootMeaning(key)) + '</div>' +
    (ROOTS[key] && ROOTS[key].ex ? '<div class="count">例：' + esc(ROOTS[key].ex) + '</div>' : '') +
    '<div class="count">' + list.length + '語</div></div>';
  list.forEach(function (w) {
    h += '<div class="hit"><div class="t" data-hit="' + esc(w.id) + '"><b>' + esc(w.word) + '</b><span>' + esc(meaningText(w, 2)) + '</span></div>';
    if (openHits[w.id]) h += frontHtml(w) + backHtml(w, true) + markHtml(w);
    h += '</div>';
  });
  return h;
}

// ---------- 記録 ----------
function barHtml(label, list) {
  var k = 0, wk = 0;
  list.forEach(function (w) { if (progress[w.id] === 'known') k++; else if (progress[w.id] === 'weak') wk++; });
  var t = list.length || 1;
  return '<div class="prow"><div class="plabel"><span>' + esc(label) + '</span><span>覚えた ' + k + '・苦手 ' + wk + ' / ' + list.length + '語（' + Math.round(k * 100 / t) + '%）</span></div>' +
    '<div class="bar"><i class="k" style="width:' + (k * 100 / t) + '%"></i><i class="w" style="width:' + (wk * 100 / t) + '%"></i></div></div>';
}
function progressHtml() {
  var h = '<h2>進み具合</h2><div class="panel">';
  h += barHtml('全体', ALL);
  h += '<div class="legend"><i class="k"></i>覚えた <i class="w"></i>苦手 <i class="u"></i>未学習</div>';
  h += '<b class="sub2">分野別</b>';
  Object.keys(CAT_NAMES).forEach(function (c) {
    h += barHtml(CAT_NAMES[c], ALL.filter(function (w) { return w.category.indexOf(c) >= 0; }));
  });
  if (PACKS.length > 1) {
    h += '<b class="sub2">パック別</b>';
    PACKS.forEach(function (p) { h += barHtml(p.name, ALL.filter(function (w) { return w._pack === p.id; })); });
  }
  var t = todayStr(), tm = addDays(1), wk = addDays(7), started = 0, due = 0, tomorrow = 0, week = 0;
  ALL.forEach(function (w) {
    var s = srs[w.id]; if (!s) return;
    started++;
    if (s.due <= t) due++; else if (s.due === tm) tomorrow++; else if (s.due <= wk) week++;
  });
  h += '<b class="sub2">復習の予定（間隔反復）</b><div class="statrow">' +
    '<div><span class="stat">' + started + '</span><small>復習を始めた語</small></div>' +
    '<div><span class="stat">' + due + '</span><small>今日まで</small></div>' +
    '<div><span class="stat">' + tomorrow + '</span><small>明日</small></div>' +
    '<div><span class="stat">' + week + '</span><small>7日以内</small></div></div>';
  h += '</div>';
  return h;
}
function viewRecord() {
  var known = 0, weak = 0;
  ALL.forEach(function (w) { if (progress[w.id] === 'known') known++; else if (progress[w.id] === 'weak') weak++; });
  var h = '<div class="statrow"><div><span class="stat">' + known + '</span><small>覚えた</small></div>' +
    '<div><span class="stat">' + weak + '</span><small>苦手</small></div>' +
    '<div><span class="stat">' + (ALL.length - known - weak) + '</span><small>未学習</small></div></div>';
  h += progressHtml();
  h += '<h2>バックアップ</h2><div class="panel"><p class="msg">記録はこの端末のブラウザの中にだけ保存されています。機種変更やブラウザのデータ削除に備えて、ときどき書き出してください。</p>' +
    '<button class="btn sm" data-rec="export">記録を書き出す</button>' +
    '<button class="btn sm sub" data-rec="import">記録を読み込む</button>' +
    '<input type="file" id="impfile" accept="application/json,.json" hidden>' +
    (recMsg ? '<p class="msg"><b>' + esc(recMsg) + '</b></p>' : '') + '</div>';
  var weakList = ALL.filter(function (w) { return progress[w.id] === 'weak'; });
  h += '<h2>苦手な語（' + weakList.length + '）</h2>';
  if (!weakList.length) h += '<p class="msg">まだありません。</p>';
  weakList.forEach(function (w) {
    h += '<div class="hit"><div class="t" data-hit="' + esc(w.id) + '"><b>' + esc(w.word) + '</b><span>' + esc(meaningText(w, 2)) + '</span></div>';
    if (openHits[w.id]) h += frontHtml(w) + backHtml(w) + markHtml(w);
    h += '</div>';
  });
  h += '<h2>記録の消去</h2><button class="btn sub sm" data-rec="reset">すべての記録を消す</button>';
  return h;
}
function exportProgress() {
  var data = { app: 'gogen-vocab', version: 2, exportedAt: new Date().toISOString(), progress: progress, srs: srs };
  var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
  var a = document.createElement('a');
  var d = new Date();
  var stamp = d.getFullYear() + ('0' + (d.getMonth() + 1)).slice(-2) + ('0' + d.getDate()).slice(-2);
  a.href = URL.createObjectURL(blob);
  a.download = 'gogen-vocab-progress-' + stamp + '.json';
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  recMsg = '書き出しました（' + Object.keys(progress).length + '語分）。ダウンロードフォルダを確認してください。';
}
function importProgress(file) {
  var rd = new FileReader();
  rd.onload = function () {
    try {
      var d = JSON.parse(rd.result);
      var p = d && d.progress;
      if (!p || typeof p !== 'object') throw new Error('形式が違います');
      var n = 0;
      for (var id in p) { if (p[id] === 'known' || p[id] === 'weak') { progress[id] = p[id]; n++; } }
      saveProgress();
      var ns = 0, sp = d.srs;
      if (sp && typeof sp === 'object') {
        for (var sid in sp) {
          var e = sp[sid];
          if (e && typeof e.ef === 'number' && typeof e.n === 'number' && typeof e.iv === 'number' && /^\d{4}-\d{2}-\d{2}$/.test(e.due)) { srs[sid] = { ef: e.ef, n: e.n, iv: e.iv, due: e.due }; ns++; }
        }
        saveSrs();
      }
      recMsg = '読み込みました（覚えた／苦手 ' + n + '語分' + (ns ? '、復習予定 ' + ns + '語分' : '') + '。今の記録に統合しました）。';
    } catch (e) { recMsg = '読み込めませんでした：' + e.message; }
    render();
  };
  rd.readAsText(file);
}

// ---------- 描画 ----------
function render() {
  document.getElementById('scopeLabel').textContent = ALL.length ? scopeText() : '';
  Array.prototype.forEach.call(document.querySelectorAll('#tabs button'), function (b) { b.classList.toggle('on', b.dataset.tab === tab); });
  var h = '';
  if (!ALL.length) h = '<p>単語データを読み込み中です…</p>';
  else if (tab === 'home') h = viewHome();
  else if (tab === 'card') h = viewCard();
  else if (tab === 'quiz') h = viewQuiz();
  else if (tab === 'review') h = viewReview();
  else if (tab === 'roots') h = viewRoots();
  else if (tab === 'search') h = viewSearch();
  else if (tab === 'record') h = viewRecord();
  var keep = (tab === 'search' && document.activeElement && document.activeElement.id === 'q');
  if (!keep) $view.innerHTML = h;
}
function goTab(t) {
  tab = t;
  if (t === 'card') buildCards();
  if (t === 'quiz') quiz.run = null;
  if (t === 'roots') rootSel = null;
  render();
  window.scrollTo(0, 0);
}

// ---------- イベント ----------
document.getElementById('tabs').addEventListener('click', function (e) {
  var b = e.target.closest('button'); if (b) goTab(b.dataset.tab);
});
$view.addEventListener('input', function (e) {
  if (e.target.id === 'q') { searchQ = e.target.value; document.getElementById('hits').innerHTML = hitsHtml(); }
});
$view.addEventListener('change', function (e) {
  if (e.target.id === 'impfile' && e.target.files[0]) importProgress(e.target.files[0]);
});
$view.addEventListener('click', function (e) {
  var t = e.target;
  var el;
  if ((el = t.closest('[data-speak]'))) { e.stopPropagation(); speak(el.dataset.speak); return; }
  if ((el = t.closest('[data-mark]'))) {
    var id = el.dataset.id, m = el.dataset.mark;
    if (progress[id] === m) delete progress[id]; else progress[id] = m;
    saveProgress(); renderKeepScroll(); return;
  }
  if ((el = t.closest('[data-set]'))) {
    var k = el.dataset.set, v = el.dataset.v;
    settings[k] = (k === 'level') ? parseInt(v, 10) : v;
    saveSettings(); render(); return;
  }
  if ((el = t.closest('[data-go]'))) { goTab(el.dataset.go); return; }
  if ((el = t.closest('[data-root]'))) { rootSel = el.dataset.root; tab = 'roots'; render(); window.scrollTo(0, 0); return; }
  if ((el = t.closest('[data-rootback]'))) { rootSel = null; render(); window.scrollTo(0, 0); return; }
  if ((el = t.closest('[data-rmode]'))) { review.mode = el.dataset.rmode; render(); return; }
  if ((el = t.closest('[data-review]'))) {
    var ra2 = el.dataset.review;
    if (ra2 === 'start') startReview();
    else if (ra2 === 'reset') review.run = null;
    else if (ra2 === 'show' && review.run) review.run.shown = true;
    render(); window.scrollTo(0, 0); return;
  }
  if ((el = t.closest('[data-grade]'))) { gradeReview(parseInt(el.dataset.grade, 10)); render(); window.scrollTo(0, 0); return; }
  if ((el = t.closest('[data-card]'))) {
    var a = el.dataset.card;
    if (a === 'next') { cardIdx = (cardIdx + 1) % cardList.length; cardFlip = false; }
    else if (a === 'prev') { cardIdx = (cardIdx - 1 + cardList.length) % cardList.length; cardFlip = false; }
    else if (a === 'shuffle') { cardList = shuffle(cardList); cardIdx = 0; cardFlip = false; }
    render(); window.scrollTo(0, 0); return;
  }
  if ((el = t.closest('[data-flip]'))) { cardFlip = !cardFlip; render(); return; }
  if ((el = t.closest('[data-qdir]'))) { quiz.dir = el.dataset.qdir; render(); return; }
  if ((el = t.closest('[data-quiz]'))) {
    var qa = el.dataset.quiz;
    if (qa === 'start') startQuiz();
    else if (qa === 'reset') quiz.run = null;
    else if (qa === 'next') { quiz.run.i++; quiz.run.answered = -1; }
    render(); window.scrollTo(0, 0); return;
  }
  if ((el = t.closest('[data-opt]'))) { answerQuiz(parseInt(el.dataset.opt, 10)); render(); return; }
  if ((el = t.closest('[data-hit]'))) {
    var hid = el.dataset.hit; openHits[hid] = !openHits[hid];
    if (tab === 'search') document.getElementById('hits').innerHTML = hitsHtml(); else render();
    return;
  }
  if ((el = t.closest('[data-rec]'))) {
    var ra = el.dataset.rec;
    if (ra === 'export') { exportProgress(); render(); }
    else if (ra === 'import') document.getElementById('impfile').click();
    else if (ra === 'reset') {
      if (window.confirm('すべての学習記録（覚えた・苦手・復習予定）を消します。よろしいですか？（先に書き出しておくと安心です）')) { progress = {}; srs = {}; srsMeta = { date: '', n: 0 }; saveProgress(); saveSrs(); review.run = null; recMsg = '記録を消しました。'; render(); }
    }
    return;
  }
});
function renderKeepScroll() {
  var y = window.scrollY;
  if (tab === 'search') document.getElementById('hits').innerHTML = hitsHtml(); else render();
  window.scrollTo(0, y);
}

// ---------- 起動 ----------
function fetchJson(url) {
  return fetch(url, { cache: 'no-cache' }).then(function (r) {
    if (!r.ok) throw new Error(url + ' (' + r.status + ')');
    return r.json();
  });
}
function load() {
  loadState(); loadSrs();
  fetchJson('data/packs.json').then(function (meta) {
    PACKS = meta.packs;
    return Promise.all(PACKS.map(function (p) {
      return fetchJson('data/' + p.file).then(function (words) {
        words.forEach(function (w) { w._pack = p.id; });
        return words;
      });
    }));
  }).then(function (lists) {
    var seen = {};
    lists.forEach(function (l) { l.forEach(function (w) { if (!seen[w.id]) { seen[w.id] = 1; ALL.push(w); } }); });
    if (settings.pack !== 'all' && !PACKS.some(function (p) { return p.id === settings.pack; })) settings.pack = 'all';
    ALL.forEach(function (w) { if (w.root) (ROOTMAP[w.root] = ROOTMAP[w.root] || []).push(w); });
    return fetchJson('data/roots.json').then(function (r) { ROOTS = r; }, function () { ROOTS = {}; });
  }).then(function () {
    render();
  }).catch(function (err) {
    $view.innerHTML = '<p>単語データを読み込めませんでした。</p><p class="msg">' + esc(err.message) +
      '<br>ファイルを直接開かず、tools/serve.py か公開URLから開いてください。</p>';
  });
}
if ('speechSynthesis' in window) {
  refreshVoices();
  window.speechSynthesis.onvoiceschanged = refreshVoices;
}
// ローカル確認用サーバーにだけ heartbeat を送る（公開版では何もしない）
if (location.hostname === '127.0.0.1' || location.hostname === 'localhost') {
  var beat = function () { fetch('/__heartbeat', { cache: 'no-store' }).catch(function () {}); };
  beat(); setInterval(beat, 3000);
}
load();
// PWA（ホーム画面に追加・オフライン動作）。https か localhost のときだけ登録する
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
}
})();
