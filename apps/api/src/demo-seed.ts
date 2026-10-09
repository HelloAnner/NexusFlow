const plusDays = (date: Date, days: number) => {
  const value = new Date(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
};

export const demoTools = [
  ["pdf-convert", "PDF 格式转换", "utility", "格式互转、合并拆分、扫描件 OCR 识别"],
  ["translate", "智能翻译", "utility", "中英互译，支持术语库与公文语体"],
  ["paper-writing", "论文撰写助手", "agent", "提纲生成、章节润色、参考文献整理"],
  ["patent-writing", "专利撰写助手", "agent", "交底书结构化、权利要求书草拟"],
  ["knowledge-base", "个人知识库", "agent", "个人资料沉淀检索，随问随答"],
  ["platform-assistant", "平台问答助手", "agent", "问流程、问制度、问项目状态"],
  ["meeting-minutes", "会议纪要生成", "utility", "录音转写，待办自动拆解到任务"],
  ["weekly-report", "周报生成器", "utility", "汇总任务进展，一键生成个人周报"],
  ["data-visualization", "数据可视化", "utility", "Excel / CSV 快速生成汇报图表"],
].map(([id, name, category, description]) => ({ id, name, url: "#", category, description }));

export function buildDemoSeed(today = new Date().toISOString().slice(0, 10)) {
  const base = new Date(`${today}T00:00:00.000Z`);
  const projects = [
    ["智慧油田数据平台", "active", 68, "公司级", "科研"],
    ["管道完整性管理", "active", 34, "公司级", "科研"],
    ["北线调度优化", "active", 52, "处级", "市场"],
    ["巡检机器人研发", "active", 82, "中心级", "科研"],
    ["数字化转型咨询", "planning", 18, "处级", "文职"],
    ["等保测评专项", "planning", 10, "中心级", "市场"],
  ].map(([name, status, progress, level, type], index) => ({
    name, status, progress: Number(progress), level, type, visibility: "normal",
    start_date: plusDays(base, -20 + index * 5), end_date: plusDays(base, 130 + index * 5),
  }));
  const people = [
    ["王建国", "中心主任", ["项目管理", "科研管理"]],
    ["李文静", "技术总监", ["系统架构", "数据工程"]],
    ["张伟", "部门主任", ["项目协调", "油气工程"]],
    ["陈思远", "高级工程师", ["算法研发", "数据分析"]],
    ["刘洋", "工程师", ["后端研发", "调度优化"]],
    ["赵敏", "项目经理", ["市场拓展", "项目管理"]],
    ["孙倩", "工程师", ["文档管理", "质量管理"]],
    ["周杰", "高级工程师", ["机器人", "自动化"]],
    ["吴迪", "工程师", ["网络安全", "测评"]],
    ["王强", "工程师", ["现场实施", "管道检测"]],
  ].map(([name, title, skills], index) => ({ name, title, skills, index }));
  const categories = [
    { type: "research-company", label: "科研", items: ["需求调研与确认", "总体设计评审", "五日迭代闭环演示"] },
    { type: "market", label: "市场", items: ["试点单位签约", "数据中台迁移", "推广方案定稿"] },
    { type: "business-trip", label: "出差", items: ["现场调研·3站", "设备安装联调", "客户验收走访"] },
    { type: "clerical", label: "文职", items: ["阶段报告撰写", "验收材料准备", "周报汇总"] },
    { type: "party", label: "党建", items: ["主题党日活动", "结对共建总结", "安全专题学习"] },
  ];
  const tasks = categories.flatMap((category, group) => category.items.map((name, item) => {
    const start = group * 25 + item * 12 - 10;
    const ownerIndex = group === 0 && item === 1 ? 0 : (group * 2 + item) % people.length;
    return {
      name, type: category.type, category: category.label,
      project_index: group === 4 ? 3 : group % 4,
      owner_index: ownerIndex,
      status: start < -5 ? "done" : start > 45 ? "draft" : "in_progress",
      progress: start < -5 ? 100 : start > 45 ? 0 : [60, 72, 45][item],
      start_date: plusDays(base, start), end_date: plusDays(base, start + 24),
      daily_hours: item === 1 ? 4 : 2, all_day: false,
      summary: `${category.label}工作：${name}`,
    };
  }));
  return {
    projects, people, tasks,
    conflicts: [
      { type: "workload_overload", person_index: 2, task_index: 3, severity: "warning", title: "张伟工作负载偏高" },
      { type: "all_day_overlap", person_index: 9, task_index: 6, severity: "blocking", title: "王强现场任务时间冲突" },
      { type: "workload_overload", person_index: 4, task_index: 2, severity: "warning", title: "刘洋多任务并行超负荷" },
    ],
  };
}
