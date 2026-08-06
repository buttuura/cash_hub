import urllib.request
import urllib.error
import json

BASE = 'http://127.0.0.1:8000'


def request(method, path, data=None, headers=None):
    url = BASE + path
    body = None
    if data is not None:
        body = json.dumps(data).encode('utf-8')
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header('Content-Type', 'application/json')
    if headers:
        for k, v in headers.items():
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = resp.read().decode('utf-8')
            return resp.status, body
    except urllib.error.HTTPError as e:
        body = e.read().decode('utf-8')
        return e.code, body
    except Exception as e:
        return None, repr(e)

print('Ping /api/')
status, body = request('GET', '/api/')
print(status, body[:1000])
print('\nRegister member')
status, body = request('POST', '/api/auth/register', {
    'name': 'Test Member',
    'phone': '0770000001',
    'password': 'Test1234',
    'next_of_kin_name': 'Kin Name'
})
print(status, body)
if status != 200 and status != 201:
    print('Stopping after failed register')
    raise SystemExit(1)
user = json.loads(body)

print('\nLogin member')
status, body = request('POST', '/api/auth/login', {
    'identifier': '0770000001',
    'password': 'Test1234'
})
print(status, body)
if status != 200:
    raise SystemExit(1)
login = json.loads(body)
headers = {'Authorization': f"Bearer {login['access_token']}"}

print('\nCreate project')
status, body = request('POST', '/api/projects', {
    'title': 'Temp Project',
    'description': 'Temp desc',
    'category': 'test'
}, headers)
print(status, body)
if status != 200:
    raise SystemExit(1)
project = json.loads(body)

print('\nSubmit comment')
status, body = request('POST', f"/api/projects/{project['id']}/comments", {
    'comment': 'This is a test comment',
    'rating': 5
}, headers)
print(status, body)
