"""One-time, explicitly requested release reset; preserve source commit history."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess

REPO = os.environ['GH_REPO']
SHA = os.environ['GITHUB_SHA']
assert REPO == 'ctrlaltandfix/RAMpage'
assert os.environ['GITHUB_REF'] == 'refs/heads/chatgpt-version-reset-v1'

def gh(*args):
    return subprocess.check_output(['gh', *args], text=True)

def api(endpoint, *args):
    result = gh('api', f'repos/{REPO}/{endpoint}', *args)
    return json.loads(result) if result.strip() else None

inventory = json.loads(Path('releases/version-reset-inventory.json').read_text())
releases = api('releases?per_page=100')
tags = api('git/matching-refs/tags/')
assert sorted((r['id'], r['tag_name']) for r in releases) == sorted((r['id'], r['tag']) for r in inventory['releases']), 'Release inventory changed; stop for review'
assert sorted((r['ref'][10:], r['object']['sha']) for r in tags) == sorted((r['tag'], r['sha']) for r in inventory['tags']), 'Tag inventory changed; stop for review'
assert api('releases/latest')['tag_name'] == 'v1.6.8'
exe = Path('release-files/RAMpage-Setup-1.0.0.exe')
checksum = Path(str(exe) + '.sha256')
digest = hashlib.sha256(exe.read_bytes()).hexdigest()
assert exe.stat().st_size > 100_000_000
assert re.match(r'[a-fA-F0-9]{64}', checksum.read_text(encoding='utf-8-sig')).group().lower() == digest

# The old 1.0.0 tag must be freed only after the new installer passed all tests.
# Leave the current 1.6.8 release available until its replacement is verified.
gh('release', 'delete', 'v1.0.0', '--cleanup-tag', '--yes')
notes = Path('releases/version-reset-notes.md')
gh('release', 'create', 'v1.0.0', str(exe), str(checksum), '--title', 'RAMpage 1.0.0', '--notes-file', str(notes), '--target', SHA, '--latest')
latest = api('releases/latest')
assert latest['tag_name'] == 'v1.0.0' and not latest['draft'] and not latest['prerelease']
assets = {a['name']: a for a in latest['assets']}
assert set(assets) == {exe.name, checksum.name}
assert assets[exe.name]['size'] == exe.stat().st_size
assert assets[exe.name]['digest'] == 'sha256:' + digest
assert api('git/ref/tags/v1.0.0')['object']['sha'] == SHA

# Delete only the exact IDs and unchanged tag SHAs captured before the reset.
for release in inventory['releases']:
    if release['tag'] != 'v1.0.0':
        api(f"releases/{release['id']}", '--method', 'DELETE')
for tag in inventory['tags']:
    if tag['tag'] != 'v1.0.0':
        assert api(f"git/ref/tags/{tag['tag']}")['object']['sha'] == tag['sha']
        api(f"git/refs/tags/{tag['tag']}", '--method', 'DELETE')
assert [r['tag_name'] for r in api('releases?per_page=100')] == ['v1.0.0']
assert [r['ref'] for r in api('git/matching-refs/tags/')] == ['refs/tags/v1.0.0']
print(f'Published and verified RAMpage 1.0.0: SHA256 {digest}; old releases and tags removed.')
