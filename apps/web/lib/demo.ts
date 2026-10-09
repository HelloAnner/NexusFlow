// 演示数据：与 design-exports/*.png 中的内容一致。
// 用作 API 的 placeholder / 失败兜底，API 返回真实数据后自动替换。
import { DEMO_TODAY } from "./utils";

export { DEMO_TODAY };

export type Person = {
  id: string; name: string; title: string; department: string;
  skills: string[]; projects: string[]; load: number; status: string; color: string;
};

export const PEOPLE: Person[] = [
  { id: "zw", name: "张伟", title: "部门主任", department: "软件研发部", skills: ["后端", "Go"], projects: ["智慧油田"], load: 95, status: "过载", color: "#2FB365" },
  { id: "csy", name: "陈思远", title: "一级工程师", department: "软件研发部", skills: ["Python", "报告撰写"], projects: ["智慧油田", "等保测评"], load: 80, status: "饱和", color: "#3B82F6" },
  { id: "ly", name: "刘洋", title: "二级工程师", department: "软件研发部", skills: ["前端", "Web 端"], projects: ["智慧油田"], load: 60, status: "正常", color: "#9B59F5" },
  { id: "zm", name: "赵敏", title: "三级工程师", department: "软件研发部", skills: ["PPT 制作", "报告撰写"], projects: ["等保测评", "党建"], load: 100, status: "全天锁定", color: "#EC4899" },
  { id: "sq", name: "孙倩", title: "助理工程师", department: "软件研发部", skills: ["需求收集", "运维客服"], projects: ["等保测评"], load: 85, status: "饱和", color: "#F2970A" },
  { id: "zj", name: "周杰", title: "二级工程师", department: "数据科学部", skills: ["后端", "Java"], projects: ["管网数字孪生"], load: 35, status: "正常", color: "#5F666D" },
  { id: "wd", name: "吴迪", title: "三级工程师", department: "运维保障部", skills: ["运维", "Linux"], projects: ["LNG 智能化"], load: 20, status: "空闲", color: "#3B82F6" },
  { id: "lwj", name: "李文静", title: "技术总监", department: "软件研发部", skills: ["技术选型", "需求对接"], projects: ["管道完整性", "北线调度"], load: 70, status: "正常", color: "#9B59F5" },
  { id: "wq", name: "王强", title: "一级工程师", department: "市场拓展部", skills: ["技术支持", "培训"], projects: ["北线调度"], load: 90, status: "过载", color: "#F2970A" },
  { id: "zk", name: "郑凯", title: "二级工程师", department: "软件研发部", skills: ["测试"], projects: ["智慧油田"], load: 55, status: "正常", color: "#2FB365" },
  { id: "wjg", name: "王建国", title: "中心主任", department: "创新中心", skills: ["管理"], projects: [], load: 60, status: "正常", color: "#2FB365" },
];

// 06 团队页按设计稿只展示 9 人（郑凯仅出现在 07 热力图，王建国为主任不出现在成员表）
export const TEAM_PEOPLE: Person[] = PEOPLE.filter((p) => !["zk", "wjg"].includes(p.id));

export type Project = {
  id: string; name: string; type: string; level: string; owner: string; ownerColor: string;
  start: string; end: string; progress: number; status: string; updated: string;
  marker: "circle" | "square" | "triangle" | "dash"; color: string; favorite?: boolean;
};

