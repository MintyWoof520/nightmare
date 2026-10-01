/* ============ 歌曲列表：加歌就加一条 ============ */
const songs = [
  {
    title: "抑人（开门live版）",
    artist: "门尼",
    src: "Music/抑人（开门live版）.mp3",
    lrc: "Music/抑人（开门live版）.lrc"
  },
  {
    title: "看门狗",
    artist: "门尼",
    src: "Music/看门狗.mp3",
    lrc: "Music/看门狗.lrc"
  },
  {
    title: "没有了（The End）",
    artist: "门尼",
    src: "Music/没有了.mp3",
    lrc: "Music/没有了.lrc"
  },
  {
    title: "呜（The Ember）",
    artist: "门尼",
    src: "Music/呜.mp3",
    lrc: "Music/呜.lrc"
  }
];

/* ============ 元素引用 ============ */
const audio = document.getElementById('audio');
const playBtn = document.getElementById('playBtn');
const playIcon = document.getElementById('playIcon');
const pauseIcon = document.getElementById('pauseIcon');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const curTimeEl = document.getElementById('curTime');
const totTimeEl = document.getElementById('totTime');
const lyricsBox = document.getElementById('lyricsBox');
const songTitle = document.getElementById('songTitle');
const songArtist = document.getElementById('songArtist');
const playlistEl = document.getElementById('playlist');

/* ============ 状态 ============ */
let currentIndex = 0;
let lyrics = [];
let lyricEls = [];
let activeLyricIdx = -1;
let isDragging = false;   // 移动端拖动标志

/* ============ LRC 解析 ============ */
function parseLRC(text) {
  const result = [];
  const timeReg = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const times = [];
    let m;
    timeReg.lastIndex = 0;
    while ((m = timeReg.exec(line)) !== null) {
      const ms = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
      times.push(parseInt(m[1], 10) * 60 + parseInt(m[2], 10) + ms / 1000);
    }
    if (!times.length) continue;
    const content = line.replace(timeReg, '').trim();
    if (!content) continue;
    times.forEach(t => result.push({ time: t, text: content }));
  }
  return result.sort((a, b) => a.time - b.time);
}

/* ============ 加载歌词 ============ */
async function loadLyrics(source) {
  if (!source) return [];
  if (source.includes('\n')) return parseLRC(source);
  try {
    const res = await fetch(source);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return parseLRC(await res.text());
  } catch (e) {
    console.warn('歌词加载失败:', source, e.message);
    return [];
  }
}

/* ============ 渲染歌词 ============ */
function renderLyrics(data) {
  lyrics = data;
  lyricEls = [];
  activeLyricIdx = -1;
  lyricsBox.innerHTML = '';

  if (!lyrics.length) {
    lyricsBox.innerHTML = '<div class="lyric-line" style="opacity:.4;">♪ 暂无歌词 ♪</div>';
    return;
  }

  lyrics.forEach((item) => {
    const div = document.createElement('div');
    div.className = 'lyric-line';
    div.textContent = item.text;

    // ✅ 用 click，简单可靠。移动端 click 也能用（有 300ms 延迟但可接受）
    div.addEventListener('click', (e) => {
      e.stopPropagation();               // 防止冒泡
      if (isDragging) return;            // 拖动进度条时忽略
      if (audio.readyState >= 1 && audio.duration) {
        audio.currentTime = item.time;
      }
    });

    lyricsBox.appendChild(div);
    lyricEls.push(div);
  });

  setActiveLyric(0);
}

/* ============ 高亮 + 滚动 ============ */
function setActiveLyric(index) {
  if (index === activeLyricIdx) return;
  if (activeLyricIdx >= 0 && lyricEls[activeLyricIdx]) {
    lyricEls[activeLyricIdx].classList.remove('active');
  }
  if (index >= 0 && index < lyricEls.length) {
    const el = lyricEls[index];
    el.classList.add('active');
    const targetTop = el.offsetTop - (lyricsBox.clientHeight - el.offsetHeight) / 2;
    lyricsBox.scrollTo({ top: targetTop, behavior: 'smooth' });
  }
  activeLyricIdx = index;
}

/* ============ 歌词索引 ============ */
function findLyricIndex(time) {
  let idx = -1;
  for (let i = 0; i < lyrics.length; i++) {
    if (time >= lyrics[i].time) idx = i;
    else break;
  }
  return idx;
}

