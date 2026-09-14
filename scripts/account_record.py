"""Generate private Firestore account fields without putting credentials in source."""
import getpass
import hashlib
import json
import re
from pathlib import Path

username = input('Username: ').strip().lower()
if not re.fullmatch(r'[a-z0-9_-]{1,32}', username):
    raise SystemExit('Invalid username.')
password = getpass.getpass('Password: ')
if not password:
    raise SystemExit('Password cannot be empty.')
record = {
    'privateAccounts/' + username: {
        'enabled': True,
        'passwordHash': hashlib.sha256((username + '\n' + password).encode()).hexdigest()
    },
    'accountProfiles/' + username: {'role': 'admin'}
}
folder = Path(__file__).resolve().parent.parent / 'private-exports'
folder.mkdir(exist_ok=True)
output = folder / ('firebase-' + username + '.json')
with output.open('x', encoding='utf-8') as target:
    json.dump(record, target, indent=2)
print('Enter these records in Firebase Console. Do not commit this file:')
print(output)
