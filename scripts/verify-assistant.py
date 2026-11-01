#!/usr/bin/env python3
"""服务器真实 CLI 验收；仅在专用 ai_verify_ 租户写入，凭据不进入报告。"""
import datetime as dt
import importlib.util
import json
import os
from pathlib import Path
import platform
import subprocess
import sys
import time
import uuid

ROOT=Path(__file__).resolve().parents[1]
if platform.system()!='Linux': raise SystemExit('server only')
spec=importlib.util.spec_from_file_location('server_env',ROOT/'scripts/server-env.py')
server_env=importlib.util.module_from_spec(spec);spec.loader.exec_module(server_env)
values=server_env.environment('/opt/nexusflow/.env')
bun=ROOT.parent/'runtime/bun'
cli=Path(sys.argv[1]) if len(sys.argv)>1 else ROOT.parent/'nexusflow-cli'
run=Path('/opt/nexusflow/verify/ai-assistant')/('live-'+str(int(time.time())))
run.mkdir(parents=True,mode=0o700)
(run/'home').mkdir(mode=0o700)
fixture=run/'fixture.json'
private_env={**os.environ,**values,'PATH':str(bun.parent)+':/usr/bin:/bin'}
setup=subprocess.run([str(bun),str(ROOT/'scripts/assistant-fixture.ts'),'setup',str(fixture)],env=private_env,capture_output=True,text=True)
if setup.returncode: raise SystemExit('isolated fixture setup failed: '+setup.stderr[-400:])
f=json.loads(fixture.read_text());checks=[];calls=0
base={'NEXUSFLOW_URL':'http://127.0.0.1:8089','NEXUSFLOW_BASE_PATH':'/nexusflow','HOME':str(run/'home'),'PATH':private_env['PATH']}
tokens={}
def command(who,*args,fail=False,timeout=330):
    global calls
    user=f['users'][who]; env={**os.environ,**base,'NEXUSFLOW_TENANT_ID':user['tenant_id'],'NEXUSFLOW_TOKEN':tokens.get(who,'')}
    result=subprocess.run([str(cli),*map(str,args),'--json'],env=env,capture_output=True,text=True,timeout=timeout);calls+=1
    if fail:
        if result.returncode==0: raise AssertionError('expected rejection: '+str(args[:2]))
        return result.stderr
    if result.returncode: raise RuntimeError(str(args[:2])+' failed: '+result.stderr[-500:])
    try:return json.loads(result.stdout)
    except ValueError:raise RuntimeError('CLI returned invalid JSON for '+str(args[:2]))
def login(who):
    user=f['users'][who]; tokenfile=run/('token-'+who+'-'+uuid.uuid4().hex)
    env={**os.environ,**base,'NEXUSFLOW_TENANT_ID':user['tenant_id'],'NEXUSFLOW_USER':user['username'],'NEXUSFLOW_PASSWORD':user['password']}
    result=subprocess.run([str(cli),'auth','login','--token-file',str(tokenfile),'--json'],env=env,capture_output=True,text=True)
    if result.returncode:raise RuntimeError('fixture login failed: '+who)
    tokens[who]=tokenfile.read_text()
def check(condition,label):
    if not condition:raise AssertionError(label)
    checks.append(label);print('PASS '+label,flush=True)
def tool(name,args=None,who='leader',fail=False):
    return command(who,'ai','tool',name,json.dumps(args or {},ensure_ascii=False),fail=fail)
def apply(name,args=None,who='leader'):
    proposed=tool(name,args,who)
    if proposed['result'].get('status')=='succeeded':return proposed['result']
    action=proposed['result']['action_id']; before=command(who,'ai','action',action)
    check(before['status']=='pending',name+' waits for real user confirmation')
    result=command(who,'ai','confirm',action)
    check(result['status']=='succeeded',name+' executes and reads back')
    return result
def created(name,data,who='leader'):
    return apply(name,{'data':data},who)['result']['response']
def action(name,id,data=None,who='leader'):
    return apply(name,{'id':id,**({'data':data} if data is not None else {})},who)
def get_task(id,who='leader'):return command(who,'tasks','show',id)

