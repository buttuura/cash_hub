import json
import random
import urllib.request
import urllib.error

base = 'http://127.0.0.1:8000'

phone = '077' + ''.join(str(random.randint(0,9)) for _ in range(7))
payload = {
    'phone': phone,
    'password': 'TestPass123',
    'name': 'Test User',
    'next_of_kin_name': 'Kin Name'
}

try:
    req = urllib.request.Request(base + '/api/auth/register', data=json.dumps(payload).encode('utf-8'), headers={'Content-Type': 'application/json'})
    with urllib.request.urlopen(req, timeout=15) as r:
        data = json.loads(r.read().decode('utf-8'))
        token = data.get('access_token')
        print('REGISTERED', data.get('id'))
        print('TOKEN', token[:20] + '...' if token else None)

        project = {'title': 'Test Project', 'description': 'A test project', 'category': 'Test'}
        req2 = urllib.request.Request(base + '/api/projects', data=json.dumps(project).encode('utf-8'), headers={
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {token}'
        })
        with urllib.request.urlopen(req2, timeout=15) as r2:
            print('PROJECT CREATED', r2.status)
            print(r2.read().decode('utf-8'))
except urllib.error.HTTPError as e:
    print('STATUS', e.code)
    try:
        print(e.read().decode('utf-8'))
    except Exception as exc:
        print('READ ERROR', exc)
except Exception as e:
    print('EXCEPTION', type(e).__name__, e)
