// =========================================
// 点击屏幕逐段显示逻辑
// =========================================

// 1. 获取页面里所有需要显示的段落（旁白 + 对话）
// 注意：这里我们排除了 <h1> 标题，让标题一开始就显示
const items = document.querySelectorAll('.story-item');

let currentIndex = 0; // 记录当前显示到第几段了
let isTouching = false; // 标记触摸，防止手机误触

// 2. 核心函数：点击一下，显示下一段
function revealNextItem() {
    if (currentIndex < items.length) {
        // 给当前段落加上 .show 类，让它显示出来
        items[currentIndex].classList.add('show');
        
        // 自动滚动到刚刚显示出来的这一段（手机上很需要）
        items[currentIndex].scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
        });
        
        currentIndex++;
        
    } else {
        // 如果全部显示完了，可以给个提示或者跳转下一章
        // 例如：显示底部的“下一章”按钮
        const nextBtn = document.querySelector('.chapter-nav');
        if (nextBtn) nextBtn.style.opacity = '1';
    }
}

// 3. 监听点击事件（兼容电脑和手机）
document.body.addEventListener('click', function(e) {
    // 如果点的是“下一章”这种链接，或者操作按钮，不要触发展开剧情
    if (e.target.tagName === 'A' || e.target.closest('a') || e.target.tagName === 'BUTTON') {
        return;
    }
    
    // 防止手机滑动时误触发
    if (isTouching) return;
    
    revealNextItem();
});

// 4. 手机触摸防误触处理
document.body.addEventListener('touchstart', function() {
    isTouching = true;
}, { passive: true });

document.body.addEventListener('touchend', function(e) {
    // 如果手指滑动的距离很小（小于 10px），才算是“点击”
    // 这里为了简单，我们直接调用显示函数
    revealNextItem();
    
    // 重置触摸标记（稍微延迟一下，防止 click 事件也触发）
    setTimeout(() => { isTouching = false; }, 100);
}, { passive: true });


// 5. 如果在电脑上，按空格键或回车键也可以快速触发（方便调试）
document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        revealNextItem();
    }
});