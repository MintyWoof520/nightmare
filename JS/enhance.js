/* ==========================================
   噩梦时代 - 交互重构 v6 (enhance.js)
   目录页：深渊档案库（统计 / 搜索 / 排序 / 清除记录 / 章节百分比）
   阅读方式：新标签页打开章节（原生行为）
   进度数据：由章节页 mian.js 写入本地存储，本页读取并实时同步
   ========================================== */
(function () {
    'use strict';

    var READ_KEY = 'nightmareReadChapters';       // 读完章节号集合
    var LINK_KEY = 'lastReadLink';                // 上次阅读位置链接
    var TITLE_KEY = 'lastReadTitle';              // 上次阅读位置标题
    var PROGRESS_KEY = 'nightmareChapterProgress'; // 每章阅读百分比 {章节号: 0~100}
    var POS_KEY = 'nightmareLastPosition';        // 上次位置详情 {num, percent, ...}

    var chapters = [];        // { a, li, num, title, volumeIndex, pctEl }
    var navOrder = [];        // 按章节号排序
    var volumes = [];         // { details, chapters, fillEl, progressTextEl }
    var readSet = loadReadSet();
    var defaultOpenIndex = 0;
    var savedOpenState = null;
    var ascending = true;
    var booted = false;

    document.addEventListener('DOMContentLoaded', function () {
        if (booted) return;   // 防重入：初始化只执行一次
        booted = true;
        collectChapters();      // 先解析章节数据（首页也要用）
        initNavScroll();        // 导航栏滚动隐藏
        initHomePage();         // 首页：英雄区 + 统计 + 群卡片
        initMuluPage();         // 目录：档案库重构
        initBackToTop();        // 回到顶部
        initSync();             // 跨标签页 / 回到页面时同步阅读数据
    });

    /* SECTION: data */
    // ---------- 数据解析与本地存储 ----------
    function loadReadSet() {
        try {
            var arr = JSON.parse(localStorage.getItem(READ_KEY) || '[]');
            var s = {};
            arr.forEach(function (n) { s[n] = true; });
            return s;
        } catch (e) { return {}; }
    }

    function loadProgressMap() {
        try {
            var m = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
            return (m && typeof m === 'object') ? m : {};
        } catch (e) { return {}; }
    }

    function collectChapters() {
        var mulu = document.getElementById('page-mulu');
        if (!mulu) return;
        var detailsList = mulu.querySelectorAll('details');
        detailsList.forEach(function (details, vi) {
            var vol = { details: details, chapters: [] };
            details.querySelectorAll('li a').forEach(function (a) {
                var raw = (a.textContent || '').trim();
                var m = raw.match(/^(\d+)\s*(.*)$/);
                var num = m ? parseInt(m[1], 10) : 0;
                var title = m ? m[2] : raw;
                var ch = { a: a, li: a.closest('li'), num: num, title: title, volumeIndex: vi, pctEl: null };
                chapters.push(ch);
                vol.chapters.push(ch);
            });
            volumes.push(vol);
        });
        navOrder = chapters.slice().sort(function (a, b) { return a.num - b.num; });
        // 默认展开：上次位置所在卷，否则第一卷
        var lastLink = localStorage.getItem(LINK_KEY);
        if (lastLink) {
            for (var i = 0; i < chapters.length; i++) {
                if (chapters[i].a.href === lastLink) { defaultOpenIndex = chapters[i].volumeIndex; break; }
            }
        }
    }

    function resolveTarget() {
        var lastLink = localStorage.getItem(LINK_KEY);
        if (lastLink) {
            for (var i = 0; i < chapters.length; i++) {
                if (chapters[i].a.href === lastLink) return chapters[i];
            }
        }
        return navOrder[0] || null;
    }

    function latestChapter() {
        return navOrder.length ? navOrder[navOrder.length - 1] : null;
    }

    function latestUpdateDate() {
        var dates = document.querySelectorAll('.log-date');
        if (dates.length) return dates[dates.length - 1].textContent.trim();
        return '—';
    }

    /* SECTION: sync */
    // ---------- 跨标签页同步：章节页写入进度后，目录页实时刷新 ----------
    function initSync() {
        window.addEventListener('storage', function (e) {
            if (e.key === READ_KEY || e.key === LINK_KEY || e.key === TITLE_KEY ||
                e.key === PROGRESS_KEY || e.key === POS_KEY) refreshFromStorage();
        });
        document.addEventListener('visibilitychange', function () {
            if (!document.hidden) refreshFromStorage();
        });
        window.addEventListener('focus', refreshFromStorage);
    }

    function refreshFromStorage() {
        readSet = loadReadSet();
        var lastLink = localStorage.getItem(LINK_KEY);
        chapters.forEach(function (c) {
            c.a.classList.toggle('is-read', !!readSet[c.num]);
            c.a.classList.toggle('is-last', c.a.href === lastLink);
        });
        volumes.forEach(updateVolumeProgress);
        refreshPercents();
        ensureResumeCard();
        updateHomeReadStat();
        updateHeroProgress();
        updateHeroButton();
    }

    // 章节卡片百分比徽章（读完的章显示对勾，不显示百分比）
    function refreshPercents() {
        var map = loadProgressMap();
        chapters.forEach(function (ch) {
            if (!ch.pctEl) return;
            var pct = map[ch.num] || 0;
            if (pct > 0 && pct < 100) {
                ch.pctEl.textContent = pct + '%';
                ch.pctEl.classList.add('show');
            } else {
                ch.pctEl.textContent = '';
                ch.pctEl.classList.remove('show');
            }
        });
    }

    /* SECTION: nav-scroll */
    // ---------- 导航栏滚动隐藏 ----------
    function initNavScroll() {
        var nav = document.getElementById('navContainer');
        if (!nav) return;
        var lastScrollY = window.scrollY;
        window.addEventListener('scroll', function () {
            var y = window.scrollY;
            if (y > lastScrollY && y > 100) nav.classList.add('nav-hidden');
            else if (y < lastScrollY) nav.classList.remove('nav-hidden');
            lastScrollY = y;
        }, { passive: true });
    }

    /* SECTION: home */
    // ---------- 首页重构 ----------
    function initHomePage() {
        var home = document.getElementById('page-home');
        if (!home) return;

        // A. 首屏英雄区：封面 + 故障风标题 + 阅读入口 + 总进度
        var my1 = home.querySelector('.my1');
        var pic = home.querySelector('.pic');
        if (my1 && pic && chapters.length) {
            var hero = document.createElement('div');
            hero.className = 'hero';
            hero.innerHTML =
                '<div class="hero-cover"></div>' +
                '<div class="hero-info">' +
                '<h1 class="hero-title" data-text="噩梦时代"></h1>' +
                '<p class="hero-author"></p>' +
                '<p class="hero-tag"></p>' +
                '<div class="hero-cta">' +
                '<a class="cta-btn cta-primary" id="heroReadBtn" target="_blank"></a>' +
                '<button class="cta-btn cta-ghost" id="heroMuluBtn" type="button">浏览目录</button>' +
                '</div>' +
                '<div class="home-stats">' +
                '<span class="stat-chip">收录 <b id="homeStatTotal"></b> 章</span>' +
                '<span class="stat-chip">分卷 <b id="homeStatVols"></b></span>' +
                '<span class="stat-chip">读完 <b id="homeStatRead"></b> 章</span>' +
                '<span class="stat-chip">状态 <b>连载中</b></span>' +
                '</div>' +
                '<div class="hero-progress">' +
                '<div class="hero-progress-head"><span>噩梦回收进度</span><span id="heroProgText"></span></div>' +
                '<div class="hero-progress-bar"><div class="hero-progress-fill" id="heroProgFill"></div></div>' +
                '</div>' +
                '</div>';
            my1.insertBefore(hero, my1.firstChild);
            hero.querySelector('.hero-cover').appendChild(pic);
            hero.querySelector('.hero-title').textContent = '噩梦时代';
            hero.querySelector('.hero-author').textContent = '作者 · 仄黎';
            hero.querySelector('.hero-tag').textContent = '欢迎来到噩梦时代。请保持清醒。';

            // 阅读入口：原生新标签页打开，点击时记录位置
            var readBtn = document.getElementById('heroReadBtn');
            readBtn.addEventListener('click', function () {
                var target = resolveTarget();
                if (target) recordPosition(target);
            });
            updateHeroButton();
            document.getElementById('heroMuluBtn').addEventListener('click', function () {
                window.location.hash = 'mulu';
                window.scrollTo({ top: 0 });
            });

            document.getElementById('homeStatTotal').textContent = chapters.length;
            document.getElementById('homeStatVols').textContent = volumes.length;
            updateHomeReadStat();
            updateHeroProgress();

            // B. 原正文卡片改成「站长手记」，大标题移入英雄区
            var wenzi = home.querySelector('.wenzi');
            if (wenzi) {
                var oldH1 = wenzi.querySelector('h1');
                if (oldH1) {
                    var br = oldH1.nextElementSibling;
                    oldH1.remove();
                    if (br && br.tagName === 'BR') br.remove();
                }
                var noteHead = document.createElement('div');
                noteHead.className = 'note-head';
                noteHead.textContent = '// 薄荷的话 //';
                wenzi.insertBefore(noteHead, wenzi.firstChild);
            }

            // 漂浮余烬粒子（纯装饰，不拦截点击）
            var embers = document.createElement('div');
            embers.className = 'embers';
            embers.setAttribute('aria-hidden', 'true');
            for (var k = 0; k < 14; k++) {
                var s = document.createElement('span');
                s.className = 'ember';
                var size = 2 + Math.random() * 4;
                s.style.left = (Math.random() * 100) + '%';
                s.style.width = size + 'px';
                s.style.height = size + 'px';
                s.style.animationDuration = (9 + Math.random() * 12) + 's';
                s.style.animationDelay = (-Math.random() * 18) + 's';
                embers.appendChild(s);
            }
            home.insertBefore(embers, home.firstChild);
        }

        // C. 群号通行证卡片
        var wenzi2 = home.querySelector('.wenzi2');
        if (wenzi2) {
            wenzi2.innerHTML =
                '<div class="shelter-card" id="copyGroupBtn" title="点击复制群号">' +
                '<div class="shelter-title">// 一个神秘的群 //</div>' +
                '<div class="shelter-num">813678909</div>' +
                '<div class="shelter-tip">进群答案：万俟子琅 (点击复制)</div>' +
                '</div>';
            document.getElementById('copyGroupBtn').addEventListener('click', function () {
                var tip = this.querySelector('.shelter-tip');
                var old = tip.textContent;
                function ok() {
                    tip.textContent = '✔ 复制成功！';
                    tip.style.color = '#c1fff0';
                    setTimeout(function () { tip.textContent = old; tip.style.color = '#888'; }, 2000);
                }
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText('813678909').then(ok, function () { fallbackCopy(ok); });
                } else { fallbackCopy(ok); }
            });
        }
    }

    function fallbackCopy(ok) {
        var ta = document.createElement('textarea');
        ta.value = '813678909';
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        try { document.execCommand('copy'); ok(); } catch (e) { }
        document.body.removeChild(ta);
    }

    function updateHomeReadStat() {
        var el = document.getElementById('homeStatRead');
        if (el) el.textContent = Object.keys(readSet).length;
    }

    function updateHeroProgress() {
        var fill = document.getElementById('heroProgFill');
        var text = document.getElementById('heroProgText');
        if (!fill || !text) return;
        var read = Object.keys(readSet).length;
        var total = chapters.length || 1;
        fill.style.width = Math.round(read / total * 100) + '%';
        text.textContent = read + ' / ' + chapters.length + ' 章';
    }

    function updateHeroButton() {
        var btn = document.getElementById('heroReadBtn');
        if (!btn) return;
        var target = resolveTarget();
        if (!target) return;
        btn.href = target.a.href;
        var hasHistory = !!localStorage.getItem(LINK_KEY);
        btn.textContent = hasHistory ? ('继续阅读 · 第' + target.num + '章') : '开始阅读 · 第1章';
    }

    /* SECTION: mulu */
    // ---------- 目录重构：深渊档案库 ----------
    function initMuluPage() {
        var mulu = document.getElementById('page-mulu');
        if (!mulu || !volumes.length) return;
        var navMiao = mulu.querySelector('.miao');
        if (!navMiao) return;

        // A. 标题与副标题
        var h1 = mulu.querySelector('h1');
        if (h1) {
            h1.classList.add('archive-title');
            h1.textContent = '噩梦';
            var sub = document.createElement('p');
            sub.className = 'archive-sub';
            sub.textContent = '《噩梦时代》 · 仄黎 著';
            h1.insertAdjacentElement('afterend', sub);
        }

        // B. 顶部统计栏
        var latest = latestChapter();
        var stats = document.createElement('div');
        stats.className = 'archive-stats';
        stats.innerHTML =
            '<div class="archive-stat"><span class="stat-num" id="arcTotal"></span><span class="stat-label">收录章节</span></div>' +
            '<div class="archive-stat"><span class="stat-num" id="arcVols"></span><span class="stat-label">档案分卷</span></div>' +
            '<div class="archive-stat"><span class="stat-num stat-small" id="arcLatest"></span><span class="stat-label">最新章节</span></div>' +
            '<div class="archive-stat"><span class="stat-num stat-small" id="arcDate"></span><span class="stat-label">最近更新</span></div>';
        navMiao.insertAdjacentElement('beforebegin', stats);
        document.getElementById('arcTotal').textContent = chapters.length;
        document.getElementById('arcVols').textContent = volumes.length;
        document.getElementById('arcLatest').textContent = latest ? ('第' + latest.num + '章 ' + latest.title) : '—';
        document.getElementById('arcDate').textContent = latestUpdateDate();

        // C. 继续阅读卡片
        ensureResumeCard();

        // D. 工具栏：搜索 + 全部展开 + 排序 + 清除记录
        var toolbar = document.createElement('div');
        toolbar.className = 'mulu-toolbar';
        toolbar.innerHTML =
            '<div class="search-container">' +
            '<svg class="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg>' +
            '<input type="text" class="search-input" id="chapterSearch" placeholder="输入章节名或序号…">' +
            '<span class="search-count" id="searchCount"></span>' +
            '</div>' +
            '<div class="toolbar-btns">' +
            '<button class="tool-btn" id="toggleAllBtn" type="button">展开全部</button>' +
            '<button class="tool-btn" id="orderBtn" type="button">倒序排列</button>' +
            '<button class="tool-btn tool-danger" id="clearReadBtn" type="button">清除记录</button>' +
            '</div>';
        navMiao.insertAdjacentElement('beforebegin', toolbar);

        // 搜索空状态
        var empty = document.createElement('div');
        empty.className = 'search-empty';
        empty.id = 'searchEmpty';
        empty.innerHTML = '档案库中未检索到匹配章节<br>试试更短的关键词，或直接输入章节序号';
        navMiao.insertAdjacentElement('afterend', empty);

        // E. 重构每个分卷面板
        var volNames = ['卷一', '卷二', '卷三', '卷四', '卷五', '卷六', '卷七', '卷八'];
        var lastLink = localStorage.getItem(LINK_KEY);
        volumes.forEach(function (vol, vi) {
            var details = vol.details;
            var summary = details.querySelector('summary');
            var rangeText = summary ? summary.textContent.trim() : ('章节 ' + (vi + 1));
            if (summary) {
                summary.textContent = '';
                summary.innerHTML =
                    '<span class="vol-chevron">❯</span>' +
                    '<span class="vol-badge"></span>' +
                    '<span class="vol-range"></span>' +
                    '<span class="vol-count"></span>' +
                    '<span class="vol-progress"><span class="vol-progress-bar"><span class="vol-progress-fill"></span></span><span class="vol-progress-text"></span></span>';
                summary.querySelector('.vol-badge').textContent = volNames[vi] || ('卷' + (vi + 1));
                summary.querySelector('.vol-range').textContent = rangeText;
                summary.querySelector('.vol-count').textContent = vol.chapters.length + ' 章';
                vol.fillEl = summary.querySelector('.vol-progress-fill');
                vol.progressTextEl = summary.querySelector('.vol-progress-text');
            }
            details.open = (vi === defaultOpenIndex);

            // F. 重构章节卡片：序号 + 百分比 + 标题；点击原生新标签页打开
            vol.chapters.forEach(function (ch) {
                var a = ch.a;
                a.textContent = '';
                var topEl = document.createElement('span');
                topEl.className = 'ch-top';
                var numEl = document.createElement('span');
                numEl.className = 'ch-num';
                numEl.textContent = 'NO.' + String(ch.num).padStart(3, '0');
                var pctEl = document.createElement('span');
                pctEl.className = 'ch-pct';
                topEl.appendChild(numEl);
                topEl.appendChild(pctEl);
                var titleEl = document.createElement('span');
                titleEl.className = 'ch-title';
                titleEl.textContent = ch.title;
                a.appendChild(topEl);
                a.appendChild(titleEl);
                ch.pctEl = pctEl;
                a.dataset.num = ch.num;
                if (readSet[ch.num]) a.classList.add('is-read');
                if (a.href === lastLink) a.classList.add('is-last');
                a.addEventListener('click', function () { recordPosition(ch); });
            });
            updateVolumeProgress(vol);
        });
        refreshPercents();

        // G. 搜索
        var input = document.getElementById('chapterSearch');
        var countEl = document.getElementById('searchCount');
        var emptyEl = document.getElementById('searchEmpty');
        input.addEventListener('input', function () {
            var keyword = input.value.trim().toLowerCase();
            if (keyword && savedOpenState === null) {
                savedOpenState = volumes.map(function (v) { return v.details.open; });
            }
            var hits = 0;
            volumes.forEach(function (vol) {
                var visible = 0;
                vol.chapters.forEach(function (ch) {
                    var match = !keyword ||
                        String(ch.num).indexOf(keyword) !== -1 ||
                        ch.title.toLowerCase().indexOf(keyword) !== -1;
                    ch.li.classList.toggle('search-hidden', !match);
                    if (match) visible++;
                });
                hits += visible;
                vol.details.style.display = visible ? '' : 'none';
                if (keyword) vol.details.open = visible > 0;
            });
            if (!keyword && savedOpenState) {
                volumes.forEach(function (vol, i) { vol.details.open = savedOpenState[i]; });
                savedOpenState = null;
            }
            countEl.textContent = keyword ? ('命中 ' + hits + ' 章') : '';
            countEl.classList.toggle('show', !!keyword);
            emptyEl.classList.toggle('show', !!keyword && hits === 0);
            updateToggleAllBtn();
        });

        // H. 全部展开 / 收起
        var toggleAllBtn = document.getElementById('toggleAllBtn');
        toggleAllBtn.addEventListener('click', function () {
            var anyClosed = volumes.some(function (v) { return !v.details.open; });
            volumes.forEach(function (v) { v.details.open = anyClosed; });
            updateToggleAllBtn();
        });
        volumes.forEach(function (v) {
            v.details.addEventListener('toggle', updateToggleAllBtn);
        });
        updateToggleAllBtn();

        // I. 正序 / 倒序
        var orderBtn = document.getElementById('orderBtn');
        orderBtn.addEventListener('click', function () {
            ascending = !ascending;
            orderBtn.textContent = ascending ? '倒序排列' : '正序排列';
            volumes.forEach(function (vol) {
                var ul = vol.details.querySelector('ul');
                if (!ul) return;
                var items = Array.prototype.slice.call(ul.children);
                if (!ascending) items.reverse();
                items.forEach(function (li) { ul.appendChild(li); });
            });
            var outerUl = navMiao.querySelector(':scope > ul');
            if (outerUl) {
                var ds = Array.prototype.slice.call(outerUl.querySelectorAll(':scope > details'));
                if (!ascending) ds.reverse();
                ds.forEach(function (d) { outerUl.appendChild(d); });
            }
        });

        // J. 清除阅读记录（二次确认，3 秒不确认自动还原）
        var clearBtn = document.getElementById('clearReadBtn');
        var clearArmed = false;
        var clearTimer = null;
        function disarmClear() {
            clearArmed = false;
            clearBtn.textContent = '清除记录';
            clearBtn.classList.remove('armed');
            if (clearTimer) { clearTimeout(clearTimer); clearTimer = null; }
        }
        clearBtn.addEventListener('click', function () {
            if (!clearArmed) {
                clearArmed = true;
                clearBtn.textContent = '确认清除？';
                clearBtn.classList.add('armed');
                clearTimer = setTimeout(disarmClear, 3000);
                return;
            }
            disarmClear();
            clearReadHistory();
            clearBtn.textContent = '已清除 ✓';
            setTimeout(function () { clearBtn.textContent = '清除记录'; }, 1800);
        });
    }

    // 清空全部阅读痕迹：读完标记、百分比、位置、进度、首页入口
    function clearReadHistory() {
        readSet = {};
        try {
            localStorage.removeItem(READ_KEY);
            localStorage.removeItem(LINK_KEY);
            localStorage.removeItem(TITLE_KEY);
            localStorage.removeItem(PROGRESS_KEY);
            localStorage.removeItem(POS_KEY);
        } catch (e) { }
        chapters.forEach(function (c) {
            c.a.classList.remove('is-read', 'is-last');
        });
        volumes.forEach(updateVolumeProgress);
        refreshPercents();
        ensureResumeCard();
        updateHomeReadStat();
        updateHeroProgress();
        updateHeroButton();
    }

    function updateToggleAllBtn() {
        var btn = document.getElementById('toggleAllBtn');
        if (!btn) return;
        var allOpen = volumes.length && volumes.every(function (v) { return v.details.open; });
        btn.textContent = allOpen ? '收起全部' : '展开全部';
    }

    function updateVolumeProgress(vol) {
        if (!vol.fillEl) return;
        var read = 0;
        vol.chapters.forEach(function (ch) { if (readSet[ch.num]) read++; });
        var total = vol.chapters.length || 1;
        vol.fillEl.style.width = Math.round(read / total * 100) + '%';
        vol.progressTextEl.textContent = '读完 ' + read + '/' + vol.chapters.length;
    }

    /* SECTION: read-tracking */
    // ---------- 阅读位置记录（进度百分比由章节页 mian.js 负责写入） ----------
    function recordPosition(ch) {
        try {
            localStorage.setItem(LINK_KEY, ch.a.href);
            localStorage.setItem(TITLE_KEY, '第' + ch.num + '章 ' + ch.title);
        } catch (e) { }
        chapters.forEach(function (c) {
            c.a.classList.toggle('is-last', c === ch);
        });
        ensureResumeCard();
        updateHeroButton();
    }

    /* SECTION: resume-card */
    // ---------- 继续阅读卡片（显示上次阅读位置与百分比） ----------
    function ensureResumeCard() {
        var link = localStorage.getItem(LINK_KEY);
        var title = localStorage.getItem(TITLE_KEY);
        var card = document.getElementById('resumeCard');
        if (!link || !title) {
            if (card) card.remove();
            return;
        }
        if (!card) {
            card = document.createElement('div');
            card.className = 'resume-card';
            card.id = 'resumeCard';
            card.innerHTML =
                '<div class="resume-text" id="resumeText"></div>' +
                '<div class="resume-btn">继续阅读</div>';
            var anchor = document.querySelector('.mulu-toolbar') || document.querySelector('#page-mulu .miao');
            if (!anchor) return;
            anchor.insertAdjacentElement('beforebegin', card);
        }
        var suffix = '';
        try {
            var pos = JSON.parse(localStorage.getItem(POS_KEY) || 'null');
            if (pos && pos.percent > 0) {
                suffix = pos.percent >= 100 ? ' · 已读完' : ' · ' + pos.percent + '%';
            }
        } catch (e) { }
        document.getElementById('resumeText').textContent = '上次阅读到：' + title + suffix;
        card.onclick = function () { window.open(link, '_blank'); };
    }

    /* SECTION: back-to-top */
    // ---------- 回到顶部 ----------
    function initBackToTop() {
        var btn = document.createElement('button');
        btn.id = 'backToTop';
        btn.setAttribute('aria-label', '回到顶部');
        btn.innerHTML = '<svg viewBox="0 0 24 24" style="width:24px;height:24px;fill:currentColor;"><path d="M7.41 15.41L12 10.83l4.59 4.58L18 14l-6-6-6 6z"/></svg>';
        document.body.appendChild(btn);
        window.addEventListener('scroll', function () {
            btn.classList.toggle('show', window.scrollY > 300);
        }, { passive: true });
        btn.addEventListener('click', function () {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

})();