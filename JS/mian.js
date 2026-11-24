/* 章节页交互逻辑（优化版 + 全局字色 + 自定义主题 + 自定义背景 + 打字机 + 字体缩放 + 全文连播 + 阅读记忆） */
(function () {
    'use strict';

    /* =========================================
       0. 阅读设置：字体缩放 + 打字机
       ========================================= */
    const READ_SETTINGS_KEY = 'nightmare-read-settings';
    const AUTO_CONTINUE_KEY = 'nightmare-auto-continue';   // 记录"是连播跳章过来的"
    const DEFAULT_READ_SETTINGS = {
        fontScale: 1, typewriter: true, typeSpeed: 35,
        chatMode: true,   // 真实聊天模式：正在输入… → 整条发送
        chatSound: true,  // 发送音效
        autoPlay: false,  // 自动连播（全书）
        autoSpeed: 1      // 连播倍速
    };

    const readSettings = (function () {
        try {
            const raw = JSON.parse(localStorage.getItem(READ_SETTINGS_KEY) || '{}');
            return {
                fontScale: typeof raw.fontScale === 'number'
                    ? Math.min(1.6, Math.max(0.8, raw.fontScale))
                    : DEFAULT_READ_SETTINGS.fontScale,
                typewriter: raw.typewriter !== false,
                typeSpeed: typeof raw.typeSpeed === 'number'
                    ? Math.min(120, Math.max(8, raw.typeSpeed))
                    : DEFAULT_READ_SETTINGS.typeSpeed,
                chatMode: raw.chatMode !== false,
                chatSound: raw.chatSound !== false,
                autoPlay: raw.autoPlay === true,
                autoSpeed: typeof raw.autoSpeed === 'number'
                    ? Math.min(3, Math.max(0.5, raw.autoSpeed))
                    : DEFAULT_READ_SETTINGS.autoSpeed
            };
        } catch (e) {
            return Object.assign({}, DEFAULT_READ_SETTINGS);
        }
    })();

    function persistReadSettings() {
        try { localStorage.setItem(READ_SETTINGS_KEY, JSON.stringify(readSettings)); } catch (e) { }
    }

    function applyFontScale() {
        document.documentElement.style.setProperty('--font-scale', readSettings.fontScale);
    }
    applyFontScale();

    /* =========================================
       0.5 拟人打字节奏 + 真实聊天引擎
       ========================================= */

    /* 每个字的停顿：基础速度 ± 随机抖动，标点额外停顿，偶尔"想一下" */
    function charDelay(ch, base) {
        let d = base * (0.55 + Math.random() * 0.9);
        if ('，、；：'.indexOf(ch) >= 0) d += base * 3;
        else if ('。！？'.indexOf(ch) >= 0) d += base * 5;
        else if ('…—'.indexOf(ch) >= 0) d += base * 2.2;
        if (Math.random() < 0.02) d += base * 8;
        return d;
    }

    /* 发送音效：WebAudio 合成，无需任何音频文件 */
    let audioCtx = null;
    function playSendSound(isRight) {
        if (!readSettings.chatSound) return;
        try {
            audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
            if (audioCtx.state === 'suspended') audioCtx.resume();
            const t = audioCtx.currentTime;
            const o = audioCtx.createOscillator();
            const g = audioCtx.createGain();
            o.type = 'sine';
            o.frequency.setValueAtTime(isRight ? 740 : 580, t);
            o.frequency.exponentialRampToValueAtTime(isRight ? 1240 : 960, t + 0.09);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.exponentialRampToValueAtTime(0.11, t + 0.015);
            g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
            o.connect(g); g.connect(audioCtx.destination);
            o.start(t); o.stop(t + 0.22);
        } catch (e) { /* 无音频环境时静默降级 */ }
    }

    /* 打字机引擎（拟人节奏版） */
    let activeTyper = null;
    let autoTimer = null;

    function startTypewriter(el, onDone) {
        if (activeTyper) activeTyper.finish();

        // 只收集正文文本节点，跳过评论气泡内部
        const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                const p = node.parentElement;
                if (p && p.closest && p.closest('.hint-trigger')) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });

        const chunks = [];
        let n;
        while ((n = walker.nextNode())) {
            chunks.push({ node: n, text: n.nodeValue });
        }
        if (!chunks.length) { if (onDone) onDone(); return; }

        chunks.forEach(c => { c.node.nodeValue = ''; });

        let ti = 0, ci = 0, timer = null, done = false, paused = false;
        let lastFollow = Date.now();
        let userInterrupted = false;

        const stopFollow = () => { userInterrupted = true; };
        window.addEventListener('wheel', stopFollow, { passive: true });
        window.addEventListener('touchmove', stopFollow, { passive: true });

        const speed = Math.max(8, readSettings.typeSpeed);

        const api = {
            isDone: () => done,
            isPaused: () => paused,
            pause() {
                if (done || paused) return;
                paused = true;
                if (timer) { clearTimeout(timer); timer = null; }
            },
            resume() {
                if (done || !paused) return;
                paused = false;
                step();
            },
            finish() {
                if (done) return;
                done = true;
                if (timer) { clearTimeout(timer); timer = null; }
                chunks.forEach(c => { c.node.nodeValue = c.text; });
                window.removeEventListener('wheel', stopFollow);
                window.removeEventListener('touchmove', stopFollow);
                if (activeTyper === api) activeTyper = null;
                if (onDone) onDone();
            }
        };

        function follow() {
            if (userInterrupted) return;
            const now = Date.now();
            if (now - lastFollow < 120) return;
            lastFollow = now;
            const rect = el.getBoundingClientRect();
            const bottomLimit = window.innerHeight - (document.body.classList.contains('composer-on') ? 110 : 0) - 12;
            if (rect.bottom > bottomLimit) {
                window.scrollTo(0, window.scrollY + (rect.bottom - bottomLimit) + 64);
            }
        }

        function step() {
            if (done || paused) return;
            const c = chunks[ti];
            if (!c) { api.finish(); return; }
            ci++;
            c.node.nodeValue = c.text.slice(0, ci);
            follow();
            const delay = charDelay(c.text.charAt(ci - 1), speed);
            if (ci >= c.text.length) { ti++; ci = 0; }
            if (ti >= chunks.length) {
                timer = setTimeout(() => api.finish(), delay);
                return;
            }
            timer = setTimeout(step, delay);
        }

        activeTyper = api;
        step();
    }

    /* 全局节奏：打字速度 ÷ 连播倍速 */
    function pace() {
        return Math.max(8, readSettings.typeSpeed) / (readSettings.autoSpeed || 1);
    }

    /* =========================================
       0.6 底部输入框：角色逐字敲入 → 发送
       ========================================= */
    let composer = null;
    let composerSuppressed = false;   // 本章读完后，输入框不再出现

    function ensureComposer() {
        if (composer) return composer;
        const bar = document.createElement('div');
        bar.className = 'chat-composer';
        bar.innerHTML = `
            <div class="composer-head">
                <span class="composer-speaker"></span>
                <span class="composer-status"></span>
            </div>
            <div class="composer-row">
                <div class="composer-input"><span class="composer-text"></span><span class="composer-caret"></span><span class="composer-placeholder"></span></div>
                <button class="composer-send" aria-label="发送">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M2.4 21.6l19.2-9.6L2.4 2.4l.01 7.2L16.8 12 2.41 14.4z"/></svg>
                </button>
            </div>
        `;
        document.body.appendChild(bar);
        composer = {
            bar,
            speaker: bar.querySelector('.composer-speaker'),
            status: bar.querySelector('.composer-status'),
            text: bar.querySelector('.composer-text'),
            caret: bar.querySelector('.composer-caret'),
            placeholder: bar.querySelector('.composer-placeholder'),
            input: bar.querySelector('.composer-input'),
            sendBtn: bar.querySelector('.composer-send')
        };
        // 点发送键 = 立即敲完并发送当前消息
        composer.sendBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (activeTyper) activeTyper.finish();
        });
        return composer;
    }

    function composerVisible() {
        return readSettings.typewriter && readSettings.chatMode;
    }

    /* 本章读完 / 展开全文后：隐藏输入框，并阻止它再次出现 */
    function hideComposer() {
        composerSuppressed = true;
        document.body.classList.remove('composer-on');
        if (composer) {
            composer.bar.classList.remove('typing', 'side-left', 'side-right');
        }
    }

    function updateComposerMode() {
        const on = composerVisible() && !composerSuppressed;
        document.body.classList.toggle('composer-on', on);
        if (on) {
            ensureComposer();
            if (!activeTyper) composerIdle();
        }
    }

    function composerIdle() {
        if (!composer) return;
        composer.bar.classList.remove('side-left', 'side-right', 'typing');
        composer.speaker.textContent = '';
        composer.text.textContent = '';
        composer.caret.style.display = 'none';
        composer.placeholder.style.display = '';
        if (currentIndex >= items.length && items.length > 0) {
            composer.status.textContent = '';
            composer.placeholder.textContent = readSettings.autoPlay ? '即将进入下一章…' : '本章完 · 感谢阅读';
        } else if (readSettings.autoPlay) {
            composer.status.textContent = autoPaused ? '连播已暂停' : '自动播放中 ×' + readSettings.autoSpeed;
            composer.placeholder.textContent = autoPaused ? '点击屏幕手动继续…' : '等待下一条消息…';
        } else {
            composer.status.textContent = '';
            composer.placeholder.textContent = '点击屏幕继续对话…';
        }
    }

    /* 取气泡正文（排除评论气泡内容） */
    function bubbleText(bubble) {
        if (!bubble) return '';
        const clone = bubble.cloneNode(true);
        clone.querySelectorAll('.hint-trigger').forEach(n => n.remove());
        return (clone.textContent || '').trim();
    }

    /* 真实聊天引擎：文字逐个敲进底部输入框，敲完整条发送 */
    function startChatSend(el, onDone) {
        if (activeTyper) activeTyper.finish();

        const isRight = el.classList.contains('right-msg');
        const text = bubbleText(el.querySelector('.bubble'));
        const nameEl = el.querySelector('[class^="msg-name"]');
        const speakerName = nameEl ? (nameEl.textContent || '').trim() : (isRight ? '我' : '对方');

        const c = ensureComposer();
        if (!composerSuppressed) document.body.classList.add('composer-on');
        c.bar.classList.remove('side-left', 'side-right');
        c.bar.classList.add(isRight ? 'side-right' : 'side-left', 'typing');
        c.speaker.textContent = speakerName;
        c.status.textContent = '正在输入…';
        c.placeholder.style.display = 'none';
        c.caret.style.display = '';
        c.text.textContent = '';

        const base = pace();
        let i = 0, timer = null, done = false, paused = false;

        function doSend(withPop) {
            c.bar.classList.remove('typing');
            c.text.textContent = '';
            c.caret.style.display = 'none';
            if (withPop) {
                c.sendBtn.classList.add('sending');
                setTimeout(() => c.sendBtn.classList.remove('sending'), 220);
                playSendSound(isRight);
            }
            showItem(el);
            if (withPop) {
                el.classList.add('msg-pop');
                setTimeout(() => el.classList.remove('msg-pop'), 450);
            }
            composerIdle();
        }

        const api = {
            isDone: () => done,
            isPaused: () => paused,
            pause() {
                if (done || paused) return;
                paused = true;
                if (timer) { clearTimeout(timer); timer = null; }
            },
            resume() {
                if (done || !paused) return;
                paused = false;
                typeStep();
            },
            finish() {
                if (done) return;
                done = true;
                if (timer) { clearTimeout(timer); timer = null; }
                doSend(false);
                if (activeTyper === api) activeTyper = null;
                if (onDone) onDone();
            }
        };

        function typeStep() {
            if (done || paused) return;
            i++;
            c.text.textContent = text.slice(0, i);
            c.input.scrollTop = c.input.scrollHeight;
            if (i >= text.length) {
                // 敲完了，顿一下再按发送
                timer = setTimeout(() => {
                    if (done) return;
                    done = true;
                    timer = null;
                    doSend(true);
                    if (activeTyper === api) activeTyper = null;
                    if (onDone) onDone();
                }, 260 / (readSettings.autoSpeed || 1));
                return;
            }
            timer = setTimeout(typeStep, charDelay(text.charAt(i - 1), base));
        }

        activeTyper = api;
        if (!text.length) { api.finish(); return; }
        timer = setTimeout(typeStep, 200);

        requestAnimationFrame(() => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });
    }

    /* 自动连播：按上一条消息的阅读时长安排下一条 */
    let autoPendingEl = null;

    /* 只统计正文长度：剔除评论气泡，避免等待时长被隐藏评论撑大 */
    function storyTextLength(el) {
        const clone = el.cloneNode(true);
        clone.querySelectorAll('.hint-trigger').forEach(n => n.remove());
        return (clone.textContent || '').trim().length;
    }

    function itemCompleted(el) {
        updateProgress();

        if (el !== items[currentIndex - 1]) { updateAutoBanner(); return; }
        if (activeTyper && !activeTyper.isDone()) { updateAutoBanner(); return; }

        /* 最后一段读完 → 本章结束，进入"章节连播"流程 */
        if (currentIndex >= items.length) {
            onChapterComplete();
            return;
        }

        updateAutoBanner();
        if (!readSettings.autoPlay || autoPaused) return;

        const len = storyTextLength(el);
        // 更快更跟手：每字 40ms，最短 0.5s、最长 2.6s，再除以倍速
        const delay = Math.min(2600, Math.max(500, len * 40)) / (readSettings.autoSpeed || 1);
        autoPendingEl = el;
        if (autoTimer) clearTimeout(autoTimer);
        autoTimer = setTimeout(() => { autoTimer = null; autoPendingEl = null; revealNextItem(); }, delay);
    }

    function stopAutoPlay() {
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    }

    /* =========================================
       0.7 顶部阅读进度条 + 自动播放状态条 + 章节连播
       ========================================= */
    let autoPaused = false;

    /* —— 章节连播状态 —— */
    let chapterCompleted = false;   // 本章是否已读完，防止重复触发
    let chapterTimer = null;        // 跳章定时器
    let chapterTick = null;         // 倒计时刷新定时器
    let chapterAdvanceAt = 0;       // 预计跳章时间戳（0 = 没有倒计时）
    let chapterNextUrl = '';        // 下一章地址
    const CHAPTER_GAP_BASE = 2600;  // 章节间基础停顿（ms），再除以倍速

    const topHud = document.createElement('div');
    topHud.className = 'top-hud';
    topHud.innerHTML = `
        <div class="read-progress-track"><div class="read-progress-fill"></div></div>
        <div class="auto-banner" hidden>
            <span class="auto-dot"></span>
            <span class="auto-text">自动播放中</span>
            <button class="auto-btn auto-next" type="button" style="display:none">进入下一章</button>
            <button class="auto-btn auto-toggle" type="button">暂停</button>
            <button class="auto-btn auto-exit" type="button">退出</button>
        </div>
    `;
    document.body.appendChild(topHud);
    const progressFill = topHud.querySelector('.read-progress-fill');
    const autoBanner = topHud.querySelector('.auto-banner');
    const autoText = topHud.querySelector('.auto-text');
    const autoToggleBtn = topHud.querySelector('.auto-toggle');
    const autoExitBtn = topHud.querySelector('.auto-exit');
    const autoNextBtn = topHud.querySelector('.auto-next');

    function setBtnVisible(btn, visible) {
        if (btn) btn.style.display = visible ? '' : 'none';
    }

    /* 阅读进度 = 已读完的段落数 / 总段落数（正在打字的那段不算读完） */
    function updateProgress() {
        if (!items.length) { progressFill.style.width = '0%'; return; }
        let doneCount = currentIndex;
        if (activeTyper && !activeTyper.isDone()) doneCount = Math.max(0, doneCount - 1);
        progressFill.style.width = Math.min(100, doneCount / items.length * 100) + '%';
    }

    /* ---------- 章节连播：找下一章 ---------- */
    function getNextChapterUrl() {
        const nav = document.getElementById('chapter-nav');
        if (!nav) return null;
        const links = Array.from(nav.querySelectorAll('a[href]'));
        if (!links.length) return null;

        // 优先找文案是"下一章"的链接，否则退而取第二个链接
        let link = links.find(a => /下一章|下一頁|下一页|next/i.test((a.textContent || '').trim()));
        if (!link) link = links.length > 1 ? links[1] : null;
        if (!link) return null;

        const href = link.getAttribute('href');
        if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href)) return null;

        let url;
        try { url = new URL(href, location.href); } catch (e) { return null; }

        // 指回当前页（说明是最后一章）视为没有下一章
        const cur = location.href.split('#')[0];
        if (url.href.split('#')[0] === cur) return null;
        return url.href;
    }

    /* ---------- 章节连播：取消 / 安排 / 跳转 ---------- */
    function cancelChapterAdvance() {
        if (chapterTimer) { clearTimeout(chapterTimer); chapterTimer = null; }
        if (chapterTick) { clearInterval(chapterTick); chapterTick = null; }
        chapterAdvanceAt = 0;
    }

    function scheduleChapterAdvance(immediate) {
        cancelChapterAdvance();

        const url = getNextChapterUrl();
        if (!url) { updateAutoBanner(); return; }
        chapterNextUrl = url;

        if (immediate) { goNextChapter(); return; }

        const wait = Math.max(800, Math.round(CHAPTER_GAP_BASE / (readSettings.autoSpeed || 1)));
        chapterAdvanceAt = Date.now() + wait;

        chapterTimer = setTimeout(() => {
            chapterTimer = null;
            goNextChapter();
        }, wait);

        // 每 200ms 刷新一次倒计时文字
        chapterTick = setInterval(() => {
            if (!chapterAdvanceAt) {
                clearInterval(chapterTick); chapterTick = null;
                return;
            }
            if (Date.now() >= chapterAdvanceAt) {
                clearInterval(chapterTick); chapterTick = null;
            }
            updateAutoBanner();
        }, 200);

        updateAutoBanner();
    }

    function goNextChapter() {
        const url = chapterNextUrl || getNextChapterUrl();
        cancelChapterAdvance();
        chapterNextUrl = '';
        if (!url) { updateAutoBanner(); return; }
        // 告诉下一章：我是连播跳过来的
        try { sessionStorage.setItem(AUTO_CONTINUE_KEY, '1'); } catch (e) { }
        location.href = url;
    }

    /* 本章读完（最后一段打字结束才会调用） */
    function onChapterComplete() {
        if (chapterCompleted) return;
        chapterCompleted = true;

        hideComposer();
        updateProgress();

        const nav = document.getElementById('chapter-nav');
        if (nav) {
            nav.classList.add('show');
            setTimeout(() => {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }, 300);
        }

        if (readSettings.autoPlay && !autoPaused) {
            scheduleChapterAdvance(false);
        } else {
            updateAutoBanner();
        }
    }

    /* ---------- 状态条渲染 ---------- */
    function updateAutoBanner() {
        if (!readSettings.autoPlay) {
            autoBanner.hidden = true;
            autoBanner.classList.remove('paused', 'chapter-end');
            setBtnVisible(autoToggleBtn, false);
            setBtnVisible(autoNextBtn, false);
            return;
        }

        const chapterDone = currentIndex >= items.length && (!activeTyper || activeTyper.isDone());

        /* 章节未读完：常规"自动播放中 / 已暂停" */
        if (!chapterDone) {
            autoBanner.hidden = false;
            autoBanner.classList.remove('chapter-end');
            autoBanner.classList.toggle('paused', autoPaused);
            autoText.textContent = autoPaused ? '已暂停' : '自动播放中';
            setBtnVisible(autoToggleBtn, true);
            autoToggleBtn.textContent = autoPaused ? '继续' : '暂停';
            setBtnVisible(autoNextBtn, false);
            return;
        }

        /* 章节已读完 */
        autoBanner.hidden = false;
        autoBanner.classList.add('chapter-end');

        if (!getNextChapterUrl()) {
            autoBanner.classList.remove('paused');
            autoText.textContent = '已读完最后一章';
            setBtnVisible(autoToggleBtn, false);
            setBtnVisible(autoNextBtn, false);
            return;
        }

        setBtnVisible(autoNextBtn, true);
        setBtnVisible(autoToggleBtn, true);

        if (autoPaused || !chapterAdvanceAt) {
            autoBanner.classList.add('paused');
            autoText.textContent = autoPaused ? '连播已暂停' : '本章已读完';
            autoToggleBtn.textContent = '继续';
            autoNextBtn.textContent = '进入下一章';
        } else {
            autoBanner.classList.remove('paused');
            const left = Math.max(0, chapterAdvanceAt - Date.now());
            autoText.textContent = (left / 1000).toFixed(1) + ' 秒后进入下一章';
            autoToggleBtn.textContent = '暂停';
            autoNextBtn.textContent = '立即进入';
        }
    }

    function pauseAutoPlay() {
        autoPaused = true;
        stopAutoPlay();
        cancelChapterAdvance();
        if (activeTyper && activeTyper.pause) activeTyper.pause();
        updateAutoBanner();
        composerIdle();
    }

    function resumeAutoPlay() {
        autoPaused = false;
        updateAutoBanner();
        composerIdle();

        // 本章已经读完：直接进下一章
        const chapterDone = currentIndex >= items.length && (!activeTyper || activeTyper.isDone());
        if (chapterDone) {
            if (getNextChapterUrl()) goNextChapter();
            return;
        }

        if (activeTyper && activeTyper.isPaused && activeTyper.isPaused()) {
            activeTyper.resume();
            return;
        }
        if (activeTyper || currentIndex >= items.length) return;
        stopAutoPlay();
        autoTimer = setTimeout(() => { autoTimer = null; revealNextItem(); }, 250);
    }

    function exitAutoPlay() {
        readSettings.autoPlay = false;
        persistReadSettings();
        autoPaused = false;
        stopAutoPlay();
        cancelChapterAdvance();
        if (activeTyper && activeTyper.isPaused && activeTyper.isPaused()) activeTyper.resume();
        updateAutoBanner();
        composerIdle();
        refreshPanel();   // 同步设置面板里的开关状态
    }

    autoToggleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (autoPaused) resumeAutoPlay(); else pauseAutoPlay();
    });
    autoExitBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exitAutoPlay();
    });
    autoNextBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        goNextChapter();
    });

    /* =========================================
       1. 对话逐段显示
       ========================================= */
    const items = document.querySelectorAll('.story-item');
    let currentIndex = 0;
    let isProcessing = false;

    /* 展开一个段落（高度/透明度动画） */
    function showItem(el) {
        el.classList.add('show');

        const targetHeight = el.scrollHeight;
        el.style.maxHeight = targetHeight + 'px';

        const onEnd = (e) => {
            if (e.propertyName === 'max-height') {
                el.style.maxHeight = 'none';
                el.removeEventListener('transitionend', onEnd);
            }
        };
        el.addEventListener('transitionend', onEnd);

        requestAnimationFrame(() => {
            if (targetHeight > window.innerHeight * 0.8) {
                window.scrollTo({ top: Math.max(0, el.offsetTop - 20), behavior: 'smooth' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        });
    }

    function revealNextItem() {
        if (currentIndex >= items.length) {
            // 本章已读完：若连播开着，点按 = 直接进下一章
            if (readSettings.autoPlay && !autoPaused) goNextChapter();
            return;
        }

        stopAutoPlay();
        if (activeTyper) activeTyper.finish();

        const el = items[currentIndex];
        currentIndex++;

        const isChatMsg = el.classList.contains('left-msg') || el.classList.contains('right-msg');
        const onDone = () => itemCompleted(el);

        if (readSettings.typewriter && readSettings.chatMode && isChatMsg) {
            // 真实聊天：正在输入… → 整条发送
            startChatSend(el, onDone);
        } else {
            showItem(el);
            if (readSettings.typewriter) {
                el.classList.add('msg-pop');
                setTimeout(() => el.classList.remove('msg-pop'), 450);
                startTypewriter(el, onDone);
            } else {
                onDone();
            }
        }

        if (currentIndex === items.length) {
            // 最后一段已揭示：导航与连播倒计时交给 onChapterComplete（打字结束后）
            updateProgress();
        }
    }

    /* 初始化底部输入框（聊天模式开启时） */
    updateComposerMode();

    function handleScreenClick(e) {
        if (e.target.closest(
            '.hint-trigger, .theme-toggle, .theme-panel, .modal-mask, #expand-btn, a, button, .chapter-nav, .top-hud'
        )) {
            return;
        }

        stopAutoPlay();

        // 打字/输入中：先把当前段补完（立即发送），不推进下一段
        if (activeTyper) {
            activeTyper.finish();
            isProcessing = true;
            setTimeout(() => { isProcessing = false; }, 120);
            return;
        }

        if (isProcessing) return;

        isProcessing = true;
        revealNextItem();
        setTimeout(() => { isProcessing = false; }, 200);
    }

    /* =========================================
       2. 触摸 / 鼠标 / 键盘
       ========================================= */
    let touchStartX = 0;
    let touchStartY = 0;
    let lastTouchTime = 0;

    document.addEventListener('touchstart', (e) => {
        lastTouchTime = Date.now();
        if (e.touches.length === 1) {
            touchStartX = e.touches[0].clientX;
            touchStartY = e.touches[0].clientY;
        }
    }, { passive: true });

    document.addEventListener('touchend', (e) => {
        lastTouchTime = Date.now();

        if (e.target.closest(
            '.hint-trigger, .theme-toggle, .theme-panel, .modal-mask, #expand-btn, a, button, .chapter-nav, .top-hud'
        )) {
            return;
        }

        if (e.changedTouches.length === 1) {
            const dx = Math.abs(e.changedTouches[0].clientX - touchStartX);
            const dy = Math.abs(e.changedTouches[0].clientY - touchStartY);
            if (dx > 10 || dy > 10) return;
        }

        e.preventDefault();
        handleScreenClick(e);
    }, { passive: false });

    document.addEventListener('click', (e) => {
        if (Date.now() - lastTouchTime < 400) return;
        handleScreenClick(e);
    });

    document.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
            const tag = (e.target.tagName || '').toLowerCase();
            if (tag === 'input' || tag === 'textarea' || tag === 'button') return;
            e.preventDefault();

            if (activeTyper) {
                activeTyper.finish();
                isProcessing = true;
                setTimeout(() => { isProcessing = false; }, 120);
                return;
            }

            if (isProcessing) return;
            isProcessing = true;
            revealNextItem();
            setTimeout(() => { isProcessing = false; }, 200);
        }
    });

    /* =========================================
       3. 一键展开全文
       ========================================= */
    const expandBtn = document.getElementById('expand-btn');
    if (expandBtn) {
        expandBtn.addEventListener('click', function (e) {
            e.stopPropagation();
            stopAutoPlay();
            cancelChapterAdvance();
            chapterCompleted = true;   // 展开全文不触发自动跳章
            if (activeTyper) activeTyper.finish();

            hideComposer();   // 展开全文：收起底部输入框

            document.body.classList.add('no-transition');
            items.forEach(item => {
                item.classList.add('show');
                item.style.maxHeight = 'none';
            });
            currentIndex = items.length;
            expandBtn.classList.add('done');
            expandBtn.innerHTML = '<i class="iconfont icon-yuedu"></i>';
            updateProgress();
            updateAutoBanner();
            const nav = document.getElementById('chapter-nav');
            if (nav) nav.classList.add('show');
            void document.body.offsetHeight;
            document.body.classList.remove('no-transition');
            setTimeout(() => { window.scrollTo({ top: 0, behavior: 'smooth' }); }, 100);
        });
    }

    /* =========================================
       4. 气泡展开 / 收起
       ========================================= */
    document.querySelectorAll('.hint-trigger').forEach(trigger => {
        const toggle = (e) => {
            e.stopPropagation();
            if (activeTyper) activeTyper.finish();
            const willOpen = !trigger.classList.contains('open');
            if (willOpen) layoutHints(trigger);
            trigger.classList.toggle('open');
            const item = trigger.closest('.story-item');
            if (!item) return;
            if (trigger.classList.contains('open')) {
                item.classList.add('bubble-open');
            } else {
                item.classList.remove('bubble-open');
            }
        };
        trigger.addEventListener('touchstart', (e) => { e.preventDefault(); toggle(e); }, { passive: false });
        trigger.addEventListener('click', (e) => {
            if (Date.now() - lastTouchTime < 400) return;
            toggle(e);
        });
    });

    function layoutHints(trigger) {
        const hints = Array.from(trigger.querySelectorAll('.hint'));
        if (!hints.length) return;
        const rect = trigger.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        const vw = window.innerWidth;
        const vh = window.innerHeight;
        const toRight = cx < vw / 2;
        const boxes = hints.map(el => ({ el, w: el.offsetWidth, h: el.offsetHeight }));
        const gap = 8;
        const totalH = boxes.reduce((s, b) => s + b.h, 0) + gap * (boxes.length - 1);
        let startY = cy - totalH / 2;
        if (startY < 20) startY = 20;
        if (startY + totalH > vh - 20) startY = vh - 20 - totalH;
        let curY = startY;
        const sideOffset = 20;
        boxes.forEach((b, i) => {
            let offsetX = (toRight ? 1 : -1) * (b.w / 2 + sideOffset);
            if (i % 2 !== 0) offsetX += (toRight ? 12 : -12);
            const absX = cx + offsetX;
            const halfW = b.w / 2;
            if (absX - halfW < 8) offsetX += (8 - (absX - halfW));
            if (absX + halfW > vw - 8) offsetX -= ((absX + halfW) - (vw - 8));
            const offsetY = (curY + b.h / 2) - cy;
            b.el.style.setProperty('--x', offsetX + 'px');
            b.el.style.setProperty('--y', offsetY + 'px');
            curY += b.h + gap;
        });
    }

    /* =========================================
       5. 数据层：内置 & 自定义
       ========================================= */
    const BUILTIN_THEMES = [
        { id: 'classic', name: '经典' },
        { id: 'fresh', name: '快点' },
        { id: 'dark', name: '暗黑' },
        { id: 'cyber', name: '炫彩' },
        { id: 'cute', name: '可爱' }
    ];

    const BG_PRESETS = [
        {
            id: 'default', name: '默认',
            mobile: 'url(../Images/18.jpg)',
            pc: 'linear-gradient(rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0.5)), url(../Images/1yasuo.jpg)'
        },
        {
            id: 'midnight',
            name: '关灯',
            mobile: 'linear-gradient(135deg, #242424 0%, #242424 55%, #242424 100%)',
            pc: 'radial-gradient(ellipse at top left, #242424 0%, #242424 60%, #242424 100%)'
        },
        {
            id: 'light',
            name: '开灯',
            mobile: 'radial-gradient(ellipse at top, #d1d1d1 0%, #d1d1d1 70%)',
            pc: 'radial-gradient(ellipse at 50% 0%, #d1d1d1 0%, #d1d1d1 75%)'
        }
    ];

    const BUBBLE_KEYS = [
        { key: 'left', title: '左气泡', varText: '--bubble-left-text', varBg: '--bubble-left-bg', defaultDir: 'to right' },
        { key: 'right', title: '右气泡', varText: '--bubble-right-text', varBg: '--bubble-right-bg', defaultDir: 'to left' },
        { key: 'narration', title: '旁　白', varText: '--narration-text', varBg: '--narration-bg', defaultDir: 'to bottom right' },
        { key: 'hint', title: '评论气泡', varText: '--hint-text', varBg: '--hint-bg', defaultDir: 'to bottom right' }
    ];

    const CUSTOM_THEMES_KEY = 'nightmare-custom-themes';
    const CUSTOM_BGS_KEY = 'nightmare-custom-bgs';
    const ACTIVE_THEME_KEY = 'nightmare-active-theme';
    const ACTIVE_BG_KEY = 'nightmare-active-bg';
    const GLOBAL_TEXT_KEY = 'nightmare-global-text';

    function newId(prefix) {
        return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[c]);
    }
    function loadCustomThemes() {
        try { const arr = JSON.parse(localStorage.getItem(CUSTOM_THEMES_KEY) || '[]'); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
    }
    function saveCustomThemes(list) {
        try { localStorage.setItem(CUSTOM_THEMES_KEY, JSON.stringify(list)); return true; } catch (e) { alert('主题保存失败，可能是存储已满'); return false; }
    }
    function loadCustomBgs() {
        try { const arr = JSON.parse(localStorage.getItem(CUSTOM_BGS_KEY) || '[]'); return Array.isArray(arr) ? arr : []; } catch (e) { return []; }
    }
    function saveCustomBgs(list) {
        try { localStorage.setItem(CUSTOM_BGS_KEY, JSON.stringify(list)); return true; } catch (e) { alert('背景保存失败，可能是存储已满'); return false; }
    }
    function getActiveThemeId() { try { return localStorage.getItem(ACTIVE_THEME_KEY) || 'classic'; } catch (e) { return 'classic'; } }
    function setActiveThemeId(id) { try { localStorage.setItem(ACTIVE_THEME_KEY, id); } catch (e) { } }
    function getActiveBgId() { try { return localStorage.getItem(ACTIVE_BG_KEY) || 'default'; } catch (e) { return 'default'; } }
    function setActiveBgId(id) { try { localStorage.setItem(ACTIVE_BG_KEY, id); } catch (e) { } }

    function getGlobalTextColors() {
        try { return JSON.parse(localStorage.getItem(GLOBAL_TEXT_KEY) || '{}'); } catch (e) { return {}; }
    }
    function setGlobalTextColors(obj) {
        try { localStorage.setItem(GLOBAL_TEXT_KEY, JSON.stringify(obj)); } catch (e) { }
    }

    /* =========================================
       6. 应用层：把当前选中方案渲染到页面
       ========================================= */
    const INLINE_VARS = BUBBLE_KEYS.flatMap(b => [b.varText, b.varBg]);

    function clearInlineVars() {
        INLINE_VARS.forEach(v => document.documentElement.style.removeProperty(v));
    }

    // 核心：支持 1~3 个颜色的动态色标生成，配合流光动画无缝循环
    function bubbleToBgValue(b, isCyber = false) {
        const alpha = b.alpha == null ? 0.9 : Math.max(0, Math.min(1, b.alpha));
        const a = Math.round(alpha * 255).toString(16).padStart(2, '0');
        const dir = b.dir || 'to right';

        if (b.bgType === 'gradient') {
            const c1 = b.c1 + a;
            const c2 = (b.c2 || b.c1) + a;
            const hasC3 = b.c3 && b.c3 !== b.c1 && b.c3 !== b.c2;
            const c3 = b.c3 ? b.c3 + a : c1;

            if (isCyber) {
                if (hasC3) {
                    return `linear-gradient(${dir}, ${c1} 0%, ${c2} 16.66%, ${c3} 33.33%, ${c1} 50%, ${c2} 66.66%, ${c3} 83.33%, ${c1} 100%)`;
                } else if (b.c2 && b.c2 !== b.c1) {
                    return `linear-gradient(${dir}, ${c1} 0%, ${c2} 25%, ${c1} 50%, ${c2} 75%, ${c1} 100%)`;
                }
                return `linear-gradient(${dir}, ${c1}, ${c1})`;
            } else {
                if (hasC3) {
                    return `linear-gradient(${dir}, ${c1} 0%, ${c2} 50%, ${c3} 100%)`;
                } else if (b.c2 && b.c2 !== b.c1) {
                    return `linear-gradient(${dir}, ${c1} 0%, ${c2} 100%)`;
                }
                return `linear-gradient(${dir}, ${c1}, ${c1})`;
            }
        }
        const c = b.c1 + a;
        return `linear-gradient(${dir}, ${c}, ${c})`;
    }

    function applyCustomThemeVars(theme) {
        const isCyber = theme.baseTheme === 'cyber';
        BUBBLE_KEYS.forEach(b => {
            const data = theme[b.key];
            if (!data) return;
            document.documentElement.style.setProperty(b.varText, data.text, 'important');
            document.documentElement.style.setProperty(b.varBg, bubbleToBgValue(data, isCyber), 'important');
        });
    }

    function applyGlobalTextColors() {
        const custom = getGlobalTextColors();
        BUBBLE_KEYS.forEach(b => {
            if (custom[b.key]) {
                document.documentElement.style.setProperty(b.varText, custom[b.key], 'important');
            } else {
                document.documentElement.style.removeProperty(b.varText);
            }
        });
    }

    function applyActiveTheme() {
        const id = getActiveThemeId();
        if (BUILTIN_THEMES.some(t => t.id === id)) {
            clearInlineVars();
            document.documentElement.setAttribute('data-theme', id);
        } else {
            const custom = loadCustomThemes().find(t => t.id === id);
            if (!custom) {
                clearInlineVars();
                document.documentElement.setAttribute('data-theme', 'classic');
                setActiveThemeId('classic');
            } else {
                clearInlineVars();
                document.documentElement.setAttribute('data-theme', custom.baseTheme || 'classic');
                applyCustomThemeVars(custom);
            }
        }
        applyGlobalTextColors();
    }

    function applyActiveBg() {
        const id = getActiveBgId();
        const preset = BG_PRESETS.find(p => p.id === id);
        if (preset) {
            document.documentElement.style.setProperty('--bg-mobile', preset.mobile);
            document.documentElement.style.setProperty('--bg-pc', preset.pc);
            return;
        }
        const custom = loadCustomBgs().find(b => b.id === id);
        if (!custom) {
            const def = BG_PRESETS[0];
            document.documentElement.style.setProperty('--bg-mobile', def.mobile);
            document.documentElement.style.setProperty('--bg-pc', def.pc);
            setActiveBgId('default');
            return;
        }
        const mobileVal = custom.mobile ? `linear-gradient(rgba(0,0,0,.45), rgba(0,0,0,.45)), ${custom.mobile}` : BG_PRESETS[0].mobile;
        const pcSource = custom.pc || custom.mobile;
        const pcVal = pcSource ? `linear-gradient(rgba(0,0,0,.55), rgba(0,0,0,.45)), ${pcSource}` : BG_PRESETS[0].pc;
        document.documentElement.style.setProperty('--bg-mobile', mobileVal);
        document.documentElement.style.setProperty('--bg-pc', pcVal);
    }

    applyActiveTheme();
    applyActiveBg();

    /* =========================================
       7. 工具：图片压缩
       ========================================= */
    function compressImage(img) {
        const MAX = 1600;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
            if (width >= height) { height = Math.round(height * MAX / width); width = MAX; }
            else { width = Math.round(width * MAX / height); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        return canvas.toDataURL('image/jpeg', 0.82);
    }

    /* =========================================
       8. 模态框基础
       ========================================= */
    function openModal(opts) {
        const mask = document.createElement('div');
        mask.className = 'modal-mask';
        mask.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <span>${opts.title}</span>
                    <button class="modal-close" aria-label="关闭">✕</button>
                </div>
                <div class="modal-body">${opts.body}</div>
                <div class="modal-footer">${opts.footer || '<button class="btn" data-close>取消</button>'}</div>
            </div>
        `;
        document.body.appendChild(mask);
        requestAnimationFrame(() => mask.classList.add('open'));
        const close = () => { mask.classList.remove('open'); setTimeout(() => mask.remove(), 260); };
        mask.addEventListener('click', (e) => {
            if (e.target === mask) close();
            if (e.target.closest('.modal-close') || e.target.closest('[data-close]')) close();
        });
        if (opts.onMount) opts.onMount(mask, close);
        return { mask, close };
    }

    /* =========================================
       9. 自定义主题编辑器
       ========================================= */
    function defaultBubble(key) {
        const presets = {
            left: { text: '#ffffff', bgType: 'gradient', c1: '#400652', c2: '#e65757', c3: '', dir: 'to right', alpha: 0.85 },
            right: { text: '#ffffff', bgType: 'gradient', c1: '#000000', c2: '#3592dd', c3: '', dir: 'to left', alpha: 0.85 },
            narration: { text: '#fff2ce', bgType: 'gradient', c1: '#660000', c2: '#aa3333', c3: '', dir: 'to bottom right', alpha: 0.8 },
            hint: { text: '#ffffff', bgType: 'gradient', c1: '#2c0303', c2: '#e25f5f', c3: '', dir: 'to bottom right', alpha: 0.9 }
        };
        return JSON.parse(JSON.stringify(presets[key] || presets.left));
    }

    function bubblePreviewStyle(b, baseTheme) {
        const isCyber = baseTheme === 'cyber';
        return `background: ${bubbleToBgValue(b, isCyber)}; color: ${b.text};`;
    }

    function renderBubbleEditor(bk, data, baseTheme) {
        const showGrad = data.bgType === 'gradient';
        return `
            <div class="bubble-editor" data-bkey="${bk.key}">
                <div class="bubble-editor-title">${bk.title}</div>
                <div class="bubble-editor-row">
                    <label>文字色</label>
                    <input type="color" data-bfield="text" value="${data.text}">
                </div>
                <div class="bubble-editor-row">
                    <label>背景</label>
                    <div class="bg-type-toggle">
                        <button type="button" data-type="solid" class="${data.bgType === 'solid' ? 'active' : ''}">纯色</button>
                        <button type="button" data-type="gradient" class="${data.bgType === 'gradient' ? 'active' : ''}">渐变</button>
                    </div>
                </div>
                <div class="bubble-editor-row">
                    <label>颜色1</label>
                    <input type="color" data-bfield="c1" value="${data.c1}">
                </div>
                <div class="bubble-editor-row" data-if-gradient style="display:${showGrad ? '' : 'none'}">
                    <label>颜色2</label>
                    <input type="color" data-bfield="c2" value="${data.c2}">
                </div>
                <div class="bubble-editor-row" data-if-gradient style="display:${showGrad ? '' : 'none'}">
                    <label>颜色3</label>
                    <input type="color" data-bfield="c3" value="${data.c3 || '#ffffff'}">
                    <span class="alpha-value" style="min-width:auto; color:#888; font-size:0.65rem;">可选，支持三色循环</span>
                </div>
                <div class="bubble-editor-row" data-if-gradient style="display:${showGrad ? '' : 'none'}">
                    <label>方向</label>
                    <select data-bfield="dir">
                        <option value="to right" ${data.dir === 'to right' ? 'selected' : ''}>从左到右 →</option>
                        <option value="to left" ${data.dir === 'to left' ? 'selected' : ''}>从右到左 ←</option>
                        <option value="to bottom" ${data.dir === 'to bottom' ? 'selected' : ''}>从上到下 ↓</option>
                        <option value="to top" ${data.dir === 'to top' ? 'selected' : ''}>从下到上 ↑</option>
                        <option value="to bottom right" ${data.dir === 'to bottom right' ? 'selected' : ''}>左上到右下 ↘</option>
                        <option value="to bottom left" ${data.dir === 'to bottom left' ? 'selected' : ''}>右上到左下 ↙</option>
                        <option value="135deg" ${data.dir === '135deg' ? 'selected' : ''}>斜向 135° ⤡</option>
                        <option value="45deg" ${data.dir === '45deg' ? 'selected' : ''}>斜向 45° ⤢</option>
                    </select>
                </div>
                <div class="bubble-editor-row">
                    <label>透明度</label>
                    <input type="range" min="0" max="1" step="0.05" data-bfield="alpha" value="${data.alpha}">
                    <span class="alpha-value">${Math.round(data.alpha * 100)}%</span>
                </div>
                <div class="preview-bubble" style="${bubblePreviewStyle(data, baseTheme)}">预览效果 Aa</div>
            </div>
        `;
    }

    function openThemeEditor(themeId) {
        const isEdit = !!themeId;
        const list = loadCustomThemes();
        let data;
        if (isEdit) {
            const found = list.find(t => t.id === themeId);
            if (!found) return;
            data = JSON.parse(JSON.stringify(found));
        } else {
            data = { id: newId('t'), name: '我的主题', baseTheme: 'classic' };
            BUBBLE_KEYS.forEach(bk => { data[bk.key] = defaultBubble(bk.key); });
        }

        function buildEditorHTML() {
            return BUBBLE_KEYS.map(bk => renderBubbleEditor(bk, data[bk.key], data.baseTheme)).join('');
        }

        const bodyHTML = `
            <div class="form-group">
                <label class="form-label">主题名称</label>
                <input type="text" class="form-input" data-field="name" value="${escapeHtml(data.name)}" maxlength="20" placeholder="最多 20 字">
            </div>
            <div class="form-group">
                <label class="form-label">基础风格（决定气泡形状、阴影、边框）</label>
                <select class="form-input" data-field="baseTheme" id="theme-base-select">
                    ${BUILTIN_THEMES.map(t => `<option value="${t.id}" ${t.id === data.baseTheme ? 'selected' : ''}>${t.name}</option>`).join('')}
                </select>
            </div>
            <div id="bubble-editor-container">
                ${buildEditorHTML()}
            </div>
        `;

        const footerHTML = isEdit
            ? `<button class="btn btn-danger" data-action="delete">删除</button><button class="btn" data-close>取消</button><button class="btn btn-primary" data-action="save">保存</button>`
            : `<button class="btn" data-close>取消</button><button class="btn btn-primary" data-action="save">创建</button>`;

        openModal({
            title: isEdit ? '编辑自定义主题' : '新建自定义主题',
            body: bodyHTML,
            footer: footerHTML,
            onMount: (mask, close) => {
                mask.addEventListener('change', (e) => {
                    if (e.target.id === 'theme-base-select') {
                        data.baseTheme = e.target.value;
                        mask.querySelector('#bubble-editor-container').innerHTML = buildEditorHTML();
                    }
                });

                mask.addEventListener('input', (e) => {
                    const field = e.target.dataset.field;
                    if (field === 'name') { data.name = e.target.value; return; }

                    const editor = e.target.closest('.bubble-editor');
                    if (!editor) return;
                    const bkey = editor.dataset.bkey;
                    const bfield = e.target.dataset.bfield;
                    if (!bfield) return;

                    if (bfield === 'alpha') {
                        data[bkey].alpha = parseFloat(e.target.value);
                        editor.querySelector('.alpha-value').textContent = Math.round(data[bkey].alpha * 100) + '%';
                    } else if (bfield === 'dir') {
                        data[bkey].dir = e.target.value;
                    } else {
                        data[bkey][bfield] = e.target.value;
                    }
                    editor.querySelector('.preview-bubble').style.cssText = bubblePreviewStyle(data[bkey], data.baseTheme);
                });

                mask.addEventListener('click', (e) => {
                    const typeBtn = e.target.closest('.bg-type-toggle button');
                    if (typeBtn) {
                        const editor = typeBtn.closest('.bubble-editor');
                        const bkey = editor.dataset.bkey;
                        data[bkey].bgType = typeBtn.dataset.type;
                        editor.querySelectorAll('.bg-type-toggle button').forEach(b => b.classList.toggle('active', b === typeBtn));
                        editor.querySelectorAll('[data-if-gradient]').forEach(el => {
                            el.style.display = data[bkey].bgType === 'gradient' ? '' : 'none';
                        });
                        editor.querySelector('.preview-bubble').style.cssText = bubblePreviewStyle(data[bkey], data.baseTheme);
                        return;
                    }

                    const actionBtn = e.target.closest('[data-action]');
                    if (!actionBtn) return;
                    const action = actionBtn.dataset.action;

                    if (action === 'save') {
                        const name = data.name.trim();
                        if (!name) { alert('请填写主题名称'); return; }
                        data.name = name;
                        const newList = loadCustomThemes();
                        const idx = newList.findIndex(t => t.id === data.id);
                        if (idx >= 0) newList[idx] = data; else newList.push(data);
                        if (!saveCustomThemes(newList)) return;
                        setActiveThemeId(data.id);
                        applyActiveTheme();
                        close();
                        refreshPanel();
                    } else if (action === 'delete') {
                        if (!confirm(`确定删除主题「${data.name}」吗？`)) return;
                        saveCustomThemes(loadCustomThemes().filter(t => t.id !== data.id));
                        if (getActiveThemeId() === data.id) { setActiveThemeId('classic'); applyActiveTheme(); }
                        close();
                        refreshPanel();
                    }
                });
            }
        });
    }

    /* =========================================
       10. 自定义背景编辑器
       ========================================= */
    function openBgEditor(bgId) {
        const isEdit = !!bgId;
        const list = loadCustomBgs();
        let data;
        if (isEdit) {
            const found = list.find(b => b.id === bgId);
            if (!found) return;
            data = JSON.parse(JSON.stringify(found));
        } else {
            data = { id: newId('b'), name: '我的背景', mobile: '', pc: '' };
        }

        const bodyHTML = `
            <div class="form-group">
                <label class="form-label">背景名称</label>
                <input type="text" class="form-input" data-field="name" value="${escapeHtml(data.name)}" maxlength="20" placeholder="最多 20 字">
            </div>
            <div class="form-group">
                <label class="form-label">移动端图片</label>
                <label class="bg-upload${data.mobile ? ' has-img' : ''}">
                    <input type="file" accept="image/*" data-target="mobile">
                    <span class="bg-upload-icon">📱</span>
                    <span class="bg-upload-text"><b>${data.mobile ? '点击更换图片' : '点击上传图片'}</b><small>留空则使用默认背景</small></span>
                </label>
                <div class="bg-upload-preview" data-preview="mobile" style="${data.mobile ? `background-image:${data.mobile}` : ''}">${data.mobile ? '' : '暂无图片'}</div>
            </div>
            <div class="form-group">
                <label class="form-label">PC 端图片</label>
                <label class="bg-upload${data.pc ? ' has-img' : ''}">
                    <input type="file" accept="image/*" data-target="pc">
                    <span class="bg-upload-icon">💻</span>
                    <span class="bg-upload-text"><b>${data.pc ? '点击更换图片' : '点击上传图片'}</b><small>留空则沿用移动端图片</small></span>
                </label>
                <div class="bg-upload-preview" data-preview="pc" style="${data.pc ? `background-image:${data.pc}` : ''}">${data.pc ? '' : '暂无图片'}</div>
            </div>
        `;

        const footerHTML = isEdit
            ? `<button class="btn btn-danger" data-action="delete">删除</button><button class="btn" data-close>取消</button><button class="btn btn-primary" data-action="save">保存</button>`
            : `<button class="btn" data-close>取消</button><button class="btn btn-primary" data-action="save">创建</button>`;

        openModal({
            title: isEdit ? '编辑自定义背景' : '新建自定义背景',
            body: bodyHTML,
            footer: footerHTML,
            onMount: (mask, close) => {
                mask.addEventListener('input', (e) => {
                    if (e.target.dataset.field === 'name') data.name = e.target.value;
                });

                mask.addEventListener('change', (e) => {
                    const fileInput = e.target.closest('input[type=file]');
                    if (!fileInput || !fileInput.files || !fileInput.files[0]) return;
                    const file = fileInput.files[0];
                    const target = fileInput.dataset.target;
                    if (!file.type.startsWith('image/')) { alert('请选择图片文件'); return; }
                    if (file.size > 8 * 1024 * 1024) { alert('图片太大（超过 8MB）'); return; }

                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        const img = new Image();
                        img.onload = () => {
                            const dataUrl = compressImage(img);
                            data[target] = `url(${dataUrl})`;
                            const pv = mask.querySelector(`[data-preview="${target}"]`);
                            pv.style.backgroundImage = data[target];
                            pv.textContent = '';
                            fileInput.closest('.bg-upload').querySelector('.bg-upload-text b').textContent = '点击更换图片';
                        };
                        img.onerror = () => alert('图片加载失败');
                        img.src = ev.target.result;
                    };
                    reader.onerror = () => alert('文件读取失败');
                    reader.readAsDataURL(file);
                    fileInput.value = '';
                });

                mask.addEventListener('click', (e) => {
                    const actionBtn = e.target.closest('[data-action]');
                    if (!actionBtn) return;
                    const action = actionBtn.dataset.action;

                    if (action === 'save') {
                        const name = data.name.trim();
                        if (!name) { alert('请填写背景名称'); return; }
                        if (!data.mobile && !data.pc) { alert('请至少上传一张图片'); return; }
                        data.name = name;
                        const newList = loadCustomBgs();
                        const idx = newList.findIndex(b => b.id === data.id);
                        if (idx >= 0) newList[idx] = data; else newList.push(data);
                        if (!saveCustomBgs(newList)) return;
                        setActiveBgId(data.id);
                        applyActiveBg();
                        close();
                        refreshPanel();
                    } else if (action === 'delete') {
                        if (!confirm(`确定删除背景「${data.name}」吗？`)) return;
                        saveCustomBgs(loadCustomBgs().filter(b => b.id !== data.id));
                        if (getActiveBgId() === data.id) { setActiveBgId('default'); applyActiveBg(); }
                        close();
                        refreshPanel();
                    }
                });
            }
        });
    }

    /* =========================================
       11. 外观设置面板
       ========================================= */
    let refreshPanel = () => { };

    function normalizeHex(color) {
        color = (color || '').trim();
        if (/^#[0-9a-f]{6}$/i.test(color)) return color;
        if (/^#[0-9a-f]{3}$/i.test(color)) return '#' + color[1] + color[1] + color[2] + color[2] + color[3] + color[3];
        if (/^#[0-9a-f]{8}$/i.test(color)) return color.slice(0, 7);
        const rgb = color.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
        if (rgb) {
            const toHex = (n) => (+n).toString(16).padStart(2, '0');
            return '#' + toHex(rgb[1]) + toHex(rgb[2]) + toHex(rgb[3]);
        }
        return '#ffffff';
    }

    function createThemePanel() {
        const btn = document.createElement('button');
        btn.className = 'theme-toggle';
        btn.setAttribute('aria-label', '外观设置');
        btn.innerHTML = `
            <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor" aria-hidden="true">
                <path d="M12 3a9 9 0 1 0 0 18c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.24-.27-.39-.62-.39-1 0-.83.67-1.5 1.5-1.5H16a5 5 0 0 0 5-5c0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5S15.33 8 14.5 8zm3 4c-.83 0-1.5-.67-1.5-1.5S16.67 9 17.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
            </svg>`;

        const panel = document.createElement('div');
        panel.className = 'theme-panel';
        panel.id = 'themePanel';
        document.body.appendChild(btn);
        document.body.appendChild(panel);

        function customPreviewVars(theme) {
            const isCyber = theme.baseTheme === 'cyber';
            const st = (k, v) => `${k}:${v};`;
            return (
                st('--bubble-left-bg', bubbleToBgValue(theme.left || defaultBubble('left'), isCyber)) +
                st('--bubble-left-text', (theme.left || defaultBubble('left')).text) +
                st('--bubble-right-bg', bubbleToBgValue(theme.right || defaultBubble('right'), isCyber)) +
                st('--bubble-right-text', (theme.right || defaultBubble('right')).text)
            );
        }

        function render() {
            const st = panel.scrollTop;
            const curThemeId = getActiveThemeId();
            const curBgId = getActiveBgId();
            const customThemes = loadCustomThemes();
            const customBgs = loadCustomBgs();
            const globalText = getGlobalTextColors();

            const cs = getComputedStyle(document.documentElement);

            panel.innerHTML = `
                <div class="theme-panel-header">
                    <span>外观设置</span>
                    <button class="theme-close" aria-label="关闭">✕</button>
                </div>

                <div class="theme-section-title">气泡样式</div>
                <div class="theme-options">
                    ${BUILTIN_THEMES.map(t => `
                        <div class="theme-option-wrap">
                            <button class="theme-option${t.id === curThemeId ? ' active' : ''}" data-theme-id="${t.id}" title="${t.name}">
                                <span class="theme-preview" data-theme="${t.id}">
                                    <span class="preview-stage">
                                        <span class="left-msg"><span class="bubble">今天也要加油</span></span>
                                        <span class="right-msg"><span class="bubble">嗯！</span></span>
                                    </span>
                                </span>
                                <span class="theme-name">${t.name}</span>
                            </button>
                        </div>
                    `).join('')}
                    ${customThemes.map(t => `
                        <div class="theme-option-wrap is-custom">
                            <button class="theme-option${t.id === curThemeId ? ' active' : ''}" data-theme-id="${t.id}" title="${escapeHtml(t.name)}">
                                <span class="theme-preview" data-theme="${t.baseTheme || 'classic'}" style="${customPreviewVars(t)}">
                                    <span class="preview-stage">
                                        <span class="left-msg"><span class="bubble">今天也要加油</span></span>
                                        <span class="right-msg"><span class="bubble">嗯！</span></span>
                                    </span>
                                </span>
                                <span class="theme-name">${escapeHtml(t.name)}</span>
                            </button>
                            <div class="custom-actions">
                                <button class="custom-btn" data-action="edit-theme" data-id="${t.id}" title="编辑">✎</button>
                                <button class="custom-btn" data-action="delete-theme" data-id="${t.id}" title="删除">×</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="add-custom-btn" data-action="new-theme">＋ 新建自定义主题</button>

                <div class="theme-section-title">快捷全局文字颜色</div>
                <div class="global-color-group">
                    ${BUBBLE_KEYS.map(b => {
                const isCustom = !!globalText[b.key];
                let displayColor = isCustom ? normalizeHex(globalText[b.key]) : normalizeHex(cs.getPropertyValue(b.varText).split(',')[0]);
                return `
                            <div class="color-row">
                                <span class="color-label">${b.title}</span>
                                <input type="color" value="${displayColor}" data-global-key="${b.key}" ${isCustom ? '' : 'disabled'} title="${isCustom ? '自定义颜色' : '当前跟随主题'}">
                                <label class="color-follow">
                                    <input type="checkbox" data-follow-key="${b.key}" ${isCustom ? '' : 'checked'}>
                                    <span>跟随</span>
                                </label>
                            </div>
                        `;
            }).join('')}
                </div>

                <div class="theme-section-title">阅读设置</div>
                <div class="read-settings">
                    <div class="setting-row">
                        <label>字体大小</label>
                        <input type="range" min="0.8" max="1.6" step="0.05"
                               data-setting="fontScale" value="${readSettings.fontScale}">
                        <span class="setting-value" data-value="fontScale">${Math.round(readSettings.fontScale * 100)}%</span>
                    </div>
                    <div class="setting-row">
                        <label>打字机</label>
                        <label class="switch">
                            <input type="checkbox" data-setting="typewriter" ${readSettings.typewriter ? 'checked' : ''}>
                            <span class="switch-track"></span>
                        </label>
                    </div>
                    <div class="setting-row" data-typewriter-row
                         style="display:${readSettings.typewriter ? '' : 'none'}">
                        <label>打字速度</label>
                        <input type="range" min="8" max="120" step="4"
                               data-setting="typeSpeed" value="${readSettings.typeSpeed}">
                        <span class="setting-value" data-value="typeSpeed">${readSettings.typeSpeed}ms</span>
                    </div>
                    <div class="setting-row" data-typewriter-row
                         style="display:${readSettings.typewriter ? '' : 'none'}">
                        <label>聊天模式</label>
                        <label class="switch">
                            <input type="checkbox" data-setting="chatMode" ${readSettings.chatMode ? 'checked' : ''}>
                            <span class="switch-track"></span>
                        </label>
                    </div>
                    <div class="setting-row" data-typewriter-row
                         style="display:${readSettings.typewriter && readSettings.chatMode ? '' : 'none'}">
                        <label>消息音效</label>
                        <label class="switch">
                            <input type="checkbox" data-setting="chatSound" ${readSettings.chatSound ? 'checked' : ''}>
                            <span class="switch-track"></span>
                        </label>
                    </div>
                    <div class="setting-row">
                        <label>自动连播</label>
                        <label class="switch">
                            <input type="checkbox" data-setting="autoPlay" ${readSettings.autoPlay ? 'checked' : ''}>
                            <span class="switch-track"></span>
                        </label>
                    </div>
                    <div class="setting-row">
                        <label>连播倍速</label>
                        <select class="speed-select" data-setting="autoSpeed">
                            ${[0.5, 1, 1.5, 2, 3].map(v => `<option value="${v}" ${readSettings.autoSpeed === v ? 'selected' : ''}>×${v}</option>`).join('')}
                        </select>
                    </div>
                </div>

                <div class="theme-section-title">背景样式</div>
                <div class="bg-presets">
                    ${BG_PRESETS.map(p => `
                        <button class="bg-option${p.id === curBgId ? ' active' : ''}" data-bg-id="${p.id}" title="${p.name}">
                            <span class="bg-preview" style="background-image: ${p.thumb || p.mobile}"></span>
                            <span class="bg-name">${p.name}</span>
                        </button>
                    `).join('')}
                    ${customBgs.map(b => `
                        <div class="bg-option-wrap is-custom">
                            <button class="bg-option${b.id === curBgId ? ' active' : ''}" data-bg-id="${b.id}" title="${escapeHtml(b.name)}">
                                <span class="bg-preview" style="background-image: ${b.mobile || b.pc || 'linear-gradient(#333,#111)'}"></span>
                                <span class="bg-name">${escapeHtml(b.name)}</span>
                            </button>
                            <div class="custom-actions">
                                <button class="custom-btn" data-action="edit-bg" data-id="${b.id}" title="编辑">✎</button>
                                <button class="custom-btn" data-action="delete-bg" data-id="${b.id}" title="删除">×</button>
                            </div>
                        </div>
                    `).join('')}
                </div>
                <button class="add-custom-btn" data-action="new-bg">＋ 新建自定义背景</button>
            `;

            panel.scrollTop = st;
        }

        refreshPanel = render;
        render();

        /* ---------- 点击委托 ---------- */
        panel.addEventListener('click', (e) => {
            if (e.target.closest('.theme-close')) { panel.classList.remove('open'); return; }

            const actionBtn = e.target.closest('[data-action]');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                const id = actionBtn.dataset.id;
                if (action === 'new-theme') { openThemeEditor(); return; }
                if (action === 'new-bg') { openBgEditor(); return; }
                if (action === 'edit-theme') { openThemeEditor(id); return; }
                if (action === 'edit-bg') { openBgEditor(id); return; }
                if (action === 'delete-theme') {
                    const t = loadCustomThemes().find(x => x.id === id);
                    if (t && confirm(`确定删除主题「${t.name}」吗？`)) {
                        saveCustomThemes(loadCustomThemes().filter(x => x.id !== id));
                        if (getActiveThemeId() === id) { setActiveThemeId('classic'); applyActiveTheme(); }
                        render();
                    }
                    return;
                }
                if (action === 'delete-bg') {
                    const b = loadCustomBgs().find(x => x.id === id);
                    if (b && confirm(`确定删除背景「${b.name}」吗？`)) {
                        saveCustomBgs(loadCustomBgs().filter(x => x.id !== id));
                        if (getActiveBgId() === id) { setActiveBgId('default'); applyActiveBg(); }
                        render();
                    }
                    return;
                }
            }

            const themeBtn = e.target.closest('[data-theme-id]');
            if (themeBtn) {
                setActiveThemeId(themeBtn.dataset.themeId);
                applyActiveTheme();
                render();
                return;
            }
            const bgBtn = e.target.closest('[data-bg-id]');
            if (bgBtn) {
                setActiveBgId(bgBtn.dataset.bgId);
                applyActiveBg();
                render();
                return;
            }
        });

        /* ---------- 阅读设置 + 快捷字色：实时更新 ---------- */
        panel.addEventListener('input', (e) => {
            const settingKey = e.target && e.target.dataset ? e.target.dataset.setting : null;
            if (settingKey) {
                if (settingKey === 'fontScale') {
                    readSettings.fontScale = parseFloat(e.target.value) || 1;
                    applyFontScale();
                    persistReadSettings();
                    const v = panel.querySelector('[data-value="fontScale"]');
                    if (v) v.textContent = Math.round(readSettings.fontScale * 100) + '%';
                } else if (settingKey === 'typeSpeed') {
                    readSettings.typeSpeed = parseInt(e.target.value, 10) || 35;
                    persistReadSettings();
                    const v = panel.querySelector('[data-value="typeSpeed"]');
                    if (v) v.textContent = readSettings.typeSpeed + 'ms';
                }
                return;
            }

            const input = e.target.closest('input[type=color][data-global-key]');
            if (!input) return;
            const key = input.dataset.globalKey;
            const obj = getGlobalTextColors();
            obj[key] = input.value;
            setGlobalTextColors(obj);
            applyGlobalTextColors();
        });

        /* ---------- 打字机开关 + 快捷字色跟随 ---------- */
        panel.addEventListener('change', (e) => {
            const settingKey = e.target && e.target.dataset ? e.target.dataset.setting : null;

            if (settingKey === 'autoSpeed') {
                readSettings.autoSpeed = parseFloat(e.target.value) || 1;
                persistReadSettings();
                updateAutoBanner();
                if (!activeTyper) composerIdle();
                return;
            }

            if (settingKey === 'typewriter' || settingKey === 'chatMode' || settingKey === 'chatSound' || settingKey === 'autoPlay') {
                readSettings[settingKey] = e.target.checked;
                persistReadSettings();
                if (settingKey === 'typewriter' || settingKey === 'chatMode') {
                    updateComposerMode();
                }
                if (settingKey === 'typewriter') {
                    panel.querySelectorAll('[data-typewriter-row]').forEach(row => {
                        const isSoundRow = !!row.querySelector('[data-setting="chatSound"]');
                        const visible = isSoundRow
                            ? (readSettings.typewriter && readSettings.chatMode)
                            : readSettings.typewriter;
                        row.style.display = visible ? '' : 'none';
                    });
                    if (!e.target.checked && activeTyper) activeTyper.finish();
                }
                if (settingKey === 'chatMode') {
                    const soundRow = panel.querySelector('[data-setting="chatSound"]');
                    if (soundRow) {
                        const row = soundRow.closest('.setting-row');
                        if (row) row.style.display = (readSettings.typewriter && readSettings.chatMode) ? '' : 'none';
                    }
                }
                if (settingKey === 'autoPlay') {
                    if (e.target.checked) {
                        autoPaused = false;
                        updateAutoBanner();
                        if (currentIndex === 0) {
                            revealNextItem();
                        } else if (!activeTyper || activeTyper.isDone()) {
                            itemCompleted(items[currentIndex - 1]);
                        }
                    } else {
                        autoPaused = false;
                        stopAutoPlay();
                        cancelChapterAdvance();
                        updateAutoBanner();
                        composerIdle();
                    }
                }
                return;
            }

            const cb = e.target.closest('input[type=checkbox][data-follow-key]');
            if (cb) {
                const key = cb.dataset.followKey;
                const obj = getGlobalTextColors();
                if (cb.checked) {
                    delete obj[key];
                    setGlobalTextColors(obj);
                    applyGlobalTextColors();
                    render();
                } else {
                    const b = BUBBLE_KEYS.find(x => x.key === key);
                    const cur = getComputedStyle(document.documentElement).getPropertyValue(b.varText);
                    obj[key] = normalizeHex(cur.split(',')[0]);
                    setGlobalTextColors(obj);
                    applyGlobalTextColors();
                    render();
                }
                return;
            }
        });

        /* ---------- 开关按钮 ---------- */
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const open = panel.classList.toggle('open');
            if (open) render();
        });

        /* ---------- 点外部关闭 ---------- */
        document.addEventListener('click', (e) => {
            if (panel.classList.contains('open') && !panel.contains(e.target) && !btn.contains(e.target) && !e.target.closest('.modal-mask')) {
                panel.classList.remove('open');
            }
        });
    }

    createThemePanel();

    /* =========================================
       12. 阅读进度记录 + 位置恢复
       逐段模式：进度 = 已展开段落 / 总段落
       全文展开模式：进度 = 滚动到达的最深位置
       数据存本地，与目录页共享，读完自动记入已读
       ========================================= */
    const PROGRESS_KEY = 'nightmareChapterProgress';
    const READ_KEY = 'nightmareReadChapters';
    const POS_KEY = 'nightmareLastPosition';
    const LINK_KEY = 'lastReadLink';
    const TITLE_KEY = 'lastReadTitle';

    (function initChapterProgress() {
        const chMatch = location.pathname.match(/Chapter(\d+)/i);
        if (!chMatch || !items.length) return;

        const chNum = parseInt(chMatch[1], 10);
        const total = items.length;
        let maxScrollPct = 0;
        let finishedToastShown = false;

        function loadJSON(key, fallback) {
            try {
                const v = JSON.parse(localStorage.getItem(key));
                return v == null ? fallback : v;
            } catch (e) { return fallback; }
        }
        function isExpanded() { return !!(expandBtn && expandBtn.classList.contains('done')); }

        function currentPct() {
            if (isExpanded()) {
                const d = document.documentElement;
                const range = d.scrollHeight - window.innerHeight;
                const pct = range > 40 ? Math.min(100, Math.round(((window.scrollY || d.scrollTop || 0) / range) * 100)) : 100;
                maxScrollPct = Math.max(maxScrollPct, pct);
                return maxScrollPct;
            }
            // 正在打字的那一段还没算读完，避免最后一段刚开始就标记 100%
            let doneCount = currentIndex;
            if (activeTyper && !activeTyper.isDone()) doneCount = Math.max(0, doneCount - 1);
            return Math.round((doneCount / total) * 100);
        }

        function chapterTitle() {
            return '第' + chNum + '章 ' + (document.title || '').replace(/^\d+\s*/, '');
        }

        function floatToast(msg) {
            const t = document.createElement('div');
            t.textContent = msg;
            t.style.cssText = 'position:fixed;left:50%;top:56px;transform:translateX(-50%);z-index:99999;background:rgba(10,20,18,.95);border:1px solid #c1fff0;color:#c1fff0;padding:8px 18px;border-radius:20px;font-size:14px;pointer-events:none;transition:opacity .5s;max-width:90vw;text-align:center;';
            document.body.appendChild(t);
            setTimeout(() => { t.style.opacity = '0'; }, 2400);
            setTimeout(() => { if (t.parentNode) t.parentNode.removeChild(t); }, 3000);
        }

        function saveProgress() {
            const map = loadJSON(PROGRESS_KEY, {});
            const prev = map[chNum] || 0;
            const pctNow = Math.max(prev, currentPct());

            try {
                localStorage.setItem(LINK_KEY, location.href);
                localStorage.setItem(TITLE_KEY, chapterTitle());
                localStorage.setItem(POS_KEY, JSON.stringify({
                    num: chNum,
                    percent: pctNow,
                    reveal: currentIndex,
                    scrollY: window.scrollY || document.documentElement.scrollTop || 0,
                    expanded: isExpanded(),
                    ts: Date.now()
                }));
            } catch (e) { }

            if (prev >= 100) return;
            if (pctNow === prev) return;

            map[chNum] = pctNow;
            try { localStorage.setItem(PROGRESS_KEY, JSON.stringify(map)); } catch (e) { }

            if (pctNow >= 100) {
                const arr = loadJSON(READ_KEY, []);
                if (arr.indexOf(chNum) === -1) {
                    arr.push(chNum);
                    try { localStorage.setItem(READ_KEY, JSON.stringify(arr)); } catch (e) { }
                }
                if (!finishedToastShown) {
                    finishedToastShown = true;
                    floatToast('✓ 本章读完，进度已同步到目录');
                }
            }
        }

        /* ---------- 恢复上次阅读位置（有进度且未读完时） ---------- */
        const savedMap = loadJSON(PROGRESS_KEY, {});
        const savedPct = savedMap[chNum] || 0;
        maxScrollPct = savedPct;

        const pos = loadJSON(POS_KEY, null);
        if (pos && pos.num === chNum && savedPct > 0 && savedPct < 100) {
            let revealCount = Math.min(total, Math.max(0, pos.reveal || 0));
            if (pos.expanded) revealCount = total;

            if (revealCount > 0) {
                for (let i = 0; i < revealCount; i++) {
                    items[i].style.transition = 'none';
                    items[i].classList.add('show');
                    items[i].style.maxHeight = 'none';
                }
                currentIndex = revealCount;

                if (revealCount >= total) {
                    // 上次已经读完整章：收起输入框、点亮"展开全文"、显示章节导航
                    chapterCompleted = true;
                    hideComposer();
                    const nav = document.getElementById('chapter-nav');
                    if (nav) nav.classList.add('show');
                    if (expandBtn) {
                        expandBtn.classList.add('done');
                        expandBtn.innerHTML = '<i class="iconfont icon-yuedu"></i>';
                    }
                }

                updateProgress();
                updateAutoBanner();
                composerIdle();

                void document.body.offsetHeight;
                requestAnimationFrame(() => {
                    for (let i = 0; i < revealCount; i++) items[i].style.transition = '';
                    window.scrollTo(0, pos.scrollY || 0);
                });

                floatToast('已恢复到上次阅读位置 · ' + savedPct + '%');
            }
        }

        saveProgress();
        setInterval(saveProgress, 1000);
        window.addEventListener('pagehide', saveProgress);
        document.addEventListener('visibilitychange', () => { if (document.hidden) saveProgress(); });
        window.addEventListener('scroll', () => { if (isExpanded()) saveProgress(); }, { passive: true });
    })();

    /* =========================================
       13. 连播初始化（放在进度恢复之后，避免覆盖已恢复的位置）
       ========================================= */
    (function initAutoPlayOnLoad() {
        updateComposerMode();
        updateProgress();
        updateAutoBanner();

        if (!readSettings.autoPlay) return;

        // 已读完（含进度恢复导致）：不自动跳章，等用户点"进入下一章"
        if (currentIndex >= items.length) return;

        let resumed = false;
        try {
            resumed = sessionStorage.getItem(AUTO_CONTINUE_KEY) === '1';
            sessionStorage.removeItem(AUTO_CONTINUE_KEY);
        } catch (e) { }

        stopAutoPlay();
        autoTimer = setTimeout(() => { autoTimer = null; revealNextItem(); }, resumed ? 150 : 600);
    })();

})();