#!/usr/bin/env python3
"""Minimal server-only checks; no service, DB, release or credential access."""
import importlib.util,pathlib,subprocess,tempfile,shutil,socket,threading,time,os,tarfile,io
root=pathlib.Path(__file__).resolve().parents[2]
checks=(root/'scripts/server-checks.sh').read_text()
assert 'exec env -i ' in checks and 'for app in apps/api cli; do' in checks
assert 'for test_file in tests/*.test.ts; do bun test "$test_file"; done' in checks
assert '&& bun test)' not in checks
makefile=(root/'Makefile').read_text()
assert 'deploy-build' not in makefile and './scripts/build-linux.sh' not in makefile
assert 'deploy:\n\t./scripts/deploy.sh' in makefile
build=(root/'scripts/build-linux.sh').read_text()
assert 'export COPYFILE_DISABLE=1' in build and 'TAR_FLAGS=(--no-xattrs)' in build
assert 'if [[ $(uname -s) == Darwin ]]; then TAR_FLAGS+=(--disable-copyfile --no-acls --no-fflags); fi' in build
assert 'git -C "$ROOT" archive --format=tar "$COMMIT" | gzip > "$OUT/source.tar.gz"' in build
assert 'tar "${TAR_FLAGS[@]}" -czf "$OUT/dependencies.tar.gz"' in build
assert not any('2>/dev/null' in line for line in build.splitlines() if 'tar ' in line)
assert sum(line.startswith('scp -C ') for line in (root/'scripts/deploy.sh').read_text().splitlines())==2
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
    assert prefix[0]=='docker' and 'PGPASSWORD' in prefix and '-i' in interactive
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
    # Native GNU tar + Git archive preserve files/links/execute bits, not host xattrs.
    payload=repo/'payload'; payload.write_bytes(b'#!/bin/sh\nexit 0\n'); payload.chmod(0o755)
    os.setxattr(str(payload),b'user.com.apple.provenance',b'synthetic-host-metadata')
    (repo/'link').symlink_to('payload')
    git('add','payload','link')
    git('-c','user.name=B0 packaging check','-c','user.email=b0-check@example.invalid','commit','-m','isolated archive fixture')
    source=subprocess.check_output(['git','-C',str(repo),'archive','--format=tar','HEAD'])
    dependencies=repo/'dependencies.tar.gz'
    subprocess.run(['tar','--no-xattrs','-czf',str(dependencies),'payload','link'],cwd=str(repo),env=dict(os.environ,COPYFILE_DISABLE='1'),check=True)
    for archive in (tarfile.open(fileobj=io.BytesIO(source),mode='r:'),tarfile.open(str(dependencies),'r:gz')):
        with archive:
            assert set(archive.getnames())=={'payload','link'}
            assert archive.extractfile('payload').read()==payload.read_bytes()
            assert archive.getmember('payload').mode&0o111==0o111
            assert archive.getmember('link').issym() and archive.getmember('link').linkname=='payload'
            assert not any('xattr' in key or 'acl' in key or 'fflags' in key for member in archive for key in member.pax_headers)
