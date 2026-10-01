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
let lyrics = [];          // [{time: 秒, text: "歌词"}]
let lyricEls = [];        // 对应的 DOM 元素
let activeLyricIdx = -1;
let isDragging = false;   // 进度条是否正在拖动

/* ============ LRC 解析 ============ */
function parseLRC(text) {
  const result = [];
  // 支持 [mm:ss]、[mm:ss.xx]、[mm:ss.xxx]
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

/* ============ 加载歌词（支持内嵌文本或 .lrc 路径）============ */
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

    // ✅ 用 pointerup，阻止冒泡到进度条，且只在 metadata 加载后跳转
    div.addEventListener('pointerup', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (audio.readyState >= 1 && audio.duration) {
        audio.currentTime = item.time;
        // 保持当前播放/暂停状态，不强制 play
      }
    });

    lyricsBox.appendChild(div);
    lyricEls.push(div);
  });

  setActiveLyric(0);
}

/* ============ 高亮 + 滚动到中央（修复版）============ */
function setActiveLyric(index) {
  if (index === activeLyricIdx) return;
  if (activeLyricIdx >= 0 && lyricEls[activeLyricIdx]) {
    lyricEls[activeLyricIdx].classList.remove('active');
  }
  if (index >= 0 && index < lyricEls.length) {
    const el = lyricEls[index];
    el.classList.add('active');
    // .lyrics 是 position:relative，offsetTop 相对它计算
    const targetTop = el.offsetTop - (lyricsBox.clientHeight - el.offsetHeight) / 2;
    lyricsBox.scrollTo({ top: targetTop, behavior: 'smooth' });
  }
  activeLyricIdx = index;
}

/* ============ 根据时间找歌词索引 ============ */
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

  // 清空旧歌词状态，防止点击残留
  lyricEls = [];
  activeLyricIdx = -1;

  audio.src = song.src;
  audio.load();

  const lyricData = await loadLyrics(song.lrc);
  renderLyrics(lyricData);

  progressFill.style.width = '0%';
  curTimeEl.textContent = '0:00';

  if (autoPlay) audio.play().catch(e => console.log('自动播放被阻止:', e));
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

/* ============ 渲染播放列表 ============ */
function renderPlaylist() {
  playlistEl.innerHTML = '';
  songs.forEach((s, i) => {
    const div = document.createElement('div');
    div.className = 'playlist-item';
    div.innerHTML = `<span>${i + 1}. ${s.title}</span><span class="dur">${s.artist}</span>`;
    div.addEventListener('click', () => loadSong(i, true));
    playlistEl.appendChild(div);
  });
}

/* ========================================================
   ✅ 进度条：点击 + 拖动（鼠标 & 触摸统一用 pointer 事件）
   ======================================================== */
function seekTo(clientX) {
  if (!audio.duration) return;
  const rect = progressBar.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  audio.currentTime = ratio * audio.duration;
  // 立即更新 UI，不等 timeupdate
  progressFill.style.width = (ratio * 100) + '%';
  curTimeEl.textContent = fmt(ratio * audio.duration);
}

progressBar.addEventListener('pointerdown', (e) => {
  if (!audio.duration) return;
  isDragging = true;
  // 捕获指针，滑出进度条范围也能继续响应
  try { progressBar.setPointerCapture(e.pointerId); } catch (err) { }
  seekTo(e.clientX);
  e.preventDefault();
});

progressBar.addEventListener('pointermove', (e) => {
  if (!isDragging) return;
  seekTo(e.clientX);
  e.preventDefault();
});

progressBar.addEventListener('pointerup', (e) => {
  isDragging = false;
  try { progressBar.releasePointerCapture(e.pointerId); } catch (err) { }
});

progressBar.addEventListener('pointercancel', () => {
  isDragging = false;
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
  // 拖动时先不刷新，避免和手动 seek 打架
  if (!isDragging) updateProgress();
  if (lyrics.length) {
    const idx = findLyricIndex(audio.currentTime);
    if (idx !== -1) setActiveLyric(idx);
  }
});

/* ============ 初始化 ============ */
renderPlaylist();
loadSong(0, false);