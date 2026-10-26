# 真实AI配置与验证

2026-10-26核对DeepSeek官方文档。模型接入与AI辅助开发过程证据分别记录。

## 推荐配置

在实际启动应用的源码根目录新建.env.local，或在部署平台配置同名服务端环境变量：

    LLM_BASE_URL=https://api.deepseek.com
    LLM_MODEL=deepseek-flash
    LLM_API_KEY=在本机填入自己的真实密钥
    AI_REQUEST_TIMEOUT_MS=60000
    AI_MAX_RETRIES=1

以上占位文字不要当真实密钥。填写后重启Next服务。当前官方deepseek-flash支持文字和图片，项目以OpenAI兼容Chat Completions格式发送；仅对官方api.deepseek.com添加thinking disabled，保留JSON输出预算。其他兼容平台必须使用平台提供的地址、模型和密钥，不把官网聊天会员当作API额度。

密钥只在本机/服务端；不要发送聊天、放NEXT_PUBLIC变量、提交Git或交付ZIP。只交.env.example。若已经公开泄露，在服务商控制台撤销并重建。公开部署前应配置访问保护、限流与用量额度。

## 实际验证

1. 用无隐私的短通知，含明确日期、时段、地点和截止。
2. 以加号上传一张清晰通知/课表截图，检查日期、周次、每条课程及地点；学期周次不明确时不能直接信任结果。
3. 检查失败、空结果、缺字段与重试；确认前不得写入日程。
4. 保留脱敏输入、真实响应、人工核对、耗时与失败样例；重排固定安排不能被自动移动。

/api/health只说明配置状态，不证明模型成功。2026-10-25本机真实合成样本：文字与图片各2条，日期时段正确；重排2套通过，1套被规则拒绝。单次耗时分别1.27/2.12/1.78秒，费用未统计，不代表普遍准确率。首测repeat契约错误422及修复后响应均保留在verification/live-ai。

Windows文件名须为.env.local，不能是.env.local.txt。

## 官方依据

- https://api-docs.deepseek.com/
- https://api-docs.deepseek.com/zh-cn/guides/vision
- https://api-docs.deepseek.com/zh-cn/guides/thinking_mode

运行目录的私密配置不会自动同步到其他副本。

账号接入后，文字、图片及重排API均要求有效登录会话和同源请求。先在页面注册/登录，再操作AI入口。账号数据与密钥分别保管，数据库无需随源码提交。