/* ============ 时间格式化 ============ */
function fmt(sec) {
  if (!sec || isNaN(sec)) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

/* ============ 加载歌曲 ============ */
async function loadSong(index, autoPlay = false) {
  currentIndex = (index + songs.length) % songs.length;
  const song = songs[currentIndex];

  songTitle.textContent = song.title;
  songArtist.textContent = song.artist;

  document.querySelectorAll('.playlist-item').forEach((el, i) => {
    el.classList.toggle('active', i === currentIndex);
  });

  lyricEls = [];
  activeLyricIdx = -1;

  audio.src = song.src;
  audio.load();

  const lyricData = await loadLyrics(song.lrc);
  renderLyrics(lyricData);

  progressFill.style.width = '0%';
  curTimeEl.textContent = '0:00';

  if (autoPlay) audio.play().catch(e => console.log(e));
}

/* ============ 播放/暂停 ============ */
function togglePlay() {
  if (!audio.src) { loadSong(0, true); return; }
  audio.paused ? audio.play().catch(e => console.log(e)) : audio.pause();
}

function updatePlayIcon() {
  const playing = !audio.paused;
  playIcon.style.display = playing ? 'none' : 'block';
  pauseIcon.style.display = playing ? 'block' : 'none';
}

/* ============ 进度条更新 ============ */
function updateProgress() {
  const cur = audio.currentTime;
  const dur = audio.duration || 0;
  curTimeEl.textContent = fmt(cur);
  totTimeEl.textContent = fmt(dur);
  progressFill.style.width = dur ? (cur / dur * 100) + '%' : '0%';
}

/* ============ 播放列表 ============ */
function renderPlaylist() {
  playlistEl.innerHTML = '';
  songs.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'playlist-item';
    div.innerHTML = `<span>${i + 1}. ${s.title}</span><span class="dur">${s.artist}</span>`;
    div.addEventListener('click', () => {
      if (isDragging) return;
      loadSong(i, true);
    });
    playlistEl.appendChild(div);
  });
}

/* ========================================================
   ✅ 进度条：桌面用 click，移动端用 touch —— 分开处理，互不干扰
   ======================================================== */

// 纯计算，不掺任何事件处理
function seekToClientX(clientX) {
  if (!audio.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
  // 立即更新 UI
  progressFill.style.width = (ratio * 100) + '%';
  curTimeEl.textContent = fmt(ratio * audio.duration);
}

/* ----- 桌面端：click ----- */
progressBar.addEventListener('click', (e) => {
  if (isDragging) return;     // 移动端刚拖完，忽略这次 click
  seekToClientX(e.clientX);
});

/* ----- 移动端：touch ----- */
progressBar.addEventListener('touchstart', (e) => {
  if (!audio.duration) return;
  isDragging = true;
  seekToClientX(e.touches[0].clientX);
  // ⚠️ 注意：这里不 preventDefault，由 CSS touch-action: none 阻止滚动
}, { passive: true });

progressBar.addEventListener('touchmove', (e) => {
  if (!isDragging) return;
  seekToClientX(e.touches[0].clientX);
}, { passive: true });

progressBar.addEventListener('touchend', () => {
  // 延迟解除，等 click 幽灵事件过去
  setTimeout(() => { isDragging = false; }, 150);
});

progressBar.addEventListener('touchcancel', () => {
  setTimeout(() => { isDragging = false; }, 150);
});

/* ============ 事件绑定 ============ */
playBtn.addEventListener('click', togglePlay);
prevBtn.addEventListener('click', () => loadSong(currentIndex - 1, !audio.paused));
nextBtn.addEventListener('click', () => loadSong(currentIndex + 1, !audio.paused));

audio.addEventListener('play', updatePlayIcon);
audio.addEventListener('pause', updatePlayIcon);
audio.addEventListener('ended', () => loadSong(currentIndex + 1, true));
audio.addEventListener('loadedmetadata', updateProgress);

audio.addEventListener('timeupdate', () => {
  if (!isDragging) updateProgress();
  if (lyrics.length) {
    const idx = findLyricIndex(audio.currentTime);
    if (idx !== -1) setActiveLyric(idx);
  }
});

/* ============ 初始化 ============ */
renderPlaylist();
loadSong(0, false);