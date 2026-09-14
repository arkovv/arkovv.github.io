import http.client
import json
import threading
import unittest
from test_server import server


class AuthTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), server.Handler)
        cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.httpd.shutdown()
        cls.httpd.server_close()
        cls.thread.join()

    def setUp(self):
        server.ADMIN_HASH = server.password_hash('fixture-password-only')
        server.SESSIONS.clear()
        server.LOGIN_ATTEMPTS.clear()

    def request(self, method, path, data=None, headers=None):
        conn = http.client.HTTPConnection(*self.httpd.server_address)
        conn.request(method, path, json.dumps(data) if data is not None else None, headers or {})
        response = conn.getresponse()
        body = response.read()
        result = response.status, dict(response.getheaders()), body
        conn.close()
        return result

    def test_login_logout_and_protected_data(self):
        for method in ['GET', 'POST']:
            self.assertEqual(self.request(method, '/api/state')[0], 401)
        self.assertEqual(self.request('POST', '/api/login', {'username':'arkov','password':'wrong'})[0], 401)
        status, _, body = self.request('POST', '/api/login', {'username':'arkov','password':'fixture-password-only'})
        self.assertEqual(status, 200)
        token = json.loads(body)['token']
        headers = {'Authorization':'Bearer ' + token}
        original = server.read_state
        server.read_state = lambda: {'test': True}
        try:
            self.assertEqual(self.request('GET', '/api/state', headers=headers)[0], 200)
        finally:
            server.read_state = original
        self.assertEqual(self.request('POST', '/api/logout', headers=headers)[0], 200)
        self.assertEqual(self.request('GET', '/api/state', headers=headers)[0], 401)

    def test_expiration_and_throttle(self):
        server.SESSIONS['expired'] = 0
        self.assertEqual(self.request('GET', '/api/state', headers={'Authorization':'Bearer expired'})[0], 401)
        server.LOGIN_ATTEMPTS[:] = [server.time.monotonic()] * 10
        self.assertEqual(self.request('POST', '/api/login', {})[0], 429)

    def test_cors(self):
        original = server.ALLOWED_ORIGIN
        server.ALLOWED_ORIGIN = 'https://example.github.io'
        try:
            status, headers, _ = self.request('OPTIONS', '/api/state', headers={'Origin':server.ALLOWED_ORIGIN})
            self.assertEqual(status, 204)
            self.assertEqual(headers['Access-Control-Allow-Origin'], server.ALLOWED_ORIGIN)
            self.assertEqual(self.request('OPTIONS', '/api/state', headers={'Origin':'https://unrelated.example'})[0], 403)
        finally:
            server.ALLOWED_ORIGIN = original


if __name__ == '__main__':
    unittest.main()
