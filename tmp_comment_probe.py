import http.client
import json

base = '127.0.0.1'
port = 8000

conn = http.client.HTTPConnection(base, port, timeout=10)
try:
    conn.request('GET', '/api/')
    res = conn.getresponse()
    body = res.read().decode('utf-8')
    print('GET /api/ =>', res.status)
    print(body)
except Exception as e:
    print('GET error:', repr(e))
finally:
    conn.close()
