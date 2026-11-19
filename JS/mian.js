/* 章节页交互逻辑（优化版 + 全局字色 + 自定义主题 + 自定义背景） */
(function () {
    'use strict';

    /* =========================================
       1. 对话逐段显示
       ========================================= */
    const items = document.querySelectorAll('.story-item');
    let currentIndex = 0;
    let isProcessing = false;

    function revealNextItem() {
        if (currentIndex >= items.length) return;

        const el = items[currentIndex];
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

        currentIndex++;

        requestAnimationFrame(() => {
            if (targetHeight > window.innerHeight * 0.8) {
                window.scrollTo({ top: Math.max(0, el.offsetTop - 20), behavior: 'smooth' });
            } else {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
            }
        });

        if (currentIndex === items.length) {
            const nav = document.getElementById('chapter-nav');
            if (nav) {
                nav.classList.add('show');
                setTimeout(() => {
                    window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
                }, 300);
            }
        }
    }

    function handleScreenClick(e) {
        if (isProcessing) return;

        if (e.target.closest(
            '.hint-trigger, .theme-toggle, .theme-panel, .modal-mask, #expand-btn, a, button, .chapter-nav'
        )) {
            return;
        }

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
            '.hint-trigger, .theme-toggle, .theme-panel, .modal-mask, #expand-btn, a, button, .chapter-nav'
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
            document.body.classList.add('no-transition');
            items.forEach(item => {
                item.classList.add('show');
                item.style.maxHeight = 'none';
            });
            currentIndex = items.length;
            expandBtn.classList.add('done');
            expandBtn.innerHTML = '<i class="iconfont icon-yuedu"></i>';
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
                // cyber 主题自带 background-size: 200% 的流光动画
                // 我们根据传入的颜色数量，生成完美首尾相接的循环色标
                if (hasC3) {
                    // 3色循环：A -> B -> C -> A 无限滚动
                    return `linear-gradient(${dir}, ${c1} 0%, ${c2} 16.66%, ${c3} 33.33%, ${c1} 50%, ${c2} 66.66%, ${c3} 83.33%, ${c1} 100%)`;
                } else if (b.c2 && b.c2 !== b.c1) {
                    // 2色交替：A -> B -> A
                    return `linear-gradient(${dir}, ${c1} 0%, ${c2} 25%, ${c1} 50%, ${c2} 75%, ${c1} 100%)`;
                }
                // 单色
                return `linear-gradient(${dir}, ${c1}, ${c1})`;
            } else {
                // 普通主题不支持动画，直接自然过渡
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
            left:      { text: '#ffffff', bgType: 'gradient', c1: '#400652', c2: '#e65757', c3: '', dir: 'to right', alpha: 0.85 },
            right:     { text: '#ffffff', bgType: 'gradient', c1: '#000000', c2: '#3592dd', c3: '', dir: 'to left',  alpha: 0.85 },
            narration: { text: '#fff2ce', bgType: 'gradient', c1: '#660000', c2: '#aa3333', c3: '', dir: 'to bottom right', alpha: 0.8 },
            hint:      { text: '#ffffff', bgType: 'gradient', c1: '#2c0303', c2: '#e25f5f', c3: '', dir: 'to bottom right', alpha: 0.9 }
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
                        // 基础主题变了，重绘所有预览气泡以适配动画
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
    let refreshPanel = () => {};

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
                if (action === 'new-bg')    { openBgEditor(); return; }
                if (action === 'edit-theme')   { openThemeEditor(id); return; }
                if (action === 'edit-bg')      { openBgEditor(id); return; }
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

        /* ---------- 快捷字色：取色器实时更新 ---------- */
        panel.addEventListener('input', (e) => {
            const input = e.target.closest('input[type=color][data-global-key]');
            if (!input) return;
            const key = input.dataset.globalKey;
            const obj = getGlobalTextColors();
            obj[key] = input.value;
            setGlobalTextColors(obj);
            applyGlobalTextColors();
        });

        /* ---------- 快捷字色：跟随开关 ---------- */
        panel.addEventListener('change', (e) => {
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
})();