export const PROJECTS: Project[] = [
  { id: "p1", name: "智慧油田数据平台", type: "科研", level: "公司级", owner: "张伟", ownerColor: "#2FB365", start: "2025-06-30", end: "2025-11-27", progress: 68, status: "风险", updated: "2 小时前", marker: "circle", color: "#F2970A", favorite: true },
  { id: "p2", name: "管道完整性管理系统", type: "科研", level: "处级", owner: "李文静", ownerColor: "#9B59F5", start: "2025-05-12", end: "2025-09-30", progress: 34, status: "逾期", updated: "昨天", marker: "circle", color: "#EE4B43", favorite: true },
  { id: "p3", name: "北线调度优化", type: "市场", level: "公司级", owner: "王强", ownerColor: "#F2970A", start: "2025-06-01", end: "2025-08-15", progress: 92, status: "正常", updated: "3 小时前", marker: "square", color: "#F2970A", favorite: true },
  { id: "p4", name: "巡检机器人研发", type: "科研", level: "中心级", owner: "陈思远", ownerColor: "#3B82F6", start: "2025-04-20", end: "2025-10-31", progress: 82, status: "正常", updated: "10 分钟前", marker: "square", color: "#2FB365" },
  { id: "p5", name: "数字化转型咨询", type: "市场", level: "处级", owner: "赵敏", ownerColor: "#EC4899", start: "2025-06-15", end: "2025-12-20", progress: 15, status: "正常", updated: "1 天前", marker: "triangle", color: "#2FB365" },
  { id: "p6", name: "等保测评专项", type: "文职", level: "中心级", owner: "孙倩", ownerColor: "#9B59F5", start: "2025-06-10", end: "2025-07-25", progress: 55, status: "风险", updated: "5 小时前", marker: "square", color: "#9B59F5" },
  { id: "p7", name: "现场调研 · 3 站", type: "出差", level: "中心级", owner: "王强", ownerColor: "#F2970A", start: "2025-07-01", end: "2025-07-20", progress: 100, status: "完成", updated: "2 天前", marker: "circle", color: "#F2970A" },
  { id: "p8", name: "主题党日活动", type: "党建", level: "中心级", owner: "赵敏", ownerColor: "#EC4899", start: "2025-08-01", end: "2025-08-15", progress: 100, status: "完成", updated: "3 天前", marker: "circle", color: "#EC4899" },
  { id: "p9", name: "管网数字孪生预研", type: "科研", level: "中心级", owner: "周杰", ownerColor: "#5F666D", start: "2025-09-01", end: "2025-12-31", progress: 5, status: "未启动", updated: "1 周前", marker: "dash", color: "#AEB4BB" },
  { id: "p10", name: "LNG 接收站智能化", type: "科研", level: "处级", owner: "吴迪", ownerColor: "#3B82F6", start: "2025-09-15", end: "2026-03-30", progress: 0, status: "未启动", updated: "1 周前", marker: "dash", color: "#AEB4BB" },
];

// ---------- 甘特（项目 p1，Day 0 = 2025-06-30） ----------
export type GanttTask = {
  id: string; name: string; start: number; end: number; // Day 偏移
  kind: "done" | "prog" | "plan" | "mixed";
  progress?: number; // mixed/prog 用
  overdueTo?: number; // 逾期延伸（红色描边段）
  overdueLabel?: string; // 红色文字标签
  note?: string; // 已完成 / 45% 等行尾文字
  popover?: { owner: string; ownerColor: string; plan: string; forecast: string; blockedBy: string; code: string };
};

export type GanttGroup = { type: string; typeColor: string; owner: string; ownerColor: string; tasks: GanttTask[] };

export const GANTT_START = "2025-06-30";
export const GANTT_TOTAL_DAYS = 150;
export const GANTT_TODAY_DAY = 90; // 设计稿中「今天」蓝线位于 Day 90（9月28日）

export const GANTT_GROUPS: GanttGroup[] = [
  {
    type: "科研", typeColor: "#2FB365", owner: "张伟", ownerColor: "#5F666D",
    tasks: [
      { id: "t1", name: "需求调研与确认", start: 0, end: 18, kind: "done", note: "已完成" },
      { id: "t2", name: "总体设计评审", start: 22, end: 45, kind: "prog", overdueLabel: "逾期 7 天" },
      { id: "t3", name: "五日迭代闭环演示", start: 72, end: 95, kind: "mixed", progress: 70 },
    ],
  },
  {
    type: "市场", typeColor: "#9B59F5", owner: "李文静", ownerColor: "#5F666D",
    tasks: [
      { id: "t4", name: "试点单位签约", start: 0, end: 14, kind: "done", note: "已完成" },
      {
        id: "t5", name: "数据中台迁移", start: 55, end: 95, kind: "mixed", progress: 45, overdueTo: 140,
        popover: { owner: "李文静", ownerColor: "#9B59F5", plan: "Day 55 → 95", forecast: "Day 140 · 延期 45 天", blockedBy: "等保测评 · 安全基线核查", code: "RW-219" },
      },
      { id: "t6", name: "推广方案定稿", start: 100, end: 120, kind: "plan" },
    ],
  },
  {
    type: "出差", typeColor: "#F2970A", owner: "王强", ownerColor: "#5F666D",
    tasks: [
      { id: "t7", name: "现场调研 · 3 站", start: 36, end: 48, kind: "done", note: "已完成" },
      { id: "t8", name: "设备安装联调", start: 78, end: 115, kind: "mixed", progress: 60, note: "60%" },
    ],
  },
  {
    type: "文职", typeColor: "#3B82F6", owner: "陈思远", ownerColor: "#5F666D",
    tasks: [
      { id: "t9", name: "阶段报告撰写", start: 66, end: 80, kind: "done", note: "已完成" },
      { id: "t10", name: "验收材料准备", start: 102, end: 117, kind: "prog", progress: 72, overdueTo: 150, overdueLabel: "已交付 72%" },
    ],
  },
  {
    type: "党建", typeColor: "#EC4899", owner: "赵敏", ownerColor: "#5F666D",
    tasks: [
      { id: "t11", name: "主题党日活动", start: 72, end: 86, kind: "done", note: "已完成" },
      { id: "t12", name: "结对共建总结", start: 90, end: 130, kind: "prog", progress: 45, note: "45%" },
    ],
  },
];

