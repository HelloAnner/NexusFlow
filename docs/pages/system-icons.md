# 系统图标

NexusFlow 使用朱橙色圆角方形底，白色分流连线连接三个节点，表达项目、任务与协作。

- 资源：`apps/web/public/favicon.svg`，64 × 64 viewBox，无字体、脚本或外部依赖。
- 导航栏：36px；登录页：40px / 44px；浏览器标签：同一 SVG。
- Portal 的系统入口、Agent 选择器与头像使用相同 SVG，不再使用字母或通用看板图标。
- 图形与颜色同时区分系统：Northline 蓝色北向折线、DocuMind 青绿书页、NexusFlow 朱橙节点、Portal 紫色门廊。
- 浅色与深色背景都保留原色，不反色；图标不使用形变动画。
- 图标是装饰时留空 alt；单独充当品牌入口时提供系统名。
- favicon 与图片路径使用部署前缀 `/nexusflow`，与应用保持一致。

不改变登录、导航、项目操作和权限行为。设计稿对应 `design.pen` 的 Shell 品牌入口与系统图标规范。
