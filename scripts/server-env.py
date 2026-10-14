#!/usr/bin/env python3
"""Load systemd EnvironmentFile privately; run only an explicit server operation."""
import json,os,pathlib,shlex,subprocess,sys,urllib.parse

def environment(path):
    result={}
    for raw in pathlib.Path(path).read_text().splitlines():
        line=raw.strip()
        if not line or line.startswith(('#',';')): continue
        key,sep,value=line.partition('=')
        if not sep or not key.strip().replace('_','a').isalnum(): raise ValueError('unsupported environment format')
        # No shell expansion or command execution. Preserve unquoted #, $ and spaces.
        value=value.strip()
        if value.startswith(('"',"'")):
            parts=shlex.split(value,comments=False)
            if len(parts)!=1: raise ValueError('unsupported quoted environment value')
            value=parts[0]
        result[key.strip()]=value
    return result

def pg_environment(values):
    url=urllib.parse.urlsplit(values.get('DATABASE_URL',''))
    if url.scheme not in ('postgres','postgresql') or not url.hostname: raise ValueError('DATABASE_URL required')
    result={'PATH':os.environ.get('PATH','/usr/bin:/bin'), 'PGHOST':url.hostname,'PGPORT':str(url.port or 5432),'PGDATABASE':urllib.parse.unquote(url.path.lstrip('/')),'PGUSER':urllib.parse.unquote(url.username or ''),'PGPASSWORD':urllib.parse.unquote(url.password or ''),'PGCONNECT_TIMEOUT':'10'}
    for key,value in urllib.parse.parse_qsl(url.query):
        if key=='sslmode': result['PGSSLMODE']=value
        elif key not in ('application_name',): raise ValueError('unsupported PG URL parameter; require explicit backup connection support')
    return result

def pg(env,args,output=None,input_file=None):
    run=subprocess.run(args,env=env,stdin=input_file,stdout=output or subprocess.PIPE,stderr=subprocess.DEVNULL)
    if run.returncode: raise RuntimeError('PostgreSQL operation failed; credentials suppressed')
    return run.stdout

def backup_tools(values):
    env=pg_environment(values)
    version=int(pg(env,['psql','-XAt','-c','SHOW server_version_num']).strip())//10000
    dump=subprocess.check_output(['pg_dump','--version'],universal_newlines=True).split()[2]
    if int(dump.split('.')[0])>=version: return env,[],[]
    container=values.get('PG_BACKUP_CONTAINER','nexusflow-postgres')
    if not container.replace('-','').replace('_','').isalnum(): raise ValueError('invalid backup container name')
    # The deployed PG16 container supplies matched tools, not a global installation.
    container_env=dict(env,PGHOST='127.0.0.1',PGPORT='5432')
    prefix=['podman','exec']
    for key in container_env:
        if key.startswith('PG'): prefix+=['--env',key]
    prefix+=[container]
    dump=pg(container_env,prefix+['pg_dump','--version']).decode().split()[2]
    if int(dump.split('.')[0])<version: raise RuntimeError('no matching PostgreSQL backup tool')
    identity='SELECT system_identifier FROM pg_control_system()'
    if pg(env,['psql','-XAt','-c',identity])!=pg(container_env,prefix+['psql','-XAt','-c',identity]):
        raise RuntimeError('backup container is not production PostgreSQL cluster')
    return container_env,prefix,['podman','exec','-i']+prefix[2:]

def main():
    action,envfile=sys.argv[1:3]; values=environment(envfile)
    if action=='preflight':
        pg_env,prefix,_=backup_tools(values)
        if not values.get('SUPER_ADMIN_USERNAME') or not values.get('SUPER_ADMIN_PASSWORD'): raise RuntimeError('administrator environment missing')
        size=int(pg(pg_env,prefix+['psql','-XAt','-c','SELECT pg_database_size(current_database())']).strip())
        disk=os.statvfs(str(pathlib.Path(envfile).parent))
        if disk.f_bavail*disk.f_frsize < size*2+5*1024**3: raise RuntimeError('insufficient disk for database backup and attachment')
        print('PG connection/cluster identity/matched dump tool/disk and administrator environment: PASS')
    elif action=='backup':
        target=pathlib.Path(sys.argv[3]); target.mkdir(mode=0o700,parents=True,exist_ok=False)
        pg_env,prefix,interactive=backup_tools(values)
        with (target/'database.dump').open('xb') as f: pg(pg_env,prefix+['pg_dump','--format=custom','--no-owner','--no-acl'],f)
        # Metadata backup includes all DB records and explicit file/object references, not S3 bytes.
        query="COPY (SELECT id,kind,tenant_id,data FROM nexusflow.records WHERE kind IN ('files','file_versions','storage_cleanup') ORDER BY kind,id) TO STDOUT"
        with (target/'object-metadata.tsv').open('xb') as f: pg(pg_env,prefix+['psql','-X','-q','-c',query],f)
        with (target/'database.dump').open('rb') as f: pg(pg_env,interactive+['pg_restore','--list'],input_file=f)
        print('PG dump + object metadata backup: PASS (object bytes unchanged, not backed up)')
    elif action=='verify':
        directory=pathlib.Path(sys.argv[3]); commit=(directory/'COMMIT').read_text().strip()
        env={'PATH':'/usr/bin:/bin','HOME':str(directory/'test-home'),'NEXUSFLOW_URL':sys.argv[4], 'NEXUSFLOW_BASE_PATH':values.get('NEXUSFLOW_BASE_PATH','/nexusflow'), 'SUPER_ADMIN_USERNAME':values.get('SUPER_ADMIN_USERNAME',''), 'SUPER_ADMIN_PASSWORD':values.get('SUPER_ADMIN_PASSWORD','')}
        subprocess.run([str(directory/'nexusflow-cli'),'verify','b0','--commit',commit,'--json'],env=env,check=True)
    else: raise ValueError('unsupported server operation')

if __name__=='__main__':
    os.umask(0o077)
    try: main()
    except (ValueError,RuntimeError) as error:
        print('FAILED: '+str(error)+' (credentials suppressed)',file=sys.stderr)
        sys.exit(1)
    except Exception as error:
        import traceback
        frame=traceback.extract_tb(error.__traceback__)[-1]
        print('FAILED: server environment operation '+type(error).__name__+f' at {frame.name}:{frame.lineno} (credentials suppressed)',file=sys.stderr)
        sys.exit(1)
