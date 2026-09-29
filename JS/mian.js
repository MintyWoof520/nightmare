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
    if (e.changedTouches.length === 1) {
        const touchEndY = e.changedTouches[0].clientY;
        const touchEndX = e.changedTouches[0].clientX;
        
        // 计算滑动的距离
        const deltaY = Math.abs(touchEndY - touchStartY);
        const deltaX = Math.abs(touchEndX - touchStartX);
        
        // 如果滑动距离超过 10px，说明用户是在滚屏，直接返回，不触发剧情
        if (deltaY > 10 || deltaX > 10) {
            return;
        }
    }
    
    // 如果滑动距离很小，说明是“点按”，触发剧情
    // preventDefault 是为了阻止手机浏览器在 touchend 后还会触发一次 click 事件，防止弹出两次
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