// ---------- 收件箱 ----------
export type InboxItem = {
  id: string; kind: "审批" | "指派" | "提及" | "冲突" | "系统";
  title: string; desc: string; actor: string; actorColor: string; time: string; overdue?: string;
  detail?: { meta: [string, string][]; attachments: string[]; flow: { name: string; color: string; action: string; time: string }[] };
};

export const INBOX: InboxItem[] = [
  {
    id: "i1", kind: "审批", title: "北线调度优化 · 立项书终审", desc: "已逾期 2 天，请尽快处理", actor: "王建国", actorColor: "#3B82F6", time: "10 分钟前", overdue: "已逾期 2 天",
    detail: {
      meta: [["项目级别", "市场 · 公司级"], ["计划周期", "6/01 - 8/15"], ["投入人员", "6 人 · 2 个部门"], ["预算", "48 万"]],
      attachments: ["立项书 v2.pdf", "预算明细.xlsx"],
      flow: [
        { name: "王建国", color: "#3B82F6", action: "发起立项审批", time: "6/18 16:20" },
        { name: "李文静", color: "#9B59F5", action: "技术总监 · 已同意", time: "6/19 09:12" },
        { name: "张伟", color: "#2FB365", action: "部门主任 · 已同意", time: "6/19 15:40" },
      ],
    },
  },
  { id: "i2", kind: "指派", title: "数据中台迁移演练 · 你被指定为成员", desc: "6/30 - 7/2 · 每日 4h · 后端接口", actor: "张伟", actorColor: "#2FB365", time: "32 分钟前" },
  { id: "i3", kind: "冲突", title: "陈思远 负载超限预警", desc: "迁移演练 与 巡检机器人用例 冲突", actor: "系统", actorColor: "#AEB4BB", time: "1 小时前" },
  { id: "i4", kind: "提及", title: "在「联调用例评审」中提到你", desc: "“接口边界部分需要你再确认下…”", actor: "刘洋", actorColor: "#9B59F5", time: "3 小时前" },
  { id: "i5", kind: "审批", title: "结对共建总结 · 成果确认申请", desc: "等待你的确认", actor: "赵敏", actorColor: "#EC4899", time: "昨天" },
  { id: "i6", kind: "系统", title: "你的周报已自动生成", desc: "汇总了 4 项任务进展，点击查看", actor: "系统", actorColor: "#AEB4BB", time: "昨天" },
  { id: "i7", kind: "指派", title: "需求调研访谈 · 你被指定为参会人", desc: "7/8 14:00 · 三号会议室", actor: "李文静", actorColor: "#9B59F5", time: "2 天前" },
];

// ---------- 资料库 ----------
export type FileItem = { id: string; name: string; attr: string; attrColor: string; task: string; uploader: string; time: string; size: string; ftype: "pdf" | "word" | "ppt" | "excel" | "data" | "video" };

