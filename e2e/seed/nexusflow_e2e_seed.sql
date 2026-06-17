-- NexusFlow E2E baseline seed.
-- This file is intentionally idempotent and is meant to run on ssh nexusflow.

CREATE OR REPLACE FUNCTION upsert_e2e_account(
  p_login_name text,
  p_name text,
  p_employee_no text,
  p_org_id uuid,
  p_role_ids uuid[],
  p_work_status text,
  p_account_status text,
  p_password_hash text
) RETURNS void AS $$
DECLARE
  v_account_id uuid;
  v_person_id uuid;
BEGIN
  INSERT INTO accounts(login_name, password_hash, status, payload)
  VALUES (p_login_name, p_password_hash, p_account_status, '{"e2e_seed":true}')
  ON CONFLICT (login_name) DO UPDATE
    SET password_hash = EXCLUDED.password_hash,
        status = EXCLUDED.status,
        failed_login_count = 0,
        payload = accounts.payload || EXCLUDED.payload,
        updated_at = now()
  RETURNING id INTO v_account_id;

  SELECT id INTO v_person_id
  FROM persons
  WHERE employee_no = p_employee_no OR account_id = v_account_id
  ORDER BY CASE WHEN employee_no = p_employee_no THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_person_id IS NULL THEN
    INSERT INTO persons(name, employee_no, account_id, primary_org_id, system_role_ids, work_status, daily_standard_hours, dispatch_enabled, account_status, payload)
    VALUES (p_name, p_employee_no, v_account_id, p_org_id, p_role_ids, p_work_status, 8, p_work_status NOT IN ('resigned'), p_account_status, '{"e2e_seed":true}')
    RETURNING id INTO v_person_id;
  ELSE
    UPDATE persons
    SET name = p_name,
        employee_no = p_employee_no,
        account_id = v_account_id,
        primary_org_id = p_org_id,
        system_role_ids = p_role_ids,
        work_status = p_work_status,
        dispatch_enabled = p_work_status NOT IN ('resigned'),
        account_status = p_account_status,
        payload = payload || '{"e2e_seed":true}'::jsonb,
        updated_at = now()
    WHERE id = v_person_id;
  END IF;

  UPDATE accounts SET person_id = v_person_id WHERE id = v_account_id;
  INSERT INTO person_org_memberships(person_id, org_id, membership_type, active)
  VALUES (v_person_id, p_org_id, 'primary', true)
  ON CONFLICT (person_id, org_id, membership_type) DO UPDATE SET active = true, left_at = NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION seed_e2e_project(
  p_project_no text,
  p_name text,
  p_project_type text,
  p_level text,
  p_owner_org_id uuid,
  p_leader_id uuid,
  p_status text,
  p_visibility text,
  p_start date,
  p_end date
) RETURNS void AS $$
BEGIN
  INSERT INTO projects(project_no, name, project_type, level, owner_org_id, leader_id, managed_by_id, status, visibility, start_date, end_date, summary, payload)
  VALUES (p_project_no, p_name, p_project_type, p_level, p_owner_org_id, p_leader_id, p_leader_id, p_status, p_visibility, p_start, p_end, p_name || ' 摘要', '{"e2e_seed":true}')
  ON CONFLICT (project_no) DO UPDATE
    SET name = EXCLUDED.name,
        project_type = EXCLUDED.project_type,
        level = EXCLUDED.level,
        owner_org_id = EXCLUDED.owner_org_id,
        leader_id = EXCLUDED.leader_id,
        managed_by_id = EXCLUDED.managed_by_id,
        status = EXCLUDED.status,
        visibility = EXCLUDED.visibility,
        start_date = EXCLUDED.start_date,
        end_date = EXCLUDED.end_date,
        payload = projects.payload || EXCLUDED.payload,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION seed_e2e_task(
  p_task_no text,
  p_name text,
  p_sub_type text,
  p_level text,
  p_priority text,
  p_owner_org_id uuid,
  p_project_id uuid,
  p_visibility text,
  p_initiator_id uuid,
  p_owner_id uuid,
  p_acceptor_id uuid,
  p_start_at timestamptz,
  p_due_at timestamptz,
  p_hours numeric,
  p_summary text,
  p_deliverable text,
  p_status text
) RETURNS void AS $$
BEGIN
  INSERT INTO tasks(task_no, name, sub_type, level, priority, owner_org_id, project_id, visibility, initiator_id, owner_id, acceptor_id, start_at, due_at, estimated_total_hours, summary, deliverable_requirement, status, progress, payload, created_by, updated_by)
  VALUES (p_task_no, p_name, p_sub_type, p_level, p_priority, p_owner_org_id, p_project_id, p_visibility, p_initiator_id, p_owner_id, p_acceptor_id, p_start_at, p_due_at, p_hours, p_summary, p_deliverable, p_status, CASE WHEN p_status IN ('completed','archived','pending_acceptance') THEN 100 ELSE 30 END, '{"e2e_seed":true}', p_initiator_id, p_initiator_id)
  ON CONFLICT (task_no) DO UPDATE
    SET name = EXCLUDED.name,
        sub_type = EXCLUDED.sub_type,
        level = EXCLUDED.level,
        priority = EXCLUDED.priority,
        owner_org_id = EXCLUDED.owner_org_id,
        project_id = EXCLUDED.project_id,
        visibility = EXCLUDED.visibility,
        initiator_id = EXCLUDED.initiator_id,
        owner_id = EXCLUDED.owner_id,
        acceptor_id = EXCLUDED.acceptor_id,
        start_at = EXCLUDED.start_at,
        due_at = EXCLUDED.due_at,
        estimated_total_hours = EXCLUDED.estimated_total_hours,
        summary = EXCLUDED.summary,
        deliverable_requirement = EXCLUDED.deliverable_requirement,
        status = EXCLUDED.status,
        progress = EXCLUDED.progress,
        payload = tasks.payload || EXCLUDED.payload,
        updated_at = now();
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  password_hash text := 'sha256:b5b85368189fc531ea63bd17fd3be376c12761e377ca3bb0f614ff801b52e7cd';
  root_org uuid;
  center_a uuid;
  dept_a1 uuid;
  dept_a2 uuid;
  studio_a1 uuid;
  center_b uuid;
  role_sa uuid;
  role_admin uuid;
  role_center_lead uuid;
  role_center_deputy uuid;
  role_dept_lead uuid;
  role_dept_deputy uuid;
  role_project_owner uuid;
  role_task_owner uuid;
  role_employee uuid;
  role_pending uuid;
  p_sa uuid;
  p_sysadmin uuid;
  p_center_lead uuid;
  p_center_deputy uuid;
  p_dept_lead uuid;
  p_dept_lead_a2 uuid;
  p_dept_deputy uuid;
  p_project_owner uuid;
  p_task_owner uuid;
  p_employee uuid;
  p_employee_a2 uuid;
  p_leave uuid;
  p_travel uuid;
  p_resigned uuid;
  p_pending uuid;
  p_disabled uuid;
  p_hidden_denied uuid;
  p_hidden_allowed uuid;
  prj_open uuid;
  prj_hidden uuid;
  prj_cross uuid;
  prj_archive uuid;
  task_draft uuid;
  task_coordination uuid;
  task_confirm uuid;
  task_running uuid;
  task_paused uuid;
  task_acceptance uuid;
  task_done uuid;
  task_archived uuid;
  task_leave uuid;
  task_travel uuid;
  task_backfill uuid;
  task_hidden uuid;
  res_stage uuid;
  res_stage_v uuid;
  res_final uuid;
  res_final_v uuid;
  tpl_id uuid;
