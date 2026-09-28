// =========================================
// 极简点击显示逻辑（手机/电脑全兼容 + 滑动防误触版）
// =========================================

// 1. 获取所有故事段落
const items = document.querySelectorAll('.story-item');
let currentIndex = 0; // 当前显示到第几段
let isProcessing = false; // 防抖锁，防止一次点击触发两次

// 2. 核心函数：显示下一段
function revealNextItem() {
    if (currentIndex < items.length) {
        items[currentIndex].classList.add('show');
        currentIndex++;
        
        // 自动平滑滚动到页面最底部
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
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