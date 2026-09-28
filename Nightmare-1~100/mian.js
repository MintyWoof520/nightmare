// =========================================
// 极简点击显示逻辑（手机/电脑全兼容版）
// =========================================

// 1. 获取所有故事段落
const items = document.querySelectorAll('.story-item');
let currentIndex = 0; // 当前显示到第几段

// 2. 核心函数：显示下一段
function revealNextItem() {
    // 如果还有没显示的内容
    if (currentIndex < items.length) {
        // 显示当前段落
        items[currentIndex].classList.add('show');
        currentIndex++;
        
        // 自动平滑滚动到页面最底部，确保新内容被看到
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    }
}

// 3. 定义一个变量，用来防止手机端“点一下触发两次”的问题
let isProcessing = false;

// 4. 监听整个屏幕的点击（鼠标 + 触摸）
function handleScreenClick(e) {
    // 防抖锁：如果正在处理中，直接忽略
    if (isProcessing) return;
    
    // 排除点击链接或按钮的情况（比如底部的“下一章”）
    if (e.target.tagName === 'A' || e.target.closest('a') || e.target.tagName === 'BUTTON') {
        return;
    }

    // 加锁，防止 300ms 内连续触发
    isProcessing = true;
    revealNextItem();

    // 200毫秒后解锁，让下一次点击可以生效
    setTimeout(() => {
        isProcessing = false;
    }, 200);
}

// 5. 绑定事件监听
// 鼠标点击（电脑端）
document.addEventListener('click', handleScreenClick);

// 触摸结束（手机端，取代 click，避免延迟和双重触发）
document.addEventListener('touchend', function(e) {
    // 阻止默认的 click 事件触发，防止弹两次
    e.preventDefault(); 
    handleScreenClick(e);
}, { passive: false }); 

// 6. 键盘按键（空格/回车）作为备选
document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        if (isProcessing) return;
        isProcessing = true;
        revealNextItem();
        setTimeout(() => { isProcessing = false; }, 200);
    }
});
