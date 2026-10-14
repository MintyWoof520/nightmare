/* 欸呦喂，这都让你找到了，那你就好好看一看我和胖鲸鱼一起写的屎山代码吧口瓜！ */


// =========================================
// 极简点击显示逻辑（手机/电脑全兼容 + 滑动防误触版）
// =========================================

// 1. 获取所有故事段落
const items = document.querySelectorAll('.story-item');
let currentIndex = 0; // 当前显示到第几段
let isProcessing = false; // 防抖锁，防止一次点击触发两次

// 核心函数：显示下一段
function revealNextItem() {
    if (currentIndex < items.length) {
        // 1. 显示当前段落
        items[currentIndex].classList.add('show');
        currentIndex++;
        
        // 2. 自动平滑滚动到页面最底部
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
        
        // 3. 【新增】如果所有内容都显示完了，浮现导航栏
        if (currentIndex === items.length) {
            const nav = document.getElementById('chapter-nav');
            if (nav) {
                nav.classList.add('show');
                // 导航栏出现后，平滑滚动到底部，让读者看到导航
                setTimeout(() => {
                    window.scrollTo({
                        top: document.body.scrollHeight,
                        behavior: 'smooth'
                    });
                }, 300); // 延迟一点点滚动，等导航栏的动画做完
            }
        }
    }
}

// 3. 处理点击的核心逻辑
function handleScreenClick(e) {
    // 防抖锁：如果正在处理中，直接忽略
    if (isProcessing) return;
    // 点气泡 → 不推进剧情
    if (e.target.closest('.hint-trigger')) return;
    
    // 排除点击链接或按钮的情况（比如底部的“下一章”）
    if (e.target.tagName === 'A' || e.target.closest('a') || e.target.tagName === 'BUTTON') {
        return;
    }

    isProcessing = true;
    revealNextItem();

    // 200毫秒后解锁
    setTimeout(() => {
        isProcessing = false;
    }, 200);
}

// =========================================
// 4. 移动端触摸逻辑（包含了滑动误触检测）
// =========================================

// 记录手指按下的起始位置
let touchStartY = 0;
let touchStartX = 0;

// 手指按下时记录坐标
document.addEventListener('touchstart', function(e) {
    if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
        touchStartX = e.touches[0].clientX;
    }
}, { passive: true });

// 手指离开时判断是点击还是滑动
document.addEventListener('touchend', function(e) {

    if (e.target.closest('#expand-btn') || e.target.tagName === 'A' || e.target.tagName === 'BUTTON' 
        || e.target.closest('.chapter-nav') || e.target.closest('.hint-trigger')) {
        return;   // 放行，不 preventDefault，让 click 正常触发
    }
    
    // =========================================
    // 【新增】如果是点击“按钮”或“链接”，直接放行，不拦截
    // =========================================
    // 判断点击的目标是不是按钮或链接
    if (e.target.closest('#expand-btn') || e.target.tagName === 'A' || e.target.tagName === 'BUTTON' || e.target.closest('.chapter-nav')) {
        return; // 直接返回，不要执行下面的 preventDefault，让 click 事件正常触发
    }

    if (e.changedTouches.length === 1) {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        
        const deltaY = Math.abs(touchEndY - touchStartY);
        const deltaX = Math.abs(touchEndX - touchStartX);
        
        if (deltaY > 10 || deltaX > 10) {
            return; // 滑动，不触发剧情
        }
    }
    
    // 如果滑动距离很小，说明是“点按”，触发剧情
    e.preventDefault(); 
    handleScreenClick(e);
}, { passive: false });

// =========================================
// 5. 电脑端鼠标点击和键盘支持
// =========================================

// 电脑端鼠标点击
document.addEventListener('click', function(e) {
    // 这里判断一下，如果是触摸设备，上面已经处理过了，直接 return
    if (e.pointerType === 'touch') return;
    handleScreenClick(e);
});

// 键盘空格/回车支持（方便电脑调试）
document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (isProcessing) return;
        isProcessing = true;
        revealNextItem();
        setTimeout(() => { isProcessing = false; }, 200);
    }
});

