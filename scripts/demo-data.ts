#!/usr/bin/env bun
// NexusFlow 演示数据生成器：只输出 SQL，在目标服务器执行，不改业务代码。
// 详见 docs/14-demo-data.txt。幂等：固定 id + data.demo='v1'，重复执行覆盖同类记录，
// 并清理上一轮存在、本轮已不存在的 demo 记录；不触碰真实项目/任务/文件。
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

type Lookup = {
  tenant: string;
  users: { id: string; username: string; org_id: string | null; role: string; display_name: string }[];
  orgs: { id: string; name: string; type: string; parent_id: string | null }[];
  people: { id: string; name: string; user_id: string | null }[];
};
const lookups: Lookup = JSON.parse(readFileSync(process.env.LOOKUPS || "/tmp/nf-lookups.json", "utf8"));
const TENANT = lookups.tenant;
const admin = lookups.users.find((u) => u.username === "admin")!;
const anner = lookups.users.find((u) => u.username === "anner")!;
const moss = lookups.users.find((u) => u.username === "moss")!;
const ORG = {
  company: orgName("CNPC"), second: orgName("研究院"), center: orgName("智能技术中心"),
  rd: orgName("研发部"), pm: orgName("项目部"), studio: orgName("创新工作室"),
  data: idFor("org:数据管理部"), admin: idFor("org:综合管理部"), studio2: idFor("org:数字孪生工作室"),
};
function orgName(name: string) {
  return lookups.orgs.find((o) => o.name === name)!.id as string;
}
function idFor(key: string) {
  const h = createHash("sha1").update(`nexusflow-demo:${key}`).digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const TODAY = process.env.TODAY || new Date().toISOString().slice(0, 10);
const base = new Date(`${TODAY}T00:00:00.000Z`);
const d = (offset: number) => new Date(base.getTime() + offset * 86400000).toISOString().slice(0, 10);
const ts = (daysAgo = 0, minutesAgo = 0) => new Date(Date.now() - daysAgo * 86400000 - minutesAgo * 60000).toISOString();
const q = (value: string) => `'${value.replaceAll("'", "''")}'`;
const json = (value: unknown) => `$j$${JSON.stringify(value)}$j$::jsonb`;
const DEMO = "v1";

// ---------- 账号与人员 ----------
const PASSWORD_HASH = "$2b$10$RRCpoWvlwN9wNK8UIAD6I.q.abCgzaiHgI.y2rXva9tQ.zRChE/c2"; // Nexus@2026
const staff = [
  { key: "wangjianguo", name: "王建国", title: "中心副主任", role: "center_deputy", org: "center", mgmt: "center_deputy", prof: "engineer_1", duties: ["personnel_coordination", "project_supervision"], skills: ["系统架构", "数据工程"], studio: true, status: "active" },
  { key: "liwenjing", name: "李文静", title: "研发部主任", role: "department_director", org: "rd", mgmt: "department_director", prof: "engineer_1", duties: ["tech_roadmap", "tech_training"], skills: ["技术选型", "报告撰写"], studio: true, status: "active" },
  { key: "zhangwei", name: "张伟", title: "项目部主任", role: "department_director", org: "pm", mgmt: "department_director", prof: "engineer_1", duties: ["project_supervision", "internal_coordination"], skills: ["油气工程", "项目协调"], studio: false, status: "active" },
  { key: "chensiyuan", name: "陈思远", title: "数据平台负责人", role: "project_lead", org: "rd", mgmt: "project_lead", prof: "engineer_2", duties: ["execution", "tech_roadmap"], skills: ["Python", "SQL", "数据工程"], studio: true, status: "active" },
  { key: "liuyang", name: "刘洋", title: "后端工程师", role: "member", org: "rd", mgmt: "staff", prof: "engineer_3", duties: ["execution"], skills: ["Go", "后端", "运维"], studio: true, status: "active" },
  { key: "zhaomin", name: "赵敏", title: "项目经理", role: "project_lead", org: "pm", mgmt: "project_lead", prof: "engineer_2", duties: ["execution", "resource_coordination"], skills: ["需求收集", "PPT 制作"], studio: false, status: "active" },
  { key: "sunqian", name: "孙倩", title: "知识管理工程师", role: "member", org: "rd", mgmt: "staff", prof: "engineer_3", duties: ["execution"], skills: ["报告撰写", "系统培训"], studio: false, status: "travel" },
  { key: "zhoujie", name: "周杰", title: "机器人研发工程师", role: "member", org: "data", mgmt: "staff", prof: "engineer_3", duties: ["execution"], skills: ["Python", "运维", "需求收集"], studio: false, status: "active" },
  { key: "wudi", name: "吴迪", title: "安全测评工程师", role: "member", org: "rd", mgmt: "staff", prof: "assistant_engineer", duties: ["execution"], skills: ["前端", "Web 端", "技术支持"], studio: false, status: "active" },
  { key: "wangqiang", name: "王强", title: "现场实施工程师", role: "member", org: "admin", mgmt: "staff", prof: "engineer_3", duties: ["execution"], skills: ["运维", "技术支持"], studio: false, status: "active" },
];
const PEOPLE: Record<string, { id: string; name: string; org: string }> = {
  anner: { id: anner.id, name: "Anner", org: "pm" },
  moss: { id: moss.id, name: "moss", org: "rd" },
};
for (const s of staff) PEOPLE[s.key] = { id: idFor(`account:${s.key}`), name: s.name, org: s.org };
const userOf = (key: string) => PEOPLE[key]!.id;
const orgOf = (key: string) => ORG[(PEOPLE[key]!.org as keyof typeof ORG)];
const nameKey: Record<string, string> = Object.fromEntries(staff.map((s) => [s.name, s.key]));
Object.assign(nameKey, { Anner: "anner", moss: "moss" });

// ---------- 项目 ----------
type Project = { key: string; name: string; type: string; level: string; status: string; progress: number; start: number; end: number; owner: string; members: string[]; org: keyof typeof ORG; ageDays: number };
const projects: Project[] = [
  { key: "data-platform", name: "智慧油田数据中台建设", type: "科研", level: "公司级", status: "active", progress: 68, start: -60, end: 90, owner: "wangjianguo", members: ["anner", "moss", "wangjianguo", "liwenjing", "chensiyuan", "liuyang", "wudi"], org: "center", ageDays: 62 },
  { key: "pipeline", name: "管道完整性智能预警", type: "科研", level: "处级", status: "active", progress: 45, start: -45, end: 60, owner: "zhangwei", members: ["zhangwei", "anner", "wangqiang", "zhaomin", "zhoujie", "sunqian"], org: "pm", ageDays: 48 },
  { key: "dispatch-opt", name: "生产调度优化平台", type: "科研", level: "中心级", status: "active", progress: 82, start: -80, end: 20, owner: "chensiyuan", members: ["chensiyuan", "moss", "liuyang", "wudi"], org: "rd", ageDays: 82 },
  { key: "digital-consult", name: "数字化转型咨询服务", type: "市场", level: "处级", status: "active", progress: 34, start: -30, end: 120, owner: "liwenjing", members: ["liwenjing", "anner", "moss", "zhaomin"], org: "center", ageDays: 33 },
  { key: "edge-pilot", name: "边缘计算试点建设", type: "科研", level: "中心级", status: "planning", progress: 0, start: 8, end: 120, owner: "chensiyuan", members: ["chensiyuan", "moss", "zhoujie"], org: "rd", ageDays: 6 },
  { key: "security", name: "等保测评专项整改", type: "文职", level: "中心级", status: "active", progress: 55, start: -35, end: 45, owner: "zhoujie", members: ["zhoujie", "wudi", "anner", "sunqian"], org: "data", ageDays: 36 },
  { key: "salon", name: "青年技术沙龙·AI 专题", type: "党建", level: "中心级", status: "active", progress: 60, start: -25, end: 40, owner: "liwenjing", members: ["liwenjing", "moss", "wangjianguo", "liuyang"], org: "center", ageDays: 27 },
  { key: "robot", name: "巡检机器人二期研发", type: "科研", level: "公司级", status: "paused", progress: 72, start: -120, end: 30, owner: "chensiyuan", members: ["chensiyuan", "zhoujie", "wangqiang", "zhaomin"], org: "rd", ageDays: 121 },
  { key: "overseas", name: "海外项目交付支持", type: "出差", level: "处级", status: "completed", progress: 100, start: -60, end: -8, owner: "zhangwei", members: ["zhangwei", "anner", "wangqiang", "sunqian"], org: "pm", ageDays: 70 },
  { key: "knowledge", name: "企业知识库运营", type: "文职", level: "中心级", status: "active", progress: 40, start: -40, end: 80, owner: "zhaomin", members: ["zhaomin", "moss", "sunqian", "wudi"], org: "data", ageDays: 41 },
  { key: "study", name: "数据治理专题学习", type: "学习", level: "中心级", status: "active", progress: 25, start: -14, end: 30, owner: "liwenjing", members: ["liwenjing", "anner", "moss", "chensiyuan", "liuyang"], org: "rd", ageDays: 15 },
  { key: "leave-plan", name: "高温休假排班与保障", type: "休假", level: "中心级", status: "planning", progress: 0, start: 6, end: 45, owner: "wangqiang", members: ["wangqiang", "sunqian", "zhaomin"], org: "admin", ageDays: 4 },
];

// ---------- 任务 ----------
type Task = { key: string; name: string; project: string; type: string; status: string; start: number; end: number; hours: number; allDay?: boolean; progress: number; owner: string; members?: string[]; memberHours?: number; summary: string };
const tasks: Task[] = [
  { key: "dm-standard", name: "数据中台·主数据标准落地", project: "data-platform", type: "research-company", status: "in_progress", start: -25, end: 20, hours: 5, progress: 60, owner: "chensiyuan", members: ["liuyang", "wudi"], memberHours: 1, summary: "完成主数据编码规则与责任矩阵，推进首批 12 张核心表落地。" },
  { key: "dm-metric", name: "数据中台·指标体系评审", project: "data-platform", type: "research-company", status: "in_progress", start: -3, end: 9, hours: 4, progress: 40, owner: "chensiyuan", members: ["moss"], memberHours: 1, summary: "组织业务部门评审 86 项指标口径，输出修订清单。" },
  { key: "dm-screen", name: "数据中台·可视化大屏联调", project: "data-platform", type: "research-company", status: "in_progress", start: -6, end: 0, hours: 3, progress: 75, owner: "liuyang", members: ["moss"], memberHours: 1, summary: "完成驾驶舱六块大屏的数据接入与自适应联调。" },
  { key: "dm-migrate", name: "数据中台·历史数据迁移演练", project: "data-platform", type: "research-company", status: "pending_acceptance", start: -20, end: -1, hours: 2, progress: 90, owner: "wudi", members: ["liuyang"], memberHours: 1, summary: "完成三轮迁移演练，核对差异记录与回滚脚本。" },
  { key: "dm-report", name: "数据中台·项目周报汇编", project: "data-platform", type: "clerical", status: "done", start: -7, end: -3, hours: 2, progress: 100, owner: "anner", summary: "汇总五个工作组周进展，形成周报并报送中心。" },
  { key: "dm-training", name: "数据中台·用户培训材料", project: "data-platform", type: "clerical", status: "in_progress", start: 1, end: 14, hours: 2, progress: 55, owner: "moss", members: ["wudi"], memberHours: 1, summary: "编写业务用户操作手册与录屏脚本。" },
  { key: "pipe-field", name: "管道完整性·东线现场检测", project: "pipeline", type: "business-trip", status: "in_progress", start: 2, end: 8, hours: 8, allDay: true, progress: 50, owner: "wangqiang", summary: "东线 3 个站点现场检测与设备联调，按全天出差排布。" },
  { key: "pipe-report", name: "管道完整性·检测报告编制", project: "pipeline", type: "clerical", status: "in_progress", start: 1, end: 10, hours: 6, progress: 65, owner: "wangqiang", members: ["zhaomin"], memberHours: 1, summary: "整理现场数据，编制中期检测报告与问题清单。" },
  { key: "pipe-sensor", name: "管道完整性·传感器采购", project: "pipeline", type: "market", status: "in_progress", start: -10, end: 5, hours: 2, progress: 30, owner: "zhaomin", summary: "完成三家供应商比选，推进采购流程。" },
  { key: "pipe-model", name: "管道完整性·风险模型评审", project: "pipeline", type: "research-department", status: "pending_confirmation", start: 3, end: 12, hours: 2, progress: 0, owner: "zhangwei", members: ["anner"], memberHours: 1, summary: "评审泄漏风险预测模型，确认上线前的阈值策略。" },
  { key: "opt-algo", name: "生产调度·算法调优", project: "dispatch-opt", type: "research-center", status: "in_progress", start: -15, end: 5, hours: 1, progress: 85, owner: "liuyang", summary: "优化排产求解器参数，平均求解时间下降 38%。" },
  { key: "opt-web", name: "生产调度·前端改版", project: "dispatch-opt", type: "research-center", status: "in_progress", start: -8, end: 12, hours: 1, progress: 70, owner: "wudi", members: ["moss"], memberHours: 1, summary: "重构调度看板，补齐移动端适配与无障碍细节。" },
  { key: "opt-stress", name: "生产调度·压测方案", project: "dispatch-opt", type: "research-center", status: "draft", start: 5, end: 12, hours: 2, progress: 0, owner: "chensiyuan", summary: "编写上线前压测方案，覆盖 200 并发与故障切换。" },
  { key: "opt-review", name: "生产调度·上线评审", project: "dispatch-opt", type: "clerical", status: "pending_coordination", start: 4, end: 8, hours: 1, progress: 0, owner: "liwenjing", members: ["anner"], memberHours: 1, summary: "组织上线评审会，需中心负责人审批后发布。" },
  { key: "dt-research", name: "数字化转型·现状调研", project: "digital-consult", type: "market", status: "in_progress", start: -18, end: 6, hours: 1, progress: 45, owner: "moss", members: ["zhaomin"], memberHours: 1, summary: "走访 4 个业务部门，梳理 23 项痛点与改进机会。" },
  { key: "dt-blueprint", name: "数字化转型·蓝图方案", project: "digital-consult", type: "market", status: "in_progress", start: 2, end: 25, hours: 4, progress: 25, owner: "liwenjing", members: ["anner"], memberHours: 1, summary: "编制三年蓝图与年度实施路线图。" },
  { key: "dt-brief", name: "数字化转型·高层汇报", project: "digital-consult", type: "clerical", status: "done", start: -12, end: -8, hours: 3, progress: 100, owner: "anner", summary: "完成高层汇报材料与现场答疑。" },
  { key: "edge-select", name: "边缘计算·试点选型", project: "edge-pilot", type: "research-department", status: "draft", start: 8, end: 30, hours: 2, progress: 0, owner: "chensiyuan", members: ["moss"], memberHours: 1, summary: "对比三家边缘节点方案，形成选型建议书。" },
  { key: "edge-device", name: "边缘计算·设备清单确认", project: "edge-pilot", type: "market", status: "in_progress", start: -5, end: 15, hours: 2, progress: 15, owner: "zhoujie", summary: "与供应商确认设备清单、到货周期与联调窗口。" },
  { key: "sec-gap", name: "等保测评·差距分析", project: "security", type: "clerical", status: "in_progress", start: -10, end: 8, hours: 3, progress: 55, owner: "zhoujie", members: ["wudi"], memberHours: 1, summary: "对照等保 2.0 三级要求完成差距分析与整改清单。" },
  { key: "sec-plan", name: "等保测评·整改方案", project: "security", type: "clerical", status: "pending_acceptance", start: -22, end: -2, hours: 1, progress: 80, owner: "wudi", summary: "完成网络、主机、应用三层整改方案并送审。" },
  { key: "sec-policy", name: "等保测评·制度修订", project: "security", type: "clerical", status: "done", start: -30, end: -15, hours: 2, progress: 100, owner: "anner", summary: "修订 7 项安全管理制度并完成发布。" },
  { key: "salon-prep", name: "技术沙龙·第三期筹备", project: "salon", type: "party", status: "in_progress", start: -4, end: 6, hours: 1, progress: 60, owner: "moss", members: ["liwenjing", "liuyang"], memberHours: 1, summary: "确认议程、讲师与场地，收集报名名单。" },
  { key: "salon-history", name: "技术沙龙·党史学习专题", project: "salon", type: "party", status: "done", start: -20, end: -14, hours: 2, progress: 100, owner: "liwenjing", summary: "组织主题党日学习并完成心得汇编。" },
  { key: "salon-ai", name: "技术沙龙·AI 工具实操", project: "salon", type: "learning", status: "in_progress", start: 3, end: 10, hours: 1, progress: 35, owner: "liuyang", summary: "准备 AI 编程与文档助手实操课程。" },
  { key: "robot-test", name: "巡检机器人·样机测试", project: "robot", type: "research-company", status: "in_progress", start: -20, end: 20, hours: 3, progress: 72, owner: "zhoujie", summary: "完成第二轮样机室内测试，整理故障样本。" },
  { key: "robot-field", name: "巡检机器人·三号站巡检", project: "robot", type: "business-trip", status: "in_progress", start: -6, end: 0, hours: 8, progress: 40, owner: "wangqiang", summary: "三号站现场巡检与轨道标定，今日收尾。" },
  { key: "robot-parts", name: "巡检机器人·备件采购", project: "robot", type: "market", status: "in_progress", start: 4, end: 18, hours: 3, progress: 20, owner: "zhaomin", summary: "采购履带、云台与备用电池，跟进到货。" },
  { key: "overseas-clear", name: "海外项目·设备清关", project: "overseas", type: "business-trip", status: "done", start: -40, end: -25, hours: 8, allDay: true, progress: 100, owner: "wangqiang", summary: "完成两批设备清关与到场验收。" },
  { key: "overseas-accept", name: "海外项目·客户验收", project: "overseas", type: "business-trip", status: "done", start: -24, end: -18, hours: 6, progress: 100, owner: "zhangwei", members: ["sunqian"], memberHours: 4, summary: "客户完成系统验收并签署验收单。" },
  { key: "overseas-summary", name: "海外项目·验收总结", project: "overseas", type: "clerical", status: "pending_acceptance", start: -17, end: -10, hours: 1, progress: 95, owner: "zhangwei", summary: "整理验收资料与经验总结，送中心归档。" },
  { key: "kb-policy", name: "知识库·制度库梳理", project: "knowledge", type: "clerical", status: "in_progress", start: -12, end: 8, hours: 2, progress: 45, owner: "sunqian", members: ["moss"], memberHours: 1, summary: "梳理 126 份制度文件，建立分类目录与检索标签。" },
  { key: "kb-corpus", name: "知识库·问答语料标注", project: "knowledge", type: "clerical", status: "in_progress", start: -5, end: 20, hours: 2, progress: 30, owner: "wudi", members: ["zhaomin"], memberHours: 1, summary: "完成 800 条问答语料标注与抽检。" },
  { key: "study-check", name: "数据治理·专题学习打卡", project: "study", type: "learning", status: "in_progress", start: -8, end: 22, hours: 1, progress: 25, owner: "anner", members: ["moss", "liuyang", "liwenjing"], memberHours: 1, summary: "五周专题学习，每周一次线上打卡。" },
  { key: "study-exam", name: "数据治理·结业测评", project: "study", type: "learning", status: "draft", start: 15, end: 25, hours: 1, progress: 0, owner: "liwenjing", summary: "组织结业测评，输出能力画像。" },
  { key: "leave-roster", name: "高温休假·排班表编制", project: "leave-plan", type: "clerical", status: "pending_coordination", start: 14, end: 20, hours: 1, progress: 0, owner: "wangqiang", members: ["zhaomin"], memberHours: 1, summary: "编制 7-8 月轮休排班表，需部门审批后执行。" },
  { key: "dm-accept-file", name: "数据中台·验收材料准备", project: "data-platform", type: "clerical", status: "cancelled", start: -5, end: 5, hours: 2, progress: 0, owner: "wudi", summary: "验收时间调整，材料准备任务取消。" },
  { key: "dm-meeting", name: "数据中台·月度例会材料", project: "data-platform", type: "clerical", status: "in_progress", start: -3, end: 0, hours: 1, progress: 70, owner: "anner", summary: "汇总本月进展、风险与下月计划，供中心例会使用。" },
  { key: "sec-release", name: "等保测评·制度发布确认", project: "security", type: "clerical", status: "pending_acceptance", start: -12, end: -2, hours: 1, progress: 90, owner: "anner", summary: "确认 7 项安全制度发布范围与培训安排。" },
];
const projectOf = (key: string) => projects.find((p) => p.key === key)!;

const statements: string[] = [];
const created: string[] = [];
function record(kind: string, key: string, data: Record<string, unknown>, createdBy: string, ageDays: number, updatedMinutes = 0) {
  const id = idFor(`${kind}:${key}`);
  created.push(id);
  statements.push(`INSERT INTO nexusflow.records(id,kind,tenant_id,created_by,data,created_at,updated_at) VALUES(${q(id)},${q(kind)},${q(TENANT)},${q(createdBy)},${json({ ...data, demo: DEMO })},${q(ts(ageDays))},${q(ts(0, updatedMinutes))}) ON CONFLICT (id) DO UPDATE SET kind=EXCLUDED.kind,tenant_id=EXCLUDED.tenant_id,created_by=EXCLUDED.created_by,data=EXCLUDED.data,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at;`);
  return id;
}

// 组织：只补缺失部门/工作室
for (const org of [
  { id: ORG.data, name: "数据管理部", type: "department", parent_id: ORG.center },
  { id: ORG.admin, name: "综合管理部", type: "department", parent_id: ORG.center },
  { id: ORG.studio2, name: "数字孪生工作室", type: "studio", parent_id: ORG.rd },
]) {
  statements.push(`INSERT INTO nexusflow.records(id,kind,tenant_id,created_by,data,created_at,updated_at) VALUES(${q(org.id)},'orgs',${q(TENANT)},${q(admin.id)},${json({ name: org.name, type: org.type, parent_id: org.parent_id, enabled: true })},${q(ts(90))},${q(ts(0, 30))}) ON CONFLICT (id) DO UPDATE SET data=EXCLUDED.data,updated_at=EXCLUDED.updated_at;`);
}

// 演示账号 + 人员档案
for (const [i, s] of staff.entries()) {
  const id = userOf(s.key), org = orgOf(s.key);
  statements.push(`INSERT INTO nexusflow.users(id,username,password_hash,display_name,role,tenant_id,org_id,org_ids,status,updated_at) VALUES(${q(id)},${q(`demo.${s.key}`)},${q(PASSWORD_HASH)},${q(s.name)},${q(s.role)},${q(TENANT)},${q(org)},ARRAY[${q(org)}],'active',now()) ON CONFLICT (id) DO UPDATE SET username=EXCLUDED.username,password_hash=EXCLUDED.password_hash,display_name=EXCLUDED.display_name,role=EXCLUDED.role,tenant_id=EXCLUDED.tenant_id,org_id=EXCLUDED.org_id,org_ids=EXCLUDED.org_ids,status=EXCLUDED.status,updated_at=now();`);
  record("people", s.key, {
    name: s.name, title: s.title, org_id: org, org_ids: [org], user_id: id,
    employee_no: `NF-${2026001 + i}`, management_level: s.mgmt, professional_level: s.prof,
    duties: s.duties, skills: s.skills, studio_ids: s.studio ? [ORG.studio2] : [], status: s.status,
    daily_standard_hours: 8, dispatchable: true,
  }, admin.id, 88 - i);
}
statements.push(`UPDATE nexusflow.users SET org_id=${q(ORG.rd)},org_ids=ARRAY[${q(ORG.rd)}],updated_at=now() WHERE id=${q(moss.id)};`);
record("people", "moss", {
  name: "moss", title: "数据产品经理", org_id: ORG.rd, org_ids: [ORG.rd], user_id: moss.id,
  employee_no: "NF-2026001", management_level: "staff", professional_level: "engineer_2",
  duties: ["execution"], skills: ["Python", "SQL", "PPT 制作", "需求收集"], studio_ids: [ORG.studio2], status: "active",
  daily_standard_hours: 8, dispatchable: true,
}, admin.id, 80);
statements.push(`UPDATE nexusflow.records SET data=data||${json({
  name: "Anner", title: "项目部主任", org_id: ORG.pm, org_ids: [ORG.pm], user_id: anner.id,
  employee_no: "NF-2026000", management_level: "department_director", professional_level: "engineer_1",
  duties: ["personnel_coordination", "project_supervision", "internal_coordination"], skills: ["项目管理", "需求收集", "报告撰写"],
  studio_ids: [ORG.studio], status: "active", daily_standard_hours: 8, dispatchable: true,
})} WHERE kind='people' AND data->>'user_id'=${q(anner.id)};`);

// 项目
for (const [i, p] of projects.entries()) {
  record("projects", p.key, {
    name: p.name, type: p.type, level: p.level, owner: PEOPLE[p.owner]!.name, owner_id: userOf(p.owner),
    org_id: ORG[p.org], member_ids: [...new Set(p.members.map(userOf))],
    status: p.status, progress: p.progress, start_date: d(p.start), end_date: d(p.end), visibility: "normal",
  }, userOf(p.owner), p.ageDays, i * 7);
}

// 任务 + 任务分配
const workable: { task: Task; taskId: string; userId: string; hours: number }[] = [];
for (const [i, t] of tasks.entries()) {
  const p = projectOf(t.project);
  const taskId = record("tasks", t.key, {
    name: t.name, type: t.type, status: t.status, owner_id: userOf(t.owner), org_id: ORG[p.org], project_id: idFor(`projects:${p.key}`),
    member_ids: [...new Set([t.owner, ...(t.members || [])].map(userOf))],
    start_date: d(t.start), end_date: d(t.end), daily_hours: t.hours, all_day: Boolean(t.allDay),
    progress: t.progress, summary: t.summary,
    ...(t.status === "done" ? { accepted_by: userOf(p.owner), accepted_at: ts(8) } : {}),
    ...(t.status === "in_progress" ? { published_at: ts(Math.max(1, -t.start)) } : {}),
  }, userOf(t.owner), Math.max(1, -t.start) + 3, i * 3);
  for (const [mi, member] of [...new Set([t.owner, ...(t.members || [])])].entries()) {
    const hours = member === t.owner ? t.hours : (t.memberHours ?? 2);
    const status = t.status === "draft" ? "assigned"
      : t.status === "cancelled" ? "cancelled"
      : t.status === "done" ? "accepted"
      : t.status === "pending_confirmation" ? "pending_confirmation"
      : t.status === "pending_coordination" ? "assigned"
      : t.status === "pending_acceptance" ? (member === t.owner ? "pending_acceptance" : "accepted")
      : "active";
    const progress = status === "accepted" ? 100 : status === "pending_acceptance" ? 90 : status === "active" ? Math.max(10, Math.min(90, t.progress + (member === t.owner ? 0 : -10))) : 0;
    record("task_assignments", `${t.key}:${member}`, {
      task_id: taskId, user_id: userOf(member), start_date: d(t.start), end_date: d(t.end), daily_hours: hours, all_day: Boolean(t.allDay),
      status, progress, deliverables: mi === 0 && t.progress > 0 ? ["personal-report", "minutes"] : [],
      ...(status === "active" ? { confirmed_by: userOf(member), confirmed_at: ts(Math.max(1, -t.start)) } : {}),
      ...(status === "pending_acceptance" ? { result: `${t.name}已完成，提交成果待验收。`, result_file_ids: [], submitted_at: ts(1) } : {}),
      ...(status === "accepted" ? { reviewed_by: userOf(p.owner), reviewed_at: ts(6) } : {}),
    }, userOf(t.owner), Math.max(1, -t.start) + 3, i * 3 + 1);
    if (["active", "pending_acceptance", "accepted"].includes(status)) workable.push({ task: t, taskId, userId: userOf(member), hours });
  }
}

// 里程碑
for (const [key, name, task, offset, status] of [
  ["ms1", "需求与指标口径确认", "dm-standard", -10, "done"],
  ["ms2", "主数据首批上线", "dm-standard", 12, "planned"],
  ["ms3", "大屏联调完成", "dm-screen", 0, "planned"],
  ["ms4", "现场检测完成", "pipe-field", 8, "planned"],
  ["ms5", "中期评估报告定稿", "pipe-report", 6, "planned"],
  ["ms6", "压测方案评审", "opt-stress", 10, "planned"],
  ["ms7", "生产调度上线", "opt-web", 14, "planned"],
  ["ms8", "等保差距分析完成", "sec-gap", 5, "planned"],
  ["ms9", "客户验收签署", "overseas-accept", -18, "done"],
  ["ms10", "制度库一期发布", "kb-policy", 20, "planned"],
] as const) {
  const owner = tasks.find((t) => t.key === task)!.owner;
  record("milestones", key, { name, task_id: idFor(`tasks:${task}`), date: d(offset), status }, userOf(owner), 20);
}

// 工时
for (const [index, row] of workable.entries()) {
  const t = row.task;
  for (const offset of [-9, -4, -1]) {
    const point = Math.min(Math.max(offset, t.start + 1), t.end);
    if (d(point) > TODAY || point < t.start || point > t.end || t.status === "done" && offset === -1) continue;
    record("worklogs", `${t.key}:${row.userId}:${offset}`, {
      task_id: row.taskId, person_id: row.userId, date: d(point),
      hours: offset === -1 ? Math.min(4, row.hours) : Math.min(6, row.hours),
      note: ["推进关键节点，问题已同步项目群。", "完成阶段产出并归档。", "与业务方对齐口径，待反馈确认。"][index % 3],
    }, row.userId, 12 - offset);
  }
}

// 冲突（与实时计算同键，确保页面可直接强制协调）
for (const c of [
  { key: "overload-csy", task: "dm-metric", person: "chensiyuan", type: "workload_overload", severity: "warning", days: [1, 2, 3, 4, 5, 6, 7], peak: 9, cap: 8, title: "任务负载过载" },
  { key: "overload-csy2", task: "dm-standard", person: "chensiyuan", type: "workload_overload", severity: "warning", days: [-3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9], peak: 9, cap: 8, title: "任务负载过载" },
  { key: "allday-wq", task: "pipe-field", person: "wangqiang", type: "all_day_overlap", severity: "blocking", days: [3, 4, 5, 6, 7], peak: 14, cap: 8, title: "全天任务冲突" },
  { key: "allday-wq2", task: "pipe-report", person: "wangqiang", type: "all_day_overlap", severity: "blocking", days: [3, 4, 5, 6, 7], peak: 14, cap: 8, title: "全天任务冲突" },
  { key: "overload-wq", task: "pipe-field", person: "wangqiang", type: "workload_overload", severity: "warning", days: [3, 4, 5, 6, 7], peak: 14, cap: 8, title: "任务负载过载" },
  { key: "overload-wq2", task: "pipe-report", person: "wangqiang", type: "workload_overload", severity: "warning", days: [3, 4, 5, 6, 7], peak: 14, cap: 8, title: "任务负载过载" },
  { key: "unavailable-sq", task: "kb-policy", person: "sunqian", type: "person_unavailable", severity: "blocking", days: [], peak: 0, cap: 0, title: "成员不可用" },
]) {
  record("conflicts", c.key, {
    task_id: idFor(`tasks:${c.task}`), person_id: userOf(c.person), type: c.type, severity: c.severity, status: "open",
    title: c.title, days: c.days.map(d), peak_hours: c.peak, capacity: c.cap,
    reported_by: anner.id, reported_at: ts(2),
  }, anner.id, 2);
}

// 派发与审批
for (const [i, dp] of [
  { key: "dispatch-review", task: "opt-review", requester: "chensiyuan", status: "pending_approval", orgs: [ORG.rd] },
  { key: "dispatch-leave", task: "leave-roster", requester: "wangqiang", status: "pending_approval", orgs: [ORG.pm] },
  { key: "dispatch-overseas", task: "overseas-accept", requester: "zhangwei", status: "published", orgs: [ORG.pm] },
  { key: "dispatch-exam", task: "study-exam", requester: "liwenjing", status: "rejected", orgs: [ORG.rd] },
].entries()) {
  record("dispatch", dp.key, {
    task_id: idFor(`tasks:${dp.task}`), requester_id: userOf(dp.requester), workflow: "standard", status: dp.status,
    target_org_ids: dp.orgs, created_at: ts(3 + i),
    ...(dp.status === "published" ? { published_at: ts(20) } : {}),
  }, userOf(dp.requester), 4 + i);
}
for (const [i, ap] of [
  { key: "approval-review", dispatch: "dispatch-review", task: "opt-review", org: ORG.rd, step: "center_director", approver: "anner", status: "pending", age: 1 },
  { key: "approval-leave", dispatch: "dispatch-leave", task: "leave-roster", org: ORG.pm, step: "department_director", approver: "zhangwei", status: "pending", age: 2 },
  { key: "approval-overseas", dispatch: "dispatch-overseas", task: "overseas-accept", org: ORG.pm, step: "department_director", approver: "anner", status: "approved", age: 22, reason: "资料齐全，同意发布。" },
  { key: "approval-exam", dispatch: "dispatch-exam", task: "study-exam", org: ORG.rd, step: "center_director", approver: "anner", status: "rejected", age: 5, reason: "测评时间与中心例会冲突，调整后再报。" },
].entries()) {
  const decided = ap.status !== "pending";
  record("approvals", ap.key, {
    dispatch_id: idFor(`dispatch:${ap.dispatch}`), task_id: idFor(`tasks:${ap.task}`), target_org_id: ap.org,
    step: ap.step, approver_id: userOf(ap.approver), status: ap.status, requested_at: ts(ap.age + 1),
    ...(decided ? { decided_by: userOf(ap.approver), decided_at: ts(ap.age), reason: ap.reason } : {}),
  }, userOf(ap.approver), ap.age, i * 11);
}

// 收件箱与提及
for (const item of [
  { key: "anner-1", user: "anner", type: "approval", title: "生产调度·上线评审待审批", message: "陈思远提交了上线评审派发申请，请在收件箱完成审批。", source: "approvals:approval-review", unread: true, age: 1, sender: "陈思远" },
  { key: "anner-2", user: "anner", type: "task_accept", title: "数据中台·历史数据迁移演练待验收", message: "吴迪提交了迁移演练成果，等待你验收。", source: "tasks:dm-migrate", unread: true, age: 1, sender: "吴迪" },
  { key: "anner-3", user: "anner", type: "conflict", title: "陈思远存在任务负载冲突", message: "数据中台两项任务叠加后日均 9 小时，请在负载与冲突页协调。", source: "tasks:dm-metric", unread: true, age: 2, sender: "系统" },
  { key: "anner-4", user: "anner", type: "mention", title: "李文静在任务中提到了你", message: "@anner 蓝图方案第三稿需要你确认部门口径。", source: "tasks:dt-blueprint", unread: true, age: 2, sender: "李文静" },
  { key: "anner-5", user: "anner", type: "task_assigned", title: "你被加入「管道完整性·风险模型评审」", message: "张伟邀请你参与风险模型评审。", source: "tasks:pipe-model", unread: false, age: 4, sender: "张伟" },
  { key: "anner-6", user: "anner", type: "dispatch_approved", title: "海外项目验收派发已通过", message: "海外项目·客户验收派发已发布。", source: "dispatch:dispatch-overseas", unread: false, age: 20, sender: "系统" },
  { key: "anner-7", user: "anner", type: "task_return", title: "等保测评·整改方案已退回", message: "整改方案缺少主机层加固说明，请补充后重新提交。", source: "tasks:sec-plan", unread: false, age: 6, sender: "周杰" },
  { key: "anner-8", user: "anner", type: "system", title: "系统例行维护通知", message: "本周日 02:00-03:00 进行例行维护，期间只读。", unread: false, age: 3, sender: "系统" },
  { key: "moss-1", user: "moss", type: "task_assigned", title: "你有新的任务待确认", message: "「数据中台·指标体系评审」已发布，等待你确认。", source: "tasks:dm-metric", unread: true, age: 1, sender: "陈思远" },
  { key: "moss-2", user: "moss", type: "task_accept", title: "「数据中台·用户培训材料」进入验收", message: "你提交的培训材料已进入验收环节。", source: "tasks:dm-training", unread: true, age: 2, sender: "王建国" },
  { key: "moss-3", user: "moss", type: "mention", title: "陈思远在任务中提到了你", message: "@moss 指标体系第三组口径请你补充说明。", source: "tasks:dm-metric", unread: true, age: 1, sender: "陈思远" },
  { key: "moss-4", user: "moss", type: "conflict_forced", title: "负载冲突已限期协调", message: "王强的全天任务冲突已由中心协调，请关注后续排期。", source: "tasks:pipe-field", unread: false, age: 3, sender: "Anner" },
  { key: "moss-5", user: "moss", type: "task_return", title: "「知识库·制度库梳理」成果已退回", message: "请补充制度废止状态字段后重新提交。", source: "tasks:kb-policy", unread: false, age: 5, sender: "赵敏" },
  { key: "moss-6", user: "moss", type: "dispatch_approved", title: "技术沙龙场地申请已通过", message: "第三期技术沙龙场地与设备申请已批准。", source: "dispatch:dispatch-review", unread: false, age: 6, sender: "系统" },
  { key: "moss-7", user: "moss", type: "system", title: "欢迎使用 NexusFlow", message: "你的账号已加入研发部，可在我的工作查看任务。", unread: false, age: 30, sender: "系统" },
] as const) {
  record("inbox", item.key, {
    user_id: userOf(item.user), type: item.type, title: item.title, message: item.message, sender: item.sender,
    created_by_name: item.sender, source_id: item.source ? idFor(item.source) : undefined,
    status: item.unread ? "pending" : "done", read_at: item.unread ? null : ts(item.age - 0.5),
  }, userOf(nameKey[item.sender] || "anner"), item.age, item.age * 5);
}
for (const m of [
  { key: "mention-anner", user: "anner", task: "dt-blueprint", text: "蓝图方案第三稿需要你确认部门口径。", sender: "liwenjing" },
  { key: "mention-moss", user: "moss", task: "dm-metric", text: "指标体系第三组口径请你补充说明。", sender: "chensiyuan" },
  { key: "mention-moss2", user: "moss", task: "salon-prep", text: "第三期沙龙议程请你确认讲师名单。", sender: "liwenjing" },
]) {
  record("mentions", m.key, { user_id: userOf(m.user), source_id: idFor(`tasks:${m.task}`), type: "task_update", text: m.text, mentioned_by: userOf(m.sender) }, userOf(m.sender), 2);
}

// 工具台
for (const [id, name, category, icon, description, usage] of [
  ["pdf-convert", "PDF 格式转换", "utility", "file-output", "格式互转、合并拆分、扫描件 OCR 识别", "上传 PDF 或图片，选择目标格式后一键转换。"],
  ["translate", "智能翻译", "utility", "languages", "中英互译，支持术语库与公文语体", "粘贴文本或上传文档，选择术语库即可翻译。"],
  ["paper-writing", "论文撰写助手", "agent", "pen-line", "提纲生成、章节润色、参考文献整理", "输入研究主题与已有材料，生成提纲并逐章润色。"],
  ["patent-writing", "专利撰写助手", "agent", "stamp", "交底书结构化、权利要求书草拟", "上传技术交底书，生成权利要求书与说明书草稿。"],
  ["knowledge-base", "个人知识库", "agent", "book-open", "个人资料沉淀检索，随问随答", "上传资料构建个人知识库，用自然语言检索。"],
  ["platform-assistant", "平台问答助手", "agent", "message-circle", "问流程、问制度、问项目状态", "直接提问平台使用、制度与项目进度问题。"],
  ["meeting-minutes", "会议纪要生成", "utility", "notebook-pen", "录音转写，待办自动拆解到任务", "上传会议录音，自动生成纪要与待办清单。"],
  ["weekly-report", "周报生成器", "utility", "calendar-check", "汇总任务进展，一键生成个人周报", "按周汇总任务、工时与冲突，生成周报草稿。"],
  ["data-visualization", "数据可视化", "utility", "bar-chart-3", "Excel / CSV 快速生成汇报图表", "上传表格数据，选择图表类型导出汇报图。"],
] as const) {
  record("tools", id, { tool_id: id, name, category, icon, description, usage, url: "#", enabled: true }, admin.id, 60);
}

// 清理上一轮 demo 记录
statements.push(`DELETE FROM nexusflow.records WHERE tenant_id=${q(TENANT)} AND data->>'demo'=${q(DEMO)} AND NOT (id = ANY(ARRAY[${created.map(q).join(",")}]));`);

// 自检：按 /api/home 与冲突计算的同一口径模拟每日负载，只允许设计内的告警
const excluded = new Set(["draft", "done", "archived", "cancelled", "paused", "pending_confirmation", "pending_approval", "pending_coordination"]);
const capacityOf = (key: string) => (staff.find((s) => s.key === key)?.status === "travel" ? 0 : 8);
const warnings: string[] = [];
for (const key of Object.keys(PEOPLE)) {
  let worst = { day: "", hours: 0, tasks: [] as string[] };
  for (let i = -20; i <= 25; i++) {
    const day = d(i);
    const active = tasks.filter((t) => !excluded.has(t.status) && [...new Set([t.owner, ...(t.members || [])])].includes(key) && day >= d(t.start) && day <= d(t.end));
    const hours = active.reduce((sum, t) => sum + (t.allDay ? capacityOf(key) : t.owner === key ? t.hours : t.memberHours ?? 2), 0);
    if (hours > worst.hours) worst = { day, hours, tasks: active.map((t) => t.key) };
  }
  const cap = capacityOf(key);
  if (cap > 0 && worst.hours > cap) warnings.push(`${key}: peak ${worst.hours}h/${cap}h on ${worst.day} (${worst.tasks.join(",")})`);
  if (cap === 0) warnings.push(`${key}: unavailable (capacity 0)`);
}
if (warnings.length) process.stderr.write(`load warnings:\n${warnings.join("\n")}\n`);

if (process.env.MANIFEST) writeFileSync(process.env.MANIFEST, JSON.stringify({
  tenant: TENANT, today: TODAY, password: "Nexus@2026",
  projects: Object.fromEntries(projects.map((p) => [p.key, { id: idFor(`projects:${p.key}`), name: p.name }])),
  tasks: Object.fromEntries(tasks.map((t) => [t.key, { id: idFor(`tasks:${t.key}`), name: t.name, project: t.project }])),
  accounts: staff.map((s) => ({ username: `demo.${s.key}`, name: s.name, role: s.role })),
  counts: { projects: projects.length, tasks: tasks.length, assignments: workable.length, inbox: 15, tools: 9 },
}, null, 2));
process.stdout.write(["\\set ON_ERROR_STOP on", "BEGIN;", ...statements, "COMMIT;", ""].join("\n"));
