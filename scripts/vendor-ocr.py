#!/usr/bin/env python3
"""Reproduce browser OCR assets from pinned, SHA-512 verified npm archives.

Usage: python3 scripts/vendor-ocr.py [directory containing cached .tgz archives]
No packages, credentials, image uploads or CDN requests are needed at runtime.
"""
import base64
import hashlib
import io
import json
from pathlib import Path
import sys
import tarfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1] / 'dist' / 'vendor' / 'ocr'
PACKAGES = [
    ('tesseract.js', '6.0.1', '/sPvMvrCtgxnNRCjbTYbr7BRu0yfWDsMZQ2a/T5aN/L1t8wUQN6tTWv6p6FwzpoEBA0jrN2UD2SX4QQFRdoDbA==', {
        'dist/tesseract.esm.min.js': 'tesseract.esm.min.mjs',
        'dist/worker.min.js': 'worker.min.js',
        'dist/tesseract.min.js.LICENSE.txt': 'tesseract.NOTICE.txt',
        'dist/worker.min.js.LICENSE.txt': 'worker.NOTICE.txt',
        'LICENSE.md': 'tesseract.LICENSE.txt',
    }),
    ('tesseract.js-core', '6.0.0', '1Qncm/9oKM7xgrQXZXNB+NRh19qiXGhxlrR8EwFbK5SaUbPZnS5OMtP/ghtqfd23hsr1ZvZbZjeuAGcMxd/ooA==', {
        'tesseract-core-lstm.wasm.js': 'tesseract-core-lstm.wasm.js',
        'tesseract-core-simd-lstm.wasm.js': 'tesseract-core-simd-lstm.wasm.js',
        'LICENSE': 'core.LICENSE.txt',
    }),
    ('@tesseract.js-data/kor', '1.0.0', 'tepYhsYiRJ8E44R27MHxVteEDDLfYQxuvM6u4JlEHcCYqwpefvI5TGzoMgB67kunOvtyEJYtT5zfJ/6R6FVU9w==', {
        '4.0.0_best_int/kor.traineddata.gz': 'kor.traineddata.gz',
    }),
    ('@tesseract.js-data/eng', '1.0.0', 'mbTumm6KQPUHyzTPQaF3ObXYnx0SqqfV2nabqFVQBwD6Kl7PhGSLSzOlfFTWy0P3BjghaSKA2W9GB19Jk+ZcTg==', {
        '4.0.0_best_int/eng.traineddata.gz': 'eng.traineddata.gz',
    }),
]

def main():
    ROOT.mkdir(parents=True, exist_ok=True)
    manifest = []
    for name, version, digest, files in PACKAGES:
        url = f'https://registry.npmjs.org/{name}/-/{name.split("/")[-1]}-{version}.tgz'
        cached_name = f'{name.replace("@", "").replace("/", "-")}-{version}.tgz'
        if len(sys.argv) > 1:
            data = (Path(sys.argv[1]) / cached_name).read_bytes()
        else:
            with urllib.request.urlopen(url, timeout=60) as response:
                data = response.read()
        actual = base64.b64encode(hashlib.sha512(data).digest()).decode()
        if actual != digest:
            raise RuntimeError(f'Integrity mismatch: {name}@{version}')
        entry = {'name': name, 'version': version, 'url': url, 'integrity': 'sha512-' + digest, 'files': {}}
        with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
            for source, target in files.items():
                contents = archive.extractfile('package/' + source).read()
                (ROOT / target).write_bytes(contents)
                entry['files'][target] = hashlib.sha256(contents).hexdigest()
        manifest.append(entry)
        print(f'Verified {name}@{version}')
    (ROOT / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')

if __name__ == '__main__':
    main()
