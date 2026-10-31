#!/usr/bin/env python3
"""Server-only CLI acceptance. Creates isolated fixtures; removes only its own UUIDs."""
import argparse, importlib.util, json, os, pathlib, subprocess, tempfile, uuid
import urllib.request, urllib.error


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default='/opt/nexusflow')
    parser.add_argument('--write-test', action='store_true', required=True)
    args = parser.parse_args()
    os.umask(0o077)
    root = pathlib.Path(args.root)
    commit = (root / 'DEPLOYED_COMMIT').read_text().strip()
    directory = root / 'validation' / commit
    spec = importlib.util.spec_from_file_location('server_env', directory / 'source/scripts/server-env.py')
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    values = module.environment(root / '.env')
    env = dict(os.environ, NEXUSFLOW_URL='http://127.0.0.1:8089',
               NEXUSFLOW_BASE_PATH=values.get('NEXUSFLOW_BASE_PATH', '/nexusflow'),
               NEXUSFLOW_USER=values['SUPER_ADMIN_USERNAME'], NEXUSFLOW_PASSWORD=values['SUPER_ADMIN_PASSWORD'])
    env.pop('NEXUSFLOW_TOKEN', None)
    cli = str(directory / 'nexusflow-cli')
    tag = uuid.uuid4().hex[:12]
    username = 'nfcheck.' + tag
    nodes, invitation_id, member_id = [], None, None
    checks = []

    def command(tokens, context=env, status=None):
        result = subprocess.run([cli] + list(tokens) + ['--json'], env=context,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True)
        if status is not None:
            assert result.returncode != 0 and '(%s)' % status in result.stderr, 'expected HTTP %s; exit=%s %s' % (status, result.returncode, result.stderr.strip())
            return None
        assert result.returncode == 0, 'CLI failed: ' + result.stderr.strip()
        return json.loads(result.stdout)

    def check(label):
        checks.append(label)
        print('PASS: ' + label, flush=True)

    def user():
        return next(u for u in command(['admin', 'users'])['items'] if u['id'] == member_id)

    def rejected(body, status):
        url = env['NEXUSFLOW_URL'] + env['NEXUSFLOW_BASE_PATH'] + '/api/admin/users/' + member_id + '/profile'
        req = urllib.request.Request(url, data=json.dumps(body).encode(), method='PATCH',
                                     headers={'Authorization': 'Bearer ' + env['NEXUSFLOW_TOKEN'], 'Content-Type': 'application/json'})
        try:
            urllib.request.urlopen(req, timeout=30)
        except urllib.error.HTTPError as error:
            assert error.code == status, 'unexpected rejection status %s' % error.code
        else:
            raise AssertionError('invalid profile patch was accepted')

    with tempfile.TemporaryDirectory(prefix='nf-admin-check-') as tmp:
        admin_token = pathlib.Path(tmp) / 'admin-token'
        member_token = pathlib.Path(tmp) / 'member-token'
        command(['auth', 'login', '--token-file', str(admin_token)])
        env['NEXUSFLOW_TOKEN'] = admin_token.read_text().strip()
        member_env = dict(env)
        initial_ids = {u['id'] for u in command(['admin', 'users'])['items']}
        assert command(['version'])['version'] == commit, 'running service does not match attachment'
        try:
            def node(label, kind, parent=None):
                data = {'name': label + '-' + tag, 'type': kind}
                if parent:
                    data['parent_id'] = parent
                nodes.append(command(['orgs', 'create', json.dumps(data)])['id'])
                return nodes[-1]
            company = node('验收公司', 'company')
            second = node('验收二级', 'second_level', company)
            center_a = node('验收中心A', 'center', second)
            center_b = node('验收中心B', 'center', second)
            a = node('验收部门A', 'department', center_a)
            b = node('验收部门B', 'department', center_a)
            node('验收工作室', 'studio', a)
            command(['orgs', 'create', json.dumps({'name': '非法根部门-' + tag, 'type': 'department'})], status=400)
            command(['orgs', 'create', json.dumps({'name': '非法跨级-' + tag, 'type': 'department', 'parent_id': company})], status=400)
            command(['orgs', 'create', json.dumps({'name': '非法工作室-' + tag, 'type': 'studio', 'parent_id': company})], status=400)
            command(['orgs', 'update', b, json.dumps({'name': '验收部门已改名-' + tag, 'parent_id': center_b})])
            assert command(['orgs', 'show', b])['parent_id'] == center_b
            command(['orgs', 'update', b, json.dumps({'parent_id': a})], status=400)
            command(['orgs', 'update', center_b, json.dumps({'parent_id': a})], status=400)
            command(['orgs', 'delete', a], status=409)
            check('organization hierarchy create / rename / valid reparent / invalid level rejection / child-delete guard')

            invite = command(['invitations', 'create', json.dumps({'role': 'member', 'org_id': a})])
            invitation_id = invite['invitation']['id']
            result = command(['auth', 'register', '--username', username, '--display-name', '验收用户-' + tag,
                              '--password', uuid.uuid4().hex, '--invitation-token', invite['token'],
                              '--token-file', str(member_token)])
            member_id = result['user']['id']
            member_env['NEXUSFLOW_TOKEN'] = member_token.read_text().strip()
            before = user()
            command(['admin', 'user-profile', member_id, '--name', '验收用户已改名-' + tag])
            current = user()
            assert current['org_ids'] == [a] and current['org_id'] == a
            assert current['username'] == username and current['role'] == 'member'
            assert command(['auth', 'me'], member_env)['display_name'] == current['display_name']
            rejected({'username': 'forbidden'}, 400)
            rejected({'org_ids': 'not-an-array'}, 400)
            rejected({'org_ids': [123]}, 400)
            rejected({'display_name': ' '}, 400)
            rejected({'display_name': 'stale', 'updated_at': before['updated_at']}, 409)
            command(['admin', 'user-profile', member_id, json.dumps({'employee_no': 'NF-' + tag, 'management_level': 'staff', 'professional_level': 'engineer_3', 'duties': ['execution'], 'skills': ['Go'], 'work_status': 'training', 'daily_standard_hours': 6, 'dispatchable': False})])
            current = user()
            assert current['employee_no'] == 'NF-' + tag and current['management_level'] == 'staff'
            assert current['professional_level'] == 'engineer_3' and current['duties'] == ['execution']
            assert current['skills'] == ['Go'] and current['work_status'] == 'training'
            assert current['daily_standard_hours'] == 6 and current['dispatchable'] is False
            rejected({'duties': ['not-a-duty']}, 400)
            rejected({'management_level': 'not-a-level'}, 400)
            rejected({'studio_ids': [a]}, 400)
            check('name-only edit preserves memberships / person profile fields / enum and studio rejection / stale edit guard')

            name = current['display_name']
            command(['admin', 'user-profile', member_id, '--org-ids', a + ',' + b])
            current = user()
            assert set(current['org_ids']) == {a, b} and current['display_name'] == name and current['org_id'] == a
            command(['orgs', 'delete', b], status=409)
            command(['admin', 'user-profile', member_id, '--org-ids', b])
            assert user()['org_ids'] == [b] and user()['org_id'] == b
            command(['admin', 'user-profile', member_id, '--org-ids', 'none'])
            assert user()['org_ids'] == [] and user()['org_id'] is None
            command(['admin', 'user-profile', member_id, '--org-ids', str(uuid.uuid4())], status=404)
            check('multi-department add / remove / primary fallback / clear / missing-department rejection')

            command(['admin', 'users'], member_env, status=403)
            command(['admin', 'user-profile', member_id, '--name', 'not-allowed'], member_env, status=403)
            command(['orgs', 'create', json.dumps({'name': 'not-allowed', 'type': 'department'})], member_env, status=403)
            command(['orgs', 'update', b, json.dumps({'name': 'not-allowed'})], member_env, status=403)
            command(['orgs', 'delete', b], member_env, status=403)
            check('ordinary user cannot access user management or mutate department structure')
        finally:
            try:
                if member_id is None:
                    member_id = next((u['id'] for u in command(['admin', 'users'])['items'] if u['username'] == username), None)
                if member_id:
                    fixture = user()
                    assert member_id not in initial_ids and fixture['username'] == username and fixture['role'] == 'member', 'refuse cleanup of non-fixture account'
                    command(['admin', 'user-status', member_id, '--status', 'disabled', '--reason', 'CLI acceptance fixture cleanup'])
                    uuid.UUID(member_id)
                    cleanup = "BEGIN; DELETE FROM nexusflow.records WHERE kind='people' AND data->>'user_id'='%s'; DELETE FROM nexusflow.users WHERE id='%s' AND username='%s' AND role='member' AND status='disabled'; COMMIT;" % (member_id, member_id, username)
                    module.pg(module.pg_environment(values), ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-c', cleanup])
                if invitation_id:
                    uuid.UUID(invitation_id)
                    module.pg(module.pg_environment(values), ['psql', '-X', '-v', 'ON_ERROR_STOP=1', '-c', "DELETE FROM nexusflow.records WHERE kind='invitations' AND id='%s'" % invitation_id])
                for organization in reversed(nodes):
                    command(['orgs', 'delete', organization])
                assert {u['id'] for u in command(['admin', 'users'])['items']} == initial_ids
                assert command(['version'])['version'] == commit, 'service changed during acceptance'
                check('fixtures removed / existing users unchanged / audit retained')
            finally:
                command(['auth', 'logout'])
    print(json.dumps({'ok': True, 'commit': commit, 'checks': checks}, ensure_ascii=False))


if __name__ == '__main__':
    main()