# Execute only the release failure function against disposable files and stubbed systemd.
text=(root/'scripts/deploy.sh').read_text()
failure=text[text.index('failed() {'):text.index('trap failed EXIT')]
with tempfile.TemporaryDirectory() as directory:
    target=pathlib.Path(directory)
    for previous_marker in (True,False):
        service=target/('with-marker' if previous_marker else 'legacy'); service.mkdir()
        backup=service/'backup'; backup.mkdir(); evidence=service/'attachment'; evidence.mkdir()
        (backup/'nexusflow').write_text('old binary')
        (service/'nexusflow').write_text('new binary')
        (service/'DEPLOYED_COMMIT').write_text('new commit')
        if previous_marker: (backup/'DEPLOYED_COMMIT').write_text('old commit')
        shell='ROOT="$1"; BACKUP="$ROOT/backup"; DIR="$ROOT/attachment"; COMMIT=synthetic; PHASE=verify; SWAPPED=1\nsudo(){ return 0; }; systemctl(){ return 0; }\n'+failure+'\nfalse; failed\n'
        subprocess.run(['bash','-c',shell,'check',str(service)],check=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
        assert (service/'nexusflow').read_text()=='old binary'
        marker=service/'DEPLOYED_COMMIT'
        assert marker.read_text()=='old commit' if previous_marker else not marker.exists()
        assert 'BINARY_RESTORED' in (evidence/'STATUS').read_text()
# Recovery may accept an offline service only when its binary matches its immutable deployed attachment.
recovery=text.split('python3 - "$BACKUP" "$RECOVERY" "$ROOT" <<\'PY\'\n',1)[1].split('\nPY',1)[0]
with tempfile.TemporaryDirectory() as directory:
    target=pathlib.Path(directory); backup=target/'backup'; backup.mkdir()
    marker='a'*40; artifact=target/'validation'/marker; artifact.mkdir(parents=True)
    (backup/'old-version.json').write_text('{"version":null}')
    (backup/'DEPLOYED_COMMIT').write_text(marker)
    (backup/'nexusflow').write_bytes(b'old binary'); (artifact/'nexusflow').write_bytes(b'old binary')
    def recovery_check(flag):
        return subprocess.run(['python3','-',str(backup),flag,str(target)],input=recovery.encode(),stdout=subprocess.PIPE,stderr=subprocess.PIPE).returncode
    assert recovery_check('1')==0 and recovery_check('0')!=0
    (artifact/'nexusflow').write_bytes(b'other binary')
    assert recovery_check('1')!=0
# Real curl against an isolated socket that accepts connections but never responds.
# Keep production timeout flags; shorten only the retry count and inter-attempt sleep.
health=text[text.index('PHASE=health\n'):text.index('PHASE=b0-verifier\n')]
assert '--connect-timeout 2 --max-time 5' in health
health=health.replace('seq 1 45','seq 1 2').replace('$attempt != 45','$attempt != 2').replace('sleep 1','sleep 0')
listener=socket.socket(); listener.bind(('127.0.0.1',0)); listener.listen(); listener.settimeout(0.2)
stop=threading.Event(); connections=[]
def accept_without_response():
    while not stop.is_set():
        try: connection,_=listener.accept(); connections.append(connection)
        except socket.timeout: pass
worker=threading.Thread(target=accept_without_response); worker.start()
try:
    with tempfile.TemporaryDirectory() as directory:
        evidence=pathlib.Path(directory); (evidence/'backup').mkdir()
        (evidence/'backup/nexusflow').write_text('old binary')
        (evidence/'nexusflow').write_text('new binary')
        shell='set -eu\nROOT="$1"; DIR="$ROOT"; BACKUP="$ROOT/backup"; PORT="$2"; COMMIT=synthetic; SWAPPED=1\nsudo(){ return 0; }; systemctl(){ return 0; }\n'+failure+'\ntrap failed EXIT\n'+health
        started=time.monotonic()
        run=subprocess.run(['bash','-c',shell,'check',directory,str(listener.getsockname()[1])],stdout=subprocess.PIPE,stderr=subprocess.PIPE,timeout=16)
        assert run.returncode!=0 and time.monotonic()-started<16
        assert len(connections)==2, 'health retry did not advance after stalled response'
        assert 'FAILED phase=health' in (evidence/'STATUS').read_text()
        assert 'BINARY_RESTORED' in (evidence/'STATUS').read_text()
        assert (evidence/'nexusflow').read_text()=='old binary'
finally:
    stop.set(); worker.join(); listener.close()
    for connection in connections: connection.close()
for script in (root/'scripts').glob('*.sh'):
    subprocess.run(['bash','-n',str(script)],check=True)
print('release checks: PASS (environment parsing, container backup identity, GET guard, clean-main guards, binary+commit rollback, stalled-health timeout/retry/failure status, per-file test contract, deploy-only build entry, native metadata-free archive contract/content/mode/symlink, scp compression contract, shell syntax)')