BEGIN
  -- Remove derived seeded rows first. Base rows are upserted below.
  DELETE FROM notifications WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM todo_items WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM report_snapshots WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM tool_usage_logs WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM tool_entries WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM role_entry_configs WHERE layout->>'e2e_seed' = 'true';
  DELETE FROM invitation_links WHERE template_id IN (SELECT id FROM invitation_templates WHERE payload->>'e2e_seed' = 'true');
  DELETE FROM invitation_templates WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM conflict_records WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM workload_snapshots WHERE source_task_ids && ARRAY(SELECT id FROM tasks WHERE task_no LIKE 'TASK_%');
  DELETE FROM task_progress_reports WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM task_acceptances WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM approval_steps WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM approval_tickets WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM dispatch_requests WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM task_assignments WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM task_members WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM resource_links WHERE resource_id IN (SELECT id FROM resource_files WHERE payload->>'e2e_seed' = 'true');
  DELETE FROM resource_versions WHERE resource_id IN (SELECT id FROM resource_files WHERE payload->>'e2e_seed' = 'true');
  DELETE FROM resource_files WHERE payload->>'e2e_seed' = 'true';
  DELETE FROM resource_requirements WHERE payload->>'e2e_seed' = 'true';

  INSERT INTO roles(code, name, role_type, priority, enabled) VALUES
    ('center_lead', '中心主任/书记', 'leader', 20, true),
    ('center_deputy', '中心副主任/技术总监', 'leader', 25, true),
    ('dept_lead', '部门主任/技术监督', 'manager', 30, true),
    ('dept_deputy', '部门副主任', 'manager', 35, true)
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, role_type = EXCLUDED.role_type, priority = EXCLUDED.priority, enabled = true;

  SELECT id INTO role_sa FROM roles WHERE code = 'sa';
  SELECT id INTO role_admin FROM roles WHERE code = 'admin';
  SELECT id INTO role_center_lead FROM roles WHERE code = 'center_lead';
  SELECT id INTO role_center_deputy FROM roles WHERE code = 'center_deputy';
  SELECT id INTO role_dept_lead FROM roles WHERE code = 'dept_lead';
  SELECT id INTO role_dept_deputy FROM roles WHERE code = 'dept_deputy';
  SELECT id INTO role_project_owner FROM roles WHERE code = 'project_owner';
  SELECT id INTO role_task_owner FROM roles WHERE code = 'task_owner';
  SELECT id INTO role_employee FROM roles WHERE code = 'employee';
  SELECT id INTO role_pending FROM roles WHERE code = 'pending';

  INSERT INTO role_actions(role_id, action_code)
  SELECT r.id, a.module || '.' || a.action
  FROM roles r CROSS JOIN permission_actions a
  WHERE r.code IN ('admin', 'center_lead', 'center_deputy', 'dept_lead', 'dept_deputy')
    AND (a.module, a.action) IN (
      ('org','manage'), ('person','manage'), ('project','create'), ('project','manage'),
      ('project','manage_member'), ('task','create'), ('task','dispatch'), ('task','approve'),
      ('task','accept'), ('resource','upload'), ('resource','download'), ('config','publish'),
      ('report','export')
    )
  ON CONFLICT DO NOTHING;

  INSERT INTO organizations(name, code, org_type, parent_id, path, enabled, payload)
  VALUES ('NexusFlow', 'ROOT', 'company', NULL, '/ROOT', true, '{"e2e_seed":true}')
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, org_type = EXCLUDED.org_type, parent_id = EXCLUDED.parent_id, path = EXCLUDED.path, enabled = true;
  SELECT id INTO root_org FROM organizations WHERE code = 'ROOT';

  INSERT INTO organizations(name, code, org_type, parent_id, path, enabled, payload) VALUES
    ('中心 A', 'CENTER_A', 'center', root_org, '/ROOT/CENTER_A', true, '{"e2e_seed":true}'),
    ('部门 A1', 'DEPT_A1', 'department', NULL, '/ROOT/CENTER_A/DEPT_A1', true, '{"e2e_seed":true}'),
    ('部门 A2', 'DEPT_A2', 'department', NULL, '/ROOT/CENTER_A/DEPT_A2', true, '{"e2e_seed":true}'),
    ('工作室 A1', 'STUDIO_A1', 'studio', NULL, '/ROOT/CENTER_A/DEPT_A1/STUDIO_A1', true, '{"e2e_seed":true}'),
    ('中心 B', 'CENTER_B', 'center', root_org, '/ROOT/CENTER_B', true, '{"e2e_seed":true}')
  ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, org_type = EXCLUDED.org_type, path = EXCLUDED.path, enabled = true;

  SELECT id INTO center_a FROM organizations WHERE code = 'CENTER_A';
  SELECT id INTO dept_a1 FROM organizations WHERE code = 'DEPT_A1';
  SELECT id INTO dept_a2 FROM organizations WHERE code = 'DEPT_A2';
  SELECT id INTO studio_a1 FROM organizations WHERE code = 'STUDIO_A1';
  SELECT id INTO center_b FROM organizations WHERE code = 'CENTER_B';
  UPDATE organizations SET parent_id = center_a WHERE code IN ('DEPT_A1', 'DEPT_A2');
  UPDATE organizations SET parent_id = dept_a1 WHERE code = 'STUDIO_A1';

  INSERT INTO skill_tags(name, enabled, payload) VALUES
    ('数据分析', true, '{"e2e_seed":true}'),
    ('报告撰写', true, '{"e2e_seed":true}'),
    ('PPT 制作', true, '{"e2e_seed":true}'),
    ('项目管理', true, '{"e2e_seed":true}'),
    ('试验设计', true, '{"e2e_seed":true}'),
    ('专利检索', true, '{"e2e_seed":true}')
  ON CONFLICT (name) DO UPDATE SET enabled = true, payload = skill_tags.payload || EXCLUDED.payload;

  PERFORM upsert_e2e_account('Anner', 'Anner', 'E2E-SA', root_org, ARRAY[role_sa], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_sysadmin', '系统管理员', 'E2E-SYSADMIN', center_a, ARRAY[role_admin], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_center_lead', '中心主任', 'E2E-CENTER-LEAD', center_a, ARRAY[role_center_lead], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_center_deputy', '中心副主任', 'E2E-CENTER-DEPUTY', center_a, ARRAY[role_center_deputy], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_dept_lead', '部门主任 A1', 'E2E-DEPT-LEAD-A1', dept_a1, ARRAY[role_dept_lead], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_dept_lead_a2', '部门主任 A2', 'E2E-DEPT-LEAD-A2', dept_a2, ARRAY[role_dept_lead], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_dept_deputy', '部门副主任', 'E2E-DEPT-DEPUTY', dept_a1, ARRAY[role_dept_deputy], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_project_owner', '项目负责人', 'E2E-PROJECT-OWNER', dept_a1, ARRAY[role_project_owner], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_task_owner', '任务负责人', 'E2E-TASK-OWNER', dept_a1, ARRAY[role_task_owner], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_employee', '普通员工 A1', 'E2E-EMPLOYEE-A1', dept_a1, ARRAY[role_employee], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_employee_a2', '普通员工 A2', 'E2E-EMPLOYEE-A2', dept_a2, ARRAY[role_employee], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_leave', '休假员工', 'E2E-LEAVE', dept_a1, ARRAY[role_employee], 'leave', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_travel', '出差员工', 'E2E-TRAVEL', dept_a1, ARRAY[role_employee], 'travel', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_resigned', '离职员工', 'E2E-RESIGNED', dept_a1, ARRAY[role_employee], 'resigned', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_pending', '待审核用户', 'E2E-PENDING', dept_a1, ARRAY[role_pending], 'active', 'pending', password_hash);
  PERFORM upsert_e2e_account('nf_disabled', '禁用账号', 'E2E-DISABLED', dept_a1, ARRAY[role_employee], 'active', 'disabled', password_hash);
  PERFORM upsert_e2e_account('nf_hidden_denied', '隐藏项目未授权用户', 'E2E-HIDDEN-DENIED', dept_a1, ARRAY[role_employee], 'active', 'enabled', password_hash);
  PERFORM upsert_e2e_account('nf_hidden_allowed', '隐藏项目授权用户', 'E2E-HIDDEN-ALLOWED', dept_a1, ARRAY[role_employee], 'active', 'enabled', password_hash);

  SELECT id INTO p_sa FROM persons WHERE employee_no = 'E2E-SA';
  SELECT id INTO p_sysadmin FROM persons WHERE employee_no = 'E2E-SYSADMIN';
  SELECT id INTO p_center_lead FROM persons WHERE employee_no = 'E2E-CENTER-LEAD';
  SELECT id INTO p_center_deputy FROM persons WHERE employee_no = 'E2E-CENTER-DEPUTY';
  SELECT id INTO p_dept_lead FROM persons WHERE employee_no = 'E2E-DEPT-LEAD-A1';
  SELECT id INTO p_dept_lead_a2 FROM persons WHERE employee_no = 'E2E-DEPT-LEAD-A2';
  SELECT id INTO p_dept_deputy FROM persons WHERE employee_no = 'E2E-DEPT-DEPUTY';
  SELECT id INTO p_project_owner FROM persons WHERE employee_no = 'E2E-PROJECT-OWNER';
  SELECT id INTO p_task_owner FROM persons WHERE employee_no = 'E2E-TASK-OWNER';
  SELECT id INTO p_employee FROM persons WHERE employee_no = 'E2E-EMPLOYEE-A1';
  SELECT id INTO p_employee_a2 FROM persons WHERE employee_no = 'E2E-EMPLOYEE-A2';
  SELECT id INTO p_leave FROM persons WHERE employee_no = 'E2E-LEAVE';
  SELECT id INTO p_travel FROM persons WHERE employee_no = 'E2E-TRAVEL';
  SELECT id INTO p_resigned FROM persons WHERE employee_no = 'E2E-RESIGNED';
  SELECT id INTO p_pending FROM persons WHERE employee_no = 'E2E-PENDING';
  SELECT id INTO p_disabled FROM persons WHERE employee_no = 'E2E-DISABLED';
  SELECT id INTO p_hidden_denied FROM persons WHERE employee_no = 'E2E-HIDDEN-DENIED';
  SELECT id INTO p_hidden_allowed FROM persons WHERE employee_no = 'E2E-HIDDEN-ALLOWED';

  UPDATE organizations SET leader_ids = ARRAY[p_center_lead], deputy_leader_ids = ARRAY[p_center_deputy], default_approver_ids = ARRAY[p_center_lead] WHERE id = center_a;
  UPDATE organizations SET leader_ids = ARRAY[p_dept_lead], deputy_leader_ids = ARRAY[p_dept_deputy], default_approver_ids = ARRAY[p_dept_lead] WHERE id = dept_a1;
  UPDATE organizations SET leader_ids = ARRAY[p_dept_lead_a2], default_approver_ids = ARRAY[p_dept_lead_a2] WHERE id = dept_a2;

  PERFORM seed_e2e_project('PRJ_OPEN_A', '公开科研项目 A', 'research', 'department', dept_a1, p_project_owner, 'active', 'public', '2026-01-01', '2026-12-31');
  PERFORM seed_e2e_project('PRJ_HIDDEN_A', '隐藏攻关项目 A', 'research', 'center', dept_a1, p_project_owner, 'active', 'hidden', '2026-02-01', '2026-12-31');
  PERFORM seed_e2e_project('PRJ_CROSS_A', '跨部门协同项目 A', 'research', 'department', dept_a1, p_project_owner, 'active', 'public', '2026-03-01', '2026-11-30');
  PERFORM seed_e2e_project('PRJ_ARCHIVE_A', '可归档项目 A', 'other', 'custom', dept_a1, p_project_owner, 'completed', 'public', '2026-01-01', '2026-05-31');
  SELECT id INTO prj_open FROM projects WHERE project_no = 'PRJ_OPEN_A';
  SELECT id INTO prj_hidden FROM projects WHERE project_no = 'PRJ_HIDDEN_A';
  SELECT id INTO prj_cross FROM projects WHERE project_no = 'PRJ_CROSS_A';
  SELECT id INTO prj_archive FROM projects WHERE project_no = 'PRJ_ARCHIVE_A';

  INSERT INTO project_members(project_id, person_id, project_role, work_desc, active)
  VALUES
    (prj_open, p_project_owner, 'leader', '项目负责人', true),
    (prj_open, p_task_owner, 'member', '任务负责人', true),
    (prj_open, p_employee, 'member', '普通成员', true),
    (prj_hidden, p_project_owner, 'leader', '隐藏项目负责人', true),
    (prj_hidden, p_hidden_allowed, 'member', '隐藏项目授权成员', true),
    (prj_cross, p_project_owner, 'leader', '跨部门项目负责人', true),
    (prj_cross, p_employee_a2, 'member', '跨部门成员', true)
  ON CONFLICT (project_id, person_id) DO UPDATE SET project_role = EXCLUDED.project_role, work_desc = EXCLUDED.work_desc, active = true;

  INSERT INTO visibility_grants(object_type, object_id, subject_type, subject_id, grant_actions, expires_at, created_by, payload)
  VALUES ('project', prj_hidden, 'person', p_hidden_allowed, ARRAY['read','task.read','resource.read'], now() + interval '180 days', p_sa, '{"e2e_seed":true}')
  ON CONFLICT DO NOTHING;

  PERFORM seed_e2e_task('TASK_DRAFT', '草稿科研任务', 'research', 'normal', 'normal', dept_a1, prj_open, 'normal', p_sysadmin, p_task_owner, p_project_owner, '2026-06-18 09:00+08', '2026-06-25 18:00+08', 24, '草稿任务', '阶段报告', 'draft');
  PERFORM seed_e2e_task('TASK_COORDINATION', '跨部门待协调任务', 'research', 'normal', 'high', dept_a1, prj_cross, 'normal', p_dept_lead, p_task_owner, p_project_owner, '2026-06-19 09:00+08', '2026-06-26 18:00+08', 32, '需要 A2 支持', '协同记录', 'pending_coordination');
  PERFORM seed_e2e_task('TASK_CONFIRM', '待确认报告任务', 'report', 'normal', 'normal', dept_a1, prj_open, 'normal', p_project_owner, p_task_owner, p_project_owner, '2026-06-20 09:00+08', '2026-06-27 18:00+08', 16, '等待负责人确认', '报告初稿', 'pending_confirm');
  PERFORM seed_e2e_task('TASK_RUNNING', '进行中科研任务', 'research', 'normal', 'high', dept_a1, prj_open, 'normal', p_project_owner, p_task_owner, p_project_owner, '2026-06-10 09:00+08', '2026-06-30 18:00+08', 80, '进行中', '阶段报告', 'in_progress');
  PERFORM seed_e2e_task('TASK_PAUSED', '暂停支持任务', 'support', 'normal', 'normal', dept_a1, prj_open, 'normal', p_project_owner, p_task_owner, p_project_owner, '2026-06-01 09:00+08', '2026-06-28 18:00+08', 20, '暂停任务', '支持记录', 'paused');
  PERFORM seed_e2e_task('TASK_ACCEPTANCE', '待验收科研任务', 'research', 'normal', 'urgent', dept_a1, prj_open, 'normal', p_project_owner, p_task_owner, p_project_owner, '2026-06-01 09:00+08', '2026-06-15 18:00+08', 40, '待验收', '最终报告', 'pending_acceptance');
  PERFORM seed_e2e_task('TASK_DONE', '已完成报告任务', 'report', 'normal', 'normal', dept_a1, prj_archive, 'normal', p_project_owner, p_task_owner, p_project_owner, '2026-05-01 09:00+08', '2026-05-20 18:00+08', 20, '已完成', '报告归档', 'completed');
  PERFORM seed_e2e_task('TASK_ARCHIVED', '已归档报告任务', 'report', 'normal', 'normal', dept_a1, prj_archive, 'normal', p_project_owner, p_task_owner, p_project_owner, '2026-04-01 09:00+08', '2026-04-20 18:00+08', 20, '已归档', '归档材料', 'archived');
  PERFORM seed_e2e_task('TASK_LEAVE', '休假占用任务', 'leave', 'normal', 'normal', dept_a1, NULL, 'normal', p_leave, p_leave, p_dept_lead, '2026-06-18 00:00+08', '2026-06-20 23:59+08', 24, '休假', '休假记录', 'in_progress');
  PERFORM seed_e2e_task('TASK_TRAVEL', '出差占用任务', 'travel', 'normal', 'normal', dept_a1, NULL, 'normal', p_travel, p_travel, p_dept_lead, '2026-06-18 00:00+08', '2026-06-21 23:59+08', 24, '出差', '出差记录', 'in_progress');
  PERFORM seed_e2e_task('TASK_BACKFILL', '后补填报任务', 'backfill', 'normal', 'normal', dept_a1, prj_open, 'normal', p_task_owner, p_task_owner, p_project_owner, '2026-06-12 09:00+08', '2026-06-13 18:00+08', 8, '后补填报', '补录说明', 'pending_confirm');
  PERFORM seed_e2e_task('TASK_HIDDEN', '隐藏项目任务', 'research', 'secret', 'high', dept_a1, prj_hidden, 'hidden', p_project_owner, p_hidden_allowed, p_project_owner, '2026-06-18 09:00+08', '2026-07-18 18:00+08', 80, '隐藏项目任务', '保密报告', 'in_progress');

  SELECT id INTO task_running FROM tasks WHERE task_no = 'TASK_RUNNING';
  SELECT id INTO task_acceptance FROM tasks WHERE task_no = 'TASK_ACCEPTANCE';
  SELECT id INTO task_coordination FROM tasks WHERE task_no = 'TASK_COORDINATION';
  SELECT id INTO task_hidden FROM tasks WHERE task_no = 'TASK_HIDDEN';
  SELECT id INTO task_leave FROM tasks WHERE task_no = 'TASK_LEAVE';
  SELECT id INTO task_travel FROM tasks WHERE task_no = 'TASK_TRAVEL';

  INSERT INTO task_members(task_id, person_id, member_role, work_content, estimated_total_hours, daily_commitment_type, daily_commitment_hours, start_date, due_date, approval_status, payload)
  VALUES
    (task_running, p_task_owner, 'owner', '统筹推进', 40, 'hours', 4, '2026-06-10', '2026-06-30', 'approved', '{"e2e_seed":true}'),
    (task_running, p_employee, 'member', '数据分析', 40, 'hours', 4, '2026-06-10', '2026-06-30', 'approved', '{"e2e_seed":true}'),
    (task_acceptance, p_employee, 'member', '整理最终报告', 20, 'hours', 4, '2026-06-01', '2026-06-15', 'approved', '{"e2e_seed":true}'),
    (task_coordination, p_employee_a2, 'member', '跨部门支持', 20, 'hours', 4, '2026-06-19', '2026-06-26', 'pending', '{"e2e_seed":true}'),
    (task_hidden, p_hidden_allowed, 'member', '保密分析', 40, 'hours', 4, '2026-06-18', '2026-07-18', 'approved', '{"e2e_seed":true}')
  ON CONFLICT (task_id, person_id, member_role) DO UPDATE SET work_content = EXCLUDED.work_content, approval_status = EXCLUDED.approval_status, payload = EXCLUDED.payload;

  INSERT INTO task_assignments(task_id, title, owner_id, collaborator_ids, start_date, due_date, estimated_total_hours, daily_commitment_type, daily_commitment_hours, progress, status, acceptor_id, payload)
  VALUES
    (task_running, '阶段报告 v1', p_employee, ARRAY[p_task_owner], '2026-06-10', '2026-06-30', 40, 'hours', 4, 60, 'in_progress', p_project_owner, '{"e2e_seed":true}'),
    (task_acceptance, '最终报告', p_employee, ARRAY[p_task_owner], '2026-06-01', '2026-06-15', 20, 'hours', 4, 100, 'submitted', p_project_owner, '{"e2e_seed":true}'),
    (task_leave, '休假全天占用', p_leave, ARRAY[]::uuid[], '2026-06-18', '2026-06-20', 24, 'full_day', 8, 100, 'in_progress', p_dept_lead, '{"e2e_seed":true}'),
    (task_travel, '出差全天占用', p_travel, ARRAY[]::uuid[], '2026-06-18', '2026-06-21', 24, 'full_day', 8, 100, 'in_progress', p_dept_lead, '{"e2e_seed":true}');

  INSERT INTO approval_tickets(task_id, ticket_type, target_person_ids, target_org_id, status, current_step, payload, created_by)
  VALUES (task_coordination, 'cross_department_dispatch', ARRAY[p_employee_a2], dept_a2, 'pending', 1, '{"e2e_seed":true,"reason":"跨部门派发"}', p_dept_lead)
  RETURNING id INTO task_coordination;
  INSERT INTO approval_steps(ticket_id, step_order, approver_id, approver_source, payload)
  VALUES (task_coordination, 1, p_dept_lead_a2, 'target_org.default_approver', '{"e2e_seed":true}');

  INSERT INTO conflict_records(conflict_type, risk_level, person_id, task_id, conflict_date_start, conflict_date_end, overload_hours, status, payload)
  VALUES
    ('overload', 'high', p_employee, task_running, '2026-06-18', '2026-06-18', 4, 'open', '{"e2e_seed":true,"suggestion":"降低投入或调整日期"}'),
    ('all_day_overlap', 'high', p_leave, task_leave, '2026-06-18', '2026-06-20', 8, 'open', '{"e2e_seed":true,"suggestion":"避开休假"}'),
    ('unavailable', 'medium', p_travel, task_travel, '2026-06-18', '2026-06-21', 0, 'open', '{"e2e_seed":true,"suggestion":"改派人员"}');

  INSERT INTO resource_files(name, resource_type, uploader_id, visibility, status, is_stage_result, is_final_result, payload)
  VALUES ('阶段报告 v1', 'stage_report', p_employee, 'normal', 'submitted', true, false, '{"e2e_seed":true}')
  RETURNING id INTO res_stage;
  INSERT INTO resource_versions(resource_id, version_no, object_key, file_size, content_type, sha256, payload)
  VALUES (res_stage, 1, 'e2e/stage-report-v1.txt', 128, 'text/plain', 'e2e-stage', '{"e2e_seed":true}')
  RETURNING id INTO res_stage_v;
  UPDATE resource_files SET current_version_id = res_stage_v WHERE id = res_stage;

  INSERT INTO resource_files(name, resource_type, uploader_id, visibility, status, is_stage_result, is_final_result, payload)
  VALUES ('最终报告', 'final_report', p_employee, 'normal', 'submitted', false, true, '{"e2e_seed":true}')
  RETURNING id INTO res_final;
  INSERT INTO resource_versions(resource_id, version_no, object_key, file_size, content_type, sha256, payload)
  VALUES (res_final, 1, 'e2e/final-report.txt', 256, 'text/plain', 'e2e-final', '{"e2e_seed":true}')
  RETURNING id INTO res_final_v;
  UPDATE resource_files SET current_version_id = res_final_v WHERE id = res_final;

  INSERT INTO resource_links(resource_id, object_type, object_id)
  VALUES (res_stage, 'task', task_running), (res_final, 'task', task_acceptance)
  ON CONFLICT DO NOTHING;
  INSERT INTO resource_requirements(object_type, object_id, resource_type, required, payload)
  VALUES
    ('task', task_acceptance, 'final_report', true, '{"e2e_seed":true}'),
    ('task', task_running, 'stage_report', true, '{"e2e_seed":true}')
  ON CONFLICT DO NOTHING;

  INSERT INTO todo_items(todo_type, title, target_type, target_id, assignee_id, status, action_url, payload)
  VALUES
    ('approval', '跨部门协调待审批', 'approval', task_coordination, p_dept_lead_a2, 'open', '/approvals/' || task_coordination::text, '{"e2e_seed":true}'),
    ('progress', '进行中任务需更新进度', 'task', task_running, p_employee, 'open', '/tasks/' || task_running::text, '{"e2e_seed":true}'),
    ('acceptance', '待验收任务需处理', 'task', task_acceptance, p_project_owner, 'open', '/tasks/' || task_acceptance::text, '{"e2e_seed":true}');

  INSERT INTO notifications(title, content, receiver_id, channel, read_at, payload)
  VALUES
    ('系统通知', 'E2E 系统通知', p_employee, 'in_app', NULL, '{"e2e_seed":true}'),
    ('风险通知', 'E2E 风险通知已读', p_project_owner, 'in_app', now(), '{"e2e_seed":true}');

  INSERT INTO report_snapshots(report_type, scope_type, scope_id, period_start, period_end, payload)
  VALUES
    ('task_overview', 'org', dept_a1, '2026-06-01', '2026-06-30', '{"e2e_seed":true,"metrics":{"total":12,"completed":2,"risk":3}}'),
    ('workload', 'org', dept_a1, '2026-06-01', '2026-06-30', '{"e2e_seed":true,"metrics":{"avg_load":0.76,"overloaded":1}}');

  INSERT INTO tool_entries(name, category, entry_type, entry_url, enabled, icon, description, payload)
  VALUES ('E2E 智能报告助手', 'agent', 'external', 'https://example.com/e2e-report', true, 'file-text', '用于验证工具台上下文和使用记录', '{"e2e_seed":true}')
  ON CONFLICT DO NOTHING;

  INSERT INTO config_versions(namespace, version_no, status, payload, created_by, published_by, published_at)
  VALUES
    ('task_template', 9001, 'published', '{"e2e_seed":true,"templates":[{"type":"research","required_resources":["stage_report","final_report"]}]}', p_sa, p_sa, now()),
    ('approval_rule', 9001, 'published', '{"e2e_seed":true,"rules":[{"type":"cross_department","approver":"target_org.default_approver"}]}', p_sa, p_sa, now()),
    ('alert_rule', 9001, 'draft', '{"e2e_seed":true,"rules":[{"type":"overload","threshold":1.0}]}', p_sa, NULL, NULL),
    ('role_entry', 9001, 'published', '{"e2e_seed":true,"entries":{"sa":"/admin","employee":"/"}}', p_sa, p_sa, now())
  ON CONFLICT (namespace, version_no) DO UPDATE SET status = EXCLUDED.status, payload = EXCLUDED.payload, published_by = EXCLUDED.published_by, published_at = EXCLUDED.published_at;

  INSERT INTO role_entry_configs(role_id, default_home, layout, quick_actions, todo_types)
  VALUES
    (role_sa, '/admin', '{"e2e_seed":true}', '[]'::jsonb, ARRAY['approval','progress','acceptance']),
    (role_admin, '/admin', '{"e2e_seed":true}', '[]'::jsonb, ARRAY['approval']),
    (role_employee, '/', '{"e2e_seed":true}', '[]'::jsonb, ARRAY['progress'])
  ON CONFLICT DO NOTHING;

  INSERT INTO invitation_templates(name, invite_type, default_org_id, default_role_ids, default_project_id, default_project_role, need_approval, required_fields, expires_in_days, max_uses, status, payload, created_by)
  VALUES ('E2E 员工邀请模板', 'user', dept_a1, ARRAY[role_employee], prj_open, 'member', true, '["name","login_name","password","email","phone"]'::jsonb, 30, 20, 'enabled', '{"e2e_seed":true}', p_sa)
  RETURNING id INTO tpl_id;

  INSERT INTO audit_logs(actor_id, object_type, object_id, action, after_payload, reason)
  VALUES (p_sa, 'e2e_seed', NULL, 'e2e.seed.applied', '{"e2e_seed":true}', 'E2E baseline seed applied');
END $$;
