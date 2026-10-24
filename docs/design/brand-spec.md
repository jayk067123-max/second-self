# 正式版视觉规格

用户确认方向：奶油背景#f5f1e4、白卡#ffffff、墨字#2c2e2a、草绿#8ed462、黄高亮#f5e211。圆角白卡、超大标题、扁平描边插画，无渐变与装饰阴影。系统中文字体，不依赖联网字体。

今天 / 添加 / 未来三个标签，设置位于顶栏。未来采用月历+所选日卡+日期箭头，不保留第二套静态展示页。14张SVG空状态插画内嵌于emptyScenes.ts，按日期稳定选取。

主按钮草绿深字，次按钮奶油色。按钮reset在CSS base layer，避免覆盖utility层。核对结果逐条卡片；手机单列显示日期，桌面双列；按钮触控高度至少44px。数据警告、待确认和演示时间不能仅靠颜色表达。

原生dialog负责焦点陷阱与Escape；关闭后回到触发按钮。支持prefers-reduced-motion，键盘焦点可见。截图在docs/screenshots。当前组件在src/ui/FinalPlanner.tsx和composites/，样式在src/app/globals.css。
