import importlib.util
import json
from pathlib import Path
import sqlite3
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
spec = importlib.util.spec_from_file_location('table_server', ROOT / 'server.py')
server = importlib.util.module_from_spec(spec)
spec.loader.exec_module(server)


class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(dir=ROOT / 'tests')
        server.DB_PATH = Path(self.temp.name) / 'table.db'
        server.last_backup = 0
        server.init_db()
        self.state = json.loads((ROOT / 'tests' / 'fixture.json').read_text())

    def tearDown(self):
        self.temp.cleanup()

    def test_roundtrip_and_frozen_history(self):
        server.write_state(self.state)
        restored = server.read_state()
        for key in ['players', 'sets', 'instances', 'ledger', 'log', 'ids', 'weekly', 'config', 'ui']:
            self.assertEqual(restored[key], self.state[key], key)
        for a, b in zip(restored['packs'], self.state['packs']):
            for key in b:
                self.assertEqual(a[key], b[key], 'pack ' + key)

    def test_backup_includes_committed_wal_and_precedes_replace(self):
        server.write_state(self.state)
        old = self.state['players'][0]['credits']
        with sqlite3.connect(server.DB_PATH) as connection:
            connection.execute('PRAGMA wal_autocheckpoint=0')
            connection.execute('UPDATE players SET credits=? WHERE id=?', (old+7, self.state['players'][0]['id']))
            connection.commit()
            server.write_state(self.state, force_backup=True)
            latest = sorted((server.DB_PATH.parent / 'backups').glob('*.db'))[-1]
            with sqlite3.connect(latest) as backup:
                self.assertEqual(backup.execute('SELECT credits FROM players ORDER BY id').fetchone()[0], old+7)
                self.assertEqual(backup.execute('PRAGMA integrity_check').fetchone()[0], 'ok')

    def test_invalid_write_preserves_old_table(self):
        server.write_state(self.state)
        before = server.read_state()
        self.state['players'].append(self.state['players'][0])
        with self.assertRaises(sqlite3.IntegrityError):
            server.write_state(self.state)
        self.assertEqual(server.read_state(), before)
        with self.assertRaises(ValueError):
            server.write_state({'version': 1})
        self.assertEqual(server.read_state(), before)


if __name__ == '__main__':
    unittest.main()
