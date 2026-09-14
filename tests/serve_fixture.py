import sys
from pathlib import Path
from functools import partial
import importlib.util
import json

root = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('test_app_server', root / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)
server.DB_PATH = Path(sys.argv[1]).resolve() / 'fixture.db'
server.init_db()
server.write_state(json.loads((root / 'tests' / 'fixture.json').read_text(encoding='utf-8')))
httpd = server.ThreadingHTTPServer(('127.0.0.1', 0), partial(server.Handler, directory=str(root)))
print('http://127.0.0.1:' + str(httpd.server_port), flush=True)
httpd.serve_forever()
