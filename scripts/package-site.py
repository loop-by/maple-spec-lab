#!/usr/bin/env python3
"""Package the complete static site after verifying vendored OCR assets."""
import hashlib
import json
from pathlib import Path
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1] / 'dist'

def main():
    if len(sys.argv) != 2:
        raise SystemExit('Usage: python3 scripts/package-site.py /path/to/maple-spec-lab-site.zip')
    output = Path(sys.argv[1]).resolve()
    if output.is_relative_to(ROOT.resolve()):
        raise SystemExit('Choose an output path outside dist/.')
    vendor = ROOT / 'vendor' / 'ocr'
    for package in json.loads((vendor / 'manifest.json').read_text()):
        for name, expected in package['files'].items():
            actual = hashlib.sha256((vendor / name).read_bytes()).hexdigest()
            if actual != expected:
                raise SystemExit(f'OCR asset integrity mismatch: {name}')
    for name in ['index.html', 'app.mjs', 'screenshot-import.mjs', 'screenshot-ocr.mjs',
                 'screenshot-worker-client.mjs', 'ocr-session-worker.mjs', 'stat-layout.mjs',
                 'equipment-data.mjs', 'equipment-parser.mjs', 'equipment-ocr.mjs',
                 'equipment-import.mjs', 'equipment-view.mjs', 'equipment-identification.mjs', 'equipment-starforce.mjs', 'equipment.css']:
        if not (ROOT / name).is_file():
            raise SystemExit(f'Missing site entry: {name}')
    files = sorted(path for path in ROOT.rglob('*') if path.is_file())
    if any(not path.resolve().is_relative_to(ROOT.resolve()) for path in files):
        raise SystemExit('Site contains a file outside dist/.')
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(output.suffix + '.tmp')
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            checksums = []
            for path in files:
                name = path.relative_to(ROOT).as_posix()
                data = path.read_bytes()
                info = zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0))
                info.compress_type = zipfile.ZIP_DEFLATED
                info.external_attr = 0o100644 << 16
                archive.writestr(info, data)
                checksums.append(f'{hashlib.sha256(data).hexdigest()}  {name}')
            info = zipfile.ZipInfo('SHA256SUMS', (2020, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, '\n'.join(checksums) + '\n')
        temporary.replace(output)
    finally:
        temporary.unlink(missing_ok=True)
    print(f'{len(files)} site files packaged: {output}')
    print(f'{output.stat().st_size:,} bytes; SHA-256 {hashlib.sha256(output.read_bytes()).hexdigest()}')

if __name__ == '__main__':
    main()