export const FILES: FileItem[] = [
  { id: "f1", name: "联调阶段报告 v3.pdf", attr: "整体报告", attrColor: "#2FB365", task: "数据中台联调", uploader: "张伟", time: "10 分钟前", size: "4.2 MB", ftype: "pdf" },
  { id: "f2", name: "数据中台迁移方案.docx", attr: "申报报告", attrColor: "#9B59F5", task: "数据中台迁移", uploader: "李文静", time: "2 小时前", size: "1.8 MB", ftype: "word" },
  { id: "f3", name: "月度汇报 · 6 月.pptx", attr: "汇报 PPT", attrColor: "#F2970A", task: "月度例会", uploader: "赵敏", time: "昨天", size: "12.6 MB", ftype: "ppt" },
  { id: "f4", name: "传感器数据集 · 3 站.csv", attr: "数据集", attrColor: "#3B82F6", task: "现场调研", uploader: "王强", time: "昨天", size: "86 MB", ftype: "data" },
  { id: "f5", name: "等保测评整改清单.xlsx", attr: "整体报告", attrColor: "#2FB365", task: "等保测评专项", uploader: "孙倩", time: "2 天前", size: "640 KB", ftype: "excel" },
  { id: "f6", name: "个人周报 · 陈思远.docx", attr: "个人报告", attrColor: "#5F666D", task: "数据中台联调", uploader: "陈思远", time: "2 天前", size: "220 KB", ftype: "word" },
  { id: "f7", name: "巡检机器人演示视频.mp4", attr: "数据集", attrColor: "#3B82F6", task: "巡检机器人研发", uploader: "刘洋", time: "3 天前", size: "240 MB", ftype: "video" },
  { id: "f8", name: "需求调研访谈纪要.pdf", attr: "会议纪要", attrColor: "#878C94", task: "需求调研", uploader: "李文静", time: "1 周前", size: "980 KB", ftype: "pdf" },
];

// ---------- 工具台 ----------
export type Tool = { id: string; name: string; desc: string; usage: string; ai?: boolean; icon: string; color: string; recent?: string };

export const TOOLS: Tool[] = [
  { id: "pdf", name: "PDF 格式转换", desc: "格式互转、合并拆分、扫描件 OCR 识别", usage: "本月使用 1,204 次", icon: "file-output", color: "#EE4B43", recent: "今天 3 次" },
  { id: "translate", name: "智能翻译", desc: "中英互译，支持术语库与公文语体", usage: "本月使用 986 次", icon: "languages", color: "#3B82F6", recent: "今天 1 次" },
  { id: "paper", name: "论文撰写助手", desc: "提纲生成、章节润色、参考文献整理", usage: "本月使用 342 次", ai: true, icon: "pen-line", color: "#9B59F5", recent: "昨天" },
  { id: "patent", name: "专利撰写助手", desc: "交底书结构化、权利要求书草拟", usage: "本月使用 128 次", ai: true, icon: "stamp", color: "#F2970A" },
  { id: "kb", name: "个人知识库", desc: "个人资料沉淀检索，随问随答", usage: "本月使用 567 次", ai: true, icon: "book-open", color: "#2FB365" },
  { id: "qa", name: "平台问答助手", desc: "问流程、问制度、问项目状态", usage: "本月使用 893 次", ai: true, icon: "message-circle", color: "#3B82F6" },
  { id: "minutes", name: "会议纪要生成", desc: "录音转写 + 待办自动拆解到任务", usage: "本月使用 421 次", ai: true, icon: "notebook-pen", color: "#5F666D", recent: "周一" },
  { id: "weekly", name: "周报生成器", desc: "汇总任务进展，一键生成个人周报", usage: "本月使用 655 次", icon: "calendar-check", color: "#EC4899" },
  { id: "chart", name: "数据可视化", desc: "Excel / CSV 快速生成汇报图表", usage: "本月使用 289 次", icon: "bar-chart-3", color: "#2FB365" },
];

// ---------- 组织架构 ----------
export const ORG_TREE = {
  name: "创新中心", count: 86,
  departments: [
    { name: "软件研发部", count: 24 },
    { name: "数据科学部", count: 18 },
    { name: "运维保障部", count: 12 },
    { name: "市场拓展部", count: 14 },
    { name: "综合管理部", count: 10 },
  ],
  studios: [
    { name: "AI 应用工作室", count: 9 },
    { name: "数字孪生工作室", count: 7 },
  ],
};