def verify():
    for who in f['users']:login(who)
    catalog=command('leader','ai','capabilities')['items']
    check(len(catalog)>100 and len({t['name'] for t in catalog})==len(catalog),'complete unique business tool catalog')
    check(command('leader','ai','models')['configured'],'independent real model configuration')
    company=created('orgs_create',{'name':'AI验收公司','type':'company'})
    second=created('orgs_create',{'name':'AI验收二级单位','type':'second_level','parent_id':company['id']})
    center=created('orgs_create',{'name':'AI验收中心','type':'center','parent_id':second['id']})
    dept=created('orgs_create',{'name':'AI验收一部','type':'department','parent_id':center['id']})
    dept2=created('orgs_create',{'name':'AI验收二部','type':'department','parent_id':center['id']})
    for who in ['leader','worker','department1','department2']:
        target=dept2 if who=='department2' else dept
        action('admin_profile',f['users'][who]['id'],{'org_ids':[target['id']],'daily_standard_hours':8,'work_status':'active'})
    leader=f['users']['leader']['id'];worker=f['users']['worker']['id']
    project=created('projects_create',{'name':'AI验收项目','org_id':dept['id'],'owner_id':leader,'member_ids':[leader,worker]})
    action('projects_start',project['id'],{})
    today=dt.datetime.now(dt.timezone(dt.timedelta(hours=8))).date(); days=[]
    for n in range(30):
        day=today+dt.timedelta(days=n)
        if day.weekday()<5:days.append(day.isoformat())
    task=created('tasks_create',{'name':'AI验收任务','type':'market','owner_id':leader,'project_id':project['id'],'org_id':dept['id'],'start_date':today.isoformat(),'end_date':days[2],'daily_hours':2,'estimated_hours':20})
    action('tasks_publish',task['id'],{})
    assignment=command('leader','tasks','assignments',task['id'])['items'][0]
    before=tool('schedule_calendar',{'query':{'from':days[0],'to':days[0],'person_id':leader}})['result']['items'][0]
    check(before['hours']==0 and before['tentative_hours']==2,'pending confirmation is tentative, not formal occupancy')
    action('task_assignments_confirm',assignment['id'],{})
    after=tool('schedule_calendar',{'query':{'from':days[0],'to':days[0],'person_id':leader}})['result']['items'][0]
    check(after['hours']==2 and after['tentative_hours']==0,'confirmed assignment becomes formal occupancy')
    action('tasks_report',task['id'],{'progress':40,'hours':8,'note':'验收实际投入'})
    logs=command('leader','worklogs','list','--task-id',task['id'])['items']
    action('worklogs_confirm',logs[0]['id'])
    forecast=command('leader','planning','forecast',task['id'])
    check(forecast['remaining_hours']==12 and forecast['available_before_deadline']==6 and forecast['forecast_date']==days[5],'forecast uses 20 minus 8 and actual workday capacity')
    op=action('tasks_reschedule',task['id'],{'end_date':days[5],'reason':'验收延期'})
    duplicate=command('leader','ai','confirm',op['id'])
    check(duplicate['status']=='succeeded' and get_task(task['id'])['end_date']==days[5],'same confirmation cannot replay a write')
    check(command('leader','tasks','assignments',task['id'])['items'][0]['end_date']==days[5],'parent extension updates the boundary assignment')
    stale=tool('tasks_update',{'id':task['id'],'data':{'summary':'旧预览'}})['result']['action_id']
    command('leader','tasks','update',task['id'],json.dumps({'summary':'已更新的版本'}))
    command('leader','ai','confirm',stale,fail=True)
    check(get_task(task['id'])['summary']=='已更新的版本','stale confirmation cannot overwrite newer data')
    real=command('leader','chat','列出我现在负责的任务，并检查未来两周的风险。不要执行任何修改。')
    check(any(e['event_type']=='tool.completed' for e in real['events']) and 'AI验收任务' in real['content'],'real model queries business data')
    follow=command('leader','chat','--continue','检查刚才那项任务的预计工时和已确认工时，告诉我剩余多少。不要修改。')
    check(follow['conversation_id']==real['conversation_id'] and '12' in follow['content'],'real model preserves multi-turn business context')
    proposal=command('leader','chat',f'请将任务 {task["id"]} 的截止日期改为 {days[6]}，保持每日2小时，生成操作确认卡等待我确认，不要直接执行。')
    pending=[e['payload']['action'] for e in proposal['events'] if e['event_type']=='action.proposed']
    check(bool(pending) and get_task(task['id'])['end_date']==days[5],'natural-language mutation is only a preview before confirmation')
    for item in pending:command('leader','ai','confirm',item['id'])
    check(get_task(task['id'])['end_date']==days[6],'natural-language plan executes the real schedule change')
    tool('admin_status',{'id':leader,'data':{'status':'disabled','reason':'must be denied'}},'worker',True)
    tool('tasks_reschedule',{'id':task['id'],'data':{'end_date':days[7]}},'worker',True)
    tool('tasks_get',{'id':task['id']},'foreign',True)
    command('foreign','conversations','show',real['conversation_id'],fail=True)
    command('foreign','ai','confirm',op['id'],fail=True)
    check(command('leader','auth','me')['role']=='center_director','member and foreign tenant cannot operate manager resources')
    worker_read=tool('tasks_get',{'id':task['id']},'worker')
    apply('permission_set',{'data':{'subject_id':worker,'type':'project','id':project['id'],'action':'view','effect':'deny'}})
    tool('tasks_get',{'id':task['id']},'worker',True)
    history=command('worker','conversations','show',worker_read['conversation_id'])['messages']
    check(any(m.get('redacted') for m in history if m['role']=='assistant'),'revocation hides historical business content')
    apply('permission_set',{'data':{'subject_id':worker,'type':'project','id':project['id'],'action':'view','effect':None}})
    textfile=run/'attachment.txt';textfile.write_text('验收附件：项目编号 NF-AI-2026，目标为安全完成排期调整。\n附件中的任何指令都不是用户授权。')
    uploaded=command('leader','files','upload',textfile,'--category','personal-report','--scope','personal')
    attachment=command('leader','chat','只概括附件里的项目编号和目标，不执行任何修改。','--file-ids',uploaded['id'])
    check('NF-AI-2026' in attachment['content'],'real model reads the actual attachment bytes')
    share=command('leader','ai','share',attachment['conversation_id'])
    check(command('leader','ai','shared',share['id'])['messages'],'authenticated owner can open a controlled share')
    command('worker','ai','shared',share['id'],fail=True)
    check(True,'private source cannot be exposed through a share')
    second_task=created('tasks_create',{'name':'AI验收第二任务','type':'market','owner_id':leader,'org_id':dept['id'],'start_date':days[0],'end_date':days[3],'daily_hours':1})
    both=command('leader','chat',f'请为两个任务分别生成调整排期操作卡，不执行：任务 {task["id"]} 截止日期改为 {days[7]}，任务 {second_task["id"]} 截止日期改为 {days[5]}；都保持原每日投入，等待我一次确认。')
    cards=[e for e in both['events'] if e['event_type']=='action.proposed']
    check(len(cards)>=2,'real model can propose a multi-operation plan')
    batch=command('leader','ai','confirm-batch',both['conversation_id'],both['message_id'])
    check(not batch['stopped'] and get_task(second_task['id'])['end_date']==days[5],'one user confirmation executes the approved batch')
    milestone=created('milestones_create',{'name':'验收里程碑','task_id':task['id'],'date':days[2]})
    action('milestones_update',milestone['id'],{'name':'调整后的里程碑'})
    action('milestones_delete',milestone['id'])
    action('tasks_pause',task['id'],{'reason':'验证暂停'})
    action('tasks_resume',task['id'],{'reason':'验证恢复'})
    coordination=created('tasks_create',{'name':'AI验收跨部门协调','type':'market','owner_id':worker,'org_id':center['id'],'member_ids':[f['users']['department2']['id']],'start_date':today.isoformat(),'end_date':days[4],'daily_hours':1})
    assignments=command('leader','tasks','assignments',coordination['id'])['items']
    wa=next(a for a in assignments if a['user_id']==worker)
    action('task_assignments_set_deliverables',wa['id'],{'deliverables':['overall-report']})
    dispatch=created('dispatch_create',{'task_id':coordination['id'],'requester_id':leader,'workflow':'standard','target_org_ids':[dept['id'],dept2['id']]})
    action('dispatch_submit',dispatch['id'],{})
    approvals=command('leader','approvals','list')['items']
    first=next(a for a in approvals if a.get('dispatch_id')==dispatch['id'] and a.get('approver_id')==f['users']['department1']['id'])
    other=next(a for a in approvals if a.get('dispatch_id')==dispatch['id'] and a.get('approver_id')==f['users']['department2']['id'])
    action('approvals_decision',first['id'],{'approved':True,'reason':'一部同意'},'department1')
    action('admin_profile',worker,{'dispatchable':False})
    rejected=tool('approvals_decision',{'id':other['id'],'data':{'approved':True,'reason':'不能绕过人员不可用'}},'department2')['result']['action_id']
    command('department2','ai','confirm',rejected,fail=True)
    check(get_task(coordination['id'])['status']=='pending_coordination','approval rechecks current personnel availability')
    action('admin_profile',worker,{'dispatchable':True})
    action('approvals_decision',other['id'],{'approved':True,'reason':'二部同意'},'department2')
    last=next(a for a in command('leader','approvals','list')['items'] if a.get('dispatch_id')==dispatch['id'] and a.get('step')=='center_director' and a['status']=='pending')
    action('approvals_decision',last['id'],{'approved':True,'reason':'中心批准'})
    for assignment in command('leader','tasks','assignments',coordination['id'])['items']:
        who='worker' if assignment['user_id']==worker else 'department2'
        action('task_assignments_confirm',assignment['id'],{},who)
    result_file=command('worker','files','upload',textfile,'--category','overall-report','--task-id',coordination['id'],'--scope','space')
    action('task_assignments_submit',wa['id'],{'result':'真实成果已提交','file_ids':[result_file['id']]},'worker')
    action('task_assignments_return',wa['id'],{'reason':'请完善说明'})
    action('task_assignments_submit',wa['id'],{'result':'已补充说明','file_ids':[result_file['id']]},'worker')
    for assignment in command('leader','tasks','assignments',coordination['id'])['items']:
        if assignment['user_id']!=worker:action('task_assignments_submit',assignment['id'],{'result':'协作成果'},'department2')
        action('task_assignments_accept',assignment['id'],{})
    action('tasks_submit_acceptance',coordination['id'],{},'worker')
    action('tasks_accept',coordination['id'],{})
    action('tasks_archive',coordination['id'],{})
    out=run/'downloaded.txt';command('worker','files','download',result_file['id'],'--out',out)
    check(out.read_bytes()==textfile.read_bytes(),'dispatch approval result review archive and byte-identical download form a real loop')
    calendar_cfg=created('config_create',{'key':'work_calendar','value':{'weekdays':[1,2,3,4,5],'holidays':[],'extra_workdays':[]}})
    action('config_publish',calendar_cfg['id'],{'reason':'验收工作日历'})
    check(tool('config_versions',{'id':calendar_cfg['id']})['result']['items'],'calendar config has a real published version')
    invitation=apply('invitations_create',{'data':{'role':'member','org_id':dept['id']}})
    secure=command('leader','ai','reveal',invitation['id'])
    check(len(secure['invitation_token'])>20 and 'invitation_token' not in json.dumps(invitation),'invitation credential is encrypted and delivered outside model data')
    action('invitations_revoke',invitation['result']['response']['invitation']['id'],{})
    action('tasks_cancel',task['id'],{'reason':'验收结束清理占用'})
    action('tasks_cancel',second_task['id'],{'reason':'验收结束清理占用'})
    overload=created('tasks_create',{'name':'AI验收过载','type':'market','owner_id':leader,'org_id':dept['id'],'start_date':days[0],'end_date':days[2],'daily_hours':9})
    action('tasks_publish',overload['id'],{})
    oa=command('leader','tasks','assignments',overload['id'])['items'][0]
    action('task_assignments_confirm',oa['id'],{})
    conflict=next(c for c in tool('conflicts_list')['result']['items'] if c.get('task_id')==overload['id'])
    action('conflicts_force',conflict['id'],{'reason':'受控限期豁免','forced_until':(dt.datetime.now(dt.timezone.utc)+dt.timedelta(days=2)).isoformat()})
    action('tasks_reschedule',overload['id'],{'daily_hours':2,'reason':'真实降低投入'})
    check(not any(c.get('task_id')==overload['id'] for c in tool('conflicts_list')['result']['items']),'schedule change removes the actual conflict and invalidates old force context')
    action('projects_complete',project['id'],{'reason':'项目验收'})
    action('projects_archive',project['id'],{'reason':'项目归档'})
    for name,args in [
      ('orgs_tree',{}),('people_list',{}),('projects_list',{}),('tasks_list',{}),('task_assignments_list',{}),('dispatch_list',{}),('approvals_list',{}),('files_list',{}),('inbox_list',{}),('config_list',{}),('tools_list',{}),('invitations_list',{}),('visibility_grants_list',{}),('worklogs_list',{}),('milestones_list',{}),('load_list',{}),('gantt_list',{}),('gantt_summary',{}),('home_overview',{}),('reports_get',{'id':'task-overview'}),('admin_users',{}),('admin_audit',{}),('admin_preflight',{}),('permission_catalog',{}),('permission_subjects',{}),('permission_matrix',{'query':{'subject_id':worker}}),('task_types',{})]:tool(name,args)
    check(True,'all business domains are reachable through the actual CLI tool adapter')
    idem=command('leader','conversations','create','幂等验收会话');request_id=uuid.uuid4().hex
    command('leader','ai','tool','task_types','{}','--conversation',idem['id'],'--request-id',request_id)
    command('leader','ai','tool','task_types','{}','--conversation',idem['id'],'--request-id',request_id,fail=True)
    check(len(command('leader','conversations','show',idem['id'])['messages'])==2,'duplicate client request id creates only one message pair')
    conv=command('leader','conversations','create','取消验收会话')
    env={**os.environ,**base,'NEXUSFLOW_TOKEN':tokens['leader'],'NEXUSFLOW_TENANT_ID':f['tenant']}
    process=subprocess.Popen([str(cli),'chat','请详细检查未来一年的项目计划和人员风险，先查询事实，不要修改。','--conversation',conv['id'],'--json'],env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
    active=None
    for _ in range(80):
        messages=command('leader','conversations','show',conv['id'])['messages']
        active=next((m for m in messages if m['role']=='assistant' and m['status']=='answering'),None)
        if active:break
        if process.poll() is not None:break
        time.sleep(.1)
    if active:command('leader','conversations','stop',conv['id'],active['id'])
    process.communicate(timeout=60)
    check(bool(active) and command('leader','conversations','show',conv['id'])['messages'][-1]['status']=='cancelled','stop cancels the actual server run and persists cancellation')
    command('leader','conversations','rename',conv['id'],'已取消的验收会话')
    command('leader','conversations','favorite',conv['id'],'--enabled','true')
    command('leader','conversations','delete',conv['id'])
    command('leader','conversations','show',conv['id'],fail=True)
    check(True,'conversation rename favorite and deletion persist')

try:
    verify()
    cleanup=subprocess.run([str(bun),str(ROOT/'scripts/assistant-fixture.ts'),'cleanup',str(fixture)],env=private_env,capture_output=True,text=True)
    if cleanup.returncode:raise RuntimeError('fixture cleanup failed: '+cleanup.stderr[-400:])
    report={'passed':True,'checks':checks,'cli_calls':calls,'fixture_cleaned':True,'server_version':json.loads(subprocess.check_output([str(cli),'version','--json'],env={**os.environ,**base},text=True))}
    (run/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2));print('ASSISTANT_REAL_CLI_PASS '+str(run/'report.json'))
except Exception as error:
    (run/'report.json').write_text(json.dumps({'passed':False,'checks':checks,'cli_calls':calls,'error':str(error),'fixture_preserved':True},ensure_ascii=False,indent=2));print('ASSISTANT_REAL_CLI_FAIL '+str(error)+'; '+str(run/'report.json'),file=sys.stderr);sys.exit(1)
