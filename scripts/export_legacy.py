"""Read the old SQLite database and create a private JSON import file."""
import importlib.util
import json
import sqlite3
from datetime import datetime, timezone
from pathlib import Path

root = Path(__file__).resolve().parent.parent
source = root / 'friends-cards.db'
if not source.is_file():
    raise SystemExit('friends-cards.db was not found; no export created.')
spec = importlib.util.spec_from_file_location('legacy_server', root / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)

def readonly_connection():
    connection = sqlite3.connect(source.as_uri() + '?mode=ro', uri=True)
    connection.row_factory = sqlite3.Row
    return connection

server.connect = readonly_connection
state = server.read_state()
folder = root / 'private-exports'
folder.mkdir(exist_ok=True)
output = folder / ('table-' + datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ') + '.json')
with output.open('x', encoding='utf-8') as target:
    json.dump(state, target, ensure_ascii=False, indent=2)
print('Import this file through Setup on the hosted app:')
print(output)
