#!/usr/bin/env python3
"""Minimal server-only checks; no service, DB, release or credential access."""
import importlib.util,pathlib,subprocess,tempfile,shutil
root=pathlib.Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('server_env',root/'scripts/server-env.py')
module=importlib.util.module_from_spec(spec); spec.loader.exec_module(module)
with tempfile.TemporaryDirectory() as directory:
    path=pathlib.Path(directory)/'environment'
    path.write_text('DATABASE_URL="postgres://test:synthetic%23pass@localhost:5432/test?sslmode=disable"\nSUPER_ADMIN_PASSWORD="synthetic $ # value"\n')
    values=module.environment(path)
    assert values['SUPER_ADMIN_PASSWORD']=='synthetic $ # value'
    env=module.pg_environment(values)
    assert env['PGPASSWORD']=='synthetic#pass' and env['PGDATABASE']=='test'
    assert not any('synthetic' in key for key in env)
    src=pathlib.Path(directory)/'apps/api/src'; src.mkdir(parents=True)
    source=src/'legacy.ts'
    source.write_text('async function applyForceOverrides(){await sql`UPDATE nexusflow.records`; }\n')
    check=['python3',str(root/'scripts/check-read-safety.py'),directory]
    assert subprocess.run(check,stdout=subprocess.PIPE,stderr=subprocess.PIPE).returncode!=0
    source.write_text('async function applyForceOverrides(){return issues;}\n')
    assert subprocess.run(check,stdout=subprocess.PIPE,stderr=subprocess.PIPE).returncode==0
# PG13 host tools must switch to the identity-checked deployed PG16 container.
original_output=module.subprocess.check_output
original_pg=module.pg
module.subprocess.check_output=lambda *a,**k:'pg_dump (PostgreSQL) 13.23'
identity_match=[True]
calls=[]
def fake_pg(env,args,*a,**k):
    calls.append(args)
    assert not any('synthetic' in part for part in args)
    if 'SHOW server_version_num' in args: return b'160009\n'
    if '--version' in args: return b'pg_dump (PostgreSQL) 16.9\n'
    return b'cluster-one\n' if args[0]=='psql' or identity_match[0] else b'cluster-two\n'
module.pg=fake_pg
try:
    env,prefix,interactive=module.backup_tools(values)
    assert prefix[0]=='podman' and 'PGPASSWORD' in prefix and '-i' in interactive
    identity_match[0]=False
    try: module.backup_tools(values)
    except RuntimeError: pass
    else: raise AssertionError('wrong backup cluster accepted')
finally:
    module.pg=original_pg; module.subprocess.check_output=original_output
# Release guards reject feature worktrees and uncommitted files before remote access.
with tempfile.TemporaryDirectory() as directory:
    repo=pathlib.Path(directory); (repo/'scripts').mkdir()
    shutil.copy(str(root/'scripts/require-main.sh'),str(repo/'scripts/require-main.sh'))
    def git(*args):
        subprocess.run(['git','-C',str(repo)]+list(args),check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
    git('init'); git('checkout','-b','worker')
    guard=['bash',str(repo/'scripts/require-main.sh')]
    assert b'deploy only from main' in subprocess.run(guard,stderr=subprocess.PIPE,stdout=subprocess.PIPE).stderr
    git('checkout','-b','main')
    assert b'worktree is not clean' in subprocess.run(guard,stderr=subprocess.PIPE,stdout=subprocess.PIPE).stderr
for script in (root/'scripts').glob('*.sh'):
    subprocess.run(['bash','-n',str(script)],check=True)
print('release checks: PASS (environment parsing, container backup identity, GET guard, clean-main guards, shell syntax)')
