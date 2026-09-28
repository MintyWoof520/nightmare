// =========================================
// 点击屏幕逐段显示逻辑（修复版）
// =========================================

// 1. 获取所有需要显示的段落
const items = document.querySelectorAll('.story-item');

let currentIndex = 0; // 记录当前显示到第几段

// 2. 核心函数：显示下一段
function revealNextItem() {
    if (currentIndex < items.length) {
        items[currentIndex].classList.add('show');
        currentIndex++;
        
        // 显示后，自动平滑滚动到页面最底部（推荐用这个，比 scrollIntoView 体验更好）
        window.scrollTo({
            top: document.body.scrollHeight,
            behavior: 'smooth'
        });
    } else {
        // 全部显示完了，可以在这里显示“下一章”按钮，或者什么都不做
        console.log("本章已全部显示完毕");
    }
}

// 3. 监听鼠标/手指“点击”事件
document.body.addEventListener('click', function(e) {
    // 【安全过滤1】如果点击的是链接（比如底部的下一章按钮），不要触发展开剧情
    if (e.target.tagName === 'A' || e.target.closest('a')) {
        return;
    }
    // 【安全过滤2】如果点击的是按钮，也不要触发
    if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        return;
    }

    revealNextItem();
});

// 4. 监听键盘事件（方便在电脑上用空格或回车）
document.addEventListener('keydown', function(e) {
    if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault(); // 防止按空格时页面跟着滚动
        revealNextItem();
    }
});

// 5. 解决移动端滑动误触
// 记录手指按下的 Y 坐标
let touchStartY = 0;

document.body.addEventListener('touchstart', function(e) {
    // 只记录第一个手指的坐标
    if (e.touches.length === 1) {
        touchStartY = e.touches[0].clientY;
    }
}, { passive: true });

document.body.addEventListener('touchend', function(e) {
    // 如果手指滑动的距离超过 10px，说明用户是在“滚动页面”，而不是“点击屏幕”
    // 此时我们直接返回，不触发显示
    const touchEndY = e.changedTouches[0].clientY;
    if (Math.abs(touchEndY - touchStartY) > 10) {
        return;
    }
    // 如果滑动距离很小，说明是在“点按”，逻辑交给上面的 click 事件处理
}, { passive: true });