// =========================================
// 一键展开全文功能
// =========================================

// 获取一键展开按钮
const expandBtn = document.getElementById('expand-btn');

if (expandBtn) {
    expandBtn.addEventListener('click', function(e) {
        e.stopPropagation(); // 阻止冒泡，防止误触发下一句
        
        // 1. 先让所有隐藏的段落显示出来
        items.forEach(item => {
            item.classList.add('show');
        });
        
        // 更新索引
        currentIndex = items.length;
        
        // 按钮状态更新
        expandBtn.classList.add('done');
        expandBtn.innerHTML = '✅';
        
        const nav = document.getElementById('chapter-nav');
        if (nav) nav.classList.add('show');

        // =========================================
        // 【核心修复】强制滚动到页面最底部
        // =========================================
        // 因为 CSS 里 .story-item.show 有 0.6s 的过渡动画，
        // 如果马上滚动，页面高度还没完全长开，滚动会失效。
        // 我们加一个 650ms（比动画稍长一点）的延迟，确保所有内容都撑开后再滚动。
                // =========================================
        // 【核心修改】展开后固定滚动到页面最顶部
        // =========================================
        setTimeout(() => {
            // 滚动到坐标 0,0，也就是页面最顶端
            window.scrollTo({
                top: 0,             // 目标位置：Y轴为0（最顶部）
                behavior: 'smooth'  // 平滑滚动过去，体验更好
            });
        }, 650); 
    });
}


// =========================================
// 点击气泡 → 散开 / 收起小段
// =========================================
document.querySelectorAll('.hint-trigger').forEach(trigger => {
    const toggle = (e) => {
        e.stopPropagation();

        const willOpen = !trigger.classList.contains('open');
        if (willOpen) {
            layoutHints(trigger);   // 展开前算位置
        }

        trigger.classList.toggle('open');

        const item = trigger.closest('.story-item');
        if (trigger.classList.contains('open')) {
            item.classList.add('bubble-open');
        } else {
            item.classList.remove('bubble-open');
        }
    };

    trigger.addEventListener('touchstart', (e) => {
        e.preventDefault();
        toggle(e);
    }, { passive: false });

    trigger.addEventListener('click', (e) => {
        if (e.pointerType === 'touch') return;
        toggle(e);
    });
});



// 隐藏评论自动排版
function layoutHints(trigger) {
    const hints = trigger.querySelectorAll('.hint');
    if (!hints.length) return;

    const rect = trigger.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;

    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // 判断气泡在屏幕左半还是右半，决定朝哪边散
    const toRight = cx < vw / 2;

    // 可用半径：朝内侧那一半的距离
    const availW = toRight ? (vw - cx - 20) : (cx - 20);
    const availH = Math.min(cy, vh - cy) - 20;

    // 半径：横向空间不够就压缩
    const r = Math.max(50, Math.min(availW * 0.85, availH * 1.1));

    // 扇形角度范围：朝内侧 ±60 度
    const baseAngle = toRight ? 0 : Math.PI;   // 朝右 = 0，朝左 = π
    const spread = Math.PI / 1.5;              // 扇形张开 120 度

    hints.forEach((el, i) => {
        const t = hints.length === 1 ? 0.5 : i / (hints.length - 1);
        const angle = baseAngle - spread / 2 + spread * t;

        let x = Math.cos(angle) * r;
        let y = Math.sin(angle) * r;

        // 夹紧，不让它出屏
        const halfW = (el.offsetWidth  / 2) || 40;
        const halfH = (el.offsetHeight / 2) || 16;
        const absX = cx + x;
        const absY = cy + y;

        if (absX - halfW < 6)       x += (6 - (absX - halfW));
        if (absX + halfW > vw - 6)  x -= ((absX + halfW) - (vw - 6));
        if (absY - halfH < 6)       y += (6 - (absY - halfH));
        if (absY + halfH > vh - 6)  y -= ((absY + halfH) - (vh - 6));

        el.style.setProperty('--x', x + 'px');
        el.style.setProperty('--y', y + 'px');
    });
}