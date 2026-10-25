用户提供的六款逐笔动画：花园、晨光、紫藤、玫瑰、锦鲤、橘子。
每次加载随机抽取，六款轮完后重新洗牌；同一次等待不切画。2倍速：4.5秒绘制+0.75秒完整展示，完成一轮才通知父页面。隐藏标签暂停计时，慢请求继续循环。
共用shared/engine.js与player.js，p5/p5.brush及许可证统一放在shared目录本地文件，无CDN请求。原始画面与画笔保留，仅整合时钟、容器和完成消息；具体素材权利由提供方确认。

p5 2.3.3: LGPL-2.1，保留LICENSE-p5.txt与原始源码头；p5.brush 2.2.2: MIT，保留LICENSE-p5.brush.txt。上游为processing/p5.js与acamposuribe/p5.brush。