// ---------- 负载页 ----------
export const LOAD_DAYS = ["6/22", "6/23", "6/24", "6/25", "6/26", "6/27", "6/28", "6/29", "6/30", "7/1", "7/2", "7/3", "7/4", "7/5"];
export const LOAD_MATRIX: { name: string; color: string; cells: ("free" | "full" | "over" | "idle" | "lock")[] }[] = [
  { name: "张伟", color: "#2FB365", cells: ["full", "full", "over", "over", "full", "idle", "idle", "full", "over", "over", "full", "idle", "idle", "idle"] },
  { name: "陈思远", color: "#3B82F6", cells: ["full", "over", "over", "full", "full", "idle", "idle", "full", "full", "over", "over", "full", "idle", "idle"] },
  { name: "刘洋", color: "#9B59F5", cells: ["idle", "full", "free", "full", "idle", "idle", "idle", "idle", "full", "full", "idle", "idle", "idle", "idle"] },
  { name: "赵敏", color: "#EC4899", cells: ["lock", "lock", "lock", "lock", "lock", "idle", "idle", "full", "full", "full", "full", "idle", "idle", "idle"] },
  { name: "孙倩", color: "#F2970A", cells: ["full", "full", "free", "over", "over", "idle", "idle", "full", "over", "over", "full", "full", "idle", "idle"] },
  { name: "周杰", color: "#5F666D", cells: ["idle", "idle", "free", "idle", "full", "idle", "idle", "idle", "idle", "idle", "full", "idle", "idle", "idle"] },
  { name: "吴迪", color: "#3B82F6", cells: ["idle", "idle", "free", "idle", "idle", "idle", "idle", "idle", "idle", "idle", "idle", "idle", "idle", "idle"] },
  { name: "王强", color: "#F2970A", cells: ["over", "over", "free", "full", "over", "idle", "idle", "over", "over", "full", "full", "full", "idle", "idle"] },
  { name: "李文静", color: "#9B59F5", cells: ["idle", "full", "free", "full", "idle", "idle", "idle", "full", "full", "full", "idle", "idle", "idle", "idle"] },
  { name: "郑凯", color: "#2FB365", cells: ["full", "full", "free", "full", "full", "idle", "idle", "full", "idle", "idle", "idle", "idle", "idle", "idle"] },
];

export const LOAD_CONFLICTS = [
  { name: "陈思远", color: "#3B82F6", urgent: true, tasks: ["数据中台迁移演练", "巡检机器人用例"], impact: "影响 智慧油田 关键路径 · 6/30 - 7/1 · 超出 4h/天" },
  { name: "赵敏", color: "#EC4899", urgent: true, tasks: ["结对共建总结（全天）", "演练报告撰写"], impact: "影响 等保测评 报告交付 · 7/2 · 全天锁定" },
  { name: "张伟", color: "#2FB365", urgent: false, tasks: ["数据中台联调", "部门例会组织"], impact: "影响较小 · 可顺延 · 6/25 · 超出 2h/天" },
];

// ---------- 我的工作 ----------
export const MY_TASKS = {
  thisWeek: [
    { id: "m1", title: "数据中台联调 · 接口对齐", due: "今天 18:00 截止", dueRed: true, daily: "每日 4h", tag: "智慧油田", tagColor: "#2FB365" },
    { id: "m2", title: "巡检机器人 · 联调用例编写", due: "周三", daily: "每日 3h", tag: "巡检机器人", tagColor: "#3B82F6" },
    { id: "m3", title: "申报报告 v4 · 数据分析章节", due: "周五", daily: "每日 2h", tag: "等保测评", tagColor: "#9B59F5" },
    { id: "m4", title: "周一例会待办 · 已拆解 3 条", due: "已完成", daily: "每日 1h", tag: "部门", tagColor: "#878C94", done: true },
  ],
  nextWeek: [
    { id: "m5", title: "数据中台迁移演练", due: "6/30 - 7/2", dueRed: true, daily: "每日 全天", tag: "智慧油田", tagColor: "#2FB365" },
    { id: "m6", title: "验收材料初稿", due: "7/3", daily: "每日 2h", tag: "等保测评", tagColor: "#9B59F5" },
  ],
};

export const MY_SCHEDULE = [
  { name: "数据中台联调", start: 0, end: 2.5, progress: 60, color: "#3B82F6" },
  { name: "巡检机器人用例", start: 0.8, end: 3, progress: 45, color: "#2FB365" },
  { name: "申报报告 v4", start: 2.5, end: 4, progress: 30, color: "#9B59F5" },
  { name: "验收材料准备", start: 3.5, end: 6, progress: 0, color: "#AEB4BB" },
];

export const MY_DISTRIBUTION = [
  { label: "科研 · 智慧油田", pct: 55, color: "#2FB365" },
  { label: "科研 · 巡检机器人", pct: 25, color: "#3B82F6" },
  { label: "文职 · 申报报告", pct: 15, color: "#9B59F5" },
  { label: "学习 · 其他", pct: 5, color: "#AEB4BB" },
];

export const WEEK_DAYS = ["周一 22", "周二 23", "周三 24", "周四 25", "周五 26", "周六 27", "周日 28"];
