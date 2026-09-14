from pathlib import Path
import shutil, tempfile, json
import server
root=Path.cwd()
folder=Path(tempfile.mkdtemp(prefix='compatibility-',dir=root/'tests'))
for name in ['friends-cards.db','friends-cards.db-wal','friends-cards.db-shm']:
    source=root/name
    if source.exists(): shutil.copy2(source,folder/name)
server.DB_PATH=folder/'friends-cards.db'
server.init_db()
data=server.read_state()
(folder/'state.json').write_text(json.dumps(data),encoding='utf-8')
print(folder/'state.json')
