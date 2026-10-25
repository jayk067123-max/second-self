# 第二自我

把通知、课表截图和随手记录整理成日程，发现时间冲突，再选择怎样调整。

![未来日程](docs/screenshots/future.png)

## 10分钟复现

环境：Node.js 22.11–24.x、npm、中国时区。无需数据库；首次安装依赖需要网络。

~~~sh
git clone https://github.com/jayk067123-max/second-self.git
cd second-self
npm ci
npm run dev
~~~

打开 http://localhost:3000 。端口占用时运行 npm run dev -- --port 3022。
生产模式：npm run build，然后 npm run start。

1. 在“添加”粘贴通知，或点绿色加号上传截图。
2. 补充缺失信息，核对日期和时间，确认后入库。
3. 在“未来”选择日期，查看冲突、生成重排，比较调整前后；可补充要求再调整。
4. 采用方案后可撤销；任务可编辑、删除、完成。头像设置支持导入、导出JSON。

首次启动为空日程。固定样例在 docs/demo-fixtures/demo-seed.json，可通过设置导入；导入会替换当前任务，先导出备份。演示时钟有明确标记，可返回实时。

## AI配置

复制 .env.example 为 .env.local，在服务端填写 LLM_BASE_URL、LLM_API_KEY、LLM_MODEL，然后重启服务。不要公开密钥。模型须兼容Chat Completions；图片入口须支持图像输入。详见 [配置说明](docs/AI-SETUP.md)。

未配置密钥时，文字与重排使用本地规则；图片识别会明确提示无法调用。AI结果需要校验和人工确认，不保证任意课表都识别正确。主动解析或重排会把相关内容发送给应用服务端及配置的模型服务商；日程持久化保存在当前浏览器。

## 功能与边界

- 今天 / 添加 / 未来，共用任务与撤销状态；支持周重复、月历和搜索。
- 检查时间重叠、缓冲不足、日负荷和截止逼近。
- 固定、周期和已完成安排不可自动移动；采纳前再次校验。
- 所有等待界面自动逐笔绘画；每次至少画完一轮，再显示结果。主动关闭可取消当前流程。
- 六个内置头像，也可上传；无账号、云同步或系统推送，清理浏览器数据前请备份。

## 验证与材料

~~~sh
npm run verify
npm run build
~~~

架构见 [ARCHITECTURE](docs/ARCHITECTURE.md)，验证范围见 [TEST-REPORT](docs/TEST-REPORT.md)。真实模型小样本记录位于 docs/verification/live-ai，不代表普遍准确率。

[过程证据说明](docs/prompts/README.md)：保留真实Git历史与现存记录；整理卡片不等于原始对话导出，至少3条完整核心Prompt链仍需本人补齐。参赛视频须按赛事要求录制，不把自动制作的参考演示当作本人原始协作证据。

## 素材与许可

项目代码使用MIT许可。果园动画采用用户提供的Orchard HTML，使用本地p5与p5.brush，许可证随源码保留。头像由用户提供，提交前须确认素材使用权；第三方素材不计为自研算法。
