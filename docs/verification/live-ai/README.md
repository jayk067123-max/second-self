# 真实模型小样本核验 · 2026-10-25

人工生成、无隐私通知与图片，通过本机生产服务调用deepseek-flash。未复制.env.local、密钥或鉴权头。

- text.json/image.json：首次HTTP422，repeat结构不符合契约。
- text-fixed.json/image-fixed.json：补齐提示词后各200、live、2条。逐项核对10月28日14–15点小组讨论、10月29日19–20点实验报告，均60分钟、repeat=null。
- replan.json：200、live、fallback=false；2套通过，1套因紧贴固定课被规则拒绝。
- schedule-test.png：人工合成输入，不是真实校园通知。

文字/图片/重排耗时1.27/2.12/1.78秒，仅单次观测；无费用或准确率统计。图片coverage.verified=false，没有独立OCR真值，不能声称所有行完整性已证明。浏览器回放这些真实响应检查布局和确认入库；异常分支使用受控响应。
