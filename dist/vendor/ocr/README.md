# Browser OCR assets

These files are loaded lazily from the same origin. No screenshot data is sent to
an OCR service, CDN or API. Include this entire directory in static deployments.

| Component | Version | Source / license |
| --- | --- | --- |
| Tesseract.js browser module and worker | 6.0.1 | https://github.com/naptha/tesseract.js — Apache-2.0 |
| Tesseract.js-core LSTM, SIMD and non-SIMD | 6.0.0 | https://github.com/naptha/tesseract.js-core — Apache-2.0 |
| Korean / English integer language models | @tesseract.js-data/kor, @tesseract.js-data/eng 1.0.0 | https://github.com/naptha/tessdata — Apache-2.0 |

The Apache license is included in `tesseract.LICENSE.txt` and `core.LICENSE.txt`;
bundled dependency notices are included in the `*.NOTICE.txt` files.
The ESM bundle is renamed from `.js` to `.mjs` for the existing static server.
The app owns the OCR worker inside a disposable session worker so cancellation
and initialization failure also release the underlying engine.
Only the LSTM cores are included; the application explicitly disables legacy
core/language modes. Both SIMD and non-SIMD devices are supported.

`manifest.json` records each archive's npm integrity and each extracted file's
SHA-256 hash. Regenerate from the repository root with:

```sh
python3 scripts/vendor-ocr.py
```

The script downloads pinned npm archives with TLS verification and verifies
SHA-512 before extracting only the declared files. To reuse already downloaded
archives, pass their directory as the first argument. Runtime setup does not
require this step, npm installation, additional network domains or secrets.
